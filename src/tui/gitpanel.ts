// The git panel (GIT-D8, GIT-D12): source control, the left panel's third view, worked by mouse as by keys, its keys
// shown. At its top, the repository and its branch, against its base and its upstream; a message box, typed in, where
// ctrl+enter commits; the buttons — commit, amend, pull, push, fetch, stash — each saying its key under the pointer.
// Under them its sections: the working tree's (gitview.ts), what this branch changed against its base, this file's
// diff, history and blame, the branches (gitbranchview.ts). Its keys (`[keys.git]`) act on the row selected, and its
// footer says them; `space g` opens it and focuses it (`git.view`).

import { basename } from "node:path";
import { headOf } from "../core/git.ts";
import { baseBranch, type Changed, type GitState, inVault } from "../core/gitops.ts";
import { changedLater } from "../core/gitbranches.ts";
import { commitLater, sections } from "../core/gitstage.ts";
import { formatEntry } from "../core/capture.ts";
import { sanitize } from "../core/sanitize.ts";
import { keyChar, spellKey } from "./keys.ts";
import { match } from "./match.ts";
import { BranchView, type BranchViewRow } from "./gitbranchview.ts";
import {
  backToPanel,
  type ChangeRow,
  type FileRow,
  type GitSection,
  relOf,
  sectionAction,
  workAction,
  workRows,
} from "./gitview.ts";
import { pointedAt } from "./gitmouse.ts";
import type { App } from "./app.ts";

/** A section of the panel: the working tree's four; the branch's, this file's; the branches, the merged and older among
 *  them. */
export type SectionId = GitSection | "ahead" | "file" | "branches" | "older";

export interface HeadingRow {
  kind: "heading";
  section: SectionId;
  label: string;
}

/** A line that says something, not a row to act on: "nothing uncommitted", "asking git…". */
export interface NoteRow {
  kind: "note";
  text: string;
}

/** A file this branch changed against its base (GIT-D8): its vault path (null outside the vault). */
export interface AheadRow {
  kind: "ahead";
  file: Changed;
  rel: string | null;
  base: string;
}

/** One of this file's own: its diff against the base, its history, who changed the cursor's line. */
export interface ThisFileRow {
  kind: "thisfile";
  command: "git.diff" | "git.history" | "git.blame";
  label: string;
}

export type PanelRow = HeadingRow | NoteRow | FileRow | ChangeRow | AheadRow | ThisFileRow | BranchViewRow;

/** A button at the panel's top (GIT-D8): what it says, the action its key runs, what it does. */
export interface PanelButton {
  id: string;
  label: string;
  action: string;
  desc: string;
}

/** A state's letter, as the explorer marks it (5.11). */
export const STATE_LETTER: Record<GitState, string> = {
  new: "+",
  modified: "M",
  renamed: "R",
  deleted: "D",
  conflict: "!",
};

/** The panel's own state: the message typed, the sections folded, what's asked of git for it. */
export class GitPanel {
  constructor(readonly app: App) {
    this.branches = new BranchView(app);
  }

  /** The branches (GIT-D9): their state, what they ask of git. */
  readonly branches: BranchView;
  /** The message box's text (GIT-D8), and whether keys go to it. */
  message = "";
  typing = false;
  /** The sections folded, by id: the merged and older branches, to begin with. */
  readonly folded = new Set<SectionId>(["older"]);
  /** What this branch changed against its base (GIT-D8), asked of git in the background, by the question asked. */
  private ahead: { key: string; base: string; files: Changed[] | null } | null = null;

  /** The panel opened, or the focus back on it: git asked again about what it shows. */
  shown(): void {
    void this.app.git.refreshNow().then(() => this.app.host.requestRender());
  }

