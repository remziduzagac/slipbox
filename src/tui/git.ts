// Source control in the TUI (5.9–5.14, 26.x): the checkout the vault is in, each file's state as git sees it,
// asked in the background; the changes, the diffs, branches, worktrees and merges; committing.

import { beginGitRead } from "./gitquery.ts";
import { existsSync } from "node:fs";
import { basename, join, posix, relative, sep } from "node:path";
import { readText } from "../core/foundation/platform/fsutil.ts";
import { baseFor, baseForLater } from "../core/workspace/git/gitbase.ts";
import { startInsert } from "./editing.ts";
import { fence, fenceLanguage } from "../core/workspace/mutations/capture.ts";
import { loadSession, TOP } from "../core/workspace/session/position.ts";
import type { Role } from "../core/theme/index.ts";
import { type Checkout, checkoutOf, headOf } from "../core/workspace/git/git.ts";
import {
  baseBranch,
  baseBranchLater,
  gitReadLater,
  branchesOf,
  changedSinceLater,
  type GitState,
  inCheckout,
  inVault,
  showLater,
  stateOf,
  worktreeList,
} from "../core/workspace/git/branches/gitops.ts";
import {
  commentFor,
  commitLater,
  createBranch,
  type GitDone,
  lastMessage,
  sections,
  type StatusEntry,
  statusLater,
} from "../core/workspace/git/staging/gitstage.ts";
import { switchLater } from "../core/workspace/git/branches/gitbranches.ts";
import type { Track } from "../core/workspace/git/branches/gitremote.ts";
import { type GitChange, gitChanges } from "../core/workspace/git/gitsigns.ts";
import {
  describeBreak,
  type MergeBreak,
  type MergeReview,
  reviewMerge,
} from "../core/workspace/git/review/mergereview.ts";
import { openDiff } from "./diffview.ts";
import { checkoutAt, isInside, isVaultRoot, rootAt, rootMarkers } from "../core/workspace/vaults/vault.ts";
import { isTrusted } from "../core/workspace/vaults/trust.ts";
import type { Head } from "../core/workspace/vaults/vault-feed.ts";
import { sanitize } from "../core/foundation/text/sanitize.ts";
import { NoteBuffer } from "./buffer.ts";
import type { App, View, Region } from "./app.ts";

/** Source control: git's view of the files, its diffs, branches and commits. */
export class Git {
  constructor(readonly app: App) {}

  private checkoutMemo: { root: string; c: Checkout | null; at: number } | null = null;

  /** The git checkout the vault is in (17.19): the main one or a worktree. Read once per vault —
   *  none, again after a second (`git init` may make one). */
  get checkout(): Checkout | null {
    const m = this.checkoutMemo;
    if (m?.root !== this.app.loc.root || (!m.c && this.app.now() - m.at > 1000))
      this.checkoutMemo = {
        root: this.app.loc.root,
        c: checkoutAt(this.app.loc),
        at: this.app.now(),
      };
    return this.checkoutMemo!.c;
  }

  /** HEAD as last seen: its branch, or (detached) its commit. */
  get head(): Head | null {
    return this.app.feed.head;
  }

  /** git is mid-commit (or mid-anything) in the vault's checkout (5.10). Looked up afresh when none
   *  is known — a repository can appear, and a loose folder's is checked too: it runs only when an
   *  autosave is due or the watcher has news. */
  indexLocked(): boolean {
    const c = this.checkout ?? checkoutOf(this.app.loc.root);
    return !!c && existsSync(join(c.gitDir, "index.lock"));
  }

  /** HEAD looked at (the poll, each batch): when it moved, said so, and the branch's tabs back.
   *  True when it moved. Not while git still writes: then it hasn't finished moving. */
  checkHead(): boolean {
    return this.app.feed.checkHead();
  }

  // What git knows of the files (5.11–5.14): each one's state for the explorer's marks and the
  // Problems' conflicts — asked of git in the background, a moment after anything changed — and,
  // on request, what this branch changed against the base, a note's diff, the worktrees.

