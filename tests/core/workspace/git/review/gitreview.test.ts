import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { parseMarkdown } from "../../../../../src/core/documents/markdown/parse.ts";
import {
  comparable,
  diffView,
  diffWords,
  inRanges,
  pairLines,
  unseenChange,
  unseenRows,
} from "../../../../../src/core/workspace/git/merge/merge.ts";
import {
  findChange,
  hunkEntry,
  hunkLines,
  hunkView,
  movedBy,
  sameChange,
  tallyText,
} from "../../../../../src/core/workspace/git/review/gitreview.ts";
import { gitChanges } from "../../../../../src/core/workspace/git/gitsigns.ts";
import { blockDiff, blockText, noteBlocks } from "../../../../../src/core/foundation/text/blockdiff.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("changed words inside changed lines (GIT-D2)", () => {
  /** The text of each range. */
  const words = (text: string, ranges: [number, number][] | undefined) =>
    (ranges ?? []).map(([s, e]) => text.slice(s, e));

  test("prose: a word changed in a long line is that word; runs with only spaces between them are one", () => {
    const a =
      "An op the server rejects with a 5xx or a network error is retried with exponential backoff, up to a minute.";
    const b =
      "An op the server rejects with a 5xx or a network error is retried with decorrelated backoff, up to a minute.";
    const w = diffWords(a, b);
    expect([words(a, w.del), words(b, w.add)]).toEqual([["exponential"], ["decorrelated"]]);
    expect(w.alike).toBeGreaterThan(0.9);
    // Two words, a space between them: one run, the space in it; the word kept between two changes: not.
    const two = diffWords("the quick brown fox jumps", "the slow red fox jumps");
    expect(words("the quick brown fox jumps", two.del)).toEqual(["quick brown"]);
    expect(words("the slow red fox jumps", two.add)).toEqual(["slow red"]);
    const apart = diffWords("lines 17 to 21 of retry.ts", "lines 12 to 15 of retry.ts");
    expect(words("lines 17 to 21 of retry.ts", apart.del)).toEqual(["17", "21"]);
    // Chinese or Japanese has no spaces between its words: a character at a time.
    const cjk = diffWords("漢字かな交じり文です", "漢字カナ交じり文です");
    expect(words("漢字かな交じり文です", cjk.del)).toEqual(["かな"]);
    // An indent changed, nothing else: the white space is what changed.
    expect(words("    x = 1", diffWords("    x = 1", "  x = 1").del)).toEqual(["    "]);
    // A word put in: the word, not the space that came with it.
    expect(words("one more two", diffWords("one two", "one more two").add)).toEqual(["more"]);
  });

  test("code: an identifier whole, never part of one; punctuation marked, not counted in how alike", () => {
    const a = "  const retryCount = budget(op, now);";
    const b = "  const retryLimit = budget(op, now, jitter);";
    const w = diffWords(a, b);
    expect(words(a, w.del)).toEqual(["retryCount"]);
    expect(words(b, w.add)).toEqual(["retryLimit", ", jitter"]);
    // Words: const retryCount budget op now (5) and const retryLimit budget op now jitter (6), four kept.
    expect(w.alike).toBeCloseTo(8 / 11);
    // Punctuation alone, on both: alike.
    expect(diffWords("}", "});").alike).toBe(1);
  });

  test("a hunk's lines paired, each removed with the added line most like it, in order; under half alike, none", () => {
    // docs/sync.md on the example set's agent/sync-retry: a sentence rewritten over two lines, and a line whose
    // numbers changed.
    const removed = [
      "so on up to a minute. Until the retry budget of [ADR 4](adr/0004-retry-budget.md) is on, an op is retried forever.",
      "The numbers are `DEFAULT_POLICY` in [lines 17 to 21 of retry.ts](../src/sync/retry.ts#L17-L21).",
    ];
    const added = [
      "so on up to a minute. Each op has a retry budget of five attempts",
      "([ADR 4](adr/0004-retry-budget.md)); the sixth failure parks it, so one bad op can no longer hold the whole queue.",
      "The numbers are `DEFAULT_POLICY` in [lines 12 to 15 of retry.ts](../src/sync/retry.ts#L12-L15).",
    ];
    const pairs = pairLines(removed, added);
    expect(pairs.map((p) => [p.del, p.add])).toEqual([[1, 2]]);
    expect(words(removed[1]!, pairs[0]!.delWords)).toEqual(["17", "21", "L17", "L21"]);
    expect(words(added[2]!, pairs[0]!.addWords)).toEqual(["12", "15", "L12", "L15"]);
    // Code: each with its own, past a line added between; the order kept.
    const code = pairLines(
      ["let wait = p.base;", "return verdict(attempt, status);"],
      ["let wait = p.jitter.base;", "attempt++;", "return verdict(attempt, status, p);"],
    );
    expect(code.map((p) => [p.del, p.add])).toEqual([
      [0, 0],
      [1, 2],
    ]);
    // Most alike: the removed line more like the added one takes it, before it or after it.
    const one = ["alpha beta gamma delta epsilon"];
    expect(pairLines(["alpha beta gamma", "alpha beta gamma delta"], one)).toMatchObject([{ del: 1, add: 0 }]);
    expect(pairLines(["alpha beta gamma delta", "alpha beta gamma"], one)).toMatchObject([{ del: 0, add: 0 }]);
    expect(pairLines(["one"], [])).toEqual([]);
  });

  test("the diff's rows: a head before each group, the context, the unchanged stretches folded — or opened", () => {
    const from = `${Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n")}\n`;
    const to = from.replace("line 2\n", "line two\n").replace("line 18\n", "line 18\nline 18 and a half\n");
    const rows = diffView(from, to);
    expect(rows.map((r) => `${r.kind}|${r.text}|${r.line}|${r.own}`)).toEqual([
      "@@|line 2|2|2",
      " |line 1|1|1",
      "-|line 2|2|2",
      "+|line two|2|2",
      " |line 3|3|3",
      " |line 4|4|4",
      " |line 5|5|5",
      "fold|10 unchanged lines|6|6",
      "@@|line 19|19|19",
      " |line 16|16|16",
      " |line 17|17|17",
      " |line 18|18|18",
      "+|line 18 and a half|19|19",
      " |line 19|20|19",
      " |line 20|21|20",
    ]);
    // The pair's changed words, on both rows.
    expect(rows[2]!.words).toEqual([[5, 6]]);
    expect(rows[3]!.words).toEqual([[5, 8]]);
    expect(rows[7]!.count).toBe(10);
    // Opened: its lines in its place, each at its line in `to`.
    const open = diffView(from, to, new Set([6]));
    expect(open.filter((r) => r.kind === "fold")).toEqual([]);
    expect(open.slice(7, 17).map((r) => `${r.text}|${r.line}`)).toEqual(
      [6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => `line ${n}|${n}`),
    );
    // A stretch of one line is shown, never folded: before the first group, after the last, and between two changes,
    // which are then one group.
    const near = diffView("a\nb\nc\nd\ne\nf\ng\nh\ni\n", "a\nb\nc\nd\nE\nf\ng\nh\ni\n");
    expect(near.map((r) => r.kind).join("")).toBe("@@    -+    ");
    const two = diffView(from, from.replace("line 2\n", "line two\n").replace("line 10\n", "line ten\n"));
    expect(two.filter((r) => r.kind === "@@").length).toBe(1);
    expect(two.map((r) => r.text).slice(0, 15)).toEqual([
      "line 2",
      "line 1",
      "line 2",
      "line two",
      ...[3, 4, 5, 6, 7, 8, 9].map((n) => `line ${n}`),
      "line 10",
      "line ten",
      "line 11",
      "line 12",
    ]);
    // Folded before the first group, and after the last.
    const far = diffView(from, from.replace("line 10\n", "line ten\n"));
    expect(far.map((r) => (r.kind === "fold" ? r.count : r.kind))).toEqual([
      6,
      "@@",
      " ",
      " ",
      " ",
      "-",
      "+",
      " ",
      " ",
      " ",
      7,
    ]);
    expect(diffView("same\n", "same\n")).toEqual([]);
  });

  test("line endings and a byte order mark aren't compared; what changed of them, and of the final line break, is said", () => {
    const lf = "one line\ntwo line\nthree line\n";
    const crlf = lf.replace(/\n/g, "\r\n");
    expect(diffView(comparable(crlf), comparable(lf))).toEqual([]);
    expect(diffView(comparable(`\uFEFF${lf}`), comparable(lf))).toEqual([]);
    // One word changed, CRLF on one side: that line alone.
    const one = diffView(comparable(lf), comparable(crlf.replace("two line", "two lines")));
    expect(one.filter((r) => r.kind === "-" || r.kind === "+").map((r) => `${r.kind} ${r.text}`)).toEqual([
      "- two line",
      "+ two lines",
    ]);
    expect(unseenChange(crlf, lf)).toBe("the line endings (CRLF → LF)");
    expect(unseenChange(lf, `\uFEFF${lf}`)).toBe("the byte order mark (added)");
    expect(unseenChange("a\nb", "a\nb\n")).toBe("the final line break (added)");
    expect(unseenChange("a\r\nb\r\n", "a\nb")).toBe("the line endings (CRLF → LF) and the final line break (removed)");
    expect(unseenChange("a\r\nb\n", "a\nb\n")).toBe("the line endings (mixed → LF)");
    expect(unseenChange(lf, lf)).toBeNull();
  });

  test("what no line shows is a row of the diff: the line endings and the mark at its start, the final newline at its end", () => {
    const lf = "one line\ntwo line\nthree line\n";
    const crlf = lf.replace(/\n/g, "\r\n");
    expect(unseenRows(crlf, lf)).toEqual({ start: ["line endings: CRLF → LF"], end: [] });
    expect(unseenRows(lf, `﻿${lf}`)).toEqual({ start: ["byte order mark added"], end: [] });
    expect(unseenRows("a\nb\n", "a\nb")).toEqual({ start: [], end: ["no newline at end of file"] });
    expect(unseenRows("a\nb", "a\r\nb\r\n")).toEqual({
      start: ["line endings: LF → CRLF"],
      end: ["newline at end of file added"],
    });
    // A file made or emptied has no last line to compare: every line is added, or removed.
    expect([unseenRows("", "a\nb"), unseenRows("a\nb\n", "")]).toEqual([
      { start: [], end: [] },
      { start: [], end: [] },
    ]);
    expect(unseenRows(lf, lf)).toEqual({ start: [], end: [] });
    // In the diff: alone, its rows are the diff; with a line changed, before its first row and after its last — each at
    // its place, line 1 and the last line.
    const said = unseenRows(crlf, "one line\ntwo line\nthree line");
    const rows = (a: string, b: string) => diffView(comparable(a), comparable(b), new Set(), 3, said);
    expect(rows(crlf, "one line\ntwo line\nthree line").map((r) => [r.kind, r.text, r.line])).toEqual([
      ["\\", "line endings: CRLF → LF", 1],
      ["\\", "no newline at end of file", 3],
    ]);
    expect(rows(crlf, "one line\ntwo lines\nthree line").map((r) => `${r.kind} ${r.text}`)).toEqual([
      "\\ line endings: CRLF → LF",
      "@@ line 2",
      "  one line",
      "- two line",
      "+ two lines",
      "  three line",
      "\\ no newline at end of file",
    ]);
  });

  test("an offset in a word's ranges, found by halves", () => {
    const ranges: [number, number][] = [
      [2, 4],
      [7, 8],
      [10, 15],
    ];
    const inside = Array.from({ length: 17 }, (_, at) => inRanges(ranges, at));
    expect(inside.flatMap((x, at) => (x ? [at] : []))).toEqual([2, 3, 7, 10, 11, 12, 13, 14]);
    expect(inRanges([], 0)).toBe(false);
  });
});

