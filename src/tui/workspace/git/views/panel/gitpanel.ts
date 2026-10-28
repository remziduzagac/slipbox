// The git panel (GIT-D8, GIT-D12): source control, the left panel's third view, worked by mouse as by keys, its keys
// shown. At its top, the repository and its branch, against its base and its upstream; a message box, typed in, where
// ctrl+enter commits; the buttons — commit, amend, pull, push, fetch, stash — each saying its key under the pointer.
// Under them its sections: the working tree's (gitview.ts), what this branch changed against its base, this file's
// diff, history and blame, the branches (gitbranchview.ts), the other repositories in the view (gitreposview.ts) — or,
// in a vault that isn't a repository, those repositories alone (VV-D10). Its keys (`[keys.git]`) act on the row
// selected, and its footer says them; `space g` opens it and focuses it (`git.view`).

import { basename } from "node:path";
import { headOf } from "../../../../../core/workspace/git/git.ts";
import { type Changed, inVault } from "../../../../../core/workspace/git/branches/gitops.ts";
import { changedLater } from "../../../../../core/workspace/git/branches/gitbranches.ts";
import { agoSaid, isRemoteTracking, remoteMovedAt } from "../../../../../core/workspace/git/gitbase.ts";
import { commitLater, sections } from "../../../../../core/workspace/git/staging/gitstage.ts";
import { formatEntry } from "../../../../../core/workspace/mutations/capture.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import { keyChar, spellKey } from "../../../../shell/input/keys.ts";
import { match } from "../../../../shell/overlays/match.ts";
import { BranchView } from "../branches/gitbranchview.ts";
import { type Drawing, REPO_ACTIONS, RepoView } from "../branches/gitreposview.ts";
import { Steady } from "../../gitsteady.ts";
import { backToPanel, relOf, sectionAction, workAction, workRows } from "./gitview.ts";
import { pointedAt } from "./gitmouse.ts";
import type { App } from "../../../../app/runtime/app.ts";
import type { AheadRow, HeadingRow, PanelButton, PanelRow, SectionId } from "../contracts.ts";
import { PanelPresentation } from "./presentation.ts";
export type { SectionId, HeadingRow, NoteRow, AheadRow, ThisFileRow, PanelRow, PanelButton } from "../contracts.ts";

/** The panel's own state: the message typed, the sections folded, what's asked of git for it. */
export class GitPanel {
  private readonly presentation: PanelPresentation;

  constructor(readonly app: App) {
    this.branches = new BranchView(app);
    this.repos = new RepoView(app);
    this.steady = new Steady(app);

    this.presentation = new PanelPresentation(this);
  }

  /** The branches (GIT-D9) and the repositories in the view (VV-D10): their state, what they ask of git. */
  readonly branches: BranchView;

  readonly repos: RepoView;

  /** Counted each time you act in the panel, by a key or a click: a branch made, selected once git lists it, isn't
   *  selected over a panel you've been using since (`BranchView.newWhere`). */
  touched = 0;

  /** The rows by what they are, as git answers (D261): the selection's, the pointer's, a click's. */
  readonly steady: Steady;

  /** The message box's text (GIT-D8), and whether keys go to it. */
  message = "";

  typing = false;

  /** A commit of the box's message under way: another waits for git's answer. */
  committing = false;

  /** The sections folded, by id: the merged and older branches, the other repositories, home's, to begin with. */
  readonly folded = new Set<SectionId>(["older", "repos", "home"]);

  /** What this branch changed against its base (GIT-D8), asked of git in the background, by the question asked. */
  private ahead: { key: string; base: string; files: Changed[] | null } | null = null;

