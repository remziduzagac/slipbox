// Each mechanism test file owns its environment; repositories and IO stay inside that sandbox.
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { checkoutOf } from "../../../../../src/core/workspace/git/git.ts";
import { vaultAt } from "../../../../../src/core/workspace/vaults/vault.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

export function makeGitFixtures() {
  const sandbox = makeCoreSandbox();
  const tree = () => realpathSync(mkdtempSync(join(sandbox, "git-")));
  const git = (root: string, ...args: string[]) => {
    const result = Bun.spawnSync(["git", "-C", root, ...args]);
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  const repo = () => {
    const root = tree();
    mkdirSync(join(root, ".slipbox"));
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.name", "Tests");
    git(root, "config", "user.email", "tests@example.invalid");
    writeFileSync(join(root, "a.md"), "# A\n");
    git(root, "add", "a.md");
    git(root, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-qm", "initial");
    git(root, "switch", "-qc", "feature");
    const config = structuredClone(DEFAULT_CONFIG);
    config.git.base = "main";
    config.git.bases = [];
    return { root, checkout: checkoutOf(root)!, loc: vaultAt(root), config };
  };
  return { sandbox, tree, git, repo };
}
