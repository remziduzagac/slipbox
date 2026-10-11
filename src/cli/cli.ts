// The CLI face (plan 9.x; the command list is D18).
//
// Disk is the contract (9.4): every command reads files and the fresh cache, never a TUI's unsaved
// buffer. Human output goes to stdout, diagnostics to stderr; `--json` prints exactly one object.
// This module must never import from src/tui/ — scripts/check-boundary.ts enforces it for core,
// and the CLI keeps to the same rule so it runs without a terminal renderer.

import { grammar, grammarFor, parseSyntax } from "../core/syntax.ts";
import { loadError } from "../core/lazy.ts";
import { loadMermaid } from "../core/diagrams.ts";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { appendScratch, CaptureError, clearScratch, formatEntry, parseRef, readScratch, scratchLocation } from "../core/capture.ts";
import { copyText } from "../core/clipboard.ts";
import { buildContext } from "../core/context.ts";
import { catchUp, search, SearchIndex } from "../core/search.ts";
import { type Checkout, checkoutOf } from "../core/git.ts";
import { baseBranch, changedSince, type GitState, gitGuardsAttributes, inCheckout, inVault, mergeBaseOf, showAt, statusOf, worktreeList } from "../core/gitops.ts";
import { diffRows } from "../core/merge.ts";
import { COMMAND_SPECS } from "../core/command-specs.ts";
import { type Config, loadConfig } from "../core/config.ts";
import { conventionOf, describeConvention, type LinkStyle } from "../core/convention.ts";
import { linkEnds, linkWarnings, writeLink } from "../core/write-link.ts";
import { copyAvailable, folderIdentity, lookupFolder, pointerName, readFolders, setDefaultCopy } from "../core/folders.ts";
import { isPointer, parsePointer, resolvePointer } from "../core/pointer.ts";
import { pathLink } from "../core/links.ts";
import { glyphsFor, isGlyphMode } from "../core/glyphs.ts";
import { certainty, describeLanding, Graph, type LinkProblem, openGraph, type Retarget, type Target } from "../core/graph.ts";
import { type LintIssue, lintCommand, lintFailure, runLint } from "../core/lint.ts";
import { detectColorDepth, layoutToAnsi, type ColorDepth } from "../core/layout/ansi.ts";
import { layoutNote, layoutWidth } from "../core/note.ts";
import { headingsOf, parseAround, parseMarkdown, type ParsedNote, slugify } from "../core/parse.ts";
import { addOwnWord, Checker, dictionaryFiles, noteLanguages, openSpeller, ownWordsFile, proseWords, type Speller } from "../core/spell.ts";
import { findHeading, headingFragment } from "../core/landing.ts";
import { addFootnote, applyEdits, deleteFootnote, editFootnote, type Footnote, footnotesOf, renameFootnote, type TextEdit } from "../core/footnotes.ts";
import { parseNoteFile } from "../core/readers.ts";
import { dataOutline, parseData } from "../core/data.ts";
import { classify, extensionOf, isKnownExtension, noteFormat } from "../core/filetypes.ts";
import { cacheDir, dataHome, stateDir, stateHome, userConfigFile } from "../core/paths.ts";
import { readStale, type StaleEntry } from "../core/stale.ts";
import { applyColorOverrides, listThemes, loadTheme } from "../core/theme/index.ts";
import { sanitize, UNSAFE } from "../core/sanitize.ts";
import { climbsOut, type DecodedFile, decodeText, ensureDir, landsInside, readJson, readRegular, readText, WriteRefused, writeNote } from "../core/fsutil.ts";
import { exportNotes, exportTarget, FORMATS, formatFor, writeExport } from "../core/export/index.ts";
import { compilePattern, expandReplacement, findAll, firstPerLine, replaceMatches } from "../core/replace.ts";
import { planReplace } from "../core/replace-files.ts";
import { listTasks, toggleTask } from "../core/tasks.ts";
import { editorArgv } from "../core/editor.ts";
import { discoverNvims, NVIM_REMOTE, probeNvim } from "../core/nvim.ts";
import { loadSession, PositionStore } from "../core/position.ts";
import { openVault, Reach } from "../core/reach.ts";
import { doctor, doctorFile, type LinterReport, type ServerReport } from "../core/servers/doctor.ts";
import { linterRoot, linterTable, runLinter } from "../core/servers/linters.ts";
import { ServerManager } from "../core/servers/manager.ts";
import { atLeast, frontmatterFindings, lintProblems, noteProblems, type Problem, rootTypes, SEVERITIES, type Severity, syntaxProblems } from "../core/diagnostics.ts";
import { languageOf, serverTable } from "../core/servers/languages.ts";
import { rootFor } from "../core/servers/find.ts";
import { type Applied, applyPlan, loggedRenames, moveTarget, planFolderMove, planHeadingRename, planMakeVault, planNoteRename, planRelink, planUndo, planUnmakeVault, planVaultFolderMove, planVaultRename, RenameError, type RenamePlan } from "../core/rename.ts";
import { planConvert, urlPath } from "../core/convert.ts";
import { describeBreak, type MergeReview, MergeReviewError, reviewMerge } from "../core/mergereview.ts";
import { copyPath, emptyTrash, FileOpError, linksInto, listTrash, restorePath, type TrashItem, trashPath } from "../core/files.ts";
import { noteIndexed, readIdentity, vaultConfigFile } from "../core/registry.ts";
import { activityFile, AutoIndex, autoIndexFile, backgroundStatus, describeBackground } from "../core/autoindex.ts";
import { forgetPlan, listPlans, loadPlan, type SavedPlan, savePlan } from "../core/plans.ts";
import { type Scope, SCOPES, searchScoped } from "../core/scope.ts";
import { rootLabel, tildePath } from "../core/names.ts";
import { findVaultRoot, folderAt, hasMarker, homeFolder, initVault, isListed, isInside, isVaultRoot, locateVault, markersAt, setRootMarkers, readVaultVersion, recordLocation, rootAt, VaultError, type VaultLocation, configFilesFor } from "../core/vault.ts";
import { isTrusted, setTrustedRoots } from "../core/trust.ts";
import { type Args, flag, has, parseArgs, UsageError, VALUED } from "./args.ts";
import { VERSION } from "../version.ts";
import { RELEASE } from "../core/release.ts";
import { installedBy, uninstall, uninstallPlan } from "../core/install.ts";
import { upgrade as upgradeTo, UpgradeError } from "../core/update.ts";
import { notesOfType, ofType } from "../core/doctypes.ts";

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
  /** Which file set each setting taken (`links.style` → its file), for `info` (21.4). */
  readonly configOrigins: Record<string, string>;

  constructor(
    readonly args: Args,
    readonly loc: VaultLocation,
    readonly io: Io,
  ) {
    const loaded = loadConfig({ ...configFilesFor(loc), configFile: flag(args, "config") });
    this.config = loaded.config;
    this.configSources = loaded.sources;
    this.configOrigins = loaded.origins;
    this.warnings.push(...loaded.warnings);
    if (loc.note) this.warnings.push(loc.note);
    // An agent is working (20.9): the TUI's background auto-index waits a while.
    try {
      ensureDir(stateHome());
      writeFileSync(activityFile(), `${Date.now()}\n`);
    } catch {}
    // A named folder moved here by hand (21.8): its state came along — sure, so nothing asked; said once.
    const { carriedFrom } = recordLocation(loc);
    if (carriedFrom) {
      // The links its move broke, in and out of it (20.17): counted, for relink to fix — never the
      // pointers relink offers for links that still reach their file (21.7), as the TUI's offer counts.
      const broken = planRelink(openVault(loc.root), undefined, { pointers: false }).files.reduce((n, f) => n + f.edits.length, 0);
      const fix = broken ? ` — its move broke links on ${broken} line${broken === 1 ? "" : "s"}: slipbox relink fixes them (--dry-run shows how)` : "";
      this.warnings.push(`${rootLabel(loc)} moved here from ${carriedFrom}: its sessions, scratch, trash and reading positions came along${fix}`);
    }
  }

  get graph(): Graph {
    if (!this._graph) {
      this._graph = openGraph(this.loc, this.config, true, "lazy");
      // One process, one answer: an alias in a note not parsed yet still counts (17.7), and other
      // vaults are reached through the machine's list (17.8).
      this._graph.thorough = true;
      this._graph.reach = new Reach(this.loc);
      // A note this command made or removed sent links by name elsewhere: said, not silent.
      this._graph.onRetarget((rs) => this.warnings.push(...rs.map(retargetSaid)));
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

  private roots = new Map<string, { root: string | null; name: string | null }>();

  /**
   * The root a file is in, when it's another than this one, and that root's name (21.10): what JSON
   * says of a link's file, a backlink's, a hit's — `{root: null, name: null}` for this root's own
   * files, and for a file of no root.
   */
  rootOf(abs: string | null): { root: string | null; name: string | null } {
    const none = { root: null, name: null };
    if (!abs) return none;
    const root = findVaultRoot(abs);
    if (!root || root === this.loc.root) return none;
    let hit = this.roots.get(root);
    if (!hit) this.roots.set(root, (hit = { root, name: folderIdentity(root)?.name ?? null }));
    return hit;
  }
}

export const HELP = `slipbox ${VERSION} — terminal markdown notes, agent-drivable

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
  slipbox index --refresh [path]    bring a root's index up to date now — this one, or the one holding path
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
  slipbox write <note> [text]       write a note (atomic, in the root)  [--stdin] [--append [--paragraph]] [--create] [--if-unchanged <sha>] [--allow-empty]
  slipbox mkdir <path>              make a folder here (and its parents)
  slipbox mv <note|folder> <new-path>  rename or move a note or folder; links fixed wherever they're reached  [--dry-run] [--plan]
                                    <new-path> (and cp's path): from the root, or from here when ./ or ../, or absolute;
                                    for mv, a folder that's there, or a path ending in /, is moved into (its name kept)
  slipbox cp <note|folder> [path]   copy a note or folder (beside it, as name-copy, when no path)
  slipbox rm <note|folder>          delete to the trash (slipbox trash restore puts it back)  [--dry-run]
  slipbox trash [restore <item>]    what's in the trash, newest first; restore an item (its id or path)
  slipbox trash empty               what's in the trash, listed; removed for good with --yes (it keeps 30 days)  [--yes]
  slipbox name <new>                this folder's name, as a pointer names it: changed, the old kept; a repository given one
                                    [--dry-run] [--plan]
  slipbox folders [default <name> <path>]  the named folders: their copies, the one links open; or make one the one
  slipbox rename-heading <note> <heading> <new>  rename a heading; links to it fixed everywhere  [--dry-run] [--plan]
  slipbox relink [note]             rewrite links broken by a move slipbox saw, to where the file is  [--dry-run] [--plan]
  slipbox convert-links [note]      wikilinks and links from the root rewritten as relative paths  [--dry-run] [--plan]
  slipbox undo                      take back the last mv, name, rename-heading, relink, convert-links or replace --all here
                                    [--dry-run] [--plan]
  slipbox apply [plan]              write a plan --plan saved (refused if a file changed since); none: those waiting  [--dry-run]
  slipbox send <note>               open it in a running editor   [--line N] [--server <socket>]
  slipbox history                   notes read lately, newest first, and what's open
  slipbox export <note…>            notes as one document, beside the first by its name  [--to docx|pdf|html|epub|md] [--out|-o <path>]
  slipbox capture [text]            append to the scratch          [--ref path:L[-M] | path:L:C-D | path:L:C-M:D] [--snippet] [--stdin] [--lang L]
  slipbox scratch show|path|clear|copy                            [--if-unchanged <sha>]
  slipbox init [dir]                give <dir> a .slipbox/: settings, and a name with --name  [--name N] [--private] [--dry-run] [--plan]
  slipbox deinit <dir>              take a nested root's .slipbox/ away: a plain folder of the root holding it  [--dry-run] [--plan]
  slipbox info                      the root, its name and copies, its link convention, paths, versions, staleness
  slipbox doctor [file]             language servers and linters: each language's, found where, installed when needed, or missing
  slipbox diagnostics <file>        a file's problems: its servers', its linters', its syntax; a note's links and lint  [--severity S] [--timeout SECS]
  slipbox themes                    list themes
  slipbox types [type]              document types here (skill, adr, your [types]): how many notes each; a type's notes in order
  slipbox upgrade                   the latest release installed, checked before it's used  [--check: only say whether there's one]
  slipbox uninstall                 what the installer put here, listed; removed with --yes  [--purge: slipbox's folders too] [--yes]
  slipbox commands                  list named commands and their CLI equivalents

Global options:
  --root <dir>      the root to start from (default: the nearest folder above the path or cwd holding a root marker)
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
5 refused (--if-unchanged, a write outside the root or over an existing note, invalid UTF-8,
  a read of a symlink leading out of the root).
`;

export const CLI_COMMANDS = new Set([
  "render", "resolve", "link", "links", "backlinks", "name", "folders", "ls", "outline", "find", "replace", "task", "read", "stat", "write", "mkdir", "send", "history",
  "mv", "rename-heading", "relink", "convert-links", "undo", "context", "search", "index", "changed", "diff", "merge-review", "worktrees", "cp", "rm", "trash", "deinit", "tags", "footnotes", "problems",
  "capture", "scratch", "init", "info", "apply", "doctor", "diagnostics", "themes", "commands", "help", "export", "spell",
  "upgrade", "uninstall", "types",
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
    // Where roots are (21.1), and which may run their own code (23.x), are your config's to say,
    // `--config` included: read before finding one.
    const yours = loadConfig({ configFile: flag(args, "config") }).config;
    setRootMarkers(yours.walk.root_markers);
    setTrustedRoots(yours.trust.roots);
    // A file named by its pointer (21.10) is that file: its path from here on, so the command works in
    // its folder as it would with the path.
    const NOTE_FIRST = ["render", "export", "spell", "links", "backlinks", "outline", "footnotes", "replace", "task", "read", "stat", "write", "send", "mv", "rename-heading", "relink", "convert-links", "cp", "rm", "diff", "context"];
    // `replace --all` names no note: its first argument is what it finds.
    const noNote = command === "replace" && has(args, "all");
    const named = command === "context" ? rest.map((_, i) => i) : noNote ? [] : NOTE_FIRST.includes(command) || ["diagnostics", "doctor", "deinit", "index", "link"].includes(command) ? [0] : command === "find" ? [1] : [];
    for (const i of named) if (rest[i] !== undefined) rest[i] = vaultFormArg(rest[i]!, io.cwd);
    const from = flag(args, "from");
    if (from !== undefined) args.flags.set("from", vaultFormArg(from, io.cwd));
    // The note argument, when it names a file, also says which vault this is (resolve's is --from:
    // where the link is written; diagnostics' its file, whose root's checks it runs).
    const noteAt = noNote ? undefined : NOTE_FIRST.includes(command) || command === "diagnostics" ? rest[0] : command === "find" ? rest[1] : command === "resolve" ? flag(args, "from") : command === "link" ? (flag(args, "from") ?? rest[0]) : undefined;
    let pathArg = noteArgPath(noteAt, io.cwd, flag(args, "root"));
    // A nested vault's folder, moved, copied or deleted, is a folder of the vault holding it (18.7).
    if (pathArg && ["mv", "cp", "rm"].includes(command)) {
      const abs = isAbsolute(pathArg) ? pathArg : join(io.cwd, pathArg);
      if (isVaultRoot(abs) && findVaultRoot(dirname(abs))) pathArg = dirname(abs);
    }
    // init makes the vault: opening the folder as one first would name it before --name could.
    const loc = command === "init" ? folderAt(io.cwd) : locateVault({ root: flag(args, "root"), path: pathArg, cwd: io.cwd });
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

/** A promise's value, or `fallback` after `ms` — the timer cleared either way, so nothing waits on it after. */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((done) => (timer = setTimeout(() => done(fallback), ms)));
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** Arguments each command takes at most (`write` and `capture` take free text: no limit). */
const MAX_ARGS: Record<string, number> = {
  render: 1, resolve: 1, link: 1, links: 1, name: 1, folders: 3, backlinks: 1, ls: 0, outline: 1, find: 2, replace: 3, task: 2, read: 1, stat: 1, send: 1, history: 0,
  scratch: 1, init: 1, info: 0, apply: 1, index: 1, themes: 0, commands: 0, mkdir: 1, mv: 2, "rename-heading": 3, doctor: 1, diagnostics: 1, relink: 1, "convert-links": 1, cp: 2, rm: 1, trash: 2, deinit: 1, tags: 1, footnotes: 4, problems: 0, "merge-review": 1,
  changed: 0, diff: 1, worktrees: 0, undo: 0, spell: 1, upgrade: 0, uninstall: 0, types: 1,
};

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

/** The root's data and text files (not notes, not binary), with their group and format. */
function textFiles(s: Session): { path: string; group: string; format: string }[] {
  return s.graph
    .filePaths()
    .map((path) => ({ path, ...classify(path, s.config.walk.extensions) }))
    .filter((f) => f.group !== "binary")
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Flags every command takes, and each command's own. */
export const GLOBAL_FLAGS = new Set(["root", "config", "json", "color", "plain", "help", "version", "from"]);
export const FLAGS: Record<string, string[]> = {
  render: ["width", "theme", "glyphs"],
  export: ["to", "out"],
  links: ["all"],
  link: ["text", "style", "embed"],
  find: ["regex", "whole", "ignore-case", "files"],
  ls: ["files"],
  replace: ["regex", "whole", "ignore-case", "first", "first-per-line", "lines", "dry-run", "if-unchanged", "all", "files", "plan"],
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
    if (t?.status === "ambiguous") throw new CliError(`${arg}: ${t.reason}`, EXIT.ambiguous, { candidates: t.candidates });
    if (t?.status === "branch") throw new CliError(`${arg}: ${t.branch} isn't checked out here (slipbox resolve reads it from git)`, EXIT.notFound);
    throw new CliError(`${arg}: ${t?.reason ?? "not a pointer"}`, EXIT.notFound);
  }
  if (existsSync(isAbsolute(arg) ? arg : join(cwd, arg))) return arg;
  // `research:x.md` (20.20's form, removed in 21.12): no file — its pointer said, when a folder has that name.
  const m = /^([^:/\s]+):(?!\/\/)(.+)$/.exec(arg);
  if (m && lookupFolder(m[1]!).status !== "unknown") throw new CliError(`${arg} names a folder the old way: slipbox://${m[1]}/${m[2]} names it`, EXIT.notFound);
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

/** A link sent elsewhere by a note coming or going, for people. */
export function retargetSaid(r: Retarget): string {
  return `${r.from}:${r.line}: [[${r.target}]] reached ${r.was}; it reaches ${r.now} now`;
}

/**
 * Resolve a note argument to a root-relative path, or fail with exit 3/4. `parse` is false for
 * commands that need only the file's bytes: a big note the walk leaves out is then never parsed.
 */
function resolveNote(s: Session, arg: string, parse = true): string {
  const rel = findNoteArg(s, arg, parse);
  // Reading follows the vault's rule too: a symlink pointing out of it is not a note of it (the
  // walk leaves it out), so naming it by path reads nothing from outside.
  if (!landsInside(s.loc.root, join(s.loc.root, rel))) throw new CliError(`${rel} points outside the root; not reading it`, EXIT.refused);
  return rel;
}

function findNoteArg(s: Session, arg: string, parse: boolean): string {
  // The file that said which vault this is: only the argument naming it (context takes several).
  const root = flag(s.args, "root");
  // Named from here, or from --root (`noteArgPath`): the file that said which root this is.
  if (s.loc.file && isInside(s.loc.root, s.loc.file) && (resolve(s.io.cwd, arg) === s.loc.file || (root && resolve(s.io.cwd, root, arg) === s.loc.file))) {
    const rel = relative(s.loc.root, s.loc.file);
    if (s.graph.notes.has(rel)) return rel;
    // An existing file the walk leaves out: named, it's reached (20.8) — git-ignored or under a
    // hidden folder, it's indexed from now on, as the TUI does; under node_modules, excluded by
    // walk.exclude, it's read without joining the vault.
    // The argument names s.loc.file (from here or from --root): whether it exists is that file's.
    if (arg && existsSync(s.loc.file)) {
      // A data or text file is itself (16.4): never parsed as a note.
      if (!s.graph.reachFile(rel, { keep: true }) && parse && classify(rel, s.config.walk.extensions).group === "note") s.graph.adopt(rel);
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
      const l = s.graph.nearestNamed(arg, from.path);
      if (l.status === "resolved") return l.path;
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
  /**
   * Notes exported as one document (10.x): a chapter each, in the order given; to `--out` (`-o`), else beside the first
   * with its name; in `--to`'s format, else `--out`'s extension's, else Word's.
   */
  async export(s, rest) {
    if (!rest.length) throw new UsageError("export needs a note: slipbox export <note…> [--to docx|pdf|html|epub|md] [--out|-o <path>]");
    const rels = rest.map((r) => resolveNote(s, r));
    const out = flag(s.args, "out");
    const name = flag(s.args, "to") ?? (out && extname(out) ? extname(out) : "docx");
    const format = formatFor(name);
    if (!format) throw new UsageError(`--to must be one of: ${FORMATS.map((f) => f.name).join(", ")}`);
    let target: string;
    try {
      target = exportTarget(s.graph, rels[0]!, format, out ?? null, s.io.cwd);
    } catch (err) {
      throw new CliError((err as Error).message, EXIT.refused);
    }
    const written = await exportNotes(s.graph, rels, format, target);
    const files = writeExport(target, written).map((f) => s.graph.shownPath(f));
    const shown = s.graph.shownPath(target);
    const beside = files.length ? `, ${files.length} file${files.length === 1 ? "" : "s"} beside it` : "";
    return { data: { path: shown, format: format.name, notes: rels, bytes: written.data.length, files }, human: `exported ${rels.length === 1 ? rels[0] : `${rels.length} notes`} to ${shown} (${format.title})${beside}\n` };
  },
  async render(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    const abs = s.graph.abs(rel);
    const decoded = readText(abs);
    // A Mermaid diagram is drawn (12.10): its library loaded first, as the TUI's arrives on its own.
    if (/^ {0,3}(`{3,}|~{3,})\s*mermaid\s*$/im.test(decoded.text)) await loadMermaid();
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

  /**
   * A link to a note or file, as slipbox writes one where `--from` is (21.5): the root's convention
   * (21.4) — `--style` the one already chosen — a note's title its text, a file's name.
   */
  link(s, rest) {
    const arg = requireArg(rest, "note");
    const g = s.graph;
    const fromRel = flag(s.args, "from") ? resolveNote(s, flag(s.args, "from")!) : null;
    // No --from: as from a note at the root.
    const fromAbs = fromRel ? g.abs(fromRel) : join(s.loc.root, ".link.md");
    const file = resolve(s.io.cwd, arg);
    const isFile = existsSync(file) && statSync(file).isFile();
    // A file by its path — not a note, or one out of this root, a root nested in it included (a
    // pointer, 21.7); a note here as any command takes one (its path, its name).
    const byPath = isFile && (classify(file, s.config.walk.extensions).group !== "note" || !isInside(s.loc.root, file) || (findVaultRoot(file) ?? s.loc.root) !== s.loc.root);
    // A note here the walk leaves out (git-ignored, under a hidden folder): named, it's reached (20.8),
    // as the note that says which root this is would be — with --from, that's the other note.
    // One the walk never takes (under node_modules, walk.exclude) isn't reached: it goes by its path.
    let reached = true;
    if (isFile && !byPath) {
      const rel = relative(s.loc.root, file).split(sep).join("/");
      if (!g.notes.has(rel)) reached = g.reachFile(rel, { keep: true });
    }
    const toAbs = byPath || (isFile && !reached) ? file : g.abs(resolveNote(s, arg));
    const style = flag(s.args, "style");
    if (style !== undefined && style !== "markdown" && style !== "wiki") throw new UsageError(`--style is markdown or wiki (got ${style})`);
    const c = conventionOf(g, s.config, s.configOrigins, style as LinkStyle | undefined);
    const ends = linkEnds(g, fromAbs, toAbs);
    // Its title, from its own root's index when it's another's.
    const title = ends.to.note ? (g.entryAnywhere(ends.to.rel ?? toAbs)?.title ?? "") : "";
    const text = flag(s.args, "text") ?? (c.style.value === "wiki" && !ends.pointer ? "" : title || basename(toAbs).replace(/\.(md|markdown)$/i, ""));
    const link = writeLink(c, c.style.value, ends, text, has(s.args, "embed"));
    // A pointer by a private name, or by a name different folders share: said (D74, D83).
    s.warnings.push(...linkWarnings(ends));
    return {
      data: { link, path: ends.to.rel ?? toAbs, from: fromRel, style: c.style.value, pathForm: c.path.value, extension: c.extension.value },
      human: `${link}\n`,
    };
  },

  resolve(s, rest) {
    const raw = requireArg(rest, "link");
    // A markdown link, [text](target), given whole: its target, resolved as `links` and the TUI do.
    const mdLink = /^!?\[[^\]]*\]\(\s*<?([^>)]*?)>?\s*\)$/.exec(raw);
    const inner = mdLink ? mdLink[1]! : raw;
    // A path, `#heading` after it, as in a link.
    const hash = inner.indexOf("#");
    let parts = { target: decodeURIComponentSafe(hash < 0 ? inner : inner.slice(0, hash)), heading: hash < 0 ? null : decodeURIComponentSafe(inner.slice(hash + 1)) || null };
    const fromArg = flag(s.args, "from");
    const from = fromArg ? resolveNote(s, fromArg) : null;
    let status: string;
    let path: string | null = null;
    let candidates: string[] = [];
    let found: Target | null = null;
    // A wikilink (21.3): `[[target#heading|alias]]`, read within the root as `links` and the TUI read it.
    const wiki = /^(!?)\[\[([^\]|#]*)(?:#([^\]|]*))?(?:\|[^\]]*)?\]\]$/.exec(raw);
    const bracketed = /^!?\[\[/.test(raw);
    if (wiki) parts = { target: wiki[2]!.trim(), heading: wiki[3]?.trim() || null };
    // A file:// URL names a file (17.16), a slipbox:// pointer a named folder's (21.7): resolved, not external.
    const fileUrl = /^file:\/\//i.test(inner);
    const pointer = isPointer(inner);
    // This repository's hosting (`https://github.com/me/repo/blob/main/x.md`): the file here, not a URL to copy.
    const hosted = /^https?:\/\//i.test(inner) && s.graph.resolveLink({ kind: "markdown", target: inner }, fromArg ? resolveNote(s, fromArg) : "").via === "hosting";
    // A folder named the old way (`research:x.md`, 21.12): no link, its pointer said (21.11).
    const old = bracketed || fileUrl || pointer || hosted ? null : s.graph.oldForm(inner);
    // A scheme makes it external, with no spaces (a URL has none) and when no note is named so:
    // "Meeting: Q3" is a note.
    const external = /^[a-z][a-z0-9+.-]*:/i.test(inner) && !fileUrl && !pointer && !hosted && !old && (!!mdLink || (/^\S*$/.test(inner) && s.graph.findNote(parts.target, s.io.cwd).status === "unresolved"));
    if (bracketed) {
      const w = s.graph.resolveLink({ kind: wiki?.[1] ? "embed" : "wiki", target: parts.target }, from ?? "");
      status = w.resolvedKind === "note" || w.resolvedKind === "file" || w.resolvedKind === "anchor" ? "resolved" : w.resolvedKind === "ambiguous" ? "ambiguous" : "unresolved";
      path = status === "resolved" ? w.path : null;
      candidates = w.candidates;
      found = w;
    } else if (old) {
      status = "unresolved";
      found = old;
    } else if (external) {
      status = "external";
      path = inner;
    } else if (!parts.target && from) {
      status = "resolved";
      path = from;
    } else if (from || mdLink || pointer || hosted) {
      // A link written in --from (or at the vault's root): its path — the resolver `links` and the
      // TUI use, so `resolve` is link.follow's CLI equivalent.
      const md = s.graph.resolveLink({ kind: "markdown", target: inner }, from ?? "");
      status = md.resolvedKind === "note" || md.resolvedKind === "file" || md.resolvedKind === "folder" ? "resolved" : md.resolvedKind === "ambiguous" ? "ambiguous" : "unresolved";
      path = status === "resolved" ? md.path : null;
      candidates = md.candidates;
      found = md;
    } else {
      // No --from: the note a command would name — a path, from here or the vault's root, or its name.
      const r = s.graph.findNote(parts.target, s.io.cwd);
      if (r.status !== "unresolved") {
        status = r.status;
        path = r.path;
        candidates = r.candidates;
      } else {
        const md = s.graph.resolveLink({ kind: "markdown", target: inner }, "");
        status = md.resolvedKind === "note" || md.resolvedKind === "file" || md.resolvedKind === "folder" ? "resolved" : "unresolved";
        path = status === "resolved" ? md.path : null;
        found = md;
      }
    }
    let line: number | null = null;
    // The heading's fragment as a link writes it (its id, or GitHub's numbered slug).
    let fragment: string | null = null;
    const entry = path && parts.heading && status === "resolved" ? s.graph.entryAnywhere(path) : undefined;
    if (entry) {
      const hit = findHeading(entry.headings, entry.anchors ?? [], parts.heading!, bracketed);
      line = hit?.line ?? null;
      if (hit) fragment = hit.anchor ?? (hit.heading !== null ? headingFragment(entry.headings, hit.heading) : null);
    }
    const abs = path && status !== "external" ? (isAbsolute(path) ? path : s.graph.abs(path)) : null;
    // With --from, the link to write there (20.20): the relative path, as a link carries it.
    const href = abs && from ? `${urlPath(relative(dirname(s.graph.abs(from)), abs).split(sep).join("/"))}${parts.heading ? `#${fragment ?? slugify(parts.heading)}` : ""}` : null;
    const data = { link: raw, status, path, abs, shown: abs ? s.graph.shownPath(abs) : null, href, heading: parts.heading, line, candidates, ...s.rootOf(abs), reason: found?.reason ?? null, how: found?.via ?? found?.how ?? null, certainty: found ? certainty(found) : status === "resolved" ? "exact" : status, ...(found?.gitRef ? { git: found.gitRef } : {}), ...(found?.suggest ? { suggest: found.suggest } : {}) };
    if (status === "ambiguous") throw new CliError(`ambiguous link "${raw}"${data.reason ? ` (${data.reason})` : ""}: ${candidates.join(", ")}`, EXIT.ambiguous, data);
    if (status === "unresolved") throw new CliError(`unresolved link "${raw}"${data.reason ? `: ${data.reason}` : ""}`, EXIT.notFound, data);
    return { data, human: `${abs ?? path}${line ? `:${line}` : ""}\n` };
  },

  async links(s, rest) {
    // --all: every note's links in one call (a vault-wide check for broken ones), each with `from`.
    const all = has(s.args, "all");
    if (all && rest.length) throw new UsageError("links takes a note or --all, not both");
    const notes = all ? (s.graph.ensureAll(), [...s.graph.notes.keys()].sort()) : [resolveNote(s, requireArg(rest, "note"))];
    if (!all) await s.graph.loadGrammars(); // a code file's links are in its comments (16.10)
    // Each link's file as shown (21.9): its path from this root, else from home, else absolute.
    const links = notes.flatMap((from) => s.graph.linksOf(from).map((l) => ({ ...l, from, shown: l.path ? s.graph.shownPath(isAbsolute(l.path) ? l.path : s.graph.abs(l.path)) : null })));
    const human = links
      .map((l) => {
        const where = `${all ? `${l.from}:` : ""}${l.line}:${l.column}`.padEnd(8);
        const dest =
          l.resolvedKind === "unresolved"
            ? `UNRESOLVED${l.reason ? ` (${l.reason})` : ""}`
            : l.resolvedKind === "ambiguous"
              ? `AMBIGUOUS (${l.candidates.join(", ")})`
              : `${l.shown ?? ""}${describeLanding(l) ? ` (${describeLanding(l)})` : ""}`;
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
        end: l.end,
        status: l.resolvedKind,
        path: l.path,
        shown: l.shown,
        candidates: l.candidates,
        // Another root's file: that root, and its name (21.10).
        ...s.rootOf(l.path ? (isAbsolute(l.path) ? l.path : s.graph.abs(l.path)) : null),
        reason: l.reason ?? null,
        // How it landed, and how sure that is (exact, inferred, ambiguous, broken).
        how: l.via ?? l.how ?? null,
        certainty: certainty(l),
      })),
      human,
    };
  },

  async problems(s) {
    // What's wrong in the vault (1.7, 9.5): links that reach nothing, or more than one note; notes
    // nothing links to.
    const p = s.graph.problems();
    const shown = (x: LinkProblem) => `${x.from}:${x.line}:${x.column}  ${x.kind === "wiki" || x.kind === "embed" ? `[[${x.target}]]` : x.target}`;
    const human: string[] = [
      `broken links (${p.broken.length})`,
      ...p.broken.map((x) => `  ${shown(x)}${x.reason ? `  — ${x.reason}` : ""}`),
      `ambiguous links (${p.ambiguous.length})`,
      ...p.ambiguous.map((x) => `  ${shown(x)}  — ${x.candidates.join(", ")}`),
      // Won by where they're written: a note of the name nearer would take them.
      `fragile links (${p.fragile.length})`,
      ...p.fragile.map((x) => `  ${shown(x)}  — ${x.reason}; [[${x.fix}]] names it for sure`),
      `orphans (${p.orphans.length})`,
      ...p.orphans.map((x) => `  ${x}`),
    ];
    // A merge's conflicts (5.12): the files git says are unmerged, at their first marker.
    const c = checkoutOf(s.loc.root);
    const status = c ? statusOf(c) : null;
    const conflicts = [...(status ?? [])]
      .filter(([, st]) => st === "conflict")
      .map(([p]) => inVault(c!, s.loc.root, p))
      .filter((p): p is string => p !== null)
      .map((path) => ({ path, line: conflictLine(join(s.loc.root, path)) }));
    if (conflicts.length) human.push(`conflicts (${conflicts.length})`, ...conflicts.map((x) => `  ${x.path}:${x.line}`));
    // --lint (3.21): your linter's findings too — markdownlint-cli2 with your config, as the TUI runs it.
    let lint: (Omit<LintIssue, "file"> & { file: string })[] | undefined;
    if (has(s.args, "lint")) {
      const cmd = lintCommand(s.config.lint, s.loc.root, undefined, s.config.lsp.auto_install);
      const files = [...s.graph.notes.keys()].filter((rel) => /\.(md|markdown)$/i.test(rel)).sort().map((rel) => s.graph.abs(rel));
      const found: LintIssue[] = [];
      let ran = !!cmd;
      for (let i = 0; cmd && ran && i < files.length; i += 300) {
        const got = await runLint(cmd, files.slice(i, i + 300), s.loc.root, undefined, (text) => s.io.err(`${text}\n`));
        if (got === null) ran = false;
        else found.push(...got);
      }
      if (!cmd) s.warnings.push(s.config.lint.enabled === "off" ? 'lint is off: [lint] enabled = "off"' : 'lint is off: no markdownlint config (~/.markdownlint-cli2.jsonc, or the folder\'s) and [lint] enabled isn\'t "on"');
      else if (!ran) s.warnings.push(`lint: ${lintFailure(s.config)}`);
      else {
        lint = found.map((x) => ({ ...x, file: relative(s.loc.root, x.file) }));
        human.push(`lint (${lint.length})`, ...lint.map((x) => `  ${x.file}:${x.line}${x.column ? `:${x.column}` : ""}  ${x.rule} ${x.name}  ${x.description}`));
      }
    }
    // Frontmatter that breaks its document type's rules (22.2): a key missing, of another kind, a value not allowed.
    const frontmatter = frontmatterFindings(s.graph).flatMap((f) => f.problems.map((x) => ({ path: f.path, line: x.start.line, message: x.message })));
    if (frontmatter.length) human.push(`frontmatter (${frontmatter.length})`, ...frontmatter.map((x) => `  ${x.path}:${x.line}  ${x.message}`));
    return { data: { broken: p.broken, ambiguous: p.ambiguous, fragile: p.fragile, orphans: p.orphans, conflicts, frontmatter, ...(lint ? { lint } : {}) }, human: `${human.join("\n")}\n` };
  },

  tags(s, rest) {
    // A tag's notes — its nested tags' too (1.6) — or every tag with its count.
    const want = rest[0];
    if (want !== undefined) {
      const t = s.graph.tagged(want);
      if (!t) throw new CliError(`no note has #${want.replace(/^#/, "")}`, EXIT.notFound);
      return { data: t, human: t.notes.map((n) => `${n}\n`).join("") };
    }
    const tags = s.graph.tags();
    return { data: tags, human: tags.map((t) => `${String(t.count).padStart(4)}  #${t.tag}\n`).join("") };
  },

  // Git (5.11–5.14): what this branch changed against the base, a note's diff, the worktrees.
  changed(s) {
    const c = checkoutFor(s);
    const base = baseFor(s, c);
    const r = changedSince(c, base);
    if (!r) throw new CliError("git couldn't say what changed", 1);
    const files = r.files
      .map((f) => ({ path: inVault(c, s.loc.root, f.path), state: f.state, ...(f.from ? { from: inVault(c, s.loc.root, f.from) ?? f.from } : {}) }))
      .filter((f): f is typeof f & { path: string } => f.path !== null);
    const human = files.map((f) => `${STATE_LETTER[f.state]} ${f.path}${f.from ? `  (from ${f.from})` : ""}\n`).join("");
    return { data: { base, mergeBase: r.mergeBase, files }, human: human || `nothing changed against ${base}\n` };
  },

  "merge-review"(s, rest) {
    // Before a merge (20.21): the links git's tentative result would break, the working tree untouched.
    const from = requireArg(rest, "branch to merge");
    const c = checkoutFor(s);
    let r: MergeReview;
    try {
      r = reviewMerge(c, s.loc.root, from, flag(s.args, "into") ?? "HEAD");
    } catch (err) {
      if (err instanceof MergeReviewError) throw new CliError(err.message, /^no branch or commit/.test(err.message) ? EXIT.notFound : EXIT.error);
      throw err;
    }
    const n = r.breaks.length;
    const human = [
      `merging ${r.from} into ${r.into}: ${n ? `${n} link${n === 1 ? "" : "s"} would break` : "no link would break"}${r.conflicts.length ? `; git can't merge ${r.conflicts.length} file${r.conflicts.length === 1 ? "" : "s"} (${r.conflicts.join(", ")})` : ""}`,
      ...r.breaks.map((b) => `  ${b.path}:${b.line}:${b.column}  ${b.target} — ${describeBreak(b)}`),
    ];
    return { data: r, human: `${human.join("\n")}\n` };
  },

  diff(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"), false);
    const c = checkoutFor(s);
    const base = baseFor(s, c);
    const mergeBase = mergeBaseOf(c, base);
    if (!mergeBase) throw new CliError(`this branch and ${base} have no commit in common`, EXIT.notFound);
    const before = showAt(c, mergeBase, inCheckout(c, s.loc.root, rel));
    const now = readText(s.graph.abs(rel)).text;
    const rows = diffRows(before ?? "", now);
    const human = rows.map((r) => (r.kind === "@@" ? `@@ ${r.text}` : `${r.kind} ${sanitize(r.text)}`)).join("\n");
    return { data: { path: rel, base, mergeBase, new: before === null, rows }, human: rows.length ? `${human}\n` : `no differences from ${base}\n` };
  },

  worktrees(s) {
    const c = checkoutFor(s);
    const list = worktreeList(c);
    if (!list) throw new CliError("git couldn't list the worktrees", 1);
    const data = list.map((w) => ({ ...w, root: join(w.path, relative(c.root, s.loc.root)), current: w.path === c.root }));
    return { data, human: data.map((w) => `${w.current ? "*" : " "} ${w.branch ?? `(${w.head?.slice(0, 7) ?? "detached"})`}  ${w.path}${w.main ? "  (main)" : ""}\n`).join("") };
  },

  // Search (6.x): ranked by the words, from the index (caught up first) or a scan of the files.
  search(s, rest) {
    if (!rest.length) throw new UsageError("missing what to search for (search <words…>)");
    const query = rest.join(" ");
    const limit = wholeFlag(s, "limit", 20, 1, 500);
    // By root (20.16, 21.10): here by default, so an agent's results are predictable; linked, all.
    let scope = (flag(s.args, "scope") ?? "here") as Scope;
    if ((scope as string) === "vault") {
      s.warnings.push("--scope vault is --scope here now (21.10)");
      scope = "here";
    }
    if (!SCOPES.includes(scope)) throw new UsageError(`--scope takes ${SCOPES.join(", ")}`);
    const idx = searchIndex(s);
    try {
      const r = searchScoped(s.graph, idx, query, scope, { limit });
      if (r.relaxed) s.warnings.push("no note has every word: these have some of them");
      const mark = (h: { snippet: string; marks: [number, number][] }) => {
        let out = "";
        let at = 0;
        for (const [a, b] of h.marks) {
          out += `${h.snippet.slice(at, a)}[${h.snippet.slice(a, b)}]`;
          at = b;
        }
        return sanitize(out + h.snippet.slice(at));
      };
      const human = r.hits.map((h) => `${h.shown}:${h.line}:${h.column}  ${h.heading ? `${sanitize(h.heading)} — ` : ""}${mark(h)}${h.more ? `  (+${h.more} more)` : ""}\n`).join("");
      // Each hit's root: another's by its path and name (21.10).
      const hits = r.hits.map(({ vault: _, ...h }) => ({ ...h, ...s.rootOf(h.abs) }));
      return { data: { query, scope, engine: r.engine, relaxed: r.relaxed, roots: r.vaults, hits }, human };
    } finally {
      idx?.close();
    }
  },

  index(s, rest) {
    // A vault's index brought up to date now (20.10) — this one, or the one holding a path: every
    // file's size and time checked, every folder listed again; any vault, opened or not.
    if (has(s.args, "refresh")) {
      const at = rest[0] ? (isAbsolute(rest[0]) ? rest[0] : join(s.io.cwd, rest[0])) : s.loc.root;
      if (!existsSync(at)) throw new CliError(`no such file or folder: ${rest[0]}`, EXIT.notFound);
      const vault = findVaultRoot(at);
      // Outside every vault: the plain folder it's in, or this one's (20.22) — its own index.
      const loc = vault ? rootAt(vault) : !rest[0] ? s.loc : folderAt(statSync(at).isDirectory() ? at : dirname(at));
      if (isListed(loc)) throw new CliError(`${loc.root} is listed a folder at a time, never indexed (the background index walks it: slipbox index --home)`, EXIT.refused);
      const root = loc.root;
      recordLocation(loc); // known on this machine from now on, as reaching it would make it (17.6)
      const t = performance.now();
      const g = new Graph(loc, loadConfig({ ...configFilesFor(loc), configFile: flag(s.args, "config") }).config).build(true, "all");
      noteIndexed(loc.key);
      const ms = Math.round(performance.now() - t);
      const st = g.stats;
      return {
        data: { root, notes: st.notes, changed: st.parsed, unchanged: st.cached, gone: st.gone, reached: g.reached.size, indexed: g.indexedAt()?.toISOString() ?? null, ms },
        human: `refreshed ${root}: ${st.notes} note${st.notes === 1 ? "" : "s"} — ${st.parsed} read again, ${st.gone} gone (${ms} ms)\n`,
      };
    }
    // A path names what --refresh brings up to date; otherwise it would be dropped, the root indexed.
    if (rest[0] !== undefined) throw new UsageError("index takes a path only with --refresh");
    // The background auto-index of the home folder (20.9), run here in the foreground: a pass, or as
    // much as --budget allows; where it is, either way.
    if (has(s.args, "home")) {
      const budget = Number(flag(s.args, "budget") ?? 0);
      if (!(budget >= 0)) throw new UsageError("--budget takes milliseconds (0: the whole pass)");
      // --rebuild: a new pass now, whatever was done.
      if (has(s.args, "rebuild")) rmSync(autoIndexFile(), { force: true });
      const job = new AutoIndex(homeFolder());
      const t = performance.now();
      while (job.step(budget ? Math.max(1, budget - (performance.now() - t)) : 200) && (!budget || performance.now() - t < budget)) {}
      const p = job.status;
      const done = !!p.passFinished;
      return {
        data: { root: p.root, found: p.found, indexed: p.indexed, left: p.queue.length + (p.current ? 1 : 0), finished: p.passFinished, started: p.passStarted },
        human: `home folder ${p.root}: ${p.found} root${p.found === 1 ? "" : "s"} found, ${p.indexed} indexed${done ? ` — pass done ${p.passFinished!.slice(0, 16).replace("T", " ")}` : ` — ${p.queue.length} folder${p.queue.length === 1 ? "" : "s"} left`}\n`,
      };
    }
    if (isListed(s.loc)) throw new CliError(`${s.loc.root} is listed a folder at a time, never indexed (the background index walks it: slipbox index --home)`, EXIT.refused);
    const idx = SearchIndex.open(s.loc);
    if (!idx) throw new CliError("the search index can't be opened", 1);
    try {
      const t = performance.now();
      if (has(s.args, "rebuild")) idx.clear();
      const r = catchUp(s.graph, idx);
      const st = idx.stats();
      const ms = Math.round(performance.now() - t);
      return {
        data: { path: idx.file, rebuilt: has(s.args, "rebuild"), indexed: r.indexed, removed: r.removed, files: st.files, ms },
        human: `search index: ${st.files} files — ${r.indexed} indexed, ${r.removed} removed (${ms} ms)\n`,
      };
    } finally {
      idx.close();
    }
  },

  // The context bundle (9.7): the notes, what they link to and what links to them, as one document.
  async context(s, rest) {
    if (!rest.length) throw new UsageError("missing a note (context <note>…)");
    const start = [...new Set(rest.map((r) => resolveNote(s, r)))];
    const num = (name: string, fallback: number, lo: number, hi: number) => wholeFlag(s, name, fallback, lo, hi);
    const opts = { depth: num("depth", s.config.context.depth, 0, 5), backlinks: s.config.context.backlinks && !has(s.args, "no-backlinks"), limit: num("limit", s.config.context.limit, 1, 500) };
    await s.graph.loadGrammars(); // code files link from their comments (16.10): backlinks too
    const b = buildContext(s.graph, start, opts);
    const files = b.items.map(({ text: _, ...i }) => i);
    const data = { start, ...opts, files, left: b.left, chars: b.text.length, text: b.text };
    if (!has(s.args, "copy")) return { data, human: b.text };
    const r = copyText(b.text, { fallbackDir: stateDir(s.loc) });
    const how = r.file ? `wrote ${r.file}` : `copied via ${r.methods.join(" + ")}${r.confirmed ? "" : " (OSC 52 is unconfirmed)"}`;
    return { data: { ...data, copied: r }, human: `${how}: ${b.items.length} file${b.items.length === 1 ? "" : "s"}, ${b.text.length} chars\n` };
  },

  async backlinks(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    await s.graph.loadGrammars(); // code files link from their comments (16.10)
    // Each from as shown (21.9): its path from this root, else from home, else absolute.
    const bl = s.graph.backlinks(rel).map(({ vault: _, ...b }) => {
      const from = isAbsolute(b.from) ? b.from : s.graph.abs(b.from);
      return { ...b, ...s.rootOf(from), shown: s.graph.shownPath(from) };
    });
    return { data: { path: rel, backlinks: bl }, human: bl.map((b) => `${b.shown}:${b.line}  ${b.text}\n`).join("") };
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

  footnotes(s, rest) {
    // A note's footnotes (3.17), as the TUI's footnotes view shows them; and adding and changing
    // them (3.18), as its keys do — written as `task` writes, `--if-unchanged` honoured.
    const rel = resolveNote(s, requireArg(rest, "note"));
    if (!s.graph.notes.has(rel)) throw new CliError(`${rel} isn't a note: only notes have footnotes`, EXIT.refused);
    const abs = s.graph.abs(rel);
    const sub = rest[1];
    const file = readNoteFile(s, abs, sub !== undefined);
    const text = file.text.replace(/\r\n/g, "\n");
    const list = footnotesOf(parseNoteFile(rel, text));
    const where = (f: Footnote) => (f.line === null ? "no definition" : `L${f.line}`);
    const refs = (f: Footnote) => (f.references.length ? f.references.map((r) => `L${r.line}:${r.column}`).join(" ") : "unused");
    if (sub === undefined) return { data: { path: rel, sha: file.sha, footnotes: list }, human: list.map((f) => `[${f.label}]  ${where(f)}  ${f.text ?? ""}  ← ${refs(f)}\n`).join("") };
    const named = (label: string | undefined) => {
      if (!label) throw new UsageError(`footnotes ${sub} needs the footnote's label`);
      const f = list.find((x) => x.id === label.replace(/^\[\^|\]$/g, "").toLowerCase());
      if (!f) throw new CliError(`no footnote [^${label}] in ${rel}`, EXIT.notFound);
      return f;
    };
    let edits: TextEdit[];
    let done: string;
    try {
      if (sub === "add") {
        const m = /^(\d+)(?::(\d+))?$/.exec(rest[2] ?? "");
        if (!m || rest[3] === undefined) throw new UsageError("footnotes <note> add <line[:col]> <text>");
        const starts = [0];
        for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
        const line = Number(m[1]);
        if (line < 1 || line > starts.length) throw new UsageError(`${rel} has no line ${line}`);
        const lineText = text.slice(starts[line - 1], (starts[line] ?? text.length + 1) - 1);
        // At the column given (1-based), else the line's end (before trailing spaces).
        const at = starts[line - 1]! + (m[2] ? Math.min(Number(m[2]) - 1, lineText.length) : lineText.replace(/\s+$/, "").length);
        const r = addFootnote(text, list, at, rest[3]);
        edits = r.edits;
        done = `added footnote [^${r.label}]`;
      } else if (sub === "edit") {
        const f = named(rest[2]);
        if (rest[3] === undefined) throw new UsageError("footnotes <note> edit <label> <text>");
        edits = editFootnote(text, f, rest[3]);
        done = `edited footnote [^${f.label}]`;
      } else if (sub === "rm") {
        const f = named(rest[2]);
        edits = deleteFootnote(text, f);
        done = `deleted footnote [^${f.label}]`;
      } else if (sub === "rename") {
        const f = named(rest[2]);
        if (!rest[3]) throw new UsageError("footnotes <note> rename <label> <new-label>");
        edits = renameFootnote(text, f, list, rest[3].replace(/^\[\^|\]$/g, ""));
        done = `renamed footnote [^${f.label}] → [^${rest[3]}]`;
      } else throw new UsageError(`footnotes: unknown subcommand ${sub} (add, edit, rm, rename)`);
    } catch (err) {
      if (err instanceof UsageError || err instanceof CliError) throw err;
      throw new CliError((err as Error).message, EXIT.refused);
    }
    checkWritable(s, abs);
    const next = applyEdits(text, edits);
    const out = (file.bom ? "\ufeff" : "") + (file.crlf ? next.replace(/\n/g, "\r\n") : next);
    try {
      writeNote(s.loc.root, abs, out);
    } catch (err) {
      if (err instanceof WriteRefused) throw new CliError(err.message, EXIT.refused);
      throw err;
    }
    const sha = createHash("sha256").update(Buffer.from(out, "utf8")).digest("hex").slice(0, 16);
    return { data: { path: rel, sha, footnotes: footnotesOf(parseNoteFile(rel, next)) }, human: `${done}\n` };
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
      tree.delete();
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

  async init(s, rest) {
    const dir = rest[0] ?? flag(s.args, "root") ?? s.io.cwd;
    const name = flag(s.args, "name");
    if (name === "") throw new UsageError("--name needs a name");
    // A folder inside a vault (18.11): a vault of its own, the links that would stop reaching
    // across the new boundary fixed.
    const abs = dir.startsWith("/") ? dir : join(s.io.cwd, dir);
    const holder = existsSync(abs) && !isVaultRoot(abs) ? findVaultRoot(dirname(abs)) : null;
    if (holder) {
      const parent = openVault(holder);
      const rel = relative(holder, abs);
      const res = await renameResult(s, () => planMakeVault(parent, rel, name ?? null, { private: has(s.args, "private") }), parent);
      // As init says it of any folder: the root, its name and id when it was given one — and what changed.
      const d = res.data as { dryRun: boolean };
      return { ...res, data: { ...d, root: abs, name: name ?? null, id: d.dryRun ? null : readIdentity(vaultConfigFile(abs)).id, created: !d.dryRun } };
    }
    // A .slipbox/ made is no edit a saved plan holds (20.18): refused, nothing written.
    if (has(s.args, "plan")) throw new UsageError("making a .slipbox/ has no edits to plan: --dry-run previews it (--plan is for a folder inside a root)");
    if (has(s.args, "dry-run")) return { data: { root: abs, dryRun: true }, human: `would give ${abs} a .slipbox/${name ? ` called ${name}` : ""}\n` };
    let r;
    try {
      r = initVault(dir.startsWith("/") ? dir : `${s.io.cwd}/${dir}`, name, { private: has(s.args, "private") });
    } catch (err) {
      if (err instanceof VaultError) throw new CliError(err.message, EXIT.refused);
      throw err;
    }
    const called = r.name ? ` — called ${r.name}: slipbox://${r.name}/… names it` : "";
    const human = r.created ? `created ${r.root}/.slipbox/${called}\n` : r.identified ? `${r.root} has its .slipbox/; named it${called}\n` : `${r.root} has its .slipbox/ already${called}\n`;
    return { data: r, human: r.excluded ? `${human}kept out of git: listed in ${r.excluded}\n` : human };
  },

  deinit(s, rest) {
    const dir = requireArg(rest, "folder");
    const abs = dir.startsWith("/") ? dir : join(s.io.cwd, dir);
    if (!hasMarker(abs)) throw new CliError(`${abs} has no .slipbox/ to take away${markersAt(abs).length ? ` (it's a root by its ${markersAt(abs).join(", ")})` : ""}`, EXIT.refused);
    const holder = findVaultRoot(dirname(abs));
    if (!holder) throw new CliError(`${abs} isn't in another root: only a root nested in another becomes a plain folder (of the root holding it)`, EXIT.refused);
    const parent = openVault(holder);
    return renameResult(s, () => planUnmakeVault(parent, relative(holder, abs)), parent);
  },

  mv(s, rest) {
    const what = requireArg(rest, "note or folder");
    const to = destArg(s, rest[1], true);
    if (!to) throw new UsageError("missing the new path (mv <note|folder> <new-path>)");
    // A folder moves with everything in it, every link to any of it fixed (18.3).
    const dir = folderArg(s, what);
    // A vault nested in this one moves as a vault (18.7): links into it by path fixed, its id kept.
    // Into a folder that's there, or named with a `/` (DF-D4): the name kept.
    if (dir !== null && isVaultRoot(join(s.loc.root, dir))) return renameResult(s, () => planVaultFolderMove(s.graph, dir, moveTarget(s.graph, dir, to)));
    if (dir !== null) return renameResult(s, () => planFolderMove(s.graph, dir, moveTarget(s.graph, dir, to)));
    const rel = resolveNote(s, what, false);
    return renameResult(s, () => planNoteRename(s.graph, rel, moveTarget(s.graph, rel, to)));
  },

  cp(s, rest) {
    const what = requireArg(rest, "note or folder");
    const rel = folderArg(s, what) ?? resolveNote(s, what, false);
    try {
      const r = copyPath(s.graph, rel, destArg(s, rest[1]));
      return { data: r, human: `copied ${r.from} → ${r.to}\n` };
    } catch (err) {
      if (err instanceof FileOpError) throw new CliError(err.message, EXIT.refused);
      throw err;
    }
  },

  rm(s, rest) {
    const what = requireArg(rest, "note or folder");
    const rel = folderArg(s, what) ?? resolveNote(s, what, false);
    const breaking = linksInto(s.graph, rel);
    if (breaking) s.warnings.push(`${breaking} link${breaking === 1 ? "" : "s"} from other notes to ${rel} will break`);
    if (has(s.args, "dry-run")) return { data: { path: rel, dryRun: true, breaking, trashed: null }, human: `would delete ${rel} to the trash\n` };
    try {
      const item = trashPath(s.graph, s.loc, rel);
      return { data: { path: rel, dryRun: false, breaking, trashed: item }, human: `deleted ${rel} to the trash (slipbox trash restore ${item.id})\n` };
    } catch (err) {
      if (err instanceof FileOpError) throw new CliError(err.message, EXIT.refused);
      throw err;
    }
  },

  trash(s, rest) {
    const sub = rest[0] ?? "list";
    const row = (i: TrashItem) => `${i.at.slice(0, 16).replace("T", " ")}  ${i.shown}${i.dir ? "/" : ""}  (${i.id})\n`;
    const yes = has(s.args, "yes");
    if (yes && sub !== "empty") throw new UsageError("--yes is for trash empty");
    if (sub === "list") {
      const items = listTrash(s.loc);
      return { data: items, human: items.length ? items.map(row).join("") : "the trash is empty\n" };
    }
    // Emptied for good (DF-D14): listed first, as uninstall lists; removed only with --yes.
    if (sub === "empty") {
      if (rest[1] !== undefined) throw new UsageError("trash empty takes no item: it empties the whole trash");
      const items = yes ? emptyTrash(s.loc) : listTrash(s.loc);
      const n = `${items.length} item${items.length === 1 ? "" : "s"}`;
      const human = !items.length
        ? "the trash is empty\n"
        : yes
          ? `removed for good, ${n}:\n${items.map((i) => `  ${row(i)}`).join("")}`
          : `removes for good, ${n}:\n${items.map((i) => `  ${row(i)}`).join("")}nothing removed yet: again with --yes to remove these\n`;
      return { data: { removed: yes && items.length > 0, items }, human };
    }
    if (sub !== "restore") throw new UsageError(`trash: unknown subcommand ${sub} (list, restore <item>, empty)`);
    const which = rest[1];
    if (!which) throw new UsageError("trash restore needs an item: its id or its path (slipbox trash lists them)");
    try {
      const item = restorePath(s.graph, s.loc, which);
      return { data: item, human: `restored ${item.shown}\n` };
    } catch (err) {
      if (err instanceof FileOpError) throw new CliError(err.message, err.message.startsWith("nothing") ? EXIT.notFound : EXIT.refused);
      throw err;
    }
  },

  /**
   * This root's name (21.10): a `.slipbox/` folder's changed — its old one kept, so pointers by it still
   * find it (the relink rewrites them) — a repository's given a `.slipbox/` to hold one. A name a
   * different folder has here is refused.
   */
  async name(s, rest) {
    const name = requireArg(rest, "the folder's new name");
    if (s.loc.mode === "folder") throw new CliError(`${s.loc.root} has no root to name: slipbox init makes one`, EXIT.refused);
    const ident = folderIdentity(s.loc.root);
    const taken = readFolders().find((f) => f.key !== ident?.key && f.name.toLowerCase() === name.toLowerCase());
    if (taken) throw new CliError(`a different folder is called ${name}, at ${taken.default ?? taken.copies[0]?.path}: pick another`, EXIT.refused);
    if (hasMarker(s.loc.root)) {
      const r = await renameResult(s, () => planVaultRename(s.loc, name));
      if (!has(s.args, "dry-run") && !has(s.args, "plan")) recordLocation(rootAt(s.loc.root));
      return r;
    }
    // A .slipbox/ made is no edit a saved plan holds (20.18): refused, nothing written.
    if (has(s.args, "plan")) throw new UsageError(`${s.loc.root} has no .slipbox/: making one has no edits to plan (--dry-run previews it)`);
    if (has(s.args, "dry-run")) return { data: { root: s.loc.root, name, dryRun: true }, human: `would give ${s.loc.root} a .slipbox/ named ${name}\n` };
    const r = initVault(s.loc.root, name);
    recordLocation(rootAt(s.loc.root));
    return { data: { root: r.root, name: r.name, id: r.id, created: r.created }, human: `${r.root} is named ${r.name} (.slipbox/ made to hold it)\n` };
  },

  /**
   * The named folders this machine knows (21.6, 21.10): each name, its copies, the one links open;
   * `default <name> <path>` makes that copy the one.
   */
  folders(s, rest) {
    const list = readFolders();
    if (rest[0] === "default") {
      const [, name, at] = rest;
      if (!name || !at) throw new UsageError("folders default takes a name and the copy's path");
      const l = lookupFolder(name, list);
      if (l.status === "ambiguous") throw new CliError(`${name}: ${l.reason}`, EXIT.ambiguous, { candidates: l.candidates });
      if (l.status === "unknown") throw new CliError(l.reason, EXIT.notFound);
      const path = resolve(s.io.cwd, at);
      if (!l.folder.copies.some((c) => c.path === path)) throw new CliError(`${path} isn't a copy of ${l.folder.name}: ${l.folder.copies.map((c) => c.path).join(", ")}`, EXIT.refused);
      setDefaultCopy(l.folder.key, path);
      return { data: { name: l.folder.name, default: path }, human: `links to ${l.folder.name} open ${tildePath(path)}\n` };
    }
    if (rest.length) throw new UsageError("folders takes nothing, or default <name> <path>");
    const data = list.map((f) => ({
      name: f.name,
      pointer: pointerName(f, list),
      remote: f.remote,
      id: f.id,
      private: f.private,
      aliases: f.aliases,
      old: f.old,
      default: f.default,
      copies: f.copies.map((c) => ({ path: c.path, seen: c.seen, found: !!c.found, available: copyAvailable(c.path) })),
    }));
    const human = data
      .map((f) => [`${f.pointer}${f.pointer !== f.name ? ` (${f.name})` : ""}${f.remote && f.pointer !== f.remote ? `  ${f.remote}` : ""}${f.private ? "  private" : ""}`, ...f.copies.map((c) => `  ${c.path === f.default ? "*" : " "} ${tildePath(c.path)}${c.available ? "" : "  (not here)"}${c.found ? "  (found)" : ""}`)].join("\n"))
      .join("\n");
    return { data, human: human ? `${human}\n` : "no named folders yet: a .slipbox/ name, or a repository's remote, names one\n" };
  },

  "rename-heading"(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"), false);
    const [, heading, to] = rest;
    if (heading === undefined || to === undefined) throw new UsageError("rename-heading takes the note, the heading and its new name");
    return renameResult(s, () => planHeadingRename(s.graph, rel, heading, to));
  },

  relink(s, rest) {
    const rels = rest[0] ? [resolveNote(s, rest[0])] : undefined;
    return renameResult(s, () => planRelink(s.graph, rels));
  },

  // The converter (20.1): wikilinks, and links from the vault's root, made relative paths — a note's,
  // or every note's. What it can't decide is left as written, and said.
  "convert-links"(s, rest) {
    const rels = rest[0] ? [resolveNote(s, rest[0])] : undefined;
    return renameResult(s, () => planConvert(s.graph, rels));
  },

  async undo(s) {
    // Nothing to undo here (none at all, or only another branch's): said as planUndo says it, exit 3.
    if (!loggedRenames(s.graph).length) {
      try {
        planUndo(s.graph);
      } catch (err) {
        throw new CliError((err as Error).message, EXIT.notFound);
      }
    }
    // A folder's rename taken back: the machine's list learns its name again.
    return relearnRenamedRoots(s, await renameResult(s, () => planUndo(s.graph)));
  },

  // A plan saved by --plan (20.18), applied: refused, nothing written, when any of its files changed
  // since it was made. --dry-run shows it, and says whether it's still good. With no id, the plans
  // waiting, newest first.
  async apply(s, rest) {
    if (!rest[0]) {
      const waiting = listPlans();
      return {
        data: waiting.map((p) => ({ id: p.id, made: p.made, root: p.root, command: p.command, kind: p.plan.kind, from: p.plan.from, to: p.plan.to, files: p.plan.files.length })),
        human: waiting.map((p) => `${p.id}  ${p.made.slice(0, 16).replace("T", " ")}  ${p.command} ${p.plan.from}${p.plan.to ? ` → ${p.plan.to}` : ""}  (${p.plan.files.length} file${p.plan.files.length === 1 ? "" : "s"}, ${p.root})\n`).join("") || "no plans waiting\n",
      };
    }
    const saved = loadPlan(rest[0]);
    if (!saved) throw new CliError(`no plan ${rest[0]} (slipbox apply lists those waiting)`, EXIT.notFound);
    const g = openVault(saved.root);
    const stale = saved.plan.files.filter((f) => {
      try {
        return readText(f.abs).text !== f.text;
      } catch {
        return true;
      }
    });
    if (has(s.args, "dry-run")) {
      if (stale.length) s.warnings.push(`stale: ${stale.map((f) => f.shown).join(", ")} changed since it was planned — applying it would be refused`);
      return renameResult(s, () => saved.plan, g);
    }
    // A saved `name` applied: the machine's list learns the new name, as `name` itself teaches it.
    const r = relearnRenamedRoots(s, await renameResult(s, () => saved.plan, g));
    forgetPlan(saved.id);
    return r;
  },

  // Language servers (19.7) and linters (19.19): each language's, and where each is; for a file, the
  // ones serving it.
  doctor(s, rest) {
    const table = serverTable(s.config["language-server"], s.config.language);
    const linters = linterTable(s.config.linter);
    const auto = s.config.lsp.auto_install;
    const home = homedir();
    const short = (p: string) => (p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p);
    const line = (r: ServerReport) => {
      const what =
        r.status === "found"
          ? `${r.where}  ${short(r.path!)}${r.behind !== undefined ? ` — not from the lockfile slipbox ships (${r.behind ?? "?"} installed, ${r.package} pinned): ${auto ? "installed again when it's next needed" : "installing is off ([lsp] auto_install)"}` : ""}`
          : r.status === "installable"
            ? `not found: slipbox installs ${r.package} when it's first needed`
            : r.package
              ? `not found, and installing is off ([lsp] auto_install): ${r.package}`
              : `not found: ${r.hint ?? "install it, or name it in [language-server]"}`;
      const role = r.role === "add-on" ? `  (where the project has ${r.requires!.slice(0, 2).join(" or ")}…)` : "";
      return `  ${r.name.padEnd(28)} ${what}${role}\n`;
    };
    const lintLine = (r: LinterReport) => {
      const what = r.path ? `${r.where}  ${short(r.path)}` : `not found: ${r.hint ?? `${r.program}, on your PATH or the project's`}`;
      const at = r.root === undefined ? (r.required ? `  (where the project has ${r.markers.slice(0, 2).join(" or ")}…)` : "") : r.root === null ? "  (not run: the project has no config for it)" : `  (runs in ${short(r.root)})`;
      return `  ${`${r.name} (linter)`.padEnd(28)} ${what}${at}\n`;
    };
    // A root you don't trust (23.x): what runs there is yours, never the folder's; said, with what it limits.
    const untrusted = (root: string, limits: string[]) => {
      s.warnings.push(`${short(root)} isn't a root you trust: nothing of its own runs — not its programs, its settings that name one, or the code its servers and git would run${limits.length ? ` (here: ${limits.join("; ")})` : ""}; slipbox asks whether you trust it when that matters (or :trust there), and [trust] roots in your config can list it`);
      if (!gitGuardsAttributes()) s.warnings.push("git is older than 2.42: in a root you don't trust, the filters its attributes name can still run — git 2.42 or later stops them");
    };
    if (rest[0]) {
      const abs = isAbsolute(rest[0]) ? rest[0] : join(s.io.cwd, rest[0]);
      const f = doctorFile(table, linters, abs, auto);
      if (!f) throw new CliError(`${rest[0]}: slipbox serves no language of it`, EXIT.notFound);
      if (!f.trusted) untrusted(f.root, f.limits);
      const skipped = f.skipped.map((k) => `  ${k.name.padEnd(28)} not run here: ${k.why}\n`);
      const human = [`${rest[0]}: ${f.language}, its project ${short(f.root)}${f.trusted ? " (a root you trust)" : ""}\n`, ...f.run.map(line), ...skipped, ...f.linters.map(lintLine), ...(f.missing.length ? ["missing:\n", ...f.missing.map(line)] : [])].join("");
      return { data: f, human };
    }
    const groups = doctor(table, linters, s.io.cwd, auto);
    if (!isTrusted(s.io.cwd)) untrusted(s.io.cwd, []);
    if (!s.config.lsp.enabled) s.warnings.push("language servers are off: [lsp] enabled = false");
    return { data: groups, human: groups.map((g) => `${g.languages.join(", ")}\n${g.servers.map(line).join("")}${g.linters.map(lintLine).join("")}`).join("") };
  },

  // A file's problems from every source (19.22), for agents and scripts: its language servers' — started,
  // told the file, waited for until each has spoken and gone quiet — its linters' (19.19), its syntax
  // errors when no server answered, and a vault note's own and the lint surface's. Exit 1 on an error.
  async diagnostics(s, rest) {
    const arg = requireArg(rest, "file");
    // From here, else from --root (`noteArgPath`).
    const root = flag(s.args, "root");
    const abs = [resolve(s.io.cwd, arg), root ? resolve(s.io.cwd, root, arg) : null].find((p) => p && existsSync(p));
    if (!abs) throw new CliError(`${arg}: no such file`, EXIT.notFound);
    const min = (flag(s.args, "severity") ?? s.config.diagnostics.severity) as Severity;
    if (!SEVERITIES.includes(min)) throw new UsageError(`--severity takes ${SEVERITIES.join(", ")}`);
    const seconds = Number(flag(s.args, "timeout") ?? 60);
    if (!(seconds > 0)) throw new UsageError("--timeout takes seconds, more than 0");
    const text = readText(abs).text;
    const table = serverTable(s.config["language-server"], s.config.language);
    const lang = languageOf(table, abs);
    const problems: Problem[] = [];
    const sources: { name: string; kind: "server" | "linter" | "syntax" | "slipbox" | "lint"; status: string }[] = [];
    // Its servers: each heard once, then quiet for a while — a server says what it finds in stages.
    let answered = 0;
    if (lang && s.config.lsp.enabled) {
      const heard = new Map<string, Problem[]>();
      let news = Date.now();
      // Yours alone, for a root you don't trust (23.3): no folder's settings reach its servers.
      const yours = loadConfig({ configFile: flag(s.args, "config") }).config;
      const m = new ServerManager({
        table: () => table,
        userTable: () => serverTable(yours["language-server"], yours.language),
        autoInstall: () => s.config.lsp.auto_install,
        problems: (path, server, _v, list) => {
          if (path !== abs) return;
          heard.set(server, list);
          news = Date.now();
        },
        message: (_level, text) => s.io.err(`${text}\n`),
      });
      const deadline = Date.now() + seconds * 1000;
      m.open(abs, 1, text);
      const running = await within(m.started(abs, "diagnostics"), seconds * 1000, [] as string[]);
      // A server still at some work it said it began (rust-analyzer loading its workspace: its first word is
      // empty) is news too: its quiet counts from when the work ends, and what it says after.
      while (Date.now() < deadline && !(running.every((n) => heard.has(n)) && Date.now() - news >= 750)) {
        if (m.busy(abs)) news = Date.now();
        await Bun.sleep(50);
      }
      for (const name of running) sources.push({ name, kind: "server", status: heard.has(name) ? "answered" : "silent" });
      for (const [name, list] of heard) problems.push(...list), answered++;
      await within(m.stopAll(), 3000, undefined);
      m.killAll();
    }
    // Its linters without a server, where its project asks for them.
    const linters = linterTable(s.config.linter);
    for (const def of (lang?.linters ?? []).map((n) => linters[n]).filter((d) => !!d?.command)) {
      const root = linterRoot(def!, abs, rootFor(abs, lang!.roots));
      if (!root) {
        sources.push({ name: def!.name, kind: "linter", status: "not asked" });
        continue;
      }
      const r = s.config.lint.enabled === "off" ? null : await runLinter(def!, abs, text, root);
      if (r && "problems" in r) problems.push(...r.problems);
      sources.push({ name: def!.name, kind: "linter", status: r === null ? "off" : "problems" in r ? "ran" : r.failed });
    }
    // Its syntax errors, when no server has spoken for the text (a server has them then).
    const kind = classify(abs, s.config.walk.extensions);
    const g = kind.group === "text" ? grammarFor(kind.format, extensionOf(abs)) : null;
    if (g && !answered) {
      const loaded = await grammar(g);
      const tree = loaded ? parseSyntax(loaded, text) : null;
      if (tree) {
        problems.push(...syntaxProblems(tree.errors()));
        tree.delete();
        sources.push({ name: "tree-sitter", kind: "syntax", status: "ran" });
      }
    }
    // A vault note: its links and conflicts, and the lint surface's findings. One the walk leaves out
    // (git-ignored, under a hidden folder) is reached, named, as findNoteArg reaches it (20.8).
    const rel = relative(s.loc.root, abs).split(sep).join("/");
    if (kind.group === "note" && !climbsOut(rel) && (s.graph.notes.has(rel) || s.graph.reachFile(rel, { keep: true })) && s.graph.notes.has(rel)) {
      problems.push(...noteProblems(s.graph, rel));
      sources.push({ name: "slipbox", kind: "slipbox", status: "ran" });
      const cmd = lintCommand(s.config.lint, s.loc.root, undefined, s.config.lsp.auto_install);
      if (cmd) {
        const issues = await runLint(cmd, [abs], s.loc.root, undefined, (t) => s.io.err(`${t}\n`));
        if (issues) problems.push(...lintProblems(issues.filter((i) => i.file === abs)));
        sources.push({ name: "markdownlint", kind: "lint", status: issues ? "ran" : "failed" });
      }
    }
    for (const src of sources) if (["silent", "missing", "timeout", "error", "failed"].includes(src.status)) s.warnings.push(`${src.name}: ${src.status === "silent" ? `said nothing in ${seconds} s` : src.status === "missing" ? "not installed" : `couldn't run (${src.status})`}`);
    if (!lang && kind.group !== "note") s.warnings.push(`${arg}: slipbox knows no language of it — slipbox doctor`);
    const shown = problems
      .filter((p) => atLeast(p.severity, min))
      .sort((a, b) => a.start.line - b.start.line || a.start.column - b.start.column || SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
    const human = shown.map((p) => `${arg}:${p.start.line}:${p.start.column}: ${p.severity} ${p.source}${p.code ? ` ${p.code}` : ""}: ${p.message.replace(/\s*\n\s*/g, " ")}\n`).join("");
    return {
      data: { path: abs, language: lang?.name ?? null, problems: shown.map((p) => ({ line: p.start.line, column: p.start.column, endLine: p.end.line, endColumn: p.end.column, severity: p.severity, source: p.source, code: p.code, message: p.message })), sources },
      human,
      code: shown.some((p) => p.severity === "error") ? EXIT.error : EXIT.ok,
    };
  },

  info(s) {
    const g = s.graph;
    const scratch = scratchLocation(s.loc, s.config);
    // Its name, as a pointer names it (21.6): the lookup's copies, the one links open.
    const ident = s.loc.mode === "vault" ? folderIdentity(s.loc.root) : null;
    const known = readFolders();
    const named = ident ? known.find((f) => f.key === ident.key) : undefined;
    const folder = ident
      ? {
          name: ident.name,
          pointer: pointerName({ key: ident.key, name: ident.name, remote: ident.remote }, known),
          remote: ident.remote,
          id: ident.id,
          private: ident.private,
          copies: (named?.copies ?? []).map((c) => ({ path: c.path, seen: c.seen, here: c.path === ident.copy, available: copyAvailable(c.path) })),
          default: named?.default ?? null,
        }
      : null;
    const data = {
      version: VERSION,
      // A release build's repository and platform (14.2); null: run from source, or built by hand.
      release: RELEASE,
      // The root (21.10): its path — a plain folder opened, that folder's — and its name, when it has one.
      root: s.loc.root,
      mode: s.loc.mode,
      name: s.loc.name,
      // What its cache and state are kept by (21.8): its path's key.
      key: s.loc.key,
      markerVersion: s.loc.mode === "vault" ? readVaultVersion(s.loc.root) : null,
      config: { user: flag(s.args, "config") ?? s.io.env.SLIPBOX_CONFIG ?? userConfigFile(), sources: s.configSources, theme: s.config.theme },
      cache: cacheDir(s.loc),
      state: stateDir(s.loc),
      scratch: scratch.path,
      notes: g.notes.size,
      index: { ...g.stats, written: g.indexedAt()?.toISOString() ?? null, reached: g.reached.size },
      // The background auto-index of the home folder (20.9): where it is.
      background: backgroundStatus(s.config),
      search: searchInfo(s),
      skipped: g.skipped,
      folder,
      // How the links slipbox makes here look, each part with what said it (21.4).
      links: conventionOf(g, s.config, s.configOrigins),
      stale: s.stale(),
    };
    const human = [
      `slipbox   ${VERSION}${RELEASE ? ` (${RELEASE.target}, released from ${RELEASE.repo})` : ""}`,
      `root      ${data.root} (${data.mode}${data.markerVersion ? `, marker v${data.markerVersion}` : ""})`,
      folder
        ? `name      ${folder.pointer}${folder.pointer !== folder.name ? ` (${folder.name} is another's too)` : ""}${folder.private ? ", private: this machine's only" : ""}${folder.copies.length > 1 ? ` — ${folder.copies.length} copies, links open ${tildePath(folder.default ?? "")}` : ""}`
        : `name      none — ${s.loc.mode === "folder" ? "no root" : "no remote and no .slipbox/ name"}: linked to by relative path`,
      `notes     ${data.notes} (parsed ${g.stats.parsed}, cached ${g.stats.cached}, ${g.stats.ms.toFixed(0)} ms)`,
      `index     ${data.index.written ? `written ${data.index.written.slice(0, 16).replace("T", " ")}` : "not written yet"}${g.reached.size ? `, ${g.reached.size} reached outside the walk` : ""}`,
      `home      ${describeBackground(data.background)}`,
      `links     ${describeConvention(data.links)}`,
      `theme     ${data.config.theme}`,
      `config    ${data.config.sources.length ? data.config.sources.join(", then ") : `none (${data.config.user} doesn't exist)`}`,
      `cache     ${data.cache}`,
      `search    ${data.search.engine}${data.search.index ? ` — index: ${data.search.index.files} files${data.search.index.complete ? "" : " (being built)"}` : " — no index"}`,
      `state     ${data.state}`,
      `scratch   ${data.scratch}`,
      ...g.skipped.map((x) => `skipped   ${x.rel} — ${x.reason}`),
      ...(folder?.copies ?? []).filter((c) => !c.here).map((c) => `copy      ${tildePath(c.path)}${c.available ? "" : " (not here)"}`),
      "",
    ].join("\n");
    return { data, human };
  },

  // A release moved to the latest one (14.4), as the installer would; with --check, only told whether there is one.
  // The installer's install only: one run from source, or put there another way, is said so.
  async upgrade(s) {
    if (!RELEASE) throw new CliError("this slipbox runs from source (or was built by hand): it has no releases to follow — update its checkout", EXIT.error);
    try {
      const r = await upgradeTo({ release: RELEASE, version: VERSION, data: dataHome(), execPath: process.execPath, env: s.io.env, check: has(s.args, "check") });
      const human =
        r.status === "current"
          ? `slipbox ${r.from} is the latest\n`
          : r.status === "available"
            ? `slipbox ${r.latest} is out (this is ${r.from}): slipbox upgrade installs it\n`
            : `slipbox ${r.from} → ${r.latest}; ${r.from} is kept, to go back to${r.removed.length ? ` (${r.removed.join(", ")} removed)` : ""}\n`;
      return { data: r, human };
    } catch (err) {
      if (err instanceof UpgradeError) throw new CliError(err.message, EXIT.error);
      throw err;
    }
  },

  // What the installer put here (14.8) — with --purge, slipbox's four folders too — listed, every path; removed only
  // with --yes. Notes, and the .slipbox/ folders in them, are never touched.
  uninstall(s) {
    const purge = has(s.args, "purge");
    const yes = has(s.args, "yes");
    const plan = uninstallPlan(purge, undefined, installedBy(process.execPath, dataHome(), VERSION));
    const failed = yes ? uninstall(plan) : [];
    const width = Math.max(0, ...[...plan.remove, ...plan.keep].map((i) => tildePath(i.path).length));
    const row = (i: { path: string; what: string }) => `  ${tildePath(i.path).padEnd(width)}  ${i.what}\n`;
    const human = [
      plan.remove.length ? `${yes ? "removed" : "removes"}:\n${plan.remove.map(row).join("")}` : "nothing of slipbox's to remove here\n",
      plan.keep.length ? `keeps${purge ? "" : " (--purge removes them too)"}:\n${plan.keep.map(row).join("")}` : "",
      ...plan.notes.map((n) => `${n}\n`),
      "never touches your notes, nor the .slipbox/ folders in them\n",
      !yes && plan.remove.length ? "nothing removed yet: again with --yes to remove these\n" : "",
      ...failed.map((f) => `couldn't remove ${f}\n`),
    ].join("");
    return { data: { purge, removed: yes && plan.remove.length > 0 && !failed.length, remove: plan.remove, keep: plan.keep, notes: plan.notes, failed }, human, code: failed.length ? EXIT.error : EXIT.ok };
  },

  // Document types (22.3): each with how many notes are of it here and how many break its rules (22.2); or a type's
  // notes, by number then path — each its title, its status, and what supersedes it.
  types(s, rest) {
    const types = rootTypes(s.graph);
    const notes = [...s.graph.notes.entries()].map(([path, e]) => ({ path, title: e.title ?? "" }));
    const want = rest[0];
    if (want !== undefined) {
      const t = types.find((x) => x.name === want);
      if (!t) throw new CliError(`no document type "${want}" here: slipbox types lists them`, EXIT.notFound);
      s.graph.ensureAll();
      const list = notesOfType(t, [...s.graph.notes.entries()].map(([path, e]) => ({ path, title: e.title ?? "" })), (rel) => s.graph.textOf(rel));
      const width = Math.max(0, ...list.map((n) => (n.number === null ? 0 : String(n.number).length)));
      const human = list.map((n) => `${n.number === null ? " ".repeat(width) : String(n.number).padStart(width)}${width ? "  " : ""}${n.path}${n.title ? `  ${n.title}` : ""}${n.status ? `  (${n.status}${n.supersededBy ? ` → ${n.supersededBy}` : ""})` : ""}\n`).join("");
      return { data: { name: t.name, source: t.source, paths: t.paths, notes: list }, human: human || `no ${t.name} notes here (${t.paths.join(", ")})\n` };
    }
    const findings = frontmatterFindings(s.graph);
    const data = types.map((t) => ({ name: t.name, source: t.source, paths: t.paths, notes: notes.filter((n) => ofType(n.path, t)).length, problems: findings.filter((f) => ofType(f.path, t)).length }));
    const width = Math.max(0, ...data.map((t) => t.name.length));
    return { data, human: data.map((t) => `${t.name.padEnd(width)}  ${t.notes} note${t.notes === 1 ? "" : "s"}${t.problems ? `, ${t.problems} breaking its rules` : ""}  (${t.source}: ${t.paths.join(", ")})\n`).join("") };
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

  // Spelling (25.6): a note's misspelt words, by line and column (code points, as find's), with --suggest what each
  // might be; --add puts a word in your own list, which the TUI's z g writes too.
  async spell(s, rest) {
    const add = flag(s.args, "add");
    if (add !== undefined) {
      if (rest.length || has(s.args, "suggest") || flag(s.args, "lang") !== undefined) throw new UsageError("spell --add takes the word alone");
      const word = add.trim();
      if (!word || /\s/.test(word)) throw new UsageError("--add takes one word");
      addOwnWord(word);
      return { data: { added: word, file: ownWordsFile() }, human: `"${word}" added to your words (${ownWordsFile()})\n` };
    }
    const rel = resolveNote(s, requireArg(rest, "note"), false);
    if (classify(rel, s.config.walk.extensions).group !== "note") throw new UsageError(`${rel} isn't a note: spelling checks a note's prose`);
    const text = readText(s.graph.abs(rel)).text;
    const parsed = parseMarkdown(text);
    const given = flag(s.args, "lang");
    const languages = given !== undefined ? given.split(",").map((l) => l.trim()).filter(Boolean) : noteLanguages(parsed.frontmatter?.data, s.config.spell.languages);
    const spellers: Speller[] = [];
    const missing: string[] = [];
    for (const lang of languages) {
      const files = dictionaryFiles(lang, s.config.spell.dictionaries);
      if (files) spellers.push(await openSpeller(files));
      else missing.push(lang);
    }
    if (missing.length) s.warnings.push(`no dictionary for ${missing.join(", ")} — [spell] dictionaries can name yours`);
    const checker = new Checker(spellers);
    const starts = lineStarts(text);
    const words = checker.misspelt(proseWords(parsed.tree, text)).map((w) => ({
      line: w.line,
      column: [...text.slice(starts[w.line - 1]!, w.from)].length + 1,
      word: w.word,
      ...(has(s.args, "suggest") ? { suggestions: checker.suggest(w.word) } : {}),
    }));
    return {
      data: { path: rel, languages, missing, words },
      human: words.map((w) => `${rel}:${w.line}:${w.column}: ${w.word}${w.suggestions ? ` → ${w.suggestions.join(", ") || "(none)"}` : ""}\n`).join(""),
    };
  },

  replace(s, rest) {
    if (has(s.args, "all")) return replaceAll(s, rest);
    if (has(s.args, "files") || has(s.args, "plan")) throw new UsageError("--files and --plan go with --all: replace in every note");
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
    // Its properties (3.19): the frontmatter as parsed, as the TUI's Info view shows it.
    const fm = s.graph.notes.has(rel) ? parseNoteFile(rel, file.text).frontmatter : null;
    const data = {
      path: rel,
      abs,
      // Its root (21.10): the path, and the name when it has one.
      root: s.loc.mode === "folder" ? null : s.loc.root,
      name: s.loc.name,
      properties: fm?.data ?? null,
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
      ["root", s.loc.mode === "folder" ? `none (the folder ${tildePath(s.loc.root)})` : rootLabel(s.loc)],
      ["title", data.title ?? "—"],
      ["tags", data.tags.join(", ") || "—"],
      ...Object.entries(data.properties ?? {}).map(([k, v]): [string, string] => [`  ${k}`, typeof v === "object" ? JSON.stringify(v) : String(v)]),
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
    if (!isInside(s.loc.root, abs) || !landsInside(s.loc.root, abs)) throw new CliError(`${arg} is outside the root (${s.loc.root})`, EXIT.refused);
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
      if (!isInside(s.loc.root, abs) || !landsInside(s.loc.root, abs)) throw new CliError(`${noteArg} is outside the root (${s.loc.root})`, EXIT.refused);
      rel = relative(s.loc.root, abs);
      checkWritable(s, abs);
      if (existsSync(abs)) throw new CliError(`${rel} already exists; not overwriting it (drop --create to write it)`, EXIT.refused, { path: rel });
      created = true;
      // A name other notes have: a command naming it by that name now needs a path (links are paths, 20.2).
      const name = rel.replace(/\.(md|markdown)$/i, "").split("/").pop()!;
      const same = s.graph.findNote(name, s.loc.root);
      shadows = same.status === "resolved" ? [same.path] : same.status === "ambiguous" ? same.candidates : [];
      if (shadows.length) s.warnings.push(`${rel}: other notes are named "${name}" (${shadows.join(", ")}); naming it in a command takes a path now`);
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
    // Reading positions are kept by file, for the machine (21.8): this root's, and those read from it.
    const read = new PositionStore(s.loc)
      .entries()
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .map((p) => ({ path: p.key, at: p.at, line: p.line, exists: existsSync(isAbsolute(p.key) ? p.key : join(s.loc.root, p.key)) }));
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
 * What a writer (`write`, `replace`, `task`) may change: a note, data or text file of the root
 * (never a binary one, 16.4), inside it by its real path, and where the walk lists files — never
 * `.slipbox/`, `.git/`, a hidden folder the root hasn't reached, or `node_modules`. Refused, exit 5.
 */
function checkWritable(s: Session, abs: string): void {
  const refuse = (why: string) => {
    throw new CliError(`${relative(s.io.cwd, abs) || abs}: ${why}; not writing it`, EXIT.refused);
  };
  if (!isInside(s.loc.root, abs) || !landsInside(s.loc.root, abs)) refuse(`outside the root (${s.loc.root})`);
  const rel = relative(s.loc.root, abs);
  // Notes, data and text files are written (16.4); binary files never are.
  if (classify(rel, s.config.walk.extensions).group === "binary") refuse("a binary file");
  // A hidden folder's note the vault has reached (20.8) is the vault's like any other; .git and
  // .slipbox never are, nor node_modules.
  if (rel.split("/").some((part) => part.startsWith(".") || part === "node_modules") && !s.graph.reached.has(rel)) refuse("in a folder the walk doesn't list");
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

/** The vault's git checkout, for the git commands (5.11–5.14); refused outside one (exit 3). */
function checkoutFor(s: Session): Checkout {
  const c = checkoutOf(s.loc.root);
  if (!c) throw new CliError(`${s.loc.root} isn't in a git repository`, EXIT.notFound);
  return c;
}

/** The base branch: `--base`, else `[git] base`, else main or master (exit 3 when there's none). */
function baseFor(s: Session, c: Checkout): string {
  const asked = flag(s.args, "base") ?? s.config.git.base;
  const base = baseBranch(c, asked);
  if (!base) throw new CliError(asked ? `no branch or commit "${asked}" in the repository` : "no base branch: neither main nor master is there — --base <ref>, or [git] base", EXIT.notFound);
  return base;
}

/** A file's state as one letter: what the explorer marks it with. */
const STATE_LETTER: Record<GitState, string> = { new: "+", modified: "M", renamed: "R", deleted: "D", conflict: "!" };

/** The first line of a file with a merge's conflict marker, or 0. */
function conflictLine(abs: string): number {
  try {
    const i = readText(abs).text.split(/\r?\n/).findIndex((l) => /^<{7}( |$)/.test(l));
    return i + 1;
  } catch {
    return 0;
  }
}

/** Which search engine answers here, and the index's size when there is one (`info`). */
function searchInfo(s: Session): { engine: string; index: { files: number; complete: boolean } | null } {
  if (isListed(s.loc) || s.config.search.engine === "scan" || !SearchIndex.exists(s.loc)) return { engine: s.config.search.engine, index: null };
  const idx = SearchIndex.open(s.loc);
  if (!idx) return { engine: s.config.search.engine, index: null };
  try {
    return { engine: s.config.search.engine, index: { ...idx.stats(), complete: idx.complete } };
  } finally {
    idx.close();
  }
}

/** A whole-number flag within `lo`–`hi`, or `fallback` when it isn't given. */
function wholeFlag(s: Session, name: string, fallback: number, lo: number, hi: number): number {
  const v = flag(s.args, name);
  if (v === undefined) return fallback;
  if (!/^\d+$/.test(v) || Number(v) < lo || Number(v) > hi) throw new UsageError(`--${name} must be a whole number from ${lo} to ${hi}`);
  return Number(v);
}

/**
 * The vault's search index for a CLI run (6.x), brought up to the files — or null, and the files
 * are scanned: when `[search] engine` says so, in `$HOME` or `/` opened as a plain folder, or
 * while it's never been built (`slipbox index` builds it; the TUI does as it runs).
 */
function searchIndex(s: Session): SearchIndex | null {
  const engine = s.config.search.engine;
  if (engine === "scan" || isListed(s.loc)) return null;
  if (engine === "auto" && !SearchIndex.exists(s.loc)) {
    s.warnings.push("no search index yet: the files were scanned — slipbox index builds it (the TUI does as it runs)");
    return null;
  }
  const idx = SearchIndex.open(s.loc);
  if (!idx) {
    s.warnings.push("the search index can't be opened: the files were scanned");
    return null;
  }
  if (engine === "auto" && !idx.complete) {
    idx.close();
    s.warnings.push("the search index is still being built: the files were scanned");
    return null;
  }
  catchUp(s.graph, idx);
  return idx;
}

/**
 * Where a move or copy goes: a path in this root, from it — or from the current folder when it says so
 * (./, ../), or the filesystem's when absolute, as mkdir and write --create take one. A pointer to
 * elsewhere is refused: a file moves within its own root. `into`, a move's (DF-D4): a folder is a place
 * to go — `.` and `..` the current folder and its parent, the root itself `/` — not refused.
 */
function destArg(s: Session, to: string | undefined, into = false): string | undefined {
  if (!to) return to;
  if (isPointer(to)) throw new CliError(`${to}: a destination is a path, in the file's own folder — not a pointer`, EXIT.refused);
  const fromHere = into ? /^\.\.?(\/|$)/ : /^\.\.?\//;
  const abs = to.startsWith("/") ? to : fromHere.test(to) ? join(s.io.cwd, to) : join(s.loc.root, to);
  const rel = relative(s.loc.root, abs).split(sep).join("/");
  if ((!rel && !into) || !isInside(s.loc.root, abs) || !landsInside(s.loc.root, abs)) throw new CliError(`${to} is outside the root (${s.loc.root})`, EXIT.refused);
  if (!rel) return "/";
  return to.endsWith("/") ? `${rel}/` : rel;
}

/** A folder of the root named on the command line (from cwd, or the root), or null. */
function folderArg(s: Session, arg: string): string | null {
  for (const abs of [arg.startsWith("/") ? arg : join(s.io.cwd, arg), join(s.loc.root, arg)]) {
    if (!isInside(s.loc.root, abs) || abs === s.loc.root) continue;
    try {
      if (statSync(abs).isDirectory()) return relative(s.loc.root, abs);
    } catch {}
  }
  return null;
}

/**
 * `replace --all <old> <new>` (25.4): in every note — and with --files, every text file — as a rename is: --dry-run its
 * preview, --plan saved for `apply`, logged for `undo`.
 */
function replaceAll(s: Session, rest: string[]): Promise<Result> {
  if (rest.length !== 2) throw new UsageError("replace --all needs <old> <new> (the new text may be \"\"), and no note");
  const [query, replacement] = rest as [string, string];
  if (!query) throw new UsageError("replace needs something to find (an empty pattern matches nothing)");
  for (const f of ["first", "first-per-line", "lines", "if-unchanged"]) if (has(s.args, f)) throw new UsageError(`--${f} is for one note's replace, not --all`);
  pattern(s, query); // not a regex: a usage error, before anything is read
  const rels = [...s.graph.notes.keys(), ...(has(s.args, "files") ? textFiles(s).map((f) => f.path) : [])];
  for (const k of s.graph.skipped) if (/^larger than/.test(k.reason)) s.warnings.push(`${k.rel}: not searched (${k.reason})`);
  const opts = { regex: has(s.args, "regex"), whole: has(s.args, "whole"), ignoreCase: has(s.args, "ignore-case") };
  return renameResult(s, () => planReplace(s.graph, query, replacement, rels, opts));
}

/** A rename's plan (7.2), or, without --dry-run, the rename done. */
async function renameResult(s: Session, plan: () => RenamePlan, g = s.graph): Promise<Result> {
  // A code file links from its comments (16.10): its grammar loaded first, so a move finds those too (20.19).
  await g.loadGrammars();
  let p: RenamePlan;
  let applied: Applied | null = null;
  let saved: SavedPlan | null = null;
  try {
    p = plan();
    // Two steps (20.18): the plan saved, tied to each file as it is now, for `slipbox apply` to write.
    if (has(s.args, "plan")) saved = savePlan(g.root, s.args.positional[0] ?? "", p);
    else if (!has(s.args, "dry-run")) {
      applied = applyPlan(g, p);
      for (const [, to] of p.vaults ?? []) recordLocation(rootAt(to)); // the machine's list follows
    }
  } catch (err) {
    if (err instanceof RenameError) throw new CliError(err.message, EXIT.refused);
    throw err;
  }
  s.warnings.push(
    ...p.warnings,
    ...p.skipped.map((x) => `${x.shown}:${x.line}: ${x.reason}`),
    ...(p.ambiguous ?? []).map((a) => `${a.shown}:${a.line}: ${a.written} matches ${a.candidates.length} notes (${a.candidates.join(", ")}) — left as it is: write it as a path, or pick one in the TUI`),
  );
  const links = p.files.reduce((n, f) => n + f.edits.length, 0);
  const verb = p.undo
    ? applied
      ? { note: "renamed", folder: "moved folder", vault: "renamed folder", relink: "undid the relink of", "make-vault": "", "unmake-vault": "", heading: "renamed heading", convert: "undid the conversion of", replace: "undid the replace of" }[p.kind]
      : { note: "would rename", folder: "would move folder", vault: "would rename folder", relink: "would undo the relink of", "make-vault": "", "unmake-vault": "", heading: "would rename heading", convert: "would undo the conversion of", replace: "would undo the replace of" }[p.kind]
    : applied
    ? { note: "renamed", folder: "moved folder", vault: "renamed folder", relink: "relinked", "make-vault": "made", "unmake-vault": "made", heading: "renamed heading", convert: "converted", replace: "replaced" }[p.kind]
    : { note: "would rename", folder: "would move folder", vault: "would rename folder", relink: "would relink", "make-vault": "would make", "unmake-vault": "would make", heading: "would rename heading", convert: "would convert", replace: "would replace" }[p.kind];
  const head = p.undo
    ? p.kind === "relink" || p.kind === "convert"
      ? `${verb} ${p.to}`
      : p.kind === "replace"
        ? `${verb} ${JSON.stringify(p.to)} with ${JSON.stringify(p.from)}`
        : `${verb} ${p.from} back to ${p.to}`
    : p.kind === "replace"
      ? `${verb} ${JSON.stringify(p.from)} with ${JSON.stringify(p.to)}`
      : p.kind === "relink" || p.kind === "convert"
        ? `${verb} ${p.from}`
        : p.kind === "make-vault"
          ? `${verb} ${p.from}/ a root of its own${p.to !== p.from ? `, called ${p.to}` : ""}`
          : p.kind === "unmake-vault"
            ? `${verb} ${p.from}/ a plain folder of ${p.to}`
            : `${verb} ${p.from} → ${p.to}`;
  const human = [
    `${head}: ${links} change${links === 1 ? "" : "s"} in ${p.files.length} file${p.files.length === 1 ? "" : "s"}${saved ? ` — planned: slipbox apply ${saved.id} writes it (refused if any of these files changes first)` : ""}`,
    ...p.files.flatMap((f) => f.edits.map((e) => `  ${f.shown}:${e.line}\n    - ${e.before}\n    + ${e.after}`)),
    "",
  ].join("\n");
  return {
    data: {
      kind: p.kind,
      from: p.from,
      to: p.to,
      dryRun: !applied,
      move: p.move,
      files: p.files.map((f) => ({ path: f.shown, abs: f.abs, ...s.rootOf(f.abs), edits: f.edits })),
      warnings: p.warnings,
      skipped: p.skipped,
      ...(p.ambiguous ? { ambiguous: p.ambiguous } : {}),
      written: applied?.written ?? [],
      ...(p.undo ? { undo: { id: p.undo.id, at: p.undo.at } } : {}),
      ...(saved ? { plan: { id: saved.id, made: saved.made } } : {}),
    },
    human,
  };
}

/**
 * A folder's rename written (`undo`, `apply`): the machine's list learns the name its `.slipbox/` holds
 * now, as `name` teaches it — else pointers by that name fail elsewhere.
 */
function relearnRenamedRoots(s: Session, r: Result): Result {
  const d = r.data as { kind: string; dryRun: boolean; files: { abs: string }[] };
  if (d.kind === "vault" && !d.dryRun) for (const f of d.files) if (f.abs.endsWith(`${sep}.slipbox${sep}config.toml`)) recordLocation(rootAt(dirname(dirname(f.abs))));
  return r;
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
