// A rename's plan (7.2): what it changes, file by file and line by line, before anything is written — its shape,
// the collector that reads each file once and edits it in turn, and the git trees that have changes already (7.3).

import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { basename, dirname, join, posix, relative, sep } from "node:path";
import { classify } from "./filetypes.ts";
import { readText, realTarget } from "./foundation/platform/fsutil.ts";
import type { Graph } from "./graph.ts";
import { gitArgs } from "./gitops.ts";
import { isLink, movedLinkText, quietFollowed, writesThrough } from "./workspace/vaults/symlinks.ts";
import { findVaultRoot, homeOf, isInside, vaultOf } from "./workspace/vaults/vault.ts";
import { type Site, replaceAt } from "./rename-links.ts";

export class RenameError extends Error {}

/** Where a link leads the file at `abs` that a plan may not write (`mayRewrite`, VV-D6), said. */
export const whereItLeads = (g: Graph, abs: string): string =>
  landsHidden(g, abs) ? "a link leads it into a folder the walk doesn't list" : "a link leads it out of the vault";

/** Why a plan may not write the file at `abs` (`mayRewrite`), said as its skipped row says it. */
export const notRewritten = (g: Graph, abs: string): string => `${whereItLeads(g, abs)}: not rewritten`;

/**
 * Whether a link on the way leads a write to `abs` where the vault or home holding it doesn't list (VV-D6): by its
 * real path, in a hidden folder or file of that place, `.git` and `.slipbox` among them, but one this vault has
 * reached there (20.8) — refused as it's refused named there, as the command line's `checkWritable` measures it: one
 * into `.shelved/`, or `~/notes/x.md → ~/.bashrc`. A path no link leads elsewhere is where it's named: a vault's
 * own `config.toml` is its own.
 */
export function landsHidden(g: Graph, abs: string): boolean {
  const real = realTarget(abs);
  const rootReal = realTarget(g.root);
  if (asNamed(g.root, abs, real, rootReal)) return false;
  // Past a link, the place it's named in by its path: a vault reached through one has its own config.toml.
  const named = vaultOf(abs);
  if (named && asNamed(named, abs, real)) return false;
  const place = vaultOf(real);
  if (!place) return false;
  const placeReal = realTarget(place);
  const there = relative(placeReal, real);
  if (!there.split(sep).some((part) => part.startsWith("."))) return false;
  return !(placeReal === rootReal && g.reached.has(there.split(sep).join("/")));
}

/** Whether `abs`, under `root`, lands where it's named, `real` its real path: no link on the way past `root`. */
function asNamed(root: string, abs: string, real: string, rootReal = realTarget(root)): boolean {
  return isInside(root, abs) && join(rootReal, relative(root, abs)) === real;
}

/**
 * Whether a plan may write the file at `abs` (VV-D6): it lands where each place holding it allows — this vault, when
 * it's under it, and the nearest vault holding it, else home: a vault's never out of it by its real path, followed or
 * not; home's through the links home follows. A note reached through a link out of its vault is read, never written.
 * Elsewhere's only while it's the place open: it has no index for another's plan to find it by.
 */
export function mayRewrite(g: Graph, abs: string): boolean {
  if (landsHidden(g, abs)) return false;
  const here = isInside(g.root, abs);
  if (here && !writesThrough(g.loc, abs)) return false;
  const own = findVaultRoot(abs);
  if (own) return own === g.root || writesThrough({ mode: "vault", root: own }, abs);
  const home = homeOf(abs);
  if (home) return home === g.root || writesThrough({ mode: "home", root: home }, abs);
  return here && g.loc.mode === "folder";
}

export interface Edit {
  line: number;
  /** The line before and after, for the preview. */
  before: string;
  after: string;
}

