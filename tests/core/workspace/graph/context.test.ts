import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("the context bundle (9.7)", () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-context-"));
    mkdirSync(join(dir, ".slipbox"));
    const files: Record<string, string> = {
      "a.md":
        "# A\n\n[b](b.md), [c](c.md), [code](s.ts), ![p](pic.png), [missing](missing.md), [log](big.log) and [b](b.md) again.\n",
      "b.md": "# B\n\n```js\nlet x;\n```\n\nOn to [d](d.md).\n",
      "c.md": "# C\n",
      "d.md": "# D\n\nDeep.\n",
      "e.md": "Back to [a](a.md).\n",
      "f.md": "[a](a.md) and [a](a.md#a)\n",
      "ab.json": '{"see": "a.md"}\n', // a data file's link: listed after the notes', and sorted in by path
      "s.ts": "export const s = 1;\n",
      "pic.png": "png",
      "big.log": "x".repeat(300 * 1024),
      "unrelated.md": "# U\n",
    };
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    return openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
  };
  const paths = (b: { items: { path: string; why: string }[] }) => b.items.map((i) => `${i.why}:${i.path}`);

  test("breadth first: the note, what it links to in the order written, then what links to it; a file's text, never a picture's or a dump's", async () => {
    const { buildContext } = await import("../../../../src/core/documents/model/context.ts");
    const g = setup();
    const b = buildContext(g, ["a.md"], { depth: 1, backlinks: true, limit: 25 });
    expect(paths(b)).toEqual([
      "start:a.md",
      "link:b.md",
      "link:c.md",
      "link:s.ts",
      "backlink:ab.json",
      "backlink:e.md",
      "backlink:f.md",
    ]);
    expect(b.left).toEqual([
      { path: "pic.png", why: "link", from: "a.md", reason: "binary" },
      { path: "big.log", why: "link", from: "a.md", reason: "size" },
    ]);
    expect(b.items[1]).toMatchObject({ depth: 1, from: "a.md", lines: 7 });
    // Written as the scratch is: each file's reference and why, its text fenced (longer than a fence inside it).
    expect(b.text).toStartWith(
      "# Context: a.md\n\nThe note, 3 files it links to and 3 files linking to it: each with its path and lines, fenced as it is on disk.\n\n## a.md\n\n`a.md:1-3` — asked for\n\n```markdown\n# A\n",
    );
    expect(b.text).toContain(
      "## b.md\n\n`b.md:1-7` — linked from a.md\n\n````markdown\n# B\n\n```js\nlet x;\n```\n\nOn to [d](d.md).\n````\n",
    );
    expect(b.text).toContain("## s.ts\n\n`s.ts:1` — linked from a.md\n\n```typescript\nexport const s = 1;\n```\n");
    expect(b.text).toContain("## e.md\n\n`e.md:1` — links to a.md\n");
    expect(b.text).toEndWith(
      "## Left out\n\n- `pic.png` — linked from a.md: not text\n- `big.log` — linked from a.md: too large\n",
    );
    expect(b.text).not.toContain("unrelated");
  });

  test("a linked file gone since the index, or one that can't be read: named as such, never included", async () => {
    const { buildContext } = await import("../../../../src/core/documents/model/context.ts");
    const { chmodSync } = await import("node:fs");
    const g = setup();
    rmSync(join(g.root, "c.md"));
    chmodSync(join(g.root, "s.ts"), 0o000);
    try {
      const b = buildContext(g, ["a.md"], { depth: 1, backlinks: false, limit: 25 });
      expect(paths(b)).toEqual(["start:a.md", "link:b.md"]);
      expect(b.left.filter((l) => l.reason === "unreadable")).toEqual([
        { path: "c.md", why: "link", from: "a.md", reason: "unreadable" },
        { path: "s.ts", why: "link", from: "a.md", reason: "unreadable" },
      ]);
      expect(b.text).toContain(
        "- `c.md` — linked from a.md: can't be read\n- `s.ts` — linked from a.md: can't be read\n",
      );
    } finally {
      chmodSync(join(g.root, "s.ts"), 0o644);
    }
  });

  test("deeper, none, no backlinks, a limit: what's past it named, not included", async () => {
    const { buildContext } = await import("../../../../src/core/documents/model/context.ts");
    const g = setup();
    expect(paths(buildContext(g, ["a.md"], { depth: 2, backlinks: true, limit: 25 }))).toEqual([
      "start:a.md",
      "link:b.md",
      "link:c.md",
      "link:s.ts",
      "backlink:ab.json",
      "backlink:e.md",
      "backlink:f.md",
      "link:d.md",
    ]);
    expect(paths(buildContext(g, ["a.md"], { depth: 0, backlinks: false, limit: 25 }))).toEqual(["start:a.md"]);
    expect(paths(buildContext(g, ["a.md"], { depth: 0, backlinks: true, limit: 25 }))).toEqual([
      "start:a.md",
      "backlink:ab.json",
      "backlink:e.md",
      "backlink:f.md",
    ]);
    const two = buildContext(g, ["a.md", "d.md"], { depth: 1, backlinks: false, limit: 3 });
    expect(paths(two)).toEqual(["start:a.md", "start:d.md", "link:b.md"]);
    expect(two.left.map((l) => `${l.reason}:${l.path}`)).toEqual([
      "limit:c.md",
      "limit:s.ts",
      "binary:pic.png",
      "size:big.log",
    ]);
    expect(two.text).toStartWith("# Context: a.md, d.md\n\nThe notes, 1 file they link to:");
    expect(two.text).toContain("- `c.md` — linked from a.md: past the limit of 3\n");
    // A long list of what's left out: the first 20 named, the rest counted.
    writeFileSync(join(g.root, "hub.md"), Array.from({ length: 25 }, (_, i) => `[n${i}](n${i}.md)`).join("\n"));
    for (let i = 0; i < 25; i++) writeFileSync(join(g.root, `n${i}.md`), `# ${i}\n`);
    const hub = buildContext(openGraph(locateVault({ root: g.root }), DEFAULT_CONFIG, true), ["hub.md"], {
      depth: 1,
      backlinks: false,
      limit: 1,
    });
    expect(hub.left).toHaveLength(25);
    expect(hub.text).toContain("- `n19.md` — linked from hub.md: past the limit of 1\n- and 5 more\n");
    expect(hub.text).not.toContain("`n20.md`");
  });
});
