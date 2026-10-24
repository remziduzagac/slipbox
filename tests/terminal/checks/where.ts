// Where you are (WSP-D4, WSP-D5): the top bar's middle names the vault, its branch, and the workspace when it isn't the
// vault's own; the vault clicked lists the named folders, the branch the branches' menu; cut to fit a narrow screen, in
// its order; the status line's only while the bar is hidden. The places the other checks pass through read it there with
// `Session.where`: home and its folders, Elsewhere and a vault by its path (vaults.ts, links-and-files.ts), a branch
// switched while slipbox runs (links-and-files.ts), a rebase and a merge under way (source-control.ts).

import { randomBytes } from "node:crypto";
import { type Check, leader } from "../check.ts";
import { SIZE, type Session } from "../session.ts";
import { columnOf, git, gitOk, mouse, put, repoAt, TRAIL, trail } from "./source-control.ts";

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

/** A click on `needle` on the status line. */
async function onStatusLine(s: Session, needle: string): Promise<void> {
  await s.status(needle);
  const rows = s.screen();
  await clickAt(
    s,
    rows.findLastIndex((r) => r.trim() !== ""),
    needle,
  );
}

/** Nothing being indexed: the top bar's right end holds nothing that moves where you are. */
const indexed = (s: Session) => s.until(() => !s.topBar().includes("indexing"), 30_000, "the indexing done");

/**
 * Where you are kept clear of the chip and of the right end, 2 columns from each beyond their own padding: at least 3
 * spaces after `slipbox`, and before whatever follows it, or the screen's last 2 columns.
 */
function clear(s: Session): void {
  const bar = s.topBar().trimEnd();
  const w = s.whereText();
  s.expect(w !== "" && /slipbox {3,}\S/.test(bar), `where you are 2 columns clear of the chip:\n${bar}`);
  const after = bar.slice(bar.lastIndexOf(w) + w.length);
  s.expect(
    after === "" ? Bun.stringWidth(bar) <= s.cols - 2 : /^ {3,}\S/.test(after),
    `where you are 2 columns clear of the right end:\n${bar}`,
  );
}

/** A vault in the check's home named in wide characters, its notes' own id. */
function wideNamed(s: Session): void {
  s.write(
    "~/kaiso/.slipbox/config.toml",
    `[vault]\nid = "${randomBytes(8).toString("hex")}"\nname = "日本語のノート"\n`,
  );
  s.write("~/kaiso/index.md", "# 索引\n\nノートの一覧。\n");
}

/** ~/work/trail with agent's commit rebased onto main's, begun in a terminal and stopped at their conflict. */
function rebaseStopped(s: Session): void {
  trail(s, { "route.md": "# Route\n\nOne way.\n" });
  gitOk(s, TRAIL, "switch", "-q", "-c", "agent");
  put(s, TRAIL, { "route.md": "# Route\n\nThe agent's way.\n" });
  gitOk(s, TRAIL, "commit", "-q", "-am", "Agent's way");
  gitOk(s, TRAIL, "switch", "-q", "main");
  put(s, TRAIL, { "route.md": "# Route\n\nMain's way.\n" });
  gitOk(s, TRAIL, "commit", "-q", "-am", "Main's way");
  gitOk(s, TRAIL, "switch", "-q", "agent");
  s.expect(git(s, TRAIL, "rebase", "main").code !== 0, "the rebase stopped at the conflict");
}

