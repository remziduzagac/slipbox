// The lens and source mode (4.13–4.15): a window shows its note rendered, as its markdown, or as live preview — the
// render with the cursor's block as its markdown, in a lens that sizes and pins itself as it moves.

import { offsetOf, placeAt, stopInsert } from "./editing.ts";
import { cellBlocks } from "../core/rendering/layout/code/code.ts";
import {
  type Block,
  blockAt,
  blockRanges,
  composeLive,
  LENS_COUNTERS,
  sectionRanges,
} from "../core/rendering/layout/markdown/live.ts";
import type { Layout } from "../core/rendering/layout/ir.ts";
import { stringWidth } from "../core/foundation/text/width.ts";
import type { NoteBuffer } from "./buffer.ts";
import type { App, View } from "./app.ts";
import { type ViewMode, viewMode } from "./modes.ts";

export { MODES, type ViewMode, viewMode } from "./modes.ts";

/** What's said of a data file that doesn't parse, each place it's said: one wording, so one click can tell it said it. */
export function unparsedText(buf: NoteBuffer): string {
  return `${buf.name} doesn't parse — ${buf.parsed.error}: source mode`;
}

/** The lens, live preview and source mode. */
export class Lens {
  constructor(readonly app: App) {}

  /** Opening defaults select a presentation without changing its availability (VB-D2). */
  renderByDefault(buf: NoteBuffer): boolean {
    if (buf.drawn) return true;
    if (buf.kind.group === "note") return this.app.config.render.notes;
    if (buf.kind.group === "data") return this.app.config.render.data;
    return this.app.config.render.code;
  }

  /** Initial presentation, explaining only an unavailable READ view. */
  opensInSource(buf: NoteBuffer): boolean {
    if (this.app.canRender(buf)) return !this.renderByDefault(buf);
    this.saySourceWhy(buf);
    return true;
  }

  /** A data file that opens in source mode because it doesn't parse (16.14): the error said. */
  saySourceWhy(buf: NoteBuffer): void {
    if (buf.kind.group === "data" && buf.parsed.error) this.app.message("warn", unparsedText(buf));
  }

  /**
   * A window now showing another buffer: the old one's lens and rows go (its render, size, place and
   * inner scroll), so a lens left open opens again on the new note's cursor block; its code blocks' offsets too.
   */
  resetForBuffer(view: View): void {
    Object.assign(view, {
      codeLeft: undefined,
      liveBase: undefined,
      lensSize: undefined,
      lensPin: undefined,
      lensInner: 0,
      lensStep: undefined,
      lensClick: undefined,
      topSub: 0,
      anchorVersion: undefined,
      layoutKey: "",
    });
  }

  /**
   * After a window changes file: one with no render goes to source mode; a window that was only in
   * source mode for such a file (from `before`) renders again for one that can; the old file's lens
   * state goes (resetForBuffer).
   */
  fitMode(view: View, before: NoteBuffer): void {
    if (view.buf === before && this.app.canRender(view.buf)) return;
    if (view.buf !== before) this.resetForBuffer(view);
    const forced = !this.app.canRender(before) || !this.renderByDefault(before);
    if (!this.app.canRender(view.buf)) {
      const was = view.source; // already so from makeView, which said why
      Object.assign(view, { source: true, live: false, liveBase: undefined });
      if (!was) this.saySourceWhy(view.buf);
    } else if (!this.renderByDefault(view.buf)) Object.assign(view, { source: true, live: false, liveBase: undefined });
    else if (forced) Object.assign(view, { source: false, live: false, liveBase: undefined });
  }

