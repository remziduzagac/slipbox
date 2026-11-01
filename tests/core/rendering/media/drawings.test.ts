import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { glyphsFor } from "../../../../src/core/rendering/theme/glyphs.ts";
import type { Layout } from "../../../../src/core/rendering/layout/ir.ts";
import { type PictureSource, renderMarkdown } from "../../../../src/core/rendering/layout/markdown/render.ts";
import { loadMermaid } from "../../../../src/core/rendering/media/diagrams/diagrams.ts";
import { loadRasterizer } from "../../../../src/core/rendering/media/images/svg.ts";
import { loadTypesetter } from "../../../../src/core/rendering/media/typeset.ts";
import { paintJobs } from "../../../../src/core/rendering/media/paint/paint-jobs.ts";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import { unicode, renderReady } from "../../../support/render-layout.ts";
import { makeRenderSandbox } from "../../../support/render-sandbox.ts";

makeRenderSandbox();

describe("Mermaid (12.10)", async () => {
  beforeAll(async () => {
    await loadMermaid();
  });
  const rows = (l: Layout) => l.lines.map((x) => x.spans.map((s) => s.text).join(""));
  const md = "# D\n\n```mermaid\ngraph TD\n  A[Write] --> B[Disk-cache]\n```\n\nafter\n";
  test("forty diagrams settle across repeated screen layouts and remain cached", async () => {
    const source = Array.from(
      { length: 40 },
      (_, n) => `\`\`\`mermaid\ngraph TD\n A[Screen ${n}] --> B\n\`\`\`\n`,
    ).join("\n");
    let layout = renderMarkdown(source, { width: 60, glyphs: unicode, showUrls: false });
    for (let pass = 0; pass < 10 && layout.pending?.includes("mermaid"); pass++) {
      await loadMermaid();
      layout = renderMarkdown(source, { width: 60, glyphs: unicode, showUrls: false });
    }
    expect(layout.pending ?? []).not.toContain("mermaid");
    expect(rows(layout).join("\n")).not.toContain("graph TD");
    const again = renderMarkdown(source, { width: 60, glyphs: unicode, showUrls: false });
    expect(again.pending ?? []).not.toContain("mermaid");
    expect(rows(again)).toEqual(rows(layout));
  });
  test("a diagram drawn in box drawing, every row at its block's line: its lines in the border colour, its words text", async () => {
    const l = await renderReady(md, { width: 60, glyphs: unicode, showUrls: false });
    const drawn = l.lines.filter(
      (x) => x.spans.some((s) => s.text.includes("┌")) || x.spans.some((s) => s.text.includes("Write")),
    );
    expect(rows(l).some((r) => /│\s+Write\s+│/.test(r))).toBe(true);
    expect(rows(l).join("\n")).not.toContain("A[Write]");
    expect(drawn.length).toBeGreaterThan(1);
    // All at the fence's line; no code block's background.
    const block = l.lines.filter((x) => x.src === 3);
    expect(block.length).toBeGreaterThan(5);
    expect(block.every((x) => !x.fill)).toBe(true);
    const spans = block.flatMap((x) => x.spans);
    expect(spans.find((s) => s.text.includes("Write"))!.role).toBe("text");
    expect(spans.find((s) => s.text.includes("Disk-cache"))!.role).toBe("text"); // a hyphen in a word stays a word
    expect(spans.filter((s) => /[┌─│▼]/.test(s.text)).every((s) => s.role === "table_border")).toBe(true);
    expect(rows(l).at(-1)).toBe("after");
  });
  test("with ASCII glyphs: drawn in ASCII, its `+ - |` the lines", async () => {
    const ascii = glyphsFor("ascii", {});
    const l = await renderReady(md, { width: 60, glyphs: ascii, showUrls: false });
    expect(rows(l).join("\n")).toMatch(/\|\s+Write\s+\|/);
    expect(rows(l).join("\n")).not.toMatch(/[┌│]/);
    expect(l.lines.flatMap((x) => x.spans).find((s) => s.text.startsWith("+"))!.role).toBe("table_border");
  });
  test("drawn while its library loads: its code, the layout saying it waited, the block not kept — drawn once it's in", async () => {
    // A process of its own: here the library is in already.
    const script = `
      import { parseMarkdown } from "./src/core/documents/markdown/parse.ts";
      import { newRenderCache, renderTree } from "./src/core/rendering/layout/markdown/render.ts";
      import { glyphsFor } from "./src/core/rendering/theme/glyphs.ts";
      import { loadMermaid } from "./src/core/rendering/media/diagrams/diagrams.ts";
      const parsed = parseMarkdown("# D\\n\\n\`\`\`mermaid\\ngraph TD\\n  A[Write] --> B[Disk]\\n\`\`\`\\n");
      const cache = newRenderCache();
      const opts = { width: 60, glyphs: glyphsFor("unicode"), showUrls: false };
      const text = (l) => l.lines.map((x) => x.spans.map((s) => s.text).join("")).join("\\n");
      const first = renderTree(parsed.tree, opts, null, cache);
      // In a note embedded in this one: this one waited too.
      const inner = parseMarkdown("\`\`\`mermaid\\ngraph TD\\n  A --> B\\n\`\`\`\\n").tree.children;
      const embed = () => ({ path: "/inner.md", title: "inner", nodes: inner });
      const host = renderTree(parseMarkdown("![[inner]]\\n").tree, { ...opts, embed }, null);
      await loadMermaid();
      const second = renderTree(parsed.tree, opts, null, cache);
      console.log(JSON.stringify({ pending: [first.pending, second.pending ?? null, host.pending], code: text(first).includes("A[Write]"), drawn: /│\\s+Write\\s+│/.test(text(second)) }));
    `;
    const r = Bun.spawnSync(["bun", "-e", script], { env: process.env, cwd: join(import.meta.dir, "../../../..") });
    expect(r.stderr.toString()).toBe("");
    expect(JSON.parse(r.stdout.toString())).toEqual({
      pending: [["mermaid"], null, ["mermaid"]],
      code: true,
      drawn: true,
    });
  });
  test("its rows as the text has them: no blank row after, no spaces at their ends", async () => {
    const l = await renderReady("```mermaid\nclassDiagram\n  class Graph\n```\n\nafter\n", {
      width: 60,
      glyphs: unicode,
      showUrls: false,
    });
    const drawn = rows(l).slice(0, rows(l).indexOf("after") - 1);
    expect(drawn.at(-1)).toMatch(/└─+┘/);
    expect(drawn.every((r) => r === r.trimEnd())).toBe(true);
  });
  test("one too wide at the library's spacing is drawn closer together, before it's given up on", async () => {
    // 51 columns at its own spacing, 45 a little closer, 42 closest.
    const md = "```mermaid\ngraph LR\n  A[Read] --> B[Parse] --> C[Lay out] --> D[Draw]\n```\n";
    for (const width of [46, 43]) {
      const r = rows(await renderReady(md, { width, glyphs: unicode, showUrls: false }));
      expect(r.some((x) => /│\s+Draw\s+│/.test(x))).toBe(true);
      expect(Math.max(...r.map(stringWidth))).toBeLessThanOrEqual(width);
    }
  });
  test("a kind it doesn't draw, or a diagram wider than the text: its code, the label saying why", async () => {
    const pie = await renderReady('```mermaid\npie title X\n  "a": 1\n```\n', {
      width: 60,
      glyphs: unicode,
      showUrls: false,
    });
    expect(rows(pie)[0]).toMatch(/mermaid — not drawn: pie $/);
    expect(rows(pie)[1]).toContain("pie title X");
    const chain = Array.from({ length: 8 }, (_, i) => `N${i}[Node number ${i}]`).join(" --> ");
    const wide = await renderReady(`\`\`\`mermaid\ngraph LR\n  ${chain}\n\`\`\`\n`, {
      width: 60,
      glyphs: unicode,
      showUrls: false,
    });
    expect(rows(wide)[0]).toMatch(/mermaid — too wide to draw $/);
    for (const r of rows(wide)) expect(stringWidth(r)).toBeLessThanOrEqual(60);
  });
  test("where it scrolls sideways (codeScroll), one wider than the text is drawn all the same, closest together, a column in from each edge and a row under it for its scrollbar", async () => {
    const chain = Array.from({ length: 8 }, (_, i) => `N${i}[Node number ${i}]`).join(" --> ");
    const wide = await renderReady(`\`\`\`mermaid\ngraph LR\n  ${chain}\n\`\`\`\n`, {
      width: 60,
      glyphs: unicode,
      showUrls: false,
      codeScroll: true,
    });
    expect(wide.clipped).toBe(0);
    expect(rows(wide).join("\n")).not.toContain("too wide to draw");
    expect(rows(wide).some((r) => r.includes("Node number 7"))).toBe(true);
    const scrolls = wide.lines.map((l) => l.scroll);
    expect(scrolls.every(Boolean)).toBe(true);
    expect(scrolls.at(-1)!.part).toBe("bar");
    expect(wide.lines.at(-1)!.spans).toEqual([]);
    const total = Math.max(...wide.lines.map((l) => stringWidth(l.spans.map((s) => s.text).join("")) - 1));
    expect(scrolls[0]).toEqual({ x: 1, w: 58, total });
    expect(total).toBeGreaterThan(60);
    // Every row at the block's line, as a drawn diagram's are.
    expect(new Set(wide.lines.map((l) => l.src))).toEqual(new Set([1]));
  });
});

