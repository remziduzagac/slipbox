import type { SymbolKind } from "vscode-languageserver-protocol";
import { expect, test } from "bun:test";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { NoteBuffer } from "../../../../src/tui/documents/buffers/buffer.ts";
import { problemRows } from "../../../../src/tui/documents/diagnostics/problems/rows.ts";
import type { ProblemsPanel } from "../../../../src/tui/documents/diagnostics/problems/contracts.ts";
import {
  applyWorkspaceEdit,
  editsOf,
  previewWorkspaceEdit,
  type WorkspaceEditContext,
} from "../../../../src/tui/documents/diagnostics/languages/workspace-edits.ts";
import { outlineOf, KIND_NAMES } from "../../../../src/tui/documents/diagnostics/languages/symbols.ts";
import { openLocation } from "../../../../src/tui/documents/diagnostics/languages/locations.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";

const sandbox = makeCoreSandbox();
const range = { start: { line: 0, character: 1 }, end: { line: 0, character: 1 } };

test("server edit normalization merges file URI entries and excludes resource operations", () => {
  const path = join(sandbox, "a b.ts");
  const uri = pathToFileURL(path).href;
  const first = { range, newText: "A" };
  const second = { range, newText: "B" };
  expect(
    editsOf({
      changes: { [uri]: [first], "untitled:ignored": [first] },
      documentChanges: [
        { kind: "create", uri },
        { textDocument: { uri, version: null }, edits: [second] },
      ],
    }),
  ).toEqual([{ path, edits: [first, second] }]);
});

test("server inserts retain array order and save only clean buffers absent from every view", () => {
  const saved: NoteBuffer[] = [];
  const buffers = new Map<string, NoteBuffer>();
  for (const name of ["shown.ts", "clean.ts", "dirty.ts"]) {
    const buf = new NoteBuffer(name, join(sandbox, name));
    buf.loadText("xy");
    buffers.set(name, buf);
  }
  buffers.get("dirty.ts")!.edit(0, 0, "!");
  const view = { buf: buffers.get("shown.ts")!, layoutKey: "old" };
  const owner = {
    app: {
      loc: { root: sandbox },
      allViews: () => [view],
      buffer: (key: string) => buffers.get(key),
      saving: { save: (buf: NoteBuffer) => saved.push(buf) },
    },
    editsOf,
  } as unknown as WorkspaceEditContext;
  const changes = Object.fromEntries(
    [...buffers.values()].map((buf) => [
      pathToFileURL(buf.abs).href,
      [
        { range, newText: "A" },
        { range, newText: "B" },
      ],
    ]),
  );
  expect(applyWorkspaceEdit(owner, { changes })).toEqual({ files: 3, edits: 6 });
  expect(buffers.get("shown.ts")!.source).toBe("xABy");
  expect(saved).toEqual([buffers.get("clean.ts")!]);
  expect(view.layoutKey).toBe("");
});

test("server edit preview defers effects and dispatches through the current controller on acceptance", () => {
  const buf = new NoteBuffer("preview.ts", join(sandbox, "preview.ts"));
  buf.loadText("xy");
  let shown: Pick<ListOverlay, "accept" | "title" | "items"> | undefined;
  const messages: string[] = [];
  let calls = 0;
  let done = 0;
  const owner = {
    app: {
      loc: { root: sandbox },
      buffers: new Map([[buf.key, buf]]),
      overlays: {
        openList: (list: typeof shown) => {
          shown = list;
        },
      },
      message: (_level: string, text: string) => messages.push(text),
    },
    editsOf,
    applyWorkspaceEdit: () => {
      calls++;
      return { files: 1, edits: 1 };
    },
  } as unknown as WorkspaceEditContext;
  previewWorkspaceEdit(
    owner,
    "Rename",
    { changes: { [pathToFileURL(buf.abs).href]: [{ range, newText: "A" }] } },
    () => {
      done++;
    },
  );
  expect(calls).toBe(0);
  expect(buf.source).toBe("xy");
  expect(shown!.title).toContain("1 change in 1 file");
  owner.applyWorkspaceEdit = () => {
    calls += 10;
    return { files: 2, edits: 3 };
  };
  shown!.accept(shown!.items[0]!);
  expect([calls, done]).toEqual([10, 1]);
  expect(messages).toEqual(["Rename: 3 changes in 2 files"]);
});

test("server outline conversion preserves stable line ordering, nesting and kind labels", () => {
  const at = (line: number) => ({ start: { line, character: 0 }, end: { line, character: 1 } });
  expect(
    outlineOf([
      { name: "late", kind: 12, range: at(8), selectionRange: at(8) },
      {
        name: "parent",
        kind: 5,
        range: at(1),
        selectionRange: at(1),
        children: [{ name: "child", kind: 6, range: at(2), selectionRange: at(2) }],
      },
    ]),
  ).toEqual([
    { name: "parent", kind: "class", line: 2, depth: 0 },
    { name: "child", kind: "method", line: 3, depth: 1 },
    { name: "late", kind: "function", line: 9, depth: 0 },
  ]);
  expect(KIND_NAMES[12]).toBe("function");
  expect(
    outlineOf([{ name: "unknown", kind: 999 as SymbolKind, location: { uri: "file:///x", range: at(4) } }]),
  ).toEqual([{ name: "unknown", kind: "symbol", line: 5, depth: 0 }]);
});

test("server locations re-read the active view and translate UTF-16 to the existing character column", () => {
  const places: unknown[] = [];
  const buf = new NoteBuffer("code.ts", join(sandbox, "code.ts"));
  buf.loadText("a😀z\nnext");
  const app = {
    loc: { root: sandbox },
    view: null,
    region: "explorer",
    open: (target: string) => {
      places.push(target);
      app.view = { buf } as never;
    },
    placeAtLine: (_view: unknown, line: number, column: number) => places.push([line, column]),
  };
  openLocation(app as unknown as Parameters<typeof openLocation>[0], buf.abs, 0, 3);
  expect(places).toEqual(["code.ts", [1, 3]]);
  expect(app.region).toBe("content");
});

test("problem rows retain folds, expose matching rows and read deferred lint findings at their original point", () => {
  const file = join(sandbox, "conflict.md");
  writeFileSync(file, "before\n<<<<<<< ours\n");
  const graph = {
    generation: 0,
    config: DEFAULT_CONFIG,
    notes: new Map(),
    problems: () => ({ broken: [], ambiguous: [], fragile: [], orphans: ["orphan.md"] }),
  };
  const app = {
    loc: { root: sandbox, mode: "vault" },
    graph,
    git: { states: new Map([["conflict.md", "conflict"]]) },
    languages: { lintCmd: {}, vaultLint: { issues: [], running: true } },
  };
  const panel = { all: { filter: "" } } as ProblemsPanel;
  const folded = new Set(["Orphans"]);
  let lintCalls = 0;
  const rows = () =>
    problemRows({ app, panel, folded } as unknown as Parameters<typeof problemRows>[0], () => {
      lintCalls++;
      return { shown: [], hidden: new Map() };
    });
  expect(rows().find((r) => r.section === "Orphans")!.folded).toBe(true);
  expect(rows().find((r) => r.conflict)?.conflict).toEqual({ path: "conflict.md", line: 2 });
  expect(lintCalls).toBe(2);
  panel.all.filter = "orphan";
  expect(
    rows()
      .filter((r) => r.section === "Orphans")
      .map((r) => r.label),
  ).toEqual(["Orphans (1)", "orphan.md"]);
  app.loc.mode = "folder";
  expect(rows()).toEqual([]);
  expect(lintCalls).toBe(3);
});
