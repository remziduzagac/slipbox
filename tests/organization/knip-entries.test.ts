import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { knipWorkspaces } from "../../scripts/organization/knip-entries.ts";

const root = mkdtempSync(join(tmpdir(), "knip-entries-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const packageWith = (build: unknown) =>
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { build } }));

test("discovery follows new build workers and TSX entries without counting flags or duplicates", () => {
  packageWith(
    "bun build --compile --root=src src/main.ts src/new-worker.ts src/new-worker.ts src/pane.tsx --outfile out",
  );
  const entries = knipWorkspaces(root)["."].entry;
  expect(entries.filter((entry) => entry === "src/new-worker.ts")).toHaveLength(1);
  expect(entries).toContain("src/main.ts");
  expect(entries).toContain("src/pane.tsx");
  expect(entries).not.toContain("--root=src");
  expect(entries).not.toContain("out");
});

test("discovery refuses missing or opaque builds instead of silently dropping worker entries", () => {
  packageWith(undefined);
  expect(() => knipWorkspaces(root)).toThrow("needs package.json scripts.build");
  packageWith("bun run generate-bundle");
  expect(() => knipWorkspaces(root)).toThrow("found no TypeScript build entries");
});
