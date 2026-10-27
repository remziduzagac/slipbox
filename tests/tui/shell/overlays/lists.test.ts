import { describe, expect, test } from "bun:test";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 1", () => {
  const click = (h: Harness, x: number, y: number, button = 0) => {
    h.app.mouse.handle({ type: "down", x, y, button });
    h.app.mouse.handle({ type: "up", x, y, button });
    h.frame();
  };
  test("clicking a list's bottom border or footer runs nothing", async () => {
    const h = await harness({ width: 120, height: 30 });
    await h.keys("space", "?");
    h.frame();
    const r = h.app.geometry!.overlay!;
    const before = h.app.view!.cur;
    click(h, r.x + 10, r.y + r.h - 1); // the bottom border
    click(h, r.x + 10, r.listY + r.rows + 2); // the footer
    expect(h.app.overlay?.kind).toBe("list");
    expect(h.app.view!.cur).toEqual(before);
  });
  test("a short list keeps its selection in view (the footer goes first)", async () => {
    for (const [width, height] of [
      [60, 16],
      [40, 12],
      [60, 20],
    ] as const) {
      const h = await harness({ width, height });
      await h.keys("space", "?");
      h.frame();
      const o = h.app.overlay as ListOverlay;
      const r = h.app.geometry!.overlay!;
      expect(o.selected).toBeGreaterThanOrEqual(o.scroll);
      expect(o.selected).toBeLessThan(o.scroll + r.rows);
    }
  }); // 29 harnesses
});

describe("review round 3", () => {
  test("pasted text goes into the list filter or prompt (first line, sanitized)", async () => {
    const h = await harness();
    await h.keys("ctrl+p");
    h.app.input.paste("alp\u001b[31m\nsecond line");
    const o = h.app.overlay as ListOverlay;
    expect(o.input).toBe("alp");
    expect(o.filtered[0]!.item.label).toContain("alpha");
    await h.keys("ctrl+backspace"); // deletes a word in inputs
    expect(o.input).toBe("");
  });
});

describe("what keymap.md and tui.md promise (review: docs against the tests)", () => {
  test("lists: down wraps to the top, ctrl+j / ctrl+k move, the page keys and ctrl+d / ctrl+u go by 10; n/m counts; ctrl+g cancels", async () => {
    const h = await harness({ width: 120, height: 40 });
    await h.keys("ctrl+p");
    const o = h.app.overlay as ListOverlay;
    const n = o.filtered.length;
    expect(n).toBeGreaterThan(25);
    const counter = () =>
      h
        .frame()
        .match(/ (\d+)\/(\d+) /)
        ?.slice(1)
        .map(Number);
    expect(counter()).toEqual([1, n]); // in the bottom border
    await h.keys("pagedown");
    expect(o.selected).toBe(10);
    await h.keys("ctrl+d");
    expect(o.selected).toBe(20);
    expect(counter()).toEqual([21, n]);
    await h.keys("pageup");
    expect(o.selected).toBe(10);
    await h.keys("ctrl+u");
    expect(o.selected).toBe(0);
    await h.keys("ctrl+j", "ctrl+j", "ctrl+k");
    expect(o.selected).toBe(1);
    await h.keys("ctrl+k", "ctrl+k"); // up from the first: the last
    expect(o.selected).toBe(n - 1);
    await h.keys("down"); // down from the last: the first
    expect(o.selected).toBe(0);
    for (const c of "zqxjzqxj") await h.keys(c);
    expect(h.frame()).toContain("no matches");
    expect(counter()).toEqual([0, 0]);
    await h.keys("ctrl+g");
    expect(h.app.overlay).toBeNull();
    // A list without a filter (the folder's info): j and k move, a letter types nothing.
    await h.keys("space", "v", "i");
    const info = h.app.overlay as ListOverlay;
    expect(info.filterable).toBe(false);
    await h.keys("j", "j", "k");
    expect(info.selected).toBe(1);
    expect(info.input).toBe("");
    await h.keys("ctrl+c");
    expect(h.app.overlay).toBeNull();
  });
});