  /** The panel opened, or the focus back on it: git asked again about what it shows (VV-D10). */
  shown(): void {
    this.repos.again();
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

  /**
   * The rows a frame draws: the repositories sorted again by what needs attention, unless the pointer holds the
   * panel's rows (`Steady.begin`, D261); the selection kept on its row as they move (`Steady.follow`).
   */
  drawnRows(): PanelRow[] {
    const holds = this.steady.begin(() => this.rows());
    const rows = this.rows(holds ? "hold" : "sort");
    this.repos.drawn();
    this.steady.follow(rows);
    return rows;
  }

  /**
   * The selection put in a place, not on a row (the first row, the filter's first match): it stays at that place as
   * rows move, until a key moves it, a key acts on its row, or a click picks one.
   */
  place(i: number, rows = this.rows()): void {
    this.steady.place(i, rows);
  }

  /** Row `i` of `rows` picked by the user (a key, a click): selected, and kept on as rows move; `move`, by a key. */
  select(i: number, rows = this.rows(), move = false): void {
    this.steady.select(i, rows, move);
  }

  /** The first row `which` says, picked as `select` does (a row folded, made, followed to where it went); none, none. */
  selectWhere(which: (r: PanelRow) => boolean): void {
    const rows = this.rows();
    const i = rows.findIndex(which);
    if (i >= 0) this.select(i, rows);
  }

  /** Where the selection is in `rows` between frames: the row drawn selected, wherever it is now (`Steady.selected`). */
  selectedIn(rows: PanelRow[]): number {
    const i = this.steady.selected(rows);
    return i < 0 ? this.app.sidebar.selected : i;
  }

  /**
   * The panel's rows: its sections, each under its heading unless folded; the filter keeps the rows it matches. The
   * repositories in the order last drawn; `drawing` for a frame being drawn (`drawnRows`).
   */
  rows(drawing: Drawing = null): PanelRow[] {
    const app = this.app;
    const c = app.git.checkout;
    // Not a repository (home, a vault without git, Elsewhere): the repositories in the view are the panel (VV-D10).
    if (!c) return this.repos.rows("all", drawing);
    if (app.git.entries === null) return [{ kind: "note", text: "asking git…" }];
    const q = this.filter();
    const rows: PanelRow[] = [];
    const work = workRows(app);
    rows.push(...work);
    if (!work.length && !q) rows.push({ kind: "note", text: "nothing uncommitted" });
    rows.push(
      ...this.aheadRows(q),
      ...this.fileRows(q),
      ...this.branches.rows(),
      ...this.repos.rows("others", drawing),
    );
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
      {
        kind: "heading",
        section: "ahead",
        label: `This branch against ${sanitize(a.base)} (${files.length})${this.fetched(a.base)}`,
      },
    ];
    if (this.folded.has("ahead") && !q) return rows;
    for (const file of files)
      rows.push({ kind: "ahead", file, rel: inVault(c, this.app.loc.root, file.path), base: a.base });
    return rows;
  }

  private remoteMemo: { key: string; remote: boolean } | null = null;

  /**
   * A remote-tracking base's freshness (D255): `origin/dev` is as the last fetch of its remote left it, so the heading
   * says when it last moved here; nothing for a local base. Whether it's remote is asked once each time git has news.
   */
  private fetched(base: string): string {
    const c = this.app.git.checkout!;
    const key = `${this.app.git.generation}\0${c.common}\0${base}`;
    if (this.remoteMemo?.key !== key) this.remoteMemo = { key, remote: isRemoteTracking(c, base) };
    if (!this.remoteMemo.remote) return "";
    const at = remoteMovedAt(c, base);
    return at === null ? " · as of the last fetch" : ` · updated ${agoSaid(at)}`;
  }

  /** "This file": its diff against the base, its history, who changed the cursor's line — the note on screen's. */
  private fileRows(q: string): PanelRow[] {
    const v = this.app.tabView;
    const c = this.app.git.checkout!;
    const rel = v?.buf.rel;
    if (!v || !rel || q || v.buf.virtual || !v.buf.abs || !v.buf.abs.startsWith(`${c.root}/`)) return [];
    const rows: PanelRow[] = [{ kind: "heading", section: "file", label: `This file: ${sanitize(basename(rel))}` }];
    if (this.folded.has("file")) return rows;
    const base = this.app.git.baseOf(c, headOf(c).branch) ?? this.app.git.fallbackBase(c);
    rows.push(
      { kind: "thisfile", command: "git.diff", label: `Its diff against ${sanitize(base ?? "the base")}` },
      { kind: "thisfile", command: "git.history", label: "Its history" },
      { kind: "thisfile", command: "git.blame", label: "Who changed this line" },
    );
    return rows;
  }

  /** Where the branch stands against its base, as the panel's top says it: `↑5 on main`; null for the base itself. */
  standing(): { ahead: number; behind: number; base: string } | null {
    return this.presentation.standing();
  }

  /** The buttons at the panel's top (GIT-D8), as the repository stands: commit with what's staged, the remote's; the
   *  review while a change isn't staged, the merge screen while a file's in conflict; while a merge or a rebase is
   * under  way, continue, skip (a rebase's) and abort. */
  buttons(): PanelButton[] {
    return this.presentation.buttons();
  }

  /** A key's shortest name for one of the panel's actions, as its footer and its buttons say it; null when none is bound. */
  keyFor(action: string): string | null {
    const keys = this.app.gitKeys.keysFor(action);
    const key = [...keys].sort((a, b) => a.length - b.length)[0];
    return key ? spellKey(key) : null;
  }

  /**
   * The panel's filter: the left panel's while the panel is in it, else the one it comes back to — so a git answer
   * followed while the explorer's shown finds its row among the panel's own rows, not under the explorer's filter.
   */
  filter(): string {
    const app = this.app;
    return (app.leftView === "git" ? app.sidebar.filter : app.panels.leftPositions.get("git")?.filter) ?? "";
  }

  /** What the pointer is on, when it's a button or a row's own: its key and what it does, for the footer. */
  pointedAt(hover: string | null): { key: string | null; desc: string } | null {
    return pointedAt(this.app, hover);
  }

  /** The footer's keys for a row (GIT-D12): what its keys do to it, the commonest first. */
  footer(row: PanelRow | undefined): [string, string][] {
    return this.presentation.footer(row);
  }

