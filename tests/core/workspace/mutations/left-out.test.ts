// What the walk leaves out, inside the vault (D278): moved, renamed, copied and deleted as plainly as it is — nothing
// of it rewritten, indexed where it goes only where the walk takes it, and nothing indexed leaving the index that way.

import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { walkLeavesOut } from "../../../../src/core/workspace/graph/reach/files.ts";
import { copyPath, restorePath, trashPath } from "../../../../src/core/workspace/mutations/files.ts";
import {
  applyPlan,
  planFolderMove,
  planNoteRename,
  planUndo,
} from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

let made = 0;
/** A vault: `tmp/` and `node_modules/` ignored, a hidden `.drafts/`, `sub/` a vault of its own inside `tmp/`. */
function vault(extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), `slipbox-leftout-${++made}-`));
  const files: Record<string, string> = {
    ".gitignore": "tmp/\nnode_modules/\n",
    "notes/x.md": "# X\n",
    "tmp/a.md": "# A\n\n[x](../notes/x.md)\n",
    "tmp/deep/b.md": "# B\n",
    "tmp/sub/.slipbox/config.toml": "",
    "tmp/sub/s.md": "# S\n",
    "node_modules/p/n.md": "# N\n",
    ".drafts/d.md": "# D\n",
    ...extra,
  };
  mkdirSync(join(dir, ".slipbox"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  const loc = locateVault({ root: dir });
  return { dir, loc, g: openGraph(loc, DEFAULT_CONFIG, false) };
}
const refused = (f: () => unknown): string | null => {
  try {
    f();
  } catch (err) {
    return (err as Error).message;
  }
  return null;
};

describe("what the walk leaves out, inside the vault (D278)", () => {
  test("why the walk leaves a path out: the first folder on its way, a vault of its own there, null where it walks", () => {
    const { g } = vault({ "tmp/clone/.git/HEAD": "ref\n" });
    expect(walkLeavesOut(g, "tmp/a.md")).toBe(".gitignore");
    expect(walkLeavesOut(g, "tmp/deep", true)).toBe(".gitignore");
    expect(walkLeavesOut(g, "node_modules/p/n.md")).toBe("busy folder");
    expect(walkLeavesOut(g, ".drafts/d.md")).toBe("hidden");
    expect(walkLeavesOut(g, ".slipbox/config.toml")).toBe("always skipped");
    // A vault of its own in what's ignored, or a clone there: another vault's, whatever leaves it out besides.
    expect(walkLeavesOut(g, "tmp/sub/s.md")).toBe("nested vault");
    expect(walkLeavesOut(g, "tmp/clone", true)).toBe("nested vault");
    expect(walkLeavesOut(g, "notes/x.md")).toBeNull();
    expect(walkLeavesOut(g, "notes/new/later.md")).toBeNull(); // not there yet: the walk would take it
  });

  test("an ignored folder renamed to a name the walk takes: a plain move, its notes indexed, said; undone, none left behind", () => {
    const { dir, g } = vault();
    expect(g.notes.has("tmp/deep/b.md")).toBe(false);
    const plan = planFolderMove(g, "tmp/deep", "deep");
    expect(plan).toMatchObject({ kind: "folder", from: "tmp/deep", to: "deep", files: [], moves: [], comesIn: true });
    applyPlan(g, plan);
    expect(existsSync(join(dir, "deep", "b.md"))).toBe(true);
    expect(g.notes.has("deep/b.md")).toBe(true);
    expect(g.dirs).toContain("deep");
    // Undone: moved back, the index walked again — no note of it left where it went.
    applyPlan(g, planUndo(g));
    expect(existsSync(join(dir, "tmp", "deep", "b.md"))).toBe(true);
    expect(g.notes.has("deep/b.md")).toBe(false);
  });

  test("renamed where the walk leaves it out too — ignored, busy, hidden, always skipped: moved, never indexed", () => {
    const { dir, g } = vault();
    for (const [from, to] of [
      ["tmp/a.md", "tmp/a2.md"],
      ["node_modules/p/n.md", "node_modules/p/m.md"],
      [".drafts/d.md", ".drafts/e.md"],
      ["tmp/deep/b.md", ".slipbox/b.md"],
    ] as const) {
      const plan = planNoteRename(g, from, to, { own: true });
      expect(plan.comesIn).toBeUndefined();
      applyPlan(g, plan);
      expect(existsSync(join(dir, to))).toBe(true);
      expect(g.notes.has(to)).toBe(false);
    }
    // The command line keeps out of slipbox's and git's own folders; the explorer's `own` goes there.
    expect(refused(() => planNoteRename(g, ".slipbox/b.md", ".slipbox/c.md"))).toBe(
      ".slipbox/b.md: slipbox's and git's own folders aren't notes",
    );
    expect(refused(() => planNoteRename(g, "tmp/a2.md", ".git/a.md"))).toBe(
      ".git/a.md: slipbox's and git's own folders aren't notes",
    );
    // A folder too, nothing of it in the index.
    applyPlan(g, planFolderMove(g, "node_modules/p", "node_modules/q"));
    expect(existsSync(join(dir, "node_modules", "q", "m.md"))).toBe(true);
    expect(g.dirs).not.toContain("node_modules/q");
  });

  test("nothing of it rewritten: its own links stay as written; an indexed note is still refused where the walk never goes", () => {
    const { dir, g } = vault({ "node_modules/p/c.md": "# C\n\n[x](../../notes/x.md)\n" });
    const plan = planNoteRename(g, "node_modules/p/c.md", "notes/c.md");
    expect(plan).toMatchObject({ files: [], comesIn: true });
    applyPlan(g, plan);
    expect(readFileSync(join(dir, "notes", "c.md"), "utf8")).toBe("# C\n\n[x](../../notes/x.md)\n");
    expect(g.notes.has("notes/c.md")).toBe(true);
    expect(refused(() => planNoteRename(g, "notes/x.md", "node_modules/p/x.md"))).toBe(
      "node_modules/p/x.md: node_modules/ is a busy folder (git ignores it), which the vault doesn't index",
    );
    expect(refused(() => planNoteRename(g, "notes/x.md", ".drafts/x.md"))).toBe(
      ".drafts/x.md: the walk leaves hidden folders out",
    );
  });

  test("refused as before: another vault's in what's ignored, a second name through a link, a link the walk didn't take", () => {
    const { dir, g } = vault();
    expect(refused(() => planNoteRename(g, "tmp/sub/s.md", "tmp/sub/t.md"))).toBe(
      `no note or file tmp/sub/s.md in ${dir}`,
    );
    expect(refused(() => planFolderMove(g, "tmp/sub", "tmp/sub2"))).toBe(`no folder tmp/sub in ${dir}`);
    symlinkSync(join(dir, "notes"), join(dir, "tmp", "second"));
    expect(refused(() => planNoteRename(g, "tmp/second/x.md", "tmp/second/y.md"))).toBe(
      "tmp/second/x.md is reached through a link (tmp/second): move it where it is",
    );
    expect(existsSync(join(dir, "notes", "x.md"))).toBe(true);
    // A link to a folder the walk didn't go through (VV-D6): not this vault's to move.
    const away = mkdtempSync(join(tmpdir(), "slipbox-leftout-away-"));
    symlinkSync(away, join(dir, "away"));
    const again = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(again.skipped.some((s) => s.rel === "away" && s.link)).toBe(true);
    expect(refused(() => planFolderMove(again, "away", "away2"))).toBe(`no folder away in ${dir}`);
  });

  test("a left-out folder holding a note a link reached keeps today's targets: nothing indexed leaves the index", () => {
    const { g } = vault({ "notes/y.md": "# Y\n\n[d](../.drafts/d.md)\n" });
    expect(g.notes.has(".drafts/d.md")).toBe(true); // reached (20.8)
    expect(refused(() => planFolderMove(g, ".drafts", ".drafts2"))).toBe(
      ".drafts2: the walk leaves hidden folders out",
    );
    expect(planFolderMove(g, ".drafts", "drafts")).toMatchObject({
      comesIn: true,
      moves: [[".drafts/d.md", "drafts/d.md"]],
    });
  });

  test("copied and deleted as any: slipbox's and git's own, a busy folder's, never indexed where the walk leaves them out", () => {
    const { dir, loc, g } = vault({ ".git/HEAD": "ref: refs/heads/main\n", ".slipbox/keep.txt": "kept\n" });
    expect(refused(() => copyPath(g, ".git/HEAD", ".git/HEAD2"))).toBe(
      ".git/HEAD: slipbox's and git's own folders aren't notes",
    );
    expect(copyPath(g, ".git/HEAD", ".git/HEAD2", { own: true }).to).toBe(".git/HEAD2");
    expect(g.known(".git/HEAD2")).toBe(false);
    expect(copyPath(g, "node_modules/p/n.md", "node_modules/p/n2.md").to).toBe("node_modules/p/n2.md");
    expect(g.notes.has("node_modules/p/n2.md")).toBe(false);
    expect(copyPath(g, "tmp/deep/b.md", "notes/b.md").to).toBe("notes/b.md");
    expect(g.notes.has("notes/b.md")).toBe(true);
    // An indexed note into a busy folder: refused, as ever.
    expect(refused(() => copyPath(g, "notes/x.md", "node_modules/p/x.md"))).toBe(
      "node_modules/p/x.md: node_modules/ is a busy folder (git ignores it), which the vault doesn't index",
    );
    expect(refused(() => trashPath(g, loc, ".slipbox/keep.txt"))).toBe(
      ".slipbox/keep.txt: slipbox's and git's own folders aren't notes",
    );
    const t = trashPath(g, loc, ".slipbox/keep.txt", undefined, { own: true });
    expect(existsSync(join(dir, ".slipbox", "keep.txt"))).toBe(false);
    restorePath(g, loc, t.id);
    expect(readFileSync(join(dir, ".slipbox", "keep.txt"), "utf8")).toBe("kept\n");
  });
});
