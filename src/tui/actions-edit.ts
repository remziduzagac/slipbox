// The commands that edit (`edit.*`, `task.*`, `spell.*`, saving): insert mode, vim's operators and the register,
// undo and redo, spelling's fixes; a note saved, reverted, resolved, or handed to an editor.

import { type Run, withView } from "./actions.ts";
import { spellStep, spellSuggest, spellAdd } from "./spelling.ts";
import * as E from "./editing.ts";
import * as V from "./vim.ts";
import { graphemes } from "../core/width.ts";
import { type App, type View, editable } from "./app.ts";
import { endSnippet } from "./snippets.ts";
import * as C from "./cursor.ts";

/** Editing: insert mode, vim's operators, the register, undo, spelling; saving, and hand-offs to an editor. */
export function editActions(): Record<string, Run> {
  return {
    "spell.next": (a) => withView(a, (v) => spellStep(a, v, 1)),
    "spell.prev": (a) => withView(a, (v) => spellStep(a, v, -1)),
    "spell.suggest": (a) => withView(a, (v) => spellSuggest(a, v)),
    "spell.add": (a) => withView(a, (v) => spellAdd(a, v)),
    // history
    "edit.move_line_up": (a) => withView(a, (v) => E.moveLines(a, v, -1)),
    "edit.move_line_down": (a) => withView(a, (v) => E.moveLines(a, v, 1)),
    "edit.insert_last": (a) =>
      withView(a, (v) => {
        const at = v.buf.lastInsert;
        if (at === null) return a.message("info", "no insert yet in this note");
        a.history.push(v);
        E.startInsert(a, v, () => Math.min(at, v.buf.source.length));
      }),
    "task.toggle": (a) => withView(a, (v) => a.views.toggleTaskAt(v)),
    "note.edit": (a) => withView(a, (v) => a.handoff.editInEditor(v)),
    // Editing (source mode; step 3). Entering insert from the render switches to source first.
    "edit.insert": (a) => withView(a, (v) => E.startInsert(a, v, (w) => E.offsetOf(a, w))),
    "edit.append": (a) =>
      withView(a, (v) =>
        E.startInsert(a, v, (w) => {
          const at = E.offsetOf(a, w);
          return Math.min(E.nextBoundary(w.buf.source, at), E.lineEnd(w, at));
        }),
      ),
    "edit.insert_line_start": (a) =>
      withView(a, (v) =>
        E.startInsert(a, v, (w) => {
          const src = E.lineOf(w, E.offsetOf(a, w));
          return (w.buf.lineStarts()[src - 1] ?? 0) + /^\s*/.exec(E.lineText(w, src))![0].length;
        }),
      ),
    "edit.append_line_end": (a) => withView(a, (v) => E.startInsert(a, v, (w) => E.lineEnd(w, E.offsetOf(a, w)))),
    "edit.open_below": (a) =>
      withView(a, (v) => {
        E.startInsert(a, v, (w) => E.lineEnd(w, E.offsetOf(a, w)));
        if (v.insert) E.newline(a, v);
      }),
    "edit.open_above": (a) =>
      withView(a, (v) => {
        E.startInsert(a, v, (w) => w.buf.lineStarts()[E.lineOf(w, E.offsetOf(a, w)) - 1] ?? 0);
        if (!v.insert) return;
        const at = E.offsetOf(a, v);
        const indent = /^\s*/.exec(E.lineText(v, E.lineOf(v, at)))![0];
        v.buf.edit(at, 0, indent + v.buf.eol);
        E.placeAt(a, v, at + indent.length, true);
      }),
    // x on an empty line has nothing to take: nothing happens (vim beeps), the register kept.
    "edit.delete_char": (a) =>
      sourceEdit(a, (v) => {
        const r = charsRange(a, v, V.takeCount(a));
        if (r) V.apply(a, v, "d", r);
      }),
    // Operators wait for a motion or a text object (vim.ts reads what follows).
    "edit.op_delete": (a) => sourceEdit(a, () => V.startOperator(a, "d")),
    "edit.op_change": (a) => sourceEdit(a, () => V.startOperator(a, "c")),
    "edit.op_yank": (a) => sourceEdit(a, () => V.startOperator(a, "y"), false),
    "edit.op_indent": (a) => sourceEdit(a, () => V.startOperator(a, ">")),
    "edit.op_comment": (a) => sourceEdit(a, () => V.startOperator(a, "gc")),
    "edit.comment_line": (a) =>
      sourceEdit(a, (v) => {
        const n = V.takeCount(a);
        const first = E.lineOf(v, E.offsetOf(a, v));
        V.commentLines(a, v, first, first + n - 1);
      }),
    "edit.op_outdent": (a) => sourceEdit(a, () => V.startOperator(a, "<")),
    "edit.delete_to_end": (a) =>
      sourceEdit(a, (v) => {
        const r = toLineEnd(a, v, V.takeCount(a));
        if (r) V.apply(a, v, "d", r);
      }),
    "edit.change_to_end": (a) =>
      sourceEdit(a, (v) => {
        const r = toLineEnd(a, v, V.takeCount(a));
        if (r) V.apply(a, v, "c", r);
      }),
    "edit.substitute": (a) =>
      sourceEdit(a, (v) =>
        V.apply(
          a,
          v,
          "c",
          charsRange(a, v, V.takeCount(a)) ?? { ...noRange, from: E.offsetOf(a, v), to: E.offsetOf(a, v) },
        ),
      ),
    "edit.substitute_line": (a) =>
      sourceEdit(a, (v) => {
        const first = E.lineOf(v, E.offsetOf(a, v));
        V.apply(a, v, "c", V.linesRange(v, first, first + V.takeCount(a) - 1));
      }),
    "edit.replace_char": (a) =>
      sourceEdit(a, (v) => {
        const n = V.takeCount(a);
        a.vim.awaitKey = `${n > 1 ? n : ""}r`;
        a.vim.awaitChar = (ch) => {
          const r = charsRange(a, v, n);
          if (!r || graphemes(v.buf.source.slice(r.from, r.to)).length < n) return; // by character, as l steps
          v.buf.edit(r.from, r.to - r.from, ch.repeat(n), r.from);
          E.placeAt(a, v, r.from + ch.length * (n - 1));
        };
      }),
    "edit.join": (a) => sourceEdit(a, (v) => joinLines(a, v, Math.max(2, V.takeCount(a)))),
    "edit.paste_after": (a) => sourceEdit(a, (v) => V.put(a, v, true)),
    // ctrl+x / ctrl+v (as every editor's): the selection cut, or the cursor's line; the clipboard pasted — over the
    // selection, or as p.
    "edit.cut": (a) =>
      withView(a, (v) => {
        if (v.sel) return visualOp(a, "d");
        return sourceEdit(a, (w) => {
          const line = E.lineOf(w, E.offsetOf(a, w));
          V.apply(a, w, "d", V.linesRange(w, line, line));
        });
      }),
    "edit.paste": (a) =>
      withView(a, async (v) => {
        if (!v.sel) return sourceEdit(a, (w) => V.put(a, w, true));
        if (!editable(v)) return a.message("info", "editing is in the lens (space n l) or source mode (ctrl+k)");
        const why = E.cannotEdit(v);
        if (why) return a.message("warn", `${why} — not editing`);
        const version = v.buf.version;
        const reg = await a.pasteText();
        if (a.quitting || a.view !== v || v.buf.version !== version) return;
        if (!reg) return a.message("info", "nothing to paste — copy something first");
        const r = selectionRange(a, v).range;
        Object.assign(v, { visual: null, sel: null });
        let text = reg.text.replace(/\r\n?/g, "\n");
        if (r.linewise && !text.endsWith("\n")) text += "\n";
        text = text.replaceAll("\n", v.buf.eol);
        v.buf.edit(r.from, r.to - r.from, text, E.offsetOf(a, v));
        E.placeAt(a, v, Math.max(r.from, r.from + text.length - 1));
      }),
    "edit.paste_before": (a) => sourceEdit(a, (v) => V.put(a, v, false)),
    "edit.toggle_case": (a) =>
      sourceEdit(a, (v) => {
        const r = charsRange(a, v, V.takeCount(a));
        if (!r) return;
        const t = v.buf.source.slice(r.from, r.to);
        // Each letter on its own; one whose other case has another length (ß → SS, İ → i̇) stays.
        const flipped = [...t]
          .map((c) => {
            const f = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
            return f.length === c.length ? f : c;
          })
          .join("");
        if (flipped !== t) v.buf.edit(r.from, t.length, flipped, r.from);
        E.placeAt(a, v, Math.min(r.to, Math.max(r.from, E.lineEnd(v, r.from) - 1)));
      }),
    "edit.repeat": (a) => sourceEdit(a, () => V.repeat(a)),
    "edit.undo": (a) => withView(a, (v) => undoRedo(a, v, "undo")),
    "edit.redo": (a) => withView(a, (v) => undoRedo(a, v, "redo")),
    "note.save": (a) =>
      withView(a, (v) => {
        // The commit editor's ctrl+s commits, its message changed or not: a commit git refused is tried again (26.3).
        // The merge screen's saves the file as settled, as its `w` does (GIT-D5): its own text never changes. A
        // report's opens its menu, changed or not (RPT-D1): `help.report_send`.
        const k = a.floating?.kind;
        if (k === "report" && a.floating?.view === v) return a.run("help.report_send");
        if ((k === "commit" || k === "merge") && a.floating?.view === v && v.buf.virtual)
          return void v.buf.virtual.save(v.buf.source);
        if (!v.buf.dirty && !v.buf.changedOnDisk())
          return a.message("info", `${a.displayName(v.buf)} has no changes to save`);
        if (a.saving.save(v.buf)) a.message("info", `saved ${a.displayName(v.buf)}${a.files.notIndexed(v.buf.abs)}`);
      }),
    "note.save_force": (a) =>
      withView(a, (v) => {
        // A virtual buffer (the floating window's: a commit's message, a report) has no file to force: `:w!` is `:w`.
        if (v.buf.virtual) return a.run("note.save");
        if (a.writeBuffer(v.buf, v.buf.contentToSave(), true))
          a.message("info", `saved ${a.displayName(v.buf)}${a.files.notIndexed(v.buf.abs)} over the file on disk`);
      }),
    "note.revert": (a) => withView(a, (v) => revert(a, v.buf)),
    "note.resolve": (a) =>
      withView(a, (v) => {
        if (!v.buf.dirty || !v.buf.changedOnDisk())
          return a.message("info", `${a.displayName(v.buf)} has no conflict with the file on disk`);
        a.saving.conflictPrompt(v.buf);
      }),
    "note.save_all": (a) => {
      for (const v of a.allViews()) if (v.insert) E.stopInsert(a, v);
      // The properties editor's changes too: written into their note (which it saves), the editor kept open.
      const f = a.floating?.kind === "properties" && a.floating.view.buf.dirty ? a.floating : null;
      const dirty = [...(f ? [f.view.buf] : []), ...a.dirtyBuffers().filter((b) => b !== f?.note)];
      if (!dirty.length) return a.message("info", "nothing to save");
      const done = dirty.filter((b) => a.saving.save(b, true));
      const saved = done.length;
      // Those the vault never indexes (D246): the one named, or how many.
      const left = done.filter((b) => a.files.leftOut(b.abs));
      const said = left.length
        ? ` (${left.length === 1 ? a.displayName(left[0]!) : left.length} not indexed: ${a.files.leftOut(left[0]!.abs)})`
        : "";
      if (saved === dirty.length) a.message("info", `saved ${saved} note${saved === 1 ? "" : "s"}${said}`);
      else a.message("warn", `saved ${saved} of ${dirty.length} — the others say why above`);
    },
    "note.send": (a) => withView(a, (v) => a.handoff.sendToEditor(v)),
    "note.send_pick": (a) => withView(a, (v) => a.handoff.sendToEditor(v, true)),
  };
}

