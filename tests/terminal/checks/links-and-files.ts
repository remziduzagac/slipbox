// Links, roots and nested roots, vaults, converting links, rename, the trash, files, git (TT-T6).

import { type Check, follow, type LeftOut, leader, opened } from "../check.ts";

export const LINKS_AND_FILES: Check[] = [
  {
    area: "links-and-files",
    name: "links: zk's links without an extension followed; a rename keeps them so (21.2)",
    covers: { cases: ["links/conventions", "rename"], commands: ["note.rename", "history.back"] },
    options: { home: true, startAt: "home/hobbies/cycling/202608151900-index.md" },
    run: async (s) => {
      // `[300 km brevet](rides/202609131900-300k-brevet)`: the note with `.md`, as zk means it.
      await follow(s, "300 km brevet");
      await opened(s, "rides/202609131900-300k-brevet.md");
      // Renamed here: the index's link follows it, still without its extension.
      await leader(s, "n", "m");
      await s.see("rename or move");
      await s.keys("ctrl+u");
      await s.type("rides/202609131900-brevet-300k");
      await s.keys("enter");
      await s.see(/→ rides\/202609131900-brevet-300k\.md: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.file(
        "~/hobbies/cycling/202608151900-index.md",
        (t) => t.includes("[300 km brevet](rides/202609131900-brevet-300k)"),
        "the link renamed, no extension",
      );
      s.expect(
        !s.read("~/hobbies/cycling/202608151900-index.md").includes("202609131900-300k-brevet"),
        "no link left to the old name",
      );
      // Back on the index, the renamed link is followed as before.
      await s.keys("ctrl+o");
      await opened(s, "202608151900-index.md");
      await follow(s, "300 km brevet");
      await opened(s, "rides/202609131900-brevet-300k.md");
    },
  },
];

export const LEFT_OUT_LINKS_AND_FILES: LeftOut = {};
