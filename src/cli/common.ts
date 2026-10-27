// What every CLI command shares: the session (the vault found, its config, its graph opened lazily), the errors
// and exit codes, a note named on the command line resolved, and a note's file read and written as the writers do —
// its sha checked, its BOM and line endings kept.

import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { type Config, loadConfig } from "../core/application/config/config.ts";
import { folderIdentity } from "../core/workspace/vaults/folders.ts";
import { type Graph, openGraph, type Retarget } from "../core/workspace/graph/graph.ts";
import type { ParsedNote } from "../core/documents/markdown/parse.ts";
import { parseNoteFile } from "../core/documents/model/readers.ts";
import { parseData } from "../core/documents/model/data.ts";
import { classify } from "../core/documents/model/filetypes.ts";
import { stateHome } from "../core/foundation/platform/paths.ts";
import { readStale, type StaleEntry } from "../core/stale.ts";
import { UNSAFE } from "../core/foundation/text/sanitize.ts";
import {
  climbsOut,
  type DecodedFile,
  decodeText,
  ensureDir,
  readRegular,
  realTarget,
  WriteRefused,
  writeNote,
} from "../core/foundation/platform/fsutil.ts";
import { blockingLink, linkSaid, PROBE_MS, probeFollowed, writesThrough } from "../core/workspace/vaults/symlinks.ts";
import { compilePattern } from "../core/replace.ts";
import { openVault, Reach } from "../core/workspace/links/reach.ts";
import { planRelink } from "../core/workspace/mutations/rename/rename.ts";
import { activityFile } from "../core/workspace/graph/autoindex.ts";
import { ELSEWHERE, rootLabel } from "../core/workspace/vaults/names.ts";
import {
  isHome,
  isInside,
  isListed,
  vaultOf,
  recordLocation,
  type VaultLocation,
  configFilesFor,
} from "../core/workspace/vaults/vault.ts";
import { homeWalkKept, walkHomeNow } from "../core/workspace/vaults/home.ts";
import { WalkFilter } from "../core/workspace/walk/walk.ts";
import { type Args, flag, has, UsageError } from "./args.ts";

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

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  stdin: () => Promise<string>;
  isTTY: boolean;
  columns: number | undefined;
  /** The terminal's rows, when stdout is one (`slipbox report`'s size). */
  rows?: number | undefined;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export class Session {
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
      const broken = planRelink(openVault(loc.root), undefined, { pointers: false }).files.reduce(
        (n, f) => n + f.edits.length,
        0,
      );
      const fix = broken
        ? ` — its move broke links on ${broken} line${broken === 1 ? "" : "s"}: slipbox relink fixes them (--dry-run shows how)`
        : "";
      this.warnings.push(
        `${rootLabel(loc)} moved here from ${carriedFrom}: its workspaces, scratch, trash and reading positions came along${fix}`,
      );
    }
  }

  get graph(): Graph {
    if (!this._graph) {
      // Home never walked yet, or under other [walk] settings (VV-D2), or its top not read, or by an earlier version
      // that kept no folder's stamp (#12): walked now, as far as its cap — an agent's answer is now, not after the
      // background index; kept for the next command and the TUI.
      if (this.loc.mode === "home" && !homeWalkKept(this.loc, this.config, true)) walkHomeNow(this.loc, this.config);
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
   * files, and for a file of no root. Home's (VV-D2) is home, unnamed.
   */
  rootOf(abs: string | null): { root: string | null; name: string | null } {
    const none = { root: null, name: null };
    if (!abs) return none;
    const root = vaultOf(abs);
    if (!root || root === this.loc.root) return none;
    let hit = this.roots.get(root);
    if (!hit) this.roots.set(root, (hit = { root, name: isHome(root) ? null : (folderIdentity(root)?.name ?? null) }));
    return hit;
  }
}

/**
 * The vault's followed links' targets asked whether they answer (VV-D6), before anything is read: one that doesn't is
 * given up on this time, said so — never waited for.
 */
export async function probeLinks(s: Session): Promise<void> {
  if (s.loc.mode === "folder") return;
  const r = await probeFollowed(s.loc.root);
  for (const g of r.gaveUp)
    s.warnings.push(`${linkSaid(g.link, g.target)} didn't answer in ${PROBE_MS / 1000} s: not followed this time`);
}

/**
 * What needs an index, asked in Elsewhere (VV-D3): refused, and why — it has none — never an empty answer. `what`
 * says what was asked for.
 */
export function needsIndex(s: Session, what: string): void {
  if (s.loc.mode === "folder")
    throw new CliError(
      `${ELSEWHERE} has no index, so no ${what}: ${s.loc.root} is outside home and every vault — a vault or home has them`,
      EXIT.refused,
    );
}

/**
 * A path read through a link you don't follow (VV-D6): refused, exit 5 — one leading out of the vault, out of home, or
 * any in Elsewhere. The TUI asks; the command line never does, nor follows one unasked.
 */
export function refuseUnfollowed(s: Session, abs: string, shown: string): void {
  const b = blockingLink(s.loc, abs);
  if (b)
    throw new CliError(
      `${shown} is reached through a link that isn't followed (${linkSaid(b.link, b.target)}): open it in slipbox to choose`,
      EXIT.refused,
    );
}

/**
 * A note's or data file's tree: markdown parsed, a data file read by its format (16.11), its
 * parse error a CliError. A text file has no rendered form (exit 2: `read` gives its text).
 */
export function parseFile(s: Session, rel: string, text: string): ParsedNote {
  const kind = classify(rel, s.config.walk.extensions);
  if (kind.group === "data") {
    const d = parseData(kind.format, text);
    if (d.error) throw new CliError(`${rel} doesn't parse — ${d.error}`, EXIT.error);
    return { tree: d.tree, frontmatter: null, source: text };
  }
  if (kind.group === "text")
    throw new UsageError(
      `${rel} is a ${kind.format === "text" ? "text" : kind.format} file, with no rendered form (slipbox read shows its text)`,
    );
  return parseNoteFile(rel, text);
}

/** The root's data and text files (not notes, not binary), with their group and format. */
export function textFiles(s: Session): { path: string; group: string; format: string }[] {
  return s.graph
    .filePaths()
    .map((path) => ({ path, ...classify(path, s.config.walk.extensions) }))
    .filter((f) => f.group !== "binary")
    .sort((a, b) => a.path.localeCompare(b.path));
}

export interface Result {
  data: unknown;
  human?: string;
  code?: number;
}

export type Handler = (s: Session, rest: string[]) => Result | Promise<Result>;

export function requireArg(rest: string[], what: string): string {
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
export function resolveNote(s: Session, arg: string, parse = true): string {
  return findNoteArg(s, arg, parse);
}

function findNoteArg(s: Session, arg: string, parse: boolean): string {
  const rel = noteArgRel(s, arg, parse);
  // However it was found — Elsewhere lists a linked note as any other, a listing can be older than a link — reading
  // follows the place's rule (VV-D6): a link on its way not followed is refused.
  refuseUnfollowed(s, join(s.loc.root, rel), rel);
  return rel;
}

function noteArgRel(s: Session, arg: string, parse: boolean): string {
  // The file that said which vault this is: only the argument naming it (context takes several).
  const root = flag(s.args, "root");
  // Named from here, or from --root (`noteArgPath`): the file that said which root this is.
  if (
    s.loc.file &&
    isInside(s.loc.root, s.loc.file) &&
    (resolve(s.io.cwd, arg) === s.loc.file || (root && resolve(s.io.cwd, root, arg) === s.loc.file))
  ) {
    const rel = relative(s.loc.root, s.loc.file);
    if (s.graph.notes.has(rel)) return rel;
    // Reading follows the vault's rule too (VV-D6): a link not followed leads to nothing of the vault's (the walk
    // leaves it out), so naming a path through it reads nothing — refused before anything reads it.
    refuseUnfollowed(s, s.loc.file, rel);
    // An existing file the walk leaves out: named, it's reached (20.8) — git-ignored or under a
    // hidden folder, it's indexed from now on, as the TUI does; in a busy folder, excluded by
    // walk.exclude, it's read without joining the vault.
    // The argument names s.loc.file (from here or from --root): whether it exists is that file's.
    if (arg && existsSync(s.loc.file)) {
      // A data or text file is itself (16.4): never parsed as a note.
      if (!s.graph.reachFile(rel, { keep: true }) && parse && classify(rel, s.config.walk.extensions).group === "note")
        s.graph.adopt(rel);
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
    throw new CliError(`ambiguous note "${arg}": ${r.candidates.join(", ")}`, EXIT.ambiguous, {
      candidates: r.candidates,
    });
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

/**
 * A match's line for display: the whole line when short, else a window of it around the match with
 * `…` where it was cut — a long line (a data URI) repeated per match would grow as its square.
 */
export function around(text: string, lineStart: number, lineEnd: number, from: number, to: number): string {
  const MAX = 160;
  const line = text.slice(lineStart, lineEnd).replace(/\r$/, "");
  if (line.length <= MAX) return line;
  const room = Math.max(0, MAX - (to - from));
  const a = Math.max(lineStart, from - Math.floor(room / 2));
  const b = Math.min(lineEnd, Math.max(to, a + MAX));
  return `${a > lineStart ? "…" : ""}${text.slice(a, b).replace(/\r$/, "")}${b < lineEnd ? "…" : ""}`;
}

/** The query as a pattern, with the shared flags; a bad regex is a usage error. */
export function pattern(s: Session, query: string): RegExp {
  const re = compilePattern(query, {
    regex: has(s.args, "regex"),
    whole: has(s.args, "whole"),
    ignoreCase: has(s.args, "ignore-case"),
  });
  if (typeof re === "string") throw new UsageError(`not a regex: ${re}`);
  return re;
}

export function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) out.push(i + 1);
  return out;
}

/** The 1-based line holding offset `at`. */
export function lineAt(starts: number[], at: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export interface NoteFile extends DecodedFile {
  bytes: Uint8Array;
  sha: string;
}

/**
 * A note's bytes, text and sha (of the bytes), checked against `--if-unchanged`. A note that isn't
 * valid UTF-8 is read, never rewritten: its invalid bytes would be lost.
 */
export function readNoteFile(s: Session, abs: string, forWriting = true): NoteFile {
  let bytes: Buffer;
  try {
    bytes = readRegular(abs);
  } catch (err) {
    throw new CliError(
      `${relative(s.loc.root, abs)}: ${(err as NodeJS.ErrnoException).code === "ENOENT" ? "gone (deleted since it was found)" : (err as Error).message}`,
      EXIT.notFound,
    );
  }
  const decoded = decodeText(bytes);
  const sha = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  if (forWriting) {
    checkUnchanged(s, abs, sha);
    if (decoded.invalidUtf8)
      throw new CliError(`${relative(s.loc.root, abs)} isn't valid UTF-8; not rewriting it`, EXIT.refused);
  }
  return { ...decoded, bytes, sha };
}

/**
 * What a writer (`write`, `replace`, `task`) may change: a note, data or text file of the root
 * (never a binary one, 16.4), inside it by its real path, and where the walk lists files — never
 * `.slipbox/`, `.git/` or a hidden folder the root hasn't reached, as the path is reached and where it
 * lands (in home's, or a vault's); a new one never in a busy folder (`node_modules`, `build/`… that
 * look generated: VV-D8, D237), which the vault doesn't index, nor landing in one. Refused, exit 5.
 */
export function checkWritable(s: Session, abs: string): void {
  const refuse = (why: string) => {
    throw new CliError(`${relative(s.io.cwd, abs) || abs}: ${why}; not writing it`, EXIT.refused);
  };
  if (!isInside(s.loc.root, abs)) refuse(`outside the vault (${s.loc.root})`);
  // A link on the way not followed, or — in a vault — one leading the write out of it, followed or not (VV-D6).
  const b = blockingLink(s.loc, abs);
  if (b) refuse(`reached through a link that isn't followed (${linkSaid(b.link, b.target)})`);
  if (!writesThrough(s.loc, abs)) refuse(`a link leads it out of the vault (${s.loc.root}), where nothing is written`);
  const rel = relative(s.loc.root, abs);
  // Notes, data and text files are written (16.4); binary files never are.
  if (classify(rel, s.config.walk.extensions).group === "binary") refuse("a binary file");
  // A hidden folder's note the vault has reached (20.8) is the vault's like any other; .git and
  // .slipbox never are. A busy folder (`node_modules`…) is the walk's filter's, below.
  const unlisted = (r: string) => r.split("/").some((part) => part.startsWith("."));
  if (unlisted(rel) && !s.graph.reached.has(rel)) refuse("in a folder the walk doesn't list");
  // Measured where the write lands, too (VV-D6): a link on the way can lead it into a hidden folder of home or of a
  // vault, which that place refuses as it refuses it named there.
  const real = realTarget(abs);
  const lands = vaultOf(real);
  if (lands) {
    const there = relative(lands, real).split(sep).join("/");
    const same = realTarget(s.loc.root) === realTarget(lands);
    const ours = same && s.graph.reached.has(there);
    if (unlisted(there) && !ours) refuse("it lands in a folder the walk doesn't list");
    // A new one landing, through a link, in a busy folder of that place (VV-D8, D237), as a new one named there is
    // refused: the folder it's put in holds a note then, so it's busy only when ignored. Named here, it's
    // `neverIndexed`'s, below.
    if (!existsSync(abs) && (!same || there !== rel.split(sep).join("/"))) {
      const filter = same ? s.graph.filter : new WalkFilter(lands, s.config.walk, { home: isHome(lands) });
      const dirs = there.split("/").slice(0, -1);
      const note = filter.isNoteName(there.slice(there.lastIndexOf("/") + 1));
      const busy = dirs.find((_, i) =>
        filter.busy(dirs.slice(0, i + 1).join("/"), i === dirs.length - 1 && note ? true : undefined),
      );
      if (busy !== undefined) refuse("it lands in a busy folder, which its vault doesn't index");
    }
  }
  // A new file where the vault never indexes it (VV-D8), found by nothing once written; one already there is edited.
  const never = existsSync(abs) ? null : s.graph.neverIndexed(rel);
  if (never) refuse(never);
  if (UNSAFE.test(rel) || /[\x1b\t\n]/.test(rel)) refuse("a control character in its name");
}

/**
 * Why the vault never indexes a file written at `abs` — a folder, with `isDir` (D246, `WalkFilter.notIndexed`):
 * `walk.exclude`, or null. Asked of the walk's settings, not the index, so a quick write (`capture`, `mkdir`) walks
 * nothing; Elsewhere indexes nothing to leave out. The JSON says it as `notIndexed`; a human line ends with
 * `notIndexedSaid`, and one that is a bare path, for scripts, is kept so and it's a warning instead.
 */
export function notIndexed(s: Session, abs: string, isDir = false): string | null {
  const rel = relative(s.loc.root, abs);
  if (!rel || climbsOut(rel) || isListed(s.loc)) return null;
  return new WalkFilter(s.loc.root, s.config.walk).notIndexed(rel.split(sep).join("/"), isDir);
}

/** `--if-unchanged <sha>`: refuse (exit 5) unless the note's bytes still have that sha. */
export function checkUnchanged(s: Session, abs: string, sha: string): void {
  const expect = flag(s.args, "if-unchanged");
  if (expect === undefined) return;
  if (!expect) throw new UsageError("--if-unchanged needs a sha (an empty one would check nothing)");
  if (expect !== sha)
    throw new CliError(`${relative(s.loc.root, abs)} changed since ${expect} (now ${sha}); not written`, EXIT.refused, {
      sha,
    });
}

/**
 * Write a note's text back as it was stored: its BOM and its line endings kept. Returns the sha of
 * the bytes written — not of the file re-read after, which another writer (a TUI's autosave) may
 * already have changed.
 */
export function writeNoteText(s: Session, abs: string, text: string, was: DecodedFile | null): string {
  let out = text;
  if (was?.crlf) out = out.replace(/\r?\n/g, "\r\n");
  if (was?.bom) out = `\uFEFF${out}`;
  try {
    // Home's and Elsewhere's through the links they follow; a vault's never out of it (VV-D6).
    writeNote(s.loc.root, abs, out, { through: s.loc.mode !== "vault" && writesThrough(s.loc, abs) });
  } catch (err) {
    if (err instanceof WriteRefused) throw new CliError(err.message, EXIT.refused);
    throw err;
  }
  return createHash("sha256").update(Buffer.from(out, "utf8")).digest("hex").slice(0, 16);
}

/** A whole-number flag within `lo`–`hi`, or `fallback` when it isn't given. */
export function wholeFlag(s: Session, name: string, fallback: number, lo: number, hi: number): number {
  const v = flag(s.args, name);
  if (v === undefined) return fallback;
  if (!/^\d+$/.test(v) || Number(v) < lo || Number(v) > hi)
    throw new UsageError(`--${name} must be a whole number from ${lo} to ${hi}`);
  return Number(v);
}
