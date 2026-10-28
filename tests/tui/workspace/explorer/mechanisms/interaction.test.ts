// Explorer interactions exercised through live capabilities and shared state, without constructing App.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join, relative } from "node:path";
import { vaultAt } from "../../../../../src/core/workspace/vaults/vault.ts";
import type {
  ExplorerActionContext,
  ExplorerActionHost,
  ExplorerNavigationContext,
  ExplorerNavigationHost,
  TreeRow,
} from "../../../../../src/tui/workspace/explorer/contracts.ts";
import { ExplorerActions } from "../../../../../src/tui/workspace/explorer/actions/items.ts";
import { ExplorerNavigation } from "../../../../../src/tui/workspace/explorer/navigation.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

const sandbox = makeCoreSandbox();
function fixture() {
  const root = mkdtempSync(join(sandbox, "interaction-"));
  mkdirSync(join(root, "sub"));
  const calls: string[] = [];
  let rows: TreeRow[] = [];
  let allowSwitch = true;
  let cached = true;
  let menu: Parameters<ExplorerActionContext["overlays"]["openList"]>[0] | null = null;
  const app: ExplorerActionContext & ExplorerNavigationContext = {
    loc: vaultAt(root),
    leftView: "explorer",
    region: "sidebar",
    sidebar: { selected: 0, scroll: 4, pinned: true, filter: "", filtering: false, allFiles: false, overlay: false },
    ui: { hidden_files: false, zen: false },
    view: { buf: { rel: "a.md", abs: join(root, "a.md"), virtual: null } },
    message: (level, text) => void calls.push(`${level}: ${text}`),
    panels: {
      sidebarShown: true,
      narrow: false,
      showSidebar: (on) => void calls.push(`sidebar:${on}`),
      switchLeftView: (view) => {
        app.leftView = view;
        calls.push(`left:${view}`);
      },
      leave: (side) => void calls.push(`leave:${side}`),
    },
    settings: {
      setUi: (_name, value) => {
        app.ui.hidden_files = value;
      },
    },
    scratch: { location: () => ({ path: join(root, "scratch.md") }) },
    vaults: {
      switchVault: () => {
        calls.push("switch");
        return allowSwitch;
      },
      renameItem: (item) => void calls.push(`name:${item.rel}`),
      makeItem: (item) => void calls.push(`make:${item.rel}`),
      unmakeItem: (item) => void calls.push(`unmake:${item.rel}`),
      enterRoot: (row) => void calls.push(`enter:${row.path}`),
    },
    graph: { reachFile: () => true },
    explorerKeys: { keysFor: (action) => (action === "rename" ? ["shift+r"] : []) },
    leader: "space",
    geometry: null,
    files: {
      clip: null,
      newItemBase: () => "sub",
      renameItem: (item) => void calls.push(`rename:${item.rel}`),
      moveItem: (item) => void calls.push(`move:${item.rel}`),
      deleteItem: (item) => void calls.push(`delete:${item.rel}`),
      clipItem: (mode, item) => void calls.push(`${mode}:${item.rel}`),
      pasteItem: () => void calls.push("paste"),
      promptNewNote: (base) => void calls.push(`new-note:${base}`),
      promptNewFolder: (base) => void calls.push(`new-folder:${base}`),
      restoreLast: () => void calls.push("restore"),
    },
    history: { action: (action) => void calls.push(`history:${action}`) },
    gitPanel: { action: (action) => void calls.push(`git:${action}`) },
    renaming: { undo: () => void calls.push("undo") },
    following: { gate: () => false },
    windows: { other: () => void calls.push("other-window") },
    overlays: {
      openList: (options) => {
        menu = options;
      },
    },
    open: (path) => void calls.push(`open:${path}`),
    openOrSwitchTab: (path) => void calls.push(`tab:${path}`),
    copy: (text) => void calls.push(`clipboard:${text}`),
    run: (command) => void calls.push(`command:${command}`),
  };
  let navigation: ExplorerNavigation;
  const host: ExplorerActionHost & ExplorerNavigationHost = {
    app,
    top: root,
    trail: root,
    expanded: new Set<string>(),
    wanted: null,
    listings: {
      again: (dir) => void calls.push(`again:${dir}`),
      forget: (dir) => void calls.push(`forget:${dir}`),
      stale: (dir) => void calls.push(`stale:${dir}`),
    },
    rows: () => rows,
    treeRows: () => rows,
    rowPath: (abs) => relative(root, abs).split("\\").join("/"),
    rowAbs: (row) => (row.path.startsWith(root) ? row.path : join(root, row.path)),
    invalidateTree: () => void calls.push("invalidate"),
    leftOutAt: () => null,
    filesShown: () => "notes",
    reveal: (rel, open, zoom) => navigation.reveal(rel, open, zoom),
    zoomIn: () => navigation.zoomIn(),
    zoomOut: () => navigation.zoomOut(),
  };
  navigation = new ExplorerNavigation(host, () => cached);
  return {
    root,
    app,
    host,
    calls,
    navigation,
    actions: new ExplorerActions(host),
    rows: (value: TreeRow[]) => {
      rows = value;
    },
    allowSwitch: (value: boolean) => {
      allowSwitch = value;
    },
    cached: (value: boolean) => {
      cached = value;
    },
    menu: () => menu,
  };
}
const note = (path: string): TreeRow => ({ kind: "note", path, name: path, depth: 0 });

