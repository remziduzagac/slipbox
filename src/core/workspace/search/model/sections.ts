// Original section names, token bands, packing and containment cuts.

import type { DocLine, DocSection, Node } from "./contracts.ts";
import { FENCE } from "./syntax.ts";

// -------------------------------------------------------------------------------------------
// What's read
/**
 * The size band sections are cut to (scout's Stage 4, so a scout result and a slipbox hit are the same
 * section): a section is kept on its own tokens — its text without its sub-sections' — from 400 to
 * 1500; above, split at paragraphs; below, merged into its parent. A starting point, tunable.
 */
export const BAND_MIN = 400;

export const BAND_MAX = 1500;

/** A text's tokens, approximated as its UTF-8 bytes / 4. */
export function tokensOf(text: string): number {
  return Buffer.byteLength(text, "utf8") / 4;
}

/** A name segment, encoded as scout's grammar has it: `%`, `~`, `/`, `#`, in that order. */
export function segment(text: string): string {
  return text.replaceAll("%", "%25").replaceAll("~", "%7E").replaceAll("/", "%2F").replaceAll("#", "%23");
}

/** Sibling segments made distinct: a later one normKey-equal to an earlier gets `~2`, `~3`. */
export function distinct(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.normalize("NFC").toLowerCase();
    const k = (seen.get(key) ?? 0) + 1;
    seen.set(key, k);
    return k === 1 ? n : `${n}~${k}`;
  });
}

/** A text's units for packing: its paragraphs (blank-line runs apart), a fenced block never cut. */
export function units(lines: DocLine[]): DocLine[][] {
  const out: DocLine[][] = [];
  let cur: DocLine[] = [];
  let fence: string | null = null;
  for (const l of lines) {
    const f = FENCE.exec(l.text);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
    } else if (f) fence = f[1]!;
    else if (!l.text.trim()) {
      if (cur.length) out.push(cur);
      cur = [];
      continue;
    }
    cur.push(l);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Units packed into band-sized pieces, in order: a piece is flushed when the next unit would take it
 * over the band's top; a last piece under its bottom goes onto the one before.
 */
export function pack(us: DocLine[][]): DocLine[][] {
  const pieces: DocLine[][] = [];
  let cur: DocLine[] = [];
  const text = (ls: DocLine[]) => ls.map((l) => l.text).join("\n");
  for (const u of us) {
    if (cur.length && tokensOf(`${text(cur)}\n\n${text(u)}`) > BAND_MAX) {
      pieces.push(cur);
      cur = [];
    }
    cur = [...cur, ...u];
  }
  if (cur.length) {
    if (pieces.length && tokensOf(text(cur)) < BAND_MIN)
      pieces[pieces.length - 1] = [...pieces[pieces.length - 1]!, ...cur];
    else pieces.push(cur);
  }
  return pieces;
}

export function section(name: string, heading: string, lines: DocLine[], text: string): DocSection {
  const nums = lines.map((l) => l.line);
  const tokens = tokensOf(text);
  return {
    name,
    heading,
    line: nums.length ? Math.min(...nums) : 1,
    end: nums.length ? Math.max(...nums) : 1,
    lines,
    tokens,
    oversized: tokens > BAND_MAX,
  };
}

/** Pieces cut from a node over the band: `§:part` (`§:chunk` with no structure), `~2`, `~3` — each kept. */
export function pieces(prefix: string, kind: "part" | "chunk", heading: string, lines: DocLine[]): DocSection[] {
  const cut = pack(units(lines));
  return cut.map((p, i) =>
    section(`${prefix}§:${kind}${i ? `~${i + 1}` : ""}`, heading, p, p.map((l) => l.text).join("\n")),
  );
}

/**
 * The tree cut to the band, bottom-up: each node on its own tokens — in the band, kept; over, split at
 * paragraphs into pieces; under, merged into its parent (heading line and body, after the parent's own
 * text), which is then tested carrying it. The root is kept whatever its size, split only when over.
 */
export function cut(root: Node): DocSection[] {
  const kept: DocSection[] = [];
  const visit = (node: Node, name: string | null): void => {
    const names = distinct(node.children.map((c) => segment(c.heading)));
    node.children.forEach((child, i) => {
      const childName = name === null ? names[i]! : `${name}/${names[i]}`;
      visit(child, childName);
      if (tokensOf(child.text) < BAND_MIN) {
        node.lines.push(...child.lines);
        node.text = node.text ? `${node.text}\n\n${child.text}` : child.text;
      } else if (tokensOf(child.text) > BAND_MAX)
        kept.push(...pieces(`${childName}/`, "part", child.heading, child.lines));
      else kept.push(section(childName, child.heading, child.lines, child.text));
    });
  };
  visit(root, null);
  if (tokensOf(root.text) > BAND_MAX) kept.push(...pieces("", "part", "", root.lines));
  else kept.push(section("§:file", "", root.lines, root.text));
  return kept.sort((a, b) => a.line - b.line);
}
