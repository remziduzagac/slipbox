import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture, compare, stalePaths, type Manifest } from "../../scripts/organization/migration.ts";

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-migration-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));
function fixture() {
  const root = mkdtempSync(join(sandbox, "tree-"));
  const put = (file: string, text: string) => {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  put("package.json", JSON.stringify({ scripts: { build: "bun build src/main.ts src/core/job.ts" } }));
  put("src/main.ts", 'import type { Item } from "./core/item"; import("./core/jobs/run");');
  put("src/core/item.ts", "export interface Item { id: string }");
  put("src/core/jobs/run.ts", 'import { workerUrl } from "../workers"; new Worker(workerUrl("job.ts"));');
  put("src/core/workers.ts", "export function workerUrl(file: string) { return file; }");
  put("src/core/job.ts", 'export const result = "ok";');
  put("tests/one.test.ts", 'test("kept", () => {}); test("also kept", () => {});');
  return { root, put };
}

test("move manifest preserves resolved type/dynamic imports, helper-relative workers and test identities", () => {
  const { root, put } = fixture();
  const before = capture(root);
  expect(before.unresolved).toEqual([]);
  expect(before.edges).toContain("src/core/jobs/run.ts -> src/core/job.ts");
  expect(before.edges).toContain("src/main.ts -> src/core/item.ts");
  expect(before.runtime).not.toContain("src/main.ts -> src/core/item.ts");
  renameSync(join(root, "src/core/item.ts"), join(root, "src/core/contract.ts"));
  put("src/main.ts", 'import type { Item } from "./core/contract"; import("./core/jobs/run");');
  put("tests/one.test.ts", 'test("kept", () => {});');
  put("tests/two.test.ts", 'test("also kept", () => {});');
  const manifest = { moves: { "src/core/item.ts": "src/core/contract.ts" }, retained: [] };
  expect(compare(before, capture(root), manifest)).toEqual([]);
  expect(stalePaths(root, ["src/main.ts"], manifest)).toEqual([]);
  put("src/main.ts", 'import type { Item } from "./core/item"; import("./core/jobs/run");');
  expect(compare(before, capture(root), manifest).join("\n")).toContain("unresolved");
});

test("lost dependencies, duplicate or missing tests and omitted build entries fail independently", () => {
  const { root, put } = fixture();
  const before = capture(root);
  const manifest: Manifest = { moves: {}, retained: [] };
  for (const key of ["edges", "runtime", "tests", "entries"] as const) {
    const after = { ...before, [key]: before[key].slice(1) };
    expect(compare(before, after, manifest).join("\n")).toContain(`${key} changed`);
  }
  expect(compare(before, { ...before, tests: [...before.tests, before.tests[0]!] }, manifest).join("\n")).toContain(
    "tests changed",
  );
  put("tests/one.test.ts", 'test.skip("kept", () => {}); test("also kept", () => {});');
  expect(compare(before, capture(root), manifest).join("\n")).toContain("tests changed");
  put("package.json", JSON.stringify({ scripts: { build: "bun build src/missing.ts" } }));
  expect(capture(root).unresolved).toContain("build entry: src/missing.ts");
});

test("stale paths need an exact file/text exception with a reason, not a blanket directory exemption", () => {
  const { root, put } = fixture();
  renameSync(join(root, "src/core/item.ts"), join(root, "src/core/contract.ts"));
  put("history.md", "The former src/core/item.ts contract.");
  const manifest: Manifest = { moves: { "src/core/item.ts": "src/core/contract.ts" }, retained: [] };
  expect(stalePaths(root, ["history.md"], manifest)).toHaveLength(1);
  manifest.retained.push({ file: "history.md", text: "src/core/item", reason: "Historical evidence" });
  expect(stalePaths(root, ["history.md"], manifest)).toEqual([]);
  manifest.retained[0]!.reason = "";
  expect(stalePaths(root, ["history.md"], manifest)).toHaveLength(1);
});

test("moving a worker requires both its helper-relative URL and its compiled build entry to follow", () => {
  const { root, put } = fixture();
  const before = capture(root);
  const manifest: Manifest = { moves: { "src/core/job.ts": "src/core/jobs/job.ts" }, retained: [] };
  renameSync(join(root, "src/core/job.ts"), join(root, "src/core/jobs/job.ts"));
  expect(capture(root).unresolved).toContain("src/core/jobs/run.ts: job.ts");
  put("src/core/jobs/run.ts", 'import { workerUrl } from "../workers"; new Worker(workerUrl("jobs/job.ts"));');
  expect(capture(root).unresolved).toEqual(["build entry: src/core/job.ts"]);
  put("package.json", JSON.stringify({ scripts: { build: "bun build src/main.ts src/core/jobs/job.ts" } }));
  expect(compare(before, capture(root), manifest)).toEqual([]);
});

test("old paths do not match prefix-sharing siblings", () => {
  const { root, put } = fixture();
  renameSync(join(root, "src/core/item.ts"), join(root, "src/core/jobs/item.ts"));
  const manifest: Manifest = { moves: { "src/core/item.ts": "src/core/jobs/item.ts" }, retained: [] };
  put("references.md", "src/core/item-resolve.ts src/core/item_cache.ts src/core/items.ts src/core/item/index.ts");
  expect(stalePaths(root, ["references.md"], manifest)).toEqual([]);
  put("references.md", "../src/core/item.ts and src/core/item");
  expect(stalePaths(root, ["references.md"], manifest)).toHaveLength(1);
});

test("comments and quoted fixtures cannot stand in for a removed test", () => {
  const { root, put } = fixture();
  const before = capture(root);
  for (const text of [
    '// test("kept", () => {});\n// test("also kept", () => {});',
    '/* test("kept", () => {}); test("also kept", () => {}); */',
    'const sample = \'test("kept", () => {}); test("also kept", () => {});\';',
  ]) {
    put("tests/one.test.ts", text);
    expect(capture(root).tests).toEqual([]);
    expect(compare(before, capture(root), { moves: {}, retained: [] }).join("\n")).toContain("tests changed");
  }
});

test("script imports and literal worker and URL references participate in move verification", () => {
  const { root, put } = fixture();
  put("scripts/use.ts", 'import type { Item } from "../src/core/item";');
  put("scripts/job.ts", 'import { workerUrl } from "../src/core/workers"; workerUrl("job.ts");');
  put("scripts/url.ts", 'new URL("../src/core/item.ts", import.meta.url);');
  const before = capture(root);
  expect(before.edges).toContain("scripts/use.ts -> src/core/item.ts");
  expect(before.edges).toContain("scripts/job.ts -> src/core/job.ts");
  expect(before.edges).toContain("scripts/url.ts -> src/core/item.ts");
  renameSync(join(root, "src/core/item.ts"), join(root, "src/core/contract.ts"));
  expect(capture(root).unresolved).toContain("scripts/use.ts: ../src/core/item");
});
