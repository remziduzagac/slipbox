import { UNIT_TIMEOUT_MS } from "../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCoreSandbox } from "../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const sandbox = makeCoreSandbox();

describe("the boundary check (0.3, scripts/check-boundary.ts)", () => {
  /** A tree of its own: the script copied into it (it checks the tree it sits in), and these files. */
  const check = (files: Record<string, string>) => {
    const top = mkdtempSync(join(sandbox, "boundary-"));
    mkdirSync(join(top, "scripts"));
    writeFileSync(
      join(top, "scripts", "check-boundary.ts"),
      readFileSync(join(import.meta.dir, "../..", "scripts", "check-boundary.ts"), "utf8"),
    );
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(top, rel, ".."), { recursive: true });
      writeFileSync(join(top, rel), text);
    }
    const r = Bun.spawnSync([process.execPath, join(top, "scripts", "check-boundary.ts")]);
    return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };

  test("a core file importing the TUI, a CLI file importing OpenTUI: each reported, the check fails", () => {
    const r = check({
      "src/core/deep/a.ts": 'import { App } from "../../tui/app/runtime/app.ts";\nexport const a = App;\n',
      "src/core/b.ts": 'export const b = () => import("../cli/cli.ts");\n',
      "src/cli/c.ts": 'import "@opentui/core";\nimport { a } from "../core/deep/a.ts";\n',
      "src/tui/app/runtime/app.ts": 'import "@opentui/core";\nexport const App = 1;\n',
    });
    expect(r.code).toBe(1);
    expect(
      r.err
        .split("\n")
        .filter((l) => l.startsWith("  "))
        .map((l) => l.trim())
        .sort(),
    ).toEqual([
      "src/cli/c.ts: imports @opentui/core (src/cli must not import @opentui)",
      "src/core/b.ts: imports ../cli/cli.ts (src/core must not import src/cli)",
      "src/core/deep/a.ts: imports ../../tui/app/runtime/app.ts (src/core must not import src/tui)",
    ]);
    expect(r.out).not.toContain("boundary check ok");
  });

  test("input mechanisms reject their own facade and runtime App while allowing interaction types", () => {
    const refused = check({
      "src/tui/shell/input/keys/bindings.ts": 'export { DEFAULT_KEYS } from "../keys.ts";',
      "src/tui/shell/input/keys/help.ts": 'import type { App } from "../../../app/runtime/app.ts";',
      "src/tui/shell/input/vim/operators.ts": 'export const load = () => import("../../../app/runtime/app.ts");',
      "src/tui/shell/input/mouse/gestures.ts": 'export type { Mouse } from "../mouse.ts";',
    });
    expect(refused.code).toBe(1);
    expect(refused.err.match(/input mechanism/g)?.length).toBe(4);
    const allowed = check({
      "src/tui/shell/input/vim/grammar.ts":
        'import type { App } from "../../../app/runtime/app.ts"; import { keyChar } from "../keys.ts";',
      "src/tui/shell/input/mouse/gestures.ts":
        'import type { App } from "../../../app/runtime/app.ts"; import { inRect } from "./geometry.ts";',
    });
    expect(allowed.code).toBe(0);
  });

  test("presentation primitives and editing clients cannot load App composition through the checker", () => {
    const r = check({
      "src/core/rendering/layout/code/code.ts": "export interface CodeLayoutOptions {}\n",
      ...Object.fromEntries(
        [
          "contracts",
          "cells/framing",
          "cells/blocks",
          "wrapping/rows",
          "documentation/comments",
          "documentation/layout",
        ].map((name) => [
          `src/core/rendering/layout/code/${name}.ts`,
          `export type { CodeLayoutOptions } from "${name === "contracts" ? "./code.ts" : "../code.ts"}"; ${name === "cells/framing" ? 'export const load = () => import("../page/compose.ts");' : ""}\n`,
        ]),
      ),
      "src/core/documents/syntax/syntax.ts": "export interface Grammar {}\n",
      ...Object.fromEntries(
        [
          "contracts",
          "grammar/assets",
          "grammar/descriptors",
          "grammar/queries",
          "grammar/loader",
          "tree/markup",
          "tree/outline",
          "tree/positions",
          "model/code-model",
          "links/tokens",
        ].map((name) => [
          `src/core/documents/syntax/${name}.ts`,
          `export type { Grammar } from "${name === "contracts" ? "./syntax.ts" : "../syntax.ts"}"; ${name === "grammar/loader" ? 'export const load = () => import("../tree/tree.ts");' : ""}\n`,
        ]),
      ),
      "src/core/rendering/layout/markdown/render.ts": "export interface RenderOptions {}\n",
      ...Object.fromEntries(
        [
          "contracts",
          "render-context",
          "render-html",
          "render-caption",
          "render-inline",
          "render-data",
          "render-table",
          "rows/finish",
          "rows/spacing",
          "nodes/structure",
          "blocks/headings",
          "blocks/code",
          "pictures/layout",
          "blocks/dispatch",
        ].map((name) => [
          `src/core/rendering/layout/markdown/${name}.ts`,
          `export type { RenderOptions } from "${name.includes("/") ? "../render.ts" : "./render.ts"}"; ${name === "rows/finish" ? 'export const load = () => import("../blocks/dispatch.ts");' : name === "nodes/structure" ? 'export const load = () => import("../page/render.ts");' : ""}\n`,
        ]),
      ),
      "src/core/rendering/export/formats/pdf.ts": "export interface Fonts {}\n",
      ...Object.fromEntries(
        [
          "contracts",
          "settings",
          "writing/document",
          "fonts/adapter",
          "layout/breaks",
          "layout/lines",
          "layout/paint",
          "pages/pagination",
          "writing/blocks",
        ].map((name) => [
          `src/core/rendering/export/formats/pdf/${name}.ts`,
          `export type { Fonts } from "${name.includes("/") ? "../../pdf.ts" : "../pdf.ts"}"; ${name === "layout/lines" ? 'export const load = () => import("../writing/blocks.ts");' : name === "fonts/adapter" ? 'export const load = () => import("../writing/writer.ts");' : ""}\n`,
        ]),
      ),
      "src/core/workspace/graph/graph.ts": "export class Graph {}\n",
      ...Object.fromEntries(
        [
          "index/schema",
          "index/storage",
          "moves/reconcile",
          "overlays/editor",
          "queries/indexes",
          "queries/file-links",
          "reach/files",
        ].map((name) => [
          `src/core/workspace/graph/${name}.ts`,
          name === "index/schema"
            ? 'export type { Graph } from "../graph.ts"; export { INDEX_VERSION } from "../graph-extract.ts";\n'
            : 'export type { Graph } from "../graph.ts";\n',
        ]),
      ),
      "src/tui/workspace/git/git.ts": "export class Git {}\n",
      ...Object.fromEntries(
        [
          "marks",
          "state/contracts",
          "state/reads",
          "state/bases",
          "state/staged",
          "views/contracts",
          "views/branches/reads",
          "views/branches/rows",
          "views/panel/presentation",
        ].map((name) => [
          `src/tui/workspace/git/${name}.ts`,
          `export type { Git } from "${name.includes("/") ? "../".repeat(name.split("/").length - 1) : "./"}git"; ${name === "marks" ? 'export type { App } from "../../app/runtime/app";' : ""}\n`,
        ]),
      ),
      "src/tui/workspace/git/views/branches/worktrees.ts":
        'export type { BranchView } from "./gitbranchview"; export const load = () => import("../../../../app/runtime/app");\n',
      "src/tui/workspace/explorer/explorer.ts": "export interface TreeRow {}\n",
      ...Object.fromEntries(
        ["contracts", "rows/files", "rows/paths", "rows/tree", "navigation", "actions/items", "explorer-disk"].map(
          (name) => [
            `src/tui/workspace/explorer/${name}.ts`,
            `export type { TreeRow } from "${name.includes("/") ? "../explorer" : "./explorer"}"; ${name === "rows/tree" ? 'export const load = () => import("../../../app/runtime/app");' : ""}\n`,
          ],
        ),
      ),
      "src/tui/app/runtime/app.ts": "export class App {}\nexport interface View {}\n",
      "src/tui/documents/editing/editable.ts":
        'import type { View } from "../../app/runtime/app.ts";\nexport type Reverse = View;\n',
      "src/tui/documents/editing/editing.ts":
        'import { App } from "../../app/runtime/app.ts";\nexport const reverse = App;\n',
      "src/tui/shell/panels/focus.ts":
        'export type { App } from "../../app/runtime/app.ts";\nimport { Panels } from "./panels";\nexport const owner = Panels;\n',
      "src/tui/shell/screen/topbar/where.ts": 'export * from "../../../workspace/git/views/review/rebase.ts";\n',
      "src/tui/shell/screen/topbar/contracts.ts":
        'import type { App } from "../../../app/runtime/app.ts";\nexport type Reverse = App;\n',
      "src/tui/app/clipboard/clipboard.ts": 'import type { App } from "../runtime/app.ts";\n',
      "src/tui/app/notifications/contracts.ts": 'export type { Message } from "../runtime/app.ts";\n',
      "src/tui/app/notifications/toasts.ts": 'export * from "../runtime/app";\n',
      "src/tui/documents/tools/navigation.ts": 'import("../../app/runtime/app.ts");\n',
      "tests/support/tui/sandbox.ts":
        'import { App } from "../../../src/tui/app/runtime/app.ts";\nexport const reverse = App;\n',
      "src/tui/shell/screen/draw.ts": "export interface Geometry {}\nexport const draw = () => {};\n",
      "src/tui/documents/views/draw-pane.ts":
        'import { draw } from "../../shell/screen/draw.ts";\nexport const paint = draw;\n',
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain("src/core/rendering/layout/markdown/rows/finish.ts: imports ../blocks/dispatch.ts");
    expect(r.err).toContain("src/core/rendering/layout/markdown/nodes/structure.ts: imports ../page/render.ts");
    expect(r.err).toContain("PDF mechanism must not import higher composition, even for types");
    expect(r.err).toContain("src/core/rendering/export/formats/pdf/layout/lines.ts: imports ../writing/blocks.ts");
    expect(r.err).toContain("src/core/rendering/export/formats/pdf/fonts/adapter.ts: imports ../writing/writer.ts");
    for (const name of [
      "contracts",
      "settings",
      "writing/document",
      "fonts/adapter",
      "layout/breaks",
      "layout/lines",
      "layout/paint",
      "pages/pagination",
      "writing/blocks",
    ]) {
      expect(r.err).toContain(`src/core/rendering/export/formats/pdf/${name}.ts: imports`);
    }
    expect(r.err).toContain("Git data mechanism must not import composition, even for types");
    expect(r.err).toContain("marks.ts: imports ../../app/runtime/app");
    for (const name of [
      "marks",
      "state/contracts",
      "state/reads",
      "state/bases",
      "state/staged",
      "views/contracts",
      "views/branches/reads",
      "views/branches/rows",
      "views/panel/presentation",
    ])
      expect(r.err).toContain(`src/tui/workspace/git/${name}.ts: imports`);
    expect(r.err).toContain("worktree client must not import parent composition");
    expect(r.err).toContain("worktree client must not load App composition");
    expect(r.err).toContain("Explorer mechanism must not import composition, even for types");
    expect(r.err).toContain("rows/tree.ts: imports ../../../app/runtime/app");
    for (const name of [
      "contracts",
      "rows/files",
      "rows/paths",
      "rows/tree",
      "navigation",
      "actions/items",
      "explorer-disk",
    ])
      expect(r.err).toContain(`src/tui/workspace/explorer/${name}.ts: imports`);
    expect(r.err).toContain("Markdown mechanism must not import higher composition, even for types");
    for (const name of [
      "contracts",
      "render-context",
      "render-html",
      "render-caption",
      "render-inline",
      "render-data",
      "render-table",
      "rows/finish",
      "rows/spacing",
      "nodes/structure",
      "blocks/headings",
      "blocks/code",
      "pictures/layout",
      "blocks/dispatch",
    ]) {
      expect(r.err).toContain(`src/core/rendering/layout/markdown/${name}.ts: imports`);
    }
    expect(r.err).toContain("syntax mechanism must not import tree composition, even for types");
    for (const name of [
      "contracts",
      "grammar/assets",
      "grammar/descriptors",
      "grammar/queries",
      "grammar/loader",
      "tree/markup",
      "tree/outline",
      "tree/positions",
      "model/code-model",
      "links/tokens",
    ]) {
      expect(r.err).toContain(`src/core/documents/syntax/${name}.ts: imports`);
    }
    expect(r.err).toContain("code-layout helper must not import composition, even for types");
    expect(r.err).toContain("cells/framing.ts: imports ../page/compose.ts");
    for (const name of [
      "contracts",
      "cells/framing",
      "cells/blocks",
      "wrapping/rows",
      "documentation/comments",
      "documentation/layout",
    ])
      expect(r.err).toContain(`src/core/rendering/layout/code/${name}.ts:`);
    expect(r.err).toContain("graph helper must not import composition, even for types");
    expect(r.err).toContain("index/schema.ts: imports ../graph-extract.ts");
    for (const name of [
      "index/schema",
      "index/storage",
      "moves/reconcile",
      "overlays/editor",
      "queries/indexes",
      "queries/file-links",
      "reach/files",
    ])
      expect(r.err).toContain(`src/core/workspace/graph/${name}.ts:`);
    expect(r.err).toContain("presentation primitive must not import composition");
    expect(r.err).toContain("editing client must stay below App composition");
    expect(r.err).toContain("filesystem fixture must stay independent of the TUI model");
    expect(r.err).toContain("drawing client must stay below screen composition");
    for (const file of [
      "src/tui/app/clipboard/clipboard.ts",
      "src/tui/app/notifications/contracts.ts",
      "src/tui/app/notifications/toasts.ts",
      "src/tui/documents/tools/navigation.ts",
      "src/tui/shell/panels/focus.ts",
      "src/tui/shell/screen/topbar/where.ts",
      "src/tui/shell/screen/topbar/contracts.ts",
    ])
      expect(r.err).toContain(`${file}:`);
    expect(r.err).toContain("src/tui/shell/panels/focus.ts: imports ./panels");
    const typed = check({
      "src/tui/app/runtime/app.ts": "export interface App {}\n",
      "src/tui/workspace/git/views/branches/worktrees.ts":
        'import type { App } from "../../../../app/runtime/app.ts"; export type Client = App;\n',
      "src/tui/shell/screen/draw.ts": "export interface Geometry {}\n",
      "src/tui/documents/views/draw-pane.ts":
        'import type { Geometry } from "../../shell/screen/draw.ts";\nexport type Frame = Geometry;\n',
    });
    expect(typed.code).toBe(0);
    expect(typed.err).toBe("");
  });

  test("a tree that keeps the rules passes: the core imported by the CLI, the TUI importing OpenTUI", () => {
    const r = check({
      "src/core/a.ts": 'import { join } from "node:path";\nexport const a = join;\n',
      "src/cli/c.ts": 'import { a } from "../core/a.ts";\nexport const c = a;\n',
      "src/tui/shell/terminal/opentui.ts": 'import "@opentui/core";\nimport { a } from "../../../core/a.ts";\n',
      "src/tuition/t.ts": "export const t = 1;\n", // a folder whose name starts as the TUI's does: not the TUI
      "src/core/d.ts": 'import { t } from "../tuition/t.ts";\n',
    });
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toContain("boundary check ok");
  });

  test("the diagram renderer imported for what runs, outside its worker: reported; its types anywhere (#164)", () => {
    const render = "export type Drawn = { rows: string[] };\nexport const renderText = () => null;\n";
    const r = check({
      "src/core/rendering/media/diagrams/diagram-render.ts": render,
      "src/core/rendering/media/diagrams/diagram-worker.ts":
        'import { renderText } from "./diagram-render.ts";\nexport const w = renderText;\n',
      "src/core/rendering/media/diagrams/diagrams.ts":
        'import type { Drawn } from "./diagram-render.ts";\nexport type { Drawn } from "./diagram-render.ts";\n',
      "src/core/rendering/layout/markdown/render.ts":
        'import { renderText } from "../../media/diagrams/diagram-render.ts";\nexport const l = renderText;\n',
      "src/tui/app/runtime/app.ts":
        'export { renderText } from "../../../core/rendering/media/diagrams/diagram-render.ts";\n',
    });
    expect(r.code).toBe(1);
    expect(
      r.err
        .split("\n")
        .filter((l) => l.startsWith("  "))
        .map((l) => l.trim())
        .sort(),
    ).toEqual([
      "src/core/rendering/layout/markdown/render.ts: imports ../../media/diagrams/diagram-render.ts (only src/core/rendering/media/diagrams/diagram-worker.ts may: it runs there alone)",
      "src/tui/app/runtime/app.ts: imports ../../../core/rendering/media/diagrams/diagram-render.ts (only src/core/rendering/media/diagrams/diagram-worker.ts may: it runs there alone)",
    ]);
  });
});
