import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LinkIndex, onDisk } from "../../../../src/core/workspace/links/links.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("link resolution (1.4)", () => {
  test("a path spelled as its folders list it, where the filesystem folds case (macOS, Windows); elsewhere as given", () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-ondisk-"));
    mkdirSync(join(root, "Ideas"));
    writeFileSync(join(root, "Ideas", "coffee.md"), "# Coffee\n");
    expect(onDisk(root, "ideas/Coffee.md", true)).toBe("Ideas/coffee.md");
    expect(onDisk(root, "Ideas/coffee.md", true)).toBe("Ideas/coffee.md");
    expect(onDisk(root, "ideas/missing.md", true)).toBe("Ideas/missing.md");
    expect(onDisk(root, "ideas/Coffee.md", false)).toBe("ideas/Coffee.md");
  });
  const idx = new LinkIndex([
    "index.md",
    "projects/index.md",
    "a/deep/index.md",
    "notes/Readme.md",
    "notes/alpha.md",
    "x/dup.md",
    "y/dup.md",
  ]);
  test("case-insensitive everywhere", () => {
    expect(idx.resolveWiki("README", null)).toMatchObject({ status: "resolved", path: "notes/Readme.md" });
    expect(idx.resolveWiki("ALPHA", null).path).toBe("notes/alpha.md");
  });
  test("collisions: same directory, then deepest shared, then shortest", () => {
    expect(idx.resolveWiki("index", "projects/other.md").path).toBe("projects/index.md");
    expect(idx.resolveWiki("index", "a/deep/sub/note.md").path).toBe("a/deep/index.md");
    expect(idx.resolveWiki("index", "notes/alpha.md").path).toBe("index.md");
  });
  test("a genuine tie is ambiguous with every candidate", () => {
    const r = idx.resolveWiki("dup", "z/n.md");
    expect(r.status).toBe("ambiguous");
    expect(r.candidates).toEqual(["x/dup.md", "y/dup.md"]);
  });
  test("path suffixes, extensions and relative forms", () => {
    expect(idx.resolveWiki("projects/index", null).path).toBe("projects/index.md");
    expect(idx.resolveWiki("deep/index", null).path).toBe("a/deep/index.md");
    expect(idx.resolveWiki("alpha.md", null).path).toBe("notes/alpha.md");
    expect(idx.resolveWiki("../index", "notes/alpha.md").path).toBe("index.md");
    expect(idx.resolveWiki("nope", null).status).toBe("unresolved");
  });
});
