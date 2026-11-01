// Links followed, listed and completed in each root's convention (TT-T6).

import { type Check, downloadsElsewhere, follow, type LeftOut, leader, moveTo, open, opened, pos } from "../check.ts";
import { git, lastMessage, linkHere, toLink } from "../support/links.ts";

export const LINKS: Check[] = [
  {
    area: "links-and-files",
    name: "links: next and previous, follow, back and forward; alt+arrows move by word, not through history",
    covers: {
      cases: ["links"],
      commands: ["link.next", "link.prev", "link.follow", "history.back", "history.forward", "history.list"],
    },
    run: async (s) => {
      // tab and shift+tab: from link to link; enter follows the one under the cursor.
      await s.keys("tab", "tab", "shift+tab");
      await s.until(() => linkHere(s) === "about-this-vault.md", 3000, "tab, tab, shift+tab: back on the first link");
      await s.keys("enter");
      await opened(s, "about-this-vault.md");
      await s.keys("ctrl+o"); // back
      await opened(s, "home.md");
      await leader(s, "h", "n"); // forward
      await opened(s, "about-this-vault.md");
      await leader(s, "h", "p");
      await opened(s, "home.md");
      await leader(s, "h", "h");
      await s.see("History");
      await s.keys("escape");
      // alt+right and alt+left (a Mac's option+arrows), and alt+f and alt+b (what its terminals send for them): a
      // word forward and back, on the same note — history is ctrl+o and space h.
      await s.keys("g", "g");
      const at = pos(s);
      await moveTo(s, ["alt+right"], (l, c) => l === at.line && c > at.col, "alt+right: a word on");
      const word = pos(s).col;
      await moveTo(s, ["alt+f"], (l, c) => l === at.line && c > word, "alt+f: another word on");
      await moveTo(s, ["alt+b"], (l, c) => l === at.line && c === word, "alt+b: a word back");
      await moveTo(s, ["alt+left"], (l, c) => l === at.line && c === at.col, "alt+left: back to the start");
      await opened(s, "home.md");
      // space l n and space l p: the next link and back; space l f follows it.
      await s.keys("tab");
      await s.until(() => linkHere(s) !== "", 3000, "the cursor on a link");
      const first = linkHere(s);
      await leader(s, "l", "n");
      await s.until(() => linkHere(s) !== "" && linkHere(s) !== first, 3000, "space l n onto the next link");
      await leader(s, "l", "p");
      await s.until(() => linkHere(s) === first, 3000, "space l p back onto the first");
      await leader(s, "l", "f");
      await opened(s, first);
    },
  },
  {
    area: "links-and-files",
    name: "links: the lists — this note's links and its backlinks; enter goes to one",
    covers: { cases: ["links", "links/backlinks"], commands: ["links.open", "backlinks.open"] },
    options: { open: "people/kenji-mori.md" },
    run: async (s) => {
      await leader(s, "l", "l");
      await s.see("Links from");
      await s.keys("escape");
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.see("partners-and-names.md");
      await s.type("partners");
      await s.keys("enter");
      await opened(s, "people/partners-and-names.md");
    },
  },
  {
    area: "links-and-files",
    name: "links: followed into a split, and into a tab of its own — a data file beside a note, by its extension",
    covers: { cases: ["links", "multiple-roots"], commands: ["link.follow_split", "link.follow_tab"] },
    run: async (s) => {
      await s.keys("tab");
      await leader(s, "l", "s");
      await s.until(() => s.text().split("§ ").length - 1 === 2, 3000, "the link open in a split");
      // The split has focus: only it is left.
      await s.keys("ctrl+w", "o");
      await opened(s, "about-this-vault.md");
      // ctrl+enter: a tab of its own, as a browser's ctrl+click; the tabs name each file with its extension.
      await open(s, "pipeline-cookbook");
      await toLink(s, "halley/halley.toml");
      await s.keys("ctrl+enter");
      await opened(s, "software/halley/halley.toml");
      await s.see(/ 1 pipeline-cookbook\.md × │ 2 halley\.toml × │/);
    },
  },
  {
    area: "links-and-files",
    name: "links: a picture followed, linked or embedded — its path copied, said so, no later phase promised (A17)",
    covers: { cases: ["links/forms"], commands: ["link.follow"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      const SAID = "attachment attachments/whiteboard-2026-08-26.png — path copied";
      await follow(s, "whiteboard from the design review");
      await s.message("attachment attachments/whiteboard-2026-08-26.png");
      await s.until(
        () => s.clipboard().endsWith("/notes/attachments/whiteboard-2026-08-26.png"),
        3000,
        "the picture's path copied",
      );
      await opened(s, "index.md");
      // The message whole: nothing after "path copied" (it promised pictures "in a later phase").
      const said = await lastMessage(s, "attachment");
      s.expect(said === SAID, `the message: ${said}`);
      // Embedded, in the design review's note: the same (the first box gone, so it's the embed's that says it).
      await s.notSee("attachment attachments/whiteboard-2026-08-26.png", 8000);
      await open(s, "2026-08-26-route-sharing-design-review");
      await follow(s, "Whiteboard with three");
      await s.message("attachment attachments/whiteboard-2026-08-26.png");
      await opened(s, "meetings/2026-08-26-route-sharing-design-review.md");
      const again = await lastMessage(s, "attachment");
      s.expect(again === SAID, `the embed's message: ${again}`);
    },
  },
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
  {
    area: "links-and-files",
    name: "links: / from the nearest root — a repository's, a root nested in it; a folder link revealed; --root starts there (21.2)",
    covers: { cases: ["links/forms", "links/roots"] },
    options: { home: true, startAt: "home/work/product/README.md" },
    run: async (s) => {
      // The repository's root: `/prd/route-sharing.md` from product's top.
      await follow(s, "route sharing");
      await opened(s, "prd/route-sharing.md");
      // The handbook is a vault of its own inside the repository: its `/glossary.md` is its own.
      await s.restart({ startAt: "home/work/product/handbook/how-we-write.md" });
      await s.where(/^handbook(?: │|$)/, /how-we-write\.md/);
      await follow(s, "the glossary");
      await s.where(/^handbook(?: │|$)/);
      await opened(s, "glossary.md");
      // Started with --root at the repository, a note of the handbook is still the handbook's.
      await s.restart({
        args: ["--root", `${s.home}/work/product`],
        startAt: "home/work/product/handbook/how-we-write.md",
      });
      await s.where(/^handbook(?: │|$)/, /how-we-write\.md/);
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
    area: "links-and-files",
    name: "links: one target by every form — relative, from the root, without .md, from ~, by pointer and old name, a wikilink, a block",
    covers: {
      cases: ["links/forms", "links/fragments", "links/misc", "links/named-folders"],
      commands: ["link.follow"],
    },
    options: { home: true, startAt: "home/notes/research/link-styles.md" },
    run: async (s) => {
      // "The same target by every form": each reaches projects/kestrel-v2-3.md, the block one at its paragraph.
      for (const [text, more] of [
        ["relative, the form", null],
        ["root, the GitHub way: from", null],
        ["zk writes it: extensionless", null],
        ["home folder: home-relative", null],
        ["folder's name: pointer", null],
        ["before August: old name", null],
        ["A wikilink: kestrel-v2-3", null],
        ["id: the decision", /L(?!1:)\d+:/],
      ] as const) {
        await s.keys("g", "g");
        await follow(s, text);
        await opened(s, "projects/kestrel-v2-3.md");
        if (more) await s.status(more);
        await s.keys("ctrl+o");
        await opened(s, "research/link-styles.md");
      }
      // A file URL is followed, not copied as a URL: the file it names read in a peek, Elsewhere's (VV-D7, VV-D3).
      await toLink(s, "file:///etc/hosts");
      await s.keys("enter");
      await s.see("Elsewhere › /etc/hosts", 5000);
      await s.status(/ ‹ \S*\/etc\/hosts › /);
      await s.keys("escape");
      await opened(s, "research/link-styles.md");
      // The same, broken: a note that isn't there is offered to be made, its name filled in; esc, nothing written.
      await toLink(s, "../projects/kestrel-v2-33.md");
      await s.keys("enter");
      await s.see("new note in projects/");
      await s.see("› kestrel-v2-33");
      await s.keys("escape");
      await opened(s, "research/link-styles.md");
      s.expect(!s.exists("~/notes/projects/kestrel-v2-33.md"), "nothing made");
      // In source mode, each written as the file has it.
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.see("[from the root](/projects/kestrel-v2-3.md)");
      await s.see("[[kestrel-v2-3]]");
    },
  },
  {
    area: "links-and-files",
    name: "links: in data and code files — a config's include and $schema followed, a broken one said; a note's link into a code line and a data table",
    covers: { cases: ["links-data", "mixed-roots", "fragments"], commands: ["link.follow"] },
    options: { home: true, startAt: "home/work/kestrel/config/app.toml" },
    run: async (s) => {
      // A reference key is a link even when it reaches nothing: said so.
      await toLink(s, "./missing-schema.json");
      await s.keys("enter");
      await s.message("broken link");
      await opened(s, "config/app.toml");
      // The chain kestrel.toml → app.toml → base.yaml → schema.json, followed by its values.
      await toLink(s, /^(\.\/)?base\.yaml$/);
      await s.keys("enter");
      await opened(s, "config/base.yaml");
      await toLink(s, /^(\.\/)?schema\.json$/);
      await s.keys("enter");
      await opened(s, "config/schema.json");
      // A value that only looks like a path, reaching nothing, is no link at all.
      await s.keys("ctrl+o");
      await opened(s, "config/base.yaml");
      await s.keys("g", "g");
      for (let i = 0; i < 12; i++) {
        await s.keys("tab");
        s.expect(!linkHere(s).includes("missing.yaml"), "./missing.yaml isn't a link");
      }
      // From a note, into a code file's line and a data file's table: each at its place.
      await s.restart({ startAt: "home/notes/projects/sync-rewrite.md" });
      await toLink(s, "../../work/kestrel/config/app.toml#sync");
      await s.keys("enter");
      await opened(s, "config/app.toml");
      await s.status(/L11:/);
      await s.restart({ startAt: "home/notes/daily/2026-09-22.md" });
      await follow(s, "sync.py line 94");
      await opened(s, "api/kestrel_api/sync.py");
      await s.status(/L94:/);
    },
  },
  {
    area: "links-and-files",
    name: "links: an Obsidian vault's wikilinks, read within it — names, aliases, headings, blocks, ties; no root, no names (21.3)",
    covers: { cases: ["links/wikilinks", "links/fragments"] },
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
        await s.settle(undefined, 300);
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
      // In Elsewhere (Downloads, copied beside home): a name finds nothing, and says why — no vault to look in.
      await s.restart({ startAt: "elsewhere/stray-note.md", setup: downloadsElsewhere });
      await s.see("See plan for the order of work");
      await follow(s, "plan for the order");
      await s.message(/\[\[plan\]\]: a wikilink is read within a vault/);
    },
  },
  {
    area: "links-and-files",
    name: "links: each root's convention and what said it — Obsidian's, zk's, a folder's own; yours, saved while running (21.4)",
    covers: { cases: ["links/conventions", "links/state"], commands: ["note.info"] },
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
    area: "links-and-files",
    name: "links: written as each root writes them — the picker, [[ completed, slipbox link for an agent (21.5)",
    covers: { cases: ["links/conventions", "links"], commands: ["link.insert", "view.source", "note.save"] },
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
    area: "links-and-files",
    name: "links: a target's completion kept while it's typed — hidden past a match, keys as with no popup, back on a backspace; an indent keeps it, a paste closes it; . repeats a completed one (20.13)",
    covers: { cases: ["links"], commands: ["view.source", "note.save"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      const inbox = /inbox\.md +~\/notes\/inbox\.md/;
      await leader(s, "n", "v");
      await s.keys("shift+g", "o");
      // A markdown link's target: the list as it's typed.
      for (const k of "[x](inb") await s.keys(k);
      await s.see(inbox);
      // Past any match it shows nothing, and tab is the editor's again: the line indented.
      await s.keys("z", "z");
      await s.notSee(inbox);
      const before = pos(s).col;
      await s.keys("tab");
      await s.until(() => pos(s).col > before, 3000, "the line indented");
      // Back to a match: the list again, its target moved by the indent.
      await s.keys("backspace", "backspace");
      await s.see(inbox);
      // A wikilink's the same; its target ended, it closes.
      await s.keys("escape", "o");
      for (const k of "[[inb") await s.keys(k);
      const wiki = /inbox +inbox\.md/;
      await s.see(wiki);
      await s.keys("q", "q");
      await s.notSee(wiki);
      await s.keys("backspace", "backspace");
      await s.see(wiki);
      await s.keys("]");
      await s.notSee(wiki);
      // A paste while the list shows: the list closed, and tab never takes back what was pasted.
      await s.keys("escape", "o");
      for (const k of "[x](inb") await s.keys(k);
      await s.see(inbox);
      await s.paste(") and more");
      await s.notSee(inbox);
      await s.keys("tab");
      await s.see("[x](inb) and more");
      // A paste into a target whose list was closed: none opened, and enter is a new line.
      await s.keys("escape", "o");
      for (const k of "[x](") await s.keys(k);
      await s.keys("ctrl+e");
      await s.paste("inbo");
      await s.keys("enter");
      // `.` after a link completed and a line more: the same again, the item, then the line.
      await s.keys("escape", "o");
      for (const k of "[[inb") await s.keys(k);
      await s.see(wiki);
      await s.keys("tab", "enter", "x", "escape", ".", "ctrl+s");
      await s.file(
        "~/notes/index.md",
        // The lines after the indent above are indented as it is.
        (t) => t.includes("[x](inbo\n") && /\[\[inbox\n\s*x\n\s*\[\[inbox\n\s*x(\n|$)/.test(t),
        "the paste kept as pasted, and the completed link repeated as typed",
      );
    },
  },
  {
    area: "links-and-files",
    name: "links: a target's completion narrowed key by key — among the last key's matches, back on a backspace, a capital past a match, more matches than shown (20.13)",
    covers: { cases: ["links"], commands: ["view.source"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      // More notes matching `t` than a list shows, and one that ranks after them all: made here, the one exception to
      // the samples in these checks, as the reference set holds fewer files than a list shows.
      setup: (s) => {
        for (let i = 0; i < 600; i++) s.write(`~/notes/tt/t${String(i).padStart(3, "0")}.md`, "# T\n");
        s.write("~/notes/tt/tquokka.md", "# Quokka\n");
      },
    },
    run: async (s) => {
      const inbox = /inbox\.md +~\/notes\/inbox\.md/;
      const interviews = /research\/user-interviews-2026-08\.md +~\/notes\/research/;
      await leader(s, "n", "v");
      await s.keys("shift+g", "o");
      // `in`, a long list; `inbox`, inbox alone; back to `in`, the long list again.
      for (const k of "[x](in") await s.keys(k);
      await s.see(inbox);
      await s.see(interviews);
      for (const k of "box") await s.keys(k);
      await s.see(inbox);
      await s.notSee(interviews);
      await s.keys("backspace", "backspace", "backspace");
      await s.see(interviews);
      // A capital matches as typed: past a match nothing, and back.
      await s.keys("escape", "o");
      for (const k of "[x](SKILL") await s.keys(k);
      // The popup cuts a long path short.
      const skill = "research/agent-skills/draft-checklist/S";
      await s.see(skill);
      await s.keys("z", "Z");
      await s.notSee(skill);
      await s.keys("backspace", "backspace");
      await s.see(skill);
      // More match `t` than are shown, tquokka not among them: `q` finds it among every match of `t`.
      await s.keys("escape", "o");
      for (const k of "[[tq") await s.keys(k);
      await s.see(/tquokka +tt\/tquokka\.md/);
    },
  },
  {
    area: "links-and-files",
    name: "links: each target its own completion — another line's, another on the same line, after a paste, the next link's: a vault indexed since offered (20.13)",
    covers: { cases: ["links"], commands: ["view.source"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      // A vault of the set indexed while a list is kept: its notes offered only by a list made since.
      const indexed = (vault: string) => {
        const r = s.cliIn(vault, "index", "--refresh");
        s.expect(r.code === 0, `${vault} indexed: ${r.out}`);
      };
      await leader(s, "n", "v");
      await s.keys("shift+g", "o");
      // Another line's target, the cursor gone there from a list kept: its own list, made then.
      for (const k of "[b](shaksh") await s.keys(k);
      await s.keys("escape", "o");
      for (const k of "[a](zzzzzz") await s.keys(k);
      indexed("~/hobbies/cooking");
      await s.keys("up");
      await s.see("~/hobbies/cooking/Recipes/Weeknight/");
      // Another target on the same line, the cursor gone there at a jump: likewise.
      await s.keys("escape", "o");
      for (const k of "[d](bike-fit") await s.keys(k);
      await s.keys("home");
      for (const k of "[c](zz") await s.keys(k);
      indexed("~/hobbies/cycling");
      await s.keys("end");
      await s.see("~/hobbies/cycling/gear/");
      // A paste that leaves the cursor in another target on the line, then a key there: likewise.
      await s.keys("escape", "o");
      for (const k of "[f](zz") await s.keys(k);
      indexed("~/work/product/design");
      await s.paste(") [g](share");
      await s.keys("left");
      await s.see("~/work/product/design/share-flow.md");
      // The link ended, the next one's list made anew.
      await s.keys("escape", "o");
      indexed("~/work/product/handbook");
      for (const k of "[e](glossary") await s.keys(k);
      await s.see("~/work/product/handbook/glossary.md");
    },
  },
  {
    area: "links-and-files",
    name: "links: another vault's note completed as its pointer — each folder by its name, a name two share asked first, a private one said; slipbox link the same (20.13, 21.7)",
    covers: { cases: ["links", "links/conventions", "links/named-folders"], commands: ["view.source", "note.save"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      setup: (s) => {
        // The cooking folder named as the product handbook is: a name two different folders share.
        s.cliIn("~/hobbies/cooking", "init", ".", "--name", "handbook");
        // Cycling named privately: its .slipbox/ kept out of the git it's given here.
        git(s, "~/hobbies/cycling", "init", "-q");
        s.cliIn("~/hobbies/cycling", "init", ".", "--name", "rides", "--private");
        for (const v of ["~/hobbies/photography", "~/work/product/handbook", "~/hobbies/cooking", "~/hobbies/cycling"])
          s.cliIn(v, "index", "--refresh");
      },
    },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.keys("shift+g", "o");
      for (const k of "[x](photography/index") await s.keys(k);
      await s.see("~/hobbies/photography/index.md");
      await s.keys("tab", ")", "space");
      // A name two folders share: asked how it's written, then written as it is.
      for (const k of "[y](handbook/glossary") await s.keys(k);
      await s.see("~/work/product/handbook/glossary.md");
      await s.keys("tab");
      await s.see("handbook: 2 different folders have this name");
      await s.keys("enter");
      await s.see("[y](slipbox://handbook/glossary.md");
      await s.keys(")", "space");
      // A private name: written, and said to work on this machine only.
      for (const k of "[z](cycling/gear/2026082") await s.keys(k);
      await s.see("~/hobbies/cycling/gear/");
      await s.keys("tab");
      await s.message(/rides is a private name/);
      await s.keys(")", "escape", "ctrl+s");
      await s.file(
        "~/notes/index.md",
        (t) =>
          t.includes(
            "[x](slipbox://photography/index.md) [y](slipbox://handbook/glossary.md) [z](slipbox://rides/gear/202608201000-bike-fit.md)",
          ),
        "each folder's note by its pointer",
      );
      // An agent asks the same of the command line.
      const r = s.cliIn("~/notes", "link", s.path("~/hobbies/photography/index.md"), "--from", "index.md");
      s.expect(r.out.includes("slipbox://photography/index.md"), `slipbox link: ${r.out}`);
    },
  },
];

export const LEFT_OUT_LINKS_AND_FILES: LeftOut = {};