export interface FileChange {
  /** Absolute. */
  abs: string;
  /** How to show it: its path from this root, else `~/…`, else absolute (21.9). */
  shown: string;
  vault: string | null;
  edits: Edit[];
  /** The text as planned from, and as it will be. */
  text: string;
  next: string;
  /** Other names the file has here, in its folder, that edited it alike (D260): written once, indexed again each. */
  also?: string[];
}

export interface RenamePlan {
  /** `replace`: a find's matches replaced across files (25.4), `from` the find and `to` its replacement. */
  kind: "note" | "folder" | "vault" | "relink" | "make-vault" | "unmake-vault" | "heading" | "convert" | "replace";
  from: string;
  to: string;
  /** What moves: a file or a folder, absolute paths; null for a vault's rename or a relink. */
  move: { from: string; to: string; dir: boolean; link?: boolean } | null;
  /** Every file that moves, vault paths old → new (a folder's: each file in it). */
  moves?: [string, string][];
  /** Vaults that move with a vault's folder (18.7), absolute roots old → new: the machine's list follows. */
  vaults?: [string, string][];
  /** A folder made a vault of its own (18.11): its root, its name, and whether it's private. */
  makeVault?: { root: string; name: string | null; private: boolean };
  /** A vault nested here made a plain folder of it (18.11): its root and the name it had. */
  unmakeVault?: { root: string; name: string };
  files: FileChange[];
  warnings: string[];
  /** Links the index knew of that the file no longer has where it said: left alone. */
  skipped: { shown: string; line: number; reason: string }[];
  /** A plan that undoes a rename (7.4): the rename's id in the vault's log, and when it was done. */
  undo?: { id: string; at: string; made: string | null };
  /** Links the plan can't decide for itself (20.1: a wikilink several notes answer to): each to pick. */
  ambiguous?: Ambiguous[];
}

/** A link with several possible targets, for the user to pick one of. */
export interface Ambiguous {
  /** The link's place, `rel:line:column`: what a pick names. */
  key: string;
  shown: string;
  line: number;
  /** The link as written. */
  written: string;
  /** Vault-relative. */
  candidates: string[];
}

/** Where a link's file is, as shown (21.9): its path from this root, else from home (`~/…`), else absolute. */
export function shownFor(g: Graph, abs: string): string {
  return g.shownPath(abs);
}

export class Collector {
  readonly files = new Map<string, FileChange>();
  readonly skipped: RenamePlan["skipped"] = [];
  /** Why a file can't be rewritten, where it's more than unreadable. */
  private readonly why = new Map<string, string>();
  /** The vault's indexed names, by the real path of what each is: made once, when a link is met (D260). */
  private names: Map<string, string[]> | null = null;
  /** The vault's root, by its real path: read once. */
  private rootReal: string | null = null;
  /** Why a plan leaves a file it would read, beside the place's own rules: a folder's move's (D260), say; null for none. */
  leave: ((abs: string) => string | null) | null = null;

  constructor(readonly g: Graph) {}

  /** Whether a link on the way, past the vault's root, leads `abs` elsewhere. */
  private throughLink(abs: string): boolean {
    this.rootReal ??= realTarget(this.g.root);
    return isInside(this.g.root, abs) && !asNamed(this.g.root, abs, realTarget(abs), this.rootReal);
  }

  /**
   * The other names the vault's index has for the file at `abs` (D260), vault paths. A note named as itself has none
   * but one the vault reached (20.8): the walk leaves out a link to a note it lists, though not to another file. Never
   * looked for through a followed link whose target hasn't answered: reading there could hang.
   */
  otherNames(abs: string): string[] {
    const rel = relative(this.g.root, abs).split(sep).join("/");
    const note = classify(abs, this.g.config.walk.extensions).group === "note";
    if (!this.throughLink(abs) && !this.g.reached.has(rel) && note) return [];
    if (!this.names) {
      this.names = new Map();
      const quiet = quietFollowed(this.g.root).map((l) => relative(this.rootReal!, l).split(sep).join("/"));
      for (const name of [...this.g.notes.keys(), ...this.g.filePaths()]) {
        if (quiet.some((q) => name === q || name.startsWith(`${q}/`))) continue;
        const real = realTarget(join(this.g.root, name));
        this.names.set(real, [...(this.names.get(real) ?? []), name]);
      }
    }
    return (this.names.get(realTarget(abs)) ?? []).filter((r) => r !== rel);
  }

