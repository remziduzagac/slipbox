import { type Check, explorerOpen, HANDBOOK, leader, open, outlineOpen, pos } from "../check.ts";
import { lineOf } from "../support/navigation.ts";

export const NAVIGATION_TOOLS: Check[] = [
  // --- history --------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "history: back and forward; the list — this window's places, and recent here from another tab",
    covers: { cases: ["history"], commands: ["history.back", "history.forward", "history.list"] },
    run: async (s) => {
      await open(s, "writing-guide");
      await s.keys("ctrl+o");
      await s.status("home.md");
      await leader(s, "h", "n");
      await s.status("writing-guide.md");
      await leader(s, "h", "p");
      await s.status("home.md");
      // The handbook read in another tab: under recent here in this window's list.
      await s.keys("ctrl+t", "c");
      await open(s, "operations-handbook");
      await s.keys("ctrl+t", "1");
      await s.status("home.md");
      await leader(s, "h", "h");
      await s.see("recent here");
      await s.see("operations-handbook.md");
      await s.see("writing-guide.md");
      await s.keys("escape");
    },
  },

  // --- tags -----------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "tags: space f t lists them with counts, a tag its notes; a #tag in the text followed",
    covers: { cases: ["tags"], commands: ["tag.list"] },
    run: async (s) => {
      await leader(s, "f", "t");
      await s.see(/Tags \(\d+\)/, 10000); // after the index is read
      await s.see(/#dome\/shutter +2 notes/);
      await s.type("shutter");
      await s.keys("enter");
      await s.see("#dome/shutter — 2 notes");
      await s.see("projects/variable-star-survey.md");
      await s.keys("enter");
      await s.status("dome-refit.md");
      // The tags on its last line, one link after the other; the second followed, its notes.
      await s.keys("shift+g", "]", "l");
      await s.status("→ #dome/shutter");
      await s.keys("]", "l");
      await s.status("→ #budget/2026");
      await s.keys("enter");
      await s.see("#budget/2026 — 1 note");
      await s.keys("escape");
    },
  },

  // --- the explorer, the outline, the breadcrumb ----------------------------------------------
  {
    area: "navigating",
    name: "explorer: space e opens, focuses and hides it; space shift+e reveals the note",
    covers: { cases: ["explorer"], commands: ["explorer.cycle", "explorer.reveal"] },
    options: { open: HANDBOOK, size: { cols: 100, rows: 34 } },
    run: async (s) => {
      // space e cycles: open, focus, close. It may start open (a wide terminal), so press to focus.
      await explorerOpen(s);
      await s.see("Explorer");
      await leader(s, "e");
      await s.notSee("Explorer");
      await leader(s, "shift+e");
      await s.status("FILES");
      // Revealed: the note's own row in the explorer, left of the border (its name cut where the selected row's
      // buttons sit).
      await s.until(
        () => s.screen().some((r) => /operations-han\S*…?.*[│┃]/.test(r) && !/╞|├─/.test(r.slice(r.search(/[│┃]/)))),
        3000,
        "the note revealed in the explorer",
      );
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "outline: space o opens and focuses it; the heading picker jumps; shown and hidden from the palette",
    covers: { cases: ["outline"], commands: ["outline.cycle", "outline.pick", "outline.toggle"] },
    options: { open: HANDBOOK, size: { cols: 100, rows: 34 } },
    run: async (s) => {
      await outlineOpen(s);
      await s.see("Outline");
      await s.keys("escape");
      await leader(s, "f", "o");
      await s.see("Headings —");
      await s.type("O25");
      await s.keys("enter");
      await s.until(() => pos(s).line === lineOf(s, HANDBOOK, "## O25:"), 3000, "the cursor on O25's heading");
      // The outline, open since space o: hidden from the palette, then shown again.
      await s.keys(":");
      await s.type("Show or hide the outline");
      await s.keys("enter");
      await s.notSee("Outline");
      await s.keys(":");
      await s.type("Show or hide the outline");
      await s.keys("enter");
      await s.see("Outline");
    },
  },
  {
    area: "navigating",
    name: "breadcrumb: space f b opens the heading path as a list; typing filters it, enter jumps to one",
    covers: { cases: ["breadcrumb", "outline"], commands: ["breadcrumb.path", "outline.pick"] },
    options: { open: HANDBOOK, size: { cols: 100, rows: 34 } },
    run: async (s) => {
      // Under O22's first subheading: the path is the title, O22, the subheading (here).
      const sub = lineOf(s, HANDBOOK, "### The gateway client block");
      await leader(s, "f", "o");
      await s.see("Headings —");
      await s.type("gateway client block");
      await s.keys("enter");
      await s.until(() => pos(s).line === sub, 3000, "the cursor on the subheading");
      await s.keys("j", "j");
      await leader(s, "f", "b");
      await s.see("Path");
      await s.see(/└─ O22: Remote access through one gateway/);
      await s.see(/└─ The gateway client block\s+here/);
      await s.type("O22");
      await s.notSee(/└─ The gateway client block/);
      await s.keys("enter");
      await s.notSee("Path");
      await s.until(() => pos(s).line === lineOf(s, HANDBOOK, "## O22:"), 3000, "enter to O22's heading");
    },
  },
];
