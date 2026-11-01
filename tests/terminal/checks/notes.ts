// Saving notes, making files, the editor hand-off, exporting and properties (TT-T6).

import { mkdirSync, rmSync } from "node:fs";
import { type Check, leader, opened } from "../check.ts";

export const NOTES: Check[] = [
  {
    area: "links-and-files",
    name: "notes: :w, :wa, :w! and :e! — saved, all saved, saved over a file changed on disk, reverted; space n c resolves",
    covers: {
      cases: ["save", "conflict"],
      commands: ["note.save", "note.save_all", "note.save_force", "note.revert", "note.resolve", "note.open"],
    },
    options: { open: "meetings/2026-09-14-weekly.md" },
    run: async (s) => {
      const MEETING = "meetings/2026-09-14-weekly.md";
      // :w writes this note.
      await leader(s, "n", "v");
      await s.keys("G", "o");
      await s.type("Saved with :w.");
      await s.keys("escape");
      await s.ex("w");
      await s.file(MEETING, (t) => t.includes("Saved with :w."), ":w wrote it");
      // :wa writes every note changed, open or not.
      await s.keys("o");
      await s.type("Saved with :wa, here.");
      await s.keys("escape");
      await s.ex("e people/kenji-mori.md");
      await opened(s, "people/kenji-mori.md");
      // The window is in source mode still.
      await s.status("SOURCE");
      await s.keys("G", "o");
      await s.type("Saved with :wa, there.");
      await s.keys("escape");
      await s.ex("wa");
      await s.file(MEETING, (t) => t.includes("Saved with :wa, here."), ":wa wrote the first");
      await s.file("people/kenji-mori.md", (t) => t.includes("Saved with :wa, there."), ":wa wrote the second");
      // Changed on disk while changed here: the prompt; space n c brings it back; :w! writes over theirs.
      await s.keys("o");
      await s.type("mine");
      await s.keys("escape");
      s.write("people/kenji-mori.md", `${s.read("people/kenji-mori.md")}\ntheirs\n`);
      await s.see("(l) Load theirs", 5000);
      await s.keys("escape");
      await s.notSee("(l) Load theirs");
      await leader(s, "n", "c");
      await s.see("(l) Load theirs");
      await s.keys("escape");
      await s.ex("w!");
      await s.file("people/kenji-mori.md", (t) => t.includes("mine") && !t.includes("theirs"), "yours over theirs");
      // :e! drops what's typed: the file as it is.
      await s.keys("o");
      await s.type("unsaved");
      await s.keys("escape");
      await s.ex("e!");
      await s.until(() => !s.statusLine().includes("unsaved"), 3000, "the changes dropped");
      s.expect(!s.read("people/kenji-mori.md").includes("unsaved"), "e! wrote nothing");
    },
  },
  {
    area: "links-and-files",
    name: "notes: ctrl+n makes a note beside this one, typed into; ctrl+shift+n a folder; space n r reads it again",
    covers: { cases: ["new-note"], commands: ["note.create", "folder.create", "note.reload"] },
    options: { open: "people/kenji-mori.md" },
    run: async (s) => {
      await s.keys("ctrl+n");
      await s.see("new note in people/");
      await s.type("visitors-2026");
      await s.keys("enter");
      await opened(s, "people/visitors-2026.md");
      await s.type("Kenji, and the school in October.");
      await s.keys("escape", "ctrl+s");
      await s.file(
        "people/visitors-2026.md",
        (t) => t.startsWith("# visitors-2026") && t.includes("Kenji, and the school in October."),
        "the note made, its title and what was typed",
      );
      await s.keys("ctrl+shift+n");
      await s.see("new folder in people/");
      await s.type("archive");
      await s.keys("enter");
      await s.until(() => s.exists("people/archive"), 3000, "the folder made");
      // An outside write, read again by hand (the watcher would anyway).
      s.write("people/visitors-2026.md", "# visitors-2026\n\nRewritten by an agent.\n");
      await leader(s, "n", "r");
      await s.see("Rewritten by an agent.", 5000);
    },
  },
  {
    area: "links-and-files",
    name: "notes: space n e hands the note to your editor and comes back; space n s sends it to a running one",
    covers: { cases: ["notes"], commands: ["note.edit", "note.send", "note.send_pick"] },
    // Each editor leaves a file behind, so the check is that it really ran, with the note's path.
    options: {
      config: `[editor]\ncommand = "sh -c 'echo $0 > $1' {file} {vault}/ran-edit"\nremote = ["sh -c 'echo $0 > $1' {file} {vault}/ran-send"]\n`,
    },
    run: async (s) => {
      await leader(s, "n", "e");
      await opened(s, "home.md");
      await s.until(() => s.exists("ran-edit"), 5000, "the editor to run");
      s.expect(s.read("ran-edit").trim().endsWith("home.md"), "the editor got the note");
      await leader(s, "n", "s");
      await s.until(() => s.exists("ran-send"), 5000, "the remote editor to run");
      s.expect(s.read("ran-send").trim().endsWith("home.md"), "the remote editor got the note");
      // space n p picks which running nvim when the remote names a {server}; this one names none: sent again.
      rmSync(s.path("ran-send"));
      await leader(s, "n", "p");
      await s.until(() => s.exists("ran-send"), 5000, "the remote editor to run again");
      await s.message("sent to sh at line 1");
    },
  },
  {
    area: "links-and-files",
    name: "notes: exported — this note as Markdown beside it; two notes as one, in the order picked",
    covers: { cases: ["notes"], commands: ["note.export", "note.export_many"] },
    run: async (s) => {
      await leader(s, "n", "o");
      await s.see("Export home.md as");
      await s.type("markdown");
      await s.keys("enter");
      await s.see("Name: home.export.md");
      await s.keys("enter");
      await s.until(() => s.exists("home.export.md"), 15000, "home.export.md written");
      await s.message("exported home.md");
      // Two notes, this one first.
      await leader(s, "n", "shift+o");
      await s.see("Notes to export, in order — 1 picked");
      await s.type("about-this");
      await s.see("about-this-vault.md");
      await s.keys("down", "enter");
      await s.see("Notes to export, in order — 2 picked");
      await s.keys("up", "enter");
      await s.see("Export 2 notes as");
      await s.type("markdown");
      await s.keys("enter");
      await s.see("Name: home.export.md");
      await s.keys("ctrl+u");
      await s.type("both.md");
      await s.keys("enter");
      await s.until(() => s.exists("both.md"), 15000, "both.md written");
      const md = s.read("both.md");
      const [home, about] = [md.indexOf("# Halden Ridge Observatory"), md.indexOf("# About this vault")];
      s.expect(home > 0 && about > home, "both chapters, home's first");
    },
  },
  {
    area: "links-and-files",
    name: "notes: an export cancelled — a long note as a PDF, stopped from the palette before it's written; not where you exported last",
    covers: { commands: ["note.export_cancel"] },
    options: {
      open: "long.md",
      // Long enough that its PDF takes seconds: the cancel comes first. A folder to export it into.
      setup: (s) => {
        s.write(
          "long.md",
          `# Long\n\n${Array.from({ length: 24_000 }, (_, i) => `Paragraph ${i} of a long note, a while as a PDF.\n`).join("\n")}`,
        );
        mkdirSync(s.path("later"));
      },
    },
    run: async (s) => {
      await s.keys(":");
      await s.type("Cancel export");
      await s.keys("enter");
      await s.message("no export is running");
      await leader(s, "n", "o");
      await s.see("Export long.md as");
      await s.type("pdf");
      await s.keys("enter");
      await s.see("Name: long.pdf");
      await s.keys("ctrl+u");
      await s.type("later/long.pdf");
      await s.keys("enter");
      await s.keys(":");
      await s.type("Cancel export");
      await s.keys("enter");
      await s.message("export cancelled");
      s.expect(!s.exists("later/long.pdf"), "the PDF not written");
      // Nor kept as where you exported last: the window opens beside the note, no Last export.
      await leader(s, "n", "o");
      await s.see("Export long.md as");
      await s.type("pdf");
      await s.keys("enter");
      await s.see("Name: long.pdf");
      await s.see(/[│┃] \.\/ +[│┃]/);
      await s.notSee("Last export", 500);
      await s.keys("escape");
      await s.notSee("Name: long.pdf");
    },
  },
  {
    area: "links-and-files",
    name: "info: the folder's own window; a note's properties edited in theirs, written back",
    covers: { cases: ["links/state"], commands: ["vault.info", "note.properties"] },
    options: { open: "people/kenji-mori.md" },
    run: async (s) => {
      await leader(s, "v", "i");
      await s.see(s.vault);
      await s.keys("escape");
      await leader(s, "n", "shift+p");
      await s.see("Properties — people/kenji-mori.md (YAML)");
      await s.keys("shift+g", "o");
      await s.type("status: visiting");
      await s.keys("escape", "escape");
      await s.message("properties written");
      await s.file(
        "people/kenji-mori.md",
        (t) => t.includes("status: visiting\n---"),
        "the property in the frontmatter",
      );
    },
  },
];
