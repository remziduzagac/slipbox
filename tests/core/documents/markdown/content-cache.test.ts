import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cpSync, mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("the parse cache by content (20.11)", () => {
  test("a second copy is read from what the first parsed; titles, flags and links are each copy's own", async () => {
    const { sharedParseCache } = await import("../../../../src/core/documents/markdown/parsecache.ts");
    const cache = sharedParseCache()!;
    const base = mkdtempSync(join(tmpdir(), "slipbox-pc-"));
    const a = join(base, "a");
    mkdirSync(join(a, ".slipbox"), { recursive: true });
    const tag = basename(base);
    writeFileSync(join(a, "x.md"), `[y](y.md) ${tag}\n`);
    writeFileSync(join(a, "y.md"), `# Why ${tag}\n`);
    writeFileSync(join(a, "plain.md"), `no title here ${tag}\n`);
    const hits = cache.hits;
    const misses = cache.misses;
    const ga = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, true);
    expect([cache.hits - hits, cache.misses - misses]).toEqual([0, 3]);
    // A second copy elsewhere, one note renamed, one written with a BOM (the same text): parsed by none.
    const b = join(base, "b");
    cpSync(a, b, { recursive: true });
    renameSync(join(b, "plain.md"), join(b, "other-name.md"));
    writeFileSync(join(b, "y.md"), `\ufeff# Why ${tag}\n`);
    const h2 = cache.hits;
    const gb = openGraph(locateVault({ root: b }), DEFAULT_CONFIG, true);
    expect(cache.hits - h2).toBe(3); // all three: plain.md under its new name, y.md with its BOM
    expect(gb.entry("other-name.md")!.title).toBe("other-name"); // its own name, the content shared
    expect(ga.entry("plain.md")!.title).toBe("plain");
    expect(gb.entry("y.md")!.title).toBe(`Why ${tag}`);
    expect(gb.entry("y.md")!.flags).toEqual(["bom"]); // the file's, not the content's
    expect(ga.entry("y.md")!.flags).toEqual([]);
    // Links resolved per copy: b's x.md reaches b's y.md.
    expect(gb.backlinks("y.md").map((l) => l.from)).toEqual(["x.md"]);
    expect(gb.resolveLink({ kind: "markdown", target: "y.md" }, "x.md")).toMatchObject({
      resolvedKind: "note",
      path: "y.md",
    });
    // Changed: parsed again.
    writeFileSync(join(b, "x.md"), `[y](y.md) changed ${tag}\n`);
    const m3 = cache.misses;
    openGraph(locateVault({ root: b }), DEFAULT_CONFIG, true);
    expect(cache.misses - m3).toBe(1);
  });

  test("the key is the text's hash, its format and the parser's version; without a cache, notes are parsed as ever", async () => {
    const { ParseCache } = await import("../../../../src/core/documents/markdown/parsecache.ts");
    const { extractNote } = await import("../../../../src/core/workspace/graph/graph.ts");
    expect(ParseCache.key("abc", "markdown", 7)).toBe("7:markdown:abc");
    expect(ParseCache.key("abc", "markdown", 8)).not.toBe(ParseCache.key("abc", "markdown", 7));
    const dir = mkdtempSync(join(tmpdir(), "slipbox-pc2-"));
    writeFileSync(join(dir, "n.md"), "# N\n\n[a](a.md)\n");
    const e = extractNote({ rel: "n.md", abs: join(dir, "n.md"), size: 0, mtimeMs: 0 }, null);
    expect(e).toMatchObject({ title: "N", links: [{ target: "a.md" }] });
    // A cache that can't be made: none, and nothing breaks.
    const blocked = join(dir, "file");
    writeFileSync(blocked, "");
    expect(ParseCache.open(join(blocked, "parsed.db"))).toBeNull();
    // Its own file, used and read back.
    const own = ParseCache.open(join(dir, "own.db"))!;
    extractNote({ rel: "n.md", abs: join(dir, "n.md"), size: 0, mtimeMs: 0 }, own);
    const again = extractNote({ rel: "m.md", abs: join(dir, "n.md"), size: 0, mtimeMs: 0 }, own);
    expect([own.hits, own.misses]).toEqual([1, 1]);
    expect(again).toMatchObject({ rel: "m.md", title: "N" });
    // What the cache holds is what's used: nothing parsed on a hit.
    const { INDEX_VERSION } = await import("../../../../src/core/workspace/graph/graph.ts");
    const { contentHash } = await import("../../../../src/core/workspace/links/redirects.ts");
    own.put(ParseCache.key(contentHash("# N\n\n[a](a.md)\n"), "markdown", INDEX_VERSION), {
      title: "From the cache",
      headings: [],
      links: [],
      tags: ["cached"],
      aliases: [],
      previous: [],
    });
    expect(extractNote({ rel: "n.md", abs: join(dir, "n.md"), size: 0, mtimeMs: 0 }, own)).toMatchObject({
      title: "From the cache",
      links: [],
      tags: ["cached"],
    });
    own.close();
    // SLIPBOX_PARSE_CACHE=off: none (what the bench compares with).
    const { sharedParseCache } = await import("../../../../src/core/documents/markdown/parsecache.ts");
    process.env.SLIPBOX_PARSE_CACHE = "off";
    try {
      expect(sharedParseCache()).toBeNull();
    } finally {
      delete process.env.SLIPBOX_PARSE_CACHE;
    }
    expect(sharedParseCache()).not.toBeNull();
  });

  test("the shared cache is the cache folder's as it is now: moved, the old one let go (it may be gone)", async () => {
    const { ParseCache, sharedParseCache } = await import("../../../../src/core/documents/markdown/parsecache.ts");
    const was = process.env.XDG_CACHE_HOME;
    const base = mkdtempSync(join(tmpdir(), "slipbox-pcmove-"));
    const key = ParseCache.key(`moved-${basename(base)}`, "md", 1);
    try {
      process.env.XDG_CACHE_HOME = join(base, "one");
      sharedParseCache()!.put(key, { title: "T", links: [], headings: [], tags: [], tasks: [] } as never);
      expect(sharedParseCache()!.get(key)).not.toBeNull();
      rmSync(join(base, "one"), { recursive: true, force: true }); // as a test file's sandbox goes when it ends
      process.env.XDG_CACHE_HOME = join(base, "two");
      expect(sharedParseCache()!.get(key)).toBeNull(); // the folder's own cache, not the one that went
      sharedParseCache()!.put(key, { title: "T", links: [], headings: [], tags: [], tasks: [] } as never);
      expect(sharedParseCache()!.get(key)).not.toBeNull();
    } finally {
      if (was === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = was;
    }
  });
});
