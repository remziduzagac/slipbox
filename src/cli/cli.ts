// The CLI face (plan 9.x; command list decided in docs/design/decisions.md, 9.1).
//
// Disk is the contract (9.4): every command reads files and the fresh cache, never a TUI's unsaved
// buffer. Human output goes to stdout, diagnostics to stderr; `--json` prints exactly one object.
// This module must never import from src/tui/ — scripts/check-boundary.ts enforces it for core,
// and the CLI keeps to the same rule so it runs without a terminal renderer.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { relative } from "node:path";
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
import { listThemes, loadTheme } from "../core/theme/index.ts";
import { readText } from "../core/fsutil.ts";
import { initVault, isInside, locateVault, readVaultVersion, VaultError, type VaultLocation } from "../core/vault.ts";
import { parseWikiTarget } from "../core/wikilink.ts";
import { type Args, flag, has, parseArgs, UsageError } from "./args.ts";
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
  slipbox render <note>             render a note to stdout        [--width N] [--theme T] [--plain]
  slipbox resolve <link>            follow a link to a path        [--from <note>]
  slipbox links <note>              outgoing links with status
  slipbox backlinks <note>          notes that link to <note>
  slipbox ls                        list the vault's notes
  slipbox outline <note>            headings with source lines
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

<note> is a path, or a note name resolved like a [[wikilink]].
Exit codes: 0 ok, 1 error, 2 usage, 3 not found, 4 ambiguous link, 5 refused (--if-unchanged).
`;

export const CLI_COMMANDS = new Set([
  "render", "resolve", "links", "backlinks", "ls", "outline", "capture", "scratch", "init", "info", "themes", "commands", "help",
]);

/** Run a CLI command. Returns the exit code; never calls process.exit itself. */
export async function runCli(argv: string[], io: Io): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    io.err(`slipbox: ${(err as Error).message}\n`);
    return EXIT.usage;
  }
  const json = has(args, "json");
  const [command = "help", ...rest] = args.positional;
  if (has(args, "version")) {
    io.out(json ? `${JSON.stringify({ schema: JSON_SCHEMA, ok: true, command: "version", data: { version: VERSION } })}\n` : `slipbox ${VERSION}\n`);
    return EXIT.ok;
  }
  if (command === "help" || has(args, "help")) {
    io.out(HELP);
    return EXIT.ok;
  }
  let session: Session | null = null;
  try {
    const pathArg = ["render", "links", "backlinks", "outline"].includes(command) ? noteArgPath(rest[0], io.cwd) : undefined;
    const loc =
      command === "init"
        ? { root: io.cwd, mode: "single" as const, file: null }
        : locateVault({ root: flag(args, "root"), path: pathArg, cwd: io.cwd });
    session = new Session(args, loc, io);
    const handler = HANDLERS[command];
    if (!handler) throw new UsageError(`unknown command: ${command} (see slipbox help)`);
    const result = await handler(session, rest);
    const stale = command === "init" ? [] : session.stale();
    if (json) {
      io.out(`${JSON.stringify({ schema: JSON_SCHEMA, ok: true, command, data: result.data, warnings: session.allWarnings(), stale: stale.map((s) => s.path) })}\n`);
    } else {
      if (result.human) io.out(result.human);
      for (const w of session.allWarnings()) io.err(`slipbox: warning: ${w}\n`);
      if (stale.length) io.err(`slipbox: warning: unsaved changes in a running slipbox: ${stale.map((s) => s.path).join(", ")}\n`);
    }
    return result.code ?? EXIT.ok;
  } catch (err) {
    const code = err instanceof CliError ? err.code : err instanceof UsageError ? EXIT.usage : err instanceof VaultError ? EXIT.notFound : EXIT.error;
    const message = (err as Error).message;
    if (json) {
      io.out(`${JSON.stringify({ schema: JSON_SCHEMA, ok: false, command, error: { code, message }, data: err instanceof CliError ? (err.data ?? null) : null, warnings: session?.allWarnings() ?? [], stale: [] })}\n`);
    } else {
      io.err(`slipbox: ${message}\n`);
      if (!(err instanceof CliError) && !(err instanceof UsageError) && !(err instanceof VaultError) && io.env.SLIPBOX_DEBUG) io.err(`${(err as Error).stack}\n`);
    }
    return code;
  }
}

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

/** Resolve a note argument to a vault-relative path, or fail with exit 3/4. */
function resolveNote(s: Session, arg: string): string {
  if (s.loc.file && isInside(s.loc.root, s.loc.file)) {
    const rel = relative(s.loc.root, s.loc.file);
    if (s.graph.notes.has(rel)) return rel;
    // An existing file the walk leaves out (gitignored, hidden, under node_modules): the user
    // named it explicitly, so read it — as the TUI does — without adding it to the vault.
    if (arg && existsSync(arg.startsWith("/") ? arg : `${s.io.cwd}/${arg}`)) {
      s.graph.adopt(rel);
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
    const pane = widthArg ? Number(widthArg) : (s.io.columns ?? 100);
    if (!Number.isInteger(pane) || pane < 20 || pane > 1000) throw new UsageError("--width must be a whole number from 20 to 1000");
    const width = layoutWidth(pane, s.config.render.inset);
    const themeName = flag(s.args, "theme") ?? s.config.theme;
    const { theme, warning } = loadTheme(themeName);
    if (warning) s.warnings.push(warning);
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
    if (/^[a-z][a-z0-9+.-]*:/i.test(inner)) {
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

  commands() {
    return {
      data: COMMAND_SPECS,
      human: COMMAND_SPECS.map((c) => `${c.id.padEnd(20)} ${c.title.padEnd(44)} ${c.cli ?? "(interaction)"}\n`).join(""),
    };
  },
};

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
