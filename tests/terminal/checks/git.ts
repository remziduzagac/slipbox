// Git branches, changes, commits, remotes and gutter signs (TT-T6).

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { explorerOpen, type Check, leader, moveTo, opened, pos, problemListed } from "../check.ts";
import { loadTheme, type Role } from "../../../src/core/rendering/theme/index.ts";
import type { Session } from "../session.ts";
import { git, messagesSaying, lastMessage } from "../support/links.ts";

/** A role's foreground in a built-in theme, as the terminal reports it. */
const themeFg = (name: string, role: Role) => loadTheme(name, "/nonexistent").theme.roles[role].fg!.toLowerCase();

/** git run as a check expects it to end (`ok`: with 0, else not), git's own words in the failure when it doesn't. */
function gitOk(s: Session, what: string, ok: boolean, repo: string, ...args: string[]): void {
  const r = git(s, repo, ...args);
  if ((r.code === 0) === ok) return;
  const status = git(s, repo, "status", "--porcelain").out.trim();
  s.expect(false, `${what} (git ${args.join(" ")}: exit ${r.code})\n${r.out.trim()}\ngit status:\n${status}`);
}

const KESTREL = "~/work/kestrel";

/** Who commits — a merge, a rebase: the set's home has no ~/.gitconfig, and git won't commit without a name. */
const IDENTITY = {
  GIT_AUTHOR_NAME: "Sam Rivera",
  GIT_AUTHOR_EMAIL: "sam@kestrel.dev",
  GIT_COMMITTER_NAME: "Sam Rivera",
  GIT_COMMITTER_EMAIL: "sam@kestrel.dev",
};

const SYNC = "~/work/kestrel/docs/sync.md";

/** kestrel's origin made a bare repository in the check's folder (no network) — main pushed there and tracked, if
 *  asked. Its path. */
function bareOrigin(s: Session, track: boolean): string {
  const bare = join(s.dir, "remote", "kestrel.git");
  const made = spawnSync("git", ["init", "-q", "--bare", "-b", "main", bare], {
    env: { ...process.env, HOME: s.home },
  });
  s.expect(made.status === 0, `a bare repository made: ${made.stderr}`);
  gitOk(s, "origin set to it", true, KESTREL, "remote", "set-url", "origin", bare);
  if (track) gitOk(s, "main pushed there, tracked", true, KESTREL, "push", "-q", "-u", "origin", "main");
  return bare;
}

/** Someone else's commit on origin's main: a clone of it (made once), a line added to a file, pushed. */
function pushedElsewhere(s: Session, file: string, line: string): void {
  const other = join(s.dir, "other");
  if (!existsSync(other)) gitOk(s, "a clone", true, s.dir, "clone", "-q", join(s.dir, "remote", "kestrel.git"), other);
  else gitOk(s, "the clone brought up to date", true, other, "pull", "-q", "--ff-only");
  writeFileSync(join(other, file), `${readFileSync(join(other, file), "utf8")}\n${line}`);
  gitOk(s, "their commit", true, other, "commit", "-qam", "Theirs");
  gitOk(s, "their push", true, other, "push", "-q");
}

