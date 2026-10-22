// Maths as Unicode text (plan 12.11): a formula's commands as the characters Unicode has for them (`unicodeit`'s
// table), with what the table leaves alone done first — fractions, roots, words, spacing, accents over more than a
// letter, sub- and superscripts whole or bracketed. A display's rows are aligned at their `&`, cases braced, matrices
// bracketed. A formula with a command none of this knows is null: its source is shown then, never half of one.

import { replace } from "unicodeit";
import { combiningmarks, replacements, subsuperscripts } from "unicodeit/ts_dist/js/data.js";
import { stringWidth } from "./width.ts";

// What mustn't be read as TeX between the steps — escaped braces, `&`, `_`, `^`, `\text`'s words — held as private-use
// characters of one UTF-16 unit each (`unicodeit` reads by unit), and given back at the end.
const LBRACE = "";
const RBRACE = "";
const AMP = "";
const UNDER = "";
const CARET = "";
/** `\text`'s words, each held as one character. */
const WORD0 = 0xe100;
const HELD = /[-]/g;

/** A formula as one line of Unicode text, or null where it holds what can't be (a command not known, rows). */
export function mathText(tex: string): string | null {
  const words: string[] = [];
  const out = convert(tex.replace(/\s*\n\s*/g, " "), words);
  // A letter and the mark over it as one character where Unicode has one (`\not\in`: ∉).
  return out === null ? null : release(out, words).normalize("NFC").trim();
}

/** The held characters given back. */
function release(s: string, words: string[]): string {
  const plain: Record<string, string> = { [LBRACE]: "{", [RBRACE]: "}", [AMP]: "&", [UNDER]: "_", [CARET]: "^" };
  return s.replace(HELD, (c) => plain[c] ?? words[c.charCodeAt(0) - WORD0] ?? c);
}

/** Converted, its held characters still held: what's done first, then the table; null where TeX is left over. */
function convert(tex: string, words: string[]): string | null {
  const shaped = structure(tex, words);
  if (shaped === null) return null;
  const out = replace(shaped);
  // What's left of TeX — a command the table doesn't know, a row break — isn't something to show half-done.
  if (/\\/.test(out)) return null;
  return out.replace(/[{}]/g, "");
}

/** Environments whose rows align at their `&`, as `aligned` does. */
const ALIGNED = new Set([
  "aligned",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "gathered",
  "gather",
  "gather*",
  "split",
  "equation",
  "equation*",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
]);
/** Matrices' brackets: one row's, then a taller one's top, middle and bottom on each side. */
const MATRICES: Record<string, { one: [string, string]; tall: [string, string, string, string, string, string] }> = {
  matrix: { one: ["", ""], tall: ["", "", "", "", "", ""] },
  pmatrix: { one: ["(", ")"], tall: ["⎛", "⎜", "⎝", "⎞", "⎟", "⎠"] },
  bmatrix: { one: ["[", "]"], tall: ["⎡", "⎢", "⎣", "⎤", "⎥", "⎦"] },
  vmatrix: { one: ["|", "|"], tall: ["│", "│", "│", "│", "│", "│"] },
  Vmatrix: { one: ["‖", "‖"], tall: ["‖", "‖", "‖", "‖", "‖", "‖"] },
};

/** A display's rows as Unicode text (12.11), or null where it holds what can't be — its source is shown then. What's
 *  written before or after an environment (`f(x) = \begin{cases}…`) is on its middle row, as TeX centres it. */
export function mathRows(tex: string): string[] | null {
  let body = tex.trim();
  let env = "aligned";
  let before = "";
  let after = "";
  const m = /^([\s\S]*?)\\begin\{([A-Za-z]+\*?)\}([\s\S]*)\\end\{\2\}([\s\S]*)$/.exec(body);
  if (m) {
    [, before, env, body, after] = m as unknown as [string, string, string, string, string];
    // `alignat`'s column count.
    if (env.startsWith("alignat")) body = body.replace(/^\s*\{\d+\}/, "");
  }
  // One it doesn't know (one inside another too: a cell holding `\begin` isn't text): not drawn.
  if (!ALIGNED.has(env) && env !== "cases" && !MATRICES[env]) return null;
  const lines = body.split(/\\\\(?:\[[^\]]*\])?/).map((r) => r.trim());
  while (lines.length > 1 && !lines[lines.length - 1]) lines.pop();
  const cells: string[][] = [];
  for (const line of lines) {
    const row: string[] = [];
    for (const cell of line.split(/(?<!\\)&/)) {
      const t = mathText(cell);
      if (t === null) return null;
      row.push(t);
    }
    cells.push(row);
  }
  const rows = arrange(cells, env);
  const pre = mathText(before);
  const post = mathText(after);
  if (pre === null || post === null) return null;
  if (!pre && !post) return rows;
  const mid = Math.floor((rows.length - 1) / 2);
  const lead = pre ? stringWidth(pre) + 1 : 0;
  return rows.map((r, i) =>
    (i === mid ? `${pre ? `${pre} ` : ""}${r}${post ? ` ${post}` : ""}` : `${" ".repeat(lead)}${r}`).trimEnd(),
  );
}

