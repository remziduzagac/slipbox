// What the git panel's branches do once git answers in the background (D263, GIT-D9): a refusal said as it comes; the
// branches listed again after a refusal that left something done; a branch made selected once git lists it; an
// answer that comes late changing nothing where you've gone since, nor popping up over a question; the status line's
// switch, and a branch file too big for a diff, said as they come. Each on a repository the check makes in its own
// home with git itself, as source-control.ts's: git's own refusals, a locked worktree, a hook in a vault trusted.
//
// "Said as it comes" is told apart from "said when something else drew": the message said as git was asked (checking
// out…, making…, removing…) still on screen with git's answer. Without a frame of its own, the answer is drawn only
// by the frame that message asks for when its four seconds are up — which it's gone from.

import { chmodSync } from "node:fs";
import type { Check } from "../check.ts";
import type { Session } from "../session.ts";
import {
  branchButton,
  commit,
  gitOk,
  isSelected,
  on,
  panelRow,
  put,
  repoAt,
  rowWith,
  said,
  selectRow,
  TRAIL,
  toPanel,
  trail,
  worktree,
} from "./source-control.ts";

/** The git panel wide enough for a branch's name and its figures, as source-control.ts's checks have it. */
const WIDE = "[ui]\nsidebar_width = 48\n";

/** `answer` on screen while `asked`, said as git was asked, still is: drawn as git answered. */
async function saidAsItCame(s: Session, answer: string | RegExp, asked: string | RegExp): Promise<void> {
  await s.until(
    () => s.rowOf(answer) >= 0 && s.rowOf(asked) >= 0,
    undefined,
    `${answer} on screen while ${asked} still is: drawn as git answered, not by the next frame something else asks for`,
  );
}

/** A branch with a commit of its own, made from main and left: main checked out again. */
function branchWith(s: Session, name: string, files: Record<string, string>): void {
  gitOk(s, TRAIL, "switch", "-q", "-c", name, "main");
  commit(s, TRAIL, files, name);
  gitOk(s, TRAIL, "switch", "-q", "main");
}

/** A new branch from the git panel's `+ New`: its name, where it starts, then `how` answers "where?" (enter: In a
 *  new worktree). */
async function newBranch(s: Session, name: string, from: string, ...how: string[]): Promise<void> {
  await on(s, "+ New");
  await s.see("new branch:");
  await s.type(name);
  await s.keys("enter");
  await s.see(`${name}: from where?`);
  await s.type(from);
  await s.keys("enter");
  await s.see(`${name} from ${from}: where?`);
  await s.keys(...(how.length ? how : ["enter"]));
}

/** before: the guide as it was first committed; then trail.md on main, changed here — a switch to a branch without it
 *  would lose the change, so git refuses it. */
function changeTheBranchLacks(s: Session): void {
  gitOk(s, TRAIL, "branch", "before");
  commit(s, TRAIL, { "trail.md": "# The trail\n" }, "The trail");
  put(s, TRAIL, { "trail.md": "# The trail\n\nChanged here.\n" });
}

/** A `post-checkout` hook in the trail that says no: run, the vault trusted (WIDE's config with its [trust]). */
function hookSaysNo(s: Session): void {
  put(s, TRAIL, { ".git/hooks/post-checkout": "#!/bin/sh\necho the hook says no >&2\nexit 1\n" });
  chmodSync(s.path(`${TRAIL}/.git/hooks/post-checkout`), 0o755);
}
const TRUSTED = `${WIDE}[trust]\nroots = ["{home}/work/trail"]\n`;

/** So many files a checkout of them takes a while: keys sent meanwhile are taken before git answers. */
const MANY = Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [`data/leg-${i}.md`, `# Leg ${i}\n`]));

