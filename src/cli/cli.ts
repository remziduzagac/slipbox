// The CLI face (plan 9.x; the command list is D18).
//
// Disk is the contract (9.4): every command reads files and the fresh cache, never a TUI's unsaved
// buffer. Human output goes to stdout, diagnostics to stderr; `--json` prints exactly one object.
// This module must never import from src/tui/ — scripts/check-boundary.ts enforces it for core,
// and the CLI keeps to the same rule so it runs without a terminal renderer.
//
// Here, the dispatcher: the arguments parsed, the vault found, a command's arguments and flags
// checked, its result printed. The commands are in modules by group — render.ts, reading.ts,
// writing.ts, links.ts, files.ts, vaults.ts, git.ts, search.ts, info.ts, servers.ts, agents.ts,
// install.ts — and what they share is common.ts's.

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { loadConfig } from "../core/config.ts";
import { lookupFolder } from "../core/folders.ts";
import { isPointer, parsePointer, resolvePointer } from "../core/pointer.ts";
import { pathLink } from "../core/links.ts";
import { sanitize, UNSAFE } from "../core/sanitize.ts";
import { elsewhereAt, findVaultRoot, isVaultRoot, locateVault, setRootMarkers, VaultError } from "../core/vault.ts";
import { setTrustedRoots } from "../core/trust.ts";
import { type Args, flag, has, parseArgs, UsageError, VALUED } from "./args.ts";
import { VERSION } from "../version.ts";
import { EXIT, CliError, type Io, Session, type Handler, probeLinks } from "./common.ts";
import { RENDER_COMMANDS } from "./render.ts";
import { READING_COMMANDS } from "./reading.ts";
import { WRITING_COMMANDS } from "./writing.ts";
import { LINK_COMMANDS } from "./links.ts";
import { FILE_COMMANDS } from "./files.ts";
import { VAULT_COMMANDS } from "./vaults.ts";
import { GIT_COMMANDS } from "./git.ts";
import { SEARCH_COMMANDS } from "./search.ts";
import { INFO_COMMANDS } from "./info.ts";
import { SERVER_COMMANDS } from "./servers.ts";
import { AGENT_COMMANDS } from "./agents.ts";
import { INSTALL_COMMANDS } from "./install.ts";
import { report } from "./report.ts";

export { EXIT, CliError, retargetSaid } from "./common.ts";

/**
 * JSON with every character `sanitize` would change escaped as \uXXXX. JSON.stringify leaves C1
 * controls, DEL and bidi overrides raw, and a terminal acts on them. Lossless: it is still the same
 * JSON value.
 */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    new RegExp(UNSAFE.source, "g"),
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export const JSON_SCHEMA = 1;

