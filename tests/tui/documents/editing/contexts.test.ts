import { expect, test } from "bun:test";
import type { CompletionItem } from "vscode-languageserver-protocol";
import type { App, View } from "../../../../src/tui/app/runtime/app.ts";
import type { Layout } from "../../../../src/core/rendering/layout/ir.ts";
import { isHidden, stepVisible, visibleBetween } from "../../../../src/tui/documents/editing/lens/visibility.ts";
import {
  wordStart,
  linkTargetStart,
  wikiTargetStart,
  snippetContext,
} from "../../../../src/tui/documents/editing/completion/context.ts";
import { inOrder } from "../../../../src/tui/documents/editing/completion/items.ts";

test("lens hidden intervals stay half-open and visible distances retain their sign", () => {
  const hidden: [number, number][] = [
    [1, 3],
    [5, 6],
  ];
  expect([0, 1, 2, 3, 5, 6].map((row) => isHidden(hidden, row))).toEqual([false, true, true, false, true, false]);
  expect(visibleBetween(hidden, 0, 7)).toBe(4);
  expect(visibleBetween(hidden, 7, 0)).toBe(-4);
});

test("lens movement skips hidden rows in both directions without changing ranges", () => {
  const layout = { lines: Array.from({ length: 7 }, () => ({})) } as unknown as Layout;
  const hidden: [number, number][] = [
    [1, 3],
    [5, 6],
  ];
  expect(stepVisible(layout, hidden, 0, 1)).toBe(3);
  expect(stepVisible(layout, hidden, 6, -1)).toBe(4);
  expect(stepVisible(layout, hidden, 3, 2)).toBe(6);
  expect(stepVisible(layout, hidden, 6, 5)).toBe(6);
  expect(hidden).toEqual([
    [1, 3],
    [5, 6],
  ]);
});

test("completion word starts preserve identifier punctuation and Unicode letter offsets", () => {
  expect(wordStart("say a_b$", 8)).toBe(4);
  expect(wordStart("αβ", 2)).toBe(0);
  expect(wordStart("one ", 4)).toBe(4);
});

test("completion target starts stay on their line and reject ended or spaced targets", () => {
  expect(linkTargetStart("[note](docs/pa", 14)).toBe(7);
  expect(wikiTargetStart("see [[doc", 9)).toBe(6);
  expect(wikiTargetStart("prior\n[[doc", 11)).toBe(8);
  expect(linkTargetStart("[x](has space", 13)).toBeNull();
  expect(wikiTargetStart("[[doc#part", 10)).toBeNull();
});

test("completion ordering is stable and keeps the original array and item identities", () => {
  const items: CompletionItem[] = [
    { label: "z", sortText: "b" },
    { label: "b", sortText: "a" },
    { label: "a", sortText: "a" },
  ];
  const sorted = inOrder(items);
  expect(sorted.map((item) => item.label)).toEqual(["b", "a", "z"]);
  expect(items.map((item) => item.label)).toEqual(["z", "b", "a"]);
  expect(sorted).not.toBe(items);
  expect(sorted[2]).toBe(items[0]);
});

test("snippet context reads the current line, indentation and file variables without changing the buffer", () => {
  const view = {
    buf: { source: "first\n  name", abs: "/project/file.ts", indent: () => ({ tabs: false, size: 2 }) },
  } as unknown as View;
  const context = snippetContext({} as App, view, 12);
  expect(context.indent).toBe("  ");
  expect(context.unit).toBe("  ");
  expect(context.vars).toMatchObject({
    TM_FILENAME: "file.ts",
    TM_FILENAME_BASE: "file",
    TM_DIRECTORY: "/project",
    TM_FILEPATH: "/project/file.ts",
    TM_LINE_INDEX: "1",
    TM_LINE_NUMBER: "2",
    TM_CURRENT_LINE: "  name",
    TM_CURRENT_WORD: "name",
    TM_SELECTED_TEXT: "",
  });
  expect(view.buf.source).toBe("first\n  name");
});
