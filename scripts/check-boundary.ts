#!/usr/bin/env bun
// Plan 0.3: the core must never import the TUI (or OpenTUI). The CLI face must run without a
// terminal renderer, and this check is the only thing that keeps that true.
//
// Rules, by directory:
//   src/core/  may not import src/tui/, src/cli/, or @opentui/*
//   src/cli/   may not import src/tui/ or @opentui/*
// src/main.ts may import src/tui/ lazily — the dynamic import is how the CLI avoids loading it.
// And by module: what runs only in a worker is imported, for more than its types, by that worker alone.
// And by the slow-disk workstream's inventory (SD-D12): its files read the disk through the seam, or say why not.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const RULES: Record<string, string[]> = {
  "src/core": ["src/tui", "src/cli", "@opentui"],
  "src/cli": ["src/tui", "@opentui"],
};

/** Modules only some files may import, but for types: the diagram library draws in its worker alone (#164), since a
 *  diagram it never finished, drawn on the screen's thread, froze slipbox. */
export const OWNERS: Record<string, string[]> = {
  "src/core/rendering/media/diagrams/diagram-render.ts": ["src/core/rendering/media/diagrams/diagram-worker.ts"],
};

// `… from "x"`, `import("x")`, `require("x")`, and a side-effect `import "x"`.
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;

/** What a file's text imports, by the specifiers as written. */
export function importsOf(text: string): string[] {
  return [...text.matchAll(IMPORT)].map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4])!);
}

/** What a file's text imports for what runs: `importsOf`, less `import type` and `export type`, which load nothing. */
export function valueImportsOf(text: string): string[] {
  return [...text.matchAll(IMPORT)]
    .filter((m) => !/^(?:import|export)\s+type\s/.test(m[0]))
    .map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4])!);
}

/** Area catalogs may depend on contracts, never on the list that composes them, even for types (ORG-T1). */
export function commandViolations(from: string, text: string): string[] {
  const root = "src/core/application/commands/";
  const contract = from === `${root}contracts.ts`;
  if (!contract && !from.startsWith(`${root}areas/`)) return [];
  return importsOf(text).flatMap((spec) => {
    const target = spec.startsWith(".") ? relative(ROOT, resolve(ROOT, dirname(from), spec)) : spec;
    const composer = target === `${root}catalog` || target === `${root}catalog.ts`;
    return composer || contract
      ? [
          `${from}: imports ${spec} (${contract ? "contract must be independent" : "catalog must not import its composer"})`,
        ]
      : [];
  });
}

/** Shared trash/marker storage must not depend on the mutation orchestration that calls it (ORG-T13). */
export function mutationViolations(from: string, text: string): string[] {
  const root = "src/core/workspace/mutations";
  if (from !== `${root}/trash.ts`) return [];
  return importsOf(text).flatMap((spec) => {
    const target = spec.startsWith(".") ? relative(ROOT, resolve(ROOT, dirname(from), spec)) : spec;
    return target === root || target.startsWith(`${root}/`)
      ? [`${from}: imports ${spec} (shared trash/marker storage must not import mutation orchestration)`]
      : [];
  });
}

/** Extracted graph mechanisms stay below the stateful Graph/LinkResolver composition (ORG-T25). */
export const GRAPH_PRIMITIVES = [
  "src/core/workspace/graph/index/schema.ts",
  "src/core/workspace/graph/index/storage.ts",
  "src/core/workspace/graph/moves/reconcile.ts",
  "src/core/workspace/graph/overlays/editor.ts",
  "src/core/workspace/graph/queries/indexes.ts",
  "src/core/workspace/graph/queries/file-links.ts",
  "src/core/workspace/graph/reach/files.ts",
] as const;

export function graphCompositionViolations(from: string, text: string): string[] {
  if (!(GRAPH_PRIMITIVES as readonly string[]).includes(from)) return [];
  return importsOf(text).flatMap((spec) => {
    const target = targetOf(from, spec);
    const composition =
      target === "src/core/workspace/graph/graph" || target === "src/core/workspace/graph/graph-resolve";
    const schemaCycle =
      from === "src/core/workspace/graph/index/schema.ts" && target === "src/core/workspace/graph/graph-extract";
    return composition || schemaCycle
      ? [`${from}: imports ${spec} (graph helper must not import composition, even for types)`]
      : [];
  });
}

/** Release discovery does not import upgrade/process composition (ORG-T39). */
export function releaseDiscoveryViolations(from: string, text: string): string[] {
  if (from !== "src/core/application/distribution/updates/discovery.ts") return [];
  const owners = ["update", "restart", "skill-lifecycle"].map((name) => `src/core/application/distribution/${name}`);
  return importsOf(text).flatMap((spec) =>
    owners.includes(targetOf(from, spec))
      ? [`${from}: imports ${spec} (release discovery must stay below upgrade composition)`]
      : [],
  );
}

/** Semantic role vocabulary stays below theme loading and construction (ORG-T39). */
export function themeVocabularyViolations(from: string, text: string): string[] {
  if (from !== "src/core/rendering/theme/roles.ts") return [];
  const owners = ["theme", "index", "base16", "builtin", "tokyo-night", "glyphs"].map(
    (name) => `src/core/rendering/theme/${name}`,
  );
  return importsOf(text).flatMap((spec) =>
    owners.includes(targetOf(from, spec))
      ? [`${from}: imports ${spec} (theme vocabulary must stay below construction and loading)`]
      : [],
  );
}

/** Client contracts and protocol adapters stay below process ownership (ORG-T39). */
export const SERVER_PROTOCOL_HELPERS = [
  "src/core/documents/servers/client/contracts.ts",
  "src/core/documents/servers/client/protocol.ts",
] as const;

export function serverProtocolViolations(from: string, text: string): string[] {
  if (!(SERVER_PROTOCOL_HELPERS as readonly string[]).includes(from)) return [];
  const owners = ["client", "manager", "transport"].map((name) => `src/core/documents/servers/${name}`);
  return importsOf(text).flatMap((spec) =>
    owners.includes(targetOf(from, spec))
      ? [`${from}: imports ${spec} (server protocol helper must stay below process lifecycle)`]
      : [],
  );
}