/** u / ctrl+r: the cursor goes back to where the change was. While typing (ctrl+z, ctrl+y), typing goes on. */
function undoRedo(a: App, v: View, which: "undo" | "redo"): void {
  const typing = !!v.insert;
  if (typing) {
    // As a desktop editor's (DF-D15): what was typed so far becomes a step of its own, and the next keys a new one.
    v.sel = null;
    a.completion = null;
    a.signature = null;
    endSnippet(a);
    v.buf.endStep(E.offsetOf(a, v));
  }
  const wasUndoing = a.vim.undoing;
  a.vim.undoing = true; // not a change for `.` to repeat
  const at = which === "undo" ? v.buf.undo() : v.buf.redo();
  if (at !== null) for (const w of a.allViews()) if (w.buf === v.buf) w.layoutKey = "";
  if (typing) {
    if (at !== null) E.placeAt(a, v, at, true);
    const here = E.offsetOf(a, v);
    v.buf.beginStep(here);
    v.insertFrom = here;
    // `.` repeats what's typed from here on, as if typing had started here; with nothing undone, what it had stands.
    if (at === null) a.vim.undoing = wasUndoing;
    else if (!a.vim.replaying)
      Object.assign(a.vim, { seq: ["i"], seqVersion: v.buf.version, undoing: false, inInsert: true });
  }
  if (at === null) return a.message("info", which === "undo" ? "nothing to undo" : "nothing to redo");
  if (!typing && editable(v)) E.placeAt(a, v, at);
  a.message(
    "info",
    v.buf.dirty ? (which === "undo" ? "undone" : "redone") : `${which === "undo" ? "undone" : "redone"} — as saved`,
  );
}