export const GIT_BRANCHES: Check[] = [
  {
    area: "outside-and-code",
    name: "git branches: git's refusals said as they come — Open in a worktree and a new worktree into a folder taken, a locked worktree's removal",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s);
      branchWith(s, "loose", { "loose.md": "# Loose\n" });
      // Where [git] worktrees puts them: taken, a file in each.
      put(s, `${TRAIL}-loose`, { "x.md": "x\n" });
      put(s, `${TRAIL}-agent-taken`, { "x.md": "x\n" });
      const done = worktree(s, "agent/done");
      gitOk(s, TRAIL, "worktree", "lock", s.path(done));
    }),
    run: async (s) => {
      await toPanel(s);
      await on(s, "loose");
      await branchButton(s, "loose", "[Open in a worktree]");
      await s.see("The worktree's folder");
      await s.keys("enter");
      await saidAsItCame(s, "already exists", "checking loose out at");
      // The locked worktree, asked and removed: git refuses.
      await on(s, "agent/done");
      await branchButton(s, "agent/done", "[Remove…]");
      await s.see("Remove the worktree ~/work/trail-agent-done?");
      await s.keys("enter");
      await saidAsItCame(s, "locked working tree", "removing the worktree");
      s.expect(s.exists(`${TRAIL}-agent-done`), "the locked worktree kept");
      // A new branch in a new worktree, its folder taken: refused, and no branch left. Once the first refusal's gone,
      // not to be mistaken for this one.
      await s.notSee("already exists");
      await newBranch(s, "agent/taken", "main");
      await saidAsItCame(s, "already exists", "making agent/taken in a new worktree");
      s.expect(gitOk(s, TRAIL, "branch", "--list", "agent/taken") === "", "no branch left behind");
      // Its messages gone, slipbox goes quiet: a message's frame never keeps it drawing — a frame loop would paint
      // dozens a second; a late answer (the watcher's, git's) a frame or two.
      await s.notSee("already exists");
      await s.notSee("locked working tree");
      const painted = s.framesPainted();
      await Bun.sleep(1000);
      s.expect(s.framesPainted() - painted < 5, `slipbox quiet with nothing to draw (${s.framesPainted() - painted})`);
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: Check it out here refused — said, the branch made all the same, listed, opened up and selected",
    covers: { cases: ["git"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s);
      changeTheBranchLacks(s);
    }),
    run: async (s) => {
      await toPanel(s);
      await newBranch(s, "agent/here", "before", "down", "down", "enter");
      await s.message("agent/here made, but git:");
      await s.until(() => isSelected(s, "agent/here"), undefined, "agent/here selected");
      await panelRow(s, "[Check out here]");
      await s.status(/ · main /);
      s.expect(gitOk(s, TRAIL, "branch", "--list", "agent/here") === "agent/here", "made");
    },
  },
  {
    area: "links-and-files",
    name: "git: the status line's branch switch, refused — git's reason said as it comes, the branch as it was",
    covers: { cases: ["git"], commands: ["git.branches"] },
    options: repoAt((s) => {
      trail(s);
      changeTheBranchLacks(s);
    }),
    run: async (s) => {
      await s.ex("Branches");
      await s.see(/Branches \(\d+\) — enter: check one out/);
      await s.type("before");
      await s.keys("enter");
      await saidAsItCame(s, "would be overwritten", "checking out before");
      await s.status(/ · main /);
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: Remove it and the branch, git keeping the branch — the worktree gone from the list at once",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view"] },
    options: repoAt(
      (s) => {
        trail(s);
        // agent/x merged into its base, integration, but not into main, here, which `git branch -d` asks of it.
        commit(s, worktree(s, "agent/x"), { "x.md": "# X\n" }, "X");
        gitOk(s, TRAIL, "branch", "integration", "agent/x");
      },
      { config: `${WIDE}[git]\nbases = ["integration"]\n` },
    ),
    run: async (s) => {
      await toPanel(s);
      await on(s, "agent/x");
      await branchButton(s, "agent/x", "[Remove…]");
      await s.see("Remove it and the branch agent/x");
      await s.keys("down", "enter");
      await s.message("the worktree is gone, the branch kept");
      await s.until(() => rowWith(s, "⎇ agent/x") < 0, undefined, "agent/x listed again, no worktree on it");
      s.expect(!s.exists(`${TRAIL}-agent-x`), "its folder gone");
      s.expect(gitOk(s, TRAIL, "branch", "--list", "agent/x") === "agent/x", "the branch kept");
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: a hook refusing once it's checked out, the vault trusted — a new worktree's branch kept with its base, the worktree listed, HEAD seen moved",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view"] },
    options: repoAt(
      (s) => {
        trail(s);
        branchWith(s, "dev", { "dev.md": "# Dev\n" });
        branchWith(s, "loose", { "loose.md": "# Loose\n" });
        hookSaysNo(s);
      },
      { config: TRUSTED },
    ),
    run: async (s) => {
      await toPanel(s);
      // From dev, in a new worktree: git made it, then the hook said no. Kept, its base dev — not main, guessed. (git's
      // reason, as slipbox says it, is git's first line, not the hook's: what's done is what's checked.)
      await newBranch(s, "agent/hooked", "dev");
      await s.until(() => isSelected(s, "agent/hooked"), undefined, "agent/hooked selected");
      await panelRow(s, "Against dev");
      s.expect(s.rowOf("made agent/hooked") < 0, "nothing said made");
      // Open in a worktree: made, then the hook said no: the worktree on its branch.
      await on(s, "loose");
      await branchButton(s, "loose", "[Open in a worktree]");
      await s.see("The worktree's folder");
      await s.keys("enter");
      await s.until(() => rowWith(s, "⎇ loose") >= 0, undefined, "loose listed again, in its worktree");
      // A new branch checked out here: switched, then the hook said no — HEAD where it went.
      await newBranch(s, "agent/sw", "main", "down", "down", "enter");
      await s.message("agent/sw made, but git:");
      await s.status(/ · agent\/sw /);
      // The status line's new branch from here: the same, HEAD where it went.
      await s.ex("Branches");
      await s.type("A new branch from here");
      await s.keys("enter");
      await s.see("new branch:");
      await s.type("agent/status");
      await s.keys("enter");
      await s.status(/ · agent\/status /);
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: a new branch made is selected once git lists it — Just make it, unfolded to; In a new worktree, o goes into it",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view"] },
    options: repoAt((s) => trail(s)),
    run: async (s) => {
      await toPanel(s);
      // From main with nothing of its own: merged, so folded with the older ones — unfolded to it.
      await newBranch(s, "agent/plain", "main", "down", "down", "down", "enter");
      await s.message("made agent/plain from main");
      await s.until(() => isSelected(s, "agent/plain"), undefined, "agent/plain selected");
      await panelRow(s, "▾ Merged or older");
      await newBranch(s, "agent/fresh", "main");
      await s.message("made agent/fresh from main, in a new worktree");
      await s.until(() => isSelected(s, "agent/fresh"), undefined, "agent/fresh selected");
      await s.keys("o");
      await s.status(/trail-agent-fresh · agent\/fresh /);
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: a new branch made while you've moved on — the selection moved, the filter's keys used, the panel closed, the filter not matching it: left as you put it",
    covers: { cases: ["git"], commands: ["git.view"] },
    options: repoAt((s) => {
      // So many files on main that making a worktree of it takes a while.
      trail(s, MANY);
      gitOk(s, TRAIL, "branch", "feature");
    }),
    run: async (s) => {
      await toPanel(s);
      // The selection moved, in the same keys as the answer to "where?": before git can answer.
      await newBranch(s, "agent/slow", "main", "enter", "g", "g");
      await s.message("made agent/slow from main, in a new worktree");
      // Listed: drawn in the frame that also shows whether it was selected (both as the list's answer lands).
      await panelRow(s, "agent/slow");
      s.expect(!isSelected(s, "agent/slow"), "the selection left where it was moved");
      // The filter matching only feature: nothing unfolded for the new one, nothing selected.
      await s.keys("/");
      await s.type("feature");
      await s.keys("enter");
      await newBranch(s, "agent/plain", "main", "down", "down", "down", "enter");
      await s.message("made agent/plain from main");
      await Bun.sleep(1000);
      // The filter cleared (esc): the older ones still folded, agent/plain among them.
      await s.keys("escape");
      await panelRow(s, "▸ Merged or older (2)");
      // The wheel over the panel, before git answers: the panel used, left where it's scrolled.
      await newBranch(s, "agent/wheeled", "main", "enter");
      await s.send("\x1b[<65;6;12M");
      await s.message("made agent/wheeled from main, in a new worktree");
      await panelRow(s, "agent/wheeled");
      s.expect(!isSelected(s, "agent/wheeled"), "the selection left where it was, the panel scrolled");
      // The filter's keys moving the selection, before git answers: the panel used, left as it was put.
      await newBranch(s, "agent/sifted", "main", "enter", "/", "down");
      await s.message("made agent/sifted from main, in a new worktree");
      await panelRow(s, "agent/sifted");
      s.expect(!isSelected(s, "agent/sifted"), "the selection left where the filter's keys put it");
      await s.keys("escape");
      // The panel closed (space g, focused) before git answers: nothing unfolded or selected in it, unseen — the
      // Branches folded first, folded still.
      await selectRow(s, "▾ Branches");
      await s.keys("enter");
      await panelRow(s, "▸ Branches");
      await newBranch(s, "agent/unseen", "main", "enter", "space", "g");
      await s.message("made agent/unseen from main, in a new worktree");
      await Bun.sleep(1500);
      await toPanel(s);
      await panelRow(s, "▸ Branches");
      s.expect(!isSelected(s, "agent/unseen"), "nothing selected in the panel while it was closed");
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: Remove…'s question and Merge…'s menu, a prompt opened before git answers — nothing pops up over it; Merge… with no base says so",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s);
      worktree(s, "agent/done");
      commit(s, worktree(s, "agent/ahead"), { "ridge.md": "# The ridge\n" }, "The ridge");
    }),
    run: async (s) => {
      await toPanel(s);
      // Remove…, from the branch's menu, and n's prompt in the same keys: open before git has answered.
      await selectRow(s, "agent/done");
      await s.keys(".", "down", "down", "down", "enter", "n");
      await s.see("new branch:");
      await s.type("half");
      // No sign over the prompt that git answered (the prompt draws over the messages): a while for it to, then no
      // question over it, the prompt's text kept; closed, the messages say it wasn't asked.
      await Bun.sleep(1500);
      s.expect(s.rowOf("Remove it, keep") < 0, "no question over the prompt");
      await s.see("› half");
      await s.keys("escape");
      await said(
        s,
        "not asked",
        "Remove the worktree ~/work/trail-agent-done? — not asked over what you were doing: ask again",
      );
      await selectRow(s, "agent/ahead");
      await s.keys(".", "down", "enter", "n");
      await s.see("new branch:");
      await Bun.sleep(1500);
      s.expect(s.rowOf("The links it would break") < 0, "no menu over the prompt");
      await s.keys("escape");
      await said(s, "not asked", "Merge agent/ahead into main — not asked over what you were doing: ask again");
      // main, the trunk, has no base: said all the same, a prompt open or not.
      await selectRow(s, "● main");
      await s.keys(".", "enter", "n");
      await s.message("main has no base to merge into");
      await s.see("new branch:");
      await s.keys("escape");
      // The panel's filter typed in, then Merge… clicked: the keys went there as it was asked — its menu opens.
      await on(s, "⎇ agent/ahead");
      await s.keys("/");
      await s.type("ahead");
      await branchButton(s, "agent/ahead", "[Merge…]");
      await s.see("The links it would break");
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: Open in a worktree, another checkout gone into before git answers — said, and you stay there",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view", "git.worktrees"] },
    options: repoAt((s) => {
      trail(s);
      // So many files on loose that checking it out takes a while.
      branchWith(s, "loose", MANY);
      worktree(s, "agent/done");
    }),
    run: async (s) => {
      await toPanel(s);
      await on(s, "loose");
      await branchButton(s, "loose", "[Open in a worktree]");
      await s.see("The worktree's folder");
      // Into agent/done's checkout by :worktrees, in the same keys: before git has answered.
      await s.keys("enter", ":", ..."worktrees", "enter", ..."agent/done", "enter");
      await s.status(/trail-agent-done · agent\/done /);
      await s.message("loose is in a worktree at");
      await Bun.sleep(1500);
      await s.status(/trail-agent-done · agent\/done /);
      s.expect(s.exists(`${TRAIL}-loose/data/leg-1.md`), "the worktree made");
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: Remove…'s question and Merge…'s menu, another checkout gone into before git answers — nothing opens there",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view", "git.worktrees"] },
    options: repoAt(
      (s) => {
        trail(s);
        worktree(s, "agent/done");
        commit(s, worktree(s, "agent/ahead"), { "ridge.md": "# The ridge\n" }, "The ridge");
        // A file-system monitor that takes a second, the vault and its worktrees trusted (so git runs it, in each): each
        // `git status` the answers need waits for it, and the keys that go into another checkout are all taken first.
        put(s, TRAIL, { ".git/slow-monitor": "#!/bin/sh\nsleep 1\nexit 1\n" });
        chmodSync(s.path(`${TRAIL}/.git/slow-monitor`), 0o755);
        gitOk(s, TRAIL, "config", "core.fsmonitor", s.path(`${TRAIL}/.git/slow-monitor`));
      },
      {
        config: `${WIDE}[trust]\nroots = ["{home}/work/trail", "{home}/work/trail-agent-done", "{home}/work/trail-agent-ahead"]\n`,
      },
    ),
    run: async (s) => {
      await toPanel(s);
      // Remove…, then into agent/ahead's checkout by :worktrees, in the same keys.
      await selectRow(s, "agent/done");
      await s.keys(".", "down", "down", "down", "enter", ":", ..."worktrees", "enter", ..."agent/ahead", "enter");
      await s.status(/trail-agent-ahead · agent\/ahead /);
      await Bun.sleep(3000);
      s.expect(s.rowOf("Remove it, keep") < 0, "no question opened in the checkout gone into");
      // Back, and Merge… on agent/ahead, then into agent/done's checkout.
      await s.ex("worktrees");
      await s.type("main");
      await s.keys("enter");
      await s.status(/ · main /);
      await toPanel(s);
      // Back in the main checkout: its row clicked, selected (and opened up).
      await on(s, "⎇ agent/ahead");
      await s.until(() => isSelected(s, "agent/ahead"), undefined, "agent/ahead selected");
      await s.keys(".", "down", "enter", ":", ..."worktrees", "enter", ..."agent/done", "enter");
      await s.status(/trail-agent-done · agent\/done /);
      await Bun.sleep(3000);
      s.expect(s.rowOf("The links it would break") < 0, "no menu opened in the checkout gone into");
      // Back, and Remove… on agent/done again, then typing in the note before git answers: not asked over it, said.
      await s.ex("worktrees");
      await s.type("main");
      await s.keys("enter");
      await s.status(/ · main /);
      await toPanel(s);
      await on(s, "⎇ agent/done");
      await s.until(() => isSelected(s, "agent/done"), undefined, "agent/done selected");
      // Typing in the commit's message box, in the same keys (i from the panel's top: on a branch's row, its keys are the
      // branch's) — once Merge…'s word is gone, not to be taken for it.
      await s.notSee(/not asked|asked over what/);
      await s.keys(".", "down", "down", "down", "enter", "g", "g", "i");
      await s.type("Typed meanwhile");
      // Said while still typing (its box wraps it, either half), no question over the box, its text kept.
      await s.see(/not asked|asked over what/);
      s.expect(s.rowOf("Remove it, keep") < 0, "no question over the message being typed");
      await s.see("Typed meanwhile");
      await s.keys("escape");
      await said(
        s,
        "not asked",
        "Remove the worktree ~/work/trail-agent-done? — not asked over what you were doing: ask again",
      );
      // Typing in the outline's filter (space o, /) before git answers: not asked over it either.
      await s.notSee(/not asked|asked over what/);
      await toPanel(s);
      await on(s, "⎇ agent/done");
      await s.until(() => isSelected(s, "agent/done"), undefined, "agent/done selected");
      await s.keys(".", "down", "down", "down", "enter", "space", "o", "/");
      await s.type("Ridge");
      await s.see(/not asked|asked over what/);
      s.expect(s.rowOf("Remove it, keep") < 0, "no question over the outline's filter");
      await s.keys("escape", "escape");
      // A key sequence begun (space, its keys shown) before git answers: not asked over it.
      await s.notSee(/not asked|asked over what/);
      await toPanel(s);
      await on(s, "⎇ agent/done");
      await s.until(() => isSelected(s, "agent/done"), undefined, "agent/done selected");
      await s.keys(".", "down", "down", "down", "enter", "space");
      await s.see(/not asked|asked over what/);
      s.expect(s.rowOf("Remove it, keep") < 0, "no question over the key sequence begun");
      await s.keys("escape");
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: Open in a worktree, a question opened before git answers — not gone into from under it, o goes into it",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s);
      // So many files on loose that checking it out takes a while.
      branchWith(s, "loose", MANY);
    }),
    run: async (s) => {
      await toPanel(s);
      await on(s, "loose");
      await branchButton(s, "loose", "[Open in a worktree]");
      await s.see("The worktree's folder");
      // n's prompt opened in the same keys: before git has answered.
      await s.keys("enter", "n");
      await s.see("new branch:");
      await s.message("loose's worktree not gone into — o goes into it");
      await s.see("new branch:");
      await s.status(/ · main /);
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: an uncommitted file too big for a diff, clicked — said as it comes; one clicked past, nothing said",
    covers: { cases: ["git", "multiple-roots"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s);
      const at = worktree(s, "agent/big");
      put(s, at, { "big.md": "a".repeat(8 * 1024 * 1024 + 1), "small.md": "small\n" });
    }),
    run: async (s) => {
      await toPanel(s);
      await on(s, "agent/big");
      await panelRow(s, "big.md");
      await on(s, "big.md");
      await saidAsItCame(s, "larger than 8 MB", "Reading branch version");
      // Clicked, then the next one clicked before git answers the first: the first says nothing.
      await s.notSee("larger than 8 MB");
      const big = rowWith(s, "big.md");
      const small = rowWith(s, "small.md");
      await s.send(`\x1b[<0;8;${big + 1}M\x1b[<0;8;${big + 1}m\x1b[<0;8;${small + 1}M\x1b[<0;8;${small + 1}m`);
      await s.see("small.md not committed");
      await Bun.sleep(1000);
      s.expect(s.rowOf("larger than 8 MB") < 0, "nothing said for the file clicked past");
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: a new branch by the name of one there already — git refuses, and that branch keeps its own base",
    covers: { cases: ["git"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s);
      branchWith(s, "dev", { "dev.md": "# Dev\n" });
    }),
    run: async (s) => {
      await toPanel(s);
      await newBranch(s, "agent/x", "dev", "down", "down", "down", "enter");
      await s.message("made agent/x from dev");
      // Opened up and selected once made; refused the second time, left so, its base dev (merged into it: ✓).
      await newBranch(s, "agent/x", "main");
      await s.message("already exists");
      await panelRow(s, "Against dev");
    },
  },
  {
    area: "outside-and-code",
    name: "git branches: a new branch made while an agent keeps changing files — selected once the changes stop",
    covers: { cases: ["git"], commands: ["git.view"] },
    options: repoAt((s) => trail(s)),
    run: async (s) => {
      await toPanel(s);
      // An agent writing a note every 30 ms: git has news after every answer, the branches asked again each time.
      let n = 0;
      const agent = setInterval(() => s.write(`${TRAIL}/busy.md`, `# Busy\n\n${n++}\n`), 30);
      try {
        await newBranch(s, "agent/busy", "main");
        await s.message("made agent/busy from main, in a new worktree");
        await Bun.sleep(1500);
      } finally {
        clearInterval(agent);
      }
      await s.until(() => isSelected(s, "agent/busy"), undefined, "agent/busy selected once the news stops");
    },
  },
];