export const HELP = `slipbox ${VERSION} — read, review and edit what your coding agent writes, in your terminal

Usage:
  slipbox [path]                    open the TUI (needs a terminal); also: slipbox open [path]
  slipbox render <note>             render a note to stdout        [--width N] [--theme T] [--glyphs G] [--plain]
  slipbox resolve <link>            follow a link to a path        [--from <note>]
  slipbox link <note>               a link to it, as slipbox writes one here: the folder's convention  [--from <note>]
                                    [--text T] [--style markdown|wiki] [--embed]
  slipbox links <note>              outgoing links with status     [--all: every note's]
  slipbox backlinks <note>          notes that link to <note>
  slipbox search <words…>           notes ranked by the words: "phrases", prefix*, -not, title:, #tag, path:  [--scope here|linked|all]
                                    [--limit N]
  slipbox index                     build or bring up to date the search index here  [--rebuild]
  slipbox index --home              the background auto-index of the home folder, run now  [--budget MS] [--rebuild]
  slipbox index --refresh [path]    bring a vault's index up to date now — this one, or the one holding path
  slipbox changed                   what this branch changed against the base (main), committed or not  [--base <ref>]
  slipbox diff <note>               the note's changes on this branch: against where it left the base  [--base <ref>]
  slipbox merge-review <branch>     the links merging <branch> here would break, from git's tentative result  [--into <ref>]
  slipbox worktrees                 the repository's checkouts: the main one and its worktrees, by branch
  slipbox context <note>…           the notes, what they link to and what links to them, as one document for an agent
                                    [--depth N] [--no-backlinks] [--limit N] [--copy]
  slipbox tags [tag]                the tags here and how many notes carry each; a tag's notes
  slipbox problems                  broken, ambiguous and fragile links here, and notes nothing links to  [--lint]
  slipbox ls                        list the notes here            [--files: data and text files too]
  slipbox outline <note>            headings with source lines
  slipbox footnotes <note>          footnotes: each label, its text and line, and where it's referred to
                                    [add <line[:col]> <text> | edit <label> <text> | rm <label> | rename <label> <new>] [--if-unchanged <sha>]
  slipbox find <query> [note]       find text in a note, or every note  [--regex] [--whole] [--ignore-case] [--files]
  slipbox replace <note> <old> <new>  replace in a note  [--regex] [--whole] [--ignore-case] [--first | --first-per-line] [--lines A-B] [--dry-run] [--if-unchanged <sha>]
  slipbox replace --all <old> <new>  replace in every note, undone as a rename is  [--files] [--regex] [--whole] [--ignore-case] [--dry-run] [--plan]
  slipbox spell <note>              the words its dictionaries don't know (its lang:, else [spell] languages)
                                    [--lang L[,M]] [--suggest] · --add <word>: one of your words, added
  slipbox task <note> [line]        list tasks, or toggle one      [--check] [--uncheck] [--if-unchanged <sha>]
  slipbox read <note>               a note's text, and its sha
  slipbox stat <note>               a note's size, dates, title, counts, encoding (the TUI's note info)
  slipbox write <note> [text]       write a note (atomic, in the vault)  [--stdin] [--append [--paragraph]] [--create] [--if-unchanged <sha>] [--allow-empty]
  slipbox mkdir <path>              make a folder here (and its parents)
  slipbox mv <note|folder> <new-path>  rename or move a note or folder; links fixed wherever they're reached  [--dry-run] [--plan]
                                    <new-path> (and cp's path): from the vault's top, or from here when ./ or ../, or absolute;
                                    a folder that's there, or a path ending in /, is moved or copied into (its name kept)
  slipbox cp <note|folder> [path]   copy a note or folder (beside it, as name-copy, when no path)
  slipbox rm <note|folder>          delete to the trash (slipbox trash restore puts it back)  [--dry-run]
  slipbox trash [restore <item>]    what's in the trash, newest first; restore an item (its id or path)
  slipbox trash empty               what's in the trash, listed; removed for good with --yes (it keeps 30 days)  [--yes]
  slipbox name <new>                this folder's name, as a pointer names it: changed, the old kept; a repository given one
                                    [--dry-run] [--plan]
  slipbox folders [default <name> <path>]  the named folders: their copies, the one links open; or make one the one
  slipbox symlinks [forget <link>]  the symlinks you've answered, followed or not, and where they lead; or forget one:
                                    asked again in slipbox, and followed no more
  slipbox rename-heading <note> <heading> <new>  rename a heading; links to it fixed everywhere  [--dry-run] [--plan]
  slipbox relink [note]             rewrite links broken by a move slipbox saw, to where the file is  [--dry-run] [--plan]
  slipbox convert-links [note]      wikilinks and links from the vault's top rewritten as relative paths  [--dry-run] [--plan]
  slipbox undo                      take back the last mv, name, rename-heading, relink, convert-links or replace --all here
                                    [--dry-run] [--plan]
  slipbox apply [plan]              write a plan --plan saved (refused if a file changed since); none: those waiting  [--dry-run]
  slipbox send <note>               open it in a running editor   [--line N] [--server <socket>]
  slipbox history                   notes read lately, newest first, and what's open
  slipbox export <note…>            notes as one document, beside the first by its name  [--to docx|pdf|html|epub|md] [--out|-o <path>]
                                    [--force: over a file there that isn't an earlier export]
  slipbox capture [text]            append to the scratch          [--ref path:L[-M] | path:L:C-D | path:L:C-M:D] [--snippet] [--stdin] [--lang L]
  slipbox scratch show|path|clear|copy                            [--if-unchanged <sha>]
  slipbox init [dir]                give <dir> a .slipbox/: settings, and a name with --name  [--name N] [--private] [--dry-run] [--plan]
  slipbox deinit <dir>              take a nested vault's .slipbox/ away: part of the vault holding it  [--dry-run] [--plan]
  slipbox info                      the vault, its name and copies, its link convention, paths, versions, staleness
  slipbox doctor [file]             language servers and linters: each language's, found where, installed when needed, or missing
  slipbox diagnostics <file>        a file's problems: its servers', its linters', its syntax; a note's links and lint  [--severity S] [--timeout SECS]
  slipbox themes                    list themes
  slipbox types [type]              document types here (skill, adr, your [types]): how many notes each; a type's notes in order
  slipbox upgrade                   the latest release installed, checked before it's used  [--check: only say whether there's one]
  slipbox channel [set stable|preview]  which releases the installer's install follows: stable, or previews too
  slipbox uninstall                 what the installer put here, listed; removed with --yes  [--purge: slipbox's folders too] [--yes]
  slipbox report                    what a bug report asks for (the version, how it was installed, the system, the
                                    terminal) and the bug form's address filled in with it; nothing sent
  slipbox skill                     the skill for agents, this slipbox's: printed; written into <dir>/slipbox/ with --install
                                    [--install <dir>] [--force: over a file slipbox didn't write, or a link] [--dry-run]
  slipbox commands                  list named commands and their CLI equivalents

Global options:
  --root <dir>      the vault to start from (default: the nearest folder above the path or cwd holding a vault marker)
  --config <file>   user config file (default: $SLIPBOX_CONFIG or ~/.config/slipbox/config.toml)
  --json            one JSON object on stdout: {schema, ok, command, data, warnings, stale}
  --color <when>    auto | always | never
  -h, --help        this help        -V, --version   print the version

<note> is a path (a data or text file too, with its extension), a named folder's file by its pointer
(slipbox://research/algorithms/dijkstra.md, the name as slipbox folders shows it), or a note's name (its file's,
or an alias); a name several notes share is exit 4,
unless --from <note> picks the one a link from there reaches. resolve <link> --from <note> gives
href, the relative path a link there carries. After --, nothing is an option:
slipbox read -- -dash.md names a note that starts with a dash.
Exit codes: 0 ok, 1 error, 2 usage, 3 not found, 4 ambiguous (a link; several nvims for send),
5 refused (--if-unchanged, a write outside the vault or over an existing note, invalid UTF-8,
  a link not followed, an index asked of Elsewhere).
`;

