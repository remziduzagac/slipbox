import { describe, expect, test } from "bun:test";
import { parseMarkdown } from "../../../../src/core/documents/markdown/parse.ts";
import {
  addPair,
  changePair,
  deletePair,
  type Mark,
  markOf,
  pairAt,
  type Surrounded,
  textStart,
  wrapTyped,
} from "../../../../src/core/documents/editing/surround.ts";

/** The edits made, the last first. */
const applied = (source: string, s: Surrounded) =>
  [...s.edits].reverse().reduce((t, e) => t.slice(0, e.from) + e.text + t.slice(e.to), source);

/** `text` without its `|`, and where the `|` was: the cursor. */
const cursor = (text: string) => ({ source: text.replace("|", ""), at: text.indexOf("|") });

/** `mark` put around the first `word` in `source`: the text after, the text inside, and the link's target. */
function added(source: string, word: string, mark: Mark) {
  const from = source.indexOf(word);
  const s = addPair(source, { from, to: from + word.length }, mark);
  if (!s) return null;
  const text = applied(source, s);
  return {
    text,
    inside: text.slice(s.inside.from, s.inside.to),
    start: s.start,
    target: s.target === null ? null : text.slice(0, s.target),
  };
}

/** The pair of `mark` around the `|`, in a Markdown note (`note`) or another file; null without one. */
function found(text: string, mark: Mark, note = true) {
  const { source, at } = cursor(text);
  return { source, pair: pairAt(source, at, mark, note ? parseMarkdown(source).tree : null) };
}

/** The pair of `mark` around the `|` taken out; null without one. */
function deleted(text: string, mark: Mark, note = true): string | null {
  const { source, pair } = found(text, mark, note);
  return pair ? applied(source, deletePair(pair)) : null;
}

/** The pair of `from` around the `|` changed to `to`'s; null without one. */
function changed(text: string, from: Mark, to: Mark, note = true): string | null {
  const { source, pair } = found(text, from, note);
  return pair ? applied(source, changePair(source, pair, to)) : null;
}

