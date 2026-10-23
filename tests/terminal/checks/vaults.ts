// Vaults, home and Elsewhere, the explorer's view and its rows' marks, links followed only when you say so, the peek
// and the git panel following the vault (VV): the features the workstream built and its review's fixes changed, a
// check each, on the reference set or a fixture each check builds in its own folder.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  type Check,
  downloadsElsewhere,
  EXPLORER,
  explorerOpen,
  explorerRow,
  follow,
  leader,
  open,
  opened,
} from "../check.ts";
import { CheckFailed, type Session } from "../session.ts";
import { ARCHITECTURE, crumbs, lastMessage, listed, PEEK_HINT, toLink } from "./links-and-files.ts";

/**
 * Home never walked while a check runs: the background index off, and the TUI's own walk of home, made while nobody
 * works, a day away — what a folder of home shows at once is what was asked for, nothing more.
 */
const UNWALKED = "[index]\nbackground = false\nidle_seconds = 86400\n";

/** Room in the explorer for what describes a row (VV-D9): a link's target and whether it's followed, whole. */
const WIDE = "[ui]\nsidebar_width = 50\n";

/** The index's marks at a row's end (VV-D9), in the unicode glyphs: indexed, indexing, not indexed, can't read, a
 *  problem. */
const MARKS = "●◐⊘⚿⚠";

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The explorer's rows under its breadcrumb, each to the pane's border, found again on each row: a wide character
 * before it (an emoji in a name) takes two columns and one character.
 */
function paneRows(s: Session): string[] {
  const rows = s.screen();
  const title = rows.findIndex((r) => EXPLORER.test(r));
  if (title < 0) return [];
  const border = [...rows[title]!].findIndex((c) => c === "│" || c === "┃");
  return rows.slice(title + 2, -1).map((r) => {
    const cs = [...r];
    let at = border;
    while (at > border - 4 && cs[at] !== "┃" && cs[at] !== "│") at--;
    return cs.slice(0, cs[at] === "┃" || cs[at] === "│" ? at : border).join("");
  });
}

/**
 * What the explorer's row named `name` has after its name (VV-D9): what describes it (a link's target and its state),
 * and the index's mark in its last column ("" for none); null while no row has that name. The row selected while the
 * explorer has the keys draws its menu's button there instead: a check reads the others.
 */
function rowEnd(s: Session, name: string): { describe: string; mark: string } | null {
  const re = new RegExp(`(^|\\s)${escaped(name)}(?=\\s|$)`);
  for (const r of paneRows(s)) {
    const m = re.exec(r);
    if (!m) continue;
    const rest = r.slice(m.index + m[0].length).replace(/[\s▐]+$/, "");
    const last = [...rest].at(-1) ?? "";
    const mark = MARKS.includes(last) ? last : "";
    return { describe: (mark ? rest.slice(0, -mark.length) : rest).trim(), mark };
  }
  return null;
}

/** The index's mark at the end of the explorer's row named `name`. */
const markOf = (s: Session, name: string) => rowEnd(s, name)?.mark ?? null;

/** A tab in the tab strip: its number, its file's name, its close button. */
const tab = (n: number | string, name: string) => new RegExp(` ${n} ${escaped(name)}\\s+×`);

/** ctrl+q, and slipbox gone: the session kept as a quit keeps it. */
async function quits(s: Session): Promise<void> {
  await s.keys("ctrl+q");
  await s.until(() => s.exited(), 5000, "ctrl+q to quit");
}

/** A symlink at `path` leading to `target`, unless one is there already (setup runs at every start). */
function symlinkOnce(target: string, path: string): void {
  try {
    lstatSync(path);
    return;
  } catch {}
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path);
}

