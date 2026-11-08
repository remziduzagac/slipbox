// `space g`, a group (EG-D15, EG-D4, EG-D18): the git panel on `space g g`; from a note, the change at the cursor
// staged, the file unstaged, a change undone after asking; a branch's commits since its base in the panel, under
// Branches and in `:log`, each opened into its files and a file's change; a line's web link copied, or opened by a
// browser faked on the check's PATH. Each on a repository the check makes in its own home with git itself.

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isWsl } from "../../../src/core/foundation/platform/wsl.ts";
import { type Check, leader, moveTo, pos } from "../check.ts";
import type { Session } from "../session.ts";
import {
  commit,
  gitOk,
  lastMessage,
  panelPart,
  panelRow,
  put,
  repoAt,
  selectRow,
  TRAIL,
  toPanel,
  trail,
} from "./source-control.ts";

/** The panel wide enough for a commit's subject and its day; dev a base, as the nearest of them. */
const CONFIG = '[ui]\nsidebar_width = 60\n\n[git]\nbases = ["main", "dev"]\n';

/** A note of three short paragraphs, committed. */
const DAYS = "# Days\n\nOne.\n\nTwo.\n\nThree.\n";

/** The trail's dev, a commit past main; agent/huts made from it, three commits of its own, checked out. */
function threeSinceDev(s: Session): void {
  trail(s);
  gitOk(s, TRAIL, "switch", "-q", "-c", "dev");
  commit(s, TRAIL, { "winter.md": "# Winter\n" }, "Winter");
  gitOk(s, TRAIL, "switch", "-q", "-c", "agent/huts");
  commit(s, TRAIL, { "huts.md": "# Huts\n\nThe first hut.\n" }, "Huts");
  commit(s, TRAIL, { "README.md": "# Ridge trail\n\nA guide to the ridge trail, in four days.\n" }, "Four days");
  gitOk(s, TRAIL, "mv", "huts.md", "shelters.md");
  gitOk(s, TRAIL, "commit", "-q", "-m", "Shelters, not huts");
}

/** The browser's opener here, faked (as the report's checks fake it): what it's given kept in `<name>.argv`. */
const OPENER = process.platform === "darwin" ? "open" : isWsl() ? "wslview" : "xdg-open";
function fakeOpeners(s: Session): void {
  const bin = join(s.dir, "bin");
  mkdirSync(bin, { recursive: true });
  for (const name of ["open", "xdg-open", "wslview", "explorer.exe"]) {
    const at = join(bin, name);
    writeFileSync(at, `#!/bin/sh\nprintf '%s\\n' "$@" > "${at}.argv"\nexit 0\n`);
    chmodSync(at, 0o755);
  }
}
const opened = (s: Session) => {
  try {
    return readFileSync(join(s.dir, "bin", `${OPENER}.argv`), "utf8").trim();
  } catch {
    return "";
  }
};

