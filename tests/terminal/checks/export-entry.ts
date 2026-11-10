import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Check, leader } from "../check.ts";
import { format, HOLD, hold } from "../support/export.ts";

export const EXPORT_ENTRY: Check[] = [
  {
    area: "outside-and-code",
    name: "background work: a real export cancelled through its list releases its task",
    covers: { cases: ["ui"], commands: ["background.open", "background.cancel", "note.export"] },
    options: { ...HOLD, env: { ...HOLD.env, EXPORT_HOLD_AT: "before-publication" } },
    run: async (s) => {
      // The vault's own index pass over first: a slow runner still has it going, a second task counted.
      await s.until(() => / 0 /.test(s.topBar()), 15000, "the vault's index pass over");
      await format(s, "home.md", "html");
      await s.keys("enter");
      await s.until(() => hold(s) === "waiting", 15000, "export held before publication");
      await s.until(() => / 1 /.test(s.topBar()), 5000, "busy count shown without a spinner");
      await leader(s, "b");
      await s.see("Background work");
      await s.see("Restart");
      await s.see("Stop");
      await s.keys("enter");
      writeFileSync(join(s.dir, "hold-go"), "");
      await s.message("export cancelled", 15000);
      await s.see("Recent");
      await s.see("stopped");
      await s.keys("d");
      await s.keys("escape");
      await s.until(() => / 0 /.test(s.topBar()), 5000, "the stopped task no longer counted");
    },
  },
  {
    area: "outside-and-code",
    name: "Info export: x and the Export row run the existing note export",
    covers: { cases: ["info"], commands: ["file.info", "note.export"] },
    run: async (s) => {
      await leader(s, "f", "i");
      await s.status("INFO");
      await s.keys("x");
      await s.see("Export home.md as");
      await s.see("Word (.docx)");
      await s.keys("escape");
      await leader(s, "f", "i");
      await s.keys("shift+g", "enter");
      await s.see("Export home.md as");
    },
  },
];