/** A display's cells laid out: as cases, a matrix, or aligned rows. */
function arrange(cells: string[][], env: string): string[] {
  const cols = Math.max(...cells.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, c) => Math.max(...cells.map((r) => stringWidth(r[c] ?? ""))));
  const pad = (s: string, w: number, how: "left" | "right" | "center") => {
    const room = w - stringWidth(s);
    const before = how === "right" ? room : how === "center" ? Math.floor(room / 2) : 0;
    return " ".repeat(before) + s + " ".repeat(room - before);
  };
  if (env === "cases") {
    // A value and, after `&`, when: the values lined up, the brace as tall as the rows.
    const rows = cells.map((r) => [pad(r[0] ?? "", widths[0]!, "left"), ...r.slice(1)].join("  ").trimEnd());
    const mid = Math.floor((rows.length - 1) / 2);
    const brace = (i: number) =>
      rows.length === 1 ? "{" : i === 0 ? "⎧" : i === rows.length - 1 ? "⎩" : i === mid ? "⎨" : "⎪";
    return rows.map((r, i) => `${brace(i)} ${r}`);
  }
  const matrix = MATRICES[env];
  if (matrix) {
    const rows = cells.map((r) => widths.map((w, c) => pad(r[c] ?? "", w, "center")).join("  "));
    const [l, r] = matrix.one;
    const [lt, lm, lb, rt, rm, rb] = matrix.tall;
    const side = (i: number, one: string, top: string, middle: string, bottom: string) =>
      rows.length === 1 ? one : i === 0 ? top : i === rows.length - 1 ? bottom : middle;
    return rows.map((row, i) => `${side(i, l, lt, lm, lb)} ${row} ${side(i, r, rt, rm, rb)}`.trim());
  }
  // Aligned: right of each `&` left-aligned, left of it right-aligned — as TeX's `rl` pairs are.
  return cells.map((r) =>
    widths
      .map((w, c) => pad(r[c] ?? "", w, c % 2 === 0 ? "right" : "left"))
      .join(" ")
      .trimEnd(),
  );
}

/** Fractions written with one character. */
const VULGAR: Record<string, string> = {
  "1/2": "½",
  "1/3": "⅓",
  "2/3": "⅔",
  "1/4": "¼",
  "3/4": "¾",
  "1/5": "⅕",
  "1/6": "⅙",
  "1/8": "⅛",
};
/** The commands the table knows, by their exact names: it replaces by prefix, so `\log`, which it doesn't know, would
 *  come out `łog` (its `\l`) — a command it doesn't know is never given to it. */
const KNOWN = new Set([...replacements.map(([k]) => /^\\(?:[A-Za-z]+|.)/.exec(k!)?.[0]), "\\not"]);
/** Functions written as their names, upright (`\log x`: log x). */
const FUNCTIONS =
  /^(?:arc(?:sin|cos|tan)|sinh?|cosh?|tanh?|coth?|sec|csc|cot|exp|lg|ln|log|lim|liminf|limsup|max|min|sup|inf|det|dim|ker|deg|arg|gcd|hom|Pr|mod|bmod)$/;
/** Commands whose argument is words, not maths. */
const WORDS = new Set([
  "text",
  "textrm",
  "textit",
  "textbf",
  "textsf",
  "texttt",
  "textnormal",
  "mathrm",
  "mathit",
  "mathsf",
  "mathtt",
  "operatorname",
  "mbox",
]);
/** Commands that only size, space or label what follows: dropped. */
const SIZING =
  /^(?:left|right|middle|[bB]ig{1,2}[lrm]?|displaystyle|textstyle|scriptstyle|scriptscriptstyle|limits|nolimits|nonumber|notag)$/;
const SPACES: Record<string, string> = {
  ",": " ",
  ":": " ",
  ";": " ",
  " ": " ",
  "!": "",
  quad: "  ",
  qquad: "    ",
  enspace: " ",
  thinspace: " ",
};
/** Accents, as combining characters over each letter of what they're over. */
const MARKS: Record<string, string> = {
  ...Object.fromEntries(combiningmarks.map(([k, v]) => [k!.slice(1), v!])),
  widehat: "̂",
  widetilde: "̃",
};
/** Superscript and subscript characters, by what they're of. */
const SCRIPTS = { "^": new Map<string, string>(), _: new Map<string, string>() };
for (const [k, v] of subsuperscripts) SCRIPTS[k![0] as "^" | "_"]?.set(k!.slice(1), v!);

