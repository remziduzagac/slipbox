import { rmSync, writeFileSync } from "node:fs";
import { type Check, leader } from "../check.ts";
import { sleep } from "../session.ts";
import { messagesSaying } from "../support/links.ts";
import { KENJI, typedAtEnd } from "../support/outside-and-code.ts";

export const SAVING: Check[] = [
  {
    area: "outside-and-code",
    name: "autosave: an idle note written — never mid-insert, never while git holds its index lock",
    covers: { cases: ["autosave"] },
    // A note of the product team's repository.
    options: { home: true, startAt: "home/work/product/roadmap/q4.md", config: "[editor]\nautosave_ms = 400\n" },
    run: async (s) => {
      const NOTE = "~/work/product/roadmap/q4.md";
      await typedAtEnd(s, "Autosaved line.");
      await s.file(NOTE, (t) => t.includes("Autosaved line."), "the idle note autosaved");
      // Mid-insert: a while with no key, still nothing written; esc, and it is.
      await s.keys("o");
      await s.type("Still typing.");
      await sleep(1500);
      s.expect(!s.read(NOTE).includes("Still typing."), "nothing autosaved mid-insert");
      await s.keys("escape");
      await s.file(NOTE, (t) => t.includes("Still typing."), "autosaved after esc");
      // git mid-commit: it waits for the lock to go.
      const lock = s.path("~/work/product/.git/index.lock");
      writeFileSync(lock, "");
      await s.keys("o");
      await s.type("Under the lock.");
      await s.keys("escape");
      await sleep(1500);
      s.expect(!s.read(NOTE).includes("Under the lock."), "nothing autosaved while git holds index.lock");
      await s.status("• unsaved");
      rmSync(lock);
      await s.file(NOTE, (t) => t.includes("Under the lock."), "autosaved once git let go");
    },
  },
  {
    area: "outside-and-code",
    name: "index: space v r while git holds its index lock — an open note git changed is read again once git lets go, once",
    covers: { cases: ["index", "reload"], commands: ["vault.reindex"] },
    // Not watching: only the reindex reads the note again.
    options: { home: true, startAt: "home/work/product/roadmap/q4.md", config: "[watch]\nenabled = false\n" },
    run: async (s) => {
      const NOTE = "~/work/product/roadmap/q4.md";
      await s.status("q4.md");
      // git mid-checkout: the note rewritten under its lock, then a reindex.
      const lock = s.path("~/work/product/.git/index.lock");
      writeFileSync(lock, "");
      writeFileSync(s.path(NOTE), `${s.read(NOTE)}\nA line git wrote.\n`);
      await leader(s, "v", "r");
      await s.message(/reindexed \d+ notes/, 5000);
      await s.keys("shift+g");
      await sleep(1500);
      s.expect(!s.screen().some((r) => r.includes("A line git wrote.")), "not read again while git holds index.lock");
      rmSync(lock);
      await s.message(/q4\.md changed on disk — reloaded/, 5000);
      await s.keys("shift+g");
      await s.see("A line git wrote.", 5000);
      const said = await messagesSaying(s, "q4.md changed", /q4\.md changed on disk — reloaded/);
      s.expect(said === 1, `read again once (${said} times)`);
    },
  },
  {
    area: "outside-and-code",
    name: "hand-off: an editor that changes the note — your unsaved edit saved first, its change shown after, nothing unsaved",
    covers: { cases: ["reload"], commands: ["note.edit"] },
    // Not watching: what shows after is the hand-off's own reload, not the watcher's.
    options: {
      open: KENJI,
      config: `[watch]\nenabled = false\n\n[editor]\ncommand = ${JSON.stringify("sh -c 'echo Added in the editor. >> \"$0\"' {file}")}\n`,
    },
    run: async (s) => {
      await s.see("second desk by the window");
      await typedAtEnd(s, "- Typed before the hand-off.");
      await s.status("• unsaved");
      await leader(s, "n", "e");
      await s.see("Added in the editor.", 5000);
      s.expect(
        s.read(KENJI).includes("- Typed before the hand-off.\nAdded in the editor."),
        "the edit saved before the editor appended to it",
      );
      await s.see("Typed before the hand-off.");
      await s.until(
        () => !s.statusLine().includes("unsaved"),
        3000,
        "nothing unsaved: the file's text is the buffer's",
      );
    },
  },
];