  /**
   * The lens keeps its height on screen: when it moves or grows, the page scrolls under it. While it
   * stays the same, wherever it is now (the wheel, the cursor) is where it's kept.
   */
  pin(view: View, layout: Layout): void {
    const top = layout.lines.findIndex((l) => l.lens === "top");
    if (top < 0) return;
    const range = `${view.liveBase!.active[0]}-${view.liveBase!.active[1]}`;
    const hidden = this.hidden(view, layout);
    const pin = view.lensPin;
    if (!pin) {
      view.lensPin = { range, screen: this.visibleBetween(hidden, view.top, top) };
      return;
    }
    const click = view.lensClick;
    view.lensClick = undefined;
    if (pin.range !== range) {
      pin.range = range;
      // A click: the clicked line stays under the pointer. The keyboard: the lens stays put.
      view.top = this.app.views.clampTop(
        view,
        layout,
        click !== undefined
          ? this.stepVisible(layout, hidden, view.cur.row, -click)
          : this.stepVisible(layout, hidden, top, -pin.screen),
      );
      this.app.views.anchorTop(view, layout);
      this.app.views.ensureCursorVisible(view, layout);
    }
    pin.screen = this.visibleBetween(hidden, view.top, top);
  }

  /**
   * The lens (live preview, 4.14): the render, with whole blocks around the cursor's line as their
   * markdown between two rules. It opens on the cursor's block, grown by its neighbours to
   * `lens_min_rows`; the cursor reaching past an edge brings the next block in, dropping the far
   * ones past `lens_max` of the window; a jump moves it to the block landed on. While it's typed
   * into, the render around it is reused (no re-parse); leaving insert mode, or an edit reaching
   * outside it, lays the note out afresh.
   */
  liveLayout(view: View, width: number): Layout {
    const buf = view.buf;
    const line = Math.max(1, view.curAnchor.anchor.line || 1);
    const wrap = this.app.ui.wrap;
    const starts = buf.lineStarts();
    const lineCount = Math.max(1, starts.length - (buf.source.endsWith("\n") && starts.length > 1 ? 1 : 0));
    const texts = buf.lines();
    // Rows a run of lines takes in the lens (wrapped at the width its counters leave).
    const textWidth = width - (["lens", "both"].includes(this.app.config.ui.relative_numbers) ? LENS_COUNTERS : 0);
    const rowsOf = (s: number, e: number) => {
      let n = 0;
      for (let k = s; k <= e; k++)
        n += wrap ? Math.max(1, Math.ceil(stringWidth(texts[k - 1] ?? "") / Math.max(1, textWidth))) : 1;
      return n;
    };
    // A data file's blocks are cards (a key and its values, 16.12): the lens is the cursor's card,
    // never padded with pieces of its neighbours, and it moves to the next card rather than
    // gathering them.
    // A CSV or TSV is rows: the lens is a few of them around the cursor, sliding a row at a time.
    const rows = buf.kind.format === "csv" || buf.kind.format === "tsv";
    const cards = buf.kind.group === "data" && !rows;
    // A size set by hand (`+` `-`) is the lens's size wherever it goes, until `=`.
    const minRows = view.lensSize ?? (cards ? 1 : this.app.config.editor.lens_min_rows);
    const maxRows =
      view.lensSize !== undefined || rows
        ? minRows
        : Math.max(minRows, Math.floor(Math.max(1, view.height) * this.app.config.editor.lens_max));
    // The lens on the cursor's block, grown by its neighbours (below, then above) to the minimum — or its unit whole (a
    // code cell, a note's section), alone.
    const openOn = (blocks: Block[], at: number, unit?: (line: number) => Block | null): Block => {
      const whole = unit?.(at);
      if (whole) return whole;
      const i = blocks.findIndex((b) => at >= b[0] && at <= b[1]);
      let lo = i < 0 ? blocks.length - 1 : i;
      let hi = lo;
      // A neighbour comes in only if the lens still fits its maximum with it: a small block next to
      // a huge one stays small rather than swallowing it.
      const fits = (a: number, b: number) => rowsOf(blocks[a]![0], blocks[b]![1]) <= maxRows;
      let below = true;
      let above = true;
      while (rowsOf(blocks[lo]![0], blocks[hi]![1]) < minRows && (below || above)) {
        below = hi + 1 < blocks.length && fits(lo, hi + 1);
        if (below) hi++;
        if (rowsOf(blocks[lo]![0], blocks[hi]![1]) >= minRows) break;
        above = lo > 0 && fits(lo - 1, hi);
        if (above) lo--;
      }
      return [blocks[lo]![0], blocks[hi]![1]];
    };
    // The cursor past an edge: the blocks up to its one come in; far ones go past the maximum. Into a unit whole (a code
    // cell, a note's section): the lens moves to it.
    const follow = (blocks: Block[], range: Block, at: number, unit?: (line: number) => Block | null): Block => {
      if (at >= range[0] && at <= range[1]) return range;
      if (cards) return openOn(blocks, at);
      const whole = unit?.(at);
      if (whole) return whole;
      let lo = blocks.findIndex((b) => b[0] === range[0]);
      let hi = blocks.findIndex((b) => b[1] === range[1]);
      const i = blocks.findIndex((b) => at >= b[0] && at <= b[1]);
      if (lo < 0 || hi < 0 || i < 0 || i > hi + 1 || i < lo - 1) return openOn(blocks, at); // a jump
      if (i > hi) hi = i;
      else lo = i;
      while (rowsOf(blocks[lo]![0], blocks[hi]![1]) > maxRows && lo < hi) {
        if (i === hi) lo++;
        else hi--;
      }
      return [blocks[lo]![0], blocks[hi]![1]];
    };
    const around = (range: Block) => ({
      before: buf.source.slice(0, starts[range[0] - 1] ?? 0),
      after: buf.source.slice(starts[range[1]] ?? buf.source.length),
    });
    // Code (24.8): the document view around a lens of its own blocks — a cell whole when it fits (24.16), else a line,
    // a doc comment, the imports. A note: its innermost section whole when it fits, else its blocks. A size set by hand
    // is the lens's, whatever the unit.
    const code = this.app.isCodeDocument(buf);
    const fits = (s: number, e: number) => rowsOf(s, e) <= maxRows;
    // Its pictures as this window shows them (PIC): their key changed, the note around the lens is laid out again.
    const pictures = code ? undefined : this.app.pictures.forView(view, width);
    const fresh = (prev?: Block): LiveBase => {
      const rendered = code
        ? buf.codeLayout(width, wrap, this.app.glyphs, this.app.ui.code_cells, this.app.code.cellProblems(view))
        : buf.layout(
            width,
            this.app.glyphs,
            this.app.ui.urls,
            buf.rel ? this.app.graph : null,
            pictures,
            this.app.code.scrolls(),
            this.app.config.render.caption,
            this.app.html.options(buf),
          );
      let blocks = code ? buf.codeBlocks(lineCount) : blockRanges(buf.parsed.tree, lineCount);
      let unit: ((at: number) => Block | null) | undefined;
      if (code) {
        const cells = cellBlocks(blocks, rendered.cells ?? [], fits);
        blocks = cells.blocks;
        unit = (at) => blocks.find((b) => at >= b[0] && at <= b[1] && cells.whole.has(b[0])) ?? null;
      } else if (buf.kind.group === "note") {
        const sections = sectionRanges(buf.parsed.tree, lineCount);
        unit = (at) => {
          const s = sections.filter((x) => x[0] <= at).at(-1);
          return s && at <= s[1] && fits(s[0], s[1]) ? s : null;
        };
      }
      if (view.lensSize !== undefined) unit = undefined;
      // After an edit, the lens keeps covering the lines it did (snapped to whole blocks).
      let range: Block;
      if (prev) {
        const s = blockAt(blocks, Math.min(prev[0], lineCount));
        const e = blockAt(blocks, Math.min(Math.max(prev[0], prev[1]), lineCount));
        range = follow(blocks, [s[0], e[1]], Math.min(line, lineCount), unit);
      } else range = openOn(blocks, Math.min(line, lineCount), unit);
      return {
        rendered,
        width,
        wrap,
        codeScroll: this.app.code.scrolls(),
        caption: this.app.config.render.caption,
        pictures: pictures?.key ?? "",
        renderedVersion: buf.version,
        version: buf.version,
        blocks,
        unit,
        old: range,
        active: range,
        ...around(range),
        lineCount,
      };
    };
    let base = view.liveBase;
    // A cell's ✎ (24.13): the lens on its lines.
    const asked = view.lensRange;
    view.lensRange = undefined;
    if (
      !base ||
      base.width !== width ||
      base.wrap !== wrap ||
      base.codeScroll !== this.app.code.scrolls() ||
      base.caption !== this.app.config.render.caption ||
      asked
    )
      base = fresh(asked);
    else if (buf.version !== base.version) {
      // Typed into the lens, the rest untouched: the same render, the lens longer or shorter.
      // …and the line break that ends the lens survived (a delete at its last line's end joins the
      // line below into it: that's an edit across the edge, not inside).
      const edgeKept = !base.after || buf.source[buf.source.length - base.after.length - 1] === "\n";
      const untouched =
        buf.source.startsWith(base.before) &&
        buf.source.endsWith(base.after) &&
        buf.source.length >= base.before.length + base.after.length &&
        edgeKept;
      const grew = lineCount - base.lineCount;
      const active: Block = [base.active[0], Math.max(base.active[0], base.active[1] + grew)];
      if (view.insert && untouched) base = { ...base, version: buf.version, active, lineCount, composed: undefined };
      // Your own edit (typing across an edge, dd, a replace inside it): the lens keeps its lines,
      // grown or shrunk by it, and typing extends it to wherever the cursor goes (below). A change
      // from elsewhere while you're not typing (an agent's, a :%s) says nothing about where the
      // lens should be: it opens on the cursor's block again, the size it would open at.
      else base = view.insert || untouched ? fresh(active) : fresh();
    } else if (line < base.active[0] || line > base.active[1]) {
      if (base.renderedVersion === buf.version) {
        // A size set by hand (+, -) slides at that size: no unit to jump to.
        const range = follow(base.blocks, base.active, line, view.lensSize === undefined ? base.unit : undefined);
        base = { ...base, old: range, active: range, ...around(range), composed: undefined };
      } else base = fresh(view.insert ? [Math.min(base.active[0], line), Math.max(base.active[1], line)] : base.active); // typing never sits outside it
    }
    if (!view.insert && base.renderedVersion !== buf.version) base = fresh(base.active);
    // Its pictures sized again (the window's height, one at its own size): the note around it laid out again, the lens
    // on the lines it was on.
    else if (base.pictures !== (pictures?.key ?? "")) base = fresh(base.active);
    // `+` / `-`: a block more (below, or above at the note's end), or the one farthest from the
    // cursor less; the size it comes to is kept.
    const step = view.lensStep;
    view.lensStep = undefined;
    if (step && base.renderedVersion === buf.version) {
      const bl = base.blocks;
      let lo = bl.findIndex((b) => b[0] === base!.active[0]);
      let hi = bl.findIndex((b) => b[1] === base!.active[1]);
      if (lo >= 0 && hi >= 0) {
        const at = bl.findIndex((b) => line >= b[0] && line <= b[1]);
        if (step > 0) {
          if (hi + 1 < bl.length) hi++;
          else if (lo > 0) lo--;
          else this.app.message("info", `the lens holds the whole ${buf.kind.group === "note" ? "note" : "file"}`);
        } else if (lo < hi) {
          if (at - lo >= hi - at) lo++;
          else hi--;
        } else this.app.message("info", "the lens is one block — esc closes it");
        const range: Block = [bl[lo]![0], bl[hi]![1]];
        view.lensSize = rowsOf(range[0], range[1]);
        base = { ...base, old: range, active: range, ...around(range), composed: undefined };
      }
    }
    view.liveBase = base;
    const editing = !!view.insert;
    const key = `${base.active[0]}-${base.active[1]}:${buf.version}:${base.renderedVersion}:${editing ? "e" : "v"}`;
    if (base.composed?.key === key) return base.composed.layout;
    const spans = code ? buf.syntax?.spans : undefined;
    const layout = composeLive(base.rendered, base.old, base.active, texts, {
      width,
      wrap,
      rule: this.app.glyphs.lensRule,
      editing,
      ...(["lens", "both"].includes(this.app.config.ui.relative_numbers) ? { counters: LENS_COUNTERS } : {}),
      ...(code ? { language: buf.kind.format, ...(spans ? { spans: (l: number) => spans.get(l) } : {}) } : {}),
    });
    base.composed = { key, layout };
    return layout;
  }

