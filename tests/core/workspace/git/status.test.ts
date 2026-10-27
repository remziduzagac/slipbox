import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("git: status, what changed, diffs, worktrees, conflicts (5.11–5.14)", () => {
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: JSON.parse(out.join("")) };
  };
  /** A repository whose vault is its docs/ folder, on main: a.md and gone.md; a branch feat checked out. */
  const repo = async () => {
    const top = mkdtempSync(join(tmpdir(), "slipbox-gitops-"));
    const root = join(top, "docs");
    mkdirSync(join(root, "notes"), { recursive: true });
    writeFileSync(join(root, "a.md"), "# A\n\none\ntwo\nthree\n");
    writeFileSync(join(root, "gone.md"), "# Gone\n");
    writeFileSync(join(root, "notes", "old.md"), "# Old name\n\nlong enough to be found again by git as a rename.\n");
    writeFileSync(join(top, "README.md"), "outside the vault\n");
    if (git(top, "init", "-q", "-b", "main").exitCode !== 0) return null;
    await cli(["init", root], root);
    git(top, "add", "-A");
    git(top, "commit", "-q", "-m", "start");
    git(top, "checkout", "-q", "-b", "feat");
    return { top, root };
  };

  test("git's status read: new, modified, renamed (its old path skipped), deleted, a merge's conflicts", async () => {
    const { parseStatus } = await import("../../../../src/core/workspace/git/branches/gitops.ts");
    const z = [
      "?? new.md",
      " M a.md",
      "R  to.md",
      "from.md",
      " D gone.md",
      "UU both.md",
      "AA added-twice.md",
      "M  staged.md",
      "",
    ].join("\0");
    expect([...parseStatus(z)]).toEqual([
      ["new.md", "new"],
      ["a.md", "modified"],
      ["to.md", "renamed"],
      ["gone.md", "deleted"],
      ["both.md", "conflict"],
      ["added-twice.md", "conflict"],
      ["staged.md", "modified"],
    ]);
  });

  test("a diff as rows, each at its line in the new text", async () => {
    const { diffRows } = await import("../../../../src/core/workspace/git/merge/merge.ts");
    expect(diffRows("a\nb\nc\nd\n", "a\nB\nc\nd\ne\n", 1)).toEqual([
      { kind: "@@", text: "line 2", line: 2 },
      { kind: " ", text: "a", line: 1 },
      { kind: "-", text: "b", line: 2 },
      { kind: "+", text: "B", line: 2 },
      { kind: " ", text: "c", line: 3 },
      { kind: " ", text: "d", line: 4 }, // the next change touches this one's context: one group
      { kind: "+", text: "e", line: 5 },
    ]);
    expect(diffRows("same\n", "same\n")).toEqual([]);
    // Far apart: a group each, each with its head.
    const far = diffRows(
      ["x", "1", "2", "3", "4", "5", "6", "7", "y"].join("\n"),
      ["X", "1", "2", "3", "4", "5", "6", "7", "Y"].join("\n"),
      1,
    );
    expect(far.filter((r) => r.kind === "@@")).toEqual([
      { kind: "@@", text: "line 1", line: 1 },
      { kind: "@@", text: "line 9", line: 9 },
    ]);
    // A line added above moves what follows: the second group's context is a line further down.
    const moved = diffRows(
      ["x", "1", "2", "3", "4", "5", "6", "7", "y"].join("\n"),
      ["x", "new", "1", "2", "3", "4", "5", "6", "7", "Y"].join("\n"),
      1,
    );
    expect(moved.filter((r) => r.text === "7")).toEqual([{ kind: " ", text: "7", line: 9 }]);
  });

  test("changed, diff, worktrees: this branch against main, committed or not, the vault's files only", async () => {
    const r = await repo();
    if (!r) return;
    writeFileSync(join(r.root, "a.md"), "# A\n\none\nTWO\nthree\n");
    git(r.top, "mv", "docs/notes/old.md", "docs/notes/new.md");
    rmSync(join(r.root, "gone.md"));
    git(r.top, "add", "-A");
    git(r.top, "commit", "-q", "-m", "on feat");
    writeFileSync(join(r.root, "b.md"), "# B, not committed\n");
    writeFileSync(join(r.top, "README.md"), "changed, but not the vault's\n");
    const c = (await cli(["changed"], r.root)).json.data;
    expect(c.base).toBe("main");
    expect(c.files).toEqual([
      { path: "a.md", state: "modified" },
      { path: "b.md", state: "new" },
      { path: "gone.md", state: "deleted" },
      { path: "notes/new.md", state: "renamed", from: "notes/old.md" },
    ]);
    const d = (await cli(["diff", "a.md"], r.root)).json.data;
    expect(d).toMatchObject({ path: "a.md", base: "main", new: false });
    expect(d.rows.filter((x: { kind: string }) => x.kind !== " ")).toEqual([
      { kind: "@@", text: "line 4", line: 4 },
      { kind: "-", text: "two", line: 4 },
      { kind: "+", text: "TWO", line: 4 },
    ]);
    expect((await cli(["diff", "b.md"], r.root)).json.data).toMatchObject({
      new: true,
      rows: [{ kind: "@@" }, { kind: "+", text: "# B, not committed", line: 1 }],
    });
    expect((await cli(["changed", "--base", "nope"], r.root)).code).toBe(3);
    // The worktrees: the main checkout first; this one marked.
    const wt = join(r.top, "..", `${basename(r.top)}-wt`);
    git(r.top, "worktree", "add", "-q", "-b", "other", wt);
    const list = (await cli(["worktrees"], r.root)).json.data;
    expect(
      list.map((w: { path: string; branch: string; main: boolean; current: boolean; root: string }) => [
        w.branch,
        w.main,
        w.current,
        w.root,
      ]),
    ).toEqual([
      ["feat", true, true, r.root],
      ["other", false, false, join(wt, "docs")],
    ]);
    // Outside git: said so, exit 3.
    const plain = mkdtempSync(join(tmpdir(), "slipbox-nogit-"));
    mkdirSync(join(plain, ".slipbox"));
    expect((await cli(["changed"], plain)).code).toBe(3);
  });

  test("diff: a byte order mark kept, line endings and a final line break changed: no line changed", async () => {
    const r = await repo();
    if (!r) return;
    git(r.top, "checkout", "-q", "main");
    writeFileSync(join(r.root, "m.md"), "\uFEFF# M\n\nbody\n");
    writeFileSync(join(r.root, "e.md"), "# E\n\nbody\n");
    git(r.top, "add", "-A");
    git(r.top, "commit", "-q", "-m", "m and e");
    git(r.top, "checkout", "-q", "feat");
    git(r.top, "merge", "-q", "main");
    expect((await cli(["diff", "m.md"], r.root)).json.data.rows).toEqual([]);
    writeFileSync(join(r.root, "e.md"), "# E\r\n\r\nbody");
    expect((await cli(["diff", "e.md"], r.root)).json.data.rows).toEqual([]);
  });

  test("a merge's conflicts are problems: each file, at its first marker", async () => {
    const r = await repo();
    if (!r) return;
    writeFileSync(join(r.root, "a.md"), "# A\n\none\nfeat's two\nthree\n");
    git(r.top, "commit", "-q", "-am", "feat");
    git(r.top, "checkout", "-q", "main");
    writeFileSync(join(r.root, "a.md"), "# A\n\none\nmain's two\nthree\n");
    git(r.top, "commit", "-q", "-am", "main");
    expect(git(r.top, "merge", "-q", "feat").exitCode).not.toBe(0); // a conflict
    const p = (await cli(["problems"], r.root)).json.data;
    expect(p.conflicts).toEqual([{ path: "a.md", line: 4 }]);
    expect((await cli(["problems"], r.root)).json.data.conflicts).toHaveLength(1);
  });
});
