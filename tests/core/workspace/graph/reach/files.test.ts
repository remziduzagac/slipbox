import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reachable, reachLinked, neverIndexed } from "../../../../../src/core/workspace/graph/reach/files.ts";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { locateVault } from "../../../../../src/core/workspace/vaults/vault.ts";
import { WalkFilter } from "../../../../../src/core/workspace/walk/walk.ts";
import { stub } from "../../../../../src/core/workspace/graph/index/storage.ts";
import type { LinkRef } from "../../../../../src/core/workspace/graph/graph-types.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

const root = makeCoreSandbox();
mkdirSync(join(root, ".slipbox"));
const context = { root, loc: locateVault({ root }), filter: new WalkFilter(root, DEFAULT_CONFIG.walk) };

test("file admission retains filesystem facts, the size limit and excluded-folder refusals", () => {
  writeFileSync(join(root, "note.md"), "# Note\n");
  expect(reachable(context, "note.md")).toMatchObject({ rel: "note.md", abs: join(root, "note.md"), size: 7 });
  expect(reachable(context, "absent.md")).toBeNull();
  expect(neverIndexed(context, "note.md")).toBeNull();
  const filter = new WalkFilter(root, { ...DEFAULT_CONFIG.walk, max_file_size: 1 });
  expect(reachable({ ...context, filter }, "note.md")).toBeNull();
});

test("linked discovery decodes local paths but never admits names, URLs or paths outside the root", () => {
  const admitted: string[] = [];
  const link = (kind: LinkRef["kind"], target: string): LinkRef => ({
    kind,
    target,
    line: 1,
    column: 1,
    end: { line: 1, column: 1 },
    text: target,
    heading: null,
    block: null,
    alias: null,
  });
  const entry = {
    ...stub({ rel: "a.md", abs: join(root, "a.md"), size: 1, mtimeMs: 0 }),
    links: [
      link("markdown", "hidden%20file.md"),
      link("image", "/inside.md"),
      link("wiki", "name"),
      link("markdown", "https://example.com"),
      link("markdown", "../outside.md"),
    ],
  };
  reachLinked({ ...context, known: () => false, reachFile: (rel) => (admitted.push(rel), true) }, entry, (rel) => ({
    rel,
    abs: join(root, rel),
    size: 1,
    mtimeMs: 0,
  }));
  expect(admitted).toEqual(["hidden file.md", "inside.md"]);
});