/** UTF-8 output is below dispatch, formats and export orchestration (ORG-T39). */
export function exportEncodingViolations(from: string, text: string): string[] {
  if (from !== "src/core/rendering/export/encoding.ts") return [];
  const root = "src/core/rendering/export/";
  const composers = ["stream", "index", "jobs", "assemble", "export-worker"];
  return importsOf(text).flatMap((spec) => {
    const target = targetOf(from, spec);
    return composers.some((name) => target === root + name) || target.startsWith(`${root}formats/`)
      ? [`${from}: imports ${spec} (export encoding must stay below dispatch and formats)`]
      : [];
  });
}

/** Lens/completion mechanisms use explicit inputs below their controllers and App runtime (ORG-T38). */
export const EDITING_CONTEXT_HELPERS = [
  "src/tui/documents/editing/lens/contracts.ts",
  "src/tui/documents/editing/lens/visibility.ts",
  "src/tui/documents/editing/completion/contracts.ts",
  "src/tui/documents/editing/completion/context.ts",
  "src/tui/documents/editing/completion/items.ts",
] as const;

export function editingContextViolations(from: string, text: string): string[] {
  if (!(EDITING_CONTEXT_HELPERS as readonly string[]).includes(from)) return [];
  const owners = ["src/tui/documents/editing/lens", "src/tui/documents/editing/completion"];
  return [
    ...importsOf(text).flatMap((spec) =>
      owners.includes(targetOf(from, spec))
        ? [`${from}: imports ${spec} (editing-context helper must stay below controller)`]
        : [],
    ),
    ...new Bun.Transpiler({ loader: "ts" })
      .scanImports(text)
      .flatMap(({ path }) =>
        targetOf(from, path) === "src/tui/app/runtime/app"
          ? [`${from}: imports ${path} (editing-context helper must not load App composition)`]
          : [],
      ),
  ];
}

/** Navigation/layout helpers stay below their public facades and App runtime composition (ORG-T38). */
export const NAVIGATION_HELPERS = [
  "src/tui/documents/navigation/peek/contracts.ts",
  "src/tui/documents/navigation/peek/state.ts",
  "src/tui/documents/navigation/peek/paths.ts",
  "src/tui/documents/navigation/peek/presentation.ts",
  "src/tui/documents/navigation/peek/probe.ts",
  "src/tui/documents/navigation/peek/synchronization.ts",
  "src/tui/documents/navigation/peek/opening.ts",
  "src/tui/documents/navigation/peek/history.ts",
  "src/tui/documents/views/layout/widths.ts",
  "src/tui/documents/views/layout/tasks.ts",
  "src/tui/documents/views/layout/selection.ts",
  "src/tui/documents/views/layout/anchors.ts",
  "src/tui/actions/documents/links/anchors.ts",
] as const;

export const PEEK_TIERS: Record<string, number> = {
  contracts: 0,
  probe: 0,
  state: 1,
  paths: 1,
  presentation: 1,
  synchronization: 2,
  opening: 3,
  history: 4,
};

export function navigationHelperViolations(from: string, text: string): string[] {
  if (!(NAVIGATION_HELPERS as readonly string[]).includes(from)) return [];
  const owners = [
    "src/tui/documents/navigation/peek",
    "src/tui/documents/views/views",
    "src/tui/actions/documents/actions-links",
    "src/tui/actions/actions",
  ];
  const root = "src/tui/documents/navigation/peek/";
  const tier = from.startsWith(root) ? PEEK_TIERS[from.slice(root.length).replace(/\.ts$/, "")] : undefined;
  return [
    ...importsOf(text).flatMap((spec) => {
      const target = targetOf(from, spec);
      const other = target.startsWith(root) ? PEEK_TIERS[target.slice(root.length)] : undefined;
      return owners.includes(target) || (tier !== undefined && other !== undefined && other > tier)
        ? [`${from}: imports ${spec} (navigation helper must stay below facade and higher coordination)`]
        : [];
    }),
    ...new Bun.Transpiler({ loader: "ts" })
      .scanImports(text)
      .flatMap(({ path }) =>
        targetOf(from, path) === "src/tui/app/runtime/app"
          ? [`${from}: imports ${path} (navigation helper must not load App composition)`]
          : [],
      ),
  ];
}

/** Source-editing mechanisms stay below the public facade and higher coordination tiers (ORG-T38). */
export const SOURCE_EDITING_TIERS: Record<string, number> = {
  position: 0,
  policy: 0,
  text: 1,
  lifecycle: 2,
  newline: 2,
  deleting: 2,
  lines: 2,
  selection: 2,
  keyboard: 3,
};

export function sourceEditingViolations(from: string, text: string): string[] {
  const root = "src/tui/documents/editing/source/";
  const name = from.startsWith(root) ? from.slice(root.length).replace(/\.ts$/, "") : "";
  if (!Object.hasOwn(SOURCE_EDITING_TIERS, name)) return [];
  return [
    ...importsOf(text).flatMap((spec) => {
      const target = targetOf(from, spec);
      const tier = target.startsWith(root) ? SOURCE_EDITING_TIERS[target.slice(root.length)] : undefined;
      return target === "src/tui/documents/editing/editing" ||
        (tier !== undefined && tier > SOURCE_EDITING_TIERS[name]!)
        ? [`${from}: imports ${spec} (source-editing helper must stay below facade and higher coordination)`]
        : [];
    }),
    ...new Bun.Transpiler({ loader: "ts" })
      .scanImports(text)
      .flatMap(({ path }) =>
        targetOf(from, path) === "src/tui/app/runtime/app"
          ? [`${from}: imports ${path} (source-editing helper must not load App composition)`]
          : [],
      ),
  ];
}

/** Buffer layouts keep cache capabilities below the buffer and App runtime owners (ORG-T38). */
export const BUFFER_LAYOUT_HELPERS = [
  "src/tui/documents/buffers/layout/contracts.ts",
  "src/tui/documents/buffers/layout/source.ts",
  "src/tui/documents/buffers/layout/code.ts",
  "src/tui/documents/buffers/layout/note.ts",
] as const;

export function bufferLayoutViolations(from: string, text: string): string[] {
  if (!(BUFFER_LAYOUT_HELPERS as readonly string[]).includes(from)) return [];
  const owners = ["src/tui/documents/buffers/buffer", "src/tui/app/runtime/app"];
  return new Bun.Transpiler({ loader: "ts" })
    .scanImports(text)
    .flatMap(({ path }) =>
      owners.includes(targetOf(from, path))
        ? [`${from}: imports ${path} (buffer-layout helper must not load buffer or App composition)`]
        : [],
    );
}

