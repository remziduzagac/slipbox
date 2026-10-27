import { describe, expect, test } from "bun:test";
import { modeButtons, crumbLeast } from "../../../../src/tui/documents/views/header-layout.ts";

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