/** `:e!`, and `space n r`'s discard once asked: the file loaded again over unsaved changes, one `u` away. */
export function revert(a: App, buf: View["buf"]): void {
  for (const w of a.allViews()) if (w.buf === buf) w.insert = false;
  // Out of insert so, a snippet being typed in it is over too (25.8).
  if (a.snippet?.view.buf === buf) endSnippet(a);
  if (!buf.load()) return a.message("warn", `${buf.key} is gone from disk`);
  for (const w of a.allViews()) if (w.buf === buf) w.layoutKey = "";
  a.message("info", `${a.displayName(buf)} reloaded from disk — u brings your changes back`);
}

const noRange: V.Range = { from: 0, to: 0, linewise: false };

/**
 * An editing command: in a source window (switching a rendered one first — the lens's first press only opens it), on
 * an editable note. One that doesn't edit (a yank) goes on at once.
 */
function sourceEdit(a: App, run: (v: View) => void | Promise<void>, edits = true): Promise<void> | void {
  return withView(a, (v) => {
    const why = E.cannotEdit(v);
    if (edits && why) return a.message("warn", `${why} — not editing`);
    if (!E.toEditing(a, v) && edits) return;
    return run(v);
  });
}

/** `n` characters from the cursor, on its line; null on an empty line or at its end. */
function charsRange(a: App, v: View, n: number): V.Range | null {
  const at = E.offsetOf(a, v);
  const end = E.lineEnd(v, at);
  if (at >= end) return null;
  let to = at;
  for (let k = 0; k < n && to < end; k++) to = E.nextBoundary(v.buf.source, to);
  return { from: at, to: Math.min(to, end), linewise: false };
}