export const CLI_COMMANDS = new Set([
  "render",
  "resolve",
  "link",
  "links",
  "backlinks",
  "name",
  "folders",
  "symlinks",
  "ls",
  "outline",
  "find",
  "replace",
  "task",
  "read",
  "stat",
  "write",
  "mkdir",
  "send",
  "history",
  "mv",
  "rename-heading",
  "relink",
  "convert-links",
  "undo",
  "context",
  "search",
  "index",
  "changed",
  "diff",
  "merge-review",
  "worktrees",
  "cp",
  "rm",
  "trash",
  "deinit",
  "tags",
  "footnotes",
  "problems",
  "capture",
  "scratch",
  "init",
  "info",
  "apply",
  "doctor",
  "diagnostics",
  "themes",
  "commands",
  "help",
  "export",
  "spell",
  "upgrade",
  "channel",
  "uninstall",
  "skill",
  "types",
  "report",
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
  const envelope = (o: {
    ok: boolean;
    command: string;
    data?: unknown;
    error?: { code: number; message: string };
    warnings?: string[];
    stale?: string[];
  }) =>
    `${safeJson({ schema: JSON_SCHEMA, ok: o.ok, command: o.command, ...(o.error ? { error: o.error } : {}), data: o.data ?? null, warnings: o.warnings ?? [], stale: o.stale ?? [] })}\n`;
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    const message = (err as Error).message;
    if (argv.some((a) => a === "--json" || a.startsWith("--json=")))
      io.out(envelope({ ok: false, command: commandIn(argv), error: { code: EXIT.usage, message } }));
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
    if (color !== undefined && !["auto", "always", "never"].includes(color))
      throw new UsageError("--color must be auto, always or never");
    // A report is often of a vault that won't open: made before any is looked for, as --version is (RPT-D5).
    if (command === "report") {
      checkUsage(command, rest, args);
      const r = report(io);
      io.out(json ? envelope({ ok: true, command, data: r.data }) : sanitize(r.human ?? ""));
      return EXIT.ok;
    }
    // Where roots are (21.1), and which may run their own code (23.x), are your config's to say,
    // `--config` included: read before finding one.
    const yours = loadConfig({ configFile: flag(args, "config") }).config;
    setRootMarkers(yours.walk.root_markers);
    setTrustedRoots(yours.trust.roots);
    // A file named by its pointer (21.10) is that file: its path from here on, so the command works in
    // its folder as it would with the path.
    const NOTE_FIRST = [
      "render",
      "export",
      "spell",
      "links",
      "backlinks",
      "outline",
      "footnotes",
      "replace",
      "task",
      "read",
      "stat",
      "write",
      "send",
      "mv",
      "rename-heading",
      "relink",
      "convert-links",
      "cp",
      "rm",
      "diff",
      "context",
    ];
    // `replace --all` names no note: its first argument is what it finds.
    const noNote = command === "replace" && has(args, "all");
    const named =
      command === "context"
        ? rest.map((_, i) => i)
        : noNote
          ? []
          : NOTE_FIRST.includes(command) || ["diagnostics", "doctor", "deinit", "index", "link"].includes(command)
            ? [0]
            : command === "find"
              ? [1]
              : [];
    for (const i of named) if (rest[i] !== undefined) rest[i] = vaultFormArg(rest[i]!, io.cwd);
    const from = flag(args, "from");
    if (from !== undefined) args.flags.set("from", vaultFormArg(from, io.cwd));
    // The note argument, when it names a file, also says which vault this is (resolve's is --from:
    // where the link is written; diagnostics' its file, whose root's checks it runs).
    const noteAt = noNote
      ? undefined
      : NOTE_FIRST.includes(command) || command === "diagnostics"
        ? rest[0]
        : command === "find"
          ? rest[1]
          : command === "resolve"
            ? flag(args, "from")
            : command === "link"
              ? (flag(args, "from") ?? rest[0])
              : undefined;
    let pathArg = noteArgPath(noteAt, io.cwd, flag(args, "root"));
    // A nested vault's folder, moved, copied or deleted, is a folder of the vault holding it (18.7).
    if (pathArg && ["mv", "cp", "rm"].includes(command)) {
      const abs = isAbsolute(pathArg) ? pathArg : join(io.cwd, pathArg);
      if (isVaultRoot(abs) && findVaultRoot(dirname(abs))) pathArg = dirname(abs);
    }
    // init makes the vault: opening the folder as one first would name it before --name could.
    const loc =
      command === "init" ? elsewhereAt(io.cwd) : locateVault({ root: flag(args, "root"), path: pathArg, cwd: io.cwd });
    // In Elsewhere, every link on a path's way from the folder you work in down asks (VV-D6), not only those from the
    // file's own folder.
    if (loc.mode === "folder" && dirname(io.cwd) !== io.cwd) loc.workDir = io.cwd;
    session = new Session(args, loc, io);
    const handler = HANDLERS[command];
    if (!handler) throw new UsageError(`unknown command: ${command} (see slipbox help)`);
    checkUsage(command, rest, args);
    // Its followed links' targets asked whether they answer, before anything is read through them (VV-D6).
    await probeLinks(session);
    const result = await handler(session, rest);
    const stale = command === "init" ? [] : session.stale();
    if (json) {
      io.out(
        `${safeJson({ schema: JSON_SCHEMA, ok: true, command, data: result.data, warnings: session.allWarnings(), stale: stale.map((s) => s.path) })}\n`,
      );
    } else {
      // Note text reaches the terminal only sanitized (2.9). `render` is the exception: its output
      // is a layout, sanitized when built, plus the colours it adds on purpose.
      if (result.human) io.out(command === "render" ? result.human : sanitize(result.human));
      // Diagnostics quote config values and paths from the vault: sanitized like the output (2.9).
      for (const w of session.allWarnings()) io.err(sanitize(`slipbox: warning: ${w}\n`));
      if (stale.length)
        io.err(
          sanitize(`slipbox: warning: unsaved changes in a running slipbox: ${stale.map((s) => s.path).join(", ")}\n`),
        );
    }
    return result.code ?? EXIT.ok;
  } catch (err) {
    const code =
      err instanceof CliError
        ? err.code
        : err instanceof UsageError
          ? EXIT.usage
          : err instanceof VaultError
            ? EXIT.notFound
            : EXIT.error;
    const message = (err as Error).message;
    if (json) {
      let stale: string[] = [];
      try {
        stale = session && command !== "init" ? session.stale().map((x) => x.path) : [];
      } catch {
        // the error came from the session itself; no stale list then
      }
      io.out(
        envelope({
          ok: false,
          command,
          error: { code, message },
          data: err instanceof CliError ? (err.data ?? null) : null,
          warnings: session?.allWarnings() ?? [],
          stale,
        }),
      );
    } else {
      io.err(sanitize(`slipbox: ${message}\n`));
      if (
        !(err instanceof CliError) &&
        !(err instanceof UsageError) &&
        !(err instanceof VaultError) &&
        io.env.SLIPBOX_DEBUG
      )
        io.err(`${(err as Error).stack}\n`);
    }
    return code;
  }
}

