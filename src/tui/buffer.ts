// A buffer: one open note, its parse, and its layouts cached per width (3.3). Views (panes) hold
// a buffer plus their own scroll position; two panes may show the same buffer.
//
// Phase 2 has no editing, so a buffer is never dirty and an external change always reloads
// silently (5.3). The fields for "changed on disk" exist so the change is surfaced the moment it
// lands (5.4), not discovered later.

import type { Glyphs } from "../core/glyphs.ts";
import type { Graph } from "../core/graph.ts";
import { readText, type Stamp, stamp } from "../core/fsutil.ts";
import type { Layout } from "../core/layout/ir.ts";
import { layoutNote } from "../core/note.ts";
import { layoutSource } from "../core/layout/source.ts";
import { type ParsedNote, parseMarkdown } from "../core/parse.ts";

export class NoteBuffer {
  source = "";
  parsed: ParsedNote = parseMarkdown("");
  stamp: Stamp | null = null;
  invalidUtf8 = false;
  deleted = false;
  /** When the file last changed under us (ms since epoch), for the change marker. */
  changedAt = 0;
  private layouts = new Map<string, Layout>();

  constructor(
    /** Vault-relative path, or null for a file outside the vault (e.g. the scratch). */
    readonly rel: string | null,
    readonly abs: string,
    /** Vault-relative path for anything inside the vault, else the absolute path. */
    readonly key: string = rel ?? abs,
  ) {}

  get name(): string {
    return (this.rel ?? this.abs).split("/").pop()!;
  }

  /** Read from disk. Returns false when the file is gone. */
  load(): boolean {
    try {
      const d = readText(this.abs);
      this.source = d.text;
      this.invalidUtf8 = d.invalidUtf8;
      this.parsed = parseMarkdown(d.text);
      this.stamp = stamp(this.abs);
      this.deleted = false;
      this.layouts.clear();
      return true;
    } catch {
      this.deleted = true;
      return false;
    }
  }

  /** True when the file on disk differs from what we loaded. */
  changedOnDisk(): boolean {
    const s = stamp(this.abs);
    if (!s) return !this.deleted;
    return !this.stamp || s.mtimeMs !== this.stamp.mtimeMs || s.size !== this.stamp.size;
  }

  invalidateLayouts(): void {
    this.layouts.clear();
  }

  /** The raw markdown as a layout (source mode, 4.13), its headings borrowed from the render. */
  sourceLayout(width: number, wrap: boolean, glyphs: Glyphs): Layout {
    const key = `src:${width}:${wrap ? 1 : 0}`;
    let l = this.layouts.get(key);
    if (!l) {
      const headings = this.layout(200, glyphs, false, null).headings.map(({ level, text, slug, src }) => ({ level, text, slug, src }));
      l = layoutSource(this.source, { width, wrap, headings });
      if (this.layouts.size >= 6) this.layouts.delete(this.layouts.keys().next().value!);
      this.layouts.set(key, l);
    }
    return l;
  }

  layout(width: number, glyphs: Glyphs, showUrls: boolean, graph: Graph | null): Layout {
    const key = `${width}:${glyphs.mode}:${showUrls ? 1 : 0}`;
    let l = this.layouts.get(key);
    if (!l) {
      l = layoutNote(this.parsed, graph, this.rel, { width, glyphs, showUrls });
      // Keep the last few widths (a drag back and forth, a toggle and back): evict the oldest.
      if (this.layouts.size >= 6) this.layouts.delete(this.layouts.keys().next().value!);
      this.layouts.set(key, l);
    }
    return l;
  }
}
