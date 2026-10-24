// Vaults, home and Elsewhere, the explorer's view and its rows' marks, links followed only when you say so, the peek
// and the git panel following the vault (VV): the features the workstream built and its review's fixes changed, a
// check each, on the reference set or a fixture each check builds in its own folder.

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
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
  inSwitcher,
  leader,
  open,
  opened,
  switcherListed,
} from "../check.ts";
import { CheckFailed, type Session, Skipped, sleep } from "../session.ts";
import { ARCHITECTURE, crumbs, lastMessage, listed, messagesSaying, PEEK_HINT, toLink } from "./links-and-files.ts";

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
export const markOf = (s: Session, name: string) => rowEnd(s, name)?.mark ?? null;

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

/** Home's folders (`homeFolders`), then walked and kept by the command line, as an agent's first command there walks
 *  it; `more` changes home after that. Setup runs at every start: this, once. */
function homeWalked(s: Session, more?: (s: Session) => void): void {
  const once = join(s.dir, "home-walked"); // not a file of home's: a folder of it may not be readable by then
  if (existsSync(once)) return;
  writeFileSync(once, "");
  homeFolders(s);
  s.cliIn("~/", "ls");
  more?.(s);
}

/** Home's walk kept, in the check's cache (`walk.json`, VV-D2). */
function walkJson(s: Session): string {
  const cache = join(s.dir, "cache");
  const rel = (readdirSync(cache, { recursive: true }) as string[]).find((f) => f.endsWith("walk.json"));
  if (!rel) throw new CheckFailed("home's walk isn't kept");
  return join(cache, rel);
}

/** The stamp home's walk kept has for folder `d` (its mtime and ctime): null when it has none, undefined when the
 *  folder isn't in the walk (#12). */
function stampOf(s: Session, d: string): [number, number] | null | undefined {
  const kept = JSON.parse(readFileSync(walkJson(s), "utf8"));
  const i = kept.dirs.indexOf(d);
  return i < 0 ? undefined : (kept.times?.[i] ?? null);
}

/** Home's walk kept as if it had seen folder `d` as it is now: its stamp its mtime and ctime (#12). */
function restampOf(s: Session, d: string): void {
  const file = walkJson(s);
  const kept = JSON.parse(readFileSync(file, "utf8"));
  const i = kept.dirs.indexOf(d);
  if (i < 0) throw new CheckFailed(`${d || "home's top"} isn't in the walk kept`);
  const st = statSync(d ? s.path(`~/${d}`) : s.home);
  kept.times[i] = [st.mtimeMs, st.ctimeMs];
  writeFileSync(file, JSON.stringify(kept));
}

/** A tool run as a person runs it in a shell (`cp -a`, `tar`), failing the check when it fails. */
function shell(cmd: string, ...args: string[]): void {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new CheckFailed(`${cmd} ${args.join(" ")}: exit ${r.status}\n${r.stderr}`);
}

