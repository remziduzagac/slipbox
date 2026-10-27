import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  flattenVars,
  loadRasterizer,
  looksLikeSvg,
  machineFont,
  rasterizer,
} from "../../../../../src/core/rendering/media/images/svg.ts";
import { loadMermaid, mermaidSvg } from "../../../../../src/core/rendering/media/diagrams/diagrams.ts";
import { loadTypesetter } from "../../../../../src/core/rendering/media/typeset.ts";
import { colorHex } from "../../../../../src/core/rendering/theme/theme.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("SVG drawn (12.15), and what slipbox draws as pictures (12.16, 12.17)", () => {
  test("a diagram drawn after OpenTUI's renderer made its `window`: drawn, and every timer still runs", () => {
    // In a process of its own: the layout library sets itself up once, on its first diagram.
    const script = `
      globalThis.window = {}; // as OpenTUI's renderer leaves it
      const d = await import(${JSON.stringify(join(import.meta.dir, "../../../../../src/core/rendering/media/diagrams/diagrams.ts"))});
      await d.loadMermaid();
      const colors = { bg: "#ffffff", fg: "#000000", line: "#888888", accent: "#0000ff", muted: "#999999" };
      d.mermaidSvg("graph TD\\n  A-->B", colors, "DejaVu Sans");
      await d.loadMermaid();
      const svg = d.mermaidSvg("graph TD\\n  A-->B", colors, "DejaVu Sans");
      const fired = await Promise.race([new Promise((r) => setTimeout(() => r(true), 5)), Bun.sleep(2000).then(() => false)]);
      console.log(JSON.stringify({ svg: typeof svg === "string" && svg.startsWith("<svg"), fired, window: "window" in globalThis }));
    `;
    const r = Bun.spawnSync([process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe", timeout: 30_000 });
    expect(JSON.parse(r.stdout.toString().trim().split("\n").pop()!)).toEqual({ svg: true, fired: true, window: true });
  });
  const pngWidth = (png: Uint8Array) => new DataView(png.buffer, png.byteOffset).getUint32(16);
  test("CSS custom properties put in place: the root's and the style's, fallbacks, color-mix — an @import gone", () => {
    const svg = `<svg style="--bg:#000000;--fg:#ffffff;background:var(--bg)"><style>@import url('https://x.invalid/f.css');
      svg { /* derived */ --_mid: color-mix(in srgb, var(--fg) 25%, var(--bg)); --_line: var(--line, var(--_mid)); }</style>
      <rect fill="var(--_line)" stroke="var(--accent, #123456)"/><text fill="var(--nope)">t</text></svg>`;
    const flat = flattenVars(svg);
    expect(flat).not.toMatch(/var\(|color-mix|@import/);
    expect(flat).toContain('<rect fill="#404040" stroke="#123456"/>');
    expect(flat).toContain('<text fill="none">'); // nothing to give it: not drawn, never black
    expect(flattenVars('<svg><rect fill="color-mix(in srgb, #ff0000, #0000ff)"/></svg>')).toContain('fill="#800080"');
  });
  test("a colour as #rrggbb for a picture: ansi:N as xterm has it, default the fallback", () => {
    expect(colorHex("#abcdef", "#000000")).toBe("#abcdef");
    expect([
      colorHex("ansi:1", "x"),
      colorHex("ansi:21", "x"),
      colorHex("ansi:16", "x"),
      colorHex("ansi:244", "x"),
    ]).toEqual(["#cd0000", "#0000ff", "#000000", "#808080"]);
    expect([colorHex("default", "#111111"), colorHex("ansi:300", "#222222")]).toEqual(["#111111", "#222222"]);
  });
  test("an SVG told by how its text starts: a declaration, comments, a doctype before it", () => {
    for (const head of [
      '<svg xmlns="x">',
      '<?xml version="1.0"?>\n<!-- made -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<svg>',
      "  <SVG>",
    ])
      expect(looksLikeSvg(head)).toBe(true);
    for (const head of ["<html><svg>", "\x89PNG\r\n", "<svgx>"]) expect(looksLikeSvg(head)).toBe(false);
  });
  test("an SVG told in one pass over its head, whatever a file's comments: `<!--` and `--><!--` over and over returns", () => {
    // The heads a picture is told by (512 bytes; an export's Markdown, 2048): tried every way to split into comments,
    // they take time doubling with each `--><!--` (Bun's engine gives up after about a second and says no; V8 never).
    for (const bytes of [512, 2048]) {
      const comments = `<!--${"--><!--".repeat(Math.floor((bytes - 4) / 7))}`;
      expect(comments.length).toBeLessThanOrEqual(bytes);
      expect(looksLikeSvg(comments)).toBe(false); // the last comment never closed
      expect(looksLikeSvg(`${comments}<svg>`)).toBe(false); // inside it
      expect(looksLikeSvg(`${comments}--> <svg>`)).toBe(true);
    }
    // A comment ends at its first `-->` past its `<!--` (`<!-->` is no end): what follows it is what's looked at.
    expect(looksLikeSvg("<!-- a --> b --> <svg>")).toBe(false);
    expect(looksLikeSvg("<!--><svg>")).toBe(false);
    expect(looksLikeSvg("﻿<?xml version='1.0'?><!----><!-- x -->\n<!doctype SVG><svg\n>")).toBe(true);
  });
  test("rasterised: its own size, drawn as a PNG the width asked; what isn't an SVG, null", async () => {
    const r = (await loadRasterizer())!;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#ff0000"/></svg>';
    expect(r.size(svg)).toEqual({ width: 40, height: 20 });
    expect(pngWidth(r.png(svg, 80)!)).toBe(80);
    expect(r.size("not an svg")).toBeNull();
    expect(r.png("<svg", 10)).toBeNull();
  });
  test("on the screen, a diagram's words get a font only where the machine has one: else it's drawn in characters", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-font-"));
    try {
      const there = join(dir, "Sans.ttf");
      writeFileSync(there, "");
      const gone: [string, string] = [join(dir, "Gone.ttf"), "Gone"];
      expect(machineFont([gone, [there, "Sans"]])).toEqual({ path: there, family: "Sans" });
      expect(machineFont([gone])).toBeNull();
      // No font: no family, so a Mermaid block isn't asked for as a picture, which would have no words.
      expect(rasterizer(null)!.family).toBeNull();
      const colors = { bg: "#101010", fg: "#e0e0e0", line: "#707070", accent: "#3080f0", muted: "#909090" };
      expect(mermaidSvg("graph TD\n  A --> B", colors, rasterizer(null)!.family)).toBeNull();
      expect(rasterizer({ path: there, family: "Sans" })!.family).toBe("sans-serif");
      expect(rasterizer()!.family).toBe(machineFont() ? "sans-serif" : null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("a Mermaid diagram as an SVG in the theme's colours, nothing left for resvg to resolve; maths typeset in its colour", async () => {
    await loadMermaid();
    const colors = { bg: "#101010", fg: "#e0e0e0", line: "#707070", accent: "#3080f0", muted: "#909090" };
    mermaidSvg("graph TD\n  A --> B", colors, "DejaVu Sans");
    await loadMermaid();
    const svg = mermaidSvg("graph TD\n  A --> B", colors, "DejaVu Sans")!;
    expect(svg).not.toMatch(/var\(|color-mix/);
    expect(svg).toContain("#e0e0e0");
    expect(svg).toContain("DejaVu Sans");
    expect(svg).not.toMatch(/<svg[^>]*background/); // the terminal's own background shows through
    expect(mermaidSvg("pie title X", colors, "DejaVu Sans")).toBeNull();
    expect(mermaidSvg("graph TD\n  A --> B", colors, null)).toBeNull(); // no font for its words: not a picture
    const t = (await loadTypesetter())!;
    const m = t("\\frac{a}{b}", "#ff0000")!;
    expect(m).toMatch(/<svg[^>]*width="[\d.]+ex"/);
    expect(m).toContain('fill="#ff0000"');
    expect(m).not.toContain("currentColor");
    expect(t("\\nope x", "#ff0000")).toBeNull(); // not red ink: text, or as written
  });
});
