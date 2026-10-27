import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { applyPlan, planHeadingRename, planUndo } from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("renaming a heading (11.9)", () => {
  test("its line and every link to it, in each link's form; undone like any rename", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-heading-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(
      join(dir, "b.md"),
      "# B\n\n## Old Name ##\n\ntext ^blk\n\nsee [Old Name](#old-name) and [up](#old-name)\n",
    );
    const a = [
      "[x](b.md#old-name) [shown](./b.md#old-name) ![e](b.md#old-name) [k](b.md#^blk) [o](b.md#other)",
      "[s](b.md#old-name) [t](b.md#Old%20Name) [u](<b.md#Old Name>) [v](b.md)",
      "",
    ].join("\n");
    writeFileSync(join(dir, "a.md"), a);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const plan = planHeadingRename(g, "b.md", "Old Name", "New Title");
    expect(plan).toMatchObject({ kind: "heading", from: "b.md#Old Name", to: "b.md#New Title", move: null });
    applyPlan(g, plan);
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe(
      [
        "[x](b.md#new-title) [shown](./b.md#new-title) ![e](b.md#new-title) [k](b.md#^blk) [o](b.md#other)",
        "[s](b.md#new-title) [t](b.md#New%20Title) [u](<b.md#New Title>) [v](b.md)",
        "",
      ].join("\n"),
    );
    expect(readFileSync(join(dir, "b.md"), "utf8")).toBe(
      "# B\n\n## New Title ##\n\ntext ^blk\n\nsee [Old Name](#new-title) and [up](#new-title)\n",
    );
    // Undone like any rename (7.4).
    applyPlan(g, planUndo(g));
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe(a);
  });

  test("refused: no such heading, two of its name, a name another heading has, the same name", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-heading-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "b.md"), "# B\n\n## Twice\n\n## Twice\n\n## One\n\n## Two\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const why = (heading: string, to: string) => {
      try {
        planHeadingRename(g, "b.md", heading, to);
        return "planned";
      } catch (err) {
        return (err as Error).message;
      }
    };
    expect(why("Nope", "X")).toBe('no heading "Nope" in b.md');
    expect(why("Twice", "X")).toBe('b.md has two headings "Twice": links can\'t tell them apart');
    expect(why("One", "two")).toBe('b.md has a heading "two" already');
    expect(why("One", "One")).toBe('the heading is "One" already');
    expect(why("one", "Uno")).toBe("planned"); // found by its name in any case, or its slug
  });
});

describe("review cycle 3 (core)", () => {
  /** A root (`.slipbox/` unless said) holding `files`, indexed. */
  const root = (files: Record<string, string>, marker = ".slipbox") => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-c3-"));
    mkdirSync(join(dir, marker));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return { dir, g: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true) };
  };
  const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");

  test("rename-heading on a setext heading rewrites it with its links; a heading not found writes nothing", async () => {
    const { RenameError } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const { dir, g } = root({
      "plan.md": "Plan\n====\n\nGoals {#g}\n-----\n",
      "x.md": "[a](plan.md#goals) [[plan#Goals]]\n",
    });
    applyPlan(g, planHeadingRename(g, "plan.md", "Goals", "Aims"));
    expect(read(dir, "plan.md")).toBe("Plan\n====\n\nAims {#g}\n-----\n");
    expect(read(dir, "x.md")).toBe("[a](plan.md#aims) [[plan#Aims]]\n");
    // The file changed under its index: the heading's line is no heading now — refused, nothing written.
    const { dir: d2, g: g2 } = root({ "plan.md": "# Plan\n\n## Goals\n", "x.md": "[a](plan.md#goals)\n" });
    writeFileSync(join(d2, "plan.md"), "# Plan\n\nGoals, no longer a heading\n");
    expect(() => planHeadingRename(g2, "plan.md", "Goals", "Aims")).toThrow(RenameError);
    expect(read(d2, "x.md")).toBe("[a](plan.md#goals)\n");
  });

  test("rename-heading keeps the heading's {#id}: links by the id still reach it", () => {
    const { dir, g } = root({
      "plan.md": "# Plan\n\n## Goals {#g} ##\n",
      "x.md": "[a](plan.md#goals) [b](plan.md#g)\n",
    });
    applyPlan(g, planHeadingRename(g, "plan.md", "Goals", "Aims"));
    expect(read(dir, "plan.md")).toBe("# Plan\n\n## Aims {#g} ##\n");
    expect(read(dir, "x.md")).toBe("[a](plan.md#aims) [b](plan.md#g)\n");
    const fresh = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(fresh.entry("plan.md")!.headings.find((h) => h.text === "Aims")).toMatchObject({ id: "g" });
  });

  test("rename-heading rewrites the note's own links to it by its path or name, not only its anchors", () => {
    const { dir, g } = root({ "plan.md": "[self](plan.md#goals) [[plan#Goals]] [[#Goals]]\n\n## Goals\n" });
    applyPlan(g, planHeadingRename(g, "plan.md", "Goals", "Aims"));
    expect(read(dir, "plan.md")).toBe("[self](plan.md#aims) [[plan#Aims]] [[#Aims]]\n\n## Aims\n");
  });
});
