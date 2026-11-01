import { onLoaded } from "../../../core/foundation/platform/lazy.ts";
import { MERMAID } from "../../../core/rendering/media/diagrams/diagrams.ts";
import { REGEX } from "../../../core/workspace/search/regex-jobs.ts";
import { DOCUMENT_GRAMMARS, grammarFor } from "../../../core/documents/syntax/syntax.ts";
import { extensionOf } from "../../../core/documents/model/filetypes.ts";
import { type Layout, posOfSrc, srcAt } from "../../../core/rendering/layout/ir.ts";
import { type Anchor, type CursorAnchor, type PositionStore, TOP } from "../../../core/workspace/session/position.ts";
import type { Graph } from "../../../core/workspace/graph/graph.ts";
import type { View, SidePaneState } from "../../app/runtime/contracts.ts";
import type { NoteBuffer } from "../buffers/buffer.ts";
import { clampPos, type Pos } from "../editing/cursor.ts";
import type { Html } from "./html.ts";
import type { Lens } from "../editing/lens.ts";
import type { Languages } from "../diagnostics/languages.ts";
import type { Views } from "./views.ts";
import type { Code } from "./code.ts";

export interface ViewPolicyContext {
  readonly graph: Pick<Graph, "loadGrammars" | "grammarsChanged">;
  readonly quitting: boolean;
  readonly width: number;
  readonly height: number;
  readonly positions: Pick<PositionStore, "get" | "getCursor">;
  readonly buffers: ReadonlyMap<string, NoteBuffer>;
  readonly outline: Pick<SidePaneState, "pinned">;
  readonly html: Pick<Html, "revealIn" | "reveal">;
  readonly lens: Pick<Lens, "opensInSource">;
  readonly languages: Pick<Languages, "retrySyntax">;
  readonly views: Pick<
    Views,
    "layoutFor" | "gutterWidth" | "select" | "cursorAnchorFor" | "markSelection" | "ensureCursorVisible"
  >;
  readonly code: Pick<Code, "screenCol">;
  readonly explorer: { invalidateTree(): void };
  readonly host: { requestRender(): void };
  allViews(): View[];
  relayoutAll(): void;
  currentLayout(view: View): Layout;
  isCodeDocument(buf: NoteBuffer): boolean;
  moveCursor(view: View, to: Pos): void;
}

/** Buffers of another vault's file whose vault a view of them has had caught up (`makeView`, #10). */
const caughtUpOnce = new WeakSet<NoteBuffer>();

export class ViewPolicy {
  constructor(
    private readonly context: ViewPolicyContext,
    private readonly callbacks: { keepCaughtUp(graph: Graph): void; placeAt(view: View, offset: number): void },
  ) {}

  relayoutAll(): void {
    for (const v of this.context.allViews()) v.layoutKey = "";
  }

  /** Widths count another way now (the terminal's answer, `setWidthMethod`): every layout made again. */
  widthsChanged(): void {
    for (const b of this.context.buffers.values()) b.invalidateLayouts();
    this.context.relayoutAll();
    this.context.explorer.invalidateTree();
    this.context.host.requestRender();
  }

  makeView(buf: NoteBuffer, anchor?: Anchor, cursor?: CursorAnchor): View {
    // Opened again: a big note its threads failed on for their own reason is parsed again (15.1), a code file's
    // structure likewise (16.7).
    buf.retryParse();
    this.context.languages.retrySyntax(buf);
    // Another vault's file shown — a tab kept from a peek, back with the session; not a buffer read for an edit, nor
    // the peek's own: its graph caught up on a thread, as a peek's is (#10), its index built if it has none, home's
    // excepted (VV-D2) — or a link by a name in a note changed since would never be found: the TUI never parses a
    // vault whole to look (`thorough`). Even when its index here isn't behind its walk: the thread's walk asks the
    // links its vault follows first (VV-D6), and finds the folders through them this walk leaves out until they answer.
    // With its first view, not every split of it.
    if (buf.elsewhere?.graph && !buf.virtual && !caughtUpOnce.has(buf)) {
      caughtUpOnce.add(buf);
      this.callbacks.keepCaughtUp(buf.elsewhere.graph);
    }
    if (anchor && buf.kind.group === "note") this.context.html.revealIn(buf, anchor.line);
    const topAnchor = anchor ?? this.context.positions.get(buf.key) ?? { ...TOP };
    const curAnchor =
      cursor ??
      (anchor
        ? { anchor, sub: 0, col: 0 }
        : (this.context.positions.getCursor(buf.key) ?? { anchor: topAnchor, sub: 0, col: 0 }));
    return {
      buf,
      top: 0,
      cur: { row: 0, col: 0 },
      goal: curAnchor.col,
      sel: null,
      visual: null,
      topAnchor,
      curAnchor,
      back: [],
      fwd: [],
      find: null,
      layoutKey: "",
      height: this.context.height,
      width: this.context.width,
      left: 0,
      ...(this.context.lens.opensInSource(buf) ? { source: true } : {}),
    };
  }

