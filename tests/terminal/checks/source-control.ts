// Source control (GIT-D2–GIT-D13): the git panel by keys and by mouse; its branches, their worktrees and each one's
// base; the diff window's changed words, a note's blocks before and after, a code file's two sides, line endings (its
// later edges, git-diff.ts's); the review of what isn't staged; the merge screen; rebasing onto the base, over files
// changed too (stashed and put back, D247); the remote's commands and stash. Each on a repository the check makes in
// its own home with git itself — commits, branches, a worktree, a bare repository as its remote, a conflict from a
// real merge or rebase — so what slipbox reads is git's own doing.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { loadTheme, type Role } from "../../../src/core/theme/index.ts";
import { type Check, leader, panelFocused } from "../check.ts";
import type { Session, SessionOptions } from "../session.ts";

// ---------------------------------------------------------------------------------------------------------------
// The repository: git as the check runs it, and the trail guide it makes.

/**
 * Who commits, for the check's git and slipbox's: the check's home has no ~/.gitconfig, and git won't commit without a
 * name. Nor the machine's own config (a default branch, a merge style): what git does here is the same everywhere.
 */
const WHO = {
  GIT_AUTHOR_NAME: "Ada Park",
  GIT_AUTHOR_EMAIL: "ada@example.invalid",
  GIT_COMMITTER_NAME: "Ada Park",
  GIT_COMMITTER_EMAIL: "ada@example.invalid",
  GIT_CONFIG_NOSYSTEM: "1",
};

/** The repository every check makes, in its own home: a guide to a ridge trail. */
export const TRAIL = "~/work/trail";
/** Where slipbox starts: the guide's README, in the repository (a vault by its `.git`). */
const README = "home/work/trail/README.md";
const GUIDE = "# Ridge trail\n\nA guide to the ridge trail, hut to hut.\n";
/** The git panel wide enough for a branch's name and its figures. */
const WIDE = "[ui]\nsidebar_width = 48\n";

/** git's environment: the check's home, its author, none of the machine's `GIT_*` settings; git's own English. */
function gitEnv(s: Session): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("GIT_")) env[k] = v;
  return { ...env, HOME: s.home, LC_ALL: "C", ...WHO };
}

