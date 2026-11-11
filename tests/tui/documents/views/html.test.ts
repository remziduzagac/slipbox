import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { View } from "../../../../src/tui/app/runtime/app.ts";
import { harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

makeSandbox();
const source =
  '# HTML\n\n[Inside](#inside)\n\n<details>\n<summary>More</summary>\n<h2 id="inside">Inside heading</h2>\n<p>Body text</p>\n</details>\n\nAfter.\n';
const content = (h: Awaited<ReturnType<typeof harness>>) =>
  h.app
    .currentLayout(h.app.view!)
    .lines.map((l) => l.spans.map((s) => s.text).join(""))
    .join("\n");

const nested = [
  "# Nested HTML",
  "",
  "[Inside](#nested-target)",
  "",
  "<details>",
  "<summary>Outer section</summary>",
  "<p>Outer body</p>",
  "<details>",
  "<summary>Inner section</summary>",
  '<h2 id="nested-target">Nested target</h2>',
  "<p>Nested body</p>",
  "</details>",
  "</details>",
  "",
  "After.",
  "",
].join("\n");

describe("HTML in the TUI", () => {
  test("large HTML notes reveal their saved target after background parsing", async () => {
    const root = makeVault();
    const large = "<!--" + "x".repeat(140_000) + "-->\n" + source;
    writeFileSync(join(root, "large-html.md"), large);
    const h = await harness({ root, open: null });
    try {
      h.app.open("large-html.md", { heading: null, headingIndex: 0, offset: 0, line: 8 });
      const buf = h.app.view!.buf;
      expect(buf.parsing).not.toBeNull();
      expect(buf.parseCurrent).toBe(false);
      await buf.parsing;
      expect(content(h)).toContain("Body text");
      expect(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src).toBe(8);
    } finally {
      h.app.quit();
    }
  });

  test("restoring a workspace initializes the theme before revealing saved HTML positions", async () => {
    const root = makeVault();
    writeFileSync(join(root, "html.md"), source);
    const first = await harness({ root, open: "html.md" });
    try {
      const v = first.app.view!;
      first.app.placeAtLine(v, 7);
      await first.app.run("theme.set tokyo-night-day");
      v.topAnchor = { heading: null, headingIndex: 0, offset: 0, line: 7 };
    } finally {
      first.app.quit();
    }
    const restored = await harness({
      root,
      open: null,
      config: (c) => {
        c.ui.restore_session = true;
      },
    });
    try {
      expect(restored.app.view!.buf.source).toBe(source);
      expect(restored.app.theme.kind).toBe("light");
      expect(content(restored)).toContain("Body text");
    } finally {
      restored.app.quit();
    }
  });

  test("named disclosure command and Enter toggle, fragment navigation reveals hidden target", async () => {
    const root = makeVault();
    writeFileSync(join(root, "html.md"), source);
    const h = await harness({ root, open: "html.md" });
    try {
      const v = h.app.view!;
      expect(content(h)).not.toContain("Body text");
      let rows = h.app.currentLayout(v).lines;
      h.app.moveCursor(v, { row: rows.findIndex((l) => l.details), col: 0 });
      await h.app.run("html.details_toggle");
      expect(content(h)).toContain("Body text");
      await h.app.run("link.follow");
      expect(content(h)).not.toContain("Body text");
      rows = h.app.currentLayout(v).lines;
      const link = h.app.currentLayout(v).links.find((l) => l.target === "#inside")!;
      h.app.moveCursor(v, { row: link.line, col: link.col });
      await h.app.run("link.follow");
      expect(content(h)).toContain("Body text");
      expect(h.app.currentLayout(v).lines[v.cur.row]!.src).toBe(7);
    } finally {
      h.app.quit();
    }
  });

  test("split windows share a document's disclosures while another document at the same lines stays independent", async () => {
    const root = makeVault();
    writeFileSync(join(root, "html.md"), source);
    writeFileSync(join(root, "other.md"), source.replace("Body text", "Other body"));
    const h = await harness({ root, open: "html.md", width: 160, config: (c) => (c.ui.sidebar = false) });
    const text = (view: View) =>
      h.app
        .currentLayout(view)
        .lines.map((line) => line.spans.map((s) => s.text).join(""))
        .join("\n");
    try {
      await h.app.run("window.split_side");
      h.app.tab!.ratio = 0.4;
      h.frame();
      const [first, second] = h.app.tab!.views as [View, View];
      expect(first.buf).toBe(second.buf);
      expect(first.width).not.toBe(second.width);
      expect(text(first)).not.toContain("Body text");
      expect(text(second)).not.toContain("Body text");
      const view = h.app.view!;
      const row = h.app.currentLayout(view).lines.findIndex((line) => line.details);
      h.app.moveCursor(view, { row, col: 0 });
      await h.app.run("html.details_toggle");
      expect(text(first)).toContain("Body text");
      expect(text(second)).toContain("Body text");
      expect(h.frame().split("Body text")).toHaveLength(3);
      await h.app.open("other.md");
      const other = h.app.view!;
      const original = h.app.tab!.views.find((v) => v !== other)!;
      expect(other.buf).not.toBe(original.buf);
      expect(other.buf.version).toBe(original.buf.version);
      expect(text(other)).not.toContain("Other body");
      expect(text(original)).toContain("Body text");
      expect(h.frame()).toContain("Body text");
      expect(h.frame()).not.toContain("Other body");
      await h.app.run("window.other");
      expect(h.app.view).toBe(original);
      expect(content(h)).toContain("Body text");
    } finally {
      h.app.quit();
    }
  });

  test("a fragment inside nested disclosures opens every ancestor and retains independent summary state", async () => {
    const root = makeVault();
    writeFileSync(join(root, "nested.md"), nested);
    const h = await harness({ root, open: "nested.md" });
    try {
      const v = h.app.view!;
      expect(content(h)).not.toContain("Outer body");
      const link = h.app.currentLayout(v).links.find((l) => l.target === "#nested-target")!;
      h.app.moveCursor(v, { row: link.line, col: link.col });
      await h.app.run("link.follow");
      let layout = h.app.currentLayout(v);
      expect(layout.lines.filter((line) => line.details).map((line) => line.details!.open)).toEqual([true, true]);
      expect(content(h)).toContain("Nested body");
      expect(layout.lines[v.cur.row]!.src).toBe(10);
      h.app.moveCursor(v, { row: layout.lines.findIndex((line) => line.details?.from === 8), col: 0 });
      await h.app.run("html.details_toggle");
      layout = h.app.currentLayout(v);
      expect(layout.lines.filter((line) => line.details).map((line) => line.details!.open)).toEqual([true, false]);
      expect(content(h)).toContain("Outer body");
      expect(content(h)).not.toContain("Nested body");
      h.app.moveCursor(v, { row: layout.lines.findIndex((line) => line.details?.from === 5), col: 0 });
      await h.app.run("html.details_toggle");
      await h.app.run("html.details_toggle");
      expect(content(h)).toContain("Outer body");
      expect(content(h)).not.toContain("Nested body");
    } finally {
      h.app.quit();
    }
  });

  test("source edits and undo reset disclosure overrides instead of reusing a former summary's line", async () => {
    const root = makeVault();
    writeFileSync(join(root, "html.md"), source);
    const h = await harness({ root, open: "html.md" });
    try {
      const v = h.app.view!;
      const summary = () => h.app.currentLayout(v).lines.findIndex((line) => line.details);
      h.app.moveCursor(v, { row: summary(), col: 0 });
      await h.app.run("html.details_toggle");
      expect(content(h)).toContain("Body text");
      await h.app.run("view.mode_source");
      const changed = source.replace("More", "Changed section").replace("Body text", "Replacement body");
      v.buf.edit(0, v.buf.source.length, changed);
      h.app.placeAtLine(v, 1);
      await h.app.run("view.mode_read");
      expect(content(h)).toContain("Changed section");
      expect(content(h)).not.toContain("Replacement body");
      h.app.moveCursor(v, { row: summary(), col: 0 });
      await h.app.run("html.details_toggle");
      expect(content(h)).toContain("Replacement body");
      await h.app.run("view.mode_source");
      expect(v.buf.undo()).not.toBeNull();
      expect(v.buf.source).toBe(source);
      h.app.placeAtLine(v, 1);
      await h.app.run("view.mode_read");
      expect(content(h)).toContain("More");
      expect(content(h)).not.toContain("Body text");
      expect(content(h)).not.toContain("Replacement body");
    } finally {
      h.app.quit();
    }
  });

  test("HTML images use existing remote ask/show/never policy, dimensions and local resolution", async () => {
    for (const policy of ["ask", "show", "never"] as const) {
      const root = makeVault();
      writeFileSync(
        join(root, "html.md"),
        '<p align="center"><img src="https://example.com/badge.png" width="80" alt="CI badge"></p>',
      );
      let requests = 0;
      const h = await harness({
        root,
        open: "html.md",
        config: (c) => {
          c.render.images = "auto";
          c.render.images_remote = policy;
        },
        images: {
          supported: () => true,
          size: () => ({ width: 160, height: 80 }),
          cell: () => ({ width: 8, height: 16 }),
        },
        fetch: async () => {
          requests++;
          return new Response(new Uint8Array([1, 2, 3]), { status: 404 });
        },
      });
      try {
        content(h);
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(requests).toBe(policy === "show" ? 1 : 0);
        expect(content(h)).toContain("CI badge");
      } finally {
        h.app.quit();
      }
    }
  });
  test("local HTML pictures keep their dimensions, alignment and linked graphic action", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "html.md"),
      '<p align="center"><img src="a.png" width=80 alt="First"></p>\n\n<p align="center"><a href="#destination"><img src="a.png" width=64 alt="Badge"></a></p>\n\n<h2 id="destination">Destination</h2>',
    );
    writeFileSync(join(root, "a.png"), "stand-in");
    const h = await harness({
      root,
      open: "html.md",
      images: {
        supported: () => true,
        size: () => ({ width: 160, height: 80 }),
        cell: () => ({ width: 8, height: 16 }),
      },
    });
    try {
      h.frame();
      const layout = h.app.currentLayout(h.app.view!);
      const pictures = layout.lines.filter((l) => l.image);
      expect(pictures.map((l) => l.image!.cols)).toEqual([10, 8]);
      expect(h.canvas().images).toHaveLength(2);
      const graphic = h.app.geometry!.pictures[1]!;
      h.app.mouse.handle({ type: "down", x: graphic.x + 1, y: graphic.y + 1, button: 0 });
      h.app.mouse.handle({ type: "up", x: graphic.x + 1, y: graphic.y + 1, button: 0 });
      h.frame();
      expect(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src).toBe(5);

      expect(layout.clipped).toBe(0);
      const row = layout.lines.findIndex((l) => !!l.image && l.spans.some((s) => s.link !== undefined));
      h.app.moveCursor(h.app.view!, { row, col: 0 });
      await h.app.run("link.follow");
      expect(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src).toBe(5);
    } finally {
      h.app.quit();
    }
  });
  test("Lens and Source retain the original HTML range and edits touch only the selected source line", async () => {
    const root = makeVault();
    writeFileSync(join(root, "html.md"), source);
    const h = await harness({ root, open: "html.md" });
    try {
      const v = h.app.view!;
      h.app.placeAtLine(v, 7);
      await h.app.run("view.mode_lens");
      expect(v.buf.source).toBe(source);
      expect(
        h.app
          .currentLayout(v)
          .lines.map((l) => l.spans.map((s) => s.text).join(""))
          .join("\n"),
      ).toContain('<h2 id="inside">');
      await h.app.run("view.mode_source");
      h.app.placeAtLine(v, 8, 4);
      await h.keys("i", "X", "escape");
      const expected = source.split("\n");
      expected[7] = "<p>XBody text</p>";
      expect(v.buf.source).toBe(expected.join("\n"));
    } finally {
      h.app.quit();
    }
  });
  test("outline and heading picker list collapsed HTML headings and reveal the chosen source target", async () => {
    const root = makeVault();
    writeFileSync(join(root, "html.md"), source);
    const h = await harness({ root, open: "html.md" });
    try {
      const row = h.app.outlineView.rows().find((r) => r.text === "Inside heading")!;
      expect(row.hidden).toBe(true);
      h.app.outline.selected = h.app.outlineView.rows().findIndex((r) => r.text === "Inside heading");
      h.app.outlineView.action("jump");
      expect(content(h)).toContain("Body text");
      expect(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src).toBe(7);
      h.app.html.options(h.app.view!.buf).htmlDetails.set(5, false);
      expect(content(h)).not.toContain("Body text");
      await h.app.run("outline.pick");
      expect(h.app.overlay?.kind).toBe("list");
      await h.keys("I", "n", "s", "i", "d", "e", "enter");
      expect(content(h)).toContain("Body text");
    } finally {
      h.app.quit();
    }
  });
  test("HTML graphics keep alignment and link actions with captions above the image", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "html.md"),
      '<p align="center"><a href="#target"><img src="a.png" width=80 alt="Top caption"></a></p>\n\n<h2 id="target">Target</h2>',
    );
    writeFileSync(join(root, "a.png"), "stand-in");
    const h = await harness({
      root,
      open: "html.md",
      config: (c) => {
        c.render.caption = "top";
      },
      images: {
        supported: () => true,
        size: () => ({ width: 160, height: 80 }),
        cell: () => ({ width: 8, height: 16 }),
      },
    });
    try {
      const v = h.app.view!;
      const layout = h.app.currentLayout(v);
      const first = layout.lines.findIndex((l) => !!l.image);
      expect(first).toBeGreaterThan(layout.lines.findIndex((l) => !!l.caption));
      expect(layout.lines[first]!.pic!.row).toBe(0);
      expect(layout.lines.find((l) => !!l.caption)!.pic!.row).toBeLessThan(0);
      expect(layout.clipped).toBe(0);
      h.frame();
      expect(h.canvas().images).toHaveLength(1);
      h.app.moveCursor(v, { row: first, col: 0 });
      await h.app.run("link.follow");
      expect(h.app.currentLayout(v).lines[v.cur.row]!.src).toBe(3);
    } finally {
      h.app.quit();
    }
  });
});
