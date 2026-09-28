// Line diffs and a three-way merge (plan 5.5): what the conflict prompt's (D)iff shows and (M)erge
// does. Myers' diff over lines — O((N+M)·D), so a small change to a long note stays cheap — after
// trimming the common head and tail.

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

/**
 * A readable diff, `from` to `to`: each changed run as `-` and `+` lines with up to `context`
 * unchanged lines around it, and `@@ line N` before each group.
 */
export function unifiedDiff(from: string, to: string, context = 2): string[] {
  const a = splitLines(from);
  const b = splitLines(to);
  const hunks = diffLines(a, b);
  const out: string[] = [];
  let shownTo = -1;
  hunks.forEach((h, i) => {
    const start = Math.max(0, h.aStart - context, shownTo + 1);
    if (start > shownTo + 1 || i === 0) out.push(`@@ line ${h.aStart + 1}`);
    for (let k = start; k < h.aStart; k++) out.push(`  ${a[k]}`);
    for (let k = 0; k < h.aLen; k++) out.push(`- ${a[h.aStart + k]}`);
    for (let k = 0; k < h.bLen; k++) out.push(`+ ${b[h.bStart + k]}`);
    const next = hunks[i + 1];
    const end = Math.min(a.length, h.aStart + h.aLen + context, next ? next.aStart : a.length);
    for (let k = h.aStart + h.aLen; k < end; k++) out.push(`  ${a[k]}`);
    shownTo = end - 1;
  });
  return out;
}

export interface MergeResult {
  text: string;
  /** How many places both sides changed differently (marked in the text). */
  conflicts: number;
}

/**
 * Three-way merge by lines: what changed from `base` in only one of `ours` / `theirs` is taken;
 * the same change on both sides once; different changes to the same lines become a conflict,
 * marked `<<<<<<< yours` / `=======` / `>>>>>>> theirs` (git's markers).
 */
export function merge3(base: string, ours: string, theirs: string): MergeResult {
  const B = splitLines(base);
  const O = splitLines(ours);
  const T = splitLines(theirs);
  const ho = diffLines(B, O).map((h) => ({ ...h, side: "o" as const }));
  const ht = diffLines(B, T).map((h) => ({ ...h, side: "t" as const }));
  const all = [...ho, ...ht].sort((x, y) => x.aStart - y.aStart || x.aLen - y.aLen);
  const out: string[] = [];
  let conflicts = 0;
  let bi = 0; // next base line not yet written
  // Lines keep their \r in a CRLF note; the markers get one too, so the note stays all CRLF.
  const cr = ours.includes("\r\n") ? "\r" : "";
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
    while (j < all.length && (all[j]!.aStart < end || (all[j]!.aStart === end && (all[j]!.aLen === 0 || group.some((g) => g.aLen === 0 && g.aStart === end))))) {
      end = Math.max(end, all[j]!.aStart + all[j]!.aLen);
      group.push(all[j]!);
      j++;
    }
    const start = Math.min(...group.map((g) => g.aStart));
    for (; bi < start; bi++) out.push(B[bi]!);
    const og = group.filter((g) => g.side === "o");
    const tg = group.filter((g) => g.side === "t");
    const o = sideLines(ho, og, O, start, end);
    const t = sideLines(ht, tg, T, start, end);
    if (!tg.length) out.push(...o);
    else if (!og.length) out.push(...t);
    else if (o.join("\n") === t.join("\n")) out.push(...o);
    else {
      conflicts++;
      out.push(`<<<<<<< yours${cr}`, ...o, `=======${cr}`, ...t, `>>>>>>> theirs${cr}`);
    }
    bi = end;
    i = j;
  }
  for (; bi < B.length; bi++) out.push(B[bi]!);
  return { text: out.join("\n"), conflicts };
}
