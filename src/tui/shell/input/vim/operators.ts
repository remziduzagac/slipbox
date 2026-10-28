// Pending operator grammar and search/character completion, using the original live App.
import type { App, View } from "../../../app/runtime/app.ts";
import * as C from "../../../documents/editing/cursor.ts";
import * as E from "../../../documents/editing/editing.ts";
import { keyChar } from "../keys.ts";
import { textMatches } from "../../../documents/search/replacing.ts";
import { takeCount, reverseFind, type Op, type FindKind } from "./state.ts";
import { motionRange, linesRange, textObject } from "./motions.ts";
import { apply } from "./edits.ts";
/** Start an operator (the command bound to `d`, `c`…): it waits for a motion or a text object. */
export function startOperator(app: App, op: Op): void {
  const given = !!app.vim.count;
  app.vim.op = { op, count: takeCount(app), given, keys: [], object: null, char: null };
}

export async function operatorKey(app: App, view: View, key: string): Promise<void> {
  const s = app.vim;
  const o = s.op!;
  const cancel = () => {
    s.op = null;
    s.count = "";
  };
  if (key === "escape" || key === "ctrl+c") return cancel();
  const count = o.count * (Number(s.count) || 1);
  const given = o.given || !!s.count;
  // Kept on the operator: a motion of several keys (d2gg) reads it at its last key.
  o.count = count;
  o.given = given;
  s.count = "";
  // f / t after the operator: this key is the character.
  if (o.char) {
    s.op = null;
    const ch = keyChar(key);
    if (ch === null) return;
    s.lastFind = { kind: o.char, ch };
    return findRange(app, view, o.op, o.char, ch, count, false);
  }
  // A text object: i or a, then its character.
  if (o.object) {
    const ch = keyChar(key) ?? key;
    const r = textObject(view, E.offsetOf(app, view), o.object, ch, count);
    s.op = null;
    if (!r) return app.message("info", `no ${o.object}${ch} here`);
    return apply(app, view, o.op, r);
  }
  if (!o.keys.length && (key === "i" || key === "a")) {
    o.object = key;
    o.count = count; // d2i( and 2di( both: a count before the object counts too
    return;
  }
  // The operator doubled (dd, cc, yy, >>, <<): whole lines, count of them.
  const opKey = { d: "d", c: "c", y: "y", ">": ">", "<": "<", gc: "c" }[o.op];
  if (!o.keys.length && key === opKey) {
    s.op = null;
    const at = E.offsetOf(app, view);
    const first = E.lineOf(view, at);
    return apply(app, view, o.op, linesRange(view, first, first + count - 1));
  }
  // A motion, possibly of several keys (g g).
  o.keys.push(key);
  const seq = o.keys.join(" ");
  // gn / gN: the search's next (previous) match, the one under the cursor included — so cgn, then
  // . . . changes the matches one after another.
  if (seq === "g n" || seq === "g shift+n") {
    s.op = null;
    const f = view.find;
    const q = f?.query;
    // The search's own flags: after `*`, whole words only, as n has them.
    const ms = q ? await textMatches(view, q, undefined, { regex: f?.regex ?? false, whole: f?.whole ?? false }) : [];
    if (ms === null) return; // overtaken by a newer matching in the window
    if (typeof ms === "string" || !ms.length)
      return app.message("info", q ? `not found: ${q}` : "no search yet for gn");
    const at = E.offsetOf(app, view);
    const m =
      seq === "g n" ? (ms.find((x) => x.to > at) ?? ms[0]!) : (ms.findLast((x) => x.from <= at) ?? ms[ms.length - 1]!);
    return apply(app, view, o.op, { from: m.from, to: m.to, linewise: false });
  }
  const spec = app.keymap.lookup(seq);
  if (!spec && app.keymap.isPrefix(seq)) return;
  // f F t T wait for their character; ; and , use the last one.
  if (spec?.startsWith("cursor.find_char")) {
    const arg = spec.split(" ")[1];
    o.char = (arg === "F" || arg === "t" || arg === "T" ? arg : "f") as FindKind;
    o.count = count;
    return;
  }
  s.op = null;
  if (spec?.startsWith("cursor.find_repeat")) {
    const f = s.lastFind;
    if (!f) return app.message("info", "no f or t to repeat yet");
    return findRange(app, view, o.op, spec.endsWith("back") ? reverseFind(f.kind) : f.kind, f.ch, count, true);
  }
  // A search: the operator covers the text up to where it lands (finishSearchOp).
  if (spec === "find.open") {
    s.searchOp = { op: o.op, from: E.offsetOf(app, view) };
    return app.run(spec);
  }
  if (!spec?.startsWith("cursor.") && spec !== "find.next" && spec !== "find.prev")
    return app.message("info", `${o.op} doesn't take ${seq}`);
  // G and gg with a count go to that line (d3G), not that many times to the end.
  if ((spec === "cursor.bottom" || spec === "cursor.top") && given) {
    const at = E.offsetOf(app, view);
    const n = view.buf.lineStarts().length - (view.buf.source.endsWith("\n") ? 1 : 0);
    const here = E.lineOf(view, at);
    const there = Math.max(1, Math.min(count, n));
    return apply(app, view, o.op, linesRange(view, Math.min(here, there), Math.max(here, there)));
  }
  const r = await motionRange(app, view, spec, count, o.op);
  if (r) return apply(app, view, o.op, r);
}

/** An operator with f / t: f and t take the character they land on, F and T don't. */
export function findRange(
  app: App,
  view: View,
  op: Op,
  kind: FindKind,
  ch: string,
  count: number,
  repeat: boolean,
): void {
  const to = C.findChar(app.currentLayout(view), view.cur, kind, ch, count, repeat);
  if (!to)
    return app.message("info", `no ${ch} ${kind === "f" || kind === "t" ? "after" : "before"} the cursor on this line`);
  const a = E.offsetOf(app, view);
  const b = E.offsetAtPos(app, view, to);
  const r =
    kind === "f" || kind === "t"
      ? { from: a, to: E.nextBoundary(view.buf.source, b), linewise: false }
      : { from: b, to: a, linewise: false };
  if (r.from < r.to) apply(app, view, op, r);
}

/** The search an operator waited for ended: accepted with a match, the range to it; else nothing. */
export function finishSearchOp(app: App, view: View, found: boolean): void {
  const s = app.vim.searchOp;
  if (!s) return;
  app.vim.searchOp = null;
  if (!found || (!view.source && !view.live)) return;
  const to = E.offsetOf(app, view);
  const r = { from: Math.min(s.from, to), to: Math.max(s.from, to), linewise: false };
  E.placeAt(app, view, s.from);
  if (r.from >= r.to) return;
  const before = view.buf.version;
  apply(app, view, s.op, r);
  // The prompt's keys never went through vimKey: the change is recorded here, for `.` — the
  // operator's keys, the search typed again, enter (and for c, the text typed next, insertRecord).
  const v = app.vim;
  if (v.replaying || view.buf.version === before) return;
  const query = view.find?.query ?? "";
  v.seq = [...v.seq, ...[...query].map((c) => (c === " " ? "space" : c)), "enter"];
  v.seqVersion = before;
  v.undoing = false;
  if (view.insert) v.inInsert = true;
  else v.lastChange = [...v.seq];
}
