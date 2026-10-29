import { expect, test } from "bun:test";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";
import { NoteBuffer } from "../../../../src/tui/documents/buffers/buffer.ts";
import { glyphsFor } from "../../../../src/core/rendering/theme/glyphs.ts";
import type { Layout } from "../../../../src/core/rendering/layout/ir.ts";

const sandbox = makeCoreSandbox();
const glyphs = glyphsFor("unicode");
const buffer = (text = "# Heading\n\nA paragraph with words.\n") => {
  const buf = new NoteBuffer("note.md", join(sandbox, "note.md"));
  buf.loadText(text);
  return buf;
};

test("source layout reuses its variant and invalidates layouts without replacing the source-row cache", () => {
  const buf = buffer();
  const cache = buf as unknown as { sourceCache: object };
  const sourceCache = cache.sourceCache;
  const first = buf.sourceLayout(40, true, glyphs);
  expect(buf.sourceLayout(40, true, glyphs)).toBe(first);
  buf.beginStep(0);
  buf.edit(0, 0, "new ");
  buf.endStep(4);
  expect(buf.sourceLayout(40, true, glyphs)).not.toBe(first);
  expect(cache.sourceCache).toBe(sourceCache);
});

test("the six-variant cache evicts the oldest insertion while keeping repeated variants", () => {
  const buf = buffer();
  const first = buf.sourceLayout(20, true, glyphs);
  const second = buf.sourceLayout(21, true, glyphs);
  for (let width = 22; width <= 25; width++) buf.sourceLayout(width, true, glyphs);
  expect(buf.sourceLayout(20, true, glyphs)).toBe(first);
  buf.sourceLayout(26, true, glyphs);
  expect(buf.sourceLayout(21, true, glyphs)).toBe(second);
  expect(buf.sourceLayout(20, true, glyphs)).not.toBe(first);
});

test("full invalidation replaces the render cache but preserves the map and source-cache identities", () => {
  const buf = buffer();
  const cache = buf as unknown as { layouts: Map<string, Layout>; sourceCache: object; renderCache: object };
  const layouts = cache.layouts;
  const sourceCache = cache.sourceCache;
  const renderCache = cache.renderCache;
  const first = buf.layout(40, glyphs, false, null);
  expect(buf.layout(40, glyphs, false, null)).toBe(first);
  buf.invalidateLayouts();
  expect(cache.layouts).toBe(layouts);
  expect(cache.layouts.size).toBe(0);
  expect(cache.sourceCache).toBe(sourceCache);
  expect(cache.renderCache).not.toBe(renderCache);
  expect(buf.layout(40, glyphs, false, null)).not.toBe(first);
});

test("late-library arrival drops only pending variants from the shared layout map", () => {
  const buf = buffer();
  const first = buf.sourceLayout(30, true, glyphs);
  const second = buf.sourceLayout(40, true, glyphs);
  first.pending = ["library"];
  second.pending = ["other"];
  buf.arrived("library");
  expect(buf.sourceLayout(30, true, glyphs)).not.toBe(first);
  expect(buf.sourceLayout(40, true, glyphs)).toBe(second);
});

test("layout and parse reads preserve the original shared buffer undo and redo step", () => {
  const buf = buffer("a\n");
  const original = buf.sourceLayout(30, true, glyphs);
  buf.beginStep(1);
  buf.edit(1, 0, "b");
  buf.endStep(2);
  buf.layout(30, glyphs, false, null);
  expect(buf.source).toBe("ab\n");
  expect(buf.undo()).toBe(1);
  expect(buf.source).toBe("a\n");
  expect(buf.dirty).toBe(false);
  expect(buf.sourceLayout(30, true, glyphs)).not.toBe(original);
  expect(buf.redo()).toBe(2);
  expect(buf.source).toBe("ab\n");
});

test("code layouts keep their own variants for open cells, problem marks and widths", () => {
  const buf = buffer("function f() { return 1; }\n");
  buf.kind = { group: "text", format: "typescript" };
  const first = buf.codeLayout(40, true, glyphs);
  expect(buf.codeLayout(40, true, glyphs)).toBe(first);
  buf.codeOpen.add(1);
  const opened = buf.codeLayout(40, true, glyphs);
  expect(opened).not.toBe(first);
  expect(buf.codeLayout(40, true, glyphs, "box", [{ line: 1, severity: "error" }])).not.toBe(opened);
  expect(buf.codeLayout(30, true, glyphs)).not.toBe(opened);
});
