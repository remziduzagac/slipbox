// Explorer row mechanisms use a real graph and small live capabilities, without the TUI model.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { vaultAt } from "../../../../../src/core/workspace/vaults/vault.ts";
import { listFolder } from "../../../../../src/core/workspace/walk/listing.ts";
import type { ExplorerReadContext } from "../../../../../src/tui/workspace/explorer/contracts.ts";
import { ExplorerFileRows } from "../../../../../src/tui/workspace/explorer/rows/files.ts";
import { ExplorerPaths, hiddenOut, listedDown } from "../../../../../src/tui/workspace/explorer/rows/paths.ts";
import { ExplorerTree } from "../../../../../src/tui/workspace/explorer/rows/tree.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

const sandbox = makeCoreSandbox();
function context(files: Record<string, string>): ExplorerReadContext {
  const root = mkdtempSync(join(sandbox, "rows-"));
  mkdirSync(join(root, ".slipbox"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const config = structuredClone(DEFAULT_CONFIG);
  const loc = vaultAt(root);
  return {
    config,
    loc,
    graph: openGraph(loc, config, false),
    ui: { hidden_files: false },
    sidebar: { allFiles: false },
  } satisfies ExplorerReadContext;
}

test("file-row visibility reads live mode, include and exclude rules; notes precede those rules", () => {
  const app = context({ "a.md": "# A\n", "data.json": "{}", "main.ts": "export {};", "pic.png": "picture" });
  const files = new ExplorerFileRows(app);
  expect(files.filesShown()).toBe("renderable");
  const lists = () => files.listsFiles();
  expect(lists()("data.json", "data")).toBe(true);
  expect(lists()("main.ts", "text")).toBe(false);
  app.sidebar.allFiles = true;
  expect(lists()("main.ts", "text")).toBe(true);
  app.config.files.exclude = ["main.ts", "a.md"];
  expect(lists()("main.ts", "text")).toBe(false);
  expect(lists()("a.md", "note")).toBe(true);
  expect(lists()("pic.png", "binary")).toBe(false);
  app.sidebar.allFiles = false;
  app.config.files.include = ["main.ts"];
  app.config.files.exclude = [];
  expect(lists()("main.ts", "text")).toBe(true);
});

test("row paths distinguish the vault, nested vault contents, outside folders and hidden names", () => {
  const app = context({ "a.md": "# A\n", "nested/.slipbox/config.toml": "", "nested/b.md": "# B\n" });
  const paths = new ExplorerPaths(app);
  expect(paths.rowPath(app.loc.root)).toBe(app.loc.root);
  expect(paths.rowPath(join(app.loc.root, "a.md"))).toBe("a.md");
  expect(paths.rowPath(join(app.loc.root, "nested"))).toBe("nested");
  expect(paths.rowPath(join(app.loc.root, "nested/b.md"))).toBe(join(app.loc.root, "nested/b.md"));
  expect(paths.leftOutAt(join(app.loc.root, "nested/b.md"))).toBeNull();
  expect(paths.rowPath(sandbox)).toBe(sandbox);
  expect(hiddenOut(".slipbox", "marker")).toEqual({ why: "always skipped", at: "marker" });
  expect(hiddenOut(".hidden", "hidden")).toEqual({ why: "hidden", at: "hidden" });
  expect(hiddenOut("normal", "normal")).toBeNull();
  expect(listedDown(app.loc.root, join(app.loc.root, ".hidden/a.md"))).toBe(false);
  expect(listedDown(app.loc.root, join(app.loc.root, ".hidden/a.md"), true)).toBe(true);
  expect(listedDown(app.loc.root, join(app.loc.root, ".git/a.md"), true)).toBe(false);
});

test("tree rows keep directory-first order and reuse the live expanded set", () => {
  const app = context({ "z.md": "# Z\n", "a.md": "# A\n", "sub/b.md": "# B\n" });
  const state = { expanded: new Set<string>(), listings: { get: () => null, pending: () => false } };
  const tree = new ExplorerTree(app, state, new ExplorerPaths(app), new ExplorerFileRows(app));
  expect(tree.build(app.loc.root).map((row) => row.path)).toEqual(["sub", "a.md", "z.md"]);
  state.expanded.add("sub");
  expect(tree.build(app.loc.root).map((row) => [row.path, row.depth])).toEqual([
    ["sub", 0],
    ["sub/b.md", 1],
    ["a.md", 0],
    ["z.md", 0],
  ]);
  state.expanded = new Set();
  expect(tree.build(app.loc.root).map((row) => row.path)).toEqual(["sub", "a.md", "z.md"]);
});

test("outside rows preserve pending and unreadable placeholders before their listing arrives", () => {
  const app = context({ "a.md": "# A\n" });
  const outside = mkdtempSync(join(sandbox, "outside-"));
  writeFileSync(join(outside, "b.md"), "# B\n");
  const state = {
    expanded: new Set<string>(),
    listings: { get: (_dir: string): ReturnType<typeof listFolder> | null => null, pending: () => true },
  };
  const tree = new ExplorerTree(app, state, new ExplorerPaths(app), new ExplorerFileRows(app));
  expect(tree.build(outside)).toEqual([
    { kind: "note", path: `${outside}/\0listing…`, name: "listing…", depth: 0, outside: true, placeholder: true },
  ]);
  state.listings.get = () => ({ dir: outside, error: "EACCES", entries: [], notes: false, scope: null });
  expect(tree.build(outside)[0]).toMatchObject({
    placeholder: true,
    name: "can't read: you may not read it (no permission)",
  });
  state.listings.get = () => listFolder(outside, app.config.walk, false);
  expect(tree.build(outside).map((row) => row.name)).toEqual(["b.md"]);
});