  /** Whether a file has a rendered view: markdown notes do, data files while they parse
   *  (16.11–16.14), text files never. */
  canRender(buf: NoteBuffer): boolean {
    if (buf.drawn) return true; // a layout of its own (a diff)
    if (buf.kind.group === "data") return !buf.parsed.error;
    return buf.kind.group === "note" || this.context.isCodeDocument(buf); // every note format has a reader (16.2)
  }

  /** Code that renders as a document (24.x): a language the view maps, independent of its opening default. */
  isCodeDocument(buf: NoteBuffer): boolean {
    if (buf.kind.group !== "text") return false;
    const g = grammarFor(buf.kind.format, extensionOf(buf.name));
    return !!g && DOCUMENT_GRAMMARS.has(g);
  }

  /** A window's layout at its width now, its gutter taken off. */
  currentLayout(view: View): Layout {
    return this.context.views.layoutFor(view, view.width, this.context.views.gutterWidth(view));
  }

  /** Move the cursor (extending the selection when asked, or in visual mode). */
  moveCursor(view: View, to: Pos, opts: { extend?: boolean; keepGoal?: boolean } = {}): void {
    this.context.outline.pinned = false; // the outline follows the cursor's section again
    const layout = this.context.currentLayout(view);
    const extend = opts.extend || view.visual !== null;
    if (extend && !view.sel) this.context.views.select(view, { ...view.cur }, view.visual === "line");
    if (!extend && view.sel && !view.visual) view.sel = null;
    view.cur = clampPos(layout, to);
    view.codeWheeled = false;
    view.curAnchor = this.context.views.cursorAnchorFor(layout, view.cur);
    // The selection's lines, kept after it ends: `:'<,'>s` works on the last one, as vim's marks.
    if (view.sel) this.context.views.markSelection(view, layout);
    this.context.views.ensureCursorVisible(view, layout);
    // The column on screen, once a code block the cursor is in has scrolled to it.
    if (!opts.keepGoal) view.goal = this.context.code.screenCol(view, layout, view.cur.row, view.cur.col);
  }

  /** The source line under the cursor (the span's it's on): where a hand-off opens the note. */
  cursorLine(view: View): number {
    const line = this.context.currentLayout(view).lines[view.cur.row];
    return line ? srcAt(line, view.cur.col) : 1;
  }

  /**
   * The cursor onto a source line (1-based; the column in code points): rendered, onto that line's
   * text — at its row's start, or inside a paragraph joined from several lines; in source mode, on
   * the column. A rendered row has no source columns: the column counts there only in source mode.
   */
  placeAtLine(v: View, line: number, column = 1): void {
    if (!v.source && v.buf.kind.group === "note") this.context.html.reveal(v, line);
    {
      const layout = this.context.currentLayout(v);
      const row = layout.lines.findIndex((l) => l.src === line && !l.decor);
      // Rendered: inside a paragraph joined from several lines, onto that line's text.
      const inside = row < 0 && !v.source ? posOfSrc(layout.lines, line) : null;
      if (inside && !layout.lines[inside.row]!.srcMap) this.context.moveCursor(v, inside);
      else if (row >= 0 && !layout.lines[row]!.srcMap) this.context.moveCursor(v, { row, col: 0 });
      else {
        const start = v.buf.lineStarts()[line - 1] ?? 0;
        const end = v.buf.source.indexOf("\n", start);
        const text = v.buf.source.slice(start, end < 0 ? undefined : end);
        this.callbacks.placeAt(v, start + [...text].slice(0, Math.max(0, column - 1)).join("").length);
      }
    }
  }
  /**
   * The vault's code files' grammars, loaded in the background (20.19): their comments' links count
   * as backlinks, and a rename or move rewrites them — laid out again once they're in.
   */
  loadCodeGrammars(): void {
    const g = this.context.graph;
    void g.loadGrammars().then(() => {
      if (this.context.graph !== g || this.context.quitting) return;
      for (const b of this.context.buffers.values()) b.invalidateLayouts();
      this.context.relayoutAll();
      this.context.host.requestRender();
    });
  }

  followLazy(): () => void {
    // A grammar (or anything lazy) that finished loading: lay out again and draw.
    return onLoaded((name) => {
      if (name !== MERMAID && name !== "pictures" && name !== REGEX) this.context.graph.grammarsChanged(); // code files' comment links can be read now (16.10)
      // Notes drawn while it loaded (a Mermaid diagram as its code, 12.10): drawn again — those only.
      for (const b of this.context.buffers.values()) b.arrived(name);
      this.context.relayoutAll();
      this.context.host.requestRender();
    });
  }
}
