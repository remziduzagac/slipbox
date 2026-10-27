import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import { makeSandbox, harness, statusRow, topRow, whereNow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("a branch switch as one event (5.9)", () => {
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  /** A vault and its repository on main: a.md and b.md committed. */
  const repo = () => {
    const root = mkdtempSync(join(sandbox, "branch-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(
      join(root, ".slipbox", "config.toml"),
      `[vault]\nid = "br${root.slice(-6).replace(/[^a-z0-9]/gi, "")}"\nname = "br${root.slice(-6).replace(/[^a-z0-9]/gi, "")}"\n`,
    );
    writeFileSync(join(root, "a.md"), "# A\n\nThe first note, long enough to know again by its text.\n");
    writeFileSync(join(root, "b.md"), "# B\n");
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return null;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    return root;
  };
  const shown = (h: Harness) => h.app.tabs.map((t) => t.views.map((v) => v.buf.rel).join("|"));

  test("a branch's tab of a note only it has, back before the watcher says the note came: the vault's note once it does (#13)", async () => {
    const root = repo();
    if (!root) return;
    const on = (c: Config) => (c.ui.restore_session = true);
    expect(git(root, "checkout", "-q", "-b", "feat").exitCode).toBe(0);
    writeFileSync(join(root, "c.md"), "# C\n\nTo [a](a.md).\n");
    git(root, "add", "-A");
    expect(git(root, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "c").exitCode).toBe(0);
    const f = await harness({ root, open: "c.md", config: on });
    f.app.session.save("feat");
    expect(git(root, "checkout", "-q", "main").exitCode).toBe(0);
    const h = await harness({ root, open: "a.md", config: on });
    expect(h.app.git.checkHead()).toBe(false);
    expect(git(root, "checkout", "-q", "feat").exitCode).toBe(0);
    // HEAD seen first, as the feed sees it before the batch the checkout brings: feat's tab back, c.md no note yet.
    expect(h.app.git.checkHead()).toBe(true);
    const c = h.app.tabs[0]!.views[0]!.buf;
    expect([c.key, c.rel]).toEqual(["c.md", null]);
    // The watcher's batch: c.md came. The tab's note is the vault's, its link resolved.
    h.app.watch.applyChanges({ changes: [{ rel: "c.md", kind: "created", isNote: true }], rescan: false });
    expect(c.rel).toBe("c.md");
    expect(h.app.graph.linksOf("c.md").map((l) => [l.resolvedKind, l.path])).toEqual([["note", "a.md"]]);
  });

  test("each branch keeps its tabs: switching back brings them back; not over an unsaved note", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "a.md", config: (c) => (c.ui.restore_session = true) });
    expect(h.app.git.checkHead()).toBe(false);
    git(root, "checkout", "-q", "-b", "feat");
    expect(h.app.git.checkHead()).toBe(true);
    expect(h.app.messages.at(-1)!.text).toBe("switched to branch feat"); // none kept for feat yet: these stay
    await h.app.run("note.open b.md");
    expect(shown(h)).toEqual(["b.md"]);
    git(root, "checkout", "-q", "main");
    h.app.git.checkHead();
    expect(h.app.messages.at(-1)!.text).toBe("switched to branch main: its tabs are back");
    expect(shown(h)).toEqual(["a.md"]);
    git(root, "checkout", "-q", "feat");
    h.app.git.checkHead();
    expect(shown(h)).toEqual(["b.md"]);
    // Unsaved: what's open stays open.
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    git(root, "checkout", "-q", "main");
    h.app.git.checkHead();
    expect(h.app.messages.at(-1)!.text).toBe(
      "switched to branch main — unsaved notes stay open, so its tabs aren't brought back",
    );
    expect(shown(h)).toEqual(["b.md"]);
  });

  test("a merge or a pull on the branch is no switch: git's renames are evidence, said when there are some (20.21)", async () => {
    const root = repo();
    if (!root) return;
    writeFileSync(join(root, "b.md"), "# B\n\n[a](a.md)\n");
    git(root, "commit", "-q", "-am", "b links a");
    const h = await harness({ root, open: "b.md", config: (c) => (c.ui.restore_session = true) });
    h.app.git.checkHead();
    const said = h.app.messages.length;
    // A commit moving nothing: HEAD moved, nothing to say, the tabs as they are.
    writeFileSync(join(root, "a.md"), "# A\n\nThe first note, long enough to know again by its text.\nMore.\n");
    git(root, "commit", "-q", "-am", "more");
    expect(h.app.git.checkHead()).toBe(true);
    expect(h.app.messages.length).toBe(said);
    // As a pull brings it: a.md moved, and changed as it went; b.md's link left as it was.
    git(root, "checkout", "-q", "-b", "upstream");
    mkdirSync(join(root, "docs"));
    git(root, "mv", "a.md", "docs/a.md");
    writeFileSync(
      join(root, "docs", "a.md"),
      "# A\n\nThe first note, long enough to know again by its text.\nMore.\nAnd moved.\n",
    );
    git(root, "commit", "-q", "-am", "moved");
    git(root, "checkout", "-q", "main");
    h.app.git.checkHead(); // a switch, and back: nothing moved
    git(root, "merge", "-q", "--ff-only", "upstream");
    h.app.git.checkHead();
    expect(h.app.messages.at(-1)!.text).toBe(
      "branch main moved on: git moved 1 file — links to it say where (space v p); space l r relinks a note's",
    );
    expect(shown(h)).toEqual(["b.md"]);
    // Said with the graph caught up, the watcher's news not come yet (#40): space l r at once finds the link.
    expect(h.app.graph.notes.has("docs/a.md")).toBe(true);
    expect(h.app.graph.problems().broken).toContainEqual(
      expect.objectContaining({ from: "b.md", target: "a.md", moved: "docs/a.md" }),
    );
  });

  test("a repository made while it runs: the branch shows up (a regression: nothing redrew)", async () => {
    const root = mkdtempSync(join(sandbox, "late-git-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "a.md"), "# A\n");
    const h = await harness({ root, open: "a.md", width: 2 * stringWidth(root) + 80 });
    expect(topRow(h.frame())).not.toContain("⎇");
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    const later = Date.now() + 5_000; // the next look for a repository
    (h.app as unknown as { now: () => number }).now = () => later;
    expect(h.app.git.checkHead()).toBe(true); // news for the top bar (20.14)
    expect(topRow(h.frame())).toContain("⎇ main");
    expect(h.app.messages.some((m) => m.text.startsWith("switched"))).toBe(false); // not a switch
  });

  test("where the file is (VB-D3): the unnamed vault path shrinks on the permanent bar; the status line keeps the file; Elsewhere by its name", async () => {
    const { elsewhereAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const root = join(mkdtempSync(join(sandbox, "a-folder-with-a-rather-long-name-")), "experiment");
    mkdirSync(root);
    writeFileSync(join(root, "a.md"), "# A\n");
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    const h = await harness({ root, open: "a.md", width: 70 });
    expect(h.app.loc.name).toBeNull(); // no remote, no .slipbox/ name
    expect(whereNow(h)).toBe(`${root} │ main`);
    const top = topRow(h.frame());
    expect(top).toMatch(/◈ …[^ ]*\/experiment/); // branch gives way before location
    expect(top).not.toContain(root);
    expect(statusRow(h.frame())).not.toContain("experiment"); // said once
    // Room enough: the whole path.
    const wide = await harness({ root, open: "a.md", width: 2 * stringWidth(root) + 100 });
    expect(topRow(wide.frame())).toContain(`◈ ${root} │ ⎇ main`);
    expect(statusRow(wide.frame())).not.toContain(root);
    // Outside home and every vault: Elsewhere, no branch (VV-D3).
    const plain = mkdtempSync(join(sandbox, "plain-status-"));
    writeFileSync(join(plain, "p.md"), "# P\n");
    const p = await harness({ loc: elsewhereAt(plain), open: "p.md" });
    expect(whereNow(p)).toBe("Elsewhere");
  });

  test("started again, each branch opens on its own tabs", async () => {
    const root = repo();
    if (!root) return;
    const restore = (c: Config) => (c.ui.restore_session = true);
    const h = await harness({ root, open: "a.md", config: restore });
    git(root, "checkout", "-q", "-b", "feat");
    h.app.git.checkHead(); // main's tabs kept: a.md
    await h.app.run("note.open b.md");
    h.app.session.save(); // feat's: b.md
    expect(shown(await harness({ root, open: null, config: restore }))).toEqual(["b.md"]);
    git(root, "checkout", "-q", "main");
    expect(shown(await harness({ root, open: null, config: restore }))).toEqual(["a.md"]);
  });

  test("while git writes (its index lock) the watcher's news waits, then lands as one; a switch's files aren't moves", async () => {
    const root = repo();
    if (!root) return;
    // feat renames a.md to c.md: on main it's a.md, on feat c.md — the same text.
    git(root, "checkout", "-q", "-b", "feat");
    git(root, "mv", "a.md", "c.md");
    git(root, "commit", "-q", "-m", "rename");
    git(root, "checkout", "-q", "main");
    const h = await harness({ root, open: "b.md" });
    // git busy: held.
    writeFileSync(join(root, ".git", "index.lock"), "");
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    h.app.watch.receiveBatch({ changes: [{ rel: "b.md", kind: "changed", isNote: true }], rescan: false });
    expect(h.app.view!.buf.source).toBe("# B\n");
    rmSync(join(root, ".git", "index.lock"));
    for (let i = 0; i < 50 && h.app.view!.buf.source !== "# B, changed\n"; i++) await Bun.sleep(20);
    expect(h.app.view!.buf.source).toBe("# B, changed\n");
    git(root, "checkout", "-q", "--", "b.md");
    // The switch: a.md goes, c.md comes with its text — not a move, so no redirect.
    git(root, "checkout", "-q", "feat");
    h.app.watch.receiveBatch({
      changes: [
        { rel: "a.md", kind: "deleted", isNote: true },
        { rel: "c.md", kind: "created", isNote: true },
      ],
      rescan: false,
    });
    expect(h.app.graph.notes.has("c.md")).toBe(true);
    expect(h.app.graph.redirects!.follow("a.md")).toBeNull();
    // On one branch, the same thing is a move (17.12): a redirect.
    renameSync(join(root, "c.md"), join(root, "d.md"));
    const later = Date.now() + 10_000; // past the switch's settling
    (h.app as unknown as { now: () => number }).now = () => later;
    h.app.watch.receiveBatch({
      changes: [
        { rel: "c.md", kind: "deleted", isNote: true },
        { rel: "d.md", kind: "created", isNote: true },
      ],
      rescan: false,
    });
    expect(h.app.graph.redirects!.follow("c.md")).toBe("d.md");
  });
});
