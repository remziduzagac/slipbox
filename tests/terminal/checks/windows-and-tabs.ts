import { type Check, leader, open } from "../check.ts";
import { windows, exits } from "../support/navigation.ts";

export const WINDOWS_AND_TABS: Check[] = [
  // --- windows --------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "windows: split side by side and stacked, focus, move to each edge, swap, close, only",
    covers: {
      cases: ["windows"],
      commands: [
        "window.split_side",
        "window.split_stacked",
        "window.focus_left",
        "window.focus_right",
        "window.focus_up",
        "window.focus_down",
        "window.other",
        "window.move_left",
        "window.move_up",
        "window.move_right",
        "window.move_down",
        "window.swap",
        "window.close",
        "window.only",
      ],
    },
    // The explorer closed, so only the windows name notes below the tab bar; wide enough for their whole paths.
    options: { size: { cols: 140, rows: 30 }, config: "[ui]\nsidebar = false\n" },
    run: async (s) => {
      // The windows' notes in screen order, from their breadcrumbs (not the tab bar's, nor the status line's): below
      // the tab bar, right of the rail.
      const NAME = /\b(home|writing-guide)\b(?=\.md\b)/g;
      const rows = () =>
        s
          .screen()
          .slice(3, -1)
          .map((r) => [...r].slice(3).join(""));
      const notes = () => rows().join("\n").match(NAME) ?? [];
      const order = () =>
        notes()
          .map((n) => `${n}.md`)
          .join(" ");
      // Side by side, both names are on one row; stacked, they aren't.
      const sameRow = () => rows().some((r) => (r.match(NAME) ?? []).length === 2);
      const count = () => Math.max(notes().length, windows(s));
      await s.keys("ctrl+w", "v");
      await s.until(() => notes().length === 2 && sameRow(), 3000, "two windows side by side");
      await s.keys("ctrl+w", "s");
      await s.until(() => notes().length === 2 && !sameRow(), 3000, "the split turned stacked");
      // One window shows another note, so where each window is can be told.
      await open(s, "writing-guide");
      await s.until(() => notes().sort().join(" ") === "home writing-guide", 3000, "two windows, two notes");
      // The status line names the focused window's note.
      const focused = () => /\b(home|writing-guide)\.md\b/.exec(s.statusLine())?.[1] ?? "";
      // Moving a window to an edge turns the split and puts it there, focused: H left, K top, L right, J bottom.
      for (const [k, side, first] of [
        ["H", true, true],
        ["K", false, true],
        ["L", true, false],
        ["J", false, false],
      ] as const) {
        await s.keys("ctrl+w", `shift+${k.toLowerCase()}`);
        await s.until(
          () => sameRow() === side && notes()[first ? 0 : 1] === focused(),
          3000,
          `ctrl+w ${k}: ${side ? "side by side" : "stacked"}, ${first ? (side ? "left" : "top") : side ? "right" : "bottom"}`,
        );
        if (k === "H") {
          await s.keys("ctrl+w", "l");
          await s.until(() => focused() === notes()[1], 3000, "ctrl+w l to the right window");
          await s.keys("ctrl+w", "h");
          await s.until(() => focused() === notes()[0], 3000, "ctrl+w h back to the left one");
        }
      }
      // Swap: the two windows trade notes.
      const before = order();
      await s.keys("ctrl+w", "x");
      await s.until(() => order() === before.split(" ").reverse().join(" "), 3000, "ctrl+w x to swap the windows");
      // Focus. Stacked now: k is the top one.
      const [topNote, bottomNote] = order()
        .split(" ")
        .map((n) => n.replace(/\.md$/, ""));
      await s.keys("ctrl+w", "k");
      await s.until(() => focused() === topNote, 3000, "ctrl+w k to the top window");
      await s.keys("ctrl+w", "j");
      await s.until(() => focused() === bottomNote, 3000, "ctrl+w j to the bottom window");
      await s.keys("ctrl+w", "w");
      await s.until(() => focused() === topNote, 3000, "ctrl+w w to the other window");
      await s.keys("ctrl+w", "q");
      await s.until(() => count() === 1, 3000, "a window closed");
      await s.keys("ctrl+w", "v", "ctrl+w", "o");
      await s.until(() => count() === 1, 3000, "only one window");
    },
  },
  {
    area: "navigating",
    name: "windows: resize — ctrl+w + - > < a step each, = evens them; resize mode's keys until esc",
    covers: {
      cases: ["windows"],
      commands: [
        "window.taller",
        "window.shorter",
        "window.wider",
        "window.narrower",
        "window.equalize",
        "window.resize_mode",
      ],
    },
    options: { size: { cols: 140, rows: 30 }, config: "[ui]\nsidebar = false\n" },
    run: async (s) => {
      const NAMES = /\b(home|writing-guide)\.md\b/g;
      await s.keys("ctrl+w", "s");
      await open(s, "writing-guide");
      // Stacked: the row the lower window's breadcrumb sits on moves; = evens it.
      const split = () =>
        s
          .screen()
          .slice(0, -1)
          .findLastIndex((r) => /\b(home|writing-guide)\.md\b/.test(r));
      await s.until(() => (s.text().match(NAMES) ?? []).length >= 2, 3000, "two windows, stacked");
      const even = split();
      // One step, then the resize mode it leaves on, left with esc (= evens them, and stays reading).
      const step = async (k: string) => {
        await s.keys("ctrl+w", k);
        if (k === "=") return;
        await s.status("RESIZE");
        await s.keys("escape");
        await s.status("READ");
      };
      await step("+");
      await s.until(() => split() !== even, 3000, "ctrl+w + to change the heights");
      await step("=");
      await s.until(() => split() === even, 3000, "ctrl+w = to even them");
      await step("-");
      await s.until(() => split() !== even, 3000, "ctrl+w - to change the heights");
      await step("=");
      await s.until(() => split() === even, 3000, "ctrl+w = to even them again");
      // Side by side: where the second breadcrumb starts on the shared row moves with > and <.
      const bothRow = () => s.screen().find((r) => (r.match(NAMES) ?? []).length === 2);
      await s.keys("ctrl+w", "shift+h");
      await s.until(() => bothRow() !== undefined, 3000, "side by side");
      const col = () => (bothRow() ?? "").lastIndexOf(".md");
      const mid = col();
      await step(">");
      await s.until(() => col() !== mid, 3000, "ctrl+w > to change the widths");
      await step("=");
      await s.until(() => col() === mid, 3000, "ctrl+w = to even the widths");
      await step("<");
      await s.until(() => col() !== mid, 3000, "ctrl+w < to change the widths");
      await step("=");
      await s.until(() => col() === mid, 3000, "even again");
      // Resize mode: h j k l until esc.
      await leader(s, "w", "r");
      await s.status("RESIZE");
      await s.keys("l");
      await s.until(() => col() !== mid, 3000, "l in resize mode to change the widths");
      const moved = col();
      await s.keys("l");
      await s.until(() => col() !== moved, 3000, "l again, still in resize mode");
      await s.keys("escape");
      await s.status("READ");
    },
  },
  {
    area: "navigating",
    name: "windows: :q closes a window, then the tab, and on the very last one quits",
    covers: { cases: ["windows"], commands: ["window.close_or_quit"] },
    run: async (s) => {
      // A second tab, split: :q closes its windows one by one, then the tab, then quits.
      await s.keys("ctrl+t", "c");
      await s.see(/2 home\.md/);
      await s.keys("ctrl+w", "v");
      await s.until(() => windows(s) === 2, 3000, "the split");
      await s.ex("q");
      await s.until(() => windows(s) === 1, 3000, "one window left");
      await s.see(/2 home\.md/);
      await s.ex("q");
      await s.notSee(/2 home\.md/);
      s.expect(!s.exited(), "still running with a tab left");
      await s.ex("q");
      await exits(s, ":q on the last window to quit");
      s.expect(s.exitCode() === 0, `exit 0, not ${s.exitCode()}`);
      await s.restart();
    },
  },

  // --- tabs -----------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "tabs: new, the list, next and previous, go to, move, close",
    covers: {
      cases: ["tabs"],
      commands: [
        "tab.new",
        "tab.list",
        "tab.next",
        "tab.prev",
        "tab.goto",
        "tab.move_left",
        "tab.move_right",
        "tab.close",
      ],
    },
    options: { size: { cols: 100, rows: 30 } },
    run: async (s) => {
      await s.keys("ctrl+t", "c");
      await s.see(/2 home/);
      await open(s, "operations-handbook");
      await s.keys("ctrl+t", "t");
      await s.see("Tabs (2)");
      await s.keys("escape");
      await s.keys("ctrl+t", "p");
      await s.status("home.md");
      await s.keys("ctrl+t", "n");
      await s.status("operations-handbook.md");
      await s.keys("ctrl+t", "1");
      await s.status("home.md");
      await s.keys("ctrl+t", "shift+l");
      await s.see(/1 operations/); // home moved right, past the handbook
      await s.keys("ctrl+t", "shift+h");
      await s.see(/1 home/);
      await s.keys("ctrl+t", "q");
      await s.notSee(/2 home|2 operations/);
    },
  },
  {
    area: "navigating",
    name: "tabs: close the others and close all, a pinned tab kept; a new tab from a split takes its window",
    covers: { cases: ["tabs"], commands: ["tab.new", "tab.close_others", "tab.close_all", "tab.pin"] },
    options: { size: { cols: 100, rows: 30 } },
    run: async (s) => {
      await leader(s, "t", "c");
      await leader(s, "t", "c");
      await s.see(/3 \S/);
      await s.keys("ctrl+t", "o");
      await s.message(/closed 2 other tabs/);
      await s.notSee(/2 \S+\.md/);
      // In a split, a new tab takes this window out of it: two tabs of one window each.
      await s.keys("ctrl+w", "v");
      await s.until(() => windows(s) === 2, 3000, "the split");
      await s.keys("ctrl+t", "c");
      await s.see(/2 \S+\.md/);
      s.expect(windows(s) === 1, "the new tab holds one window");
      await s.keys("ctrl+t", "1");
      await s.until(() => windows(s) === 1, 3000, "the first tab left with one window");
      // Pinned: kept by close others and close all.
      await s.keys("ctrl+t", "m");
      await s.keys("ctrl+t", "c");
      await open(s, "operations-handbook");
      await s.keys("ctrl+t", "o");
      await s.see(/2 operations-handbook/);
      await s.see(/1 \S*\s*home\.md/);
      await s.keys("ctrl+t", "shift+q");
      await s.notSee(/2 operations-handbook/);
      await s.see(/1 \S*\s*home\.md/);
      // Unpinned, close all leaves nothing open.
      await s.keys("ctrl+t", "m");
      await s.keys("ctrl+t", "shift+q");
      await s.see("No note open");
      await s.status("FILES");
    },
  },
];
