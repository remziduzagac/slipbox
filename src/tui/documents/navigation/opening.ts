import { join } from "node:path";
import type { Config } from "../../../core/application/config/config.ts";
import type { Graph } from "../../../core/workspace/graph/graph.ts";
import type { Anchor } from "../../../core/workspace/session/position.ts";
import type { VaultLocation } from "../../../core/workspace/vaults/vault.ts";
import type { NoteBuffer } from "../buffers/buffer.ts";
import type { View, Tab, Region, FloatingWindow, UiState, SidePaneState } from "../../app/runtime/contracts.ts";
import type { History } from "../../workspace/history/history.ts";
import type { Vaults } from "../../workspace/vaults/vaults.ts";
import type { BufferOpening } from "../buffers/opening.ts";
import type { Overlays } from "../../shell/overlays/overlays.ts";
import type { Explorer } from "../../workspace/explorer/explorer.ts";
import type { Lens } from "../editing/lens.ts";
import { andThen } from "../../app/runtime/key-reads.ts";
// -------------------------------------------------------------------------------------------
// Opening a note, and a window's layout and cursor (the rest of the view's work is app.views').

export interface OpeningContext {
  readonly loc: VaultLocation;
  readonly graph: Pick<Graph, "notes">;
  readonly config: Pick<Config, "ui">;
  readonly floating: FloatingWindow;
  readonly view: View | null;
  readonly overlays: Pick<Overlays, "closeFloating">;
  readonly vaults: Pick<Vaults, "intoOther">;
  /** A note's buffer opened (SD-D4): read on a disk thread first (`prepare`), its way checked with it (`gate`). */
  readonly bufferOpening: Pick<BufferOpening, "prepare" | "gate">;
  readonly history: Pick<History, "touchRecent" | "push" | "jumpTo" | "remember">;
  readonly explorer: Pick<Explorer, "reveal">;
  readonly lens: Pick<Lens, "fitMode">;
  readonly windows: { other(): void };
  readonly panels: { readonly narrow: boolean };
  readonly ui: Pick<UiState, "zen">;
  readonly sidebar: Pick<SidePaneState, "overlay">;
  readonly tabs: Tab[];
  activeTab: number;
  region: Region;
  absOf(path: string): string;
  buffer(path: string): NoteBuffer | null;
  makeView(buf: NoteBuffer, anchor?: Anchor): View;
  openInNewTab(path: string, anchor?: Anchor): void | Promise<void>;
  openOrSwitchTab(path: string): void | Promise<void>;
  open(path: string, anchor?: Anchor, view?: View | null): void | Promise<void>;
  openWhere(path: string, line: number, where: "here" | "tab" | "split"): void | Promise<void>;
  placeAtLine(view: View, line: number, column: number): void;
}

/** The note opened when none is named or restored: `index.md`, `README.md` or `home.md`, else the first note by
 *  path — the vault's; in `folder` (home's path for a folder of it opened by name, VV-D2), the folder's own — one
 *  directly in it before one in a folder of it — or none. */
export function defaultNote(graph: Pick<Graph, "notes">, folder: string | null = null): string | null {
  const at = folder ? `${folder}/` : "";
  const notes = [...graph.notes.keys()].filter((n) => n.startsWith(at));
  for (const pref of ["index.md", "README.md", "readme.md", "home.md"])
    if (notes.includes(`${at}${pref}`)) return `${at}${pref}`;
  if (!folder) return notes[0] ?? null;
  const depth = (n: string) => n.split("/").length;
  return notes.sort((a, b) => depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0))[0] ?? null;
}

export class Opening {
  constructor(
    private readonly context: OpeningContext,
    private readonly callbacks: {
      cancelGitRead(): void;
      stopInsert(view: View): void;
    },
  ) {}

  /** A vault-relative or absolute path, absolute. */
  absOf(pathOrRel: string): string {
    return pathOrRel.startsWith("/") ? pathOrRel : join(this.context.loc.root, pathOrRel);
  }

  /** A note opened in a tab of its own; read on a disk thread first, its tab opened once it's there (SD-D4). */
  openInNewTab(path: string, anchor?: Anchor): void | Promise<void> {
    if (this.context.vaults.intoOther(path, anchor)) return;
    const again = () => this.context.openInNewTab(path, anchor);
    if (this.context.bufferOpening.gate(path, again)) return;
    const reading = this.context.bufferOpening.prepare(path, this.context.view, null, again);
    if (reading) return reading;
    const buf = this.context.buffer(path);
    if (!buf) return;
    this.context.history.touchRecent(buf.key);
    this.context.tabs.push({
      views: [this.context.makeView(buf, anchor)],
      active: 0,
      orientation: "side",
      ratio: this.context.config.ui.split_ratio,
    });
    this.context.activeTab = this.context.tabs.length - 1;
    this.context.region = "content";
    this.context.explorer.reveal(undefined, false, true); // gone there: the view zooms out to hold it (VV-D5)
  }

