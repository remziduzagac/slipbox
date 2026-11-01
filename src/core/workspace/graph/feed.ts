// Incremental file mutations and ordered change/build/retarget delivery for one Graph.
import { extractNote } from "./graph-extract.ts";
import type { LinkRef, NoteEntry, Retarget, Target, VaultChange } from "./graph-types.ts";
import type { LinkIndex } from "../links/links.ts";
import type { NoteFile } from "../walk/walk.ts";
import type { EditorOverlay } from "./overlays/editor.ts";
import { namesakeLinks } from "./queries/indexes.ts";

interface FeedGraph {
  readonly notes: Map<string, NoteEntry>;
  readonly assets: Map<string, string[]>;
  readonly reached: Set<string>;
  readonly index: LinkIndex;
  readonly thorough: boolean;
  readonly pendingCount: number;
  ensureAll(): void;
  resolveLink(link: Pick<LinkRef, "kind" | "target">, fromRel: string): Target;
}
interface FeedHooks {
  invalidate(): void;
  dirty(): void;
  pairMove(hash: string, rel: string, side: "went" | "came"): void;
  forgetFileLinks(rel?: string): void;
  aliases(): Map<string, string[]>;
}

export class GraphFeed {
  constructor(
    private readonly graph: FeedGraph,
    private readonly unparsed: Map<string, NoteFile>,
    private readonly overlays: Map<string, EditorOverlay>,
    private readonly hooks: FeedHooks,
  ) {}

  built(): void {
    for (const fn of this.buildListeners) {
      try {
        fn();
      } catch {}
    }
  }

  private readonly buildListeners = new Set<() => void>();

  /** After each build: what the graph knows may be new (the TUI's buffers opened before it knew their files). */
  onBuild(fn: () => void): () => void {
    this.buildListeners.add(fn);
    return () => this.buildListeners.delete(fn);
  }

  private readonly listeners = new Set<(c: VaultChange) => void>();

  /** Hear of every change to the vault's files (6.7); the returned function stops it. */
  onChange(fn: (c: VaultChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(c: VaultChange): void {
    for (const fn of this.listeners) {
      try {
        fn(c);
      } catch {}
    }
  }

  /** Files moved (by a rename here, or seen by their content): said to the listeners. */
  moved(pairs: [string, string][]): void {
    for (const [from, to] of pairs) this.emit({ kind: "moved", from, to });
  }

  /** Incremental single-file update (1.8). Returns false when the file is not part of the vault. */
  updateFile(rel: string, file: NoteFile): boolean {
    const g = this.graph;
    const isNew = !g.notes.has(rel);
    const watch = isNew ? this.namesakeLinks(rel) : null;
    this.unparsed.delete(rel);
    this.hooks.dirty();
    const entry = extractNote(file);
    // An editor's unsaved text still stands for the note: the file's entry is kept behind it.
    const over = this.overlays.get(rel);
    if (over) over.disk = entry;
    else g.notes.set(rel, entry);
    if (isNew && entry.size > 0) this.hooks.pairMove(entry.hash, rel, "came");
    if (isNew) g.index.add(rel);
    this.hooks.invalidate();
    this.emit({ kind: "changed", path: rel });
    if (watch) this.reportRetargets(watch);
    return true;
  }

  private readonly retargetListeners = new Set<(r: Retarget[]) => void>();

  /** Told when a note coming or going sends links by name elsewhere (not when they break or heal). */
  onRetarget(fn: (r: Retarget[]) => void): () => void {
    this.retargetListeners.add(fn);
    return () => this.retargetListeners.delete(fn);
  }

  /**
   * Before a note comes or goes: the links by name it could send elsewhere — only when another note or
   * an alias has its name, so a unique name costs nothing — each where it reaches now. Null when none can.
   */
  private namesakeLinks(rel: string): { from: string; link: LinkRef; was: string }[] | null {
    if (!this.retargetListeners.size) return null;
    return namesakeLinks(this.graph, rel, this.hooks.aliases);
  }

  /** After: the watched links that reach somewhere else now, told to whoever listens. */
  private reportRetargets(watch: { from: string; link: LinkRef; was: string }[]): void {
    const g = this.graph;
    const moved: Retarget[] = [];
    for (const w of watch) {
      if (!g.notes.has(w.from)) continue;
      const r = g.resolveLink(w.link, w.from);
      if ((r.resolvedKind === "note" || r.resolvedKind === "file") && r.path && r.path !== w.was)
        moved.push({ from: w.from, line: w.link.line, target: w.link.target, was: w.was, now: r.path });
    }
    if (!moved.length) return;
    for (const fn of this.retargetListeners) {
      try {
        fn(moved);
      } catch {}
    }
  }

  /** Index an attachment by file name; true if the index changed. */
  addAsset(rel: string): boolean {
    const g = this.graph;
    const key = rel
      .slice(rel.lastIndexOf("/") + 1)
      .normalize("NFC")
      .toLowerCase();
    const list = g.assets.get(key);
    if (!list) g.assets.set(key, [rel]);
    else if (!list.includes(rel)) list.push(rel);
    else return false;
    this.hooks.invalidate();
    this.hooks.forgetFileLinks(); // a path in a data file or a comment may resolve now
    this.emit({ kind: "changed", path: rel });
    return true;
  }

  /** Forget an attachment; true if the index changed. */
  removeAsset(rel: string): boolean {
    const g = this.graph;
    const key = rel
      .slice(rel.lastIndexOf("/") + 1)
      .normalize("NFC")
      .toLowerCase();
    const before = g.assets.get(key);
    if (!before?.includes(rel)) return false;
    const list = before.filter((p) => p !== rel);
    if (list.length) g.assets.set(key, list);
    else g.assets.delete(key);
    this.hooks.forgetFileLinks(); // and paths to it no longer resolve
    this.hooks.invalidate();
    this.emit({ kind: "removed", path: rel });
    return true;
  }

  removeFile(rel: string): void {
    const g = this.graph;
    // Its file is gone: never parsed now, when the namesakes' look reads every note (an undone move's
    // old path warned "unreadable: ENOENT").
    this.unparsed.delete(rel);
    const watch = g.notes.has(rel) ? this.namesakeLinks(rel) : null;
    g.reached.delete(rel);
    // A move is known by the file's text, not by what an editor had of it.
    const gone = this.overlays.get(rel)?.disk ?? g.notes.get(rel);
    this.overlays.delete(rel);
    if (!g.notes.delete(rel)) return;
    if (gone && gone.size > 0) this.hooks.pairMove(gone.hash, rel, "went");
    this.hooks.dirty();
    g.index.remove(rel);
    this.hooks.invalidate();
    this.emit({ kind: "removed", path: rel });
    if (watch) this.reportRetargets(watch);
  }

  /** A data file changed or went: its links are read again, and backlinks recomputed. */
  fileChanged(rel: string): void {
    this.hooks.forgetFileLinks(rel);
    this.hooks.invalidate();
    this.emit({ kind: "changed", path: rel });
  }
}
