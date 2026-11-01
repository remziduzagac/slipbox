import { chmodSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Check, exported, leader } from "../check.ts";
import { cancelExport, format, HOLD, hold } from "../support/export.ts";

export const EXPORT: Check[] = [
  // --- export -------------------------------------------------------------------------------------
  {
    area: "outside-and-code",
    name: "export: space n o, Word, enter — the Save As window beside the note, its name filled in; written",
    covers: { commands: ["note.export"] },
    run: async (s) => {
      await leader(s, "n", "o");
      await s.see("Export home.md as");
      await s.see("Word (.docx)");
      await s.see("Markdown (.md)");
      // Word first: enter takes it.
      await s.keys("enter");
      await s.see("Export home.md as Word (.docx)");
      await s.see("Beside the note");
      await s.see("Name: home.docx");
      await s.see("ctrl+n: new folder");
      // The name has the focus: enter exports there.
      await s.keys("enter");
      await exported(s, "home.docx", "PK\x03\x04");
      await s.message("exported home.md");
      await s.notSee("Name: home.docx");
    },
  },
  {
    area: "outside-and-code",
    name: "export: PDF, a web page, an e-book, Markdown through the window; Markdown's picture copied beside it",
    covers: { commands: ["note.export"] },
    options: { open: "projects/dome-refit.md" },
    run: async (s) => {
      const note = s.read("projects/dome-refit.md");
      const formats: [string, string, string][] = [
        ["pdf", "projects/dome-refit.pdf", "%PDF-"],
        ["html", "projects/dome-refit.html", "<!doctype html>"],
        ["epub", "projects/dome-refit.epub", "PK\x03\x04"],
      ];
      for (const [name, file, magic] of formats) {
        await format(s, "projects/dome-refit.md", name);
        await s.see(`Name: dome-refit.${name}`);
        await s.keys("enter");
        await exported(s, file, magic);
      }
      // Markdown: apart from the note, marked an export, its picture in a folder beside it.
      await format(s, "projects/dome-refit.md", "markdown");
      await s.see("Name: dome-refit.export.md");
      await s.keys("enter");
      await exported(s, "projects/dome-refit.export.md", "---\n");
      s.expect(
        s.read("projects/dome-refit.export.md").includes("\ngenerator: slipbox\n"),
        "the Markdown export carries its mark",
      );
      s.expect(
        s.read("projects/dome-refit.export.md").includes("](dome-refit.export.assets/dome-shutter.png)"),
        "the picture's link into the folder beside it",
      );
      await s.until(
        () => s.exists("projects/dome-refit.export.assets/dome-shutter.png"),
        5000,
        "the picture copied beside the export",
      );
      // The note itself as it was.
      s.expect(s.read("projects/dome-refit.md") === note, "the note untouched");
    },
  },
  {
    area: "outside-and-code",
    name: "export: the window's keys — a place, into a folder and up, typing jumps, ~ home, ctrl+n a folder exported into",
    covers: { commands: ["note.export"] },
    // The reference set's home: its Downloads among the places, its folders to go through.
    options: { home: true },
    run: async (s) => {
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      // Your folders among the places: the ones there are.
      await s.see("Downloads");
      await s.notSee("Documents", 500);
      // tab: from the name round to the places; down to Downloads, enter goes there.
      await s.keys("tab", "down", "enter");
      await s.see("~/Downloads/");
      // ~ home (the folder has the focus now); typing jumps — "wo" to work — and enter goes in.
      await s.type("~");
      await s.see("~/");
      await s.see("hobbies/");
      await s.type("wo");
      await s.keys("enter");
      await s.see("~/work/");
      await s.see("kestrel/");
      // → into product, ← back up, the folder left still the one picked (marked once the name has the focus).
      await s.type("pr");
      await s.keys("right");
      await s.see("~/work/product/");
      await s.keys("left");
      await s.see("~/work/");
      await s.keys("tab");
      await s.see(/›.{0,4}product\//);
      await s.keys("shift+tab");
      // ctrl+n: a folder made there, gone into; then the export lands in it.
      await s.keys("ctrl+n");
      await s.see("New folder:");
      await s.type("q3");
      await s.keys("enter");
      await s.see("~/work/q3/");
      s.expect(s.exists("~/work/q3"), "the new folder made");
      await s.keys("tab", "enter");
      await exported(s, "~/work/q3/home.docx", "PK\x03\x04");
      // The export ended, not only its file there: the file is there a moment before its folder is remembered.
      await s.message("exported home.md");
      // Next time the window opens where this one went (its folder at its top, not the message's path).
      await format(s, "home.md", "word");
      await s.see(/[│┃] ~\/work\/q3\/ +[│┃]/);
      await s.see("Last export");
      await s.keys("escape");
      await s.notSee("Name: home.docx");
    },
  },
  {
    area: "outside-and-code",
    name: "export: where you exported last — kept once the file is written, so the window opened while its staging is cleared opens there; one that can't be written leaves it as it was",
    covers: { commands: ["note.export"] },
    options: {
      // The export's staging cleared only when the check says.
      ...HOLD,
      // A folder to export into, one that can't be written.
      setup: (s) => {
        for (const dir of ["out", "ro"]) mkdirSync(s.path(dir));
      },
    },
    run: async (s) => {
      const window = /[│┃] out\/ +[│┃]/; // the window's folder: out/
      // Into out/: the file written, its staging held.
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("ctrl+u");
      await s.type("out/home.docx");
      await s.keys("enter");
      await exported(s, "out/home.docx", "PK\x03\x04");
      await s.until(() => hold(s) === "waiting", 15000, "the export's staging held");
      // The window opened meanwhile: at out/, Last export among the places.
      await format(s, "home.md", "word");
      await s.see(window);
      await s.see("Last export");
      await s.keys("escape");
      await s.notSee("Name: home.docx");
      writeFileSync(join(s.dir, "hold-go"), "");
      await s.until(() => hold(s) === "let go", 15000, "the export's staging let go");
      // Into a folder that can't be written: said, and not where you exported last.
      chmodSync(s.path("ro"), 0o555);
      try {
        await format(s, "home.md", "word");
        await s.see(window);
        await s.keys("ctrl+u");
        await s.type("../ro/home.docx");
        await s.keys("enter");
        await s.message(/ro\/home\.docx not written/);
      } finally {
        chmodSync(s.path("ro"), 0o755);
      }
      await format(s, "home.md", "word");
      await s.see(window);
      await s.see("Last export");
      await s.keys("escape");
      await s.notSee("Name: home.docx");
    },
  },
  {
    area: "outside-and-code",
    name: "export: over once its file is written — said while its staging is cleared, Cancel export then finding none running; a cleanup that fails said after it, the newest",
    covers: { commands: ["note.export", "note.export_cancel"] },
    // The export's staging cleared only when the check says.
    options: HOLD,
    run: async (s) => {
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("enter");
      await exported(s, "home.docx", "PK\x03\x04");
      await s.until(() => hold(s) === "waiting", 15000, "the export's staging held");
      // Said while its staging is still being cleared; over, so Cancel export finds none running.
      await s.message("exported home.md to home.docx (Word (.docx))");
      await cancelExport(s);
      await s.message("no export is running");
      // The cleanup fails: its folder can't be removed from the cache's `exports/`. Said last, the box at the top.
      const exports = join(s.dir, "cache", "slipbox", "exports");
      chmodSync(exports, 0o555);
      try {
        writeFileSync(join(s.dir, "hold-go"), "");
        await s.message("export cleanup:");
        // The newest box: above every other still showing (each shows for 4 s), the export's own above all.
        const others = ["exported home.md", "no export is running"].map((m) => s.rowOf(m)).filter((row) => row >= 0);
        s.expect(
          others.every((row) => s.rowOf("export cleanup:") < row),
          "the cleanup's warning the newest box",
        );
      } finally {
        // As slipbox makes it, owner-only.
        chmodSync(exports, 0o700);
      }
    },
  },
  {
    area: "outside-and-code",
    name: "export: over once a cancel can't stop it — Cancel export as its publication returns finds none running",
    covers: { commands: ["note.export", "note.export_cancel"] },
    // The first publication held once it has put its document in place, before the export goes on.
    options: { ...HOLD, env: { ...HOLD.env, EXPORT_HOLD_AT: "publication" } },
    run: async (s) => {
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("enter");
      await exported(s, "home.docx", "PK\x03\x04");
      await s.until(() => hold(s) === "waiting", 15000, "the publication held");
      await cancelExport(s);
      await s.message("no export is running");
      writeFileSync(join(s.dir, "hold-go"), "");
      await s.message("exported home.md to home.docx (Word (.docx))");
    },
  },
  {
    area: "outside-and-code",
    name: "export: one that can't be written is over once it says so — Cancel export while its staging is cleared finds none running",
    covers: { commands: ["note.export", "note.export_cancel"] },
    options: {
      // The export's staging cleared only when the check says.
      ...HOLD,
      // A folder that can't be written.
      setup: (s) => mkdirSync(s.path("ro")),
    },
    run: async (s) => {
      chmodSync(s.path("ro"), 0o555);
      try {
        await format(s, "home.md", "word");
        await s.see("Name: home.docx");
        await s.keys("ctrl+u");
        await s.type("ro/home.docx");
        await s.keys("enter");
        await s.until(() => hold(s) === "waiting", 15000, "the export's staging held");
        await s.message(/ro\/home\.docx not written/);
        await cancelExport(s);
        await s.message("no export is running");
      } finally {
        writeFileSync(join(s.dir, "hold-go"), "");
        chmodSync(s.path("ro"), 0o755);
      }
    },
  },
  {
    area: "outside-and-code",
    name: "export: an earlier export replaced at once; a file that isn't one only on y — n brings the window back, the file as it was",
    covers: { commands: ["note.export"] },
    run: async (s) => {
      // Exported once: home.docx there.
      await format(s, "home.md", "word");
      await s.keys("enter");
      await exported(s, "home.docx", "PK\x03\x04");
      const first = statSync(s.path("home.docx")).mtimeMs;
      // Again: an earlier export, written over without a question.
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("enter");
      await s.until(() => statSync(s.path("home.docx")).mtimeMs !== first, 15000, "home.docx written again");
      await exported(s, "home.docx", "PK\x03\x04");
      // A file there that isn't an export: asked; n, the window back and the file as it was; y, written.
      s.write("home.docx", "mine\n");
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("enter");
      await s.see("Replace home.docx? It isn't an export.");
      await s.keys("n");
      await s.see("Name: home.docx");
      s.expect(s.read("home.docx") === "mine\n", "the file untouched after n");
      await s.keys("enter");
      await s.see("Replace home.docx? It isn't an export.");
      await s.keys("y");
      await exported(s, "home.docx", "PK\x03\x04");
    },
  },
  {
    area: "outside-and-code",
    name: "export: an earlier PDF, web page or e-book export replaced at once, known by its mark; another tool's web page only on y",
    covers: { commands: ["note.export"] },
    run: async (s) => {
      const formats: [string, string, string][] = [
        ["pdf", "home.pdf", "%PDF-"],
        ["html", "home.html", "<!doctype html>"],
        ["epub", "home.epub", "PK\x03\x04"],
      ];
      for (const [name, file, magic] of formats) {
        // Exported once; again, over the first: an export of slipbox's, by the mark in it — written, nothing asked.
        await format(s, "home.md", name);
        await s.see(`Name: ${file}`);
        await s.keys("enter");
        await exported(s, file, magic);
        const first = statSync(s.path(file)).mtimeMs;
        await format(s, "home.md", name);
        await s.see(`Name: ${file}`);
        await s.keys("enter");
        await s.until(() => statSync(s.path(file)).mtimeMs !== first, 15000, `${file} written again`);
        await exported(s, file, magic);
        s.expect(!s.text().includes("It isn't an export."), `${file}: replaced without a question`);
      }
      // A web page another tool made, there: not slipbox's mark, so asked; n, the window back and the page as it was.
      const theirs =
        '<!doctype html>\n<html><head><meta name="generator" content="pandoc"><title>Home</title></head><body><p>Home.</p></body></html>\n';
      s.write("home.html", theirs);
      await format(s, "home.md", "html");
      await s.see("Name: home.html");
      await s.keys("enter");
      await s.see("Replace home.html? It isn't an export.");
      await s.keys("n");
      await s.see("Name: home.html");
      s.expect(s.read("home.html") === theirs, "their page untouched after n");
      // y: written, slipbox's mark in it now.
      await s.keys("enter");
      await s.see("Replace home.html? It isn't an export.");
      await s.keys("y");
      await s.file("home.html", (t) => /<meta\s+name="generator"\s+content="slipbox"/.test(t), "home.html exported");
    },
  },
  {
    area: "outside-and-code",
    name: "export: a note named as the file — refused, said, the window kept; the note untouched",
    covers: { commands: ["note.export"] },
    run: async (s) => {
      const note = s.read("about-this-vault.md");
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("ctrl+u");
      await s.type("about-this-vault.md");
      await s.see("Name: about-this-vault.md");
      await s.keys("enter");
      await s.message("is a note");
      await s.see("Name: about-this-vault.md");
      s.expect(s.read("about-this-vault.md") === note, "the note untouched");
      await s.keys("escape");
      await s.notSee("Name: about-this-vault.md");
    },
  },
  {
    area: "outside-and-code",
    name: "export: the Save As window — a name ending in / that isn't there makes that folder and goes into it, the note's name given back; enter exports there (DF-D5)",
    covers: { commands: ["note.export"] },
    run: async (s) => {
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("ctrl+u");
      await s.type("made/v1/");
      await s.see("Name: made/v1/");
      await s.keys("enter");
      await s.see("Name: home.docx");
      await s.see(/[│┃] made\/v1\/ +[│┃]/); // the window's folder, from the note's
      await s.see("an empty folder");
      s.expect(s.exists("made/v1"), "made/v1/ made");
      s.expect(!s.exists("made/v1/home.docx") && !s.exists("made/v1.docx"), "nothing exported yet");
      await s.keys("enter");
      await exported(s, "made/v1/home.docx", "PK\x03\x04");
      await s.message("exported home.md");
    },
  },
  {
    area: "outside-and-code",
    name: "export: space n shift+o — two notes picked in order, this one first; Markdown, both chapters in that order",
    covers: { commands: ["note.export_many"] },
    run: async (s) => {
      await leader(s, "n", "shift+o");
      await s.see("Notes to export, in order — 1 picked");
      await s.see("Export home.md…");
      // Typed: the notes filtered, "Export…" still first; the note picked second.
      await s.type("about-this");
      await s.see("about-this-vault.md");
      await s.keys("down", "enter");
      await s.see("Notes to export, in order — 2 picked");
      await s.see("Export these 2 notes…");
      await s.keys("up", "enter");
      await s.see("Export 2 notes as");
      await s.type("markdown");
      await s.keys("enter");
      await s.see("Export 2 notes as Markdown (.md)");
      await s.see("Name: home.export.md");
      await s.keys("enter");
      await exported(s, "home.export.md", "---\n");
      const md = s.read("home.export.md");
      const [home, about] = [md.indexOf("# Halden Ridge Observatory"), md.indexOf("# About this vault")];
      s.expect(home > 0 && about > home, "both chapters, home's first");
    },
  },
  {
    area: "outside-and-code",
    name: "export: :export pdf at the command line — the window at once, no format list",
    covers: { commands: ["note.export"] },
    run: async (s) => {
      await s.ex("export pdf");
      await s.see("Export home.md as PDF (.pdf)");
      await s.see("Name: home.pdf");
      // No format list on the way: none of its entries shown.
      await s.notSee("Word (.docx)", 500);
      await s.keys("enter");
      await exported(s, "home.pdf", "%PDF-");
    },
  },
];
