import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { glyphsFor } from "../../../../../src/core/rendering/theme/glyphs.ts";
import { renderMarkdown } from "../../../../../src/core/rendering/layout/markdown/render.ts";
import { stringWidth } from "../../../../../src/core/foundation/text/width.ts";
import { SAMPLES, samples, unicode, renderReady } from "../../../../support/render-layout.ts";
import { makeRenderSandbox } from "../../../../support/render-sandbox.ts";

makeRenderSandbox();

describe("no rendered row ever exceeds the layout width", () => {
  for (const file of samples) {
    test(file, async () => {
      const src = readFileSync(join(SAMPLES, file), "utf8");
      for (const width of [24, 37, 60, 80, 101, 140]) {
        for (const glyphs of [unicode, glyphsFor("ascii")]) {
          const layout = await renderReady(src, { width, glyphs, showUrls: false });
          // The renderer cuts any row to the width as a last defence; a cut is a block's bug and
          // lost text, so none may happen (the width check alone could never fail).
          if (layout.clipped) throw new Error(`${file} @${width}: ${layout.clipped} row(s) had to be clipped`);
          for (const [i, line] of layout.lines.entries()) {
            const w = line.spans.reduce((a, s) => a + stringWidth(s.text), 0);
            if (w > width)
              throw new Error(`${file} @${width}: row ${i} is ${w} wide: ${line.spans.map((s) => s.text).join("")}`);
          }
        }
      }
    });
  }
});

// The reference set's notes too (examples/home): realistic and hostile, every block at its edges.
// Fewer widths than the demo's — the set is large; the narrow ones are where blocks break.
describe("no rendered row ever exceeds the layout width: the reference set", () => {
  const HOME = join(import.meta.dir, "../../../../..", "examples", "home");
  const notes = (readdirSync(HOME, { recursive: true }) as string[]).filter((f) => f.endsWith(".md")).sort();
  test("its notes are there", () => expect(notes.length).toBeGreaterThan(150));
  for (const file of notes) {
    test(file, async () => {
      const src = readFileSync(join(HOME, file), "utf8");
      for (const [width, glyphs] of [
        [24, unicode],
        [37, glyphsFor("ascii")],
        [80, unicode],
        [140, unicode],
      ] as const) {
        const layout = await renderReady(src, { width, glyphs, showUrls: false });
        if (layout.clipped) throw new Error(`${file} @${width}: ${layout.clipped} row(s) had to be clipped`);
        for (const [i, line] of layout.lines.entries()) {
          const w = line.spans.reduce((a, s) => a + stringWidth(s.text), 0);
          if (w > width)
            throw new Error(`${file} @${width}: row ${i} is ${w} wide: ${line.spans.map((s) => s.text).join("")}`);
        }
      }
    });
  }
});

// With codeScroll (the TUI's `[render] code_wrap = "scroll"`) a code block's rows are as wide as its lines: what's
// before its code, and its window on it, still fit the width, and its code is whole.
describe("no rendered row exceeds the layout width but a scrolling code block's code, kept whole", () => {
  const HOME = join(import.meta.dir, "../../../../..", "examples", "home");
  const all = [
    ...samples.map((f) => join("vault", f)),
    ...(readdirSync(HOME, { recursive: true }) as string[])
      .filter((f) => f.endsWith(".md"))
      .map((f) => join("home", f)),
  ].sort();
  /** How many rows scrolled, in a note at a width. */
  const check = (file: string, width: number): number => {
    const src = readFileSync(join(import.meta.dir, "../../../../..", "examples", file), "utf8");
    const layout = renderMarkdown(src, { width, glyphs: unicode, showUrls: false, codeScroll: true });
    if (layout.clipped) throw new Error(`${file} @${width}: ${layout.clipped} row(s) had to be clipped`);
    let scrolled = 0;
    for (const [i, line] of layout.lines.entries()) {
      const row = line.spans.map((s) => s.text).join("");
      const s = line.scroll;
      if (s && !s.part) {
        scrolled++;
        if (s.x + s.w + 1 > width) throw new Error(`${file} @${width}: row ${i}'s code window ends past the width`);
        if (row.includes("↪")) throw new Error(`${file} @${width}: row ${i} wrapped`);
      } else if (stringWidth(row) > width) throw new Error(`${file} @${width}: row ${i} is too wide: ${row}`);
    }
    return scrolled;
  };
  for (const file of all) test(file, () => void [24, 60, 101].forEach((w) => check(file, w)));
  test("some scroll", () => expect(check("vault/handbook/writing-guide.md", 60)).toBeGreaterThan(5));
});