/** Diagnostics helpers retain explicit inputs, below controller and process ownership (ORG-T37). */
export const DIAGNOSTICS_HELPERS = [
  "src/tui/documents/diagnostics/problems/contracts.ts",
  "src/tui/documents/diagnostics/problems/rows.ts",
  "src/tui/documents/diagnostics/languages/workspace-edits.ts",
  "src/tui/documents/diagnostics/languages/locations.ts",
  "src/tui/documents/diagnostics/languages/symbols.ts",
] as const;

export function diagnosticsHelperViolations(from: string, text: string): string[] {
  if (!(DIAGNOSTICS_HELPERS as readonly string[]).includes(from)) return [];
  const owners = [
    "src/tui/documents/diagnostics/problems",
    "src/tui/documents/diagnostics/languages",
    "src/core/documents/servers/manager",
    "src/core/documents/syntax/syntax-thread",
  ];
  return [
    ...importsOf(text).flatMap((spec) =>
      owners.includes(targetOf(from, spec))
        ? [`${from}: imports ${spec} (diagnostics helper must stay below controller and process ownership)`]
        : [],
    ),
    ...new Bun.Transpiler({ loader: "ts" })
      .scanImports(text)
      .flatMap(({ path }) =>
        targetOf(from, path) === "src/tui/app/runtime/app"
          ? [`${from}: imports ${path} (diagnostics helper must not load App composition)`]
          : [],
      ),
  ];
}

/** Code-layout mechanisms depend on explicit inputs, never their page or public-entry composition (ORG-T26). */
export const CODE_LAYOUT_PRIMITIVES = [
  "src/core/rendering/layout/code/contracts.ts",
  "src/core/rendering/layout/code/cells/framing.ts",
  "src/core/rendering/layout/code/cells/blocks.ts",
  "src/core/rendering/layout/code/wrapping/rows.ts",
  "src/core/rendering/layout/code/documentation/comments.ts",
  "src/core/rendering/layout/code/documentation/layout.ts",
] as const;

export function codeLayoutViolations(from: string, text: string): string[] {
  if (!(CODE_LAYOUT_PRIMITIVES as readonly string[]).includes(from)) return [];
  return importsOf(text).flatMap((spec) => {
    const target = targetOf(from, spec);
    return target === "src/core/rendering/layout/code/code" || target === "src/core/rendering/layout/code/page/compose"
      ? [`${from}: imports ${spec} (code-layout helper must not import composition, even for types)`]
      : [];
  });
}

/** Syntax mechanisms never depend on the public facade or tree ownership (ORG-T27). */
export const SYNTAX_PRIMITIVES = [
  "src/core/documents/syntax/contracts.ts",
  "src/core/documents/syntax/grammar/assets.ts",
  "src/core/documents/syntax/grammar/descriptors.ts",
  "src/core/documents/syntax/grammar/queries.ts",
  "src/core/documents/syntax/grammar/loader.ts",
  "src/core/documents/syntax/tree/markup.ts",
  "src/core/documents/syntax/tree/outline.ts",
  "src/core/documents/syntax/tree/positions.ts",
  "src/core/documents/syntax/model/code-model.ts",
  "src/core/documents/syntax/links/tokens.ts",
] as const;

export function syntaxViolations(from: string, text: string): string[] {
  if (!(SYNTAX_PRIMITIVES as readonly string[]).includes(from)) return [];
  return importsOf(text).flatMap((spec) => {
    const target = targetOf(from, spec);
    return target === "src/core/documents/syntax/syntax" || target === "src/core/documents/syntax/tree/tree"
      ? [`${from}: imports ${spec} (syntax mechanism must not import tree composition, even for types)`]
      : [];
  });
}

/** Markdown mechanisms remain below public/page composition; leaves also stay below block dispatch (ORG-T28). */
export const MARKDOWN_MECHANISMS = [
  "src/core/rendering/layout/markdown/contracts.ts",
  "src/core/rendering/layout/markdown/render-context.ts",
  "src/core/rendering/layout/markdown/render-html.ts",
  "src/core/rendering/layout/markdown/render-caption.ts",
  "src/core/rendering/layout/markdown/render-inline.ts",
  "src/core/rendering/layout/markdown/render-data.ts",
  "src/core/rendering/layout/markdown/render-table.ts",
  "src/core/rendering/layout/markdown/rows/finish.ts",
  "src/core/rendering/layout/markdown/rows/spacing.ts",
  "src/core/rendering/layout/markdown/nodes/structure.ts",
  "src/core/rendering/layout/markdown/blocks/headings.ts",
  "src/core/rendering/layout/markdown/blocks/code.ts",
  "src/core/rendering/layout/markdown/pictures/layout.ts",
  "src/core/rendering/layout/markdown/blocks/dispatch.ts",
] as const;

export function markdownViolations(from: string, text: string): string[] {
  if (!(MARKDOWN_MECHANISMS as readonly string[]).includes(from)) return [];
  return importsOf(text).flatMap((spec) => {
    const target = targetOf(from, spec);
    const block = "src/core/rendering/layout/markdown/blocks/dispatch";
    return target === "src/core/rendering/layout/markdown/render" ||
      target === "src/core/rendering/layout/markdown/page/render" ||
      (from !== `${block}.ts` && target === block)
      ? [`${from}: imports ${spec} (Markdown mechanism must not import higher composition, even for types)`]
      : [];
  });
}