/** git run in `cwd` as the reference set's owner runs it (HOME the check's), failing the check when it fails. */
function git(s: Session, cwd: string, ...args: string[]): void {
  const r = spawnSync(
    "git",
    [
      "-c",
      "user.email=sam@example.invalid",
      "-c",
      "user.name=Sam Rivera",
      "-c",
      "commit.gpgsign=false",
      "-C",
      cwd,
    ].concat(args),
    { encoding: "utf8", env: { ...process.env, HOME: s.home } },
  );
  if (r.status !== 0) throw new CheckFailed(`git ${args.join(" ")} in ${cwd}: exit ${r.status}\n${r.stderr}`);
}

/**
 * Folders of home beside the reference set's (VV-D2): household's last policy a folder down, and garden — dated an
 * hour back, as a person's folders are. Made the moment before slipbox starts, they would be new to its watcher: a
 * folder changed in the two seconds before it watches is looked at again, its own notes taken in, garden's among them,
 * whatever home's walk has done (the folders in it are left to that walk).
 */
function homeFolders(s: Session): void {
  if (s.exists("~/garden/plan.md")) return;
  s.write("~/household/archive/2025-policy.md", "# Last year's policy\n\nThe one the renewal replaces.\n");
  s.write("~/garden/plan.md", "# Garden plan\n\nBeds by the fence, herbs by the door.\n");
  s.write("~/garden/seeds.md", "# Seeds\n\nWhat to sow in spring.\n");
  const before = new Date(Date.now() - 3_600_000);
  for (const d of ["", "garden", "household", "household/archive"]) utimesSync(join(s.home, d), before, before);
}

/** The shelf: a folder of home outside the notes vault, linked from it (`~/notes/shelf`), and a note there through the
 *  link. */
function shelf(s: Session): void {
  if (!s.exists("~/shelf/far.md")) s.write("~/shelf/far.md", "# Far\n\nA note kept on the shelf.\n");
  if (!s.exists("~/notes/to-shelf.md"))
    s.write("~/notes/to-shelf.md", "# To the shelf\n\nWhat's kept on [the shelf](shelf/far.md).\n");
  symlinkOnce(s.path("~/shelf"), s.path("~/notes/shelf"));
}

/** The link's question in notes for `~/notes/shelf` leading to `to` (VV-D6). */
const asked = (to: string) => `~/notes/shelf → ${to} leads out of notes: follow it?`;

// --- home -------------------------------------------------------------------------------------------------------

