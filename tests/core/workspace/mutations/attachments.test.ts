import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { applyPlan } from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

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

  test("an attachment renamed or moved keeps its wikilinks' extension once: ![[dal.png]] → ![[dal2.png]]", async () => {
    const { planNoteRename, planFolderMove } = await import(
      "../../../../src/core/workspace/mutations/rename/rename.ts"
    );
    const { dir, g } = root({
      "x.md": "![[dal.png]] ![[pics/a.pdf]] [[pics/a.pdf]]\n",
      "pics/y.md": "![[./a.pdf]]\n",
      "dal.png": "png",
      "pics/a.pdf": "pdf",
    });
    applyPlan(g, planNoteRename(g, "dal.png", "dal2.png"));
    expect(read(dir, "x.md")).toBe("![[dal2.png]] ![[pics/a.pdf]] [[pics/a.pdf]]\n");
    applyPlan(g, planNoteRename(g, "pics/a.pdf", "pics/b.pdf"));
    expect(read(dir, "pics/y.md")).toBe("![[./b.pdf]]\n");
    applyPlan(g, planFolderMove(g, "pics", "docs"));
    expect(read(dir, "x.md")).toBe("![[dal2.png]] ![[docs/b.pdf]] [[docs/b.pdf]]\n");
    expect(read(dir, "docs/y.md")).toBe("![[./b.pdf]]\n");
    const fresh = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    for (const l of fresh.entry("x.md")!.links) expect(fresh.resolveLink(l, "x.md").resolvedKind).toBe("file");
    expect(fresh.resolveLink(fresh.entry("docs/y.md")!.links[0]!, "docs/y.md")).toMatchObject({
      resolvedKind: "file",
      path: "docs/b.pdf",
    });
  });
});