  /** The branch's files against its base, asked again when git has news; the last answer meanwhile. */
  aheadFiles(): { base: string; files: Changed[] | null } | null {
    const c = this.app.git.checkout;
    const branch = c ? headOf(c).branch : null;
    if (!c || !branch) return null;
    const base = this.app.git.baseOf(c, branch);
    if (!base || base === branch) return null;
    const key = `${this.app.git.generation}\0${base}\0${branch}`;
    if (this.ahead?.key !== key) {
      const asked = { key, base, files: this.ahead?.base === base ? this.ahead.files : null };
      this.ahead = asked;
      void changedLater(c, base, this.app.git.entries ?? []).then((files) => {
        if (this.ahead !== asked) return;
        asked.files = files ?? [];
        this.app.host.requestRender();
      });
    }
    return { base, files: this.ahead.files };
  }

  /** The panel's rows: its sections, each under its heading unless folded; the filter keeps the rows it matches. */
  rows(): PanelRow[] {
    const app = this.app;
    const c = app.git.checkout;
    if (!c) return [{ kind: "note", text: "not a git repository" }];
    if (app.git.entries === null) return [{ kind: "note", text: "asking git…" }];
    const q = app.sidebar.filter ?? "";
    const rows: PanelRow[] = [];
    const work = workRows(app);
    rows.push(...work);
    if (!work.length && !q) rows.push({ kind: "note", text: "nothing uncommitted" });
    rows.push(...this.aheadRows(q), ...this.fileRows(q), ...this.branches.rows());
    if (q && rows.every((r) => r.kind === "note")) return [{ kind: "note", text: "no matches" }];
    return rows;
  }

  /** "This branch against main": the files the branch changed (committed or not), a click or enter showing a diff. */
  private aheadRows(q: string): PanelRow[] {
    const c = this.app.git.checkout!;
    const a = this.aheadFiles();
    if (!a?.files?.length) return [];
    const files = a.files.filter((f) => !q || match(q, f.path));
    if (!files.length) return [];
    const rows: PanelRow[] = [
      { kind: "heading", section: "ahead", label: `This branch against ${sanitize(a.base)} (${files.length})` },
    ];
    if (this.folded.has("ahead") && !q) return rows;
    for (const file of files)
      rows.push({ kind: "ahead", file, rel: inVault(c, this.app.loc.root, file.path), base: a.base });
    return rows;
  }

  /** "This file": its diff against the base, its history, who changed the cursor's line — the note on screen's. */
  private fileRows(q: string): PanelRow[] {
    const v = this.app.tabView;
    const c = this.app.git.checkout!;
    const rel = v?.buf.rel;
    if (!v || !rel || q || v.buf.virtual || !v.buf.abs || !v.buf.abs.startsWith(`${c.root}/`)) return [];
    const rows: PanelRow[] = [{ kind: "heading", section: "file", label: `This file: ${sanitize(basename(rel))}` }];
    if (this.folded.has("file")) return rows;
    const base = this.app.git.baseOf(c, headOf(c).branch) ?? baseBranch(c, this.app.config.git.base);
    rows.push(
      { kind: "thisfile", command: "git.diff", label: `Its diff against ${sanitize(base ?? "the base")}` },
      { kind: "thisfile", command: "git.history", label: "Its history" },
      { kind: "thisfile", command: "git.blame", label: "Who changed this line" },
    );
    return rows;
  }

  /** Where the branch stands against its base, as the panel's top says it: `↑5 on main`; null for the base itself. */
  standing(): { ahead: number; behind: number; base: string } | null {
    const here = this.branches.here();
    const st = here ? this.branches.statsOf(here) : null;
    return st?.base ? { ahead: st.ahead, behind: st.behind, base: st.base } : null;
  }

