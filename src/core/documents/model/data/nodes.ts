// Existing shared data node and table construction, without format dispatch.

import type { Heading, RootContent, Table, TableRow } from "mdast";
import { stringWidth } from "../../../foundation/text/width.ts";
import type { CellLink, DataField } from "./contracts.ts";

/** Keys wider than this share the column no further: they're cut with … instead. */
export const KEY_MAX = 28;

export const pos = (a: number, b = a) => ({ start: { line: a, column: 1 }, end: { line: b, column: 1 } });

export function firstLine(s: string): string {
  return s.split("\n")[0]!.trim();
}

export function heading(depth: number, text: string, line: number): Heading {
  return {
    type: "heading",
    depth: Math.max(1, Math.min(6, depth)) as Heading["depth"],
    children: [{ type: "text", value: text }],
    position: pos(line),
  };
}

/** Line up each run of keys (between headings) on the widest key, up to KEY_MAX. */
export function alignKeys(nodes: RootContent[]): void {
  let run: DataField[] = [];
  const flush = () => {
    const w = Math.min(KEY_MAX, Math.max(0, ...run.map((f) => stringWidth(f.key))));
    for (const f of run) f.keyWidth = w;
    run = [];
  };
  for (const n of nodes) {
    if ((n as unknown as DataField).type === "dataField") run.push(n as unknown as DataField);
    else if (n.type === "heading" || n.type === "table") flush();
  }
  flush();
}

export function kindOf(value: string): DataField["kind"] {
  const v = value.trim();
  if (/^(true|false|yes|no|on|off)$/i.test(v)) return "boolean";
  if (/^[+-]?(\d[\d_]*)(\.\d+)?([eE][+-]?\d+)?$/.test(v) || /^0x[\da-f_]+$/i.test(v) || /^[+-]?(inf|nan)$/.test(v))
    return "number";
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(v)) return "date";
  if (/^\[/.test(v)) return "list";
  if (/^\{/.test(v)) return "table";
  return "other";
}

export function table(
  header: string[],
  rows: { line: number; cells: string[]; links?: (CellLink | null)[] }[],
  line: number,
): Table {
  const row = (cells: string[], at: number, links?: (CellLink | null)[]): TableRow => ({
    type: "tableRow",
    children: cells.map((c, i) => ({
      type: "tableCell",
      children: c ? [{ type: "text", value: c }] : [],
      position: pos(at),
      ...(links?.[i] ? { data: { link: links[i] } } : {}),
    })),
    position: pos(at),
  });
  const last = rows.length ? rows[rows.length - 1]!.line : line;
  // A data file's table is records: each row a block of its own for the lens (16.14), not the
  // whole table at once (a CSV's may be thousands of rows).
  return {
    type: "table",
    align: header.map(() => null),
    children: [row(header, line), ...rows.map((r) => row(r.cells, r.line, r.links))],
    position: pos(line, last),
    data: { rowBlocks: true },
  };
}

// ---------------------------------------------------------------------------------------------
// INI and .env
/** Comment lines above a key that are not its comment: more than one line, or the file's opening. */
export function standsAlone(pending: { text: string[]; line: number } | null, out: RootContent[]): boolean {
  return !!pending && (pending.text.length > 1 || !out.length);
}
