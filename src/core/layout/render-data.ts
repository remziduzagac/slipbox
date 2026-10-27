// A note's front matter as its properties, and a data file's rows (16.11–16.15): keys in a column, values coloured by
// their kind and linked where they're links, a tree's guides before them.

import type { Nodes, RootContent } from "mdast";
import { type CellLink, type DataComment, type DataField, fieldLink, type TreePlace } from "../documents/model/data.ts";
import { type Frontmatter, slugify } from "../documents/markdown/parse.ts";
import { expandTabs, sanitize } from "../foundation/text/sanitize.ts";
import type { Role } from "../theme/theme.ts";
import { padEnd, stringWidth, truncate } from "../foundation/text/width.ts";
import { parseWikiTarget } from "../documents/markdown/wikilink.ts";
import { A_BOLD, type Line, type Span } from "./ir.ts";
import { wrapSpans } from "./wrap.ts";
import { type Ctx, srcOf, breakHard, status, addLink } from "./render-context.ts";

export function frontmatterBlock(fm: Frontmatter | null, raw: string, src: number, ctx: Ctx, width: number): Line[] {
  const g = ctx.opts.glyphs;
  const title = truncate(` ${g.fmOpen} properties `, Math.max(0, width - 2));
  const top: Span[] = [
    { text: g.rule.repeat(2), role: "fm_border", attrs: 0 },
    { text: title, role: "fm_border", attrs: 0 },
    { text: g.rule.repeat(Math.max(0, width - 2 - stringWidth(title))), role: "fm_border", attrs: 0 },
  ];
  const out: Line[] = [{ spans: top, src }];
  const data = fm?.data;
  if (data && Object.keys(data).length) {
    const keys = Object.keys(data);
    const keyW = Math.min(20, Math.max(...keys.map((k) => stringWidth(sanitize(k)))), Math.floor(width / 3));
    let line = src + 1;
    for (const key of keys) {
      const value = formatValue(data[key]);
      const keyLine = findKeyLine(raw, key);
      const ksrc = keyLine >= 0 ? src + 1 + keyLine : line;
      const valueRows = wrapSpans(propertySpans(value, ksrc, ctx), Math.max(4, width - keyW - 3));
      valueRows.forEach((row, i) => {
        // A key longer than the column is cut with an ellipsis, never silently.
        const k = i === 0 ? padEnd(truncate(sanitize(key), keyW), keyW) : " ".repeat(keyW);
        out.push({
          spans: [{ text: ` ${k}`, role: "fm_key", attrs: 0 }, { text: "  ", role: "text", attrs: 0 }, ...row],
          src: ksrc,
        });
      });
      line++;
    }
  } else {
    raw.split("\n").forEach((text, i) => {
      for (const row of breakHard([{ text: ` ${expandTabs(sanitize(text))}`, role: "fm_value", attrs: 0 }], width))
        out.push({ spans: row, src: src + 1 + i });
    });
    if (fm?.error)
      for (const row of wrapSpans([{ text: sanitize(fm.error), role: "fm_error", attrs: 0 }], Math.max(1, width - 1)))
        out.push({ spans: [{ text: " ", role: "fm_error", attrs: 0 }, ...row], src });
  }
  out.push({
    spans: [{ text: g.rule.repeat(width), role: "fm_border", attrs: 0 }],
    src: src + raw.split("\n").length + 1,
  });
  return out;
}

/**
 * A property's value as spans: its text, and each wikilink in it a link (Obsidian's properties:
 * `related: "[[Plan]]"`), drawn and followed as the text's are.
 */
function propertySpans(value: string, src: number, ctx: Ctx): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of value.matchAll(/(!?)\[\[([^[\]\n]+)\]\]/g)) {
    if (m.index! > last) out.push({ text: value.slice(last, m.index), role: "fm_value", attrs: 0 });
    const w = parseWikiTarget(m[2]!);
    const kind = m[1] ? "embed" : "wiki";
    const s = status(ctx, kind, w.target);
    const shown =
      w.alias ?? (w.heading ? `${w.target} › ${w.heading}` : w.block ? `${w.target} ^${w.block}` : w.target);
    const id = addLink(ctx, {
      kind,
      target: w.target,
      heading: w.heading ?? (w.block ? `^${w.block}` : null),
      text: shown,
      status: s,
      src,
    });
    out.push({
      text: sanitize(shown),
      role: s === "unresolved" ? "link_unresolved" : s === "ambiguous" ? "link_ambiguous" : "wikilink",
      attrs: 0,
      link: id,
    });
    last = m.index! + m[0].length;
  }
  if (last < value.length || !out.length) out.push({ text: value.slice(last), role: "fm_value", attrs: 0 });
  return out;
}

/** A table's place in a data file's tree, if it has one. */
export function placeOf(n: RootContent): TreePlace | undefined {
  return (n.data as { tree?: TreePlace } | undefined)?.tree;
}

/**
 * The guides before a row of a data file's tree (16.12), from its place: `row`, its own first row
 * (├─ or └─ at its level); `down`, a row below it that is still its (a wrapped value, a table);
 * `above`, comment lines above it (its parent's line running down to it). The top level has none.
 */
export function guides(lasts: boolean[], at: "row" | "down" | "above", ctx: Ctx, room = Infinity): Span[] {
  const g = ctx.opts.glyphs;
  // A narrow pane keeps the innermost levels that fit in `room` (3 columns each), so the row's
  // text keeps its floor and nothing is cut; the outer ones go.
  const keep = Math.min(lasts.length, Math.max(0, Math.floor(room / 3)));
  if (keep < lasts.length) lasts = lasts.slice(lasts.length - keep);
  const n = lasts.length;
  if (!n) return [];
  let text = "";
  for (let i = 0; i < n - 1; i++) text += lasts[i] ? "   " : `${g.guide}  `;
  if (at === "row") text += `${lasts[n - 1] ? g.guideLast : g.guideBranch}${g.guideDash} `;
  else if (at === "above") text += `${g.guide}  `;
  else text += lasts[n - 1] ? "   " : `${g.guide}  `;
  return [{ text, role: "table_border", attrs: 0 }];
}