/** D / C: to the end of the line (with a count, of the line count-1 below). */
function toLineEnd(a: App, v: View, n: number): V.Range | null {
  const at = E.offsetOf(a, v);
  // The note's lines, not the empty one after its final newline; from the last, a count has
  // nowhere to go (vim's $ fails there, so 5D does nothing).
  const real = Math.max(1, v.buf.lineStarts().length - (v.buf.source.endsWith("\n") ? 1 : 0));
  const here = E.lineOf(v, at);
  if (n > 1 && here >= real) return null;
  const last = Math.min(here + n - 1, real);
  const end = (v.buf.lineStarts()[last - 1] ?? 0) + E.lineText(v, last).length;
  return { from: at, to: Math.max(at, end), linewise: false };
}

/** J: `n` lines into one, each break and the next line's indentation becoming a space. */
function joinLines(a: App, v: View, n: number): void {
  const buf = v.buf;
  const first = E.lineOf(v, E.offsetOf(a, v));
  const lines = buf.lineStarts().length - (buf.source.endsWith("\n") ? 1 : 0);
  if (first >= lines) return;
  buf.beginStep(E.offsetOf(a, v));
  let at = 0;
  for (let k = 1; k < n && first < lines - (k - 1); k++) {
    const end = (buf.lineStarts()[first - 1] ?? 0) + E.lineText(v, first).length;
    const next = buf.lineStarts()[first];
    if (next === undefined) break;
    const lead = /^\s*/.exec(E.lineText(v, first + 1))![0].length;
    // No space after one already, into an empty line, before an empty one, or before a closing ) (vim).
    const here = E.lineText(v, first);
    const after = E.lineText(v, first + 1).trimStart();
    const sep = here.endsWith(" ") || !here.trim() || !after || after.startsWith(")") ? "" : " ";
    buf.edit(end, next + lead - end, sep);
    at = end;
  }
  buf.endStep(at);
  E.placeAt(a, v, at);
}