  /** Show a window's note as its markdown (`on`) or rendered; the cursor keeps its source line. */
  setSource(view: View, on: boolean): void {
    this.setViewMode(view, on ? "source" : "rendered");
  }

  /**
   * Why a window can't switch to `mode` (HDR-D2), said by `setViewMode`, drawn as a disabled button on its header
   * (`canSwitch`); null when it can, or is in it. It says nothing itself. The header asks every frame and so never
   * parses: there a data file changed since its last parse is taken to parse, its Read and Lens lit, until a parse
   * says otherwise (a click's asks of the text as it is).
   */
  refusal(view: View, mode: ViewMode): { level: "info" | "warn"; text: string } | null {
    const buf = view.buf;
    const why = this.refusedBy(view, mode, false);
    if (!why) return null;
    if (why === "drawn") return { level: "info", text: "a diff is drawn one way" };
    if (why === "unparsed") return { level: "warn", text: unparsedText(buf) };
    return {
      level: "info",
      text: `${buf.name} ${buf.kind.group === "text" ? "has no rendered view" : "has no rendered view yet"}: source mode`,
    };
  }

  /** Whether a window can switch to `mode`, for its header's buttons: `refusal` without its words (drawing: never parses). */
  canSwitch(view: View, mode: ViewMode): boolean {
    return !this.refusedBy(view, mode, true);
  }

