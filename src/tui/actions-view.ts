// The commands that move and view (`cursor.*`, `scroll.*`, `visual.*`, `view.*`, `lens.*`): the cursor's motions,
// with vim's counts in source mode; scrolling; visual mode; the view's mode and the lens's size.

import { type Run, lay, withView } from "./actions.ts";
import * as C from "./cursor.ts";
import { type App, type View, editable } from "./app.ts";
import { bracketFrom, matchBracket } from "../core/brackets.ts";
import * as E from "./editing.ts";
import * as V from "./vim.ts";
import { visualOp } from "./actions-edit.ts";
import { type ViewMode, viewMode } from "./lens.ts";

/** Moving and viewing: the cursor's motions, scrolling, visual mode, the view's mode and the lens. */
export function viewActions(): Record<string, Run> {
  return {
    // cursor
    "cursor.left": motion((a, v) => C.left(lay(a, v), v.cur)),
    "cursor.right": motion((a, v) => C.right(lay(a, v), v.cur)),
    "cursor.up": motion((a, v) => C.vertical(lay(a, v), v.cur, -1, v.goal, goalAt(a, v)), { keepGoal: true }),
    "cursor.down": motion((a, v) => C.vertical(lay(a, v), v.cur, 1, v.goal, goalAt(a, v)), { keepGoal: true }),
    "cursor.word_prev": motion((a, v) => C.wordPrev(lay(a, v), v.cur)),
    "cursor.word_next": motion((a, v) => C.wordNext(lay(a, v), v.cur)),
    "cursor.word_end": motion((a, v) => C.wordEnd(lay(a, v), v.cur)),
    "cursor.line_start": motion((a, v) => C.lineStart(lay(a, v), v.cur)),
    "cursor.line_end": motion((a, v) => C.lineEnd(lay(a, v), v.cur)),
    "cursor.first_nonblank": motion((a, v) => C.firstNonBlank(lay(a, v), v.cur)),
    // gg and G; with a count in source mode (3gg, 5G), that line of the note, as vim.
    "cursor.top": motion((a, v) => countedLine(a, v) ?? C.top(lay(a, v))),
    "cursor.bottom": motion((a, v) => countedLine(a, v) ?? (editable(v) ? lastLine(a, v) : C.bottom(lay(a, v)))),
    "cursor.heading_prev": motion((a, v) => C.headingPrev(lay(a, v), v.cur)),
    "cursor.heading_next": motion((a, v) => C.headingNext(lay(a, v), v.cur)),
    "cursor.paragraph_prev": motion((a, v) => C.paragraphPrev(lay(a, v), v.cur)),
    "cursor.paragraph_next": motion((a, v) => C.paragraphNext(lay(a, v), v.cur)),
    "cursor.screen_top": motion((a, v) => C.firstNonBlank(lay(a, v), a.views.screenRow(v, "top"))),
    "cursor.screen_middle": motion((a, v) => C.firstNonBlank(lay(a, v), a.views.screenRow(v, "middle"))),
    "cursor.screen_bottom": motion((a, v) => C.firstNonBlank(lay(a, v), a.views.screenRow(v, "bottom"))),
    // % (25.3): from the bracket at the cursor, or the line's next one, to its match — the text's, so source mode's.
    "cursor.match_bracket": (a) =>
      withView(a, (v) => {
        if (!editable(v)) return a.message("info", "% goes by the text: in source mode (space n v) or live preview");
        const text = v.buf.source;
        const from = bracketFrom(text, E.offsetOf(a, v));
        if (from < 0) return a.message("info", "no bracket here or after it on the line");
        const to = matchBracket(text, from);
        if (to < 0) return a.message("info", `no ${text[from]} to match this one`);
        E.placeAt(a, v, to);
      }),
    "scroll.center": (a) => withView(a, (v) => a.views.scrollCursorTo(v, "center")),
    "scroll.top": (a) => withView(a, (v) => a.views.scrollCursorTo(v, "top")),
    "scroll.bottom": (a) => withView(a, (v) => a.views.scrollCursorTo(v, "bottom")),
    "cursor.goto_line": (a, arg) =>
      withView(a, (v) => {
        const go = (text: string) => {
          const n = Number(text.trim());
          if (!Number.isInteger(n) || n < 1) return a.message("warn", `not a line number: ${text}`);
          a.history.push(v);
          // Onto that line's text: in a rendered paragraph joined from several, not its row's end.
          a.placeAtLine(v, Math.min(n, v.buf.lineStarts().length));
        };
        if (arg) return go(arg);
        a.overlays.prompt("line", go, undefined, undefined, v);
      }),
    "cursor.half_down": (a) => withView(a, (v) => a.views.scrollBy(v, Math.max(1, Math.floor(v.height / 2)), true)),
    "cursor.half_up": (a) => withView(a, (v) => a.views.scrollBy(v, -Math.max(1, Math.floor(v.height / 2)), true)),
    "cursor.page_down": (a, arg) =>
      withView(a, (v) => {
        const n = Math.max(1, v.height - 2);
        if (arg === "extend") extendOrMove(a, v, C.vertical(lay(a, v), v.cur, n, v.goal, goalAt(a, v)), true, true);
        else a.views.scrollBy(v, n, true);
      }),
    "cursor.page_up": (a, arg) =>
      withView(a, (v) => {
        const n = Math.max(1, v.height - 2);
        if (arg === "extend") extendOrMove(a, v, C.vertical(lay(a, v), v.cur, -n, v.goal, goalAt(a, v)), true, true);
        else a.views.scrollBy(v, -n, true);
      }),
    // selection
    "visual.char": (a) =>
      withView(a, (v) => {
        if (v.visual === "char") return void Object.assign(v, { visual: null, sel: null });
        v.visual = "char";
        if (v.sel) v.sel.line = false;
        else a.views.select(v, { ...v.cur }, false);
      }),
    "visual.line": (a) =>
      withView(a, (v) => {
        if (v.visual === "line") return void Object.assign(v, { visual: null, sel: null });
        v.visual = "line";
        if (v.sel) v.sel.line = true;
        else a.views.select(v, { ...v.cur }, true);
      }),
    "visual.swap": (a) =>
      withView(a, (v) => {
        if (!v.sel) return;
        const anchor = v.sel.anchor;
        a.views.select(v, { ...v.cur }, v.sel.line);
        a.moveCursor(v, anchor);
      }),
    "visual.yank": (a) =>
      withView(a, (v) => {
        const text = a.views.selectionText(v);
        if (text) a.copy(text);
        // In source mode the text is the markdown itself: it's what p puts back, too.
        if (text && editable(v))
          a.vim.register = { text: v.visual === "line" ? `${text}\n` : text, linewise: v.visual === "line" };
        // The cursor goes to the selection's start, as vim's does: p and P then put where expected.
        const [start] = C.ordered(v.sel?.anchor ?? v.cur, v.cur);
        Object.assign(v, { visual: null, sel: null });
        if (editable(v)) a.moveCursor(v, start);
      }),
    "visual.exit": (a) =>
      withView(a, (v) => {
        a.vim.awaitChar = null; // an f / t left waiting never takes a later key
        Object.assign(v, { visual: null, sel: null });
      }),
    // f F t T: a character on the line; ; and , again, the same way or back.
    "cursor.find_char": (a, arg) =>
      withView(a, (v) => {
        const kind = (arg === "F" || arg === "t" || arg === "T" ? arg : "f") as V.FindKind;
        const n = V.takeCount(a);
        a.vim.awaitKey = `${n > 1 ? n : ""}${kind}`;
        a.vim.awaitChar = (ch) => {
          a.vim.lastFind = { kind, ch };
          const to = C.findChar(lay(a, v), v.cur, kind, ch, n);
          if (to) a.moveCursor(v, to);
        };
      }),
    "cursor.find_repeat": (a, arg) =>
      withView(a, (v) => {
        const f = a.vim.lastFind;
        if (!f) return a.message("info", "no f or t to repeat yet");
        const to = C.findChar(
          lay(a, v),
          v.cur,
          arg === "back" ? V.reverseFind(f.kind) : f.kind,
          f.ch,
          V.takeCount(a),
          true,
        );
        if (to) a.moveCursor(v, to);
      }),
    "view.source": (a) => withView(a, (v) => switchMode(a, v, v.source ? "rendered" : "source")),
    "view.live": (a) => withView(a, (v) => switchMode(a, v, v.live ? "rendered" : "live")),
    // The header's buttons (HDR-D2): a mode set, not toggled; in the mode the window is in, nothing.
    "view.mode_read": (a) => withView(a, (v) => switchMode(a, v, "rendered")),
    "view.mode_lens": (a) => withView(a, (v) => switchMode(a, v, "live")),
    "view.mode_source": (a) => withView(a, (v) => switchMode(a, v, "source")),
    // The lens's size by hand: a block more or less, kept as it moves; `=` lets it size itself.
    "lens.grow": (a) => lensStep(a, 1),
    "lens.shrink": (a) => lensStep(a, -1),
    "lens.reset": (a) =>
      withView(a, (v) => {
        if (!v.live) return a.message("info", "the lens isn't open — space n l opens it");
        Object.assign(v, { lensSize: undefined, liveBase: undefined, layoutKey: "" });
      }),
    // Visual mode's operators, on the selection (source mode).
    "visual.delete": (a) => visualOp(a, "d"),
    "visual.change": (a) => visualOp(a, "c"),
    "visual.indent": (a) => visualOp(a, ">"),
    "visual.outdent": (a) => visualOp(a, "<"),
    "visual.comment": (a) => visualOp(a, "gc"),
  };
}

