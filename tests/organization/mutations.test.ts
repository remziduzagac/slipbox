import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mutationViolations } from "../../scripts/check-boundary.ts";

const shared = "src/core/workspace/mutations/trash.ts";

test("shared trash and marker operations reject reverse mutation imports in every form", () => {
  for (const text of [
    'import { trashPath } from "./files.ts";',
    'import type { SavedPlan } from "./plans";',
    'export { applyRename } from "./rename/rename.ts";',
    'export type { RenamePlan } from "./rename/rename-plan.ts";',
    'const run = import("./rename/rename-apply.ts");',
    'const files = require("./files.ts");',
    'import "./files.ts";',
  ])
    expect(mutationViolations(shared, text)).toHaveLength(1);
  expect(mutationViolations(shared, 'import { stateDir } from "../../foundation/platform/paths.ts";')).toEqual([]);
  expect(mutationViolations("src/core/workspace/mutations/files.ts", 'import { trashDir } from "./trash.ts";')).toEqual(
    [],
  );
});

test("the real shared mutation module stays below orchestration", () => {
  expect(mutationViolations(shared, readFileSync(new URL(`../../${shared}`, import.meta.url), "utf8"))).toEqual([]);
});
