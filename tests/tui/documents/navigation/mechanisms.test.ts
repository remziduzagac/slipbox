import { expect, test } from "bun:test";
import { layoutSource } from "../../../../src/core/rendering/layout/code/source.ts";
import type { Layout } from "../../../../src/core/rendering/layout/ir.ts";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import {
  rowFromAnchor,
  cursorFromAnchor,
  cursorAnchorFor,
} from "../../../../src/tui/documents/views/layout/anchors.ts";
import { naturalWidth } from "../../../../src/tui/documents/views/layout/widths.ts";
import { selectedText } from "../../../../src/tui/documents/views/layout/selection.ts";
import { taskMarkAt } from "../../../../src/tui/documents/views/layout/tasks.ts";
import { lineAnchor, pointerHeading, markdownText } from "../../../../src/tui/actions/documents/links/anchors.ts";
import { peekTitle, withBacklinks } from "../../../../src/tui/documents/navigation/peek/presentation.ts";

test("view anchors round-trip wrapped source rows and retain insert-mode end columns", () => {
  const wrapped = layoutSource("abcdefghi\nnext", { width: 4, wrap: true, headings: [] });
  const row = wrapped.lines.findIndex((line, i) => i > 0 && line.src === wrapped.lines[i - 1]!.src);
  expect(row).toBeGreaterThan(0);
  const cursor = cursorAnchorFor(wrapped, { row, col: 1 });
  expect(rowFromAnchor(wrapped, cursor.anchor, cursor.sub)).toBe(row);
  expect(cursorFromAnchor(wrapped, cursor)).toEqual({ row, col: 1 });
  const single = layoutSource("abc", { width: 40, wrap: true, headings: [] });
  const end = cursorAnchorFor(single, { row: 0, col: 3 });
  expect(cursorFromAnchor(single, end).col).toBe(2);
  expect(cursorFromAnchor(single, end, true).col).toBe(3);
});

test("natural view width excludes long decorative tails, trailing blanks and far-right labels", () => {
  const layout = {
    width: 100,
    lines: [
      { spans: [{ text: `name ${"─".repeat(25)}` }] },
      { spans: [{ text: "wide界 " }] },
      { spans: [{ text: `short${" ".repeat(80)}label` }] },
    ],
  } as unknown as Layout;
  expect(naturalWidth(layout)).toBe(6);
});

test("selected text includes a wide grapheme once in either direction and preserves whole-line selection", () => {
  const layout = layoutSource("a😀b\nxyz", { width: 40, wrap: true, headings: [] });
  expect(selectedText(layout, { anchor: { row: 0, col: 1 }, line: false }, { row: 0, col: 2 })).toBe("😀");
  expect(selectedText(layout, { anchor: { row: 0, col: 2 }, line: false }, { row: 0, col: 1 })).toBe("😀");
  expect(selectedText(layout, { anchor: { row: 0, col: 1 }, line: true }, { row: 1, col: 1 })).toBe("a😀b\nxyz");
});

test("task hit testing uses laid-out widths and excludes the checkbox's trailing space", () => {
  const task = { line: 1, end: 6, checked: true };
  const layout = { lines: [{ spans: [{ text: "界 " }, { text: "[x] ", task }] }] } as unknown as Layout;
  expect(taskMarkAt(layout, 0, 2)).toBeNull();
  expect(taskMarkAt(layout, 0, 3)).toBe(task);
  expect(taskMarkAt(layout, 0, 5)).toBe(task);
  expect(taskMarkAt(layout, 0, 6)).toBeNull();
});

test("link anchors preserve line fragments, nested pointer keys and Markdown punctuation", () => {
  expect(lineAnchor("L42C5-L45C10")).toEqual({ heading: null, headingIndex: 0, offset: 0, line: 42 });
  expect(lineAnchor("section")).toBeUndefined();
  const headings = [
    { level: 1, text: "components" },
    { level: 2, text: "schemas" },
    { level: 3, text: "Frame" },
  ];
  expect(pointerHeading(headings, "/components/schemas/Frame")).toBe(2);
  expect(
    pointerHeading(
      [
        { level: 1, text: "items" },
        { level: 2, text: "1" },
      ],
      "/items/0",
    ),
  ).toBe(1);
  expect(pointerHeading(headings, "/components/missing")).toBe(-1);
  expect(markdownText("*a_b*")).toBe("\\*a\\_b\\*");
});

test("peek titles preserve complete labels when roomy and respect a narrow cell budget", () => {
  const peek = { label: "Vault", abs: "/notes/note.md" };
  expect(peekTitle(peek, "note.md")).toBe("Vault › note.md");
  const narrow = peekTitle(peek, "note.md", 12);
  expect(narrow.startsWith("Vault")).toBe(true);
  expect(stringWidth(narrow)).toBeLessThanOrEqual(12);
});

test("peek backlink Markdown keeps pending states and encodes path punctuation without formatting labels", () => {
  expect(withBacklinks("# Body", "/notes/note.md", "Vault", "reading")).toBe(
    "# Body\n\n---\n\n**Linked from:** reading Vault's index…\n",
  );
  const rows = [{ from: "/notes/a#>.md", shown: "a_[x]", line: 2, text: "quote*" }] as unknown as Parameters<
    typeof withBacklinks
  >[3];
  expect(withBacklinks("# Body", "/notes/note.md", "Vault", rows)).toBe(
    "# Body\n\n---\n\n**Linked from** (1):\n\n- [a\\_\\[x\\]:2](<a%23%3E.md#L2>) — quote\\*\n",
  );
});
