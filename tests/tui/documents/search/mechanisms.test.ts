import { expect, test } from "bun:test";
import type { App, PromptOverlay, View } from "../../../../src/tui/app/runtime/app.ts";
import type { Layout } from "../../../../src/core/rendering/layout/ir.ts";
import { computeFind } from "../../../../src/tui/documents/search/find.ts";
import { FindControls } from "../../../../src/tui/documents/search/controls.ts";

function layout(): Layout {
  return { lines: [{ spans: [{ text: "a 😀 aa" }] }, { decor: true, spans: [{ text: "a" }] }] } as unknown as Layout;
}

test("document find keeps cell widths, skips decoration and clamps the selected match", () => {
  const found = computeFind(layout(), "a", 99);
  expect(found.matches).toEqual([
    { row: 0, col: 0, len: 1 },
    { row: 0, col: 5, len: 1 },
    { row: 0, col: 6, len: 1 },
  ]);
  expect(found.current).toBe(2);
  expect(computeFind(layout(), "[", 0, false, true).error).toBeString();
});

test("find toggles read the current view and keep its literal search result in place", () => {
  const messages: unknown[][] = [];
  const view = { find: computeFind(layout(), "a") } as View;
  const app = {
    overlay: null,
    currentLayout: layout,
    message: (...args: unknown[]) => messages.push(args),
  } as unknown as App;
  new FindControls(app).toggleFindOpt(view, "whole");
  expect(view.findOpts).toEqual({ regex: false, whole: true });
  expect(view.find!.matches).toEqual([{ row: 0, col: 0, len: 1 }]);
  expect(messages).toEqual([["info", "whole words: on"]]);
});

test("replace-field editing preserves Unicode deletion and keeps the existing replace object", async () => {
  const controls = new FindControls({} as App);
  const replace = { text: "a😀", focus: true, current: 0, total: 0 };
  const overlay = { replace } as PromptOverlay;
  await controls.replaceFieldKey(overlay, {} as View, "backspace", null);
  expect(overlay.replace).toBe(replace);
  expect(replace.text).toBe("a");
  await controls.replaceFieldKey(overlay, {} as View, "x", "b");
  expect(replace.text).toBe("ab");
  await controls.replaceFieldKey(overlay, {} as View, "ctrl+u", null);
  expect(replace.text).toBe("");
});

test("replace-row toggling reads a replacement overlay live and leaves confirmation alone", async () => {
  const view = {} as View;
  const app = { overlay: null } as unknown as App;
  const controls = new FindControls(app);
  let changed = "";
  const overlay = {
    kind: "prompt",
    view,
    text: "a",
    replace: { confirm: {} },
    change: (s: string) => {
      changed = s;
    },
  } as unknown as PromptOverlay;
  app.overlay = overlay;
  await controls.toggleReplaceRow(view);
  expect(overlay.replace).toBeDefined();
  overlay.replace!.confirm = undefined;
  await controls.toggleReplaceRow(view);
  expect(overlay.replace).toBeUndefined();
  expect(changed).toBe("a");
});