/**
 * A window switched to `mode`, then what it shows now said. In that mode already, nothing; refused (a file with no
 * render, a diff), `setViewMode`'s own message says why.
 */
function switchMode(a: App, v: View, mode: ViewMode): void {
  const was = viewMode(v);
  if (was === mode) return;
  a.lens.setViewMode(v, mode);
  if (viewMode(v) === was) return;
  const code = a.isCodeDocument(v.buf);
  if (v.source)
    a.message("info", `source — ${v.buf.kind.group === "note" ? "the note's markdown" : "the file as written"}`);
  else if (v.live)
    a.message(
      "info",
      `the lens: the ${v.buf.kind.group === "text" ? "code" : "markdown"} around the cursor — esc closes it`,
    );
  else a.message("info", code ? "the code as a document" : "rendered");
}

/** Where a vertical move lands on a row: the layout column drawn at the goal's screen column (Code.layoutCol). */
function goalAt(a: App, v: View): (row: number, col: number) => number {
  const layout = lay(a, v);
  return (row, col) => a.code.layoutCol(v, layout, row, col);
}

/** A cursor command: compute the target from the layout, then move (extending when asked). */
function motion(target: (a: App, v: View) => C.Pos, opts: { keepGoal?: boolean } = {}): Run {
  return (a, arg) =>
    withView(a, (v) => {
      extendOrMove(a, v, target(a, v), arg === "extend", opts.keepGoal);
    });
}