  /** The buttons at the panel's top (GIT-D8), as the repository stands: commit with what's staged, the remote's. */
  buttons(): PanelButton[] {
    const app = this.app;
    const g = app.glyphs.git;
    const staged = sections(app.git.entries ?? []).staged.length;
    const t = app.git.track;
    const up = !!t?.upstream && !t.gone;
    const label = (glyph: string, text: string) => (glyph ? `${glyph} ${text}` : text);
    return [
      {
        id: "commit",
        label: label(g.commit, `Commit${staged ? ` ${staged}` : ""}`),
        action: "commit",
        desc: "commits what's staged with the box's message; with none, in the editor",
      },
      { id: "amend", label: "Amend", action: "amend", desc: "amends the last commit with what's staged" },
      ...(up
        ? [
            {
              id: "pull",
              label: label(app.glyphs.gitBehind, `Pull${t!.behind ? ` ${t!.behind}` : ""}`),
              action: "pull",
              desc: `brings in ${sanitize(t!.upstream!)}'s new commits (fast-forward)`,
            },
          ]
        : []),
      {
        id: "push",
        label: label(app.glyphs.gitAhead, up ? `Push${t!.ahead ? ` ${t!.ahead}` : ""}` : "Publish"),
        action: "push",
        desc: up ? `pushes to ${sanitize(t!.upstream!)}` : "pushes the branch to origin, and tracks it there",
      },
      { id: "fetch", label: label(g.fetch, "Fetch"), action: "fetch", desc: "fetches the remote's new commits" },
      { id: "stash", label: "Stash", action: "stash", desc: "the stashes: the changes stashed, or one brought back" },
      // The review (v), the merge screen (x) and rebasing onto the base (shift+r) come here, as buttons of their own.
    ];
  }

  /** A key's shortest name for one of the panel's actions, as its footer and its buttons say it; null when none is bound. */
  keyFor(action: string): string | null {
    const keys = this.app.gitKeys.keysFor(action);
    const key = [...keys].sort((a, b) => a.length - b.length)[0];
    return key ? spellKey(key) : null;
  }

  /** What the pointer is on, when it's a button or a row's own: its key and what it does, for the footer. */
  pointedAt(): { key: string | null; desc: string } | null {
    return pointedAt(this.app, this.app.mouse.hover);
  }

  /** The footer's keys for a row (GIT-D12): what its keys do to it, the commonest first. */
  footer(row: PanelRow | undefined): [string, string][] {
    const k = (action: string, what: string): [string, string][] => {
      const key = this.keyFor(action);
      return key ? [[key, what]] : [];
    };
    if (!row || row.kind === "note") return [...k("commit", "commit"), ...k("fetch", "fetch")];
    switch (row.kind) {
      case "heading": {
        const s = row.section;
        return [
          ...k("open", this.folded.has(s) ? "unfold" : "fold"),
          ...(s === "unstaged" || s === "untracked" ? k("stage", "stage all") : []),
          ...(s === "staged" ? k("unstage", "unstage all") : []),
          ...(s === "unstaged" ? k("discard", "discard all") : []),
          ...(s === "branches" ? k("new_branch", "new branch") : []),
        ];
      }
      case "file":
      case "change":
        return [
          ...(row.section === "staged" ? k("unstage", "unstage") : k("stage", "stage")),
          ...(row.section === "unstaged" || row.section === "untracked" ? k("discard", "discard") : []),
          ...k("open", "diff"),
          ...(row.kind === "file" ? k("expand", "changes") : []),
          ...k("go", "open"),
          ...k("menu", "more"),
        ];
      case "ahead":
      case "bfile":
        return [...k("open", "diff"), ...(row.kind !== "bfile" ? k("go", "open") : []), ...k("menu", "more")];
      case "thisfile":
        return k("open", row.label.toLowerCase());
      case "branch":
        return [
          ...k("open", row.open ? "fold" : "open up"),
          ...(row.branch.worktree && !row.branch.here ? k("go", "go in") : []),
          ...k("merge", "merge…"),
          ...(row.branch.worktree && !row.branch.here && !row.branch.worktree.main ? k("discard", "remove") : []),
          ...k("menu", "more"),
        ];
      case "bline":
      case "bsub":
      case "bbuttons":
        return [...k("collapse", "fold"), ...k("menu", "more")];
    }
  }

