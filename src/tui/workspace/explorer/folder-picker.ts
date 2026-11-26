// The folder picker a move asks with (18.8): the vault's folders as a tree, like the explorer's.

import { posix } from "node:path";
import { match } from "../../shell/overlays/match.ts";
import type { App, ListItem } from "../../app/runtime/app.ts";

/**
 * Pick a folder of the vault (18.8): a tree like the explorer's — its folds to begin with — the
 * root first; ← folds, → unfolds; typing filters to the matching folders under their parents.
 */
export function pickFolder(
  app: App,
  opts: {
    title: string;
    current: string;
    exclude: (dir: string) => boolean;
    pick: (dir: string) => void;
  },
): void {
  const g = app.glyphs;
  const open = new Set(app.explorer.expanded);
  for (let d = opts.current; d; d = posix.dirname(d) === "." ? "" : posix.dirname(d)) open.add(d); // where it is, unfolded
  const dirs = [...new Set(app.graph.dirs)]
    .filter((d) => d && !opts.exclude(d))
    .sort((a, b) => {
      const pa = a.split("/");
      const pb = b.split("/");
      for (let i = 0; i < Math.min(pa.length, pb.length); i++)
        if (pa[i] !== pb[i]) return pa[i]!.localeCompare(pb[i]!, undefined, { sensitivity: "base" });
      return pa.length - pb.length;
    });
  const row = (d: string, unfolded: boolean, context = false): ListItem => ({
    label: `${"  ".repeat(d.split("/").length)}${unfolded ? g.dirOpen : g.dirClosed} ${posix.basename(d)}`,
    hint: d === opts.current ? "here" : "",
    data: d,
    ...(context ? { context } : {}),
  });
  const source = (input: string): ListItem[] => {
    const out: ListItem[] = [
      { label: `${g.dirOpen} / (the vault's top)`, hint: opts.current === "" ? "here" : "", data: "" },
    ];
    const q = input.trim();
    if (q) {
      // The matches, with their parents for where they are; enter takes the first match.
      const shown = new Set<string>();
      const hits = new Set<string>();
      for (const d of dirs) {
        if (!match(q, d)) continue;
        hits.add(d);
        const parts = d.split("/");
        for (let i = 1; i <= parts.length; i++) shown.add(parts.slice(0, i).join("/"));
      }
      out[0]!.context = true;
      return [...out, ...dirs.filter((d) => shown.has(d)).map((d) => row(d, true, !hits.has(d)))];
    }
    for (const d of dirs) {
      const parts = d.split("/");
      if (parts.slice(0, -1).every((_, i) => open.has(parts.slice(0, i + 1).join("/")))) out.push(row(d, open.has(d)));
    }
    return out;
  };
  const first = source("");
  app.overlays.openList({
    title: opts.title,
    items: [],
    source,
    selected: Math.max(
      0,
      first.findIndex((it) => it.data === opts.current),
    ),
    accept: (it) => opts.pick(it.data as string),
    fold: (it, unfold) => {
      // As in the explorer, a folder folds whatever it holds; what unfolds under it here is its folders.
      const d = it.data as string;
      if (!d || unfold === open.has(d)) return false;
      if (unfold) open.add(d);
      else open.delete(d);
      return true;
    },
  });
}
