// Source cells, decoration and structural wrapping. Every offset remains in the original source line.
import { expandTabs } from "../../../../foundation/text/sanitize.ts";
import { graphemes, graphemeWidth } from "../../../../foundation/text/width.ts";
import type { CodeDef } from "../../../../documents/syntax/syntax.ts";
import type { Glyphs } from "../../../theme/glyphs.ts";
import { A_BOLD, A_DIM, type Line, type Span } from "../../ir.ts";
import type { Cell, Break } from "../contracts.ts";

const QUIET = /^[{};]$/;

const CONTINUE = 4;

/** The file's indentation step: the least indentation a line of code has (2 by default, at most 8), a tab as wide as
 *  its rows draw it (Go's, C's) — a doc comment's ` * ` lines and other odd ones aside. */
export function indentUnit(texts: string[]): number {
  let unit = 0;
  for (const raw of texts) {
    const t = expandTabs(raw);
    const lead = /^ */.exec(t)![0].length;
    if (lead > 1 && lead < 9 && t.trim() && !t.trimStart().startsWith("*") && (!unit || lead < unit)) unit = lead;
  }
  return unit || 2;
}

/** A source row's cells, from its spans and its map: the graphemes drawn, each with its offset. */
export function cellsOf(row: Line | undefined): Cell[] {
  const out: Cell[] = [];
  if (!row) return out;
  const at = row.srcMap?.cells ?? [];
  let k = 0;
  for (const s of row.spans) {
    for (const gr of graphemes(s.text))
      out.push({ g: gr, w: graphemeWidth(gr), at: at[k++] ?? 0, role: s.role, attrs: s.attrs });
  }
  return out;
}

const inText = (c: Cell) => c.role === "syn_string" || c.role === "syn_comment";

/**
 * The decoration a row of code gets: guides in its indentation, braces and semicolons dimmed, and on a definition's
 * line its name bold and what comes before it (export, async, function…) dimmed.
 */
export function decorate(cells: Cell[], def: CodeDef | undefined, unit: number, g: Glyphs, from = 0): void {
  let lead = 0;
  while (lead < cells.length && cells[lead]!.g === " ") lead++;
  if (lead < cells.length)
    for (let c = from; c < lead; c += unit) cells[c] = { ...cells[c]!, g: g.guide, role: "tree_guide" };
  for (const c of cells) if (QUIET.test(c.g) && !inText(c)) c.attrs |= A_DIM;
  dimReceivers(cells);
  if (!def) return;
  for (const c of cells) {
    if (c.at >= def.name.from && c.at < def.name.to) c.attrs |= A_BOLD;
    else if (c.at < def.name.from && c.g !== " " && c.role !== "tree_guide") c.attrs |= A_DIM;
  }
}

/** A receiver and its access (24.21), dimmed: `this.`, `self.`, `$this->`, `this->` — so the member it reaches stands out.
 *  A bare one (`return this`) is the value, and stays; so does one in a string or a comment. */
function dimReceivers(cells: Cell[]): void {
  const word = (c: Cell | undefined) => !!c && /^[\w$]$/.test(c.g);
  for (let i = 0; i < cells.length; i++) {
    const start = cells[i]!.g === "$" ? i + 1 : i;
    const name = cells
      .slice(start, start + 4)
      .map((c) => c.g)
      .join("");
    if ((name !== "this" && name !== "self") || word(cells[i - 1]) || cells.slice(i, start + 4).some(inText)) continue;
    const after = start + 4;
    const access = cells[after]?.g === "." ? 1 : cells[after]?.g === "-" && cells[after + 1]?.g === ">" ? 2 : 0;
    if (!access || word(cells[after + access]) === false) continue;
    for (let k = i; k < after + access; k++) cells[k]!.attrs |= A_DIM;
    i = after + access - 1;
  }
}

/** Where a row of code may break: after an opening bracket, after a comma, before `&&` `||` `??` ` ? ` `and` `or` or a
 *  chained `.`. */
function breaksOf(cells: Cell[], from: number): Break[] {
  const out: Break[] = [];
  let depth = 0;
  const at = (i: number, s: string) =>
    cells
      .slice(i, i + s.length)
      .map((c) => c.g)
      .join("") === s;
  for (let i = from; i < cells.length; i++) {
    const c = cells[i]!;
    if (inText(c)) continue;
    if ("([{".includes(c.g)) {
      depth++;
      if (i + 1 < cells.length && !")]}".includes(cells[i + 1]!.g)) out.push({ i: i + 1, depth });
    } else if (")]}".includes(c.g)) depth = Math.max(0, depth - 1);
    else if (c.g === ",") {
      let j = i + 1;
      while (j < cells.length && cells[j]!.g === " ") j++;
      if (j < cells.length) out.push({ i: j, depth });
    } else if (
      cells[i - 1]?.g === " " &&
      (at(i, "&& ") || at(i, "|| ") || at(i, "?? ") || at(i, "? ") || at(i, "and ") || at(i, "or "))
    )
      out.push({ i, depth });
    else if (c.g === "." && cells[i - 1]?.g === ")") out.push({ i, depth });
  }
  return out;
}

/**
 * A function's signature that doesn't fit `width`, a parameter a row (24.19): its line up to the `(` after its name,
 * each parameter four columns further in (one too long broken as any row is), then its `)` and the rest back at the
 * line's indentation. Null where it fits, or its `)` isn't on this line, or it has no parameters: then it's any row.
 */