export const WHERE: Check[] = [
  {
    area: "navigating",
    name: "permanent top bar: zoom focuses explorer, workspace and branch have distinct targets, zen retains location",
    covers: { cases: ["ui", "status", "mouse"], commands: ["explorer.focus", "ui.zen"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      await s.until(() => /≡ .*│ ◈ kestrel │ ⎇ main/.test(s.topBar()), 5000, "zoom, workspace and branch");
      await leader(s, "e");
      await onTopBar(s, "≡");
      await s.see("Explorer");
      await onTopBar(s, "⎇ main");
      await s.see(/Branches \(\d+\) — enter: check one out/);
      await s.keys("escape");
      await leader(s, "u", "z");
      await s.until(
        () => s.topBar().includes("slipbox") && s.topBar().includes("◈ kestrel"),
        3000,
        "bar retained in zen",
      );
    },
  },
  {
    area: "links-and-files",
    name: "where you are: the top bar's vault clicked lists the named folders; enter goes into one, the bar then naming it",
    covers: { cases: ["vault", "mouse"], commands: ["folders.open"] },
    options: { home: true, startAt: "home/notes/index.md", setup: (s) => void s.cliIn("~/work/kestrel", "ls") },
    run: async (s) => {
      await s.where(/^notes(?: ·|$)/);
      await onTopBar(s, "notes");
      await s.see(/Folders \(\d+\) — enter goes into one/);
      await s.type("kestrel");
      await s.keys("enter");
      await s.where(/^kestrel · main\b/, /‹ README\.md/, 5000);
    },
  },
  {
    area: "outside-and-code",
    name: "where you are: the top bar's branch clicked opens the branches' menu — push and fetch, then the branches; one picked is checked out, the bar following",
    covers: { cases: ["git", "mouse"] },
    options: repoAt((s) => {
      trail(s);
      gitOk(s, TRAIL, "branch", "topic");
    }),
    run: async (s) => {
      await s.where(/^~\/work\/trail · main$/);
      await onTopBar(s, "· main");
      await s.see(/Branches \(2\) — enter: check one out/);
      await s.see("Fetch");
      await s.see("The git panel");
      await s.type("topic");
      await s.keys("enter");
      await s.where(/^~\/work\/trail · topic$/, null, 5000);
    },
  },
  {
    area: "links-and-files",
    name: "where you are: a worktree as name@branch — its vault clicked, the named folders; its branch, from the @, the branches' menu",
    covers: { cases: ["vault", "git", "mouse"] },
    options: {
      home: true,
      startAt: "home/work/kestrel-agent-sync-retry/README.md",
      setup: (s) => void s.cliIn("~/notes", "ls"),
    },
    run: async (s) => {
      await s.where(/^kestrel@agent\/sync-retry\b/);
      await onTopBar(s, "@agent/sync-retry");
      await s.see(/Branches \(\d+\) — enter: check one out/);
      await s.keys("escape");
      await s.notSee(/Branches \(\d+\)/);
      await onTopBar(s, "kestrel@");
      await s.see(/Folders \(\d+\) — enter goes into one/);
      await s.keys("escape");
    },
  },
  {
    area: "outside-and-code",
    name: "where you are: a detached head, by its commit",
    covers: { cases: ["git"] },
    options: repoAt((s) => {
      trail(s);
      gitOk(s, TRAIL, "switch", "-q", "--detach");
    }),
    run: async (s) => {
      const commit = gitOk(s, TRAIL, "rev-parse", "--short=7", "HEAD");
      await s.where(`~/work/trail · ${commit}`);
    },
  },
  {
    area: "navigating",
    name: "where you are: on a narrow screen cut in its order — a path from the front, then the branch, then the name — kept clear of the chip and the right end; too narrow, neither bar says it",
    covers: { cases: ["width", "status"] },
    options: { home: true, startAt: "home/hobbies/cooking/Home.md" },
    run: async (s) => {
      // A vault by its path, not a repository: the path alone.
      await s.where("~/hobbies/cooking", /‹ Home\.md/);
      await indexed(s);
      clear(s);
      // Narrower: the path cut from the front, its last folder kept.
      await s.resize(28, SIZE.rows);
      await s.where(/^…\S*\/cooking$/);
      clear(s);
      // Too narrow for even the vault: not drawn, and the status line has no room for it either.
      await s.resize(20, SIZE.rows);
      await s.until(() => s.whereText() === "", 3000, "nothing said on a bar this narrow");
      s.expect(!s.statusLine().includes("cooking"), `the status line says nothing of it either:\n${s.statusLine()}`);
      await s.resize(SIZE.cols, SIZE.rows);
      await s.where("~/hobbies/cooking");
      // A vault by its name, on a branch: the branch goes before the name is cut.
      await s.restart({ startAt: "home/work/kestrel/README.md" });
      await s.where(/^kestrel · main\b/, null, 5000);
      await indexed(s);
      await s.resize(26, SIZE.rows);
      await s.where("kestrel");
      clear(s);
      await s.resize(SIZE.cols, SIZE.rows);
      await s.where(/^kestrel · main\b/);
    },
  },
  {
    area: "outside-and-code",
    name: "where you are: a rebase under way on a narrow bar — kept after the branch is gone, the sign that something's to finish",
    covers: { cases: ["git", "width"] },
    options: repoAt(rebaseStopped),
    run: async (s) => {
      await s.where("~/work/trail · agent rebasing 1/1");
      await indexed(s);
      await s.resize(40, SIZE.rows);
      await s.where("~/work/trail rebasing 1/1");
      clear(s);
      await s.resize(SIZE.cols, SIZE.rows);
      await s.where("~/work/trail · agent rebasing 1/1");
    },
  },
  {
    area: "navigating",
    name: "where you are: no note open (home's Downloads, left out) — the bar hidden, the status line says it all the same",
    covers: { cases: ["vault", "ui", "status"], commands: [] },
    options: { home: true, startAt: "home/Downloads" },
    run: async (s) => {
      await s.where("~ › Downloads");
      s.expect(!s.statusLine().includes("Downloads"), `the status line leaves it to the bar:\n${s.statusLine()}`);
      await leader(s, "u", "b");
      await s.until(() => !s.topBar().includes("slipbox"), 3000, "the top bar gone");
      await s.status(/ ~ › Downloads(?: |$)/);
    },
  },
  {
    area: "navigating",
    name: "where you are: beside the outline's button on the top bar (no window header, no right rail), kept clear of it; too narrow, the bar holds the button alone",
    covers: { cases: ["width", "ui"] },
    options: {
      home: true,
      startAt: "home/work/kestrel/README.md",
      config: "[ui]\nwindow_header = false\nright_rail = false\n",
    },
    run: async (s) => {
      await s.where(/^kestrel · main\b/);
      await indexed(s);
      s.expect(/ {3,}\S$/.test(s.topBar().trimEnd()), `the outline's button at the bar's right end:\n${s.topBar()}`);
      clear(s);
      // Narrow: moved left of centre only as far as the button needs, the branch gone first.
      await s.resize(30, SIZE.rows);
      await s.where("kestrel");
      clear(s);
      await s.resize(22, SIZE.rows);
      await s.until(() => s.whereText() === "", 3000, "nothing said beside the button on a bar this narrow");
      s.expect(/slipbox {3,}\S$/.test(s.topBar().trimEnd()), `the chip and the button alone:\n${s.topBar()}`);
      await s.resize(SIZE.cols, SIZE.rows);
      await s.where(/^kestrel · main\b/);
    },
  },
  {
    area: "navigating",
    name: "where you are: on the top bar, not the status line; the bar hidden (space u b), the status line says it, its click the branches' menu; zen, neither",
    covers: { cases: ["ui", "status", "mouse"], commands: ["ui.zen"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      await s.where(/^kestrel · main\b/, /‹ README\.md/);
      s.expect(!s.statusLine().includes("kestrel"), `the status line leaves it to the top bar:\n${s.statusLine()}`);
      await leader(s, "u", "b");
      await s.message("Top bar: off");
      await s.until(() => !s.topBar().includes("slipbox"), 3000, "the top bar gone");
      await s.status(/ kestrel · main +‹ README\.md/);
      await onStatusLine(s, "kestrel · main");
      await s.see(/Branches \(\d+\) — enter: check one out/);
      await s.keys("escape");
      await leader(s, "u", "b");
      await s.where(/^kestrel · main\b/);
      await s.until(() => !s.statusLine().includes("kestrel"), 3000, "the status line leaving it to the bar again");
      await leader(s, "u", "z");
      await s.message("Zen mode: on");
      await s.until(() => !s.text().includes("kestrel · main"), 3000, "zen: neither bar, so nothing says where");
      await leader(s, "u", "z");
      await s.where(/^kestrel · main\b/);
    },
  },
  {
    area: "links-and-files",
    name: "where you are: a vault named in wide characters, measured by its columns and cut from its end",
    covers: { cases: ["vault", "unicode"] },
    options: { home: true, startAt: "home/kaiso/index.md", setup: wideNamed },
    run: async (s) => {
      await s.where("日本語のノート", /‹ index\.md/);
      await indexed(s);
      clear(s);
      await s.resize(24, SIZE.rows);
      await s.where(/^日本語の…$/);
      s.expect(Bun.stringWidth(s.topBar().trimEnd()) <= 22, `cut to its columns, clear of the end:\n${s.topBar()}`);
      await s.resize(SIZE.cols, SIZE.rows);
      await s.where("日本語のノート");
    },
  },
];
