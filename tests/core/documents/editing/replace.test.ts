import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  compilePattern,
  expandReplacement,
  findAll,
  firstPerLine,
  parseSubstitute,
  replaceMatches,
} from "../../../../src/core/documents/editing/replace.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("find and replace (core/replace.ts)", () => {
  const re = (q: string, o: Partial<{ regex: boolean; whole: boolean; ignoreCase: boolean }> = {}) => {
    const r = compilePattern(q, { regex: false, whole: false, ...o });
    if (typeof r === "string") throw new Error(r);
    return r;
  };
  test("plain by default, smart case, whole words, regex, and a bad regex says why", () => {
    const text = "a.b axb A.B foo_a.b";
    expect(findAll(text, re("a.b")).map((m) => m.from)).toEqual([0, 8, 16]);
    expect(findAll(text, re("A.B")).map((m) => m.from)).toEqual([8]);
    expect(findAll(text, re("A.B", { ignoreCase: true })).length).toBe(3);
    expect(findAll(text, re("a.b", { regex: true })).length).toBe(4);
    expect(findAll(text, re("a.b", { whole: true })).map((m) => m.from)).toEqual([0, 8]);
    expect(typeof compilePattern("(", { regex: true, whole: false })).toBe("string");
  });
  test("findAll keeps within its range and skips empty matches", () => {
    expect(findAll("aaa", re("x*", { regex: true }))).toEqual([]);
    expect(findAll("cat cat cat", re("cat"), 1, 11).map((m) => m.from)).toEqual([4, 8]);
    expect(findAll("cat cat cat", re("cat"), 0, 6).map((m) => m.from)).toEqual([0]);
  });
  test("replacements: literal unless regex; $& $1 $$ with it", () => {
    const [m] = findAll("key=value", re("(\\w+)=(\\w+)", { regex: true }));
    expect(expandReplacement("$2=$1 ($&) $$", m!, true)).toBe("value=key (key=value) $");
    expect(expandReplacement("$2", m!, false)).toBe("$2");
    const ms = findAll("a b a", re("a"));
    expect(replaceMatches("a b a", ms, "xy", false)).toEqual({ text: "xy b xy", count: 2 });
  });
  test("vim's substitute: ranges, delimiters, flags, \\1 and & in the replacement", () => {
    expect(parseSubstitute("s/old/new/")).toEqual({
      range: "line",
      pattern: "old",
      replacement: "new",
      global: false,
      ignoreCase: false,
      confirm: false,
    });
    expect(parseSubstitute("%s/a/b/gic")).toMatchObject({
      range: "all",
      global: true,
      ignoreCase: true,
      confirm: true,
    });
    expect(parseSubstitute("'<,'>s/a/b")).toMatchObject({ range: "selection", replacement: "b" });
    expect(parseSubstitute("s#a/b#c#")).toMatchObject({ pattern: "a/b", replacement: "c" });
    expect(parseSubstitute("s/a\\/b/c/")).toMatchObject({ pattern: "a/b" });
    expect(parseSubstitute("s/(\\w+) (\\w+)/\\2 \\1 & \\& $5/")!.replacement).toBe("$2 $1 $& & $$5");
    expect(parseSubstitute("s/a/b/x")).toBeNull(); // not a flag
    expect(parseSubstitute("sort")).toBeNull();
    expect(parseSubstitute("s//b/")).toBeNull();
  });
});

describe("find and replace: character classes in a regex", () => {
  const re = (q: string) => {
    const r = compilePattern(q, { regex: true, whole: false });
    if (typeof r === "string") throw new Error(r);
    return r;
  };
  test("^ and $ inside a class are characters, not line anchors; outside one, a line's start and end", () => {
    const text = "a$b^c\r\nx$y\n";
    expect(findAll(text, re("[$^]")).map((m) => m.groups[0])).toEqual(["$", "^", "$"]);
    expect(findAll(text, re("[^$^\\r\\n]+")).map((m) => m.groups[0])).toEqual(["a", "b", "c", "x", "y"]);
    expect(findAll(text, re("[\\]$]")).map((m) => m.from)).toEqual([1, 8]); // an escaped ] doesn't end the class
    expect(findAll(text, re("c$")).map((m) => m.from)).toEqual([4]); // before the CRLF
    expect(findAll(text, re("[cy]$")).map((m) => m.from)).toEqual([4, 9]);
    // After a class, $ is the note's line end again: never before a lone \r, as a bare multiline $ would be.
    expect(findAll("p\rq\n", re("[p]$"))).toEqual([]);
    expect(findAll("p\rq\n", re("[q]$")).map((m) => m.from)).toEqual([2]);
    expect(findAll(text, re("^x")).map((m) => m.from)).toEqual([7]);
    expect(findAll(text, re("\\$")).map((m) => m.from)).toEqual([1, 8]);
  });
});

describe("review cycle 1 (core)", () => {
  test("regex ^ and $ are a line's; $ in CRLF ends before the \\r; empty matches only when asked", () => {
    const re = (q: string) => compilePattern(q, { regex: true, whole: false }) as RegExp;
    expect(findAll("# a\n# b\n", re("^# ")).length).toBe(2);
    expect(findAll("ab\r\ncb\r\n", re("b$")).map((m) => m.from)).toEqual([1, 5]);
    expect(findAll("a\nb\n", re("^"))).toEqual([]); // a search skips empty matches
    expect(findAll("a\nb\n", re("^"), 0, 4, true).map((m) => m.from)).toEqual([0, 2]); // not the line after the last
    expect(findAll("a\nb", re("$"), 0, 3, true).map((m) => m.from)).toEqual([1, 3]); // an unterminated last line
    expect(findAll("a\nb\n", re("^"), 0, 2, true).map((m) => m.from)).toEqual([0]); // the next line's start isn't in range
    const ms = findAll("a a\nb a a\n", re("a"));
    expect(firstPerLine("a a\nb a a\n", ms).map((m) => m.from)).toEqual([0, 6]);
  });
});

