import { expect, test } from "bun:test";
import { MouseGestures } from "../../../../../src/tui/shell/input/mouse/gestures.ts";
import { MouseRouting } from "../../../../../src/tui/shell/input/mouse/routing.ts";
import { inRect } from "../../../../../src/tui/shell/input/mouse/geometry.ts";

test("rectangle routing includes top-left and excludes bottom-right edges", () => {
  const r = { x: 2, y: 3, w: 4, h: 5 };
  expect(inRect(r, 2, 3)).toBe(true);
  expect(inRect(r, 5, 7)).toBe(true);
  expect(inRect(r, 6, 7)).toBe(false);
  expect(inRect(r, 5, 8)).toBe(false);
});

test("pointer click history uses the live clock and position with a strict interval", () => {
  let now = 1000;
  const gestures = new MouseGestures({ now: () => now } as never);
  expect(gestures.clicks({ x: 2, y: 3 })).toBe(1);
  now += 399;
  expect(gestures.clicks({ x: 2, y: 3 })).toBe(2);
  now += 400;
  expect(gestures.clicks({ x: 2, y: 3 })).toBe(1);
  expect(gestures.clicks({ x: 3, y: 3 })).toBe(1);
});

test("a consumed click resets its original history without becoming a double click", () => {
  const gestures = new MouseGestures({ now: () => 1000 } as never);
  gestures.lastClick = { x: 2, y: 3, at: 1000, count: 0 };
  expect(gestures.clicks({ x: 2, y: 3 })).toBe(0);
  expect(gestures.lastClick).toBeNull();
  expect(gestures.clicks({ x: 2, y: 3 })).toBe(1);
});

test("a save-as overlay without drawn choices closes through the existing outside-click policy", () => {
  const closed: boolean[] = [];
  const app = { overlay: { kind: "saveas" }, overlays: { close: (outside: boolean) => closed.push(outside) } };
  const routing = new MouseRouting(app as never);
  routing.overlay({ type: "move", x: 0, y: 0 }, {} as never);
  expect(closed).toEqual([]);
  routing.overlay({ type: "down", x: 0, y: 0 }, {} as never);
  expect(closed).toEqual([true]);
});
