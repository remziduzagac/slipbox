// The line diff every diff is made of (plan 5.5, 26.1, GIT-D2): Myers' diff, as git's xdiff does it. The common head
// and tail are trimmed, the lines only one side has are set aside as changed (whatever else is), and the rest is
// searched from both ends at once for the middle of the shortest edit, then each half the same way. O((N+M)·D) time,
// so a small change to a long file stays cheap, and O(N+M) memory, so a big one never runs out. Past a cost that grows
// with the square root of the lines, a search takes the furthest it got as its middle: still a correct diff, a coarser
// one, so a file reformatted whole costs no more than a few small changes do.

/** A run of lines in `a` (from `aStart`, `aLen` of them) replaced by lines of `b`. */
export interface Hunk {
  aStart: number;
  aLen: number;
  bStart: number;
  bLen: number;
}

/**
 * The hunks that turn lines `a` into lines `b`, in order, with an unchanged line between each two: as few lines removed
 * and added as can be — unless the search grows too costly, when it settles for more (`search`).
 */
export function diffLines(a: readonly string[], b: readonly string[]): Hunk[] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const n = a.length - head - tail;
  const m = b.length - head - tail;
  if (!n && !m) return [];
  if (!n || !m) return [{ aStart: head, aLen: n, bStart: head, bLen: m }];
  // Each line as a number, the same for the same text: compared as numbers from here on.
  const ids = new Map<string, number>();
  const id = (line: string) => {
    let k = ids.get(line);
    if (k === undefined) ids.set(line, (k = ids.size));
    return k;
  };
  const ia = new Int32Array(n);
  for (let i = 0; i < n; i++) ia[i] = id(a[head + i]!);
  const ib = new Int32Array(m);
  for (let j = 0; j < m; j++) ib[j] = id(b[head + j]!);
  const ca = new Uint8Array(n);
  const cb = new Uint8Array(m);
  changed(ia, ib, ids.size, ca, cb);
  // The lines left unchanged are the same on both sides, in order: between two of them, a hunk.
  const hunks: Hunk[] = [];
  for (let i = 0, j = 0; i < n || j < m; ) {
    if (i < n && j < m && !ca[i] && !cb[j]) {
      i++;
      j++;
      continue;
    }
    const si = i;
    const sj = j;
    while (i < n && ca[i]) i++;
    while (j < m && cb[j]) j++;
    hunks.push({ aStart: head + si, aLen: i - si, bStart: head + sj, bLen: j - sj });
  }
  return hunks;
}

/** Past this much work (diagonals tried and lines compared), the boxes a diff has left are changed whole. */
const BUDGET = 20_000_000;
/** The least cost a search reaches before it settles for the furthest it got (git's `XDL_MAX_COST_MIN`). */
const MIN_COST = 256;
const FAR = 0x7fffffff;

/** Roughly the square root of `n`, a power of two (git's `xdl_bogosqrt`). */
function roughSqrt(n: number): number {
  let i = 1;
  for (; n > 0; n >>= 2) i <<= 1;
  return i;
}

/**
 * Marks the lines of `a` and `b` (numbers below `count`) that the diff changes, in `ca` and `cb`. A line one side has and
 * the other hasn't is changed, whatever else is: those are set aside first (git's `xdl_cleanup_records`, GNU diff's
 * `discard_confusing_lines`), which keeps the shortest edit the same — so a note rewritten whole costs a read — and the
 * rest searched.
 */
function changed(a: Int32Array, b: Int32Array, count: number, ca: Uint8Array, cb: Uint8Array): void {
  const inA = new Uint8Array(count);
  const inB = new Uint8Array(count);
  for (const x of a) inA[x] = 1;
  for (const x of b) inB[x] = 1;
  const kept = (s: Int32Array, other: Uint8Array, c: Uint8Array) => {
    const lines = new Int32Array(s.length);
    const at = new Int32Array(s.length);
    let k = 0;
    s.forEach((x, i) => {
      if (other[x]) {
        lines[k] = x;
        at[k++] = i;
      } else c[i] = 1;
    });
    return { lines: lines.subarray(0, k), at: at.subarray(0, k) };
  };
  const ka = kept(a, inB, ca);
  const kb = kept(b, inA, cb);
  const ra = new Uint8Array(ka.lines.length);
  const rb = new Uint8Array(kb.lines.length);
  search(ka.lines, kb.lines, ra, rb);
  ra.forEach((c, k) => {
    if (c) ca[ka.at[k]!] = 1;
  });
  rb.forEach((c, k) => {
    if (c) cb[kb.at[k]!] = 1;
  });
}

/**
 * Myers' diff in linear space (Myers 1986, §4b; git's `xdl_recs_cmp` and `xdl_split`), marking the lines changed in
 * `ca` and `cb`: a box of `a` and `b` is split where the shortest edit's middle is, found from both ends at once, and
 * each half is split the same way, until a half has lines on one side only. A box searched past its cost is split at
 * the furthest point either end reached instead — the half that end covers known to be shortest, the other searched
 * again. Past the `BUDGET`, the boxes left are changed whole.
 */
