// The CLI face (plan 9.x; command list decided in docs/design/decisions.md, 9.1).
//
// Disk is the contract (9.4): every command reads files and the fresh cache, never a TUI's unsaved
// buffer. Human output goes to stdout, diagnostics to stderr; `--json` prints exactly one object.
// This module must never import from src/tui/ — scripts/check-boundary.ts enforces it for core,
// and the CLI keeps to the same rule so it runs without a terminal renderer.

import { grammar, grammarFor, parseSyntax } from "../core/syntax.ts";
import { loadError } from "../core/lazy.ts";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { appendScratch, CaptureError, clearScratch, formatEntry, parseRef, readScratch, scratchLocation } from "../core/capture.ts";
import { copyText } from "../core/clipboard.ts";
import { COMMAND_SPECS } from "../core/command-specs.ts";
import { type Config, loadConfig } from "../core/config.ts";
import { glyphsFor, isGlyphMode } from "../core/glyphs.ts";
import { type Graph, openGraph, type Target } from "../core/graph.ts";
import { detectColorDepth, layoutToAnsi, type ColorDepth } from "../core/layout/ansi.ts";
import { layoutNote, layoutWidth } from "../core/note.ts";
import { headingsOf, parseAround, type ParsedNote, slugify } from "../core/parse.ts";
import { parseNoteFile } from "../core/readers.ts";
import { dataOutline, parseData } from "../core/data.ts";
import { classify, extensionOf, isKnownExtension, noteFormat } from "../core/filetypes.ts";
import { cacheDir, stateDir, userConfigFile } from "../core/paths.ts";
import { readStale, type StaleEntry } from "../core/stale.ts";
import { applyColorOverrides, listThemes, loadTheme } from "../core/theme/index.ts";
import { sanitize, UNSAFE } from "../core/sanitize.ts";
import { type DecodedFile, decodeText, landsInside, readJson, readRegular, readText, WriteRefused, writeNote } from "../core/fsutil.ts";
import { compilePattern, expandReplacement, findAll, firstPerLine, replaceMatches } from "../core/replace.ts";
import { listTasks, toggleTask } from "../core/tasks.ts";
import { editorArgv } from "../core/editor.ts";
import { discoverNvims, NVIM_REMOTE, probeNvim } from "../core/nvim.ts";
import { loadSession } from "../core/position.ts";
import { Reach } from "../core/reach.ts";
import { readRegistry, vaultNamed } from "../core/registry.ts";
import { initVault, isInside, locateVault, readVaultVersion, recordLocation, VaultError, type VaultLocation, vaultConfigPath } from "../core/vault.ts";
import { parseWikiTarget } from "../core/wikilink.ts";
import { type Args, flag, has, parseArgs, UsageError, VALUED } from "./args.ts";
import { VERSION } from "../version.ts";

