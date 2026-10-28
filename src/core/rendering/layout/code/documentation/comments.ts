// Comment classification and trailing-note columns; directive/code-like text keeps its original treatment.
import type { CodeComment } from "../../../../documents/syntax/syntax.ts";
import type { Role } from "../../../theme/theme.ts";
import { A_ITALIC, type Line } from "../../ir.ts";
import type { Cell } from "../contracts.ts";
import { cellsOf } from "../wrapping/rows.ts";

/** A comment that's for tools, not readers, kept as written: a shebang, an encoding, a linter's or checker's directive. */
export const DIRECTIVE =
  /^(!|-\*-|eslint|prettier-|biome-|@ts-|ts-|tslint:|istanbul |c8 |jshint|global |noqa|type:\s*ignore|pyright:|mypy:|pylint:|fmt:|isort:|pragma|nolint|go:|\+build|endregion\b|#endregion\b)/;

/** A comment that's code put aside: kept as written (dimmed), not read as prose. */
export const CODELIKE =
  /([;{}]\s*$)|(^(const|let|var|return|import|export|function|def|class|from|if|elif|for|while|print|self\.|this\.)\b.*[(=:{])|(^[\w.]+\(.*\)\s*;?$)/;

/** A separator comment's title (empty: a rule alone), or null when it isn't one. */
export function sectionOf(t: string): string | null {
  if (/^[-=*#~_+]{3,}$/.test(t)) return "";
  const m =
    /^[-=*#~_+]{2,}\s+(.+?)(?:\s+[-=*#~_+]{2,})?$/.exec(t) ??
    /^(?:MARK:\s*-?\s*|#?region\s+|pragma mark\s*-?\s*)(.+)$/i.exec(t);
  return m ? m[1]!.trim() : null;
}

/** A comment's text without its markers: `//`, `#`, `--`, a one-line block comment's — Rust's and Doxygen's inner doc
 *  markers (`//!`, `/*!`) too. */
export const unmark = (t: string) => t.replace(/^(\/\/+!?|#+|--+|\/\*+!?)\s?/, "").replace(/\s*\*+\/\s*$/, "");

/** A comment's marker, for telling a tool's directive by what follows it (`#!` a shebang, kept; `//!` a doc). */
export const MARKER = /^(\/\/+!?|#|--+|\/\*+!?)/;

/**
 * Where each line's note goes (its comment after code, in the margin): a run of lines with notes lines them up a
 * column past the longest code among them — unless that's past two thirds of the width; then two columns past each.
 */
export function noteColumns(
  texts: string[],
  trailing: Map<number, CodeComment>,
  rowOf: Map<number, Line>,
  width: number,
): Map<number, number> {
  const out = new Map<number, number>();
  const codeWidth = (ln: number) => {
    const c = trailing.get(ln)!;
    let w = 0;
    let end = 0;
    for (const cell of cellsOf(rowOf.get(ln))) {
      if (cell.at >= c.column) break;
      w += cell.w;
      if (cell.g !== " ") end = w;
    }
    return end;
  };
  const lines = [...trailing.keys()]
    .filter((ln) => !DIRECTIVE.test(unmark((texts[ln - 1] ?? "").slice(trailing.get(ln)!.column)).trim()))
    .sort((a, b) => a - b);
  for (let i = 0; i < lines.length; ) {
    let j = i;
    while (j + 1 < lines.length && lines[j + 1] === lines[j]! + 1) j++;
    const run = lines.slice(i, j + 1);
    const col = Math.max(...run.map(codeWidth)) + 2;
    for (const ln of run) out.set(ln, col <= width * (2 / 3) ? col : codeWidth(ln) + 2);
    i = j + 1;
  }
  return out;
}

/** A row's comment after its code as a note: its markers gone, its text in the comments' colour, slanted, at `column`. */
export function noted(cells: Cell[], note: CodeComment, column: number): Cell[] {
  const k = cells.findIndex((c) => c.at >= note.column);
  if (k < 0 || !column) return cells;
  let text = k;
  while (text < cells.length && /[/#*-]/.test(cells[text]!.g)) text++;
  while (text < cells.length && cells[text]!.g === " ") text++;
  let end = cells.length;
  while (
    end > text &&
    /[*/ ]/.test(cells[end - 1]!.g) &&
    cells
      .slice(text, end)
      .map((c) => c.g)
      .join("")
      .endsWith("*/")
  )
    end--;
  const code = cells.slice(0, k);
  while (code.length && code[code.length - 1]!.g === " ") code.pop();
  const w = code.reduce((n, c) => n + c.w, 0);
  const at = cells[text]?.at ?? note.column;
  const pad = Array.from(
    { length: Math.max(2, column - w) },
    (): Cell => ({ g: " ", w: 1, at, role: "text", attrs: 0 }),
  );
  return [
    ...code,
    ...pad,
    ...cells.slice(text, end).map((c) => ({ ...c, role: "syn_comment" as Role, attrs: A_ITALIC })),
  ];
}
