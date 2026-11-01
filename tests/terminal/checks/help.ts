import type { Check } from "../check.ts";
import { windows } from "../support/navigation.ts";

export const HELP: Check[] = [
  // --- help, messages, the config, the index ---------------------------------------------------
  {
    area: "navigating",
    name: "help: ? lists every key by group; typing filters, the groups kept; enter runs the command",
    covers: { cases: ["help"], commands: ["help.open", "window.split_side"] },
    options: { size: { cols: 120, rows: 34 } },
    run: async (s) => {
      await s.keys("?");
      await s.see("Keys — type to filter");
      await s.see("CURSOR");
      await s.see(/Cursor left\s+h\s+left/);
      await s.type("split side");
      await s.see("WINDOWS");
      await s.see(/Split side by side\s+ctrl\+w v/);
      await s.notSee("CURSOR");
      await s.keys("enter");
      await s.notSee("Keys — type to filter");
      await s.until(() => windows(s) === 2, 3000, "the split it ran");
    },
  },
];