/** git in a folder (`~/…`, or a whole path); its exit and what it said. */
export function git(s: Session, cwd: string, ...args: string[]): { code: number; out: string } {
  const r = spawnSync("git", ["-C", s.path(cwd), ...args], { encoding: "utf8", env: gitEnv(s) });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

/** git that must end well: its output, trimmed; git's own words in the failure when it doesn't. */
export function gitOk(s: Session, cwd: string, ...args: string[]): string {
  const r = git(s, cwd, ...args);
  s.expect(r.code === 0, `git ${args.join(" ")} (exit ${r.code})\n${r.out.trim()}`);
  return r.out.trim();
}

/** Files written in a folder (`~/…`). */
export function put(s: Session, at: string, files: Record<string, string>): void {
  for (const [f, t] of Object.entries(files)) s.write(`${at}/${f}`, t);
}

/** Files written, and committed on the branch checked out there. */
export function commit(s: Session, at: string, files: Record<string, string>, message: string): void {
  put(s, at, files);
  gitOk(s, at, "add", "-A");
  gitOk(s, at, "commit", "-q", "-m", message);
}

/** ~/work/trail made a repository, its files committed on main; a conflict's markers git's plain ones (no base). */
export function trail(s: Session, files: Record<string, string> = {}): void {
  put(s, TRAIL, { "README.md": GUIDE, ...files });
  gitOk(s, TRAIL, "init", "-q", "-b", "main");
  gitOk(s, TRAIL, "config", "merge.conflictStyle", "merge");
  gitOk(s, TRAIL, "config", "core.autocrlf", "false");
  gitOk(s, TRAIL, "add", "-A");
  gitOk(s, TRAIL, "commit", "-q", "-m", "The guide");
}

/** A check's options: slipbox on the guide's README, the repository made by `make` before it starts. */
export const repoAt = (make: (s: Session) => void, more: SessionOptions = {}): SessionOptions => ({
  startAt: README,
  env: WHO,
  config: WIDE,
  ...more,
  setup: make,
});

/** What's staged, by path. */
const staged = (s: Session) => gitOk(s, TRAIL, "diff", "--cached", "--name-only");

/** A bare repository in the check's folder as the trail's origin, main pushed and tracked; a clone of it beside. */
function withOrigin(s: Session): { bare: string; other: string } {
  const bare = join(s.dir, "remote", "trail.git");
  const other = join(s.dir, "other");
  gitOk(s, s.dir, "init", "-q", "--bare", "-b", "main", bare);
  gitOk(s, TRAIL, "remote", "add", "origin", bare);
  gitOk(s, TRAIL, "push", "-q", "-u", "origin", "main");
  gitOk(s, s.dir, "clone", "-q", bare, other);
  return { bare, other };
}

/** Someone else's commit on origin's main: made in the clone, pushed. */
function pushedElsewhere(s: Session, other: string, files: Record<string, string>, message: string): void {
  commit(s, other, files, message);
  gitOk(s, other, "push", "-q");
}

// ---------------------------------------------------------------------------------------------------------------
// The git panel on screen: its rows, its selection, its buttons; clicks as a terminal sends them (SGR's reports).

/** The default theme's roles: the panel's selection, a diff's tints. */
export const ROLES = loadTheme("tokyo-night", "/nonexistent").theme.roles;
export const bgOf = (role: Role) => ROLES[role].bg!.toLowerCase();

/**
 * The panel's own title, at its top: "Source control" and the spaces up to its border. Not the leader's which-key
 * popup, on screen between `space` and `g`, whose line for `space g` says "Source control in the left panel…".
 */
const TITLE = /Source control +[│┃]/;

/** The git panel open and focused (GIT): `space g`, as `panelFocused` presses a panel's key. */
export const toPanel = (s: Session) => panelFocused(s, "g", "GIT", TITLE);

/** The left panel's part of a screen row: up to its border, the first `│` or `┃` of its title's row. */
function panelPart(s: Session, row: number): string {
  const rows = s.screen();
  const title = rows.findIndex((r) => TITLE.test(r));
  const border = title < 0 ? -1 : [...rows[title]!].findIndex((c) => c === "│" || c === "┃");
  return [...(rows[row] ?? "")].slice(0, border < 0 ? undefined : border).join("");
}

/** The panel's first row showing `needle`, or -1. */
export function rowWith(s: Session, needle: string | RegExp): number {
  return s
    .screen()
    .findIndex((_, i) =>
      typeof needle === "string" ? panelPart(s, i).includes(needle) : needle.test(panelPart(s, i)),
    );
}

/** The panel's first row showing `needle`, waited for. */
export async function panelRow(s: Session, needle: string | RegExp): Promise<number> {
  await s.until(() => rowWith(s, needle) >= 0, undefined, `the git panel to show ${needle}`);
  return rowWith(s, needle);
}

/** The background of the cell holding `piece` — its first place at or after where `holding` starts — in the first row
 *  showing `holding`; null without one. */
export function bgIn(s: Session, holding: string, piece: string): string | null {
  for (const row of s.runs()) {
    const plain = row.map((r) => r.text).join("");
    const from = plain.indexOf(holding);
    if (from < 0) continue;
    const at = plain.indexOf(piece, from);
    if (at < 0) return null;
    let n = 0;
    for (const r of row) {
      if (at < n + r.text.length) return r.bg?.toLowerCase() ?? null;
      n += r.text.length;
    }
  }
  return null;
}

/** Whether the panel draws the row showing `needle` as the one selected. */
export const isSelected = (s: Session, needle: string) =>
  rowWith(s, needle) >= 0 && bgIn(s, needle, needle) === bgOf("sidebar_selected");

/**
 * The panel's row showing `needle` selected, its keys then acting on it: from the top (`g g`, the panel's first
 * heading) a `j` a row down to it — the rows counted on the screen and the keys pressed at once, never one decided on
 * a screen that hasn't caught up with the last — then seen selected.
 */
export async function selectRow(s: Session, needle: string): Promise<void> {
  const target = await panelRow(s, needle);
  // Past the rail: a section's heading starts with its fold's glyph. Above the first, only lines that say something.
  const first = s.screen().findIndex((_, i) => /^\s*[▾▸] /.test(panelPart(s, i).slice(3)));
  s.expect(first >= 0 && first <= target, `the panel's first heading at or above ${needle}`);
  await s.keys("g", "g", ...Array<string>(target - first).fill("j"));
  await s.until(() => isSelected(s, needle), undefined, `${needle} selected in the git panel`);
}

/** The column (from 1) of the character at `at` in a row: the width before it, as the terminal lays it out. */
export const columnOf = (row: string, at: number) => Bun.stringWidth(row.slice(0, at)) + 1;

/** A mouse event at a cell (`y` the screen's row, from 0): a press and a release, or the pointer moved there. */
export async function mouse(s: Session, x: number, y: number, how: "click" | "move" = "click"): Promise<void> {
  if (how === "move") return s.send(`\x1b[<35;${x};${y + 1}M`);
  await s.send(`\x1b[<0;${x};${y + 1}M`);
  await s.send(`\x1b[<0;${x};${y + 1}m`);
}

/** A click on `needle` where the panel shows it, else where the screen first does. */
export async function on(s: Session, needle: string): Promise<void> {
  await s.until(() => s.rowOf(needle) >= 0, undefined, `${needle} on screen`);
  const inPanel = rowWith(s, needle);
  const y = inPanel >= 0 ? inPanel : s.rowOf(needle);
  const row = inPanel >= 0 ? panelPart(s, y) : s.screen()[y]!;
  await mouse(s, columnOf(row, row.indexOf(needle)) + 1, y);
}

/** A row's button (` + `, ` − `…) clicked: the pointer onto the row showing `needle` first, which shows its buttons. */
async function rowButton(s: Session, needle: string, glyph: string): Promise<void> {
  await mouse(s, 6, await panelRow(s, needle), "move");
  const has = () => panelPart(s, rowWith(s, needle)).includes(` ${glyph} `);
  await s.until(has, undefined, `${glyph} on ${needle}'s row under the pointer`);
  const y = rowWith(s, needle);
  const part = panelPart(s, y);
  await mouse(s, columnOf(part, part.lastIndexOf(` ${glyph} `) + 1), y);
}

/** A branch's button (`[Remove…]`), the branch opened up: the first row under the branch's that shows it. */
export async function branchButton(s: Session, branch: string, label: string): Promise<void> {
  const top = await panelRow(s, branch);
  const at = () => s.screen().findIndex((_, i) => i > top && panelPart(s, i).includes(label));
  await s.until(() => at() > top, undefined, `${label} under ${branch}`);
  const y = at();
  const part = panelPart(s, y);
  await mouse(s, columnOf(part, part.indexOf(label)) + 1, y);
}

/**
 * The newest message holding `needle`, whole — its box wraps a long one, the Messages list cuts it: the list filtered
 * to it, enter copies it.
 */
export async function lastMessage(s: Session, needle: string): Promise<string> {
  await leader(s, "m");
  await s.see("Messages");
  await s.type(needle);
  await s.keys("enter");
  await s.notSee("Messages");
  return s.clipboard();
}

/** A message said, whole: found by words of its own (`find`, which pick it out among those said). */
export async function said(s: Session, find: string, whole: string): Promise<void> {
  const got = await lastMessage(s, find);
  s.expect(got === whole, `said: ${whole}\n(the newest holding "${find}": ${got})`);
}

// ---------------------------------------------------------------------------------------------------------------
// The git panel (GIT-D8, GIT-D12).

const GEAR = "# Gear\n\nBoots and a map.\n";
const HUTS = "# Huts\n\nTwo huts on the way.\n";

/** The guide with its gear and its huts committed, and both changed since (an agent's edits, not staged). */
function twoChanged(s: Session): void {
  trail(s, { "gear.md": GEAR, "notes/huts.md": HUTS });
  put(s, TRAIL, { "gear.md": "# Gear\n\nBoots, a map and water.\n", "notes/huts.md": "# Huts\n\nThree huts.\n" });
}

const PANEL: Check[] = [
  {
    area: "outside-and-code",
    name: "git panel: space g opens it and focuses it — the repository and its branch at its top; again, it closes",
    covers: { cases: ["git"], commands: ["git.view"] },
    options: repoAt((s) => trail(s)),
    run: async (s) => {
      await s.where(/ · main$/);
      await leader(s, "g");
      await s.status("GIT");
      await s.see("Source control");
      await panelRow(s, "trail · main");
      await panelRow(s, "nothing uncommitted");
      await leader(s, "g");
      await s.notSee("Source control");
      await s.until(() => !s.statusLine().includes("GIT"), undefined, "the panel's keys gone with it");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: s stages the file selected and u unstages it; by mouse, its row's + stages it and − unstages it",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: repoAt(twoChanged),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "Changes (2)");
      // By keys: s on the file selected; it's selected where it went, so u takes it straight back.
      await selectRow(s, "M gear.md");
      await s.keys("s");
      await s.message("staged gear.md");
      await panelRow(s, "Staged (1)");
      s.expect(staged(s) === "gear.md", `gear.md staged, alone: ${staged(s)}`);
      await s.until(() => isSelected(s, "M gear.md"), undefined, "gear.md still selected, in Staged");
      await s.keys("u");
      await s.message("unstaged gear.md");
      await s.until(() => rowWith(s, "Staged (") < 0, undefined, "nothing staged");
      s.expect(staged(s) === "", `nothing staged: ${staged(s)}`);
      // By mouse: the pointer on a row shows its buttons; + stages it, and in Staged, − unstages it.
      await rowButton(s, "M huts.md", "+");
      await s.message("staged notes/huts.md");
      await panelRow(s, "Staged (1)");
      s.expect(staged(s) === "notes/huts.md", `huts.md staged, alone: ${staged(s)}`);
      await rowButton(s, "M huts.md", "−");
      await s.message("unstaged notes/huts.md");
      await s.until(() => rowWith(s, "Staged (") < 0, undefined, "nothing staged again");
      s.expect(staged(s) === "", `nothing staged: ${staged(s)}`);
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: i types in the message box, ctrl+enter commits what's staged with it; the box empty again",
    covers: { cases: ["git"], commands: ["git.view"] },
    options: repoAt((s) => {
      twoChanged(s);
      gitOk(s, TRAIL, "add", "gear.md");
    }),
    run: async (s) => {
      const commits = () => Number(gitOk(s, TRAIL, "rev-list", "--count", "HEAD"));
      await toPanel(s);
      await panelRow(s, "Staged (1)");
      await panelRow(s, "ctrl+enter commits");
      await s.keys("i");
      await s.type("Gear: water on the list");
      await panelRow(s, "Gear: water on the list");
      await s.keys("ctrl+enter");
      await s.message(/committed [0-9a-f]+: Gear: water on the list/);
      s.expect(gitOk(s, TRAIL, "log", "-1", "--format=%s") === "Gear: water on the list", "its message");
      s.expect(commits() === 2, "one commit more");
      // What was staged is in it; the change not staged is still there, and the box is empty again.
      await s.until(() => rowWith(s, "Staged (") < 0, undefined, "nothing staged after the commit");
      await panelRow(s, "M huts.md");
      await panelRow(s, "ctrl+enter commits");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: a file clicked shows its diff against what's staged; esc goes back to the panel",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: repoAt(twoChanged),
    run: async (s) => {
      await toPanel(s);
      await on(s, "M gear.md");
      await s.see("gear.md against what's staged — esc: source control");
      // A note's diff: its changed paragraph before and after.
      await s.see("┌ before");
      await s.see("Boots, a map and water.");
      await s.keys("escape");
      await s.notSee("gear.md against what's staged");
      await s.status("GIT");
      await panelRow(s, "M huts.md");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: a path with ? in its name is staged alone — never the file it would match as a pattern",
    covers: { cases: ["git", "hostile"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s, { "Why?.md": "# Why\n\nOne reason.\n", "WhyX.md": "# WhyX\n\nOne reason.\n" });
      put(s, TRAIL, { "Why?.md": "# Why\n\nTwo reasons.\n", "WhyX.md": "# WhyX\n\nTwo reasons.\n" });
    }),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "Changes (2)");
      await selectRow(s, "M Why?.md");
      await s.keys("s");
      await s.message("staged Why?.md");
      await s.until(() => staged(s) === "Why?.md", undefined, "Why?.md staged");
      s.expect(
        gitOk(s, TRAIL, "status", "--porcelain") === "M  Why?.md\n M WhyX.md",
        "WhyX.md, which Why?.md matches as a pattern, not staged",
      );
      await panelRow(s, "Staged (1)");
      await panelRow(s, "Changes (1)");
    },
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Branches and worktrees (GIT-D9, GIT-D10, GIT-D13).

/** A worktree of the trail for a new branch, beside it as `[git] worktrees` puts one: its path. */
export function worktree(s: Session, branch: string, from = "main"): string {
  const at = `${TRAIL}-${branch.replace(/\//g, "-")}`;
  gitOk(s, TRAIL, "worktree", "add", "-q", "-b", branch, s.path(at), from);
  return at;
}

const BRANCHES: Check[] = [
  {
    area: "outside-and-code",
    name: "git branches: this one first, then the worktrees', then the rest; a merged one folded under Merged or older",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s, { "gear.md": GEAR });
      // old/merged: where main was, merged into it since.
      gitOk(s, TRAIL, "branch", "old/merged");
      commit(s, TRAIL, { "README.md": `${GUIDE}\nWalked in summer.\n` }, "Summer");
      // fix/typo: a commit of its own; agent/ridge: in a worktree beside, with one of its own.
      gitOk(s, TRAIL, "switch", "-q", "-c", "fix/typo");
      commit(s, TRAIL, { "gear.md": "# Gear\n\nBoots, and a map.\n" }, "Typo");
      gitOk(s, TRAIL, "switch", "-q", "main");
      commit(s, worktree(s, "agent/ridge"), { "ridge.md": "# The ridge\n" }, "The ridge");
    }),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "Branches (4)");
      const main = await panelRow(s, /● main\b/);
      const ridge = await panelRow(s, /⎇ agent\/ridge\s+↑1 on main ◆/);
      const typo = await panelRow(s, /\bfix\/typo\s+↑1 on main/);
      const older = await panelRow(s, "▸ Merged or older (1)");
      s.expect(main < ridge && ridge < typo && typo < older, "this branch, the worktree's, the rest, then the folded");
      s.expect(rowWith(s, "old/merged") < 0, "the merged branch folded away");
      // Unfolded by a click: there, marked merged.
      await on(s, "Merged or older (1)");
      await panelRow(s, /old\/merged\s+✓/);
      s.expect(rowWith(s, "old/merged") > older, "under its heading");
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: n makes a branch from dev in a new worktree beside the repository, measured against dev",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s);
      gitOk(s, TRAIL, "switch", "-q", "-c", "dev");
      commit(s, TRAIL, { "winter.md": "# Winter\n\nThe ridge is closed.\n" }, "Winter");
      gitOk(s, TRAIL, "switch", "-q", "main");
    }),
    run: async (s) => {
      const folder = `${TRAIL}-agent-cache`;
      await toPanel(s);
      await panelRow(s, "Branches (2)");
      // From the panel's top, not a branch's row (whose n starts from that branch, without asking).
      await s.keys("g", "g");
      await s.keys("n");
      await s.see("new branch:");
      await s.type("agent/cache");
      await s.keys("enter");
      await s.see("agent/cache: from where?");
      await s.type("dev");
      await s.keys("enter");
      await s.see("agent/cache from dev: where?");
      await s.see("In a new worktree");
      await s.keys("enter");
      await s.message("made agent/cache from dev");
      await s.until(() => s.exists(`${folder}/winter.md`), undefined, "dev's files checked out beside the repository");
      s.expect(gitOk(s, folder, "branch", "--show-current") === "agent/cache", "the worktree on the new branch");
      await panelRow(s, /⎇ agent\/cache/);
      // An agent commits there; the panel shown again: one ahead of dev, the base it was made from, kept.
      commit(s, folder, { "cache.md": "# The cache\n" }, "The cache");
      await leader(s, "g");
      await s.notSee("Source control");
      await toPanel(s);
      await panelRow(s, /⎇ agent\/cache\s+↑1 on dev/);
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: Remove… refuses a branch not merged; a merged worktree's question names the ignored notes it deletes",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s);
      commit(s, worktree(s, "agent/ahead"), { "ridge.md": "# The ridge\n" }, "The ridge");
      const done = worktree(s, "agent/done");
      // An ignored note in the merged one: git deletes it with the worktree, unasked.
      s.write(`${TRAIL}/.git/info/exclude`, "local/\n");
      s.write(`${done}/local/draft.md`, "# A draft\n");
    }),
    run: async (s) => {
      await toPanel(s);
      // Not merged: refused, said why — as git answers, nothing else drawing it — its worktree kept.
      await on(s, "agent/ahead");
      await panelRow(s, "~/work/trail-agent-ahead");
      await branchButton(s, "agent/ahead", "[Remove…]");
      await s.message("not removed:");
      await said(
        s,
        "not removed agent/ahead",
        "not removed: agent/ahead isn't merged into main — 1 commit of its own; merge it first",
      );
      s.expect(s.exists(`${TRAIL}-agent-ahead/ridge.md`), "its worktree kept");
      // Merged: asked first, the question naming the note git deletes with it.
      await on(s, "agent/done");
      await branchButton(s, "agent/done", "[Remove…]");
      await s.see("Remove the worktree ~/work/trail-agent-done?");
      await s.see("Remove it, keep agent/done");
      await s.see("also deletes 1 ignored note: local/draft.md");
      await s.keys("escape");
      await s.notSee("Remove the worktree");
      s.expect(s.exists(`${TRAIL}-agent-done/local/draft.md`), "nothing deleted until asked");
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: a branch's base, the nearest of [git] bases — shift+r rebases topic onto dev, not main",
    covers: { cases: ["git", "config"], commands: ["git.view", "git.rebase"] },
    options: repoAt(
      (s) => {
        trail(s);
        // topic made from dev, which has moved on since; main hasn't.
        gitOk(s, TRAIL, "switch", "-q", "-c", "dev");
        commit(s, TRAIL, { "winter.md": "# Winter\n" }, "Winter");
        gitOk(s, TRAIL, "switch", "-q", "-c", "topic");
        commit(s, TRAIL, { "spring.md": "# Spring\n" }, "Spring");
        gitOk(s, TRAIL, "switch", "-q", "dev");
        commit(s, TRAIL, { "autumn.md": "# Autumn\n" }, "Autumn");
        gitOk(s, TRAIL, "switch", "-q", "topic");
      },
      { config: `${WIDE}\n[git]\nbases = ["main", "dev"]\n` },
    ),
    run: async (s) => {
      await toPanel(s);
      // Against dev, which leaves topic one commit of its own (main would leave two).
      await panelRow(s, /● topic\s+↑1 ↓1 on dev/);
      await s.keys("shift+r");
      await s.see("Rebase topic onto dev?");
      await s.keys("y");
      await s.message("rebased topic onto dev");
      s.expect(
        gitOk(s, TRAIL, "merge-base", "dev", "topic") === gitOk(s, TRAIL, "rev-parse", "dev"),
        "topic on dev's tip",
      );
      s.expect(gitOk(s, TRAIL, "log", "--format=%s", "dev..topic") === "Spring", "its one commit replayed");
      await panelRow(s, /● topic\s+↑1 on dev/);
    },
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Diffs (GIT-D2, GIT-D7): the window every diff opens in.

/** A line too long for a window, whose number changes. */
const LONG =
  "export const maxClimb = 450; // metres of climbing in a day, past which the guide suggests a night at the second hut before the ridge";
export const NUMBERS = `// The ridge trail's numbers.\nexport const huts = 2;\n${LONG}\nexport const days = 3;\n`;

/** The guide's numbers committed; the long line's number changed since. */
function numbersChanged(s: Session): void {
  trail(s, { "src/numbers.ts": NUMBERS });
  put(s, TRAIL, { "src/numbers.ts": NUMBERS.replace("= 450;", "= 600;") });
}

const SEASON =
  "# Seasons\n\nThe ridge path is closed in winter, when the snow lies deep on the north side and the huts are shut.\n\nThe huts open in May.\n";

/** A note with a sentence reworded since it was committed: one word. */
function seasonReworded(s: Session): void {
  trail(s, { "season.md": SEASON });
  put(s, TRAIL, { "season.md": SEASON.replace("lies deep", "lies thick") });
}

const DIFFS: Check[] = [
  {
    area: "outside-and-code",
    name: "git diff: only a changed line's changed words marked, the rest on its tint; a long line scrolls sideways to its end, never cut",
    covers: { cases: ["git", "code"], commands: ["git.view"] },
    // Narrow enough that the long line doesn't fit the window, and a code file's diff is its lines, unified.
    options: repoAt(numbersChanged, { size: { cols: 120, rows: 40 } }),
    run: async (s) => {
      await toPanel(s);
      await on(s, "M numbers.ts");
      await s.see("src/numbers.ts against what's staged");
      await s.see("+ export const maxClimb = 600;");
      await s.see("- export const maxClimb = 450;");
      s.expect(bgIn(s, "+ export const maxClimb", "600") === bgOf("diff_add_word"), "the added word marked");
      s.expect(bgIn(s, "+ export const maxClimb", "maxClimb") === bgOf("diff_add"), "the rest of its line tinted");
      s.expect(bgIn(s, "- export const maxClimb", "450") === bgOf("diff_del_word"), "the removed word marked");
      s.expect(bgIn(s, "- export const maxClimb", "maxClimb") === bgOf("diff_del"), "the rest of its line tinted");
      // Its end out of sight, never cut with …; the cursor at its end scrolls the rows to it, and back.
      const row = () => s.screen()[s.rowOf("+ export const maxClimb")] ?? "";
      s.expect(!row().includes("…") && !row().includes("before the ridge"), "its end beyond the edge, not cut");
      await s.keys("/");
      await s.type("600");
      await s.keys("enter", "$");
      await s.until(
        () => s.screen().some((r) => r.includes("+‹") && r.includes("before the ridge")),
        undefined,
        "the added line scrolled to its end, its start out of sight",
      );
      await s.keys("0");
      await s.see("+ export const maxClimb = 600;");
      await s.notSee("before the ridge");
      await s.keys("escape", "escape");
      await s.notSee("src/numbers.ts against what's staged");
    },
  },
  {
    area: "outside-and-code",
    name: "git diff: a note's reworded sentence before and after, only its changed word marked; tab shows its lines",
    covers: { cases: ["git", "paragraphs"], commands: ["git.view", "git.diff_view"] },
    options: repoAt(seasonReworded),
    run: async (s) => {
      await toPanel(s);
      await on(s, "M season.md");
      await s.see("season.md against what's staged");
      await s.see("┌ before");
      await s.see("┌ after");
      // The paragraph whole in each; the word it lost marked in the first, the word it gained in the second.
      s.expect(bgIn(s, "snow lies deep", "deep") === bgOf("diff_del_word"), "the word removed marked");
      s.expect(bgIn(s, "snow lies thick", "thick") === bgOf("diff_add_word"), "the word added marked");
      const rest = bgIn(s, "closed in winter, when the snow lies thick", "closed");
      s.expect(rest !== bgOf("diff_add_word") && rest !== bgOf("diff_add"), `the rest of the sentence plain: ${rest}`);
      // tab: its lines, as source; again, its blocks.
      await s.keys("tab");
      await s.notSee("┌ before");
      await s.see("- The ridge path is closed in winter, when the snow lies deep");
      await s.see("+ The ridge path is closed in winter, when the snow lies thick");
      await s.keys("tab");
      await s.see("┌ before");
    },
  },
  {
    area: "outside-and-code",
    name: "git diff: a code file's diff side by side at 200 columns, both sides scrolled sideways together; at 120, unified",
    covers: { cases: ["git", "code", "width"], commands: ["git.view"] },
    options: repoAt(numbersChanged, { size: { cols: 200, rows: 50 } }),
    run: async (s) => {
      await toPanel(s);
      await on(s, "M numbers.ts");
      await s.see("src/numbers.ts against what's staged");
      // The line removed beside the line it became.
      await s.see(/- export const maxClimb = 450;.*│ \+ export const maxClimb = 600;/);
      // Its end out of sight on each side; the cursor at its end scrolls both, by one offset.
      await s.keys("/");
      await s.type("600");
      await s.keys("enter", "$");
      const both = (r: string) => r.split("before the ridge").length === 3 && r.split("‹").length === 3;
      await s.until(() => s.screen().some(both), undefined, "both sides scrolled to the line's end");
      await s.keys("0");
      await s.see(/- export const maxClimb = 450;.*│ \+ export const maxClimb = 600;/);
      // Narrower than two columns of 80: the same diff, unified — the line removed, then the line it became.
      await s.resize(120, 40);
      const minus = () => s.rowOf("- export const maxClimb = 450;");
      await s.until(
        () => minus() >= 0 && s.rowOf("+ export const maxClimb = 600;") > minus(),
        undefined,
        "the diff unified at 120 columns",
      );
      s.expect(!s.screen()[s.rowOf("- export const maxClimb")]!.includes("│ +"), "nothing beside the line removed");
    },
  },
  {
    area: "outside-and-code",
    name: "git diff: a file whose only change is its line endings says so in a dim row — no diff of every line, nor nothing",
    covers: { cases: ["git", "encoding"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s, { "camp.md": "# Camp\n\nPitch the tent.\nBoil the water.\n" });
      // Written again with CRLF, by an editor on another system: every byte of every line changed, no word.
      put(s, TRAIL, { "camp.md": "# Camp\r\n\r\nPitch the tent.\r\nBoil the water.\r\n" });
    }),
    run: async (s) => {
      await toPanel(s);
      await on(s, "M camp.md");
      await s.see("camp.md against what's staged");
      await s.see("\\ line endings: LF → CRLF");
      s.expect(!s.text().includes("┌ before") && !s.text().includes("┌ removed"), "no block shown changed");
      await s.keys("escape");
      await s.notSee("camp.md against what's staged");
      await s.status("GIT");
    },
  },
];