/** A data file's key and value (16.11): drawn like frontmatter's properties, the value coloured
 *  by its kind, a comment dimmed after it; the key column shared by the section's keys. In a tree
 *  (YAML, JSON), inside its guides; a branch (an object's key) is a row of the outline. */
export function dataField(f: DataField, ctx: Ctx, width: number): Line[] {
  const src = srcOf(f as unknown as Nodes);
  const place = f.tree;
  // The guides' room: a branch's key keeps 4 columns after its space; a key and value 8.
  const room = width - (place?.branch ? 5 : 8);
  const lead = place ? guides(place.lasts, "row", ctx, room) : [];
  const leadW = lead.reduce((a, s) => a + stringWidth(s.text), 0);
  if (place?.branch) {
    // The key alone, its comment after it; a heading of the outline (and the breadcrumb, and a
    // `#key` link's target), drawn as a row like any other.
    const level = Math.min(6, place.lasts.length + 1);
    const text = sanitize(f.key);
    const idx = ctx.headings.push({ level, text, slug: slugify(text), src }) - 1;
    const spans: Span[] = [{ text: f.key ? text : "·", role: "fm_key", attrs: A_BOLD }];
    if (f.comment)
      spans.push({
        text: `  # ${expandTabs(sanitize(f.comment).replace(/\s*\n\s*/g, " "))}`,
        role: "syn_comment",
        attrs: 0,
      });
    const down = guides(place.lasts, "down", ctx, room);
    const rows = wrapSpans(spans, Math.max(4, width - 1 - leadW));
    return rows.map((row, i) => ({
      spans: [{ text: " ", role: "text", attrs: 0 }, ...(i === 0 ? lead : down), ...row],
      src,
      heading: i === 0 ? idx : undefined,
    }));
  }
  width -= leadW;
  // The key column leaves the value 4 columns (with the space before the key and the two after it).
  const kw = Math.max(1, Math.min(f.keyWidth || stringWidth(sanitize(f.key)), Math.floor(width / 3), width - 7));
  let role: Role =
    f.kind === "number" || f.kind === "date"
      ? "syn_number"
      : f.kind === "boolean" || f.kind === "null"
        ? "syn_constant"
        : "fm_value";
  const value = expandTabs(sanitize(f.value)) || (f.kind === "string" ? '""' : "");
  // A value that is a link (16.15): a URL, a reference key's value, or a path that resolves.
  const l = fieldLink(f);
  const dl = l ? dataValueLink(ctx, l, f.value, f.keyLine) : null;
  if (dl) role = dl.role;
  const spans: Span[] = [{ text: value, role, attrs: 0, ...(dl ? { link: dl.link } : {}) }];
  if (f.comment)
    spans.push({
      text: `${value ? "  " : ""}# ${expandTabs(sanitize(f.comment).replace(/\s*\n\s*/g, " "))}`,
      role: "syn_comment",
      attrs: 0,
    });
  const rows = wrapSpans(spans, Math.max(4, width - kw - 3));
  const down = place ? guides(place.lasts, "down", ctx, room) : [];
  return rows.map((row, i) => ({
    spans: [
      { text: " ", role: "text", attrs: 0 },
      ...(i === 0 ? lead : down),
      { text: i === 0 ? padEnd(truncate(sanitize(f.key), kw), kw) : " ".repeat(kw), role: "fm_key", attrs: 0 },
      { text: "  ", role: "text", attrs: 0 },
      ...row,
    ],
    src,
  }));
}

/** A data value's link (16.15), when it is one: explicit (a URL, a reference key's), or a path that
 *  resolves. A field's value, or a records table's cell. */
export function dataValueLink(ctx: Ctx, l: CellLink, text: string, src: number): { link: number; role: Role } | null {
  const s = status(ctx, "markdown", l.target);
  if (!l.explicit && s !== "resolved") return null;
  return {
    link: addLink(ctx, { kind: "markdown", target: l.target, heading: null, text, status: s, src }),
    role: s === "unresolved" ? "link_unresolved" : "link",
  };
}

/** Comment lines of a data file on their own: dimmed, wrapped. */
export function dataComment(c: DataComment, width: number, ctx: Ctx): Line[] {
  const src = srcOf(c as unknown as Nodes);
  // In a tree, inside the guides of the key it's above.
  const lead = c.tree ? guides(c.tree.lasts, c.tree.above ? "above" : "down", ctx, width - 5) : [];
  const w = lead.reduce((a, s) => a + stringWidth(s.text), 0);
  return c.text
    .split("\n")
    .flatMap((text, i) =>
      wrapSpans([{ text: expandTabs(sanitize(text)), role: "syn_comment", attrs: 0 }], Math.max(4, width - 1 - w)).map(
        (row) => ({ spans: [{ text: " ", role: "text", attrs: 0 }, ...lead, ...row], src: src + i }),
      ),
    );
}

function findKeyLine(raw: string, key: string): number {
  const lines = raw.split("\n");
  return lines.findIndex((l) => l.startsWith(`${key}:`) || l.startsWith(`"${key}":`) || l.startsWith(`'${key}':`));
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(formatValue).join(", ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k}: ${formatValue(x)}`)
      .join("; ");
  }
  return sanitize(String(v))
    .replace(/\s*\n\s*/g, " ")
    .replace(/\t/g, " ");
}
