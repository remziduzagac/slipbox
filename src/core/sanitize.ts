// Constraint 2.9: strip terminal escapes from text on the way into layout — in one place.
//
// Notes are written by agents and pulled from repos; a raw escape sequence in a note must never
// reach the terminal. Every string that enters the layout IR passes through `sanitize`.

// ESC-introduced sequences: CSI, OSC (BEL or ST terminated), DCS/SOS/PM/APC strings, and
// two-byte escapes. Then the bare C0/C1 controls that are left.
const ESCAPES =
  // biome-ignore lint: control characters are the point of this pattern
  /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[PX^_][^\x1b]*(?:\x1b\\)?|\x1b[@-Z\\-_]|\x9b[0-?]*[ -/]*[@-~]/g;
// C0 except TAB and LF, DEL, C1, and bidi embedding/override/isolate controls (display spoofing).
const CONTROLS = /[\x00-\x08\x0b-\x1f\x7f-\x9f‪-‮⁦-⁩]/g;

export function sanitize(text: string): string {
  if (!/[\x00-\x08\x0b-\x1f\x7f-\x9f‪-‮⁦-⁩]/.test(text)) return text;
  return text.replace(ESCAPES, "").replace(CONTROLS, "");
}

/** Expand tabs to spaces against a tab stop, for code blocks. */
export function expandTabs(line: string, tabWidth = 4): string {
  if (!line.includes("\t")) return line;
  let out = "";
  for (const ch of line) {
    if (ch === "\t") out += " ".repeat(tabWidth - (out.length % tabWidth));
    else out += ch;
  }
  return out;
}