function search(a: Int32Array, b: Int32Array, ca: Uint8Array, cb: Uint8Array): void {
  const n = a.length;
  const m = b.length;
  // On each diagonal (`x - y`, from -m-1 to n+1, at `o` + it), the furthest line of `a` reached forwards, backwards.
  const o = m + 1;
  const fwd = new Int32Array(n + m + 3);
  const bwd = new Int32Array(n + m + 3);
  const cap = Math.max(MIN_COST, roughSqrt(n + m + 3));
  let work = 0;
  // The boxes to do, five numbers each: `a`'s lines [off1, lim1), `b`'s [off2, lim2), and 1 where the shortest edit
  // is wanted whatever it costs (a half known to be short).
  const boxes: number[] = [0, n, 0, m, 0];
  while (boxes.length) {
    const exact = boxes.pop()!;
    let lim2 = boxes.pop()!;
    let off2 = boxes.pop()!;
    let lim1 = boxes.pop()!;
    let off1 = boxes.pop()!;
    while (off1 < lim1 && off2 < lim2 && a[off1] === b[off2]) {
      off1++;
      off2++;
    }
    while (off1 < lim1 && off2 < lim2 && a[lim1 - 1] === b[lim2 - 1]) {
      lim1--;
      lim2--;
    }
    if (off1 === lim1 || off2 === lim2 || work > BUDGET) {
      ca.fill(1, off1, lim1);
      cb.fill(1, off2, lim2);
      continue;
    }
    const dmin = off1 - lim2;
    const dmax = lim1 - off2;
    const fmid = off1 - off2;
    const bmid = lim1 - lim2;
    const odd = (fmid - bmid) & 1;
    let fmin = fmid;
    let fmax = fmid;
    let bmin = bmid;
    let bmax = bmid;
    fwd[o + fmid] = off1;
    bwd[o + bmid] = lim1;
    // The split: where the halves meet, and whether each is known to be shortest.
    let x = -1;
    let y = -1;
    let lo = 1;
    let hi = 1;
    for (let ec = 1; x < 0; ec++) {
      // Forwards, an edit further.
      if (fmin > dmin) fwd[o + --fmin - 1] = -1;
      else ++fmin;
      if (fmax < dmax) fwd[o + ++fmax + 1] = -1;
      else --fmax;
      for (let d = fmax; d >= fmin; d -= 2) {
        let i1 = fwd[o + d - 1]! >= fwd[o + d + 1]! ? fwd[o + d - 1]! + 1 : fwd[o + d + 1]!;
        const from = i1;
        let i2 = i1 - d;
        while (i1 < lim1 && i2 < lim2 && a[i1] === b[i2]) {
          i1++;
          i2++;
        }
        work += i1 - from + 1;
        fwd[o + d] = i1;
        if (odd && bmin <= d && d <= bmax && bwd[o + d]! <= i1) {
          x = i1;
          y = i2;
          break;
        }
      }
      if (x >= 0) break;
      // Backwards, an edit further.
      if (bmin > dmin) bwd[o + --bmin - 1] = FAR;
      else ++bmin;
      if (bmax < dmax) bwd[o + ++bmax + 1] = FAR;
      else --bmax;
      for (let d = bmax; d >= bmin; d -= 2) {
        let i1 = bwd[o + d - 1]! < bwd[o + d + 1]! ? bwd[o + d - 1]! : bwd[o + d + 1]! - 1;
        const from = i1;
        let i2 = i1 - d;
        while (i1 > off1 && i2 > off2 && a[i1 - 1] === b[i2 - 1]) {
          i1--;
          i2--;
        }
        work += from - i1 + 1;
        bwd[o + d] = i1;
        if (!odd && fmin <= d && d <= fmax && i1 <= fwd[o + d]!) {
          x = i1;
          y = i2;
          break;
        }
      }
      if (x >= 0 || exact || ec < cap) continue;
      // Too costly: split at the furthest point either end reached.
      let fbest = -1;
      let fx = -1;
      for (let d = fmax; d >= fmin; d -= 2) {
        let i1 = Math.min(fwd[o + d]!, lim1);
        let i2 = i1 - d;
        if (lim2 < i2) {
          i1 = lim2 + d;
          i2 = lim2;
        }
        if (fbest < i1 + i2) {
          fbest = i1 + i2;
          fx = i1;
        }
      }
      let bbest = FAR;
      let bx = FAR;
      for (let d = bmax; d >= bmin; d -= 2) {
        let i1 = Math.max(off1, bwd[o + d]!);
        let i2 = i1 - d;
        if (i2 < off2) {
          i1 = off2 + d;
          i2 = off2;
        }
        if (i1 + i2 < bbest) {
          bbest = i1 + i2;
          bx = i1;
        }
      }
      if (lim1 + lim2 - bbest < fbest - (off1 + off2)) {
        x = fx;
        y = fbest - fx;
        hi = 0;
      } else {
        x = bx;
        y = bbest - bx;
        lo = 0;
      }
    }
    boxes.push(off1, x, off2, y, lo, x, lim1, y, lim2, hi);
  }
}
