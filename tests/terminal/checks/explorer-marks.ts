// The explorer view following its folder, and row marks explaining indexing and access.

import { utimesSync } from "node:fs";
import { join } from "node:path";
import { type Check, explorerOpen, explorerRow, leader, opened } from "../check.ts";
import { CheckFailed } from "../session.ts";
import { crumbs, lastMessage, listed } from "../support/links.ts";
import { markOf, rowEnd, symlinkOnce, UNWALKED } from "../support/vaults.ts";

// --- the view ---------------------------------------------------------------------------------------------------

const VIEW: Check[] = [
  {
    area: "navigating",
    name: "view: its folder renamed in slipbox, the view and the breadcrumb go along; deleted, the view falls back to the nearest folder there, said",
    covers: { cases: ["explorer", "rename", "trash"], commands: ["folder.rename", "folder.delete"] },
    options: { open: "logs/observing-log-2026.md" },
    run: async (s) => {
      await explorerOpen(s);
      await explorerRow(s, "logs");
      await s.keys("z");
      await s.until(() => / logs ›$/.test(crumbs(s)), 3000, "z: the view at logs");
      // space d r: the open note's folder, the view's own, renamed after its preview.
      await s.keys("escape");
      await leader(s, "d", "r");
      await s.see("rename logs/ to:");
      await s.keys("ctrl+u");
      await s.type("journal");
      await s.keys("enter");
      await s.see(/logs\/ → journal\/: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.until(() => s.exists("journal/observing-log-2026.md"), 5000, "logs renamed journal");
      await s.until(() => / journal ›$/.test(crumbs(s)), 3000, "the view gone along to journal");
      await s.until(() => listed(s, /\sobserving-log-2026\.md$/), 3000, "journal's notes in the view");
      // space d d: deleted (to the trash) — the view on the nearest folder still there, the vault's top, said.
      await leader(s, "d", "d");
      await s.see("Delete journal/ and everything in it?");
      await s.keys("y");
      await s.until(() => !s.exists("journal"), 5000, "journal deleted");
      await s.until(() => / vault ›$/.test(crumbs(s)), 3000, "the view on the vault's top");
      const said = await lastMessage(s, "isn't there any more");
      s.expect(
        said === `${join(s.vault, "journal")} isn't there any more: the view is on ${s.vault}`,
        `the view's move said: ${said}`,
      );
    },
  },
];

// --- marks ------------------------------------------------------------------------------------------------------

const MARKED: Check[] = [
  {
    area: "navigating",
    name: "marks: at a row's right — indexed ●, being indexed ◐, left out ⊘, can't read ⚿, a link out not followed saying where, a broken one ⚠",
    covers: { cases: ["explorer", "vault", "index", "links/state"] },
    options: {
      home: true,
      startAt: "home",
      config: `${UNWALKED}\n[ui]\nsidebar_width = 60\n`,
      setup: (s) => {
        // A link in notes whose target isn't there.
        symlinkOnce(join(s.dir, "gone", "old-scan.md"), s.path("~/notes/research/old-scan.md"));
        // notes indexed, its index on the disk.
        const r = s.cliIn("~/notes", "index", "--refresh");
        if (r.code !== 0) throw new CheckFailed(`slipbox index --refresh in ~/notes: exit ${r.code}\n${r.out}`);
        // Home's top, built a moment ago, dated back, as a person's is: new to the watcher, it would be looked at
        // again (homeFolders says why).
        const before = new Date(Date.now() - 3_600_000);
        utimesSync(s.home, before, before);
      },
    },
    run: async (s) => {
      await s.where("~");
      await explorerOpen(s);
      // Downloads selected (a row of what home leaves out: no menu over any row's marks). A vault with its index on
      // the disk, indexed; a folder of home before home's walk, being indexed; Downloads, left out.
      await explorerRow(s, "Downloads");
      await s.until(() => markOf(s, "notes") === "●", 5000, "notes, indexed: ●");
      await s.until(() => markOf(s, "household") === "◐", 3000, "household, home's walk to come: ◐");
      await s.until(() => markOf(s, "Downloads") === "⊘", 3000, "Downloads, left out: ⊘");
      // notes unfolded in place, a level at a time: a note you may not read; in research, a link out of notes not
      // followed, saying where it leads; a link leading nowhere.
      await explorerRow(s, "notes");
      await s.keys("l");
      await s.until(() => markOf(s, "locked.md") === "⚿", 3000, "locked.md, unreadable: ⚿");
      await explorerRow(s, "research");
      await s.keys("l");
      await s.until(
        () => {
          const r = rowEnd(s, "outside.md");
          return !!r && /^→ \S*hosts {2}not followed$/.test(r.describe) && r.mark === "⊘";
        },
        3000,
        "outside.md: → /etc/hosts  not followed, ⊘",
      );
      await s.until(
        () => {
          const r = rowEnd(s, "old-scan.md");
          return r?.describe === "→ nowhere" && r.mark === "⚠";
        },
        3000,
        "old-scan.md: → nowhere, ⚠",
      );
    },
  },
  {
    area: "navigating",
    name: "busy folders: node_modules with no note at its top — listed ⊘, the folders in it too, unfolded or zoomed into; nothing in it found by search",
    covers: { cases: ["explorer", "search", "index"], commands: ["search.open"] },
    options: {
      home: true,
      startAt: "home/notes/fruit.md",
      setup: (s) => {
        if (s.exists("~/notes/fruit.md")) return;
        s.write("~/notes/fruit.md", "# Fruit\n\nA mangosteen from the market.\n");
        s.write("~/notes/node_modules/dep/README.md", "# Dep\n\nA mangosteen, packed with the dependency.\n");
        s.write("~/notes/node_modules/dep/lib/util.md", "# Util\n");
      },
    },
    run: async (s) => {
      await explorerOpen(s);
      await s.until(() => markOf(s, "node_modules") === "⊘", 5000, "node_modules: ⊘");
      // Unfolded, a level at a time: what's in it, ⊘ too.
      await explorerRow(s, "node_modules");
      await s.keys("l");
      await s.until(() => markOf(s, "dep") === "⊘", 3000, "dep, in node_modules: ⊘");
      await explorerRow(s, "dep");
      await s.keys("l");
      await s.until(() => markOf(s, "lib") === "⊘", 3000, "lib, two down: ⊘");
      // Zoomed into: the same.
      await explorerRow(s, "node_modules");
      await s.keys("z");
      await s.until(() => / notes › node_modules ›$/.test(crumbs(s)), 3000, "z: the view at node_modules");
      await s.until(() => markOf(s, "dep") === "⊘" && markOf(s, "lib") === "⊘", 3000, "dep and lib, zoomed into: ⊘");
      await s.keys("escape");
      // Search finds the vault's note, and nothing in node_modules.
      await leader(s, "f", "s");
      await s.see("search here — words");
      await s.type("mangosteen");
      await s.see(/"mangosteen" — 1 file\b/, 20_000);
      await s.see("fruit.md:3");
      s.expect(s.rowOf("node_modules/dep/README.md") < 0, "nothing in node_modules found");
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "busy names: a notes folder called build, a note at its top and not git-ignored — a folder like any, indexed ●, found by search",
    covers: { cases: ["explorer", "search", "index"], commands: ["search.open"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      setup: (s) => {
        if (!s.exists("~/notes/build/plan.md"))
          s.write("~/notes/build/plan.md", "# Build plan\n\nMarjoram by the door, then the shelves.\n");
      },
    },
    run: async (s) => {
      await explorerOpen(s);
      await s.keys("escape"); // the keys back to the note: no menu over a row's marks
      await s.until(() => markOf(s, "build") === "●", 20_000, "build, indexed: ●");
      await leader(s, "f", "s");
      await s.see("search here — words");
      await s.type("marjoram");
      await s.see(/"marjoram" — 1 file\b/, 20_000);
      await s.see("build/plan.md:3");
      await s.keys("enter");
      await opened(s, "build/plan.md");
    },
  },
  {
    area: "navigating",
    name: "marks: the cursor on a ⊘ row, the status line says why — generated, git-ignored, walk.exclude; moved off, nothing; Info says it of the file open",
    covers: { cases: ["explorer", "index", "status", "info"], commands: ["note.info"] },
    // kestrel, a repository: node_modules and tmp in its .gitignore, vendor and docs/generated in its walk.exclude. Info
    // wide enough for its reason whole.
    options: { home: true, startAt: "home/work/kestrel/README.md", config: "[ui]\noutline_width = 60\n" },
    run: async (s) => {
      const why = (reason: string) => `⊘ not indexed: ${reason}`;
      await explorerOpen(s);
      // Busy (no note at its top) and git-ignored, both said; git-ignored alone; left out by walk.exclude.
      await explorerRow(s, "node_modules");
      await s.status(why("generated (node_modules), git-ignored"));
      await explorerRow(s, "tmp");
      await s.status(why("git-ignored"));
      await explorerRow(s, "vendor");
      await s.status(why("walk.exclude"));
      // A row that's indexed: nothing said; nor once the explorer has given up the keys.
      await explorerRow(s, "docs");
      await s.until(() => !s.statusLine().includes("not indexed"), undefined, "nothing said on docs, indexed");
      await explorerRow(s, "vendor");
      await s.status(why("walk.exclude"));
      await s.keys("escape");
      await s.until(() => !s.statusLine().includes("not indexed"), undefined, "nothing said, the note given the keys");
      // A file open where walk.exclude leaves it out — opened from the explorer, as :e doesn't open what the walk
      // leaves out: Info's index row, its folder's reason.
      await explorerOpen(s);
      await explorerRow(s, "docs");
      await s.keys("l");
      await explorerRow(s, "generated");
      await s.keys("l");
      await explorerRow(s, "api.md");
      await s.keys("enter");
      await opened(s, "docs/generated/api.md");
      await leader(s, "n", "i");
      await s.status("INFO");
      await s.see(/index +not indexed: walk\.exclude/);
    },
  },
  {
    area: "editing",
    name: "walk.exclude: n on its ⊘ row makes a note there, created and saved said not indexed; a busy folder's row still refused",
    covers: { cases: ["new-note", "save", "explorer", "index"], commands: ["note.save"] },
    // kestrel: docs/generated in its walk.exclude; node_modules busy, no note at its top.
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      const note = "~/work/kestrel/docs/generated/changes.md";
      await explorerOpen(s);
      // A busy folder's row: no new note there, said why.
      await explorerRow(s, "node_modules");
      await s.keys("n");
      await s.message("a folder this vault doesn't index");
      s.expect(!s.text().includes("new note in"), "nothing asked for node_modules");
      // A row walk.exclude leaves out: its folder, by your own setting — the note made there.
      await explorerRow(s, "docs");
      await s.keys("l");
      await explorerRow(s, "generated");
      await s.status("⊘ not indexed: walk.exclude");
      await s.keys("n");
      await s.see("new note in docs/generated/");
      await s.type("changes");
      await s.keys("enter");
      await s.status("INSERT");
      await s.type("Regenerated by hand.");
      await s.keys("escape");
      await s.ex("w");
      await s.file(
        note,
        (t) => t.startsWith("# changes") && t.includes("Regenerated by hand."),
        "the note saved there",
      );
      // Each write's message says it isn't indexed.
      const made = await lastMessage(s, "created changes.md");
      s.expect(made === "created docs/generated/changes.md (not indexed: walk.exclude)", `created: ${made}`);
      const saved = await lastMessage(s, "saved changes.md");
      s.expect(saved === "saved docs/generated/changes.md (not indexed: walk.exclude)", `saved: ${saved}`);
    },
  },
  {
    area: "navigating",
    name: "hidden files: shift+h lists .github and the rest ⊘, said hidden, .git never; a workflow opened is indexed; shift+h again hides the rest",
    covers: { cases: ["explorer", "index", "status"], commands: ["explorer.toggle_hidden"] },
    // kestrel, a repository: .github/workflows/ci.yml, .vscode, .env.example and the like at its top.
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      await explorerOpen(s);
      await explorerRow(s, "docs");
      s.expect(rowEnd(s, ".github") === null && rowEnd(s, "docs") !== null, "no hidden name listed at first");
      await s.keys("shift+h");
      await s.message("explorer: hidden files shown");
      await s.until(() => markOf(s, ".github") === "⊘" && markOf(s, ".vscode") === "⊘", 3000, ".github, .vscode: ⊘");
      s.expect(rowEnd(s, ".git") === null, ".git never listed");
      // The cursor on one: why it isn't indexed.
      await explorerRow(s, "github");
      await s.status("⊘ not indexed: hidden");
      // A workflow, opened from its row: the vault's from then on, its row indexed.
      await s.keys("l");
      await explorerRow(s, "workflows");
      await s.keys("l");
      await explorerRow(s, "ci.yml");
      await s.keys("enter");
      await opened(s, ".github/workflows/ci.yml");
      await s.until(() => markOf(s, "ci.yml") === "●", 3000, "ci.yml, indexed: ●");
      // Hidden again: said, gone — but .github, which holds a file of the vault's now, as a reached one's folder is.
      await explorerOpen(s);
      await s.keys("shift+h");
      await s.message("explorer: hidden files not shown");
      await s.until(
        () => rowEnd(s, ".vscode") === null && rowEnd(s, "docs") !== null && markOf(s, ".github") === "●",
        3000,
        ".vscode gone, .github the vault's: ●",
      );
    },
  },
];

export const EXPLORER_MARKS: Check[] = [...VIEW, ...MARKED];