export const GIT: Check[] = [
  {
    area: "links-and-files",
    name: "git: a branch switch while it runs — the branch on the top bar, said once, each branch's tabs back",
    covers: { cases: ["git", "links/git"], commands: ["note.open"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      await s.where(/^kestrel │ main\b/, /‹ README\.md/);
      gitOk(s, "checkout from outside", true, KESTREL, "checkout", "-q", "jo/release-notes-wording");
      await s.message("switched to branch jo/release-notes-wording", 5000);
      await s.where(/ │ jo\/release-notes-wording$/);
      await s.ex("e docs/architecture.md");
      await opened(s, "docs/architecture.md");
      // Back on main: its tabs as they were left there; and again.
      git(s, KESTREL, "checkout", "-q", "main");
      await s.message("switched to branch main: its tabs are back", 5000);
      await opened(s, "README.md");
      git(s, KESTREL, "checkout", "-q", "jo/release-notes-wording");
      await s.where(/ │ jo\/release-notes-wording$/, null, 5000);
      await opened(s, "docs/architecture.md");
      s.expect(
        (await messagesSaying(s, "switched main", /switched to branch main/)) === 1,
        "the switch to main said once",
      );
    },
  },
  {
    area: "links-and-files",
    name: "git: a branch's tab of a note only it has, back as it's checked out — its links found, a backlink there, once it comes",
    covers: { cases: ["git", "links/git", "links/backlinks"], commands: ["links.open", "backlinks.open", "note.open"] },
    options: {
      home: true,
      startAt: "home/work/kestrel/docs/only-here.md",
      setup: (s) => {
        // A branch with a note main hasn't, checked out: made once (setup runs at every start).
        if (git(s, KESTREL, "rev-parse", "--verify", "-q", "only-here").code === 0) return;
        gitOk(s, "a branch made", true, KESTREL, "checkout", "-q", "-b", "only-here");
        s.write(
          "~/work/kestrel/docs/only-here.md",
          "# Only here\n\nOn this branch alone, to [the readme](../README.md).\n",
        );
        gitOk(s, "its note added", true, KESTREL, "add", "docs/only-here.md");
        gitOk(s, "its note committed", true, KESTREL, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "only here");
      },
    },
    run: async (s) => {
      // Open on only-here, left; main checked out, slipbox started there; only-here checked out while it runs.
      await s.where(/^kestrel │ only-here\b/, /‹ docs\/only-here\.md/);
      await s.quit();
      gitOk(s, "main checked out", true, KESTREL, "checkout", "-q", "main");
      await s.restart({ startAt: "home/work/kestrel" });
      await s.where(/^kestrel │ main\b/);
      gitOk(s, "only-here checked out from outside", true, KESTREL, "checkout", "-q", "only-here");
      await s.message("switched to branch only-here: its tabs are back", 5000);
      await opened(s, "docs/only-here.md");
      // Its tab came before the note did: once it has, the vault's note — its link found, its backlink there.
      await s.retry(
        async () => {
          if (s.rowOf("Links from") >= 0) await s.keys("escape");
          await leader(s, "l", "l");
        },
        () => s.rowOf("Links from only-here.md") >= 0 && /README\.md\s+resolved/.test(s.text()),
        "only-here.md's link to README.md, resolved",
        1000,
        15_000,
      );
      await s.keys("escape");
      await s.ex(`e ${s.path("~/work/kestrel/README.md")}`);
      await opened(s, "README.md");
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.see("docs/only-here.md");
    },
  },
  {
    area: "links-and-files",
    name: "git: what this branch changed — :changes lists it, enter a file's diff; :diff this note's; the explorer's marks",
    covers: { cases: ["git", "links/git"], commands: ["git.changes", "git.diff"] },
    options: { home: true, startAt: "home/work/kestrel-agent-sync-retry/docs/sync.md" },
    run: async (s) => {
      // The agent's worktree: its branch's commits against main — a rename among them, by git's own evidence.
      await s.ex("changes");
      await s.see(/Changed against main \(\d+\) — enter: the diff/, 5000);
      await s.see("M docs/sync.md");
      await s.see(/R src\/sync\/backoff\.ts/);
      await s.type("docs/sync");
      await s.keys("enter");
      await s.see("docs/sync.md against main — esc: the changes", 5000);
      // A note's diff: its blocks before and after; the table's row the agent added, framed once.
      await s.see("┌ added");
      await s.see("spent │ out of retry budget; kept in the log, never sent again");
      await s.keys("escape");
      await s.see(/Changed against main \(\d+\)/);
      await s.keys("escape");
      // This note's own: the branch's changes to it.
      await s.ex("diff");
      await s.see("[a] -> [c]            [b] failed five times: spent, and support sees it", 5000);
      await s.keys("escape");
      // An agent's edit, not committed: the explorer marks the file.
      s.write(
        "~/work/kestrel-agent-sync-retry/README.md",
        `${s.read("~/work/kestrel-agent-sync-retry/README.md")}\nA line the agent added.\n`,
      );
      await explorerOpen(s);
      await s.see(/README\.md +M/, 6000);
    },
  },
  {
    area: "links-and-files",
    name: "git: a diff marks a changed line's changed words, and a line too long reaches its end by scrolling sideways",
    covers: { cases: ["git", "links/git"], commands: ["git.diff", "git.diff_view"] },
    // Narrow enough that the agent's longest line doesn't fit the diff's window.
    options: { home: true, startAt: "home/work/kestrel-agent-sync-retry/docs/sync.md", size: { cols: 120, rows: 40 } },
    run: async (s) => {
      await s.ex("diff");
      await s.see("docs/sync.md against main", 5000);
      // A note's diff opens as its blocks; tab, its lines.
      await s.see("┌ before");
      await s.keys("tab");
      await s.notSee("┌ before");
      // The line whose numbers the agent changed: those words on the stronger tint, the rest of it on the line's.
      await s.see("+ The numbers are `DEFAULT_POLICY` in [lines 12 to 15 of retry.ts](../src/sync/retry.ts#L12-L15).");
      await s.see("- The numbers are `DEFAULT_POLICY` in [lines 17 to 21 of retry.ts](../src/sync/retry.ts#L17-L21).");
      const bg = (needle: string) => s.styleOf(needle)?.bg?.toLowerCase() ?? null;
      const roles = loadTheme("tokyo-night", "/nonexistent").theme.roles;
      const tint = (role: Role) => roles[role].bg!.toLowerCase();
      s.expect(bg("12 to 15") === tint("diff_add_word"), "an added word marked");
      s.expect(bg("to 15 of retry.ts") === tint("diff_add"), "the rest of its line on the line's tint");
      s.expect(bg("17 to 21") === tint("diff_del_word"), "a removed word marked");
      s.expect(bg("to 21 of retry.ts") === tint("diff_del"), "the rest of its line on the line's tint");
      // A sentence rewritten: no line like it to pair with, so nothing in it marked.
      s.expect(bg("Each op has a retry budget") === tint("diff_add"), "a line with no pair: tinted, not marked");
      // The agent's longest line: whole, never cut with …, its end out of sight until the rows scroll to it.
      await s.see("the sixth failure parks it");
      const row = () => s.screen()[s.rowOf("the sixth failure parks")] ?? "";
      s.expect(!row().includes("…") && !row().includes("hold the whole queue."), "its end beyond the edge, not cut");
      await s.keys("/");
      await s.type("sixth");
      await s.keys("enter", "$");
      await s.see("hold the whole queue.");
      s.expect(row().includes("+‹"), "its start scrolled out of sight, said so");
      await s.keys("0");
      await s.see("+ ([ADR 4](adr/0004-retry-budget.md));");
      await s.notSee("hold the whole queue.");
      await s.keys("escape", "escape");
      await s.notSee("docs/sync.md against main");
    },
  },
  {
    area: "links-and-files",
    name: "git: :merge-review — a merge's broken links before it, each fix said; after it, git's rename says where a file went (20.21)",
    covers: { cases: ["git", "links/git"], commands: ["git.merge_review", "link.relink"] },
    options: { home: true, startAt: "home/work/kestrel/docs/architecture.md" },
    run: async (s) => {
      await s.where(/^kestrel │ main\b/);
      await s.ex("merge-review");
      await s.see("Review a merge — enter: the links it would break", 5000);
      await s.type("refactor/docs-layout");
      await s.keys("enter");
      await s.see(/Merging refactor\/docs-layout into main: \d+ links would break/, 10000);
      await s.type("architecture.md:42");
      await s.see("docs/architecture.md:42");
      await s.see("refactor/docs-layout moves docs/sync.md to docs/architecture/"); // cut at the list's width
      await s.keys("enter");
      await opened(s, "docs/architecture.md");
      await s.status(/L42:/);
      // Merged: git's rename is evidence here — the link says where its file went; space l r fixes it.
      gitOk(s, "the merge", true, KESTREL, "merge", "-q", "--no-edit", "refactor/docs-layout");
      await s.message("branch main moved on: git moved 1 file", 8000);
      await leader(s, "l", "r");
      await s.see(/relink: \d+ changes? in 1 file/, 5000);
      await s.keys("enter");
      await s.file(
        "~/work/kestrel/docs/architecture.md",
        (t) => t.includes("(architecture/sync.md)") && !t.includes("](sync.md)"),
        "the links relinked",
      );
    },
  },
  {
    area: "links-and-files",
    name: "git: a worktree — name@branch, :worktrees lists both checkouts, enter opens the note in the other",
    covers: { cases: ["git", "links/git"], commands: ["git.worktrees"] },
    options: { home: true, startAt: "home/work/kestrel-agent-sync-retry/README.md" },
    run: async (s) => {
      // The build's worktree of kestrel (git worktree add): named for its main checkout and its branch.
      await s.where(/^kestrel │ agent\/sync-retry\b/, /‹ README\.md/);
      await s.ex("worktrees");
      await s.see("Worktrees (2) — enter: this note there");
      await s.see(/\smain\s+\/\S+\/work\/kestrel\s/); // the main checkout (after its branch icon)
      await s.see(/●\s+(\S+\s+)?agent\/sync-retry\s+\/\S+\/work\/kestrel-agent-sync-retry/); // this one, marked
      await s.type("main");
      await s.keys("enter");
      await s.where(/^kestrel │ main\b/, /‹ README\.md/, 5000);
      // Back: the worktree again, as a vault of its own.
      await s.keys("ctrl+o");
      await s.where(/^kestrel │ agent\/sync-retry\b/, /‹ README\.md/, 5000);
    },
  },
  {
    area: "links-and-files",
    name: "git: a merge's conflict — Problems at its first marker, the explorer's !, gone with --abort; git mv marked R",
    covers: { cases: ["git", "links/git"], commands: ["problems.open"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      const notes = "~/work/kestrel/docs/release-notes/2.3.md";
      // Jo's branch rewords the lines main changed too.
      gitOk(s, "the merge stops on a conflict", false, KESTREL, "merge", "jo/release-notes-wording");
      const marker =
        s
          .read(notes)
          .split("\n")
          .findIndex((l) => l.startsWith("<<<<<<<")) + 1;
      s.expect(marker > 0, "the release notes hold git's markers");
      await leader(s, "v", "p");
      // Filtered to the file (the panel is a third of the screen): under Conflicts, at its first marker.
      await s.keys("/");
      await s.type("release-notes/2.3");
      await s.see(/Conflicts \(1\)/, 5000);
      await s.see("docs/release-notes/2.3.");
      // enter: the note at its first marker, the conflict said.
      await s.keys("enter");
      await s.status("docs/release-notes/2.3.md", 5000);
      await s.status(`L${marker}:1`);
      await problemListed(s, "a merge conflict: both sides are still here");
      // The explorer marks it `!` (its row unselected: a selected row shows its buttons there).
      await leader(s, "E");
      await s.status("FILES");
      await s.keys("k");
      await s.see(/2\.3\.md\s+!\s*[│┃]/, 5000);
      // Aborted: no mark, no Conflicts.
      gitOk(s, "git merge --abort", true, KESTREL, "merge", "--abort");
      await s.until(() => s.rowOf(/2\.3\.md\s+[│┃]/) >= 0 && s.rowOf(/2\.3\.md\s+!/) < 0, 6000, "the ! gone");
      await leader(s, "v", "p");
      await s.see(/Broken links \(\d+\)/);
      await s.notSee(/Conflicts/);
      // A rename git knows of: R at its new name.
      gitOk(s, "git mv", true, KESTREL, "mv", "docs/glossary.md", "docs/terms.md");
      await leader(s, "E");
      await s.see(/terms\.md\s+R\s*[│┃]/, 6000);
    },
  },
  {
    area: "links-and-files",
    name: "git: a detached HEAD on the top bar; a switch bringing a rename isn't a move; a rebase lands as one change",
    covers: { cases: ["git", "links/git"], commands: ["link.relink"] },
    options: { home: true, startAt: "home/work/kestrel/docs/architecture.md" },
    run: async (s) => {
      await s.where(/^kestrel │ main\b/, /‹ docs\/architecture\.md/);
      // Detached: its commit where the branch would be.
      git(s, KESTREL, "checkout", "-q", "--detach", "HEAD~1");
      const sha = git(s, KESTREL, "rev-parse", "HEAD").out.trim();
      await s.until(
        () => {
          const m = / │ ([0-9a-f]{7,40})$/.exec(s.whereText());
          return !!m && sha.startsWith(m[1]!);
        },
        5000,
        `the top bar on ${sha.slice(0, 7)}`,
      );
      git(s, KESTREL, "checkout", "-q", "main");
      await s.where(/^kestrel │ main\b/, null, 5000);
      // refactor/docs-layout has docs/sync.md under architecture/: architecture.md's links to it break, but a
      // switch's files coming and going aren't moves — nothing to relink.
      gitOk(s, "checkout refactor/docs-layout", true, KESTREL, "checkout", "-q", "refactor/docs-layout");
      await s.message("switched to branch refactor/docs-layout", 5000);
      await s.where(/ │ refactor\/docs-layout$/, /‹ docs\/architecture\.md/);
      s.expect(
        s.read("~/work/kestrel/docs/architecture.md").includes("[sync.md](sync.md)") &&
          !s.exists("~/work/kestrel/docs/sync.md"),
        "a link the switch broke",
      );
      await leader(s, "l", "r");
      await s.see("relink: 0 changes in 0 files", 5000);
      await s.keys("escape");
      git(s, KESTREL, "checkout", "-q", "main");
      await s.message("switched to branch main", 5000);
      // A rebase lands as one change: git holds a detached HEAD while it replays (a second and a half here, as
      // one stopped on a conflict holds it for minutes); then the branch moved on, git's renames said once, and
      // no switch said — not to the detached HEAD, nor back.
      git(s, KESTREL, "checkout", "-q", "cleanup/remove-legacy");
      await s.message("switched to branch cleanup/remove-legacy", 5000);
      // What's said so far (the detach above is said only if a poll saw it before main was back).
      const detachedBefore = await messagesSaying(s, "switched detached", /switched to a detached HEAD/);
      const old = git(s, KESTREL, "rev-parse", "HEAD").out.trim();
      s.expect(
        git(s, KESTREL, "rebase", "-q", "--autostash", "--exec", "sleep 1.5", "main").code === 0,
        "the rebase applies (the local .editorconfig stashed and back)",
      );
      const renames = git(s, KESTREL, "diff", "-M", "--name-status", old, "HEAD")
        .out.split("\n")
        .filter((l) => l.startsWith("R")).length;
      s.expect(renames > 0, "the rebase brings renames");
      await s.message("cleanup/remove-legacy moved on", 8000); // the box wraps the rest
      await s.where(/ │ cleanup\/remove-legacy$/, /‹ docs\/architecture\.md/); // the tabs stay
      s.expect(
        (await messagesSaying(s, "moved on", new RegExp(`moved on: git moved ${renames} files`))) === 1,
        "git's renames said once",
      );
      s.expect(
        (await messagesSaying(s, "switched cleanup", /switched to branch cleanup\/remove-legacy/)) === 1,
        "no switch said back to the branch",
      );
      s.expect(
        (await messagesSaying(s, "switched detached", /switched to a detached HEAD/)) === detachedBefore,
        "no detach said for the rebase",
      );
    },
  },
  {
    area: "links-and-files",
    name: "git: source control — a file staged, committed, the commit amended; trusted, then no longer",
    covers: { cases: ["git"], commands: ["git.view", "git.commit", "git.amend", "root.trust", "root.untrust"] },
    options: {
      home: true,
      startAt: "home/work/kestrel/docs/sync.md",
      // Who commits: the set's home has no ~/.gitconfig, and git won't commit without a name.
      env: {
        GIT_AUTHOR_NAME: "Sam Rivera",
        GIT_AUTHOR_EMAIL: "sam@kestrel.dev",
        GIT_COMMITTER_NAME: "Sam Rivera",
        GIT_COMMITTER_EMAIL: "sam@kestrel.dev",
      },
    },
    run: async (s) => {
      const count = () => Number(git(s, KESTREL, "rev-list", "--count", "HEAD").out.trim());
      const commits = count();
      s.write(SYNC, `${s.read(SYNC)}\nA line the agent added.\n`);
      await s.status("reloaded", 5000);
      // A commit with nothing staged: said how to stage.
      await s.keys(":");
      await s.type("Commit");
      await s.keys("enter");
      await s.message("nothing staged — s stages a file in the git panel");
      // space g: the git panel, the changed files by section; s stages the one selected.
      await leader(s, "g");
      await s.see("Source control");
      await s.see(/Changes \(\d+\)/, 5000);
      await s.see(/M sync\.md +docs/);
      // The first row is Changes' heading, then the local .editorconfig, then sync.md: selected (its row drawn apart
      // from the heading's).
      const bgOf = (text: string) => s.runs()[s.rowOf(text)]?.find((r) => r.text.includes(text))?.bg;
      await s.keys("g", "g", "j", "j");
      await s.until(() => bgOf("M sync.md") !== bgOf("Changes ("), 3000, "sync.md selected");
      await s.keys("s");
      await s.message("staged docs/sync.md", 5000);
      await s.see("Staged (1)", 5000);
      // c: the commit's message in a floating editor, typed at once; ctrl+s commits. Not trusted: no hooks run,
      // nothing signed, said there.
      await s.keys("c");
      await s.see("# Committing: 1 file staged (docs/sync.md).");
      await s.see("# This vault isn't trusted: its hooks don't run, and the commit isn't signed");
      await s.type("Docs: the line the agent added");
      await s.keys("escape", "ctrl+s");
      await s.message(/committed [0-9a-f]+: Docs: the line the agent/, 8000);
      s.expect(count() === commits + 1, "one commit more");
      s.expect(
        git(s, KESTREL, "log", "-1", "--format=%s").out.trim() === "Docs: the line the agent added",
        "its message",
      );
      // Trusted: the amend's editor (the palette's, as the view's shift+c) says nothing of hooks; the message
      // changed, no commit more.
      await s.ex("trust");
      await s.message("trusted ~/work/kestrel");
      await s.keys(":");
      await s.type("Amend the last commit");
      await s.keys("enter");
      await s.see("# Amending the last commit: 0 files staged.");
      await s.notSee("This root isn't trusted", 500);
      await s.keys("A");
      await s.type(", amended");
      await s.keys("escape", "ctrl+s");
      await s.message(/amended [0-9a-f]+: Docs: the line the agent/, 8000); // the box wraps the rest
      s.expect(
        git(s, KESTREL, "log", "-1", "--format=%s").out.trim() === "Docs: the line the agent added, amended",
        "its message amended",
      );
      s.expect(count() === commits + 1, "amended, no commit more");
      await s.ex("untrust");
      await s.message("~/work/kestrel kept safe");
    },
  },
  {
    area: "links-and-files",
    name: "git: what slipbox writes read a byte at a time — the commit's message over the reload's, every character whole",
    covers: { cases: ["git"], commands: ["git.commit"] },
    // Each character cut across the terminal's reads, as macOS's pseudo-terminal cuts one now and then: the em dash
    // drawn, and the rest of its row in place — slipbox redraws only the cells that changed, trusting the rest (#19).
    options: { home: true, startAt: "home/work/kestrel/docs/sync.md", readSize: 1 },
    run: async (s) => {
      s.write(SYNC, `${s.read(SYNC)}\nA line the agent added.\n`);
      await s.status("reloaded", 5000);
      // The commit's message over the reload's, as in the git check: the cells under its box drawn only where they
      // differ. Its own em dash cut too.
      await s.ex("Commit");
      await s.message("nothing staged — s stages a file in the git panel");
    },
  },
  {
    area: "links-and-files",
    name: "git: branches — one checked out, a new one made from here",
    covers: { cases: ["git"], commands: ["git.branches"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      await s.ex("Branches");
      await s.see(/Branches \(\d+\) — enter: check one out/);
      await s.see("A new branch from here…");
      await s.type("cleanup");
      await s.keys("enter");
      await s.where(/ │ cleanup\/remove-legacy$/, null, 5000);
      s.expect(git(s, KESTREL, "branch", "--show-current").out.trim() === "cleanup/remove-legacy", "checked out");
      await s.ex("Branches");
      await s.type("A new branch");
      await s.keys("enter");
      await s.see("new branch:");
      await s.type("sam/readme-status");
      await s.keys("enter");
      await s.where(/ │ sam\/readme-status$/, null, 5000);
      s.expect(git(s, KESTREL, "branch", "--show-current").out.trim() === "sam/readme-status", "made, and on it");
    },
  },
  {
    area: "links-and-files",
    name: "git: push, fetch and pull against a bare repository — the upstream asked for, the branch's ↓ and ↑, no hook in a vault not trusted",
    covers: { cases: ["git"], commands: ["git.push", "git.fetch", "git.pull"] },
    options: { home: true, startAt: "home/work/kestrel/README.md", setup: (s) => void bareOrigin(s, false) },
    run: async (s) => {
      // kestrel's own pre-push hook, the folder's code: in a vault not trusted, it never runs.
      const mark = join(s.dir, "pre-push-ran");
      const hook = s.path("~/work/kestrel/.git/hooks/pre-push");
      writeFileSync(hook, `#!/bin/sh\ntouch '${mark}'\n`);
      chmodSync(hook, 0o755);
      await s.where(/ │ main$/);
      // Source control's keys: shift+p pushes, f fetches, p pulls.
      await leader(s, "g");
      await s.see("Source control");
      // main has no upstream: asked to push it to origin/main and track it there.
      await s.keys("shift+p");
      await s.see("main has no upstream. Push it to origin/main, and track it"); // the dialog wraps the rest
      await s.keys("y");
      await s.message("pushed main to origin/main", 8000);
      const bare = join(s.dir, "remote", "kestrel.git");
      s.expect(git(s, bare, "rev-parse", "main").out === git(s, KESTREL, "rev-parse", "HEAD").out, "main pushed");
      // Someone else pushes: fetched, the status line says main is one behind.
      pushedElsewhere(s, "README.md", "A line from another clone.\n");
      await s.keys("f");
      await s.message("fetched: main is 1 commit behind", 8000);
      await s.where(/ │ main ↓1$/, null, 5000);
      // Pulled, fast-forward: the file has their line, nothing behind.
      await s.keys("p");
      await s.message(/pulled: main fast-forwarded to [0-9a-f]+/, 8000);
      await s.file("~/work/kestrel/README.md", (t) => t.includes("A line from another clone."), "pulled");
      await s.where(/ │ main$/, null, 5000);
      // An agent commits here: one ahead; pushed, in step again — the hook never ran.
      s.write(SYNC, `${s.read(SYNC)}\nA line the agent committed.\n`);
      gitOk(s, "the agent's commit", true, KESTREL, "commit", "-qam", "Docs: the agent's line");
      await s.where(/ │ main ↑1$/, null, 8000);
      await s.keys("shift+p");
      await s.message("pushed main to origin/main", 8000);
      await s.where(/ │ main$/, null, 5000);
      s.expect(git(s, bare, "rev-parse", "main").out === git(s, KESTREL, "rev-parse", "HEAD").out, "pushed again");
      s.expect(!existsSync(mark), "no pre-push hook ran in a vault not trusted");
      s.expect((await lastMessage(s, "pushed main")).includes("this vault isn't trusted, so no hook ran"), "said so");
    },
  },
  {
    area: "links-and-files",
    name: "git: a pull where both sides moved — ↑1 ↓1, asked: nothing leaves both as they were, merge brings them together",
    covers: { cases: ["git"], commands: ["git.fetch", "git.pull"] },
    options: {
      home: true,
      startAt: "home/work/kestrel/README.md",
      setup: (s) => void bareOrigin(s, true),
      env: IDENTITY,
    },
    run: async (s) => {
      pushedElsewhere(s, "README.md", "A line from another clone.\n");
      s.write(SYNC, `${s.read(SYNC)}\nA line the agent committed.\n`);
      gitOk(s, "the agent's commit", true, KESTREL, "commit", "-qam", "Docs: the agent's line");
      const head = git(s, KESTREL, "rev-parse", "HEAD").out;
      // The palette's: :fetch, :pull.
      await s.ex("fetch");
      await s.where(/ │ main ↑1 ↓1$/, null, 8000);
      await s.ex("pull");
      await s.see("main and origin/main have both moved on — bring them together?", 8000);
      await s.see("(r) Rebase main onto origin/main");
      // Nothing: both as they were.
      await s.keys("n");
      await s.message("nothing pulled: main and origin/main");
      s.expect(git(s, KESTREL, "rev-parse", "HEAD").out === head, "HEAD where it was");
      s.expect(!s.read("~/work/kestrel/README.md").includes("A line from another clone."), "their line not here");
      await s.where(/ │ main ↑1 ↓1$/);
      // Merge: their line here, a merge commit, two ahead of origin/main now.
      await s.ex("pull");
      await s.see("(m) Merge origin/main into main", 8000);
      await s.keys("m");
      await s.message("pulled: merged origin/main into main", 8000);
      await s.file("~/work/kestrel/README.md", (t) => t.includes("A line from another clone."), "their line here");
      await s.where(/ │ main ↑2$/, null, 8000);
      s.expect(git(s, KESTREL, "log", "-1", "--format=%P").out.trim().split(" ").length === 2, "a merge commit");
      s.expect(
        (await lastMessage(s, "pulled: merged")).includes("this vault isn't trusted, so no hook ran"),
        "said so",
      );
    },
  },
  {
    area: "links-and-files",
    name: "git: stash — an agent's edit stashed with a message, listed, popped",
    covers: { cases: ["git"], commands: ["git.stash"] },
    options: { home: true, startAt: "home/work/kestrel/docs/sync.md" },
    run: async (s) => {
      const LINE = "A line the agent added.";
      s.write(SYNC, `${s.read(SYNC)}\n${LINE}\n`);
      await s.status("reloaded", 5000);
      // Source control's z; then the palette's :stash.
      await leader(s, "g");
      await s.see("Source control");
      await s.keys("z");
      await s.see("Stashes (0) — enter: pop, apply or drop one");
      await s.see("Stash the changes, untracked files too…");
      await s.keys("enter");
      await s.see("stash message:");
      await s.type("wip: the agent's line");
      await s.keys("enter");
      await s.message("stashed: wip: the agent's line", 8000);
      await s.file(SYNC, (t) => !t.includes(LINE), "the file back as committed");
      // Listed after the ways to stash; enter on it, then pop: the line back.
      await s.ex("stash");
      await s.see("stash@{0}  On main: wip: the agent's line");
      await s.keys("down", "down", "enter");
      await s.see("Pop it");
      await s.see("Drop it…");
      await s.keys("enter");
      await s.message("popped stash@{0}", 8000);
      await s.file(SYNC, (t) => t.includes(LINE), "the line back");
      s.expect(git(s, KESTREL, "stash", "list").out.trim() === "", "the stash gone from the list");
    },
  },
  {
    area: "links-and-files",
    name: "git: a remote that asks for a password fails at once, in git's words, never waiting for one",
    covers: { cases: ["git"], commands: ["git.fetch"] },
    // No system config's credential helper: the remote's question goes to git's own prompt, which never comes.
    options: { home: true, startAt: "home/work/kestrel/README.md", env: { GIT_CONFIG_NOSYSTEM: "1" } },
    run: async (s) => {
      // A remote that wants a login, on this machine: every request answered 401.
      const server = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: () => new Response("log in", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="kestrel"' } }),
      });
      try {
        gitOk(
          s,
          "origin over http",
          true,
          KESTREL,
          "remote",
          "set-url",
          "origin",
          `http://127.0.0.1:${server.port}/k.git`,
        );
        await s.ex("fetch");
        await s.message("could not read Username", 8000);
        // git's own prompt never asked: it says so (in a terminal, without it, git would wait at its question).
        const said = await lastMessage(s, "could not read Username");
        s.expect(said.includes("terminal prompts disabled"), `git told not to prompt: ${said}`);
        s.expect(said.includes("git in a terminal can log in (git fetch)"), "the hint: git in a terminal can log in");
      } finally {
        server.stop(true);
      }
    },
  },
  {
    area: "links-and-files",
    name: "git: who changed this line, and this file's history through its rename — a version read as it was",
    covers: { cases: ["git", "links/git"], commands: ["git.blame", "git.history"] },
    options: { home: true, startAt: "home/work/kestrel/docs/runbooks/sync-queue.md" },
    run: async (s) => {
      await s.ex("Who changed this line");
      await s.see(/line 1, last changed in [0-9a-f]{8}/, 8000);
      await s.keys("escape");
      // The history follows the file from before it moved next to the other runbooks.
      await s.ex("This file's history");
      await s.see(/docs\/runbooks\/sync-queue\.md — \d+ commits: enter, read it or its diff to now/, 8000);
      await s.see("as docs/runbook-sync.md");
      // up from the newest: the oldest, from before the move.
      await s.keys("up", "enter");
      await s.see("Read it as it was");
      await s.see("Its diff to the text now");
      await s.keys("enter");
      await s.see(/docs\/runbook-sync\.md at [0-9a-f]{7} \(\d{4}-\d\d-\d\d\), read-only/, 5000);
    },
  },
  {
    area: "links-and-files",
    name: "git: the gutter's changes — ] c and [ c go to them, Preview the change shows one, Undo the change undoes it",
    covers: {
      cases: ["git"],
      commands: ["git.change_next", "git.change_prev", "git.change_preview", "git.change_undo"],
    },
    options: { home: true, startAt: "home/work/kestrel/docs/sync.md" },
    run: async (s) => {
      // An agent's edit: a line changed near the top, one added at the end.
      const was = s.read(SYNC);
      s.write(
        SYNC,
        `${was.replace("How an edit gets from one device to the others.", "How an edit travels between devices.")}\nA line the agent added.\n`,
      );
      await s.status("reloaded", 5000);
      await s.keys("g", "g");
      await moveTo(s, ["]", "c"], (l) => l > 1, "] c: the first change");
      const first = pos(s).line;
      await moveTo(s, ["]", "c"], (l) => l > first, "] c: the next");
      const last = pos(s).line;
      await moveTo(s, ["[", "c"], (l) => l === first, "[ c: back to the first");
      // Its diff, against what's staged.
      await s.ex("Preview the change");
      await s.see(`line ${first}, against what's staged`);
      await s.see("+How an edit travels between devices.");
      await s.keys("escape");
      // Undone: its lines as staged, put back; unsaved, one undo step.
      await s.ex("Undo the change");
      await s.message(`the change at line ${first} undone, as staged (unsaved)`);
      await s.see("How an edit gets from one device to the others.");
      await s.status("unsaved");
      s.expect(last > first, "two changes");
    },
  },
  {
    area: "links-and-files",
    name: "git: the gutter's signs where [git] signs_at puts them — before the line numbers, at the window's right edge, against the text — in softer colours of their own",
    covers: { cases: ["git", "config"], commands: [] },
    options: {
      home: true,
      startAt: "home/work/kestrel/docs/sync.md",
      config: '[git]\nsigns_at = "gutter_left"\n',
    },
    run: async (s) => {
      const NOW = "How an edit travels between devices.";
      s.write(SYNC, s.read(SYNC).replace("How an edit gets from one device to the others.", NOW));
      await s.status("reloaded", 5000);
      /** The changed row (line 3): the text before its words, the text after, and its sign's colour. */
      const row = () => {
        const y = s.rowOf(NOW);
        const r = s.screen()[y] ?? "";
        const at = r.indexOf("▎", r.indexOf("┃") + 1);
        let n = 0;
        let fg: string | null = null;
        for (const run of s.runs()[y] ?? []) {
          if (at >= n && at < n + run.text.length) fg = run.fg;
          n += run.text.length;
        }
        const t = r.indexOf(NOW);
        return { before: r.slice(0, t), after: r.slice(t + NOW.length), fg: fg?.toLowerCase() };
      };
      const soft = themeFg("tokyo-night", "git_sign_change");
      s.expect(soft !== themeFg("tokyo-night", "git_modified"), "a colour of their own, not the explorer's");
      // Before the line numbers, in the gutter's first column.
      await s.until(() => /▎ *3 +$/.test(row().before), 5000, "the sign before line 3's number");
      s.expect(row().fg === soft, `the sign in its own colour (${row().fg}, not ${soft})`);
      // Rewritten while it runs: at the window's right edge, after the text.
      const file = join(s.dir, "config", "slipbox", "config.toml");
      writeFileSync(file, readFileSync(file, "utf8").replace('"gutter_left"', '"window_right"'));
      await s.message("config reloaded (file changed)", 5000);
      await s.until(
        () =>
          !row()
            .before.slice(row().before.indexOf("┃") + 1)
            .includes("▎") && row().after.includes("▎"),
        5000,
        "the sign after the text, at the window's edge",
      );
      // Against the text, after the line number: where they were before the setting.
      writeFileSync(file, readFileSync(file, "utf8").replace('"window_right"', '"gutter_right"'));
      await s.message("config reloaded (file changed)", 5000);
      await s.until(() => / 3 ▎$/.test(row().before), 5000, "the sign between line 3's number and its text");
      s.expect(row().fg === soft, "still its own colour");
    },
  },
];

// GIT's review, merge screen and rebase have their checks in source-control.ts, with the git panel's.
