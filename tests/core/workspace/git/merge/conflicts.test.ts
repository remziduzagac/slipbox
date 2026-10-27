import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { diffLines, merge3 } from "../../../../../src/core/workspace/git/merge/merge.ts";
import {
  conflictExcerpt,
  conflictsOf,
  fromMerge,
  parseConflicts,
  readConflicts,
  resultParts,
  resultText,
  resultView,
  toBase,
  withStages,
} from "../../../../../src/core/workspace/git/merge/conflicts.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("a file in conflict, read for the merge screen (GIT-D5)", () => {
  const TWO = [
    "# Sync",
    "",
    "<<<<<<< HEAD",
    "Retry up to a minute.",
    "=======",
    "Retry with a budget of five.",
    ">>>>>>> agent/sync-retry",
    "",
    "Middle.",
    "",
    "<<<<<<< HEAD",
    "A 409 parks the op.",
    "=======",
    "A 409 drops the op.",
    ">>>>>>> agent/sync-retry",
    "End.",
    "",
  ].join("\n");
  const STAGES = {
    base: "# Sync\n\nRetry forever.\n\nMiddle.\n\nA 409 retries the op.\nEnd.\n",
    ours: "# Sync\n\nRetry up to a minute.\n\nMiddle.\n\nA 409 parks the op.\nEnd.\n",
    theirs: "# Sync\n\nRetry with a budget of five.\n\nMiddle.\n\nA 409 drops the op.\nEnd.\n",
  };

  test("git's markers read: plain stretches and conflicts, their labels and lines; written back as they were", () => {
    const f = parseConflicts(TWO);
    expect(f.final).toBe(true);
    expect(f.segments.map((s) => s.kind)).toEqual(["plain", "conflict", "plain", "conflict", "plain"]);
    const [a, b] = conflictsOf(f);
    expect(a).toMatchObject({
      ours: ["Retry up to a minute."],
      theirs: ["Retry with a budget of five."],
      base: null,
      oursLabel: "HEAD",
      theirsLabel: "agent/sync-retry",
      line: 3,
    });
    expect(b!.line).toBe(11);
    expect(resultText(f, [null, null])).toBe(TWO);
    const d3 = parseConflicts("<<<<<<<\r\nmine\r\n||||||| base\r\nold\r\n=======\r\ntheirs\r\n>>>>>>> x\r\n");
    expect(conflictsOf(d3)[0]).toMatchObject({
      ours: ["mine\r"],
      base: ["old\r"],
      markedBase: true,
      theirs: ["theirs\r"],
      oursLabel: "",
      theirsLabel: "x",
    });
  });

  test("markers that don't close are text, and a setext heading's ======= outside a conflict too", () => {
    expect(conflictsOf(parseConflicts("Title\n=======\n\n<<<<<<< HEAD\nno end\n")).length).toBe(0);
    expect(resultText(parseConflicts("Title\n=======\n"), [])).toBe("Title\n=======\n");
    const f = parseConflicts("<<<<<<< a\nx\n<<<<<<< b\ny\n=======\nz\n>>>>>>> c\n");
    expect(f.segments[0]).toEqual({ kind: "plain", lines: ["<<<<<<< a", "x"] });
    expect(conflictsOf(f)[0]).toMatchObject({ ours: ["y"], theirs: ["z"], line: 3 });
    // A heading's ======= inside a side: either could part them, so the conflict is ambiguous, read the first way and
    // written back as it was.
    const setext = parseConflicts("<<<<<<< a\nMine\n=======\nTheirs\n=======\n>>>>>>> b\n");
    expect(conflictsOf(setext)[0]).toMatchObject({ ours: ["Mine"], theirs: ["Theirs", "======="] });
    expect(conflictsOf(setext)[0]!.ambiguous!.map((w) => [w.ours, w.theirs])).toEqual([
      [["Mine"], ["Theirs", "======="]],
      [["Mine", "=======", "Theirs"], []],
    ]);
    expect(resultText(setext, [null])).toBe("<<<<<<< a\nMine\n=======\nTheirs\n=======\n>>>>>>> b\n");
    expect(conflictsOf(parseConflicts("<<<<<<< a\nMine\n=======\nTheirs\n>>>>>>> b\n"))[0]!.ambiguous).toBeUndefined();
  });

  test("a ======= line inside yours: split where stages 2 and 3 have it, else ambiguous (regression)", () => {
    // As git writes it: yours added a setext heading (its underline seven long) where theirs changed the line.
    const text = "start\n<<<<<<< HEAD\nSummary\n=======\nours body\n=======\ntheirs body\n>>>>>>> theirs\nend\n";
    const stages = {
      base: "start\nold\nend\n",
      ours: "start\nSummary\n=======\nours body\nend\n",
      theirs: "start\ntheirs body\nend\n",
    };
    const [c] = conflictsOf(withStages(parseConflicts(text), stages));
    expect(c).toMatchObject({ ours: ["Summary", "=======", "ours body"], theirs: ["theirs body"], base: ["old"] });
    expect(c!.ambiguous).toBeUndefined();
    const f = readConflicts(text, stages);
    expect(resultText(f, ["ours"])).toBe("start\nSummary\n=======\nours body\nend\n");
    expect(resultText(f, ["theirs"])).toBe("start\ntheirs body\nend\n");
    // No stages, or none that holds one way alone: ambiguous, its base unknown.
    expect(
      conflictsOf(withStages(parseConflicts(text), { base: null, ours: null, theirs: null }))[0]!.ambiguous,
    ).toHaveLength(2);
    const edited = withStages(parseConflicts(text), { ...stages, theirs: "start\nsomething else\nend\n" });
    expect(conflictsOf(edited)[0]).toMatchObject({ base: null, ambiguous: expect.any(Array) });
  });

  test("a ======= line in diff3's base: split where the stages have it, else ambiguous (regression)", () => {
    const text = "start\n<<<<<<< HEAD\nours\n||||||| base\nTitle7\n=======\n=======\ntheirs\n>>>>>>> theirs\nend\n";
    const [read] = conflictsOf(parseConflicts(text));
    expect(read).toMatchObject({ ours: ["ours"], base: ["Title7"], theirs: ["=======", "theirs"], markedBase: true });
    expect(read!.ambiguous).toHaveLength(2);
    const stages = {
      base: "start\nTitle7\n=======\nend\n",
      ours: "start\nours\nend\n",
      theirs: "start\ntheirs\nend\n",
    };
    const f = readConflicts(text, stages);
    expect(conflictsOf(f)[0]).toMatchObject({ base: ["Title7", "======="], theirs: ["theirs"] });
    expect(resultText(f, ["theirs"])).toBe("start\ntheirs\nend\n");
    // Unsettled, written back as git wrote it.
    expect(resultText(f, [null])).toBe(text);
    // A ======= in yours, before the base's marker, is yours: no ambiguity.
    const before = conflictsOf(parseConflicts("<<<<<<< a\nT\n=======\n||||||| b\nB\n=======\nX\n>>>>>>> c\n"))[0]!;
    expect(before).toMatchObject({ ours: ["T", "======="], base: ["B"], theirs: ["X"] });
    expect(before.ambiguous).toBeUndefined();
  });

  test("a fenced example of git's markers is text; git's own conflict in a code block is one (regression)", () => {
    const example = "```\n<<<<<<< HEAD\nmine\n=======\nyours\n>>>>>>> b\n```\n";
    expect(conflictsOf(parseConflicts(`# How to\n\n${example}`)).length).toBe(0);
    expect(conflictsOf(parseConflicts(`# How to\n\n${example.replaceAll("```", "~~~~")}`)).length).toBe(0);
    // A real one after the example is still read, and the example kept byte for byte.
    const both = `# How to\n\n${example}\n<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> x\n`;
    const f = parseConflicts(both);
    expect(conflictsOf(f)).toHaveLength(1);
    expect(conflictsOf(f)[0]!.line).toBe(11);
    expect(resultText(f, ["ours"])).toBe(`# How to\n\n${example}\nA\n`);
    // Markers the fence's end falls between: a conflict across it, not an example.
    expect(conflictsOf(parseConflicts("```\n<<<<<<< HEAD\na\n```\n=======\nb\n```\n>>>>>>> x\n")).length).toBe(1);
    // With git's stages: an example both sides have is text; markers neither side has are git's, fence or not.
    const inBlock = "```ts\n<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> x\n```\n";
    const code = readConflicts(inBlock, {
      base: "```ts\nconst a = 0;\n```\n",
      ours: "```ts\nconst a = 1;\n```\n",
      theirs: "```ts\nconst a = 2;\n```\n",
    });
    expect(conflictsOf(code)).toHaveLength(1);
    expect(resultText(code, ["theirs"])).toBe("```ts\nconst a = 2;\n```\n");
    const doc = `# How to\n\n${example}\nend\n`;
    const kept = readConflicts(`${doc.replace("end", "<<<<<<< HEAD\nend, mine\n=======\nend, theirs\n>>>>>>> x")}`, {
      base: doc,
      ours: doc.replace("end", "end, mine"),
      theirs: doc.replace("end", "end, theirs"),
    });
    expect(conflictsOf(kept).map((c) => c.ours)).toEqual([["end, mine"]]);
  });

  test("settled: yours, theirs, both either way, or lines of your own; the rest still marked", () => {
    const f = parseConflicts(TWO);
    expect(resultText(f, ["ours", "theirs"])).toBe(
      "# Sync\n\nRetry up to a minute.\n\nMiddle.\n\nA 409 drops the op.\nEnd.\n",
    );
    const both = resultText(f, ["both", "both-theirs"]).split("\n");
    expect(both.slice(2, 4)).toEqual(["Retry up to a minute.", "Retry with a budget of five."]);
    expect(both.slice(7, 9)).toEqual(["A 409 drops the op.", "A 409 parks the op."]);
    expect(resultText(f, [{ lines: ["Mine."] }, null])).toContain("Mine.\n\nMiddle.\n\n<<<<<<< HEAD\n");
    expect(
      resultParts(f, ["ours", null])
        .filter((p) => p.conflict !== undefined)
        .map((p) => [p.line, p.settled]),
    ).toEqual([
      [3, true],
      [7, false],
    ]);
  });

  test("each conflict's base from the index's stage 1: yours found in stage 2, theirs in 3, mapped back", () => {
    const f = withStages(parseConflicts(TWO), STAGES);
    expect(conflictsOf(f).map((c) => c.base)).toEqual([["Retry forever."], ["A 409 retries the op."]]);
    const edited = withStages(parseConflicts(`An added line.\n${TWO}`), STAGES);
    expect(conflictsOf(edited).map((c) => c.base)).toEqual([["Retry forever."], ["A 409 retries the op."]]);
    const gone = withStages(parseConflicts("a\n<<<<<<< HEAD\n=======\nB\n>>>>>>> x\nc\n"), {
      base: "a\nb\nc\n",
      ours: "a\nc\n",
      theirs: "a\nB\nc\n",
    });
    expect(conflictsOf(gone)[0]!.base).toEqual(["b"]);
    // Theirs gone from the index: the base from yours alone, its empty run placed where the stretches before put it.
    const ours = withStages(parseConflicts("a\n<<<<<<< HEAD\n=======\nB\n>>>>>>> x\nc\n"), {
      base: "a\nb\nc\n",
      ours: "a\nc\n",
      theirs: null,
    });
    expect(conflictsOf(ours)[0]!.base).toEqual(["b"]);
    expect(conflictsOf(withStages(parseConflicts(TWO), { ...STAGES, base: null }))[0]!.base).toBeNull();
    const d3 = "<<<<<<< a\nx\n||||||| b\nmarked\n=======\ny\n>>>>>>> c\n";
    expect(conflictsOf(withStages(parseConflicts(d3), { base: "q\n", ours: "x\n", theirs: "y\n" }))[0]!.base).toEqual([
      "marked",
    ]);
  });

  test("a side's lines as the base's: a boundary inside a change widened to the whole of it", () => {
    const h = diffLines(["a", "b", "c", "d"], ["a", "X", "d"]);
    expect(toBase(h, 1, 2)).toEqual([1, 3]);
    expect(toBase(h, 0, 1)).toEqual([0, 1]);
    expect(toBase(h, 2, 3)).toEqual([3, 4]);
    const del = diffLines(["a", "b", "c"], ["a", "c"]);
    expect(toBase(del, 1, 1)).toEqual([1, 2]);
  });

  test("the conflict prompt's merge read the same way: each conflict with its base, labelled yours and theirs", () => {
    const base = "one\ntwo\nthree\n";
    const f = fromMerge(base, "one\nTWO\nthree\n", "one\ntwo-t\nthree\n");
    expect(conflictsOf(f)[0]).toMatchObject({ ours: ["TWO"], theirs: ["two-t"], base: ["two"], line: 2 });
    expect(resultText(f, [null])).toBe(merge3(base, "one\nTWO\nthree\n", "one\ntwo-t\nthree\n").text);
    expect(resultText(f, ["theirs"])).toBe("one\ntwo-t\nthree\n");
    // The final line break ends the last line: no empty line after it, in the result as drawn either.
    expect(f.segments[f.segments.length - 1]).toEqual({ kind: "plain", lines: ["three"] });
    expect(resultView(f, ["theirs"]).rows.at(-1)).toMatchObject({ kind: " ", text: "three" });
    expect(fromMerge("a", "b", "c").final).toBe(false);
  });

  test("a conflict for the agent: its lines in the file, the base between the sides, three lines around", () => {
    const f = withStages(parseConflicts(TWO), STAGES);
    const ex = conflictExcerpt(f, 1)!;
    expect([ex.from, ex.to]).toEqual([11, 15]);
    expect(ex.text.split("\n")).toEqual([
      "",
      "Middle.",
      "",
      "<<<<<<< HEAD",
      "A 409 parks the op.",
      "||||||| base",
      "A 409 retries the op.",
      "=======",
      "A 409 drops the op.",
      ">>>>>>> agent/sync-retry",
      "End.",
    ]);
    expect(conflictExcerpt(f, 2)).toBeNull();
  });

  test("the result as the merge screen draws it: each conflict under its head, the stretches between folded", () => {
    const long = ["<<<<<<< a", "x", "=======", "y", ">>>>>>> b", ...Array.from({ length: 10 }, (_, i) => `l${i}`)];
    const f = parseConflicts(`${long.join("\n")}\n<<<<<<< a\np\n=======\nq\n>>>>>>> b\n`);
    const v = resultView(f, ["ours", null]);
    expect(v.lines).toEqual([1, 12]);
    expect(
      v.rows.map((r) => (r.kind === "@@" || r.kind === "fold" ? `${r.kind} ${r.text}` : `${r.kind}${r.text}`)),
    ).toEqual([
      "@@ conflict 1, line 1: yours",
      "+x",
      " l0",
      " l1",
      "fold 6 unchanged lines",
      "@@ conflict 2, line 12: not settled",
      " l8",
      " l9",
      " <<<<<<< a",
      " p",
      " =======",
      " q",
      " >>>>>>> b",
    ]);
    // Two whose lines around them leave one line between: one group, both heads in it; a line alone at the end shown.
    const near = parseConflicts(
      "<<<<<<< a\nx\n=======\ny\n>>>>>>> b\nm1\nm2\nm3\nm4\nm5\n<<<<<<< a\np\n=======\nq\n>>>>>>> b\nz1\nz2\nz3\n",
    );
    const rows = resultView(near, ["ours", "theirs"]).rows.map((r) => `${r.kind}${r.text}`);
    expect(rows).toEqual([
      "@@conflict 1, line 1: yours · conflict 2, line 7: theirs",
      "+x",
      " m1",
      " m2",
      " m3",
      " m4",
      " m5",
      "+q",
      " z1",
      " z2",
      " z3",
    ]);
  });
});
