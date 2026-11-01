// The git panel holding still as git answers (D261): its repositories never sorted under the pointer, and every row
// kept to by what it is — the selection on its row as rows come, go and are sorted, the row under a resting pointer on
// its line, a click on the row under it. git's answers are brought from outside, as an agent's work brings them: a
// file changed in a repository, then a note written in the vault, whose news has the panel ask git again. The pointer
// moves and clicks as a terminal reports it (SGR's mouse reports). Source control's own checks are source-control.ts's.

import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Check, EXPLORER, explorerOpen, explorerRow, leader } from "../check.ts";
import type { Session, SessionOptions } from "../session.ts";
import {
  bgOf,
  commitAt,
  gitOk,
  isSelected,
  mouse,
  panelPart,
  panelRow,
  put,
  repoAt,
  rowWith,
  selectRow,
  TRAIL,
  toPanel,
  trail,
  WHO,
} from "./source-control.ts";
import { selectedPath } from "./slow-disk.ts";
import { repositories } from "./vaults.ts";

/** The folder of repositories (vaults.ts's): alpha clean, beta's worktree's new file to review, gamma changed. */
const PROJECTS: SessionOptions = {
  startAt: "projects/a.md",
  config: "[ui]\nsidebar_width = 60\n",
  setup: repositories,
};

/** A path in the folder of repositories. */
const at = (s: Session, ...parts: string[]) => join(s.dir, "projects", ...parts);

/** The repositories, as the panel lists them, top to bottom. */
const order = (s: Session) =>
  s
    .screen()
    .map((_, i) => /[▸▾] (alpha|beta|gamma)(\s|$)/.exec(panelPart(s, i))?.[1])
    .filter(Boolean)
    .join(",");

/** git's news: a note written in the vault at `dir`, which the watcher brings, and the panel asks git again. */
let told = 0;
const news = (s: Session, dir: string) => s.write(join(dir, `news-${++told}.md`), "# News\n");

/**
 * git, slow to say how things stand while `slow` is there: `status` answers a second and a half later, as on a busy
 * machine; the rest at once. The panel follows a file staged once `status` has answered.
 */
function slowGit(s: Session): void {
  const bin = join(s.dir, "bin");
  mkdirSync(bin, { recursive: true });
  const real = Bun.which("git") ?? "git";
  const slow = `[ -e "${join(s.dir, "slow")}" ] && for a in "$@"; do [ "$a" = status ] && sleep 1.5 && break; done`;
  writeFileSync(join(bin, "git"), `#!/bin/sh\n${slow}\nexec "${real}" "$@"\n`);
  chmodSync(join(bin, "git"), 0o755);
}

/** The pointer off the panel, over the note. */
const away = (s: Session) => mouse(s, 150, 10, "move");

/** The trail repository with two branches besides main, a commit of its own on each (not merged, so listed). */
function branches(s: Session): void {
  trail(s);
  const now = Math.floor(Date.now() / 1000);
  // Newest first, a minute apart: ridge-notes is last even when both commits are made within the same second.
  for (const [b, date] of [
    ["dawn-start", now],
    ["ridge-notes", now - 60],
  ] as const) {
    gitOk(s, TRAIL, "switch", "-q", "-c", b);
    put(s, TRAIL, { [`${b}.md`]: `# ${b}\n` });
    gitOk(s, TRAIL, "add", "-A");
    commitAt(s, TRAIL, b, date);
    gitOk(s, TRAIL, "switch", "-q", "main");
  }
}

/** The trail repository, eighty new files in it: more rows than the panel shows. */
function crowded(s: Session): void {
  branches(s);
  put(
    s,
    TRAIL,
    Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`n${String(i).padStart(2, "0")}.md`, "# N\n"])),
  );
}

/** A folder of repositories: alpha clean, beta's eighty new files, gamma clean with a clean worktree beside it. */
function crowdedProjects(s: Session): void {
  const top = join(s.dir, "projects");
  mkdirSync(join(top, ".slipbox"), { recursive: true });
  s.write(join(top, "a.md"), "# Projects\n");
  for (const name of ["alpha", "beta", "gamma"]) {
    s.write(join(top, name, "x.md"), `# ${name}\n`);
    gitOk(s, join(top, name), "init", "-q", "-b", "main");
    gitOk(s, join(top, name), "add", "-A");
    gitOk(s, join(top, name), "commit", "-q", "-m", "start");
  }
  gitOk(s, join(top, "gamma"), "worktree", "add", "-q", "-b", "agent", join(top, "gamma-agent"), "main");
  for (let i = 0; i < 80; i++) s.write(join(top, "beta", `n${String(i).padStart(2, "0")}.md`), "# N\n");
}

/**
 * A folder of repositories, two of them in `group/`: alpha clean, beta changed; gamma beside the group, changed and its
 * worktree too, the most to review.
 */
function grouped(s: Session): void {
  const top = join(s.dir, "projects");
  mkdirSync(join(top, ".slipbox"), { recursive: true });
  s.write(join(top, "a.md"), "# Projects\n");
  s.write(join(top, "b.md"), "# Plans\n");
  for (const name of ["group/alpha", "group/beta", "gamma"]) {
    s.write(join(top, name, "x.md"), "# X\n");
    gitOk(s, join(top, name), "init", "-q", "-b", "main");
    gitOk(s, join(top, name), "add", "-A");
    gitOk(s, join(top, name), "commit", "-q", "-m", "start");
  }
  s.write(join(top, "group/beta", "x.md"), "# X, changed\n");
  s.write(join(top, "gamma", "x.md"), "# X, changed\n");
  gitOk(s, join(top, "gamma"), "worktree", "add", "-q", "-b", "agent", join(top, "gamma-agent"), "main");
  s.write(join(top, "gamma-agent", "y.md"), "# Y\n");
}

