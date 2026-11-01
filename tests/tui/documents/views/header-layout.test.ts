import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { modeButtons, crumbLeast, crumbLayout } from "../../../../src/tui/documents/views/header-layout.ts";

import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);

describe("room: the buttons give way before the breadcrumb's innermost heading (HDR-D4)", () => {
  test("modeButtons: the widest form that leaves the breadcrumb its least room and margins, else the selected letter", () => {
    // No breadcrumb: full from 20 columns, letters from 9, the selected letter from 3.
    expect([20, 19, 9, 8, 3, 2].map((r) => modeButtons(r, 0))).toEqual([
      "letters",
      "letters",
      "letters",
      "selected",
      "selected",
      "none",
    ]);
    // A breadcrumb wanting 14 columns, and one at each end: full from 36, letters from 25, the selected letter from 19.
    expect([36, 35, 25, 24, 19, 18, 3, 2].map((r) => modeButtons(r, 14))).toEqual([
      "letters",
      "letters",
      "letters",
      "selected",
      "selected",
      "selected",
      "selected",
      "none",
    ]);
  });

  test("crumbLeast: room for the icon and a space, `… ›` and 8 columns of a heading, whatever the headings (HDR-D7)", () => {
    expect(crumbLeast({ crumb: "›", crumbIcon: "§" })).toBe(2 + 4 + 8);
    expect(crumbLeast({ crumb: ">", crumbIcon: "#" })).toBe(2 + 4 + 8);
    // A heading one column wide keeps its place too: never under the 4 columns a breadcrumb is drawn in.
    expect(modeButtons(25, crumbLeast({ crumb: "›", crumbIcon: "§" }))).toBe("letters");
  });
});

describe("breadcrumb collapse (…) and the path dropdown", () => {
  test("crumbLayout: all, then first … innermost, then cut, then … last, then …", () => {
    const shape = (ps: ReturnType<typeof crumbLayout>) =>
      ps.map((p) => (p === "more" ? "…" : `${p.i}:${p.w}`)).join(" ");
    const ws = [20, 15, 15, 20];
    expect(shape(crumbLayout(ws, 200, 3))).toBe("0:20 1:15 2:15 3:20");
    expect(shape(crumbLayout(ws, 70, 3))).toBe("0:20 … 2:15 3:20"); // 20+3+1+3+15+3+20 = 65
    expect(shape(crumbLayout(ws, 50, 3))).toBe("0:20 … 3:20");
    expect(shape(crumbLayout(ws, 30, 3))).toBe("0:8 … 3:15"); // cut, the last keeps the most
    expect(shape(crumbLayout(ws, 20, 3))).toBe("… 3:16");
    expect(shape(crumbLayout(ws, 10, 3))).toBe("…");
    expect(shape(crumbLayout([30, 30], 40, 3))).toBe("0:8 1:29"); // two: no … until the first goes
    expect(shape(crumbLayout([30], 12, 3))).toBe("0:12");
    expect(shape(crumbLayout([30], 5, 3))).toBe("…");
  });
});
