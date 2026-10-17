// docs/guides/lens.md: the lens opened on a paragraph (its section whole), and grown while typing a paragraph under it.

import type { Session } from "../session.ts";
import { HOME, leader, type Shot } from "../shot.ts";

/** A plan for a long ride, with no explorer beside it: a training table, a paragraph on food, a checklist of gear. */
const BREVET = { ...HOME("notes/projects/brevet-300.md"), config: "[ui]\nsidebar = false\n" };

/** The cursor on the line holding `text`, that line in the middle of the window, the find row closed. */
async function at(s: Session, text: string): Promise<void> {
  await s.status("brevet-300.md");
  await s.keys("/");
  await s.type(text);
  await s.keys("enter", "escape", "z", "z");
}

/** What the lens said as it opened, gone: the page under it in the picture, not the message. */
const unsaid = (s: Session) => s.notSee("the lens: the markdown", 8000);

export const SHOTS: Shot[] = [
  {
    name: "lens-open",
    options: BREVET,
    take: async (s) => {
      // The paragraph about food: the lens opened there without typing, on its section whole.
      await at(s, "Eat before hungry");
      await leader(s, "n", "l");
      await s.status("LENS");
      await s.see("source · lines 30–35");
      await unsaid(s);
    },
  },
  {
    name: "lens-typing",
    options: BREVET,
    take: async (s) => {
      // The lens on the food paragraph, as lens-open has it; `4 j` (its counters' column says so) to the paragraph's
      // last line, `shift+a` at its end, and a new paragraph typed under it: the lens grown by two lines.
      await at(s, "Eat before hungry");
      await leader(s, "n", "l");
      await s.status("LENS");
      await s.keys("4", "j");
      await s.status(/L34:/);
      await s.keys("shift+a");
      await s.status("INSERT");
      await s.keys("enter", "enter");
      await s.type("Next time: a second bottle cage for the long stretch after 171 km.");
      await s.see("editing · lines 30–37");
      await unsaid(s);
    },
  },
];
