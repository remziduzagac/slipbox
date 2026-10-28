// Outline headings from positioned data nodes.

import type { Root } from "mdast";
import type { HeadingInfo } from "../../markdown/parse/contracts.ts";
import { slugify } from "../../markdown/parse/headings.ts";
import type { DataField } from "./contracts.ts";

/** A data file's outline: its sections (TOML, INI) and its tree's branches (YAML, JSON), in order. */
export function dataOutline(tree: Root): HeadingInfo[] {
  const out: HeadingInfo[] = [];
  for (const n of tree.children) {
    if (n.type === "heading") {
      const text = n.children.map((c) => ("value" in c ? c.value : "")).join("");
      out.push({ depth: n.depth, text, slug: slugify(text), line: n.position?.start.line ?? 1 });
    }
    const f = n as unknown as DataField;
    if (f.type === "dataField" && f.tree?.branch)
      out.push({ depth: Math.min(6, f.tree.lasts.length + 1), text: f.key, slug: slugify(f.key), line: f.keyLine });
  }
  return out;
}