export function signatureRows(
  cells: Cell[],
  nameEnd: number,
  width: number,
  unit: number,
  g: Glyphs,
  guidesFrom: number,
): { cells: Cell[] }[] | null {
  if (cells.reduce((n, c) => n + c.w, 0) <= width) return null;
  const open = cells.findIndex((c) => c.at >= nameEnd && c.g === "(" && !inText(c));
  if (open < 0) return null;
  let depth = 0;
  let close = -1;
  const commas: number[] = [];
  for (let i = open; i < cells.length && close < 0; i++) {
    const c = cells[i]!;
    if (inText(c)) continue;
    if ("([{".includes(c.g)) depth++;
    else if (")]}".includes(c.g) && --depth === 0) close = i;
    else if (c.g === "," && depth === 1) commas.push(i);
  }
  if (close < 0 || !cells.slice(open + 1, close).some((c) => c.g !== " ")) return null;
  let lead = 0;
  while (lead < cells.length && (cells[lead]!.g === " " || cells[lead]!.role === "tree_guide")) lead++;
  const head = cells.slice(0, open + 1);
  if (head.reduce((n, c) => n + c.w, 0) > width) return null;
  const pad = (n: number, at: number) =>
    Array.from(
      { length: n },
      (_, c): Cell =>
        c < lead && c >= guidesFrom && c % unit === 0
          ? { g: g.guide, w: 1, at, role: "tree_guide", attrs: 0 }
          : { g: " ", w: 1, at, role: "text", attrs: 0 },
    );
  const trim = (part: Cell[]) => {
    let a = 0;
    let b = part.length;
    while (a < b && part[a]!.g === " ") a++;
    while (b > a && part[b - 1]!.g === " ") b--;
    return part.slice(a, b);
  };
  const rows: { cells: Cell[] }[] = [{ cells: head }];
  const bounds = [open, ...commas, close];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const part = trim(cells.slice(bounds[k]! + 1, k + 2 < bounds.length ? bounds[k + 1]! + 1 : bounds[k + 1]!));
    if (part.length)
      rows.push(...breakLine([...pad(lead + CONTINUE, part[0]!.at), ...part], width, unit, g, guidesFrom));
  }
  rows.push(...breakLine([...pad(lead, cells[close]!.at), ...cells.slice(close)], width, unit, g, guidesFrom));
  return rows;
}

/**
 * A row of code in rows no wider than `width`: a line that fits is one row; one that doesn't breaks where its structure
 * allows — the shallowest bracket depth among the breaks that fit, the last of those — its rest four columns further
 * in than the line, with the line's guides. No break that fits: at a space, else wherever it must.
 */
export function breakLine(cells: Cell[], width: number, unit: number, g: Glyphs, guidesFrom = 0): { cells: Cell[] }[] {
  const total = cells.reduce((n, c) => n + c.w, 0);
  if (total <= width) return [{ cells }];
  let lead = 0;
  while (lead < cells.length && (cells[lead]!.g === " " || cells[lead]!.role === "tree_guide")) lead++;
  // A comment's rest goes under its text (past `//`, `#`, `*`, `--`); code's, four columns further in.
  let text = lead;
  if (cells[lead]?.role === "syn_comment") {
    while (text < cells.length && /[/#*!-]/.test(cells[text]!.g)) text++;
    while (text < cells.length && cells[text]!.g === " ") text++;
  }
  const deeper = text > lead ? text : lead + CONTINUE;
  const indent = deeper <= width / 2 ? deeper : lead;
  const pad = (at: number) =>
    Array.from(
      { length: indent },
      (_, c): Cell =>
        c < lead && c >= guidesFrom && c % unit === 0
          ? { g: g.guide, w: 1, at, role: "tree_guide", attrs: 0 }
          : { g: " ", w: 1, at, role: "text", attrs: 0 },
    );
  const breaks = breaksOf(cells, lead);
  const rows: { cells: Cell[] }[] = [];
  let s = 0;
  for (let first = true; ; first = false) {
    const room = first ? width : width - indent;
    let w = 0;
    let i = s;
    while (i < cells.length && w + cells[i]!.w <= room) w += cells[i++]!.w;
    if (i >= cells.length) {
      const rest = cells.slice(s);
      rows.push({ cells: first ? rest : [...pad(rest[0]?.at ?? 0), ...rest] });
      return rows;
    }
    // Not so early that the row is mostly empty: past a third of the room, when a break there fits.
    const fit = breaks.filter((b) => b.i > s + (first ? lead : 0) && b.i <= i);
    const late = fit.filter((b) => b.i - s >= room / 3);
    const pick = late.length ? late : fit;
    let cut = i;
    if (pick.length) {
      const least = Math.min(...pick.map((b) => b.depth));
      cut = Math.max(...pick.filter((b) => b.depth === least).map((b) => b.i));
    } else {
      for (let k = i - 1; k > s; k--) {
        if (cells[k]!.g === " ") {
          cut = k + 1;
          break;
        }
      }
    }
    if (cut <= s) cut = Math.max(s + 1, i);
    const row = cells.slice(s, cut);
    rows.push({ cells: first ? row : [...pad(row[0]?.at ?? 0), ...row] });
    s = cut;
    while (s < cells.length && cells[s]!.g === " ") s++;
    if (s >= cells.length) return rows;
  }
}

/** Cells as spans: a run per role and attributes. */
export function toSpans(cells: Cell[], src: number): Span[] {
  const out: Span[] = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    if (last && last.role === c.role && last.attrs === c.attrs) last.text += c.g;
    else out.push({ text: c.g, role: c.role, attrs: c.attrs, src });
  }
  return out;
}
