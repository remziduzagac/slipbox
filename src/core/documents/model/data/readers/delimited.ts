// CSV/TSV table parsing and the original row bound.

import type { RootContent } from "mdast";
import type { ParsedData } from "../contracts.ts";
import { pos, table } from "../nodes.ts";

/** A CSV longer than this renders its first rows; source mode has them all. */
const CSV_ROWS = 2000;

// ---------------------------------------------------------------------------------------------
// CSV and TSV
export function readDelimited(source: string, sep: string): ParsedData {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let error: string | null = null;
  for (let k = 0; k <= source.length; k++) {
    const ch = source[k];
    if (quoted) {
      if (ch === undefined) {
        error = `line ${rowLine}: a quoted field never closes`;
        break;
      }
      if (ch === '"') {
        if (source[k + 1] === '"') {
          cell += '"';
          k++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch === "\n" || ch === "\r" ? " " : ch;
      }
      continue;
    }
    if (ch === '"' && !cell) quoted = true;
    else if (ch === sep) {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === undefined) {
      if (ch === undefined && !cells.length && !cell) break;
      cells.push(cell.replace(/\r$/, ""));
      if (cells.some((c) => c.trim())) rows.push({ line: rowLine, cells });
      cells = [];
      cell = "";
      line++;
      rowLine = line;
    } else cell += ch;
  }
  const out: RootContent[] = [];
  if (rows.length) {
    const width = Math.max(...rows.map((r) => r.cells.length));
    const pad = (c: string[]) => [...c, ...Array(width - c.length).fill("")];
    const [head, ...body] = rows;
    const shown = body.slice(0, CSV_ROWS);
    out.push(
      table(
        pad(head!.cells),
        shown.map((r) => ({ line: r.line, cells: pad(r.cells) })),
        head!.line,
      ),
    );
    if (body.length > CSV_ROWS)
      out.push({
        type: "dataComment",
        text: `… ${body.length - CSV_ROWS} more rows — source mode (space n v) shows them all`,
        position: pos(shown[shown.length - 1]!.line + 1),
      } as unknown as RootContent);
  }
  return { tree: { type: "root", children: out }, error };
}
