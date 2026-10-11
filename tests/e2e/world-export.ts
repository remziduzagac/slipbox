// Export (plan 10.x) in a real terminal: the format list, the Save As window and its keys (10.14), each format written,
// a file replaced only when said, a note never, notes picked in order (10.9), `:export`. Each scenario's slipbox has a
// home of its own (`{dir}/home`), so the window's places — Downloads, Documents, home — are never yours. The mouse in
// the window can't be sent through herdr: the headless tests click it.

import { existsSync, readFileSync } from "node:fs";
import { exported, leader, type Scenario } from "./helpers.ts";
import type { Session } from "./session.ts";

/** A home of the scenario's own, with what its folders hold: `.keep` files make the folders, unseen (hidden). */
const HOME = (...folders: string[]) => ({
  env: { HOME: "{dir}/home" },
  beside: Object.fromEntries(["", ...folders].map((f) => [`home/${f ? `${f}/` : ""}.keep`, ""])),
});

/** The format list for the note on screen, then a format typed into its filter and taken. */
async function format(s: Session, note: string, name: string): Promise<void> {
  await leader(s, "n", "o");
  await s.see(`Export ${note} as`);
  await s.type(name);
  await s.keys("enter");
}

export const EXPORT_SCENARIOS: Scenario[] = [
  {
    name: "export: space n o, Word, enter — the Save As window beside the note, its name filled in; written",
    options: HOME(),
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
    name: "export: PDF, a web page, an e-book, Markdown through the window; Markdown's picture copied beside it",
    options: { ...HOME(), open: "projects/dome-refit.md" },
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
      s.expect(s.read("projects/dome-refit.export.md").includes("\ngenerator: slipbox\n"), "the Markdown export carries its mark");
      s.expect(s.read("projects/dome-refit.export.md").includes("](dome-refit.export.assets/dome-shutter.png)"), "the picture's link into the folder beside it");
      await s.until(() => s.exists("projects/dome-refit.export.assets/dome-shutter.png"), 5000, "the picture copied beside the export");
      // The note itself as it was.
      s.expect(s.read("projects/dome-refit.md") === note, "the note untouched");
    },
  },

  {
    name: "export: the window's keys — a place, into a folder and up, typing jumps, ~ home, ctrl+n a folder exported into",
    options: HOME("Downloads", "Documents/reports", "alpha"),
    run: async (s) => {
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      // Your folders among the places: the ones there are.
      await s.see("Downloads");
      await s.see("Documents");
      await s.notSee("Desktop", 500);
      // tab: from the name round to the places; down to Downloads, enter goes there.
      await s.keys("tab", "down", "enter");
      await s.see("~/Downloads/");
      // ~ home (the folder has the focus now); typing jumps — "do" to Documents — and enter goes in.
      await s.type("~");
      await s.see("~/");
      await s.see("alpha/");
      await s.type("do");
      await s.keys("enter");
      await s.see("~/Documents/");
      await s.see("reports/");
      // → into reports, ← back up, the folder left still the one picked (marked once the name has the focus).
      await s.keys("right");
      await s.see("~/Documents/reports/");
      await s.keys("left");
      await s.see("~/Documents/");
      await s.keys("tab");
      await s.see(/›.{0,4}reports\//);
      await s.keys("shift+tab");
      // ctrl+n: a folder made there, gone into; then the export lands in it.
      await s.keys("ctrl+n");
      await s.see("New folder:");
      await s.type("q3");
      await s.keys("enter");
      await s.see("~/Documents/q3/");
      s.expect(existsSync(s.path("~/Documents/q3")), "the new folder made");
      await s.keys("tab", "enter");
      await exported(s, "~/Documents/q3/home.docx", "PK\x03\x04");
      // Next time the window opens where this one went.
      await format(s, "home.md", "word");
      await s.see("~/Documents/q3/");
      await s.see("Last export");
      await s.keys("escape");
      await s.notSee("Name: home.docx");
    },
  },

  {
    name: "export: a file there replaced only on y — n brings the window back, the file as it was",
    options: { ...HOME(), files: { "home.docx": "an older one" } },
    run: async (s) => {
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("enter");
      await s.see("home.docx is there — replace it?");
      await s.keys("n");
      await s.see("Name: home.docx");
      s.expect(s.read("home.docx") === "an older one", "the file untouched after n");
      await s.keys("enter");
      await s.see("home.docx is there — replace it?");
      await s.keys("y");
      await exported(s, "home.docx", "PK\x03\x04");
    },
  },

  {
    name: "export: a note named as the file — refused, said, the window kept; the note untouched",
    options: HOME(),
    run: async (s) => {
      const note = readFileSync(s.path("about-this-vault.md"), "utf8");
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
    name: "export: space n shift+o — two notes picked in order, this one first; Markdown, both chapters in that order",
    options: HOME(),
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
    name: "export: :export pdf at the command line — the window at once, no format list",
    options: HOME(),
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