  /** The rows' actions, run by the panel's keys (`[keys.git]`): moving, folding, the row's own, the panel's. */
  action(action: string): void | Promise<void> {
    const app = this.app;
    this.touched++;
    const s = app.sidebar;
    const rows = this.rows();
    // The row the last frame drew selected, wherever it is now; gone since, nothing to act on. Only a key that moves
    // from it, or acts on it, sets the selection: the panel's own keys leave it, its pick too, as it is.
    const at = this.steady.selected(rows);
    const from = at < 0 ? s.selected : at;
    const ok = (i: number) => !!rows[i] && rows[i]!.kind !== "note";
    const step = (from: number, by: number) => {
      for (let i = from + by; i >= 0 && i < rows.length; i += by) if (ok(i)) return i;
      return from;
    };
    switch (action) {
      case "down":
        return this.select(step(from, 1), rows, true);
      case "up":
        return this.select(step(from, -1), rows, true);
      case "top":
        return this.select(step(-1, 1), rows, true);
      case "bottom":
        return this.select(step(rows.length, -1), rows, true);
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
    const row = at < 0 ? undefined : rows[at];
    // The repositories' rows answer their own keys wherever they are (a row acted on is the user's pick); the panel's
    // keys (the message, commit, fetch…) are the panel's on them too.
    const repoRow = row?.kind === "repo" || row?.kind === "rcheckout" || row?.kind === "rfile";
    if (repoRow && REPO_ACTIONS.has(action)) {
      this.select(at, rows);
      return this.repos.action(row, action);
    }
    // A new branch from the branch selected: from one gone since it was drawn, none — not one from HEAD, nor from what
    // came to its place. Any other row gone, `n` starts one from HEAD; `resolve`, as its button, opens the merge screen
    // on this note when it's in conflict, else the first file in conflict.
    if (at < 0 && action === "new_branch" && this.steady.sought()?.startsWith("branch\0")) return;
    const c = app.git.checkout;
    // Outside a repository, the panel's headings (Other repositories, More in home) fold and unfold all the same.
    if (!c && row?.kind === "heading" && (action === "open" || action === "expand" || action === "collapse")) {
      this.select(at, rows);
      return this.headingAction(row, action);
    }
    // A row gone since it was drawn: nothing to say about it.
    if (!c) return at < 0 ? undefined : app.message("info", "not in a git repository: o goes into one of those listed");
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
      // The review (GIT-D3): every change not staged, a hunk at a time.
      case "review":
        return void app.run("git.review");
      // The merge screen (GIT-D5): the file in conflict selected, else this note when it's in conflict, else the first.
      case "resolve": {
        const rel = row?.kind === "file" && row.section === "conflicted" ? relOf(app, row.entry.path) : null;
        // Read from git's stages: the key's turn waits for the screen, as the keys after it expect.
        return app.run(rel === null ? "git.merge_screen" : `git.merge_screen ${rel}`);
      }
      // Rebasing onto the base (GIT-D6), or what's under way carried on, skipped or given up.
      case "rebase":
        return void app.run("git.rebase");
      case "continue":
        return void app.run("git.continue");
      case "skip":
        return void app.run("git.skip");
      case "abort":
        return void app.run("git.abort");
      case "stage_all":
        return sectionAction(app, "all", "stage");
      case "unstage_all":
        return sectionAction(app, "staged", "unstage");
      case "new_branch":
        return this.branches.newBranch(row?.kind === "branch" ? row.branch.name : undefined);
    }
    if (!row || row.kind === "note" || repoRow) return;
    // The panel's own keys are above: what's left acts on the row, the user's pick from now on.
    this.select(at, rows);
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
  private aheadAction(row: AheadRow, action: string): void | Promise<void> {
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
    // One at a time: another ctrl+enter before git answers would commit twice, or fail on git's lock.
    if (this.committing) return app.message("info", "committing already — git hasn't answered yet");
    if (!this.message.trim()) return app.git.openCommitEditor(false);
    if (!sections(app.git.entries ?? []).staged.length)
      return app.message(
        "info",
        `nothing staged — ${this.keyFor("stage") ?? "s"} stages a file, ${this.keyFor("stage_all") ?? "a"} everything`,
      );
    this.committing = true;
    const text = this.message;
    app.message("info", "committing…");
    // As typed: a line starting with `#` is the message's own (`#12 fixed`), not a guide's.
    void commitLater(c, text, false, null).then((r) => {
      if ("why" in r) app.message("warn", `git: ${r.why}`);
      else {
        if (this.message === text) this.message = "";
        this.typing = false;
        app.message("info", `committed ${r.hash}: ${r.subject}`);
        void app.git.refreshNow().then(() => app.host.requestRender());
      }
      this.committing = false;
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
    if (row.kind === "repo" || row.kind === "rcheckout" || row.kind === "rfile") return this.repos.menu(row, at);
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
