// docs/guides/getting-started.md: the tour's first screen, the switcher, a task typed in the lens.

import { GUIDE, open, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "getting-started-first",
    options: { ...GUIDE, startAt: "home/slipbox-tour/inbox.md" },
    take: async (s) => {
      await s.status("inbox.md");
    },
  },
  {
    name: "getting-started-switcher",
    options: { ...GUIDE, startAt: "home/slipbox-tour/inbox.md" },
    take: async (s) => {
      await s.status("inbox.md");
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("coffee");
      await s.see("ideas/coffee.md");
    },
  },
  {
    name: "getting-started-editing",
    options: { ...GUIDE, startAt: "home/slipbox-tour/inbox.md" },
    take: async (s) => {
      // As the guide has it: found, `i` for the lens, `o` for a line under the task, typed and not saved.
      await open(s, "inbox");
      await s.keys("ctrl+f");
      await s.type("Try the new");
      await s.keys("enter", "escape", "i");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.type("Order more beans");
      // The lens's first-use hint, gone: the note under it in the picture.
      await s.notSee("the lens: the markdown", 8000);
    },
  },
];