  /**
   * How the file at `abs` is named in a place of its own, when a link leads it out of the one its name is in (D260): a
   * note of another vault, or of home, by its own path there, as shown; null when it lands in the place it's named in,
   * or in none (Elsewhere: no index names it).
   */
  private ownPlace(abs: string): string | null {
    if (!this.throughLink(abs)) return null;
    const real = realTarget(abs);
    const lands = vaultOf(real);
    const named = vaultOf(abs);
    if (!lands || (named && realTarget(named) === realTarget(lands))) return null;
    return shownFor(this.g, real);
  }

  /** Why the file at `abs` isn't rewritten, for its skipped rows. */
  private reason(abs: string): string {
    return this.why.get(abs) ?? "can't be read";
  }

  /**
   * The file's change so far (its text read once, then edited in turn); null where it can't be — or mustn't be: one
   * not valid UTF-8 would be written back with U+FFFD where its bytes were.
   */
  file(abs: string, vault: string | null): FileChange | null {
    let f = this.files.get(abs);
    if (!f) {
      if (this.why.has(abs)) return null;
      const left = this.leave?.(abs);
      if (left) {
        this.why.set(abs, left);
        return null;
      }
      // Read through a link out of its vault, or into a hidden folder, never written there: left, and said (VV-D6).
      if (!mayRewrite(this.g, abs)) {
        this.why.set(abs, notRewritten(this.g, abs));
        return null;
      }
      // Reached by another name too, from another folder: its links read otherwise there, so an edit made for one is
      // wrong for the other — left, and said (D260). A note another vault holds, reached through a link, is that
      // vault's by its own name.
      const folder = posix.dirname(relative(this.g.root, abs).split(sep).join("/"));
      const elsewhere = this.ownPlace(abs) ?? this.otherNames(abs).find((r) => posix.dirname(r) !== folder);
      if (elsewhere) {
        this.why.set(abs, `reached as ${elsewhere} too, from another folder: not rewritten`);
        return null;
      }
      let text: string;
      try {
        const d = readText(abs);
        if (d.invalidUtf8) {
          this.why.set(abs, "not valid UTF-8: not rewritten");
          return null;
        }
        text = d.text;
      } catch {
        return null;
      }
      f = { abs, shown: shownFor(this.g, abs), vault, edits: [], text, next: text };
      this.files.set(abs, f);
    }
    return f;
  }

  /** Rewrite one link site to `next`; noted as skipped when the file no longer has it there. */
  edit(site: Site, next: string, vault: string | null): void {
    if (next === site.target) return;
    const f = this.file(site.abs, vault);
    if (!f)
      return void this.skipped.push({
        shown: shownFor(this.g, site.abs),
        line: site.line,
        reason: this.reason(site.abs),
      });
    const group = classify(site.abs, this.g.config.walk.extensions).group;
    const r = replaceAt(f.next, site, next, group);
    if (!r)
      return void this.skipped.push({
        shown: f.shown,
        line: site.line,
        reason: `no link to ${site.target} there any more (its index is older than the file)`,
      });
    const before = f.next.split("\n")[r.line - 1]!;
    f.next = r.text;
    const after = f.next.split("\n")[r.line - 1]!;
    const same = f.edits.find((e) => e.line === r.line);
    if (same) same.after = after;
    else f.edits.push({ line: r.line, before: before.replace(/\r$/, ""), after: after.replace(/\r$/, "") });
  }

