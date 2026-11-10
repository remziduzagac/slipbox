import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { UNSAFE } from "../../../../src/core/foundation/text/sanitize.ts";
import { join } from "node:path";
import {
  graphemes,
  setWidthMethod,
  stringWidth,
  type WidthMethod,
} from "../../../../src/core/foundation/text/width.ts";
import { glyphsFor } from "../../../../src/core/rendering/theme/glyphs.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("widths as OpenTUI draws them", () => {
  // OpenTUI lays a frame's cells out by the method it found asking the terminal; slipbox lays its rows
  // out by its own count. The two must agree, cluster by cluster, or a row drifts within the frame
  // (Devanagari's conjuncts did: 2 columns here, 3 there). Every grapheme the reference set and halden
  // hold, in each method, drawn into an OpenTUI buffer and measured where the next character lands.
  test("every grapheme of the reference set and halden, in each of OpenTUI's methods slipbox follows", async () => {
    const { RGBA } = await import("@opentui/core");
    const { frameBuffer } = await import("../../../support/tui/frame-buffer.ts");
    const seen = new Set<string>();
    for (const dir of ["home", "vault"]) {
      const base = join(import.meta.dir, "../../../..", "examples", dir);
      for (const f of readdirSync(base, { recursive: true }) as string[]) {
        if (!f.endsWith(".md")) continue;
        for (const g of graphemes(readFileSync(join(base, f), "utf8")))
          if (g.length > 1 || g.charCodeAt(0) > 0x7e) seen.add(g);
      }
    }
    expect(seen.size).toBeGreaterThan(500);
    // And what slipbox draws of its own: every glyph of every set (a callout's icon, a bullet, a border).
    const own = (v: unknown): void => {
      if (v && typeof v === "object") for (const x of Object.values(v)) own(x);
      else if (typeof v === "string")
        for (const g of graphemes(v)) if (g.length > 1 || g.charCodeAt(0) > 0x7e) seen.add(g);
    };
    for (const mode of ["unicode", "nerd", "ascii"]) own(glyphsFor(mode));
    // Clusters where the two counts part (a conjunct's parts, a flag's letters), whatever the corpus
    // holds. Not Bengali's reph (র্গা): OpenTUI's table has it 1, Bun's 2 — slipbox counts Bun's.
    for (const t of ["हिन्दी", "नमस्ते", "क्ष", "ஸ்ரீ", "ཀྱི", "각", "1️⃣", "🇩🇪", "✔️"]) for (const g of graphemes(t)) seen.add(g);
    const fg = RGBA.fromHex("#ffffff");
    const bg = RGBA.fromHex("#000000");
    try {
      for (const method of ["unicode", "wcwidth"] as WidthMethod[]) {
        setWidthMethod(method);
        const buf = frameBuffer(16, 1, method);
        const off: string[] = [];
        for (const g of seen) {
          // Never drawn: sanitized first, or zero wide (the canvas skips those). A cluster of tens of
          // code points (a Zalgo, fifty joined emoji) runs past the probe: no terminal agrees on those.
          if (UNSAFE.test(g) || stringWidth(g) === 0 || [...g].length > 16) continue;
          buf.clear(bg);
          buf.drawText(`${g}|`, 0, 0, fg, bg, 0);
          const drawn = buf.withBuffers((cells) => cells.char.indexOf(124));
          if (drawn !== stringWidth(g))
            off.push(
              `${JSON.stringify(g)} U+${[...g].map((c) => c.codePointAt(0)!.toString(16)).join(" ")}: OpenTUI ${drawn}, slipbox ${stringWidth(g)}`,
            );
        }
        buf.destroy();
        expect(`${method}: ${off.length} off\n${off.slice(0, 20).join("\n")}`).toBe(`${method}: 0 off\n`);
      }
    } finally {
      setWidthMethod("unicode");
    }
  });

  // A terminal draws a glyph as wide as it counts it — the clustering ones as Bun measures it, the terminal checks'
  // too — whatever OpenTUI's table says. One OpenTUI lays out wider than that pulls the rest of its row a cell left, and
  // once only what follows it is drawn again, that lands a cell further on: the unicode set's important callout,
  // `❢`, read `❢  Important` once a frame drew its row again.
  test("every glyph slipbox draws of its own: as wide to OpenTUI, in each of its methods, as to the terminal", async () => {
    const { RGBA } = await import("@opentui/core");
    const { frameBuffer } = await import("../../../support/tui/frame-buffer.ts");
    const own = new Set<string>();
    const add = (v: unknown): void => {
      if (v && typeof v === "object") for (const x of Object.values(v)) add(x);
      else if (typeof v === "string")
        for (const g of graphemes(v)) if (g.length > 1 || g.charCodeAt(0) > 0x7e) own.add(g);
    };
    for (const mode of ["unicode", "nerd", "ascii"])
      for (const lines of ["light", "heavy"] as const) add(glyphsFor(mode, {}, lines));
    expect(own.size).toBeGreaterThan(100);
    const fg = RGBA.fromHex("#ffffff");
    const bg = RGBA.fromHex("#000000");
    const off: string[] = [];
    for (const method of ["unicode", "wcwidth", "unicode-wide"] as const) {
      const buf = frameBuffer(16, 1, method);
      for (const g of own) {
        buf.clear(bg);
        buf.drawText(`${g}|`, 0, 0, fg, bg, 0);
        const drawn = buf.withBuffers((cells) => cells.char.indexOf(124));
        const terminal = Bun.stringWidth(g, { ambiguousIsNarrow: true });
        if (drawn !== terminal) off.push(`${method}: ${JSON.stringify(g)}: OpenTUI ${drawn}, the terminal ${terminal}`);
      }
      buf.destroy();
    }
    expect(off).toEqual([]);
  });
});

describe("widths counted the terminal's way", () => {
  test("the method changing (the terminal's answer after the first frame): every layout made again", async () => {
    const root = makeVault();
    writeFileSync(join(root, "flags.md"), `${"🇯🇵".repeat(30)}\n`);
    const h = await harness({ root, open: "flags.md", width: 60 });
    const rows = () =>
      h.app.currentLayout(h.app.view!).lines.filter((l) => l.spans.some((sp) => sp.text.includes("🇯🇵"))).length;
    try {
      expect(rows()).toBe(2); // 60 columns of flags: two rows
      setWidthMethod("wcwidth");
      h.app.widthsChanged();
      expect(rows()).toBe(1); // a flag as wide as its first letter: one
    } finally {
      setWidthMethod("unicode");
    }
  });
});
