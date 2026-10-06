// Links as the 21.x design reads them, on the reference set: paths inside — `/` from the nearest root,
// paths without an extension, folders — whatever form a folder's tool writes them in.

import { leader, type Scenario } from "./helpers.ts";
import type { Session } from "./session.ts";

/** The status line naming `path` as the file open — not the link under the cursor (`→ /x.md`). */
async function opened(s: Session, path: string | RegExp): Promise<void> {
  const p = typeof path === "string" ? path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : path.source;
  await s.status(new RegExp(`\\s${p}(\\s|$)`));
}

/** Follow the link whose text shows `text`: found, the find row closed, enter. */
async function follow(s: Session, text: string): Promise<void> {
  await s.keys("/");
  await s.type(text);
  await s.keys("enter", "escape", "enter");
}

export const LINK_SCENARIOS: Scenario[] = [
  {
    name: "world/links: zk's links without an extension followed; a rename keeps them so (21.2)",
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
      await s.file("~/hobbies/cycling/202608151900-index.md", (t) => t.includes("[300 km brevet](rides/202609131900-brevet-300k)"), "the link renamed, no extension");
      s.expect(!s.read("~/hobbies/cycling/202608151900-index.md").includes("202609131900-300k-brevet"), "no link left to the old name");
      // Back on the index, the renamed link is followed as before.
      await s.keys("ctrl+o");
      await opened(s, "202608151900-index.md");
      await follow(s, "300 km brevet");
      await opened(s, "rides/202609131900-brevet-300k.md");
    },
  },
  {
    name: "world/links: / from the nearest root — a repository's, a folder nested in it; a folder link revealed; --root starts there (21.2)",
    options: { home: true, startAt: "home/work/product/README.md" },
    run: async (s) => {
      // The repository's root: `/prd/route-sharing.md` from product's top.
      await follow(s, "route sharing");
      await opened(s, "prd/route-sharing.md");
      // The handbook is a root of its own inside the repository: its `/glossary.md` is its own.
      await s.restart({ startAt: "home/work/product/handbook/how-we-write.md" });
      await s.status(/handbook.*how-we-write\.md/);
      await follow(s, "the glossary");
      await s.status(/handbook/);
      await opened(s, "glossary.md");
      // Started with --root at the repository, a note of the handbook is still the handbook's.
      await s.restart({ args: ["--root", `${s.home}/work/product`], startAt: "home/work/product/handbook/how-we-write.md" });
      await s.status(/handbook.*how-we-write\.md/);
      // A link to a folder: the explorer, there, the folder unfolded.
      await s.restart({ args: [], startAt: "home/notes/research/link-styles.md" });
      await follow(s, "the projects");
      await s.status("FILES");
      await s.until(() => {
        const rows = s.screen();
        const at = rows.findIndex((r) => /\bprojects\b/.test(r) && !/the projects/.test(r));
        return at >= 0 && rows.slice(at + 1, at + 12).some((r) => r.includes("kestrel-v2-3.md"));
      }, 3000, "projects/ unfolded in the explorer, its notes under it");
    },
  },
];