/** The selection's text in the file — its lines whole in visual line mode, else from its first character to its last —
 *  and the offsets of its two ends. */
function selectionRange(a: App, v: View): { range: V.Range; from: number; to: number } {
  const [s, e] = C.ordered(v.sel?.anchor ?? v.cur, v.cur);
  const from = E.offsetAtPos(a, v, s);
  const to = E.offsetAtPos(a, v, e);
  const range =
    v.visual === "line"
      ? V.linesRange(v, E.lineOf(v, from), E.lineOf(v, to))
      : { from, to: Math.min(E.nextBoundary(v.buf.source, to), Math.max(to, E.lineEnd(v, to))), linewise: false };
  return { range, from, to };
}

/** d / c / > / < on a visual selection (char or line), in source mode. */
export function visualOp(a: App, op: "d" | "c" | ">" | "<" | "gc"): void {
  withView(a, (v) => {
    if (!editable(v)) return a.message("info", "editing is in the lens (space n l) or source mode (ctrl+k)");
    const why = E.cannotEdit(v);
    if (why) return a.message("warn", `${why} — not editing`);
    const line = v.visual === "line";
    const { range: r, from, to } = selectionRange(a, v);
    Object.assign(v, { visual: null, sel: null });
    // For `.`: the same change on as much text, said in keys.
    const lines = E.lineOf(v, to) - E.lineOf(v, from) + 1;
    const chars = graphemes(v.buf.source.slice(r.from, r.to)).length; // as l moves: by character
    const opKeys = op === "gc" ? ["g", "c"] : [op];
    const keys = line
      ? ["shift+v", ...Array(lines - 1).fill("j"), ...opKeys]
      : lines === 1
        ? ["v", ...Array(Math.max(0, chars - 1)).fill("l"), ...opKeys]
        : null;
    const before = v.buf.version;
    const times = op === ">" || op === "<" ? V.takeCount(a) : 1;
    V.apply(a, v, op, { ...r, times });
    V.recordVisual(a, times > 1 ? null : keys, op === "c", before);
  });
}
