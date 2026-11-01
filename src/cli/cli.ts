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
// install.ts — and what they share is common.ts's. Output and exit presentation are output.ts's.

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { loadConfig } from "../core/application/config/config.ts";
import { lookupFolder } from "../core/workspace/vaults/folders.ts";
import { isPointer, parsePointer, resolvePointer } from "../core/workspace/links/pointer.ts";
import { pathLink } from "../core/workspace/links/links.ts";
import {
  elsewhereAt,
  findVaultRoot,
  isVaultRoot,
  locateVault,
  setRootMarkers,
} from "../core/workspace/vaults/vault.ts";
import { setTrustedRoots } from "../core/workspace/vaults/trust.ts";
import { type Args, flag, has, parseArgs, UsageError, VALUED } from "./args.ts";
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
import { CliOutput } from "./output.ts";

export { EXIT, CliError, retargetSaid } from "./common.ts";
export { HELP, JSON_SCHEMA, defaultIo } from "./output.ts";

export const CLI_COMMANDS = new Set([
  "render",
  "resolve",
  "link",
  "links",
  "backlinks",
  "name",
  "folders",
  "vaults",
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
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    return new CliOutput(
      io,
      argv.some((a) => a === "--json" || a.startsWith("--json=")),
    ).usageError(commandIn(argv), (err as Error).message);
  }
  const output = new CliOutput(io, has(args, "json"));
  const [command = "help", ...rest] = args.positional;
  if (has(args, "version")) return output.version();
  if (command === "help" || has(args, "help")) return output.help();
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
      return output.report(command, r);
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
    return output.result(command, result, session);
  } catch (err) {
    return output.error(command, err, session);
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
  upgrade: ["check", "no-skill"],
  uninstall: ["purge", "yes"],
  skill: ["install", "force", "dry-run", "auto"],
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
