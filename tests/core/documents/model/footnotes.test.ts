import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { parseMarkdown } from "../../../../src/core/documents/markdown/parse.ts";
import {
  addFootnote,
  applyEdits,
  deleteFootnote,
  editFootnote,
  footnotesOf,
  renameFootnote,
  type TextEdit,
} from "../../../../src/core/documents/model/footnotes.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("footnotes (3.17)", () => {
  test("numbered as GFM numbers them: by first reference, then the ones nothing refers to; the definition's label", () => {
    // A definition before the text: the order is still the references'.
    const list = footnotesOf(
      parseMarkdown(
        "[^a]: Alpha *one*\n    and [Two](two.md) #tag.\n\nB[^b] then A[^A] and B[^b] again.\n\n[^spare]: Unused.\n[^b]: Beta.\n",
      ),
    );
    expect(list.map((f) => [f.label, f.line, f.references.length])).toEqual([
      ["b", 7, 2],
      ["a", 1, 1],
      ["spare", 6, 0],
    ]);
    expect(list[1]!.text).toBe("Alpha one and Two #tag.");
    expect(list[0]!.references).toMatchObject([
      { line: 4, column: 2 },
      { line: 4, column: 23 },
    ]);
  });

  test("a definition's text as one line: a wikilink by its alias, else its name; an embed by its name; a tag with its #", () => {
    const list = footnotesOf(
      parseMarkdown("A[^1]\n\n[^1]: See [[plan|the plan]], [[other]] and ![[pic.png]] #todo.\n"),
    );
    expect(list.map((f) => f.text)).toEqual(["See the plan, other and pic.png #todo."]);
  });

  test("add, edit, delete, rename: each the edits it makes to the note's text (3.18)", () => {
    const run = (src: string, change: (s: string, list: ReturnType<typeof footnotesOf>) => TextEdit[]) =>
      applyEdits(src, change(src, footnotesOf(parseMarkdown(src))));
    // Added: [^N] where asked, its definition after the note's last one (the note ends with them)…
    const src = "Claim one[^1] and two.\n\n[^1]: First.\n";
    const at = src.indexOf(" and two") + " and two".length;
    const added = addFootnote(src, footnotesOf(parseMarkdown(src)), at, "  Second\n claim ");
    expect(added.label).toBe("2");
    expect(applyEdits(src, added.edits)).toBe("Claim one[^1] and two[^2].\n\n[^1]: First.\n[^2]: Second claim\n");
    // …else after a blank line; a note without a final newline gets one.
    expect(run("Text here.\n", (s, l) => addFootnote(s, l, 9, "Body").edits)).toBe("Text here[^1].\n\n[^1]: Body\n");
    expect(run("Text", (s, l) => addFootnote(s, l, 4, "B").edits)).toBe("Text[^1]\n\n[^1]: B\n");
    expect(() => addFootnote("x", [], 1, "  ")).toThrow("needs some text");
    // Edited: its definition, continuation lines too, one line now.
    const two = "A[^n] b.\n\n[^n]: Old,\n    continued.\n[^z]: Zed.\n";
    expect(run(two, (s, l) => editFootnote(s, l[0]!, "New text"))).toBe("A[^n] b.\n\n[^n]: New text\n[^z]: Zed.\n");
    // Deleted: its references and its definition's lines.
    expect(run("A[^n] b[^n].\n\n[^n]: Old,\n    more.\n[^z]: Zed.\n", (s, l) => deleteFootnote(s, l[0]!))).toBe(
      "A b.\n\n[^z]: Zed.\n",
    );
    // A CRLF note's: its line's CRLF goes too, never leaving a blank line where it was.
    expect(run("A[^n] b.\r\n\r\n[^n]: Old.\r\n[^z]: Zed.\r\n", (s, l) => deleteFootnote(s, l[0]!))).toBe(
      "A b.\r\n\r\n[^z]: Zed.\r\n",
    );
    // Renamed: everywhere; a taken label, or one with a space, refused.
    expect(run("A[^n] b[^n].\n\n[^n]: Old.\n[^z]: Zed.\n", (s, l) => renameFootnote(s, l[0]!, l, "source"))).toBe(
      "A[^source] b[^source].\n\n[^source]: Old.\n[^z]: Zed.\n",
    );
    const l = footnotesOf(parseMarkdown(two));
    expect(() => renameFootnote(two, l[0]!, l, "Z")).toThrow("taken");
    expect(() => renameFootnote(two, l[0]!, l, "a b")).toThrow("can't be");
  });
});
