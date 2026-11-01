// Shared vault fixtures and explorer screen helpers, below the check collections that use them.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { EXPLORER } from "../check.ts";
import { CheckFailed, type Session } from "../session.ts";

/**
 * Home never walked while a check runs: the background index off, and the TUI's own walk of home, made while nobody
 * works, a day away — what a folder of home shows at once is what was asked for, nothing more.
 */
export const UNWALKED = "[index]\nbackground = false\nidle_seconds = 86400\n";

/** Room in the explorer for what describes a row (VV-D9): a link's target and whether it's followed, whole. */
export const WIDE = "[ui]\nsidebar_width = 50\n";

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
export function rowEnd(s: Session, name: string): { describe: string; mark: string } | null {
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
export const tab = (n: number | string, name: string) => new RegExp(` ${n} ${escaped(name)}\\s+×`);

/** ctrl+q, and slipbox gone: the session kept as a quit keeps it. */
export async function quits(s: Session): Promise<void> {
  await s.keys("ctrl+q");
  await s.until(() => s.exited(), 5000, "ctrl+q to quit");
}

/** A symlink at `path` leading to `target`, unless one is there already (setup runs at every start). */
export function symlinkOnce(target: string, path: string): void {
  try {
    lstatSync(path);
    return;
  } catch {}
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path);
}

/** git run in `cwd` as the reference set's owner runs it (HOME the check's), failing the check when it fails. */
export function git(s: Session, cwd: string, ...args: string[]): void {
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
export function homeFolders(s: Session): void {
  if (s.exists("~/garden/plan.md")) return;
  s.write("~/household/archive/2025-policy.md", "# Last year's policy\n\nThe one the renewal replaces.\n");
  s.write("~/garden/plan.md", "# Garden plan\n\nBeds by the fence, herbs by the door.\n");
  s.write("~/garden/seeds.md", "# Seeds\n\nWhat to sow in spring.\n");
  const before = new Date(Date.now() - 3_600_000);
  for (const d of ["", "garden", "household", "household/archive"]) utimesSync(join(s.home, d), before, before);
}

/** Home's folders (`homeFolders`), then walked and kept by the command line, as an agent's first command there walks
 *  it; `more` changes home after that. Setup runs at every start: this, once. */
export function homeWalked(s: Session, more?: (s: Session) => void): void {
  const once = join(s.dir, "home-walked"); // not a file of home's: a folder of it may not be readable by then
  if (existsSync(once)) return;
  writeFileSync(once, "");
  homeFolders(s);
  s.cliIn("~/", "ls");
  more?.(s);
}

/** Home's walk kept, in the check's cache (`walk.json`, VV-D2). */
export function walkJson(s: Session): string {
  const cache = join(s.dir, "cache");
  const rel = (readdirSync(cache, { recursive: true }) as string[]).find((f) => f.endsWith("walk.json"));
  if (!rel) throw new CheckFailed("home's walk isn't kept");
  return join(cache, rel);
}

/** The stamp home's walk kept has for folder `d` (its mtime and ctime): null when it has none, undefined when the
 *  folder isn't in the walk (#12). */
export function stampOf(s: Session, d: string): [number, number] | null | undefined {
  const kept = JSON.parse(readFileSync(walkJson(s), "utf8"));
  const i = kept.dirs.indexOf(d);
  return i < 0 ? undefined : (kept.times?.[i] ?? null);
}

/** Home's walk kept as if it had seen folder `d` as it is now: its stamp its mtime and ctime (#12). */
export function restampOf(s: Session, d: string): void {
  const file = walkJson(s);
  const kept = JSON.parse(readFileSync(file, "utf8"));
  const i = kept.dirs.indexOf(d);
  if (i < 0) throw new CheckFailed(`${d || "home's top"} isn't in the walk kept`);
  const st = statSync(d ? s.path(`~/${d}`) : s.home);
  kept.times[i] = [st.mtimeMs, st.ctimeMs];
  writeFileSync(file, JSON.stringify(kept));
}

/** A tool run as a person runs it in a shell (`cp -a`, `tar`), failing the check when it fails. */
export function shell(cmd: string, ...args: string[]): void {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new CheckFailed(`${cmd} ${args.join(" ")}: exit ${r.status}\n${r.stderr}`);
}

/** The quick switcher, `name` typed: `rel` listed, or (`listed: false`) not, once it has settled. */
export async function switcherShows(s: Session, name: string, rel: string, listed = true): Promise<void> {
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
export function shelf(s: Session): void {
  if (!s.exists("~/shelf/far.md")) s.write("~/shelf/far.md", "# Far\n\nA note kept on the shelf.\n");
  if (!s.exists("~/notes/to-shelf.md"))
    s.write("~/notes/to-shelf.md", "# To the shelf\n\nWhat's kept on [the shelf](shelf/far.md).\n");
  symlinkOnce(s.path("~/shelf"), s.path("~/notes/shelf"));
}

/** The link's question in notes for `~/notes/shelf` leading to `to` (VV-D6). */
export const asked = (to: string) => `~/notes/shelf → ${to} leads out of notes: follow it?`;

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