const HOME: Check[] = [
  {
    area: "links-and-files",
    name: "home: a folder of home opened by name — its notes there at once, home never walked; its own note open, not home's",
    covers: { cases: ["vault", "opening", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home/household", config: UNWALKED, setup: homeFolders },
    run: async (s) => {
      // Its own note: the one directly in it, before the one a folder down that comes first by path; never home's own
      // README.md, at its top.
      await s.status(/ ~ .*household\/bike-insurance\.md/);
      await s.see("Bike insurance");
      // The view at the folder opened, home above it.
      await explorerOpen(s);
      await s.until(() => /^~ › household ›$/.test(crumbs(s)), 3000, "the breadcrumb: ~ › household ›");
      await s.keys("escape");
      // Its notes, a folder down too, known at once — and only its: another folder of home isn't walked.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("garden");
      s.expect(s.rowOf("garden/plan.md") < 0, "another folder of home never walked: garden's notes not in the list");
      await s.keys("escape");
      await open(s, "2025-policy");
      await opened(s, "household/archive/2025-policy.md");
      await s.see("The one the renewal replaces.");
    },
  },
  {
    area: "links-and-files",
    name: "home: a folder of home gone into from the explorer — a note of it opened from a vault: into home, the folder's notes there at once",
    covers: { cases: ["vault", "explorer", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home/notes/index.md", config: UNWALKED, setup: homeFolders },
    run: async (s) => {
      await s.status(/ notes .*index\.md/);
      await explorerOpen(s);
      await s.until(() => /^~ › \S+ notes ›$/.test(crumbs(s)), 3000, "the view at notes");
      // -: the view at ~, home's folders listed a level at a time; household unfolded in place.
      await s.keys("-");
      await s.until(() => /^~ ›/.test(crumbs(s)) && listed(s, /\shousehold$/), 3000, "the view at ~");
      await explorerRow(s, "household");
      await s.keys("l");
      await s.until(() => listed(s, /\sbike-insurance\.md$/), 3000, "household unfolded");
      // Its note opened: into home (VV-D4), the note open there.
      await explorerRow(s, "bike-insurance\\.md");
      await s.keys("enter");
      await s.status(/ ~ .*household\/bike-insurance\.md/, 5000);
      // household walked as it was gone into: its note a folder down known, home's walk still to make.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("2025-policy");
      await s.see("household/archive/2025-policy.md");
      await s.keys("escape");
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("garden");
      s.expect(s.rowOf("garden/plan.md") < 0, "another folder of home never walked: garden's notes not in the list");
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "home: each folder of home opened by name keeps its own tabs — two folders in turn, each brought back as left; home's top its own",
    covers: { cases: ["vault", "tabs"], commands: ["tab.new", "switcher.open", "app.quit"] },
    options: { home: true, startAt: "home/household", config: UNWALKED, setup: homeFolders },
    run: async (s) => {
      // household: its note, and a second tab.
      await s.status(/ ~ .*household\/bike-insurance\.md/);
      await s.keys("ctrl+t", "c");
      await s.see(tab(2, "bike-insurance.md"));
      await open(s, "2025-policy");
      await s.see(tab(2, "2025-policy.md"));
      await quits(s);
      // garden: its own note alone, none of household's tabs.
      await s.restart({ startAt: "home/garden" });
      await s.status(/ ~ .*garden\/plan\.md/);
      s.expect(!/bike-insurance|2025-policy/.test(s.text()), "garden opened on its own note, not household's tabs");
      await s.keys("ctrl+t", "c");
      await s.see(tab(2, "plan.md"));
      await open(s, "seeds");
      await s.see(tab(2, "seeds.md"));
      await quits(s);
      // Each brought back as it was left.
      await s.restart({ startAt: "home/household" });
      await s.see(tab(1, "bike-insurance.md"));
      await s.see(tab(2, "2025-policy.md"));
      s.expect(!/seeds\.md|plan\.md/.test(s.text()), "household's tabs alone");
      await quits(s);
      await s.restart({ startAt: "home/garden" });
      await s.see(tab(1, "plan.md"));
      await s.see(tab(2, "seeds.md"));
      s.expect(!/bike-insurance|2025-policy/.test(s.text()), "garden's tabs alone");
      await quits(s);
      // Home's top: its own, neither folder's.
      await s.restart({ startAt: "home" });
      await s.status(/ ~ /);
      s.expect(
        ![tab("\\d", "2025-policy.md"), tab("\\d", "seeds.md"), tab("\\d", "plan.md")].some((t) => t.test(s.text())),
        "home's top: none of its folders' tabs",
      );
    },
  },
  {
    area: "links-and-files",
    name: "home: its skip list — ~/Downloads opened is left out of home's index, said why; listed in the explorer, ⊘, its folders too",
    covers: { cases: ["vault", "explorer"] },
    options: { home: true, startAt: "home/Downloads", config: UNWALKED },
    run: async (s) => {
      // Nothing opens, and not "no notes": they're there, and home's index leaves them out.
      const said = await lastMessage(s, "left out of home's index");
      s.expect(
        said ===
          "~/Downloads: left out of home's index (Downloads) — its files are listed in the explorer, not indexed",
        `why it's left out: ${said}`,
      );
      // Listed all the same, a level at a time: its files, and its folders not indexed.
      await explorerOpen(s);
      await s.until(() => /^~ › Downloads ›$/.test(crumbs(s)), 3000, "the view at ~/Downloads");
      await s.until(() => listed(s, /\sstray-note\.md$/), 3000, "Downloads' files listed");
      await s.until(() => markOf(s, "old-blog-export") === "⊘", 3000, "a folder in Downloads: ⊘");
      // In home's tree, Downloads itself: ⊘.
      await s.keys("-");
      await s.until(() => /^~ ›/.test(crumbs(s)) && markOf(s, "Downloads") === "⊘", 3000, "Downloads ⊘ in home's tree");
    },
  },
];

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
  const has = s.rowOf(path) >= 0;
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

const UNWALKED_HOME: Check[] = [
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
      await s.status(/ ~ /);
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
      await s.status(/ ~ /);
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
      await s.status(/ ~ /);
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
      await s.status(/ ~ .*journal\/index\.md/);
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

// --- Elsewhere --------------------------------------------------------------------------------------------------

const ELSEWHERE: Check[] = [
  {
    area: "links-and-files",
    name: "Elsewhere: gone into from a vault, its own tabs; back with ctrl+o, the vault's tabs as they were",
    covers: { cases: ["vault", "tabs", "links/travel"], commands: ["tab.new", "note.open", "history.back"] },
    options: { home: true, startAt: "home/notes/index.md", setup: downloadsElsewhere },
    run: async (s) => {
      // notes: two tabs. (Not inbox.md: notes' config makes it its scratch, shown as `scratch`.)
      await s.status(/ notes .*index\.md/);
      await s.keys("ctrl+t", "c");
      await s.see(tab(2, "index.md"));
      await open(s, "sync-rewrite");
      await opened(s, "projects/sync-rewrite.md");
      await s.see(tab(2, "sync-rewrite.md"));
      // A file outside home and every vault, chosen: into Elsewhere (VV-D3, VV-D4), its tabs, none of notes'.
      await s.ex(`e ${join(s.dir, "elsewhere", "stray-note.md")}`);
      await s.status(/ Elsewhere .*stray-note\.md/, 5000);
      await s.notSee(tab("\\d", "sync-rewrite.md"));
      await s.notSee(tab("\\d", "index.md"));
      // Back: notes, its two tabs, at the note left.
      await s.keys("ctrl+o");
      await opened(s, "projects/sync-rewrite.md");
      await s.status(/ notes /);
      await s.see(tab(1, "index.md"));
      await s.see(tab(2, "sync-rewrite.md"));
      await s.notSee(tab("\\d", "stray-note.md"));
    },
  },
];

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
      await s.status(/ ~ /);
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

// --- links ------------------------------------------------------------------------------------------------------

const LINKED: Check[] = [
  {
    area: "links-and-files",
    name: "links: a symlink out of the vault asks first — n not followed, l just looks (read-only, nothing indexed), f follows it, kept",
    covers: { cases: ["links/state", "links/travel", "safety"], commands: ["link.follow", "backlinks.open"] },
    options: { home: true, startAt: "home/notes/to-shelf.md", config: WIDE, setup: shelf },
    run: async (s) => {
      // Opened through the link: asked, saying what a yes allows in a vault.
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.see("read and indexed as notes's, never written to: it's outside the vault");
      await s.see("Just look");
      // n: not followed — nothing opened; the explorer's row says where it leads, and that it isn't followed.
      await s.keys("n");
      await s.notSee(asked("~/shelf"));
      await opened(s, "to-shelf.md");
      await explorerOpen(s);
      await s.keys("escape");
      await s.until(
        () => rowEnd(s, "shelf")?.describe === "→ ~/shelf  not followed" && markOf(s, "shelf") === "⊘",
        3000,
        "the link's row: → ~/shelf  not followed, ⊘",
      );
      // Asked again; l: just looked at — read-only, nothing of it indexed.
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("l");
      await opened(s, "shelf/far.md");
      await s.see("A note kept on the shelf.");
      await s.keys("i");
      const refused = await lastMessage(s, "not editing");
      s.expect(
        refused === "just looking: ~/notes/shelf isn't followed — read-only — not editing",
        `typing refused: ${refused}`,
      );
      await leader(s, "l", "b");
      await s.message("backlinks are kept for the notes of a vault");
      await s.until(() => rowEnd(s, "shelf")?.describe === "→ ~/shelf  just looking", 3000, "the row: just looking");
      // Looking is for this once: started again, asked again; f: followed — read and indexed, its backlink found.
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      await s.restart();
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await opened(s, "shelf/far.md");
      // Followed: the target asked, then the vault walked again through the link and its notes parsed, in the
      // background — the row says so once they're done, indexed.
      await explorerOpen(s);
      await s.keys("escape");
      await s.until(
        () => rowEnd(s, "shelf")?.describe === "→ ~/shelf" && markOf(s, "shelf") === "●",
        20_000,
        "the row: → ~/shelf, followed and indexed ●",
      );
      // Its backlink found: asked until the list shows it (a press while the index catches up says none yet).
      await s.retry(
        async () => {
          if (s.rowOf("Linking to") >= 0) await s.keys("escape");
          await leader(s, "l", "b");
        },
        () => s.rowOf("Linking to far.md (1)") >= 0,
        "far.md's backlink, from to-shelf.md",
        2000,
        20_000,
      );
      await s.keys("escape");
      // Kept: started again, the link opens, nothing asked.
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      await s.restart();
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await opened(s, "shelf/far.md");
      s.expect(!s.text().includes("follow it?"), "followed once: never asked again");
    },
  },
  {
    area: "links-and-files",
    name: "links: a followed link pointed elsewhere asks again — its answer was for where it led",
    covers: { cases: ["links/state", "safety"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/to-shelf.md",
      setup: (s) => {
        if (s.exists("~/notes/to-shelf.md")) return;
        s.write("~/shelf-a/far.md", "# Far\n\nOn shelf A.\n");
        s.write("~/shelf-b/far.md", "# Far\n\nOn shelf B.\n");
        s.write("~/notes/to-shelf.md", "# To the shelf\n\nWhat's kept on [the shelf](shelf/far.md).\n");
        symlinkOnce(s.path("~/shelf-a"), s.path("~/notes/shelf"));
        // Followed to shelf-a, as the question's f keeps it: by the link, and where it led.
        mkdirSync(join(s.dir, "state", "slipbox"), { recursive: true });
        writeFileSync(
          join(s.dir, "state", "slipbox", "links.json"),
          JSON.stringify({
            version: 1,
            links: [{ link: s.path("~/notes/shelf"), target: s.path("~/shelf-a"), answer: "follow", at: "2026-10-16" }],
          }),
        );
      },
    },
    run: async (s) => {
      // Followed: opened, nothing asked.
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await opened(s, "shelf/far.md");
      await s.see("On shelf A.");
      s.expect(!s.text().includes("follow it?"), "followed: nothing asked");
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      // Pointed elsewhere (a pull, an agent): asked again, naming where it leads now; nothing read through it.
      rmSync(s.path("~/notes/shelf"));
      symlinkSync(s.path("~/shelf-b"), s.path("~/notes/shelf"));
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf-b"));
      s.expect(!s.text().includes("On shelf B."), "nothing read through it before the answer");
      await s.keys("n");
      await opened(s, "to-shelf.md");
    },
  },
  {
    area: "links-and-files",
    name: "links: a followed link renamed with r, a relative one moved with m — each moves as a link, still followed, what it leads to where it was; undone, back",
    covers: { cases: ["links/state", "rename", "safety"], commands: ["rename.undo"] },
    options: {
      home: true,
      startAt: "home/notes/to-shelf.md",
      config: WIDE,
      setup: (s) => {
        if (!s.exists("~/notes/to-shelf.md")) {
          s.write("~/shelf/far.md", "# Far\n\nA note kept on the shelf.\n");
          s.write("~/attic/old.md", "# Old\n\nUp in the attic.\n");
          s.write("~/notes/box/kept.md", "# Kept\n");
          s.write("~/notes/to-shelf.md", "# To the shelf\n\nWhat's kept on [the shelf](shelf/far.md).\n");
        }
        symlinkOnce(s.path("~/shelf"), s.path("~/notes/shelf"));
        symlinkOnce("../attic", s.path("~/notes/attic")); // relative
        // Both followed, as the question's f keeps them: by the link, and where it leads.
        mkdirSync(join(s.dir, "state", "slipbox"), { recursive: true });
        const follow = (link: string, target: string) => ({ link, target, answer: "follow", at: "2026-10-23" });
        writeFileSync(
          join(s.dir, "state", "slipbox", "links.json"),
          JSON.stringify({
            version: 1,
            links: [
              follow(s.path("~/notes/shelf"), s.path("~/shelf")),
              follow(s.path("~/notes/attic"), s.path("~/attic")),
            ],
          }),
        );
      },
    },
    run: async (s) => {
      // r on the link's row: the link itself renamed, the note linking through it following.
      await explorerOpen(s);
      await explorerRow(s, "shelf");
      await s.keys("r");
      await s.see("rename shelf/ to:");
      await s.keys("ctrl+u");
      await s.type("shelved");
      await s.keys("enter");
      await s.see("shelf/ → shelved/: 1 change in 1 file");
      await s.keys("enter");
      await s.message("moved shelf/ → shelved/");
      s.expect(lstatSync(s.path("~/notes/shelved")).isSymbolicLink(), "the link renamed, a link still");
      s.expect(s.exists("~/shelf/far.md") && !s.exists("~/notes/shelf"), "what it leads to where it was");
      s.expect(s.read("~/notes/to-shelf.md").includes("(shelved/far.md)"), "the link to it follows");
      // Still followed, and indexed: its row says where it leads, nothing asked going through it.
      await s.keys("escape");
      await s.until(
        () => rowEnd(s, "shelved")?.describe === "→ ~/shelf" && markOf(s, "shelved") === "●",
        20_000,
        "the row: → ~/shelf, followed and indexed ●",
      );
      await toLink(s, "shelved/far.md");
      await s.keys("enter");
      await opened(s, "shelved/far.md");
      await s.see("A note kept on the shelf.");
      s.expect(!s.text().includes("follow it?"), "renamed, still followed: nothing asked");
      // Watched through its new name: changed from outside, it's read again.
      writeFileSync(s.path("~/shelf/far.md"), "# Far\n\nMoved along the shelf.\n");
      await s.see("Moved along the shelf.", 10_000);
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      // m on the relative one: into box, written again to lead where it did, and said so.
      await explorerOpen(s);
      await explorerRow(s, "attic");
      await s.keys("m");
      await s.see("Move attic/ to…");
      await s.type("box");
      await s.keys("enter");
      await s.see("attic is a relative link: written again at box/attic to lead where it did (../../attic)");
      await s.keys("enter");
      await s.message("moved attic/ → box/attic/");
      s.expect(readlinkSync(s.path("~/notes/box/attic")) === "../../attic", "written again from box");
      await s.keys("escape");
      await s.until(() => markOf(s, "attic") === "●", 20_000, "box/attic followed and indexed ●");
      // Undone, newest first: each link back where it was, as it was written.
      for (const [from, to] of [
        ["box/attic", "attic"],
        ["shelved", "shelf"],
      ]) {
        await leader(s, "v", "shift+u");
        await s.see(`undo: ${from}/ → ${to}/`);
        await s.keys("enter");
        await s.message(`moved ${from}/ back to`); // the toast wraps the rest
      }
      s.expect(readlinkSync(s.path("~/notes/attic")) === "../attic", "the relative link as it was written");
      s.expect(lstatSync(s.path("~/notes/shelf")).isSymbolicLink(), "the renamed link back");
      s.expect(s.read("~/notes/to-shelf.md").includes("(shelf/far.md)"), "the note linking to it as it was");
    },
  },
  {
    area: "links-and-files",
    name: "links: a symlink within the vault never asks — a note's second name opened; a folder's, the folder it names",
    covers: { cases: ["links/state", "links/travel"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/to-kept.md",
      config: WIDE,
      setup: (s) => {
        if (!s.exists("~/notes/to-kept.md")) {
          s.write("~/notes/.shelved/kept.md", "# Kept\n\nShelved, and still the vault's.\n");
          s.write("~/notes/to-kept.md", "# To what's kept\n\nWhat's [kept](kept.md).\n");
        }
        symlinkOnce(".shelved/kept.md", s.path("~/notes/kept.md"));
        symlinkOnce("projects", s.path("~/notes/again"));
      },
    },
    run: async (s) => {
      // A note's link, its target inside the vault: opened, nothing asked.
      await toLink(s, "kept.md");
      await s.keys("enter");
      await opened(s, "kept.md");
      await s.see("Shelved, and still the vault's.");
      s.expect(!s.text().includes("follow it?"), "a link within the vault: nothing asked");
      // A folder's: its row says where it leads, never "not followed"; opened, the folder it names.
      await explorerOpen(s);
      await s.keys("escape");
      await s.until(
        () => rowEnd(s, "again")?.describe === "→ ~/notes/projects",
        3000,
        "again's row: → ~/notes/projects",
      );
      await explorerOpen(s);
      await explorerRow(s, "again");
      await s.keys("enter");
      await s.message("again is a second name for projects");
      s.expect(!s.text().includes("follow it?"), "a folder's second name: nothing asked");
    },
  },
  {
    area: "links-and-files",
    name: "links: in Elsewhere every link asks, even one beside its target — what a yes allows there, the file system's say",
    covers: { cases: ["links/state", "vault"] },
    options: {
      startAt: "loose",
      setup: (s) => {
        const loose = join(s.dir, "loose");
        if (existsSync(loose)) return;
        mkdirSync(loose);
        writeFileSync(join(loose, "a.md"), "# A\n\nThe note itself.\n");
        symlinkSync("a.md", join(loose, "b.md"));
      },
    },
    run: async (s) => {
      await s.status(/ Elsewhere\b/);
      // The file itself: opened, nothing asked.
      await explorerOpen(s);
      await explorerRow(s, "a\\.md");
      await s.keys("enter");
      await s.status(/ Elsewhere .*a\.md/);
      s.expect(!s.text().includes("Just look"), "a file, no link: nothing asked");
      // Its link beside it: asked — outside home, so agents are said to see what's followed (a heading, in capitals).
      await explorerOpen(s);
      await explorerRow(s, "b\\.md");
      await s.keys("enter");
      await s.see(/b\.md → /);
      await s.see(/a\.md is outside your home folder/i);
      await s.see("read and written as the file system allows");
      await s.see("Just look");
      await s.keys("f");
      await s.status(/ Elsewhere .*b\.md/, 5000);
      await s.see("The note itself.");
    },
  },
];

// --- the peek ---------------------------------------------------------------------------------------------------

const PEEKED: Check[] = [
  {
    area: "links-and-files",
    name: "peek: another vault's note read in a peek is read-only — typing refused, said; the file as it was (VV-D7)",
    covers: { cases: ["links/travel", "vault"], commands: ["link.follow"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      const file = "~/work/kestrel/docs/architecture.md";
      const before = s.read(file);
      await follow(s, ARCHITECTURE);
      await s.see("kestrel › docs/architecture.md", 5000);
      await s.see(PEEK_HINT);
      await s.keys("i");
      await s.message("a peek is read-only");
      await s.keys("x");
      await s.see(PEEK_HINT);
      s.expect(s.read(file) === before, "the peeked file as it was");
      await s.keys("escape");
      await s.notSee(PEEK_HINT);
      await opened(s, "index.md");
    },
  },
];

// --- the git panel ----------------------------------------------------------------------------------------------

/**
 * A vault of repositories (`projects/`, a `.slipbox/` of its own): alpha clean; beta clean, its worktree beside it
 * (`beta-agent`, on `agent`) with a new file, an agent's work to review; gamma with a change not committed.
 */
function repositories(s: Session): void {
  const top = join(s.dir, "projects");
  if (existsSync(top)) return;
  mkdirSync(join(top, ".slipbox"), { recursive: true });
  writeFileSync(join(top, "a.md"), "# Projects\n\nThe repositories this folder holds.\n");
  for (const name of ["alpha", "beta", "gamma"]) {
    const repo = join(top, name);
    mkdirSync(repo);
    writeFileSync(join(repo, "x.md"), `# ${name}\n`);
    git(s, repo, "init", "-q", "-b", "main");
    git(s, repo, "add", "-A");
    git(s, repo, "commit", "-q", "-m", "start");
  }
  writeFileSync(join(top, "gamma", "x.md"), "# gamma, changed\n");
  git(s, join(top, "beta"), "worktree", "add", "-q", "-b", "agent", join(top, "beta-agent"), "main");
  writeFileSync(join(top, "beta-agent", "y.md"), "# Y\n");
}

const GIT_PANEL: Check[] = [
  {
    area: "links-and-files",
    name: "git panel: in a vault of repositories they're the panel, by what needs attention; one opened up, its checkouts and changes, a change's diff; o goes into one (VV-D10)",
    covers: { cases: ["git", "vault", "multiple-roots"], commands: ["git.view"] },
    options: { startAt: "projects/a.md", config: "[ui]\nsidebar_width = 90\n", setup: repositories },
    run: async (s) => {
      await s.status(/projects\b.*a\.md/);
      await leader(s, "g");
      await s.status("GIT");
      await s.see(/projects holds 3 repositories/, 10_000);
      // By what needs attention, as git says: beta's worktree to review, gamma's change, alpha clean.
      const repo = (name: string) => s.rowOf(new RegExp(`[▸▾] ${name}(\\s|$)`));
      await s.until(
        () => repo("beta") >= 0 && repo("beta") < repo("gamma") && repo("gamma") < repo("alpha"),
        15_000,
        "beta, gamma, alpha: by what needs attention",
      );
      await s.see(/▸ beta\b.*✎1.*◆/);
      await s.see(/▸ gamma\b.*✎1/);
      await s.see(/▸ alpha\b.*clean/);
      // The first, opened up in place: its checkouts, the main one and the worktree by its branch; the worktree's file.
      await s.keys("g", "g");
      await s.see("enter open up");
      await s.keys("enter");
      await s.see(/▾ beta\b/);
      await s.see(/● main .*\/projects\/beta(?!-)/);
      await s.see(/⎇ agent .*\/projects\/beta-agent\b/);
      await s.see(/\? y\.md/, 5000);
      // Its change: its diff, against the last commit; esc back to the panel.
      await s.keys("j", "j", "j");
      await s.see("enter diff");
      await s.keys("enter");
      await s.see(/beta-agent: y\.md against its last commit/);
      await s.keys("escape");
      await s.notSee(/y\.md against its last commit/);
      // o on the last, alpha: gone into.
      await s.keys("shift+g");
      await s.see("o go in");
      await s.keys("o");
      await s.status(/alpha · main/, 5000);
    },
  },
];

export const VAULTS: Check[] = [
  ...HOME,
  ...UNWALKED_HOME,
  ...ELSEWHERE,
  ...VIEW,
  ...MARKED,
  ...LINKED,
  ...PEEKED,
  ...GIT_PANEL,
];
