import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Check } from "../check.ts";

export const NEW_FILE: Check[] = [
  {
    area: "editing",
    name: "opening a new file: type and save makes missing parents and the note (#168)",
    covers: { commands: ["note.save"], cases: ["opening", "new-note", "save"] },
    options: { open: "new-folder/2027/coffee.md" },
    run: async (s) => {
      const path = join(s.vault, "new-folder/2027/coffee.md");
      await s.see("new-folder/2027/coffee.md [new]");
      s.expect(!existsSync(join(s.vault, "new-folder")), "no folder made before save");
      await s.keys("i", "i"); // the first opens the lens, the second starts typing
      await s.status("INSERT");
      await s.type("Coffee for the morning.");
      await s.keys("escape", "ctrl+s");
      await s.until(() => existsSync(path), undefined, "first save to make the file");
      s.expect(s.read("new-folder/2027/coffee.md") === "Coffee for the morning.", "typed text saved");
      await s.see("saved new-folder/2027/coffee.md");
      await s.until(() => !s.screen().some((r) => r.includes("[new]")), undefined, "new mark to clear");
    },
  },
  {
    area: "editing",
    name: "opening a new file: explicit open and quit untouched makes nothing (#168)",
    covers: { cases: ["opening", "new-note"] },
    options: { open: "unwritten/deep/plan", args: ["open"] },
    run: async (s) => {
      await s.see("unwritten/deep/plan.md [new]");
      await s.ex("q");
      await s.until(() => s.exited(), undefined, "untouched note to quit without a question");
      s.expect(!existsSync(join(s.vault, "unwritten")), "untouched file and its parents weren't made");
    },
  },
];
