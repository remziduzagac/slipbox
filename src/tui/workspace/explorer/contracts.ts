// Explorer records and the capabilities its row, navigation and action collaborators actually use.
import type { FileGroup } from "../../../core/documents/model/filetypes.ts";
import type { FolderListing, ListedEntry } from "../../../core/workspace/walk/listing.ts";
import type { VaultLocation } from "../../../core/workspace/vaults/vault.ts";
import type { Config } from "../../../core/application/config/config.ts";
import type { Graph } from "../../../core/workspace/graph/graph.ts";
import type { NoteBuffer } from "../../documents/buffers/buffer.ts";
import type { Region } from "../../shell/panels/focus.ts";
import type { ListItem } from "../../shell/overlays/list-types.ts";

/** A link's row opened (VV-D6): what it leads to, once you say so. */
export interface LinkRow {
  /** Where it leads, by its real path; null when it leads nowhere. */
  target: string | null;
  dir: boolean;
  /** Why the walk didn't go through it (`LINK_REASON`), or — listed a level at a time in Elsewhere — that it asks. */
  reason?: string;
}

/** What an explorer operation acts on (18.x): a note or file, a folder, or a nested vault's folder. */
export interface ExplorerItem {
  rel: string;
  dir: boolean;
  vault?: boolean;
}

export interface TreeRow {
  /** "note": a row the explorer opens — a note, or a data or text file (`group` says which).
   *  "root": a folder that is a vault — the one open, another, one nested in it — or, in a folder only
   *  listed (`~`), a folder of it: `l` unfolds it in place, `enter` goes into it (17.13, VV-D4). */
  kind: "dir" | "note" | "root";
  /** Its path in the vault open, for what the vault's own tree holds; else absolute (`outside`, the vault open's). */
  path: string;
  name: string;
  depth: number;
  /** A file beyond notes: its group (16.x). */
  group?: FileGroup;
  /** A root row: what it is, where it is, and the vault's name when it isn't the folder's; `here`:
   *  the vault open, in a view above it (VV-D5) — highlighted, its tree under it. */
  root?: { kind: "vault" | "folder"; abs: string; name?: string; here?: boolean };
  /** A row outside the vault open's own tree — above it, beside it, in another vault, in what its walk
   *  leaves out: its path absolute, listed a level at a time. Opening its file goes into the file's vault,
   *  as a link does (VV-D4). */
  outside?: boolean;
  /** What the vault open's walk leaves out (VV-D8), listed from the disk: why (`busy folder`, `.gitignore`,
   *  `walk.exclude`, `Downloads`…). Never indexed. A folder in it carries it too; a file, only `outside`. A hidden name
   *  listed (`files.hidden`) anywhere else has it too: `hidden`. */
  leftOut?: string;
  /** Where `leftOut` was decided, absolute: the folder (or file) the walk leaves out — this row's, or the one holding
   *  it. Its name says a busy folder's reason (VV-D9: `generated (node_modules)`). */
  leftOutAt?: string;
  /** The vault open's, listed from the disk where its walk hasn't been (yet): a folder it couldn't read, home's
   *  before its walk, a folder or file come since. */
  unwalked?: boolean;
  /** A symlink (VV-D6): where it leads, and why the walk didn't go through it, when it didn't. */
  link?: LinkRow;
  /** A row listed a level at a time: what its folder's listing read of it, off the main thread (T12) — its marks'. */
  listed?: ListedEntry;
  /** A row that only says something of its folder — still being listed (`listing…`), or why it couldn't be: never
   *  opened, nothing to mark. */
  placeholder?: true;
}

/** What the vault open's walk leaves out (VV-D8), carried down what's listed in it: why, and where it was decided. */
export interface LeftOut {
  why: string;
  at: string;
}

/** Values read by the file/row mechanisms; every map and configuration remains client-owned. */
export interface ExplorerReadContext {
  readonly loc: VaultLocation;
  readonly config: Pick<Config, "files" | "walk">;
  readonly graph: Pick<Graph, "filePaths" | "notes" | "dirs" | "skipped" | "filter" | "known">;
  readonly ui: { hidden_files: boolean };
  readonly sidebar: { allFiles?: boolean };
}