describe("maths (12.11)", () => {
  const text = (l: Layout) => l.lines.map((x) => x.spans.map((s) => s.text).join(""));
  const render = (md: string, width = 60) => renderMarkdown(md, { width, glyphs: unicode, showUrls: false });
  test("in text: Unicode, in the maths colour; one that can't be, as written; money as text", () => {
    const l = render("Euler: $e^{i\\pi} + 1 = 0$; odd $\\nope x$; costs $5 and $10.\n");
    expect(text(l)[0]).toBe("Euler: e^(iπ) + 1 = 0; odd $\\nope x$; costs $5 and $10.");
    const spans = l.lines[0]!.spans;
    expect(spans.find((s) => s.text.includes("iπ"))!.role).toBe("math");
    expect(spans.find((s) => s.text.includes("\\nope"))!.role).toBe("math");
    expect(spans.find((s) => s.text.includes("$5"))!.role).toBe("text");
  });
  test("a display: its rows centred together, every row at its block's line, in the maths colour", () => {
    const l = render("# M\n\n$$\nf(x) = \\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}\n$$\n\nafter\n", 40);
    const rows = l.lines.filter((x) => x.src === 3 && x.spans.length);
    // 18 columns wide in 40: 11 before.
    expect(rows.map((x) => x.spans.map((s) => s.text).join(""))).toEqual([
      "           f(x) = ⎧ x   x ≥ 0",
      "                  ⎩ −x  x < 0",
    ]);
    expect(rows.every((x) => x.spans.at(-1)!.role === "math" && !x.fill)).toBe(true);
    expect(text(l).at(-1)).toBe("after");
  });
  test("a display it can't draw, or wider than the text: its source as LaTeX, the label saying why", () => {
    const tikz = text(render("$$\n\\begin{tikzpicture} x \\end{tikzpicture}\n$$\n"));
    expect(tikz[0]).toMatch(/math — as written $/);
    expect(tikz[1]).toContain("\\begin{tikzpicture}");
    // Highlighted as LaTeX.
    const src = render("$$\n\\begin{tikzpicture} x \\end{tikzpicture}\n$$\n").lines[1]!;
    expect(src.spans.some((s) => s.role.startsWith("syn_"))).toBe(true);
    const wide = text(render(`$$\n${Array.from({ length: 30 }, (_, i) => `x_${i}`).join(" + ")}\n$$\n`));
    expect(wide[0]).toMatch(/math — too wide to draw $/);
  });
});