/** A group at `i`: `{…}` (nested braces counted), else one `\command` or one character; null at the end. */
function group(s: string, i: number): { text: string; end: number } | null {
  while (s[i] === " ") i++;
  if (i >= s.length) return null;
  if (s[i] === "{") {
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === "\\") j++;
      else if (s[j] === "{") depth++;
      else if (s[j] === "}" && --depth === 0) return { text: s.slice(i + 1, j), end: j + 1 };
    }
    return null;
  }
  const cmd = /^\\(?:[A-Za-z]+|.)/.exec(s.slice(i));
  if (cmd) return { text: cmd[0], end: i + cmd[0].length };
  const ch = String.fromCodePoint(s.codePointAt(i)!);
  return { text: ch, end: i + ch.length };
}

/** Whether a fraction's or root's part needs no brackets around it: one term, whatever its brackets hold. */
function atom(s: string): boolean {
  let t = s;
  for (let prev = ""; prev !== t; ) [prev, t] = [t, t.replace(/\([^()]*\)/g, "x")];
  return /^[^\s+\-=<>,/]+$/.test(t);
}

/** A sub- or superscript: in the characters Unicode has for each of its own, else `^(…)` (`^x` for one character). */
function script(kind: "^" | "_", inner: string): string {
  const chars = [...inner.replace(/ /g, "")];
  const map = SCRIPTS[kind];
  if (chars.length && chars.every((c) => map.has(c))) return chars.map((c) => map.get(c)).join("");
  // A prime is one already.
  if (kind === "^" && /^[′″‴]+$/.test(inner)) return inner;
  const mark = kind === "^" ? CARET : UNDER;
  return chars.length === 1 ? `${mark}${inner}` : `${mark}(${inner})`;
}

/** What `unicodeit` leaves alone, done: fractions, roots, words, spacing, sizing, accents, scripts, escapes. Null where
 *  it's malformed or holds what can't be converted. */
function structure(s: string, words: string[]): string | null {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "^" || c === "_") {
      const g = group(s, i + 1);
      const inner = g && convert(g.text, words);
      if (!g || inner === null) return null;
      out += script(c, inner);
      i = g.end;
      continue;
    }
    if (c !== "\\") {
      out += c;
      i++;
      continue;
    }
    const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
    if (!m) return null;
    const name = m[1]!;
    i += m[0].length;
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      const a = group(s, i);
      const b = a && group(s, a.end);
      const top = a && convert(a.text, words);
      const bottom = b && convert(b.text, words);
      if (!b || top === null || bottom === null) return null;
      out +=
        VULGAR[`${top.trim()}/${bottom.trim()}`] ??
        `${atom(top) ? top : `(${top})`}/${atom(bottom) ? bottom : `(${bottom})`}`;
      i = b.end;
    } else if (name === "sqrt") {
      let index = "";
      if (s[i] === "[") {
        const close = s.indexOf("]", i);
        const n = close < 0 ? null : convert(s.slice(i + 1, close), words);
        if (n === null) return null;
        index = n.trim();
        i = close + 1;
      }
      const a = group(s, i);
      const inner = a && convert(a.text, words);
      if (!a || inner === null) return null;
      const sign = index === "3" ? "∛" : index === "4" ? "∜" : index ? `${script("^", index)}√` : "√";
      out += `${sign}${atom(inner) ? inner : `(${inner})`}`;
      i = a.end;
    } else if (name in MARKS) {
      const a = group(s, i);
      const inner = a && convert(a.text, words);
      if (!a || inner === null) return null;
      out += [...inner].map((ch) => (ch === " " ? ch : ch + MARKS[name])).join("");
      i = a.end;
    } else if (WORDS.has(name)) {
      const a = group(s, i);
      if (!a) return null;
      out += String.fromCharCode(WORD0 + words.push(a.text) - 1);
      i = a.end;
    } else if (name === "tag") {
      const a = group(s, i);
      if (!a) return null;
      out += `    (${a.text})`;
      i = a.end;
    } else if (name === "label") {
      const a = group(s, i);
      if (!a) return null;
      i = a.end;
    } else if (SIZING.test(name)) {
      // `\left.`: no bracket at all.
      if (s[i] === ".") i++;
    } else if (name in SPACES) {
      out += SPACES[name];
      // A space after a word-command ends its name, as in TeX: not one more space.
      if (/^[A-Za-z]/.test(name)) while (s[i] === " ") i++;
    } else if (name === "{") out += LBRACE;
    else if (name === "}") out += RBRACE;
    else if (name === "&") out += AMP;
    else if (name === "_") out += UNDER;
    else if (name === "^") out += CARET;
    else if (name === "%" || name === "$" || name === "#") out += name;
    else if (FUNCTIONS.test(name)) out += String.fromCharCode(WORD0 + words.push(name) - 1);
    // One the table knows, for it; any other, not drawn at all.
    else if (KNOWN.has(m[0])) out += m[0];
    else return null;
  }
  return out;
}
