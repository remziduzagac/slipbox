import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("an editor's unsaved text (11.8)", () => {
  test("stands for the note until let go: its links and headings count; the persisted index keeps the file's", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-overlay-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "a.md"), "# A\n");
    writeFileSync(join(dir, "b.md"), "# B\n");
    const loc = locateVault({ root: dir });
    const g = openGraph(loc, DEFAULT_CONFIG, true);
    const from = () => g.backlinks("b.md").map((b) => b.from);
    g.overlay("a.md", "# A, typed\n\n## New\n\n[b](b.md)\n");
    expect(from()).toEqual(["a.md"]);
    expect(g.notes.get("a.md")!.headings.map((h) => h.text)).toEqual(["A, typed", "New"]);
    // Another note changes: the index is written — with the file's a.md, no link, read afresh.
    writeFileSync(join(dir, "b.md"), "# B, changed\n");
    g.updateFile("b.md", { rel: "b.md", abs: join(dir, "b.md"), size: 13, mtimeMs: Date.now() });
    g.ensureAll();
    expect(openGraph(loc, DEFAULT_CONFIG, true).backlinks("b.md")).toEqual([]);
    // The file changes under it (an agent, a save): the editor's text still stands; let go, the file's.
    writeFileSync(join(dir, "a.md"), "# A, saved\n\n[b](b.md) [b](b.md)\n");
    g.updateFile("a.md", { rel: "a.md", abs: join(dir, "a.md"), size: 22, mtimeMs: Date.now() });
    expect(g.notes.get("a.md")!.title).toBe("A, typed");
    g.overlay("a.md", null);
    expect(g.notes.get("a.md")!.title).toBe("A, saved");
    expect(from()).toEqual(["a.md", "a.md"]);
    // A rescan keeps it; a note that isn't the graph's gets none.
    g.overlay("a.md", "# Typed again\n");
    g.build(true, "lazy");
    expect(g.entry("a.md")!.title).toBe("Typed again");
    g.overlay("nowhere.md", "# N\n");
    expect(g.notes.has("nowhere.md")).toBe(false);
  });
});