  /** Switch to a tab already showing this note, or open it in a new one. */
  openOrSwitchTab(path: string): void | Promise<void> {
    this.callbacks.cancelGitRead();
    if (this.context.vaults.intoOther(path)) return;
    const again = () => this.context.openOrSwitchTab(path);
    if (this.context.bufferOpening.gate(path, again)) return;
    const reading = this.context.bufferOpening.prepare(path, this.context.view, null, again);
    if (reading) return reading;
    const buf = this.context.buffer(path);
    if (!buf) return;
    const i = this.context.tabs.findIndex((t) => t.views.some((v) => v.buf === buf));
    if (i < 0) return this.context.openInNewTab(path);
    const t = this.context.tabs[i]!;
    this.context.activeTab = i;
    t.active = t.views.findIndex((v) => v.buf === buf);
    this.context.region = "content";
  }

  /** Open a note in a view, pushing history (3.6) and remembering the old position (3.4); read on a disk thread first,
   *  `reading <note>…` in the view meanwhile (SD-D4). */
  open(path: string, anchor?: Anchor, view = this.context.view): void | Promise<void> {
    // From the floating editor (a link in the properties): it closes first, and the window under it opens it.
    if (this.context.floating) {
      const from = view === this.context.floating.view;
      if (!this.context.overlays.closeFloating()) return;
      if (from) view = this.context.view;
    }
    if (!view) return this.context.openInNewTab(path, anchor);
    if (this.context.vaults.intoOther(path, anchor)) return;
    if (this.context.bufferOpening.gate(path, () => this.context.open(path, anchor))) return;
    const reading = this.context.bufferOpening.prepare(path, view, view, () => this.context.open(path, anchor, view));
    if (reading) return reading;
    const buf = this.context.buffer(path);
    if (!buf) return;
    // A pinned tab keeps its note: another one opens in a new tab.
    if (buf !== view.buf && this.context.tabs.find((t) => t.views.includes(view))?.pinned)
      return this.context.openInNewTab(path, anchor);
    this.context.history.touchRecent(buf.key);
    this.context.history.push(view);
    if (buf === view.buf && anchor) {
      this.context.history.jumpTo(view, anchor);
      return;
    }
    this.context.history.remember(view);
    const before = view.buf;
    if (view.insert) this.callbacks.stopInsert(view);
    // Another note: its pictures fitted again (PIC-D4), even one the window shows as source or code between.
    Object.assign(view, this.context.makeView(buf, anchor), {
      back: view.back,
      fwd: [],
      picturesOwn: buf === before ? view.picturesOwn : undefined,
    });
    this.context.lens.fitMode(view, before);
    this.context.region = "content";
    this.context.explorer.reveal(undefined, false, true);
  }

  /**
   * A file opened at a line (the Problems panel's All, 1.7): in this window, in a tab — its own, or the one
   * showing it, a place pushed onto that window's history — or in the split's other window.
   */
  openWhere(rel: string, line: number, where: "here" | "tab" | "split"): void | Promise<void> {
    if (where === "tab") {
      const shown = this.context.tabs.some((t) => t.views.some((v) => v.buf.rel === rel));
      return andThen(this.context.openOrSwitchTab(rel), () => {
        if (shown && this.context.view?.buf.rel === rel) this.context.history.push(this.context.view);
      });
    }
    if (where === "split") this.context.windows.other();
    return this.context.open(rel, { heading: null, headingIndex: 0, offset: 0, line });
  }

  /**
   * Open a file at a line and column (1-based; the column in code points): rendered, at the start of
   * the line's row — a rendered row has no source columns; in source mode, on the column.
   */
  openAt(rel: string, line: number, column = 1, where: "here" | "tab" | "split" = "here"): void | Promise<void> {
    return andThen(this.context.openWhere(rel, line, where), () => {
      const v = this.context.view;
      if (v && v.buf.rel === rel) this.context.placeAtLine(v, line, column);
      this.context.region = "content";
      if (this.context.panels.narrow || this.context.ui.zen) this.context.sidebar.overlay = false;
    });
  }
}