/** The quick switcher, `name` typed: `rel` listed, or (`listed: false`) not, once it has settled. */
async function switcherShows(s: Session, name: string, rel: string, listed = true): Promise<void> {
  await s.keys("ctrl+p");
  await s.see(/Open (note|\()/);
  await s.type(name);
  if (listed) await s.see(rel);
  else {
    await s.settle();
    s.expect(s.rowOf(rel) < 0, `${rel} not in the switcher's list`);
  }
  await s.keys("escape");
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
      // README.md, at its top. The top bar names the folder after home: its workspace (WSP-D4).
      await s.where("household", /household\/bike-insurance\.md/);
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
      await s.where(/^notes(?: │|$)/, /index\.md/);
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
      await s.where("~", /household\/bike-insurance\.md/, 5000); // a note of it opened: home's own
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
      // household: its note, and a second tab; the top bar names its workspace (WSP-D4).
      await s.where("household", /household\/bike-insurance\.md/);
      await s.keys("ctrl+t", "c");
      await s.see(tab(2, "bike-insurance.md"));
      await open(s, "2025-policy");
      await s.see(tab(2, "2025-policy.md"));
      await quits(s);
      // garden: its own note alone, none of household's tabs.
      await s.restart({ startAt: "home/garden" });
      await s.where("garden", /garden\/plan\.md/);
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
      await s.where("~");
      s.expect(
        ![tab("\\d", "2025-policy.md"), tab("\\d", "seeds.md"), tab("\\d", "plan.md")].some((t) => t.test(s.text())),
        "home's top: none of its folders' tabs",
      );
    },
  },
  {
    area: "links-and-files",
    name: "home: its tabs brought back — one in a folder home's walk hasn't reached has its folder's notes at once, its backlinks there",
    covers: {
      cases: ["vault", "tabs", "switcher", "links/backlinks"],
      commands: ["switcher.open", "backlinks.open", "app.quit"],
    },
    options: { home: true, startAt: "home/household/bike-insurance.md", config: UNWALKED, setup: homeFolders },
    run: async (s) => {
      // A note of household opened by its path, left open: home's top keeps it as its tab.
      await opened(s, "household/bike-insurance.md");
      await quits(s);
      // Home's top: the tab back, its folder walked as it opens — a note a folder down known, never opened.
      await s.restart({ startAt: "home" });
      await s.see(tab(1, "bike-insurance.md"));
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("2025-policy");
      await s.see("household/archive/2025-policy.md");
      await s.keys("escape");
      // What was asked for alone: another folder of home isn't walked.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("garden");
      s.expect(s.rowOf("garden/plan.md") < 0, "another folder of home never walked: garden's notes not in the list");
      await s.keys("escape");
      // Watched as it's walked: a note made in it now comes in.
      s.write("~/household/new-quote.md", "# New quote\n\nA third insurer's.\n");
      await inSwitcher(s, "new-quote", "household/new-quote.md");
      await s.keys("escape");
      // Searched too: a note of it never opened.
      await leader(s, "f", "s");
      await s.type("renewal");
      await s.see("household/archive/2025-policy.md:", 5000);
      await s.keys("escape");
      // The tab's note links to home's todo.md: a backlink there.
      await open(s, "todo");
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.see("household/bike-insurance.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: its tabs brought back — a split's other window's folder walked too; a file gone, or one in Downloads, walks nothing",
    covers: { cases: ["vault", "tabs", "switcher"], commands: ["window.split_side", "tab.new", "app.quit"] },
    options: {
      home: true,
      startAt: "home/household/bike-insurance.md",
      config: UNWALKED,
      setup: (s) => {
        homeFolders(s);
        if (!s.exists("~/old/kept.md")) s.write("~/old/kept.md", "# Kept\n");
      },
    },
    run: async (s) => {
      await opened(s, "household/bike-insurance.md");
      // A split, garden's plan in its other window; a tab of Downloads; one of a note about to go.
      await s.keys("ctrl+w", "v");
      await s.until(() => s.text().split("§ ").length - 1 === 2, 3000, "two windows");
      await s.ex("e garden/plan.md");
      await opened(s, "garden/plan.md");
      // New tabs by :tabnew, the split kept (ctrl+t c would take its window out into a tab of its own).
      await s.ex("tabnew Downloads/stray-note.md");
      await opened(s, "Downloads/stray-note.md");
      s.write("~/old/gone.md", "# Gone\n");
      await s.ex("tabnew old/gone.md");
      await opened(s, "old/gone.md");
      await quits(s);
      rmSync(s.path("~/old/gone.md"));
      // Home's top: its tabs back (the split named by its window in use), the gone one not.
      await s.restart({ startAt: "home" });
      await s.see(tab(1, "plan.md"));
      await s.see(tab(2, "stray-note.md"));
      // Said, and no tab for it.
      await s.see("cannot read old/gone.md");
      s.expect(!tab("\\d", "gone.md").test(s.text()), "the gone note's tab not brought back");
      // Each window's folder walked, the one in use and the other: a note of each never opened is known.
      await inSwitcher(s, "seeds", "garden/seeds.md");
      await s.keys("escape");
      await inSwitcher(s, "2025-policy", "household/archive/2025-policy.md");
      await s.keys("escape");
      // Nothing walked for the gone file's folder, nor for Downloads.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("kept");
      s.expect(s.rowOf("old/kept.md") < 0, "the gone file's folder not walked: old/kept.md not in the list");
      await s.keys("escape");
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("plan");
      s.expect(s.rowOf("Downloads/plan.md") < 0, "Downloads left out: its plan.md not in the list");
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "home: gone into from another vault, its tabs brought back — their folders walked at once, a backlink there",
    covers: { cases: ["vault", "tabs", "switcher", "links/backlinks"], commands: ["note.open", "backlinks.open"] },
    options: { home: true, startAt: "home/household/bike-insurance.md", config: UNWALKED, setup: homeFolders },
    run: async (s) => {
      await opened(s, "household/bike-insurance.md");
      await quits(s);
      // In the notes vault: home's todo.md opened by its path goes into home, its tabs back with it.
      await s.restart({ startAt: "home/notes/index.md" });
      await s.where(/^notes(?: │|$)/);
      await s.ex(`e ${s.path("~/todo.md")}`);
      await s.where("~", /todo\.md/, 5000);
      await s.see(tab(1, "bike-insurance.md"));
      await inSwitcher(s, "2025-policy", "household/archive/2025-policy.md");
      await s.keys("escape");
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.see("household/bike-insurance.md");
    },
  },
  {
    area: "links-and-files",
    name: "home a repository: a branch's tabs brought back as it's checked out — a folder of home and one only it has walked then",
    covers: { cases: ["vault", "tabs", "git", "search"], commands: ["tab.new", "search.open", "backlinks.open"] },
    options: {
      home: true,
      startAt: "home/household/bike-insurance.md",
      config: UNWALKED,
      setup: (s) => {
        homeFolders(s);
        if (s.exists("~/.git")) return;
        git(s, s.home, "init", "-q", "-b", "main");
        git(s, s.home, "add", "-f", "README.md", "todo.md", "household", "garden");
        git(s, s.home, "commit", "-q", "-m", "home");
        git(s, s.home, "checkout", "-q", "-b", "feat");
        s.write("~/household/2026/quote.md", "# Quote\n\nThe third, for [the insurance](../bike-insurance.md).\n");
        s.write("~/household/bike-insurance.md", `${s.read("~/household/bike-insurance.md")}\nRenewed on feat.\n`);
        git(s, s.home, "add", "-f", "household/2026/quote.md", "household/bike-insurance.md");
        git(s, s.home, "commit", "-q", "-m", "a quote");
        git(s, s.home, "checkout", "-q", "main");
      },
    },
    run: async (s) => {
      await opened(s, "household/bike-insurance.md");
      // On feat, two tabs more: its own note, and garden's plan; back on main, main's tab.
      git(s, s.home, "checkout", "-q", "feat");
      await s.message("switched to branch feat", 5000);
      await s.keys("ctrl+t", "c");
      await s.ex("e household/2026/quote.md");
      await opened(s, "household/2026/quote.md");
      await s.keys("ctrl+t", "c");
      await s.ex("e garden/plan.md");
      await opened(s, "garden/plan.md");
      git(s, s.home, "checkout", "-q", "main");
      await s.message("switched to branch main: its tabs are back", 5000);
      // Started again on main: household walked for its tab, garden not. feat checked out: its tabs back, their
      // folders walked then — household/2026, only feat has, and garden.
      await s.restart({ startAt: "home" });
      await s.see(tab(1, "bike-insurance.md"));
      git(s, s.home, "checkout", "-q", "feat");
      await s.message("switched to branch feat: its tabs are back", 5000);
      await s.see(tab(3, "plan.md"));
      // The note open on main's tab, changed by the checkout: read again once — after the tabs' folders were walked,
      // never before git's batch and again with it.
      await sleep(1500);
      const said = await messagesSaying(
        s,
        "bike-insurance.md changed",
        /bike-insurance\.md changed on disk — reloaded/,
      );
      s.expect(said === 1, `the open note read again once, not ${said} times`);
      await inSwitcher(s, "seeds", "garden/seeds.md");
      await s.keys("escape");
      await leader(s, "f", "s");
      await s.type("sow");
      await s.see("garden/seeds.md:", 5000);
      await s.keys("escape");
      await open(s, "bike-insurance");
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.see("household/2026/quote.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: a tab behind a link out of home not followed isn't brought back, nothing read through it",
    covers: { cases: ["vault", "tabs", "links/state", "safety"], commands: ["note.open", "app.quit"] },
    options: {
      home: true,
      startAt: "home/README.md",
      config: UNWALKED,
      setup: (s) => {
        if (!existsSync(join(s.dir, "tmp", "ext", "far.md"))) {
          mkdirSync(join(s.dir, "tmp", "ext"), { recursive: true });
          writeFileSync(join(s.dir, "tmp", "ext", "far.md"), "# Far\n\nOutside home.\n");
        }
        symlinkOnce(join(s.dir, "tmp", "ext"), s.path("~/ext"));
      },
    },
    run: async (s) => {
      // Looked at through the link, this once: a tab kept.
      await s.ex("e ext/far.md");
      await s.see("follow it?", 5000);
      await s.keys("l");
      await s.see("Outside home.");
      await quits(s);
      // Started again: the tab isn't read through the link, and says why.
      await s.restart({ startAt: "home" });
      const said = await lastMessage(s, "isn't followed");
      s.expect(/^~\/ext → .* isn't followed — open it to choose$/.test(said), `said why: ${said}`);
      s.expect(!/far\.md/.test(s.statusLine()), "nothing read through the link");
      s.expect(!s.text().includes("Outside home."), "its text not shown");
    },
  },
  {
    area: "links-and-files",
    name: "home: a note gone forward to in a folder not walked — read again when changed, home's note once home's walk reaches it",
    covers: { cases: ["vault", "links/backlinks", "watching"], commands: ["history.forward", "backlinks.open"] },
    options: {
      home: true,
      startAt: "home/README.md",
      config: UNWALKED,
      setup: (s) => {
        homeFolders(s);
        if (!s.read("~/garden/seeds.md").includes("plan.md"))
          s.write("~/garden/seeds.md", "# Seeds\n\nFor [the plan](plan.md).\n");
      },
    },
    run: async (s) => {
      // garden's plan, opened and gone back from: forward in README's window's history.
      await s.ex("e garden/plan.md");
      await opened(s, "garden/plan.md");
      await s.keys("ctrl+o");
      await opened(s, "README.md");
      await quits(s);
      // Started again, home walked once nobody has worked for 3 s: forward to the plan, garden not walked yet.
      const config = join(s.dir, "config", "slipbox", "config.toml");
      s.write(config, s.read(config).replace("idle_seconds = 86400", "idle_seconds = 3"));
      await s.restart({ startAt: "home" });
      await leader(s, "h", "n");
      await opened(s, "garden/plan.md");
      // Changed elsewhere: read again.
      s.write("~/garden/plan.md", "# Garden plan\n\nBeds by the fence; the herbs moved to the window.\n");
      await s.see("the herbs moved to the window", 5000);
      // Home's walk made while nobody works (asked every 8 s, idle between): the plan is home's note, its backlink
      // found.
      await s.retry(
        async () => {
          if (s.rowOf("Linking to") >= 0) await s.keys("escape");
          await leader(s, "l", "b");
        },
        () => s.rowOf("Linking to plan.md (1)") >= 0,
        "plan.md's backlink, from seeds.md, once home is walked",
        8000,
        90_000,
      );
      await s.see("garden/seeds.md");
      await s.keys("escape");
      await s.see("the herbs moved to the window");
    },
  },
  {
    area: "links-and-files",
    name: "home: a note typed in before its folder is walked, changed by an agent — theirs loaded, home's note once walked",
    covers: { cases: ["vault", "watching", "links/backlinks"], commands: ["history.forward", "backlinks.open"] },
    options: {
      home: true,
      startAt: "home/README.md",
      config: UNWALKED,
      setup: (s) => {
        homeFolders(s);
        if (!s.read("~/garden/seeds.md").includes("plan.md"))
          s.write("~/garden/seeds.md", "# Seeds\n\nFor [the plan](plan.md).\n");
      },
    },
    run: async (s) => {
      await s.ex("e garden/plan.md");
      await opened(s, "garden/plan.md");
      await s.keys("ctrl+o");
      await opened(s, "README.md");
      await quits(s);
      // Started again, home walked once nobody has worked for 3 s; forward to the plan, garden not walked yet.
      const config = join(s.dir, "config", "slipbox", "config.toml");
      s.write(config, s.read(config).replace("idle_seconds = 86400", "idle_seconds = 3"));
      await s.restart({ startAt: "home" });
      await leader(s, "h", "n");
      await opened(s, "garden/plan.md");
      // Typed in, unsaved; rewritten by an agent: asked which to keep.
      await s.keys("i");
      await s.type("Mine. ");
      await s.keys("escape");
      s.write("~/garden/plan.md", "# Garden plan\n\nTheirs: the herbs by the window.\n");
      await s.see("Load theirs", 5000);
      // Home walked while the question waits (nobody working): then theirs loaded, and the plan is home's note.
      await sleep(9000);
      await s.keys("l");
      await s.see("Theirs: the herbs by the window.", 5000);
      await s.retry(
        async () => {
          if (s.rowOf("Linking to") >= 0) await s.keys("escape");
          await leader(s, "l", "b");
        },
        () => s.rowOf("Linking to plan.md (1)") >= 0,
        "plan.md's backlink, from seeds.md",
        8000,
        60_000,
      );
      await s.see("garden/seeds.md");
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
  {
    area: "links-and-files",
    name: "home: a folder whose time was set back is listed again — cp -a, tar x, a clock behind, a time put back exactly, a folder made a vault, a time ahead: at the next start of a folder of home, and at the next command",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home/household", config: UNWALKED, setup: (s) => homeWalked(s) },
    run: async (s) => {
      await s.where("household", /household\/bike-insurance\.md/);
      await quits(s);
      // slipbox closed. cp -a of a backup into ~/garden: a note, and garden's time the backup's, older than the walk.
      const older = new Date(Date.now() - 2 * 3_600_000);
      const backup = join(s.dir, "backup", "garden");
      mkdirSync(backup, { recursive: true });
      writeFileSync(join(backup, "compost.md"), "# Compost\n\nTurned every two weeks.\n");
      utimesSync(backup, older, older);
      shell("cp", "-a", `${backup}/.`, s.path("~/garden"));
      // tar x of an archive over ~/household: a note in its archive, the folders' times the archive's.
      const arc = join(s.dir, "arc");
      mkdirSync(join(arc, "household", "archive"), { recursive: true });
      writeFileSync(join(arc, "household", "archive", "2024-policy.md"), "# The policy before\n\nTwo renewals back.\n");
      for (const d of ["household/archive", "household"]) utimesSync(join(arc, d), older, older);
      shell("tar", "-C", arc, "-cf", join(s.dir, "arc.tar"), "household");
      shell("tar", "-C", s.home, "-xf", join(s.dir, "arc.tar"));
      s.expect(statSync(s.path("~/garden")).mtimeMs === older.getTime(), "garden's time set back by cp -a");
      // household opened by name again: home's walk kept covers it, and lists again the folders whose time moved back.
      await s.restart();
      await s.where("household", /household\/bike-insurance\.md/);
      await switcherShows(s, "compost", "garden/compost.md");
      await switcherShows(s, "2024-policy", "household/archive/2024-policy.md");
      await quits(s);
      // The walk the TUI kept (made on its own thread): garden's stamp as it was listed, its time and ctime.
      const g = statSync(s.path("~/garden"));
      s.expect(
        JSON.stringify(stampOf(s, "garden")) === JSON.stringify([g.mtimeMs, g.ctimeMs]),
        "garden's stamp kept whole",
      );
      // A disk whose clock is behind: a note in ~/household, its time moved, but to before the walk.
      s.write("~/household/insurer.md", "# Insurer\n\nTheir number, and the policy's.\n");
      const behind = new Date(Date.now() - 30_000);
      utimesSync(s.path("~/household"), behind, behind);
      // ~'s own: a note, and its time put back to exactly the one the walk kept: its ctime moved all the same.
      const top = stampOf(s, "");
      if (!top || top[0] === -1) throw new CheckFailed("home's top has no stamp of its time");
      s.write("~/put-back.md", "# Put back\n\nCame in, its folder's time restored.\n");
      utimesSync(s.home, new Date(top[0]), new Date(top[0]));
      s.expect(statSync(s.home).mtimeMs === top[0], "home's time put back to exactly its stamp");
      // garden made a vault (git init), its time set back as if nothing had come: it leaves home.
      mkdirSync(s.path("~/garden/.git"));
      utimesSync(s.path("~/garden"), older, older);
      // The command line, at its next command: the notes there, garden's gone.
      const ls = s.cliIn("~/", "ls").out.split("\n");
      for (const n of ["household/insurer.md", "put-back.md", "household/archive/2024-policy.md"])
        s.expect(ls.includes(n), `ls lists ${n}`);
      s.expect(!ls.some((n) => n.startsWith("garden/")), "garden made a vault: none of its notes home's");
      // A folder whose time is too recent to tell a later change apart — ahead of this machine's clock (a disk whose
      // clock is ahead), as one just changed: a note in it, the walk kept with it stamped to list again; so a note come
      // later, its time the same, is found.
      const ahead = new Date(Date.now() + 60_000);
      s.write("~/household/archive/2023-policy.md", "# The first policy\n\nThree renewals back.\n");
      utimesSync(s.path("~/household/archive"), ahead, ahead);
      s.expect(s.cliIn("~/", "ls").out.split("\n").includes("household/archive/2023-policy.md"), "ls lists it");
      s.expect(stampOf(s, "household/archive")?.[0] === -1, "household/archive stamped to list again");
      s.write("~/household/archive/2022-policy.md", "# The one before\n\nFour renewals back.\n");
      utimesSync(s.path("~/household/archive"), ahead, ahead);
      s.expect(s.cliIn("~/", "ls").out.split("\n").includes("household/archive/2022-policy.md"), "ls lists it");
    },
  },
  {
    area: "links-and-files",
    name: "home: a folder whose time was set back with nothing new in it — the walk kept again with its new time, so the next start doesn't list it again",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home", config: UNWALKED, setup: (s) => homeWalked(s) },
    run: async (s) => {
      await s.where(/^~(?: |$)/);
      await quits(s);
      const garden = s.path("~/garden");
      // cp -a of a backup holding the same notes: garden's time the backup's — before its stamp, then after it but
      // still before the walk (a backup made since). Each time the command line lists garden again, and keeps the
      // walk again with garden's new time.
      const backup = join(s.dir, "backup", "garden");
      mkdirSync(backup, { recursive: true });
      for (const n of ["plan.md", "seeds.md"]) writeFileSync(join(backup, n), readFileSync(join(garden, n)));
      for (const ago of [90, 30]) {
        const at = new Date(Date.now() - ago * 60_000);
        utimesSync(backup, at, at);
        shell("cp", "-a", `${backup}/.`, garden);
        s.expect(s.cliIn("~/", "ls").out.includes("garden/plan.md"), "ls lists garden's notes");
        s.expect(stampOf(s, "garden")?.[0] === at.getTime(), `garden's stamp its time now (${ago} minutes back)`);
      }
      // As a walk made in slices leaves it, begun two hours back, before garden was listed: garden set back to before
      // its stamp but after the walk began is kept again all the same.
      const file = walkJson(s);
      const begun = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify({ ...begun, walked: new Date(Date.now() - 2 * 3_600_000).toISOString() }));
      const between = new Date(Date.now() - 60 * 60_000);
      utimesSync(backup, between, between);
      shell("cp", "-a", `${backup}/.`, garden);
      s.expect(s.cliIn("~/", "ls").out.includes("garden/plan.md"), "ls lists garden's notes");
      s.expect(stampOf(s, "garden")?.[0] === between.getTime(), "garden's stamp its time now (an hour back)");
      // household's time moved on past the walk's start and its stamp, nothing new in it (a shell's history written
      // over): listed again, as "newer than the walk" listed it, and the walk not written again for it.
      const since = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify({ ...since, walked: new Date(Date.now() - 2 * 3_600_000).toISOString() }));
      const before = readFileSync(file, "utf8");
      const recent = new Date(Date.now() - 30_000);
      utimesSync(s.path("~/household"), recent, recent);
      s.expect(s.cliIn("~/", "ls").out.includes("household/bike-insurance.md"), "ls lists household's notes");
      s.expect(readFileSync(file, "utf8") === before, "the walk not written again for a time moved on");
      // Not listed again at the next start: a note taken out of the walk kept stays out of the switcher — the walk's
      // folders and their stamps in another order, each stamp staying with its folder.
      const kept = JSON.parse(readFileSync(file, "utf8"));
      kept.dirs.push(kept.dirs.shift());
      kept.times.push(kept.times.shift());
      writeFileSync(
        file,
        JSON.stringify({ ...kept, notes: kept.notes.filter((n: string) => n !== "garden/seeds.md") }),
      );
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "plan", "garden/plan.md");
      await switcherShows(s, "seeds", "garden/seeds.md", false);
    },
  },
  {
    area: "links-and-files",
    name: "home: a walk an earlier version kept, without its folders' times — the TUI goes by it as before; the command line walks home again, once, and a note whose folder was set back is found",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: {
      home: true,
      startAt: "home",
      config: UNWALKED,
      setup: (s) =>
        homeWalked(s, () => {
          // As an earlier version kept it: no stamps. Then a note in garden, its time set back.
          const file = walkJson(s);
          const { times: _, ...kept } = JSON.parse(readFileSync(file, "utf8"));
          writeFileSync(file, JSON.stringify(kept));
          s.write("~/garden/late.md", "# Late\n\nBrought in from a backup.\n");
          const older = new Date(Date.now() - 2 * 3_600_000);
          utimesSync(s.path("~/garden"), older, older);
        }),
    },
    run: async (s) => {
      await s.where(/^~(?: |$)/);
      // The TUI goes by the walk as an earlier version did: garden's time older than the walk, not listed again.
      await switcherShows(s, "late", "garden/late.md", false);
      await quits(s);
      // A note in household, so the TUI keeps the walk again: household stamped, garden still not.
      s.write("~/household/renewal.md", "# Renewal\n\nDue in March.\n");
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "renewal", "household/renewal.md");
      await quits(s);
      s.expect(
        Array.isArray(stampOf(s, "household")) && stampOf(s, "garden") === null,
        "household stamped, garden not",
      );
      // The command line walks home again, once, as the first time: the note found, every folder stamped.
      s.expect(s.cliIn("~/", "ls").out.split("\n").includes("garden/late.md"), "ls lists garden/late.md");
      const kept = JSON.parse(readFileSync(walkJson(s), "utf8"));
      s.expect(
        kept.dirs.every((_: string, i: number) => Array.isArray(kept.times?.[i])),
        "every folder stamped",
      );
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "late", "garden/late.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: a folder that can't be read for a while — listed again at each start till it can, the walk not written for it each time; readable again, its notes back",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home", config: UNWALKED, setup: (s) => homeWalked(s) },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      await s.where(/^~(?: |$)/);
      await quits(s);
      const garden = s.path("~/garden");
      chmodSync(garden, 0o000);
      try {
        // Its ctime moved by the chmod: the command line lists it again, and can't read it — its notes out meanwhile.
        // Home's top listed again too (a note in it, its time then set back): read, it keeps the stamp it was read with.
        s.write("~/sown.md", "# Sown\n\nWhat went in this spring.\n");
        const back = new Date(Date.now() - 2 * 3_600_000);
        utimesSync(s.home, back, back);
        const ls = s.cliIn("~/", "ls").out;
        s.expect(!ls.includes("garden/") && ls.includes("sown.md"), "garden's notes out, sown.md in");
        s.expect(stampOf(s, "garden")?.[0] === -1, "garden to list again");
        s.expect(stampOf(s, "")?.[0] === back.getTime(), "home's top keeps its own stamp");
        const at = readFileSync(walkJson(s), "utf8");
        // The next start lists it again, and still can't read it: the walk not written again for it.
        await s.restart();
        await s.where(/^~(?: |$)/);
        await switcherShows(s, "plan", "garden/plan.md", false);
        await quits(s);
        s.expect(readFileSync(walkJson(s), "utf8") === at, "the walk not written again");
      } finally {
        chmodSync(garden, 0o755);
      }
      // Readable again: listed again, its notes back.
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "plan", "garden/plan.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: a walk an earlier version kept — a vault in home previewed as part of it from the TUI goes by that walk, home not walked again for want of its stamps",
    covers: { cases: ["vault", "links/state"], commands: ["vault.unmake"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      config: UNWALKED,
      setup: (s) =>
        homeWalked(s, () => {
          const file = walkJson(s);
          const { times: _, ...kept } = JSON.parse(readFileSync(file, "utf8"));
          writeFileSync(file, JSON.stringify(kept));
        }),
    },
    run: async (s) => {
      await s.where(/^notes(?: |$)/, /index\.md/);
      // notes made part of home: the plan across home, from the walk kept as it is — previewed, not carried out.
      await leader(s, "v", "shift+m");
      await s.see(/notes\/ → part of .*: \d+ changes? in \d+ files?/, 10000);
      await s.keys("escape");
      s.expect(s.exists("~/notes/.slipbox"), "notes still a vault of its own");
      // A walk of home would have stamped every folder: garden, unchanged, has none still.
      s.expect(stampOf(s, "garden") === null, "home not walked again: garden without a stamp");
    },
  },
  {
    area: "links-and-files",
    name: "home: a folder that can't be read when home is walked — tried again at each start; made readable, its notes found at the next command",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: {
      home: true,
      startAt: "home",
      config: UNWALKED,
      setup: (s) => {
        const once = join(s.dir, "home-folders"); // not a file of home's: garden may not be readable by then
        if (existsSync(once)) return;
        writeFileSync(once, "");
        homeFolders(s);
      },
    },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      await s.where(/^~(?: |$)/);
      await quits(s);
      const garden = s.path("~/garden");
      try {
        // garden unreadable as the command line walks home for the first time: not in the walk at all, and the folder
        // holding it, home's top, stamped to list again.
        chmodSync(garden, 0o000);
        s.expect(!s.cliIn("~/", "ls").out.includes("garden/"), "garden unreadable: none of its notes listed");
        s.expect(stampOf(s, "garden") === undefined && stampOf(s, "")?.[0] === -1, "home's top stamped to list again");
        // Each start tries garden again, and still can't read it: the walk not written again for it.
        const at = readFileSync(walkJson(s), "utf8");
        await s.restart();
        await s.where(/^~(?: |$)/);
        await switcherShows(s, "plan", "garden/plan.md", false);
        await quits(s);
        s.expect(readFileSync(walkJson(s), "utf8") === at, "the walk not written again");
        // Made readable (a chmod moves no time the walk keeps): found at the next command, and the next start.
        chmodSync(garden, 0o755);
        s.expect(s.cliIn("~/", "ls").out.split("\n").includes("garden/plan.md"), "ls lists garden/plan.md");
      } finally {
        chmodSync(garden, 0o755);
      }
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "plan", "garden/plan.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: a vault of home that's home's again, unreadable then — tried again at each command; made readable, its notes found",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home", config: UNWALKED, setup: (s) => homeWalked(s) },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      await s.where(/^~(?: |$)/);
      await quits(s);
      // ~/plot made a vault (git init): the command line keeps it as a vault of its own.
      s.write("~/plot/.git/HEAD", "ref: refs/heads/main\n");
      s.write("~/plot/beds.md", "# Beds\n\nFour, by the fence.\n");
      s.expect(!s.cliIn("~/", "ls").out.includes("plot/"), "plot a vault of its own: none of its notes home's");
      // Home's top, listed just after plot came, is to list again: its time set back, the next command stamps it.
      const back = new Date(Date.now() - 3_600_000);
      utimesSync(s.home, back, back);
      s.cliIn("~/", "ls");
      s.expect(stampOf(s, "")?.[0] === back.getTime(), "home's top stamped with its time");
      const plot = s.path("~/plot");
      try {
        // Its marker gone, and it can't be read (searched, not listed): home's again, and tried again from home's top.
        rmSync(join(plot, ".git"), { recursive: true, force: true });
        chmodSync(plot, 0o311);
        s.expect(!s.cliIn("~/", "ls").out.includes("plot/"), "plot unreadable: none of its notes listed");
        s.expect(stampOf(s, "")?.[0] === -1, "home's top stamped to list again");
        chmodSync(plot, 0o755);
        s.expect(s.cliIn("~/", "ls").out.split("\n").includes("plot/beds.md"), "ls lists plot/beds.md");
      } finally {
        chmodSync(plot, 0o755);
      }
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "beds", "plot/beds.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: a walk that couldn't read home's top — no walk of home's: the TUI shows home's top, the command line walks it again at its next command",
    covers: { cases: ["vault"] },
    options: {
      home: true,
      startAt: "home",
      config: UNWALKED,
      setup: (s) => {
        const once = join(s.dir, "home-walked");
        if (existsSync(once) || process.getuid?.() === 0) return;
        writeFileSync(once, "");
        homeFolders(s);
        chmodSync(s.home, 0o311); // searched, not listed
        try {
          s.cliIn("~/", "ls");
        } finally {
          chmodSync(s.home, 0o755);
        }
      },
    },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      // The TUI, its top readable again: home's top shown, as for a walk under other settings, not an empty home.
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "todo", "todo.md");
      await quits(s);
      s.expect(JSON.parse(readFileSync(walkJson(s), "utf8")).dirs.length === 0, "the walk kept holds no folder");
      s.expect(s.cliIn("~/", "ls").out.split("\n").includes("household/bike-insurance.md"), "ls walks home again");
      s.expect(Array.isArray(stampOf(s, "")), "home's top stamped");
    },
  },
  {
    area: "links-and-files",
    name: "home: a folder or a note of home that can't be looked at any more — tried again from the folder holding it, not dropped for good; looked at again, its notes back",
    covers: { cases: ["vault", "switcher"], commands: ["switcher.open"] },
    options: { home: true, startAt: "home", config: UNWALKED, setup: (s) => homeWalked(s) },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      await s.where(/^~(?: |$)/);
      await quits(s);
      const household = s.path("~/household");
      try {
        // household readable, not searched: its archive can't be statted, as a permission, a policy or a disk's error
        // can have it. The walk kept as if it had seen household so: the archive alone lost, household to list again.
        chmodSync(household, 0o600);
        restampOf(s, "household");
        s.expect(!s.cliIn("~/", "ls").out.includes("household/archive/"), "the archive's notes out");
        s.expect(stampOf(s, "household")?.[0] === -1, "household stamped to list again");
        chmodSync(household, 0o755);
        s.expect(s.cliIn("~/", "ls").out.split("\n").includes("household/archive/2025-policy.md"), "ls lists it");
      } finally {
        chmodSync(household, 0o755);
      }
      const garden = s.path("~/garden");
      try {
        // garden the same: its notes can't be statted, garden to list again — and listed again, still, while they can't.
        chmodSync(garden, 0o600);
        restampOf(s, "garden");
        s.expect(!s.cliIn("~/", "ls").out.includes("garden/"), "garden's notes out");
        s.expect(stampOf(s, "garden")?.[0] === -1, "garden stamped to list again");
        s.cliIn("~/", "ls");
        s.expect(stampOf(s, "garden")?.[0] === -1, "garden still to list again");
        chmodSync(garden, 0o755);
        s.expect(s.cliIn("~/", "ls").out.split("\n").includes("garden/plan.md"), "ls lists garden/plan.md");
      } finally {
        chmodSync(garden, 0o755);
      }
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "2025-policy", "household/archive/2025-policy.md");
    },
  },
  {
    area: "links-and-files",
    name: "home: a walk that couldn't read home's top — a vault in home previewed as part of it from the TUI walks home again for the plan",
    covers: { cases: ["vault", "links/state"], commands: ["vault.unmake"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      config: UNWALKED,
      setup: (s) => {
        const once = join(s.dir, "home-walked");
        if (existsSync(once) || process.getuid?.() === 0) return;
        writeFileSync(once, "");
        homeFolders(s);
        chmodSync(s.home, 0o311); // searched, not listed
        try {
          s.cliIn("~/", "ls");
        } finally {
          chmodSync(s.home, 0o755);
        }
      },
    },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      await s.where(/^notes(?: |$)/, /index\.md/);
      s.expect(JSON.parse(readFileSync(walkJson(s), "utf8")).dirs.length === 0, "the walk kept holds no folder");
      // The plan across home, previewed, not carried out: from a walk of home made for it, not the empty one.
      await leader(s, "v", "shift+m");
      await s.see(/notes\/ → part of .*: \d+ changes? in \d+ files?/, 10000);
      await s.keys("escape");
      s.expect(Array.isArray(stampOf(s, "garden")), "home walked again for the plan: garden stamped");
    },
  },
  {
    area: "links-and-files",
    name: "home: a vault and a folder of home through a link the walk follows, its target away for a while (a disk taken away, not searched) — found again when it's back",
    covers: { cases: ["vault"] },
    options: {
      home: true,
      startAt: "home",
      config: UNWALKED,
      setup: (s) => {
        const once = join(s.dir, "home-walked");
        if (existsSync(once)) return;
        writeFileSync(once, "");
        homeFolders(s);
        // ~/lnk leads to a vault on another disk, followed, as the question's f keeps it.
        const proj = join(s.dir, "disk", "proj");
        mkdirSync(join(proj, ".git"), { recursive: true });
        writeFileSync(join(proj, "p.md"), "# P\n\nOn the other disk.\n");
        symlinkSync(proj, s.path("~/lnk"));
        mkdirSync(join(s.dir, "state", "slipbox"), { recursive: true });
        writeFileSync(
          join(s.dir, "state", "slipbox", "links.json"),
          JSON.stringify({
            version: 1,
            links: [{ link: s.path("~/lnk"), target: proj, answer: "follow", at: "2026-10-24" }],
          }),
        );
        s.cliIn("~/", "ls");
      },
    },
    run: async (s) => {
      if (process.getuid?.() === 0) throw new Skipped("root reads every folder");
      await s.where(/^~(?: |$)/);
      await quits(s);
      const disk = join(s.dir, "disk");
      const proj = join(disk, "proj");
      s.expect(stampOf(s, "") !== undefined && !s.cliIn("~/", "ls").out.includes("lnk/"), "lnk a vault of its own");
      // The disk taken away: the link there, what it leads to not. Home's top to list again, command after command.
      renameSync(proj, join(disk, "proj-away"));
      s.cliIn("~/", "ls");
      s.cliIn("~/", "ls");
      s.expect(stampOf(s, "")?.[0] === -1, "home's top to list again, lnk's target away");
      // Back, its marker gone meanwhile: home's again, its note found.
      renameSync(join(disk, "proj-away"), proj);
      rmSync(join(proj, ".git"), { recursive: true });
      s.expect(s.cliIn("~/", "ls").out.split("\n").includes("lnk/p.md"), "ls lists lnk/p.md");
      try {
        // The disk not searched, home's top listed again meanwhile (a note in it, its time set back): lnk's note out,
        // and home's top to list again till it can be looked at.
        chmodSync(disk, 0o600);
        s.write("~/sown.md", "# Sown\n\nWhat went in this spring.\n");
        const back = new Date(Date.now() - 2 * 3_600_000);
        utimesSync(s.home, back, back);
        s.expect(!s.cliIn("~/", "ls").out.includes("lnk/"), "lnk's note out");
        s.cliIn("~/", "ls");
        s.expect(stampOf(s, "")?.[0] === -1, "home's top to list again, lnk's target not searched");
      } finally {
        chmodSync(disk, 0o755);
      }
      s.expect(s.cliIn("~/", "ls").out.split("\n").includes("lnk/p.md"), "lnk/p.md back once its disk is searched");
      await s.restart();
      await s.where(/^~(?: |$)/);
      await switcherShows(s, "p.md", "lnk/p.md");
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

// --- Elsewhere --------------------------------------------------------------------------------------------------

const ELSEWHERE: Check[] = [
  {
    area: "links-and-files",
    name: "Elsewhere: gone into from a vault, its own tabs; back with ctrl+o, the vault's tabs as they were",
    covers: { cases: ["vault", "tabs", "links/travel"], commands: ["tab.new", "note.open", "history.back"] },
    options: { home: true, startAt: "home/notes/index.md", setup: downloadsElsewhere },
    run: async (s) => {
      // notes: two tabs. (Not inbox.md: notes' config makes it its scratch, shown as `scratch`.)
      await s.where(/^notes(?: │|$)/, /index\.md/);
      await s.keys("ctrl+t", "c");
      await s.see(tab(2, "index.md"));
      await open(s, "sync-rewrite");
      await opened(s, "projects/sync-rewrite.md");
      await s.see(tab(2, "sync-rewrite.md"));
      // A file outside home and every vault, chosen: into Elsewhere (VV-D3, VV-D4), its tabs, none of notes'.
      await s.ex(`e ${join(s.dir, "elsewhere", "stray-note.md")}`);
      await s.where("Elsewhere", /stray-note\.md/, 5000);
      await s.notSee(tab("\\d", "sync-rewrite.md"));
      await s.notSee(tab("\\d", "index.md"));
      // Back: notes, its two tabs, at the note left.
      await s.keys("ctrl+o");
      await opened(s, "projects/sync-rewrite.md");
      await s.where(/^notes(?: │|$)/);
      await s.see(tab(1, "index.md"));
      await s.see(tab(2, "sync-rewrite.md"));
      await s.notSee(tab("\\d", "stray-note.md"));
    },
  },
  {
    area: "links-and-files",
    name: "Elsewhere: a note just looked at through a link, the link forgotten, then followed — the same window writable",
    covers: { cases: ["vault", "links/state"], commands: ["note.open", "vault.links"] },
    options: {
      startAt: "tmp/plain/a.md",
      setup: (s) => {
        const plain = join(s.dir, "tmp", "plain");
        if (existsSync(join(plain, "a.md"))) return;
        mkdirSync(join(s.dir, "tmp", "out"), { recursive: true });
        writeFileSync(join(s.dir, "tmp", "out", "far.md"), "# Far\n\nKept out of the way.\n");
        mkdirSync(plain, { recursive: true });
        writeFileSync(join(plain, "a.md"), "# A\n");
        symlinkOnce(join(s.dir, "tmp", "out"), join(plain, "data"));
      },
    },
    run: async (s) => {
      const far = join(s.dir, "tmp", "plain", "data", "far.md");
      await s.where("Elsewhere");
      // l: just looked at — read-only.
      await s.ex(`e ${far}`);
      await s.see("Just look", 5000);
      await s.keys("l");
      await s.see("Kept out of the way.");
      await s.keys("i");
      // Read whole from the list: a long path wraps its box.
      s.expect((await lastMessage(s, "not editing")).endsWith("— not editing"), "i refused: read-only");
      // Forgotten, opened again, followed: the same window takes typing.
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      await s.ex(`e ${far}`);
      await s.see("Just look", 5000);
      await s.keys("f");
      await s.message("following", 5000);
      await s.keys("i");
      await s.until(
        () => /^(?: SOURCE │ INSERT| READ·LENS │ (?:NORMAL|INSERT))\b/.test(s.statusLine()),
        3000,
        "i to edit: writable now",
      );
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "Elsewhere: a note looked at through a link, forgotten, changed by an agent, then followed — read again at once, typing goes into theirs",
    covers: { cases: ["vault", "links/state", "reload"], commands: ["note.open", "vault.links"] },
    options: {
      startAt: "tmp/plain-agent/a.md",
      setup: (s) => {
        const plain = join(s.dir, "tmp", "plain-agent");
        if (existsSync(join(plain, "a.md"))) return;
        mkdirSync(join(s.dir, "tmp", "out-agent"), { recursive: true });
        writeFileSync(join(s.dir, "tmp", "out-agent", "far.md"), "# Far\n\nKept out of the way.\n");
        mkdirSync(plain, { recursive: true });
        writeFileSync(join(plain, "a.md"), "# A\n");
        symlinkOnce(join(s.dir, "tmp", "out-agent"), join(plain, "data"));
      },
    },
    run: async (s) => {
      const far = join(s.dir, "tmp", "plain-agent", "data", "far.md");
      await s.where("Elsewhere");
      await s.ex(`e ${far}`);
      await s.see("Just look", 5000);
      await s.keys("l");
      await s.see("Kept out of the way.");
      // Forgotten: nothing reads it through the link, an agent's change to it unread.
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      writeFileSync(join(s.dir, "tmp", "out-agent", "far.md"), "# Far\n\nRewritten by an agent.\n");
      await sleep(1500);
      await s.see("Kept out of the way.");
      // Followed, typed into at once: read again as it's followed, so what's typed goes into theirs — no conflict.
      await s.ex(`e ${far}`);
      await s.see("Just look", 5000);
      await s.keys("f");
      await s.message("following", 5000);
      await s.keys("i");
      await s.until(
        () => /^(?: SOURCE │ INSERT| READ·LENS │ (?:NORMAL|INSERT))\b/.test(s.statusLine()),
        3000,
        "i to edit: writable now",
      );
      await s.type("Z");
      await s.keys("escape");
      await sleep(1500);
      await s.see("Rewritten by an agent.");
      s.expect(
        !s.screen().some((r) => r.includes("changed on disk") && !r.includes("reloaded")),
        "no conflict: nothing typed into what was no longer there",
      );
    },
  },
  {
    area: "links-and-files",
    name: "Elsewhere: a link followed, its note typed into, forgotten, changed by an agent, followed again — yours kept, asked which to keep",
    covers: { cases: ["vault", "links/state", "reload"], commands: ["note.open", "vault.links"] },
    options: {
      startAt: "tmp/plain-typed/a.md",
      // Never autosaved meanwhile: what's typed stays unsaved.
      config: "[editor]\nautosave_ms = 600000\n",
      setup: (s) => {
        const plain = join(s.dir, "tmp", "plain-typed");
        if (existsSync(join(plain, "a.md"))) return;
        mkdirSync(join(s.dir, "tmp", "out-typed"), { recursive: true });
        writeFileSync(join(s.dir, "tmp", "out-typed", "far.md"), "# Far\n\nKept out of the way.\n");
        mkdirSync(plain, { recursive: true });
        writeFileSync(join(plain, "a.md"), "# A\n");
        symlinkOnce(join(s.dir, "tmp", "out-typed"), join(plain, "data"));
      },
    },
    run: async (s) => {
      const far = join(s.dir, "tmp", "plain-typed", "data", "far.md");
      await s.where("Elsewhere");
      await s.ex(`e ${far}`);
      await s.see("Just look", 5000);
      await s.keys("f");
      await s.message("following", 5000);
      // Typed on a new line at its end: the lens, then typing in it.
      await s.keys("G", "o");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.type("Typed.");
      await s.keys("escape");
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      writeFileSync(join(s.dir, "tmp", "out-typed", "far.md"), "# Far\n\nRewritten by an agent.\n");
      // Followed again: what you typed kept, and which to keep asked.
      await s.ex(`e ${far}`);
      await s.see("Just look", 5000);
      await s.keys("f");
      // Its title cut short by the long path: the prompt by its choices.
      await s.see("(k) Keep yours", 5000);
      await s.see("Typed.");
      await s.keys("escape");
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
    name: "links: a note just looked at through a link, the link followed later — the same window the vault's note, writable",
    covers: { cases: ["links/state", "links/backlinks"], commands: ["link.follow", "vault.links", "backlinks.open"] },
    options: { home: true, startAt: "home/notes/to-shelf.md", setup: shelf },
    run: async (s) => {
      // l: just looked at — read-only.
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("l");
      await opened(s, "shelf/far.md");
      await s.keys("i");
      // Read whole from the list: a long path wraps its box.
      s.expect((await lastMessage(s, "not editing")).endsWith("— not editing"), "i refused: read-only");
      // Forgotten, then followed: asked again, f.
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await opened(s, "shelf/far.md");
      // Once the vault is walked through the link, the window open on it is the vault's note: its backlink found,
      // and it takes typing.
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
      await s.keys("i");
      await s.until(
        () => /^(?: SOURCE │ INSERT| READ·LENS │ (?:NORMAL|INSERT))\b/.test(s.statusLine()),
        3000,
        "i to edit: writable now",
      );
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "links: a link followed, its note open, forgotten — read-only, an edit out there unread; followed again, read and writable",
    covers: { cases: ["links/state", "safety", "watching"], commands: ["link.follow", "vault.links"] },
    options: { home: true, startAt: "home/notes/to-shelf.md", setup: shelf },
    run: async (s) => {
      // f: followed, the note open through the link.
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await opened(s, "shelf/far.md");
      await s.see("A note kept on the shelf.");
      // Forgotten: the window read-only, and what's written out there isn't read through the link.
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      await s.keys("i");
      // Read whole from the list: a long path wraps its box.
      s.expect((await lastMessage(s, "not editing")).endsWith("— not editing"), "i refused: read-only");
      s.write("~/shelf/far.md", "# Far\n\nRewritten on the shelf.\n");
      await sleep(2500);
      await s.notSee("Rewritten on the shelf.");
      // Followed again: asked, f; the same window read again, and it takes typing.
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await opened(s, "shelf/far.md");
      await s.see("Rewritten on the shelf.", 10_000);
      await s.keys("i");
      await s.until(
        () => /^(?: SOURCE │ INSERT| READ·LENS │ (?:NORMAL|INSERT))\b/.test(s.statusLine()),
        3000,
        "i to edit: writable again",
      );
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "links: a note too big to index, looked at through a link, then followed — still read-only: a vault never writes out of itself",
    covers: { cases: ["links/state", "safety"], commands: ["link.follow", "vault.links"] },
    options: {
      home: true,
      startAt: "home/notes/to-big.md",
      config: "[walk]\nmax_file_size = 300\n",
      setup: (s) => {
        if (!s.exists("~/shelf/big.md"))
          s.write("~/shelf/big.md", `# Big\n\n${"A long line of a note too big to index. ".repeat(12)}\n`);
        if (!s.exists("~/notes/to-big.md"))
          s.write("~/notes/to-big.md", "# To the big one\n\n[The big note](shelf/big.md).\n");
        symlinkOnce(s.path("~/shelf"), s.path("~/notes/shelf"));
      },
    },
    run: async (s) => {
      await toLink(s, "shelf/big.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("l");
      await opened(s, "shelf/big.md");
      // Forgotten, opened again, followed: the vault doesn't take a note past its size cap, so the window stays
      // read-only — a write would land outside the vault.
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      await s.keys("ctrl+o");
      await opened(s, "to-big.md");
      await toLink(s, "shelf/big.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await s.message("following", 5000);
      await opened(s, "shelf/big.md");
      await s.keys("i");
      // Read whole from the list: a long path wraps its box.
      s.expect((await lastMessage(s, "not editing")).endsWith("— not editing"), "i refused: read-only");
    },
  },
  {
    area: "links-and-files",
    name: "links: a note too big to index, through a link followed, typed into and saved — never written: a vault never writes out of itself",
    covers: { cases: ["links/state", "safety"], commands: ["link.follow"] },
    // Fails at random on CI's Linux runners. Job 120896065125, 3.3 s in: `:w` refused, but the Messages list looked up
    // after it never opened, the needle typed into the report window instead (the last commands run `palette.open,
    // note.save, help.report`). Job 120903950535, 33 s in: slipbox not exiting cleanly.
    quarantined: "#73",
    options: {
      home: true,
      startAt: "home/notes/to-big.md",
      config: "[walk]\nmax_file_size = 300\n",
      setup: (s) => {
        if (!s.exists("~/shelf/big.md"))
          s.write("~/shelf/big.md", `# Big\n\n${"A long line of a note too big to index. ".repeat(12)}\n`);
        if (!s.exists("~/notes/to-big.md"))
          s.write("~/notes/to-big.md", "# To the big one\n\n[The big note](shelf/big.md).\n");
        symlinkOnce(s.path("~/shelf"), s.path("~/notes/shelf"));
      },
    },
    run: async (s) => {
      const before = s.read("~/shelf/big.md");
      await toLink(s, "shelf/big.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await s.message("following", 5000);
      await opened(s, "shelf/big.md");
      // Opened through the link followed, the vault not taking it: typed into, saved — refused, as a note the vault
      // takes through a link is.
      // Typed on a new line at its end: the lens, then typing in it.
      await s.keys("G", "o");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.type("Typed here.");
      await s.keys("escape");
      await s.ex("w");
      s.expect((await lastMessage(s, "resolves outside")).includes("resolves outside the vault"), ":w refused");
      s.expect(s.read("~/shelf/big.md") === before, "nothing written out of the vault");
    },
  },
  {
    area: "links-and-files",
    name: "links: a note looked at through a link, its task toggled; followed, typed into, the link forgotten, saved — nothing written through the link",
    covers: { cases: ["links/state", "safety"], commands: ["link.follow", "vault.links", "task.toggle"] },
    options: {
      home: true,
      startAt: "home/notes/to-tasks.md",
      // Autosave soon after the last key: it would ask about a change out there, reading it through the link.
      config: "[editor]\nautosave_ms = 1000\n",
      setup: (s) => {
        if (!s.exists("~/shelf/tasks.md")) s.write("~/shelf/tasks.md", "# Tasks\n\n- [ ] Shelve it.\n");
        if (!s.exists("~/notes/to-tasks.md"))
          s.write("~/notes/to-tasks.md", "# To the tasks\n\n[The tasks](shelf/tasks.md).\n");
        symlinkOnce(s.path("~/shelf"), s.path("~/notes/shelf"));
      },
    },
    run: async (s) => {
      const kept = "# Tasks\n\n- [ ] Shelve it.\n";
      const forget = async () => {
        await s.ex("symlinks");
        await s.see("Symlinks you've answered");
        await s.keys("enter");
        await s.message("forgot", 5000);
      };
      // l: just looked at; its task toggled — written nowhere, the link not followed.
      await toLink(s, "shelf/tasks.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("l");
      await opened(s, "shelf/tasks.md");
      await s.keys("shift+g");
      await s.keys("ctrl+l");
      s.expect((await lastMessage(s, "not toggled")).includes("tasks.md: not toggled"), "the toggle refused");
      s.expect(s.read("~/shelf/tasks.md") === kept, "the task not toggled through the link");
      // Followed, typed into, then forgotten: what's typed isn't written through the link, :w or not.
      await forget();
      await s.keys("ctrl+o");
      await opened(s, "to-tasks.md");
      await toLink(s, "shelf/tasks.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("f");
      await opened(s, "shelf/tasks.md");
      // Typed on a new line at its end: the lens, then typing in it.
      await s.keys("G", "o");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.type("Typed here.");
      await s.keys("escape");
      await forget();
      // Changed out there, its task toggled here: nothing read through the link forgotten, nothing toggled.
      s.write("~/shelf/tasks.md", "# Tasks\n\n- [ ] Shelve it.\n- [ ] Changed out there.\n");
      await sleep(2500);
      s.expect(!s.screen().some((r) => r.includes("you have unsaved changes")), "no conflict asked: theirs not read");
      await s.keys("k");
      await s.keys("ctrl+l");
      s.expect((await lastMessage(s, "not toggled")).includes("tasks.md: not toggled"), "the toggle refused");
      await s.notSee("Changed out there.");
      await s.ex("w");
      s.expect((await lastMessage(s, "not written")).includes("tasks.md not written"), ":w refused");
      s.expect(!s.read("~/shelf/tasks.md").includes("Typed here."), "nothing typed written through the link forgotten");
    },
  },
  {
    area: "links-and-files",
    name: "links: a note looked at through a link, followed, its target not answering — not followed for now, still read-only",
    covers: { cases: ["links/state", "safety"], commands: ["link.follow", "vault.links"] },
    options: { home: true, startAt: "home/notes/to-shelf.md", setup: shelf },
    run: async (s) => {
      if (process.getuid?.() === 0)
        throw new Skipped("root lists any folder: a target that won't is only so for others");
      // On macOS one you may not list has no real path either (Bun opens it to find it): the link leads nowhere.
      if (process.platform === "darwin")
        throw new Skipped("on macOS a folder you may not list leads nowhere: nothing to follow, the unit test's case");
      await toLink(s, "shelf/far.md");
      await s.keys("enter");
      await s.see(asked("~/shelf"));
      await s.keys("l");
      await opened(s, "shelf/far.md");
      await s.ex("symlinks");
      await s.see("Symlinks you've answered");
      await s.keys("enter");
      await s.message("forgot", 5000);
      await s.keys("ctrl+o");
      await opened(s, "to-shelf.md");
      // The shelf lists nothing now (its files still read and written): asked, it doesn't answer.
      chmodSync(s.path("~/shelf"), 0o300);
      try {
        await toLink(s, "shelf/far.md");
        await s.keys("enter");
        await s.see(asked("~/shelf"));
        await s.keys("f");
        await sleep(4500);
        s.expect((await lastMessage(s, "didn't answer")).endsWith("not followed for now"), "not followed for now");
        // The polls meanwhile lift nothing: opened again, it's read-only as it was.
        await sleep(2500);
        await s.ex(`e ${s.path("~/notes/shelf/far.md")}`);
        await opened(s, "shelf/far.md");
        await s.keys("i");
        s.expect((await lastMessage(s, "not editing")).endsWith("— not editing"), "i refused: still read-only");
      } finally {
        chmodSync(s.path("~/shelf"), 0o755);
      }
    },
  },
  {
    area: "links-and-files",
    name: "links: a note looked at through a file link, the link made a note of the vault's own — indexed, and its window takes typing",
    covers: { cases: ["links/state", "watching"], commands: ["note.open"] },
    options: {
      home: true,
      startAt: "home/notes/to-shelf.md",
      setup: (s) => {
        shelf(s);
        symlinkOnce(s.path("~/shelf/far.md"), s.path("~/notes/far-link.md"));
      },
    },
    run: async (s) => {
      await s.ex("e far-link.md");
      await s.see(/follow it\?/, 5000);
      await s.keys("l");
      await opened(s, "far-link.md");
      await s.see("A note kept on the shelf.");
      // The link replaced by a note of the vault's own, as an editor or git would.
      rmSync(s.path("~/notes/far-link.md"));
      s.write("~/notes/far-link.md", "# Far link\n\nThe vault's own now.\n");
      await s.see("The vault's own now.", 5000);
      await inSwitcher(s, "far-link", "far-link.md");
      await s.keys("escape");
      await s.keys("G", "o");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.keys("escape");
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
        // The relative one written again as it moves back, and said.
        if (from === "box/attic") await s.see("box/attic is a relative link: written again at attic");
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
      await s.where("Elsewhere");
      // The file itself: opened, nothing asked.
      await explorerOpen(s);
      await explorerRow(s, "a\\.md");
      await s.keys("enter");
      await s.where("Elsewhere", /a\.md/);
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
      await s.where("Elsewhere", /b\.md/, 5000);
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
export function repositories(s: Session): void {
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
      await s.where(/projects$/, /a\.md/);
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
      await s.where(/alpha │ main$/, null, 5000);
    },
  },
];

export const VAULTS: Check[] = [
  {
    area: "links-and-files",
    name: "vault switch choices: stay keeps edits, discard goes; vault list includes destinations",
    covers: {
      cases: ["vault", "editing"],
      commands: ["folders.open", "vault.switch_stay", "vault.switch_discard", "vault.switch_save"],
    },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      await s.status("index.md");
      await s.keys("ctrl+k", "i");
      await s.type("probe ");
      await s.keys("escape", ":");
      await s.type(`e ${s.path("~/work/kestrel/README.md")}`);
      await s.keys("enter");
      await s.see("Unsaved notes — change vault?");
      await s.see("Save all and go");
      await s.see("Discard and go");
      await s.keys("c");
      await s.status("unsaved");
      await s.keys(":");
      await s.type(`e ${s.path("~/work/kestrel/README.md")}`);
      await s.keys("enter");
      await s.see("Unsaved notes — change vault?");
      await s.keys("d");
      await s.status("README.md");
      await leader(s, "v", "v");
      await s.see("Vaults — enter goes into one; / filters");
      await s.keys("escape", "ctrl+k", "i");
      await s.type("saved ");
      await s.keys("escape");
      await s.ex(`e ${s.path("~/notes/index.md")}`);
      await s.see("Unsaved notes — change vault?");
      await s.keys("s");
      await s.status("index.md");
      s.expect(s.read("~/work/kestrel/README.md").includes("saved "), "save all wrote before switching");
    },
  },
  ...HOME,
  ...UNWALKED_HOME,
  ...ELSEWHERE,
  ...VIEW,
  ...MARKED,
  ...LINKED,
  ...PEEKED,
  ...GIT_PANEL,
];