  /** Why `refusal` refuses, if it does: a drawn buffer, data that doesn't parse, a file with no rendered view. */
  private refusedBy(view: View, mode: ViewMode, drawing: boolean): "drawn" | "unparsed" | "unrendered" | null {
    if (viewMode(view) === mode) return null;
    const buf = view.buf;
    if (buf.drawn) return "drawn";
    if (mode === "source") return null;
    if (drawing && buf.kind.group === "data" && !buf.parseCurrent) return null;
    if (this.app.canRender(buf)) return null;
    return buf.kind.group === "data" ? "unparsed" : "unrendered";
  }

  /** A window's mode: rendered, source (the markdown), or live preview. The cursor keeps its line. */
  setViewMode(view: View, mode: ViewMode): void {
    if (viewMode(view) === mode) return;
    const refused = this.refusal(view, mode);
    if (refused) return this.app.message(refused.level, refused.text);
    if (view.insert) stopInsert(this.app, view);
    this.app.history.remember(view);
    // On a row of the file's text, the cursor keeps its character, not its column (a code cell's rows are framed).
    const keep = this.app.currentLayout(view).lines[view.cur.row]?.srcMap ? offsetOf(this.app, view) : null;
    view.source = mode === "source";
    view.live = mode === "live";
    view.liveBase = undefined;
    view.lensSize = undefined; // a lens opened again sizes itself
    view.lensPin = undefined;
    view.lensInner = 0;
    view.layoutKey = ""; // re-derive the rows from the anchors: the same source line
    view.sel = null;
    view.visual = null;
    if (keep !== null) placeAt(this.app, view, keep);
  }