describe("review cycle 4 (core)", () => {
  const re = (q: string) => compilePattern(q, { regex: true, whole: false }) as RegExp;
  test("empty matches never split an emoji; $ in CRLF is one per line", () => {
    for (const m of findAll("x😀y😀", re("x*"), 0, 6, true)) expect([2, 5]).not.toContain(m.from); // inside a pair
    expect(findAll("a\r\nb\r\n", re("$"), 0, 6, true).map((m) => m.from)).toEqual([1, 4]);
  });
});

describe("review cycle 4 (core, CRLF empty matches)", () => {
  test("an empty match never falls between \\r and \\n", () => {
    const { findAll } = require("../../../../src/core/documents/editing/replace.ts");
    expect(findAll("aaa\r\nb\r\n", /a*/g, 0, 5, true)).toEqual([{ from: 0, to: 3, groups: ["aaa"] }]);
    expect(findAll("xy\r\n", /a*/g, 0, 4, true).map((m: { from: number }) => m.from)).toEqual([0, 1, 2]);
  });
});

describe("review cycle 5 (core, from mutation testing)", () => {
  test("smart case knows capitals beyond ASCII", () => {
    const re = compilePattern("Ärzte", { regex: false, whole: false, ignoreCase: false }) as RegExp;
    expect(re.flags).not.toContain("i");
    expect(findAll("ärzte Ärzte", re).map((m) => m.from)).toEqual([6]);
  });
  test("smart case skips a regex's escapes: `\\S` is no capital, `\\WFoo` still has one", () => {
    const re = compilePattern("todo\\s*\\S", { regex: true, whole: false, ignoreCase: false }) as RegExp;
    expect(re.flags).toContain("i");
    expect(findAll("TODO: x", re).map((m) => m.from)).toEqual([0]);
    const cased = compilePattern("\\WFoo", { regex: true, whole: false, ignoreCase: false }) as RegExp;
    expect(cased.flags).not.toContain("i");
    expect(findAll(" foo Foo", cased).map((m) => m.from)).toEqual([4]);
    // Plain text has no escapes: its backslash is a character, its capital a capital.
    expect((compilePattern("a\\S", { regex: false, whole: false }) as RegExp).flags).not.toContain("i");
  });
});

describe("replace across files: the lines it changes (25.4)", () => {
  test("a line's matches one edit; a match across a break, its lines one; numbered on from the last; a CRLF's \\r left out", async () => {
    const { lineEdits } = await import("../../../../src/core/workspace/mutations/replace-files.ts");
    const { compilePattern, findAll } = await import("../../../../src/core/documents/editing/replace.ts");
    const edits = (text: string, query: string, replacement: string, regex = false) =>
      lineEdits(
        text,
        findAll(text, compilePattern(query, { regex, whole: false }) as RegExp, 0, text.length, regex),
        replacement,
        regex,
      );
    expect(edits("a x a\nno\nx a\n", "a", "b")).toEqual([
      { line: 1, before: "a x a", after: "b x b" },
      { line: 3, before: "x a", after: "x b" },
    ]);
    // Across a break: both lines, joined; the line after it numbered on.
    expect(edits("one\ntwo end\nthree\nlast end\n", "o end\\nth|t end", "X", true)).toEqual([
      { line: 2, before: "two end\nthree", after: "twXree" },
      { line: 4, before: "last end", after: "lasX" },
    ]);
    expect(edits("w\r\nk w\r\n", "w", "v")).toEqual([
      { line: 1, before: "w", after: "v" },
      { line: 2, before: "k w", after: "k v" },
    ]);
    // A replacement with a break in it, groups, an empty match inserting at each line's start.
    expect(edits("k=1\nj=2\n", "(\\w)=(\\d)", "$1:\n$2", true)).toEqual([
      { line: 1, before: "k=1", after: "k:\n1" },
      { line: 2, before: "j=2", after: "j:\n2" },
    ]);
    expect(edits("a\nb\n", "^", "> ", true)).toEqual([
      { line: 1, before: "a", after: "> a" },
      { line: 2, before: "b", after: "> b" },
    ]);
    // A match at the line's end (`$`, before its break) is the line's, with the others on it.
    expect(edits("a x \nb\n", "x|$", "y", true)).toEqual([
      { line: 1, before: "a x ", after: "a y y" },
      { line: 2, before: "b", after: "by" },
    ]);
    // On an empty line: its own number, the next line's after it.
    expect(edits("a\n\nb\n", "^", "> ", true)).toEqual([
      { line: 1, before: "a", after: "> a" },
      { line: 2, before: "", after: "> " },
      { line: 3, before: "b", after: "> b" },
    ]);
    // A later match on the line crossing a break takes the next line in too.
    expect(edits("a x\nb c\n", "a|x\\nb", "_", true)).toEqual([{ line: 1, before: "a x\nb c", after: "_ _ c" }]);
    // A match replaced by itself changes nothing: no edit.
    expect(edits("same\n", "same", "same")).toEqual([]);
  });
});
