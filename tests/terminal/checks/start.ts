// Start and clean quit.

import type { Check } from "../check.ts";

export const START: Check[] = [
  {
    area: "reading",
    name: "start: the demo vault's home renders; ctrl+q quits cleanly",
    covers: { cases: ["opening"], commands: ["app.quit"] },
    run: async (s) => {
      await s.see("Halden Ridge Observatory");
      await s.status("home.md");
      await s.status(/READ/);
      await s.keys("ctrl+q");
      await s.until(() => s.exited(), 5000, "slipbox to quit");
      s.expect(s.exitCode() === 0, `exit 0, not ${s.exitCode()}`);
    },
  },
  {
    area: "reading",
    name: "start: the first steps' hint shows once, in the keys of the view, till the first key; an unbound key says how to type",
    covers: { cases: ["opening"], commands: ["app.quit"] },
    options: { firstSteps: true },
    run: async (s) => {
      // The first start on this machine: a note open, and the way to begin, as the rendered view has it (`i` twice).
      await s.see("To begin: i i types");
      await s.see("? keys · : commands");
      // Gone at the first key (an unbound one, which says how to type from READ).
      await s.keys("x");
      await s.notSee("To begin:");
      await s.see("x is not bound — type with i i, ? lists keys");
      // From the lens, one `i` types.
      await s.keys("i");
      await s.status(/READ.LENS/);
      await s.keys("&");
      await s.see("& is not bound — type with i, ? lists keys");
      await s.keys("ctrl+q");
      await s.until(() => s.exited(), 5000, "slipbox to quit");
      // Started again on the same machine: never again.
      await s.restart({});
      await s.status("home.md");
      await s.settle(undefined, 1500, 250);
      s.expect(!s.screen().join("\n").includes("To begin:"), "the hint shown again at a second start");
    },
  },
];