export const GIT_KEYS: Check[] = [
  {
    area: "outside-and-code",
    name: "git keys: space g g opens the panel; from a note space g s stages the change at the cursor alone, space g d undoes another after asking, space g u unstages the file",
    covers: { cases: ["git"], commands: ["git.view", "git.change_stage", "git.change_undo", "git.file_unstage"] },
    options: repoAt(
      (s) => {
        trail(s, { "days.md": DAYS });
        // Two changes, far apart: the first and the last paragraphs, shouted.
        put(s, TRAIL, { "days.md": "# Days\n\nONE.\n\nTwo.\n\nTHREE.\n" });
      },
      { startAt: "home/work/trail/days.md", config: CONFIG },
    ),
    run: async (s) => {
      await s.where(/ │ main$/);
      await leader(s, "g", "g");
      await s.status("GIT");
      await panelRow(s, /M days\.md/);
      await leader(s, "g", "g");
      await s.notSee("Source control");
      await s.until(() => !s.statusLine().includes("GIT"), undefined, "the note focused again");
      // The first change: staged alone, from the note.
      await s.keys("g", "g");
      await moveTo(s, ["]", "c"], (l) => l === 3, "] c: the first change");
      await leader(s, "g", "s");
      await s.message("staged the change at line 3 of days.md");
      await s.until(
        () => gitOk(s, TRAIL, "show", ":days.md") === "# Days\n\nONE.\n\nTwo.\n\nThree.",
        undefined,
        "the first change staged, the last not",
      );
      // The last: undone, after asking — its line as staged, unsaved.
      await moveTo(s, ["]", "c"], (l) => l === 7, "] c: the last change");
      await leader(s, "g", "d");
      await s.see("Undo the change at line 7?");
      await s.keys("y");
      await s.message("the change at line 7 undone, as staged (unsaved)");
      await s.see("Three.");
      await s.status("unsaved");
      // The file unstaged: what's staged is the commit's again.
      await leader(s, "g", "u");
      await s.message("unstaged days.md");
      await s.until(() => gitOk(s, TRAIL, "show", ":days.md") === DAYS.trim(), undefined, "nothing staged");
      s.expect(pos(s).line === 7, "the cursor where it was");
    },
  },
  {
    area: "outside-and-code",
    name: "git keys: the panel lists the branch's three commits since dev — one opened into its files, a file's change in the diff window; Branches the same",
    covers: { cases: ["git"], commands: ["git.view"] },
    options: repoAt(threeSinceDev, { config: CONFIG }),
    run: async (s) => {
      await toPanel(s);
      // Both sections in before a row is counted to: the branch's files land above its commits.
      await panelRow(s, "This branch against dev (2)");
      await panelRow(s, "This branch's commits (3)");
      await panelRow(s, /[0-9a-f]{7} Shelters, not huts/);
      await panelRow(s, /[0-9a-f]{7} Four days/);
      await panelRow(s, /[0-9a-f]{7} Huts/);
      s.expect(!s.text().includes("Winter"), "dev's own commit not the branch's");
      // A commit opened up: its files; enter on one, its change.
      await selectRow(s, "Four days");
      await s.keys("enter");
      // Its file under it, besides the branch's own row for it against dev: the row after the commit's.
      const readmes = () => s.screen().filter((_, i) => panelPart(s, i).includes("M README.md")).length;
      await s.until(() => readmes() === 2, undefined, "the commit's file under it");
      await s.keys("j", "enter");
      await s.see(/[0-9a-f]{7} Four days: README\.md — esc: source control/, 8000);
      await s.see("in four days");
      await s.keys("escape");
      await s.status("GIT");
      // A rename's: the name it has now.
      await selectRow(s, "Shelters, not huts");
      await s.keys("l");
      await panelRow(s, /R shelters\.md/);
      // The branch opened up in Branches: its commits under its files.
      await selectRow(s, "● agent/huts");
      await s.keys("enter");
      await panelRow(s, "Commits (3)");
    },
  },
  {
    area: "outside-and-code",
    name: "git keys: :log lists the branch's commits since dev — enter, a commit's files; enter, a file's change; esc back a step each time; space g l the same",
    covers: { cases: ["git"], commands: ["git.log"] },
    options: repoAt(threeSinceDev, { config: CONFIG }),
    run: async (s) => {
      await s.where(/ │ agent\/huts$/);
      await s.ex("log");
      await s.see("agent/huts: 3 commits since dev — enter: its files", 8000);
      await s.see(/[0-9a-f]{7} Shelters, not huts/);
      await s.see(/[0-9a-f]{7} Huts/);
      await s.keys("down", "enter");
      await s.see(/[0-9a-f]{7} Four days: 1 file — enter: its change · esc: the commits/, 8000);
      await s.see("M README.md");
      await s.keys("enter");
      await s.see(/[0-9a-f]{7} Four days: README\.md — esc: the files/, 8000);
      await s.see("in four days");
      await s.keys("escape");
      await s.see("esc: the commits", 8000);
      await s.keys("escape");
      await s.see("3 commits since dev", 8000);
      await s.keys("escape");
      await s.notSee("3 commits since dev");
      await leader(s, "g", "l");
      await s.see("agent/huts: 3 commits since dev — enter: its files", 8000);
    },
  },
  {
    area: "outside-and-code",
    name: "git keys: space g y copies the line's web link at the commit checked out, said before a push; space g w opens it once pushed, in the browser, and copies one not pushed",
    covers: { cases: ["git"], commands: ["git.web_copy", "git.web_open"] },
    options: repoAt(
      (s) => {
        trail(s);
        gitOk(s, TRAIL, "remote", "add", "origin", "git@github.com:ada/trail.git");
        fakeOpeners(s);
      },
      { config: CONFIG, env: { PATH: `{dir}/bin:${process.env.PATH ?? "/usr/bin:/bin"}`, DISPLAY: ":9" } },
    ),
    run: async (s) => {
      const linkAt = (head: string) => `https://github.com/ada/trail/blob/${head}/README.md?plain=1#L3`;
      const first = gitOk(s, TRAIL, "rev-parse", "HEAD");
      await s.where(/ │ main$/);
      // The guide's paragraph, its third line.
      await moveTo(s, ["G"], (l) => l === 3, "G: the paragraph");
      await leader(s, "g", "y");
      await s.until(() => s.clipboard() === linkAt(first), 8000, "the line's web link copied");
      await s.message(`${first.slice(0, 7)} isn't on origin yet`);
      // Pushed (origin's main, as a fetch would have it): opened.
      gitOk(s, TRAIL, "update-ref", "refs/remotes/origin/main", "HEAD");
      await leader(s, "g", "w");
      await s.until(() => opened(s) === linkAt(first), 8000, `${OPENER} given the link`);
      // Said whole (its box wraps it): the Messages list's.
      const opening = await lastMessage(s, "opening in your browser");
      s.expect(opening === "the web link to line 3 of README.md is opening in your browser", `said: ${opening}`);
      // A commit not pushed yet: its link copied, not opened, and said.
      commit(s, TRAIL, { "gear.md": "# Gear\n" }, "Gear");
      const second = gitOk(s, TRAIL, "rev-parse", "HEAD");
      await leader(s, "g", "w");
      await s.until(() => s.clipboard() === linkAt(second), 8000, "the new commit's link copied");
      s.expect(opened(s) === linkAt(first), "no browser for a commit not pushed");
      const got = await lastMessage(s, "not opened");
      const want = `copied the web link to line 3 of README.md, not opened — ${second.slice(0, 7)} isn't on origin yet`;
      s.expect(got.startsWith(want), `said: ${want}\n(got: ${got})`);
    },
  },
];
