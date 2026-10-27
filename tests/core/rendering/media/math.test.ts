import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { headingsOf, parseMarkdown, slugify } from "../../../../src/core/documents/markdown/parse.ts";
import { mathRows, mathText } from "../../../../src/core/rendering/media/math.ts";
import { extractFromSource } from "../../../../src/core/workspace/graph/graph.ts";
import { footnotesOf } from "../../../../src/core/documents/model/footnotes.ts";
import { listTasks } from "../../../../src/core/documents/editing/tasks.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("maths as Unicode text (12.11)", () => {
  test("symbols, sub- and superscripts — whole where Unicode has each character, else bracketed", () => {
    expect(mathText("\\alpha + \\beta^2 = \\gamma_i")).toBe("α + β² = γᵢ");
    expect(mathText("\\sum_{i=1}^{n} x_i")).toBe("∑ᵢ₌₁ⁿ xᵢ");
    expect(mathText("e^{i\\pi}")).toBe("e^(iπ)");
    expect(mathText("\\int_0^\\infty")).toBe("∫₀^∞");
    expect(mathText("x \\in \\mathbb{R}^n")).toBe("x ∈ ℝⁿ");
    expect(mathText("f^\\prime")).toBe("f′");
    expect(mathText("a \\not\\in B")).toBe("a ∉ B");
  });
  test("fractions, roots, accents over more than a letter, words, spacing, sizing, escapes", () => {
    expect(mathText("\\frac{1}{2} + \\frac{a+b}{c} + \\frac{n(n+1)}{2}")).toBe("½ + (a+b)/c + n(n+1)/2");
    expect(mathText("\\sqrt{x^2+y^2} + \\sqrt[3]{x} + \\sqrt[n]{y}")).toBe("√(x²+y²) + ∛x + ⁿ√y");
    expect(mathText("\\overline{AB} + \\hat{x}")).toBe("A̅B̅ + x̂");
    expect(mathText("x_{\\text{max}} \\text{ if } y")).toBe("x_max  if  y");
    expect(mathText("a\\,b\\!c\\quad d")).toBe("a bc  d");
    expect(mathText("\\left( x \\right.")).toBe("( x");
    expect(mathText("\\{1\\} \\& \\_ \\^ \\%")).toBe("{1} & _ ^ %");
    expect(mathText("E = mc^2 \\tag{1} \\label{eq}")).toBe("E = mc²     (1)");
  });
  test("functions as their names; a command it doesn't know, a row break, a malformed group: null — its source is shown", () => {
    expect(mathText("\\log_{10}(x) + \\sin\\theta + \\max_i a_i")).toBe("log₁₀(x) + sinθ + maxᵢ aᵢ");
    // One the table would take for another by its start (`\\lfoo`: its `\\l`, ł): not drawn, never half.
    for (const f of ["\\lfoo", "\\unknown x", "a \\\\ b", "\\frac{a}", "x^{y", "\\begin{pmatrix} 1 \\end{pmatrix}"])
      expect(mathText(f)).toBeNull();
  });
  test("a display's rows: aligned at `&`, cases braced, matrices bracketed; what's around one on its middle row", () => {
    expect(mathRows("\\begin{aligned} a &= b + c \\\\ d + e &= f \\end{aligned}")).toEqual([
      "    a = b + c",
      "d + e = f",
    ]);
    expect(mathRows("f(x) = \\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}")).toEqual([
      "f(x) = ⎧ x   x ≥ 0",
      "       ⎩ −x  x < 0",
    ]);
    expect(mathRows("\\begin{cases} 1 & a \\\\ 2 & b \\\\ 3 & c \\end{cases}")).toEqual(["⎧ 1  a", "⎨ 2  b", "⎩ 3  c"]);
    expect(mathRows("\\begin{cases} 1 \\\\ 2 \\\\ 3 \\\\ 4 \\end{cases}")).toEqual(["⎧ 1", "⎨ 2", "⎪ 3", "⎩ 4"]);
    expect(mathRows("\\begin{pmatrix} 1 \\\\ 2 \\\\ 3 \\end{pmatrix}")).toEqual(["⎛ 1 ⎞", "⎜ 2 ⎟", "⎝ 3 ⎠"]);
    expect(mathRows("\\begin{alignat}{2} a &= b \\end{alignat}")).toEqual(["a = b"]);
    expect(mathRows("A = \\begin{pmatrix} 1 & 0 \\\\ 0 & 10 \\end{pmatrix} .")).toEqual([
      "A = ⎛ 1  0  ⎞ .",
      "    ⎝ 0  10 ⎠",
    ]);
    expect(mathRows("\\begin{bmatrix} a & b \\end{bmatrix}")).toEqual(["[ a  b ]"]);
    expect(mathRows("E = mc^2")).toEqual(["E = mc²"]);
    expect(mathRows("\\begin{aligned} x \\\\ y \\\\ \\end{aligned}")).toEqual(["x", "y"]); // a last `\\\\` ends a row
  });
  test("a display it can't draw: an environment it doesn't know, one inside another, a cell it can't", () => {
    for (const d of [
      "\\begin{tikzpicture} x \\end{tikzpicture}",
      "\\begin{aligned} \\begin{matrix} 1 \\end{matrix} \\end{aligned}",
      "\\begin{cases} \\nope & 1 \\end{cases}",
      "a \\begin{cases} 1 \\end{cases} \\nope",
    ])
      expect(mathRows(d)).toBeNull();
  });
  test("text read from a note keeps its maths as written: a heading's (and so its slug), a task's, a footnote's, a link's", () => {
    const md =
      "# The $O(n)$ algorithm\n\n- [ ] compute $x^2$\n\nSee [the $n$th](x.md) and[^f].\n\n[^f]: On $\\alpha$.\n";
    const parsed = parseMarkdown(md);
    expect(headingsOf(parsed.tree)[0]).toMatchObject({
      text: "The $O(n)$ algorithm",
      slug: slugify("The $O(n)$ algorithm"),
    });
    expect(listTasks(parsed.tree)[0]!.text).toBe("compute $x^2$");
    expect(footnotesOf(parsed)[0]!.text).toBe("On $\\alpha$.");
    const entry = extractFromSource({ rel: "n.md", abs: "/n.md", size: md.length, mtimeMs: 0 }, md);
    expect(entry.links.find((l) => l.target === "x.md")!.text).toBe("the $n$th");
  });
  test("`$…$` read as Obsidian reads it: money isn't maths, `$$…$$` in text is", () => {
    const kinds = (md: string) =>
      parseMarkdown(md).tree.children.flatMap((n) => ("children" in n ? n.children.map((c) => c.type) : [n.type]));
    expect(kinds("$x$ and $y$")).toEqual(["inlineMath", "text", "inlineMath"]);
    expect(kinds("costs $5 and $10")).not.toContain("inlineMath");
    expect(kinds("$ x$ or $x $")).not.toContain("inlineMath");
    expect(kinds("$5-$6 or $a$1")).not.toContain("inlineMath");
    expect(kinds("then $$x + y$$ here")).toContain("inlineMath");
    expect(kinds("then $$x$$2")).toContain("inlineMath"); // the digit rule is single dollars
    expect(kinds("$$\nx + y\n$$")).toEqual(["math"]);
    // Money's text is as written.
    const p = parseMarkdown("costs $5 and $10").tree.children[0]!;
    expect("children" in p && p.children.map((c) => ("value" in c ? c.value : "")).join("")).toBe("costs $5 and $10");
  });
});