/** A route with "one" in two places far apart: changed alike, two changes of one file with the same lines. */
const ROUTE = (word: string) => `# Route\n\n${word}\n\n${"a\nb\nc\nd\ne\nf\ng\nh\n"}\n${word}\n`;

/** The background of the panel's row `y`, at its text's first cell past the rail. */
const rowBg = (s: Session, y: number) => {
  let n = 0;
  for (const r of s.runs()[y] ?? []) {
    if (n + r.text.length > 6 && r.text.trim()) return r.bg?.toLowerCase() ?? null;
    n += r.text.length;
  }
  return null;
};

/** How many frames slipbox has drawn so far (SLIPBOX_TRACE's `frame` lines). */
const frames = (s: Session) =>
  readFileSync(s.trace, "utf8")
    .split("\n")
    .filter((l) => l === "frame").length;

/** The screen rows of the panel holding `needle`, top to bottom. */
const rowsWith = (s: Session, needle: string) =>
  s
    .screen()
    .map((_, i) => i)
    .filter((i) => panelPart(s, i).includes(needle));

export const GIT_STEADY: Check[] = [
  {
    area: "outside-and-code",
    name: "git panel holds still: the pointer on a repository's row keeps their order as git answers; a click opens the one under it; off the rows, sorted (D261)",
    covers: { cases: ["git", "mouse", "multiple-roots"], commands: ["git.view"] },
    options: PROJECTS,
    run: async (s) => {
      await toPanel(s);
      await s.until(() => order(s) === "beta,gamma,alpha", 15_000, "beta, gamma, alpha: by what needs attention");
      const y = rowWith(s, /▸ alpha\b/);
      await mouse(s, 10, y, "move");
      // alpha changed, and git's news: alpha says so on its row, held under the pointer.
      s.write(at(s, "alpha", "x.md"), "# alpha, changed\n");
      news(s, at(s));
      await s.until(() => /▸ alpha\b.*✎1/.test(panelPart(s, y)), 10_000, "alpha's change said on its row, held");
      s.expect(order(s) === "beta,gamma,alpha", `the order held under the pointer: ${order(s)}`);
      await mouse(s, 10, y);
      await s.until(() => /▾ alpha\b/.test(panelPart(s, y)), undefined, "alpha opened up, the row clicked");
      // The pointer off the rows: by what needs attention, alpha before gamma by name.
      await away(s);
      await s.until(() => order(s) === "beta,alpha,gamma", undefined, "sorted once the pointer left");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: a pointer that hasn't moved since the panel showed holds nothing; the row under it shows its button (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: PROJECTS,
    run: async (s) => {
      await toPanel(s);
      await s.until(() => order(s) === "beta,gamma,alpha", 15_000, "by what needs attention");
      const y = rowWith(s, /▸ alpha\b/);
      // The panel closed; the pointer where alpha's row was; the panel again, by keys, under it.
      await leader(s, "g");
      await s.until(() => rowWith(s, /▸ alpha\b/) < 0, undefined, "the panel closed");
      await mouse(s, 10, y, "move");
      await toPanel(s);
      await s.until(() => order(s) === "beta,gamma,alpha", undefined, "the panel back");
      s.write(at(s, "alpha", "x.md"), "# alpha, changed\n");
      news(s, at(s));
      await s.until(() => order(s) === "beta,alpha,gamma", 10_000, "sorted: the pointer hasn't moved since");
      // What's under the pointer is the row there now: gamma's, its button showing.
      await s.until(() => /▸ gamma\b.*›/.test(panelPart(s, y)), undefined, "gamma's › under the pointer");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: the selection stays on its repository by keys as git sorts them, enter opens it; its file's row too; the panel's first row stays first after esc (D261)",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view"] },
    options: PROJECTS,
    run: async (s) => {
      await toPanel(s);
      await s.until(() => order(s) === "beta,gamma,alpha", 15_000, "by what needs attention");
      await s.until(() => isSelected(s, "▸ beta"), undefined, "the panel's first row selected: beta");
      // n, a key of the panel's own (a new branch: none here), then left by esc; beta's worktree clean again: beta
      // goes last, and the first row is still the one selected.
      await s.keys("n");
      await s.keys("escape");
      gitOk(s, at(s, "beta-agent"), "clean", "-qf");
      news(s, at(s));
      await s.until(() => order(s) === "gamma,alpha,beta", 10_000, "gamma, alpha, beta");
      await toPanel(s);
      await s.until(() => isSelected(s, "▸ gamma"), undefined, "the first row selected still: gamma");
      // alpha chosen by keys; alpha changed: alpha first by name, alpha selected still; enter opens it.
      await s.keys("j");
      await s.until(() => isSelected(s, "▸ alpha"), undefined, "alpha selected");
      s.write(at(s, "alpha", "x.md"), "# alpha, changed\n");
      news(s, at(s));
      await s.until(() => order(s) === "alpha,gamma,beta", 10_000, "alpha, gamma, beta");
      s.expect(isSelected(s, "▸ alpha"), "alpha selected still, at its new place");
      await s.keys("enter");
      await panelRow(s, /▾ alpha\b/);
      // Its file selected; beta's worktree to review again: beta first, alpha's file selected still.
      await s.keys("j", "j");
      await s.until(() => isSelected(s, "M x.md"), undefined, "alpha's x.md selected");
      s.write(at(s, "beta-agent", "y.md"), "# Y\n");
      news(s, at(s));
      await s.until(() => order(s) === "beta,alpha,gamma", 10_000, "beta, alpha, gamma");
      s.expect(isSelected(s, "M x.md"), "alpha's x.md selected still");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: the panel's own pick clicked is the user's, and follows its repository as git sorts them (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: PROJECTS,
    run: async (s) => {
      await toPanel(s);
      await s.until(() => order(s) === "beta,gamma,alpha", 15_000, "by what needs attention");
      await mouse(s, 10, rowWith(s, /▸ beta\b/));
      await panelRow(s, /▾ beta\b/);
      await away(s);
      // beta's worktree clean: beta goes last, selected still.
      gitOk(s, at(s, "beta-agent"), "clean", "-qf");
      news(s, at(s));
      await s.until(() => order(s) === "gamma,alpha,beta", 10_000, "gamma, alpha, beta");
      await s.until(() => isSelected(s, "▾ beta"), undefined, "beta selected still, last");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: the mouse turned off, the pointer holds nothing; turned on, not until it moves (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view", "ui.mouse"] },
    options: PROJECTS,
    run: async (s) => {
      await toPanel(s);
      await s.until(() => order(s) === "beta,gamma,alpha", 15_000, "by what needs attention");
      const y = rowWith(s, /▸ alpha\b/);
      await mouse(s, 10, y, "move");
      s.write(at(s, "alpha", "x.md"), "# alpha, changed\n");
      news(s, at(s));
      await s.until(() => /▸ alpha\b.*✎1/.test(panelPart(s, y)), 10_000, "alpha's change, held");
      // The mouse off: sorted.
      await leader(s, "u", "m");
      await s.until(() => order(s) === "beta,alpha,gamma", undefined, "sorted, the mouse off");
      // On again, the pointer not reported since: beta clean, beta goes last.
      await leader(s, "u", "m");
      gitOk(s, at(s, "beta-agent"), "clean", "-qf");
      news(s, at(s));
      await s.until(() => order(s) === "alpha,gamma,beta", 10_000, "sorted: the pointer not reported since");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: filtered under a resting pointer, then not: the repositories in their places, the first row selected (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: PROJECTS,
    run: async (s) => {
      await toPanel(s);
      await s.until(() => order(s) === "beta,gamma,alpha", 15_000, "by what needs attention");
      // The pointer low on the panel's rows, below the last.
      await mouse(s, 10, rowWith(s, /▸ alpha\b/) + 6, "move");
      await s.keys("/");
      await s.type("gam"); // typos: ignore-line
      await s.until(() => order(s) === "gamma", undefined, "gamma alone");
      await s.keys("backspace", "backspace", "backspace");
      await s.until(() => order(s) === "beta,gamma,alpha", undefined, "the three in their places");
      await s.until(() => isSelected(s, "▸ beta"), undefined, "the first row selected");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: a repository followed out of view is scrolled to as git sorts it first (D261)",
    covers: { cases: ["git"], commands: ["git.view"] },
    options: { startAt: "projects/a.md", config: "[ui]\nsidebar_width = 60\n", setup: crowdedProjects },
    run: async (s) => {
      await toPanel(s);
      await s.until(() => order(s) === "beta,alpha,gamma", 15_000, "beta, alpha, gamma");
      // beta opened up, its eighty files under it; gamma, the last, selected at the bottom.
      await s.keys("enter");
      await panelRow(s, "? n00.md");
      await s.keys("shift+g");
      await s.until(() => isSelected(s, "▸ gamma"), undefined, "gamma selected, at the bottom");
      // gamma's worktree changed: gamma first, selected still, and in view.
      s.write(at(s, "gamma-agent", "w.md"), "# W\n");
      news(s, at(s));
      await s.until(() => /^gamma/.test(order(s)), 10_000, "gamma first");
      await s.until(() => isSelected(s, "▸ gamma"), undefined, "gamma selected, scrolled to");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: another view isn't held to the order drawn for the last, though the pointer rests on the rows (D261)",
    covers: { cases: ["git", "mouse", "multiple-roots"], commands: ["git.view", "note.open"] },
    options: { startAt: "projects/a.md", config: "[ui]\nsidebar_width = 60\n", setup: grouped },
    run: async (s) => {
      await toPanel(s);
      await s.until(() => order(s) === "gamma,beta,alpha", 15_000, "the folder's, by what needs attention");
      // The view zoomed into group/: its two, the pointer on them.
      await explorerOpen(s);
      await explorerRow(s, "group");
      await s.keys("z");
      await toPanel(s);
      await s.until(() => order(s) === "beta,alpha", 10_000, "group's: beta, alpha");
      await mouse(s, 10, rowWith(s, /▸ beta\b/), "move");
      // A note outside it opened: the view zoomed out to the folder, its list by what needs attention, gamma first.
      await s.ex(`e ${at(s, "b.md")}`);
      await s.until(() => order(s).split(",").length === 3, 10_000, "the folder's three again");
      await s.until(() => order(s) === "gamma,beta,alpha", undefined, "gamma first, not held to group's order");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: a branch stays selected as new files arrive above it; the row under a resting pointer stays on its line (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: repoAt(branches),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "dawn-start");
      await selectRow(s, "dawn-start");
      put(s, TRAIL, { "camp.md": "# Camp\n", "water.md": "# Water\n" });
      await panelRow(s, "Untracked (2)");
      await s.until(() => isSelected(s, "dawn-start"), undefined, "dawn-start selected still, rows above it");
      // The pointer on ridge-notes; two files more: ridge-notes on its line still.
      const y = await panelRow(s, "ridge-notes");
      await mouse(s, 10, y, "move");
      put(s, TRAIL, { "maps.md": "# Maps\n", "food.md": "# Food\n" });
      await panelRow(s, "? food.md");
      await s.until(() => rowWith(s, "ridge-notes") === y, undefined, "ridge-notes on its line");
      // enter opens the branch selected: dawn-start.
      await s.keys("enter");
      await s.until(() => /▾/.test(panelPart(s, rowWith(s, "dawn-start"))), undefined, "dawn-start opened up");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: a pointer resting below the last row: rows arriving above leave the spot under it empty; the filter's line isn't held (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: repoAt(branches),
    run: async (s) => {
      await toPanel(s);
      const last = await panelRow(s, /ridge-notes.*↑1/);
      await mouse(s, 10, last + 2, "move");
      put(s, TRAIL, { "camp.md": "# Camp\n", "water.md": "# Water\n" });
      // The rows above it scrolled up out of sight, the last row kept where it was.
      await panelRow(s, "? water.md");
      await s.until(() => rowWith(s, "ridge-notes") === last, undefined, "the last row where it was");
      // Under the pointer, no row: blank but for the scrollbar's column, the list scrolled past its end.
      const under = panelPart(s, last + 2).replace(/[▐▕▌█▒░│┃]\s*$/u, "");
      s.expect(under.trim() === "", `nothing under the pointer: ${panelPart(s, last + 2)}`);
      // The filter opened: its line pushes the rows down, the first still in view.
      await mouse(s, 10, last, "move");
      await s.keys("/");
      await s.until(
        () => rowWith(s, "Untracked (2)") >= 0 && rowWith(s, "ridge-notes") > last,
        undefined,
        "pushed down",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: files gone above a resting pointer's row, the list scrolled: the row stays on its line; a key's move shows the selection though the pointer rests (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: repoAt(crowded),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "? n40.md");
      // Scrolled down two notches by the wheel; the pointer on the file at the middle.
      for (let i = 0; i < 2; i++) await s.send("\x1b[<65;10;30M");
      await s.until(() => rowWith(s, "? n02.md") < 0, undefined, "scrolled past n02");
      const y = rowWith(s, "? n40.md");
      await mouse(s, 10, y, "move");
      // Three files gone above it, on screen: once they're gone from the panel, n40 is on its line still.
      gitOk(s, TRAIL, "clean", "-qf", "n10.md", "n11.md", "n12.md");
      await s.until(() => rowWith(s, "? n11.md") < 0, 10_000, "n11 gone from the panel");
      await s.until(() => rowWith(s, "? n40.md") === y, undefined, "n40 on its line");
      // G: the last row selected and shown, though the pointer rests on the rows.
      await s.keys("shift+g");
      await s.until(
        () => isSelected(s, "Merged or older") || isSelected(s, "ridge-notes"),
        undefined,
        "the last row shown",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: scrolled by the wheel away from the selection, rows arriving above it leave the view where the wheel left it (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: repoAt(crowded),
    run: async (s) => {
      await toPanel(s);
      await selectRow(s, "? n05.md");
      for (let i = 0; i < 4; i++) await s.send("\x1b[<65;10;30M");
      await s.until(() => rowWith(s, "? n05.md") < 0, undefined, "scrolled past the selection");
      await away(s);
      const top = panelPart(s, rowWith(s, /\? n\d\d\.md/));
      // A file new before them all: the selection a row further down, out of sight; the view as the wheel left it.
      put(s, TRAIL, { "a0.md": "# A0\n" });
      await s
        .until(() => panelPart(s, rowWith(s, /\? n\d\d\.md/)) !== top || rowWith(s, "? n05.md") >= 0, 10_000, "a0 in")
        .catch(() => undefined);
      await Bun.sleep(500);
      s.expect(rowWith(s, "? n05.md") < 0, "the view where the wheel left it, n05 out of sight");
      s.expect(gitOk(s, TRAIL, "status", "--porcelain", "a0.md") === "?? a0.md", "a0 there");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: its top growing over the pointer's line (the buttons wrapped by Review): its first row still in sight (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: repoAt(
      (s) => {
        trail(s);
        put(s, TRAIL, { "camp.md": "# Camp\n" });
        gitOk(s, TRAIL, "add", "camp.md");
      },
      { config: "[ui]\nsidebar_width = 56\n" },
    ),
    run: async (s) => {
      await toPanel(s);
      const y = await panelRow(s, "Staged (1)");
      await mouse(s, 10, y, "move");
      // A change not staged: Review among the buttons, wrapped onto a line more; Staged under it, in sight.
      put(s, TRAIL, { "README.md": "# Ridge trail\n\nChanged.\n" });
      await panelRow(s, "[Review]");
      await panelRow(s, "Staged (1)");
      s.expect(rowWith(s, "Staged (1)") === y + 1, `Staged a line down: ${rowWith(s, "Staged (1)")}`);
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: a file gone for good from where it was selected: the selection lets go of it, and doesn't jump back when it returns; the panel's pick acted on is the user's (D261)",
    covers: { cases: ["git"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s, { "gear.md": "# Gear\n", "huts.md": "# Huts\n" });
      put(s, TRAIL, { "gear.md": "# Gear\n\nBoots.\n", "huts.md": "# Huts\n\nThree.\n" });
    }),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "M huts.md");
      // The panel's pick, its first row — Changes, or gear.md when git had answered as the panel opened; l on it: the
      // user's now. huts.md staged elsewhere: Staged above it, and the pick selected still.
      await s.until(
        () => isSelected(s, "Changes (2)") || isSelected(s, "M gear.md"),
        undefined,
        "the panel's pick: its first row",
      );
      const pick = isSelected(s, "Changes (2)") ? "Changes (" : "M gear.md";
      await s.keys("l");
      gitOk(s, TRAIL, "add", "huts.md");
      put(s, TRAIL, { "camp.md": "# Camp\n" });
      await panelRow(s, "Staged (1)");
      await s.until(() => isSelected(s, pick), undefined, `${pick} selected still, below Staged`);
      // gear.md selected; staged elsewhere: gone from Changes for good. A while after, changed again: Changes once
      // more, and the selection stays where it went.
      await selectRow(s, "M gear.md");
      gitOk(s, TRAIL, "add", "gear.md");
      put(s, TRAIL, { "maps.md": "# Maps\n" });
      await panelRow(s, "Staged (2)");
      await Bun.sleep(1500);
      put(s, TRAIL, { "gear.md": "# Gear\n\nBoots and a map.\n" });
      await panelRow(s, "Changes (1)");
      await Bun.sleep(300);
      // Changes' gear.md (Staged has one too, above): not the row selected.
      const changes = rowWith(s, "Changes (1)");
      const there = rowsWith(s, "M gear.md").find((y) => y > changes);
      s.expect(there !== undefined, "gear.md in Changes");
      s.expect(rowBg(s, there!) !== bgOf("sidebar_selected"), "not pulled back to gear.md in Changes");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: a file staged by its + in a panel the wheel scrolled: the view stays where the wheel left it (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: repoAt(crowded),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "? n40.md");
      for (let i = 0; i < 2; i++) await s.send("\x1b[<65;10;30M");
      await s.until(() => rowWith(s, "? n02.md") < 0, undefined, "scrolled past n02");
      // The pointer on n40's row, then its + clicked: n40 staged, and the view not jumped back to the top.
      const y = rowWith(s, "? n40.md");
      await mouse(s, 10, y, "move");
      await s.until(() => panelPart(s, y).includes(" + "), undefined, "n40's buttons");
      const row = panelPart(s, y);
      const x = Bun.stringWidth(row.slice(0, row.lastIndexOf(" + "))) + 2;
      await mouse(s, x, y, "move");
      await mouse(s, x, y);
      await s.until(() => gitOk(s, TRAIL, "diff", "--cached", "--name-only") === "n40.md", 10_000, "n40 staged");
      await s.until(() => rowWith(s, "? n41.md") >= 0, undefined, "the panel drawn again");
      await Bun.sleep(300);
      s.expect(rowWith(s, "? n02.md") < 0, "the view where the wheel left it, not jumped back to the top");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: a file opened from it by o, the note open closed after: its selection its own, on its row (D261)",
    covers: { cases: ["git"], commands: ["git.view", "tab.close_all"] },
    options: repoAt((s) => {
      branches(s);
      put(s, TRAIL, Object.fromEntries(["d1", "d2", "d3", "d4", "d5"].map((n) => [`${n}.md`, `# ${n}\n`])));
    }),
    run: async (s) => {
      await toPanel(s);
      await selectRow(s, "? d5.md");
      // o: d5.md opened, the explorer shown it; back on the panel, d5.md selected still.
      await s.keys("o");
      await s.status(/d5\.md/, 5000);
      await toPanel(s);
      await s.until(() => isSelected(s, "? d5.md"), undefined, "d5.md selected still");
      // ridge-notes selected; every tab closed — This file's rows gone, above it: ridge-notes selected still.
      await selectRow(s, "ridge-notes");
      await leader(s, "t", "shift+q");
      await s.until(() => rowWith(s, "This file") < 0, undefined, "This file's rows gone");
      await s.until(() => isSelected(s, "ridge-notes"), undefined, "ridge-notes selected still");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: scrolled past its end to keep a resting pointer's row: the scrollbar's thumb stays in the list (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: repoAt(crowded),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "? n40.md");
      for (let i = 0; i < 12; i++) await s.send("\x1b[<65;10;30M");
      await s.until(() => rowWith(s, "ridge-notes") >= 0, undefined, "scrolled to the end");
      const y = rowWith(s, /\? n\d\d\.md/);
      await mouse(s, 10, y, "move");
      const name = /\? (n\d\d)\.md/.exec(panelPart(s, y))![1]!;
      // The ten files after it gone, more rows still than the list holds: scrolled past its end to keep that row on
      // its line.
      const all = Array.from({ length: 80 }, (_, i) => `n${String(i).padStart(2, "0")}`);
      const after = all.filter((n) => n > name).slice(0, 10);
      gitOk(s, TRAIL, "clean", "-qf", ...after.map((n) => `${n}.md`));
      await s.until(() => rowWith(s, `? ${after[0]}.md`) < 0, 10_000, "the files after it gone");
      await s.until(() => panelPart(s, y).includes(`? ${name}.md`), undefined, `${name} on its line`);
      // The footer's rule and text, and the pane's bottom border, under the list: no thumb there.
      const footer = s.screen().findIndex((_, r) => r > y && /^\s*[─━]{4,}/.test(panelPart(s, r)));
      s.expect(footer > y, "the footer's rule under the list");
      const title = s.screen().findIndex((r) => /Source control +[│┃]/.test(r));
      const border = [...s.screen()[title]!].findIndex((c) => c === "│" || c === "┃");
      for (let r = footer; r < s.rows - 1; r++) {
        const cells = [...(s.screen()[r] ?? "")].slice(0, border + 1);
        s.expect(!cells.includes("▐"), `the thumb drawn under the list, at row ${r}: ${cells.join("")}`);
      }
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: away to the explorer and back, the selection on its branch, rows having come above it meanwhile (D261)",
    covers: { cases: ["git"], commands: ["git.view"] },
    options: repoAt(branches),
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, "dawn-start");
      await selectRow(s, "dawn-start");
      await leader(s, "e");
      await s.until(() => !s.statusLine().includes(" GIT "), undefined, "the explorer");
      put(s, TRAIL, { "camp.md": "# Camp\n", "water.md": "# Water\n" });
      await s.see("camp.md", 10_000);
      await toPanel(s);
      await panelRow(s, "Untracked (2)");
      await s.until(() => isSelected(s, "dawn-start"), undefined, "dawn-start selected still");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: two changes of one file alike: the first selected stays the first as rows arrive above (D261)",
    covers: { cases: ["git"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s, { "route.md": ROUTE("one") });
      put(s, TRAIL, { "route.md": ROUTE("uno") });
    }),
    run: async (s) => {
      await toPanel(s);
      await selectRow(s, "M route.md");
      // Opened up: its two changes, alike; the first selected.
      await s.keys("l");
      await s.until(() => rowsWith(s, "uno").length === 2, undefined, "its two changes");
      await s.keys("j");
      await s.until(() => isSelected(s, "uno"), undefined, "the first change selected");
      put(s, TRAIL, { "camp.md": "# Camp\n" });
      await panelRow(s, "Untracked (1)");
      // Its changes read again (gone a moment, back): the first selected still, not the second.
      await s.until(() => rowsWith(s, "uno").length === 2, 10_000, "its two changes back");
      await s.until(() => isSelected(s, "uno"), undefined, "the first change selected still");
      // The pointer on the second: the frames settle (none asking for another, as it rests).
      const second = rowsWith(s, "uno")[1]!;
      await mouse(s, 10, second, "move");
      await s.settle();
      const drawn = frames(s);
      await Bun.sleep(600);
      s.expect(frames(s) - drawn <= 1, `frames drawn while the pointer rests: ${frames(s) - drawn}`);
      // Clicked, the second selected — its diff shown, as enter shows it; esc back — and s stages it.
      await mouse(s, 10, second);
      await s.see("route.md against what's staged");
      await s.keys("escape");
      await s.notSee("route.md against what's staged");
      await s.until(
        () => rowsWith(s, "uno")[1] === second && rowBg(s, second) === bgOf("sidebar_selected"),
        undefined,
        "the second selected",
      );
      await s.keys("s");
      // The second's change staged — line 14's — the first's not.
      const staged = () => gitOk(s, TRAIL, "diff", "--cached", "-U0", "route.md");
      await s.until(() => /@@ -14 /.test(staged()), 10_000, "line 14's change staged");
      s.expect(!/@@ -3 /.test(staged()), "line 3's change not staged");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: the footer says what the button under the pointer does as rows arrive above it (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s, { "gear.md": "# Gear\n", "notes/huts.md": "# Huts\n" });
      put(s, TRAIL, { "gear.md": "# Gear\n\nBoots.\n", "notes/huts.md": "# Huts\n\nThree.\n" });
    }),
    run: async (s) => {
      await toPanel(s);
      // The pointer on huts.md's row, then on its ↺.
      const y = await panelRow(s, "M huts.md");
      await mouse(s, 10, y, "move");
      await s.until(() => panelPart(s, rowWith(s, "M huts.md")).includes(" ↺ "), undefined, "huts.md's buttons");
      const row = panelPart(s, rowWith(s, "M huts.md"));
      await mouse(s, Bun.stringWidth(row.slice(0, row.lastIndexOf(" ↺ "))) + 2, rowWith(s, "M huts.md"), "move");
      await s.see("discards its changes, after asking");
      // gear.md staged, and a file new: Staged and Untracked above huts.md now.
      gitOk(s, TRAIL, "add", "gear.md");
      put(s, TRAIL, { "camp.md": "# Camp\n" });
      await panelRow(s, "Changes (1)");
      await panelRow(s, "? camp.md");
      await s.see("discards its changes, after asking");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: the pointer resting on its scrollbar holds nothing: rows arriving above move the rows beside it (D261)",
    covers: { cases: ["git", "mouse"], commands: ["git.view"] },
    options: repoAt(crowded),
    run: async (s) => {
      await toPanel(s);
      const y = await panelRow(s, "? n10.md");
      // The scrollbar's column: where its thumb is drawn.
      const thumb = s
        .screen()
        .map((_, r) => [...panelPart(s, r)].indexOf("▐"))
        .find((c) => c >= 0);
      s.expect(thumb !== undefined, "the panel's scrollbar drawn");
      await mouse(s, thumb! + 1, y, "move");
      // A file new before them all: n10 a line further down, not held on the pointer's line.
      put(s, TRAIL, { "a0.md": "# A0\n" });
      await panelRow(s, "? a0.md");
      await s.until(() => rowWith(s, "? n10.md") === y + 1, undefined, "n10 a line down, not held");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: scrolled past its end to keep a resting pointer's row, the wheel down: the rows don't move down (D261)",
    covers: { cases: ["git", "mouse", "multiple-roots"], commands: ["git.view"] },
    options: PROJECTS,
    run: async (s) => {
      await toPanel(s);
      await s.until(() => order(s) === "beta,gamma,alpha", 15_000, "beta, gamma, alpha: by what needs attention");
      await selectRow(s, "▸ beta");
      const y = rowWith(s, /▸ alpha\b/);
      await mouse(s, 10, y, "move");
      // beta opened up by its key: its rows above alpha, which stays on the pointer's line — scrolled past the end.
      await s.keys("right");
      await s.until(
        () => rowWith(s, /▸ beta\b/) < 0 && rowWith(s, /▾ beta\b/) < 0,
        10_000,
        "beta scrolled off the top",
      );
      s.expect(rowWith(s, /▸ alpha\b/) === y, "alpha on the pointer's line");
      // The wheel down: nothing more below to show; the rows stay, alpha on its line.
      await s.send(`\x1b[<65;10;${y + 1}M`);
      await Bun.sleep(500);
      s.expect(rowWith(s, /▸ alpha\b/) === y, `alpha on its line still, not moved down: ${rowWith(s, /▸ alpha\b/)}`);
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: the explorer's view zoomed out to a note opened, or its folder gone, while the wheel has scrolled the panel: the panel stays where the wheel left it; the explorer, shown again, on the note opened (D261)",
    covers: { cases: ["git", "mouse", "explorer", "info"], commands: ["git.view", "note.open", "info.toggle"] },
    options: repoAt((s) => {
      crowded(s);
      put(s, TRAIL, { "sub/s.md": "# S\n", "gone/g.md": "# G\n" });
    }),
    run: async (s) => {
      const scrolled = async () => {
        await toPanel(s);
        await panelRow(s, "? n40.md");
        for (let i = 0; i < 4; i++) await s.send("\x1b[<65;10;30M");
        await s.until(() => rowWith(s, "? n02.md") < 0, undefined, "scrolled past n02");
        await away(s);
      };
      // The view zoomed into sub/; n10.md, outside it, opened: the view zooms out to hold it.
      await explorerOpen(s);
      await explorerRow(s, "sub");
      await s.keys("z");
      await scrolled();
      await s.ex(`e ${s.path(`${TRAIL}/n10.md`)}`);
      await s.status(/n10\.md/, 5000);
      await Bun.sleep(500);
      s.expect(rowWith(s, /\? n\d\d\.md/) >= 0, "the panel's files shown");
      s.expect(rowWith(s, "? n02.md") < 0, "the panel where the wheel left it, after the view zoomed out");
      // The explorer shown again: its selection on n10.md, the note revealed while it wasn't, not at its old index.
      await explorerOpen(s);
      const on = await selectedPath(s);
      s.expect(on.endsWith("n10.md"), `the explorer's selection on n10.md: ${on}`);
      // The view zoomed into gone/, then gone/ deleted; the Info shown, which reads the explorer's rows: the view back
      // at the vault.
      await explorerOpen(s);
      await explorerRow(s, "gone");
      await s.keys("z");
      await scrolled();
      rmSync(s.path(`${TRAIL}/gone`), { recursive: true });
      news(s, s.path(TRAIL));
      await Bun.sleep(500);
      await s.keys(":");
      await s.type("Show or hide the Info");
      await s.keys("enter");
      await s.until(() => /\bINFO\b/.test(s.text()), 5000, "the Info shown");
      await s.see("isn't there any more");
      // git's news: the panel drawn again.
      news(s, s.path(TRAIL));
      await Bun.sleep(1000);
      s.expect(rowWith(s, /\? n\d\d\.md/) >= 0, "the panel's files shown");
      s.expect(rowWith(s, "? n02.md") < 0, "the panel where the wheel left it, after the view's folder went");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: outside a repository, More in home unfolds by enter and folds by a click (D261)",
    covers: { cases: ["git", "mouse", "multiple-roots"], commands: ["git.view"] },
    options: { home: true, startAt: "home/work", config: "[ui]\nsidebar_width = 60\n" },
    run: async (s) => {
      await toPanel(s);
      await panelRow(s, /▸ More in home \(\d+\)/);
      await selectRow(s, "More in home");
      await s.keys("enter");
      await s.until(() => rowWith(s, /▾ More in home/) >= 0, 10_000, "More in home unfolded");
      await panelRow(s, "kestrel-mirror");
      await mouse(s, 10, rowWith(s, /▾ More in home/));
      await s.until(() => rowWith(s, /▸ More in home/) >= 0, undefined, "folded again by a click");
      s.expect(rowWith(s, "kestrel-mirror") < 0, "its repository folded away");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: in a repository, the explorer's view zoomed in, then out to hold a note opened: the branch selected stays selected as This file's rows come above it (D261)",
    covers: { cases: ["git", "explorer"], commands: ["git.view", "tab.close_all", "note.open"] },
    options: repoAt((s) => {
      branches(s);
      put(s, TRAIL, { "sub/s.md": "# S\n" });
    }),
    run: async (s) => {
      await explorerOpen(s);
      await explorerRow(s, "sub");
      await s.keys("z");
      await toPanel(s);
      // Every tab closed, This file's rows gone; ridge-notes selected.
      await leader(s, "t", "shift+q");
      await s.until(() => rowWith(s, "This file") < 0, undefined, "This file's rows gone");
      await selectRow(s, "ridge-notes");
      // The README opened, outside the view: the view zooms out to hold it, and This file's rows come above the
      // branches in the same frame.
      await s.ex(`e ${s.path(`${TRAIL}/README.md`)}`);
      await panelRow(s, "This file");
      await toPanel(s);
      await Bun.sleep(300);
      s.expect(isSelected(s, "ridge-notes"), "ridge-notes selected still");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: a file staged as git is slow to answer, the explorer shown meanwhile, then filtered: the explorer's selection its own; back on the panel, the file selected where it went (D261)",
    covers: { cases: ["git", "explorer"], commands: ["git.view"] },
    options: repoAt(
      (s) => {
        branches(s);
        put(s, TRAIL, Object.fromEntries(["d1", "d2", "d3"].map((n) => [`${n}.md`, `# ${n}\n`])));
        slowGit(s);
      },
      { env: { ...WHO, PATH: `{dir}/bin:${process.env.PATH ?? ""}` } },
    ),
    run: async (s) => {
      const slow = join(s.dir, "slow");
      await explorerOpen(s);
      const before = await selectedPath(s);
      // s on d3, git slow to answer after it; straight to the explorer meanwhile: its selection as it was once git has.
      await toPanel(s);
      await selectRow(s, "? d3.md");
      writeFileSync(slow, "");
      await s.keys("s");
      await explorerOpen(s);
      await Bun.sleep(2500);
      rmSync(slow);
      const after = await selectedPath(s);
      s.expect(after === before, `the explorer's selection its own: ${before}, then ${after}`);
      await toPanel(s);
      await s.until(() => isSelected(s, "A d3.md"), undefined, "d3 selected, in Staged");
      // s on d2, git slow again; to the explorer meanwhile, filtered by what no file of git's matches.
      await selectRow(s, "? d2.md");
      writeFileSync(slow, "");
      await s.keys("s");
      await explorerOpen(s);
      await s.keys("/");
      await s.type("READ");
      await Bun.sleep(2500);
      rmSync(slow);
      await s.keys("escape");
      await toPanel(s);
      await s.until(() => isSelected(s, "A d2.md"), undefined, "d2 selected, in Staged");
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: the explorer filtered, left by its rail for the git panel, a note opened there: back, its filter kept and the match it had selected (D261)",
    covers: { cases: ["git", "explorer", "mouse"], commands: ["note.open"] },
    options: repoAt(crowded),
    run: async (s) => {
      /** The left rail's button showing `glyph`: its row. */
      const rail = (glyph: string) => s.screen().findIndex((r) => [...r][1] === glyph);
      await explorerOpen(s);
      // Filtered by n0, the fourth match selected: n03.md.
      await s.keys("/");
      await s.type("n0");
      await s.until(
        () => s.text().includes("n03.md") && !s.text().includes("n11.md"),
        undefined,
        "the filter's matches",
      );
      await s.keys("down", "down", "down");
      // To the git panel by its rail button, the filter left as it is; a note opened from there.
      await mouse(s, 2, rail("±"));
      await panelRow(s, "trail · main");
      await s.ex(`e ${s.path(`${TRAIL}/n40.md`)}`);
      await s.status(/n40\.md/, 5000);
      // Back by the explorer's rail button: its filter, and n03.md selected still.
      await mouse(s, 2, rail("≡"));
      await s.until(() => s.screen().some((r) => EXPLORER.test(r)), undefined, "the explorer shown");
      const on = await selectedPath(s);
      s.expect(on.endsWith("n03.md"), `the match it had selected: ${on}`);
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: a row of another repository selected under Other repositories: the panel's own keys are the panel's, i types the message (D261)",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s);
      put(s, "~/work/lib", { "x.md": "# X\n" });
      gitOk(s, "~/work/lib", "init", "-q", "-b", "main");
      gitOk(s, "~/work/lib", "add", "-A");
      gitOk(s, "~/work/lib", "commit", "-q", "-m", "x");
    }),
    run: async (s) => {
      // The view a level up, at ~/work: lib beside the trail, under Other repositories.
      await explorerOpen(s);
      await s.keys("-");
      await toPanel(s);
      await selectRow(s, "Other repositories");
      await s.keys("enter");
      await selectRow(s, "▸ lib");
      // i on lib's row: the message box, typed into.
      await s.keys("i");
      await s.type("hello");
      await s.until(() => rowWith(s, "hello") >= 0, undefined, "the message typed in its box");
    },
  },
];
