import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import {
  commentPath,
  fileLinksOf,
  type FileLinkCache,
} from "../../../../../src/core/workspace/graph/queries/file-links.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

const root = makeCoreSandbox();

test("file-link stamps retain cached identity, explicit broken references and the 256 KiB read ceiling", () => {
  const cache: FileLinkCache = new Map();
  const context = {
    root,
    config: DEFAULT_CONFIG,
    resolveLink: () => ({ resolvedKind: "unresolved" as const, path: null, candidates: [] }),
    commentPath: () => null,
  };
  const path = join(root, "settings.json");
  writeFileSync(path, '{"$ref":"missing.json"}');
  const first = fileLinksOf(context, cache, "settings.json");
  expect(first.map((l) => l.target)).toEqual(["missing.json"]);
  expect(fileLinksOf(context, cache, "settings.json")).toBe(first);
  writeFileSync(path, '{"$ref":"another-missing.json"}');
  expect(fileLinksOf(context, cache, "settings.json").map((l) => l.target)).toEqual(["another-missing.json"]);
  writeFileSync(path, " ".repeat(256 * 1024 + 1));
  expect(fileLinksOf(context, cache, "settings.json")).toEqual([]);
  expect(fileLinksOf(context, cache, "absent.json")).toEqual([]);
});

test("comment paths prefer the source directory, exclude self and escaping paths, then try the root", () => {
  const known = new Set(["docs/a.md", "a.md", "docs/self.ts"]);
  const context = { known: (rel: string) => known.has(rel) };
  expect(commentPath(context, "a.md", "docs/self.ts")).toBe("docs/a.md");
  expect(commentPath(context, "/a.md", "docs/self.ts")).toBe("a.md");
  expect(commentPath(context, "self.ts", "docs/self.ts")).toBeNull();
  expect(commentPath(context, "../../../a.md", "docs/self.ts")).toBeNull();
});
