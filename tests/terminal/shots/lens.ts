// docs/guides/lens.md: the tour's Coffee note read, in the lens, typed in, and beside its whole source; Inbox in
// source mode beside its rendered self.

import type { Session } from "../session.ts";
import { GUIDE, type Shot } from "../shot.ts";

const COFFEE = { ...GUIDE, startAt: "home/slipbox-tour/ideas/coffee.md" };

/** Two windows on one note need the width: no explorer. */
const SPLIT = { config: "[ui]\nsidebar = false\n" };

/** The cursor on the line holding `text`, the find row closed. */
async function at(s: Session, text: string): Promise<void> {
  await s.keys("ctrl+f");
  await s.type(text);
  await s.keys("enter", "escape");
}

/** What the lens said as it opened, gone: the page under it in the picture, not the message. */
const unsaid = (s: Session) => s.notSee("the lens: the markdown", 8000);

/** The lens opened on Brewing's sentence: its section as Markdown, Beans still rendered under it. */
async function lensOnBrewing(s: Session): Promise<void> {
  await s.status("coffee.md");
  await at(s, "A ratio of 1 to 16");
  await s.keys("i");
  await s.status("LENS");
  await s.see("source · lines");
}

export const SHOTS: Shot[] = [
  {
    name: "reading-editing-views",
    options: { ...COFFEE, ...SPLIT },
    take: async (s) => {
      // The right window in source mode, the left with the lens open: the note's three views at once.
      await s.status("coffee.md");
      await s.keys("ctrl+w", "v");
      await s.keys("ctrl+k");
      await s.status("SOURCE");
      await s.keys("ctrl+w", "w");
      await lensOnBrewing(s);
      await unsaid(s);
    },
  },
  {
    name: "lens-open",
    options: COFFEE,
    take: async (s) => {
      await lensOnBrewing(s);
      await unsaid(s);
    },
  },
  {
    name: "lens-typing",
    options: COFFEE,
    take: async (s) => {
      // As the guide has it: to the sentence's end, `a`, a sentence added; not saved.
      await lensOnBrewing(s);
      await s.keys("end", "a");
      await s.status("INSERT");
      await s.type(" Try a little finer tomorrow.");
      await s.see("editing · lines");
      await unsaid(s);
    },
  },
  {
    name: "reading-editing-source",
    options: { ...GUIDE, startAt: "home/slipbox-tour/inbox.md", ...SPLIT },
    take: async (s) => {
      // Both windows on the link's line; the second shows the whole file's Markdown, the first the rendered page.
      await s.status("inbox.md");
      await at(s, "Ideas so far");
      await s.keys("ctrl+w", "v");
      await s.keys("ctrl+k");
      await s.status("SOURCE");
      await s.notSee("the note's markdown", 8000);
    },
  },
];
