// Vault switch choices with unsaved notes, the question going into another vault asks, and the destination list.

import { type Check, leader } from "../check.ts";
import { PEEK_HINT } from "../support/links.ts";

export const VAULTS: Check[] = [
  {
    area: "links-and-files",
    name: "vault switch choices: stay keeps edits, discard goes; vault list includes destinations",
    covers: {
      cases: ["vault", "editing"],
      commands: ["vault.open", "vault.switch_stay", "vault.switch_discard", "vault.switch_save"],
    },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      await s.status("index.md");
      await s.keys("ctrl+k", "i");
      await s.type("probe ");
      await s.keys("escape", ":");
      await s.type(`e ${s.path("~/work/kestrel/README.md")}`);
      await s.keys("enter");
      await s.see("Unsaved notes — change vault?");
      await s.see("Save all and go");
      await s.see("Discard and go");
      await s.keys("c");
      await s.status("unsaved");
      await s.keys(":");
      await s.type(`e ${s.path("~/work/kestrel/README.md")}`);
      await s.keys("enter");
      await s.see("Unsaved notes — change vault?");
      await s.keys("d");
      await s.status("README.md");
      await leader(s, "v", "v");
      await s.see("Vaults — enter goes into one; / filters");
      await s.keys("escape", "ctrl+k", "i");
      await s.type("saved ");
      await s.keys("escape");
      await s.ex(`e ${s.path("~/notes/index.md")}`);
      await s.see("Unsaved notes — change vault?");
      await s.keys("s");
      await s.status("index.md");
      s.expect(s.read("~/work/kestrel/README.md").includes("saved "), "save all wrote before switching");
    },
  },
  {
    area: "links-and-files",
    name: "going into another vault asks first (D270): Stay keeps you here, Peek reads its note here, Go goes",
    covers: { cases: ["vault"], commands: ["vault.switch_go", "vault.switch_peek"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      await s.status("index.md");
      const ask = async () => {
        await s.ex(`e ${s.path("~/work/kestrel/README.md")}`);
        await s.see("Go into kestrel? Your tabs there replace these");
        await s.see("Peek at README.md: read it here, read-only");
      };
      await ask();
      await s.keys("c");
      await s.notSee("Go into kestrel?");
      await s.where(/^notes(?: │|$)/, /index\.md/);
      await ask();
      await s.keys("p");
      await s.see(PEEK_HINT, 5000);
      await s.see("kestrel › README.md");
      await s.where(/^notes(?: │|$)/);
      await s.keys("escape");
      await ask();
      await s.keys("g");
      await s.where(/^kestrel(?: │|$)/, /README\.md/, 5000);
    },
  },
];