describe("a note's diff as blocks, before and after (GIT-D2)", () => {
  const note = [
    "# Sync",
    "",
    "The queue is drained by a loop that wakes every 30 seconds.",
    "",
    "## Retry",
    "",
    "The 409 case is the one that bit us: a conflict is not transient. Since 2.3 a 409 parks",
    "the op, and the loop goes on.",
    "",
    "- Two ops on the same field: the later one wins.",
    "  - the loser stays in the log",
    "- A delete beats an edit.",
    "",
    "| State | Meaning |",
    "| --- | --- |",
    "| pending | waiting its turn |",
    "| parked | taken out after a conflict |",
    "",
    "[ref]: https://example.com",
    "",
    "The end.",
    "",
  ].join("\n");
  const blocksOf = (text: string) => {
    const lines = text.split("\n").slice(0, -1);
    return noteBlocks(parseMarkdown(text).tree, lines).map((b) => [b.from, b.to, b.node?.type ?? null]);
  };
  const shape = (d: ReturnType<typeof blockDiff>) =>
    d.items.map((i) =>
      i.kind === "@@"
        ? `@@ ${i.line} ${i.heading}`
        : i.kind === "fold"
          ? `fold ${i.own}+${i.count} at ${i.line}`
          : i.kind === "change"
            ? `change ${i.before.from}-${i.before.to} ${i.after.from}-${i.after.to}`
            : i.kind === "same"
              ? `same ${i.block.from}-${i.block.to}`
              : i.kind === "\\"
                ? `\\ ${i.text} at ${i.line}`
                : `${i.kind} ${i.block.from}-${i.block.to}`,
    );

  test("a note's blocks: its nodes, a list's items (a nested one after its item's own lines), a table's rows", () => {
    expect(noteBlocks(parseMarkdown(note).tree, note.split("\n")).flatMap((b) => (b.header ? [b.from] : []))).toEqual([
      14,
    ]);
    expect(blocksOf(note)).toEqual([
      [1, 1, "heading"],
      [3, 3, "paragraph"],
      [5, 5, "heading"],
      [7, 8, "paragraph"],
      [10, 10, "listItem"],
      [11, 11, "listItem"],
      [12, 12, "listItem"],
      // The header's row with its delimiter row.
      [14, 15, "tableRow"],
      [16, 16, "tableRow"],
      [17, 17, "tableRow"],
      [19, 19, "definition"],
      [21, 21, "paragraph"],
    ]);
  });

  test("white space is one in prose: a paragraph wrapped again differs only in its words", () => {
    const a = "Since 2.3 a 409 parks\nthe op, and the loop goes on.";
    const b = "Since the incident a 409\nparks the op, and the loop goes on.";
    const words = (s: string, r: [number, number][]) => r.map(([x, y]) => s.slice(x, y));
    const w = diffWords(a, b, true);
    expect([words(a, w.del), words(b, w.add)]).toEqual([["2.3"], ["the incident"]]);
    // As lines, the breaks that moved are changes too.
    expect(words(b, diffWords(a, b).add)).not.toEqual(["the incident"]);
  });

  test("a reworded sentence: its paragraph before and after, only the words that changed marked; the rest folded", () => {
    const to = note.replace("Since 2.3 a 409 parks\nthe op", "Since the incident a 409\nparks the op");
    const d = blockDiff(note, to);
    expect(shape(d)).toEqual(["fold 1+6 at 1", "@@ 7 ## Retry", "change 7-8 7-8", "fold 9+13 at 9"]);
    const change = d.items[2]!;
    if (change.kind !== "change") throw new Error("a change");
    const words = (s: string, r: [number, number][]) => r.map(([x, y]) => s.slice(x, y));
    expect(words(blockText(d.from, change.before), change.del)).toEqual(["2.3"]);
    expect(words(blockText(d.to, change.after), change.add)).toEqual(["the incident"]);
    // The window's text: a row each, as the source diff's read; each going to its line in `to`, a line before to where
    // its block is now.
    expect(d.units.map((u) => [u.text.slice(0, 12), u.line])).toEqual([
      ["6 unchanged ", 1],
      ["@@ ## Retry ", 7],
      ["- The 409 ca", 7],
      ["- the op, an", 7],
      ["+ The 409 ca", 7],
      ["+ parks the ", 8],
      ["13 unchanged", 9],
    ]);
    // One line of a paragraph changed: the paragraph, whole.
    const one = blockDiff(note, note.replace("the op, and the loop goes on.", "the op, and the loop goes on at once."));
    expect(shape(one).slice(1, 3)).toEqual(["@@ 7 ## Retry", "change 7-8 7-8"]);
    // Two changes with a line of text between: one group, that line shown.
    const two = blockDiff(note, to.replace("every 30 seconds", "every minute"));
    expect(shape(two).slice(0, 5)).toEqual(["@@ 1 null", "same 1-1", "change 3-3 3-3", "same 5-5", "change 7-8 7-8"]);
    // A fold opened: its blocks shown, unchanged.
    expect(shape(blockDiff(note, to, new Set([1])))).toEqual([
      "same 1-1",
      "same 3-3",
      "same 5-5",
      "@@ 7 ## Retry",
      "change 7-8 7-8",
      "fold 9+13 at 9",
    ]);
  });

  test("a block added, a block removed, a list item and a table's row changed; what's alike paired, what isn't not", () => {
    const to = note
      .replace("The queue is drained by a loop that wakes every 30 seconds.\n\n", "")
      .replace("the later one wins.", "the later ULID wins.")
      .replace("| parked | taken out after a conflict |", "| parked | taken out after a 409 conflict |")
      .replace("The end.\n", "The end.\n\nA new paragraph, about something else altogether.\n");
    expect(shape(blockDiff(note, to))).toEqual([
      "@@ 1 null",
      "same 1-1",
      "removed 3-3",
      "fold 5+5 at 3",
      "@@ 8 ## Retry",
      "change 10-10 8-8",
      "fold 11+6 at 9",
      "@@ 15 ## Retry",
      "change 17-17 15-15",
      "fold 18+4 at 16",
      "@@ 21 ## Retry",
      "added 21-21",
    ]);
    // Rewritten past half its words: removed and added, not paired.
    const rewritten = blockDiff(note, note.replace("A delete beats an edit.", "Nothing of the kind, at all."));
    expect(shape(rewritten).slice(1)).toEqual(["@@ 12 ## Retry", "removed 12-12", "added 12-12", "fold 13+9 at 13"]);
  });

  test("the same text: nothing; a new note: every block added; a note emptied: every block removed", () => {
    expect(blockDiff(note, note).items).toEqual([]);
    expect(
      new Set(
        blockDiff("", note)
          .items.slice(1)
          .map((i) => i.kind),
      ),
    ).toEqual(new Set(["added"]));
    expect(
      new Set(
        blockDiff(note, "")
          .items.slice(1)
          .map((i) => i.kind),
      ),
    ).toEqual(new Set(["removed"]));
  });

  /** A paragraph of `n` words: `seed` and a number, the numbers from `i`. */
  const para = (seed: string, i: number, n: number) =>
    Array.from({ length: n }, (_, k) => `${seed}${(i * 7919 + k * 104729) % 100003}`).join(" ");

  test("a note rewritten whole: its blocks removed and added, at once — a pair diffed by word only if it could be alike", () => {
    // Fifty paragraphs of 400 words, every word new.
    const note = (seed: string) => `${Array.from({ length: 50 }, (_, i) => para(seed, i, 400)).join("\n\n")}\n`;
    let t = performance.now();
    const d = blockDiff(note("w"), note("v"));
    expect(performance.now() - t).toBeLessThan(1000);
    expect(new Set(d.items.map((i) => i.kind))).toEqual(new Set(["@@", "removed", "added"]));
    // The same fifty words in every paragraph, in another order on each side: every pair could be alike by its words,
    // and only so many are diffed.
    let seed = 7;
    const shuffled = () =>
      `${Array.from({ length: 50 }, () =>
        Array.from({ length: 400 }, () => {
          seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
          return `w${seed % 50}`;
        }).join(" "),
      ).join("\n\n")}\n`;
    const [a, b] = [shuffled(), shuffled()];
    t = performance.now();
    blockDiff(a, b);
    expect(performance.now() - t).toBeLessThan(1000);
  });

  test("a note rewritten whole but a paragraph changed by a word: that one still paired, its word marked", () => {
    const from = Array.from({ length: 50 }, (_, i) => para("w", i, 60));
    const to = from.map((p, i) => (i === 10 ? p.replace(/^w\d+/, "CHANGED") : para("v", i, 60)));
    const a = `${from.join("\n\n")}\n`;
    const b = `${to.join("\n\n")}\n`;
    const changes = blockDiff(a, b).items.filter((i) => i.kind === "change");
    expect(changes.length).toBe(1);
    const c = changes[0]!;
    if (c.kind !== "change") throw new Error("a change");
    const text = (s: string, r: [number, number][]) => r.map(([x, y]) => s.slice(x, y));
    expect([c.before.from, text(from[10]!, c.del), text(to[10]!, c.add)]).toEqual([
      21,
      [from[10]!.split(" ")[0]!],
      ["CHANGED"],
    ]);
  });

  test("a block too big to diff by words: diffed by its lines, the changed lines marked and their changed words", () => {
    // A fence of 300 lines, past the tokens a pair is diffed by word: a word changed in one line, a line removed, a
    // line added.
    const fence = `intro\n\n\`\`\`js\n${Array.from({ length: 300 }, (_, i) => `const v${i} = ${i}; // about ${i}`).join("\n")}\n\`\`\`\n`;
    const to = fence
      .replace("const v5 = 5;", "const v5x = 5;")
      .replace("const v9 = 9; // about 9\n", "")
      .replace("// about 20\n", "// about 20\nconst added = true;\n");
    const d = blockDiff(fence, to);
    expect(shape(d)).toEqual(["@@ 1 null", "same 1-1", "change 3-304 3-304"]);
    const c = d.items[2]!;
    if (c.kind !== "change") throw new Error("a change");
    const runs = (s: string, r: [number, number][] | undefined) => (r ?? []).map(([x, y]) => s.slice(x, y));
    const [before, after] = [blockText(d.from, c.before), blockText(d.to, c.after)];
    // The lines changed, each with its line break; in the one paired with a line like it, its changed word.
    expect(runs(before, c.delLines)).toEqual(["const v5 = 5; // about 5\n", "const v9 = 9; // about 9\n"]);
    expect(runs(after, c.addLines)).toEqual(["const v5x = 5; // about 5\n", "const added = true;\n"]);
    expect([runs(before, c.del), runs(after, c.add)]).toEqual([["v5"], ["v5x"]]);
    // A block small enough: its words, no lines.
    const small = blockDiff(note, note.replace("the later one wins.", "the later ULID wins.")).items;
    expect(small.find((i) => i.kind === "change")).not.toHaveProperty("delLines");
  });

  test("enter on a line before a change goes to its line now, by the block's line diff; a line removed, where it was", () => {
    // A fence: a line added before them, one removed between, one added after.
    const from = "```\na\nb\nc\nd\n```\n";
    const to = "```\nNEW\na\nb\nd\nX\n```\n";
    const d = blockDiff(from, to);
    const c = d.items.find((i) => i.kind === "change")!;
    const before = d.units.slice(c.unit, c.unit + 6);
    expect(before.map((u) => [u.text, u.line])).toEqual([
      ["- ```", 1],
      ["- a", 3],
      ["- b", 4],
      ["- c", 5],
      ["- d", 5],
      ["- ```", 7],
    ]);
    // As the diff's lines have the line removed: where it was, the line after it.
    expect(diffView(from, to).find((r) => r.kind === "-")).toMatchObject({ text: "c", line: 5 });
  });

  test("what no line shows: a row before the first group, and one after the last", () => {
    const crlf = note.replace(/\n/g, "\r\n");
    const to = note.replace("the later one wins.", "the later ULID wins.").replace(/\n$/, "");
    const unseen = unseenRows(crlf, to);
    const d = blockDiff(comparable(crlf), comparable(to), new Set(), { unseen });
    const items = shape(d);
    expect([items[0], items.at(-1)]).toEqual(["\\ line endings: CRLF → LF at 1", "\\ no newline at end of file at 21"]);
    expect([d.units[0]!.text, d.units.at(-1)!.text]).toEqual([
      "\\ line endings: CRLF → LF",
      "\\ no newline at end of file",
    ]);
    // Alone: the rows alone.
    expect(shape(blockDiff(comparable(crlf), comparable(note), new Set(), { unseen: unseenRows(crlf, note) }))).toEqual(
      ["\\ line endings: CRLF → LF at 1"],
    );
  });

  test("pairLines pairs as diffing every pair by word would: the pairs its words rule out could never be half alike", () => {
    let seed = 99;
    const rnd = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return seed / 0x80000000;
    };
    const line = () =>
      Array.from(
        { length: 2 + Math.floor(rnd() * 8) },
        () => ["a", "b", "c", "d", "e", "f", ","][Math.floor(rnd() * 7)],
      )
        .join(" ")
        .replace(/ ,/g, ",");
    for (let t = 0; t < 300; t++) {
      const removed = Array.from({ length: 1 + Math.floor(rnd() * 6) }, line);
      const added = Array.from({ length: 1 + Math.floor(rnd() * 6) }, line);
      // Every pair diffed, the most alike pairs in order found as pairLines finds them.
      const sim = removed.map((r) => added.map((x) => diffWords(r, x).alike));
      const best = Array.from({ length: removed.length + 1 }, () => new Array(added.length + 1).fill(0));
      for (let i = 1; i <= removed.length; i++)
        for (let j = 1; j <= added.length; j++) {
          const s = sim[i - 1]![j - 1]!;
          best[i]![j] = Math.max(best[i - 1]![j]!, best[i]![j - 1]!, s >= 0.5 ? best[i - 1]![j - 1]! + s : 0);
        }
      const pairs = pairLines(removed, added);
      expect(pairs.reduce((n, p) => n + sim[p.del]![p.add]!, 0)).toBeCloseTo(best[removed.length]![added.length]!);
      for (const p of pairs) expect(sim[p.del]![p.add]!).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe("reviewing a change, a hunk at a time (GIT-D3)", () => {
  const now = ["one", "two", "THREE", "four", "five", "six", "seven", "eight"];
  const changes = gitChanges("one\ntwo\nthree\nfour\nfive\nsix\neight\n", `${now.join("\n")}\n`);
  test("a hunk with the file's lines around it, each row at its line in the file", () => {
    expect(changes.map((c) => c.kind)).toEqual(["change", "add"]);
    expect(hunkView(changes[1]!, now).rows.map((r) => `${r.kind}${r.line} ${r.text}`)).toEqual([
      "@@7 line 7",
      " 4 four",
      " 5 five",
      " 6 six",
      "+7 seven",
      " 8 eight",
    ]);
    expect(hunkView(changes[0]!, now).rows.map((r) => `${r.kind}${r.text}`)).toEqual([
      "@@line 3",
      " one",
      " two",
      "-three",
      "+THREE",
      " four",
      " five",
      " six",
    ]);
    const del = gitChanges("a\nb\nc\n", "a\nc\n")[0]!;
    expect(hunkView(del, ["a", "c"]).rows.map((r) => `${r.kind}${r.text}`)).toEqual(["@@line 2", " a", "-b", " c"]);
    expect(hunkLines(del)).toEqual({ from: 1, to: 1 });
    const fresh = gitChanges(null, "x\ny\n")[0]!;
    expect(hunkView(fresh, ["x", "y"]).rows.filter((r) => r.kind === "+").length).toBe(2);
  });
  test("a hunk found again once the index or the file moved: the same lines, the nearest", () => {
    const after = gitChanges("one\ntwo\nTHREE\nfour\nfive\nsix\neight\n", `${now.join("\n")}\n`);
    expect(after.length).toBe(1);
    expect(findChange(after, changes[1]!)).toEqual(after[0]!);
    expect(findChange(after, changes[0]!)).toBeNull();
    const twice = gitChanges("a\nb\na\nb\n", "a\nX\na\nX\n");
    expect(findChange(twice, { ...twice[1]!, from: 4 })).toBe(twice[1]!);
    expect(sameChange(twice[0]!, twice[1]!)).toBe(true);
    // The same lines now, but others staged under them: another change.
    expect(findChange(gitChanges("z\n", "Y\n"), gitChanges("x\n", "Y\n")[0]!)).toBeNull();
  });
  test("a hunk gone isn't found in the same lines elsewhere in the file: another change (regression)", () => {
    const staged = Array.from({ length: 200 }, (_, i) => `l${i}`);
    const t = (ls: string[]) => `${ls.join("\n")}\n`;
    const with2 = [...staged];
    with2.splice(10, 0, "TODO");
    with2.splice(191, 0, "TODO");
    const shown = gitChanges(t(staged), t(with2));
    expect(shown.map((c) => c.from)).toEqual([11, 192]);
    // The first gone (someone took it out); the other, the same line added, is still there, 180 lines on.
    const with1 = [...staged];
    with1.splice(190, 0, "TODO");
    const fresh = gitChanges(t(staged), t(with1));
    expect(findChange(fresh, shown[0]!)).toBeNull();
    expect(findChange(fresh, shown[1]!)).toBe(fresh[0]!);
  });
  test("a hunk found again after the review reverted one before it and kept another (movedBy)", () => {
    const staged = "a\nb\nc\nd\ne\nf\ng\nh\n";
    const now = "a\nNEW\nb\nc\nd\nMORE\ne\nf\ng\nH\n";
    const [first, second, third] = gitChanges(staged, now);
    expect([first!.from, second!.from, third!.from]).toEqual([2, 6, 10]);
    // The first reverted (the file loses its line), the second kept (what's staged gains its): the third moved in both.
    const reverted = "a\nb\nc\nd\nMORE\ne\nf\ng\nH\n";
    const kept = "a\nb\nc\nd\nMORE\ne\nf\ng\nh\n";
    const fresh = gitChanges(kept, reverted);
    expect(findChange(fresh, third!)).toBeNull();
    let moved = movedBy(third!, first!, "reverted");
    moved = movedBy(moved, movedBy(second!, first!, "reverted"), "kept");
    expect(moved).toMatchObject({ from: 9, to: 9, wasAt: 8 });
    expect(findChange(fresh, moved)).toBe(fresh[0]!);
    // One before it moves nothing.
    expect(movedBy(first!, third!, "reverted")).toBe(first!);
    expect(movedBy(first!, third!, "kept")).toBe(first!);
  });
  test("a note for the agent: where the hunk is, its diff, the note; what the review says at its end", () => {
    expect(hunkEntry("/v/docs/sync.md", changes[0]!, "keep the old wording", "/v")).toBe(
      "**At:** `docs/sync.md:3`\n\n```diff\n-three\n+THREE\n```\n\n**Note:** keep the old wording",
    );
    expect(tallyText({ kept: 1, reverted: 1, noted: 1, skipped: 0, left: 0 })).toBe(
      "review: 1 kept (staged), 1 reverted, 1 note for the agent in the scratch — space s y copies it",
    );
    expect(tallyText({ kept: 0, reverted: 0, noted: 0, skipped: 1, left: 2 })).toBe(
      "review: nothing kept, reverted or noted; 1 skipped, 2 left as they were",
    );
  });
});
