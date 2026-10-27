import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("where links end (11.7)", () => {
  test("a link records its end as well as its start — columns in UTF-16 units — and backlinks and problems carry it", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-ends-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "b.md"), "# B\n");
    writeFileSync(
      join(dir, "a.md"),
      "# A\n\n🌍 [Bee](b.md) then ![b](b.md)\n[md](b.md) and [ref][r] ![pic](p.png) [gone](gone.md)\n\n[r]: b.md\n",
    );
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const ends = g.notes.get("a.md")!.links.map((l) => [l.kind, l.line, l.column, l.end.line, l.end.column]);
    // 🌍 is two UTF-16 units: [Bee](b.md) starts at column 4, as an editor counts.
    expect(ends).toEqual([
      ["markdown", 3, 4, 3, 15],
      ["image", 3, 21, 3, 31],
      ["markdown", 4, 1, 4, 11],
      ["markdown", 4, 16, 4, 24],
      ["image", 4, 25, 4, 38],
      ["markdown", 4, 39, 4, 54],
    ]);
    expect(g.backlinks("b.md").map((b) => [b.line, b.column, b.end.column])).toContainEqual([3, 4, 15]);
    expect(g.problems().broken.find((p) => p.target === "gone.md")).toMatchObject({
      line: 4,
      column: 39,
      end: { line: 4, column: 54 },
    });
  });
});
