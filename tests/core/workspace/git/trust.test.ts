import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("git in a root you don't trust (23.6)", () => {
  // A repository whose .git/config and .gitattributes name programs — as one copied or unpacked brings
  // them (git clone doesn't) — each leaving a mark when git runs it.
  const hostile = () => {
    const top = mkdtempSync(join(tmpdir(), "slipbox-hostile-git-"));
    const g = (...args: string[]) =>
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", top, ...args]);
    if (g("init", "-q", "-b", "main").exitCode !== 0) return null;
    writeFileSync(join(top, "a.md"), "# A\n");
    writeFileSync(join(top, ".gitattributes"), "*.md filter=evil diff=evil merge=evil\n");
    g("add", "-A");
    g("commit", "-q", "-m", "files");
    const mark = (what: string) => `sh -c 'touch ${join(top, `${what}-ran`)}; cat'`;
    g("config", "filter.evil.clean", mark("clean"));
    g("config", "diff.evil.textconv", `sh -c 'touch ${join(top, "textconv-ran")}; cat "$1"' --`);
    g("config", "core.fsmonitor", `sh -c 'touch ${join(top, "fsmonitor-ran")}'`);
    writeFileSync(join(top, ".git", "hooks", "post-index-change"), `#!/bin/sh\ntouch ${join(top, "hook-ran")}\n`);
    chmodSync(join(top, ".git", "hooks", "post-index-change"), 0o755);
    writeFileSync(join(top, "a.md"), "# A\n\nchanged\n");
    return top;
  };
  const marks = (top: string) =>
    ["clean", "textconv", "fsmonitor", "hook"].filter((m) => existsSync(join(top, `${m}-ran`)));

  test("status, what changed, a file as a branch has it: nothing the repository names runs", async () => {
    const top = hostile();
    if (!top) return; // no git here
    const { statusOf, changedSince, showAt } = await import("../../../../src/core/workspace/git/branches/gitops.ts");
    const c = { root: top };
    expect(statusOf(c)!.get("a.md")).toBe("modified");
    expect(changedSince(c, "main")).not.toBeNull();
    expect(showAt(c, "main", "a.md")).toBe("# A\n");
    expect(marks(top)).toEqual([]);
  });

  test("a git version that can't be read is guarded all the same — never taken, and kept, for one too old (regression)", () => {
    // Found 2026-10-10: `git --version` failing once (a start that failed on a machine short of memory) left the
    // attributes unguarded for the rest of the process, and a repository's clean filter ran.
    const top = hostile();
    if (!top) return; // no git here
    const noGit = mkdtempSync(join(tmpdir(), "slipbox-nogit-"));
    const gitops = join(import.meta.dir, "../../../..", "src", "core", "workspace", "git", "branches", "gitops.ts");
    const script = `
      const { gitArgs, statusOf } = await import(${JSON.stringify(gitops)});
      const real = process.env.PATH;
      process.env.PATH = ${JSON.stringify(noGit)};
      const blind = gitArgs(${JSON.stringify(top)}, ["status"]).some((a) => a.startsWith("--attr-source="));
      process.env.PATH = real;
      console.log(JSON.stringify({ blind, status: statusOf({ root: ${JSON.stringify(top)} })?.get("a.md") ?? null }));
    `;
    const r = Bun.spawnSync([process.execPath, "-e", script], { cwd: tmpdir(), stderr: "pipe" });
    expect(r.stderr.toString()).toBe("");
    expect(JSON.parse(r.stdout.toString())).toEqual({ blind: true, status: "modified" });
    expect(marks(top)).toEqual([]);
  });

  test("in a root you trust, git as the repository has it: its filters and hooks run", async () => {
    const top = hostile();
    if (!top) return;
    const { statusOf, changedSince } = await import("../../../../src/core/workspace/git/branches/gitops.ts");
    const { setTrustedRoots } = await import("../../../../src/core/workspace/vaults/trust.ts");
    setTrustedRoots([top]);
    try {
      statusOf({ root: top });
      changedSince({ root: top }, "main");
      expect(marks(top).length).toBeGreaterThan(0);
    } finally {
      setTrustedRoots([]);
    }
  });
});
