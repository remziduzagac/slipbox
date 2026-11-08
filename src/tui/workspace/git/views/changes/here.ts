// The note's own change and file under `space g` (EG-D15), the cursor standing for the git panel's selected row: the
// change on its line when it's on one, else the note's file. `space g s` stages that change, as its sign's Stage it,
// or the file; `space g u` unstages the file. Each refused while the note is unsaved, as git works on what's on disk.
// `space g d`, undoing the change after asking, is gitchanges.ts's `gitReset`.

import { relative, sep } from "node:path";
import { climbsOut } from "../../../../../core/foundation/platform/fsutil.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import {
  conflicted,
  type GitDone,
  stageFile,
  type StatusEntry,
  unstageFile,
} from "../../../../../core/workspace/git/staging/gitstage.ts";
import type { App, View } from "../../../../app/runtime/app.ts";
import { stageSign } from "../panel/gitmouse.ts";
import { changeAtCursor } from "./gitchanges.ts";

/** The note's file in the checkout (its path there, `/`-separated), or why there's none (said). */
export function pathHere(app: App, view: View): string | null {
  const c = app.git.checkout;
  if (!c) return (app.message("info", "not in a git repository"), null);
  if (!view.buf.abs || view.buf.virtual) return (app.message("info", "open a file first"), null);
  const path = relative(c.root, view.buf.abs);
  if (climbsOut(path)) return (app.message("info", "this file isn't in the checkout"), null);
  return path.split(sep).join("/");
}

/** What git last said of a file, by its path in the checkout: its entry, or none (nothing changed); undefined while
 *  git hasn't answered. */
function entryOf(app: App, path: string): StatusEntry | null | undefined {
  const entries = app.git.entries;
  if (entries === null) return undefined;
  return entries.find((e) => e.path === path) ?? null;
}

/** After staging or unstaging: git's refusal said in its words, else what was done; git asked again. */
function done(app: App, why: GitDone, said: string): void {
  if (why) return app.message("warn", `git: ${why}`);
  app.message("info", said);
  void app.git.refreshNow().then(() => app.host.requestRender());
}

/**
 * `space g s` (`git.change_stage`): the change on the cursor's line staged, as its sign's Stage it; off a change, the
 * note's file. A file in conflict is the merge screen's to settle.
 */
export function stageHere(app: App, view: View): void {
  const path = pathHere(app, view);
  if (path === null) return;
  const c = app.git.checkout!;
  // The cursor's change: known once git has said what's staged — with the signs off, never, so the file is staged.
  if (app.config.git.signs && app.git.changesOf(view) === null)
    return app.message("info", "git hasn't answered yet — again in a moment");
  const change = changeAtCursor(app, view);
  if (change) return stageSign(app, view, change);
  const e = entryOf(app, path);
  if (e === undefined) return app.message("info", "git hasn't answered yet — again in a moment");
  if (e && conflicted(e))
    return app.message("info", `${sanitize(path)} is in conflict — :resolve settles it, then s in the panel`);
  if (!e || (e.x !== "?" && e.y === " ")) return app.message("info", `nothing to stage in ${sanitize(path)}`);
  if (view.buf.dirty)
    return app.message("warn", `unsaved: ${app.displayName(view.buf)} — save it first: git stages the file on disk`);
  done(app, stageFile(c, path), `staged ${path}`);
}

/** `space g u` (`git.file_unstage`): the note's file unstaged — what's staged of it back to the last commit's. */
export function unstageHere(app: App, view: View): void {
  const path = pathHere(app, view);
  if (path === null) return;
  const e = entryOf(app, path);
  if (e === undefined) return app.message("info", "git hasn't answered yet — again in a moment");
  if (!e || e.x === " " || e.x === "?" || conflicted(e))
    return app.message("info", `nothing staged in ${sanitize(path)}`);
  done(app, unstageFile(app.git.checkout!, e.path, e.from), `unstaged ${path}`);
}
