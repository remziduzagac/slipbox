import { expect, test } from "bun:test";
import { PdfLines } from "../../../../../src/core/rendering/export/formats/pdf/layout/lines.ts";

function lines() {
  const pdf = {
    font() {
      return this;
    },
    fontSize() {
      return this;
    },
    widthOfString(text: string) {
      return [...text].length;
    },
  } as unknown as PDFKit.PDFDocument;
  return new PdfLines(
    pdf,
    {
      segments: (text, key) => [{ text, key }],
      faceKey: () => "regular",
      metrics: () => ({ ascent: 7, descent: 2 }),
    },
    null,
  );
}

test("PDF line layout trims trailing width, honors newlines and cuts long words without splitting graphemes", () => {
  const layout = lines();
  const first = layout.layout([{ text: "abc  def\n界😀x" }], 5);
  expect(
    first.lines.map((line) => line.atoms.map((atom) => (atom.kind === "text" ? atom.text : "?")).join("")),
  ).toEqual(["abc  ", "def", "界😀x"]);
  expect(first.lines.map((line) => line.width)).toEqual([3, 3, 3]);
  expect(first.longest).toBe(3);
  const cut = layout.lines([{ text: "a\u0301bcdef" }], 2);
  expect(
    cut
      .flatMap((line) => line.atoms)
      .filter((atom) => atom.kind === "text")
      .map((atom) => atom.text)
      .join(""),
  ).toBe("a\u0301bcdef");
  expect(cut[0]!.atoms[0]).toMatchObject({ text: "a\u0301" });
  expect(layout.height(cut, 1)).toBe(cut.length * 10);
});

test("PDF inline picture fallback retains its alt text and italic style when no raster is available", () => {
  const result = lines().lines([{ picture: {}, alt: "missing art" }], 30);
  expect(result[0]!.atoms.every((atom) => atom.kind === "text" && atom.italic)).toBe(true);
  expect(result[0]!.atoms.map((atom) => (atom.kind === "text" ? atom.text : "?")).join("")).toBe("missing art");
});
