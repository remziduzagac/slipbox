import { expect, test } from "bun:test";
import { PdfPagination } from "../../../../../src/core/rendering/export/formats/pdf/pages/pagination.ts";

function document() {
  const calls: string[] = [];
  const doc = {
    x: 17,
    y: 800,
    page: { height: 842, width: 595, margins: { bottom: 72 } },
    bufferedPageRange: () => ({ start: 0, count: 1 }),
    save() {
      calls.push("save");
      return this;
    },
    restore() {
      calls.push("restore");
      return this;
    },
    addPage() {
      calls.push("addPage");
      this.y = 64;
      return this;
    },
    moveTo() {
      calls.push("bar");
      return this;
    },
    lineTo() {
      return this;
    },
    lineWidth() {
      return this;
    },
    strokeColor() {
      return this;
    },
    stroke() {
      return this;
    },
  };
  return { doc, calls, pdf: doc as unknown as PDFKit.PDFDocument };
}

test("streaming PDF footers run before page release and restore the body cursor and margins on failure", () => {
  const { doc, calls, pdf } = document();
  const pages = new PdfPagination(pdf, true, (content) => {
    calls.push(`footer:${"text" in content[0]! ? content[0]!.text : "?"}:${doc.page.margins.bottom}`);
    doc.x = 300;
    doc.y = 200;
  });
  pages.ensure(1);
  expect(calls).toEqual(["save", "footer:1:0", "restore", "addPage"]);
  expect(doc.x).toBe(17);
  expect(doc.page.margins.bottom).toBe(72);
  const fail = new PdfPagination(pdf, true, () => {
    doc.x = 0;
    doc.y = 0;
    throw new Error("footer failed");
  });
  const before = { x: doc.x, y: doc.y, bottom: doc.page.margins.bottom };
  expect(() => fail.pageNumber(0)).toThrow("footer failed");
  expect({ x: doc.x, y: doc.y, bottom: doc.page.margins.bottom }).toEqual(before);
});

test("streaming PDF quote bars are removed when their body throws", () => {
  const { calls, pdf } = document();
  const pages = new PdfPagination(pdf, true, () => {});
  expect(() =>
    pages.barred("red", 3, () => {
      throw new Error("body failed");
    }),
  ).toThrow("body failed");
  pages.addPage();
  expect(calls).not.toContain("bar");
});