  /** The mode the editing keys switch a rendered window to (`[editor] edit_in`), code's document view too (24.8). */
  editMode(_view?: View | null): "source" | "live" {
    return this.app.config.editor.edit_in === "source" ? "source" : "live";
  }

  // The lens's inner window (4.15): a lens taller than `lens_max` of the window shows that many of
  // its rows, scrolled to keep the cursor in; the rest of its rows stay in the layout (so motions,
  // find and editing see them) but aren't drawn. These helpers map screen rows to layout rows
  // around them — the drawing, clicks, drags and scrolling go through them.

  /** Rows the lens may show at once. */
  rows(view: View): number {
    return Math.max(
      this.app.config.editor.lens_min_rows,
      Math.floor(Math.max(1, view.height) * this.app.config.editor.lens_max),
    );
  }

  /** The lens's rows left out of the drawing: above its inner window and below it ([a, b) each). */
  hidden(view: View, layout: Layout): [number, number][] {
    if (!view.live) return [];
    const first = layout.lines.findIndex((l) => l.lens === "source");
    if (first < 0) return [];
    let n = 0;
    while (layout.lines[first + n]?.lens === "source") n++;
    const max = this.rows(view);
    if (n <= max) {
      view.lensInner = 0;
      return [];
    }
    const inner = Math.max(0, Math.min(view.lensInner ?? 0, n - max));
    view.lensInner = inner;
    const out: [number, number][] = [];
    if (inner > 0) out.push([first, first + inner]);
    if (inner + max < n) out.push([first + inner + max, first + n]);
    return out;
  }

