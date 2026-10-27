import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("a branch switch (5.9)", () => {
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
  const repo = async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-branch-"));
    writeFileSync(join(root, "a.md"), "# A\n\nA note long enough to be known again by its text alone.\n");
    writeFileSync(join(root, "index.md"), "[[a]]\n");
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return null;
    await cli(["init", root], root);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    return root;
  };

  test("the index written on another branch: what one branch has and the other hasn't wasn't moved", async () => {
    const root = await repo();
    if (!root) return;
    git(root, "checkout", "-q", "-b", "feat");
    git(root, "mv", "a.md", "c.md");
    git(root, "commit", "-q", "-m", "rename");
    git(root, "checkout", "-q", "main");
    await cli(["ls"], root); // the index, written on main
    git(root, "checkout", "-q", "feat"); // nothing ran meanwhile
    const g = openGraph(locateVault({ root }), DEFAULT_CONFIG, true);
    expect(g.notes.has("c.md")).toBe(true);
    expect(g.redirects!.follow("a.md")).toBeNull();
    // On one branch, the same thing is a move (17.12).
    await cli(["ls"], root); // the index, written on feat
    renameSync(join(root, "c.md"), join(root, "d.md"));
    expect(openGraph(locateVault({ root }), DEFAULT_CONFIG, true).redirects!.follow("c.md")).toBe("d.md");
  });

  test("undo is the branch's: a rename made on another is undone there, not here", async () => {
    const root = await repo();
    if (!root) return;
    git(root, "checkout", "-q", "-b", "feat");
    expect((await cli(["mv", "a", "b"], root)).code).toBe(0);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "renamed on feat");
    git(root, "checkout", "-q", "main");
    const here = await cli(["undo"], root);
    expect(here.code).toBe(3);
    expect(here.json.error.message).toBe("nothing to undo on branch main: the last rename was made on branch feat");
    git(root, "checkout", "-q", "feat");
    expect((await cli(["undo"], root)).json.data).toMatchObject({ kind: "note", from: "b.md", to: "a.md" });
    expect(readFileSync(join(root, "index.md"), "utf8")).toBe("[[a]]\n");
  });
});
