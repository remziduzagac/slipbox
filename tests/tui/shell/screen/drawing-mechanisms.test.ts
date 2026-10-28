import { expect, test } from "bun:test";
import { followSelection } from "../../../../src/tui/shell/panels/drawing/selection.ts";
import { marked, wrapWords } from "../../../../src/tui/shell/overlays/drawing/common/labels.ts";
import { dialogHeight, dialogWidth, DIALOG_MIN_W } from "../../../../src/tui/shell/overlays/drawing/dialogs/prompt.ts";
import type { PromptOverlay } from "../../../../src/tui/app/runtime/app.ts";

test("shared selection follows an unpinned row and preserves a pinned viewport", () => {
  const state = { selected: 1, scroll: 5, pinned: true };
  followSelection(state, 10, 3);
  expect(state).toEqual({ selected: 1, scroll: 5, pinned: true });
  state.pinned = false;
  followSelection(state, 10, 3);
  expect(state).toEqual({ selected: 1, scroll: 1, pinned: false });
});

test("filtered row counts clamp selection and scrolling even when pinning is set", () => {
  const state = { selected: 8, scroll: 6, pinned: true };
  followSelection(state, 2, 3);
  expect(state).toEqual({ selected: 1, scroll: 0, pinned: true });
  followSelection(state, 0, 3);
  expect(state).toEqual({ selected: 0, scroll: 0, pinned: true });
});

test("optional pinning and a zero-height viewport keep the existing clamping behavior", () => {
  const state = { selected: 4, scroll: 0 };
  followSelection(state, 5, 0);
  expect(state).toEqual({ selected: 4, scroll: 5 });
  followSelection(state, 1, 2);
  expect(state).toEqual({ selected: 0, scroll: 0 });
});

test("marked labels preserve match positions when terminal escapes are removed", () => {
  const result = marked("a\u001b[31mb", [0, 6]);
  expect(result.text).toBe("ab");
  expect([...result.pos]).toEqual([0, 1]);
});

test("dialog width and confirmation height preserve narrow and wide geometry", () => {
  expect(DIALOG_MIN_W).toBe(30);
  expect([20, 40, 100].map(dialogWidth)).toEqual([24, 32, 64]);
  const question = { label: "A question", confirm: false } as PromptOverlay;
  expect(dialogHeight(question, 32)).toBe(6);
  question.confirm = true;
  expect(dialogHeight(question, 32)).toBe(5);
});

test("shared word wrapping keeps wide glyphs within the original row boundaries", () => {
  expect(wrapWords("alpha beta gamma", 10)).toEqual(["alpha beta", "gamma"]);
  expect(wrapWords("😀 😀 😀", 5)).toEqual(["😀 😀", "😀"]);
});
