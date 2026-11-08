// Problems where they are (EG-D5): `] d` / `[ d` through the problems the file shows, the cursor's problem (the status
// line says it), and the problem window, `space c d`: each problem at the cursor in full, who found it and its place —
// there `y` copies them and `s` adds them to the scratch. They read the file's problems as the Problems panel's This
// file lists them (`Problems.ofView`: `[diagnostics] severity` and up, the lint filters applied).

import type { App, View } from "../../../app/runtime/app.ts";
import { Keymap } from "../../../../core/application/commands/registry.ts";
import { type Problem, SEVERITIES } from "../../../../core/documents/diagnostics/diagnostics.ts";
import { sanitize } from "../../../../core/foundation/text/sanitize.ts";
import { type Layout, type LayoutLink, posOfSrc, srcAt } from "../../../../core/rendering/layout/ir.ts";
import { formatEntry } from "../../../../core/workspace/mutations/capture.ts";
import { MESSAGE_FENCE } from "../../../../core/workspace/mutations/scratch-places.ts";
import { markdownText } from "../../../actions/documents/links/anchors.ts";
import { DEFAULT_PROBLEM_KEYS } from "../../../shell/input/keys.ts";
import { lineText, offsetOf, placeAt } from "../../editing/editing.ts";
import { severityGlyph } from "../../views/drawing/marks/problems.ts";

/** The problem window's keys (EG-D5), over the note's while it's open: not configured, as a peek's aren't. */
export const PROBLEM_KEYMAP = new Keymap(DEFAULT_PROBLEM_KEYS);

const rank = (p: Problem) => SEVERITIES.indexOf(p.severity);
const byStart = (a: Problem, b: Problem) =>
  a.start.line - b.start.line || a.start.column - b.start.column || rank(a) - rank(b);

/** Who found it, as the Problems panel says it: `slipbox unresolved`, `markdownlint MD013`, a server and its code. */
export const foundBy = (p: Problem): string => sanitize(`${p.source}${p.code ? ` ${p.code}` : ""}`);

/** A message on one line, safe to draw: each run of blanks and line breaks a space. */
export const oneLine = (message: string): string => sanitize(message).replace(/\s+/g, " ").trim();

/** A problem as `y` copies it: `path:line:col severity: message (who)`, on one line. */
export const problemLine = (path: string, p: Problem): string =>
  `${path}:${p.start.line}:${p.start.column} ${p.severity}: ${oneLine(p.message)} (${foundBy(p)})`;

/** Whether the cursor is on a source row — SOURCE view, the lens, a code file's lines — where a problem is its own
 *  characters; else on the rendered view's, where it's its link as drawn or the text its lines became. */
function inSource(app: App, view: View): boolean {
  return view.source || view.live || !!app.currentLayout(view).lines[view.cur.row]?.srcMap;
}

/** A problem's characters as offsets: from its first — kept on its line's last, which normal mode's cursor never
 *  passes — to after its last, one at least, as it's marked. */
function range(view: View, p: Problem): [number, number] {
  const starts = view.buf.lineStarts();
  const line = Math.min(p.start.line, starts.length);
  const last = Math.max(0, lineText(view, line).length - 1);
  const from = (starts[line - 1] ?? 0) + Math.max(0, Math.min(p.start.column - 1, last));
  const to = (starts[Math.min(p.end.line, starts.length) - 1] ?? 0) + Math.max(0, p.end.column - 1);
  return [from, Math.max(to, from + 1)];
}

/** Where the rendered view shows a problem: a link's on the link as drawn (the nth with its target on its line, as
 *  `list` has them); any other where its line's text starts, or — a line drawn as nothing — the next row drawn. */
function spotOf(layout: Layout, list: Problem[], p: Problem): { row: number; col: number; link?: LayoutLink } | null {
  if (p.target !== undefined) {
    const same = list.filter((x) => x.target === p.target && x.start.line === p.start.line);
    const drawn = layout.links.filter(
      (l) => l.src === p.start.line && l.target === p.target && l.line >= 0 && l.from === undefined,
    );
    const link = drawn[Math.max(0, same.indexOf(p))] ?? drawn[0];
    if (link) return { row: link.line, col: link.col, link };
  }
  const row = layout.lines.findIndex((l) => l.src === p.start.line && !l.decor);
  if (row >= 0) return { row, col: 0 };
  const inside = posOfSrc(layout.lines, p.start.line);
  if (inside) return inside;
  const next = layout.lines.findIndex((l) => !l.decor && l.src >= p.start.line);
  return next >= 0 ? { row: next, col: 0 } : null;
}

/**
 * The problems the cursor is on, the worst first (EG-D5): inside one's range in SOURCE view and the lens; in the
 * rendered view, on its link as drawn, or on the text its lines became (a line drawn as nothing: the next row drawn,
 * where the bar shows it). `list`: the file's problems shown.
 */
export function problemsAt(app: App, view: View, list = app.problems.ofView(view)): Problem[] {
  if (!list.length) return [];
  let here: Problem[];
  if (inSource(app, view)) {
    const at = offsetOf(app, view);
    here = list.filter((p) => {
      const [from, to] = range(view, p);
      return from <= at && at < to;
    });
  } else {
    const layout = app.currentLayout(view);
    const row = layout.lines[view.cur.row];
    if (!row || row.decor) return [];
    const li = app.linking.linkUnderCursor(view);
    const link = li >= 0 ? layout.links[li] : undefined;
    const src = srcAt(row, view.cur.col);
    // The lines between the row drawn before this one and this one's own: drawn as nothing, so this row's.
    let prev = view.cur.row - 1;
    while (prev >= 0 && layout.lines[prev]!.decor) prev--;
    const before = layout.lines[prev];
    const after = before ? Math.max(before.src, ...before.spans.map((s) => s.src ?? before.src)) : 0;
    here = list.filter((p) => {
      const spot = p.target !== undefined ? spotOf(layout, list, p) : null;
      if (spot?.link) return spot.link === link;
      return (p.start.line <= src && src <= p.end.line) || (p.start.line > after && p.start.line < row.src);
    });
  }
  return here.sort((a, b) => rank(a) - rank(b) || byStart(a, b));
}

