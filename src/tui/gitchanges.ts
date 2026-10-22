// A file's changes against what's staged, from the TUI (plan 26.1): to the next or the one before (`] c`, `[ c`),
// one's diff in the floating window, one undone — its lines as staged put back in the text, an edit like any other.
// The gutter's signs are draw-pane.ts's; the changes, `core/gitsigns.ts`.

import { changeAt, changeDiff, type GitChange } from "../core/gitsigns.ts";
import type { App, View } from "./app.ts";
import { cannotEdit, lineOf, offsetOf } from "./editing.ts";

/** The source lines the cursor is on: its line in source mode; a rendered row's, the ones its text came from. */
function cursorLines(app: App, view: View): number[] {
  if (view.source) return [lineOf(view, offsetOf(app, view))];
  const row = app.currentLayout(view).lines[view.cur.row];
  return [...new Set([row?.src ?? 1, ...(row?.spans ?? []).flatMap((s) => (s.src === undefined ? [] : [s.src]))])];
}

/** Where a change's sign is: its first line, a deletion's the line before it (or the first). */
const startOf = (c: GitChange) => (c.kind === "delete" ? Math.max(1, c.from - 1) : c.from);

/** The file's changes, or why there are none to go to (said). */
function changesHere(app: App, view: View): GitChange[] | null {
  const changes = app.git.changesOf(view);
  if (!changes?.length) {
    app.message(
      "info",
      app.config.git.signs ? "no changes against what's staged here" : "git signs are off ([git] signs)",
    );
    return null;
  }
  return changes;
}

/** `] c` / `[ c`: to the next change after the cursor's line, or the one before it, around the file's ends. */
export function gitStep(app: App, view: View, dir: 1 | -1): void {
  const changes = changesHere(app, view);
  if (!changes) return;
  const lines = cursorLines(app, view);
  const next =
    dir === 1
      ? (changes.find((c) => startOf(c) > Math.max(...lines)) ?? changes[0]!)
      : ([...changes].reverse().find((c) => startOf(c) < Math.min(...lines)) ?? changes[changes.length - 1]!);
  app.history.push(view);
  app.placeAtLine(view, startOf(next));
}

/** The change on the cursor's line, or why there's none (said). */
function changeHere(app: App, view: View): GitChange | null {
  const changes = changesHere(app, view);
  if (!changes) return null;
  for (const line of cursorLines(app, view)) {
    const c = changeAt(changes, line);
    if (c) return c;
  }
  app.message("info", "no change on this line — ] c goes to the next");
  return null;
}

/** The change on the cursor's line as a diff, in the floating window: its lines as staged, then as they are. */
export function gitPreview(app: App, view: View): void {
  const c = changeHere(app, view);
  if (!c) return;
  const where =
    c.kind === "delete"
      ? `${c.was.length} line${c.was.length === 1 ? "" : "s"} deleted after line ${c.from - 1}`
      : c.from === c.to
        ? `line ${c.from}`
        : `lines ${c.from}–${c.to}`;
  app.overlays.openHover(`\`\`\`diff\n${changeDiff(c)}\n\`\`\``, `${where}, against what's staged`);
}

/** The change on the cursor's line undone: its lines as staged put back — one undo step, left unsaved. */
export function gitReset(app: App, view: View): void {
  const c = changeHere(app, view);
  if (c) revertChange(app, view, c);
}

/** A change undone: its lines as staged put back — one undo step, left unsaved (its sign clicked: Revert, GIT-D12). */
export function revertChange(app: App, view: View, c: GitChange): void {
  const why = cannotEdit(view);
  if (why) return app.message("warn", `${why} — not editing`);
  const buf = view.buf;
  const src = buf.source;
  const starts = buf.lineStarts();
  const was = c.was.map((l) => `${l}${buf.eol}`).join("");
  if (c.kind === "delete") {
    // Put back before the line after it — after the last line, on a line of its own.
    const at = starts[c.from - 1] ?? src.length;
    const text = at === src.length && src && !src.endsWith("\n") ? `${buf.eol}${was.slice(0, -buf.eol.length)}` : was;
    buf.edit(at, 0, text);
  } else {
    const a = starts[c.from - 1]!;
    const b = starts[c.to] ?? src.length;
    // The text's last line, without a line break: what's put back hasn't one either.
    const text = src.slice(a, b).endsWith("\n") ? was : was.slice(0, Math.max(0, was.length - buf.eol.length));
    // Its lines gone with no break after them: the break before them goes too.
    const from = !text && !src.slice(a, b).endsWith("\n") && a > 0 ? a - buf.eol.length : a;
    buf.edit(from, b - from, text);
  }
  app.placeAtLine(view, Math.max(1, Math.min(c.from, buf.lineStarts().length)));
  app.message("info", `the change at line ${startOf(c)} undone, as staged (unsaved)`);
}