// ---------------------------------------------------------------------------------------------------------------
// The review (GIT-D3): what isn't staged, a hunk at a time.

/** A list of days, a line each. */
const DAYS = (f: (i: number) => string) => `${Array.from({ length: 12 }, (_, i) => f(i + 1)).join("\n")}\n`;

const REVIEW: Check[] = [
  {
    area: "outside-and-code",
    name: "git review: v walks the changes not staged a hunk at a time — n and p move, enter goes to the change",
    covers: {
      cases: ["git"],
      commands: ["git.review", "git.review_next", "git.review_prev", "git.review_go"],
    },
    options: repoAt((s) => {
      trail(s, { "days.md": DAYS((i) => `- Day ${i}: walk.`) });
      // Two changes far apart in one file, and a new file: three hunks.
      put(s, TRAIL, {
        "days.md": DAYS((i) =>
          i === 2 ? "- Day 2: rest at the hut." : i === 11 ? "- Day 11: the ridge." : `- Day ${i}: walk.`,
        ),
        "water.md": "# Water\n",
      });
    }),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "Changes (1)");
      await s.keys("v");
      await s.see("Review — 1 of 3");
      await s.see("days.md  line 2 · change 1 of 2 here, 1 of 3 in all");
      await s.see("y keep  x revert  c note for the agent  n next  p previous");
      await s.see("Day 2: rest at the hut.");
      await s.keys("n");
      await s.see("Review — 2 of 3");
      await s.see("days.md  line 11 · change 2 of 2 here, 2 of 3 in all");
      await s.keys("n");
      await s.see("water.md  line 1 · change 1 of 1 here, 3 of 3 in all  new file");
      await s.keys("p");
      await s.see("Review — 2 of 3");
      // enter: the review over, the file open at the change.
      await s.keys("enter");
      await s.notSee("Review — ");
      await s.status(/days\.md.*L11:/);
      await s.message("review: nothing kept, reverted or noted");
    },
  },
  {
    area: "outside-and-code",
    name: "git review: y keeps a change (staged), x reverts one (saved at once), c writes a note for the agent",
    covers: {
      cases: ["git", "scratch"],
      commands: ["git.review", "git.review_keep", "git.review_revert", "git.review_note", "scratch.copy"],
    },
    options: repoAt((s) => {
      trail(s, {
        "anchors.md": "Pack light.\n",
        "boots.md": "One map.\nTwo boots.\n",
        "camp.md": "Start early.\n",
      });
      put(s, TRAIL, {
        "anchors.md": "Pack light.\nPack water.\n",
        "boots.md": "One map.\nTwo BOOTS.\n",
        "camp.md": "Start late.\n",
      });
    }),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "Changes (3)");
      await s.keys("v");
      await s.see("Review — 1 of 3");
      await s.see("anchors.md  line 2");
      // y: staged, as the panel's s stages a change; on to the next.
      await s.keys("y");
      await s.see("Review — 2 of 3");
      await s.until(() => staged(s) === "anchors.md", undefined, "anchors.md's change staged");
      await s.see("boots.md  line 2");
      // x: its lines as staged, in the file, saved at once.
      await s.keys("x");
      await s.file(`${TRAIL}/boots.md`, (t) => t === "One map.\nTwo boots.\n", "boots.md reverted and saved");
      await s.see("Review — 3 of 3");
      await s.see("camp.md  line 1");
      // c: a note asked for, then into the scratch with the file, its line and its diff.
      await s.keys("c");
      await s.see("note for the agent:");
      await s.type("ask why it starts late");
      await s.keys("enter");
      // None left: the review over, what it did said. Nothing committed.
      await s.notSee("Review — ");
      await s.message("review: 1 kept (staged), 1 reverted");
      s.expect(gitOk(s, TRAIL, "rev-list", "--count", "HEAD") === "1", "nothing committed");
      await said(
        s,
        "review kept reverted",
        "review: 1 kept (staged), 1 reverted, 1 note for the agent in the scratch — space s y copies it",
      );
      await leader(s, "s", "y");
      await s.until(
        () =>
          /\*\*At:\*\* `camp\.md:1`/.test(s.clipboard()) && s.clipboard().includes("**Note:** ask why it starts late"),
        undefined,
        "the scratch holding camp.md:1 and the note",
      );
      s.expect(s.clipboard().includes("-Start early.\n+Start late."), "and the change itself");
    },
  },
  {
    area: "outside-and-code",
    name: "git review: tab draws a note's change as its lines, and again as its blocks before and after",
    covers: { cases: ["git", "paragraphs"], commands: ["git.review", "git.diff_view"] },
    options: repoAt(seasonReworded),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "Changes (1)");
      await s.keys("v");
      await s.see("Review — 1 of 1");
      await s.see("┌ before");
      await s.see("┌ after");
      await s.keys("tab");
      await s.notSee("┌ before");
      await s.see("- The ridge path is closed in winter, when the snow lies deep");
      await s.see("+ The ridge path is closed in winter, when the snow lies thick");
      await s.keys("tab");
      await s.see("┌ after");
      await s.see("Review — 1 of 1");
    },
  },
  {
    area: "outside-and-code",
    name: "git review: a file changed on disk since the review read it is refused a revert, left as it is",
    covers: { cases: ["git", "watching"], commands: ["git.review", "git.review_revert", "git.review_next"] },
    options: repoAt((s) => {
      trail(s, { "boots.md": "One map.\nTwo boots.\n" });
      put(s, TRAIL, { "boots.md": "One map.\nTwo BOOTS.\n", "water.md": "# Water\n" });
    }),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "Changes (1)");
      await s.keys("v");
      await s.see("Review — 1 of 2");
      await s.see("boots.md  line 2");
      // An agent writes over the change meanwhile: x finds it gone, and leaves the file as the agent left it.
      s.write(`${TRAIL}/boots.md`, "One map.\nTwo boots, waxed.\n");
      await s.keys("x");
      await said(s, "boots.md changed since", "boots.md changed since the review read it: that change isn't there now");
      s.expect(s.read(`${TRAIL}/boots.md`) === "One map.\nTwo boots, waxed.\n", "boots.md as the agent left it");
      // A new file changed meanwhile: not sent to the trash.
      await s.see("Review — 1 of 2");
      await s.keys("n");
      await s.see("water.md  line 1");
      s.write(`${TRAIL}/water.md`, "# Water\n\nFill up at the spring.\n");
      await s.keys("x");
      await said(s, "water.md changed since", "water.md changed since the review read it: left as it is");
      s.expect(s.read(`${TRAIL}/water.md`) === "# Water\n\nFill up at the spring.\n", "water.md as the agent left it");
    },
  },
];