/**
 * `] d` / `[ d` (EG-D5): to the next or previous problem shown, by where each starts, around the file's ends. SOURCE
 * view and the lens land on its first character; the rendered view on its link as drawn, else where its line's text
 * starts.
 */
export function problemStep(app: App, view: View, dir: 1 | -1): void {
  const list = app.problems.ofView(view).sort(byStart);
  if (!list.length) return app.message("info", "no problems in this file");
  if (inSource(app, view)) {
    const at = offsetOf(app, view);
    const starts = list.map((p) => range(view, p)[0]);
    let i = dir === 1 ? starts.findIndex((s) => s > at) : starts.findLastIndex((s) => s < at);
    if (i < 0) i = dir === 1 ? 0 : starts.length - 1;
    app.history.push(view);
    return placeAt(app, view, starts[i]!);
  }
  const layout = app.currentLayout(view);
  const spots = list
    .map((p) => ({ p, spot: spotOf(layout, list, p) }))
    .filter((s): s is { p: Problem; spot: NonNullable<typeof s.spot> } => s.spot !== null)
    .sort((a, b) => a.spot.row - b.spot.row || a.spot.col - b.spot.col);
  if (!spots.length) return app.message("info", "no problems drawn in this view");
  const { row, col } = view.cur;
  const next =
    dir === 1
      ? (spots.find(({ spot: s }) => s.row > row || (s.row === row && s.col > col)) ?? spots[0]!)
      : (spots.findLast(({ spot: s }) => s.row < row || (s.row === row && s.col < col)) ?? spots[spots.length - 1]!);
  app.history.push(view);
  // Inside an HTML block's closed details: opened first, as going to a line does.
  if (view.buf.kind.group === "note") app.html.reveal(view, next.p.start.line);
  const to = spotOf(app.currentLayout(view), list, next.p) ?? next.spot;
  app.moveCursor(view, { row: to.row, col: to.col });
}

/** A message as the window shows it: its own lines kept, its punctuation never formatting. */
const shownMessage = (p: Problem): string =>
  sanitize(p.message)
    .split(/\r?\n/)
    .map((l) => markdownText(l.trim()))
    .filter(Boolean)
    .join("\\\n") || "(no message)";

/**
 * `space c d` (EG-D5): the problems at the cursor in full, in a floating window read-only as the hover's — each its
 * severity, its whole message, who found it and its place. Its own keys: `y`, `s`; `esc` and `q` close it.
 */
export function showProblems(app: App, view: View): void {
  const here = problemsAt(app, view);
  if (!here.length) return app.message("info", "no problem at the cursor — ] d goes to the next");
  const path = view.buf.rel ?? view.buf.abs;
  const text = here
    .map(
      (p) =>
        `${severityGlyph(app.glyphs, p.severity)} **${p.severity}** · ${markdownText(foundBy(p))} · ` +
        `${markdownText(sanitize(`${path}:${p.start.line}:${p.start.column}`))}\n\n${shownMessage(p)}`,
    )
    .join("\n\n---\n\n");
  const title = sanitize(
    `${here.length === 1 ? "problem" : `${here.length} problems`} at ${path}:${here[0]!.start.line}`,
  );
  app.overlays.openHover(text, title);
  const f = app.floating;
  if (f?.kind === "hover")
    app.floating = { kind: "problem", view: f.view, title, problems: here, abs: view.buf.abs, path };
}

/** What `y` and `s` act on: the problem window's problems, else the cursor's; a string says why there are none. */
function chosen(app: App): { problems: Problem[]; abs: string; path: string } | string {
  const f = app.floating;
  if (f?.kind === "problem") return f;
  const v = app.view;
  if (!v) return "no note open";
  const problems = problemsAt(app, v);
  return problems.length ? { problems, abs: v.buf.abs, path: v.buf.rel ?? v.buf.abs } : "no problem at the cursor";
}

const said = (n: number) => (n === 1 ? "the problem" : `${n} problems`);

/** `y` in the problem window: each problem a line, `path:line:col severity: message (who)`. */
export function copyProblems(app: App): void {
  const c = chosen(app);
  if (typeof c === "string") return app.message("info", c);
  void app.copy(c.problems.map((p) => problemLine(c.path, p)).join("\n"), true, said(c.problems.length));
}

/**
 * `s` in the problem window: each problem into the scratch for an agent, without opening it — its place on `**At:**`
 * (its columns from the first to the last), its severity, message and who found it fenced as text.
 */
export function scratchProblems(app: App): void {
  const c = chosen(app);
  if (typeof c === "string") return app.message("info", c);
  for (const p of c.problems) {
    const last =
      p.end.line === p.start.line ? Math.max(p.start.column, p.end.column - 1) : Math.max(1, p.end.column - 1);
    const entry = formatEntry(
      {
        ref: { path: c.abs, startLine: p.start.line, endLine: p.end.line, startCol: p.start.column, endCol: last },
        snippetText: `${p.severity}: ${sanitize(p.message)} (${foundBy(p)})`,
        lang: MESSAGE_FENCE,
        cwd: app.loc.root,
      },
      app.loc.root,
    );
    if (app.scratch.add(entry) === null) return;
  }
  app.message(
    "info",
    `${said(c.problems.length)} added to the scratch${app.scratch.notIndexed()} — space s y copies it`,
  );
}
