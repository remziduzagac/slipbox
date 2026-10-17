// A row's marks in the explorer (VV-D9), at its right in columns: the index's state in the last — indexed, indexing,
// not indexed, can't read, a problem — and, between the name and the marks, dimmed, what describes the row: a vault's
// branch (a worktree's after ⎇), where a link points. git's mark, in the column before the index's, is drawn as it
// was (draw-panels.ts). Each mark is one column wide in every terminal, in the nerd, unicode and ascii glyphs
// (`core/glyphs.ts`); none is an emoji.

import { accessSync, constants as fsConstants, existsSync, lstatSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { checkoutOf, headOf } from "../core/git.ts";
import type { Glyphs } from "../core/glyphs.ts";
import { cacheDir, vaultKey } from "../core/paths.ts";
import type { Role } from "../core/theme/theme.ts";
import { isInside } from "../core/vault.ts";
import { ANOTHER_DISK, busyFolderAt, LINK_REASON } from "../core/walk.ts";
import type { App } from "./app.ts";
import type { TreeRow } from "./explorer.ts";

/**
 * What a row says of its vault's index (VV-D9): read into it; being read now; left out of it (a busy folder, home's
 * skip list, what `.gitignore` or `walk.exclude` leaves out, a note too big to read); not yours to read; a problem (a
 * link whose target isn't there).
 */
export type IndexState = "indexed" | "indexing" | "not-indexed" | "unreadable" | "problem";

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
  /** A folder outside the vault open's tree that is busy (VV-D8, D237): a busy name, and it looks generated. */
  busy?: boolean;
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
    if (index) out.index = index;
    return out;
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

  /** The row's index's state, or none: a file's only when it isn't its folder's. */
  private index(row: TreeRow, f: Facts): IndexState | undefined {
    if (f.unreadable) return "unreadable";
    if (f.broken) return "problem";
    // A link the walk didn't go through (VV-D6): not indexed — not followed, or its target not answering; a second
    // name for a folder of the vault is that folder's.
    if (row.link?.reason) return row.link.reason === LINK_REASON.within ? undefined : "not-indexed";
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
    if (row.leftOut) return "not-indexed";
    if (row.outside) {
      const abs = app.explorer.rowAbs(row);
      // In a folder the vault open's walk leaves out, a note reached by a link is indexed all the same (20.8).
      if (row.kind === "note" && isInside(app.loc.root, abs) && abs !== app.loc.root)
        return app.graph.notes.has(relative(app.loc.root, abs).split(sep).join("/")) ? "indexed" : undefined;
      // Anywhere, a busy folder is never indexed.
      return f.busy ? "not-indexed" : undefined;
    }
    // The vault open's own tree.
    if (row.kind === "note") return f.big ? "not-indexed" : undefined;
    // A folder the walk hasn't been in: home's past its cap, not indexed; else to come (home's walk, the watcher's).
    if (row.unwalked) return home?.capped && home.walked !== null ? "not-indexed" : "indexing";
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
      else if (row.outside && !row.leftOut) f.busy = busyFolderAt(abs, this.app.config.walk);
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
