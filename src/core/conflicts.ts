// A file in conflict, read for the merge screen (GIT-D5): git's markers parsed into the stretches both sides agree on
// and the conflicts, each with its three versions — yours and theirs between the markers, the common base from diff3's
// `|||||||` section or the index's stage 1 (found by where yours and theirs sit in stages 2 and 3), or from the
// three-way merge that made it (the conflict prompt's) — and the file as it will be, each conflict settled or still
// marked.

import { comparable, type DiffViewRow, diffLines, type Hunk, mergeChunks } from "./merge.ts";

/** One of git's conflicts: yours, theirs, the base where it's known, and the markers' labels. */
export interface Conflict {
  kind: "conflict";
  ours: string[];
  theirs: string[];
  /** The common base's lines: from the markers (diff3), the index's stage 1 or the merge; null when none has it. */
  base: string[] | null;
  /** The markers held the base (`|||||||`): written back with it while the conflict isn't settled. */
  markedBase: boolean;
  /** What the markers say after them: `HEAD`, `agent/sync-retry`, `1a2b3c4 (Retry budget)`. */
  oursLabel: string;
  theirsLabel: string;
  baseLabel: string;
  /** Its `<<<<<<<` line in the text it was read from (from 1). */
  line: number;
}

/** A stretch both sides agree on. */
export interface Plain {
  kind: "plain";
  lines: string[];
}

export type Segment = Plain | Conflict;

/** A file in conflict: its stretches in order, and whether it ended with a line break. */
export interface Conflicted {
  segments: Segment[];
  final: boolean;
}

/** How a conflict is settled: yours, theirs, both (yours first, or theirs first), or lines of your own. */
export type Choice = "ours" | "theirs" | "both" | "both-theirs" | { lines: string[] };

const OURS = /^<{7}(?: (.*))?$/;
const BASE = /^\|{7}(?: (.*))?$/;
const SEP = /^={7}$/;
const THEIRS = /^>{7}(?: (.*))?$/;

/** A text's lines, a final line break ending the last one rather than starting another. */
function linesOf(text: string): { lines: string[]; final: boolean } {
  if (text === "") return { lines: [], final: false };
  const lines = text.split("\n");
  const final = lines[lines.length - 1] === "";
  if (final) lines.pop();
  return { lines, final };
}

/** A marker line, read without the carriage return a CRLF file gives it. */
const bare = (line: string) => line.replace(/\r$/, "");

/**
 * A text with git's conflict markers read: `<<<<<<< label`, yours, optionally `||||||| label` and the base (diff3),
 * `=======`, theirs, `>>>>>>> label`. Markers that don't close are text like any.
 */
export function parseConflicts(text: string): Conflicted {
  const { lines, final } = linesOf(text);
  const segments: Segment[] = [];
  const plain = (ls: string[]) => {
    if (!ls.length) return;
    const last = segments[segments.length - 1];
    if (last?.kind === "plain") last.lines.push(...ls);
    else segments.push({ kind: "plain", lines: [...ls] });
  };
  let i = 0;
  while (i < lines.length) {
    const open = OURS.exec(bare(lines[i]!));
    if (!open) {
      plain([lines[i]!]);
      i++;
      continue;
    }
    // A conflict, if it closes: yours, perhaps the base, theirs.
    const c: Conflict = {
      kind: "conflict",
      ours: [],
      theirs: [],
      base: null,
      markedBase: false,
      oursLabel: open[1] ?? "",
      theirsLabel: "",
      baseLabel: "",
      line: i + 1,
    };
    let part: "ours" | "base" | "theirs" = "ours";
    let j = i + 1;
    let closed = false;
    for (; j < lines.length; j++) {
      const l = bare(lines[j]!);
      if (OURS.test(l)) break; // another opens before this one closed: this one is text
      const base = part === "ours" ? BASE.exec(l) : null;
      if (base) {
        part = "base";
        c.base = [];
        c.markedBase = true;
        c.baseLabel = base[1] ?? "";
        continue;
      }
      if (part !== "theirs" && SEP.test(l)) {
        part = "theirs";
        continue;
      }
      const end = part === "theirs" ? THEIRS.exec(l) : null;
      if (end) {
        c.theirsLabel = end[1] ?? "";
        closed = true;
        break;
      }
      (part === "ours" ? c.ours : part === "base" ? c.base! : c.theirs).push(lines[j]!);
    }
    if (!closed) {
      plain(lines.slice(i, j));
      i = j;
      continue;
    }
    segments.push(c);
    i = j + 1;
  }
  return { segments, final };
}

/** The conflicts of a file, in order. */
export const conflictsOf = (f: Conflicted): Conflict[] =>
  f.segments.filter((s): s is Conflict => s.kind === "conflict");

/**
 * The conflict prompt's three-way merge (`base` the text as loaded, `ours` as typed, `theirs` on disk) as a file in
 * conflict: each conflict with its base, labelled yours and theirs.
 */
