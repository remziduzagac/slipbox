// Links as the 21.x design reads them, on the reference set: paths inside — `/` from the nearest root,
// paths without an extension, folders — and wikilinks within their root, whatever form a folder's tool
// writes them in.

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
  {
    name: "world/links: an Obsidian vault's wikilinks, read within it — names, aliases, headings, blocks, ties; no root, no names (21.3)",
    options: { home: true, startAt: "home/hobbies/cooking/Home.md" },
    run: async (s) => {
      // Pictures by name, as Obsidian sizes them (`|300`, `|240x180`): shown by their names.
      await s.see("maqluba-flip.jpg");
      s.expect(!s.screen().some((r) => /\b(300|240x180)$/.test(r.trimEnd())), "a picture's size isn't its text");
      // `[[Meal plan|this week]]`: by its name, shown by its alias (the heading's words come first).
      await follow(s, "this week. Monday");
      await opened(s, "Meal plan.md");
      await s.keys("ctrl+o");
      await opened(s, "Home.md");
      // `[[Maqluba]]`: no note by that name; مقلوبة.md's front matter has it as an alias, said so.
      await follow(s, "Maqluba when");
      await s.message(/\[\[Maqluba\]\] reached Recipes\/Family/); // "…by an alias", wrapped on
      await s.see("Malik's family maqluba");
      await s.keys("ctrl+o");
      await opened(s, "Home.md");
      // `[[Notes]]`: two notes of that name — the one in the same folder.
      await follow(s, "Notes: the one");
      await opened(s, "Notes.md");
      s.expect(!/Recipes/.test(s.statusLine()), "the same folder's Notes.md, not Recipes/'s");
      await s.keys("ctrl+o");
      await opened(s, "Home.md");
      // `![[dal.png|300]]`: two pictures of that name — the shorter path's, as Obsidian picks; its path copied.
      await follow(s, "dal.png");
      await s.message("attachment attachments/dal.png");
      s.expect(s.clipboard().endsWith("/cooking/attachments/dal.png"), "attachments/dal.png's path copied, not Archive's");
      // A third, in a new folder as near as attachments/, put there while slipbox runs: a real tie, asked which.
      s.write("~/hobbies/cooking/photos/dal.png", "png");
      for (let i = 0; i < 20 && !s.screen().some((r) => r.includes("[[dal.png]] matches 3 files")); i++) {
        await s.keys("enter"); // the link under the cursor, followed again once the watcher has the new file
        await s.settle(300);
      }
      await s.see("[[dal.png]] matches 3 files");
      await s.see("photos/dal.png");
      await s.keys("escape");
      // `[[Home#Pantry]]` from deep in Recipes: the heading, by its name.
      await s.restart({ startAt: "home/hobbies/cooking/Recipes/Baking/Sourdough/Starter/Feeding log.md" });
      await follow(s, "Home › Pantry");
      await opened(s, "Home.md");
      await s.status(/L36:/);
      // `[[Dal#^tadka]]`: the step its ^id closes.
      await s.restart({ startAt: "home/hobbies/cooking/Recipes/Weeknight/Dal.md" });
      await follow(s, "Dal ^tadka");
      await s.status(/L3[23]:/);
      // Downloads has no root: a name finds nothing, and the hint says what makes one.
      await s.restart({ startAt: "home/Downloads/stray-note.md" });
      await s.see("See plan for the order of work");
      await follow(s, "plan for the order");
      await s.message(/\[\[plan\]\]: names need a root/);
    },
  },
  {
    name: "world/links: each root's convention and what said it — Obsidian's, zk's, a folder's own; yours, saved while running (21.4)",
    options: { home: true, startAt: "home/hobbies/cooking/Home.md" },
    run: async (s) => {
      // The cooking vault's, in the Info view: Obsidian's settings say all three.
      await leader(s, "n", "i");
      await s.see(/writes +wikilinks/);
      await s.see(/path +by name/);
      await s.see(/\.md +dropped/);
      await s.see(/from +Obsidian/);
      // zk's notebook, and the design folder whose own config says markdown over Obsidian's wikilinks, as an agent asks.
      const zk = s.cliIn("~/hobbies/cycling", "info");
      s.expect(zk.out.includes("links     markdown links, relative, without .md — zk's .zk/config.toml"), `zk's convention, from info:\n${zk.out}`);
      const design = JSON.parse(s.cliIn("~/work/product/design", "info", "--json").out).data.links;
      s.expect(design.style.value === "markdown" && design.style.why === "[links] in .slipbox/config.toml" && design.extension.why === "Obsidian's .obsidian/app.json", `the design folder's: ${JSON.stringify(design)}`);
      // Your own setting, saved while slipbox runs: taken at once, over Obsidian's — a markdown link is a path.
      const config = `${s.dir}/config/slipbox/config.toml`;
      s.write(config, `${s.read(config)}\n[links]\nstyle = "markdown"\n`);
      await s.see(/writes +markdown \(setting\)/, 6000);
      await s.see(/path +relative \(ours\)/);
      await s.see(/\.md +kept \(Obsidian\)/);
      await s.notSee(/writes +wikilinks/);
    },
  },
];
