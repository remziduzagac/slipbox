import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("a server's snippets (25.8)", () => {
  const ctx = { indent: "", unit: "  ", vars: { TM_FILENAME_BASE: "main", TM_SELECTED_TEXT: "" } };
  test("tab stops, placeholders (nested too), mirrors, $0 last; the end where there's none", async () => {
    const { expandSnippet } = await import("../../../../src/core/documents/editing/snippet.ts");
    const s = expandSnippet("for (${1:i} = 0; $1 < ${2:n}; $1++) {$0}", ctx);
    // The mirrors given the placeholder's text.
    expect(s.text).toBe("for (i = 0; i < n; i++) {}");
    expect(s.stops).toEqual([
      {
        n: 1,
        ranges: [
          [5, 6],
          [12, 13],
          [19, 20],
        ],
      },
      { n: 2, ranges: [[16, 17]] },
      { n: 0, ranges: [[25, 25]] },
    ]);
    // A mirror inside another stop's placeholder: filled, that placeholder grows around it.
    expect(expandSnippet("${1:f($2)} ${2:bb}", ctx)).toEqual({
      text: "f(bb) bb",
      stops: [
        { n: 1, ranges: [[0, 5]] },
        {
          n: 2,
          ranges: [
            [6, 8],
            [2, 4],
          ],
        },
        { n: 0, ranges: [[8, 8]] },
      ],
    });
    // A mirror before its placeholder: the placeholder still first, typed there.
    expect(expandSnippet("$1-${1:ab}", ctx)).toEqual({
      text: "ab-ab",
      stops: [
        {
          n: 1,
          ranges: [
            [3, 5],
            [0, 2],
          ],
        },
        { n: 0, ranges: [[5, 5]] },
      ],
    });
    const nested = expandSnippet("f(${1:a, ${2:b}})", ctx);
    expect(nested).toEqual({
      text: "f(a, b)",
      stops: [
        { n: 1, ranges: [[2, 6]] },
        { n: 2, ranges: [[5, 6]] },
        { n: 0, ranges: [[7, 7]] },
      ],
    });
    // Out of order in the text, in order of their numbers.
    expect(expandSnippet("${2:b}${1:a}", ctx).stops.map((x) => x.n)).toEqual([1, 2, 0]);
  });

  test("choices (the first put in), variables (a value, a default, else the name), escapes, transforms left out", async () => {
    const { expandSnippet } = await import("../../../../src/core/documents/editing/snippet.ts");
    // typos: off — a choice with an escaped comma, `thr\,ee`.
    expect(expandSnippet("pick(${1|one,two,thr\\,ee|})", ctx)).toEqual({
      text: "pick(one)",
      stops: [
        { n: 1, ranges: [[5, 8]] },
        { n: 0, ranges: [[9, 9]] },
      ],
    });
    // typos: on
    expect(expandSnippet("$TM_FILENAME_BASE ${TM_SELECTED_TEXT:x} ${NOPE:dflt} $NOPE2 ${UNSET}", ctx).text).toBe(
      "main  dflt NOPE2 UNSET",
    );
    expect(expandSnippet("a \\$1 \\} \\\\ $ ${", ctx).text).toBe("a $1 } \\ $ ${");
    expect(expandSnippet("${1/(.*)/${1:/upcase}/g} x", ctx)).toEqual({
      text: " x",
      stops: [
        { n: 1, ranges: [[0, 0]] },
        { n: 0, ranges: [[2, 2]] },
      ],
    });
  });

  test("each new line indented as the first's, a tab as the file indents", async () => {
    const { expandSnippet } = await import("../../../../src/core/documents/editing/snippet.ts");
    const s = expandSnippet("if (${1:x}) {\n\t$0\n}", { ...ctx, indent: "    ", unit: "\t" });
    expect(s.text).toBe("if (x) {\n    \t\n    }");
    expect(s.stops).toEqual([
      { n: 1, ranges: [[4, 5]] },
      { n: 0, ranges: [[14, 14]] },
    ]);
  });
});