  /** Rewrite one line of a file by `fn` (null: the line isn't what was expected; skipped, with why). */
  line(abs: string, vault: string | null, line: number, fn: (text: string) => string | null, why: string): void {
    const f = this.file(abs, vault);
    if (!f) return void this.skipped.push({ shown: shownFor(this.g, abs), line, reason: this.reason(abs) });
    const lines = f.next.split("\n");
    const before = lines[line - 1];
    const cr = before?.endsWith("\r") ? "\r" : "";
    const after = before === undefined ? null : fn(before.replace(/\r$/, ""));
    if (after === null) return void this.skipped.push({ shown: f.shown, line, reason: why });
    if (after === before!.replace(/\r$/, "")) return;
    lines[line - 1] = after + cr;
    f.next = lines.join("\n");
    const same = f.edits.find((e) => e.line === line);
    if (same) same.after = after;
    else f.edits.push({ line, before: before!.replace(/\r$/, ""), after });
  }

  result(): FileChange[] {
    // One file reached by two names in one folder (links to what the walk doesn't list): written once; edited
    // otherwise by each, not at all, and said (D260).
    const byReal = new Map<string, FileChange[]>();
    for (const f of this.files.values()) {
      if (f.next === f.text) continue;
      const real = realTarget(f.abs);
      byReal.set(real, [...(byReal.get(real) ?? []), f]);
    }
    const out: FileChange[] = [];
    for (const [first, ...rest] of byReal.values()) {
      if (rest.every((f) => f.next === first!.next)) {
        out.push(rest.length ? { ...first!, also: rest.map((f) => f.abs) } : first!);
        continue;
      }
      for (const f of [first!, ...rest]) {
        const other = f === first ? rest[0]! : first!;
        const reason = `reached as ${other.shown} too, edited otherwise there: not rewritten`;
        this.skipped.push({ shown: f.shown, line: f.edits[0]?.line ?? 1, reason });
      }
    }
    return out.map((f) => ({ ...f, edits: f.edits.sort((a, b) => a.line - b.line) }));
  }
}

/** Roots with uncommitted changes in git, among those the plan writes to (7.3). */
export function dirtyTrees(paths: string[]): string[] {
  const roots = new Set<string>();
  for (const p of paths) {
    // git answers for any folder in the tree; the vault's root, else the file's folder, is asked.
    roots.add(findVaultRoot(p) ?? dirname(p));
  }
  const out: string[] = [];
  for (const root of roots) {
    try {
      const status = execFileSync("git", gitArgs(root, ["status", "--porcelain"]), {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      });
      if (status.trim()) out.push(`${root} already has uncommitted changes (git): these edits will mix with them`);
    } catch {
      // not a git repository, or no git: nothing to warn about
    }
  }
  return out;
}

/** A path the walk lists only when it's reached (20.8): something hidden on its way. A busy folder is the filter's. */
export function walkSkips(rel: string): boolean {
  return rel.split("/").some((s) => s.startsWith("."));
}

/**
 * Whether `a` and `b` are one entry, as a case-only rename on a disk that ignores case has it: a link its own, never
 * what it leads to — a link moved onto its target, or onto another link to it, goes over something else (D260).
 */
export function sameEntry(a: string, b: string): boolean {
  try {
    const x = lstatSync(a);
    const y = lstatSync(b);
    // A second name for one file (a hard link) is another entry: one entry is in one folder, its name another case.
    if (x.ino !== y.ino || x.dev !== y.dev || realTarget(dirname(a)) !== realTarget(dirname(b))) return false;
    return basename(a).toLowerCase() === basename(b).toLowerCase();
  } catch {
    return false;
  }
}

/**
 * What a plan moving a link says of it (D260): a relative one moved itself to another folder is written again there, to
 * lead where it did — no link's edit, so said. `from` and `to` as the plan shows them.
 */
export function relinkSaid(move: RenamePlan["move"], from: string, to: string): string[] {
  const text = move?.link && isLink(move.from) ? movedLinkText(move.from, move.to) : null;
  return text ? [`${from} is a relative link: written again at ${to} to lead where it did (${text})`] : [];
}
