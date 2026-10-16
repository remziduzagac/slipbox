// Line diffs and a three-way merge (plan 5.5): what a diff window shows (5.13; changed words inside changed lines,
// GIT-D2) and the conflict prompt's (M)erge does. Myers' diff over lines — O((N+M)·D), so a small change to a long note
// stays cheap — after trimming the common head and tail.

/** A run of lines in `a` (from `aStart`, `aLen` of them) replaced by lines of `b`. */
export interface Hunk {
  aStart: number;
  aLen: number;
  bStart: number;
  bLen: number;
}

/** The hunks that turn lines `a` into lines `b`, in order. */
export function diffLines(a: string[], b: string[]): Hunk[] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const A = a.slice(head, a.length - tail);
  const B = b.slice(head, b.length - tail);
  return myers(A, B).map((h) => ({ aStart: h.aStart + head, aLen: h.aLen, bStart: h.bStart + head, bLen: h.bLen }));
}

function myers(a: string[], b: string[]): Hunk[] {
  const n = a.length;
  const m = b.length;
  if (!n && !m) return [];
  if (!n || !m) return [{ aStart: 0, aLen: n, bStart: 0, bLen: m }];
  const max = n + m;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[max + k - 1]! < v[max + k + 1]!) ? v[max + k + 1]! : v[max + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[max + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  // Walk back through the trace, collecting the matched pairs.
  const pairs: [number, number][] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && vd[max + k - 1]! < vd[max + k + 1]!) ? k + 1 : k - 1;
    const prevX = vd[max + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      pairs.push([x - 1, y - 1]);
      x--;
      y--;
    }
    if (d > 0) {
      x = prevX;
      y = prevY;
    }
  }
  while (x > 0 && y > 0) {
    pairs.push([x - 1, y - 1]);
    x--;
    y--;
  }
  pairs.reverse();
  // Between matched pairs: the hunks.
  const hunks: Hunk[] = [];
  let ai = 0;
  let bi = 0;
  for (const [pa, pb] of [...pairs, [n, m] as [number, number]]) {
    if (pa > ai || pb > bi) hunks.push({ aStart: ai, aLen: pa - ai, bStart: bi, bLen: pb - bi });
    ai = pa + 1;
    bi = pb + 1;
  }
  return hunks;
}

export function splitLines(text: string): string[] {
  const lines = text.split("\n");
  return lines;
}

/** A row of a diff, `from` → `to`: a group's head, a line both have, one only `from` has, one only `to` has. */
export interface DiffRow {
  kind: "@@" | " " | "-" | "+";
  text: string;
  /** The line of `to` (1-based) the row is at — a removed line's: the line it was before. */
  line: number;
}

/** A text's lines, to show: a final line break ends the last line; it doesn't start another one. */
export function textLines(text: string): string[] {
  if (text === "") return [];
  const l = splitLines(text);
  if (l.length && l[l.length - 1] === "" && /\r?\n$/.test(text)) l.pop();
  return l;
}

/**
 * A diff as rows (5.13): each changed run with up to `context` unchanged lines around it, and a
 * head before each group — every row with its line in `to`, so a click goes there.
 */
export function diffRows(from: string, to: string, context = 3): DiffRow[] {
  const a = textLines(from);
  const b = textLines(to);
  const hunks = diffLines(a, b);
  const out: DiffRow[] = [];
  let shownTo = -1;
  hunks.forEach((h, i) => {
    const start = Math.max(0, h.aStart - context, shownTo + 1);
    // Unchanged lines line up: `to`'s line for `from`'s line k is k + (bStart - aStart).
    const shift = h.bStart - h.aStart;
    if (start > shownTo + 1 || i === 0) out.push({ kind: "@@", text: `line ${h.bStart + 1}`, line: h.bStart + 1 });
    for (let k = start; k < h.aStart; k++) out.push({ kind: " ", text: a[k]!, line: k + shift + 1 });
    for (let k = 0; k < h.aLen; k++) out.push({ kind: "-", text: a[h.aStart + k]!, line: h.bStart + 1 });
    for (let k = 0; k < h.bLen; k++) out.push({ kind: "+", text: b[h.bStart + k]!, line: h.bStart + k + 1 });
    const next = hunks[i + 1];
    const end = Math.min(a.length, h.aStart + h.aLen + context, next ? next.aStart : a.length);
    const after = h.bStart + h.bLen - (h.aStart + h.aLen);
    for (let k = h.aStart + h.aLen; k < end; k++) out.push({ kind: " ", text: a[k]!, line: k + after + 1 });
    shownTo = end - 1;
  });
  return out;
}

