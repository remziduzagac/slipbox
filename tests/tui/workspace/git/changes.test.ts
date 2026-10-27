import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import { makeSandbox, makeVault, harness, statusRow, topRow } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("git in the TUI: marks, what changed, a note's diff, worktrees, conflicts (5.11–5.14)", () => {
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  /** A vault and its repository: on main a.md and notes/b.md; on feat (checked out) a.md changed, c.md new. */
  const repo = () => {
    const root = mkdtempSync(join(sandbox, "gitui-"));
    mkdirSync(join(root, ".slipbox"));
    mkdirSync(join(root, "notes"));
    writeFileSync(
      join(root, ".slipbox", "config.toml"),
      `[vault]\nid = "g${root.slice(-6).replace(/[^a-z0-9]/gi, "")}"\nname = "g${root.slice(-6).replace(/[^a-z0-9]/gi, "")}"\n`,
    );
    writeFileSync(join(root, "a.md"), "# A\n\none\ntwo\nthree\n");
    writeFileSync(join(root, "notes", "b.md"), "# B\n");
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return null;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    git(root, "checkout", "-q", "-b", "feat");
    writeFileSync(join(root, "a.md"), "# A\n\none\nTWO\nthree\n");
    writeFileSync(join(root, "c.md"), "# C\n");
    writeFileSync(join(root, "notes", "b.md"), "# B, changed\n");
    return root;
  };

  test("the explorer marks each changed file at its row's end, and a folder with one in it", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "a.md" });
    await h.app.git.refreshNow();
    h.app.panels.showSidebar(true);
    h.app.explorer.expanded.add("notes");
    h.app.explorer.invalidateTree();
    const rows = h.frame().split("\n");
    const row = (name: string) =>
      rows.find((r) => new RegExp(`\\b${name.replace(".", "\\.")}\\b`).test(r.split(/[┃┣]/)[0]!))!.split(/[┃┣]/)[0]!;
    expect(row("a.md").trimEnd()).toMatch(/a\.md +M$/);
    expect(row("c.md").trimEnd()).toMatch(/c\.md +\+$/);
    expect(row("notes").trimEnd()).toMatch(/notes +• ●$/); // git's dot, then the index's mark (VV-D9)
    expect(row("b.md").trimEnd()).toMatch(/b\.md +M$/);
    // A name as long as the row: cut short of its mark, never under it.
    writeFileSync(join(root, "a-rather-long-note-name-that-fills-the-whole-row.md"), "# Long\n");
    h.app.graph.build(true, "lazy");
    await h.app.git.refreshNow();
    const long = h
      .frame()
      .split("\n")
      .find((r) => r.includes("a-rather-long"))!
      .split(/[┃┣]/)[0]!;
    expect(long.trimEnd()).toMatch(/[^ ] \+$/);
  });

  test("a marked explorer row: its name scrolls to its end before the mark; a root's own name stops short of its •", async () => {
    const root = makeVault();
    const name = "aaaaaaaaaaaaaaaaaaaaaaaaz.md"; // as long as the pane's text: it scrolls sideways
    writeFileSync(join(root, name), "# x\n");
    const h = await harness({
      root,
      open: "index.md",
      width: 120,
      height: 40,
      config: (c) => (c.ui.sidebar_width = 30),
    });
    h.app.panels.showSidebar(true);
    h.app.git.states = new Map([[name, "modified"]]);
    h.app.git.folders.set("nested-vault", "modified");
    h.app.explorer.invalidateTree();
    const row = (has: string) =>
      h
        .frame()
        .split("\n")
        .find((r) => r.includes(has))!
        .split(/[┃┣]/)[0]!;
    // Named otherwise than its folder (17.13): the name, cut with a `…`, then the folder's dot.
    expect(row("nested-vault").trimEnd()).toMatch(/nested-vault fixture-.*… •$/);
    h.app.sidebar.left = 1000;
    expect(row("aaaaaaaa").trimEnd()).toMatch(/z\.md +M$/);
    // A pane too short to scroll sideways: the name cut with a `…` before the mark.
    const short = await harness({
      root,
      open: "index.md",
      width: 120,
      height: 6,
      config: (c) => (c.ui.sidebar_width = 30),
    });
    short.app.panels.showSidebar(true);
    short.app.git.states = new Map([[name, "modified"]]);
    short.app.explorer.invalidateTree();
    short.app.explorer.select(name);
    short.app.region = "content";
    expect(
      short
        .frame()
        .split("\n")
        .find((r) => r.includes("aaaaaaaa")),
    ).toMatch(/a… M/);
  });
  test(":changes lists what this branch changed; enter shows a file's diff; esc goes back; enter on a line goes there", async () => {
    const root = repo();
    if (!root) return;
    // A note's diff as its lines (`[git] diff`): a row a line, each going to its own.
    const h = await harness({ root, open: "c.md", config: (c) => (c.git.diff = "source") });
    await h.app.run("git.changes");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("Changed against main (3) — enter: the diff");
    expect(list.items.map((i) => [i.label, i.role])).toEqual([
      ["M a.md", "git_modified"],
      ["+ c.md", "git_new"],
      ["M notes/b.md", "git_modified"],
    ]);
    await h.keys("enter"); // a.md's diff, in the diff window (GIT-D2)
    const f = h.app.floating!;
    expect([f.kind, f.title]).toEqual(["diff", "a.md against main — esc: the changes"]);
    const rows = h.app.currentLayout(f.view).lines.map((l) => [l.spans.map((s) => s.text).join(""), l.spans[0]?.role]);
    expect(rows).toEqual([
      ["@@ line 4", "diff_head"],
      ["  # A", "text"],
      ["  ", "text"],
      ["  one", "text"],
      ["- two", "diff_del"],
      ["+ TWO", "diff_add"],
      ["  three", "text"],
    ]);
    await h.keys("escape");
    expect(h.app.floating).toBeNull();
    expect((h.app.overlay as ListOverlay).title).toStartWith("Changed against main");
    // `q` goes back too.
    await h.keys("enter", "q");
    expect((h.app.overlay as ListOverlay).title).toStartWith("Changed against main");
    await h.keys("enter");
    await h.keys("j", "j", "j", "j", "j"); // on + TWO
    await h.keys("enter");
    expect(h.app.floating).toBeNull();
    expect(h.app.overlay).toBeNull();
    expect(h.app.view!.buf.rel).toBe("a.md");
    expect(statusRow(h.frame())).toMatch(/ L4:\d+ /); // on that line, inside its paragraph
  });

  test(":changes without its base: a [git] base that isn't there named; on a detached HEAD, the fallback base", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "c.md", config: (c) => Object.assign(c.git, { base: "nope", bases: [] }) });
    await h.app.run("git.changes");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe('no branch or commit "nope" ([git] base)');
    // HEAD detached (a rebase, a checkout of a commit): against [git] base or main, never a guess among [git] bases —
    // here dev, at HEAD itself, which would leave nothing changed.
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "feat");
    git(root, "branch", "dev");
    git(root, "checkout", "-q", "--detach");
    const d = await harness({ root, open: "c.md", config: (c) => (c.git.bases = ["dev", "main"]) });
    await d.app.run("git.changes");
    expect((d.app.overlay as ListOverlay).title).toBe("Changed against main (3) — enter: the diff");
  });

  test("a key after enter in :changes waits for the diff git is read for: with git slow, enter's diff is open", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "c.md", config: (c) => (c.git.diff = "source") });
    await h.app.run("git.changes");
    // git answering slowly: the key's turn ends once the diff window is open, as the keys after it expect.
    const dir = mkdtempSync(join(sandbox, "slow-git-"));
    writeFileSync(join(dir, "git"), `#!/bin/sh\nsleep 0.2\nexec ${JSON.stringify(Bun.which("git")!)} "$@"\n`);
    chmodSync(join(dir, "git"), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${dir}${delimiter}${path}`;
    try {
      await h.keys("enter");
      expect(h.app.floating?.kind).toBe("diff");
      expect(h.app.floating?.title).toBe("a.md against main — esc: the changes");
    } finally {
      process.env.PATH = path;
    }
  });

  test(":merge-review: a branch picked, the links its merge would break; enter goes to one; esc back to the branches (20.21)", async () => {
    const root = repo();
    if (!root) return;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "feat");
    // main moves a.md; feat (checked out) links to it from c.md.
    git(root, "checkout", "-q", "main");
    mkdirSync(join(root, "docs"));
    git(root, "mv", "a.md", "docs/a.md");
    git(root, "commit", "-q", "-m", "a moved");
    git(root, "checkout", "-q", "feat");
    writeFileSync(join(root, "c.md"), "# C\n\nSee [a](a.md).\n");
    git(root, "commit", "-q", "-am", "c links a");
    const h = await harness({ root, open: "c.md" });
    await h.app.run("git.merge_review");
    let list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("Review a merge — enter: the links it would break");
    expect(list.items.map((i) => [i.label.replace(/^\S+ /, ""), i.detail])).toEqual([
      ["feat → main", "this branch into the base"],
      ["main → feat", "into this branch"],
    ]);
    await h.keys("enter");
    list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("Merging feat into main: 1 link would break — esc: the branches");
    expect(list.items.map((i) => [i.label, i.detail, i.role])).toEqual([
      ["c.md:3  a.md", "main moves a.md to docs/a.md — the fix: docs/a.md", "git_modified"],
    ]);
    await h.keys("escape");
    expect((h.app.overlay as ListOverlay).title).toStartWith("Review a merge");
    await h.keys("enter", "enter");
    expect(h.app.view!.buf.rel).toBe("c.md");
    expect(statusRow(h.frame())).toMatch(/ L3:\d+ /);
    // Nothing would break: said so, no list.
    git(root, "checkout", "-q", "-b", "quiet", "main");
    h.app.git.checkHead();
    await h.app.run("git.merge_review");
    list = h.app.overlay as ListOverlay;
    list.selected = list.items.findIndex((i) => i.label.endsWith("main → quiet"));
    await h.keys("enter");
    expect(h.app.messages.at(-1)!.text).toBe("merging main into quiet breaks no link");
  });

  test(":merge-review: a branch made from dev is reviewed against dev, its own base, not main (GIT-D10)", async () => {
    const root = repo();
    if (!root) return;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "feat");
    git(root, "checkout", "-q", "-b", "dev", "main");
    writeFileSync(join(root, "d.md"), "# D\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "dev");
    git(root, "checkout", "-q", "-b", "topic");
    writeFileSync(join(root, "t.md"), "# T\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "topic");
    const h = await harness({
      root,
      open: "t.md",
      config: (c) => {
        c.git.bases = ["main", "dev"];
      },
    });
    await h.app.run("git.merge_review");
    const list = h.app.overlay as ListOverlay;
    const shown = list.items.map((i) => [i.label.replace(/^\S+ /, ""), i.detail]);
    expect(shown[0]).toEqual(["topic → dev", "this branch into the base"]);
    expect(shown.map(([label]) => label)).not.toContain("topic → main");
  });

  test(":diff: this note's diff, as it is now (unsaved too); nothing different, said so", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "a.md" });
    await h.keys("space", "n", "v", "shift+g", "o", ...[..."four"], "escape");
    await h.app.run("git.diff");
    const labels = h.app.floating!.view.buf.source.split("\n");
    expect(labels).toContain("+ four");
    expect(labels).toContain("+ TWO");
    await h.keys("escape", "u");
    expect(h.app.floating).toBeNull();
    git(root, "checkout", "-q", "--", "a.md");
    await h.app.run("note.open notes/../c.md");
    git(root, "add", "c.md");
    git(root, "commit", "-q", "-m", "c");
    git(root, "checkout", "-q", "main");
    git(root, "merge", "-q", "feat");
    await h.app.run("git.diff");
    expect([h.app.floating, h.app.overlay, h.app.messages.at(-1)?.text]).toEqual([
      null,
      null,
      "no differences from main",
    ]);
  });

  test(":diff: a note with a byte order mark, unchanged, has no differences; its first line changed, that line", async () => {
    const root = repo();
    if (!root) return;
    git(root, "checkout", "-q", "main");
    writeFileSync(join(root, "d.md"), "\uFEFF# D\n\nbody\n");
    git(root, "add", "d.md");
    git(root, "commit", "-q", "-m", "d");
    git(root, "checkout", "-q", "feat");
    git(root, "merge", "-q", "main");
    const h = await harness({ root, open: "d.md" });
    await h.app.run("git.diff");
    expect([h.app.floating, h.app.messages.at(-1)?.text]).toEqual([null, "no differences from main"]);
    // Its gutter: no sign on the first line either (once git has said what's staged).
    for (let t = Date.now(); h.app.git.changesOf(h.app.view!) === null && Date.now() - t < 10_000; )
      await Bun.sleep(20);
    expect(h.app.git.changesOf(h.app.view!)).toEqual([]);
    h.app.view!.buf.edit(0, "# D".length, "# E"); // typed, unsaved
    await h.app.run("git.diff");
    const w = h.app.floating?.kind === "diff" ? h.app.floating.diff : null;
    expect(w?.rows.filter((r) => r.kind === "-" || r.kind === "+").map((r) => `${r.kind} ${r.text}`)).toEqual([
      "- # D",
      "+ # E",
    ]);
  });

  test(":worktrees: the worktrees by branch; enter opens this note in the one picked", async () => {
    const root = repo();
    if (!root) return;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "feat's");
    const wt = `${root}-other`;
    git(root, "worktree", "add", "-q", "-b", "other", wt, "main");
    const h = await harness({ root, open: "notes/b.md", width: 2 * stringWidth(wt) + 100 });
    await h.app.run("git.worktrees");
    const list = h.app.overlay as ListOverlay;
    expect(list.items.map((i) => [i.label, i.detail])).toEqual([
      ["● ⎇ feat", `${root}  (main)`],
      ["  ⎇ other", wt],
    ]);
    await h.keys("down", "enter");
    expect(h.app.loc.root).toBe(wt);
    expect(h.app.view!.buf.rel).toBe("notes/b.md"); // the same note, there
    expect(h.app.view!.buf.source).toBe("# B\n"); // as the other branch has it
    expect(topRow(h.frame())).toContain(`${h.app.glyphs.branch} other`); // the worktree, by its branch (20.14)
  });

  test("a merge's conflicts in Problems: each file at its first marker; enter goes there", async () => {
    const root = repo();
    if (!root) return;
    git(root, "commit", "-q", "-am", "feat's two");
    git(root, "checkout", "-q", "main");
    writeFileSync(join(root, "a.md"), "# A\n\none\nmain's two\nthree\n");
    git(root, "commit", "-q", "-am", "main's two");
    git(root, "merge", "-q", "feat");
    const h = await harness({ root, open: "notes/b.md" });
    await h.app.git.refreshNow();
    const rows = h.app.problems.rows().filter((r) => r.section === "Conflicts");
    expect(rows.map((r) => [r.label, r.detail])).toEqual([
      ["Conflicts (1)", ""],
      ["a.md", "L4"],
    ]);
    await h.keys("space", "v", "p");
    h.app.problems.panel.all.selected = h.app.problems
      .rows()
      .findIndex((r) => r.label === "a.md" && r.section === "Conflicts");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("a.md");
    expect(h.app.cursorLine(h.app.view!)).toBe(4);
    // Filtered to it, the selection on its heading (git's answer came after the typing): enter goes to its first.
    await h.app.run("note.open notes/b.md");
    await h.keys("space", "v", "p", "/", "a", ".", "m", "d");
    expect(h.app.problems.rows()[0]!.label).toBe("Conflicts (1)");
    h.app.problems.panel.all.selected = 0;
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("a.md");
    expect(h.app.cursorLine(h.app.view!)).toBe(4);
  });
});