export function fromMerge(base: string, ours: string, theirs: string): Conflicted {
  const segments: Segment[] = [];
  let line = 1;
  for (const chunk of mergeChunks(base, ours, theirs)) {
    if ("lines" in chunk) {
      const last = segments[segments.length - 1];
      if (last?.kind === "plain") last.lines.push(...chunk.lines);
      else segments.push({ kind: "plain", lines: [...chunk.lines] });
      line += chunk.lines.length;
      continue;
    }
    segments.push({
      kind: "conflict",
      ours: chunk.ours,
      theirs: chunk.theirs,
      base: chunk.base,
      markedBase: false,
      oursLabel: "yours",
      theirsLabel: "theirs",
      baseLabel: "",
      line,
    });
    line += chunk.ours.length + chunk.theirs.length + 3;
  }
  // The text's final line break: the empty line after it, as the merge's lines have it.
  const last = segments[segments.length - 1];
  const final = last?.kind === "plain" && last.lines[last.lines.length - 1] === "";
  if (final) {
    last.lines.pop();
    if (!last.lines.length) segments.pop();
  }
  return { segments, final };
}

/** A conflict's lines as settled. */
export function settle(c: Conflict, choice: Choice): string[] {
  if (typeof choice === "object") return choice.lines;
  return choice === "ours"
    ? c.ours
    : choice === "theirs"
      ? c.theirs
      : choice === "both"
        ? [...c.ours, ...c.theirs]
        : [...c.theirs, ...c.ours];
}

/** A conflict not settled, as git marks it: its markers, labels and lines (the base too, when they held it). */
export function markersOf(c: Conflict, withBase = c.markedBase): string[] {
  const mark = (m: string, label: string) => (label ? `${m} ${label}` : m);
  return [
    mark("<<<<<<<", c.oursLabel),
    ...c.ours,
    ...(withBase && c.base ? [mark("|||||||", c.baseLabel || "base"), ...c.base] : []),
    "=======",
    ...c.theirs,
    mark(">>>>>>>", c.theirsLabel),
  ];
}

/** A stretch of the file as it will be: a plain one's lines, or a conflict's (index `k`), settled or still marked. */
export interface ResultPart {
  lines: string[];
  /** Its first line in the result (from 1). */
  line: number;
  /** A conflict's index among the conflicts, and whether it's settled. */
  conflict?: number;
  settled?: boolean;
}

/** The file as it will be, by stretch: each conflict settled as chosen (`choices`, by conflict), else still marked. */
export function resultParts(f: Conflicted, choices: readonly (Choice | null)[]): ResultPart[] {
  const out: ResultPart[] = [];
  let line = 1;
  let k = 0;
  for (const s of f.segments) {
    if (s.kind === "plain") {
      out.push({ lines: s.lines, line });
      line += s.lines.length;
      continue;
    }
    const choice = choices[k] ?? null;
    const lines = choice ? settle(s, choice) : markersOf(s);
    out.push({ lines, line, conflict: k, settled: !!choice });
    line += lines.length;
    k++;
  }
  return out;
}

/** The file as it will be, as text. */
export function resultText(f: Conflicted, choices: readonly (Choice | null)[]): string {
  const lines = resultParts(f, choices).flatMap((p) => p.lines);
  return lines.length ? lines.join("\n") + (f.final ? "\n" : "") : "";
}

/** How a conflict is settled, as the merge screen says it. */
export function choiceText(c: Choice | null): string {
  if (!c) return "not settled";
  if (typeof c === "object") return "edited";
  return c === "ours" ? "yours" : c === "theirs" ? "theirs" : c === "both" ? "both, yours first" : "both, theirs first";
}

/**
 * The file as it will be, as the merge screen draws it: each conflict's lines — settled (`+`), or still marked — with
 * `context` lines around them, under a head saying which conflict and how it's settled; the stretches between folded.
 * `text` is the file as it will be, the rows' `line` and `own` its lines; `lines`, where each conflict starts in it.
 */
export function resultView(
  f: Conflicted,
  choices: readonly (Choice | null)[],
  context = 2,
): { text: string; rows: DiffViewRow[]; lines: number[] } {
  const parts = resultParts(f, choices);
  const all = parts.flatMap((p) => p.lines);
  const text = all.length ? `${all.join("\n")}\n` : "";
  const settled: boolean[] = parts.flatMap((p) => p.lines.map(() => !!p.settled));
  const lines: number[] = [];
  // Each conflict's lines and its context; groups whose context meets, or leaves a line between, are one.
  const groups: { s: number; e: number; heads: string[] }[] = [];
  for (const p of parts) {
    if (p.conflict === undefined) continue;
    lines[p.conflict] = p.line;
    const s = Math.max(0, p.line - 1 - context);
    const e = Math.min(all.length, p.line - 1 + p.lines.length + context);
    const head = `conflict ${p.conflict + 1}, line ${p.line}: ${choiceText(choices[p.conflict] ?? null)}`;
    const g = groups[groups.length - 1];
    if (g && s - g.e <= 1) {
      g.e = Math.max(g.e, e);
      g.heads.push(head);
    } else groups.push({ s, e, heads: [head] });
  }
  const rows: DiffViewRow[] = [];
  const row = (i: number): DiffViewRow => ({ kind: settled[i] ? "+" : " ", text: all[i]!, line: i + 1, own: i + 1 });
  const fold = (s: number, e: number) => {
    if (e - s === 1) rows.push(row(s));
    else if (e > s)
      rows.push({ kind: "fold", text: `${e - s} unchanged lines`, line: s + 1, own: s + 1, count: e - s });
  };
  let shown = 0;
  for (const g of groups) {
    fold(shown, g.s);
    rows.push({ kind: "@@", text: g.heads.join(" · "), line: g.s + 1, own: g.s + 1 });
    for (let i = g.s; i < g.e; i++) rows.push(row(i));
    shown = g.e;
  }
  fold(shown, all.length);
  return { text, rows, lines };
}