  /** From `row`, `n` shown rows on (back when negative), skipping hidden ones; within the layout. */
  stepVisible(layout: Layout, hidden: [number, number][], row: number, n: number): number {
    let r = row;
    let k = Math.abs(n);
    const dir = n < 0 ? -1 : 1;
    while (k > 0) {
      const next = r + dir;
      if (next < 0 || next > layout.lines.length) break;
      r = next;
      if (r < layout.lines.length && !isHidden(hidden, r)) k--;
    }
    return Math.max(0, Math.min(r, Math.max(0, layout.lines.length - 1)));
  }

  /** The layout rows a window shows, top to bottom. */
  screenRows(view: View, layout: Layout): number[] {
    const hidden = this.hidden(view, layout);
    const out: number[] = [];
    for (let r = view.top; r < layout.lines.length && out.length < view.height; r++)
      if (!isHidden(hidden, r)) out.push(r);
    return out;
  }

  /** How many shown rows lie between `a` and `b` (negative when `b` is before `a`). */
  visibleBetween(hidden: [number, number][], a: number, b: number): number {
    let n = 0;
    for (let r = Math.min(a, b); r < Math.max(a, b); r++) if (!isHidden(hidden, r)) n++;
    return b >= a ? n : -n;
  }

  /** The cursor inside an oversized lens: its window scrolls to keep it two rows from the rules. */
  follow(view: View, layout: Layout): void {
    if (!view.live || layout.lines[view.cur.row]?.lens !== "source") return;
    const first = layout.lines.findIndex((l) => l.lens === "source");
    const max = this.rows(view);
    const idx = view.cur.row - first;
    const m = Math.min(2, Math.floor((max - 1) / 2));
    let inner = view.lensInner ?? 0;
    if (idx < inner + m) inner = idx - m;
    else if (idx > inner + max - 1 - m) inner = idx - max + 1 + m;
    view.lensInner = Math.max(0, inner);
  }
}

/** What live preview composes from: a render, the blocks of its parse, and which one is active. */
export interface LiveBase {
  rendered: Layout;
  width: number;
  wrap: boolean;
  /** Its code blocks too wide kept whole, to scroll sideways (`[render] code_wrap`). */
  codeScroll: boolean;
  caption: "bottom" | "top";
  /** Its pictures' key, as its window showed them (PIC). */
  pictures: string;
  /** The buffer version the render was made from, and the one the block was last matched to. */
  renderedVersion: number;
  version: number;
  blocks: Block[];
  /** The active block in the render's numbering, and now (grown or shrunk by typing). */
  old: Block;
  active: Block;
  /** The text around the block when the render was made: typing must leave it alone. */
  before: string;
  after: string;
  lineCount: number;
  composed?: { key: string; layout: Layout };
  /** The whole piece around a line when it fits the lens — a code cell (24.16), a note's innermost section — or null:
   *  the lens opens on one alone, and moves to the next whole rather than gathering it. */
  unit?: (line: number) => Block | null;
}

/** Whether layout row `r` is left out of the drawing (an oversized lens's hidden rows). */
export function isHidden(hidden: [number, number][], r: number): boolean {
  for (const [a, b] of hidden) if (r >= a && r < b) return true;
  return false;
}