/** A command's arguments and flags, checked before it runs. */
function checkUsage(command: string, rest: string[], args: Args): void {
  // Too many arguments is a mistake to report, not to drop (a dropped one can be a flag after --).
  const most = MAX_ARGS[command];
  if (most !== undefined && rest.length > most)
    throw new UsageError(
      `${command} takes at most ${most} argument${most === 1 ? "" : "s"}; got ${rest.length} (${rest.slice(most).join(" ")} too many)`,
    );
  // A flag the command doesn't take is an error, never ignored: `write --dry-run` would write.
  const own = FLAGS[command] ?? [];
  for (const name of args.flags.keys()) {
    if (!GLOBAL_FLAGS.has(name) && !own.includes(name))
      throw new UsageError(
        `--${name} isn't an option of ${command}${own.length ? ` (it takes ${own.map((f) => `--${f}`).join(", ")})` : ""}`,
      );
  }
}

/** Arguments each command takes at most (`write` and `capture` take free text: no limit). */
const MAX_ARGS: Record<string, number> = {
  render: 1,
  resolve: 1,
  link: 1,
  links: 1,
  name: 1,
  folders: 3,
  symlinks: 2,
  backlinks: 1,
  ls: 0,
  outline: 1,
  find: 2,
  replace: 3,
  task: 2,
  read: 1,
  stat: 1,
  send: 1,
  history: 0,
  scratch: 1,
  init: 1,
  info: 0,
  apply: 1,
  index: 1,
  themes: 0,
  commands: 0,
  mkdir: 1,
  mv: 2,
  "rename-heading": 3,
  doctor: 1,
  diagnostics: 1,
  relink: 1,
  "convert-links": 1,
  cp: 2,
  rm: 1,
  trash: 2,
  deinit: 1,
  tags: 1,
  footnotes: 4,
  problems: 0,
  "merge-review": 1,
  changed: 0,
  diff: 1,
  worktrees: 0,
  undo: 0,
  spell: 1,
  upgrade: 0,
  channel: 2,
  uninstall: 0,
  skill: 0,
  report: 0,
  types: 1,
};

