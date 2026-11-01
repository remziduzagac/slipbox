// Home before its first walk: notes and folders added, moved or renamed while the watcher runs.

import { mkdirSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Check, explorerOpen, switcherListed } from "../check.ts";
import type { Session } from "../session.ts";
import { crumbs } from "../support/links.ts";
import { markOf, UNWALKED } from "../support/vaults.ts";

// --- home before its walk (#16) ---------------------------------------------------------------------------------

/** Home never walked while a check runs, as `UNWALKED`, and the watcher looking again every 200 ms, not every two s. */
const UNWALKED_QUICK = `${UNWALKED}\n[watch]\npoll_ms = 200\n`;

/**
 * A journal in home beside the reference set's (VV-D2): its index at its top, six days a folder or two down — dated an
 * hour back, as a person's folders are, so the watcher has no reason to look at them again.
 */
function journal(s: Session): void {
  if (s.exists("~/journal/index.md")) return;
  s.write("~/journal/index.md", "# Journal\n\nA day at a time.\n");
  for (const m of ["01", "02"])
    for (let d = 1; d <= 3; d++) s.write(`~/journal/2025/m${m}/day-${d}.md`, `# 2025-${m}-0${d}\n\nA day.\n`);
  const before = new Date(Date.now() - 3_600_000);
  for (const d of ["", "journal", "journal/2025", "journal/2025/m01", "journal/2025/m02"])
    utimesSync(join(s.home, d), before, before);
}

/** The note switcher, `query` typed: whether it lists `path` (a note the graph knows); closed again. */
async function switcherLists(s: Session, query: string, path: string): Promise<boolean> {
  await s.keys("ctrl+p");
  await s.see(/Open (note|\()/);
  await s.type(query);
  await s.settle();
  const has = switcherListed(s, path);
  await s.keys("escape");
  await s.notSee(/Open (note|\()/);
  return has;
}

/** Until the switcher lists `path`: the watcher's batch comes in its own time. */
async function untilListed(s: Session, query: string, path: string): Promise<void> {
  let has = false;
  await s.retry(
    async () => {
      has = await switcherLists(s, query, path);
    },
    () => has,
    `the switcher to list ${path}`,
  );
}

/** Not in the switcher, a second after the batch that would have brought it (the watcher looks again every 200 ms). */
async function neverListed(s: Session, query: string, path: string, what: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 1000));
  s.expect(!(await switcherLists(s, query, path)), what);
}

