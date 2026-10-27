import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import {
  appCompositionViolations,
  DRAWING_CLIENTS,
  drawingCompositionViolations,
  EDITABLE_CLIENTS,
  fixtureViolations,
  primitiveViolations,
  PURE_TUI_FIXTURES,
  TUI_PRIMITIVES,
} from "../../scripts/check-boundary.ts";
import { importGraph } from "../../scripts/ci-scope.ts";

const app = "src/tui/app/runtime/app.ts";

test("presentation primitives reject reverse composition imports in every supported form", () => {
  for (const from of TUI_PRIMITIVES) {
    for (const composer of [
      app,
      "src/tui/shell/screen/draw.ts",
      "src/tui/shell/screen/topbar/draw-topbar.ts",
      "src/tui/documents/views/draw-header.ts",
    ]) {
      let path = posix.relative(posix.dirname(from), composer);
      if (!path.startsWith(".")) path = `./${path}`;
      for (const text of [
        `import { App } from "${path}";`,
        `import type { View } from "${path}";`,
        `export { App } from "${path}";`,
        `export type { View } from "${path}";`,
        `const load = import("${path}");`,
        `const model = require("${path}");`,
        `import "${path}";`,
      ])
        expect(primitiveViolations(from, text)).toHaveLength(1);
    }
  }
  expect(
    primitiveViolations(
      "src/tui/shell/screen/style.ts",
      'import type { Theme } from "../../../core/rendering/theme/theme.ts";',
    ),
  ).toEqual([]);
  expect(
    primitiveViolations("src/tui/shell/screen/draw.ts", 'import type { App } from "../../app/runtime/app.ts";'),
  ).toEqual([]);
});

test("editing clients retain genuine App types but never reload its runtime composition", () => {
  for (const from of EDITABLE_CLIENTS) {
    let path = posix.relative(posix.dirname(from), app);
    if (!path.startsWith(".")) path = `./${path}`;
    expect(appCompositionViolations(from, `import { App } from "${path}"; export const model = App;`)).toHaveLength(1);
    expect(appCompositionViolations(from, `const load = () => import("${path}"); export { load };`)).toHaveLength(1);
    expect(appCompositionViolations(from, `import type { App } from "${path}"; export type Model = App;`)).toEqual([]);
    expect(appCompositionViolations(from, `import { type App } from "${path}"; export type Model = App;`)).toEqual([]);
  }
  for (const from of DRAWING_CLIENTS) {
    let path = posix.relative(posix.dirname(from), "src/tui/shell/screen/draw.ts");
    if (!path.startsWith(".")) path = `./${path}`;
    expect(
      drawingCompositionViolations(from, `import { draw } from "${path}"; export const paint = draw;`),
    ).toHaveLength(1);
    expect(drawingCompositionViolations(from, `const load = () => import("${path}"); export { load };`)).toHaveLength(
      1,
    );
    expect(
      drawingCompositionViolations(from, `import type { Geometry } from "${path}"; export type Frame = Geometry;`),
    ).toEqual([]);
    expect(
      drawingCompositionViolations(from, `import { type Geometry } from "${path}"; export type Frame = Geometry;`),
    ).toEqual([]);
    expect(drawingCompositionViolations(from, readFileSync(new URL(`../../${from}`, import.meta.url), "utf8"))).toEqual(
      [],
    );
  }
  expect(
    drawingCompositionViolations(
      "src/tui/documents/views/draw-header.ts",
      'import { draw } from "../../shell/screen/draw.ts"; export const paint = draw;',
    ),
  ).toEqual([]);
});

test("pure filesystem fixtures reject model harness and controller dependencies", () => {
  for (const from of PURE_TUI_FIXTURES) {
    const harness = posix.relative(posix.dirname(from), "tests/tui-harness.ts");
    const model = posix.relative(posix.dirname(from), app);
    expect(fixtureViolations(from, `import { makeSandbox } from "${harness}";`)).toHaveLength(1);
    expect(fixtureViolations(from, `import type { App } from "${model}";`)).toHaveLength(1);
    expect(fixtureViolations(from, 'import { join } from "node:path";')).toEqual([]);
    expect(fixtureViolations(from, readFileSync(new URL(`../../${from}`, import.meta.url), "utf8"))).toEqual([]);
  }
  for (const from of TUI_PRIMITIVES)
    expect(primitiveViolations(from, readFileSync(new URL(`../../${from}`, import.meta.url), "utf8"))).toEqual([]);
});

test("pure geometry, editing and filesystem cases have no transitive App or drawing composer dependency", () => {
  const graph = importGraph();
  for (const file of [
    "tests/tui/documents/editing/editable.test.ts",
    "tests/tui/shell/screen/primitives.test.ts",
    "tests/tui/documents/views/header-layout.test.ts",
    "tests/tui/shell/screen/topbar/fit-location.test.ts",
    "tests/core/foundation/platform/atomic-files.test.ts",
    "tests/core/workspace/graph/write-stamps.test.ts",
    "tests/core/workspace/links/reach-policy.test.ts",
  ]) {
    const seen = new Set<string>();
    const visit = (from: string) => {
      if (seen.has(from)) return;
      seen.add(from);
      for (const next of graph.get(from) ?? []) visit(next);
    };
    visit(file);
    expect(seen.has(app)).toBe(false);
    expect(seen.has("src/tui/shell/screen/draw.ts")).toBe(false);
    expect(seen.has("src/tui/shell/screen/topbar/draw-topbar.ts")).toBe(false);
    expect(seen.has("tests/tui-harness.ts")).toBe(false);
  }
});
