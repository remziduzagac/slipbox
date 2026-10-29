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

  test("export encoding rejects dispatch and format imports while retaining its bounded sink", () => {
    for (const source of [
      'import { streamExport } from "./stream.ts"; streamExport;',
      'export type { ExportFormat } from "./index.ts";',
      'export const load = () => import("./formats/html.ts");',
    ]) {
      const refused = check({ "src/core/rendering/export/encoding.ts": source });
      expect(refused.code).toBe(1);
      expect(refused.err).toContain("export encoding must stay below dispatch and formats");
    }
    expect(
      check({
        "src/core/rendering/export/encoding.ts":
          'import { EXPORT_CHUNK, type ExportSink } from "./spool.ts"; export const size = EXPORT_CHUNK;',
      }).code,
    ).toBe(0);
  });

  test("editing-context helpers reject controller and runtime App imports while retaining capabilities", () => {
    const refused = check({
      "src/tui/documents/editing/lens/contracts.ts": 'export type { LiveBase } from "../lens.ts";',
      "src/tui/documents/editing/completion/context.ts": 'export const load = () => import("../completion.ts");',
      "src/tui/documents/editing/completion/items.ts":
        'import { App } from "../../../app/runtime/app.ts"; export const f = App;',
    });
    expect(refused.code).toBe(1);
    expect(refused.err.match(/editing-context helper/g)?.length).toBe(3);
    expect(
      check({
        "src/tui/documents/editing/completion/context.ts": 'import type { View } from "../../../app/runtime/app.ts";',
        "src/tui/documents/editing/lens/visibility.ts":
          'import type { Layout } from "../../../../core/rendering/layout/ir.ts";',
      }).code,
    ).toBe(0);
  });

  test("navigation helpers reject facades, upper peek tiers and runtime App while retaining capabilities", () => {
    const refused = check({
      "src/tui/documents/navigation/peek/contracts.ts": 'export type { Peek } from "../peek.ts";',
      "src/tui/documents/navigation/peek/presentation.ts": 'export const load = () => import("./opening.ts");',
      "src/tui/documents/views/layout/anchors.ts": 'export { Views } from "../views.ts";',
      "src/tui/actions/documents/links/anchors.ts": 'export { linkActions } from "../actions-links.ts";',
      "src/tui/documents/navigation/peek/state.ts":
        'import { App } from "../../../app/runtime/app.ts"; export const f = App;',
    });
    expect(refused.code).toBe(1);
    expect(refused.err.match(/navigation helper/g)?.length).toBe(5);
    expect(
      check({
        "src/tui/documents/navigation/peek/opening.ts":
          'import { peekTitle } from "./presentation.ts"; export const f = peekTitle;',
        "src/tui/documents/views/layout/anchors.ts": 'import type { View } from "../../../app/runtime/app.ts";',
      }).code,
    ).toBe(0);
  });

  test("source-editing helpers reject facade, upper tiers and runtime App while retaining capabilities", () => {
    const refused = check({
      "src/tui/documents/editing/source/position.ts": 'export { insertKey } from "../editing.ts";',
      "src/tui/documents/editing/source/text.ts": 'export const load = () => import("./keyboard.ts");',
      "src/tui/documents/editing/source/policy.ts":
        'import { App } from "../../../app/runtime/app.ts"; export const f = App;',
    });
    expect(refused.code).toBe(1);
    expect(refused.err.match(/source-editing helper/g)?.length).toBe(3);
    expect(
      check({
        "src/tui/documents/editing/source/keyboard.ts": 'import type { App } from "../../../app/runtime/app.ts";',
        "src/tui/documents/editing/source/text.ts":
          'import { offsetOf } from "./position.ts"; export const f = offsetOf;',
      }).code,
    ).toBe(0);
  });

  test("buffer-layout helpers reject runtime owners while retaining buffer and App types", () => {
    const refused = check({
      "src/tui/documents/buffers/layout/source.ts":
        'import { NoteBuffer } from "../buffer.ts"; export const f = NoteBuffer;',
      "src/tui/documents/buffers/layout/code.ts": 'export const load = () => import("../buffer.ts");',
      "src/tui/documents/buffers/layout/note.ts": 'export { App } from "../../../app/runtime/app.ts";',
    });
    expect(refused.code).toBe(1);
    expect(refused.err.match(/buffer-layout helper/g)?.length).toBe(3);
    expect(
      check({
        "src/tui/documents/buffers/layout/contracts.ts": 'import type { NoteBuffer } from "../buffer.ts";',
        "src/tui/documents/buffers/layout/source.ts": 'export type { View } from "../../../app/runtime/app.ts";',
      }).code,
    ).toBe(0);
  });

  test("diagnostics helpers reject controllers and process owners but retain App types", () => {
    const refused = check({
      "src/tui/documents/diagnostics/problems/rows.ts": 'export type { Problems } from "../problems.ts";',
      "src/tui/documents/diagnostics/languages/workspace-edits.ts":
        'export const load = () => import("../languages.ts");',
      "src/tui/documents/diagnostics/languages/symbols.ts":
        'import { App } from "../../../app/runtime/app.ts"; export const f = App;',
      "src/tui/documents/diagnostics/languages/locations.ts":
        'export { ServerManager } from "../../../../core/documents/servers/manager.ts";',
    });
    expect(refused.code).toBe(1);
    expect(refused.err.match(/diagnostics helper/g)?.length).toBe(4);
    expect(
      check({
        "src/tui/documents/diagnostics/languages/locations.ts":
          'import type { View } from "../../../app/runtime/app.ts";',
        "src/tui/documents/diagnostics/problems/rows.ts": 'import type { ProblemRow } from "./contracts.ts";',
      }).code,
    ).toBe(0);
  });

  test("drawing owners reject composition and runtime App while geometry retains view types", () => {
    const refused = check({
      "src/tui/documents/views/drawing/lines.ts": 'export type { Geometry } from "../../../shell/screen/draw.ts";',
      "src/tui/shell/overlays/drawing/which-key.ts": 'export const load = () => import("../draw-overlays.ts");',
      "src/tui/shell/panels/drawing/selection.ts": 'import type { SidePaneState } from "../../../app/runtime/app.ts";',
      "src/tui/windows/drawing/tabs.ts": 'import { App } from "../../app/runtime/app.ts"; export const f = App;',
    });
    expect(refused.code).toBe(1);
    expect(refused.err.match(/drawing owner/g)?.length).toBe(4);
    expect(
      check({
        "src/tui/shell/screen/geometry/contracts.ts": 'import type { View } from "../../../app/runtime/app.ts";',
        "src/tui/documents/tools/outline/draw.ts":
          'import { followSelection } from "../../../shell/panels/drawing/selection.ts"; export const f = followSelection;',
      }).code,
    ).toBe(0);
  });

  test("rename mechanisms reject facade, effect and reverse collection imports", () => {
    const refused = check({
      "src/core/workspace/mutations/rename/planning/files.ts": 'export type { RenamePlan } from "../rename-plan.ts";',
      "src/core/workspace/mutations/rename/planning/move.ts": 'export const load = () => import("../rename-apply.ts");',
      "src/core/workspace/mutations/rename/collecting/collector.ts": 'export { planMove } from "../planning/move.ts";',
      "src/core/workspace/mutations/rename/rewriting/links.ts": 'export { planRelink } from "../rename.ts";',
    });
    expect(refused.code).toBe(1);
    expect(refused.err.match(/rename mechanism/g)?.length).toBe(4);
    expect(
      check({
        "src/core/workspace/mutations/rename/planning/files.ts":
          'import type { RenamePlan } from "../collecting/contracts.ts";',
        "src/core/workspace/mutations/rename/collecting/collector.ts":
          'import { replaceAt } from "../rename-links.ts"; export const f = replaceAt;',
      }).code,
    ).toBe(0);
  });

  test("search mechanisms reject workspace composition and runtime SQLite or App", () => {
    const refused = check({
      "src/core/workspace/search/query/parsing.ts": 'export type { SearchQuery } from "../search.ts";',
      "src/core/workspace/search/execution/scan.ts": 'export const load = () => import("../search-index.ts");',
      "src/tui/documents/search/find.ts": 'export { computeFind } from "../../workspace/search/search.ts";',
      "src/tui/documents/search/controls.ts": 'import { App } from "../../app/runtime/app.ts"; export const f = App;',
    });
    expect(refused.code).toBe(1);
    expect(refused.err.match(/search mechanism/g)?.length).toBe(3);
    expect(refused.err).toContain("editing client must stay below App composition");
    expect(
      check({
        "src/core/workspace/search/execution/search.ts": 'import type { SearchIndex } from "../search-index.ts";',
        "src/tui/documents/search/find.ts": 'import type { FindState } from "../../app/runtime/app.ts";',
        "src/tui/documents/search/controls.ts":
          'import { computeFind } from "./find.ts"; export const f = computeFind;',
      }).code,
    ).toBe(0);
  });

  test("walk and watcher helpers reject composition and accept lower domain records", () => {
    const refused = check({
      "src/core/workspace/walk/filtering/filter.ts": 'export type { FilterSettings } from "../walk.ts";',
      "src/core/workspace/graph/watch/directories.ts": 'export const load = () => import("../watch.ts");',
      "src/core/workspace/graph/watch/io.ts": 'import { under } from "../../vaults/home.ts"; export const f = under;',
      "src/core/workspace/vaults/home/cache.ts":
        'import { homeFilter } from "../home.ts"; export const f = homeFilter;',
    });
    expect(refused.code).toBe(1);
    expect(refused.err.match(/walk\/watch mechanism/g)?.length).toBe(4);
    expect(
      check({
        "src/core/workspace/walk/filtering/filter.ts": 'import type { FilterSettings } from "../contracts.ts";',
        "src/core/workspace/graph/watch/directories.ts": 'import type { DirectoryOptions } from "./contracts.ts";',
        "src/core/workspace/vaults/home/cache.ts": 'import { homeFilter } from "./filter.ts";',
      }).code,
    ).toBe(0);
  });

  test("parsing mechanisms reject reverse facade edges and accept lower contracts", () => {
    const refused = check({
      "src/core/application/config/defaults.ts": 'export type { Config } from "./config.ts";',
      "src/core/documents/model/data/readers/toml.ts": 'export const load = () => import("../../data.ts");',
      "src/core/documents/model/data/outline.ts":
        'import { slugify } from "../../markdown/parse.ts"; export const f = slugify;',
      "src/core/documents/markdown/parse/transforms.ts": 'import { visit } from "../parse.ts"; export const f = visit;',
    });
    expect(refused.code).toBe(1);
    expect(refused.err.match(/parsing mechanism/g)?.length).toBe(4);
    expect(
      check({
        "src/core/application/config/defaults.ts": 'import type { Config } from "./contracts.ts";',
        "src/core/documents/model/data/readers/toml.ts": 'import { heading } from "../nodes.ts";',
        "src/core/documents/markdown/parse/transforms.ts": 'import { visit } from "./visit.ts";',
      }).code,
    ).toBe(0);
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
