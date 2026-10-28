// Normal/visual key grammar and dispatch, above operator and motion mechanisms.
import type { App, View } from "../../../app/runtime/app.ts";
import * as E from "../../../documents/editing/editing.ts";
import { keyChar } from "../keys.ts";
import { takeCount } from "./state.ts";
import { textObject } from "./motions.ts";
import { operatorKey } from "./operators.ts";
export function idle(app: App, view: View): boolean {
  const s = app.vim;
  return !s.count && !s.op && !s.awaitChar && !view.insert;
}

/**
 * Before the keymaps, in a source window in normal mode: counts, an operator's motion, a character
 * for `r`. True when the key was used here. Also records each change's keys, for `.`.
 */
export async function vimKey(app: App, view: View, key: string, dispatch: () => Promise<void>): Promise<void> {
  const s = app.vim;
  // Keys replayed by `.` are handled, not recorded.
  if (s.replaying) return handle(app, view, key, dispatch);
  const start = idle(app, view) && !app.pending.length;
  if (start) {
    s.seq = [];
    s.inInsert = false;
    s.seqVersion = view.buf.version;
    s.undoing = false;
  }
  s.seq.push(key);
  await handle(app, view, key, dispatch);
  if (view.insert) s.inInsert = true;
  // Back to rest: if the text changed (and it wasn't undo), this was a change to repeat.
  if (idle(app, view) && !app.pending.length && !s.undoing && view.buf.version !== s.seqVersion)
    s.lastChange = [...s.seq];
}

export async function handle(app: App, view: View, key: string, dispatch: () => Promise<void>): Promise<void> {
  const s = app.vim;
  if (s.awaitChar) {
    const f = s.awaitChar;
    s.awaitChar = null;
    const ch = keyChar(key);
    if (ch !== null) f(ch);
    return;
  }
  // A count: 1-9, then 0 too — not while an operator's f / t waits for its character (dt1).
  if (!app.pending.length && !s.op?.char && (/^[1-9]$/.test(key) || (key === "0" && s.count))) {
    s.count += key;
    return;
  }
  if (s.op) return operatorKey(app, view, key);
  // A motion with a count moves that many times; anything else is the keymaps' (the count stays
  // for the command to read).
  if (s.count && !app.pending.length) {
    const spec = app.keymap.lookup(key);
    // (f and t read their count themselves.)
    // (G with a count is a line number, not repeated: cursor.bottom reads the count itself.)
    if (
      spec?.startsWith("cursor.") &&
      spec !== "cursor.bottom" &&
      !spec.startsWith("cursor.find_") &&
      !app.keymap.isPrefix(key) &&
      !app.sourceKeys.lookup(key)
    ) {
      const n = takeCount(app);
      for (let k = 0; k < n; k++) await app.run(spec);
      return;
    }
  }
  await dispatch();
  if (!s.op && !s.awaitChar && !app.pending.length) s.count = "";
}

/**
 * Before the keymaps, in visual mode: a count (v2j, V3>) and, where the text is editable, `i` or
 * `a` and a text object, which becomes the selection (viw, vi(, vap).
 */
export async function visualKey(app: App, view: View, key: string, dispatch: () => Promise<void>): Promise<void> {
  const s = app.vim;
  // A character for f / t (vf.): taken here, as in normal mode; esc cancels it.
  if (s.awaitChar) {
    const f = s.awaitChar;
    s.awaitChar = null;
    const ch = key === "escape" ? null : keyChar(key);
    if (ch !== null) f(ch);
    return;
  }
  if (s.visualObject) {
    const kind = s.visualObject;
    s.visualObject = null;
    const ch = key === "escape" ? null : keyChar(key);
    if (ch === null) return;
    const r = textObject(view, E.offsetOf(app, view), kind, ch, takeCount(app));
    if (!r) return app.message("info", `no ${kind}${ch} here`);
    E.placeAt(app, view, r.from);
    app.views.select(view, { ...view.cur }, view.visual === "line");
    E.placeAt(app, view, Math.max(r.from, E.prevBoundary(view.buf.source, r.to)));
    app.moveCursor(view, view.cur);
    return;
  }
  if (!app.pending.length && (/^[1-9]$/.test(key) || (key === "0" && s.count))) {
    s.count += key;
    return;
  }
  if (!app.pending.length && (key === "i" || key === "a") && (view.source || view.live)) {
    s.visualObject = key;
    return;
  }
  if (s.count && !app.pending.length && !app.visualKeys.lookup(key)) {
    const spec = app.keymap.lookup(key);
    if (
      spec?.startsWith("cursor.") &&
      spec !== "cursor.bottom" &&
      !spec.startsWith("cursor.find_") &&
      !app.keymap.isPrefix(key)
    ) {
      const n = takeCount(app);
      for (let k = 0; k < n; k++) await app.run(spec);
      return;
    }
  }
  await dispatch();
  if (!app.pending.length) s.count = "";
}
