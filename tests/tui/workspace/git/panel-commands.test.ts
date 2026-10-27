import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PanelRow } from "../../../../src/tui/workspace/git/views/panel/gitpanel.ts";
import { lineOf, offsetOf } from "../../../../src/tui/documents/editing/editing.ts";
import { makeSandbox, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("source control (26.2)", () => {
  const git = (cwd: string, ...args: string[]) =>
    new TextDecoder().decode(
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]).stdout,
    );
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  const repo = (files: Record<string, string>) => {
    const root = mkdtempSync(join(sandbox, "scm-"));
    mkdirSync(join(root, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(root, rel), text);
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    return git(root, "rev-parse", "HEAD") ? root : null;
  };
  /** The working tree's rows, the panel's first sections: their headings, files and changes, by label. */
  const work = (r: PanelRow) =>
    (r.kind === "heading" && ["conflicted", "staged", "unstaged", "untracked"].includes(r.section)) ||
    r.kind === "file" ||
    r.kind === "change";
  const labels = (h: Harness) =>
    h.app.gitPanel
      .rows()
      .filter(work)
      .map((r) => (r as { label: string }).label);
  /** The panel open on a repository's changes, git's answer in. */
  const opened = async (root: string) => {
    const h = await harness({ root, open: "a.md", width: 120, height: 40 });
    await h.app.run("git.view");
    await h.app.git.refreshNow();
    expect(h.app.leftView).toBe("git");
    return h;
  };
  /** The selection put on the working tree's row labelled so. */
  const select = (h: Harness, label: string) => {
    const i = h.app.gitPanel.rows().findIndex((r) => work(r) && (r as { label: string }).label === label);
    expect(i).toBeGreaterThanOrEqual(0);
    h.app.sidebar.selected = i;
  };
  /** The working tree's row selected, by its label. */
  const selected = (h: Harness) => (h.app.gitPanel.rows()[h.app.sidebar.selected] as { label?: string }).label;
  const settle = async (h: Harness, want: string[]) => {
    await h.app.git.refreshNow();
    expect(await until(() => (h.frame(), JSON.stringify(labels(h)) === JSON.stringify(want)))).toBe(true);
  };

  test("a file staged or unstaged stays selected where it went, so u or s takes it back; a heading's keys act on its files (regression)", async () => {
    // Found trying 26.2 live (2026-10-10): after s, the selection kept its row and landed on a heading; u there did
    // nothing, and said nothing.
    const root = repo({ ".gitignore": ".slipbox/\n", "a.md": "a\n", "b.md": "b\n" });
    if (!root) return;
    writeFileSync(join(root, "a.md"), "A\n");
    writeFileSync(join(root, "b.md"), "B\n");
    const h = await opened(root);
    expect(labels(h)).toEqual(["Changes (2)", "M a.md", "M b.md"]);
    select(h, "M b.md");
    await h.keys("s");
    await settle(h, ["Staged (1)", "M b.md", "Changes (1)", "M a.md"]);
    expect(await until(() => selected(h) === "M b.md" && h.app.sidebar.selected === 1)).toBe(true);
    await h.keys("u");
    await settle(h, ["Changes (2)", "M a.md", "M b.md"]);
    expect(git(root, "diff", "--cached", "--name-only")).toBe("");
    expect(await until(() => selected(h) === "M b.md")).toBe(true);
    // A heading (GIT-D8): u says there's nothing staged there; d asks to discard every file's changes (no, here); s
    // stages them all.
    h.app.sidebar.selected = 0;
    await h.keys("u");
    expect(h.app.messages.at(-1)?.text).toBe("nothing staged there");
    await h.keys("d");
    expect((h.app.overlay as { label?: string }).label).toBe(
      "Discard every change that isn't staged, in 2 files? They go back to what's staged; untracked files stay.",
    );
    await h.keys("n");
    expect(readFileSync(join(root, "a.md"), "utf8")).toBe("A\n");
    await h.keys("s");
    await settle(h, ["Staged (2)", "M a.md", "M b.md"]);
  });

  test("a file staged while git's answer to an earlier question is still out: git asked again, the file shown staged (regression)", async () => {
    // Found carrying the terminal tests over (TT-T6): git asked a moment before a stage (the watcher had news) answered
    // after it, and that older answer was the stage's — the file left under Changes, nothing asking again.
    const root = repo({ ".gitignore": ".slipbox/\n", "a.md": "a\n", "b.md": "b\n" });
    if (!root) return;
    writeFileSync(join(root, "b.md"), "B\n");
    const h = await opened(root);
    expect(labels(h)).toEqual(["Changes (1)", "M b.md"]);
    // The question out, asked before the stage: its answer, from before it, comes once the stage is done.
    const app = h.app.git as unknown as { asking: Promise<void> | null };
    let answer = () => {};
    app.asking = new Promise<void>((done) => {
      answer = done;
    }).finally(() => {
      app.asking = null;
    });
    select(h, "M b.md");
    await h.keys("s");
    expect(h.app.messages.at(-1)?.text).toBe("staged b.md");
    expect(git(root, "diff", "--cached", "--name-only")).toBe("b.md\n");
    answer();
    expect(await until(() => (h.frame(), JSON.stringify(labels(h)) === '["Staged (1)","M b.md"]'), 5000)).toBe(true);
  });

  test("its sections; a file opened up into its changes; one staged, one discarded; a file unstaged; all staged, unstaged", async () => {
    const root = repo({ ".gitignore": ".slipbox/\n", "a.md": "one\ntwo\nthree\n", "b.md": "b\n" });
    if (!root) return;
    writeFileSync(join(root, "a.md"), "ONE\ntwo\nTHREE\n");
    writeFileSync(join(root, "b.md"), "B\n");
    git(root, "add", "b.md");
    writeFileSync(join(root, "u.md"), "new\n");
    const h = await opened(root);
    expect(labels(h)).toEqual(["Staged (1)", "M b.md", "Changes (1)", "M a.md", "Untracked (1)", "? u.md"]);
    // Drawn: the letter in its colour.
    const c = h.canvas();
    const y = c.rows.findIndex((r) => r.join("").includes("M a.md"));
    expect(c.styles[y]![c.rows[y]!.join("").indexOf("M a.md")]!.fg).toBe(h.app.theme.roles.git_modified.fg!);
    // Moving goes through a section's heading too: its keys act on its files (GIT-D8).
    select(h, "M b.md");
    await h.keys("j");
    expect(selected(h)).toBe("Changes (1)");
    await h.keys("j");
    expect(selected(h)).toBe("M a.md");
    await h.keys("k", "k");
    expect(selected(h)).toBe("M b.md");
    // A staged file opened up: its change against the last commit; s on it says it's staged, u on a changed file says
    // there's nothing staged.
    await h.keys("l");
    expect(await until(() => (h.frame(), labels(h).includes("  1 change")))).toBe(true);
    expect(labels(h).slice(0, 3)).toEqual(["Staged (1)", "M b.md", "  1 change"]);
    select(h, "  1 change");
    await h.keys("s");
    expect(h.app.messages.at(-1)?.text).toBe("that change is staged already — u unstages it");
    // h from a change: back to its file, folded.
    await h.keys("h");
    expect(selected(h)).toBe("M b.md");
    expect(labels(h)).not.toContain("  1 change");
    select(h, "M a.md");
    await h.keys("u");
    expect(h.app.messages.at(-1)?.text).toBe("a.md has nothing staged");
    // The filter keeps files by path.
    await h.keys("/", "u");
    expect(labels(h)).toEqual(["Untracked (1)", "? u.md"]);
    await h.keys("escape");
    expect(labels(h)).toHaveLength(6);
    // Opened up: its two changes.
    select(h, "M a.md");
    await h.keys("l");
    expect(await until(() => (h.frame(), labels(h).length === 8))).toBe(true);
    expect(labels(h).slice(3, 6)).toEqual(["M a.md", "  1 change", "  3 change"]);
    // The first staged: a.md in both sections now.
    select(h, "  1 change");
    await h.keys("s");
    expect(h.app.messages.at(-1)?.text).toBe("staged a change of a.md");
    await settle(h, [
      "Staged (2)",
      "M a.md",
      "M b.md",
      "Changes (1)",
      "M a.md",
      "  3 change",
      "Untracked (1)",
      "? u.md",
    ]);
    expect(git(root, "show", ":a.md")).toBe("ONE\ntwo\nthree\n");
    // The other discarded, after asking: the file as staged.
    select(h, "  3 change");
    await h.keys("d");
    expect((h.app.overlay as { label?: string }).label).toBe(
      "Discard the change at line 3 of a.md? It goes back to what's staged.",
    );
    await h.keys("y");
    expect(readFileSync(join(root, "a.md"), "utf8")).toBe("ONE\ntwo\nthree\n");
    await settle(h, ["Staged (2)", "M a.md", "M b.md", "Untracked (1)", "? u.md"]);
    // b.md unstaged, then everything staged, then unstaged.
    select(h, "M b.md");
    await h.keys("u");
    await settle(h, ["Staged (1)", "M a.md", "Changes (1)", "M b.md", "Untracked (1)", "? u.md"]);
    await h.keys("a");
    await settle(h, ["Staged (3)", "M a.md", "M b.md", "A u.md"]);
    await h.keys("shift+u");
    await settle(h, ["Changes (2)", "M a.md", "M b.md", "Untracked (1)", "? u.md"]);
  });

  test("a file's diff shown by enter, esc back to the panel; o opens it at its change; discard a whole file, and an untracked one to the trash; unsaved refused", async () => {
    const root = repo({ ".gitignore": ".slipbox/\n", "a.md": "one\n\ntwo\n", "b.md": "b\n" });
    if (!root) return;
    writeFileSync(join(root, "a.md"), "one\n\nTWO\n");
    writeFileSync(join(root, "b.md"), "B\n");
    writeFileSync(join(root, "u.md"), "new\n");
    const h = await opened(root);
    select(h, "M a.md");
    await h.keys("enter");
    expect(await until(() => h.app.floating?.kind === "diff")).toBe(true);
    expect(h.app.floating!.title).toBe("a.md against what's staged — esc: source control");
    expect(h.app.floating!.view.buf.source).toContain("- two\n+ TWO");
    // A note's: its blocks before and after (GIT-D2), as every diff window draws one.
    const frames = h.app
      .currentLayout(h.app.floating!.view)
      .lines.map((l) => l.spans.map((s) => s.text).join(""))
      .filter((t) => t.startsWith("┌"));
    expect(frames.map((t) => t.split(" ")[1])).toEqual(["removed", "added"]);
    await h.keys("escape");
    expect([h.app.floating, h.app.region]).toEqual([null, "sidebar"]);
    select(h, "M a.md");
    await h.keys("o");
    expect(h.app.view!.buf.rel).toBe("a.md");
    expect(h.app.region).toBe("content");
    // At its change: line 3.
    if (!h.app.view!.source) await h.keys("ctrl+k");
    expect(await until(() => lineOf(h.app.view!, offsetOf(h.app, h.app.view!)) === 3)).toBe(true);
    // Unsaved: a discard refused.
    h.app.view!.buf.edit(0, 0, "x");
    h.app.panels.openLeftView("git", "cycle");
    h.app.region = "sidebar";
    select(h, "M a.md");
    await h.keys("d");
    expect(h.app.messages.at(-1)?.text).toBe("unsaved: a.md — save it first: git works on the file on disk");
    h.app.view!.buf.edit(0, 1, "");
    // b.md's changes discarded whole, after asking: open, it shows the file as it is now.
    h.app.openInNewTab("b.md");
    const bBuf = h.app.view!.buf;
    h.app.panels.openLeftView("git", "cycle");
    h.app.region = "sidebar";
    select(h, "M b.md");
    await h.keys("d", "y");
    expect(readFileSync(join(root, "b.md"), "utf8")).toBe("b\n");
    expect(bBuf.source).toBe("b\n");
    // u.md to the trash, as the explorer's delete.
    await settle(h, ["Changes (1)", "M a.md", "Untracked (1)", "? u.md"]);
    select(h, "? u.md");
    await h.keys("d", "y");
    expect(existsSync(join(root, "u.md"))).toBe(false);
    // Staged rows aren't discarded.
    git(root, "add", "a.md");
    await settle(h, ["Staged (1)", "M a.md"]);
    select(h, "M a.md");
    await h.keys("d");
    expect(h.app.messages.at(-1)?.text).toBe("staged: u unstages it first — discarding is for what isn't staged");
  });
});
