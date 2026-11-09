import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { autoWhy, isNotesVault } from "../../../../src/core/workspace/vaults/notes-vault.ts";
import { listFolder } from "../../../../src/core/workspace/walk/listing.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

const git = (cwd: string, ...args: string[]) =>
  Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);

/** A folder at `dir`, its files written, `.slipbox/` in it when asked. */
function folder(dir: string, slipbox: boolean): string {
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "index.md"), "# Index\n");
  writeFileSync(join(dir, "src", "main.ts"), "export {};\n");
  if (slipbox) mkdirSync(join(dir, ".slipbox"));
  return dir;
}

/** A git repository at `dir`: `git init`, else (no git here) a `.git` folder, which is what the rule looks at. */
function repository(dir: string, slipbox: boolean): string {
  folder(dir, slipbox);
  if (git(dir, "init", "-q", "-b", "main").exitCode !== 0) mkdirSync(join(dir, ".git"));
  return dir;
}

describe("files.show auto: git at the vault's top decides, .slipbox/ doesn't (D272, #105)", () => {
  const base = () => mkdtempSync(join(tmpdir(), "slipbox-auto-"));

  test("a repository with .slipbox/ (named by slipbox init --name) is a repository: every text file", () => {
    const repo = repository(join(base(), "kestrel"), true);
    expect(autoWhy(repo)).toBe("git");
    expect(isNotesVault(repo)).toBe(false);
    // Listed a level at a time from outside, its folders say the same.
    expect(listFolder(repo, DEFAULT_CONFIG.walk, false).notes).toBe(false);
    expect(listFolder(join(repo, "src"), DEFAULT_CONFIG.walk, false).notes).toBe(false);
  });

  test("a repository without .slipbox/: every text file, as before", () => {
    const repo = repository(join(base(), "infra"), false);
    expect(autoWhy(repo)).toBe("git");
    expect(isNotesVault(repo)).toBe(false);
    expect(listFolder(join(repo, "src"), DEFAULT_CONFIG.walk, false).notes).toBe(false);
  });

  test("a notes vault inside a repository, no .git beside its .slipbox/: notes and data files", () => {
    const repo = repository(join(base(), "kestrel"), false);
    const notes = folder(join(repo, "notes"), true);
    expect(autoWhy(notes)).toBe("notes");
    expect(isNotesVault(notes)).toBe(true);
    expect(listFolder(notes, DEFAULT_CONFIG.walk, false).notes).toBe(true);
    expect(listFolder(join(notes, "src"), DEFAULT_CONFIG.walk, false).notes).toBe(true);
    // The repository around it is still one.
    expect(listFolder(join(repo, "src"), DEFAULT_CONFIG.walk, false).notes).toBe(false);
  });

  test("a notes folder outside git: notes and data files", () => {
    const notes = folder(join(base(), "notes"), true);
    expect(autoWhy(notes)).toBe("notes");
    expect(isNotesVault(notes)).toBe(true);
    expect(listFolder(join(notes, "src"), DEFAULT_CONFIG.walk, false).notes).toBe(true);
  });

  test("a plain folder, as Elsewhere lists one: neither, every text file", () => {
    const plain = folder(join(base(), "plain"), false);
    expect(autoWhy(plain)).toBeNull();
    expect(isNotesVault(plain)).toBe(false);
    expect(listFolder(plain, DEFAULT_CONFIG.walk, false).notes).toBe(false);
  });

  test("a git worktree, its top holding a .git file, .slipbox/ committed: a repository, every text file", () => {
    const repo = repository(join(base(), "kestrel"), true);
    writeFileSync(join(repo, ".slipbox", "config.toml"), 'name = "kestrel"\n');
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "first");
    const wt = join(repo, "..", "kestrel-feat");
    const made = git(repo, "worktree", "add", "-q", "-b", "feat", wt).exitCode === 0;
    // No git here: a worktree's top as git leaves it, a `.git` file pointing at its admin folder.
    if (!made) {
      folder(wt, true);
      writeFileSync(join(wt, ".git"), `gitdir: ${join(repo, ".git", "worktrees", "feat")}\n`);
    }
    expect(autoWhy(wt)).toBe("git");
    expect(isNotesVault(wt)).toBe(false);
    expect(listFolder(join(wt, "src"), DEFAULT_CONFIG.walk, false).notes).toBe(false);
  });
});