/**
 * Each conflict's base where the markers didn't hold it, from the index's stages (`base` stage 1, `ours` 2, `theirs`
 * 3): where yours sits in stage 2, and theirs in 3, mapped back onto stage 1 through each side's changes. Yours is
 * looked for where the stretches before it put it, else wherever it is; a conflict found on neither side keeps none.
 * Line endings and a byte order mark aren't compared: git's index can hold LF where a checkout has CRLF.
 */
export function withStages(
  f: Conflicted,
  stages: { base: string | null; ours: string | null; theirs: string | null },
): Conflicted {
  if (stages.base === null) return f;
  const norm = (t: string | null) => (t === null ? null : linesOf(comparable(t)).lines);
  const B = norm(stages.base)!;
  const O = norm(stages.ours);
  const T = norm(stages.theirs);
  const ho = O ? diffLines(B, O) : null;
  const ht = T ? diffLines(B, T) : null;
  let atO = 0;
  let atT = 0;
  const segments = f.segments.map((s): Segment => {
    if (s.kind === "plain") {
      atO += s.lines.length;
      atT += s.lines.length;
      return s;
    }
    const ranges: [number, number][] = [];
    const o = O && ho ? locate(O, s.ours.map(bare), atO) : null;
    if (o !== null) ranges.push(toBase(ho!, o, o + s.ours.length));
    const t = T && ht ? locate(T, s.theirs.map(bare), atT) : null;
    if (t !== null) ranges.push(toBase(ht!, t, t + s.theirs.length));
    atO = (o ?? atO) + s.ours.length;
    atT = (t ?? atT) + s.theirs.length;
    if (s.base !== null || !ranges.length) return s;
    const from = Math.min(...ranges.map((r) => r[0]));
    const to = Math.max(...ranges.map((r) => r[1]));
    return { ...s, base: B.slice(from, to) };
  });
  return { ...f, segments };
}

/** Where `want` sits in `lines`: at `at` when it's there, else its first place from there on, else anywhere; null. */
function locate(lines: string[], want: string[], at: number): number | null {
  const there = (p: number) => p >= 0 && p + want.length <= lines.length && want.every((l, i) => lines[p + i] === l);
  if (there(at)) return at;
  if (!want.length) return null;
  for (let p = at; p + want.length <= lines.length; p++) if (there(p)) return p;
  for (let p = 0; p < Math.min(at, lines.length); p++) if (there(p)) return p;
  return null;
}

/**
 * A side's lines `[from, to)` as the base's: through the hunks that turned the base into that side, a boundary inside
 * a hunk widened to the whole of it, so a change the conflict holds is in its base whole — a deletion where the run
 * starts too (where it ends, the shift past it takes it).
 */
export function toBase(hunks: Hunk[], from: number, to: number): [number, number] {
  const at = (p: number, end: boolean): number => {
    let shift = 0;
    for (const h of hunks) {
      const inside = end
        ? h.bStart < p && p <= h.bStart + h.bLen
        : (h.bStart <= p && p < h.bStart + h.bLen) || (h.bLen === 0 && h.bStart === p);
      if (inside) return end ? h.aStart + h.aLen : h.aStart;
      if (h.bStart + h.bLen <= p) shift += h.bLen - h.aLen;
      else break;
    }
    return p - shift;
  };
  const a = at(from, false);
  return [a, Math.max(a, at(to, true))];
}

/**
 * A conflict for the agent (the scratch): its lines in the text it was read from — the markers' first to last — and
 * the conflict with `context` lines around it, its base between the sides (diff3's way) where it's known.
 */
export function conflictExcerpt(
  f: Conflicted,
  k: number,
  context = 3,
): { from: number; to: number; text: string } | null {
  let n = 0;
  for (let i = 0; i < f.segments.length; i++) {
    const s = f.segments[i]!;
    if (s.kind !== "conflict" || n++ !== k) continue;
    const before = f.segments[i - 1];
    const after = f.segments[i + 1];
    const lead = before?.kind === "plain" ? before.lines.slice(-context) : [];
    const trail = after?.kind === "plain" ? after.lines.slice(0, context) : [];
    const marked = markersOf(s).length;
    return {
      from: s.line,
      to: s.line + marked - 1,
      text: [...lead, ...markersOf(s, s.base !== null), ...trail].join("\n"),
    };
  }
  return null;
}