export const UNWALKED_HOME: Check[] = [
  {
    area: "links-and-files",
    name: "home: before its first walk, a note saved in a folder of home comes, nothing a folder down — nor a folder's made just before slipbox started, nor for a shell's history rewritten in ~",
    covers: { cases: ["vault", "watching", "switcher"], commands: ["switcher.open"] },
    options: {
      home: true,
      startAt: "home",
      config: UNWALKED_QUICK,
      setup: (s) => {
        journal(s);
        // A folder made the moment before slipbox starts: looked at again at once — its own note, nothing below it.
        if (!s.exists("~/fresh/own.md")) {
          s.write("~/fresh/own.md", "# Fresh\n");
          s.write("~/fresh/deep/x.md", "# Deep in fresh\n");
        }
      },
    },
    run: async (s) => {
      await s.where("~");
      await untilListed(s, "own", "fresh/own.md");
      await neverListed(s, "Deep in", "fresh/deep/x.md", "a folder made before the start: nothing below it read");
      // A shell's history rewritten in ~, by a file put in its place: nothing taken in.
      writeFileSync(join(s.home, ".zsh_history.new"), "ls\npwd\n");
      renameSync(join(s.home, ".zsh_history.new"), join(s.home, ".zsh_history"));
      await neverListed(s, "2025-01-01", "journal/2025/m01/day-1.md", "history rewritten: nothing of journal read");
      // A note saved in journal: it comes, and journal's own index with it; the days below never.
      s.write("~/journal/saved.md", "# Saved\n");
      await untilListed(s, "Saved", "journal/saved.md");
      await untilListed(s, "Journal", "journal/index.md");
      await neverListed(s, "2025-01-01", "journal/2025/m01/day-1.md", "a note saved in journal: the days below unread");
    },
  },
  {
    area: "links-and-files",
    name: "home: before its first walk, a folder come into home's top is listed ◐, its notes the walk's; one saved in it comes; walked while nobody works, they're all there",
    covers: { cases: ["vault", "watching", "explorer", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home", config: UNWALKED_QUICK, setup: journal },
    run: async (s) => {
      await s.where("~");
      // A folder cloned into ~: listed, home's walk to come, nothing in it read.
      s.write("~/cloned/x/deep.md", "# Deep in cloned\n");
      await explorerOpen(s);
      await s.until(() => markOf(s, "cloned") === "◐", 5000, "cloned listed, home's walk to come: ◐");
      await s.keys("escape");
      await neverListed(s, "Deep in", "cloned/x/deep.md", "a folder come into home's top: nothing in it read");
      // Watched: a note saved in it comes.
      s.write("~/cloned/top.md", "# Top of cloned\n");
      await untilListed(s, "Top of", "cloned/top.md");
      await neverListed(s, "Deep in", "cloned/x/deep.md", "a note saved in cloned: nothing below it read");
      // Nobody working for a second: home walked, and everything in cloned there.
      const config = join(s.dir, "config", "slipbox", "config.toml");
      writeFileSync(config, readFileSync(config, "utf8").replace("idle_seconds = 86400", "idle_seconds = 1"));
      // No key pressed meanwhile: the explorer, still shown, says when it's done.
      await s.until(() => markOf(s, "cloned") === "●", 30_000, "home walked while nobody works: cloned ●");
      await untilListed(s, "Deep in", "cloned/x/deep.md");
      await untilListed(s, "2025-01-01", "journal/2025/m01/day-1.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: before its first walk, a note moved is followed where it went — into a folder made, its folder renamed — nothing below read; nor for a note of the same name",
    covers: { cases: ["vault", "watching", "explorer", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home", config: UNWALKED_QUICK, setup: journal },
    run: async (s) => {
      await s.where("~");
      s.write("~/journal/saved.md", "# Saved\n");
      await untilListed(s, "Saved", "journal/saved.md");
      await untilListed(s, "Journal", "journal/index.md");
      // Moved into a folder that was there (journal/2025, never read): followed there, its days still unread.
      renameSync(join(s.home, "journal", "saved.md"), join(s.home, "journal", "2025", "kept.md"));
      await untilListed(s, "Saved", "journal/2025/kept.md");
      s.expect(!(await switcherLists(s, "Saved", "journal/saved.md")), "the note moved: gone from where it was");
      await neverListed(s, "2025-01-01", "journal/2025/m01/day-1.md", "a note moved into 2025: its days unread");
      // Moved on from there, under another name, into a folder made in journal: 2025 unwatched, the note followed into
      // it is looked at every tick — seen to go, and followed again.
      mkdirSync(join(s.home, "journal", "new"));
      renameSync(join(s.home, "journal", "2025", "kept.md"), join(s.home, "journal", "new", "b.md"));
      await untilListed(s, "Saved", "journal/new/b.md");
      s.expect(!(await switcherLists(s, "Saved", "journal/2025/kept.md")), "moved on: gone from where it was");
      // Another, saved in journal and moved under another name into new: followed there too.
      s.write("~/journal/second.md", "# Second\n");
      await untilListed(s, "Second", "journal/second.md");
      renameSync(join(s.home, "journal", "second.md"), join(s.home, "journal", "new", "second-b.md"));
      await untilListed(s, "Second", "journal/new/second-b.md");
      // journal renamed: its notes known followed under the new name; the days below it never read; the folder listed.
      renameSync(join(s.home, "journal"), join(s.home, "diary"));
      await untilListed(s, "Saved", "diary/new/b.md");
      await untilListed(s, "Second", "diary/new/second-b.md");
      await untilListed(s, "Journal", "diary/index.md");
      await neverListed(s, "2025-01-01", "diary/2025/m01/day-1.md", "journal renamed: the days below it unread");
      await explorerOpen(s);
      await s.until(() => markOf(s, "diary") === "◐", 5000, "diary listed, home's walk to come: ◐");
      await s.keys("escape");
      // A known note deleted, a copy of it kept with its times in a folder left as it was: no move.
      s.write("~/diary/old.md", "# Old note\n");
      await untilListed(s, "Old note", "diary/old.md");
      s.write("~/diary/backup/old.md", "# Old note\n");
      const before = new Date(Date.now() - 3_600_000);
      for (const f of ["diary/old.md", "diary/backup/old.md", "diary/backup"])
        utimesSync(join(s.home, f), before, before);
      // (Past the two seconds and a tick the watcher allows a folder a note moved into: the copy made long before.)
      await new Promise((r) => setTimeout(r, 3000));
      rmSync(join(s.home, "diary", "old.md"));
      await neverListed(s, "Old note", "diary/backup/old.md", "a copy in a folder unchanged since: no move");
      // A folder moved out of home, a copy of it kept with its times (`cp -a`) in diary: no move.
      s.write("~/archive/a1.md", "# Archived\n");
      await untilListed(s, "Archived", "archive/a1.md");
      s.write("~/diary/archive-bak/a1.md", "# Archived\n");
      for (const f of ["archive/a1.md", "diary/archive-bak/a1.md", "diary/archive-bak"])
        utimesSync(join(s.home, f), before, before);
      await new Promise((r) => setTimeout(r, 3000));
      s.write("~/diary/tick.md", "# Tick\n"); // diary listed again: archive-bak found
      renameSync(join(s.home, "archive"), join(s.dir, "tmp", "archive"));
      await untilListed(s, "Tick", "diary/tick.md");
      await neverListed(s, "Archived", "diary/archive-bak/a1.md", "a folder moved out, its copy kept: no move");
      // A known note deleted as a folder comes holding one of the same name: no move, nothing below it read.
      rmSync(join(s.home, "todo.md"));
      s.write("~/bulk/todo.md", "# Another to-do list\n");
      s.write("~/bulk/x/n.md", "# Deep in bulk\n");
      await untilListed(s, "Another to-do", "bulk/todo.md");
      await neverListed(s, "Deep in", "bulk/x/n.md", "a same-named note: bulk not read for it");
    },
  },
  {
    area: "links-and-files",
    name: "home: a folder opened by name before home's walk — a folder made in it taken in at once; renamed, its notes follow it, a folder down too, never into a vault made in it",
    covers: { cases: ["vault", "watching", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home/journal", config: UNWALKED_QUICK, setup: journal },
    run: async (s) => {
      await s.where("journal", /journal\/index\.md/); // its own workspace (WSP-D4)
      // `slipbox ~/journal`: walked whole; a folder made in it, taken in at once.
      s.write("~/journal/fresh/sub/f.md", "# Fresh day\n");
      await untilListed(s, "Fresh day", "journal/fresh/sub/f.md");
      // A folder come into home's top: the folder taken in still watched, a note saved in it seen.
      mkdirSync(join(s.home, "elsewhere"));
      await explorerOpen(s);
      await s.keys("-"); // the view at ~, above the folder opened
      await s.until(
        () => /^~ ›/.test(crumbs(s)) && markOf(s, "elsewhere") === "◐",
        5000,
        "elsewhere listed in ~, home's walk to come: ◐",
      );
      await s.keys("escape");
      s.write("~/journal/fresh/sub/g.md", "# Fresh again\n");
      await untilListed(s, "Fresh again", "journal/fresh/sub/g.md");
      // Renamed, and a vault made in it at once: its notes follow, a folder down too — never the vault's.
      renameSync(join(s.home, "journal"), join(s.home, "diary"));
      mkdirSync(join(s.home, "diary", "2025", "m02", ".slipbox"));
      await untilListed(s, "2025-01-01", "diary/2025/m01/day-1.md");
      await untilListed(s, "Fresh day", "diary/fresh/sub/f.md");
      await neverListed(s, "2025-02-01", "diary/2025/m02/day-1.md", "a vault made in it: its notes never home's");
    },
  },
];
