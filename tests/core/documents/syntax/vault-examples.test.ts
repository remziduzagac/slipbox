import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("the demo vault's code samples", () => {
  test("each language's sample parses cleanly, has an outline, and every path in its comments resolves", async () => {
    const { grammar, grammarFor, parseSyntax } = await import("../../../../src/core/documents/syntax/syntax.ts");
    const { classify, extensionOf } = await import("../../../../src/core/documents/model/filetypes.ts");
    const demo = join(import.meta.dir, "../../../..", "examples", "vault");
    const g = openGraph(locateVault({ root: demo }), DEFAULT_CONFIG, false);
    await g.loadGrammars();
    const code = g
      .filePaths()
      .filter((p) => {
        const k = classify(p, ["md"]);
        return k.group === "text" && grammarFor(k.format, extensionOf(p));
      })
      .sort();
    // A sample for every grammar slipbox bundles (the broken one on purpose aside).
    const langs = new Set(code.map((p) => grammarFor(classify(p, ["md"]).format, extensionOf(p))));
    expect([...langs].sort()).toEqual(["bash", "go", "javascript", "lua", "python", "rust", "typescript"]);
    for (const rel of code) {
      const kind = classify(rel, ["md"]);
      const tree = parseSyntax(
        (await grammar(grammarFor(kind.format, extensionOf(rel))!))!,
        readFileSync(join(demo, rel), "utf8"),
      )!;
      if (rel === "scratch/half-written.py") continue; // broken on purpose: its error swallows the rest
      expect([rel, tree.errors()]).toEqual([rel, []]);
      expect([rel, tree.outline().length > 0]).toEqual([rel, true]);
      for (const l of g.linksOf(rel)) expect([rel, l.target, l.resolvedKind]).not.toContainEqual("unresolved");
    }
  });
});
