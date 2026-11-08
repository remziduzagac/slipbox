// The permanent top bar's sections: independent zoom/workspace/git targets, the counts, About (VB-D3, D269).

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "../../../src/version.ts";
import { type Check, leader } from "../check.ts";
import { SIZE, type Session } from "../session.ts";
import { columnOf, mouse } from "./source-control.ts";

/** A click on `needle` in screen row `y`: on its second column, past a glyph whatever width the terminal gives it. */
async function clickAt(s: Session, y: number, needle: string): Promise<void> {
  const row = s.screen()[y]!;
  await mouse(s, columnOf(row, row.indexOf(needle)) + 1, y);
}

/** A click on `needle` on the top bar. */
async function onTopBar(s: Session, needle: string): Promise<void> {
  await s.until(() => s.topBar().includes(needle), undefined, `${needle} on the top bar`);
  await clickAt(s, 0, needle);
}

export const WHERE: Check[] = [
  {
    area: "navigating",
    name: "work controls: real indexing pauses, resumes, restarts and stops in the live popup",
    covers: {
      cases: ["ui"],
      commands: [
        "background.open",
        "background.pause",
        "background.restart",
        "background.cancel",
        "background.dismiss",
      ],
    },
    options: { preload: "tests/terminal/index-hold.ts", env: { INDEX_HOLD_GO: "{dir}/index-go" } },
    run: async (s) => {
      await s.until(() => / 1 /.test(s.topBar()), 15000, "index busy");
      await leader(s, "b");
      await s.see("Indexing");
      await s.keys("p");
      await s.see("paused");
      await s.see("Resume");
      await s.keys("p");
      await s.see("Pause");
      await s.keys("r");
      await s.see("stopped");
      await s.keys("s");
      await s.see("No work running");
      await s.keys("d");
      writeFileSync(join(s.dir, "index-go"), "");
      await s.keys("escape");
      await s.until(() => / 0 /.test(s.topBar()), 5000, "stopped count");
    },
  },
  {
    area: "navigating",
    name: "work and messages: idle count, work popup, the messages count, About by the branding and leader keys (D269)",
    covers: {
      cases: ["ui", "status"],
      commands: ["background.open", "app.about", "messages.open"],
    },
    run: async (s) => {
      await s.until(() => / 0 │ ✉ \d+/.test(s.topBar()), 15000, "idle work and the messages count");
      s.expect(!s.topBar().includes(VERSION), "no version on the top bar: About has it");
      await onTopBar(s, " 0 ");
      await s.see("Background work");
      await s.see("No work running");
      await s.keys("escape");
      await leader(s, "b");
      await s.see("Background work");
      await s.keys("escape");
      // Something said, counted; the list opened by a click, the count back to 0.
      await leader(s, "s", "y");
      await s.until(() => !/✉ 0\b/.test(s.topBar()), undefined, "a message counted");
      await onTopBar(s, "✉");
      await s.see("Messages");
      await s.keys("escape");
      await s.until(() => /✉ 0\b/.test(s.topBar()), undefined, "the messages seen");
      await onTopBar(s, "slipbox");
      await s.see("About slipbox");
      await s.see(`slipbox ${VERSION}`);
      await s.see("Channel: stable");
      await s.see("Start here");
      await s.keys("escape");
      await leader(s, "a");
      await s.see("Previous version: not recorded");
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "permanent top bar: zoom, workspace, git and changes are distinct named targets; zen retains them",
    covers: { cases: ["ui", "status", "mouse"], commands: ["explorer.focus", "git.menu", "git.focus", "ui.zen"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      await s.where(/^kestrel │ main\b/);
      await leader(s, "e");
      await onTopBar(s, "≡");
      await s.see("Explorer");
      await onTopBar(s, "⎇ main");
      await s.see(/Branches \(\d+\) — enter: check one out/);
      await s.keys("escape");
      s.write("~/work/kestrel/README.md", `${s.read("~/work/kestrel/README.md")}\nChanged.\n`);
      await onTopBar(s, "●");
      await s.see("Changes");
      await leader(s, "u", "z");
      await s.where(/^kestrel │ main\b/);
      s.expect(!s.statusLine().includes("kestrel"), "the workspace belongs on the top bar");
    },
  },
  {
    area: "links-and-files",
    name: "where you are: the workspace clicked lists all vaults; slash filters and enter changes workspace",
    covers: { cases: ["vault", "mouse"], commands: ["folders.open"] },
    options: { home: true, startAt: "home/notes/index.md", setup: (s) => void s.cliIn("~/work/kestrel", "ls") },
    run: async (s) => {
      await s.where(/^notes(?: │|$)/);
      await onTopBar(s, "◈ notes");
      await s.see("Vaults — enter goes into one; / filters");
      await s.keys("/");
      await s.type("kestrel");
      await s.keys("enter");
      await s.where(/^kestrel │ main\b/, /‹ README\.md/, 5000);
    },
  },
  {
    area: "navigating",
    name: "where you are: under 26 columns zoom and workspace remain separate; widening restores the git item",
    covers: { cases: ["width", "status"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      await s.where(/^kestrel │ main\b/);
      await s.resize(25, SIZE.rows);
      await s.until(() => s.topBar().includes("≡") && s.topBar().includes("◈"), 3000, "two tight location items");
      s.expect(!s.topBar().includes("⎇"), "git gives way to location");
      await s.resize(SIZE.cols, SIZE.rows);
      await s.where(/^kestrel │ main\b/);
    },
  },
  {
    area: "navigating",
    name: "where you are: no note open still shows the folder workspace and NORMAL chip",
    covers: { cases: ["vault", "ui", "status"] },
    options: { home: true, startAt: "home/Downloads" },
    run: async (s) => {
      await s.where("Downloads");
      await s.status("NORMAL");
      s.expect(s.topBar().includes("slipbox"), "the bar is permanent");
    },
  },
  {
    area: "navigating",
    name: "where you are: outline fallback beside the grouped bar without a window header or right rail",
    covers: { cases: ["width", "ui"], commands: ["outline.toggle"] },
    options: { config: "[ui]\nwindow_header = false\nright_rail = false\n" },
    run: async (s) => {
      await onTopBar(s, "▤");
      await s.see("Outline");
      s.expect(s.topBar().includes("◈"), "location remains beside outline");
    },
  },
];
