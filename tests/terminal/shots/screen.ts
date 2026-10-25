// docs/manual/screen.md (the map is README.md's second picture too): the screen's parts, the which-key popup, the
// Problems panel.

import { HOME, leader, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "screen-background",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await s.until(() => / 0 +\d+\.\d+\.\d+/.test(s.topBar()), 30000, "indexing done");
      await leader(s, "b");
      await s.see("No work running");
    },
  },
  {
    name: "screen-about",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await leader(s, "a");
      await s.see("Channel: stable");
    },
  },
  {
    name: "screen-info-export",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await leader(s, "n", "i");
      await s.status("INFO");
      await s.keys("shift+g");
      await s.see("Export…");
    },
  },
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
    options: {
      ...HOME("notes/index.md"),
      config: `[lint]\nenabled = "on"\ncommand = ["sh", "-c", ${JSON.stringify(`for f; do case "$f" in */notes/index.md) printf '%s:9:1 error MD013/line-length Line length\\n' "$f";; esac; done; exit 1`)}, "lint"]\n`,
    },
    take: async (s) => {
      await s.status("index.md");
      await leader(s, "v", "p");
      await s.status("PROBLEMS");
      await s.see("1 hidden: lines the view wraps");
    },
  },
];
