import type { Check } from "../check.ts";

export const PALETTE: Check[] = [
  // --- the palette ----------------------------------------------------------------------------
  {
    area: "navigating",
    name: "palette: : and ctrl+shift+p list the commands; :e opens a note",
    covers: { cases: ["palette"], commands: ["palette.open"] },
    run: async (s) => {
      await s.keys(":");
      await s.see("Commands");
      await s.keys("escape");
      // No leader key (D274): the palette finds nothing, so it isn't find's.
      await s.keys("ctrl+shift+p");
      await s.see("Commands");
      await s.keys("escape");
      await s.ex("e partners-and-names");
      await s.status("partners-and-names.md");
    },
  },
];