// Changed words inside changed lines (GIT-D2): inside a hunk, each removed line is paired with the added line most like
// it, and the two are diffed again by word, so a changed line shows its changed words. Words, not characters: they read
// better in prose, and characters mark noise in code's identifiers.

/** A run of a line's text, as UTF-16 offsets, its end excluded: a changed word, or a few. */
export type WordRange = [number, number];

/**
 * A line's tokens: each word (letters, marks, digits and `_`; a Chinese or Japanese character on its own, as their
 * words have no spaces between them), each run of white space, and each other character on its own.
 */
const TOKEN =
  /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]|(?:(?![\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}])[\p{L}\p{M}\p{N}_])+|\s+|[^\p{L}\p{M}\p{N}_\s]/gu;
const tokens = (line: string): string[] => line.match(TOKEN) ?? [];
const white = (t: string) => /^\s/.test(t);
/** A token that's a word: punctuation and white space are diffed, but not counted in how alike two lines are. */
const word = (t: string) => /^[\p{L}\p{M}\p{N}_]/u.test(t);

/** Past this many tokens in the two lines together, a pair isn't diffed by word: too long a line to be prose or code. */
const MAX_TOKENS = 4000;

/**
 * How two lines differ by word: the runs of `a` that `b` doesn't have (`del`), those of `b` that `a` doesn't (`add`),
 * and how alike they are — twice the words kept over the words of both, from 0 to 1 (two lines with no words at all,
 * punctuation only: 1). White space at a run's ends isn't part of it, and two runs with only white space between them
 * are one. `prose`: white space is one, whatever it is — a paragraph wrapped again, its line breaks moved, is the same.
 */
export function diffWords(a: string, b: string, prose = false): { del: WordRange[]; add: WordRange[]; alike: number } {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length + tb.length > MAX_TOKENS) return { del: [], add: [], alike: 0 };
  const same = (t: string[]) => (prose ? t.map((x) => (white(x) ? " " : x)) : t);
  const hunks = diffLines(same(ta), same(tb));
  const words = (t: string[], from = 0, to = t.length) => t.slice(from, to).filter(word).length;
  const wa = words(ta);
  const wb = words(tb);
  const lost = hunks.reduce((n, h) => n + words(ta, h.aStart, h.aStart + h.aLen), 0);
  return {
    del: runs(
      ta,
      hunks.map((h): [number, number] => [h.aStart, h.aLen]),
    ),
    add: runs(
      tb,
      hunks.map((h): [number, number] => [h.bStart, h.bLen]),
    ),
    alike: wa + wb ? (2 * (wa - lost)) / (wa + wb) : 1,
  };
}

/** Changed runs of tokens (`[first, count]`) as ranges of the text: trimmed of white space, and joined across it. */
function runs(t: string[], changed: [number, number][]): WordRange[] {
  const offset = [0];
  for (const x of t) offset.push(offset[offset.length - 1]! + x.length);
  const out: WordRange[] = [];
  let lastEnd = -1;
  for (const [first, count] of changed) {
    if (!count) continue;
    let s = first;
    let e = first + count;
    // White space at either end isn't what changed, unless it's all that did.
    if (t.slice(s, e).some((x) => !white(x))) {
      while (white(t[s]!)) s++;
      while (white(t[e - 1]!)) e--;
    }
    if (lastEnd >= 0 && t.slice(lastEnd, s).every(white)) out[out.length - 1]![1] = offset[e]!;
    else out.push([offset[s]!, offset[e]!]);
    lastEnd = e;
  }
  return out;
}

/** A removed line paired with an added one (indexes in the hunk's removed and added lines), and their changed words. */
export interface LinePair {
  del: number;
  add: number;
  delWords: WordRange[];
  addWords: WordRange[];
}

/** A pair less alike than this stays a line removed and a line added. */
const ALIKE = 0.5;
/** Past this many removed lines times added ones, a hunk's lines pair in place, the first with the first. */
const PAIR_LIMIT = 2500;

/**
 * Inside a hunk: each removed line paired with the added line most like it — the pairs, in order, that make the hunk
 * most alike — none less than half alike (`diffWords`; `prose`, its white space all one).
 */
