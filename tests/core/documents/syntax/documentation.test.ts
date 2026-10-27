import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readDoc } from "../../../../src/core/documents/model/docformats.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("documentation formats into one shape (24.4)", () => {
  const terms = (lines: string[], style: "jsdoc" | "docstring" | "block" = "docstring") => {
    const d = readDoc(lines, style);
    return {
      body: d.body.map((b) => b.text).join("\n"),
      tags: d.tags.map((t) => `${t.term}|${t.type}|${t.desc}|${t.line}`),
    };
  };
  const SAME = ["from||the note it's written in", "target|str|the link as written", "returns||the link, or None"];
  const same = (got: string[]) => expect(got.map((t) => t.split("|").slice(0, 3).join("|"))).toEqual(SAME);

  test("Google: Args, Returns; an entry's lines go on, indented", () => {
    const t = terms([
      "Resolves a link.",
      "",
      "Args:",
      "    from: the note it's written in",
      "    target (str): the link",
      "        as written",
      "",
      "Returns:",
      "    the link, or None",
    ]);
    expect(t.body).toBe("Resolves a link.");
    same(t.tags);
    expect(t.tags[0]!.endsWith("|3")).toBe(true); // its line, for where it's drawn
  });

  test("NumPy: sections over dashes, an entry's name and type, what it is under it", () => {
    const t = terms([
      "Resolves a link.",
      "",
      "Parameters",
      "----------",
      "from",
      "    the note it's written in",
      "target : str",
      "    the link as written",
      "",
      "Returns",
      "-------",
      "Link",
      "    the link, or None",
    ]);
    expect(t.body).toBe("Resolves a link.");
    expect(t.tags.map((x) => x.split("|").slice(0, 3).join("|"))).toEqual([
      "from||the note it's written in",
      "target|str|the link as written",
      "returns|Link|the link, or None",
    ]);
  });

  test("reST: :param:, :type:, :returns:, :rtype:, :raises:; ``code`` and :role:`x` as markdown", () => {
    const t = terms([
      "Resolves a ``link`` (see :func:`reach`).",
      "",
      ":param from: the note it's written in",
      ":type from: Note",
      ":param str target: the link",
      "    as written",
      ":returns: the link, or None",
      ":rtype: Link",
      ":raises ValueError: when empty",
    ]);
    expect(t.body).toBe("Resolves a `link` (see `reach`).");
    expect(t.tags.map((x) => x.split("|").slice(0, 3).join("|"))).toEqual([
      "from|Note|the note it's written in",
      "target|str|the link as written",
      "returns|Link|the link, or None",
      "raises|ValueError|when empty",
    ]);
  });

  test("JSDoc: @param {T} name - what, @returns; a block comment is prose alone", () => {
    const t = terms(
      [
        "Resolves a link.",
        "@param from - the note it's written in",
        "@param {str} target the link as written",
        "@returns the link, or None",
      ],
      "jsdoc",
    );
    expect(t.body).toBe("Resolves a link.");
    same(t.tags);
    expect(terms(["Some words", "@param x not a tag here"], "block").tags).toEqual([]);
  });
});
