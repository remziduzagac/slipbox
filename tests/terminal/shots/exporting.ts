// docs/guides/exporting.md: the Save As window.

import { HOME, leader, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "exporting-save-as",
    options: HOME("notes/research/route-cost-models.md"),
    take: async (s) => {
      await s.status("route-cost-models.md");
      await leader(s, "n", "o");
      await s.see("Word (.docx)");
      await s.keys("enter");
      await s.see("Name: route-cost-models.docx");
    },
  },
];
