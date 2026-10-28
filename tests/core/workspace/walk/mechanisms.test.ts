import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { WalkFilter } from "../../../../src/core/workspace/walk/filtering/filter.ts";
import { busyWhy, homeSkip } from "../../../../src/core/workspace/walk/filtering/policy.ts";
import { busyFolderWhyAt } from "../../../../src/core/workspace/walk/filtering/inspection.ts";
import { readFolder, setFolderReader } from "../../../../src/core/workspace/walk/io/folders.ts";
import { RELIST, stampOf } from "../../../../src/core/workspace/walk/io/stamps.ts";
import { SlicedWalk, walkVault } from "../../../../src/core/workspace/walk/traversal/walk.ts";
import { symlinkVerdict } from "../../../../src/core/workspace/walk/traversal/symlinks.ts";

const sandbox = makeCoreSandbox();
function fixture() {
  const root = mkdtempSync(join(sandbox, "walk-"));
  mkdirSync(join(root, "sub"));
  writeFileSync(join(root, "a.md"), "# A\n");
  writeFileSync(join(root, "sub/b.md"), "# B\n");
  return { root, filter: new WalkFilter(root, DEFAULT_CONFIG.walk) };
}

test("the one folder-reader hook is read live by both direct and traversal callers", () => {
  const { root, filter } = fixture();
  const seen: string[] = [];
  try {
    setFolderReader((path) => {
      seen.push(path);
      return readdirSync(path, { withFileTypes: true });
    });
    expect(readFolder(root).some((entry) => entry.name === "a.md")).toBe(true);
    expect(walkVault(root, filter).files.map((file) => file.rel)).toEqual(["a.md", "sub/b.md"]);
    expect(seen.filter((path) => path === root).length).toBeGreaterThanOrEqual(2);
  } finally {
    setFolderReader(null);
  }
});

test("sliced traversal retains the same files as a whole walk across small budgets", () => {
  const { root, filter } = fixture();
  const whole = walkVault(root, filter);
  const sliced = new SlicedWalk(root, filter);
  while (sliced.step(0)) {}
  expect(sliced.result!.files).toEqual(whole.files);
  expect(sliced.result!.dirs).toEqual(whole.dirs);
});

test("busy-folder reasons distinguish ignored output from a folder that holds notes", () => {
  expect(
    busyWhy(
      "node_modules",
      () => false,
      () => false,
    ),
  ).not.toBeNull();
  expect(
    busyWhy(
      "node_modules",
      () => false,
      () => true,
    ),
  ).toBeNull();
  expect(homeSkip("Library", { platform: "darwin" })).toBe("system folder");
  expect(homeSkip("Library/a", { platform: "linux" })).toBeNull();
  const { root } = fixture();
  mkdirSync(join(root, "node_modules"));
  expect(busyFolderWhyAt(join(root, "node_modules"), DEFAULT_CONFIG.walk)).not.toBeNull();
});

test("settling uses the original relist sentinel and symlink refusal remains explicit", () => {
  expect(stampOf(1000, 1000, 1001)).toBe(RELIST);
  const { root } = fixture();
  expect(symlinkVerdict(join(root, "missing"), root).kept).toBe(false);
});
