// Elsewhere: its own tabs, and notes looked at or followed through links.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Check, downloadsElsewhere, open, opened } from "../check.ts";
import { sleep } from "../session.ts";
import { lastMessage } from "../support/links.ts";
import { symlinkOnce, tab } from "../support/vaults.ts";

// --- Elsewhere --------------------------------------------------------------------------------------------------

export const ELSEWHERE: Check[] = [
  {
    area: "links-and-files",
    name: "Elsewhere: gone into from a vault, its own tabs; back with ctrl+o, the vault's tabs as they were",
    covers: { cases: ["vault", "tabs", "links/travel"], commands: ["tab.new", "note.open", "history.back"] },
    options: { home: true, startAt: "home/notes/index.md", setup: downloadsElsewhere },
    run: async (s) => {
      // notes: two tabs. (Not inbox.md: notes' config makes it its scratch, shown as `scratch`.)
      await s.where(/^notes(?: │|$)/, /index\.md/);
      await s.keys("ctrl+t", "c");
      await s.see(tab(2, "index.md"));
      await open(s, "sync-rewrite");
      await opened(s, "projects/sync-rewrite.md");
      await s.see(tab(2, "sync-rewrite.md"));
      // A file outside home and every vault, chosen: into Elsewhere (VV-D3, VV-D4), its tabs, none of notes'.
      await s.ex(`e ${join(s.dir, "elsewhere", "stray-note.md")}`);
      await s.where("Elsewhere", /stray-note\.md/, 5000);
      await s.notSee(tab("\\d", "sync-rewrite.md"));
      await s.notSee(tab("\\d", "index.md"));
      // Back: notes, its two tabs, at the note left.
      await s.keys("ctrl+o");
      await opened(s, "projects/sync-rewrite.md");
      await s.where(/^notes(?: │|$)/);
      await s.see(tab(1, "index.md"));
      await s.see(tab(2, "sync-rewrite.md"));
      await s.notSee(tab("\\d", "stray-note.md"));
    },
  },
  {
    area: "links-and-files",
    name: "Elsewhere: a note just looked at through a link, the link forgotten, then followed — the same window writable",
    covers: { cases: ["vault", "links/state"], commands: ["note.open", "vault.links"] },
    options: {
      startAt: "tmp/plain/a.md",
      setup: (s) => {
        const plain = join(s.dir, "tmp", "plain");
        if (existsSync(join(plain, "a.md"))) return;
        mkdirSync(join(s.dir, "tmp", "out"), { recursive: true });
        writeFileSync(join(s.dir, "tmp", "out", "far.md"), "# Far\n\nKept out of the way.\n");
        mkdirSync(plain, { recursive: true });
        writeFileSync(join(plain, "a.md"), "# A\n");
        symlinkOnce(join(s.dir, "tmp", "out"), join(plain, "data"));
      },
    },
    run: async (s) => {
      const far = join(s.dir, "tmp", "plain", "data", "far.md");
      await s.where("Elsewhere");
      // l: just looked at — read-only.
      await s.ex(`e ${far}`);
      await s.see("Just look", 5000);
      await s.keys("l");
      await s.see("Kept out of the way.");
      await s.keys("i");
      // Read whole from the list: a long path wraps its box.
      s.expect((await lastMessage(s, "not editing")).endsWith("— not editing"), "i refused: read-only");
      // Forgotten, opened again, followed: the same window takes typing.
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      await s.ex(`e ${far}`);
      await s.see("Just look", 5000);
      await s.keys("f");
      await s.message("following", 5000);
      await s.keys("i");
      await s.until(
        () => /^(?: SOURCE │ INSERT| READ·LENS │ (?:NORMAL|INSERT))\b/.test(s.statusLine()),
        3000,
        "i to edit: writable now",
      );
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "Elsewhere: a note looked at through a link, forgotten, changed by an agent, then followed — read again at once, typing goes into theirs",
    covers: { cases: ["vault", "links/state", "reload"], commands: ["note.open", "vault.links"] },
    options: {
      startAt: "tmp/plain-agent/a.md",
      setup: (s) => {
        const plain = join(s.dir, "tmp", "plain-agent");
        if (existsSync(join(plain, "a.md"))) return;
        mkdirSync(join(s.dir, "tmp", "out-agent"), { recursive: true });
        writeFileSync(join(s.dir, "tmp", "out-agent", "far.md"), "# Far\n\nKept out of the way.\n");
        mkdirSync(plain, { recursive: true });
        writeFileSync(join(plain, "a.md"), "# A\n");
        symlinkOnce(join(s.dir, "tmp", "out-agent"), join(plain, "data"));
      },
    },
    run: async (s) => {
      const far = join(s.dir, "tmp", "plain-agent", "data", "far.md");
      await s.where("Elsewhere");
      await s.ex(`e ${far}`);
      await s.see("Just look", 5000);
      await s.keys("l");
      await s.see("Kept out of the way.");
      // Forgotten: nothing reads it through the link, an agent's change to it unread.
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      writeFileSync(join(s.dir, "tmp", "out-agent", "far.md"), "# Far\n\nRewritten by an agent.\n");
      await sleep(1500);
      await s.see("Kept out of the way.");
      // Followed, typed into at once: read again as it's followed, so what's typed goes into theirs — no conflict.
      await s.ex(`e ${far}`);
      await s.see("Just look", 5000);
      await s.keys("f");
      await s.message("following", 5000);
      await s.keys("i");
      await s.until(
        () => /^(?: SOURCE │ INSERT| READ·LENS │ (?:NORMAL|INSERT))\b/.test(s.statusLine()),
        3000,
        "i to edit: writable now",
      );
      await s.type("Z");
      await s.keys("escape");
      await sleep(1500);
      await s.see("Rewritten by an agent.");
      s.expect(
        !s.screen().some((r) => r.includes("changed on disk") && !r.includes("reloaded")),
        "no conflict: nothing typed into what was no longer there",
      );
    },
  },
  {
    area: "links-and-files",
    name: "Elsewhere: a link followed, its note typed into, forgotten, changed by an agent, followed again — yours kept, asked which to keep",
    covers: { cases: ["vault", "links/state", "reload"], commands: ["note.open", "vault.links"] },
    options: {
      startAt: "tmp/plain-typed/a.md",
      // Never autosaved meanwhile: what's typed stays unsaved.
      config: "[editor]\nautosave_ms = 600000\n",
      setup: (s) => {
        const plain = join(s.dir, "tmp", "plain-typed");
        if (existsSync(join(plain, "a.md"))) return;
        mkdirSync(join(s.dir, "tmp", "out-typed"), { recursive: true });
        writeFileSync(join(s.dir, "tmp", "out-typed", "far.md"), "# Far\n\nKept out of the way.\n");
        mkdirSync(plain, { recursive: true });
        writeFileSync(join(plain, "a.md"), "# A\n");
        symlinkOnce(join(s.dir, "tmp", "out-typed"), join(plain, "data"));
      },
    },
    run: async (s) => {
      const far = join(s.dir, "tmp", "plain-typed", "data", "far.md");
      await s.where("Elsewhere");
      await s.ex(`e ${far}`);
      await s.see("Just look", 5000);
      await s.keys("f");
      await s.message("following", 5000);
      // Typed on a new line at its end: the lens, then typing in it.
      await s.keys("G", "o");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.type("Typed.");
      await s.keys("escape");
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      writeFileSync(join(s.dir, "tmp", "out-typed", "far.md"), "# Far\n\nRewritten by an agent.\n");
      // Followed again: what you typed kept, and which to keep asked.
      await s.ex(`e ${far}`);
      await s.see("Just look", 5000);
      await s.keys("f");
      // Its title cut short by the long path: the prompt by its choices.
      await s.see("(k) Keep yours", 5000);
      await s.see("Typed.");
      await s.keys("escape");
    },
  },
];
