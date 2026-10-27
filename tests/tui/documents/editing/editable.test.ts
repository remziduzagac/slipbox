import { expect, test } from "bun:test";
import { editable } from "../../../../src/tui/documents/editing/editable.ts";
import { viewMode } from "../../../../src/tui/shell/input/modes.ts";

test("presentation flags determine editability without a buffer or App", () => {
  expect([undefined, null, {}, { source: false, live: false }].map(editable)).toEqual([false, false, false, false]);
  expect([{ source: true }, { live: true }, { source: true, live: true }].map(editable)).toEqual([true, true, true]);
});

test("presentation mode keeps source precedence and the existing compatibility values", () => {
  expect([{}, { live: true }, { source: true }, { source: true, live: true }].map(viewMode)).toEqual([
    "rendered",
    "live",
    "source",
    "source",
  ]);
});
