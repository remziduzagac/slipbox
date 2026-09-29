// The CLI face (plan 9.x; command list decided in docs/design/decisions.md, 9.1).
//
// Disk is the contract (9.4): every command reads files and the fresh cache, never a TUI's unsaved
// buffer. Human output goes to stdout, diagnostics to stderr; `--json` prints exactly one object.
// This module must never import from src/tui/ — scripts/check-boundary.ts enforces it for core,
// and the CLI keeps to the same rule so it runs without a terminal renderer.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { appendScratch, CaptureError, clearScratch, formatEntry, parseRef, readScratch, scratchLocation } from "../core/capture.ts";
import { copyText } from "../core/clipboard.ts";
import { COMMAND_SPECS } from "../core/command-specs.ts";
import { type Config, loadConfig } from "../core/config.ts";
import { glyphsFor, isGlyphMode } from "../core/glyphs.ts";
import { type Graph, openGraph } from "../core/graph.ts";
import { detectColorDepth, layoutToAnsi, type ColorDepth } from "../core/layout/ansi.ts";
import { layoutNote, layoutWidth } from "../core/note.ts";
import { parseMarkdown, slugify } from "../core/parse.ts";
import { cacheDir, stateDir, userConfigFile } from "../core/paths.ts";
import { readStale, type StaleEntry } from "../core/stale.ts";
import { applyColorOverrides, listThemes, loadTheme } from "../core/theme/index.ts";
import { sanitize } from "../core/sanitize.ts";
import { type DecodedFile, decodeText, landsInside, readJson, readText, WriteRefused, writeNote } from "../core/fsutil.ts";
import { compilePattern, expandReplacement, findAll, firstPerLine, replaceMatches } from "../core/replace.ts";
import { listTasks, toggleTask } from "../core/tasks.ts";
import { editorArgv } from "../core/editor.ts";
import { discoverNvims, NVIM_REMOTE, probeNvim } from "../core/nvim.ts";
import { loadSession } from "../core/position.ts";
import { initVault, isInside, locateVault, readVaultVersion, VaultError, type VaultLocation } from "../core/vault.ts";
import { parseWikiTarget } from "../core/wikilink.ts";
import { type Args, flag, has, parseArgs, UsageError, VALUED } from "./args.ts";
import { VERSION } from "../version.ts";

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

  constructor(
    readonly args: Args,
    readonly loc: VaultLocation,
    readonly io: Io,
  ) {
    const loaded = loadConfig({ vaultRoot: loc.mode === "vault" ? loc.root : null, configFile: flag(args, "config") });
    this.config = loaded.config;
    this.warnings.push(...loaded.warnings);
    if (loc.note && loc.mode === "single") this.warnings.push(loc.note);
  }

  get graph(): Graph {
    if (!this._graph) this._graph = openGraph(this.loc, this.config, true, "lazy");
    return this._graph;
  }

  /** Warnings, including walk and parse errors found lazily while the command ran. */
  allWarnings(): string[] {
    return [...this.warnings, ...(this._graph?.errors ?? [])];
  }

  stale(): StaleEntry[] {
    return readStale(this.loc.root);
  }
}

