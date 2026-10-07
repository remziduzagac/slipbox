// Constraint 2.9: strip terminal escapes from text on the way into layout — in one place.
//
// Notes are written by agents and pulled from repos; a raw escape sequence in a note must never
// reach the terminal. Every string that enters the layout IR passes through `sanitize`.
import { graphemes, graphemeWidth } from "./width.ts";

// ESC-introduced sequences: CSI, OSC (BEL or ST terminated), DCS/SOS/PM/APC strings, and
// two-byte escapes. Then the bare C0/C1 controls that are left. A string never crosses a line: an
// unterminated one (a truncated capture) takes the rest of its line, not the lines after it.
const ESCAPES =
  // biome-ignore lint: control characters are the point of this pattern
  /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b\n]*(?:\x07|\x1b\\)?|\x1b[PX^_][^\x1b\n]*(?:\x1b\\)?|\x1b[@-Z\\-_]|\x9b[0-?]*[ -/]*[@-~]/g;
// C0 except TAB and LF, DEL, C1, bidi embedding/override/isolate controls and marks (display
// spoofing; terminals draw the marks as nothing while they measure 1).
const CONTROLS = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
// The Unicode line and paragraph separators: a terminal may break the line there. A space instead.
const SEPARATORS = /[\u2028\u2029]/g;
/** Everything `sanitize` changes, for a quick test (and for the CLI's JSON, which escapes it). */
export const UNSAFE = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]/;

export function sanitize(text: string): string {
  if (!UNSAFE.test(text)) return text;
  return text.replace(ESCAPES, "").replace(CONTROLS, "").replace(SEPARATORS, " ");
}

/**
 * `sanitize`, and where each of the text's own indices went in what it made (-1 for one taken
 * out): a match found in the raw text (a filter's letters, a search hit's words) is marked where
 * the sanitized text is drawn.
 */
export function sanitizeMap(text: string): { text: string; at: number[] } {
  const at = Array.from({ length: text.length }, (_, i) => i);
  if (!UNSAFE.test(text)) return { text, at };
  const gone = new Uint8Array(text.length);
  for (const m of text.matchAll(ESCAPES)) gone.fill(1, m.index, m.index + m[0].length);
  // The controls are single code units: one left after the escapes is taken out where it is.
  const control = new RegExp(CONTROLS.source);
  const separator = new RegExp(SEPARATORS.source);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (gone[i] || control.test(text[i]!)) {
      at[i] = -1;
      continue;
    }
    at[i] = out.length;
    out += separator.test(text[i]!) ? " " : text[i]!;
  }
  return { text: out, at };
}

/** Expand tabs to spaces against a tab stop, for code blocks. */
export function expandTabs(line: string, tabWidth = 4): string {
  if (!line.includes("\t")) return line;
  // Tab stops count display columns (a CJK character is two), not UTF-16 units.
  let out = "";
  let col = 0;
  for (const g of graphemes(line)) {
    if (g === "\t") {
      const n = tabWidth - (col % tabWidth);
      out += " ".repeat(n);
      col += n;
    } else {
      out += g;
      col += graphemeWidth(g);
    }
  }
  return out;
}
