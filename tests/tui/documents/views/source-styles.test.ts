import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CellStyle } from "../../../../src/core/rendering/layout/style.ts";
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
});