export const HELP = `slipbox ${VERSION} — terminal markdown notes, agent-drivable

Usage:
  slipbox [path]                    open the TUI (needs a terminal)
  slipbox render <note>             render a note to stdout        [--width N] [--theme T] [--glyphs G] [--plain]
  slipbox resolve <link>            follow a link to a path        [--from <note>]
  slipbox links <note>              outgoing links with status
  slipbox backlinks <note>          notes that link to <note>
  slipbox ls                        list the vault's notes
  slipbox outline <note>            headings with source lines
  slipbox find <query> [note]       find text in a note, or the vault  [--regex] [--whole] [--ignore-case]
  slipbox replace <note> <old> <new>  replace in a note  [--regex] [--whole] [--ignore-case] [--first | --first-per-line] [--lines A-B] [--dry-run] [--if-unchanged <sha>]
  slipbox task <note> [line]        list tasks, or toggle one      [--check] [--uncheck] [--if-unchanged <sha>]
  slipbox read <note>               a note's text, and its sha
  slipbox write <note> [text]       write a note (atomic, in the vault)  [--stdin] [--append] [--create] [--if-unchanged <sha>]
  slipbox send <note>               open it in a running editor   [--line N] [--server <socket>]
  slipbox history                   notes read lately, newest first, and what's open
  slipbox capture [text]            append to the scratch          [--ref path:L[-M]] [--snippet] [--stdin] [--lang L]
  slipbox scratch show|path|clear|copy                            [--if-unchanged <sha>]
  slipbox init [dir]                make <dir> a vault (creates .slipbox/)
  slipbox info                      vault, paths, versions, staleness
  slipbox themes                    list themes
  slipbox commands                  list named commands and their CLI equivalents

Global options:
  --root <dir>      vault root (default: nearest .slipbox/ above the path or cwd)
  --config <file>   user config file (default: $SLIPBOX_CONFIG or ~/.config/slipbox/config.toml)
  --json            one JSON object on stdout: {schema, ok, command, data, warnings, stale}
  --color <when>    auto | always | never
  -h, --help        this help        -V, --version   print the version

<note> is a path, or a note name resolved like a [[wikilink]]. After --, nothing is an option:
slipbox read -- -dash.md names a note that starts with a dash.
Exit codes: 0 ok, 1 error, 2 usage, 3 not found, 4 ambiguous (a link; several nvims for send),
5 refused (--if-unchanged, a write outside the vault or over an existing note, invalid UTF-8).
`;