export function pairLines(removed: string[], added: string[], prose = false): LinePair[] {
  const n = removed.length;
  const m = added.length;
  if (!n || !m) return [];
  const pair = (i: number, j: number, w: ReturnType<typeof diffWords>): LinePair => ({
    del: i,
    add: j,
    delWords: w.del,
    addWords: w.add,
  });
  if (n * m > PAIR_LIMIT) {
    const out: LinePair[] = [];
    for (let i = 0; i < Math.min(n, m); i++) {
      const w = diffWords(removed[i]!, added[i]!, prose);
      if (w.alike >= ALIKE) out.push(pair(i, i, w));
    }
    return out;
  }
  const sim = removed.map((r) => added.map((x) => diffWords(r, x, prose)));
  // best[i][j]: the most alike the first i removed lines and the first j added ones can be paired.
  const best = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const s = sim[i - 1]![j - 1]!.alike;
      best[i]![j] = Math.max(best[i - 1]![j]!, best[i]![j - 1]!, s >= ALIKE ? best[i - 1]![j - 1]! + s : 0);
    }
  const out: LinePair[] = [];
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const s = sim[i - 1]![j - 1]!;
    if (s.alike >= ALIKE && best[i]![j] === best[i - 1]![j - 1]! + s.alike) {
      out.push(pair(i - 1, j - 1, s));
      i--;
      j--;
    } else if (best[i]![j] === best[i - 1]![j]) i--;
    else j--;
  }
  return out.reverse();
}

/** A row of a diff as slipbox draws it (GIT-D2). */
export interface DiffViewRow {
  /** A group's head, a line both have, one only `from` has, one only `to` has, or unchanged lines folded. */
  kind: "@@" | " " | "-" | "+" | "fold";
  /** The line's text; a head's `line N`. */
  text: string;
  /** The line of `to` (1-based) the row is at — a removed line's: where it was. */
  line: number;
  /** The line in its own text (1-based): `from`'s for an unchanged or a removed line and a fold (its first), `to`'s
   *  for an added one. */
  own: number;
  /** A changed line paired with one like it: its changed words. */
  words?: WordRange[];
  /** A fold: how many unchanged lines it holds. */
  count?: number;
}

/**
 * A diff as slipbox draws it (GIT-D2): each changed run under its `@@ line N`, with up to `context` unchanged lines
 * around it, each removed line paired with an added one like it and their changed words found; the unchanged
 * stretches between, before the first and after the last folded to a row saying how many lines they hold — but a
 * single line, shown in the context beside it, and a stretch whose first line (`from`'s) is in `open`.
 */
export function diffView(from: string, to: string, open: ReadonlySet<number> = new Set(), context = 3): DiffViewRow[] {
  const a = textLines(from);
  const b = textLines(to);
  const hunks = diffLines(a, b);
  if (!hunks.length) return [];
  // Hunks whose context meets, or leaves a line between: one group.
  const groups: Hunk[][] = [];
  for (const h of hunks) {
    const g = groups[groups.length - 1];
    const prev = g?.[g.length - 1];
    if (g && prev && h.aStart - context - (prev.aStart + prev.aLen + context) <= 1) g.push(h);
    else groups.push([h]);
  }
  // An unchanged line of `from` (0-based) is `to`'s line moved by the hunks before it: the first so many of them, found
  // by halves.
  const shifts = [0];
  for (const h of hunks) shifts.push(shifts[shifts.length - 1]! + h.bLen - h.aLen);
  const toLine = (k: number) => {
    let lo = 0;
    let hi = hunks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (hunks[mid]!.aStart + hunks[mid]!.aLen <= k) lo = mid + 1;
      else hi = mid;
    }
    return k + shifts[lo]! + 1;
  };
  const out: DiffViewRow[] = [];
  const same = (k: number) => out.push({ kind: " ", text: a[k]!, line: toLine(k), own: k + 1 });
  // `from`'s unchanged lines [s, e): folded, or shown. Never one line alone: a group takes it into its context.
  const stretch = (s: number, e: number) => {
    if (e <= s) return;
    if (open.has(s + 1)) for (let k = s; k < e; k++) same(k);
    else out.push({ kind: "fold", text: `${e - s} unchanged lines`, line: toLine(s), own: s + 1, count: e - s });
  };
  let shown = 0;
  for (const g of groups) {
    const first = g[0]!;
    let start = Math.max(shown, first.aStart - context);
    if (start - shown === 1) start = shown; // a line alone before the context: shown with it
    stretch(shown, start);
    out.push({ kind: "@@", text: `line ${first.bStart + 1}`, line: first.bStart + 1, own: first.aStart + 1 });
    let k = start;
    for (const h of g) {
      for (; k < h.aStart; k++) same(k);
      const pairs = pairLines(a.slice(h.aStart, h.aStart + h.aLen), b.slice(h.bStart, h.bStart + h.bLen));
      const del = new Map(pairs.map((p) => [p.del, p.delWords]));
      const add = new Map(pairs.map((p) => [p.add, p.addWords]));
      for (let i = 0; i < h.aLen; i++) {
        const words = del.get(i);
        out.push({
          kind: "-",
          text: a[h.aStart + i]!,
          line: h.bStart + 1,
          own: h.aStart + i + 1,
          ...(words ? { words } : {}),
        });
      }
      for (let j = 0; j < h.bLen; j++) {
        const words = add.get(j);
        out.push({
          kind: "+",
          text: b[h.bStart + j]!,
          line: h.bStart + j + 1,
          own: h.bStart + j + 1,
          ...(words ? { words } : {}),
        });
      }
      k = h.aStart + h.aLen;
    }
    let end = Math.min(a.length, k + context);
    if (a.length - end === 1) end = a.length; // a last line alone after the context: shown with it
    for (; k < end; k++) same(k);
    shown = end;
  }
  stretch(shown, a.length);
  return out;
}