test("selection waits for a missing row and restores a hidden explorer by path rather than index", () => {
  const f = fixture();
  f.rows([note("a.md")]);
  f.navigation.selectRow("later.md", 2);
  expect(f.host.wanted).toEqual({ path: "later.md", at: 2 });
  f.app.leftView = "git";
  f.rows([note("a.md"), note("sub/b.md")]);
  f.navigation.select("sub/b.md");
  expect(f.app.sidebar.selected).toBe(2);
  expect(f.host.expanded.has("sub")).toBe(true);
  f.rows([note("sub/b.md"), note("a.md")]);
  f.app.leftView = "explorer";
  f.navigation.shownAgain();
  expect(f.app.sidebar.selected).toBe(0);
  expect(f.app.sidebar.scroll).toBe(0);
  expect(f.app.sidebar.pinned).toBe(false);
  expect(f.host.wanted).toBeNull();
  f.app.leftView = "git";
  f.navigation.select("sub/b.md");
  Object.assign(f.app, { loc: vaultAt(sandbox) });
  f.app.leftView = "explorer";
  f.app.sidebar.selected = 1;
  f.app.sidebar.scroll = 8;
  f.navigation.shownAgain();
  expect(f.app.sidebar.selected).toBe(1);
  expect(f.app.sidebar.scroll).toBe(8);
});

test("zoom reads current state and leaves the other left pane's selection alone", () => {
  const f = fixture();
  const sub = join(f.root, "sub");
  f.app.leftView = "git";
  f.app.sidebar.selected = 7;
  f.navigation.zoomTo(sub);
  expect([f.host.top, f.host.trail]).toEqual([sub, sub]);
  expect(f.app.sidebar.selected).toBe(7);
  expect(f.app.sidebar.scroll).toBe(4);
  f.rows([note("sub")]);
  f.navigation.zoomTo(f.root);
  expect(f.host.expanded.has("sub")).toBe(true);
  f.app.leftView = "explorer";
  f.navigation.shownAgain();
  expect(f.app.sidebar.selected).toBe(0);
  expect(f.app.sidebar.scroll).toBe(0);
});

test("following a moved view invalidates listings in order and shifts only descendants", () => {
  const f = fixture();
  const from = join(f.root, "sub");
  const to = join(f.root, "renamed");
  f.host.top = from;
  f.host.trail = join(from, "deep");
  const expanded = f.host.expanded;
  f.navigation.followMove(from, to);
  expect(f.calls).toEqual([`forget:${from}`, `stale:${f.root}`, `stale:${f.root}`, "invalidate"]);
  expect([f.host.top, f.host.trail]).toEqual([to, join(to, "deep")]);
  expect(f.host.expanded).toBe(expanded);
  f.navigation.followMove(join(f.root, "elsewhere"), "other");
  expect(f.host.top).toBe(to);
});

test("a refused vault switch stops reveal before changing the panel, filter or focus", () => {
  const f = fixture();
  f.allowSwitch(false);
  f.app.leftView = "git";
  f.app.sidebar.filter = "keep";
  f.app.region = "content";
  f.navigation.revealFolder(join(f.root, "sub"));
  expect(f.calls).toEqual(["switch"]);
  expect([f.app.leftView, f.app.sidebar.filter, f.app.region]).toEqual(["git", "keep", "content"]);
});

test("row actions ignore placeholders after clearing pending selection and route other left views directly", () => {
  const f = fixture();
  f.rows([{ ...note("pending"), placeholder: true }]);
  f.host.wanted = { path: "pending", at: 0 };
  f.actions.action("open");
  expect(f.calls).toEqual([]);
  expect(f.host.wanted).toBeNull();
  expect(f.app.sidebar.pinned).toBe(false);
  f.app.leftView = "git";
  f.actions.action("down");
  f.app.leftView = "history";
  f.actions.action("up");
  expect(f.calls).toEqual(["git:down", "history:up"]);
});

test("item menus keep labels and hotkeys while file writes stay in their existing owner", () => {
  const f = fixture();
  f.rows([note("a.md")]);
  f.actions.openItemMenu();
  const menu = f.menu()!;
  expect(menu.title).toBe("a.md");
  expect(menu.items.find((item) => item.data === "rename")).toMatchObject({ label: "Rename", hint: "R", hotkey: "R" });
  menu.accept(menu.items.find((item) => item.data === "rename")!);
  f.actions.itemAction("cut", { rel: "a.md", dir: false });
  f.actions.itemAction("paste", { rel: "sub", dir: true });
  f.actions.action("copy_path");
  expect(f.calls).toEqual(["rename:a.md", "cut:a.md", "paste", `clipboard:${join(f.root, "a.md")}`]);
});

test("breadcrumbs repair a missing trail before a tree exists and reuse their unchanged memo", () => {
  const f = fixture();
  f.cached(false);
  f.host.trail = join(f.root, "gone");
  const first = f.navigation.crumbs();
  expect(f.host.trail).toBe(f.root);
  expect(first.at(-1)).toMatchObject({ abs: f.root, current: true });
  f.cached(true);
  expect(f.navigation.crumbs()).toBe(first);
  f.host.trail = join(f.root, "sub");
  expect(f.navigation.crumbs()).not.toBe(first);
  expect(f.navigation.crumbs().at(-1)).toMatchObject({ label: "sub", past: true });
});