  /** The rows' actions, run by the panel's keys (`[keys.git]`): moving, folding, the row's own, the panel's. */
  action(action: string): void {
    const app = this.app;
    const s = app.sidebar;
    const rows = this.rows();
    const ok = (i: number) => !!rows[i] && rows[i]!.kind !== "note";
    const step = (from: number, by: number) => {
      for (let i = from + by; i >= 0 && i < rows.length; i += by) if (ok(i)) return i;
      return from;
    };
    switch (action) {
      case "down":
        s.selected = step(s.selected, 1);
        return;
      case "up":
        s.selected = step(s.selected, -1);
        return;
      case "top":
        s.selected = step(-1, 1);
        return;
      case "bottom":
        s.selected = step(rows.length, -1);
        return;
      case "filter":
        s.filtering = true;
        return;
      case "close":
        return app.panels.showSidebar(false);
      case "leave":
        // A filter kept after enter: cleared first, the panel's rows back.
        if (s.filter) {
          s.filter = "";
          return app.panels.sidebarRefiltered();
        }
        app.region = "content";
        return;
    }
    const row = rows[s.selected];
    const c = app.git.checkout;
    if (!c) return app.message("info", "not in a git repository");
    switch (action) {
      case "message":
        this.typing = true;
        return;
      case "commit":
        return this.commit();
      case "amend":
        return app.git.openCommitEditor(true, this.message);
      case "fetch":
        return void app.run("git.fetch");
      case "pull":
        return void app.run("git.pull");
      case "push":
        return void app.run("git.push");
      case "stash":
        return void app.run("git.stash");
      case "stage_all":
        return sectionAction(app, "all", "stage");
      case "unstage_all":
        return sectionAction(app, "staged", "unstage");
      case "new_branch":
        return this.branches.newBranch(row?.kind === "branch" ? row.branch.name : undefined);
    }
    if (!row || row.kind === "note") return;
    switch (row.kind) {
      case "heading":
        return this.headingAction(row, action);
      case "file":
      case "change":
        if (action === "menu") return this.menu(row);
        return workAction(app, row, action);
      case "ahead":
        return this.aheadAction(row, action);
      case "thisfile":
        if (action === "open" || action === "go" || action === "expand") return void app.run(row.command);
        return;
      default:
        if (action === "merge" && row.kind !== "branch")
          return app.message("info", "m merges the branch selected: select one in Branches");
        return this.branches.action(row, action);
    }
  }

  /** A section's heading: folded or unfolded; its actions on every file in it (GIT-D8's header buttons). */
  private headingAction(row: HeadingRow, action: string): void {
    const s = row.section;
    switch (action) {
      case "open":
        if (this.folded.has(s)) this.folded.delete(s);
        else this.folded.add(s);
        return;
      case "expand":
        this.folded.delete(s);
        return;
      case "collapse":
        this.folded.add(s);
        return;
      case "stage":
      case "unstage":
      case "discard":
        if (s === "conflicted" || s === "staged" || s === "unstaged" || s === "untracked")
          return sectionAction(this.app, s, action);
        return this.app.message("info", "a section's heading: s, u and d act on the files under it");
      case "merge":
        return this.app.message("info", "m merges the branch selected: select one in Branches");
    }
  }

  /** A file the branch changed: its diff against the base (in the diff window), or the file opened. */
  private aheadAction(row: AheadRow, action: string): void {
    const app = this.app;
    switch (action) {
      case "open":
      case "expand":
        if (row.rel === null) return app.message("warn", `${row.file.path} is outside this vault`);
        return app.git.showDiff(row.rel, backToPanel(app), `${row.rel} against ${row.base} — esc: source control`);
      case "go":
        if (row.rel === null) return app.message("warn", `${row.file.path} is outside this vault`);
        if (row.file.state === "deleted") return app.message("info", `${row.rel} is deleted on this branch`);
        app.openOrSwitchTab(row.rel);
        app.region = "content";
        return;
      case "menu":
        return this.menu(row);
    }
  }

  /** The commit button, or `ctrl+enter` in the box: the box's message committed; none typed, the editor opens. */
  commit(): void {
    const app = this.app;
    const c = app.git.checkout;
    if (!c) return app.message("info", "not in a git repository");
    if (!this.message.trim()) return app.git.openCommitEditor(false);
    if (!sections(app.git.entries ?? []).staged.length)
      return app.message(
        "info",
        `nothing staged — ${this.keyFor("stage") ?? "s"} stages a file, ${this.keyFor("stage_all") ?? "a"} everything`,
      );
    const text = this.message;
    app.message("info", "committing…");
    void commitLater(c, text, false).then((r) => {
      if ("why" in r) app.message("warn", `git: ${r.why}`);
      else {
        if (this.message === text) this.message = "";
        this.typing = false;
        app.message("info", `committed ${r.hash}: ${r.subject}`);
        void app.git.refreshNow().then(() => app.host.requestRender());
      }
      app.host.requestRender();
    });
  }

