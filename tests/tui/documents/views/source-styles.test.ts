import { describe, expect, spyOn, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as parse from "../../../../src/core/documents/markdown/parse.ts";
import { stopParsePool } from "../../../../src/core/documents/markdown/parse-pool.ts";
import type { CellStyle } from "../../../../src/core/rendering/layout/style.ts";
import { openDiff } from "../../../../src/tui/workspace/git/views/changes/diffview.ts";
import { type Harness, harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

/** Each character's style of `text` where the frame first shows it. */
function stylesOf(h: Harness, text: string): CellStyle[] {
  const c = h.canvas();
  const rows = c.toString().split("\n");
  const y = rows.findIndex((r) => r.includes(text));
  expect(y).toBeGreaterThanOrEqual(0);
  const x = rows[y]!.indexOf(text);
  return [...text].map((_, i) => c.styles[y]![x + i]!);
}

describe("Markdown's inline styles in SOURCE view (SIS)", () => {
  test("bold is bold and italic italic, the markers kept in their own colour; off, as before", async () => {
    const root = makeVault();
    writeFileSync(join(root, "styled.md"), "# Styled\n\nSome **bold** and *slanted* words.\n");
    const h = await harness({ root, open: "styled.md", config: (c) => (c.render.notes = false) });
    expect(h.app.view!.source).toBe(true);
    const on = stylesOf(h, "Some **bold** and *slanted*");
    const [text, marker, bold] = [on[0]!, on[5]!, on[7]!];
    expect(bold.bold).toBe(true);
    expect(marker.bold).toBe(false);
    expect(marker.fg).not.toEqual(text.fg);
    expect(on[19]!.italic).toBe(true); // slanted
    h.app.config.render.source_styles = false;
    const off = stylesOf(h, "Some **bold** and *slanted*");
    expect(off.every((s) => !s.bold && !s.italic && s.fg === text.fg)).toBe(true);
  });

  test("a big note: plain while its parse runs on other threads, styled once it lands, drawn again then", async () => {
    const root = makeVault();
    // Over 200 KB: past what's parsed on the screen's thread (`BACKGROUND_PARSE`).
    const text = Array.from({ length: 3000 }, (_, i) =>
      i % 40 === 0 ? `## Part ${i}\n` : `Line ${i} with **strong ${i}** words, enough to fill a row or so of it.\n`,
    ).join("\n");
    writeFileSync(join(root, "big.md"), text);
    const h = await harness({ root, open: null, config: (c) => (c.render.notes = false) });
    let asked = 0;
    h.app.host.requestRender = () => void asked++;
    await h.app.open("big.md");
    // Its first layout finds it too big to parse here, and sends it to the other threads.
    expect(h.app.view!.source).toBe(true);
    const buf = h.app.view!.buf;
    expect(stylesOf(h, "strong 1**")[0]!.bold).toBe(false);
    expect(buf.parsing).not.toBeNull();
    asked = 0;
    await buf.parsing;
    await Bun.sleep(0);
    expect(asked).toBeGreaterThan(0);
    expect(stylesOf(h, "strong 1**")[0]!.bold).toBe(true);
    expect(stylesOf(h, "strong 1**")[8]!.bold).toBe(false);
  });

  test("a big note pending, or its parse failed: its code spans and links keep the light highlighting", async () => {
    const root = makeVault();
    const text = Array.from(
      { length: 3000 },
      (_, i) => `Line ${i} has \`code ${i}\` and [a link](x${i}.md) in it.\n`,
    ).join("\n");
    writeFileSync(join(root, "big.md"), text);
    const h = await harness({ root, open: null, config: (c) => (c.render.notes = false) });
    await h.app.open("big.md");
    const buf = h.app.view!.buf;
    const look = (s: CellStyle) => JSON.stringify(s);
    const lit = () => {
      const [line, code, link] = [stylesOf(h, "Line 1 "), stylesOf(h, "`code 1`"), stylesOf(h, "[a link](x1.md)")];
      return [look(code[1]!) !== look(line[0]!), look(link[1]!) !== look(line[0]!)];
    };
    expect(lit()).toEqual([true, true]);
    expect(buf.parsing).not.toBeNull();
    // Its parse on the other threads fails: it stays as it was, the patterns' colours kept.
    stopParsePool();
    await buf.parsing;
    await Bun.sleep(0);
    expect(buf.parsing).toBeNull();
    expect(lit()).toEqual([true, true]);
    // Not styled: a link's brackets in its colour, not dimmed as markers.
    expect(look(stylesOf(h, "[a link](x1.md)")[0]!)).toBe(look(stylesOf(h, "[a link](x1.md)")[1]!));
  });

  test("a big note marking footnotes: its stand-ins parsed on other threads, a definition added too", async () => {
    const root = makeVault();
    const text = Array.from({ length: 3000 }, (_, i) =>
      i % 40 === 0 ? `## Part ${i}\n` : `Line ${i} with **strong ${i}** words[^1] and more[^2], to fill a row.\n`,
    ).join("\n");
    writeFileSync(join(root, "big.md"), `${text}\n[^1]: the note\n`);
    const h = await harness({ root, open: null, config: (c) => (c.render.notes = false) });
    await h.app.open("big.md");
    const buf = h.app.view!.buf;
    const spy = spyOn(parse, "parseChunk");
    try {
      const parsedHere = () => spy.mock.calls.reduce((n, c) => n + (c[0] as string).length, 0);
      /** Whether a footnote's mark is drawn as one, not as the text around it. */
      const marked = (s: string) => {
        const st = stylesOf(h, s);
        return JSON.stringify(st[s.indexOf("[^") + 2]) !== JSON.stringify(st[0]);
      };
      const landed = async () => {
        h.canvas();
        for (let i = 0; i < 5 && buf.parsing; i++) {
          await buf.parsing;
          await Bun.sleep(0);
          h.canvas();
        }
        expect(buf.parsing).toBeNull();
      };
      await landed();
      expect(parsedHere()).toBe(0);
      expect([marked("words[^1]"), marked("more[^2]")]).toEqual([true, false]);
      // The second footnote defined: every paragraph's stand-ins change, past the budget here — sent there.
      buf.edit(buf.source.length, 0, "\n[^2]: the other\n");
      spy.mockClear();
      h.canvas();
      expect(buf.parsing).not.toBeNull();
      await landed();
      expect(parsedHere()).toBeLessThan(1000);
      expect([marked("words[^1]"), marked("more[^2]")]).toEqual([true, true]);
    } finally {
      spy.mockRestore();
    }
  });

  test("a big note's diff: drawn at once without its styles, then styled when its parse lands", async () => {
    const root = makeVault();
    const h = await harness({
      root,
      open: null,
      config: (c) => {
        c.render.notes = false;
        c.git.diff = "source";
      },
    });
    let asked = 0;
    h.app.host.requestRender = () => void asked++;
    const big = Array.from(
      { length: 3000 },
      (_, i) => `Line ${i} with **strong ${i}** words, to fill a row or so.\n`,
    ).join("\n");
    const spy = spyOn(parse, "parseChunk");
    try {
      openDiff(h.app, { before: "", now: big, path: "big.md", title: "big.md" });
      expect(stylesOf(h, "strong 1**")[0]!.bold).toBe(false);
      // The window's layout, kept between draws at a width: made again once the parse lands.
      const drawn = h.app.floating!.view.buf.drawn!;
      const bold = () =>
        drawn(77, { glyphs: h.app.glyphs, wrap: false, codeScroll: true }).lines.some((x) =>
          x.spans.some((s) => s.text.includes("strong 1") && s.attrs),
        );
      expect(bold()).toBe(false);
      expect(spy).not.toHaveBeenCalled();
      for (let i = 0; i < 400 && !asked; i++) await Bun.sleep(25);
      expect(asked).toBeGreaterThan(0);
      expect(bold()).toBe(true);
      expect(stylesOf(h, "strong 1**")[0]!.bold).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
