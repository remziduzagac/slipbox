import { describe, expect, test } from "bun:test";
import { navigateRows } from "../../../../src/tui/documents/tools/navigation.ts";

describe("document tool row navigation without App", () => {
  test("down and up clamp to their existing bounds", () => {
    const pane = { selected: 0 };
    expect(navigateRows(pane, "up", 3)).toBe(true);
    expect(pane.selected).toBe(0);
    navigateRows(pane, "down", 3);
    expect(pane.selected).toBe(1);
    navigateRows(pane, "down", 3);
    navigateRows(pane, "down", 3);
    expect(pane.selected).toBe(2);
  });

  test("top and bottom jump directly, preserving the empty-list minus-one result", () => {
    const pane = { selected: 1 };
    navigateRows(pane, "bottom", 4);
    expect(pane.selected).toBe(3);
    navigateRows(pane, "top", 4);
    expect(pane.selected).toBe(0);
    navigateRows(pane, "bottom", 0);
    expect(pane.selected).toBe(-1);
    navigateRows(pane, "up", 0);
    expect(pane.selected).toBe(0);
    navigateRows(pane, "down", 0);
    expect(pane.selected).toBe(-1);
  });

  test("feature actions leave selection and every other pane property untouched", () => {
    const pane = { selected: 2, pinned: true, scroll: 9, left: 3, filter: "find" };
    expect(navigateRows(pane, "fold", 4)).toBe(false);
    expect(pane).toEqual({ selected: 2, pinned: true, scroll: 9, left: 3, filter: "find" });
    navigateRows(pane, "down", 4);
    expect(pane).toEqual({ selected: 3, pinned: true, scroll: 9, left: 3, filter: "find" });
  });
});
