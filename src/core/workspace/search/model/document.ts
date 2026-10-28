// Search document reading and frontmatter/heading admission.

import { basename } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { tagName, tagsInLine } from "../../../documents/markdown/tags.ts";
import type { Doc, DocLine, Node } from "./contracts.ts";
import { BAND_MAX, cut, pieces, section, tokensOf, units } from "./sections.ts";
import { ATX, FENCE, NOT_PARAGRAPH, SETEXT } from "./syntax.ts";

/** Frontmatter bigger than this isn't read for a title, aliases and tags. */
export const MAX_FRONTMATTER = 64 * 1024;

/** The strings a frontmatter value holds: a list, or one string (split on commas for tags). */
export function strings(v: unknown, split = false): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" || typeof x === "number").map(String);
  if (typeof v === "string") return split ? v.split(/[,\s]+/).filter(Boolean) : [v];
  return [];
}

/**
 * A file read for search: a note's title, aliases, tags and headings, and its sections — its
 * containment tree (headings: ATX, and setext under a paragraph line; never inside fenced code; its
 * frontmatter and any text before the first heading its root's) cut to the size band. A file with no
 * headings to cut at (a data file) is one section, or packed into band-sized chunks at blank lines.
 */
export function indexDoc(rel: string, text: string, group: "note" | "data" | "text"): Doc {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const all: DocLine[] = lines.map((t, i) => ({ line: i + 1, text: t }));
  const name = basename(rel).replace(/\.[^.]+$/, "");
  if (group !== "note") {
    const sections =
      tokensOf(text) > BAND_MAX
        ? pieces("", "chunk", "", all)
        : [section("§:file", "", all, all.map((l) => l.text).join("\n"))];
    return { title: basename(rel), aliases: [], tags: [], headings: [], sections, units: units(all) };
  }
  let fm: Record<string, unknown> | null = null;
  let body = 0;
  if (lines[0] === "---" || lines[0] === "+++") {
    const close = lines[0] === "---" ? /^(?:---|\.\.\.)\s*$/ : /^\+\+\+\s*$/;
    const end = lines.findIndex((l, k) => k > 0 && close.test(l));
    if (end > 0) {
      body = end + 1;
      const raw = lines.slice(1, end).join("\n");
      if (raw.length <= MAX_FRONTMATTER) {
        try {
          const v = lines[0] === "---" ? parseYaml(raw, { logLevel: "error", uniqueKeys: false }) : parseToml(raw);
          if (v && typeof v === "object" && !Array.isArray(v)) fm = v as Record<string, unknown>;
        } catch {}
      }
    }
  }
  const tags = new Set<string>();
  for (const t of strings(fm?.tags, true)) {
    const n = tagName(t);
    if (n) tags.add(n);
  }
  let title = typeof fm?.title === "string" && fm.title.trim() ? fm.title.trim() : "";
  const headings: { line: number; text: string }[] = [];
  // The tree: the root holds the frontmatter and the lead text; a heading owns what follows it, a
  // lower one nested under it, to the next as high.
  const root: Node = { heading: "", level: 0, lines: all.slice(0, body), text: "", children: [] };
  const stack: Node[] = [root];
  const open = (heading: string, level: number, own: DocLine[]) => {
    headings.push({ line: own[0]!.line, text: heading });
    while (stack.length > 1 && stack[stack.length - 1]!.level >= level) stack.pop();
    const node: Node = { heading, level, lines: own, text: "", children: [] };
    stack[stack.length - 1]!.children.push(node);
    stack.push(node);
  };
  let fence: string | null = null;
  for (let i = body; i < lines.length; i++) {
    const line = lines[i]!;
    const top = stack[stack.length - 1]!;
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && !line.slice(f[0].length).trim()) fence = null;
      top.lines.push(all[i]!);
      continue;
    }
    if (f) {
      fence = f[1]!;
      top.lines.push(all[i]!);
      continue;
    }
    const atx = ATX.exec(line);
    if (atx) {
      const heading = (atx[2] ?? "").trim();
      if (!title && atx[1] === "#" && heading) title = heading;
      open(heading, atx[1]!.length, [all[i]!]);
      continue;
    }
    // A setext underline: the paragraph line above it is the heading.
    const above = top.lines[top.lines.length - 1];
    if (
      SETEXT.test(line) &&
      above &&
      above.line === i &&
      i - 1 >= body &&
      !NOT_PARAGRAPH.test(lines[i - 1]!) &&
      !(top !== root && top.lines.length === 1)
    ) {
      top.lines.pop();
      if (!title && line.trim().startsWith("=")) title = above.text.trim();
      open(above.text.trim(), line.trim().startsWith("=") ? 1 : 2, [above, all[i]!]);
      continue;
    }
    for (const t of tagsInLine(line)) tags.add(t.name);
    top.lines.push(all[i]!);
  }
  // Each node's own text, before the band merges any: where a hit opens is found among these.
  const own: DocLine[][] = [];
  const textOf = (n: Node) => {
    n.text = n.lines.map((l) => l.text).join("\n");
    if (n.lines.length) own.push([...n.lines]);
    n.children.forEach(textOf);
  };
  textOf(root);
  return {
    title: title || name,
    aliases: [...strings(fm?.aliases), ...strings(fm?.alias)],
    tags: [...tags],
    headings,
    sections: cut(root),
    units: own,
  };
}