/**
 * The cursor moved, the selection extended when asked (`shift` with a move). Where the text is editable, a selection
 * so made is a visual one, as a drag's is (DF-D15): `d`, `x` and `c` act on it, and `esc` leaves it.
 */
function extendOrMove(a: App, v: View, to: C.Pos, extend: boolean, keepGoal?: boolean): void {
  a.moveCursor(v, to, { extend, keepGoal });
  if (extend && v.sel && !v.visual && !v.insert && editable(v)) v.visual = "char";
}

/** A count typed before gg or G, in an editable window: that source line's first non-blank, as G. */
function countedLine(a: App, v: View): C.Pos | null {
  if (!editable(v) || !a.vim.count) return null;
  return lastLine(a, v, V.takeCount(a));
}

/**
 * G where the text is editable: the last source line's first non-blank, as vim has it (or line
 * `upTo`'s, for 5G). (The last rendered row belongs to its block's first line: in the lens, `Gdd`
 * would take the wrong line.)
 */
function lastLine(a: App, v: View, upTo = Infinity): C.Pos {
  const starts = v.buf.lineStarts();
  const n = Math.min(upTo, Math.max(1, starts.length - (v.buf.source.endsWith("\n") ? 1 : 0)));
  E.placeAt(a, v, (starts[n - 1] ?? 0) + /^\s*/.exec(E.lineText(v, n))![0].length);
  return { ...v.cur };
}

function lensStep(a: App, step: 1 | -1): void {
  withView(a, (v) => {
    if (!v.live) return a.message("info", "the lens isn't open — space n l opens it");
    Object.assign(v, { lensStep: step, layoutKey: "" });
  });
}
