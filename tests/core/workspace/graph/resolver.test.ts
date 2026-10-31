import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

const vault = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), "slipbox-resolver-"));
  mkdirSync(join(root, ".slipbox"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return openGraph(locateVault({ root }), DEFAULT_CONFIG, true);
};

describe("resolver admission and candidate lookup", () => {
  test("file names precede aliases; current and legacy links retain their different name admission", () => {
    const g = vault({
      "index.md": "# Index\n",
      "named.md": "# Named\n",
      "other.md": "---\naliases: [named, alias]\nprevious_names: [former]\n---\n# Other\n",
    });
    const wiki = (target: string) => g.resolveLink({ kind: "wiki", target }, "index.md");
    const legacy = (target: string) => g.resolveLegacyWiki({ kind: "wiki", target }, "index.md");
    expect(wiki("named")).toMatchObject({ resolvedKind: "note", path: "named.md" });
    expect(legacy("named")).toMatchObject({ resolvedKind: "note", path: "named.md" });
    expect(wiki("alias")).toMatchObject({ resolvedKind: "note", path: "other.md", via: "alias" });
    expect(legacy("alias")).toMatchObject({ resolvedKind: "note", path: "other.md", via: "alias" });
    expect(wiki("former")).toEqual({ resolvedKind: "unresolved", path: null, candidates: [] });
    expect(legacy("former")).toMatchObject({ resolvedKind: "note", path: "other.md", via: "previous-name" });
    expect(g.resolveLink({ kind: "markdown", target: "alias" }, "index.md").resolvedKind).toBe("unresolved");
    expect(g.resolveLink({ kind: "image", target: "named.md" }, "index.md")).toMatchObject({
      resolvedKind: "note",
      path: "named.md",
      how: "path",
    });
  });

  test("aliases keep nearest and tied candidates; legacy previous names keep their own ambiguity", () => {
    const g = vault({
      "index.md": "# Index\n",
      "a/one.md": "---\naliases: [shared]\nprevious_names: [former]\n---\n# One\n",
      "b/two.md": "---\naliases: [shared]\nprevious_names: [former]\n---\n# Two\n",
    });
    expect(g.resolveLink({ kind: "wiki", target: "shared" }, "index.md")).toEqual({
      resolvedKind: "ambiguous",
      path: null,
      candidates: ["a/one.md", "b/two.md"],
      via: "alias",
    });
    expect(g.resolveLink({ kind: "embed", target: "shared" }, "a/from.md")).toMatchObject({
      resolvedKind: "note",
      path: "a/one.md",
      via: "alias",
    });
    expect(g.resolveLegacyWiki({ kind: "wiki", target: "former" }, "a/from.md")).toEqual({
      resolvedKind: "ambiguous",
      path: null,
      candidates: ["a/one.md", "b/two.md"],
      via: "previous-name",
    });
  });

  test("name caches belong to their graph and follow its existing update invalidation", () => {
    const first = vault({ "one.md": "---\naliases: [shared]\n---\n# One\n" });
    const second = vault({ "two.md": "---\naliases: [shared]\n---\n# Two\n" });
    const alias = { kind: "wiki" as const, target: "shared" };
    expect(first.resolveLink(alias, "index.md").path).toBe("one.md");
    expect(second.resolveLink(alias, "index.md").path).toBe("two.md");
    expect(first.resolveLink(alias, "index.md").path).toBe("one.md");
    const abs = join(first.root, "one.md");
    writeFileSync(abs, "---\naliases: [changed]\n---\n# One\n");
    const st = statSync(abs);
    first.updateFile("one.md", { abs, rel: "one.md", size: st.size, mtimeMs: st.mtimeMs + 1 });
    expect(first.resolveLink(alias, "index.md").resolvedKind).toBe("unresolved");
    expect(first.resolveLink({ kind: "wiki", target: "changed" }, "index.md")).toMatchObject({
      resolvedKind: "note",
      path: "one.md",
      via: "alias",
    });
    expect(second.resolveLink(alias, "index.md").path).toBe("two.md");
  });

  test("export-mark caches keep identical relative paths in different roots separate", () => {
    const files = { "book.assets/only.png": "png", "index.md": "# Index\n" };
    const marked = vault({ ...files, "book.md": "---\ngenerator: slipbox\n---\n# Book\n" });
    const ordinary = vault({ ...files, "book.md": "# Book\n" });
    const link = { kind: "embed" as const, target: "only.png" };
    expect(marked.resolveLink(link, "index.md").resolvedKind).toBe("unresolved");
    expect(ordinary.resolveLink(link, "index.md")).toMatchObject({
      resolvedKind: "file",
      path: "book.assets/only.png",
    });
    expect(marked.resolveLink(link, "index.md").resolvedKind).toBe("unresolved");
    expect(marked.resolveLink({ kind: "embed", target: "book.assets/only.png" }, "index.md")).toMatchObject({
      resolvedKind: "file",
      path: "book.assets/only.png",
    });
  });
});
