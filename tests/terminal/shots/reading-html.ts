import { HOME, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "reading-html",
    options: { ...HOME("notes/research/document-html.md"), config: '[render]\nimages = "never"\n' },
    take: async (s) => {
      await s.see("Bold words");
      await s.see("More about HTML");
      await s.notSee("<picture>");
    },
  },
];
