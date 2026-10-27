import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractNote, openGraph } from "../src/core/graph.ts";
import { contentHash } from "../src/core/redirects.ts";
import { ParseCache } from "../src/core/parsecache.ts";
import { cacheDir } from "../src/core/foundation/platform/paths.ts";
import { DEFAULT_CONFIG } from "../src/core/application/config/config.ts";
import { locateVault } from "../src/core/workspace/vaults/vault.ts";

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-html-cache-"));
for (const kind of ["STATE", "CACHE", "CONFIG", "DATA"]) process.env["XDG_" + kind + "_HOME"] = join(sandbox, kind);
delete process.env.SLIPBOX_CONFIG;
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));
const source = '<h2 id="html-target">HTML heading</h2>\n';
describe("HTML extraction cache migration", () => {
  test("a pre-HTML content-cache record cannot hide new HTML headings", () => {
    const file = join(sandbox, "note.md");
    writeFileSync(file, source);
    const cache = ParseCache.open(join(sandbox, "own.db"))!;
    try {
      cache.put(ParseCache.key(contentHash(source), "markdown", 12), {
        title: "Old",
        headings: [],
        anchors: [],
        links: [],
        tags: [],
        aliases: [],
        previous: [],
      });
      const stat = statSync(file);
      const entry = extractNote({ rel: "note.md", abs: file, size: stat.size, mtimeMs: stat.mtimeMs }, cache);
      expect(entry.headings[0]!.id).toBe("html-target");
      expect(entry.anchors).toContainEqual({ id: "html-target", line: 1 });
      expect(cache.hits).toBe(0);
    } finally {
      cache.close();
    }
  });

  test("an unchanged note in a pre-HTML vault index is re-extracted", () => {
    const root = mkdtempSync(join(sandbox, "root-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "note.md"), source);
    const loc = locateVault({ root });
    openGraph(loc, DEFAULT_CONFIG, true);
    const file = join(cacheDir(loc), "index.json");
    const old = JSON.parse(readFileSync(file, "utf8"));
    old.version = 12;
    old.entries["note.md"].headings = [];
    old.entries["note.md"].anchors = [];
    writeFileSync(file, JSON.stringify(old));
    const graph = openGraph(loc, DEFAULT_CONFIG, true);
    expect(graph.notes.get("note.md")!.headings[0]!.id).toBe("html-target");
  });
});