/** Flags every command takes, and each command's own. */
export const GLOBAL_FLAGS = new Set(["root", "config", "json", "color", "plain", "help", "version", "from"]);

export const FLAGS: Record<string, string[]> = {
  render: ["width", "theme", "glyphs"],
  export: ["to", "out", "force"],
  links: ["all"],
  link: ["text", "style", "embed"],
  find: ["regex", "whole", "ignore-case", "files"],
  ls: ["files"],
  replace: [
    "regex",
    "whole",
    "ignore-case",
    "first",
    "first-per-line",
    "lines",
    "dry-run",
    "if-unchanged",
    "all",
    "files",
    "plan",
  ],
  spell: ["lang", "suggest", "add"],
  task: ["check", "uncheck", "if-unchanged"],
  footnotes: ["if-unchanged"],
  problems: ["lint"],
  diagnostics: ["severity", "timeout"],
  write: ["stdin", "append", "paragraph", "create", "if-unchanged", "allow-empty"],
  send: ["line", "server"],
  capture: ["ref", "snippet", "stdin", "lang"],
  scratch: ["if-unchanged"],
  init: ["name", "private", "dry-run", "plan"],
  deinit: ["dry-run", "plan"],
  apply: ["dry-run"],
  mv: ["dry-run", "plan"],
  rm: ["dry-run"],
  trash: ["yes"],
  name: ["dry-run", "plan"],
  "rename-heading": ["dry-run", "plan"],
  relink: ["dry-run", "plan"],
  "convert-links": ["dry-run", "plan"],
  undo: ["dry-run", "plan"],
  context: ["depth", "no-backlinks", "limit", "copy"],
  search: ["limit", "scope"],
  index: ["rebuild", "home", "budget", "refresh"],
  changed: ["base"],
  "merge-review": ["into"],
  diff: ["base"],
  upgrade: ["check"],
  uninstall: ["purge", "yes"],
  skill: ["install", "force", "dry-run"],
};

