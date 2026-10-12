// Links as the 21.x design reads them, on the reference set: paths inside — `/` from the nearest root,
// paths without an extension, folders — and wikilinks within their root, whatever form a folder's tool
// writes them in.

import { readFileSync, writeFileSync } from "node:fs";
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
      await s.restart({
        args: ["--root", `${s.home}/work/product`],
        startAt: "home/work/product/handbook/how-we-write.md",
      });
      await s.status(/handbook.*how-we-write\.md/);
      // A link to a folder: the explorer, there, the folder unfolded.
      await s.restart({ args: [], startAt: "home/notes/research/link-styles.md" });
      await follow(s, "the projects");
      await s.status("FILES");
      await s.until(
        () => {
          const rows = s.screen();
          const at = rows.findIndex((r) => /\bprojects\b/.test(r) && !/the projects/.test(r));
          return at >= 0 && rows.slice(at + 1, at + 12).some((r) => r.includes("kestrel-v2-3.md"));
        },
        3000,
        "projects/ unfolded in the explorer, its notes under it",
      );
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
      s.expect(
        s.clipboard().endsWith("/cooking/attachments/dal.png"),
        "attachments/dal.png's path copied, not Archive's",
      );
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
      s.expect(
        zk.out.includes("links     markdown links, relative, without .md — zk's .zk/config.toml"),
        `zk's convention, from info:\n${zk.out}`,
      );
      const design = JSON.parse(s.cliIn("~/work/product/design", "info", "--json").out).data.links;
      s.expect(
        design.style.value === "markdown" &&
          design.style.why === "[links] in .slipbox/config.toml" &&
          design.extension.why === "Obsidian's .obsidian/app.json",
        `the design folder's: ${JSON.stringify(design)}`,
      );
      // Your own setting, saved while slipbox runs: taken at once, over Obsidian's — a markdown link is a path.
      const config = `${s.dir}/config/slipbox/config.toml`;
      s.write(config, `${s.read(config)}\n[links]\nstyle = "markdown"\n`);
      await s.see(/writes +markdown \(setting\)/, 6000);
      await s.see(/path +relative \(ours\)/);
      await s.see(/\.md +kept \(Obsidian\)/);
      await s.notSee(/writes +wikilinks/);
    },
  },
  {
    name: "world/links: links written as each root writes them — the picker, [[ completed, slipbox link for an agent (21.5)",
    options: { home: true, startAt: "home/hobbies/cooking/Home.md" },
    run: async (s) => {
      // The picker, reading: after the word under the cursor, a wikilink by name — Obsidian's way.
      await s.keys("/");
      await s.type("shelves in");
      await s.keys("enter", "escape");
      await leader(s, "l", "i");
      await s.see("Link to…");
      await s.type("Shaksh");
      await s.keys("enter");
      await s.file(
        "~/hobbies/cooking/Home.md",
        (t) => t.includes("More on the shelves [[Shakshuka]] in [[Pantry]]."),
        "the picked link after the word, by name",
      );
      await s.message("linked Recipes/Weeknight/Shakshuka.md");
      // [[ completed in source mode: the other Notes, by its path — the name is this folder's own.
      await leader(s, "n", "v");
      await s.keys("shift+g", "o");
      for (const k of ["[", "[", ..."Recipes/No"]) await s.keys(k);
      await s.see(/Recipes\/Notes +Recipes\/Notes\.md/);
      await s.keys("tab", "]", "]", "escape", "ctrl+s");
      await s.file(
        "~/hobbies/cooking/Home.md",
        (t) => t.trimEnd().endsWith("[[Recipes/Notes]]"),
        "the completed wikilink, by its path",
      );
      // An agent asks how to link from zk's notebook: no extension, from the note.
      const zk = s.cliIn(
        "~/hobbies/cycling",
        "link",
        "gear/202608201000-bike-fit.md",
        "--from",
        "rides/202609131900-300k-brevet.md",
      );
      s.expect(zk.out === "[Bike fit](../gear/202608201000-bike-fit)\n", `zk's link: ${zk.out}`);
    },
  },
  {
    name: "world/links: named folders — a second copy of notes asks once which links open; a repository named by its remote (21.6)",
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      // The backup in Downloads is a copy of notes (one .slipbox/ id): opened, it asks which copy links open.
      await s.restart({ startAt: "home/Downloads/notes-backup-2026-07/index.md" });
      await s.see("notes: 2 copies on this machine — which do links to it open?");
      await s.see("links open it now"); // ~/notes: the first found
      await s.keys("enter");
      await s.message("links to notes open ~/notes");
      const info = s.cliIn("~/Downloads/notes-backup-2026-07", "info");
      s.expect(info.out.includes("name      notes — 2 copies, links open ~/notes"), `info:\n${info.out}`);
      // Asked once: opened again, not asked.
      await s.restart({ startAt: "home/Downloads/notes-backup-2026-07/index.md" });
      await s.notSee("which do links to it open?", 1500);
      // The product repository, no .slipbox/ name: named by its remote, its qualified name kept.
      const product = JSON.parse(s.cliIn("~/work/product", "info", "--json").out).data.folder;
      s.expect(
        product?.name === "product" && product.remote === "github.com/kestrel-labs/product",
        `product's name: ${JSON.stringify(product)}`,
      );
      // A folder with only Obsidian's marker: unnamed, linked by relative path.
      const cooking = s.cliIn("~/hobbies/cooking", "info");
      s.expect(cooking.out.includes("name      none — no remote and no .slipbox/ name"), `cooking:\n${cooking.out}`);
    },
  },
  {
    name: "world/links: named folders — space v shift+v picks which copy a folder's links open, :folders-default again; info says which (21.6)",
    options: {
      home: true,
      startAt: "home/notes/index.md",
      // Both copies of notes known here (an agent's ls in each), links opening ~/notes: nothing asked at the start.
      setup: (s) => {
        s.cliIn("~/notes", "ls");
        s.cliIn("~/Downloads/notes-backup-2026-07", "ls");
        const r = s.cliIn("~/notes", "folders", "default", "notes", s.path("~/notes"));
        if (r.out !== "links to notes open ~/notes\n") throw new Error(`folders default: ${r.code} ${r.out}`);
      },
    },
    run: async (s) => {
      const marked = () => s.screen().find((r) => r.includes("links open it")) ?? "";
      const info = () => s.cliIn("~/notes", "info").out;
      await leader(s, "v", "shift+v");
      await s.see("notes: which copy do links open?");
      await s.until(
        () => marked().includes("~/notes") && !marked().includes("backup"),
        3000,
        "~/notes marked as the copy links open",
      );
      await s.see("~/Downloads/notes-backup-2026-07");
      await s.keys("down", "enter");
      await s.message("links to notes open"); // the path wraps on
      await s.notSee("which copy do links open?");
      s.expect(
        info().includes("name      notes — 2 copies, links open ~/Downloads/notes-backup-2026-07"),
        `info:\n${info()}`,
      );
      // Again by its command: the backup marked now; ~/notes picked back.
      await s.ex("folders-default");
      await s.see("notes: which copy do links open?");
      await s.until(() => marked().includes("notes-backup-2026-07"), 3000, "the backup marked as the copy links open");
      await s.keys("up", "enter");
      await s.notSee("which copy do links open?");
      s.expect(info().includes("name      notes — 2 copies, links open ~/notes\n"), `info:\n${info()}`);
    },
  },
  {
    name: "world/links: slipbox:// pointers — another named folder's note, once it's on this machine; an agent's branch, its worktree (21.7)",
    options: { home: true, startAt: "home/hobbies/cycling/rides/202608301800-kyoto-river-loop.md" },
    run: async (s) => {
      // photography hasn't been opened here yet: said so, nothing made.
      await follow(s, "Kyoto notes");
      await s.message("photography isn't on this machine yet");
      // Opened once (an agent's ls): in the lookup, and the pointer leads there.
      s.cliIn("~/hobbies/photography", "ls");
      await follow(s, "Kyoto notes");
      await s.status(/photography/);
      await s.see("Kyoto"); // the trip's index, in the photography folder
      // kestrel's sync doc: Sam's notes (the notes folder), and the agent's copy on its branch — its worktree.
      s.cliIn("~/notes", "ls");
      await s.restart({ startAt: "home/work/kestrel/docs/sync.md" });
      await follow(s, "his notes");
      await s.status(/notes/);
      await opened(s, "projects/sync-rewrite.md");
      await s.restart({ startAt: "home/work/kestrel/docs/sync.md" });
      await s.keys("/");
      await s.type("is at");
      await s.keys("enter", "escape", "tab", "enter");
      await s.status(/sync-retry/);
      await opened(s, "docs/sync.md");
    },
  },
  {
    name: "world/links: where a file is — a root by its name, an unnamed one by its path; :folders goes into one; a loose file's folder beside (21.9, 21.10)",
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      await s.status(/ notes[ ·]/); // named by its .slipbox/
      s.cliIn("~/hobbies/photography", "ls"); // known here
      await leader(s, "v", "v");
      await s.see(/Folders \(\d+\)/);
      await s.type("photography");
      await s.keys("enter");
      await s.message(" photography — "); // as the switch says it: name — path
      await s.status(/ photography[ ·]/);
      // An Obsidian vault with no .slipbox/ name and no remote: its path, from home.
      writeFileSync(
        s.path("~/hobbies/cooking/stray-link.md"),
        `# Stray link\n\n[the stray note](${s.path("~/Downloads/stray-note.md")})\n`,
      );
      await s.restart({ startAt: "home/hobbies/cooking/stray-link.md" });
      await s.status(/ ~\/hobbies\/cooking /);
      // A loose file a link leads to opens beside the root: its folder among the explorer's roots while it's shown.
      await follow(s, "the stray note");
      await s.status(/stray-note\.md/);
      await s.keys("ctrl+e");
      await s.see("~/Downloads");
      await s.keys("escape", "ctrl+o"); // back: the loose file no longer shown
      await s.keys("ctrl+e");
      await s.notSee("~/Downloads", 1500);
    },
  },
  {
    name: "world/links: naming a folder — :name gives the cooking vault a name its pointer finds; the vault words are gone (21.10, 21.12)",
    options: { home: true, startAt: "home/hobbies/cooking/Home.md" },
    run: async (s) => {
      await s.ex("name cooking");
      await s.message("is named cooking (.slipbox/"); // the box wraps the rest
      await s.status(/ cooking /);
      s.expect(
        readFileSync(s.path("~/hobbies/cooking/.slipbox/config.toml"), "utf8").includes('name = "cooking"'),
        "the name written into .slipbox/",
      );
      const r = JSON.parse(s.cliIn("~/notes", "resolve", "slipbox://cooking/Home.md", "--json").out).data;
      s.expect(r.status === "resolved" && r.name === "cooking", `the pointer: ${JSON.stringify(r)}`);
      s.expect(s.cliIn("~/notes", "vaults").code === 2, "slipbox vaults is gone");
      s.expect(s.cliIn("~/notes", "vault-moved").code === 2, "slipbox vault-moved is gone");
      const info = JSON.parse(s.cliIn("~/hobbies/cooking", "info", "--json").out).data;
      s.expect(
        info.name === "cooking" && info.vault === undefined && info.instance === undefined,
        `info: ${JSON.stringify({ name: info.name, vault: info.vault })}`,
      );
    },
  },
];
