// A row's marks in the explorer (VV-D9), at its right in columns: the index's state in the last — indexed, indexing,
// not indexed, can't read, a problem — and, between the name and the marks, dimmed, what describes the row: a vault's
// branch (a worktree's after ⎇), where a link points. git's mark, in the column before the index's, is drawn as it
// was (draw-panels.ts). Each mark is one column wide in every terminal, in the nerd, unicode and ascii glyphs
// (`core/glyphs.ts`); none is an emoji. Why a row isn't indexed is said in words, from the rule that made it so: on
// the status line while the cursor is on it, and in Info for the file on screen (`why`, `whyAt`).

import { accessSync, constants as fsConstants, existsSync, lstatSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { checkoutOf, headOf } from "../core/git.ts";
import type { Glyphs } from "../core/glyphs.ts";
import { cacheDir, vaultKey } from "../core/paths.ts";
import type { Role } from "../core/theme/theme.ts";
import { isInside } from "../core/vault.ts";
import { ANOTHER_DISK, type BusyWhy, busyFolderWhyAt, HOME_LIMITS, LINK_REASON, type WalkCap } from "../core/walk.ts";
import type { App } from "./app.ts";
import type { TreeRow } from "./explorer.ts";

/**
 * What a row says of its vault's index (VV-D9): read into it; being read now; left out of it (a busy folder, home's
 * skip list, what `.gitignore` or `walk.exclude` leaves out, a note too big to read); not yours to read; a problem (a
 * link whose target isn't there).
 */
export type IndexState = "indexed" | "indexing" | "not-indexed" | "unreadable" | "problem";

/** Which rule made a row not indexed (VV-D9), with what it read: its `⊘`, said in words by `Marks.why`. */
type NotIndexed =
  /** A link the walk didn't go through (VV-D6): `LINK_REASON`'s. */
  | { by: "link"; reason: string }
  /** What the vault open's walk leaves out (VV-D8): `exclusion`'s reason, and the folder or file it was decided of. */
  | { by: "left-out"; reason: string; at: string }
  /** A busy folder outside the vault open (D237): which of the rule's two things hold. */
  | { by: "busy"; name: string; busy: BusyWhy }
  /** A note of the vault's own tree over `walk.max_file_size`. */
  | { by: "big" }
  /** A folder of home its walk didn't reach before its cap. */
  | { by: "capped"; cap: WalkCap };

/** Why the walk didn't go through a link (`LINK_REASON`), in words. */
const LINK_WORDS: Record<string, string> = {
  [LINK_REASON.out]: "a link not followed",
  [LINK_REASON.waiting]: "a link followed, its disk not answering",
  [LINK_REASON.loop]: "a link to a folder holding the vault",
  [LINK_REASON.twice]: "a second link to a folder followed already",
};

/** A busy folder's reason (D237), in words: no note at its top — generated, by its name — git-ignored, or both. */
function busyWords(name: string, b: BusyWhy): string {
  const said = [b.noNotes ? `generated (${name})` : "", b.ignored ? "git-ignored" : ""].filter(Boolean);
  return said.length ? said.join(", ") : `generated (${name})`;
}

/** A state's glyph in the set drawn. */
export function indexGlyph(g: Glyphs, s: IndexState): string {
  switch (s) {
    case "indexed":
      return g.markIndexed;
    case "indexing":
      return g.markIndexing;
    case "not-indexed":
      return g.markNotIndexed;
    case "unreadable":
      return g.markCantRead;
    case "problem":
      return g.markProblem;
  }
}

/** A state's colour: indexed dimmed (`sidebar_mark`), since most folders are; what needs a look, the warning's. */
export const INDEX_ROLE: Record<IndexState, Role> = {
  indexed: "sidebar_mark",
  indexing: "info",
  "not-indexed": "sidebar",
  unreadable: "warn",
  problem: "warn",
};

export interface RowMarks {
  /** What describes the row, drawn dimmed between its name and its marks: a vault's branch, where a link points. */
  describe?: string;
  /** It cut to `room` columns, when the row cuts it its own way (a link's place from its front, its state kept). */
  fit?: (room: number) => string;
  /** Its index's state, in the last column. */
  index?: IndexState;
}

/** What the disk says of a row, read once for it — the tree built again reads it again — and only for a row drawn. */
interface Facts {
  /** A folder you may not list, a file you may not read. */
  unreadable: boolean;
  /** A link whose target isn't there. */
  broken: boolean;
  /** A note of the vault's own tree over `walk.max_file_size`: listed, never read. */
  big: boolean;
  /** A vault's row: whether its index is on the disk, and its branch when it's a repository's top. */
  vault?: { indexed: boolean; branch: string | null };
  /** A folder outside the vault open's tree that is busy (VV-D8, D237): a busy name, and it looks generated — why. */
  busy?: BusyWhy | null;
}

/** Whether `abs` is there and you may not reach it so: `EACCES` or `EPERM`. */
function denied(abs: string, mode: number): boolean {
  try {
    accessSync(abs, mode);
    return false;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "EACCES" || code === "EPERM";
  }
}

/** The explorer's rows' marks (VV-D9). */
export class Marks {
  private readonly facts = new WeakMap<TreeRow, Facts>();
  /** The folders holding a note still to parse, while the vault open's index is built. */
  private pending: { graph: object; count: number; dirs: Set<string> } | null = null;

  constructor(private readonly app: App) {}

  /** A row's marks. */
  of(row: TreeRow): RowMarks {
    const f = this.factsOf(row);
    const out: RowMarks = {};
    const describe = this.describe(row, f);
    if (describe) out.describe = describe;
    if (row.link) out.fit = (room) => this.app.following.describe(row, room) ?? "";
    const index = this.index(row, f);
    if (index) out.index = typeof index === "string" ? index : "not-indexed";
    return out;
  }

  /** Why a row isn't indexed (VV-D9) — its `⊘` — in words a user knows; null when it has no `⊘`. */
  why(row: TreeRow): string | null {
    const n = this.index(row, this.factsOf(row));
    return typeof n === "object" ? this.words(n) : null;
  }

  /** Why the explorer's selected row isn't indexed, while the explorer has the keys: the status line says it. */
  selectedWhy(): string | null {
    const app = this.app;
    if (app.region !== "sidebar" || app.leftView !== "explorer") return null;
    const row = app.explorer.rows()[app.sidebar.selected];
    return row ? this.why(row) : null;
  }

  /**
   * Why the file `abs` isn't indexed (VV-D9), for Info: its row's `⊘`, or — a file's mark being its folder's when it
   * has none of its own — the nearest folder's above it, up to a vault's row. From the explorer's tree, where it's
   * listed (the file on screen is, revealed there); one no row lists, under a hidden folder (`.git`, home's `.config`,
   * opened by its path: D249), from the walk's reason for its path, as its row would say it. Null when it's indexed.
   */
  whyAt(abs: string): string | null {
    const ex = this.app.explorer;
    const rows = ex.treeRows();
    const path = ex.rowPath(abs);
    const listed = rows.findIndex((r) => r.path === path);
    if (listed < 0) {
      const out = ex.leftOutAt(abs);
      const rel = relative(this.app.loc.root, abs).split(sep).join("/");
      return out && !this.app.graph.known(rel) ? this.words({ by: "left-out", reason: out.why, at: out.at }) : null;
    }
    for (let at = listed; at >= 0; ) {
      const row = rows[at]!;
      const n = this.index(row, this.factsOf(row));
      if (n !== undefined || row.kind === "root") return typeof n === "object" ? this.words(n) : null;
      // Its folder's: the row above it a level up.
      const depth = row.depth;
      do at--;
      while (at >= 0 && rows[at]!.depth >= depth);
    }
    return null;
  }

  /** A row's reason for its `⊘`, in words: `generated (node_modules), git-ignored`, `on another disk`… */
  private words(n: NotIndexed): string {
    switch (n.by) {
      case "link":
        return LINK_WORDS[n.reason] ?? n.reason;
      case "busy":
        return busyWords(n.name, n.busy);
      case "big":
        return "over walk.max_file_size";
      case "capped":
        return `past home's limit of ${HOME_LIMITS[n.cap].toLocaleString("en-US")} ${n.cap}`;
      case "left-out":
        return this.leftOutWords(n.reason, n.at);
    }
  }

  /** Why the vault open's walk leaves `at` out (`exclusion`'s reason, VV-D8), in words. */
  private leftOutWords(reason: string, at: string): string {
    const name = basename(at);
    switch (reason) {
      case "busy folder": {
        // Which of the rule's two things hold, asked of the vault's filter as its walk asked it (D237).
        const rel = relative(this.app.loc.root, at).split(sep).join("/");
        return busyWords(name, this.app.graph.filter.busyWhy(rel) ?? { ignored: false, noNotes: true });
      }
      case ".gitignore":
        return "git-ignored";
      case ANOTHER_DISK:
        return "on another disk";
      case "system folder":
        return `a system folder (${name})`;
      case "Downloads":
        return "home's Downloads";
      case "always skipped":
        return name === ".git" ? "git's own folder" : "slipbox's own folder";
      default:
        // `walk.exclude`, `hidden`, `not a note or text file`: said as they are.
        return reason;
    }
  }

  /**
   * What describes the row (VV-D9): a vault's branch when it's a repository's top — a worktree's after ⎇, since every
   * worktree has its repository's name and the branch is what tells them apart (17.19); a link's target, and whether
   * it's followed (VV-D6: `→ /mnt/disk/data  not followed`); a folder of home where another disk is mounted, why its
   * walk leaves it out (VV-D2: `another disk`).
   */
  private describe(row: TreeRow, f: Facts): string | undefined {
    if (row.link) return this.app.following.describe(row) ?? undefined;
    if (this.mountPoint(row)) return ANOTHER_DISK;
    return f.vault?.branch ?? undefined;
  }

  /**
   * Whether the row is a folder of home where another disk is mounted (VV-D2) — the mount point itself, not a folder
   * in it, which carries its reason down (`outsideRows`) once you unfold it.
   */
  private mountPoint(row: TreeRow): boolean {
    if (row.leftOut !== ANOTHER_DISK) return false;
    const rel = relative(this.app.loc.root, this.app.explorer.rowAbs(row)).split(sep).join("/");
    return this.app.graph.filter.mountAt(rel);
  }

  /** The row's index's state, or none: a file's only when it isn't its folder's. Not indexed: the rule that says so. */
  private index(row: TreeRow, f: Facts): Exclude<IndexState, "not-indexed"> | NotIndexed | undefined {
    if (f.unreadable) return "unreadable";
    if (f.broken) return "problem";
    // A link the walk didn't go through (VV-D6): not indexed — not followed, or its target not answering; a second
    // name for a folder of the vault is that folder's.
    if (row.link?.reason)
      return row.link.reason === LINK_REASON.within ? undefined : { by: "link", reason: row.link.reason };
    const app = this.app;
    const home = app.graph.home;
    // The vault open, in a view above it: indexing while its index is built (home's walk first, VV-D2).
    if (row.root?.here) return app.indexing || home?.walked === null ? "indexing" : "indexed";
    // Another vault: indexed when its index is on the disk; indexing while the background index builds it (20.9).
    if (row.kind === "root") {
      if (row.root && app.watch.autoIndex?.status.current === row.root.abs) return "indexing";
      return f.vault?.indexed ? "indexed" : undefined;
    }
    // What the walk leaves out (VV-D8), listed from the disk.
    if (row.leftOut) return { by: "left-out", reason: row.leftOut, at: row.leftOutAt ?? app.explorer.rowAbs(row) };
    if (row.outside) {
      const abs = app.explorer.rowAbs(row);
      // In a folder the vault open's walk leaves out, a note reached by a link is indexed all the same (20.8).
      if (row.kind === "note" && isInside(app.loc.root, abs) && abs !== app.loc.root)
        return app.graph.notes.has(relative(app.loc.root, abs).split(sep).join("/")) ? "indexed" : undefined;
      // Anywhere, a busy folder is never indexed.
      return f.busy ? { by: "busy", name: row.name, busy: f.busy } : undefined;
    }
    // The vault open's own tree.
    if (row.kind === "note") return f.big ? { by: "big" } : undefined;
    // A folder the walk hasn't been in: home's past its cap, not indexed; else to come (home's walk, the watcher's).
    if (row.unwalked) return home?.capped && home.walked !== null ? { by: "capped", cap: home.capped } : "indexing";
    if (home?.walked === null || this.pendingDirs().has(row.path)) return "indexing";
    return "indexed";
  }

  /** The folders holding a note still to parse, while the vault open's index is built in the background. */
  private pendingDirs(): Set<string> {
    const g = this.app.graph;
    if (!this.app.indexing) return new Set();
    const count = g.pendingCount;
    if (this.pending?.graph === g && this.pending.count === count) return this.pending.dirs;
    const dirs = new Set<string>();
    for (const rel of g.pendingPaths())
      for (let i = rel.lastIndexOf("/"); i > 0; i = rel.lastIndexOf("/", i - 1)) {
        const dir = rel.slice(0, i);
        if (dirs.has(dir)) break; // and every folder above it
        dirs.add(dir);
      }
    this.pending = { graph: g, count, dirs };
    return dirs;
  }

  private factsOf(row: TreeRow): Facts {
    let f = this.facts.get(row);
    if (f) return f;
    const abs = this.app.explorer.rowAbs(row);
    // A link the walk didn't go through (VV-D6): what it leads to is never gone near here — the walk said what it is.
    // Where another disk is mounted (VV-D2) neither: one that stops answering would hang the tree. What's in it, once
    // you unfold it, is read as you asked.
    if (row.link?.reason || this.mountPoint(row)) {
      f = { unreadable: false, broken: !!row.link && !row.link.target, big: false };
      this.facts.set(row, f);
      return f;
    }
    f = { unreadable: false, broken: false, big: false };
    if (row.kind === "note") {
      try {
        if (lstatSync(abs).isSymbolicLink() && !existsSync(abs)) f.broken = true;
        else if (denied(abs, fsConstants.R_OK)) f.unreadable = true;
        else if (!row.outside && !this.app.graph.notes.has(row.path))
          f.big = statSync(abs).size > this.app.graph.filter.maxFileSize && this.app.graph.filter.isNoteName(row.name);
      } catch {}
    } else {
      f.unreadable = denied(abs, fsConstants.R_OK | fsConstants.X_OK);
      if (row.kind === "root" && row.root) f.vault = this.vaultFacts(row.root.abs);
      else if (row.outside && !row.leftOut) f.busy = busyFolderWhyAt(abs, this.app.config.walk);
    }
    this.facts.set(row, f);
    return f;
  }

  private vaultFacts(abs: string): NonNullable<Facts["vault"]> {
    const indexed = existsSync(join(cacheDir({ key: vaultKey(abs) }), "index.json"));
    const c = checkoutOf(abs);
    if (!c || c.root !== abs) return { indexed, branch: null };
    const h = headOf(c);
    const head = h.branch ?? h.commit?.slice(0, 7) ?? null;
    if (!head) return { indexed, branch: null };
    return { indexed, branch: c.worktree ? `${this.app.glyphs.branch} ${head}` : head };
  }
}