// ---------------------------------------------------------------------------------------------------------------
// The merge screen (GIT-D5): git's conflicts settled a card at a time.

/** Lines between two conflicts: enough that git keeps them apart. */
const GAP =
  "\nThe trail is marked in red.\nIt climbs through the pines.\nThe views open at the col.\nA bench waits at the top.\nThe descent is steep.\n\n";
const RIDGE = `# The ridge\n\nThe trail opens in May.\n${GAP}Water at the second hut.\n${GAP}Parking is free.\n`;

/**
 * The files committed on main as `base`; a branch, theirs, changing them one way, main another; theirs merged into
 * main: the merge stopped at its conflicts, git's markers in the files.
 */
function conflicted(
  s: Session,
  base: Record<string, string>,
  mine: Record<string, string>,
  theirs: Record<string, string>,
): void {
  trail(s, base);
  gitOk(s, TRAIL, "switch", "-q", "-c", "theirs");
  commit(s, TRAIL, theirs, "Theirs");
  gitOk(s, TRAIL, "switch", "-q", "main");
  commit(s, TRAIL, mine, "Mine");
  s.expect(git(s, TRAIL, "merge", "-q", "theirs").code !== 0, "the merge stopped at its conflicts");
}

/** main and theirs each change the same three lines of ridge.md, far apart: three conflicts. */
const ridgeConflicts = (s: Session) =>
  conflicted(
    s,
    { "ridge.md": RIDGE },
    {
      "ridge.md": RIDGE.replace("in May", "in April")
        .replace("at the second hut", "at the spring")
        .replace("is free", "is by the gate"),
    },
    {
      "ridge.md": RIDGE.replace("in May", "in June")
        .replace("at the second hut", "at the first hut")
        .replace("is free", "costs a coin"),
    },
  );