export const CLI_COMMANDS = new Set([
  "render", "resolve", "links", "backlinks", "ls", "outline", "find", "replace", "task", "read", "write", "send", "history",
  "capture", "scratch", "init", "info", "themes", "commands", "help",
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
    `${JSON.stringify({ schema: JSON_SCHEMA, ok: o.ok, command: o.command, ...(o.error ? { error: o.error } : {}), data: o.data ?? null, warnings: o.warnings ?? [], stale: o.stale ?? [] })}\n`;
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
    const noteAt = ["render", "links", "backlinks", "outline", "replace", "task", "read", "write", "send"].includes(command) ? rest[0] : command === "find" ? rest[1] : undefined;
    const pathArg = noteArgPath(noteAt, io.cwd);
    const loc =
      command === "init"
        ? { root: io.cwd, mode: "single" as const, file: null }
        : locateVault({ root: flag(args, "root"), path: pathArg, cwd: io.cwd });
    session = new Session(args, loc, io);
    const handler = HANDLERS[command];
    if (!handler) throw new UsageError(`unknown command: ${command} (see slipbox help)`);
    // Too many arguments is a mistake to report, not to drop (a dropped one can be a flag after --).
    const most = MAX_ARGS[command];
    if (most !== undefined && rest.length > most) throw new UsageError(`${command} takes at most ${most} argument${most === 1 ? "" : "s"}; got ${rest.length} (${rest.slice(most).join(" ")} too many)`);
    const result = await handler(session, rest);
    const stale = command === "init" ? [] : session.stale();
    if (json) {
      io.out(`${JSON.stringify({ schema: JSON_SCHEMA, ok: true, command, data: result.data, warnings: session.allWarnings(), stale: stale.map((s) => s.path) })}\n`);
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
  render: 1, resolve: 1, links: 1, backlinks: 1, ls: 0, outline: 1, find: 2, replace: 3, task: 2, read: 1, send: 1, history: 0,
  scratch: 1, init: 1, info: 0, themes: 0, commands: 0,
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
  if (s.loc.mode === "vault" && !landsInside(s.loc.root, join(s.loc.root, rel))) throw new CliError(`${rel} points outside the vault; not reading it`, EXIT.refused);
  return rel;
}

function findNoteArg(s: Session, arg: string, parse: boolean): string {
  if (s.loc.file && isInside(s.loc.root, s.loc.file)) {
    const rel = relative(s.loc.root, s.loc.file);
    if (s.graph.notes.has(rel)) return rel;
    // An existing file the walk leaves out (gitignored, hidden, under node_modules): the user
    // named it explicitly, so read it — as the TUI does — without adding it to the vault.
    if (arg && existsSync(arg.startsWith("/") ? arg : `${s.io.cwd}/${arg}`)) {
      if (parse) s.graph.adopt(rel);
      return rel;
    }
  }
  const r = s.graph.findNote(arg, s.io.cwd);
  if (r.status === "resolved") return r.path;
  if (r.status === "ambiguous") {
    throw new CliError(`ambiguous note "${arg}": ${r.candidates.join(", ")}`, EXIT.ambiguous, { candidates: r.candidates });
  }
  throw new CliError(`no note "${arg}" in ${s.loc.root}`, EXIT.notFound);
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
    const layout = layoutNote(parseMarkdown(decoded.text), s.graph, rel, { width, glyphs: glyphsFor(glyphMode, s.io.env), showUrls });
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
    const inner = raw.replace(/^!?\[\[/, "").replace(/\]\]$/, "");
    const parts = parseWikiTarget(inner);
    const fromArg = flag(s.args, "from");
    const from = fromArg ? resolveNote(s, fromArg) : null;
    let status: string;
    let path: string | null = null;
    let candidates: string[] = [];
    // A scheme makes it external only outside [[…]] (as the renderer has it), with no spaces (a
    // URL has none), and when no note by that name exists: "Meeting: Q3" is a note.
    const bracketed = /^!?\[\[/.test(raw);
    const noteNamed = s.graph.findNote(parts.target, s.io.cwd).status !== "unresolved";
    if (!bracketed && /^[a-z][a-z0-9+.-]*:\S*$/i.test(inner) && !noteNamed) {
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
        const md = w.resolvedKind === "unresolved" && from ? s.graph.resolveLink({ kind: "markdown", target: parts.target }, from) : w;
        status = md.resolvedKind === "note" || md.resolvedKind === "file" ? "resolved" : md.resolvedKind === "ambiguous" ? "ambiguous" : "unresolved";
        path = status === "resolved" ? md.path : null;
        candidates = md.candidates;
      }
    }
    let line: number | null = null;
    if (path && parts.heading && s.graph.notes.has(path)) {
      const h = s.graph.entry(path)!.headings.find((x) => x.slug === slugify(parts.heading!) || x.text.toLowerCase() === parts.heading!.toLowerCase());
      line = h?.line ?? null;
    }
    const data = { link: raw, status, path, abs: path && status !== "external" ? s.graph.abs(path) : null, heading: parts.heading, line, candidates };
    if (status === "ambiguous") throw new CliError(`ambiguous link "${raw}": ${candidates.join(", ")}`, EXIT.ambiguous, data);
    if (status === "unresolved") throw new CliError(`unresolved link "${raw}"`, EXIT.notFound, data);
    return { data, human: `${data.abs ?? path}${line ? `:${line}` : ""}\n` };
  },

  links(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    const links = s.graph.linksOf(rel);
    const human = links
      .map((l) => {
        const where = `${l.line}:${l.column}`.padEnd(8);
        const dest = l.resolvedKind === "unresolved" ? "UNRESOLVED" : l.resolvedKind === "ambiguous" ? `AMBIGUOUS (${l.candidates.join(", ")})` : (l.path ?? "");
        const shown = l.kind === "wiki" || l.kind === "embed" ? `[[${l.target}${l.heading ? `#${l.heading}` : ""}]]` : l.target;
        return `${where} ${l.kind.padEnd(8)} ${shown} -> ${dest}\n`;
      })
      .join("");
    return {
      data: links.map((l) => ({ kind: l.kind, target: l.target, heading: l.heading, text: l.text, line: l.line, column: l.column, status: l.resolvedKind, path: l.path, candidates: l.candidates })),
      human,
    };
  },

  backlinks(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    const bl = s.graph.backlinks(rel);
    return { data: { path: rel, backlinks: bl }, human: bl.map((b) => `${b.from}:${b.line}  ${b.text}\n`).join("") };
  },

  ls(s) {
    if (has(s.args, "json")) s.graph.ensureAll();
    const notes = [...s.graph.notes.values()];
    return {
      data: notes.map((n) => ({ path: n.rel, title: n.title, size: n.size, mtime: new Date(n.mtimeMs).toISOString(), tags: n.tags, links: n.links.length })),
      human: notes.map((n) => `${n.rel}\n`).join(""),
    };
  },

  outline(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    const hs = s.graph.entry(rel)!.headings;
    return {
      data: { path: rel, headings: hs },
      human: hs.map((h) => `${String(h.line).padStart(5)}  ${"  ".repeat(h.depth - 1)}${"#".repeat(h.depth)} ${h.text}\n`).join(""),
    };
  },

  async capture(s, rest) {
    const project = captureProject(s);
    const loc = scratchLocation(project, s.config);
    const refArg = flag(s.args, "ref");
    const ref = refArg ? parseRef(refArg) : undefined;
    if (refArg && !ref) throw new UsageError(`--ref must look like path:42, path:42-50, path:42:10-30 or path:42:10-50:30, with lines from 1 and ranges in order`);
    let text = rest.join(" ");
    let snippetText: string | undefined;
    if (has(s.args, "stdin")) {
      const input = await s.io.stdin();
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
    appendScratch(loc, entry);
    return { data: { scratch: loc.path, project, entry }, human: `${loc.path}\n` };
  },

  scratch(s, rest) {
    const sub = rest[0] ?? "show";
    const loc = scratchLocation(captureProject(s), s.config);
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
        const r = copyText(content, { fallbackDir: stateDir(loc.project) });
        const how = r.file ? `wrote ${r.file}` : `copied via ${r.methods.join(" + ")}${r.confirmed ? "" : " (OSC 52 is unconfirmed)"}`;
        return { data: { path: loc.path, chars: content.length, ...r }, human: `${how} (${content.length} chars)\n` };
      }
      default:
        throw new UsageError(`scratch: unknown subcommand ${sub} (show, path, clear, copy)`);
    }
  },

  init(s, rest) {
    const dir = rest[0] ?? flag(s.args, "root") ?? s.io.cwd;
    const r = initVault(dir.startsWith("/") ? dir : `${s.io.cwd}/${dir}`);
    return { data: r, human: r.created ? `created ${r.root}/.slipbox/\n` : `${r.root} is already a vault\n` };
  },

  info(s) {
    const g = s.graph;
    const scratch = scratchLocation(captureProject(s), s.config);
    const data = {
      version: VERSION,
      root: s.loc.root,
      mode: s.loc.mode,
      markerVersion: s.loc.mode === "vault" ? readVaultVersion(s.loc.root) : null,
      config: { user: flag(s.args, "config") ?? s.io.env.SLIPBOX_CONFIG ?? userConfigFile(), theme: s.config.theme },
      cache: cacheDir(s.loc.root),
      state: stateDir(s.loc.root),
      scratch: scratch.path,
      notes: g.notes.size,
      index: g.stats,
      skipped: g.skipped,
      stale: s.stale(),
    };
    const human = [
      `slipbox   ${VERSION}`,
      `root      ${data.root} (${data.mode}${data.markerVersion ? `, marker v${data.markerVersion}` : ""})`,
      `notes     ${data.notes} (parsed ${g.stats.parsed}, cached ${g.stats.cached}, ${g.stats.ms.toFixed(0)} ms)`,
      `theme     ${data.config.theme}`,
      `config    ${data.config.user}`,
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
    const notes = rest[1] ? [resolveNote(s, rest[1], false)] : [...s.graph.notes.keys()].sort();
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
      for (const m of findAll(text, re)) {
        const line = lineAt(starts, m.from);
        const lineStart = starts[line - 1]!;
        const lineEnd = (starts[line] ?? text.length + 1) - 1;
        matches.push({ path: rel, line, column: [...text.slice(lineStart, m.from)].length + 1, match: m.groups[0]!, text: around(text, lineStart, lineEnd, m.from, m.to) });
      }
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
    if (!dry && out.count) writeNoteText(s, abs, out.text, file);
    const changes = ms.map((m) => ({ line: lineAt(starts, m.from), before: m.groups[0]!, after: expandReplacement(replacement, m, regex) }));
    const verb = dry ? "would replace" : "replaced";
    return {
      // newSha: the note's sha after the call; null on a dry run, which wrote nothing to hash.
      data: { path: rel, count: out.count, dryRun: dry, sha: file.sha, newSha: dry ? null : out.count ? shaOf(abs) : file.sha, changes },
      human: `${verb} ${out.count} in ${rel}\n${dry ? changes.map((c) => `${c.line}: ${c.before} → ${c.after}\n`).join("") : ""}`,
    };
  },

  task(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    const abs = s.graph.abs(rel);
    // A task is a one-byte edit, so a note that isn't valid UTF-8 can be ticked, as in the TUI.
    const file = readNoteFile(s, abs, false);
    const tasks = listTasks(parseMarkdown(file.text).tree);
    if (rest[1] === undefined) {
      return { data: { path: rel, tasks }, human: tasks.map((t) => `${String(t.line).padStart(5)}  [${t.checked ? "x" : " "}] ${t.text}\n`).join("") };
    }
    const line = Number(rest[1]);
    if (!Number.isInteger(line) || line < 1) throw new UsageError("the task's line must be a whole number from 1");
    const task = tasks.find((t) => t.line === line);
    if (!task) throw new CliError(`no task on line ${line} of ${rel}`, EXIT.notFound, { tasks });
    const want = has(s.args, "check") ? true : has(s.args, "uncheck") ? false : !task.checked;
    if (has(s.args, "check") && has(s.args, "uncheck")) throw new UsageError("--check or --uncheck, not both");
    checkWritable(s, abs);
    checkUnchanged(s, abs, file.sha);
    if (want !== task.checked) {
      const r = toggleTask(file.bytes, line);
      if (!r) throw new CliError(`no task marker on line ${line} of ${rel}`, EXIT.notFound);
      try {
        writeNote(s.loc.root, abs, r.bytes);
      } catch (err) {
        if (err instanceof WriteRefused) throw new CliError(err.message, EXIT.refused);
        throw err;
      }
    }
    return {
      data: { path: rel, line, text: task.text, checked: want, changed: want !== task.checked, sha: shaOf(abs) },
      human: `${String(line).padStart(5)}  [${want ? "x" : " "}] ${task.text}\n`,
    };
  },

  read(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"), false);
    const abs = s.graph.abs(rel);
    const file = readNoteFile(s, abs, false);
    return { data: { path: rel, abs, sha: file.sha, bom: file.bom, crlf: file.crlf, invalidUtf8: file.invalidUtf8, content: file.text }, human: file.text };
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
    if (has(s.args, "create")) {
      // A new note: the argument is a path in the vault (relative to it, or to cwd when inside
      // it), never a name to resolve — and a file already there is never overwritten.
      const base = noteArg.startsWith("/") ? noteArg : isInside(s.loc.root, join(s.io.cwd, noteArg)) ? join(s.io.cwd, noteArg) : join(s.loc.root, noteArg);
      const abs = /\.(md|markdown)$/i.test(base) ? base : `${base}.md`;
      // Outside by its path, or by a symlinked folder on the way: checked before any folder is made.
      if (!isInside(s.loc.root, abs) || !landsInside(s.loc.root, abs)) throw new CliError(`${noteArg} is outside the vault (${s.loc.root})`, EXIT.refused);
      rel = relative(s.loc.root, abs);
      checkWritable(s, abs);
      if (existsSync(abs)) throw new CliError(`${rel} already exists; not overwriting it (drop --create to write it)`, EXIT.refused, { path: rel });
      created = true;
    } else {
      rel = resolveNote(s, noteArg, false);
      checkWritable(s, join(s.loc.root, rel));
    }
    const abs = join(s.loc.root, rel);
    let previous: NoteFile | null = null;
    if (!created) previous = readNoteFile(s, abs);
    else if (flag(s.args, "if-unchanged") !== undefined) throw new CliError(`${rel} doesn't exist; --if-unchanged has nothing to compare`, EXIT.refused);
    let content = text;
    if (previous && has(s.args, "append")) {
      const sep = previous.text && !previous.text.endsWith("\n") ? "\n" : "";
      content = `${previous.text}${sep}${text}`;
    }
    if (created) mkdirSync(dirname(abs), { recursive: true });
    writeNoteText(s, abs, content, previous);
    return {
      data: { path: rel, created, appended: !!previous && has(s.args, "append"), previousSha: previous?.sha ?? null, sha: shaOf(abs) },
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
    const commands = templates.map((t) => editorArgv(t, abs, line, s.io.env, false, server));
    for (const argv of commands) {
      const r = spawnSync(argv[0]!, argv.slice(1), { stdio: "ignore", timeout: 10000 });
      if (r.error) throw new CliError(`couldn't start ${argv[0]}: ${r.error.message}`);
      if (r.status !== 0) throw new CliError(`${argv.slice(0, 2).join(" ")} exited with ${r.status}`);
    }
    return { data: { path: rel, line, server: server || null, commands }, human: `sent ${rel}:${line}${server ? ` to ${server}` : ""}\n` };
  },

  history(s) {
    const positions = readJson<Record<string, { line?: number; at?: string; cursor?: { anchor?: { line?: number } } }>>(join(stateDir(s.loc.root), "positions.json"), {});
    const read = Object.entries(positions)
      .filter(([, p]) => p && typeof p.at === "string")
      .sort((a, b) => (a[1].at! < b[1].at! ? 1 : -1))
      .map(([path, p]) => ({ path, at: p.at!, line: p.cursor?.anchor?.line ?? p.line ?? 1 }));
    const session = loadSession(s.loc.root);
    const open = (session?.tabs ?? []).map((t) => t.panes.map((p) => p.path));
    return {
      data: { read, open },
      human: read.map((r) => `${r.at.slice(0, 16).replace("T", " ")}  ${r.path}:${r.line}\n`).join(""),
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

function shaOf(abs: string): string {
  return createHash("sha256").update(readFileSync(abs)).digest("hex").slice(0, 16);
}

/**
 * A note's bytes, text and sha (of the bytes), checked against `--if-unchanged`. A note that isn't
 * valid UTF-8 is read, never rewritten: its invalid bytes would be lost.
 */
function readNoteFile(s: Session, abs: string, forWriting = true): NoteFile {
  let bytes: Buffer;
  try {
    bytes = readFileSync(abs);
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
  if (s.loc.mode !== "vault") refuse("not in a vault (no .slipbox/ above it)");
  if (!isInside(s.loc.root, abs) || !landsInside(s.loc.root, abs)) refuse(`outside the vault (${s.loc.root})`);
  const rel = relative(s.loc.root, abs);
  if (!/\.(md|markdown)$/i.test(rel) || /^\.(md|markdown)$/i.test(rel.split("/").pop()!)) refuse("not a markdown note");
  if (rel.split("/").some((part) => part.startsWith(".") || part === "node_modules")) refuse("in a folder the vault doesn't list");
  if (/[\x00-\x1f]/.test(rel)) refuse("a control character in its name");
}

/** `--if-unchanged <sha>`: refuse (exit 5) unless the note's bytes still have that sha. */
function checkUnchanged(s: Session, abs: string, sha: string): void {
  const expect = flag(s.args, "if-unchanged");
  if (expect === undefined) return;
  if (!expect) throw new UsageError("--if-unchanged needs a sha (an empty one would check nothing)");
  if (expect !== sha) throw new CliError(`${relative(s.loc.root, abs)} changed since ${expect} (now ${sha}); not written`, EXIT.refused, { sha });
}

/** Write a note's text back as it was stored: its BOM and its line endings kept. */
function writeNoteText(s: Session, abs: string, text: string, was: DecodedFile | null): void {
  let out = text;
  if (was?.crlf) out = out.replace(/\r?\n/g, "\r\n");
  if (was?.bom) out = `\uFEFF${out}`;
  try {
    writeNote(s.loc.root, abs, out);
  } catch (err) {
    if (err instanceof WriteRefused) throw new CliError(err.message, EXIT.refused);
    throw err;
  }
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
  const last = loadSession(s.loc.root)?.remote_server;
  if (last && probeNvim(last)) return last;
  const found = discoverNvims();
  if (!found.length) throw new CliError("no nvim is running with a server — start nvim (0.9 or later) and try again", EXIT.notFound);
  if (found.length === 1) return found[0]!.socket;
  const holding = found.filter((n) => n.cwd && (abs === n.cwd || abs.startsWith(`${n.cwd}/`))).sort((a, b) => b.cwd.length - a.cwd.length);
  if (holding.length && (holding.length === 1 || holding[0]!.cwd.length > holding[1]!.cwd.length)) return holding[0]!.socket;
  const candidates = found.map((n) => ({ socket: n.socket, cwd: n.cwd, file: n.file }));
  throw new CliError(`${found.length} nvims are running; pick one with --server (${found.map((n) => n.socket).join(", ")})`, EXIT.ambiguous, { candidates });
}

/** The scratch's project: the vault root, else the git top-level of cwd, else cwd (0.10 / 8.2). */
function captureProject(s: Session): string {
  if (s.loc.mode === "vault") return s.loc.root;
  try {
    const top = execFileSync("git", ["-C", s.io.cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (top) return top;
  } catch {}
  return s.io.cwd;
}

export function defaultIo(): Io {
  return {
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
    stdin: async () => await new Response(Bun.stdin.stream()).text(),
    isTTY: !!process.stdout.isTTY,
    columns: process.stdout.columns,
    cwd: process.cwd(),
    env: process.env,
  };
}
