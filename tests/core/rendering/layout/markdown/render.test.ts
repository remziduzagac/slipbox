import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { parseMarkdown } from "../../../../../src/core/documents/markdown/parse.ts";
import { renderMarkdown } from "../../../../../src/core/rendering/layout/markdown/render.ts";
import { glyphsFor } from "../../../../../src/core/rendering/theme/glyphs.ts";

import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("review round 2 (core)", () => {
  const g = glyphsFor("unicode");
  const text = (l: { lines: { spans: { text: string }[] }[] }) =>
    l.lines.map((x) => x.spans.map((s) => s.text).join("")).join("\n");
  test("footnote labels and frontmatter keys can't smuggle escapes into the layout", () => {
    const fn = renderMarkdown("x[^a\u001bcb]\n\n[^a\u001bcb]: foot\n", { width: 60, glyphs: g, showUrls: false });
    const fm = renderMarkdown('---\na: {"\u001b[31mRED": 1}\n---\n# T\n', { width: 60, glyphs: g, showUrls: false });
    expect(text(fn)).not.toContain("\u001b");
    expect(text(fm)).not.toContain("\u001b");
  });
  test("a header-only table survives a narrow width", () => {
    const l = renderMarkdown("| a | b | c | d |\n|---|---|---|---|\n", { width: 12, glyphs: g, showUrls: false });
    expect(text(l)).toContain("d");
  });
});

describe("review cycle 1 (core)", () => {
  test("CJK wrapping: no row starts with closing punctuation; no space from a soft break between CJK", () => {
    const text = (md: string, width: number) =>
      renderMarkdown(md, { width, glyphs: glyphsFor("unicode"), showUrls: false }).lines.map((l) =>
        l.spans.map((x) => x.text).join(""),
      );
    for (let w = 8; w <= 30; w++) {
      for (const row of text("今夜は晴れ、シーイングは良好でした。（観測）は続く。", w))
        expect(row.trimStart()).not.toMatch(/^[、。）]/);
    }
    expect(text("今夜は\n晴れ", 40)[0]).toBe("今夜は晴れ");
    expect(text("tonight\nclear", 40)[0]).toBe("tonight clear");
  });
  test("frontmatter: a parse error wraps whole; a long key is cut with an ellipsis; no row is clipped", () => {
    const render = (md: string, width: number) =>
      renderMarkdown(md, { width, glyphs: glyphsFor("unicode"), showUrls: false });
    const broken = render("---\ntitle: [unclosed\ntags: [a, b\n---\n\nbody\n", 30);
    const all = broken.lines
      .map((l) =>
        l.spans
          .map((x) => x.text)
          .join("")
          .trim(),
      )
      .join(" ");
    expect(all.replace(/\s+/g, " ")).toMatch(/sufficiently indented/);
    expect(broken.clipped).toBe(0);
    const keyed = render("---\nobserving_programme_coordinator_contact: Ada\n---\n", 40);
    expect(
      keyed.lines.some((l) =>
        l.spans
          .map((x) => x.text)
          .join("")
          .includes("…"),
      ),
    ).toBe(true);
  });
});

describe("review cycle 2 (core)", () => {
  test("hostile notes stay fast and never throw: deep nesting, long runs, huge frontmatter", () => {
    const g = glyphsFor("unicode");
    const cases = [
      "> - ".repeat(5000) + "x\n",
      "*".repeat(8000) + "x" + "*".repeat(8000),
      "[".repeat(20000) + "x",
      `---\n${Array.from({ length: 20000 }, (_, i) => `k${i}: v`).join("\n")}\n---\nbody\n`,
    ];
    for (const md of cases) {
      const t = performance.now();
      const l = renderMarkdown(md, { width: 80, glyphs: g, showUrls: false });
      expect(l.lines.length).toBeGreaterThan(0);
      expect(performance.now() - t).toBeLessThan(2000);
    }
    // Taming moves no offset: a heading after a long run keeps its source line.
    const tamed = parseMarkdown(`${"*".repeat(100)}\n\n# After\n`);
    expect(tamed.tree.children.find((n) => n.type === "heading")?.position?.start.line).toBe(3);
  });
});

describe("review cycle 4 (core)", () => {
  test("taming never changes an ordinary note: rules, setext, long numbers, code, frontmatter", () => {
    const g = glyphsFor("unicode");
    const text = (md: string) =>
      renderMarkdown(md, { width: 200, glyphs: g, showUrls: false })
        .lines.map((l) => l.spans.map((x) => x.text).join(""))
        .join("\n");
    expect(parseMarkdown(`Section\n${"-".repeat(90)}\n`).tree.children[0]!.type).toBe("heading");
    const pi = "3".repeat(100);
    expect(text(`${pi}\n`)).toContain(pi);
    expect(text(`\`\`\`\n#${"*".repeat(80)}\n\`\`\`\n`)).toContain(`#${"*".repeat(80)}`);
    expect(parseMarkdown(`---\nsep: "${"*".repeat(80)}"\n---\n`).frontmatter?.data?.sep).toBe("*".repeat(80));
    expect(text(`${"_".repeat(80)}\n`)).not.toContain("‗");
  });
});

describe("review cycle 5 (core, from mutation testing)", () => {
  test("no row ends with opening punctuation (kinsoku)", () => {
    const text = (md: string, width: number) =>
      renderMarkdown(md, { width, glyphs: glyphsFor("unicode"), showUrls: false }).lines.map((l) =>
        l.spans.map((x) => x.text).join(""),
      );
    for (let w = 4; w <= 12; w++)
      for (const row of text("あいう「漢字」です（注）と【記録】", w)) expect(row.trimEnd()).not.toMatch(/[（「『【]$/);
  });
});
