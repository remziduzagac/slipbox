// The git panel by mouse (GIT-D8): a row clicked selects it and does what enter does — a file's diff, a heading folded,
// a branch opened up — a double-click what `o` does; a row's buttons under the pointer (stage or unstage, discard, the
// diff), a heading's (its files all at once, a new branch), an opened-up branch's (Open, Merge…); the message box
// clicked, typed in; the buttons at the top; a right click, the row's menu. The footer says what the pointer is on, with
// its key. Outside the panel: the branch where you are clicked (the top bar's; the status line's while the bar is
// hidden), the branches, pulling and pushing; a change's sign in the gutter clicked, the change shown with Revert and
// Stage (GIT-D12).

import { relative, sep } from "node:path";
import { changeAt, type GitChange } from "../../../../../core/workspace/git/gitsigns.ts";
import { stageChange, stageFile } from "../../../../../core/workspace/git/staging/gitstage.ts";
import type { App, View } from "../../../../app/runtime/app.ts";
import type { PanelRow } from "./gitpanel.ts";
import { revertChange } from "../changes/gitchanges.ts";
import { hotRow } from "../../gitsteady.ts";

/** A row's button: its glyph, the panel's action it runs, what it does (the footer says it, with its key). */
export interface RowAction {
  glyph: string;
  action: string;
  desc: string;
}

/** A row's buttons: a heading's, on its files all at once; a file's or a change's, on it. */
export function rowActions(app: App, row: PanelRow): RowAction[] {
  const g = app.glyphs.git;
  const stage = (desc: string): RowAction => ({ glyph: g.stage, action: "stage", desc });
  const unstage = (desc: string): RowAction => ({ glyph: g.unstage, action: "unstage", desc });
  const discard = (desc: string): RowAction => ({ glyph: g.discard, action: "discard", desc });
  const diff: RowAction = { glyph: g.diff, action: "open", desc: "its diff" };
  switch (row.kind) {
    case "heading":
      switch (row.section) {
        case "staged":
          return [unstage("unstages everything")];
        case "unstaged":
          return [stage("stages every change here"), discard("discards every change here, after asking")];
        case "untracked":
          return [stage("stages every new file")];
        case "branches":
          return [
            {
              glyph: `${g.stage} New`,
              action: "new_branch",
              desc: "a new branch: its name, where it starts, where it goes",
            },
          ];
        default:
          return [];
      }
    case "file":
      return row.section === "staged"
        ? [unstage("unstages it"), diff]
        : row.section === "conflicted"
          ? [stage("marks it resolved"), diff]
          : [
              stage("stages it"),
              discard(
                row.section === "untracked"
                  ? "moves it to the trash, after asking"
                  : "discards its changes, after asking",
              ),
              diff,
            ];
    case "change":
      return row.section === "staged"
        ? [unstage("unstages this change")]
        : [stage("stages this change"), discard("reverts this change, after asking")];
    case "ahead":
    case "bfile":
    case "rfile":
      return [diff];
    case "repo":
      return [{ glyph: app.glyphs.navForward, action: "go", desc: "goes into it" }];
    default:
      return [];
  }
}

/** What a hover id points at, for the footer: a button, or a row's action — its key, and what it does. */
export function pointedAt(app: App, id: string | null): { key: string | null; desc: string } | null {
  if (!id?.startsWith("git:")) return null;
  const p = app.gitPanel;
  const btn = /^git:btn:(.+)$/.exec(id);
  if (btn) {
    const b = p.buttons().find((x) => x.id === btn[1]);
    return b ? { key: p.keyFor(b.action), desc: `${b.label.replace(/^[^\p{L}]+\s/u, "")}: ${b.desc}` } : null;
  }
  const h = hotRow(id);
  if (h && h.prefix !== "git:row:") {
    const row = p.rows()[h.index];
    const what = h.rest.slice(1);
    if (h.prefix === "git:act:") {
      const a = row ? rowActions(app, row).find((x) => x.action === what) : undefined;
      return a ? { key: p.keyFor(a.action), desc: a.desc } : null;
    }
    const b = row?.kind === "bbuttons" ? row.buttons.find((x) => x.action === what) : undefined;
    const key =
      what === "go"
        ? p.keyFor("go")
        : what === "merge"
          ? p.keyFor("merge")
          : what === "remove"
            ? p.keyFor("discard")
            : null;
    return b ? { key, desc: b.label } : null;
  }
  if (id === "git:box") return { key: p.keyFor("message"), desc: "type the commit's message: ctrl+enter commits it" };
  if (id === "git:head") return { key: null, desc: "the branches: check one out, make one; pull, push, fetch" };
  return null;
}

