// docs/manual/screen.md (the map is README.md's second picture too): the screen's parts, the which-key popup, the
// Problems panel.

import { HOME, leader, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "screen-map",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await s.status("index.md");
      await s.keys("tab", "ctrl+enter");
      await s.until(() => (s.screen()[2] ?? "").includes("2 "), 3000, "a second tab");
      await leader(s, "o");
      await s.keys("escape", "]", "]");
    },
  },
  {
    name: "screen-which-key",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await s.status("index.md");
      await s.keys("space");
      await s.see("+find");
    },
  },
  {
    name: "screen-problems",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await s.status("index.md");
      await leader(s, "v", "p");
      await s.status("PROBLEMS");
    },
  },
];
