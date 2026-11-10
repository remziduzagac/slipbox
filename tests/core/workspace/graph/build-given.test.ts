// A build given its walk and its index, read elsewhere (SD-T8): the TUI's, read on a disk thread, the index crossing as
// its text (SD-D12) — nothing of either read where it's built; a move found as it's built told by the hashes read with
// them; home's walk made on the walk's thread with its index read after it.

import { describe, expect, test } from "bun:test";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { walkContext } from "../../../../src/core/foundation/workers/worker-context.ts";
import { Graph, openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { indexFile } from "../../../../src/core/workspace/graph/refresh.ts";
import { homeFilter } from "../../../../src/core/workspace/vaults/home/filter.ts";
import { homeAt, locateVault, type VaultLocation } from "../../../../src/core/workspace/vaults/vault.ts";
import { answerDisk, type IndexRead, type WalkAnswer } from "../../../../src/core/workspace/walk/disk-jobs.ts";
import { answerWalk } from "../../../../src/core/workspace/walk/walk-jobs.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

const sandbox = makeCoreSandbox();

/** A vault of `files` (path → text) in the sandbox. */
function vault(name: string, files: Record<string, string>): VaultLocation {
  const root = join(sandbox, name);
  mkdirSync(join(root, ".slipbox"), { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return locateVault({ root });
}

/** The vault's walk and its index, as a disk thread reads them for a build (`DiskThreads.walk`). */
function walked(loc: VaultLocation): WalkAnswer {
  const filter = new Graph(loc, DEFAULT_CONFIG).filter.settings;
  const ask = { how: "vault" as const, filter, index: indexFile(loc) };
  return (answerDisk({ op: "walk", ask, context: walkContext() }) as { walked: WalkAnswer }).walked;
}

describe("a build given its walk and its index (SD-T8)", () => {
  test("built from the index's text given: the file gone since, its notes taken from the text all the same", () => {
    const loc = vault("given-index", { "a.md": "# A\n\n[[b]]\n", "b.md": "# B\n" });
    openGraph(loc, DEFAULT_CONFIG);
    const answer = walked(loc);
    expect(answer.index?.text).toContain('"a.md"');
    rmSync(indexFile(loc));
    const g = new Graph(loc, DEFAULT_CONFIG).build(true, "lazy", answer);
    expect(g.indexRead).toBe(true);
    expect(g.stats.cached).toBe(2);
    expect(g.pendingCount).toBe(0);
    expect(g.linksOf("a.md").map((l) => l.path)).toEqual(["b.md"]);
  });

  test("a note moved since the index: found by the hash read with the walk, never by its text read where it's built", () => {
    const loc = vault("given-move", { "old.md": "# Moved\n\nsame text\n", "keep.md": "# Keep\n" });
    openGraph(loc, DEFAULT_CONFIG);
    renameSync(join(loc.root, "old.md"), join(loc.root, "new.md"));
    const answer = walked(loc);
    expect(Object.keys(answer.index?.hashes ?? {})).toEqual(["new.md"]);
    // Its text changed since, its size the same: read where it's built, it would be no move.
    writeFileSync(join(loc.root, "new.md"), "# Moved\n\nsame TEXT\n");
    const g = new Graph(loc, DEFAULT_CONFIG).build(true, "lazy", answer);
    expect(g.redirects?.follow("old.md")).toBe("new.md");
  });

  test("no note to tell a move by: no hashes read with the walk", () => {
    const loc = vault("given-nothing-moved", { "a.md": "# A\n" });
    openGraph(loc, DEFAULT_CONFIG);
    writeFileSync(join(loc.root, "b.md"), "# B\n");
    expect(walked(loc).index).not.toHaveProperty("hashes");
  });

  test("home's walk on the walk's thread with its index read after it, for home's graph built from both", () => {
    const loc = homeAt(join(sandbox, "home"));
    mkdirSync(join(loc.root, "notes"), { recursive: true });
    writeFileSync(join(loc.root, "notes/n.md"), "# N\n");
    const filter = homeFilter(loc, DEFAULT_CONFIG).settings;
    const index = indexFile(loc);
    const ask = { op: "home" as const, loc: { root: loc.root, key: loc.key }, filter, asked: ["notes"], index: true };
    const none = answerWalk({ ...ask, context: walkContext() }) as { index?: IndexRead };
    expect(none.index).toEqual({ text: null, stamp: "" });
    mkdirSync(dirname(index), { recursive: true });
    writeFileSync(index, '{"version":0}');
    const read = answerWalk({ ...ask, context: walkContext() }) as { index?: IndexRead };
    expect(read.index?.text).toBe('{"version":0}');
  });
});