  /** Each changed file's state, by vault path; null until git has answered (or with no git). */
  states: Map<string, GitState> | null = null;
  /** A folder's: the strongest of what's in it. */
  folders = new Map<string, GitState>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private asking: Promise<void> | null = null;
  /** The question asked again once the one out is answered: what changed since it was asked is in its answer. */
  private again: Promise<void> | null = null;

  /** Ask git again, a moment from now (many changes, one question). */
  refresh(): void {
    if (this.timer || !this.app.live) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refreshNow().then(() => this.app.host.requestRender());
    }, 250);
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Ask git now: each file's state, by vault path, and each folder's. */
  refreshNow(): Promise<void> {
    // A question already out was asked before whatever changed now (a stage, a commit): its answer may not have it,
    // so git is asked again once it's in — once, for every call meanwhile.
    if (this.asking) {
      this.again ??= this.asking
        .catch(() => undefined)
        .then(() => {
          this.again = null;
          return this.refreshNow();
        });
      return this.again;
    }
    const c = this.checkout;
    const root = this.app.loc.root;
    if (!c) {
      this.states = null;
      this.track = null;
      this.folders.clear();
      // News all the same: the git panel's repositories in the view are asked again (VV-D10).
      this.generation++;
      return Promise.resolve();
    }
    this.asking = statusLater(c)
      .then((answer) => {
        if (this.app.loc.root !== root) return;
        const entries = answer?.entries ?? null;
        // Each file's two letters for the source control view (26.2); one state each for the explorer's marks.
        this.entries = entries;
        // The branch against its upstream, as of the last fetch (26.6): the ↑ and ↓ after it where you are (where.ts).
        this.track = answer?.track ?? null;
        const status = entries && new Map(entries.map((e) => [e.path, stateOf(e.x + e.y)] as const));
        const states = new Map<string, GitState>();
        const folders = new Map<string, GitState>();
        for (const [path, st] of status ?? []) {
          const rel = inVault(c, root, path);
          if (rel === null || st === "deleted") continue;
          states.set(rel, st);
          for (let d = posix.dirname(rel); d !== "."; d = posix.dirname(d)) {
            const had = folders.get(d);
            if (!had || GIT_RANK[st] > GIT_RANK[had]) folders.set(d, st);
          }
        }
        this.states = status ? states : null;
        this.folders = folders;
        this.app.explorer.invalidateTree();
        // What's staged may have changed with it: the gutter's asked again (26.1), and the view's texts (26.2).
        this.generation++;
      })
      .finally(() => {
        this.asking = null;
      });
    return this.asking;
  }

  /** Each open file's text as staged (26.1), by buffer: asked of git in the background, again when git has news. Null:
   *  a file git hasn't (untracked: every line added); "none": nothing to compare (ignored, outside the checkout). */
  private readonly staged = new WeakMap<NoteBuffer, { text: string | null | "none"; generation: number }>();
  private readonly stagedAsking = new WeakSet<NoteBuffer>();
  /** Bumped each time git has answered: what's staged read again. */
  generation = 0;
  /** The checkout's changed files, each with its two letters (26.2); null until git has answered, or with no git. */
  entries: StatusEntry[] | null = null;
  /** Where the branch stands against its upstream (26.6), as git last said; null until it has, or with no git. */
  track: Track | null = null;
  /** The source control view's files opened up into their changes, `section:path`. */
  readonly opened = new Set<string>();
  private readonly changeMemo = new WeakMap<
    NoteBuffer,
    { version: number; generation: number; changes: GitChange[] }
  >();

  /**
   * A file's changes against what's staged (26.1) — its text as it is now, unsaved typing included — or null where there's
   * nothing to compare: signs off, no checkout, a file outside the root, git not answered yet (it's asked now).
   */
  changesOf(view: View): GitChange[] | null {
    const buf = view.buf;
    const c = this.checkout;
    // By its path, not the graph's name for it: a file just made is git's before the walk's.
    if (
      !this.app.config.git.signs ||
      !c ||
      buf.virtual ||
      !buf.abs ||
      !isInside(c.root, buf.abs) ||
      !isInside(this.app.loc.root, buf.abs)
    )
      return null;
    const known = this.staged.get(buf);
    if (known?.generation !== this.generation && !this.stagedAsking.has(buf)) {
      this.stagedAsking.add(buf);
      const generation = this.generation;
      const rel = relative(this.app.loc.root, buf.abs).split(sep).join("/");
      void showLater(c, "", relative(c.root, buf.abs)).then((text) => {
        this.stagedAsking.delete(buf);
        // Not staged: a file git doesn't have is all new; one it ignores, or can't show, has no signs.
        const untracked = text === null && this.states?.get(rel) === "new";
        this.staged.set(buf, { text: text ?? (untracked ? null : "none"), generation });
        this.app.host.requestRender();
      });
    }
    if (!known || known.text === "none") return null;
    const memo = this.changeMemo.get(buf);
    if (memo && memo.version === buf.version && memo.generation === known.generation) return memo.changes;
    const changes = gitChanges(known.text, buf.source);
    this.changeMemo.set(buf, { version: buf.version, generation: known.generation, changes });
    return changes;
  }

  private baseMemo: { key: string; base: string | null } | null = null;

  /**
   * A branch's own base (GIT-D10): kept when slipbox made it, else the nearest of `[git] bases`, else `[git] base`, main
   * or master; null for the base itself, or with none. Asked of git once each time it has news.
   */
  baseOf(c: Checkout, branch: string | null): string | null {
    if (!branch) return this.fallbackBase(c);
    const key = `${this.generation}\0${c.root}\0${branch}`;
    if (this.baseMemo?.key !== key)
      this.baseMemo = { key, base: baseFor(c, branch, this.app.config.git)?.base ?? null };
    return this.baseMemo.base;
  }

  private fallbackMemo: { key: string; base: string | null } | null = null;

  /**
   * `[git] base`, else main or master, as there are (`baseBranch`): asked of git once each time it has news, not on
   * every frame that draws it.
   */
  fallbackBase(c: Checkout): string | null {
    const key = `${this.generation}\0${c.root}\0${this.app.config.git.base}`;
    if (this.fallbackMemo?.key !== key) this.fallbackMemo = { key, base: baseBranch(c, this.app.config.git.base) };
    return this.fallbackMemo.base;
  }

  /** The base asked again (one kept or dropped: "Compare against…"). */
  forgetBase(): void {
    this.baseMemo = null;
    this.fallbackMemo = null;
  }

  /**
   * The base branch here, not waiting on git: this branch's own (GIT-D10); on a detached HEAD, or where it has none, the
   * fallback (`[git] base`, else main or master). Null when the read is no longer wanted, or there's none: then said.
   */
  private async baseLater(c: Checkout, query: { signal: AbortSignal; current: () => boolean }): Promise<string | null> {
    const branch = headOf(c).branch;
    const config = this.app.config.git;
    const base =
      (branch ? (await baseForLater(c, branch, config, query.signal))?.base : null) ??
      (await baseBranchLater(c, config.base, query.signal));
    if (!query.current()) return null;
    if (!base)
      this.app.message(
        "warn",
        config.base
          ? `no branch or commit "${config.base}" ([git] base)`
          : "no base branch: neither main nor master is there — [git] base sets one",
      );
    return base;
  }

  /** `space g c` (5.13): what this branch changed against the base, committed or not; enter: its diff. */
  async openChanges(): Promise<void> {
    const c = this.checkout;
    if (!c) return this.app.message("info", "not in a git repository");
    const query = beginGitRead(this.app, "Reading branch changes");
    const base = await this.baseLater(c, query);
    if (!base) return;
    const r = await changedSinceLater(c, base, query.signal);
    if (!query.current()) return;
    if (!r) return this.app.message("warn", "git couldn't say what changed");
    const files = r.files
      .map((f) => ({ ...f, rel: inVault(c, this.app.loc.root, f.path) }))
      .filter((f) => f.rel !== null);
    if (!files.length) return this.app.message("info", `nothing changed against ${base}`);
    const letter: Record<GitState, string> = { new: "+", modified: "M", renamed: "R", deleted: "D", conflict: "!" };
    const role: Record<GitState, Role> = {
      new: "git_new",
      modified: "git_modified",
      renamed: "git_modified",
      deleted: "diff_del",
      conflict: "git_conflict",
    };
    this.app.overlays.openList({
      title: `Changed against ${base} (${files.length}) — enter: the diff`,
      items: files.map((f) => ({
        label: `${letter[f.state]} ${f.rel}`,
        role: role[f.state],
        detail: f.from ? `from ${inVault(c, this.app.loc.root, f.from) ?? f.from}` : undefined,
        data: f,
      })),
      accept: (item) => {
        const f = item.data as { rel: string; path: string; state: GitState };
        return this.showDiff(f.rel, () => this.openChanges());
      },
    });
  }

  /** `space g d` (5.13): this note's changes on the branch — against where it left the base. */
  openDiff(): void | Promise<void> {
    const rel = this.app.view?.buf.rel;
    if (!rel) return this.app.message("info", "diff: open a note first");
    return this.showDiff(rel);
  }

  /** A file's diff against the merge base, a row a line, coloured; enter goes to the line; esc: `back`, titled so. */
  async showDiff(rel: string, back?: () => void | Promise<void>, title?: string): Promise<void> {
    const c = this.checkout;
    if (!c) return this.app.message("info", "not in a git repository");
    const query = beginGitRead(this.app, "Reading diff version");
    const base = await this.baseLater(c, query);
    if (!base) return;
    const mergeBase = (
      await gitReadLater(c, ["merge-base", "--end-of-options", base, "HEAD"], false, query.signal)
    )?.trim();
    if (!query.current()) return;
    if (!mergeBase) return this.app.message("warn", `this branch and ${base} have no commit in common`);
    const before = (await showLater(c, mergeBase, inCheckout(c, this.app.loc.root, rel), query.signal)) ?? "";
    if (!query.current()) return;
    // The file as it is, or would be written: with its byte order mark, as git has it.
    let now = "";
    const open = this.app.buffers.get(rel);
    try {
      if (open) now = open.contentToSave();
      else {
        const read = readText(join(this.app.loc.root, rel));
        now = (read.bom ? "\uFEFF" : "") + read.text;
      }
    } catch {}
    this.showLineDiff(
      before,
      now,
      rel,
      title ?? `${rel} against ${base}${back ? " — esc: the changes" : ""}`,
      `no differences from ${base}`,
      back,
    );
    this.app.host.requestRender();
  }

  /** A diff, `before` to `now`, in the diff window (GIT-D2); enter goes to the line in `rel`; esc: `back`. */
  showLineDiff(
    before: string,
    now: string,
    rel: string,
    title: string,
    none = "no differences",
    back?: () => void | Promise<void>,
  ): void {
    openDiff(this.app, {
      before,
      now,
      path: rel,
      title,
      none,
      back,
      go: (line) => {
        if (existsSync(join(this.app.loc.root, rel))) this.app.openAt(rel, line);
      },
    });
  }

  /** A file as it was (26.4, 22.1), read-only in the floating window: a note rendered, any other file as its text. */
  showVersion(text: string, path: string, title: string): void {
    const note = /\.(md|markdown)$/i.test(path);
    this.app.overlays.openHover(note ? text : fence(text, fenceLanguage(path)), title);
  }

  /**
   * The branches (26.5; `:Branches`, the branch where you are clicked): this one marked; one picked is checked out —
   * unsaved notes saved, or kept as they are, first — and "a new branch from here…" makes one there. git's refusal (a
   * change it would overwrite) is said in its words; a switch done is one event, each branch keeping its tabs (5.9).
   * `first`: entries before the branches (the remote's, from where you are, GIT-D8).
   */
  openBranches(first: { label: string; run: () => void }[] = []): void {
    const c = this.checkout;
    if (!c) return this.app.message("info", "not a git checkout");
    const branches = branchesOf(c);
    if (!branches) return this.app.message("warn", "git couldn't list the branches");
    const current = headOf(c).branch;
    const NEW = Symbol("new");
    this.app.overlays.openList({
      title: `Branches (${branches.length}) — enter: check one out`,
      items: [
        ...first.map((f) => ({ label: f.label, data: f })),
        ...branches.map((b) => ({ label: sanitize(b), detail: b === current ? "here" : "", data: b })),
        {
          label: "A new branch from here…",
          detail: current ? `from ${sanitize(current)}` : "from this commit",
          data: NEW,
        },
      ],
      selected: first.length ? 0 : Math.max(0, branches.indexOf(current ?? "")),
      accept: (item) => {
        const extra = first.find((f) => f === item.data);
        if (extra) return extra.run();
        if (item.data === NEW) {
          return this.app.overlays.prompt("new branch: ", (name) => {
            // Made where HEAD is: no file changes, so it's waited for.
            if (name.trim()) this.beforeCheckout(() => this.checkedOut(createBranch(c, name.trim())));
          });
        }
        const name = item.data as string;
        if (name === current) return this.app.message("info", `already on ${name}`);
        this.beforeCheckout(() => {
          this.app.message("info", `checking out ${name}…`);
          void switchLater(c.root, name).then((why) => this.checkedOut(why));
        });
      },
    });
  }

  /**
   * Unsaved notes before git changes the files under them — a checkout, a pull, a stash (26.5, 26.6): saved, or kept as
   * they are — asked; none, at once. `act` names what git does: its verb, as a noun, done.
   */
  beforeCheckout(go: () => void, act = { verb: "switch", noun: "the switch", done: "switched" }): void {
    const dirty = this.app.dirtyBuffers();
    if (!dirty.length) return go();
    const names = dirty.map((b) => this.app.displayName(b)).join(", ");
    this.app.overlays.openList({
      title: `Unsaved: ${names}`,
      items: [
        { label: `Save them, then ${act.verb}`, data: "save" },
        {
          label: `${act.verb[0]!.toUpperCase()}${act.verb.slice(1)}, keeping them unsaved`,
          detail: `their text as typed; a file ${act.noun} changes, a conflict to settle on saving`,
          data: "keep",
        },
        { label: "Cancel", data: "cancel" },
      ],
      accept: (item) => {
        if (item.data === "cancel") return;
        if (item.data === "save" && !dirty.every((b) => this.app.saving.save(b, true)))
          return this.app.message("warn", `not every note saved — nothing ${act.done}`);
        go();
      },
    });
  }

  /**
   * A checkout done — the switch handled as one event (5.9) — or git's refusal said. Refused or not, HEAD may have
   * moved (a hook refusing once it's switched, a checkout stopped partway): read again, and the files with it.
   */
  private checkedOut(why: GitDone): void {
    if (why) this.app.message("warn", `git: ${why}`);
    this.checkHead();
    void this.refreshNow().then(() => this.app.host.requestRender());
  }

  /** `space g w` (5.14): the repository's checkouts by branch; enter goes into one, at this note. */
  openWorktrees(): void {
    const c = this.checkout;
    if (!c) return this.app.message("info", "not in a git repository");
    const list = worktreeList(c);
    if (!list?.length) return this.app.message("warn", "git couldn't list the worktrees");
    const here = relative(c.root, this.app.loc.root);
    const note = this.app.view?.buf.rel ?? null;
    this.app.overlays.openList({
      title: `Worktrees (${list.length}) — enter: this note there`,
      items: list.map((w) => ({
        label: `${w.path === c.root ? "● " : "  "}${this.app.glyphs.branch} ${w.branch ?? `(${w.head?.slice(0, 7) ?? "detached"})`}`,
        detail: `${w.path}${w.main ? "  (main)" : ""}`,
        data: w,
      })),
      accept: (item) => {
        const w = item.data as { path: string };
        if (w.path === c.root) return;
        const vault = join(w.path, here);
        if (!isVaultRoot(vault))
          return this.app.message(
            "warn",
            `${vault} isn't a vault on that branch (none of ${rootMarkers().join(", ")} in it)`,
          );
        const there = note && existsSync(join(vault, note)) ? join(vault, note) : null;
        const v = this.app.view;
        this.app.vaults.switchVault(rootAt(vault), there, there && v ? { ...v.topAnchor } : undefined);
        if (note && !there) this.app.message("info", `${note} isn't on that branch: its vault opened instead`);
      },
    });
  }

  /**
   * `:merge-review` (20.21): before a merge, the links it would break — git's tentative result, the working tree
   * untouched. A branch picked: this branch into its base — its own (GIT-D10), else `[git] base`, main or master, as
   * the git panel's Merge… and a rebase take it — or another branch into this one.
   */
  openMergeReview(): void {
    const c = this.checkout;
    if (!c) return this.app.message("info", "not in a git repository");
    const here = headOf(c).branch;
    if (!here) return this.app.message("info", "merge review: HEAD is detached — check out the branch to merge into");
    const base = this.baseOf(c, here) ?? this.fallbackBase(c);
    const others = (branchesOf(c) ?? []).filter((b) => b !== here);
    const choices = [
      ...(base && base !== here ? [{ from: here, into: base }] : []),
      ...others.map((b) => ({ from: b, into: here })),
    ];
    if (!choices.length) return this.app.message("info", "merge review: no other branch to merge");
    this.app.overlays.openList({
      title: "Review a merge — enter: the links it would break",
      items: choices.map((m) => ({
        label: `${this.app.glyphs.branch} ${m.from} → ${m.into}`,
        detail: m.into === here ? "into this branch" : "this branch into the base",
        data: m,
      })),
      accept: (item) => this.showMergeReview(item.data as { from: string; into: string }),
    });
  }

  /** The links merging `from` into `into` would break, each with its cause; enter goes to one; esc: the branches. */
  showMergeReview(m: { from: string; into: string }): void {
    const c = this.checkout;
    if (!c) return;
    let r: MergeReview;
    try {
      r = reviewMerge(c, this.app.loc.root, m.from, m.into);
    } catch (err) {
      return this.app.message("warn", `merge review: ${(err as Error).message}`);
    }
    const conflicts = r.conflicts.length
      ? ` — git can't merge ${r.conflicts.length} file${r.conflicts.length === 1 ? "" : "s"}`
      : "";
    if (!r.breaks.length)
      return this.app.message("info", `merging ${r.from} into ${r.into} breaks no link${conflicts}`);
    this.app.overlays.openList({
      title: `Merging ${r.from} into ${r.into}: ${r.breaks.length} link${r.breaks.length === 1 ? "" : "s"} would break${conflicts} — esc: the branches`,
      items: r.breaks.map((b) => ({
        label: `${b.path}:${b.line}  ${sanitize(b.target)}`,
        role: b.fix ? "git_modified" : "diff_del",
        detail: sanitize(describeBreak(b)),
        data: b,
      })),
      accept: (item) => {
        const b = item.data as MergeBreak;
        if (!existsSync(join(this.app.loc.root, b.path)))
          return this.app.message("info", `${b.path} isn't here yet: it comes with ${r.from}`);
        this.app.openAt(b.path, b.line, b.column);
      },
      cancel: () => this.openMergeReview(),
    });
  }

  headMoved(
    was: { branch: string | null; commit: string | null },
    now: { branch: string | null; commit: string | null },
    moves: [string, string][] = [],
  ): void {
    const name = (h: typeof now) =>
      h.branch ? `branch ${h.branch}` : `a detached HEAD (${h.commit?.slice(0, 7) ?? "?"})`;
    // HEAD moved on its branch — a merge, a pull, a commit — is no switch (20.21): git's renames since
    // (`moves`, taken as evidence) let a link broken by one say where its file went.
    if (was.branch && was.branch === now.branch) {
      const n = moves.length;
      if (n)
        this.app.message(
          "info",
          `${name(now)} moved on: git moved ${n} file${n === 1 ? "" : "s"} — links to ${n === 1 ? "it" : "them"} say where (space v p); space l r relinks a note's`,
        );
      return;
    }
    // The branch left keeps its tabs; the one switched to has its own back — when it has some, and
    // nothing open is unsaved (closing it would lose that).
    if (this.app.config.ui.restore_session) {
      this.app.session.save(was.branch);
      const theirs = now.branch ? loadSession(this.app.loc)?.branches?.[now.branch] : undefined;
      if (theirs?.tabs.length) {
        if (this.app.dirtyBuffers().length)
          return this.app.message(
            "info",
            `switched to ${name(now)} — unsaved notes stay open, so its tabs aren't brought back`,
          );
        this.app.overlay = null;
        this.app.tabs = [];
        this.app.session.openTabs(theirs.tabs, theirs.activeTab);
        if (!this.app.tabs.length) this.app.session.restore();
        return this.app.message("info", `switched to ${name(now)}: its tabs are back`);
      }
    }
    this.app.message("info", `switched to ${name(now)}`);
  }

  /** A file's text as staged, as git last said it (26.1): null for a file git hasn't; undefined while it hasn't said. */
  stagedText(buf: NoteBuffer): string | null | undefined {
    const known = this.staged.get(buf);
    return !known || known.text === "none" ? undefined : known.text;
  }

  /** The repository's name, as the git panel heads it: the vault's name, else the checkout's folder's (a worktree's main's). */
  repoName(): string {
    const c = this.checkout;
    const named = this.app.loc.mode === "vault" ? this.app.loc.name : null;
    return named ?? basename(c?.main ?? c?.root ?? this.app.loc.root);
  }

  /** The branch checked out (a detached HEAD: its commit, short), or null outside git. */
  branch(): string | null {
    const c = this.checkout;
    if (!c) return null;
    const h = headOf(c);
    return h.branch ?? (h.commit ? h.commit.slice(0, 7) : null);
  }

  /**
   * A commit (26.3): its message in the floating editor — `ctrl+s` (`:w`) commits what's staged, or amends the last
   * commit with it; closing it (`esc`, `q`) leaves it. Its `#` lines say what's staged and are left out (`;` lines, or
   * another of git's marks, when a line of the message to start from begins with `#`: `commentFor`). In a root not
   * trusted, said: its hooks don't run, and it isn't signed. `typed`: the git panel's message box's text (GIT-D8), the
   * message to start from — the box emptied once it's committed.
   */
  openCommitEditor(amend: boolean, typed = ""): void {
    const c = this.checkout;
    if (!c) return this.app.message("info", "not a git checkout");
    if (this.app.floating && !this.app.overlays.closeFloating()) return;
    const staged = sections(this.entries ?? []).staged.map((e) => e.path);
    if (!amend && !staged.length)
      return this.app.message("info", "nothing staged — s stages a file in the git panel (space g)");
    const last = amend ? (typed.trim() ? typed.replace(/\s+$/, "") : lastMessage(c)) : typed.replace(/\s+$/, "");
    if (amend && last === null) return this.app.message("info", "no commit to amend yet");
    const trusted = isTrusted(c.root);
    const files = staged.length ? ` (${staged.slice(0, 5).join(", ")}${staged.length > 5 ? ", …" : ""})` : "";
    // The guide's lines start with `#`, or, when a line of the message does, a mark none of its lines starts with.
    const mark = commentFor(last ?? "");
    const guide = [
      `${mark} ${amend ? "Amending the last commit" : "Committing"}: ${staged.length} file${staged.length === 1 ? "" : "s"} staged${files}.`,
      `${mark} Lines starting with ${mark} are left out. ctrl+s commits; esc leaves it.`,
      ...(trusted
        ? []
        : [`${mark} This vault isn't trusted: its hooks don't run, and the commit isn't signed (:trust trusts it).`]),
    ];
    const buf = new NoteBuffer(null, `${c.root}#commit`, `commit:${c.root}`);
    buf.kind = { group: "text", format: "text" };
    buf.virtual = { save: (text) => (this.commitWith(text, amend, typed, mark), true) };
    buf.loadText(`${last ?? ""}\n\n${guide.join("\n")}\n`);
    const fv = this.app.makeView(buf, { ...TOP }, { anchor: { ...TOP }, sub: 0, col: 0 });
    this.app.floating = {
      kind: "commit",
      amend,
      from: this.app.region,
      view: fv,
      title: amend ? "Amend the last commit" : "Commit",
    };
    this.app.lens.setViewMode(fv, "source");
    this.app.region = "content";
    // A new commit's message is the first thing typed: its editor opens typing, on the empty first line — or after what
    // the message box had. An amend's has its message to change: it opens as any editor does.
    if (!amend) startInsert(this.app, fv, () => (last ?? "").length);
    if (!trusted)
      this.app.message("warn", "this vault isn't trusted: the commit's hooks don't run, and it isn't signed");
  }

  /** The commit editor gone: back to where it was opened from — source control, when it's still there. */
  commitDone(from: Region): void {
    this.app.region = from === "sidebar" && !this.app.panels.sidebarShown ? "content" : from;
  }

  /** The commit editor's text committed: in the background; the editor closed when it's done, kept (said why) when not. */
  private commitWith(text: string, amend: boolean, typed: string, mark: string): void {
    const c = this.checkout;
    if (!c) return;
    this.app.message("info", amend ? "amending…" : "committing…");
    void commitLater(c, text, amend, mark).then((r) => {
      if ("why" in r) this.app.message("warn", `git: ${r.why}`);
      else {
        // The message box's text went into it: the box is empty again.
        if (typed && this.app.gitPanel.message === typed) this.app.gitPanel.message = "";
        const f = this.app.floating;
        if (f?.kind === "commit") {
          this.app.floating = null;
          this.commitDone(f.from);
        }
        this.app.message("info", `${amend ? "amended" : "committed"} ${r.hash}: ${r.subject}`);
        void this.refreshNow().then(() => this.app.host.requestRender());
      }
      this.app.host.requestRender();
    });
  }

  /**
   * A pointer to a branch not checked out here (21.7): the file as it is there, from git, read-only,
   * in the floating window — a note rendered, any other file as its text.
   */
  async showFromGit(ref: { root: string; rel: string; branch: string }, link: string): Promise<void> {
    const c = checkoutOf(ref.root);
    const query = beginGitRead(this.app, "Reading branch version");
    const text = c ? await showLater(c, ref.branch, ref.rel, query.signal) : null;
    if (!query.current()) return;
    if (text === null) return this.app.message("warn", `${link}: no ${ref.rel} on ${ref.branch}`);
    const note = /\.(md|markdown)$/i.test(ref.rel);
    this.app.overlays.openHover(
      note ? text : fence(text, fenceLanguage(ref.rel)),
      `${ref.rel} on ${ref.branch}, read-only from git`,
    );
    this.app.host.requestRender();
  }
}

/** A folder's git state is its strongest file's (5.11). */
const GIT_RANK: Record<GitState, number> = { deleted: 0, renamed: 1, modified: 2, new: 3, conflict: 4 };