/** Region-owned drawing stays below screen/pane/overlay/panel composition (ORG-T36). */
export const DRAWING_OWNERS = [
  "src/tui/documents/diagnostics/draw-problems.ts",
  "src/tui/documents/tools/footnotes/draw.ts",
  "src/tui/documents/tools/info/draw.ts",
  "src/tui/documents/tools/outline/draw.ts",
  "src/tui/documents/views/draw-header.ts",
  "src/tui/documents/views/drawing/breadcrumb.ts",
  "src/tui/documents/views/drawing/chrome/cursor.ts",
  "src/tui/documents/views/drawing/chrome/popups.ts",
  "src/tui/documents/views/drawing/chrome/scrollbars.ts",
  "src/tui/documents/views/drawing/lines.ts",
  "src/tui/documents/views/drawing/marks/git.ts",
  "src/tui/documents/views/drawing/marks/links.ts",
  "src/tui/documents/views/drawing/marks/problems.ts",
  "src/tui/documents/views/drawing/pane.ts",
  "src/tui/documents/views/drawing/pictures.ts",
  "src/tui/shell/overlays/drawing/common/labels.ts",
  "src/tui/shell/overlays/drawing/dialogs/choices.ts",
  "src/tui/shell/overlays/drawing/dialogs/prompt.ts",
  "src/tui/shell/overlays/drawing/dialogs/save-as.ts",
  "src/tui/shell/overlays/drawing/floating.ts",
  "src/tui/shell/overlays/drawing/lists/footer.ts",
  "src/tui/shell/overlays/drawing/lists/list.ts",
  "src/tui/shell/overlays/drawing/menus.ts",
  "src/tui/shell/overlays/drawing/which-key.ts",
  "src/tui/shell/panels/drawing/chrome.ts",
  "src/tui/shell/panels/drawing/rows.ts",
  "src/tui/shell/panels/drawing/selection.ts",
  "src/tui/shell/panels/drawing/tree.ts",
  "src/tui/shell/screen/frame/drawing.ts",
  "src/tui/shell/screen/geometry/contracts.ts",
  "src/tui/shell/screen/statusbar/draw-status.ts",
  "src/tui/windows/drawing/content.ts",
  "src/tui/windows/drawing/tabs.ts",
  "src/tui/workspace/explorer/drawing/panel.ts",
  "src/tui/workspace/git/views/panel/draw-git.ts",
  "src/tui/workspace/history/drawing/panel.ts",
] as const;

export function drawingOwnerViolations(from: string, text: string): string[] {
  if (!(DRAWING_OWNERS as readonly string[]).includes(from)) return [];
  const composers = [
    "src/tui/shell/screen/draw",
    "src/tui/documents/views/draw-pane",
    "src/tui/shell/overlays/draw-overlays",
    "src/tui/shell/panels/draw-panels",
  ];
  const app = "src/tui/app/runtime/app";
  const pureSelection = from === "src/tui/shell/panels/drawing/selection.ts";
  const failures = importsOf(text).flatMap((spec) =>
    composers.includes(targetOf(from, spec)) || (pureSelection && targetOf(from, spec) === app)
      ? [`${from}: imports ${spec} (drawing owner must use lower contracts, even for types)`]
      : [],
  );
  if (!pureSelection)
    for (const { path } of new Bun.Transpiler({ loader: "ts" }).scanImports(text))
      if (targetOf(from, path) === app)
        failures.push(`${from}: imports ${path} (drawing owner must not load App at runtime)`);
  return failures;
}