/** Shared interactive state, read live rather than copied when a collaborator is constructed. */
export interface ExplorerUiContext {
  readonly loc: VaultLocation;
  leftView: "explorer" | "history" | "git";
  region: Region;
  readonly sidebar: {
    selected: number;
    scroll: number;
    pinned?: boolean;
    filter?: string;
    filtering?: boolean;
    allFiles?: boolean;
    overlay: boolean;
  };
  readonly ui: { hidden_files: boolean; zen: boolean };
  readonly view: { buf: Pick<NoteBuffer, "rel" | "abs" | "virtual"> } | null;
  message(level: "info" | "warn" | "error", text: string): void;
}

export interface ExplorerNavigationContext extends ExplorerUiContext {
  readonly panels: {
    showSidebar(on: boolean): void;
    switchLeftView(view: "explorer"): unknown;
  };
  readonly settings: { setUi(name: "hidden_files", value: boolean): void };
  readonly scratch: { location(): { path: string } };
  readonly vaults: {
    switchVault(target: VaultLocation, open: string | null, anchor?: undefined, how?: { folder: string }): boolean;
  };
}

/** Existing item actions stay delegated to the feature that owns their IO or interaction policy. */
export interface ExplorerActionContext extends ExplorerUiContext {
  readonly graph: Pick<Graph, "reachFile">;
  readonly explorerKeys: { keysFor(action: string): string[] };
  readonly leader: string;
  readonly geometry: {
    hot: readonly { id: string; x: number; y: number }[];
    sidebar?: { x: number; y: number } | null;
  } | null;
  readonly files: {
    readonly clip: ({ mode: "copy" | "cut" } & ExplorerItem) | null;
    newItemBase(): string | null;
    renameItem(item: ExplorerItem): void;
    moveItem(item: ExplorerItem): void;
    deleteItem(item: ExplorerItem): void;
    clipItem(mode: "copy" | "cut", item: ExplorerItem): void;
    pasteItem(): void;
    promptNewNote(base: string | null): void;
    promptNewFolder(base: string | null): void;
    restoreLast(): void;
  };
  readonly vaults: {
    renameItem(item: ExplorerItem): void;
    makeItem(item: ExplorerItem): void | Promise<void>;
    unmakeItem(item: ExplorerItem): void | Promise<void>;
    enterRoot(row: TreeRow): unknown;
  };
  readonly panels: {
    readonly sidebarShown: boolean;
    readonly narrow: boolean;
    showSidebar(on: boolean): void;
    leave(side: "sidebar"): void;
  };
  readonly history: { action(action: string): void | Promise<void> };
  readonly gitPanel: { action(action: string): void | Promise<void> };
  readonly renaming: { undo(): void | Promise<void> };
  readonly following: { gate(abs: string, then: () => void, there?: VaultLocation): boolean };
  readonly windows: { other(): void };
  readonly overlays: {
    openList(options: {
      title: string;
      items: ListItem[];
      filterable: boolean;
      anchor?: { x: number; y: number };
      menu: boolean;
      accept(item: ListItem): void;
    }): void;
  };
  open(path: string): unknown;
  openOrSwitchTab(path: string): unknown;
  copy(text: string, announce?: boolean, what?: string): unknown;
  run(command: "explorer.toggle_hidden"): unknown;
}

/** State and callbacks kept by the Explorer controller. */
export interface ExplorerPosition {
  top: string;
  trail: string;
  expanded: Set<string>;
  wanted: { path: string; at: number } | null;
  rows(): TreeRow[];
  treeRows(): TreeRow[];
  rowPath(abs: string): string;
  rowAbs(row: Pick<TreeRow, "path">): string;
  invalidateTree(): void;
}

export interface ExplorerNavigationHost extends ExplorerPosition {
  readonly app: ExplorerNavigationContext;
  readonly listings: { forget(dir: string): void; stale(dir: string): void };
}

export interface ExplorerActionHost extends ExplorerPosition {
  readonly app: ExplorerActionContext;
  readonly listings: { again(dir: string): void };
  leftOutAt(abs: string): LeftOut | null;
  treeRows(): TreeRow[];
  filesShown(): "notes" | "renderable" | "all";
  reveal(rel?: string | null, open?: boolean, zoom?: boolean): void;
  zoomIn(): void;
  zoomOut(): void;
}

export interface ExplorerRowState {
  readonly expanded: Set<string>;
  readonly listings: {
    get(dir: string): FolderListing | null;
    pending(dir: string): boolean;
  };
}

export interface ExplorerCrumb {
  abs: string;
  label: string;
  vault: boolean;
  current: boolean;
  past: boolean;
}
