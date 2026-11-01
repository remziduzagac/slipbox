import { type Check, leader } from "../check.ts";

export const PALETTE: Check[] = [
  // --- the palette ----------------------------------------------------------------------------
  {
    area: "navigating",
    name: "palette: : and space f p list the commands; :e opens a note",
    covers: { cases: ["palette"], commands: ["palette.open"] },
    run: async (s) => {
      await s.keys(":");
      await s.see("Commands");
      await s.keys("escape");
      await leader(s, "f", "p");
      await s.see("Commands");
      await s.keys("escape");
      await s.ex("e partners-and-names");
      await s.status("partners-and-names.md");
    },
  },
];
