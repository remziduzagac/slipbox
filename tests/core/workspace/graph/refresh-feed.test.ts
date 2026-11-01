import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { cacheDir } from "../../../../src/core/foundation/platform/paths.ts";
import { Graph, type Retarget } from "../../../../src/core/workspace/graph/graph.ts";
import { rootAt } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

const sandbox = makeCoreSandbox();
let made = 0;
function fixture(files: Record<string, string>) {
  const root = join(sandbox, `vault-${++made}`);
  mkdirSync(join(root, ".slipbox"), { recursive: true });
  mkdirSync(join(root, ".git"));
  const write = (rel: string, text: string) => {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
    const stat = statSync(abs);
    return { rel, abs, size: stat.size, mtimeMs: stat.mtimeMs };
  };
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  return { graph: new Graph(rootAt(root), structuredClone(DEFAULT_CONFIG)), write };
}

test("build keeps the authoritative maps and publishes assets before the completed lazy index", () => {
  const { graph } = fixture({ "a.md": "# A\n", "b.md": "# B\n", "image.png": "image" });
  const { notes, assets, reached } = graph;
  const events: unknown[] = [];
  graph.onChange(() => {
    throw new Error("listener");
  });
  const stopChange = graph.onChange((change) => events.push([change, graph.generation, notes.size]));
  graph.onBuild(() => {
    throw new Error("listener");
  });
  const stopBuild = graph.onBuild(() => events.push(["built", graph.generation, graph.pendingCount, graph.builds]));
  expect(graph.build(false, "lazy")).toBe(graph);
  expect(graph.notes).toBe(notes);
  expect(graph.assets).toBe(assets);
  expect(graph.reached).toBe(reached);
  expect(graph.index.resolveWiki("a", "b.md")).toMatchObject({ path: "a.md" });
  expect(graph.index.resolveWiki("b", "a.md")).toMatchObject({ path: "b.md" });
  expect(events).toEqual([
    [{ kind: "changed", path: "image.png" }, 1, 0],
    ["built", 2, 2, 1],
  ]);
  stopChange();
  stopBuild();
  graph.build(false, "lazy");
  expect(events).toHaveLength(2);
  expect(graph.builds).toBe(2);
});

test("rebuild reapplies unsaved text over fresh disk facts before publication and persists only the underlay", () => {
  const { graph, write } = fixture({ "a.md": "# Disk\n\n#old\n", "target.md": "# Target\n" });
  graph.build(true);
  graph.overlay("a.md", "# Live\n\n#local [target](target.md)\n");
  const generation = graph.generation;
  const notes = graph.notes;
  expect(graph.tags()).toEqual([{ tag: "local", count: 1 }]);
  expect(graph.backlinks("target.md").map((row) => row.from)).toEqual(["a.md"]);
  const events: unknown[] = [];
  graph.onChange((change) => events.push(change));
  graph.onBuild(() => events.push([graph.generation, graph.entry("a.md")?.title, graph.pendingCount]));
  write("a.md", "# New disk title\n\n#fresh\n");
  graph.build(true, "lazy");
  expect(graph.notes).toBe(notes);
  expect(events).toEqual([[generation + 3, "Live", 0]]);
  expect(graph.overlaid("a.md")).toBe(true);
  expect(graph.tags()).toEqual([{ tag: "local", count: 1 }]);
  expect(graph.backlinks("target.md").map((row) => row.from)).toEqual(["a.md"]);
  const stored = JSON.parse(readFileSync(join(cacheDir(graph.loc), "index.json"), "utf8"));
  expect(stored.entries["a.md"].title).toBe("New disk title");
  expect(stored.entries["a.md"].tags).toEqual(["fresh"]);
  expect(graph.indexBehind).toBe(false);
  graph.overlay("a.md", null);
  expect(graph.generation).toBe(generation + 4);
  expect(graph.entry("a.md")?.title).toBe("New disk title");
  expect(graph.tags()).toEqual([{ tag: "fresh", count: 1 }]);
  expect(graph.backlinks("target.md")).toEqual([]);
});

test("incremental changes invalidate answers before file events and publish retargets afterwards", () => {
  const { graph, write } = fixture({ "near/source.md": "[[plan]]\n", "far/plan.md": "# Plan\n\n#far\n" });
  graph.build(false);
  const generation = graph.generation;
  const events: unknown[] = [];
  const target = () => graph.resolveLink({ kind: "wiki", target: "plan" }, "near/source.md").path;
  expect(target()).toBe("far/plan.md");
  expect(graph.backlinks("far/plan.md")).toHaveLength(1);
  graph.onChange(() => {
    throw new Error("listener");
  });
  const stop = graph.onChange((change) => events.push([change.kind, graph.generation, target()]));
  graph.onRetarget(() => {
    throw new Error("listener");
  });
  const retargets: Retarget[][] = [];
  const stopRetarget = graph.onRetarget((changes) => {
    events.push(["retarget", graph.generation, target()]);
    retargets.push(changes);
  });
  const file = write("near/plan.md", "# Near\n\n#near\n");
  graph.updateFile(file.rel, file);
  expect(events).toEqual([
    ["changed", generation + 1, "near/plan.md"],
    ["retarget", generation + 1, "near/plan.md"],
  ]);
  expect(retargets[0]).toEqual([
    { from: "near/source.md", line: 1, target: "plan", was: "far/plan.md", now: "near/plan.md" },
  ]);
  expect(graph.backlinks("far/plan.md")).toEqual([]);
  expect(graph.backlinks("near/plan.md")).toHaveLength(1);
  rmSync(file.abs);
  graph.removeFile(file.rel);
  expect(events.slice(2)).toEqual([
    ["removed", generation + 2, "far/plan.md"],
    ["retarget", generation + 2, "far/plan.md"],
  ]);
  expect(retargets[1]?.[0]).toMatchObject({ was: "near/plan.md", now: "far/plan.md" });
  expect(graph.backlinks("far/plan.md")).toHaveLength(1);
  expect(graph.tags()).toEqual([{ tag: "far", count: 1 }]);
  stop();
  stopRetarget();
  graph.moved([["old.md", "new.md"]]);
  expect(events).toHaveLength(4);
});

test("lazy parsing drains newly reached notes in order and keeps skipped work pending", () => {
  const { graph } = fixture({ "a.md": "[b](.hidden/b.md)\n", ".hidden/b.md": "[c](c.md)\n", ".hidden/c.md": "# C\n" });
  graph.build(false, "lazy");
  const generation = graph.generation;
  expect([...graph.pendingPaths()]).toEqual(["a.md"]);
  expect(graph.unparsedOver(1).map((file) => file.rel)).toEqual(["a.md"]);
  expect(graph.parseSome(0, new Set(["a.md"]))).toBe(1);
  const events: unknown[] = [];
  graph.onChange((change) => events.push([change, graph.generation, [...graph.pendingPaths()]]));
  expect(graph.parseSome(0)).toBe(1);
  expect(events).toEqual([[{ kind: "changed", path: ".hidden/b.md" }, generation + 1, [".hidden/b.md"]]]);
  expect(graph.generation).toBe(generation + 2);
  graph.ensureAll();
  expect(graph.pendingCount).toBe(0);
  expect(graph.generation).toBe(generation + 5);
  expect([...graph.reached]).toEqual([".hidden/b.md", ".hidden/c.md"]);
  expect(graph.backlinks(".hidden/c.md").map((row) => row.from)).toEqual([".hidden/b.md"]);
});
