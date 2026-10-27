import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ListOverlay, App } from "../../../../src/tui/app/runtime/app.ts";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import { makeSandbox, harness, topRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("git's review, merge screen, pull and rebase (GIT-D3, GIT-D5, GIT-D6)", () => {
  const git = (cwd: string, ...args: string[]) =>
    new TextDecoder()
      .decode(
        Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]).stdout,
      )
      .trim();
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  /** Nobody's git config but the test's, while it runs; its commits made by the test. */
  const isolated = async (run: () => Promise<void>) => {
    const keys = [
      "GIT_CONFIG_GLOBAL",
      "GIT_CONFIG_NOSYSTEM",
      "GIT_AUTHOR_NAME",
      "GIT_AUTHOR_EMAIL",
      "GIT_COMMITTER_NAME",
      "GIT_COMMITTER_EMAIL",
    ];
    const was = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = "t";
    process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = "t@example.invalid";
    try {
      await run();
    } finally {
      for (const [k, v] of Object.entries(was))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  };
  /** A vault that's a repository, its files committed; with an origin beside it and a clone of it, if asked. */
  const repo = (files: Record<string, string>, remote = false) => {
    const top = mkdtempSync(join(sandbox, "git-"));
    const root = join(top, "work");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), ".slipbox/\n");
    for (const [f, t] of Object.entries(files)) writeFileSync(join(root, f), t);
    git(root, "init", "-q", "-b", "main");
    // git's own markers, whatever the machine's config says (diff3's base section is read too:
    // core/workspace/git/merge/conflicts.test.ts).
    git(root, "config", "merge.conflictStyle", "merge");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    const bare = join(top, "origin.git");
    const other = join(top, "other");
    if (remote) {
      Bun.spawnSync(["git", "init", "-q", "--bare", "-b", "main", bare]);
      git(root, "remote", "add", "origin", bare);
      git(root, "push", "-q", "-u", "origin", "main");
      Bun.spawnSync(["git", "clone", "-q", bare, other]);
    }
    return { root, bare, other };
  };
  const commit = (root: string, file: string, text: string, message = `${file}: ${text.trim()}`) => {
    writeFileSync(join(root, file), text);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", message);
  };
  const said = (h: Harness, text: string | RegExp) =>
    until(() => h.app.messages.some((m) => (typeof text === "string" ? m.text === text : text.test(m.text))));
  const list = (h: Harness) => h.app.overlay as ListOverlay;
  const type = (s: string) => [...s].map((ch) => (ch === " " ? "space" : ch));
  const floatText = (h: Harness) => h.app.floating?.view.buf.source ?? "";

  const MIDDLE =
    "The queue is ordered.\nAn op waits its turn.\nA drain takes fifty.\nIt wakes every thirty seconds.\nOr when the network is back.";
  /** A merge of `theirs` into main stopped at its conflicts: both changed the same two lines of sync.md (and, `also`,
   *  a line of another.md). */
  const conflicted = (also = false) => {
    // Far enough apart for git to keep them two.
    const base = `# Sync\n\nRetry forever.\n\n${MIDDLE}\n\nA 409 retries the op.\nEnd.\n`;
    const { root } = repo({ "sync.md": base, "another.md": "one\n" });
    git(root, "switch", "-q", "-c", "theirs");
    if (also) commit(root, "another.md", "theirs\n");
    commit(root, "sync.md", base.replace("Retry forever.", "Retry with a budget.").replace("retries", "drops"));
    git(root, "switch", "-q", "main");
    if (also) commit(root, "another.md", "mine\n");
    commit(root, "sync.md", base.replace("Retry forever.", "Retry up to a minute.").replace("retries", "parks"));
    git(root, "merge", "-q", "theirs");
    return root;
  };

  test("opened with --base: the branch here kept against it, said on opening; a ref that names nothing, exit 3 before the screen (D255)", async () => {
    await isolated(async () => {
      const { prepare } = await import("../../../../src/tui/shell/terminal/run.ts");
      const { keptBases } = await import("../../../../src/core/workspace/git/gitbase.ts");
      const { checkoutOf } = await import("../../../../src/core/workspace/git/git.ts");
      const { root } = repo({ "a.md": "# A\n" }, true);
      git(root, "fetch", "-q", "origin");
      git(root, "switch", "-q", "-c", "fix-retry");
      const said: string[] = [];
      const write = process.stderr.write;
      process.stderr.write = ((s: string) => (said.push(s), true)) as typeof process.stderr.write;
      let bad: ReturnType<typeof prepare>;
      try {
        bad = prepare([root, "--base", "origin/no-such"]);
      } finally {
        process.stderr.write = write;
      }
      expect(bad).toBe(3);
      expect(said).toEqual(['slipbox: --base: no branch or commit "origin/no-such" in the repository\n']);
      expect(keptBases(checkoutOf(root)!)).toEqual({});
      const start = prepare([root, "--base", "origin/main"]);
      if (typeof start === "number") throw new Error(`exit ${start}`);
      expect(start.notes).toEqual(["fix-retry is compared against origin/main now"]);
      expect(keptBases(checkoutOf(root)!)).toEqual({ "fix-retry": "origin/main" });
      const app = new App({ ...start, watch: false, host: { requestRender() {}, osc52: () => true, quit: () => {} } });
      expect(app.messages.map((m) => [m.level, m.text])).toContainEqual([
        "info",
        "fix-retry is compared against origin/main now",
      ]);
      // Outside a repository: ignored, said, and the screen opens.
      const loose = mkdtempSync(join(sandbox, "loose-base-"));
      writeFileSync(join(loose, "a.md"), "# A\n");
      const plain = prepare([loose, "--base", "dev"]);
      if (typeof plain === "number") throw new Error(`exit ${plain}`);
      expect(plain.warnings).toContain("--base dev: not in a git repository, so it's ignored");
    });
  });

  describe("reviewing a change (GIT-D3)", () => {
    test("a review: three files' changes, one kept (staged), one reverted (saved, one undo), one noted (the scratch)", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "a\n", "b.md": "b one\nb two\n", "c.md": "c\n" });
        writeFileSync(join(root, "a.md"), "a\nkeep me\n");
        writeFileSync(join(root, "b.md"), "b one\nb TWO\n");
        writeFileSync(join(root, "c.md"), "c, noted\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        expect(h.app.floating!.title).toBe("Review — 1 of 3");
        expect(floatText(h)).toContain("a.md  line 2 · change 1 of 1 here, 1 of 3 in all");
        expect(floatText(h)).toContain("+ keep me");
        expect(h.frame()).toContain("y keep  x revert  c note for the agent");
        // y: staged; on to b.md.
        await h.keys("y");
        expect(git(root, "diff", "--cached", "--name-only")).toBe("a.md");
        expect(h.app.floating!.title).toBe("Review — 2 of 3");
        expect(floatText(h)).toContain("- b two");
        // x: b.md's lines back as staged, saved; u in it brings the change back.
        await h.keys("x");
        expect(readFileSync(join(root, "b.md"), "utf8")).toBe("b one\nb two\n");
        expect(await said(h, "reverted a change of b.md, saved — u in the file brings it back")).toBe(true);
        const b = h.app.buffers.get("b.md")!;
        b.undo();
        expect(b.source).toBe("b one\nb TWO\n");
        b.redo();
        // c: a note asked for; the scratch has the file, its line, the diff and the note.
        await h.keys("c", ...type("say why"), "enter");
        const scratch = readFileSync(h.app.scratch.location().path, "utf8");
        expect(scratch).toContain("**At:** `c.md:1`");
        expect(scratch).toContain("-c\n+c, noted");
        expect(scratch).toContain("**Note:** say why");
        // None left: the review's end, what it did said.
        expect(h.app.floating).toBeNull();
        expect(
          await said(
            h,
            "review: 1 kept (staged), 1 reverted, 1 note for the agent in the scratch — space s y copies it",
          ),
        ).toBe(true);
        // Nothing committed.
        expect(git(root, "log", "--oneline").split("\n").length).toBe(1);
      });
    });

    test("a review: n and p move; a hunk found again after another moved it; unsaved typing skipped; esc ends it", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\n" });
        writeFileSync(join(root, "a.md"), "ONE\nadded\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nNINE\n");
        writeFileSync(join(root, "new.md"), "brand new\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        // a.md's two changes, then the new file, wholly added.
        expect(h.app.floating!.title).toBe("Review — 1 of 3");
        await h.keys("n", "n");
        expect(floatText(h)).toContain("new.md  line 1 · change 1 of 1 here, 3 of 3 in all  new file");
        await h.keys("n");
        expect(await said(h, "the last change — esc ends the review")).toBe(true);
        await h.keys("p");
        expect(h.app.floating!.title).toBe("Review — 2 of 3");
        // The second change kept, then the first: found again though the index moved under it.
        await h.keys("y");
        expect(git(root, "show", ":a.md")).toBe("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nNINE");
        expect(h.app.floating!.title).toBe("Review — 3 of 3");
        await h.keys("p", "p", "y");
        expect(git(root, "show", ":a.md")).toBe("ONE\nadded\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nNINE");
        await h.keys("escape");
        expect(await said(h, "review: 2 kept (staged); 1 left as it was")).toBe(true);
        // Unsaved typing in new.md: x refuses to write over it, says so, goes on.
        await h.app.run("note.open new.md");
        h.app.view!.buf.edit(0, 0, "typed ");
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        expect(floatText(h)).toContain("new.md  line 1");
        await h.keys("x");
        expect(await said(h, "skipped: new.md has unsaved typing — save it, then x reverts the change")).toBe(true);
        expect(existsSync(join(root, "new.md"))).toBe(true);
        expect(await said(h, "review: nothing kept, reverted or noted; 1 skipped")).toBe(true);
      });
    });

    test("source control's v starts a review; with nothing to review, said; enter goes to the change", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "one\ntwo\nthree\n" });
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.view");
        await h.app.git.refreshNow();
        await h.keys("v");
        expect(await said(h, "nothing to review: the working tree has no change that isn't staged")).toBe(true);
        writeFileSync(join(root, "a.md"), "one\nTWO\nTHREE\n");
        await h.keys("v");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        // enter on the change's second line: there, in the file, not at its first; the review ended. A note's change is
        // its paragraph before and after, laid out again: its word's own line, though its row starts on another.
        const rows = h.app.currentLayout(h.app.floating!.view).lines.map((l) => l.spans.map((s) => s.text).join(""));
        const row = rows.findIndex((t) => t.includes("THREE"));
        expect(rows[row]).toContain("│ one TWO THREE");
        h.app.moveCursor(h.app.floating!.view, { row, col: rows[row]!.indexOf("THREE") });
        await h.keys("enter");
        expect(h.app.floating).toBeNull();
        expect(h.app.view!.buf.rel).toBe("a.md");
        expect(h.app.cursorLine(h.app.view!)).toBe(3);
        expect(await said(h, "review: nothing kept, reverted or noted; 1 left as it was")).toBe(true);
      });
    });

    test("a note's change drawn before and after, its words marked; a code file's side by side where there's room (GIT-D2, GIT-D7)", async () => {
      await isolated(async () => {
        const para = "The queue is drained by a loop that wakes every thirty seconds.\n";
        const { root } = repo({ "a.md": `# A\n\n${para}`, "b.ts": "const a = 1;\nconst b = 2;\nconst c = 3;\n" });
        writeFileSync(join(root, "a.md"), `# A\n\n${para.replace("thirty seconds", "minute")}`);
        writeFileSync(join(root, "b.ts"), "const a = 1;\nconst b = 22;\nconst c = 3;\n");
        const h = await harness({ root, open: "a.md", width: 200, height: 40 });
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        const rows = () => h.app.currentLayout(h.app.floating!.view).lines;
        const text = (l: typeof rows extends () => (infer L)[] ? L : never) => l.spans.map((s) => s.text).join("");
        // The paragraph whole, before and after, only the words that changed marked.
        expect(
          rows()
            .filter((l) => text(l).startsWith("┌"))
            .map((l) => text(l).split(" ")[1]),
        ).toEqual(["before", "after"]);
        const after = rows().find((l) => text(l).includes("every minute"))!;
        expect(after.spans.find((s) => s.text.includes("minute"))?.bg).toBe("diff_add_word");
        expect(after.spans.find((s) => s.text.includes("drained"))?.bg).toBeUndefined();
        // The window as tall as its rows, its frames' rules too: none of it cut off.
        h.frame();
        expect(h.app.geometry!.panes.find((p) => p.view === h.app.floating!.view)!.h).toBeGreaterThanOrEqual(
          rows().length,
        );
        // The code file's: its lines side by side, the line removed beside the line it became.
        await h.keys("n");
        expect(rows().some((l) => /- const b = 2; +│ \+ const b = 22;/.test(text(l)))).toBe(true);
      });
    });
    test("a review's revert: a deleted file comes back as staged; a new one goes to the trash, after asking", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "a\n", "b.md": "b\n" });
        rmSync(join(root, "b.md"));
        writeFileSync(join(root, "new.md"), "brand new\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        expect(floatText(h)).toContain("b.md  line 1 · change 1 of 1 here, 1 of 2 in all  deleted");
        expect(floatText(h)).toContain("- b");
        await h.keys("x");
        expect(readFileSync(join(root, "b.md"), "utf8")).toBe("b\n");
        expect(await said(h, "b.md is back as staged")).toBe(true);
        expect(floatText(h)).toContain("new.md  line 1");
        await h.keys("x");
        expect(h.app.overlay).toMatchObject({ kind: "prompt", confirm: true });
        await h.keys("y");
        expect(existsSync(join(root, "new.md"))).toBe(false);
        expect(await said(h, "review: 2 reverted")).toBe(true);
      });
    });

    test("tab in a review switches a note's change between its blocks and its lines, as in the diff window (regression)", async () => {
      await isolated(async () => {
        const para = "The queue is drained by a loop that wakes every thirty seconds.\n";
        const { root } = repo({ "a.md": `# A\n\n${para}`, "b.ts": "const a = 1;\nconst b = 2;\nconst c = 3;\n" });
        writeFileSync(join(root, "a.md"), `# A\n\n${para.replace("thirty seconds", "minute")}`);
        writeFileSync(join(root, "b.ts"), "const a = 1;\nconst b = 22;\nconst c = 3;\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        const rows = () =>
          h.app.currentLayout(h.app.floating!.view).lines.map((l) => l.spans.map((s) => s.text).join(""));
        const frames = () => rows().filter((t) => t.startsWith("┌")).length;
        expect(frames()).toBe(2);
        // Its lines, as source: the line removed and the line it became.
        await h.keys("tab");
        expect(await said(h, "the diff's lines — tab: its blocks, before and after")).toBe(true);
        expect(frames()).toBe(0);
        expect(
          rows().some((t) => t.startsWith("- The queue is drained by a loop that wakes every thirty seconds.")),
        ).toBe(true);
        expect(rows().some((t) => t.startsWith("+ The queue is drained by a loop that wakes every minute."))).toBe(
          true,
        );
        // Back to its blocks.
        await h.keys("tab");
        expect(await said(h, "the diff's blocks, before and after — tab: its lines")).toBe(true);
        expect(frames()).toBe(2);
        // A code file's change has only its lines.
        await h.keys("n");
        await h.keys("tab");
        expect(await said(h, "a code file's diff is drawn as its lines: only a note's has blocks")).toBe(true);
        // The merge screen's sides likewise.
        await h.keys("escape");
        const merging = conflicted();
        const m = await harness({ root: merging, open: "sync.md", width: 120, height: 50 });
        await m.app.git.refreshNow();
        await m.app.run("git.merge_screen");
        const mergeRows = () =>
          m.app.currentLayout(m.app.floating!.view).lines.map((l) => l.spans.map((s) => s.text).join(""));
        expect(mergeRows().filter((t) => t.startsWith("┌")).length).toBe(4);
        await m.keys("tab");
        expect(mergeRows().filter((t) => t.startsWith("┌")).length).toBe(0);
        expect(mergeRows()).toContain("- Retry forever.");
        expect(mergeRows()).toContain("+ Retry up to a minute.");
        expect(m.app.floating?.kind).toBe("merge");
      });
    });

    test("a file made again or changed since the review read it: x and y leave it as it is (regression)", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "a\n", "b.md": "b as committed\n" });
        rmSync(join(root, "b.md"));
        writeFileSync(join(root, "new.md"), "brand new\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        expect(floatText(h)).toContain("b.md  line 1 · change 1 of 1 here, 1 of 2 in all  deleted");
        // Written again meanwhile (an agent): neither brought back over it, nor staged as the deletion shown.
        writeFileSync(join(root, "b.md"), "a new b, never in git\n");
        await h.keys("x");
        expect(await said(h, "b.md is there again since the review read it: left as it is")).toBe(true);
        expect(readFileSync(join(root, "b.md"), "utf8")).toBe("a new b, never in git\n");
        await h.keys("y");
        expect(git(root, "diff", "--cached", "--name-only")).toBe("");
        // A new file changed meanwhile: not sent to the trash, nor asked about.
        await h.keys("n");
        expect(floatText(h)).toContain("new.md  line 1");
        writeFileSync(join(root, "new.md"), "brand new, and more\n");
        await h.keys("x");
        expect(await said(h, "new.md changed since the review read it: left as it is")).toBe(true);
        expect(h.app.overlay).toBeNull();
        expect(readFileSync(join(root, "new.md"), "utf8")).toBe("brand new, and more\n");
      });
    });

    test("a revert on a note open, unchanged, but not read again since the file changed: the change shown reverted (regression)", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "a\nb\nc\nd\n" });
        // Open as committed; then written on disk, the buffer not read again (the watcher off, or before it runs).
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        const buf = h.app.buffers.get("a.md")!;
        writeFileSync(join(root, "a.md"), "X\na\nb\nc\nD\n");
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        expect(floatText(h)).toContain("a.md  line 1 · change 1 of 2 here");
        expect(floatText(h)).toContain("+ X");
        await h.keys("x");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a\nb\nc\nD\n");
        expect(buf.source).toBe("a\nb\nc\nD\n");
        expect(buf.dirty).toBe(false);
        // The next change, a line up now that the one above is gone: shown there, and reverted there.
        expect(floatText(h)).toContain("a.md  line 4 · change 2 of 2 here");
        await h.keys("x");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a\nb\nc\nd\n");
        expect(await said(h, "review: 2 reverted")).toBe(true);
      });
    });
  });

  describe("the merge screen (GIT-D5)", () => {
    test("a note's sides drawn before and after against the base; a code file's side by side where there's room (GIT-D2, GIT-D7)", async () => {
      await isolated(async () => {
        const root = conflicted();
        const h = await harness({ root, open: "sync.md", width: 200, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        const text = (l: { spans: { text: string }[] }) => l.spans.map((s) => s.text).join("");
        const frames = () =>
          h.app
            .currentLayout(h.app.floating!.view)
            .lines.map(text)
            .filter((t) => t.startsWith("┌"))
            .map((t) => t.split(" ")[1]);
        // Each side against the base: its line removed, and the one it became added (less than half alike).
        expect(frames()).toEqual(["removed", "added", "removed", "added"]);
        await h.keys("escape");
        // A code file in conflict: each side's lines beside the base's.
        const base = "const a = 1;\nconst b = 2;\nconst c = 3;\n";
        const { root: code } = repo({ "x.ts": base });
        git(code, "switch", "-q", "-c", "theirs");
        commit(code, "x.ts", base.replace("b = 2", "b = 22"));
        git(code, "switch", "-q", "main");
        commit(code, "x.ts", base.replace("b = 2", "b = 3"));
        git(code, "merge", "-q", "theirs");
        const c = await harness({ root: code, open: "x.ts", width: 200, height: 50 });
        await c.app.git.refreshNow();
        await c.app.run("git.merge_screen");
        expect(c.app.floating?.kind).toBe("merge");
        const lines = c.app.currentLayout(c.app.floating!.view).lines.map(text);
        expect(lines.some((t) => /- const b = 2; +│ \+ const b = 3;/.test(t))).toBe(true);
        expect(lines.some((t) => /- const b = 2; +│ \+ const b = 22;/.test(t))).toBe(true);
      });
    });
    test("the merge screen: two conflicts, one taken from each side, saved, staged — git resolved", async () => {
      await isolated(async () => {
        const root = conflicted();
        expect(git(root, "status", "--porcelain")).toBe("UU sync.md");
        const h = await harness({ root, open: "sync.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        expect(h.app.floating?.kind).toBe("merge");
        const card = floatText(h);
        expect(card).toContain("Conflict 1 of 2 · line 3 · not settled");
        // The base from stage 1; each side against it.
        expect(card).toContain("Base\n  Retry forever.");
        expect(card).toContain("Yours · HEAD, against the base\n- Retry forever.\n+ Retry up to a minute.");
        expect(card).toContain("Theirs · theirs, against the base\n- Retry forever.\n+ Retry with a budget.");
        expect(card).toContain("The result · 0 of 2 settled");
        // o: yours; on to the second. t: theirs. The result below, settled.
        await h.keys("o");
        expect(floatText(h)).toContain("Conflict 2 of 2");
        expect(floatText(h)).toContain("@@ conflict 1, line 3: yours");
        // w with one left: refused; the file as it was.
        const before = readFileSync(join(root, "sync.md"), "utf8");
        await h.keys("w");
        expect(await said(h, "1 conflict left: o, t or b settles one, e edits it in the lens")).toBe(true);
        expect(readFileSync(join(root, "sync.md"), "utf8")).toBe(before);
        await h.keys("t");
        expect(await said(h, "conflict 2: theirs — all settled: w saves sync.md")).toBe(true);
        // s before w: saved first.
        await h.keys("s");
        expect(await said(h, "w saves it first")).toBe(true);
        await h.keys("w");
        expect(readFileSync(join(root, "sync.md"), "utf8")).toBe(
          `# Sync\n\nRetry up to a minute.\n\n${MIDDLE}\n\nA 409 drops the op.\nEnd.\n`,
        );
        await h.keys("s");
        expect(await said(h, /^sync\.md staged, marked resolved — no conflict left/)).toBe(true);
        expect(git(root, "status", "--porcelain")).toBe("M  sync.md");
        expect(h.app.floating).toBeNull();
      });
    });

    test("the merge screen marks resolved the file it settled, and only it: a name like a pattern names itself", async () => {
      await isolated(async () => {
        const { root } = repo({ "Why?.md": "one\n", "WhyX.md": "one\n" });
        git(root, "switch", "-q", "-c", "theirs");
        commit(root, "Why?.md", "theirs\n");
        commit(root, "WhyX.md", "theirs\n");
        git(root, "switch", "-q", "main");
        commit(root, "Why?.md", "mine\n");
        commit(root, "WhyX.md", "mine\n");
        git(root, "merge", "-q", "theirs");
        expect(git(root, "status", "--porcelain")).toBe("UU Why?.md\nUU WhyX.md");
        const h = await harness({ root, open: "Why?.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        expect(h.app.floating?.kind).toBe("merge");
        await h.keys("t", "w", "s");
        expect(await said(h, "Why?.md staged, marked resolved — next: WhyX.md")).toBe(true);
        // WhyX.md is still in conflict, its markers not staged.
        expect(git(root, "status", "--porcelain")).toBe("M  Why?.md\nUU WhyX.md");
      });
    });

    test("the merge screen: both either way, e puts the result in the lens, a sends a conflict to the agent", async () => {
      await isolated(async () => {
        const root = conflicted();
        const h = await harness({ root, open: "sync.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        await h.keys("shift+b");
        expect(floatText(h)).toContain("conflict 1, line 3: both, theirs first");
        // a: the conflict, its base between the sides, into the scratch.
        await h.keys("a", ...type("both meant"), "enter");
        const scratch = readFileSync(h.app.scratch.location().path, "utf8");
        expect(scratch).toContain("**At:** `sync.md:");
        // The base between the sides, as diff3 has it: from git's index, the markers lacking it.
        expect(scratch).toContain(
          "<<<<<<< HEAD\nA 409 parks the op.\n||||||| base\nA 409 retries the op.\n=======\nA 409 drops the op.",
        );
        expect(scratch).toContain("**Note:** both meant");
        // e: the result in the file, the one not settled still marked, the lens on it; unsaved, autosave off.
        await h.keys("e");
        expect(h.app.floating).toBeNull();
        const buf = h.app.view!.buf;
        expect(buf.rel).toBe("sync.md");
        expect(buf.source).toContain("Retry with a budget.\nRetry up to a minute.\n");
        expect(buf.source).toContain("<<<<<<< HEAD\nA 409 parks the op.\n=======\n");
        expect(buf.dirty).toBe(true);
        expect(buf.markers).toBe(true);
        // Opened again: what's left, read from the file's markers; b keeps both, yours first.
        await h.app.run("git.merge_screen");
        expect(floatText(h)).toContain("Conflict 1 of 1");
        await h.keys("b", "w");
        expect(readFileSync(join(root, "sync.md"), "utf8")).toContain("A 409 parks the op.\nA 409 drops the op.\n");
      });
    });

    test("x on a conflict in the git panel, and in Problems, opens the merge screen; esc keeps what's settled", async () => {
      await isolated(async () => {
        const root = conflicted(true);
        // Open on the other file in conflict: x takes the one selected, not this note.
        const h = await harness({ root, open: "another.md", width: 120, height: 50 });
        await h.app.run("git.view");
        await h.app.git.refreshNow();
        // The second file in conflict selected: its own.
        h.app.sidebar.selected = h.app.gitPanel
          .rows()
          .findIndex((r) => r.kind === "file" && r.section === "conflicted" && r.entry.path === "sync.md");
        await h.keys("x");
        expect(await until(() => h.app.floating?.kind === "merge")).toBe(true);
        expect(h.app.floating!.title).toBe("Merge — sync.md");
        await h.keys("o", "escape");
        expect(await said(h, "sync.md: 1 of 2 settled, not saved — x opens the merge screen as you left it")).toBe(
          true,
        );
        await h.app.run("problems.open");
        h.app.region = "problems";
        h.app.problems.panel.all.selected = h.app.problems.rows().findIndex((r) => r.conflict?.path === "sync.md");
        await h.keys("x");
        expect(await until(() => h.app.floating?.kind === "merge")).toBe(true);
        expect(floatText(h)).toContain("Conflict 2 of 2");
        expect(floatText(h)).toContain("conflict 1, line 3: yours");
        // The note changed meanwhile: not written over.
        await h.keys("t");
        const buf = h.app.buffers.get("sync.md")!;
        buf.edit(0, 0, "typed ");
        await h.keys("w");
        expect(await said(h, "sync.md changed since the merge screen read it — x reads it again")).toBe(true);
        expect(readFileSync(join(root, "sync.md"), "utf8")).toContain("<<<<<<< HEAD");
      });
    });

    test("ctrl+s and :w save the merge screen as w does (regression)", async () => {
      await isolated(async () => {
        for (const save of [["ctrl+s"], [":", "w", "enter"]]) {
          const root = conflicted();
          const h = await harness({ root, open: "sync.md", width: 120, height: 50 });
          await h.app.git.refreshNow();
          await h.app.run("git.merge_screen");
          await h.keys("o", "t", ...save);
          expect(readFileSync(join(root, "sync.md"), "utf8")).toBe(
            `# Sync\n\nRetry up to a minute.\n\n${MIDDLE}\n\nA 409 drops the op.\nEnd.\n`,
          );
          expect(await said(h, "saved sync.md — s stages it, marking it resolved")).toBe(true);
          expect(h.app.floating?.kind).toBe("merge");
        }
      });
    });

    test("a save refused by a change on disk: the buffer back as the screen read it, x reads the file again (regression)", async () => {
      await isolated(async () => {
        const root = conflicted();
        const h = await harness({ root, open: "sync.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        await h.keys("o", "t");
        // Written meanwhile (an agent), the buffer not read again yet.
        const marked = readFileSync(join(root, "sync.md"), "utf8");
        writeFileSync(join(root, "sync.md"), `${marked}An agent's line.\n`);
        await h.keys("w");
        expect(
          await said(h, "sync.md: not saved — it changed on disk since the merge screen read it; x reads it again"),
        ).toBe(true);
        const buf = h.app.buffers.get("sync.md")!;
        expect(buf.source).toBe(marked);
        expect(buf.dirty).toBe(false);
        expect(readFileSync(join(root, "sync.md"), "utf8")).toBe(`${marked}An agent's line.\n`);
        // x: the file as it is now, its conflicts read again.
        await h.keys("escape");
        await h.app.run("git.merge_screen");
        expect(h.app.floating?.kind).toBe("merge");
        expect(floatText(h)).toContain("Conflict 1 of 2 · line 3 · not settled");
        expect(buf.source).toContain("An agent's line.");
      });
    });

    test("s reads the file again: one changed since w, or with markers still in it, isn't staged (regression)", async () => {
      await isolated(async () => {
        const root = conflicted();
        const h = await harness({ root, open: "sync.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        await h.keys("o", "t", "w");
        // Written again after w (an agent), markers and all.
        writeFileSync(join(root, "sync.md"), "start\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> z\nend\n");
        await h.keys("s");
        expect(await said(h, "sync.md changed since it was saved — x reads it again")).toBe(true);
        expect(git(root, "status", "--porcelain")).toBe("UU sync.md");
        // Yours holding marker lines of its own: settled and saved, they're still there, and s says so.
        const { root: own } = repo({ "a.md": "start\nold\nend\n" });
        git(own, "switch", "-q", "-c", "theirs");
        commit(own, "a.md", "start\ntheirs\nend\n");
        git(own, "switch", "-q", "main");
        commit(own, "a.md", "start\n<<<<<<< a\nx\n=======\ny\n>>>>>>> b\nend\n");
        git(own, "merge", "-q", "theirs");
        const o = await harness({ root: own, open: "a.md", width: 120, height: 50 });
        await o.app.git.refreshNow();
        await o.app.run("git.merge_screen");
        await o.keys("o", "w");
        expect(readFileSync(join(own, "a.md"), "utf8")).toContain("<<<<<<< HEAD");
        await o.keys("s");
        expect(await said(o, "a.md still has conflict markers: not staged — e edits them by hand")).toBe(true);
        expect(git(own, "status", "--porcelain")).toBe("UU a.md");
      });
    });

    test("a ======= line inside yours: o and w keep yours whole, as git's index has it (regression)", async () => {
      await isolated(async () => {
        // Yours made the line a heading, its underline seven long, where theirs changed it.
        const { root } = repo({ "a.md": "start\nold\nend\n" });
        git(root, "switch", "-q", "-c", "theirs");
        commit(root, "a.md", "start\ntheirs body\nend\n");
        git(root, "switch", "-q", "main");
        commit(root, "a.md", "start\nSummary\n=======\nours body\nend\n");
        git(root, "merge", "-q", "theirs");
        expect(readFileSync(join(root, "a.md"), "utf8")).toContain("Summary\n=======\nours body\n=======\ntheirs body");
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        expect(floatText(h)).toContain("Yours · HEAD, against the base");
        await h.keys("o", "w");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("start\nSummary\n=======\nours body\nend\n");
      });
    });

    test("a conflict its markers and git's index can't part: o, t and b refused, e edits it by hand (regression)", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "start\nold\nend\n" });
        git(root, "switch", "-q", "-c", "theirs");
        commit(root, "a.md", "start\ntheirs\nend\n");
        git(root, "switch", "-q", "main");
        commit(root, "a.md", "start\nmine\nend\n");
        git(root, "merge", "-q", "theirs");
        // A ======= line written into it since (an agent): neither stage has either way of reading it.
        const marked = "start\n<<<<<<< HEAD\nmine\n=======\ntheirs\n=======\nmore\n>>>>>>> theirs\nend\n";
        writeFileSync(join(root, "a.md"), marked);
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        expect(h.app.floating?.kind).toBe("merge");
        expect(floatText(h)).toContain("Ambiguous · more than one ======= line could part yours from theirs");
        for (const k of ["o", "t", "b", "shift+b"]) await h.keys(k);
        expect(
          await said(
            h,
            "conflict 1: more than one ======= line could part yours from theirs, and git's index doesn't say which — e edits it by hand",
          ),
        ).toBe(true);
        expect(floatText(h)).toContain("Conflict 1 of 1 · line 2 · not settled");
        await h.keys("w");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe(marked);
        await h.keys("e");
        expect(h.app.floating).toBeNull();
        expect(h.app.view!.buf.source).toBe(marked);
        expect(h.app.view!.buf.markers).toBe(true);
      });
    });

    test("a fenced example of git's markers in a note in conflict is text: kept byte for byte (regression)", async () => {
      await isolated(async () => {
        const example = "```\n<<<<<<< HEAD\nmine\n=======\nyours\n>>>>>>> branch\n```\n";
        const doc = (end: string) => `# How to settle a conflict\n\n${example}\n${end}\n`;
        const { root } = repo({ "a.md": doc("The end.") });
        git(root, "switch", "-q", "-c", "theirs");
        commit(root, "a.md", doc("Their end."));
        git(root, "switch", "-q", "main");
        commit(root, "a.md", doc("My end."));
        git(root, "merge", "-q", "theirs");
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        expect(floatText(h)).toContain("Conflict 1 of 1 · line 11");
        await h.keys("o", "w");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe(doc("My end."));
      });
    });

    test("the conflict prompt's (m)erge settles a conflict on the merge screen; esc goes back to the prompt", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "one\ntwo\nthree\n" });
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        const buf = h.app.view!.buf;
        buf.edit(buf.source.indexOf("two"), 3, "TWO");
        writeFileSync(join(root, "a.md"), "one\ntwo-t\nthree\n");
        h.app.saving.resolveConflict(buf, "m");
        expect(h.app.floating?.kind).toBe("merge");
        expect(floatText(h)).toContain("Yours · yours, against the base\n- two\n+ TWO");
        await h.keys("escape");
        expect(list(h).title).toBe("a.md changed on disk, and you have unsaved changes");
        await h.keys("m", "t", "w");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("one\ntwo-t\nthree\n");
        expect(buf.dirty).toBe(false);
        expect(await said(h, "merged and saved a.md")).toBe(true);
        expect(h.app.floating).toBeNull();
      });
    });
  });

  describe("pulling where both sides moved, and rebasing (GIT-D6)", () => {
    test("a merge settled on the merge screen, then concluded: the top bar says it; shift+r offers continue, abort", async () => {
      await isolated(async () => {
        const root = conflicted();
        const h = await harness({ root, open: "sync.md", width: 2 * stringWidth(root) + 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        await h.keys("o", "t", "w", "s");
        expect(await said(h, "sync.md staged, marked resolved — no conflict left: shift+r concludes the merge")).toBe(
          true,
        );
        // The top bar says a merge is under way; shift+r offers continue and abort (skip is a rebase's).
        expect(topRow(h.frame())).toContain("main merging");
        await h.app.run("git.rebase");
        expect(list(h).title).toBe("Merging theirs");
        expect(list(h).items.map((i) => i.label)).toEqual(["(c) Continue", "(a) Abort"]);
        await h.keys("escape");
        await h.app.run("git.continue");
        expect(await said(h, /^merged: the merge committed/)).toBe(true);
        expect(git(root, "log", "-1", "--format=%s")).toBe("Merge branch 'theirs'");
        expect(topRow(h.frame())).not.toContain("merging");
      });
    });

    test("a pull where both sides moved asks: merge, rebase or nothing — git's pull.rebase the default", async () => {
      await isolated(async () => {
        const { root, other } = repo({ "a.md": "a\n" }, true);
        commit(other, "b.md", "theirs\n");
        git(other, "push", "-q");
        commit(root, "c.md", "mine\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        const head = git(root, "rev-parse", "HEAD");
        await h.app.run("git.pull");
        expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
        expect(list(h).title).toBe("main and origin/main have both moved on — bring them together?");
        expect(list(h).selected).toBe(0);
        expect(list(h).items[0]!.detail).toContain("the default (pull.rebase)");
        // Nothing: as they were.
        await h.keys("n");
        expect(await said(h, "nothing pulled: main and origin/main as they were")).toBe(true);
        expect(git(root, "rev-parse", "HEAD")).toBe(head);
        // Merge: a merge commit with both.
        await h.app.run("git.pull");
        expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
        await h.keys("m");
        expect(await said(h, "pulled: merged origin/main into main — this vault isn't trusted, so no hook ran")).toBe(
          true,
        );
        expect(git(root, "log", "-1", "--format=%P").split(" ").length).toBe(2);
        expect(existsSync(join(root, "b.md"))).toBe(true);
        // pull.rebase true: rebase the default, and done.
        commit(other, "d.md", "theirs again\n");
        git(other, "push", "-q");
        commit(root, "e.md", "mine again\n");
        git(root, "config", "pull.rebase", "true");
        await h.app.run("git.pull");
        expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
        expect(list(h).selected).toBe(1);
        await h.keys("enter");
        expect(await said(h, /^pulled: main rebased onto origin\/main/)).toBe(true);
        expect(git(root, "log", "-1", "--format=%P").split(" ").length).toBe(1);
        expect(existsSync(join(root, "d.md"))).toBe(true);
      });
    });

    /** A branch behind main, both having changed the same line: a rebase onto main stops there. */
    const behind = () => {
      const { root } = repo({ "a.md": "one\ntwo\nthree\n", "b.md": "b\n" });
      git(root, "switch", "-q", "-c", "agent");
      commit(root, "a.md", "one\nagent's two\nthree\n", "Agent: two");
      commit(root, "b.md", "b, the agent's\n", "Agent: b");
      git(root, "switch", "-q", "main");
      commit(root, "a.md", "one\nmain's two\nthree\n", "Main: two");
      git(root, "switch", "-q", "agent");
      return root;
    };

    test("shift+r rebases onto the base: asked, stopped at a conflict, the merge screen, the top bar; continued", async () => {
      await isolated(async () => {
        const root = behind();
        const h = await harness({ root, open: "b.md", width: 2 * stringWidth(root) + 120, height: 50 });
        await h.app.run("git.view");
        await h.app.git.refreshNow();
        await h.keys("shift+r");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          label: "Rebase agent onto main? Its 2 commits replayed after main's 1 new.",
        });
        await h.keys("y");
        expect(await until(() => h.app.floating?.kind === "merge")).toBe(true);
        expect(
          await said(
            h,
            /^the rebase stopped at commit 1 of 2: 1 file in conflict \(a\.md\) — settle on the merge screen/,
          ),
        ).toBe(true);
        expect(floatText(h)).toContain("Rebasing: yours is what's rebased onto; theirs, the commit being replayed");
        expect(topRow(h.frame())).toContain("agent rebasing 1/2");
        // Settled, saved, staged; shift+r: continue.
        await h.keys("t", "w", "s");
        expect(await said(h, /^a\.md staged, marked resolved — no conflict left: shift\+r continues the rebase/)).toBe(
          true,
        );
        h.app.region = "sidebar";
        await h.keys("shift+r");
        expect(list(h).items.map((i) => i.label)).toEqual(["(c) Continue", "(s) Skip this commit", "(a) Abort"]);
        await h.keys("c");
        expect(await said(h, /^rebased: the rebase is done/)).toBe(true);
        expect(git(root, "log", "--format=%s", "main..agent")).toBe("Agent: b\nAgent: two");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("one\nagent's two\nthree\n");
        expect(topRow(h.frame())).not.toContain("rebasing");
      });
    });

    test("a rebase that stops while you type: the merge screen not opened over the text, x named (regression)", async () => {
      await isolated(async () => {
        const root = behind();
        const h = await harness({ root, open: "b.md", width: 120, height: 50 });
        await h.app.run("git.rebase");
        await h.keys("y");
        // Back to typing while git runs.
        await h.keys("i");
        expect(h.app.view!.insert).toBe(true);
        expect(
          await said(
            h,
            /^the rebase stopped at commit 1 of 2: 1 file in conflict \(a\.md\) — x in source control opens the merge screen \(:resolve\), s stages/,
          ),
        ).toBe(true);
        expect(h.app.floating).toBeNull();
        // The letters go into the note, none of them the merge screen's.
        await h.keys("t", "w", "s");
        expect(h.app.view!.buf.rel).toBe("b.md");
        expect(h.app.view!.buf.source).toStartWith("tws");
        expect(git(root, "status", "--porcelain")).toContain("UU a.md");
        // Typing done: x opens it.
        await h.keys("escape");
        await h.app.run("git.merge_screen");
        expect(h.app.floating?.kind).toBe("merge");
      });
    });

    test("a pull where both sides moved, while a question is open: said, not asked over it (regression)", async () => {
      await isolated(async () => {
        const { root, other } = repo({ "a.md": "a\n" }, true);
        commit(other, "b.md", "theirs\n");
        git(other, "push", "-q");
        commit(root, "c.md", "mine\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.pull");
        // A question of its own opened while git pulls: its letters aren't the pull's m, r and n.
        h.app.overlays.confirm("Something else?", () => {});
        expect(
          await said(
            h,
            "main and origin/main have both moved on — p in source control (:pull) asks how to bring them together",
          ),
        ).toBe(true);
        expect(h.app.overlay).toMatchObject({ kind: "prompt", label: "Something else?" });
      });
    });

    test("a rebase aborted, asked first: the branch as it was; again, the conflicting commit skipped", async () => {
      await isolated(async () => {
        const root = behind();
        const was = git(root, "rev-parse", "agent");
        const h = await harness({ root, open: "b.md", width: 120, height: 50 });
        await h.app.run("git.rebase");
        await h.keys("y");
        expect(await until(() => h.app.floating?.kind === "merge")).toBe(true);
        await h.keys("escape");
        // Asked first, as a rebase is: n leaves it under way; y gives it up.
        await h.app.run("git.abort");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          confirm: true,
          label: "Abort the rebase? agent goes back as it was before it, and what's settled so far is lost.",
        });
        await h.keys("n");
        expect(existsSync(join(root, ".git", "rebase-merge"))).toBe(true);
        expect(git(root, "status", "--porcelain")).toBe("UU a.md");
        await h.app.run("git.abort");
        await h.keys("y");
        expect(await said(h, "the rebase aborted: agent as it was — this vault isn't trusted, so no hook ran")).toBe(
          true,
        );
        expect(git(root, "rev-parse", "HEAD")).toBe(was);
        expect(git(root, "status", "--porcelain")).toBe("");
        await h.app.run("git.rebase");
        await h.keys("y");
        expect(await until(() => h.app.floating?.kind === "merge")).toBe(true);
        await h.keys("escape");
        // Continue refused while a file is in conflict.
        await h.app.run("git.continue");
        expect(await said(h, /^still in conflict: a\.md/)).toBe(true);
        await h.app.run("git.skip");
        expect(await said(h, /^rebased: the rebase is done, a commit skipped/)).toBe(true);
        expect(git(root, "log", "--format=%s", "main..agent")).toBe("Agent: b");
      });
    });

    test("a cherry-pick begun in a terminal, stopped at a conflict: named, settled on the merge screen, continued, aborted", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "one\ntwo\nthree\n", "b.md": "b\n" });
        git(root, "switch", "-q", "-c", "other");
        commit(root, "a.md", "one\nother's two\nthree\n", "Other: two");
        commit(root, "b.md", "b, other's\n", "Other: b");
        git(root, "switch", "-q", "main");
        commit(root, "a.md", "one\nmain's two\nthree\n", "Main: two");
        commit(root, "b.md", "b, main's\n", "Main: b");
        const was = git(root, "rev-parse", "HEAD");
        // Both of other's commits, in a terminal: it stops at the first.
        git(root, "cherry-pick", "other~1", "other");
        expect(git(root, "status", "--porcelain")).toBe("UU a.md");
        const h = await harness({ root, open: "a.md", width: 2 * stringWidth(root) + 120, height: 50 });
        await h.app.run("git.view");
        await h.app.git.refreshNow();
        expect(topRow(h.frame())).toContain("main cherry-picking");
        const ids = () => h.app.gitPanel.buttons().map((b) => b.id);
        expect(ids()).toEqual(expect.arrayContaining(["resolve", "continue", "skip", "abort"]));
        const desc = (id: string) => h.app.gitPanel.buttons().find((b) => b.id === id)?.desc;
        expect(desc("continue")).toBe("commits what's settled, and picks the next, if there's one");
        expect(desc("abort")).toBe("the branch back where it was before the cherry-pick");
        await h.app.run("git.rebase");
        expect(list(h).title).toBe('Cherry-picking "Other: two" — 1 file in conflict');
        expect(list(h).items.map((i) => i.label)).toEqual([
          "(x) Settle the conflicts",
          "(c) Continue",
          "(s) Skip this commit",
          "(a) Abort",
        ]);
        // x: the merge screen on it; settled, saved, staged.
        await h.keys("x");
        expect(h.app.floating?.kind).toBe("merge");
        await h.keys("t", "w", "s");
        expect(
          await said(h, "a.md staged, marked resolved — no conflict left: shift+r continues the cherry-pick"),
        ).toBe(true);
        // Continued: the first committed with its message, the second picked, stopped at its own conflict — the merge
        // screen opens on it, as a rebase's stop does.
        await h.app.run("git.continue");
        expect(
          await said(
            h,
            /^the cherry-pick stopped: 1 file in conflict \(b\.md\) — settle on the merge screen, s stages, then shift\+r continues/,
          ),
        ).toBe(true);
        expect(await until(() => h.app.floating?.kind === "merge")).toBe(true);
        expect(h.app.floating!.title).toBe("Merge — b.md");
        expect(git(root, "log", "-1", "--format=%s")).toBe("Other: two");
        // Aborted, asked first: main as it was before the series.
        await h.keys("escape");
        await h.app.run("git.abort");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          confirm: true,
          label: "Abort the cherry-pick? main goes back as it was before it, and what's settled so far is lost.",
        });
        await h.keys("y");
        expect(await said(h, /^the cherry-pick aborted: main as it was/)).toBe(true);
        expect(git(root, "rev-parse", "HEAD")).toBe(was);
        expect(git(root, "status", "--porcelain")).toBe("");
        expect(topRow(h.frame())).not.toContain("cherry-picking");
      });
    });

    test("a revert begun in a terminal, stopped at a conflict: named, settled, continued; another aborted", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "one\ntwo\nthree\n" });
        commit(root, "a.md", "one\nTWO\nthree\n", "Shout two");
        commit(root, "a.md", "one\nTWO, again\nthree\n", "Again");
        // Reverting the first, the line changed again since: a conflict.
        git(root, "revert", "--no-edit", "HEAD~1");
        expect(git(root, "status", "--porcelain")).toBe("UU a.md");
        const h = await harness({ root, open: "a.md", width: 2 * stringWidth(root) + 120, height: 50 });
        await h.app.git.refreshNow();
        expect(topRow(h.frame())).toContain("main reverting");
        await h.app.run("git.rebase");
        expect(list(h).title).toBe('Reverting "Shout two" — 1 file in conflict');
        expect(list(h).items.map((i) => i.label)).toContain("(s) Skip this commit");
        await h.keys("escape");
        await h.app.run("git.merge_screen");
        await h.keys("t", "w", "s");
        expect(await said(h, "a.md staged, marked resolved — no conflict left: shift+r continues the revert")).toBe(
          true,
        );
        await h.app.run("git.continue");
        expect(await said(h, /^reverted: the revert is done/)).toBe(true);
        expect(git(root, "log", "-1", "--format=%s")).toBe('Revert "Shout two"');
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("one\ntwo\nthree\n");
        // Another, aborted after asking: the branch as it was.
        const was = git(root, "rev-parse", "HEAD");
        git(root, "revert", "--no-edit", "HEAD~1");
        await h.app.git.refreshNow();
        expect(topRow(h.frame())).toContain("main reverting");
        await h.app.run("git.abort");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          label: "Abort the revert? main goes back as it was before it, and what's settled so far is lost.",
        });
        await h.keys("y");
        expect(await said(h, /^the revert aborted: main as it was/)).toBe(true);
        expect(git(root, "rev-parse", "HEAD")).toBe(was);
        expect(git(root, "status", "--porcelain")).toBe("");
      });
    });

    test("nothing under way: continue, skip and abort say so; shift+r on the base says there's nothing to rebase", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "a\n" });
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.continue");
        expect(await said(h, "no merge, rebase, cherry-pick or revert under way")).toBe(true);
        await h.app.run("git.skip");
        expect(await said(h, "no rebase, cherry-pick or revert under way: only they skip a commit")).toBe(true);
        await h.app.run("git.rebase");
        expect(await said(h, "main is the base: nothing to rebase it onto")).toBe(true);
      });
    });
  });

  describe("a rebase over files changed: stashed and put back, asked (D247)", () => {
    /** A branch behind main, main having changed b.md and the branch made c.md: its rebase meets no conflict. */
    const apart = () => {
      const { root } = repo({ "a.md": "a\n", "b.md": "b\n" });
      git(root, "switch", "-q", "-c", "agent");
      commit(root, "c.md", "c\n", "Agent: c");
      git(root, "switch", "-q", "main");
      commit(root, "b.md", "b, main's\n", "Main: b");
      git(root, "switch", "-q", "agent");
      return root;
    };
    /** A message matching `text` said after the first `from` of them. */
    const saidSince = (h: Harness, from: number, text: string) =>
      until(() => h.app.messages.slice(from).some((m) => m.text === text));
    const rebased = (root: string) => git(root, "merge-base", "main", "agent") === git(root, "rev-parse", "main");

    test("shift+r with files changed asks to stash them too: no, nothing happens; yes, rebased and put back", async () => {
      await isolated(async () => {
        const root = apart();
        const was = git(root, "rev-parse", "HEAD");
        // A change not staged and one staged; an untracked file isn't one git refuses over.
        writeFileSync(join(root, "a.md"), "a, mine\n");
        writeFileSync(join(root, "c.md"), "c, staged\n");
        git(root, "add", "c.md");
        writeFileSync(join(root, "u.md"), "untracked\n");
        const h = await harness({ root, open: "u.md", width: 120, height: 50 });
        await h.app.run("git.rebase");
        const asked = {
          kind: "prompt",
          confirm: true,
          label:
            "Stash your changes, rebase agent onto main, put them back? 2 files changed; its 1 commit replayed after main's 1 new.",
        };
        expect(h.app.overlay).toMatchObject(asked);
        // No: nothing happens — no rebase, no stash, the changes where they were.
        await h.keys("n");
        expect(h.app.overlay).toBeNull();
        expect(h.app.messages.some((m) => /rebasing|cannot rebase/.test(m.text))).toBe(false);
        expect(git(root, "rev-parse", "HEAD")).toBe(was);
        expect(git(root, "stash", "list")).toBe("");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a, mine\n");
        // Yes: rebased with them stashed, and they're back.
        await h.app.run("git.rebase");
        expect(h.app.overlay).toMatchObject(asked);
        await h.keys("y");
        expect(await said(h, "rebased agent onto main — this vault isn't trusted, so no hook ran")).toBe(true);
        expect(rebased(root)).toBe(true);
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a, mine\n");
        expect(readFileSync(join(root, "c.md"), "utf8")).toBe("c, staged\n");
        expect(readFileSync(join(root, "u.md"), "utf8")).toBe("untracked\n");
        expect(git(root, "stash", "list")).toBe("");
      });
    });

    test("shift+r on a clean tree, a note unsaved: saving it changes a file, so the stash is asked about then", async () => {
      await isolated(async () => {
        const root = apart();
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        const buf = h.app.view!.buf;
        buf.edit(buf.source.indexOf("a"), 1, "A");
        await h.app.run("git.rebase");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          label: "Rebase agent onto main? Its 1 commit replayed after main's 1 new.",
        });
        await h.keys("y");
        expect(list(h).title).toBe("Unsaved: a.md");
        expect(list(h).items[0]!.label).toBe("Save them, then rebase");
        await h.keys("enter");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          label: "Stash your changes, rebase agent onto main, put them back? 1 file changed.",
        });
        await h.keys("y");
        expect(await said(h, "rebased agent onto main — this vault isn't trusted, so no hook ran")).toBe(true);
        expect(rebased(root)).toBe(true);
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("A\n");
        expect(git(root, "stash", "list")).toBe("");
      });
    });

    test("shift+r: changes that conflict going back are kept in the stash, named, the file in conflict said", async () => {
      await isolated(async () => {
        const root = apart();
        // main changed b.md's line; so did you.
        writeFileSync(join(root, "b.md"), "b, mine\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        await h.app.run("git.rebase");
        expect(h.app.overlay).toMatchObject({
          label:
            "Stash your changes, rebase agent onto main, put them back? 1 file changed; its 1 commit replayed after main's 1 new.",
        });
        await h.keys("y");
        expect(
          await said(
            h,
            `rebased agent onto main — your changes conflicted going back, so git kept them in the stash, stash@{0} ("autostash"): 1 file in conflict (b.md) — x in source control settles it (:resolve), then drop the stash (z) — this vault isn't trusted, so no hook ran`,
          ),
        ).toBe(true);
        expect(rebased(root)).toBe(true);
        expect(git(root, "stash", "list", "--format=%gd %gs")).toBe("stash@{0} autostash");
        expect(git(root, "show", "stash@{0}:b.md")).toBe("b, mine");
        expect(git(root, "status", "--porcelain", "--untracked-files=no")).toBe("UU b.md");
      });
    });

    test("shift+r over untracked files alone: asked as ever, and git's to judge — its refusal said where one's in the way", async () => {
      await isolated(async () => {
        const root = apart();
        // main makes n.md; here an untracked n.md is in its way.
        git(root, "switch", "-q", "main");
        commit(root, "n.md", "main's n\n", "Main: n");
        git(root, "switch", "-q", "agent");
        writeFileSync(join(root, "n.md"), "my n\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        await h.app.run("git.rebase");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          label: "Rebase agent onto main? Its 1 commit replayed after main's 2 new.",
        });
        await h.keys("y");
        expect(
          await said(h, /^git: The following untracked working tree files would be overwritten by checkout: n\.md/),
        ).toBe(true);
        expect(rebased(root)).toBe(false);
        expect(readFileSync(join(root, "n.md"), "utf8")).toBe("my n\n");
        expect(git(root, "stash", "list")).toBe("");
      });
    });

    test("a pull's rebase with files changed asks to stash them: no, nothing; yes, rebased and put back; clean, not asked", async () => {
      await isolated(async () => {
        const { root, other } = repo({ "a.md": "a\n" }, true);
        commit(other, "b.md", "theirs\n");
        git(other, "push", "-q");
        commit(root, "c.md", "mine\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        const rebaseAnswer = async () => {
          await h.app.run("git.pull");
          expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
          await h.keys("r");
        };
        const done = "pulled: main rebased onto origin/main — this vault isn't trusted, so no hook ran";
        // A clean working tree: rebased at once, as ever.
        await rebaseAnswer();
        expect(h.app.overlay).toBeNull();
        expect(await said(h, done)).toBe(true);
        expect(existsSync(join(root, "b.md"))).toBe(true);
        // Both moved again, and a.md changed here: asked.
        commit(other, "d.md", "theirs again\n");
        git(other, "push", "-q");
        commit(root, "e.md", "mine again\n");
        writeFileSync(join(root, "a.md"), "a, mine\n");
        const head = git(root, "rev-parse", "HEAD");
        await rebaseAnswer();
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          confirm: true,
          label: "Stash your changes, rebase main onto origin/main, put them back? 1 file changed.",
        });
        // No: nothing pulled, the change where it was.
        await h.keys("n");
        expect(h.app.overlay).toBeNull();
        expect(git(root, "rev-parse", "HEAD")).toBe(head);
        expect(git(root, "stash", "list")).toBe("");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a, mine\n");
        // Yes: rebased with it stashed, and it's back.
        const from = h.app.messages.length;
        await rebaseAnswer();
        await h.keys("y");
        expect(await saidSince(h, from, done)).toBe(true);
        expect(existsSync(join(root, "d.md"))).toBe(true);
        expect(git(root, "log", "-1", "--format=%s")).toBe("e.md: mine again");
        expect(git(root, "log", "-1", "--format=%P").split(" ").length).toBe(1);
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a, mine\n");
        expect(git(root, "stash", "list")).toBe("");
      });
    });
  });
});
