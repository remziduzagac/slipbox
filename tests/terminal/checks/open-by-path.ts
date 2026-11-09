// A file opened by its path (#104): `space f e` asks for one, its folders and files completed as it's typed (read off
// the main thread), and the switcher takes one; either opens the file as `:e` does, another vault's asked first (D270).

import { type Check, goInto, leader, opened } from "../check.ts";

export const OPEN_BY_PATH: Check[] = [
  {
    area: "navigating",
    name: "open by path: space f e completes ~/ folders and files (tab, enter); the switcher takes ./ and ~/",
    covers: { cases: ["switcher"], commands: ["note.open_path", "switcher.open"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      await s.status("index.md");
      await leader(s, "f", "e");
      await s.see("Open by path — tab completes, ~ is home");
      await s.type("~/work/kes");
      await s.see("kestrel/", 5000);
      await s.keys("tab");
      await s.see("› ~/work/kestrel/");
      await s.type("READ");
      await s.see("README.md", 5000);
      await s.keys("enter");
      // Another vault's file: asked first, then gone into.
      await goInto(s);
      await s.where(/^kestrel(?: │|$)/, /README\.md/, 5000);
      // The switcher, given a path from the vault's top: its file opened here, nothing asked.
      await s.keys("ctrl+p");
      await s.type("./CONTRIB");
      await s.see("CONTRIBUTING.md", 5000);
      await s.keys("enter");
      await opened(s, "CONTRIBUTING.md");
      // From home, into another vault: asked; Stay keeps you here.
      await s.keys("ctrl+p");
      await s.type("~/notes/ind");
      await s.see("index.md", 5000);
      await s.keys("enter");
      await s.see("Go into notes?", 5000);
      await s.keys("c");
      await s.notSee("Go into notes?");
      await s.where(/^kestrel(?: │|$)/, /CONTRIBUTING\.md/);
    },
  },
];
