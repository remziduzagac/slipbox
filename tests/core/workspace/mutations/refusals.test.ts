import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { applyPlan, planUndo } from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("renames refused before anything is written (cli.md, Renames)", () => {
  const root = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-mvref-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return dir;
  };
  test("a file where the target's folder would be: refused when planned; appeared since, nothing written", async () => {
    const { planNoteRename, RenameError } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const dir = root({ "a.md": "# A\n", "x.md": "# X\n", "index.md": "[a](a.md)\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(() => planNoteRename(g, "a.md", "x.md/a")).toThrow("x.md is a file: x.md/a can't go under it");
    const plan = planNoteRename(g, "a.md", "y/a");
    writeFileSync(join(dir, "y"), "now a file\n");
    expect(() => applyPlan(g, plan)).toThrow(RenameError);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](a.md)\n");
    expect(existsSync(join(dir, "a.md"))).toBe(true);
  });

  test("onto a different file whose name differs only in case: refused, both kept; a lone note's case-only rename works", async () => {
    const { planNoteRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const dir = root({
      "note.md": "# lower\n",
      "Note.md": "# UPPER\n",
      "solo.md": "# solo\n",
      "index.md": "[s](solo.md)\n",
    });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    // Two files whose names differ only in case: a filesystem that folds case (macOS's) can't hold both.
    if (readdirSync(dir).includes("note.md") && readdirSync(dir).includes("Note.md")) {
      expect(() => planNoteRename(g, "note.md", "Note")).toThrow("Note.md exists; not overwriting it");
      expect(readFileSync(join(dir, "note.md"), "utf8")).toBe("# lower\n");
      expect(readFileSync(join(dir, "Note.md"), "utf8")).toBe("# UPPER\n");
    }
    applyPlan(g, planNoteRename(g, "solo.md", "Solo"));
    expect(readdirSync(dir).filter((f) => f.toLowerCase() === "solo.md")).toEqual(["Solo.md"]);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[s](Solo.md)\n");
  });

  test("a folder's case-only rename works; onto a different existing folder, refused", async () => {
    const { planFolderMove } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const dir = root({ "notes/a.md": "# A\n", "other/b.md": "# B\n", "index.md": "[a](notes/a.md)\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(() => planFolderMove(g, "notes", "other")).toThrow("other exists; not overwriting it");
    applyPlan(g, planFolderMove(g, "notes", "Notes"));
    expect(existsSync(join(dir, "Notes", "a.md"))).toBe(true);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](Notes/a.md)\n");
  });

  test("a move typed as a path: a folder that's there, or a path ending in /, is into it, the name kept (DF-D4)", async () => {
    const { moveTarget, planFolderMove, planNoteRename } = await import(
      "../../../../src/core/workspace/mutations/rename/rename.ts"
    );
    const dir = root({
      "a.md": "# A\n",
      "ideas/b.md": "# B\n",
      "drafts/c.md": "# C\n",
      "index.md": "[a](a.md) [c](drafts/c.md)\n",
    });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(moveTarget(g, "a.md", "ideas/")).toBe("ideas/a.md");
    expect(moveTarget(g, "a.md", "ideas")).toBe("ideas/a.md"); // there already
    expect(moveTarget(g, "a.md", "later/")).toBe("later/a.md"); // made by the move
    expect(moveTarget(g, "a.md", "later")).toBe("later"); // no folder there: a rename, to later.md
    expect(moveTarget(g, "ideas/b.md", "/")).toBe("b.md"); // the root
    expect(moveTarget(g, "ideas/b.md", ".")).toBe("b.md");
    expect(moveTarget(g, "drafts", "ideas")).toBe("ideas/drafts");
    expect(moveTarget(g, "drafts", "archive/")).toBe("archive/drafts"); // made: never drafts renamed archive (DF-D21)
    expect(moveTarget(g, "drafts", "drafts")).toBe("drafts"); // itself: refused as already there, not into itself
    expect(moveTarget(g, "a.md", "../")).toBe("../a.md"); // out of the root: its plan refuses it
    applyPlan(g, planNoteRename(g, "a.md", moveTarget(g, "a.md", "ideas/")));
    expect(existsSync(join(dir, "ideas", "a.md"))).toBe(true);
    expect(existsSync(join(dir, "ideas.md"))).toBe(false);
    applyPlan(g, planFolderMove(g, "drafts", moveTarget(g, "drafts", "ideas")));
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](ideas/a.md) [c](ideas/drafts/c.md)\n");
  });

  test("a wikilinked note whose name has a colon: renamed, its links name it, no folder prefix (21.12)", async () => {
    const { planNoteRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const dir = root({ "notes/Meeting: Q3.md": "# Q3\n", "index.md": "See [[Meeting: Q3]].\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    applyPlan(g, planNoteRename(g, "notes/Meeting: Q3.md", "notes/Meeting: Q4"));
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("See [[Meeting: Q4]].\n");
  });

  test("a renamed folder's previous_names on several lines, or with a comment: kept one key, its id and the old name", async () => {
    const { planVaultRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const { readIdentity } = await import("../../../../src/core/workspace/vaults/registry.ts");
    const tag = (dir: string) => basename(dir).slice(-6).toLowerCase();
    for (const prev of ['previous_names = [\n  "older",\n]\n', 'previous_names = ["older"] # kept\n']) {
      const dir = root({ "a.md": "# A\n" });
      const cfg = join(dir, ".slipbox", "config.toml");
      writeFileSync(cfg, `[vault]\nid = "dd835b829b2153ca"\nname = "al${tag(dir)}"\n${prev}`);
      const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
      applyPlan(g, planVaultRename(g.loc, `be${tag(dir)}`));
      expect(readIdentity(cfg)).toMatchObject({
        id: "dd835b829b2153ca",
        name: `be${tag(dir)}`,
        previous_names: ["older", `al${tag(dir)}`],
      });
      expect(readFileSync(cfg, "utf8").match(/^previous_names/gm)).toHaveLength(1);
    }
    // A table the edit can't follow (`[ vault ]`): refused, nothing written.
    const dir = root({ "a.md": "# A\n" });
    const cfg = join(dir, ".slipbox", "config.toml");
    const text = `[ vault ]\nid = "dd835b829b2153cb"\nname = "al${tag(dir)}"\n`;
    writeFileSync(cfg, text);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(() => planVaultRename(g.loc, `be${tag(dir)}`)).toThrow("edit it by hand");
    expect(readFileSync(cfg, "utf8")).toBe(text);
  });

  test("a folder's naming, and its undo, leave .slipbox/config.toml out of the root's files", async () => {
    const { planVaultRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const { search } = await import("../../../../src/core/workspace/search/search.ts");
    const dir = root({ "a.md": "# A\n", ".slipbox/config.toml": "" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    applyPlan(g, planVaultRename(g.loc, `nm${basename(dir).slice(-6).toLowerCase()}`));
    expect(g.filePaths()).toEqual([]);
    expect(search(g, null, "config").hits.map((h) => h.path)).toEqual([]);
    applyPlan(g, planUndo(g));
    expect(g.filePaths()).toEqual([]);
  });
});