/** Rename planning and collection stay below public/effect composition (ORG-T35). */
export function renameMechanismViolations(from: string, text: string): string[] {
  const base = "src/core/workspace/mutations/rename/";
  if (!/^src\/core\/workspace\/mutations\/rename\/(?:planning|rewriting|collecting)\//.test(from)) return [];
  const higher = ["rename", "rename-plan", "rename-apply", "rename-vaults", "rename-heading"].map(
    (name) => base + name,
  );
  return importsOf(text).flatMap((spec) => {
    const target = targetOf(from, spec);
    const reverse =
      from.startsWith(`${base}collecting/`) &&
      (target.startsWith(`${base}planning/`) || target.startsWith(`${base}rewriting/`));
    return higher.includes(target) || reverse
      ? [`${from}: imports ${spec} (rename mechanism must not import planning/effect composition, even for types)`]
      : [];
  });
}

/** Search mechanisms use lower owners; pure query/scan/location never load the SQLite adapter (ORG-T34). */
export function searchMechanismViolations(from: string, text: string): string[] {
  const core = /^src\/core\/workspace\/search\/(?:model|query|matching|execution|indexing)\//.test(from);
  const document = /^src\/tui\/documents\/search\/(?:find|controls)\.ts$/.test(from);
  const facade = core ? "src/core/workspace/search/search" : "src/tui/workspace/search/search";
  const failures =
    core || document
      ? importsOf(text).flatMap((spec) =>
          targetOf(from, spec) === facade
            ? [`${from}: imports ${spec} (search mechanism must not import composition, even for types)`]
            : [],
        )
      : [];
  if (core && from !== "src/core/workspace/search/indexing/files.ts") {
    const values = new Bun.Transpiler({ loader: "ts" }).scanImports(text);
    for (const { path } of values)
      if (
        ["src/core/workspace/search/search-index", "src/core/foundation/platform/sqlite"].includes(targetOf(from, path))
      )
        failures.push(`${from}: imports ${path} (search mechanism must not load SQLite)`);
  }
  return failures;
}

/** Walk/watch/home mechanisms stay below their public composition entries (ORG-T33). */
export function walkingMechanismViolations(from: string, text: string): string[] {
  const walk = "src/core/workspace/walk/walk";
  const home = "src/core/workspace/vaults/home";
  const watch = "src/core/workspace/graph/watch";
  const parents =
    /^src\/core\/workspace\/walk\/(?:filtering|traversal|io)\//.test(from) ||
    from === "src/core/workspace/walk/contracts.ts"
      ? [walk]
      : from.startsWith(`${watch}/`)
        ? [watch, walk, home]
        : from.startsWith(`${home}/`)
          ? [home, walk]
          : [];
  return importsOf(text).flatMap((spec) =>
    parents.includes(targetOf(from, spec))
      ? [`${from}: imports ${spec} (walk/watch mechanism must use lower owners, even for types)`]
      : [],
  );
}

/** Parsing mechanisms use contracts/helpers below their own dispatch facade (ORG-T32). */
export function parsingMechanismViolations(from: string, text: string): string[] {
  const facades =
    from.startsWith("src/core/application/config/") && from !== "src/core/application/config/config.ts"
      ? ["src/core/application/config/config"]
      : from.startsWith("src/core/documents/model/data/")
        ? ["src/core/documents/model/data", "src/core/documents/markdown/parse"]
        : from.startsWith("src/core/documents/markdown/parse/")
          ? ["src/core/documents/markdown/parse"]
          : [];
  return importsOf(text).flatMap((spec) =>
    facades.includes(targetOf(from, spec))
      ? [`${from}: imports ${spec} (parsing mechanism must not import its dispatch facade, even for types)`]
      : [],
  );
}

/** Extracted input mechanisms never reach their own facade or load App composition (ORG-T31). */
export function inputMechanismViolations(from: string, text: string): string[] {
  const area = /^src\/tui\/shell\/input\/(keys|vim|mouse)\//.exec(from)?.[1];
  if (!area) return [];
  const facade = `src/tui/shell/input/${area}`;
  const app = "src/tui/app/runtime/app";
  return [
    ...importsOf(text).flatMap((spec) => {
      const target = targetOf(from, spec);
      return target === facade || (area === "keys" && target === app)
        ? [`${from}: imports ${spec} (input mechanism must stay below composition)`]
        : [];
    }),
    ...new Bun.Transpiler({ loader: "ts" })
      .scanImports(text)
      .flatMap(({ path }) =>
        area !== "keys" && targetOf(from, path) === app
          ? [`${from}: imports ${path} (input mechanism must not load App composition)`]
          : [],
      ),
  ];
}

/** Git data/cache/presentation mechanisms stay below their controllers (ORG-T30). */
export const GIT_DATA_MECHANISMS = [
  "src/tui/workspace/git/marks.ts",
  "src/tui/workspace/git/state/contracts.ts",
  "src/tui/workspace/git/state/reads.ts",
  "src/tui/workspace/git/state/bases.ts",
  "src/tui/workspace/git/state/staged.ts",
  "src/tui/workspace/git/views/contracts.ts",
  "src/tui/workspace/git/views/branches/reads.ts",
  "src/tui/workspace/git/views/branches/rows.ts",
  "src/tui/workspace/git/views/panel/presentation.ts",
] as const;

export function gitMechanismViolations(from: string, text: string): string[] {
  const app = "src/tui/app/runtime/app";
  const parents = [
    "src/tui/workspace/git/git",
    "src/tui/workspace/git/views/panel/gitpanel",
    "src/tui/workspace/git/views/branches/gitbranchview",
  ];
  if ((GIT_DATA_MECHANISMS as readonly string[]).includes(from))
    return importsOf(text).flatMap((spec) =>
      [app, ...parents].includes(targetOf(from, spec))
        ? [`${from}: imports ${spec} (Git data mechanism must not import composition, even for types)`]
        : [],
    );
  if (from !== "src/tui/workspace/git/views/branches/worktrees.ts") return [];
  // This is an App-backed interactive client; App types are legitimate, runtime composition is not.
  return [
    ...importsOf(text).flatMap((spec) =>
      parents.includes(targetOf(from, spec))
        ? [`${from}: imports ${spec} (worktree client must not import parent composition)`]
        : [],
    ),
    ...new Bun.Transpiler({ loader: "ts" })
      .scanImports(text)
      .flatMap(({ path }) =>
        targetOf(from, path) === app
          ? [`${from}: imports ${path} (worktree client must not load App composition)`]
          : [],
      ),
  ];
}

/** Explorer mechanisms consume live capabilities below controller and App composition (ORG-T30). */
export const EXPLORER_MECHANISMS = [
  "src/tui/workspace/explorer/contracts.ts",
  "src/tui/workspace/explorer/rows/files.ts",
  "src/tui/workspace/explorer/rows/paths.ts",
  "src/tui/workspace/explorer/rows/tree.ts",
  "src/tui/workspace/explorer/navigation.ts",
  "src/tui/workspace/explorer/actions/items.ts",
  "src/tui/workspace/explorer/explorer-disk.ts",
] as const;

export function explorerViolations(from: string, text: string): string[] {
  if (!(EXPLORER_MECHANISMS as readonly string[]).includes(from)) return [];
  return importsOf(text).flatMap((spec) => {
    const target = targetOf(from, spec);
    return target === "src/tui/workspace/explorer/explorer" || target === "src/tui/app/runtime/app"
      ? [`${from}: imports ${spec} (Explorer mechanism must not import composition, even for types)`]
      : [];
  });
}

/** PDF mechanisms stay below lifecycle composition; lower adapters also stay below chapter writing (ORG-T29). */
export const PDF_MECHANISMS = [
  "src/core/rendering/export/formats/pdf/contracts.ts",
  "src/core/rendering/export/formats/pdf/settings.ts",
  "src/core/rendering/export/formats/pdf/writing/document.ts",
  "src/core/rendering/export/formats/pdf/fonts/adapter.ts",
  "src/core/rendering/export/formats/pdf/layout/breaks.ts",
  "src/core/rendering/export/formats/pdf/layout/lines.ts",
  "src/core/rendering/export/formats/pdf/layout/paint.ts",
  "src/core/rendering/export/formats/pdf/pages/pagination.ts",
  "src/core/rendering/export/formats/pdf/writing/blocks.ts",
] as const;

export function pdfViolations(from: string, text: string): string[] {
  if (!(PDF_MECHANISMS as readonly string[]).includes(from)) return [];
  return importsOf(text).flatMap((spec) => {
    const target = targetOf(from, spec);
    const blocks = "src/core/rendering/export/formats/pdf/writing/blocks";
    return target === "src/core/rendering/export/formats/pdf" ||
      target === "src/core/rendering/export/formats/pdf/writing/writer" ||
      (from !== `${blocks}.ts` && target === blocks)
      ? [`${from}: imports ${spec} (PDF mechanism must not import higher composition, even for types)`]
      : [];
  });
}

/** Presentation primitives stay below the App and region composers that call them (ORG-T9). */
export const TUI_PRIMITIVES = [
  "src/tui/app/clipboard/clipboard.ts",
  "src/tui/app/notifications/contracts.ts",
  "src/tui/app/notifications/toasts.ts",
  "src/tui/documents/tools/navigation.ts",
  "src/tui/documents/editing/editable.ts",
  "src/tui/documents/views/header-layout.ts",
  "src/tui/shell/input/modes.ts",
  "src/tui/shell/screen/geometry.ts",
  "src/tui/shell/screen/style.ts",
  "src/tui/shell/screen/controls.ts",
  "src/tui/shell/screen/topbar/fit-location.ts",
  "src/tui/shell/screen/topbar/contracts.ts",
  "src/tui/shell/screen/topbar/where.ts",
  "src/tui/shell/screen/topbar/location.ts",
  "src/tui/shell/panels/focus.ts",
] as const;

const COMPOSERS = [
  "src/tui/app/runtime/app",
  "src/tui/shell/screen/draw",
  "src/tui/shell/screen/topbar/draw-topbar",
  "src/tui/documents/views/draw-header",
  "src/tui/workspace/git/views/review/rebase",
  "src/tui/shell/panels/panels",
];

const targetOf = (from: string, spec: string) =>
  (spec.startsWith(".") ? relative(ROOT, resolve(ROOT, dirname(from), spec)) : spec).replace(/\.tsx?$/, "");

export function primitiveViolations(from: string, text: string): string[] {
  if (!(TUI_PRIMITIVES as readonly string[]).includes(from)) return [];
  return importsOf(text).flatMap((spec) =>
    COMPOSERS.includes(targetOf(from, spec))
      ? [`${from}: imports ${spec} (presentation primitive must not import composition, even for types)`]
      : [],
  );
}

/** These editing clients no longer load App for the shared editable predicate (ORG-T9). */
export const EDITABLE_CLIENTS = [
  "src/tui/documents/views/views.ts",
  "src/tui/documents/search/replacing.ts",
  "src/tui/documents/search/find.ts",
  "src/tui/documents/search/controls.ts",
  "src/tui/documents/editing/editing.ts",
  "src/tui/documents/editing/shellrun.ts",
  "src/tui/workspace/git/views/review/mergescreen.ts",
  "src/tui/workspace/explorer/files.ts",
  "src/tui/shell/input/input.ts",
  "src/tui/shell/input/mouse.ts",
  "src/tui/app/scratch/scratch.ts",
  "src/tui/actions/documents/actions-view.ts",
  "src/tui/actions/documents/actions-edit.ts",
] as const;

export function appCompositionViolations(from: string, text: string): string[] {
  if (!(EDITABLE_CLIENTS as readonly string[]).includes(from)) return [];
  const values = new Bun.Transpiler({ loader: from.endsWith(".tsx") ? "tsx" : "ts" }).scanImports(text);
  return values.flatMap(({ path }) =>
    targetOf(from, path) === "src/tui/app/runtime/app"
      ? [`${from}: imports ${path} for runtime values (editing client must stay below App composition)`]
      : [],
  );
}

/** Drawing clients keep geometry types but never load the screen composer (ORG-T9). */
export const DRAWING_CLIENTS = [
  "src/tui/documents/diagnostics/draw-problems.ts",
  "src/tui/documents/views/draw-pane.ts",
  "src/tui/shell/overlays/draw-overlays.ts",
  "src/tui/shell/panels/draw-panels.ts",
  "src/tui/shell/screen/statusbar/draw-status.ts",
  "src/tui/shell/screen/topbar/draw-topbar.ts",
  "src/tui/workspace/git/views/panel/draw-git.ts",
  "src/tui/shell/input/mouse.ts",
  "src/tui/workspace/git/gitsteady.ts",
] as const;

export function drawingCompositionViolations(from: string, text: string): string[] {
  if (!(DRAWING_CLIENTS as readonly string[]).includes(from)) return [];
  const values = new Bun.Transpiler({ loader: from.endsWith(".tsx") ? "tsx" : "ts" }).scanImports(text);
  return values.flatMap(({ path }) =>
    targetOf(from, path) === "src/tui/shell/screen/draw"
      ? [`${from}: imports ${path} for runtime values (drawing client must stay below screen composition)`]
      : [],
  );
}

/** Filesystem setup shared by pure cases must not load the model harness or TUI controllers. */
export const PURE_TUI_FIXTURES = [
  "tests/support/tui/sandbox.ts",
  "tests/support/tui/peek-fixture.ts",
  "tests/support/vault-roots.ts",
] as const;

export function fixtureViolations(from: string, text: string): string[] {
  if (!(PURE_TUI_FIXTURES as readonly string[]).includes(from)) return [];
  return importsOf(text).flatMap((spec) => {
    const target = targetOf(from, spec);
    return target.startsWith("src/tui/") || target === "tests/tui-harness"
      ? [`${from}: imports ${spec} (filesystem fixture must stay independent of the TUI model)`]
      : [];
  });
}

/** The seam every read the slow-disk workstream moves goes through (SD-D10). */
export const DISK_SEAM = "src/core/foundation/platform/disk.ts";

/** node:fs's reads (SD-D12): a stat, a listing, a file's text, an existence or access check — sync, callback or
 *  promised. Its writes, `watch` (a folder's watch registered), `constants` and its types are none. */
export const DISK_READS = new Set([
  "access",
  "accessSync",
  "exists",
  "existsSync",
  "fstat",
  "fstatSync",
  "lstat",
  "lstatSync",
  "opendir",
  "opendirSync",
  "read",
  "readdir",
  "readdirSync",
  "readFile",
  "readFileSync",
  "readlink",
  "readlinkSync",
  "readSync",
  "realpath",
  "realpathSync",
  "stat",
  "statfs",
  "statfsSync",
  "statSync",
]);

const FS_MODULE = /^(?:node:)?fs(?:\/promises)?$/;

/**
 * The reads of node:fs a file's text imports (`DISK_READS`): by name (`statSync`; fs/promises' `readFile`), or used of
 * a module imported whole (`fs.statSync`, `promises.readFile`); one loaded at run time (`require`, `await import`)
 * counts as reading. `import type` and a name imported as a type load nothing.
 */
export function diskReadsOf(text: string): string[] {
  const reads = new Set<string>();
  const wholes: string[] = [];
  for (const m of text.matchAll(/\bimport\s+(?!type\s)([^;'"]*?)\s*from\s*["']([^"']+)["']/g)) {
    if (!FS_MODULE.test(m[2]!)) continue;
    const named = /\{([^}]*)\}/.exec(m[1]!);
    for (const part of named?.[1]?.split(",") ?? []) {
      const [name, local] = part.trim().split(/\s+as\s+/);
      if (!name || name.startsWith("type ")) continue;
      if (name === "promises") wholes.push(local ?? name);
      else if (DISK_READS.has(name)) reads.add(name);
    }
    const whole = m[1]!
      .replace(/\{[^}]*\}/, "")
      .replace(/,/g, " ")
      .trim();
    const local = /\*\s*as\s+(\w+)/.exec(whole)?.[1] ?? /^(\w+)/.exec(whole)?.[1];
    if (local) wholes.push(local);
  }
  for (const w of wholes)
    for (const m of text.matchAll(new RegExp(`\\b${w}\\.(\\w+)`, "g"))) if (DISK_READS.has(m[1]!)) reads.add(m[1]!);
  if (/(?:\brequire|\bawait\s+import)\s*\(\s*["'](?:node:)?fs(?:\/promises)?["']/.test(text)) reads.add("node:fs");
  return [...reads].sort();
}

/**
 * The slow-disk inventory (blueprint/workstreams/slow-disk/README.md § The inventory) that reads the disk through the
 * seam alone (`DISK_SEAM`): SD-T1 moved their reads there, or they make none of their own. An import of a read of
 * node:fs in one fails the check. Each later task moves its files here from `DISK_READERS`.
 */
export const SEAM_READERS = [
  "src/core/workspace/git/branches/operation-status.ts",
  "src/core/workspace/git/git.ts",
  "src/core/workspace/graph/autoindex.ts",
  "src/core/workspace/graph/feed.ts",
  "src/core/workspace/graph/graph.ts",
  "src/core/workspace/graph/moves/reconcile.ts",
  "src/core/workspace/graph/watch.ts",
  "src/core/workspace/graph/watch/contracts.ts",
  "src/core/workspace/graph/watch/directories.ts",
  "src/core/workspace/graph/watch/io.ts",
  "src/core/workspace/graph/watch/reconciliation.ts",
  "src/core/workspace/graph/watch/state.ts",
  "src/core/workspace/vaults/vault-feed.ts",
  "src/tui/actions/documents/actions-edit.ts",
  "src/tui/app/runtime/graph-refresh.ts",
  "src/tui/app/runtime/startup.ts",
  "src/tui/app/settings/settings.ts",
  "src/tui/documents/buffers/buffer.ts",
  "src/tui/documents/diagnostics/draw-problems.ts",
  "src/tui/documents/diagnostics/problems.ts",
  "src/tui/documents/navigation/peek/opening.ts",
  "src/tui/documents/tools/info/info.ts",
  "src/tui/shell/screen/topbar/where.ts",
  "src/tui/workspace/explorer/actions/items.ts",
  "src/tui/workspace/explorer/explorer-disk.ts",
  "src/tui/workspace/explorer/explorer.ts",
  "src/tui/workspace/explorer/marks.ts",
  "src/tui/workspace/explorer/navigation.ts",
  "src/tui/workspace/explorer/renaming.ts",
  "src/tui/workspace/git/views/panel/draw-git.ts",
  "src/tui/workspace/session/session.ts",
] as const;

/**
 * The inventory's files still allowed to import node:fs's reads, each with why: the task that moves them, or the
 * decision that keeps them. One that no longer imports a read fails the check until its entry goes.
 *
 * What the check doesn't see: it reads imports alone. A read through a helper (fsutil.ts's `readText`, `stamp`,
 * `readJson`) passes it, and so does a call to the seam made synchronously on the screen's thread. Those the held-folder
 * tests find: the hold reaches the seam on every thread (tests/fixtures/walk/slow.ts), so a read left on the screen's
 * thread holds the test's key past the hold's deadline, and the test sees `gaveUp`. The check keeps the list honest; the
 * tests show the reads moved.
 */
export const DISK_READERS: Record<string, string> = {
  "src/core/application/distribution/install.ts": "the upgrade check, in slipbox's data folder: kept (SD-D1's note)",
  "src/core/foundation/platform/fsutil.ts":
    "`folderUnreadable`, asked as `access` (SD-T7); `readJson`'s callers (SD-T8, SD-T9); a write's own reads (SD-D7)",
  "src/core/workspace/git/branches/gitrebase.ts": "the operation under way, kept from the TUI's look (SD-T4, SD-D13)",
  "src/core/workspace/graph/graph-lookup.ts": "a link into a nested vault, as it's drawn (SD-T11)",
  "src/core/workspace/graph/graph-resolve.ts": "a `/…` link's first folder, as it's drawn (SD-T11)",
  "src/core/workspace/graph/refresh.ts":
    "a build's walk and index read on a disk thread (SD-T8); a file reached (SD-T6)",
  "src/core/workspace/links/convention.ts": "Obsidian's or zk's settings, read with the TUI's look (SD-T4)",
  "src/core/workspace/links/links.ts": "a name's case on a disk that folds it (`onDisk`), as it's drawn (SD-T11)",
  "src/core/workspace/mutations/files.ts": "a file operation's guards before it writes: kept (SD-D7)",
  "src/core/workspace/mutations/rename/rename-apply.ts": "a rename's guards before it writes: kept (SD-D7)",
  "src/core/workspace/session/position.ts": "the positions at a vault gone into (SD-T9)",
  "src/core/workspace/vaults/folders.ts": "the machine's named folders (SD-T9)",
  "src/core/workspace/vaults/home/cache.ts": "home's walk kept, brought up to now by a disk thread's `walk` (SD-T8)",
  "src/core/workspace/vaults/registry.ts": "the machine's list of vaults (SD-T9)",
  "src/core/workspace/vaults/symlinks.ts":
    "a way checked for a link not followed, with the look (SD-T4) and an open (SD-T5); the answers kept (SD-T9)",
  "src/core/workspace/walk/filtering/filter.ts": "the walk's filter, judged with each listing on a disk thread (SD-T3)",
  "src/core/workspace/walk/listing.ts": "a nested vault's name and branch, read with the tree's listing (SD-T7)",
  "src/core/workspace/walk/traversal/symlinks.ts": "a link's verdict, judged with the watcher's listings (SD-T3)",
  "src/tui/actions/workspace/actions-files.ts": "a file opened by its path (`isFile`), a key's own read (SD-T5)",
  "src/tui/app/distribution/update-observation.ts": "the upgrade check, in slipbox's data folder: kept (SD-D1's note)",
  "src/tui/app/runtime/watch.ts": "an open note the watcher's batch names, checked with a disk thread's `read` (SD-T6)",
  "src/tui/app/scratch/scratch.ts": "the scratch's places, kept and asked of a disk thread (SD-T11)",
  "src/tui/documents/buffers/opening.ts": "an open's writability (`lockedSaid`), asked with its read (SD-T5)",
  "src/tui/documents/editing/completion/items.ts": "link completion's other vaults (SD-T9)",
  "src/tui/documents/media/images.ts": "a picture's file, as it's drawn (SD-T11)",
  "src/tui/documents/saving/saving.ts": "a save's own checks: kept (SD-D7)",
  "src/tui/shell/overlays/preview.ts": "a list's preview, read on a disk thread (SD-T5)",
  "src/tui/shell/terminal/run.ts": "what's read before the screen is taken: kept (SD-D9)",
  "src/tui/workspace/explorer/rows/paths.ts": "whether a row is left out, from the tree's listings (SD-T7)",
  "src/tui/workspace/explorer/rows/tree.ts": "Elsewhere's top and the nested vaults' names, listed (SD-T7)",
  "src/tui/workspace/git/git.ts": "a file looked for before the git panel or a merge opens it (SD-T5)",
  "src/tui/workspace/git/gitquery.ts": "the stats before a git read, a key's own (SD-T5)",
  "src/tui/workspace/git/views/log/log.ts": "a file looked for before the log opens it (SD-T5)",
  "src/tui/workspace/git/views/panel/gitview.ts":
    "a file looked for before it's opened (SD-T5); a file read for its diff (`readForDiff`), a key's own",
  "src/tui/workspace/vaults/vaults.ts": "a vault gone into and a branch's tabs, from a disk thread's `walk` (SD-T8)",
};

/** A file of the slow-disk inventory: a read of node:fs imported where it isn't listed (`DISK_READERS`), or listed
 *  where it imports none. */
export function diskReadViolations(from: string, text: string): string[] {
  const listed = Object.hasOwn(DISK_READERS, from);
  if (!listed && !(SEAM_READERS as readonly string[]).includes(from)) return [];
  const reads = diskReadsOf(text);
  if (reads.length && !listed)
    return [
      `${from}: imports node:fs's ${reads.join(", ")} (the slow-disk inventory reads through ${DISK_SEAM}, SD-D10; or DISK_READERS lists it, with why)`,
    ];
  if (!reads.length && listed)
    return [
      `${from}: imports no read of node:fs, but DISK_READERS lists it (${DISK_READERS[from]}): take its entry out`,
    ];
  return [];
}

function files(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

// Run as a script (`bun run check:boundary`); a test imports importsOf alone.
if (import.meta.main) {
  const violations: string[] = [];
  for (const [dir, banned] of Object.entries(RULES)) {
    for (const file of files(join(ROOT, dir))) {
      for (const spec of importsOf(readFileSync(file, "utf8"))) {
        const target = spec.startsWith(".") ? relative(ROOT, resolve(dirname(file), spec)) : spec;
        for (const b of banned) {
          if (target === b || target.startsWith(`${b}/`)) {
            violations.push(`${relative(ROOT, file)}: imports ${spec} (${dir} must not import ${b})`);
          }
        }
      }
    }
  }

  for (const file of files(join(ROOT, "src"))) {
    const from = relative(ROOT, file);
    violations.push(...commandViolations(from, readFileSync(file, "utf8")));
    violations.push(...mutationViolations(from, readFileSync(file, "utf8")));
    violations.push(...graphCompositionViolations(from, readFileSync(file, "utf8")));
    violations.push(...codeLayoutViolations(from, readFileSync(file, "utf8")));
    violations.push(...syntaxViolations(from, readFileSync(file, "utf8")));
    violations.push(...markdownViolations(from, readFileSync(file, "utf8")));
    violations.push(...pdfViolations(from, readFileSync(file, "utf8")));
    violations.push(...explorerViolations(from, readFileSync(file, "utf8")));
    violations.push(...drawingOwnerViolations(from, readFileSync(file, "utf8")));
    violations.push(...diagnosticsHelperViolations(from, readFileSync(file, "utf8")));
    violations.push(...bufferLayoutViolations(from, readFileSync(file, "utf8")));
    violations.push(...sourceEditingViolations(from, readFileSync(file, "utf8")));
    violations.push(...navigationHelperViolations(from, readFileSync(file, "utf8")));
    violations.push(...releaseDiscoveryViolations(from, readFileSync(file, "utf8")));
    violations.push(...themeVocabularyViolations(from, readFileSync(file, "utf8")));
    violations.push(...serverProtocolViolations(from, readFileSync(file, "utf8")));
    violations.push(...exportEncodingViolations(from, readFileSync(file, "utf8")));
    violations.push(...editingContextViolations(from, readFileSync(file, "utf8")));
    violations.push(...renameMechanismViolations(from, readFileSync(file, "utf8")));
    violations.push(...searchMechanismViolations(from, readFileSync(file, "utf8")));
    violations.push(...walkingMechanismViolations(from, readFileSync(file, "utf8")));
    violations.push(...parsingMechanismViolations(from, readFileSync(file, "utf8")));
    violations.push(...inputMechanismViolations(from, readFileSync(file, "utf8")));
    violations.push(...gitMechanismViolations(from, readFileSync(file, "utf8")));
    violations.push(...primitiveViolations(from, readFileSync(file, "utf8")));
    violations.push(...appCompositionViolations(from, readFileSync(file, "utf8")));
    violations.push(...drawingCompositionViolations(from, readFileSync(file, "utf8")));
    if (existsSync(join(ROOT, DISK_SEAM))) violations.push(...diskReadViolations(from, readFileSync(file, "utf8")));
    for (const spec of valueImportsOf(readFileSync(file, "utf8"))) {
      if (!spec.startsWith(".")) continue;
      const target = relative(ROOT, resolve(dirname(file), spec));
      const owners = OWNERS[target];
      if (owners && !owners.includes(from))
        violations.push(`${from}: imports ${spec} (only ${owners.join(", ")} may: it runs there alone)`);
    }
  }

  // The inventory where the seam is (the repository's tree; the boundary tests' small trees write some of its files for
  // the other rules alone): a file of it moved or renamed is said, its entry to follow it.
  if (existsSync(join(ROOT, DISK_SEAM)))
    for (const from of [...SEAM_READERS, ...Object.keys(DISK_READERS)])
      if (!existsSync(join(ROOT, from)))
        violations.push(`${from}: in the slow-disk inventory, but not there (moved or renamed: its entry follows it)`);

  for (const from of PURE_TUI_FIXTURES) {
    const file = join(ROOT, from);
    // Small fixture repositories used by the boundary tests need not contain the real support modules.
    try {
      violations.push(...fixtureViolations(from, readFileSync(file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  if (violations.length) {
    console.error(`boundary check failed:\n  ${violations.join("\n  ")}`);
    process.exit(1);
  }
  console.log("boundary check ok: core and cli import nothing from the TUI; workers' modules stay in their workers");
}