/**
 * A file argument by its pointer (21.10), as the file's path; any other as it is. An existing file by
 * that name is itself: a path wins. The old `name:path` form (20.20, gone in 21.12) is refused.
 */
function vaultFormArg(arg: string, cwd: string): string {
  // A pointer (21.10): the file it names, in its folder's copy here — or why not.
  if (isPointer(arg)) {
    const p = parsePointer(arg);
    const t = p ? resolvePointer(p) : null;
    if (t?.status === "found") return pathLink(t.abs, join(cwd, "_"), false, undefined, true)?.abs ?? t.abs;
    if (t?.status === "ambiguous")
      throw new CliError(`${arg}: ${t.reason}`, EXIT.ambiguous, { candidates: t.candidates });
    if (t?.status === "branch")
      throw new CliError(
        `${arg}: ${t.branch} isn't checked out here (slipbox resolve reads it from git)`,
        EXIT.notFound,
      );
    throw new CliError(`${arg}: ${t?.reason ?? "not a pointer"}`, EXIT.notFound);
  }
  if (existsSync(isAbsolute(arg) ? arg : join(cwd, arg))) return arg;
  // `research:x.md` (20.20's form, removed in 21.12): no file — its pointer said, when a folder has that name.
  const m = /^([^:/\s]+):(?!\/\/)(.+)$/.exec(arg);
  if (m && lookupFolder(m[1]!).status !== "unknown")
    throw new CliError(`${arg} names a folder the old way: slipbox://${m[1]}/${m[2]} names it`, EXIT.notFound);
  return arg;
}

/** The note argument as a path that exists: from here, else from `--root` (where its names start). */
function noteArgPath(arg: string | undefined, cwd: string, root?: string): string | undefined {
  if (!arg) return undefined;
  const p = arg.startsWith("/") ? arg : `${cwd}/${arg}`;
  if (existsSync(p)) return arg;
  const fromRoot = root && !arg.startsWith("/") ? join(resolve(cwd, root), arg) : null;
  return fromRoot && existsSync(fromRoot) ? fromRoot : undefined;
}

/** Every command, by its name: each group's from its module. */
const HANDLERS: Record<string, Handler> = {
  ...RENDER_COMMANDS,
  ...READING_COMMANDS,
  ...WRITING_COMMANDS,
  ...LINK_COMMANDS,
  ...FILE_COMMANDS,
  ...VAULT_COMMANDS,
  ...GIT_COMMANDS,
  ...SEARCH_COMMANDS,
  ...INFO_COMMANDS,
  ...SERVER_COMMANDS,
  ...AGENT_COMMANDS,
  ...INSTALL_COMMANDS,
};

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
    rows: process.stdout.rows,
    cwd: process.cwd(),
    env: process.env,
  };
}
