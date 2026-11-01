// Copying, moving, renaming and trashing notes and folders, and converting links (TT-T6).

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { type Check, follow, leader, open, opened } from "../check.ts";

const FILES: Check[] = [
  {
    area: "links-and-files",
    name: "explorer files: r renames, m moves, d deletes and u restores, y p copies — links fixed; a note duplicated and deleted",
    covers: { cases: ["copy-move", "trash", "rename"], commands: ["note.copy", "note.delete", "trash.open"] },
    options: { open: "people/contacts.md" },
    run: async (s) => {
      // The explorer on contacts.md (space E reveals it).
      await leader(s, "E");
      await s.status("FILES");
      // The row's menu (its … button; . by key): the entries with their keys; r there renames.
      await s.keys(".");
      await s.see(/Move to… +m/);
      await s.see(/Delete +d/);
      await s.keys("r");
      await s.see("rename people/contacts.md to:"); // a question in its own window
      await s.see("OK  enter");
      await s.keys("ctrl+u");
      await s.type("people-contacts");
      await s.keys("enter");
      await s.see(/people\/contacts\.md → people\/people-contacts\.md: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("renamed people/contacts.md");
      s.expect(s.exists("people/people-contacts.md") && !s.exists("people/contacts.md"), "renamed on disk");
      s.expect(s.read("home.md").includes("(people/people-contacts.md)"), "home's link follows it");
      // m: to the handbook folder.
      await s.keys("m");
      await s.see("Move people/people-contacts.md to…");
      await s.type("handbook");
      await s.keys("enter");
      await s.see(/→ handbook\/people-contacts\.md/);
      await s.keys("enter");
      await s.file("handbook/people-contacts.md", (t) => t.length > 0, "moved to the handbook");
      // d, then u.
      await s.keys("d");
      await s.see(/Delete handbook\/people-contacts\.md\?/); // a question in its own window: y answers
      await s.see("Yes  y");
      await s.type("y");
      await s.message("deleted handbook/");
      s.expect(!s.exists("handbook/people-contacts.md"), "gone from the vault");
      await s.keys("u");
      await s.message("restored handbook/");
      s.expect(s.exists("handbook/people-contacts.md"), "back");
      // y p: a copy beside it.
      await s.keys("y", "p");
      await s.message("copied handbook/");
      s.expect(s.exists("handbook/people-contacts-copy.md"), "the copy made");
      // The trash is listed, empty now.
      await leader(s, "v", "t");
      await s.message("the trash is empty");
      // The current note: duplicated (the palette), opened; then that copy deleted (space n d).
      await s.keys("escape");
      await s.keys(":");
      await s.type("Duplicate the note");
      await s.keys("enter");
      await s.status("people-contacts-copy-2.md");
      await leader(s, "n", "d");
      await s.see(/Delete handbook\/people-contacts-copy-2\.md\?/);
      await s.type("y");
      await s.message("deleted handbook/");
      s.expect(!s.exists("handbook/people-contacts-copy-2.md"), "the copy deleted");
    },
  },
  {
    area: "links-and-files",
    name: "files: space n — the note moved to a folder, copied and pasted, cut, deleted and restored, duplicated",
    covers: {
      cases: ["copy-move", "trash"],
      commands: ["note.move", "note.yank", "note.cut", "folder.paste", "note.delete", "trash.restore", "note.copy"],
    },
    options: { open: "people/contacts.md" },
    run: async (s) => {
      // space n shift+m: a folder picked from the tree; links fixed after a preview.
      await leader(s, "n", "shift+m");
      await s.see("Move people/contacts.md to…");
      await s.type("handbo");
      await s.keys("enter");
      await s.see(/people\/contacts\.md → handbook\/contacts\.md: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.file("handbook/contacts.md", (t) => t.includes("# Contacts"), "moved into handbook/");
      await opened(s, "handbook/contacts.md");
      s.expect(s.read("home.md").includes("(handbook/contacts.md)"), "home's link follows it");
      // space n y, then space d p: a copy pasted in this note's folder, beside it.
      await leader(s, "n", "y");
      await s.message("copied handbook/contacts.md");
      await leader(s, "d", "p");
      await s.file("handbook/contacts-copy.md", (t) => t.includes("# Contacts"), "a copy beside it");
      // space n x, then space d p where it already is: nothing to move.
      await leader(s, "n", "x");
      await s.message("cut handbook/contacts.md");
      await leader(s, "d", "p");
      await s.message("already in handbook");
      // space n d: to the trash, asked first; space v u: back.
      await leader(s, "n", "d");
      await s.see(/Delete handbook\/contacts\.md\?/);
      await s.type("y");
      await s.message("deleted handbook/contacts.md");
      s.expect(!s.exists("handbook/contacts.md"), "gone to the trash");
      await leader(s, "v", "u");
      await s.message("restored handbook/contacts.md");
      s.expect(s.exists("handbook/contacts.md"), "back");
      // space n shift+y: duplicated beside it, the copy opened.
      await leader(s, "n", "shift+y");
      await opened(s, "handbook/contacts-copy-2.md");
      s.expect(s.exists("handbook/contacts-copy-2.md"), "the duplicate written");
    },
  },
  {
    area: "links-and-files",
    name: "files: space d — this note's folder copied and pasted, renamed, moved, cut, deleted and restored",
    covers: {
      cases: ["copy-move", "trash", "rename"],
      commands: ["folder.yank", "folder.paste", "folder.rename", "folder.move", "folder.cut", "folder.delete"],
    },
    options: { open: "people/contacts.md" },
    run: async (s) => {
      // Copied, then pasted into itself: refused; pasted at the top (home's folder): a copy beside it.
      await leader(s, "d", "y");
      await s.message("copied people/");
      await leader(s, "d", "p");
      await s.message("people can't be copied into itself");
      await open(s, "home");
      await leader(s, "d", "p");
      await s.until(() => s.exists("people-copy/contacts.md"), 3000, "people/ copied beside itself");
      await open(s, "kenji-mori");
      await opened(s, "people/kenji-mori.md");
      // Renamed in place, its links fixed after a preview; the note open follows it.
      await leader(s, "d", "r");
      await s.see("rename people/ to:");
      await s.keys("ctrl+u");
      await s.type("folk");
      await s.keys("enter");
      await s.see(/people\/ → folk\/: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("moved people/ → folk/");
      await opened(s, "folk/kenji-mori.md");
      s.expect(s.read("home.md").includes("(folk/kenji-mori.md)"), "home's link into it follows");
      // Moved into handbook/, picked from the tree.
      await leader(s, "d", "m");
      await s.see("Move folk/ to…");
      await s.type("handbo");
      await s.keys("enter");
      await s.see(/folk\/ → handbook\/folk\/: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("moved folk/ → handbook/folk/");
      await opened(s, "handbook/folk/kenji-mori.md");
      // Cut: said, waiting for a paste.
      await leader(s, "d", "x");
      await s.message("cut handbook/folk/");
      // Deleted, asked first with what breaks; restored.
      await leader(s, "d", "d");
      await s.see(/Delete handbook\/folk\/ and everything in it\?/);
      await s.type("y");
      await s.message("deleted handbook/folk to the trash");
      s.expect(!s.exists("handbook/folk"), "gone to the trash");
      await s.status("deleted on disk");
      await leader(s, "v", "u");
      await s.message("restored handbook/folk");
      s.expect(s.exists("handbook/folk/kenji-mori.md"), "back");
    },
  },
  {
    area: "links-and-files",
    name: "files: space v m gives this note's folder .slipbox/, a root of its own; space v shift+m makes it plain again",
    covers: { cases: ["vault", "links/state"], commands: ["vault.init", "vault.unmake"] },
    options: { open: "people/contacts.md" },
    run: async (s) => {
      const home = s.read("home.md");
      await leader(s, "v", "m");
      await s.see("give people/ its .slipbox/, called (empty: no name):");
      await s.keys("enter");
      await s.see(/people\/ → a vault of its own, called .*: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("made people/ a vault of its own");
      s.expect(s.exists("people/.slipbox/config.toml"), "people/ has its .slipbox/");
      s.expect(s.read("home.md") === home, "home's paths into it as they were");
      // At the top of halden, this root isn't nested: nothing to take away.
      await leader(s, "v", "shift+m");
      await s.message("halden isn't inside another vault");
      // In a root nested in halden (outreach, by home's link): made part of halden.
      await open(s, "home");
      await s.keys("shift+g", "enter");
      await s.see("outreach › index.md", 5000); // a peek (VV-D7): o goes into it
      await s.keys("o");
      await s.message(" outreach — ");
      await leader(s, "v", "shift+m");
      await s.see(/outreach\/ → part of halden: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("made outreach/ part of halden");
      s.expect(!s.exists("outreach/.slipbox"), "its .slipbox/ gone (to the trash)");
    },
  },
  {
    area: "links-and-files",
    name: "files: a folder with an unsaved note open in it isn't renamed — said, the edit kept; saved, it is, the note open from its new place",
    covers: { cases: ["copy-move", "rename"], commands: ["folder.rename", "view.source", "note.save"] },
    options: { open: "people/contacts.md" },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("G", "o");
      await s.type("Typed before the move");
      await s.keys("escape");
      await s.status("unsaved");
      await leader(s, "d", "r");
      await s.see("rename people/ to:");
      await s.keys("ctrl+u");
      await s.type("folk");
      await s.keys("enter");
      await s.message("unsaved: people/contacts.md");
      s.expect(s.exists("people/contacts.md") && !s.exists("folk"), "nothing moved while the note is unsaved");
      await s.see("Typed before the move");
      await s.status("unsaved");
      // Saved, the same rename goes ahead: previewed, carried out, the note open from folk/ with its text.
      await s.keys("ctrl+s");
      await s.file("people/contacts.md", (t) => t.includes("Typed before the move"), "the edit saved where it was");
      await leader(s, "d", "r");
      await s.see("rename people/ to:");
      await s.keys("ctrl+u");
      await s.type("folk");
      await s.keys("enter");
      await s.see("people/ → folk/");
      await s.keys("enter");
      await s.file(
        "folk/contacts.md",
        (t) => t.includes("Typed before the move"),
        "the folder renamed, the note in it",
      );
      s.expect(!s.exists("people"), "people/ gone");
      await s.status("folk/contacts.md");
      await s.see("Typed before the move");
    },
  },
  {
    area: "links-and-files",
    name: "trash: two notes deleted, space v t lists them and ends with Empty the trash…; enter, y, gone for good (DF-D14)",
    covers: { cases: ["trash"], commands: ["note.delete", "trash.open", "trash.empty"] },
    run: async (s) => {
      for (const [name, path] of [
        ["wrap-probe", "scratch/wrap-probe.md"],
        ["broken-frontmatter", "scratch/broken-frontmatter.md"],
      ] as const) {
        await open(s, name);
        await leader(s, "n", "d");
        await s.see(`Delete ${path}?`);
        await s.type("y");
        await s.message(`deleted ${path}`);
        s.expect(!s.exists(path), `${path} gone to the trash`);
      }
      // The trash's list: newest first, a blank row, then the last row, which empties it.
      await leader(s, "v", "t");
      await s.see("Trash (2) — enter restores");
      await s.see("Empty the trash…");
      // Each item's row with when it was deleted (not the boxes saying so, which may still show).
      const [b, a, empty] = [
        s.rowOf(/\bbroken-frontmatter\.md +\d{4}-\d\d-\d\d \d\d:\d\d/),
        s.rowOf(/\bwrap-probe\.md +\d{4}-\d\d-\d\d \d\d:\d\d/),
        s.rowOf("Empty the trash…"),
      ];
      s.expect(
        b >= 0 && a > b && empty > a + 1,
        `broken-frontmatter, wrap-probe, then Empty the trash… last (rows ${b}, ${a}, ${empty})`,
      );
      // up from the first row: the last one; enter asks — n keeps them.
      await s.keys("up", "enter");
      await s.see("Empty the trash? Its 2 items go for good");
      await s.keys("n");
      await s.notSee("Empty the trash? Its 2 items go for good");
      s.expect(s.cli("trash").out.includes("wrap-probe.md"), "kept");
      // :empty-trash opens the list on that row: enter asks the same; y empties it.
      await s.keys("escape");
      await s.notSee("Trash (2)");
      await s.ex("empty-trash");
      await s.see("Trash (2) — enter restores");
      await s.keys("enter");
      await s.see("Empty the trash? Its 2 items go for good");
      await s.keys("y");
      await s.message("emptied the trash: 2 items gone for good");
      const state = join(s.dir, "state");
      const trash = (readdirSync(state, { recursive: true }) as string[]).find((f) => f.endsWith("trash"));
      s.expect(
        !!trash && readdirSync(join(state, trash)).join(" ") === "trash.json",
        `nothing left in the trash but its list: ${trash && readdirSync(join(state, trash))}`,
      );
      await leader(s, "v", "t");
      await s.message("the trash is empty");
      s.expect(!s.exists("scratch/wrap-probe.md") && !s.exists("scratch/broken-frontmatter.md"), "neither note back");
    },
  },
];

const RENAMES: Check[] = [
  {
    area: "links-and-files",
    name: "rename: space n m previews every change, enter renames; each link follows, nothing else written into the note",
    covers: { cases: ["rename", "links/conventions", "links/moves"], commands: ["note.rename"] },
    run: async (s) => {
      await open(s, "kenji-mori");
      await leader(s, "n", "m");
      await s.see("rename or move people/kenji-mori.md to:");
      await s.keys("ctrl+u");
      await s.type("people/kenji");
      await s.keys("enter");
      await s.see(/people\/kenji-mori\.md → people\/kenji\.md: \d+ changes in \d+ files/);
      await s.see("home.md:28");
      await s.keys("enter");
      await s.message("renamed people/kenji-mori.md → people/kenji.md");
      await opened(s, "people/kenji.md");
      s.expect(!s.exists("people/kenji-mori.md"), "the old file is gone");
      await s.file(
        "people/kenji.md",
        (t) => t.includes("# Kenji Mori") && !t.includes("previous_names"),
        "no old name written into it (21.12)",
      );
      s.expect(
        s.read("home.md").includes("- [kenji-mori](people/kenji.md) — our visiting astronomer"),
        "home's link follows",
      );
      s.expect(
        s.read("people/partners-and-names.md").includes("[kenji-mori.md](kenji.md); the names"),
        "the note beside it too",
      );
      s.expect(
        s.read("people/partners-and-names.md").includes("![kenji-mori › Kenji Mori](kenji.md#kenji-mori)"),
        "the embed follows",
      );
      // The explorer's r asks for the selected note's new name; esc cancels.
      await leader(s, "e");
      await s.keys("r");
      await s.see(/rename .* to:/);
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "rename: a link written later to the old path — relinked; then undone, newest first, every file as it was (7.4)",
    covers: {
      cases: ["rename", "links/moves", "links"],
      commands: ["note.rename", "note.open", "link.relink", "rename.undo"],
    },
    run: async (s) => {
      await open(s, "kenji-mori");
      await leader(s, "n", "m");
      await s.see("rename or move people/kenji-mori.md to:");
      await s.keys("ctrl+u");
      await s.type("people/kenji");
      await s.keys("enter", "enter");
      await s.file("people/kenji.md", (t) => t.includes("# Kenji Mori"), "renamed");
      // An agent's note, written now with the old path: broken, its move known — relink rewrites it.
      s.write("late-note.md", "# Late\n\nAsk [Kenji](people/kenji-mori.md) about Aster.\n");
      await s.ex("e late-note.md");
      await opened(s, "late-note.md");
      await s.see("Ask Kenji about Aster.");
      await leader(s, "l", "r");
      await s.see("relink: 1 change in 1 file");
      await s.keys("enter");
      await s.file("late-note.md", (t) => t.includes("Ask [Kenji](people/kenji.md) about Aster."), "the link relinked");
      // Undo (7.4), newest first, each previewed: the relink, then the rename — every file as it was.
      await leader(s, "v", "shift+u");
      await s.see("undo: relink: 1 change in 1 file");
      await s.keys("enter");
      await s.file(
        "late-note.md",
        (t) => t.includes("Ask [Kenji](people/kenji-mori.md) about Aster."),
        "the relink undone",
      );
      await leader(s, "v", "shift+u");
      await s.see(/undo: people\/kenji\.md → people\/kenji-mori\.md: \d+ changes/);
      await s.keys("enter");
      await s.message("renamed people/kenji.md back to"); // the toast wraps the rest
      await s.file("people/kenji-mori.md", (t) => !t.includes("previous_names"), "the note back, as it was");
      s.expect(!s.exists("people/kenji.md"), "the new name is gone");
      s.expect(
        s.read("home.md").includes("- [kenji-mori](people/kenji-mori.md) — our visiting astronomer"),
        "home's link back",
      );
    },
  },
  {
    area: "links-and-files",
    name: "rename: a heading — its line, and the embed of it elsewhere (11.9)",
    covers: { cases: ["rename", "links/fragments"], commands: ["heading.rename"] },
    run: async (s) => {
      await open(s, "kenji-mori");
      await s.ex("14");
      await leader(s, "n", "h");
      await s.see('rename the heading "Kenji Mori" to:');
      await s.keys("ctrl+u");
      await s.type("Kenji Mori, astronomer");
      await s.keys("enter");
      await s.see(/#Kenji Mori → people\/kenji-mori\.md#Kenji Mori, astronomer: \d+ changes/); // the title is cut there
      await s.keys("enter");
      await s.file("people/kenji-mori.md", (t) => t.includes("# Kenji Mori, astronomer\n"), "the heading renamed");
      s.expect(
        s.read("people/partners-and-names.md").includes("(kenji-mori.md#kenji-mori-astronomer)"),
        "the embed follows",
      );
    },
  },
  {
    area: "links-and-files",
    name: "rename: space n m into a folder — named, the note's name kept; or ending in /, the folder made (DF-D4)",
    covers: { cases: ["rename", "copy-move"], commands: ["note.rename"] },
    run: async (s) => {
      // space n m with an existing folder's name: into it, the note's own name kept.
      await open(s, "kenji-mori");
      await leader(s, "n", "m");
      await s.see("rename or move people/kenji-mori.md to:");
      await s.keys("ctrl+u");
      await s.type("projects");
      await s.keys("enter");
      await s.see(/people\/kenji-mori\.md → projects\/kenji-mori\.md: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.file("projects/kenji-mori.md", (t) => t.includes("# Kenji Mori"), "moved into projects/");
      s.expect(
        !s.exists("projects.md") && !s.exists("people/kenji-mori.md"),
        "no projects.md beside the folder; the old path gone",
      );
      await opened(s, "projects/kenji-mori.md");
      s.expect(s.read("home.md").includes("(projects/kenji-mori.md)"), "home's link follows it");
      // A name ending in /, a folder not there yet: made, the note in it.
      await leader(s, "n", "m");
      await s.see("rename or move projects/kenji-mori.md to:");
      await s.keys("ctrl+u");
      await s.type("visitors/");
      await s.keys("enter");
      await s.see(/projects\/kenji-mori\.md → visitors\/kenji-mori\.md: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.file("visitors/kenji-mori.md", (t) => t.includes("# Kenji Mori"), "moved into the new visitors/");
      await opened(s, "visitors/kenji-mori.md");
    },
  },
  {
    area: "links-and-files",
    name: "convert-links: a root's wikilinks made paths after a preview, an ambiguous one picked; an embed still drawn, a block followed, undone",
    covers: { cases: ["convert-links", "links/wikilinks"], commands: ["link.convert", "rename.undo"] },
    options: { home: true, startAt: "home/hobbies/cooking/Pantry.md" },
    run: async (s) => {
      const HOME = "~/hobbies/cooking/Home.md";
      const was = s.read(HOME);
      await s.ex("convert-links");
      await s.see(/links → plain paths: \d+ changes? in \d+ files?/, 10000);
      await s.see("pick Home.md:18");
      await s.see("pick Pantry.md:24");
      // `![[dal.png|300]]`: two pictures answer to it — its candidates, one picked; the preview again, with it.
      await s.keys("enter");
      await s.see("![[dal.png|300]] in Home.md:18 — which note?");
      await s.see("Archive/attachments/dal.png");
      await s.keys("down", "enter");
      await s.see(/links → plain paths: \d+ changes? in \d+ files?/);
      await s.notSee("pick Home.md:18");
      // Pantry's `[[dal.png]]` likewise; then nothing left to pick.
      await s.keys("enter");
      await s.see("[[dal.png]] in Pantry.md:24 — which note?");
      await s.keys("down", "enter");
      await s.see(/links → plain paths: \d+ changes? in \d+ files?/);
      await s.notSee("pick Pantry.md:24");
      await s.keys("enter");
      await s.message(/converted links to plain paths: \d+ changes/); // short: the box wraps the rest
      await s.file(
        HOME,
        (t) =>
          t.includes("[Pantry](Pantry.md)") &&
          t.includes("[Shakshuka](Recipes/Weeknight/Shakshuka.md)") &&
          t.includes("(attachments/dal.png)"),
        "converted, the picked picture's path among them",
      );
      // The embed, a path now, still drawn in place: the pantry's CSV as a table.
      s.expect(s.read("~/hobbies/cooking/Pantry.md").includes("![pantry.csv](pantry.csv)"), "the embed a path");
      await s.see(/[│┃].*[│┃].*[│┃]/);
      // The block link, a path now, followed: at the step its ^id closes.
      await s.restart({ startAt: "home/hobbies/cooking/Recipes/Weeknight/Dal.md" });
      await follow(s, "Dal › ^tadka");
      await s.status(/L3[23]:/);
      // Undone: every note as it was.
      await s.ex("undo-rename");
      await s.see(/undo: links → plain paths/);
      await s.keys("enter");
      await s.message(/undid the conversion to plain paths/);
      await s.file(HOME, (t) => t === was, "Home.md as it was");
    },
  },
];

export const FILE_OPERATIONS: Check[] = [...FILES, ...RENAMES];
