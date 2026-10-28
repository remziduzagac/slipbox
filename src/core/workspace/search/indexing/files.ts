// Index catch-up and file admission over the original live graph/index.

import { statSync } from "node:fs";
import { classify } from "../../../documents/model/filetypes.ts";
import { readText } from "../../../foundation/platform/fsutil.ts";
import type { Graph } from "../../graph/graph.ts";
import type { SearchIndex } from "../search-index.ts";
import { indexDoc } from "../model/document.ts";

/** The files search reads, as the walk last saw them: notes and data files. */
export function searchable(g: Graph): Map<string, { size: number; mtime: number; group: "note" | "data" }> {
  const out = new Map<string, { size: number; mtime: number; group: "note" | "data" }>();
  for (const [rel, e] of g.notes) out.set(rel, { size: e.size, mtime: e.mtimeMs, group: "note" });
  for (const rel of g.filePaths()) {
    if (classify(rel, g.config.walk.extensions).group !== "data") continue;
    try {
      const st = statSync(g.abs(rel));
      out.set(rel, { size: st.size, mtime: st.mtimeMs, group: "data" });
    } catch {}
  }
  return out;
}

// -------------------------------------------------------------------------------------------
// Keeping the index
/**
 * One file (re)indexed from disk — a change the vault's feed reported — or taken out when it's
 * gone, or no longer a note or data file of the vault. `group`: what it is, when the caller knows.
 */
export function indexFile(g: Graph, idx: SearchIndex, rel: string, group?: "note" | "data"): void {
  let kind = group;
  if (!kind) {
    const k = classify(rel, g.config.walk.extensions).group;
    kind = k === "note" && g.notes.has(rel) ? "note" : k === "data" && g.filePaths().includes(rel) ? "data" : undefined;
  }
  let st: { size: number; mtimeMs: number } | null = null;
  try {
    st = statSync(g.abs(rel));
  } catch {}
  if (!kind || !st) return idx.remove(rel);
  try {
    const text = readText(g.abs(rel)).text;
    const d = indexDoc(rel, text, kind);
    idx.put(
      rel,
      {
        group: kind,
        title: d.title,
        aliases: d.aliases,
        tags: d.tags,
        headings: d.headings.map((h) => h.text).filter(Boolean),
        body: text,
      },
      { size: st.size, mtime: st.mtimeMs },
    );
  } catch {
    idx.remove(rel);
  }
}

/**
 * Bringing the index up to the vault: what's gone taken out, what's new or changed (by size and
 * mtime) indexed — worked through in steps (the TUI's idle slices), or at once (`catchUp`). Done
 * the first time, the index is complete: searches use it from then on.
 */
export class IndexJob {
  readonly todo: [string, "note" | "data"][];
  readonly removed: number;
  indexed = 0;

  constructor(
    private readonly g: Graph,
    private readonly idx: SearchIndex,
  ) {
    const want = searchable(g);
    const have = idx.indexed();
    const gone = [...have.keys()].filter((p) => !want.has(p));
    idx.batch(() => {
      for (const p of gone) idx.remove(p);
    });
    this.removed = gone.length;
    this.todo = [...want]
      .filter(([p, s]) => {
        const h = have.get(p);
        return !h || h.size !== s.size || h.mtime !== s.mtime;
      })
      .map(([p, s]) => [p, s.group]);
  }

  get done(): boolean {
    return this.indexed >= this.todo.length;
  }

  /** Index some more, for about `budgetMs` (a hundred files at a time); true when it's all done. */
  step(budgetMs = Number.POSITIVE_INFINITY): boolean {
    const start = performance.now();
    while (!this.done && performance.now() - start < budgetMs) {
      const batch = this.todo.slice(this.indexed, this.indexed + 100);
      this.idx.batch(() => {
        for (const [p, group] of batch) indexFile(this.g, this.idx, p, group);
      });
      this.indexed += batch.length;
    }
    if (this.done && !this.idx.complete) this.idx.markComplete();
    return this.done;
  }
}

/** The index brought up to the vault, at once. */
export function catchUp(g: Graph, idx: SearchIndex): { indexed: number; removed: number } {
  const job = new IndexJob(g, idx);
  job.step();
  return { indexed: job.indexed, removed: job.removed };
}
