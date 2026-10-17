// The commands of windows, tabs and panels (`window.*`, `tab.*`, `history.*`, the panels' and source control's):
// splits and tabs, each window's history, the side panels' views, the Problems panel, git's changes.

import { type Run, withView, lay } from "./actions.ts";
import type { App } from "./app.ts";
import { diffSwitch } from "./diffview.ts";
import { blameHere, historyHere } from "./githistory.ts";
import { gitStep, gitPreview, gitReset } from "./gitchanges.ts";
import { gitFetch, gitPull, gitPush, gitStash } from "./gitremote.ts";
import { mergeAgent, mergeEdit, mergeSave, mergeStage, mergeStep, mergeTake, openMergeScreen } from "./mergescreen.ts";
import { gitAbort, gitContinue, gitRebase, gitSkip } from "./rebase.ts";
import { openReview, reviewGo, reviewKeep, reviewNote, reviewRevert, reviewStep } from "./review.ts";
import * as E from "./editing.ts";

/** Windows, tabs and panels: splits and tabs, each window's history, the side panels, the Problems panel and source control. */
export function paneActions(): Record<string, Run> {
  return {
    "change.prev": (a) => changeStep(a, -1),
    "change.next": (a) => changeStep(a, 1),
    "history.back": (a) => a.history.go("back"),
    "history.forward": (a) => a.history.go("forward"),
    // The left panel on the history, like the explorer: open and focus, focus, close.
    "history.list": (a) =>
      withView(a, (v) => {
        // Nothing but this note — no timeline in this window, no note read lately in another.
        const others = a.history.rows().filter((r) => !r.here && !r.heading).length;
        if (!others && !v.back.length && !v.fwd.length && !(a.panels.sidebarShown && a.leftView === "history"))
          return a.message("info", "no history yet");
        a.panels.openLeftView("history", "cycle");
      }),
    // windows
    // :vs <note> and :sp <note> (vim's): the split, then that note in it.
    "window.split_side": async (a, arg) => {
      a.windows.split("side");
      if (arg) await a.run(`note.open ${arg}`);
    },
    "window.split_stacked": async (a, arg) => {
      a.windows.split("stacked");
      if (arg) await a.run(`note.open ${arg}`);
    },
    "window.focus_left": (a) => a.windows.focus("left"),
    "window.focus_down": (a) => a.windows.focus("down"),
    "window.focus_up": (a) => a.windows.focus("up"),
    "window.focus_right": (a) => a.windows.focus("right"),
    "window.other": (a) => {
      const t = a.tab;
      if (a.region !== "content") a.region = "content";
      else if (t && t.views.length > 1) t.active = (t.active + 1) % t.views.length;
    },
    "window.move_left": (a) => a.windows.move("left"),
    "window.move_down": (a) => a.windows.move("down"),
    "window.move_up": (a) => a.windows.move("up"),
    "window.move_right": (a) => a.windows.move("right"),
    "window.resize_mode": (a) => {
      a.panels.resizeMode = true;
    },
    "window.equalize": (a) => a.panels.resizeAction("equalize"),
    "breadcrumb.path": (a) => a.outlineView.openHeadingPath(),
    // One step, then resize mode: the same key (or h j k l) goes on resizing without the chord.
    ...Object.fromEntries(
      (["wider", "narrower", "taller", "shorter"] as const).map((step) => [
        `window.${step}`,
        (a: App) => {
          a.panels.resizeAction(step);
          a.panels.resizeMode = true;
        },
      ]),
    ),
    "window.swap": (a) => {
      const t = a.tab;
      if (!t || t.views.length < 2) return a.message("info", "only one window");
      t.views.reverse();
      t.active = 1 - t.active;
    },
    "window.close": (a) => a.windows.close(),
    "window.close_or_quit": (a) => a.windows.closeOrQuit(),
    "window.only": (a) => {
      const t = a.tab;
      if (!t || t.views.length < 2) return;
      const keep = t.views[t.active]!;
      for (const v of t.views) if (v !== keep) a.history.remember(v);
      t.views = [keep];
      t.active = 0;
    },
    // tabs
    // :tabnew <note>: a new tab on that note; without one, on this note.
    "tab.new": (a, arg) =>
      withView(a, async (v) => {
        // A window of a split: moved out into a tab of its own — its history and place with it — the split gone,
        // the other window keeping the tab (vim's ctrl+w T).
        const t = a.tab!;
        if (!arg && t.views.length > 1) {
          t.views.splice(t.views.indexOf(v), 1);
          t.active = 0;
          v.layoutKey = "";
          a.tabs.splice(a.activeTab + 1, 0, {
            views: [v],
            active: 0,
            orientation: "side",
            ratio: a.config.ui.split_ratio,
          });
          a.activeTab += 1;
          return;
        }
        a.tabs.splice(a.activeTab + 1, 0, {
          views: [a.makeView(v.buf, { ...v.topAnchor }, { ...v.curAnchor })],
          active: 0,
          orientation: "side",
          ratio: a.config.ui.split_ratio,
        });
        a.activeTab += 1;
        if (arg) await a.run(`note.open ${arg}`);
      }),
    "tab.list": (a) =>
      a.overlays.openList({
        title: `Tabs (${a.tabs.length})`,
        items: a.tabs.map((t, i) => ({
          label: `${i + 1}  ${a.displayName(t.views[t.active]!.buf)}`,
          hint: t.views.length > 1 ? "split" : undefined,
          data: i,
        })),
        selected: a.activeTab,
        accept: (item) => {
          a.activeTab = item.data as number;
        },
      }),
    "tab.next": (a) => {
      if (a.tabs.length) a.activeTab = (a.activeTab + 1) % a.tabs.length;
    },
    "tab.prev": (a) => {
      if (a.tabs.length) a.activeTab = (a.activeTab - 1 + a.tabs.length) % a.tabs.length;
    },
    "tab.goto": (a, arg) => {
      const n = Number(arg) - 1;
      if (Number.isInteger(n) && n >= 0 && n < a.tabs.length) a.activeTab = n;
      else a.message("info", `no tab ${arg}`);
    },
    "tab.move_left": (a) => a.windows.moveTab(-1),
    "tab.move_right": (a) => a.windows.moveTab(1),
    "tab.pin": (a) => a.windows.togglePin(),
    "tab.close": (a) => a.windows.closeTab(),
    // panes
    // Closed (or showing the history) → open on the tree and focus; open elsewhere → focus; focused → close.
    "explorer.cycle": (a) => a.panels.openLeftView("explorer", "cycle"),
    "explorer.reveal": (a) => {
      a.panels.switchLeftView("explorer");
      a.sidebar.filter = "";
      a.sidebar.filtering = false;
      a.panels.showSidebar(true);
      a.explorer.reveal(undefined, false, true); // asked for: outside the view, it zooms out to hold it (VV-D5)
      a.region = "sidebar";
    },
    // Like the explorer: closed → open and focus; open elsewhere → focus; focused → close.
    "outline.cycle": (a) => a.panels.openRightView("outline", "cycle"),
    // The ▤ button: show (and focus) or hide.
    "outline.toggle": (a) => a.panels.openRightView("outline"),
    // The right panel's other view (3.17): the note's footnotes, its button under the outline's.
    "footnotes.cycle": (a) => a.panels.openRightView("footnotes", "cycle"),
    "footnotes.toggle": (a) => a.panels.openRightView("footnotes"),
    "footnote.add": (a) => a.footnotes.add(),
    "git.changes": (a) => a.git.openChanges(),
    "git.diff": (a) => a.git.openDiff(),
    // A note's diff: its blocks before and after, or its lines (GIT-D2).
    "git.diff_view": (a) => diffSwitch(a),
    // The working tree's changes against what's staged (26.1).
    "git.view": (a) => a.panels.openLeftView("git", "cycle"),
    "git.commit": (a) => a.git.openCommitEditor(false),
    "git.blame": (a) => blameHere(a),
    "git.branches": (a) => a.git.openBranches(),
    "git.history": (a) => historyHere(a),
    "git.amend": (a) => a.git.openCommitEditor(true),
    "git.change_next": (a) => withView(a, (v) => gitStep(a, v, 1)),
    "git.change_prev": (a) => withView(a, (v) => gitStep(a, v, -1)),
    "git.change_preview": (a) => withView(a, (v) => gitPreview(a, v)),
    "git.change_undo": (a) => withView(a, (v) => gitReset(a, v)),
    "git.worktrees": (a) => a.git.openWorktrees(),
    "git.merge_review": (a) => a.git.openMergeReview(),
    // The remote's commands and stash (26.6): in the background, asked for, never on a timer.
    "git.fetch": (a) => gitFetch(a),
    "git.pull": (a) => gitPull(a),
    "git.push": (a) => gitPush(a),
    "git.stash": (a) => gitStash(a),
    // Reviewing a change (GIT-D3), the merge screen (GIT-D5), pull and rebase (GIT-D6).
    "git.review": (a) => openReview(a),
    "git.review_keep": (a) => reviewKeep(a),
    "git.review_revert": (a) => reviewRevert(a),
    "git.review_note": (a) => reviewNote(a),
    "git.review_next": (a) => reviewStep(a, 1),
    "git.review_prev": (a) => reviewStep(a, -1),
    "git.review_go": (a) => reviewGo(a),
    // `:resolve [file]`: the file named, else this note in conflict, else the first that is.
    "git.merge_screen": (a, arg) => openMergeScreen(a, arg?.trim() || undefined),
    "git.merge_ours": (a) => mergeTake(a, "ours"),
    "git.merge_theirs": (a) => mergeTake(a, "theirs"),
    "git.merge_both": (a) => mergeTake(a, "both"),
    "git.merge_both_theirs": (a) => mergeTake(a, "both-theirs"),
    "git.merge_edit": (a) => mergeEdit(a),
    "git.merge_agent": (a) => mergeAgent(a),
    "git.merge_next": (a) => mergeStep(a, 1),
    "git.merge_prev": (a) => mergeStep(a, -1),
    "git.merge_save": (a) => void mergeSave(a),
    "git.merge_stage": (a) => mergeStage(a),
    "git.rebase": (a) => gitRebase(a),
    "git.continue": (a) => gitContinue(a),
    "git.skip": (a) => gitSkip(a),
    "git.abort": (a) => gitAbort(a),
    "tab.close_others": (a) => a.windows.closeOtherTabs(),
    "tab.close_all": (a) => a.windows.closeAllTabs(),
    "outline.pick": (a) =>
      withView(a, (v) => {
        const layout = lay(a, v);
        if (!layout.headings.length) return a.message("info", "no headings in this note");
        const current = [...layout.headings].reverse().findIndex((h) => h.line <= v.cur.row);
        a.overlays.openList({
          title: `Headings — ${v.buf.name}`,
          items: layout.headings.map((h) => ({
            label: h.text.replace(/\s+/g, " "),
            indent: h.level - 1,
            hint: `${h.src}`,
            data: h.line,
          })),
          accept: (item) => {
            a.history.push(v);
            a.moveCursor(v, { row: item.data as number, col: 0 });
          },
          selected: current < 0 ? 0 : layout.headings.length - 1 - current,
        });
      }),
    "info.toggle": (a) => a.panels.openRightView("info"),
    // The Problems panel at the bottom (1.7): the root's problems (All), or the file on screen's — made afresh when
    // it opens; open and focused already, closed.
    "problems.open": (a) => a.problems.open("all"),
    "problems.file": (a) => a.problems.open("file"),
  };
}

/** `g;` / `g,`: the change before or after in the note's change list. */
function changeStep(a: App, dir: -1 | 1): void {
  withView(a, (v) => {
    const b = v.buf;
    if (!b.changes.length) return a.message("info", "no changes in this note yet");
    const i = b.changeAt + dir;
    if (i < 0) return a.message("info", "at the oldest change");
    if (i >= b.changes.length) return a.message("info", "at the newest change");
    b.changeAt = i;
    E.placeAt(a, v, Math.min(b.changes[i]!, b.source.length));
    a.message("info", `change ${i + 1} of ${b.changes.length}`);
  });
}
