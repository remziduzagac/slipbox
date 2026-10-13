// Reading: rendering, content, data files, footnotes, hostile names, the code view, themes, glyphs, pictures (by
// what's sent), start, info, privacy, trust (TT-T3).

import type { Check, LeftOut } from "../check.ts";

export const READING: Check[] = [
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
];

export const LEFT_OUT_READING: LeftOut = {};