/** A note showing git's markers as an example, in a code fence; its last line `end`. */
const settleDoc = (end: string) =>
  `# How to settle a conflict\n\n\`\`\`\n<<<<<<< HEAD\nmine\n=======\nyours\n>>>>>>> branch\n\`\`\`\n\n${end}\n`;

const MERGE: Check[] = [
  {
    area: "outside-and-code",
    name: "git merge screen: x opens it on a real conflict; o, t and b take yours, theirs and both",
    covers: {
      cases: ["git"],
      commands: ["git.merge_screen", "git.merge_ours", "git.merge_theirs", "git.merge_both", "git.merge_save"],
    },
    options: repoAt(ridgeConflicts),
    run: async (s) => {
      // The merge under way, said after the branch where you are (GIT-D6, WSP-D4).
      await s.where(/ · main merging$/);
      await toPanel(s);
      await panelRow(s, "Conflicts (1)");
      await selectRow(s, "U ridge.md");
      await s.keys("x");
      await s.see("Merge — ridge.md");
      await s.see("Conflict 1 of 3 · line 3 · not settled");
      await s.see("Yours · HEAD, against the base");
      await s.see("Theirs · theirs, against the base");
      await s.see("The result · 0 of 3 settled");
      await s.keys("o");
      await s.see("Conflict 2 of 3");
      await s.see("@@ conflict 1, line 3: yours");
      await s.keys("t");
      await s.see("Conflict 3 of 3");
      await s.see("@@ conflict 2, line 11: theirs");
      await s.keys("b");
      await s.see("@@ conflict 3, line 19: both, yours first");
      await s.see("The result · 3 of 3 settled — w saves it");
      // Saved, the file is what was taken: April, the first hut, the gate then the coin.
      await s.keys("w");
      await s.file(
        `${TRAIL}/ridge.md`,
        (t) =>
          t ===
          RIDGE.replace("in May", "in April")
            .replace("at the second hut", "at the first hut")
            .replace("Parking is free.", "Parking is by the gate.\nParking costs a coin."),
        "ridge.md as settled",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "git merge screen: w, ctrl+s and :w save the file settled; s stages it, and the next file in conflict opens",
    covers: { cases: ["git", "save"], commands: ["git.merge_screen", "git.merge_save", "git.merge_stage"] },
    options: repoAt((s) => {
      const three = (text: string) =>
        Object.fromEntries(["Camp", "Food", "Maps"].map((n) => [`${n.toLowerCase()}.md`, `# ${n}\n\n${text}\n`]));
      conflicted(s, three("The old way."), three("My way."), three("Their way."));
    }),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "Conflicts (3)");
      await selectRow(s, "U camp.md");
      await s.keys("x");
      await s.see("Merge — camp.md");
      // w saves; s stages, marking it resolved: the next file in conflict opens.
      await s.keys("o");
      await s.see("The result · 1 of 1 settled — w saves it");
      await s.keys("w");
      await s.message("saved camp.md");
      await s.file(`${TRAIL}/camp.md`, (t) => t === "# Camp\n\nMy way.\n", "camp.md saved as settled");
      await s.keys("s");
      await s.message("camp.md staged, marked resolved");
      await s.see("Merge — food.md");
      // ctrl+s saves, as w does.
      await s.keys("t");
      await s.keys("ctrl+s");
      await s.message("saved food.md");
      await s.file(`${TRAIL}/food.md`, (t) => t === "# Food\n\nTheir way.\n", "food.md saved as settled");
      await s.keys("s");
      await s.see("Merge — maps.md");
      // :w too.
      await s.keys("b");
      await s.ex("w");
      await s.message("saved maps.md");
      await s.file(`${TRAIL}/maps.md`, (t) => t === "# Maps\n\nMy way.\nTheir way.\n", "maps.md saved as settled");
      await s.keys("s");
      await s.message("maps.md staged, marked resolved");
      await s.notSee("Merge — ");
      s.expect(gitOk(s, TRAIL, "ls-files", "--unmerged") === "", "no file in conflict left");
      s.expect(
        gitOk(s, TRAIL, "diff", "--cached", "--name-only") === "food.md\nmaps.md",
        "the two that changed staged",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "git merge screen: a ======= setext underline inside yours — o keeps yours whole, as git's index has it",
    covers: { cases: ["git", "headings"], commands: ["git.merge_screen", "git.merge_ours", "git.merge_save"] },
    options: repoAt((s) => {
      // Yours made the line a heading, its underline as long as git's marker.
      conflicted(
        s,
        { "summit.md": "Start at the gate.\nThe old path.\nEnd at the hut.\n" },
        { "summit.md": "Start at the gate.\nSummary\n=======\nThe path by the ridge.\nEnd at the hut.\n" },
        { "summit.md": "Start at the gate.\nThe new path, by the stream.\nEnd at the hut.\n" },
      );
      s.expect(
        s.read(`${TRAIL}/summit.md`).includes("Summary\n=======\nThe path by the ridge.\n=======\n"),
        "two ======= lines in the conflict",
      );
    }),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "Conflicts (1)");
      await selectRow(s, "U summit.md");
      await s.keys("x");
      await s.see("Merge — summit.md");
      await s.see("Conflict 1 of 1");
      s.expect(!s.text().includes("Ambiguous"), "git's index says which ======= parts the sides");
      await s.keys("o");
      await s.see("The result · 1 of 1 settled — w saves it");
      await s.keys("w");
      await s.file(
        `${TRAIL}/summit.md`,
        (t) => t === "Start at the gate.\nSummary\n=======\nThe path by the ridge.\nEnd at the hut.\n",
        "yours whole, its underline kept",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "git merge screen: git's markers inside a code fence are an example in the note, not a conflict",
    covers: { cases: ["git", "code"], commands: ["git.merge_screen", "git.merge_ours", "git.merge_save"] },
    options: repoAt((s) =>
      conflicted(
        s,
        { "settle.md": settleDoc("Walk back by dusk.") },
        { "settle.md": settleDoc("Walk back by six.") },
        { "settle.md": settleDoc("Walk back by noon.") },
      ),
    ),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "Conflicts (1)");
      await selectRow(s, "U settle.md");
      await s.keys("x");
      await s.see("Merge — settle.md");
      // One conflict, at the end: the fenced one is the note's text.
      await s.see("Conflict 1 of 1 · line 11");
      await s.keys("o");
      await s.keys("w");
      await s.file(
        `${TRAIL}/settle.md`,
        (t) => t === settleDoc("Walk back by six."),
        "the example kept byte for byte, the conflict settled",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "git merge screen: n and p move, shift+b takes both theirs first, a sends one to the agent, e opens the rest to edit",
    covers: {
      cases: ["git", "scratch"],
      commands: [
        "git.merge_screen",
        "git.merge_next",
        "git.merge_prev",
        "git.merge_both_theirs",
        "git.merge_agent",
        "git.merge_edit",
      ],
    },
    options: repoAt(ridgeConflicts),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "Conflicts (1)");
      await selectRow(s, "U ridge.md");
      await s.keys("x");
      await s.see("Conflict 1 of 3");
      await s.keys("n");
      await s.see("Conflict 2 of 3");
      await s.keys("n");
      await s.see("Conflict 3 of 3");
      await s.keys("p");
      await s.see("Conflict 2 of 3");
      // Both, theirs first; on to the next one not settled.
      await s.keys("shift+b");
      await s.see("@@ conflict 2, line 15: both, theirs first");
      await s.see("Conflict 3 of 3");
      // a: the conflict, its base between the sides, into the scratch with a note.
      await s.keys("a");
      await s.see("note for the agent:");
      await s.type("keep both, gate first");
      await s.keys("enter");
      await s.message("conflict 3 in the scratch for the agent");
      // e: the result in the file, what isn't settled still marked, to settle by hand; unsaved.
      await s.keys("e");
      await s.notSee("Merge — ridge.md");
      await s.status(/ridge\.md.* unsaved/);
      s.expect(s.read(`${TRAIL}/ridge.md`).includes("<<<<<<< HEAD"), "nothing written yet");
      await leader(s, "s", "y");
      await s.until(
        () =>
          s.clipboard().includes("**Note:** keep both, gate first") &&
          s.clipboard().includes("<<<<<<< HEAD\nParking is by the gate.\n||||||| base\nParking is free.\n======="),
        undefined,
        "the conflict and its base in the scratch, with the note",
      );
    },
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Rebasing onto the base (GIT-D6).

/** agent made from main: its two commits, the first changing the line main changed since — a rebase stops there. */
function behind(s: Session): void {
  trail(s, { "route.md": "Start at the gate.\nCross the bridge.\nEnd at the hut.\n", "gear.md": GEAR });
  gitOk(s, TRAIL, "switch", "-q", "-c", "agent");
  commit(s, TRAIL, { "route.md": "Start at the gate.\nCross the old bridge.\nEnd at the hut.\n" }, "Agent: bridge");
  commit(s, TRAIL, { "gear.md": "# Gear\n\nBoots, a map and a rope.\n" }, "Agent: rope");
  gitOk(s, TRAIL, "switch", "-q", "main");
  commit(s, TRAIL, { "route.md": "Start at the gate.\nCross the new bridge.\nEnd at the hut.\n" }, "Main: bridge");
  gitOk(s, TRAIL, "switch", "-q", "agent");
}

/** shift+r in the panel, answered y: the rebase onto main under way. */
async function rebaseOntoMain(s: Session): Promise<void> {
  await s.keys("shift+r");
  await s.see("Rebase agent onto main?");
  await s.keys("y");
}

/** agent made from main, its commit a new file; main's since, a change to gear.md: a rebase that meets no conflict. */
function apart(s: Session, files: Record<string, string> = {}): void {
  trail(s, { "gear.md": GEAR, ...files });
  gitOk(s, TRAIL, "switch", "-q", "-c", "agent");
  commit(s, TRAIL, { "rope.md": "# Rope\n" }, "Agent: rope");
  gitOk(s, TRAIL, "switch", "-q", "main");
  commit(s, TRAIL, { "gear.md": "# Gear\n\nBoots, a map and water.\n" }, "Main: water");
  gitOk(s, TRAIL, "switch", "-q", "agent");
}

/** agent on main's tip: rebased. */
const rebased = (s: Session) => gitOk(s, TRAIL, "merge-base", "main", "agent") === gitOk(s, TRAIL, "rev-parse", "main");

const CAMP = "# Camp\n\nPitch the tent.\n";

const REBASE: Check[] = [
  {
    area: "outside-and-code",
    name: "git rebase: shift+r asks, then rebases the branch onto its base",
    covers: { cases: ["git"], commands: ["git.rebase"] },
    options: repoAt((s) => {
      trail(s, { "gear.md": GEAR });
      gitOk(s, TRAIL, "switch", "-q", "-c", "agent");
      commit(s, TRAIL, { "rope.md": "# Rope\n" }, "Agent: rope");
      gitOk(s, TRAIL, "switch", "-q", "main");
      commit(s, TRAIL, { "gear.md": "# Gear\n\nBoots, a map and water.\n" }, "Main: water");
      gitOk(s, TRAIL, "switch", "-q", "agent");
    }),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, /● agent\s+↑1 ↓1 on main/);
      await s.keys("shift+r");
      await s.see("Rebase agent onto main?");
      // n: nothing done.
      await s.keys("n");
      await s.notSee("Rebase agent onto main?");
      s.expect(gitOk(s, TRAIL, "merge-base", "main", "agent") !== gitOk(s, TRAIL, "rev-parse", "main"), "not rebased");
      await rebaseOntoMain(s);
      await s.message("rebased agent onto main");
      s.expect(
        gitOk(s, TRAIL, "merge-base", "main", "agent") === gitOk(s, TRAIL, "rev-parse", "main"),
        "agent on main's tip",
      );
      s.expect(gitOk(s, TRAIL, "log", "--format=%s", "main..agent") === "Agent: rope", "its commit replayed");
      await panelRow(s, /● agent\s+↑1 on main/);
    },
  },
  {
    area: "outside-and-code",
    name: "git rebase: a conflict stops it — said, the merge screen not opened over the message typed; x opens it",
    covers: { cases: ["git"], commands: ["git.rebase", "git.merge_screen"] },
    options: repoAt(behind),
    run: async (s) => {
      await toPanel(s);
      await s.keys("shift+r");
      await s.see("Rebase agent onto main?");
      // y, and at once i: typing in the message box while git rebases.
      await s.keys("y", "i");
      await s.type("tws");
      await s.message("the rebase stopped at commit 1 of 2");
      // Not opened over the typing: the letters went into the box, none to the merge screen.
      await panelRow(s, "tws");
      s.expect(!s.text().includes("Merge — route.md"), "no merge screen while typing");
      await s.where(/ · agent rebasing 1\/2$/);
      s.expect(gitOk(s, TRAIL, "ls-files", "--unmerged").includes("route.md"), "route.md still in conflict");
      // Typing done (esc leaves the box): what was said names x, and x opens it, the rebase said on it.
      await s.keys("escape");
      s.expect(
        (await lastMessage(s, "rebase stopped")).includes("x in source control opens the merge screen (:resolve)"),
        "how to open it, said",
      );
      await s.status("GIT");
      await s.keys("x");
      await s.see("Merge — route.md");
      await s.see("Rebasing: yours is what's rebased onto; theirs, the commit being replayed");
    },
  },
  {
    area: "outside-and-code",
    name: "git rebase: stopped at a conflict, continue and skip carry it on; abort asks first, and y gives it up",
    covers: {
      cases: ["git"],
      commands: ["git.rebase", "git.continue", "git.skip", "git.abort", "git.merge_theirs", "git.merge_stage"],
    },
    options: repoAt(behind),
    run: async (s) => {
      const was = gitOk(s, TRAIL, "rev-parse", "agent");
      const stopped = async () => {
        await s.see("Merge — route.md");
        await s.see("Conflict 1 of 1");
      };
      // Continue: the conflict settled and staged, shift+r offers to carry on.
      await toPanel(s);
      await rebaseOntoMain(s);
      await stopped();
      await s.keys("t");
      await s.keys("w");
      await s.message("saved route.md");
      await s.keys("s");
      await s.message("route.md staged, marked resolved");
      await toPanel(s);
      await s.keys("shift+r");
      await s.see("(c) Continue");
      await s.see("(s) Skip this commit");
      await s.see("(a) Abort");
      await s.keys("c");
      await s.message("rebased: the rebase is done");
      s.expect(gitOk(s, TRAIL, "log", "--format=%s", "main..agent") === "Agent: rope\nAgent: bridge", "both replayed");
      s.expect(s.read(`${TRAIL}/route.md`).includes("Cross the old bridge."), "theirs taken: the commit replayed");
      // Skip: from where agent was, the conflicting commit left out.
      gitOk(s, TRAIL, "reset", "-q", "--hard", was);
      await rebaseOntoMain(s);
      await stopped();
      await s.keys("escape");
      await s.notSee("Merge — route.md");
      await toPanel(s);
      await s.keys("shift+r");
      await s.see("(s) Skip this commit");
      await s.keys("s");
      await s.message("rebased: the rebase is done, a commit skipped");
      s.expect(gitOk(s, TRAIL, "log", "--format=%s", "main..agent") === "Agent: rope", "the conflicting one left out");
      // Abort: asked first; y, and agent is as it was.
      gitOk(s, TRAIL, "reset", "-q", "--hard", was);
      await rebaseOntoMain(s);
      await stopped();
      await s.keys("escape");
      await s.notSee("Merge — route.md");
      await toPanel(s);
      await s.keys("shift+r");
      await s.see("(a) Abort");
      await s.keys("a");
      await s.see("Abort the rebase?");
      await s.keys("y");
      await s.message("the rebase aborted: agent as it was");
      s.expect(gitOk(s, TRAIL, "rev-parse", "HEAD") === was, "agent where it was");
      s.expect(gitOk(s, TRAIL, "status", "--porcelain") === "", "nothing left of it");
    },
  },
  {
    area: "outside-and-code",
    name: "git rebase: shift+r over files changed asks to stash them too — n, nothing done; y, rebased and the changes put back",
    covers: { cases: ["git"], commands: ["git.view", "git.rebase"] },
    options: repoAt((s) => {
      apart(s, { "huts.md": HUTS, "camp.md": CAMP });
      // A change not staged, one staged, and a new file git doesn't track (not one it refuses a rebase over).
      put(s, TRAIL, { "huts.md": "# Huts\n\nThree huts.\n", "camp.md": "# Camp\n\nPitch the tent early.\n" });
      gitOk(s, TRAIL, "add", "camp.md");
      put(s, TRAIL, { "water.md": "# Water\n" });
    }),
    run: async (s) => {
      const was = gitOk(s, TRAIL, "rev-parse", "HEAD");
      await toPanel(s);
      await panelRow(s, /● agent\s+↑1 ↓1 on main/);
      // The question's window wraps its words at 60 columns: two files changed, the untracked one not counted.
      await s.keys("shift+r");
      await s.see("Stash your changes, rebase agent onto main, put them back? 2");
      await s.see("files changed; its 1 commit replayed after main's 1 new.");
      // n: nothing done — not rebased, nothing stashed, the changes where they were.
      await s.keys("n");
      await s.notSee("Stash your changes");
      s.expect(gitOk(s, TRAIL, "rev-parse", "HEAD") === was, "not rebased");
      s.expect(gitOk(s, TRAIL, "stash", "list") === "", "nothing stashed");
      s.expect(s.read(`${TRAIL}/huts.md`) === "# Huts\n\nThree huts.\n", "the change where it was");
      // y: stashed, rebased, put back.
      await s.keys("shift+r");
      await s.see("Stash your changes, rebase agent onto main, put them back? 2");
      await s.keys("y");
      await s.message("rebased agent onto main");
      await s.until(() => rebased(s), undefined, "agent on main's tip");
      s.expect(gitOk(s, TRAIL, "log", "--format=%s", "main..agent") === "Agent: rope", "its commit replayed");
      s.expect(s.read(`${TRAIL}/huts.md`) === "# Huts\n\nThree huts.\n", "the change not staged put back");
      s.expect(s.read(`${TRAIL}/camp.md`) === "# Camp\n\nPitch the tent early.\n", "the staged one put back");
      s.expect(s.read(`${TRAIL}/water.md`) === "# Water\n", "the untracked file where it was");
      s.expect(s.read(`${TRAIL}/gear.md`).includes("water"), "main's change here");
      s.expect(gitOk(s, TRAIL, "stash", "list") === "", "no stash left behind");
      await panelRow(s, /● agent\s+↑1 on main/);
    },
  },
  {
    area: "outside-and-code",
    name: "git rebase: changes that conflict going back stay in the stash — the stash and the file in conflict named",
    covers: { cases: ["git"], commands: ["git.view", "git.rebase"] },
    options: repoAt((s) => {
      apart(s);
      // gear.md's line, which main changed too.
      put(s, TRAIL, { "gear.md": "# Gear\n\nBoots, a map and a rope.\n" });
    }),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, /● agent\s+↑1 ↓1 on main/);
      await s.keys("shift+r");
      await s.see("Stash your changes, rebase agent onto main, put them back? 1");
      await s.see("file changed; its 1 commit replayed after main's 1 new.");
      await s.keys("y");
      await s.message("rebased agent onto main");
      const said = await lastMessage(s, "conflicted going back");
      const kept =
        'rebased agent onto main — your changes conflicted going back, so git kept them in the stash, stash@{0} ("autostash"): 1 file in conflict (gear.md) — x in source control settles it (:resolve), then drop the stash (z)';
      s.expect(said.startsWith(kept), `said: ${kept}\n(the newest holding "conflicted going back": ${said})`);
      s.expect(rebased(s), "agent on main's tip");
      // Kept in the stash, the file in conflict: nothing of yours lost.
      s.expect(gitOk(s, TRAIL, "stash", "list", "--format=%gd %gs") === "stash@{0} autostash", "the stash kept");
      s.expect(gitOk(s, TRAIL, "show", "stash@{0}:gear.md").includes("a rope"), "your change in it");
      s.expect(
        gitOk(s, TRAIL, "status", "--porcelain", "--untracked-files=no") === "UU gear.md",
        "gear.md in conflict",
      );
      await toPanel(s);
      await panelRow(s, "Conflicts (1)");
    },
  },
];

