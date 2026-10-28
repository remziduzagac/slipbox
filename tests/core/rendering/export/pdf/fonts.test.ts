import { expect, test } from "bun:test";
import { PdfFonts } from "../../../../../src/core/rendering/export/formats/pdf/fonts/adapter.ts";
import { findFonts } from "../../../../../src/core/rendering/export/assets/fonts.ts";

test("PDF font adaptation registers the six faces in order and keeps live metrics and builtin fallback", () => {
  const registered: string[] = [];
  const selected: (string | number)[] = [];
  const doc = {
    _font: { ascender: 700, descender: -200 },
    registerFont(key: string) {
      registered.push(key);
    },
    font(key: string) {
      selected.push(key);
      return this;
    },
    fontSize(size: number) {
      selected.push(size);
      return this;
    },
  } as unknown as PDFKit.PDFDocument;
  const adapter = new PdfFonts(doc, findFonts(new Map()));
  expect(registered).toEqual(["regular", "bold", "italic", "boldItalic", "mono", "monoBold"]);
  expect(adapter.faceKey({ bold: true, italic: true })).toBe("boldItalic");
  expect(adapter.faceKey({ mono: true, bold: true, italic: true })).toBe("monoBold");
  expect(adapter.segments("café界\n", "regular")).toEqual([{ text: "café?\n", key: "regular" }]);
  expect(adapter.covered("abc")).toBe(false);
  expect(adapter.metrics("bold", 10)).toEqual({ ascent: 7, descent: 2 });
  expect(selected.slice(-2)).toEqual(["bold", 10]);
});

test("PDF builtin font refusal keeps its typed error when the document cannot select a font", () => {
  const doc = {
    registerFont() {},
    font() {
      throw new Error("missing backend font");
    },
  } as unknown as PDFKit.PDFDocument;
  expect(() => new PdfFonts(doc, findFonts(new Map()))).toThrow(
    "no font found on this machine for a PDF (looked in its font folders)",
  );
});
