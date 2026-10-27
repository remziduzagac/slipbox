import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("comments toggled (25.2)", () => {
  test("a language's markers: a line's in front, a block's around; none for JSON, CSV, a diff", async () => {
    const { commentStyle } = await import("../../../../src/core/documents/editing/comments.ts");
    expect(["typescript", "python", "lua", "vim", "toml", "makefile"].map((l) => commentStyle(l))).toEqual([
      { line: "//" },
      { line: "#" },
      { line: "--" },
      { line: '"' },
      { line: "#" },
      { line: "#" },
    ]);
    expect([commentStyle("css"), commentStyle("markdown"), commentStyle("xml")]).toEqual([
      { open: "/*", close: "*/" },
      { open: "<!--", close: "-->" },
      { open: "<!--", close: "-->" },
    ]);
    expect(["json", "csv", "diff", "text"].map((l) => commentStyle(l))).toEqual([null, null, null, null]);
  });

  test("commented at the least indentation, blank lines left; all commented, uncommented — the space after the marker too", async () => {
    const { toggleComments } = await import("../../../../src/core/documents/editing/comments.ts");
    const s = { line: "//" };
    expect(toggleComments(["if (x) {", "  y();", "", "}"], s)).toEqual(["// if (x) {", "//   y();", "", "// }"]);
    expect(toggleComments(["  a();", "    b();"], s)).toEqual(["  // a();", "  //   b();"]);
    expect(toggleComments(["  // a();", "  //   b();", ""], s)).toEqual(["  a();", "    b();", ""]);
    expect(toggleComments(["//a", "// b"], s)).toEqual(["a", "b"]);
    // Some commented, some not: each commented, as vim-commentary does.
    expect(toggleComments(["// a", "b"], s)).toEqual(["// // a", "// b"]);
    expect(toggleComments(["\tx := 1"], s)).toEqual(["\t// x := 1"]);
    expect(toggleComments(["", "  "], s)).toBeNull();
  });

  test("a block's pair around each line, and taken off again", async () => {
    const { toggleComments } = await import("../../../../src/core/documents/editing/comments.ts");
    const s = { open: "<!--", close: "-->" };
    expect(toggleComments(["# Title", "", "  text"], s)).toEqual(["<!-- # Title -->", "", "<!--   text -->"]);
    expect(toggleComments(["<!-- # Title -->", "", "<!--   text -->"], s)).toEqual(["# Title", "", "  text"]);
    expect(toggleComments(["<!--x-->"], s)).toEqual(["x"]);
  });
});
