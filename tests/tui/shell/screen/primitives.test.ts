import { expect, test } from "bun:test";
import { terminalTheme } from "../../../../src/core/rendering/theme/theme.ts";
import { TextCanvas } from "../../../../src/tui/shell/terminal/canvas.ts";
import { button, keyText } from "../../../../src/tui/shell/screen/controls.ts";
import {
  clipRules,
  coverHot,
  mid,
  type HotGeometry,
  type RuleGeometry,
} from "../../../../src/tui/shell/screen/geometry.ts";
import { CHANGE_MARKER_MS, markStyle, pageBg, roleStyle } from "../../../../src/tui/shell/screen/style.ts";

test("drawing styles retain page fallback, explicit marks and the reload marker duration", () => {
  const theme = terminalTheme();
  theme.fg = "#112233";
  theme.bg = "default";
  theme.roles.text = { bold: true, underline: true, dim: true };
  expect(pageBg(theme)).toBeNull();
  expect(roleStyle(theme, "text", "#445566")).toEqual({
    fg: "#112233",
    bg: "#445566",
    bold: true,
    italic: false,
    underline: true,
    strike: false,
    dim: true,
    inverse: false,
  });
  theme.roles.text = { fg: "#778899", bg: "#aabbcc", bold: false, italic: true, dim: true, underline: true };
  expect(markStyle(theme, "text")).toEqual({ fg: "#778899", bg: "#aabbcc", underline: true });
  expect(CHANGE_MARKER_MS).toBe(3000);
});

test("bar controls fill their band and keep cropped wide text inside its hot region", () => {
  const theme = terminalTheme();
  theme.roles.hover = { bg: "#ff0000" };
  const canvas = new TextCanvas(6, 4);
  const geo: HotGeometry = { hot: [] };
  const context = { theme, mouse: { hover: "sample" } };
  expect(button(context, canvas, 1, { y: 1, h: 2 }, "A界B", "text", "sample", geo, null, 3)).toBe(3);
  expect(geo.hot).toEqual([{ id: "sample", x: 1, y: 1, w: 3, h: 2 }]);
  expect(canvas.styles[1]![1]!.bg).toBe("#ff0000");
  expect(canvas.rows[2]![1]).toBe("A");
  expect(canvas.rows[2]![2]).toBe("界");
  expect(canvas.toString()).not.toContain("B");
  expect(mid({ y: 1, h: 2 })).toBe(2);
  expect(button(context, canvas, 0, { y: 0, h: 1 }, "hidden", "text", "empty", geo, null, 0)).toBe(0);
  expect(geo.hot).toHaveLength(1);
});

test("key labels keep Unicode and ASCII leader forms without an App", () => {
  expect(keyText({ leader: "space", glyphs: { mode: "unicode" } }, "space n r")).toBe("␣ n r");
  expect(keyText({ leader: "space", glyphs: { mode: "ascii" } }, "space n r")).toBe("SPC n r");
});

test("covering a pane removes overlapping targets and clips only the rules it covers", () => {
  const style = roleStyle(terminalTheme(), "border", null);
  const geo: HotGeometry & RuleGeometry = {
    hot: [
      { id: "left", x: 0, y: 1, w: 2, h: 1 },
      { id: "inside", x: 3, y: 2, w: 1, h: 1 },
      { id: "right", x: 6, y: 1, w: 2, h: 1 },
      { id: "above", x: 3, y: 0, w: 1, h: 1 },
    ],
    rules: [
      { y: 2, x0: 0, x1: 10 },
      { y: 0, x0: 0, x1: 10 },
    ],
    verticals: [
      { x: 3, y0: 1, y1: 4, style },
      { x: 1, y0: 0, y1: 4, style },
    ],
  };
  const rect = { x: 2, y: 1, w: 4, h: 3 };
  coverHot(geo, rect);
  expect(geo.hot.map((hot) => hot.id)).toEqual(["left", "right", "above"]);
  clipRules(geo, rect);
  expect(geo.rules).toEqual([
    { y: 2, x0: 0, x1: 2 },
    { y: 2, x0: 6, x1: 10 },
    { y: 0, x0: 0, x1: 10 },
  ]);
  expect(geo.verticals).toEqual([{ x: 1, y0: 0, y1: 4, style }]);
});