// ---------------------------------------------------------------------------------------------------------------
// The remote and stash (26.6, GIT-D4): a bare repository in the check's folder as origin.

const REMOTE: Check[] = [
  {
    area: "outside-and-code",
    name: "git remote: f fetches — the branch's ↓, the Pull button's count; p pulls, fast-forward, from a bare remote",
    covers: { cases: ["git", "status"], commands: ["git.fetch", "git.pull"] },
    options: repoAt((s) => {
      trail(s);
      const { other } = withOrigin(s);
      pushedElsewhere(s, other, { "water.md": "# Water\n\nAt the spring.\n" }, "Water");
    }),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "in step with origin/main");
      await s.keys("f");
      await s.message("fetched: main is 1 commit behind origin/main");
      await s.where(/ · main ↓1$/);
      await panelRow(s, "[↓ Pull 1]");
      s.expect(!s.exists(`${TRAIL}/water.md`), "nothing pulled by a fetch");
      await s.keys("p");
      await s.message(/pulled: main fast-forwarded to [0-9a-f]+/);
      await s.file(`${TRAIL}/water.md`, (t) => t.includes("At the spring."), "their file here");
      await s.where(/ · main$/);
      await panelRow(s, "in step with origin/main");
    },
  },
  {
    area: "outside-and-code",
    name: "git remote: both sides moved — p asks merge, rebase or nothing; r rebases onto the upstream",
    covers: { cases: ["git"], commands: ["git.pull"] },
    options: repoAt((s) => {
      trail(s);
      const { other } = withOrigin(s);
      pushedElsewhere(s, other, { "water.md": "# Water\n" }, "Theirs: water");
      commit(s, TRAIL, { "rope.md": "# Rope\n" }, "Mine: rope");
    }),
    run: async (s) => {
      await toPanel(s);
      await s.keys("p");
      await s.see("main and origin/main have both moved on — bring them together?");
      await s.see("(m) Merge origin/main into main");
      await s.see("(r) Rebase main onto origin/main");
      await s.see("(n) Nothing");
      await s.keys("r");
      await s.message("pulled: main rebased onto origin/main");
      s.expect(
        gitOk(s, TRAIL, "log", "--format=%s", "-2") === "Mine: rope\nTheirs: water",
        "mine replayed after theirs, no merge commit",
      );
      await s.file(`${TRAIL}/water.md`, (t) => t === "# Water\n", "their file here");
    },
  },
  {
    area: "outside-and-code",
    name: "git remote: a pull's rebase over a file changed asks to stash it — n pulls nothing; y rebases and puts it back",
    covers: { cases: ["git"], commands: ["git.pull"] },
    options: repoAt((s) => {
      trail(s, { "gear.md": GEAR });
      const { other } = withOrigin(s);
      pushedElsewhere(s, other, { "water.md": "# Water\n" }, "Theirs: water");
      commit(s, TRAIL, { "rope.md": "# Rope\n" }, "Mine: rope");
      put(s, TRAIL, { "gear.md": "# Gear\n\nBoots, a map and a stove.\n" });
    }),
    run: async (s) => {
      const mine = "# Gear\n\nBoots, a map and a stove.\n";
      const was = gitOk(s, TRAIL, "rev-parse", "HEAD");
      /** p, and the rebase answered: the question asked (its window wraps its words at 60 columns). */
      const rebaseAnswer = async () => {
        await s.keys("p");
        await s.see("(r) Rebase main onto origin/main");
        await s.keys("r");
        await s.see("Stash your changes, rebase main onto origin/main, put them");
        await s.see("back? 1 file changed.");
      };
      await toPanel(s);
      // n: nothing pulled — the change where it was, nothing stashed.
      await rebaseAnswer();
      await s.keys("n");
      await s.notSee("Stash your changes");
      s.expect(gitOk(s, TRAIL, "rev-parse", "HEAD") === was, "nothing pulled");
      s.expect(gitOk(s, TRAIL, "stash", "list") === "", "nothing stashed");
      s.expect(s.read(`${TRAIL}/gear.md`) === mine, "the change where it was");
      // y: stashed, rebased onto the upstream, put back.
      await rebaseAnswer();
      await s.keys("y");
      await s.message("pulled: main rebased onto origin/main");
      s.expect(
        gitOk(s, TRAIL, "log", "--format=%s", "-2") === "Mine: rope\nTheirs: water",
        "mine replayed after theirs, no merge commit",
      );
      await s.file(`${TRAIL}/water.md`, (t) => t === "# Water\n", "their file here");
      s.expect(s.read(`${TRAIL}/gear.md`) === mine, "the change put back");
      s.expect(gitOk(s, TRAIL, "stash", "list") === "", "no stash left behind");
    },
  },
  {
    area: "outside-and-code",
    name: "git remote: shift+p pushes to the upstream; a branch with none asks first — n pushes nothing, y tracks it",
    covers: { cases: ["git"], commands: ["git.push"] },
    options: repoAt((s) => {
      trail(s);
      withOrigin(s);
      commit(s, TRAIL, { "rope.md": "# Rope\n" }, "Rope");
    }),
    run: async (s) => {
      const bare = join(s.dir, "remote", "trail.git");
      await toPanel(s);
      await panelRow(s, "[↑ Push 1]");
      await s.keys("shift+p");
      await s.message("pushed main to origin/main");
      s.expect(gitOk(s, bare, "rev-parse", "main") === gitOk(s, TRAIL, "rev-parse", "HEAD"), "main pushed");
      // A new branch, made by an agent: no upstream, so asked.
      gitOk(s, TRAIL, "switch", "-q", "-c", "topic");
      await s.where(/ · topic$/);
      await panelRow(s, "[↑ Publish]");
      await s.keys("shift+p");
      await s.see("topic has no upstream. Push it to origin/topic");
      await s.keys("n");
      await s.notSee("topic has no upstream.");
      s.expect(git(s, bare, "rev-parse", "--verify", "-q", "refs/heads/topic").code !== 0, "nothing pushed");
      await s.keys("shift+p");
      await s.see("topic has no upstream. Push it to origin/topic");
      await s.keys("y");
      await s.message("pushed topic to origin/topic");
      s.expect(
        gitOk(s, TRAIL, "rev-parse", "--abbrev-ref", "topic@{upstream}") === "origin/topic",
        "topic tracks origin/topic",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "git remote: z stashes the changes, untracked files too, with a message; then pops them back",
    covers: { cases: ["git"], commands: ["git.stash"] },
    options: repoAt((s) => {
      trail(s, { "gear.md": GEAR });
      put(s, TRAIL, { "gear.md": "# Gear\n\nBoots, a map and water.\n", "water.md": "# Water\n" });
    }),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "Untracked (1)");
      await s.keys("z");
      await s.see("Stashes (0) — enter: pop, apply or drop one");
      await s.see("Stash the changes, untracked files too…");
      await s.keys("down", "enter");
      await s.see("stash message:");
      await s.type("wip: water and gear");
      await s.keys("enter");
      await s.message("stashed: wip: water and gear");
      await s.until(
        () => !s.exists(`${TRAIL}/water.md`) && s.read(`${TRAIL}/gear.md`) === GEAR,
        undefined,
        "the files back as committed, the new one gone with the stash",
      );
      await s.keys("z");
      await s.see("stash@{0}  On main: wip: water and gear");
      await s.keys("down", "down", "enter");
      await s.see("Pop it");
      await s.keys("enter");
      await s.message("popped stash@{0}");
      await s.until(
        () => s.exists(`${TRAIL}/water.md`) && s.read(`${TRAIL}/gear.md`).includes("water"),
        undefined,
        "both back",
      );
      s.expect(gitOk(s, TRAIL, "stash", "list") === "", "the stash gone from the list");
    },
  },
];

export const SOURCE_CONTROL: Check[] = [...PANEL, ...BRANCHES, ...DIFFS, ...REVIEW, ...MERGE, ...REBASE, ...REMOTE];