describe("surround's marks (EG-D8)", () => {
  test("each mark added around a word; the text inside and the opening mark's start after", () => {
    const want: [Mark, string][] = [
      ["*", "a *word* here"],
      ["b", "a **word** here"],
      ["`", "a `word` here"],
      ["~", "a ~~word~~ here"],
      ["l", "a [word]() here"],
      ["(", "a (word) here"],
      ["[", "a [word] here"],
      ["{", "a {word} here"],
      ["<", "a <word> here"],
      ['"', 'a "word" here'],
      ["'", "a 'word' here"],
    ];
    for (const [mark, text] of want) {
      const r = added("a word here", "word", mark)!;
      expect([mark, r.text, r.inside, r.start]).toEqual([mark, text, "word", 2]);
    }
    // A link's target: the empty `()`, the cursor typing between them.
    expect(added("a word here", "word", "l")!.target).toBe("a [word](");
    expect(added("a word here", "word", "*")!.target).toBeNull();
  });

  test("a closing bracket names its pair; any other key no mark", () => {
    expect([")", "]", "}", ">"].map(markOf)).toEqual(["(", "[", "{", "<"]);
    expect(["b", "l", "*", "`", "~", '"', "'"].map(markOf)).toEqual(["b", "l", "*", "`", "~", '"', "'"]);
    expect(["x", "B", "_", "-", " "].map(markOf)).toEqual([null, null, null, null, null]);
  });

  test("code takes as many backticks as the text needs, a space inside when it starts or ends with one", () => {
    expect(added("run a`b now", "a`b", "`")!.text).toBe("run ``a`b`` now");
    expect(added("run a``b now", "a``b", "`")!.text).toBe("run ```a``b``` now");
    expect(added("say `x` now", "`x`", "`")!.text).toBe("say `` `x` `` now");
    expect(added("say `x` now", "`x`", "`")!.inside).toBe("`x`");
  });

  test("white space at a range's ends stays outside: a word with its space, a line with its indent", () => {
    // `a w` takes the space after the word; `y s s` a line's indent and its line break.
    expect(added("one two three", "two ", "b")!.text).toBe("one **two** three");
    expect(added("- item\n  more text\nend\n", "  more text\n", "*")!.text).toBe("- item\n  *more text*\nend\n");
    expect(added("a   b", "  ", "*")).toBeNull();
  });

  test("a range of several lines wrapped from its first character to its last", () => {
    expect(added("> one\n> two\n", "one\n> two", "b")!.text).toBe("> **one\n> two**\n");
  });

  test("each mark deleted in a note: emphasis, code and links by the tree, either way they're written", () => {
    const cases: [string, Mark, string][] = [
      ["a *i|t* b", "*", "a it b"],
      ["a _i|t_ b", "*", "a it b"],
      ["a **b|old** c", "b", "a bold c"],
      ["a __b|old__ c", "b", "a bold c"],
      ["a ~~str|uck~~ c", "~", "a struck c"],
      ["a ~str|uck~ c", "~", "a struck c"],
      ["a `co|de` c", "`", "a code c"],
      ["a `` a`|b `` c", "`", "a a`b c"],
      ["see [the te|xt](notes/a.md) now", "l", "see the text now"],
      ['see [the te|xt](a.md "Title") now', "l", "see the text now"],
      ["see [te|xt][ref] now\n\n[ref]: a.md\n", "l", "see text now\n\n[ref]: a.md\n"],
      ["see [[pl|an|the plan]] now", "l", "see the plan now"],
      ["see [[pl|an]] now", "l", "see plan now"],
      ["see <https://exa|mple.org> now", "l", "see https://example.org now"],
      ["f(a|b) c", "(", "fab c"],
      ["f[a|b] c", "[", "fab c"],
      ["f{a|b} c", "{", "fab c"],
      ["f<a|b> c", "<", "fab c"],
      ['say "he|llo" now', '"', "say hello now"],
      ["say 'he|llo' now", "'", "say hello now"],
    ];
    for (const [text, mark, want] of cases) expect([text, mark, deleted(text, mark)]).toEqual([text, mark, want]);
  });

  test("the cursor on a mark itself is in its pair", () => {
    expect(deleted("a |*it* b", "*")).toBe("a it b");
    expect(deleted("a *it|* b", "*")).toBe("a it b");
    expect(deleted("f|(ab) c", "(")).toBe("fab c");
    expect(deleted("f(ab|) c", "(")).toBe("fab c");
    expect(deleted('say |"hi" now', '"')).toBe("say hi now");
  });

  test("nested pairs: the nearest around the cursor, of the mark asked for", () => {
    // Italic in bold: each by its own mark.
    expect(deleted("**bold *i|t* bold**", "*")).toBe("**bold it bold**");
    expect(deleted("**bold *i|t* bold**", "b")).toBe("bold *it* bold");
    expect(deleted("**bo|ld *it* bold**", "*")).toBeNull();
    // `***x***`: both at once, each taken alone.
    expect(deleted("***x|***", "*")).toBe("**x**");
    expect(deleted("***x|***", "b")).toBe("*x*");
    // Brackets of a kind nested in each other: the innermost around the cursor; past a pair closed before it.
    expect(deleted("f((a|), b)", "(")).toBe("f(a, b)");
    expect(deleted("f((a), b|)", "(")).toBe("f(a), b");
    expect(deleted("f((a), |b)", "(")).toBe("f(a), b");
    // Across lines, as % matches them.
    expect(deleted("if {\n  x = {a: 1}\n  y| = 2\n}\n", "{")).toBe("if \n  x = {a: 1}\n  y = 2\n\n");
    // A link holding code, code in a link: each.
    expect(deleted("[run `ma|ke`](a.md)", "`")).toBe("[run make](a.md)");
    expect(deleted("[run `ma|ke`](a.md)", "l")).toBe("run `make`");
    // Quotes in quotes of the other kind; the next pair on the line when the cursor is before it.
    expect(deleted(`say "a 'n|ice' one" now`, "'")).toBe('say "a nice one" now');
    expect(deleted(`say "a 'n|ice' one" now`, '"')).toBe("say a 'nice' one now");
    expect(deleted('"a" |and "b"', '"')).toBe('"a" and b');
  });

  test("none around the cursor: null", () => {
    expect(deleted("plain |text", "*")).toBeNull();
    expect(deleted("plain |text (later)", "(")).toBeNull();
    expect(deleted("a (b) |c", "(")).toBeNull();
    expect(deleted('a "b" |c', '"')).toBeNull();
    // A bare address has no marks to take.
    expect(deleted("see https://exa|mple.org now", "l")).toBeNull();
    // An image isn't a link here, nor an embed: each shows its picture or note.
    expect(deleted("an ![ca|t](cat.png) here", "l")).toBeNull();
    expect(deleted("See ![[pho|to.png]] and ![alt](x.png)", "l")).toBeNull();
    expect(deleted("See ![[photo.png]] and ![a|lt](x.png)", "l")).toBeNull();
    expect(deleted("See ![[Pl|an]] now", "l")).toBeNull();
    expect(deleted("[[a]] ![[b]] [[|c]]", "l")).toBe("[[a]] ![[b]] c");
  });

  test("outside a Markdown note: a backtick found on the line as a quote is; emphasis and links not at all", () => {
    expect(deleted("const s = `he|llo`;", "`", false)).toBe("const s = hello;");
    expect(deleted("f(a|b)", "(", false)).toBe("fab");
    expect(deleted("x = a *|b* c", "*", false)).toBeNull();
    expect(deleted("x = [a|](b)", "l", false)).toBeNull();
  });

  test("a note's line's text starts past its block's marks; a code block's line at its start", () => {
    const note = "# Trip\n- milk\n- [ ] eggs\n  1. tea\n> quoted\n> on\n> - a\n\n```\n- x\n```\nplain\n";
    const lines = note.split("\n");
    const tree = parseMarkdown(note).tree;
    const rest = (line: number) => note.slice(textStart(note, tree, line)).split("\n")[0];
    expect(lines.slice(0, 12).map((_, k) => rest(k))).toEqual([
      "Trip",
      "milk",
      "eggs",
      "tea",
      "quoted",
      "on",
      "a",
      "",
      "```",
      "- x",
      "```",
      "plain",
    ]);
  });

  test("each mark changed to another, nested ones too", () => {
    const cases: [string, string, string, string][] = [
      ["a *i|t* b", "*", "`", "a `it` b"],
      ["a *i|t* b", "*", "b", "a **it** b"],
      ["a **b|old** c", "b", "~", "a ~~bold~~ c"],
      ["a ~~|some~~ c", "~", "*", "a *some* c"],
      ["a `co|de` c", "`", "*", "a *code* c"],
      ["a `` a`|b `` c", "`", "'", "a 'a`b' c"],
      ["see [te|xt](a.md) now", "l", "b", "see **text** now"],
      ["f(a|b)", "(", "[", "f[ab]"],
      ["f(a|b)", ")", "}", "f{ab}"],
      ["f[a|b]", "[", "<", "f<ab>"],
      ['say "h|i"', '"', "'", "say 'hi'"],
      ["say 'h|i'", "'", "`", "say `hi`"],
      ["**bold *i|t* bold**", "*", "`", "**bold `it` bold**"],
      ["**bold *i|t* bold**", "b", "*", "*bold *it* bold*"],
      ["f((a|), b)", "(", "[", "f([a], b)"],
    ];
    for (const [text, from, to, want] of cases)
      expect([text, from, to, changed(text, markOf(from)!, markOf(to)!)]).toEqual([text, from, to, want]);
  });

  test("changed to code: the backticks the text needs; to a link: its target empty", () => {
    expect(changed("a *a`|b* c", "*", "`")).toBe("a ``a`b`` c");
    const { source, pair } = found("a *i|t* b", "*");
    const s = changePair(source, pair!, "l");
    expect(applied(source, s)).toBe("a [it]() b");
    expect(applied(source, s).slice(0, s.target!)).toBe("a [it](");
  });

  test("typed over a selection: wrapped in the character and its closing half; typed again, wrapped again", () => {
    const once = wrapTyped({ from: 2, to: 6 }, "*");
    const text = applied("a word b", once);
    expect([text, text.slice(once.inside.from, once.inside.to)]).toEqual(["a *word* b", "word"]);
    expect(applied(text, wrapTyped(once.inside, "*"))).toBe("a **word** b");
    expect(applied("a word b", wrapTyped({ from: 2, to: 6 }, "("))).toBe("a (word) b");
    expect(applied("a word b", wrapTyped({ from: 2, to: 6 }, "["))).toBe("a [word] b");
    expect(applied("a word b", wrapTyped({ from: 2, to: 6 }, "{"))).toBe("a {word} b");
    expect(applied("a word b", wrapTyped({ from: 2, to: 6 }, '"'))).toBe('a "word" b');
    expect(applied("a word b", wrapTyped({ from: 2, to: 6 }, "`"))).toBe("a `word` b");
    expect(applied("a word b", wrapTyped({ from: 2, to: 6 }, "~"))).toBe("a ~word~ b");
  });
});
