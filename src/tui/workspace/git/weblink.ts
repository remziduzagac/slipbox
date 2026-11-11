// A line's web link (EG-D18): `space g y` copies it, `space g w` opens it in your browser — the platform's opener, as a
// problem report's form opens (RPT-D3), never over SSH, where it's copied instead. The cursor's line, or the
// selection's lines as a range, at the commit checked out, on the forge the branch's remote names (its upstream's,
// else origin): GitHub's or GitLab's. The lines are the commit's: mapped through the changes since, as blame maps a
// line, so a line not committed has none; a commit not on the remote yet is linked all the same, and said.

import { browserOpener, openerSources } from "../../../core/foundation/platform/browser.ts";
import { sanitize } from "../../../core/foundation/text/sanitize.ts";
import { headCommit, headOf } from "../../../core/workspace/git/git.ts";
import { gitReadLater, showLater } from "../../../core/workspace/git/branches/gitops.ts";
import { forgeOf, webLink } from "../../../core/workspace/git/forge.ts";
import { linesInHead } from "../../../core/workspace/git/history/gitlog.ts";
import type { App, View } from "../../app/runtime/app.ts";
import { ordered } from "../../documents/editing/cursor.ts";
import { lineOf, offsetAtPos } from "../../documents/editing/editing.ts";
import { beginGitRead } from "./gitquery.ts";
import { pathHere } from "./views/changes/here.ts";

/** How long the opener is given to say it failed: past it, it's taken as opening. */
const OPENER_WAIT = 5000;

/** The cursor's or selection's source lines: every contributing line of each rendered endpoint row. */
export function linesHere(app: App, view: View): { from: number; to: number } {
  const layout = app.currentLayout(view);
  const lineAt = (pos: { row: number; col: number }, last: boolean): number => {
    const row = layout.lines[pos.row];
    if (row?.srcMap) return lineOf(view, offsetAtPos(app, view, pos));
    // A rendered row: the lines its text came from.
    const srcs = [row?.src ?? 1, ...(row?.spans ?? []).flatMap((s) => (s.src === undefined ? [] : [s.src]))];
    return last ? Math.max(...srcs) : Math.min(...srcs);
  };
  if (!view.sel) return { from: lineAt(view.cur, false), to: lineAt(view.cur, true) };
  const [s, e] = ordered(view.sel.anchor, view.cur);
  return { from: lineAt(s, false), to: lineAt(e, true) };
}

/** Lines as a message says them: `line 12`, `lines 10–20`. */
const said = (r: { from: number; to: number }) => (r.from === r.to ? `line ${r.from}` : `lines ${r.from}–${r.to}`);

/**
 * `space g y` / `space g w` (`git.web_copy`, `git.web_open`): the web link to the cursor's line, or the selection's
 * lines, copied or opened. Said instead: no remote, one that isn't GitHub's or GitLab's, a file or a line not committed.
 */
export async function webLinkHere(app: App, view: View, how: "copy" | "open"): Promise<void> {
  const path = pathHere(app, view);
  if (path === null) return;
  const c = app.git.checkout!;
  const commit = headCommit(c);
  if (!commit) return app.message("info", "no commit yet: nothing to link to");
  const lines = linesHere(app, view);
  // Read before the selection goes: the window's own text, unsaved typing included, which the lines are of.
  const now = view.buf.source;
  if (view.sel) Object.assign(view, { visual: null, sel: null });
  const query = await beginGitRead(app, "Reading the remote");
  if (!query) return;
  const branch = headOf(c).branch;
  const upstream = branch
    ? (await gitReadLater(c, ["config", "--get", `branch.${branch}.remote`], false, query.signal))?.trim()
    : "";
  // A branch tracking one of this repository's own (`.`) has no forge of its own: origin's.
  const remote = upstream && upstream !== "." ? upstream : "origin";
  const url = (await gitReadLater(c, ["remote", "get-url", "--end-of-options", remote], false, query.signal))?.trim();
  if (!query.live()) return;
  if (!url) return app.message("info", `no remote named ${sanitize(remote)}: no web link`);
  const forge = forgeOf(url);
  if (!forge)
    return app.message("info", `${sanitize(remote)} isn't on GitHub or GitLab (${sanitize(url)}): no web link`);
  const head = await showLater(c, commit, path, query.signal);
  if (!query.live()) return;
  if (head === null) return app.message("info", `${sanitize(path)} isn't committed yet: no web link`);
  const at = linesInHead(head, now, lines.from, lines.to);
  if (!at) return app.message("info", `${said(lines)} isn't committed yet: no web link`);
  // On the remote's branches, as of the last fetch: a commit not pushed is linked all the same, its page not there yet.
  const on = await gitReadLater(
    c,
    ["for-each-ref", "--count=1", "--format=%(refname)", "--contains", commit, `refs/remotes/${remote}`],
    false,
    query.signal,
  );
  if (!(await query.current())) return;
  const link = webLink(forge, commit, path, at.from, at.to);
  const where = `the web link to ${said(at)} of ${sanitize(path)}`;
  const unpushed = on !== null && !on.trim() ? `${commit.slice(0, 7)} isn't on ${sanitize(remote)} yet` : "";
  if (how === "copy") return void (await app.copy(link, true, unpushed ? `${where} — ${unpushed}` : where));
  if (unpushed) return void (await app.copy(link, true, `${where}, not opened — ${unpushed}`));
  const opener = browserOpener(openerSources({ remote: app.host.terminal?.()?.remote ?? false }));
  const run = app.host.runDetached;
  if (!opener || !run) return void (await app.copy(link, true, `${where} — no browser to open here`));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise<"waited">((r) => (timer = setTimeout(() => r("waited"), OPENER_WAIT)));
  const code = await Promise.race([run(opener.argv(link)), waited]).finally(() => clearTimeout(timer));
  if (code === "waited" || (typeof code === "number" && opener.ok.includes(code)))
    return app.message("info", `${where} is opening in your browser`);
  const why = typeof code === "number" ? `${opener.name} exited with ${code}` : `${opener.name}: ${code}`;
  await app.copy(link, true, `${where} — ${sanitize(why)}`);
}