describe("drawn as pictures, by choice (12.16, 12.17)", () => {
  beforeAll(async () => {
    await Promise.all([loadMermaid(), loadRasterizer(), loadTypesetter()]);
    draw(mermaid, { mermaid: true, math: false });
    await loadMermaid();
    draw(mermaid, { mermaid: false, math: true });
    await loadMermaid();
  });
  const colors = {
    bg: "#101010",
    fg: "#e0e0e0",
    line: "#707070",
    accent: "#3080f0",
    muted: "#909090",
    math: "#ff00ff",
  };
  const text = (l: Layout) => l.lines.map((x) => x.spans.map((s) => s.text).join(""));
  const draw = (md: string, drawings: { mermaid: boolean; math: boolean }, drawn = true) => {
    const asked: { from: PictureSource; width: number }[] = [];
    const picture = (from: PictureSource, width: number) => (
      asked.push({ from, width }), drawn && "svg" in from ? { src: "/drawn.png", cols: 10, rows: 3 } : null
    );
    return {
      l: renderMarkdown(md, {
        width: 40,
        glyphs: unicode,
        showUrls: false,
        picture,
        drawings: { ...drawings, colors },
      }),
      asked,
    };
  };
  const mermaid = "```mermaid\ngraph TD\n  A --> B\n```\n\nafter\n";
  test("a Mermaid diagram as a picture: asked for at a column less, centred — its first row the indent, the cursor's stop", () => {
    const { l, asked } = draw(mermaid, { mermaid: true, math: false });
    expect(asked).toEqual([{ from: { svg: expect.stringContaining("<svg"), kind: "diagram" }, width: 39 }]);
    expect((asked[0]!.from as { svg: string }).svg).toContain("#e0e0e0"); // the theme's colours
    const rows = l.lines.slice(0, 3);
    expect(rows[0]).toMatchObject({
      src: 1,
      image: { src: "/drawn.png", cols: 10, rows: 3 },
      spans: [{ text: " ".repeat(15), role: "text" }],
    });
    expect(rows.slice(1).every((x) => x.decor && !x.spans.length && x.src === 1)).toBe(true);
    expect(text(l).at(-1)).toBe("after");
  });
  test("one as wide as it can be still leaves a column before it: the cursor's stop", () => {
    const picture = () => ({ src: "/wide.png", cols: 39, rows: 2 });
    const l = renderMarkdown(mermaid, {
      width: 40,
      glyphs: unicode,
      showUrls: false,
      picture,
      drawings: { mermaid: true, math: false, colors },
    });
    expect(l.lines[0]).toMatchObject({ spans: [{ text: " " }], image: { cols: 39 } });
  });
  test("not chosen, or no picture of it (pictures not drawn, too big): drawn in the terminal's characters", () => {
    for (const { l } of [
      draw(mermaid, { mermaid: false, math: true }),
      draw(mermaid, { mermaid: true, math: false }, false),
    ]) {
      expect(l.lines.some((x) => x.image)).toBe(false);
      expect(text(l).some((r) => /│\s+A\s+│/.test(r))).toBe(true);
    }
  });
  test("a display's maths as a picture: typeset in the maths colour, centred; inline maths stays text; not chosen, text", async () => {
    const md = "Inline $x^2$.\n\n$$\n\\frac{a}{b}\n$$\n";
    // Typeset on the painting worker: text until it's in, then the picture.
    expect(draw(md, { mermaid: false, math: true }).asked).toEqual([]);
    await paintJobs.settle();
    const { l, asked } = draw(md, { mermaid: false, math: true });
    expect(asked).toEqual([{ from: { svg: expect.stringContaining('fill="#ff00ff"'), kind: "math" }, width: 39 }]);
    expect(text(l)[0]).toBe("Inline x².");
    expect(l.lines.find((x) => x.image)).toMatchObject({ src: 3, spans: [{ text: " ".repeat(15) }] });
    expect(draw(md, { mermaid: true, math: false }).l.lines.some((x) => x.image)).toBe(false);
    // One MathJax can't read: the text of it, as without pictures.
    draw("$$\n\\nope\n$$\n", { mermaid: false, math: true });
    await paintJobs.settle();
    const bad = draw("$$\n\\nope\n$$\n", { mermaid: false, math: true });
    expect(bad.asked).toEqual([]);
    expect(text(bad.l)[0]).toMatch(/math — as written $/);
  });
  test("drawn while what draws it loads: in text, the layout saying what it waited for", () => {
    // A process of its own: here they're in already. A diagram, a display, an SVG picture, each on its own.
    const script = `
      import { renderMarkdown } from "./src/core/rendering/layout/markdown/render.ts";
      import { glyphsFor } from "./src/core/rendering/theme/glyphs.ts";
      const colors = { bg: "#000000", fg: "#ffffff", line: "#777777", accent: "#0000ff", muted: "#999999", math: "#ffffff" };
      const picture = (from) => ("svg" in from ? { src: "/p.png", cols: 4, rows: 2 } : null);
      const opts = { width: 40, glyphs: glyphsFor("unicode"), showUrls: false, picture, drawings: { mermaid: true, math: true, colors } };
      const seen = JSON.parse(process.env.MD).map((md) => {
        const l = renderMarkdown(md, opts);
        return { pending: [...(l.pending ?? [])].sort(), images: l.lines.filter((x) => x.image).length };
      });
      console.log(JSON.stringify(seen));
    `;
    const MD = JSON.stringify(["```mermaid\ngraph TD\n  A --> B\n```\n", "$$\nx\n$$\n", "![d](d.svg)\n"]);
    const r = Bun.spawnSync(["bun", "-e", script], {
      cwd: join(import.meta.dir, "../../../.."),
      env: { ...process.env, MD },
    });
    expect(r.stderr.toString()).toBe("");
    // The display waits for its painting job; an SVG file's picture is its callback's to wait for (the TUI's asks the
    // rasteriser's job: tests/tui/documents/media/), and this one asks nothing.
    expect(JSON.parse(r.stdout.toString())).toEqual([
      { pending: ["mermaid"], images: 0 },
      { pending: ["pictures"], images: 0 },
      { pending: [], images: 0 },
    ]);
  });
});