/**
 * JSON with every character `sanitize` would change escaped as \uXXXX. JSON.stringify leaves C1
 * controls, DEL and bidi overrides raw, and a terminal acts on them. Lossless: it is still the same
 * JSON value.
 */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(new RegExp(UNSAFE.source, "g"), (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export const JSON_SCHEMA = 1;

export const EXIT = { ok: 0, error: 1, usage: 2, notFound: 3, ambiguous: 4, refused: 5 } as const;

export class CliError extends Error {
  constructor(
    message: string,
    readonly code: number = EXIT.error,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  stdin: () => Promise<string>;
  isTTY: boolean;
  columns: number | undefined;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

class Session {
  warnings: string[] = [];
  private _graph: Graph | null = null;
  readonly config: Config;
  /** The config files read, in the order applied (user, then the vault's). */
  readonly configSources: string[];

  constructor(
    readonly args: Args,
    readonly loc: VaultLocation,
    readonly io: Io,
  ) {
    const loaded = loadConfig({ vaultFile: vaultConfigPath(loc), configFile: flag(args, "config") });
    this.config = loaded.config;
    this.configSources = loaded.sources;
    this.warnings.push(...loaded.warnings);
    if (loc.note) this.warnings.push(loc.note);
    recordLocation(loc);
  }

  get graph(): Graph {
    if (!this._graph) {
      this._graph = openGraph(this.loc, this.config, true, "lazy");
      // One process, one answer: an alias in a note not parsed yet still counts (17.7), and other
      // vaults are reached through the machine's list (17.8).
      this._graph.thorough = true;
      this._graph.reach = new Reach(this.loc);
    }
    return this._graph;
  }

  /** Warnings, including walk and parse errors found lazily while the command ran. */
  allWarnings(): string[] {
    return [...this.warnings, ...(this._graph?.errors ?? [])];
  }

  stale(): StaleEntry[] {
    return readStale(this.loc);
  }
}

export const HELP = `slipbox ${VERSION} — terminal markdown notes, agent-drivable

Usage:
  slipbox [path]                    open the TUI (needs a terminal); also: slipbox open [path]
  slipbox render <note>             render a note to stdout        [--width N] [--theme T] [--glyphs G] [--plain]
  slipbox resolve <link>            follow a link to a path        [--from <note>]
  slipbox links <note>              outgoing links with status     [--all: every note's]
  slipbox backlinks <note>          notes that link to <note>
  slipbox ls                        list the vault's notes         [--files: data and text files too]
  slipbox outline <note>            headings with source lines
  slipbox find <query> [note]       find text in a note, or the vault  [--regex] [--whole] [--ignore-case] [--files]
  slipbox replace <note> <old> <new>  replace in a note  [--regex] [--whole] [--ignore-case] [--first | --first-per-line] [--lines A-B] [--dry-run] [--if-unchanged <sha>]
  slipbox task <note> [line]        list tasks, or toggle one      [--check] [--uncheck] [--if-unchanged <sha>]
  slipbox read <note>               a note's text, and its sha
  slipbox stat <note>               a note's size, dates, title, counts, encoding (the TUI's note info)
  slipbox write <note> [text]       write a note (atomic, in the vault)  [--stdin] [--append [--paragraph]] [--create] [--if-unchanged <sha>] [--allow-empty]
  slipbox mkdir <path>              make a folder in the vault (and its parents)
  slipbox send <note>               open it in a running editor   [--line N] [--server <socket>]
  slipbox history                   notes read lately, newest first, and what's open
  slipbox capture [text]            append to the scratch          [--ref path:L[-M] | path:L:C-D | path:L:C-M:D] [--snippet] [--stdin] [--lang L]
  slipbox scratch show|path|clear|copy                            [--if-unchanged <sha>]
  slipbox init [dir]                make <dir> a vault (creates .slipbox/ with its id and name)  [--name N]
  slipbox info                      vault, paths, versions, staleness
  slipbox vaults                    the vaults this machine knows: name, kind, path, last seen
  slipbox themes                    list themes
  slipbox commands                  list named commands and their CLI equivalents

Global options:
  --root <dir>      the root (default: nearest .slipbox/ above the path or cwd, else its git repository)
  --config <file>   user config file (default: $SLIPBOX_CONFIG or ~/.config/slipbox/config.toml)
  --json            one JSON object on stdout: {schema, ok, command, data, warnings, stale}
  --color <when>    auto | always | never
  -h, --help        this help        -V, --version   print the version

<note> is a path (a data or text file too, with its extension), or a note name resolved like a
[[wikilink]]; a name several notes share is exit 4,
unless --from <note> picks the one a link from there reaches. After --, nothing is an option:
slipbox read -- -dash.md names a note that starts with a dash.
Exit codes: 0 ok, 1 error, 2 usage, 3 not found, 4 ambiguous (a link; several nvims for send),
5 refused (--if-unchanged, a write outside the vault or over an existing note, invalid UTF-8,
  a read of a symlink leading out of the vault).
`;

export const CLI_COMMANDS = new Set([
  "render", "resolve", "links", "backlinks", "ls", "outline", "find", "replace", "task", "read", "stat", "write", "mkdir", "send", "history",
  "capture", "scratch", "init", "info", "vaults", "themes", "commands", "help",
]);

/** The command word in raw arguments that failed to parse: skips flags and their values. */
function commandIn(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") return argv[i + 1] ?? "help";
    if (a.startsWith("-")) {
      if (!a.includes("=") && VALUED.has(a.replace(/^-+/, ""))) i++;
      continue;
    }
    return a;
  }
  return "help";
}

/** Run a CLI command. Returns the exit code; never calls process.exit itself. */
export async function runCli(argv: string[], io: Io): Promise<number> {
  // `--json` promises exactly one object on stdout, whatever happens: usage errors included.
  const envelope = (o: { ok: boolean; command: string; data?: unknown; error?: { code: number; message: string }; warnings?: string[]; stale?: string[] }) =>
    `${safeJson({ schema: JSON_SCHEMA, ok: o.ok, command: o.command, ...(o.error ? { error: o.error } : {}), data: o.data ?? null, warnings: o.warnings ?? [], stale: o.stale ?? [] })}\n`;
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    const message = (err as Error).message;
    if (argv.some((a) => a === "--json" || a.startsWith("--json="))) io.out(envelope({ ok: false, command: commandIn(argv), error: { code: EXIT.usage, message } }));
    else io.err(sanitize(`slipbox: ${message}\n`));
    return EXIT.usage;
  }
  const json = has(args, "json");
  const [command = "help", ...rest] = args.positional;
  if (has(args, "version")) {
    io.out(json ? envelope({ ok: true, command: "version", data: { version: VERSION } }) : `slipbox ${VERSION}\n`);
    return EXIT.ok;
  }
  if (command === "help" || has(args, "help")) {
    io.out(json ? envelope({ ok: true, command: "help", data: { text: HELP } }) : HELP);
    return EXIT.ok;
  }
  let session: Session | null = null;
  try {
    // Flags every command shares are checked for every command, used or not.
    const color = flag(args, "color");
    if (color !== undefined && !["auto", "always", "never"].includes(color)) throw new UsageError("--color must be auto, always or never");
    // The note argument, when it names a file, also says which vault this is.
    const noteAt = ["render", "links", "backlinks", "outline", "replace", "task", "read", "stat", "write", "send"].includes(command) ? rest[0] : command === "find" ? rest[1] : undefined;
    const pathArg = noteArgPath(noteAt, io.cwd);
    const loc = locateVault({ root: command === "init" ? undefined : flag(args, "root"), path: pathArg, cwd: io.cwd });
    session = new Session(args, loc, io);
    const handler = HANDLERS[command];
    if (!handler) throw new UsageError(`unknown command: ${command} (see slipbox help)`);
    // Too many arguments is a mistake to report, not to drop (a dropped one can be a flag after --).
    const most = MAX_ARGS[command];
    if (most !== undefined && rest.length > most) throw new UsageError(`${command} takes at most ${most} argument${most === 1 ? "" : "s"}; got ${rest.length} (${rest.slice(most).join(" ")} too many)`);
    // A flag the command doesn't take is an error, never ignored: `write --dry-run` would write.
    const own = FLAGS[command] ?? [];
    for (const name of args.flags.keys()) {
      if (!GLOBAL_FLAGS.has(name) && !own.includes(name)) throw new UsageError(`--${name} isn't an option of ${command}${own.length ? ` (it takes ${own.map((f) => `--${f}`).join(", ")})` : ""}`);
    }
    const result = await handler(session, rest);
    const stale = command === "init" ? [] : session.stale();
    if (json) {
      io.out(`${safeJson({ schema: JSON_SCHEMA, ok: true, command, data: result.data, warnings: session.allWarnings(), stale: stale.map((s) => s.path) })}\n`);
    } else {
      // Note text reaches the terminal only sanitized (2.9). `render` is the exception: its output
      // is a layout, sanitized when built, plus the colours it adds on purpose.
      if (result.human) io.out(command === "render" ? result.human : sanitize(result.human));
      // Diagnostics quote config values and paths from the vault: sanitized like the output (2.9).
      for (const w of session.allWarnings()) io.err(sanitize(`slipbox: warning: ${w}\n`));
      if (stale.length) io.err(sanitize(`slipbox: warning: unsaved changes in a running slipbox: ${stale.map((s) => s.path).join(", ")}\n`));
    }
    return result.code ?? EXIT.ok;
  } catch (err) {
    const code = err instanceof CliError ? err.code : err instanceof UsageError ? EXIT.usage : err instanceof VaultError ? EXIT.notFound : EXIT.error;
    const message = (err as Error).message;
    if (json) {
      let stale: string[] = [];
      try {
        stale = session && command !== "init" ? session.stale().map((x) => x.path) : [];
      } catch {
        // the error came from the session itself; no stale list then
      }
      io.out(envelope({ ok: false, command, error: { code, message }, data: err instanceof CliError ? (err.data ?? null) : null, warnings: session?.allWarnings() ?? [], stale }));
    } else {
      io.err(sanitize(`slipbox: ${message}\n`));
      if (!(err instanceof CliError) && !(err instanceof UsageError) && !(err instanceof VaultError) && io.env.SLIPBOX_DEBUG) io.err(`${(err as Error).stack}\n`);
    }
    return code;
  }
}

/** Arguments each command takes at most (`write` and `capture` take free text: no limit). */
const MAX_ARGS: Record<string, number> = {
  render: 1, resolve: 1, links: 1, backlinks: 1, ls: 0, outline: 1, find: 2, replace: 3, task: 2, read: 1, stat: 1, send: 1, history: 0,
  scratch: 1, init: 1, info: 0, vaults: 0, themes: 0, commands: 0, mkdir: 1,
};

/** The vault's data and text files (not notes, not binary), with their group and format. */
/**
 * A note's or data file's tree: markdown parsed, a data file read by its format (16.11), its
 * parse error a CliError. A text file has no rendered form (exit 2: `read` gives its text).
 */
function parseFile(s: Session, rel: string, text: string): ParsedNote {
  const kind = classify(rel, s.config.walk.extensions);
  if (kind.group === "data") {
    const d = parseData(kind.format, text);
    if (d.error) throw new CliError(`${rel} doesn't parse — ${d.error}`, EXIT.error);
    return { tree: d.tree, frontmatter: null, source: text };
  }
  if (kind.group === "text") throw new UsageError(`${rel} is a ${kind.format === "text" ? "text" : kind.format} file, with no rendered form (slipbox read shows its text)`);
  return parseNoteFile(rel, text);
}

function textFiles(s: Session): { path: string; group: string; format: string }[] {
  return s.graph
    .filePaths()
    .map((path) => ({ path, ...classify(path, s.config.walk.extensions) }))
    .filter((f) => f.group !== "binary")
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Flags every command takes, and each command's own. */
const GLOBAL_FLAGS = new Set(["root", "config", "json", "color", "plain", "help", "version", "from"]);
const FLAGS: Record<string, string[]> = {
  render: ["width", "theme", "glyphs"],
  links: ["all"],
  find: ["regex", "whole", "ignore-case", "files"],
  ls: ["files"],
  replace: ["regex", "whole", "ignore-case", "first", "first-per-line", "lines", "dry-run", "if-unchanged"],
  task: ["check", "uncheck", "if-unchanged"],
  write: ["stdin", "append", "paragraph", "create", "if-unchanged", "allow-empty"],
  send: ["line", "server"],
  capture: ["ref", "snippet", "stdin", "lang"],
  scratch: ["if-unchanged"],
  init: ["name"],
};

/** A note argument that names an existing file is a path; otherwise it is a link name. */
function noteArgPath(arg: string | undefined, cwd: string): string | undefined {
  if (!arg) return undefined;
  const p = arg.startsWith("/") ? arg : `${cwd}/${arg}`;
  return existsSync(p) ? arg : undefined;
}

interface Result {
  data: unknown;
  human?: string;
  code?: number;
}

type Handler = (s: Session, rest: string[]) => Result | Promise<Result>;

function requireArg(rest: string[], what: string): string {
  const v = rest[0];
  if (!v) throw new UsageError(`missing ${what}`);
  return v;
}

/**
 * Resolve a note argument to a vault-relative path, or fail with exit 3/4. `parse` is false for
 * commands that need only the file's bytes: a big note the walk leaves out is then never parsed.
 */
function resolveNote(s: Session, arg: string, parse = true): string {
  const rel = findNoteArg(s, arg, parse);
  // Reading follows the vault's rule too: a symlink pointing out of it is not a note of it (the
  // walk leaves it out), so naming it by path reads nothing from outside.
  if (!landsInside(s.loc.root, join(s.loc.root, rel))) throw new CliError(`${rel} points outside the vault; not reading it`, EXIT.refused);
  return rel;
}

function findNoteArg(s: Session, arg: string, parse: boolean): string {
  if (s.loc.file && isInside(s.loc.root, s.loc.file)) {
    const rel = relative(s.loc.root, s.loc.file);
    if (s.graph.notes.has(rel)) return rel;
    // An existing file the walk leaves out (gitignored, hidden, under node_modules): the user
    // named it explicitly, so read it — as the TUI does — without adding it to the vault.
    if (arg && existsSync(arg.startsWith("/") ? arg : `${s.io.cwd}/${arg}`)) {
      // A data or text file is itself (16.4): never parsed as a note.
      if (parse && classify(rel, s.config.walk.extensions).group === "note") s.graph.adopt(rel);
      return rel;
    }
  }
  const r = s.graph.findNote(arg, s.io.cwd);
  if (r.status === "resolved") return r.path;
  // --from: a name several notes share means the one a link from that note reaches (the nearest).
  const fromArg = flag(s.args, "from");
  if (r.status === "ambiguous" && fromArg !== undefined && fromArg !== arg) {
    const from = s.graph.findNote(fromArg, s.io.cwd);
    if (from.status === "resolved") {
      const l = s.graph.resolveLink({ kind: "wiki", target: arg }, from.path);
      if (l.resolvedKind === "note" && l.path) return l.path;
    }
  }
  if (r.status === "ambiguous") {
    throw new CliError(`ambiguous note "${arg}": ${r.candidates.join(", ")}`, EXIT.ambiguous, { candidates: r.candidates });
  }
  // A data or text file of the vault, named by its path with its extension (16.4): from the
  // current folder, or from the vault's root.
  for (const abs of new Set([arg.startsWith("/") ? arg : join(s.io.cwd, arg), join(s.loc.root, arg)])) {
    if (!isInside(s.loc.root, abs)) continue;
    const rel = relative(s.loc.root, abs);
    if (s.graph.filePaths().includes(rel) && classify(rel, s.config.walk.extensions).group !== "binary") return rel;
  }
  throw new CliError(`no note or file "${arg}" in ${s.loc.root}`, EXIT.notFound);
}

function colorDepth(s: Session): ColorDepth {
  const c = flag(s.args, "color") ?? "auto";
  if (has(s.args, "plain") || has(s.args, "json") || c === "never") return "none";
  if (c === "always") {
    const d = detectColorDepth(s.io.env, true);
    return d === "none" ? "truecolor" : d;
  }
  if (c !== "auto") throw new UsageError(`--color must be auto, always or never`);
  return detectColorDepth(s.io.env, s.io.isTTY);
}

const HANDLERS: Record<string, Handler> = {
  render(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    const abs = s.graph.abs(rel);
    const decoded = readText(abs);
    const depth = colorDepth(s);
    const widthArg = flag(s.args, "width");
    if (widthArg !== undefined && !/^\d+$/.test(widthArg)) throw new UsageError("--width must be a whole number from 20 to 1000");
    const pane = widthArg !== undefined ? Number(widthArg) : (s.io.columns ?? 100);
    if (!Number.isInteger(pane) || pane < 20 || pane > 1000) throw new UsageError("--width must be a whole number from 20 to 1000");
    const width = layoutWidth(pane, s.config.render.inset);
    const themeName = flag(s.args, "theme") ?? s.config.theme;
    const loaded = loadTheme(themeName);
    if (loaded.warning) s.warnings.push(loaded.warning);
    const { theme, warnings: colorWarnings } = applyColorOverrides(loaded.theme, s.config.colors);
    s.warnings.push(...colorWarnings);
    const glyphArg = flag(s.args, "glyphs");
    if (glyphArg !== undefined && !isGlyphMode(glyphArg)) throw new UsageError("--glyphs must be auto, nerd, unicode or ascii");
    const glyphMode = (glyphArg as Config["render"]["glyphs"] | undefined) ?? s.config.render.glyphs;
    const showUrls = s.config.render.show_urls === "always" || (s.config.render.show_urls === "auto" && depth === "none");
    const layout = layoutNote(parseFile(s, rel, decoded.text), s.graph, rel, { width, glyphs: glyphsFor(glyphMode, s.io.env), showUrls });
    if (decoded.invalidUtf8) s.warnings.push(`${rel}: not valid UTF-8; invalid bytes shown as U+FFFD`);
    return {
      data: {
        path: rel,
        width,
        lines: layout.lines.map((l) => l.spans.map((sp) => sp.text).join("").replace(/\s+$/, "")),
        headings: layout.headings.map((h) => ({ level: h.level, text: h.text, slug: h.slug, line: h.src })),
      },
      human: layoutToAnsi(layout, theme, { depth }),
    };
  },

  resolve(s, rest) {
    const raw = requireArg(rest, "link");
    // A markdown link, [text](target): resolved as one (a path relative to --from's folder), as
    // `links` and the TUI resolve it — never by name like a [[wikilink]].
    const mdLink = /^!?\[[^\]]*\]\(\s*<?([^>)]*?)>?\s*\)$/.exec(raw);
    const inner = mdLink ? mdLink[1]! : raw.replace(/^!?\[\[/, "").replace(/\]\]$/, "");
    const parts = mdLink ? { target: decodeURIComponentSafe(inner.split("#")[0]!), heading: inner.includes("#") ? decodeURIComponentSafe(inner.slice(inner.indexOf("#") + 1)) : null } : parseWikiTarget(inner);
    const fromArg = flag(s.args, "from");
    const from = fromArg ? resolveNote(s, fromArg) : null;
    let status: string;
    let path: string | null = null;
    let candidates: string[] = [];
    let found: Target | null = null;
    // A scheme makes it external only outside [[…]] (as the renderer has it), with no spaces (a
    // URL has none), and when no note by that name exists: "Meeting: Q3" is a note.
    const bracketed = /^!?\[\[/.test(raw);
    const noteNamed = s.graph.findNote(parts.target, s.io.cwd).status !== "unresolved";
    if (mdLink && /^[a-z][a-z0-9+.-]*:/i.test(inner)) {
      status = "external";
      path = inner;
    } else if (mdLink && parts.target) {
      const md = s.graph.resolveLink({ kind: "markdown", target: inner }, from ?? "");
      status = md.resolvedKind === "note" || md.resolvedKind === "file" ? "resolved" : md.resolvedKind === "ambiguous" ? "ambiguous" : "unresolved";
      path = status === "resolved" ? md.path : null;
      candidates = md.candidates;
      found = md;
    } else if (!bracketed && /^[a-z][a-z0-9+.-]*:\S*$/i.test(inner) && !noteNamed && !vaultNamed(inner.slice(0, inner.indexOf(":"))).length) {
      status = "external";
      path = inner;
    } else if (!parts.target && from) {
      status = "resolved";
      path = from;
    } else {
      // The same resolver `links` and the TUI use, so `resolve` is link.follow's CLI equivalent,
      // attachments included. Without --from, a path or note name is tried first.
      const r = from ? null : s.graph.findNote(parts.target, s.io.cwd);
      if (r && r.status !== "unresolved") {
        status = r.status;
        path = r.path;
        candidates = r.candidates;
      } else {
        const w = s.graph.resolveLink({ kind: "wiki", target: parts.target }, from ?? "");
        const md = w.resolvedKind === "unresolved" && from && !w.reason ? s.graph.resolveLink({ kind: "markdown", target: parts.target }, from) : w;
        status = md.resolvedKind === "note" || md.resolvedKind === "file" ? "resolved" : md.resolvedKind === "ambiguous" ? "ambiguous" : "unresolved";
        path = status === "resolved" ? md.path : null;
        candidates = md.candidates;
        found = md;
      }
    }
    let line: number | null = null;
    const entry = path && parts.heading && status === "resolved" ? s.graph.entryAnywhere(path) : undefined;
    if (entry) {
      const h = entry.headings.find((x) => x.slug === slugify(parts.heading!) || x.text.toLowerCase() === parts.heading!.toLowerCase());
      line = h?.line ?? null;
    }
    const abs = path && status !== "external" ? (isAbsolute(path) ? path : s.graph.abs(path)) : null;
    const data = { link: raw, status, path, abs, heading: parts.heading, line, candidates, vault: found?.vault ?? null, via: found?.via ?? null, reason: found?.reason ?? null };
    if (status === "ambiguous") throw new CliError(`ambiguous link "${raw}"${data.reason ? ` (${data.reason})` : ""}: ${candidates.join(", ")}`, EXIT.ambiguous, data);
    if (status === "unresolved") throw new CliError(`unresolved link "${raw}"${data.reason ? `: ${data.reason}` : ""}`, EXIT.notFound, data);
    if (data.via) s.warnings.push(`"${raw}" reached ${abs} by ${data.via === "alias" ? "an alias" : data.via === "previous-name" ? "a previous name" : "a redirect"}`);
    return { data, human: `${abs ?? path}${line ? `:${line}` : ""}\n` };
  },

  async links(s, rest) {
    // --all: every note's links in one call (a vault-wide check for broken ones), each with `from`.
    const all = has(s.args, "all");
    if (all && rest.length) throw new UsageError("links takes a note or --all, not both");
    const notes = all ? (s.graph.ensureAll(), [...s.graph.notes.keys()].sort()) : [resolveNote(s, requireArg(rest, "note"))];
    if (!all) await s.graph.loadGrammars(); // a code file's links are in its comments (16.10)
    const links = notes.flatMap((from) => s.graph.linksOf(from).map((l) => ({ ...l, from })));
    const human = links
      .map((l) => {
        const where = `${all ? `${l.from}:` : ""}${l.line}:${l.column}`.padEnd(8);
        const dest =
          l.resolvedKind === "unresolved"
            ? `UNRESOLVED${l.reason ? ` (${l.reason})` : ""}`
            : l.resolvedKind === "ambiguous"
              ? `AMBIGUOUS (${l.candidates.join(", ")})`
              : `${l.path ?? ""}${l.vault ? ` (vault ${l.vault})` : ""}${l.via ? ` [${l.via}]` : ""}`;
        const shown = l.kind === "wiki" || l.kind === "embed" ? `[[${l.target}${l.heading ? `#${l.heading}` : ""}]]` : l.target;
        return `${where} ${l.kind.padEnd(8)} ${shown} -> ${dest}\n`;
      })
      .join("");
    return {
      data: links.map((l) => ({
        ...(all ? { from: l.from } : {}),
        kind: l.kind,
        target: l.target,
        heading: l.heading,
        text: l.text,
        line: l.line,
        column: l.column,
        status: l.resolvedKind,
        path: l.path,
        candidates: l.candidates,
        vault: l.vault ?? null,
        via: l.via ?? null,
        reason: l.reason ?? null,
      })),
      human,
    };
  },

  async backlinks(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    await s.graph.loadGrammars(); // code files link from their comments (16.10)
    const bl = s.graph.backlinks(rel);
    return { data: { path: rel, backlinks: bl.map((b) => ({ ...b, vault: b.vault ?? null })) }, human: bl.map((b) => `${b.vault ? `${b.vault}: ` : ""}${b.from}:${b.line}  ${b.text}\n`).join("") };
  },

  ls(s) {
    if (has(s.args, "json")) s.graph.ensureAll();
    const notes = [...s.graph.notes.values()];
    const data: Record<string, unknown>[] = notes.map((n) => ({ path: n.rel, title: n.title, size: n.size, mtime: new Date(n.mtimeMs).toISOString(), tags: n.tags, links: n.links.length }));
    const lines = notes.map((n) => n.rel);
    // --files: the vault's data and text files too (16.4), each with its group and format.
    if (has(s.args, "files")) {
      for (const f of textFiles(s)) {
        let st: { size: number; mtimeMs: number } | null = null;
        try {
          st = statSync(s.graph.abs(f.path));
        } catch {}
        data.push({ path: f.path, group: f.group, format: f.format, size: st?.size ?? 0, mtime: st ? new Date(st.mtimeMs).toISOString() : null });
        lines.push(f.path);
      }
    }
    return { data, human: lines.map((l) => `${l}\n`).join("") };
  },

  async outline(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    // Source code's outline is its definitions, from its grammar (16.8), each with its kind.
    const kind = classify(rel, s.config.walk.extensions);
    const g = kind.group === "text" ? grammarFor(kind.format, extensionOf(rel)) : null;
    if (g) {
      const loaded = await grammar(g);
      const tree = loaded ? parseSyntax(loaded, readText(s.graph.abs(rel)).text) : null;
      if (!tree) throw new CliError(`couldn't load the ${g} grammar${loadError(`grammar:${g}`) ? ` — ${loadError(`grammar:${g}`)}` : ""}`, EXIT.error);
      const defs = tree.outline().map((d) => ({ depth: d.depth + 1, text: d.name, kind: d.kind, line: d.line }));
      tree.tree.delete();
      return {
        data: { path: rel, headings: defs },
        // The kind before the name, unless the name says it already (Rust's `impl Trait for T`).
        human: defs.map((d) => `${String(d.line).padStart(5)}  ${"  ".repeat(d.depth - 1)}${d.text.startsWith(`${d.kind} `) ? "" : `${d.kind} `}${d.text}\n`).join(""),
      };
    }
    // A data file's sections are its outline (16.11); other text files have none.
    const hs = s.graph.entry(rel)?.headings ?? (kind.group === "data" ? dataOutline : headingsOf)(parseFile(s, rel, readText(s.graph.abs(rel)).text).tree);
    return {
      data: { path: rel, headings: hs },
      human: hs.map((h) => `${String(h.line).padStart(5)}  ${"  ".repeat(h.depth - 1)}${"#".repeat(h.depth)} ${h.text}\n`).join(""),
    };
  },

  async capture(s, rest) {
    const project = s.loc.root;
    const loc = scratchLocation(s.loc, s.config);
    const refArg = flag(s.args, "ref");
    const ref = refArg ? parseRef(refArg) : undefined;
    if (refArg && !ref) throw new UsageError(`--ref must look like path:42, path:42-50, path:42:10-30 or path:42:10-50:30, with lines from 1 and ranges in order`);
    let text = rest.join(" ");
    let snippetText: string | undefined;
    if (has(s.args, "stdin")) {
      const input = await s.io.stdin();
      // --stdin with nothing on it is a producer that failed, as for write: not an empty fence.
      if (!input.trim()) throw new UsageError("nothing on stdin to capture");
      // With a ref, stdin is the snippet (a visual selection from nvim); without, it is the text.
      // With --lang, stdin is code to fence even without a reference.
      if (ref || flag(s.args, "lang")) snippetText = input;
      else text = text ? `${text}\n\n${input}` : input;
    }
    if (!text.trim() && !ref && snippetText === undefined) throw new UsageError("nothing to capture: give text, --ref, or --stdin");
    let entry: string;
    try {
      entry = formatEntry({ text, ref: ref ?? undefined, snippet: has(s.args, "snippet"), snippetText, lang: flag(s.args, "lang"), cwd: s.io.cwd }, project);
    } catch (err) {
      if (err instanceof CaptureError) throw new CliError(err.message, EXIT.notFound);
      throw err;
    }
    // A reference to a file that isn't there, or past its end, is kept (the file may come later)
    // but said: it is usually a typo.
    if (ref && snippetText === undefined && !has(s.args, "snippet")) {
      const abs = isAbsolute(ref.path) ? ref.path : join(s.io.cwd, ref.path);
      let lines: number | null = null;
      try {
        const t = readRegular(abs, 64 << 20).toString("utf8");
        lines = t.split("\n").length - (t.endsWith("\n") ? 1 : 0);
      } catch {
        s.warnings.push(`--ref ${ref.path}: no such file`);
      }
      const last = ref.endLine ?? ref.startLine;
      if (lines !== null && last > lines) s.warnings.push(`--ref ${ref.path}: line ${last} is past the end (${lines} lines)`);
    }
    appendScratch(loc, entry);
    return { data: { scratch: loc.path, project, entry }, human: `${loc.path}\n` };
  },

  scratch(s, rest) {
    const sub = rest[0] ?? "show";
    const loc = scratchLocation(s.loc, s.config);
    const content = readScratch(loc);
    const sha = createHash("sha256").update(content).digest("hex").slice(0, 16);
    switch (sub) {
      case "path":
        return { data: { path: loc.path, exists: existsSync(loc.path) }, human: `${loc.path}\n` };
      case "show":
        return { data: { path: loc.path, content, sha }, human: content };
      case "clear": {
        const expect = flag(s.args, "if-unchanged");
        if (expect === "") throw new UsageError("--if-unchanged needs a sha (an empty one would check nothing)");
        if (expect && expect !== sha) throw new CliError(`scratch changed since ${expect} (now ${sha}); not cleared`, EXIT.refused, { sha });
        clearScratch(loc);
        return { data: { path: loc.path, cleared: true, previousSha: sha }, human: "" };
      }
      case "copy": {
        if (!content.trim()) throw new CliError("scratch is empty", EXIT.notFound);
        const r = copyText(content, { fallbackDir: stateDir(s.loc) });
        const how = r.file ? `wrote ${r.file}` : `copied via ${r.methods.join(" + ")}${r.confirmed ? "" : " (OSC 52 is unconfirmed)"}`;
        return { data: { path: loc.path, chars: content.length, ...r }, human: `${how} (${content.length} chars)\n` };
      }
      default:
        throw new UsageError(`scratch: unknown subcommand ${sub} (show, path, clear, copy)`);
    }
  },

  init(s, rest) {
    const dir = rest[0] ?? flag(s.args, "root") ?? s.io.cwd;
    const name = flag(s.args, "name");
    if (name === "") throw new UsageError("--name needs a name");
    let r;
    try {
      r = initVault(dir.startsWith("/") ? dir : `${s.io.cwd}/${dir}`, name);
    } catch (err) {
      if (err instanceof VaultError) throw new CliError(err.message, EXIT.refused);
      throw err;
    }
    const human = r.created
      ? `created ${r.root}/.slipbox/ — vault "${r.name}"\n`
      : r.identified
        ? `${r.root} is a vault; gave it an id — vault "${r.name}"\n`
        : `${r.root} is already a vault — "${r.name}"\n`;
    return { data: r, human };
  },

  vaults() {
    // Newest first; a vault whose folder is gone is still listed (a link to it says where it was).
    const list = readRegistry()
      .sort((a, b) => (a.seen < b.seen ? 1 : -1))
      .map((v) => ({ ...v, exists: existsSync(v.kind === "home" ? v.path : join(v.path, v.kind === "vault" ? ".slipbox" : "")) }));
    const human = list
      .map((v) => `${(v.name ?? basename(v.path)).padEnd(16)} ${v.kind.padEnd(6)} ${v.path}  ${v.seen.slice(0, 16).replace("T", " ")}${v.exists ? "" : "  (gone)"}\n`)
      .join("");
    return { data: list, human: human || "no vaults yet\n" };
  },

  info(s) {
    const g = s.graph;
    const scratch = scratchLocation(s.loc, s.config);
    const data = {
      version: VERSION,
      root: s.loc.root,
      mode: s.loc.mode,
      vault: { id: s.loc.id, name: s.loc.name, aliases: s.loc.aliases, previous_names: s.loc.previous_names, key: s.loc.key },
      markerVersion: s.loc.mode === "vault" ? readVaultVersion(s.loc.root) : null,
      config: { user: flag(s.args, "config") ?? s.io.env.SLIPBOX_CONFIG ?? userConfigFile(), sources: s.configSources, theme: s.config.theme },
      cache: cacheDir(s.loc),
      state: stateDir(s.loc),
      scratch: scratch.path,
      notes: g.notes.size,
      index: g.stats,
      skipped: g.skipped,
      stale: s.stale(),
    };
    const human = [
      `slipbox   ${VERSION}`,
      `root      ${data.root} (${data.mode}${data.markerVersion ? `, marker v${data.markerVersion}` : ""})`,
      ...(s.loc.name ? [`vault     ${s.loc.name}${s.loc.aliases.length ? ` (also ${s.loc.aliases.join(", ")})` : ""}${s.loc.id ? "" : " — no id yet: slipbox init gives it one"}`] : []),
      `notes     ${data.notes} (parsed ${g.stats.parsed}, cached ${g.stats.cached}, ${g.stats.ms.toFixed(0)} ms)`,
      `theme     ${data.config.theme}`,
      `config    ${data.config.sources.length ? data.config.sources.join(", then ") : `none (${data.config.user} doesn't exist)`}`,
      `cache     ${data.cache}`,
      `state     ${data.state}`,
      `scratch   ${data.scratch}`,
      ...g.skipped.map((x) => `skipped   ${x.rel} — ${x.reason}`),
      "",
    ].join("\n");
    return { data, human };
  },

  themes(s) {
    const list = listThemes();
    return {
      data: list.map((t) => ({ ...t, current: t.name === s.config.theme })),
      human: list.map((t) => `${t.name === s.config.theme ? "*" : " "} ${t.name}${t.source === "user" ? `  (${t.path})` : ""}\n`).join(""),
    };
  },

  find(s, rest) {
    const query = requireArg(rest, "query");
    const re = pattern(s, query);
    // --files: the vault's data and text files are searched too (16.4).
    const notes = rest[1] ? [resolveNote(s, rest[1], false)] : [...s.graph.notes.keys(), ...(has(s.args, "files") ? textFiles(s).map((f) => f.path) : [])].sort();
    const matches: { path: string; line: number; column: number; match: string; text: string }[] = [];
    for (const rel of notes) {
      let text: string;
      try {
        text = readText(s.graph.abs(rel)).text;
      } catch (err) {
        // One unreadable or vanished note doesn't fail the search: it's a warning, the rest go on.
        if (rest[1]) throw new CliError(`${rel}: ${(err as Error).message}`, EXIT.notFound);
        s.warnings.push(`${rel}: not searched (${(err as NodeJS.ErrnoException).code ?? (err as Error).message})`);
        continue;
      }
      const starts = lineStarts(text);
      let [colLine, colAt, col] = [0, 0, 0];
      for (const m of findAll(text, re)) {
        const line = lineAt(starts, m.from);
        const lineStart = starts[line - 1]!;
        const lineEnd = (starts[line] ?? text.length + 1) - 1;
        // Columns in code points, counted on from the last match of the same line.
        if (colLine !== line) [colLine, colAt, col] = [line, lineStart, 0];
        col += [...text.slice(colAt, m.from)].length;
        colAt = m.from;
        matches.push({ path: rel, line, column: col + 1, match: m.groups[0]!, text: around(text, lineStart, lineEnd, m.from, m.to) });
      }
    }
    // The walk leaves out notes over walk.max_file_size: say so, rather than find nothing in them.
    if (!rest[1]) {
      for (const k of s.graph.skipped) if (/^larger than/.test(k.reason)) s.warnings.push(`${k.rel}: not searched (${k.reason}); name it to search it`);
    }
    return {
      data: { query, regex: has(s.args, "regex"), whole: has(s.args, "whole"), count: matches.length, matches },
      human: matches.map((m) => `${m.path}:${m.line}:${m.column}: ${m.text}\n`).join(""),
    };
  },

  replace(s, rest) {
    if (rest.length < 3) throw new UsageError("replace needs <note> <old> <new> (the new text may be \"\")");
    const [noteArg, query, replacement] = rest as [string, string, string];
    if (!query) throw new UsageError("replace needs something to find (an empty pattern matches nothing)");
    const rel = resolveNote(s, noteArg, false);
    const abs = s.graph.abs(rel);
    const dry = has(s.args, "dry-run");
    if (!dry) checkWritable(s, abs);
    // A dry run only reads, so it previews a note that couldn't be rewritten too.
    const file = readNoteFile(s, abs, !dry);
    const re = pattern(s, query);
    const starts = lineStarts(file.text);
    const lines = flag(s.args, "lines");
    let range: [number, number] = [0, file.text.length];
    if (lines !== undefined) {
      const m = /^(\d+)(?:-(\d+))?$/.exec(lines);
      const a = m ? Number(m[1]) : 0;
      const b = m ? Number(m[2] ?? m[1]) : 0;
      if (!m || a < 1 || b < a) throw new UsageError("--lines must look like 12 or 12-40, from 1 and in order");
      const count = file.text.endsWith("\n") ? starts.length - 1 : starts.length;
      if (a > Math.max(1, count)) throw new UsageError(`--lines starts past the end (${rel} has ${count} line${count === 1 ? "" : "s"})`);
      range = [starts[a - 1] ?? file.text.length, starts[b] ?? file.text.length];
    }
    let ms = findAll(file.text, re, range[0], range[1], has(s.args, "regex")); // ^ and $ insert
    if (has(s.args, "first") && has(s.args, "first-per-line")) throw new UsageError("--first or --first-per-line, not both");
    if (has(s.args, "first")) ms = ms.slice(0, 1);
    if (has(s.args, "first-per-line")) ms = firstPerLine(file.text, ms); // vim's :s without g
    const regex = has(s.args, "regex");
    const out = replaceMatches(file.text, ms, replacement, regex);
    // Each change with its column and its line before and after (a window of a long one), so a
    // preview shows a match inside a longer word, and two on one line apart. Built from the line
    // alone, and before the write: the answer never costs more than the edit, and a note is never
    // written without one.
    let colLine = 0;
    let colAt = 0;
    let col = 0;
    const changes = ms.map((m) => {
      const line = lineAt(starts, m.from);
      const ls = starts[line - 1]!;
      const le = (starts[line] ?? file.text.length + 1) - 1;
      const after = expandReplacement(replacement, m, regex);
      const lineBefore = around(file.text, ls, le, m.from, m.to);
      const text = file.text.slice(ls, le);
      const edited = text.slice(0, m.from - ls) + after + text.slice(m.to - ls);
      const lineAfter = around(edited, 0, edited.length, m.from - ls, m.from - ls + after.length);
      // Columns in code points, counted on from the last match of the same line.
      if (colLine !== line || colAt > m.from) [colLine, colAt, col] = [line, ls, 0];
      col += [...file.text.slice(colAt, m.from)].length;
      colAt = m.from;
      return { line, column: col + 1, before: m.groups[0]!, after, text: lineBefore, textAfter: lineAfter };
    });
    const written = !dry && out.count ? writeNoteText(s, abs, out.text, file) : null;
    const verb = dry ? "would replace" : "replaced";
    return {
      // newSha: the note's sha after the call; null on a dry run, which wrote nothing to hash.
      data: { path: rel, count: out.count, dryRun: dry, sha: file.sha, newSha: dry ? null : (written ?? file.sha), changes },
      human: `${verb} ${out.count} in ${rel}\n${dry ? changes.map((c) => `${c.line}:${c.column}: ${c.text}\n${" ".repeat(String(c.line).length + String(c.column).length + 2)}→ ${c.textAfter}\n`).join("") : ""}`,
    };
  },

  task(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    const abs = s.graph.abs(rel);
    // A task is a one-byte edit, so a note that isn't valid UTF-8 can be ticked, as in the TUI.
    if (classify(rel, s.config.walk.extensions).group !== "note") throw new UsageError(`${rel} isn't a note: tasks are in notes`);
    const file = readNoteFile(s, abs, false);
    // Toggling one line needs only the chunk that holds it (a 20,000-task note parses in a blink);
    // the list, the whole note.
    const lineArg = rest[1] === undefined ? undefined : Number(rest[1]);
    const tasks = listTasks(lineArg !== undefined && Number.isInteger(lineArg) && lineArg >= 1 && noteFormat(rel) === "markdown" ? parseAround(file.text, lineArg) : parseNoteFile(rel, file.text).tree);
    // Each task's source line too (its text keeps [[links]]), and the note's sha for a safe tick.
    const lines = file.text.split("\n");
    const withRaw = tasks.map((t) => ({ ...t, raw: (lines[t.line - 1] ?? "").replace(/\r$/, "") }));
    if (rest[1] === undefined) {
      return { data: { path: rel, sha: file.sha, tasks: withRaw }, human: tasks.map((t) => `${String(t.line).padStart(5)}  [${t.checked ? "x" : " "}] ${t.text}\n`).join("") };
    }
    const line = Number(rest[1]);
    if (!Number.isInteger(line) || line < 1) throw new UsageError("the task's line must be a whole number from 1");
    const task = tasks.find((t) => t.line === line);
    if (!task) {
      // The whole note's tasks, to choose from (the chunk's alone would mislead).
      const all = listTasks(parseNoteFile(rel, file.text).tree).map((t) => ({ ...t, raw: (lines[t.line - 1] ?? "").replace(/\r$/, "") }));
      throw new CliError(`no task on line ${line} of ${rel}`, EXIT.notFound, { path: rel, sha: file.sha, tasks: all });
    }
    const want = has(s.args, "check") ? true : has(s.args, "uncheck") ? false : !task.checked;
    if (has(s.args, "check") && has(s.args, "uncheck")) throw new UsageError("--check or --uncheck, not both");
    checkWritable(s, abs);
    checkUnchanged(s, abs, file.sha);
    let sha = file.sha;
    if (want !== task.checked) {
      const r = toggleTask(file.bytes, line);
      if (!r) throw new CliError(`no task marker on line ${line} of ${rel}`, EXIT.notFound);
      try {
        writeNote(s.loc.root, abs, r.bytes);
      } catch (err) {
        if (err instanceof WriteRefused) throw new CliError(err.message, EXIT.refused);
        throw err;
      }
      sha = createHash("sha256").update(r.bytes).digest("hex").slice(0, 16);
    }
    return {
      data: { path: rel, line, text: task.text, checked: want, changed: want !== task.checked, sha },
      human: `${String(line).padStart(5)}  [${want ? "x" : " "}] ${task.text}\n`,
    };
  },

  read(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"), false);
    const abs = s.graph.abs(rel);
    const file = readNoteFile(s, abs, false);
    return { data: { path: rel, abs, sha: file.sha, bom: file.bom, crlf: file.crlf, invalidUtf8: file.invalidUtf8, content: file.text }, human: file.text };
  },

  // The TUI's note info (space n i), in one call.
  async stat(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    await s.graph.loadGrammars();
    const abs = s.graph.abs(rel);
    const file = readNoteFile(s, abs, false);
    const e = s.graph.entry(rel);
    const links = s.graph.linksOf(rel);
    const data = {
      path: rel,
      abs,
      size: file.bytes.length,
      mtime: new Date(statSync(abs).mtimeMs).toISOString(),
      title: e?.title ?? null,
      tags: e?.tags ?? [],
      headings: e?.headings.length ?? 0,
      links: links.length,
      unresolved: links.filter((l) => l.resolvedKind === "unresolved").length,
      backlinks: s.graph.backlinks(rel).length,
      sha: file.sha,
      bom: file.bom,
      crlf: file.crlf,
      invalidUtf8: file.invalidUtf8,
    };
    const encoding = [file.invalidUtf8 ? "invalid UTF-8" : "UTF-8", ...(file.crlf ? ["crlf"] : []), ...(file.bom ? ["bom"] : [])].join(", ");
    const rows: [string, string][] = [
      ["path", abs],
      ["size", `${data.size} bytes`],
      ["modified", data.mtime],
      ["title", data.title ?? "—"],
      ["tags", data.tags.join(", ") || "—"],
      ["headings", String(data.headings)],
      ["links", `${data.links}${data.unresolved ? ` (${data.unresolved} unresolved)` : ""}`],
      ["backlinks", String(data.backlinks)],
      ["encoding", encoding],
      ["sha", data.sha],
    ];
    return { data, human: rows.map(([k, v]) => `${k.padEnd(10)}${v}\n`).join("") };
  },

  // A folder (and its parents), in the vault only: from its root, or from the current folder
  // when the path says so (./, ../), as write --create takes a new note's path.
  mkdir(s, rest) {
    const arg = requireArg(rest, "path");
    const abs = arg.startsWith("/") ? arg : /^\.\.?\//.test(arg) ? join(s.io.cwd, arg) : join(s.loc.root, arg);
    if (!isInside(s.loc.root, abs) || !landsInside(s.loc.root, abs)) throw new CliError(`${arg} is outside the vault (${s.loc.root})`, EXIT.refused);
    const rel = relative(s.loc.root, abs);
    if (existsSync(abs)) throw new CliError(`${rel} already exists`, EXIT.refused, { path: rel });
    mkdirSync(abs, { recursive: true });
    return { data: { path: rel, created: true }, human: `${rel}/\n` };
  },

  async write(s, rest) {
    const noteArg = requireArg(rest, "note");
    // Text from the arguments is a line (or lines), so it ends with a newline; stdin is taken as is.
    let text = rest.length > 1 ? `${rest.slice(1).join(" ")}\n` : "";
    if (has(s.args, "stdin")) {
      const input = await s.io.stdin();
      text = `${text}${input}`;
    }
    if (!has(s.args, "stdin") && rest.length < 2) throw new UsageError("write needs the text, or --stdin");
    let rel: string;
    let created = false;
    let shadows: string[] = [];
    if (has(s.args, "create")) {
      // A new note: the argument is a path in the vault (relative to it, or to cwd when inside
      // it), never a name to resolve — and a file already there is never overwritten.
      // A path in the vault, from its root — or from the current folder when it says so (./, ../).
      const base = noteArg.startsWith("/") ? noteArg : /^\.\.?\//.test(noteArg) ? join(s.io.cwd, noteArg) : join(s.loc.root, noteArg);
      // A note unless the name says otherwise: `config.toml`, `run.py` keep their extension (16.4).
      const abs = isKnownExtension(extensionOf(base)) ? base : `${base}.md`;
      // Outside by its path, or by a symlinked folder on the way: checked before any folder is made.
      if (!isInside(s.loc.root, abs) || !landsInside(s.loc.root, abs)) throw new CliError(`${noteArg} is outside the vault (${s.loc.root})`, EXIT.refused);
      rel = relative(s.loc.root, abs);
      checkWritable(s, abs);
      if (existsSync(abs)) throw new CliError(`${rel} already exists; not overwriting it (drop --create to write it)`, EXIT.refused, { path: rel });
      created = true;
      // A name other notes have: [[name]] links may now reach the new note instead.
      const name = rel.replace(/\.(md|markdown)$/i, "").split("/").pop()!;
      const same = s.graph.findNote(name, s.loc.root);
      shadows = same.status === "resolved" ? [same.path] : same.status === "ambiguous" ? same.candidates : [];
      if (shadows.length) s.warnings.push(`${rel}: other notes are named "${name}" (${shadows.join(", ")}); [[${name}]] links may now reach this one`);
    } else {
      try {
        rel = resolveNote(s, noteArg, false);
      } catch (err) {
        if (err instanceof CliError && err.code === EXIT.notFound) throw new CliError(`${err.message} (--create makes a new note)`, EXIT.notFound);
        throw err;
      }
      checkWritable(s, join(s.loc.root, rel));
    }
    const abs = join(s.loc.root, rel);
    let previous: NoteFile | null = null;
    if (!created) previous = readNoteFile(s, abs);
    else if (flag(s.args, "if-unchanged") !== undefined) throw new CliError(`${rel} doesn't exist; --if-unchanged has nothing to compare`, EXIT.refused);
    // Nothing to write is almost always a failed producer (gen | slipbox write note --stdin): it
    // would empty the note, and --if-unchanged can't catch it. Said on purpose with --allow-empty.
    // Blank counts as empty: `write note "$(gen)"` gives "\n" when gen fails.
    if (!text.trim() && !has(s.args, "allow-empty")) throw new UsageError("nothing to write (empty text); --allow-empty empties the note on purpose");
    let content = text;
    if (previous && has(s.args, "append")) {
      // On a new line; with --paragraph after a blank one too, so the text is a block of its own
      // (a line appended right after a table would be its next row, after a paragraph part of it).
      const body = previous.text.replace(/(\r?\n)*$/, "");
      const sep = !body ? "" : has(s.args, "paragraph") ? "\n\n" : "\n";
      content = has(s.args, "paragraph") ? `${body}${sep}${text}` : `${previous.text}${previous.text && !previous.text.endsWith("\n") ? "\n" : ""}${text}`;
    }
    if (created) mkdirSync(dirname(abs), { recursive: true });
    const written = writeNoteText(s, abs, content, previous);
    return {
      data: { path: rel, created, ...(created ? { shadows } : {}), appended: !!previous && has(s.args, "append"), previousSha: previous?.sha ?? null, sha: written },
      human: `${created ? "created" : "wrote"} ${rel}\n`,
    };
  },

  send(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"), false);
    const abs = s.graph.abs(rel);
    const lineArg = flag(s.args, "line") ?? "1";
    if (!/^\d+$/.test(lineArg) || Number(lineArg) < 1) throw new UsageError("--line must be a whole number from 1");
    const line = Number(lineArg);
    const raw = s.config.editor.remote.filter((t) => t.trim());
    if (!raw.length) throw new CliError("set [editor] remote in the config to send notes to a running editor", EXIT.error);
    const templates = raw.length === 1 && raw[0]!.trim() === "nvim" ? NVIM_REMOTE : raw;
    let server = "";
    if (templates.some((t) => t.includes("{server}"))) server = pickNvim(s, abs);
    else if (flag(s.args, "server")) s.warnings.push("--server has no effect: [editor] remote names no {server}");
    const commands = templates.map((t) => editorArgv(t, abs, line, s.io.env, false, server));
    for (const argv of commands) {
      const r = spawnSync(argv[0]!, argv.slice(1), { stdio: "ignore", timeout: 10000 });
      if (r.error) throw new CliError(`couldn't start ${argv[0]}: ${r.error.message}`);
      if (r.status !== 0) throw new CliError(`${argv.slice(0, 2).join(" ")} exited with ${r.status}`);
    }
    return { data: { path: rel, line, server: server || null, commands }, human: `sent ${rel}:${line}${server ? ` to ${server}` : ""}\n` };
  },

  history(s) {
    const positions = readJson<Record<string, { line?: number; at?: string; cursor?: { anchor?: { line?: number } } }>>(join(stateDir(s.loc), "positions.json"), {});
    // The home vault keeps every loose folder's positions, by absolute path (17.2).
    const read = Object.entries(positions)
      .filter(([, p]) => p && typeof p.at === "string")
      .sort((a, b) => (a[1].at! < b[1].at! ? 1 : -1))
      .map(([path, p]) => ({ path, at: p.at!, line: p.cursor?.anchor?.line ?? p.line ?? 1, exists: existsSync(isAbsolute(path) ? path : join(s.loc.root, path)) }));
    const session = loadSession(s.loc);
    const open = (session?.tabs ?? []).map((t) => t.panes.map((p) => p.path));
    // What the user is looking at: the active tab's active window's note.
    const tab = session?.tabs[session.activeTab];
    const current = tab ? (tab.panes[tab.active] ?? tab.panes[0])?.path ?? null : null;
    return {
      data: { read, open, activeTab: session?.activeTab ?? null, current },
      human: read.length ? read.map((r) => `${r.at.slice(0, 16).replace("T", " ")}  ${r.path}:${r.line}${r.exists ? "" : "  (deleted)"}\n`).join("") : "nothing read in the TUI yet\n",
    };
  },

  commands() {
    return {
      data: COMMAND_SPECS,
      human: COMMAND_SPECS.map((c) => `${c.id.padEnd(20)} ${c.title.padEnd(44)} ${c.cli ?? "(interaction)"}\n`).join(""),
    };
  },
};

/**
 * A match's line for display: the whole line when short, else a window of it around the match with
 * `…` where it was cut — a long line (a data URI) repeated per match would grow as its square.
 */
function around(text: string, lineStart: number, lineEnd: number, from: number, to: number): string {
  const MAX = 160;
  const line = text.slice(lineStart, lineEnd).replace(/\r$/, "");
  if (line.length <= MAX) return line;
  const room = Math.max(0, MAX - (to - from));
  const a = Math.max(lineStart, from - Math.floor(room / 2));
  const b = Math.min(lineEnd, Math.max(to, a + MAX));
  return `${a > lineStart ? "…" : ""}${text.slice(a, b).replace(/\r$/, "")}${b < lineEnd ? "…" : ""}`;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The query as a pattern, with the shared flags; a bad regex is a usage error. */
function pattern(s: Session, query: string): RegExp {
  const re = compilePattern(query, { regex: has(s.args, "regex"), whole: has(s.args, "whole"), ignoreCase: has(s.args, "ignore-case") });
  if (typeof re === "string") throw new UsageError(`not a regex: ${re}`);
  return re;
}

function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) out.push(i + 1);
  return out;
}

/** The 1-based line holding offset `at`. */
function lineAt(starts: number[], at: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

interface NoteFile extends DecodedFile {
  bytes: Uint8Array;
  sha: string;
}

/**
 * A note's bytes, text and sha (of the bytes), checked against `--if-unchanged`. A note that isn't
 * valid UTF-8 is read, never rewritten: its invalid bytes would be lost.
 */
function readNoteFile(s: Session, abs: string, forWriting = true): NoteFile {
  let bytes: Buffer;
  try {
    bytes = readRegular(abs);
  } catch (err) {
    throw new CliError(`${relative(s.loc.root, abs)}: ${(err as NodeJS.ErrnoException).code === "ENOENT" ? "gone (deleted since it was found)" : (err as Error).message}`, EXIT.notFound);
  }
  const decoded = decodeText(bytes);
  const sha = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  if (forWriting) {
    checkUnchanged(s, abs, sha);
    if (decoded.invalidUtf8) throw new CliError(`${relative(s.loc.root, abs)} isn't valid UTF-8; not rewriting it`, EXIT.refused);
  }
  return { ...decoded, bytes, sha };
}

/**
 * What a writer (`write`, `replace`, `task`) may change: a markdown note in a real vault, inside
 * it by its real path, and where the walk lists notes — never `.slipbox/`, `.git/`, a hidden
 * folder or `node_modules`, and never a file that isn't `.md`. Refused, exit 5.
 */
function checkWritable(s: Session, abs: string): void {
  const refuse = (why: string) => {
    throw new CliError(`${relative(s.io.cwd, abs) || abs}: ${why}; not writing it`, EXIT.refused);
  };
  if (!isInside(s.loc.root, abs) || !landsInside(s.loc.root, abs)) refuse(`outside the vault (${s.loc.root})`);
  const rel = relative(s.loc.root, abs);
  // Notes, data and text files are written (16.4); binary files never are.
  if (classify(rel, s.config.walk.extensions).group === "binary") refuse("a binary file");
  if (rel.split("/").some((part) => part.startsWith(".") || part === "node_modules")) refuse("in a folder the vault doesn't list");
  if (UNSAFE.test(rel) || /[\x1b\t\n]/.test(rel)) refuse("a control character in its name");
}

/** `--if-unchanged <sha>`: refuse (exit 5) unless the note's bytes still have that sha. */
function checkUnchanged(s: Session, abs: string, sha: string): void {
  const expect = flag(s.args, "if-unchanged");
  if (expect === undefined) return;
  if (!expect) throw new UsageError("--if-unchanged needs a sha (an empty one would check nothing)");
  if (expect !== sha) throw new CliError(`${relative(s.loc.root, abs)} changed since ${expect} (now ${sha}); not written`, EXIT.refused, { sha });
}

/**
 * Write a note's text back as it was stored: its BOM and its line endings kept. Returns the sha of
 * the bytes written — not of the file re-read after, which another writer (a TUI's autosave) may
 * already have changed.
 */
function writeNoteText(s: Session, abs: string, text: string, was: DecodedFile | null): string {
  let out = text;
  if (was?.crlf) out = out.replace(/\r?\n/g, "\r\n");
  if (was?.bom) out = `\uFEFF${out}`;
  try {
    writeNote(s.loc.root, abs, out);
  } catch (err) {
    if (err instanceof WriteRefused) throw new CliError(err.message, EXIT.refused);
    throw err;
  }
  return createHash("sha256").update(Buffer.from(out, "utf8")).digest("hex").slice(0, 16);
}

/**
 * The nvim to send to: --server, else the one picked last in the TUI while it answers, else the
 * only one running, else the one working where the note lives (the closest folder).
 */
function pickNvim(s: Session, abs: string): string {
  const given = flag(s.args, "server");
  if (given) {
    if (!probeNvim(given)) throw new CliError(`no nvim answers at ${given}`, EXIT.notFound);
    return given;
  }
  const last = loadSession(s.loc)?.remote_server;
  if (last && probeNvim(last)) return last;
  const found = discoverNvims();
  if (!found.length) throw new CliError("no nvim is running with a server — start nvim (0.9 or later) and try again", EXIT.notFound);
  if (found.length === 1) return found[0]!.socket;
  const holding = found.filter((n) => n.cwd && (abs === n.cwd || abs.startsWith(`${n.cwd}/`))).sort((a, b) => b.cwd.length - a.cwd.length);
  if (holding.length && (holding.length === 1 || holding[0]!.cwd.length > holding[1]!.cwd.length)) return holding[0]!.socket;
  const candidates = found.map((n) => ({ socket: n.socket, cwd: n.cwd, file: n.file }));
  throw new CliError(`${found.length} nvims are running; pick one with --server (${found.map((n) => n.socket).join(", ")})`, EXIT.ambiguous, { candidates });
}

export function defaultIo(): Io {
  return {
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
    // Strict: invalid UTF-8 would be written as U+FFFD, the bytes lost without a word.
    stdin: async () => {
      const bytes = new Uint8Array(await new Response(Bun.stdin.stream()).arrayBuffer());
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new CliError("stdin isn't valid UTF-8; nothing written", EXIT.refused);
      }
    },
    isTTY: !!process.stdout.isTTY,
    columns: process.stdout.columns,
    cwd: process.cwd(),
    env: process.env,
  };
}