  /** A key while the message box has them: typed in it; ctrl+enter commits; enter, the editor for a longer message. */
  messageKey(key: string): void {
    const typed = keyChar(key);
    switch (key) {
      case "escape":
      case "ctrl+c":
      case "ctrl+g":
        this.typing = false;
        return;
      case "ctrl+enter":
        this.typing = false;
        return this.commit();
      case "enter":
        // A message with a body: the floating editor, which has the room, takes what's typed.
        this.typing = false;
        return this.app.git.openCommitEditor(false, this.message);
      case "backspace":
        this.message = [...this.message].slice(0, -1).join("");
        return;
      case "ctrl+w":
      case "ctrl+backspace":
        this.message = this.message.replace(/\S*\s*$/, "");
        return;
      case "ctrl+u":
        this.message = "";
        return;
      default:
        if (typed !== null) this.message += typed;
    }
  }

  /** A row's menu (`.`, a right click): what its keys do, and what only the menu does — reveal it, copy it, a note. */
  menu(row: PanelRow, at?: { x: number; y: number }): void {
    const app = this.app;
    if (
      row.kind === "branch" ||
      row.kind === "bline" ||
      row.kind === "bbuttons" ||
      row.kind === "bsub" ||
      row.kind === "bfile"
    )
      return this.branches.menu(row.branch, at);
    if (row.kind !== "file" && row.kind !== "change" && row.kind !== "ahead") return;
    const items: { label: string; action: string; run: () => void }[] = [];
    const add = (label: string, action: string, run: () => void) => items.push({ label, action, run });
    const rel = row.kind === "ahead" ? row.rel : relOf(app, row.entry.path);
    const path = row.kind === "ahead" ? row.file.path : row.entry.path;
    if (row.kind !== "ahead") {
      if (row.section === "staged") add("Unstage", "unstage", () => workAction(app, row, "unstage"));
      else add(row.kind === "change" ? "Stage this change" : "Stage", "stage", () => workAction(app, row, "stage"));
      if (row.section === "unstaged" || row.section === "untracked")
        add(row.kind === "change" ? "Revert this change…" : "Discard…", "discard", () =>
          workAction(app, row, "discard"),
        );
      add("Its diff", "open", () => workAction(app, row, "open"));
      add("Open it", "go", () => workAction(app, row, "go"));
    } else {
      add("Its diff", "open", () => this.aheadAction(row, "open"));
      add("Open it", "go", () => this.aheadAction(row, "go"));
    }
    if (rel !== null) {
      add("Show it in the explorer", "", () => {
        app.panels.switchLeftView("explorer");
        app.panels.showSidebar(true);
        app.explorer.reveal(rel, false, true);
        app.region = "sidebar";
      });
      const line = row.kind === "change" ? Math.max(1, row.change.from) : 1;
      add("A note for the agent…", "", () =>
        app.scratch.capture(
          formatEntry(
            { ref: { path: rel, startLine: line, endLine: line }, ask: true, cwd: app.loc.root },
            app.loc.root,
          ),
        ),
      );
    }
    add("Copy its path", "", () => void app.copy(rel ?? path));
    app.overlays.openList({
      title: sanitize(basename(path)),
      filterable: false,
      anchor: at,
      menu: true,
      items: items.map((it) => {
        const key = it.action ? this.keyFor(it.action) : null;
        return {
          label: it.label,
          hint: key ?? undefined,
          ...(key && [...key].length === 1 ? { hotkey: key } : {}),
          data: it,
        };
      }),
      accept: (item) => {
        app.region = "sidebar";
        (item.data as (typeof items)[number]).run();
      },
    });
  }
}