/** A click on the panel's own (its hot ids, `git:…`): true when it was the panel's. */
export function gitClick(app: App, id: string, clicks: number): boolean {
  if (!id.startsWith("git:")) return false;
  const p = app.gitPanel;
  p.touched++;
  app.region = "sidebar";
  p.typing = id === "git:box";
  if (id === "git:box") return true;
  if (id === "git:head") {
    branchMenu(app);
    return true;
  }
  const btn = /^git:btn:(.+)$/.exec(id);
  if (btn) {
    const b = p.buttons().find((x) => x.id === btn[1]);
    if (b) p.action(b.action);
    return true;
  }
  // A row's: the one the last frame drew there, wherever it is now; gone since, nothing (D261).
  const h = hotRow(id);
  if (!h) return true;
  const rows = p.rows();
  const i = p.steady.rowAt(h.index, rows);
  const r = rows[i];
  if (!r || r.kind === "note") return true;
  p.select(i, rows);
  const what = h.rest.slice(1);
  if (h.prefix === "git:act:") p.action(what);
  else if (h.prefix === "git:bb:") {
    if (r.kind === "bbuttons") p.branches.button(r.branch, what);
  }
  // A branch's lines and its buttons' row: selected, nothing more — its buttons are their own.
  else if (r.kind === "bbuttons" || r.kind === "bline" || r.kind === "bsub") return true;
  // One click: what enter does (a file's diff, a heading folded, a branch opened up); a second, what o does.
  else p.action(clicks >= 2 && r.kind !== "heading" && r.kind !== "branch" && r.kind !== "repo" ? "go" : "open");
  return true;
}

/** A right click on the panel's row: its menu, where the pointer is. */
export function gitRightClick(app: App, id: string | null, x: number, y: number): boolean {
  const h = hotRow(id);
  if (!h) return false;
  app.gitPanel.touched++;
  const rows = app.gitPanel.rows();
  const i = app.gitPanel.steady.rowAt(h.index, rows);
  const row = rows[i];
  if (!row || row.kind === "note" || row.kind === "heading") return true;
  app.region = "sidebar";
  app.gitPanel.select(i, rows);
  app.gitPanel.menu(row, { x, y });
  return true;
}

/**
 * The branch where you are, clicked (GIT-D8, WSP-D4): the branches, to check one out or make one, after the remote's —
 * pull, push, fetch — and the git panel.
 */
export function branchMenu(app: App): void {
  if (!app.git.checkout) return app.message("info", "not in a git repository");
  const t = app.git.track;
  const g = app.glyphs;
  const up = !!t?.upstream && !t.gone;
  app.git.openBranches([
    ...(up
      ? [
          {
            label: `${g.gitBehind} Pull${t!.behind ? `: ${t!.behind} behind ${t!.upstream}` : ""}`,
            run: () => void app.run("git.pull"),
          },
        ]
      : []),
    {
      label: `${g.gitAhead} ${up ? `Push${t!.ahead ? `: ${t!.ahead} ahead` : ""}` : "Push, and track it on origin"}`,
      run: () => void app.run("git.push"),
    },
    { label: "Fetch", run: () => void app.run("git.fetch") },
    { label: "The git panel", run: () => app.panels.openLeftView("git", "cycle") },
  ]);
}

/**
 * A change's sign in the gutter, clicked (GIT-D12): the change shown — its lines as staged, then as they are — with
 * Revert and Stage, in a menu at the sign.
 */
export function signClick(app: App, view: View, line: number, at: { x: number; y: number }): void {
  const changes = app.git.changesOf(view);
  const c = changes ? changeAt(changes, line) : null;
  if (!c) return;
  const SHOWN = 8;
  const lines = [
    ...c.was.map((l) => ({ label: `- ${l}`, role: "diff_del" as const, data: null })),
    ...c.now.map((l) => ({ label: `+ ${l}`, role: "diff_add" as const, data: null })),
  ];
  const more = lines.length - SHOWN;
  const where =
    c.kind === "delete"
      ? `${c.was.length} line${c.was.length === 1 ? "" : "s"} deleted after line ${c.from - 1}`
      : c.from === c.to
        ? `line ${c.from}`
        : `lines ${c.from}–${c.to}`;
  app.overlays.openList({
    title: `${where}, against what's staged`,
    filterable: false,
    anchor: at,
    menu: true,
    items: [
      { label: "Revert it", hint: "r", hotkey: "r", data: "revert" },
      { label: "Stage it", hint: "s", hotkey: "s", data: "stage" },
      ...lines.slice(0, SHOWN),
      ...(more > 0 ? [{ label: `… ${more} more line${more === 1 ? "" : "s"}`, data: null }] : []),
    ],
    accept: (item) => {
      if (item.data === "revert") return revertChange(app, view, c);
      if (item.data === "stage") return stageSign(app, view, c);
    },
  });
}

/** A change in the gutter staged: the index given its lines as they are — saved first, as git stages what's on disk. */
export function stageSign(app: App, view: View, change: GitChange): void {
  const co = app.git.checkout;
  const buf = view.buf;
  if (!co || !buf.abs) return;
  if (buf.dirty)
    return app.message("warn", `unsaved: ${app.displayName(buf)} — save it first: git stages the file on disk`);
  const path = relative(co.root, buf.abs).split(sep).join("/");
  const staged = app.git.stagedText(buf);
  if (staged === undefined) return app.message("info", "git hasn't answered yet");
  const why = staged === null ? stageFile(co, path) : stageChange(co, path, staged, change);
  if (why) return app.message("warn", `git: ${why}`);
  app.message("info", `staged the change at line ${change.from} of ${path}`);
  void app.git.refreshNow().then(() => app.host.requestRender());
}
