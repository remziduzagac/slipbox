// Blame and a file's history from the TUI (plans 26.4, 22.1): `space g b`, who last changed the cursor's line — its
// commit, author, date and message, in the floating window; a line changed since is said to be the working tree's —
// and `space g h`, the file's commits (followed through renames), each opened to read as it was or diffed to now.

import { join, relative } from "node:path";
import {
  blameLineLater,
  type CommitInfo,
  fileLogLater,
  lineInHead,
  messageLater,
} from "../../../../../core/workspace/git/history/gitlog.ts";
import { showLater } from "../../../../../core/workspace/git/branches/gitops.ts";
import { beginGitRead } from "../../gitquery.ts";
import { climbsOut } from "../../../../../core/foundation/platform/fsutil.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import type { App, View } from "../../../../app/runtime/app.ts";
import { lineOf, offsetOf } from "../../../../documents/editing/editing.ts";

/** A commit's date, as a day. */
const day = (time: number) => new Date(time * 1000).toISOString().slice(0, 10);

/** The window's file in the checkout (its path there), or why there's none (said). */
function fileHere(app: App, view: View | null): string | null {
  const c = app.git.checkout;
  if (!c) return app.message("info", "not a git checkout"), null;
  if (!view?.buf.abs || view.buf.virtual) return app.message("info", "open a file first"), null;
  const path = relative(c.root, view.buf.abs);
  if (climbsOut(path)) return app.message("info", "this file isn't in the checkout"), null;
  return path;
}

/** The cursor's line: its own in source mode; a rendered row's first. */
function cursorLine(app: App, view: View): number {
  if (view.source) return lineOf(view, offsetOf(app, view));
  return app.currentLayout(view).lines[view.cur.row]?.src ?? 1;
}

/** `space g b`: who last changed the cursor's line, in the floating window: the commit, its author and date, its message. */
export async function blameHere(app: App): Promise<void> {
  const view = app.view;
  const path = fileHere(app, view);
  if (path === null) return;
  const c = app.git.checkout!;
  const line = cursorLine(app, view!);
  const query = beginGitRead(app, "Reading blame");
  const head = await showLater(c, "HEAD", path, query.signal);
  if (!query.current()) return;
  if (head === null) return app.message("info", `${path} isn't in the last commit: every line is new`);
  const at = lineInHead(head, view!.buf.source, line);
  if (at === null) return app.message("info", `line ${line} is changed since the last commit: not committed yet`);
  const b = await blameLineLater(c, path, at, query.signal);
  if (!query.current()) return;
  if (!b) return app.message("warn", `git couldn't blame line ${line}`);
  const message = (await messageLater(c, b.hash, query.signal)) || b.subject;
  if (!query.current()) return;
  app.overlays.openHover(
    `**${b.hash.slice(0, 8)}** · ${b.author} · ${day(b.time)}\n\n\`\`\`text\n${message}\n\`\`\`\n\n\`space g h\`: the file's history`,
    `line ${line}, last changed in ${b.hash.slice(0, 8)}`,
  );
}

/** `space g h`: the file's commits, newest first; one picked, read as it was or diffed to the text now. */
export async function historyHere(app: App): Promise<void> {
  const view = app.view;
  const path = fileHere(app, view);
  if (path === null) return;
  const query = beginGitRead(app, "Reading history");
  const log = await fileLogLater(app.git.checkout!, path, 500, query.signal);
  if (!query.current()) return;
  if (log === null) return app.message("warn", "git couldn't read its history");
  if (!log.length) return app.message("info", `${path} has no commits yet`);
  app.overlays.openList({
    title: `${path} — ${log.length} commit${log.length === 1 ? "" : "s"}: enter, read it or its diff to now`,
    items: log.map((x) => ({
      label: `${x.hash.slice(0, 7)} ${sanitize(x.subject)}`,
      detail: `${sanitize(x.author)} · ${day(x.time)}${x.path !== path ? ` · as ${sanitize(x.path)}` : ""}`,
      data: x,
    })),
    accept: (item) => pickVersion(app, view!, path, item.data as CommitInfo),
  });
}

/** A version picked: read it, as it was — or its diff to the text as it is now. */
async function pickVersion(app: App, view: View, path: string, x: CommitInfo): Promise<void> {
  const c = app.git.checkout!;
  const query = beginGitRead(app, "Reading version");
  const text = await showLater(c, x.hash, x.path, query.signal);
  if (!query.current()) return;
  if (text === null) return app.message("warn", `git has no ${x.path} at ${x.hash.slice(0, 7)}`);
  const at = `${x.path} at ${x.hash.slice(0, 7)} (${day(x.time)})`;
  app.overlays.openList({
    title: at,
    items: [
      { label: "Read it as it was", detail: "read-only, in the floating window", data: "read" },
      { label: "Its diff to the text now", detail: "what's changed since, line by line", data: "diff" },
    ],
    accept: (item) => {
      if (item.data === "read") return app.git.showVersion(text, x.path, `${at}, read-only`);
      app.git.showLineDiff(
        text,
        view.buf.source,
        relative(app.loc.root, join(c.root, path)),
        `${path}: ${x.hash.slice(0, 7)} to now`,
      );
    },
  });
}