export interface MergeResult {
  text: string;
  /** How many places both sides changed differently (marked in the text). */
  conflicts: number;
}

/** A stretch of a three-way merge: lines it settled (one side's change, the same change on both, or neither's), or a
 *  conflict — the base's lines and each side's, where both changed them differently. */
export type MergeChunk = { lines: string[] } | { base: string[]; ours: string[]; theirs: string[] };

/**
 * Three-way merge by lines, stretch by stretch: what changed from `base` in only one of `ours` / `theirs` is taken;
 * the same change on both sides once; different changes to the same lines are a conflict, each side's lines and the
 * base's kept. Lines as `splitLines` gives them: a final line break leaves an empty last line.
 */
export function mergeChunks(base: string, ours: string, theirs: string): MergeChunk[] {
  const B = splitLines(base);
  const O = splitLines(ours);
  const T = splitLines(theirs);
  const ho = diffLines(B, O).map((h) => ({ ...h, side: "o" as const }));
  const ht = diffLines(B, T).map((h) => ({ ...h, side: "t" as const }));
  const all = [...ho, ...ht].sort((x, y) => x.aStart - y.aStart || x.aLen - y.aLen);
  const out: MergeChunk[] = [];
  const keep = (lines: string[]) => {
    if (!lines.length) return;
    const last = out[out.length - 1];
    if (last && "lines" in last) last.lines.push(...lines);
    else out.push({ lines: [...lines] });
  };
  let bi = 0; // next base line not yet written
  // A side's lines for base lines [start, end): shifted by the hunks before the group, and grown or
  // shrunk by the group's own.
  const sideLines = (hs: Hunk[], group: Hunk[], lines: string[], start: number, end: number) => {
    let from = start;
    for (const h of hs) if (!group.includes(h) && h.aStart + h.aLen <= start) from += h.bLen - h.aLen;
    let len = end - start;
    for (const h of group) len += h.bLen - h.aLen;
    return lines.slice(from, from + len);
  };
  let i = 0;
  while (i < all.length) {
    // A group: hunks whose base ranges overlap, or touch at an insertion.
    const group: (Hunk & { side: "o" | "t" })[] = [all[i]!];
    let end = all[i]!.aStart + all[i]!.aLen;
    let j = i + 1;
    while (
      j < all.length &&
      (all[j]!.aStart < end ||
        (all[j]!.aStart === end && (all[j]!.aLen === 0 || group.some((g) => g.aLen === 0 && g.aStart === end))))
    ) {
      end = Math.max(end, all[j]!.aStart + all[j]!.aLen);
      group.push(all[j]!);
      j++;
    }
    const start = Math.min(...group.map((g) => g.aStart));
    keep(B.slice(bi, start));
    const og = group.filter((g) => g.side === "o");
    const tg = group.filter((g) => g.side === "t");
    const o = sideLines(ho, og, O, start, end);
    const t = sideLines(ht, tg, T, start, end);
    if (!tg.length) keep(o);
    else if (!og.length) keep(t);
    else if (o.join("\n") === t.join("\n")) keep(o);
    else out.push({ base: B.slice(start, end), ours: o, theirs: t });
    bi = end;
    i = j;
  }
  keep(B.slice(bi));
  return out;
}

/**
 * Three-way merge by lines (`mergeChunks`), each conflict marked `<<<<<<< yours` / `=======` / `>>>>>>> theirs`, as
 * git marks one.
 */
export function merge3(base: string, ours: string, theirs: string): MergeResult {
  // Lines keep their \r in a CRLF note; the markers get one too, so the note stays all CRLF.
  const cr = ours.includes("\r\n") ? "\r" : "";
  const out: string[] = [];
  let conflicts = 0;
  for (const c of mergeChunks(base, ours, theirs)) {
    if ("lines" in c) out.push(...c.lines);
    else {
      conflicts++;
      out.push(`<<<<<<< yours${cr}`, ...c.ours, `=======${cr}`, ...c.theirs, `>>>>>>> theirs${cr}`);
    }
  }
  return { text: out.join("\n"), conflicts };
}
