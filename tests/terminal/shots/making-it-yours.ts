// docs/guides/making-it-yours.md: the theme picker previewing Tokyo Night Moon, the settings list after a change.

import { HOME, leader, type Shot } from "../shot.ts";

/** The lists over the note alone, the explorer put away. */
const NOTE = { ...HOME("notes/index.md"), config: "[ui]\nsidebar = false\n" };

export const SHOTS: Shot[] = [
  {
    name: "making-it-yours-theme",
    options: NOTE,
    take: async (s) => {
      await s.status("index.md");
      await leader(s, "u", "t");
      await s.see("Theme");
      // From Night, the default: Storm, then Moon, previewed on the note behind the list.
      await s.see("tokyo-night-moon");
      await s.keys("down", "down");
    },
  },
  {
    name: "making-it-yours-settings",
    options: NOTE,
    take: async (s) => {
      await s.status("index.md");
      // Line numbers turned off (the sixth row: Theme, Glyphs, Readable width, Zen mode, Cursor-row highlight), then
      // the list opened again: its value says off, and the note behind has none.
      await leader(s, "u", "u");
      await s.see("Readable width");
      await s.keys("down", "down", "down", "down", "down", "enter");
      await s.see("Line numbers: off");
      await s.notSee("Line numbers: off", 15000);
      await leader(s, "u", "u");
      await s.see("Readable width");
    },
  },
];
