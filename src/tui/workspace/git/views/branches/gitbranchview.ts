// The git panel's branches (GIT-D9, GIT-D10, GIT-D13): the repository's branches, a worktree marked on its branch (`⎇`,
// its folder), each against its own base — ahead of it, behind it, merged — and a worktree's uncommitted files; this
// branch first, then those in a worktree, then those touched lately, the merged and the untouched folded. Opened up in
// place, a branch shows its changes, a file's diff a click away, and what it offers: going into its worktree, or
// checking it out here or in a worktree of its own; a merge; a merged worktree removed, a gone one pruned. A new branch
// starts where it's asked to, in a new worktree if ticked, its base kept. git is asked in the background, a branch's
// figures only for the rows on screen.

import { beginGitRead } from "../../gitquery.ts";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { showLater } from "../../../../../core/workspace/git/branches/gitops.ts";
import { backToPanel, readForDiff } from "../panel/gitview.ts";
import {
  type Branch,
  type BranchStats,
  mergeBaseLater,
  mergeLater,
  pruneWorktrees,
  switchLater,
} from "../../../../../core/workspace/git/branches/gitbranches.ts";
import {
  keepBase,
  keptBases,
  remoteBranchesLater,
  resolveBaseLater,
} from "../../../../../core/workspace/git/gitbase.ts";
import { tildePath } from "../../../../../core/workspace/vaults/names.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import { isVaultRoot, rootAt, rootMarkers } from "../../../../../core/workspace/vaults/vault.ts";
import { openDiff } from "../changes/diffview.ts";
import type { App } from "../../../../app/runtime/app.ts";
import type { BranchFileRow, BranchFiles, BranchList, BranchViewRow, PanelRow } from "../contracts.ts";
import { BranchReads } from "./reads.ts";
import { BranchRows } from "./rows.ts";
import { BranchWorktrees } from "./worktrees.ts";
export { shownOn } from "./reads.ts";
export type {
  BranchRow,
  BranchLineRow,
  BranchButtonsRow,
  BranchFileRow,
  BranchSubRow,
  BranchViewRow,
  BranchList,
} from "../contracts.ts";

/** "Compare against…"'s entry for a branch, tag or commit typed: no ref's name, so never mistaken for one. */
const TYPED = Symbol("typed");

/** The branches' state: their list, which are merged, each one's figures, the ones opened up. */
export class BranchView {
  private readonly reads: BranchReads;
  private readonly rowBuilder: BranchRows;
  private readonly worktrees: BranchWorktrees;
  get list(): BranchList | null {
    return this.reads.currentList;
  }

  constructor(readonly app: App) {
    this.reads = new BranchReads(this);
    this.rowBuilder = new BranchRows(this);
    this.worktrees = new BranchWorktrees(this.app, this);
  }

  /** The branches opened up, by name. */
  readonly opened = new Set<string>();

  /** The branches, asked of git when it has news; the last answer meanwhile, null before the first. */
  branches(): { branches: Branch[]; merged: Set<string> } | null {
    return this.reads.branches();
  }

  /**
   * Once a list of the branches asked for since this was called is shown — the repository as it is now, or newer:
   * true, unless the vault was left meanwhile or git couldn't list them. What a branch just made waits for, to be
   * selected. Each round waits for one of git's answers; with nothing asked, nothing to wait for.
   */
  async listed(): Promise<boolean> {
    return this.reads.listed();
  }

  /** The branch checked out here, as git last listed it. */
  here(): Branch | null {
    return this.reads.here();
  }

  /** A branch's figures (GIT-D9): asked when its row is on screen and git has news since; null until git answers. */
  statsOf(b: Branch): BranchStats | null {
    return this.reads.statsOf(b);
  }

  /** A branch's base, ahead and behind, merged, and its worktree's uncommitted files — asked of git. */
  async ask(b: Branch): Promise<BranchStats | null> {
    return this.reads.ask(b);
  }

  /** The section's rows: the heading, then the branches in order, the merged and older folded under one of their own. */
  rows(): PanelRow[] {
    return this.rowBuilder.rows();
  }

  /** A branch opened up's files: against its base, and its worktree's uncommitted ones; asked in the background. */
  filesOf(b: Branch, base: string | null): BranchFiles | null {
    return this.reads.filesOf(b, base);
  }

  // ---------------------------------------------------------------------------------------------
  // What a branch's row does
  /** The panel's action on a branch's rows. */
  action(row: BranchViewRow, action: string): void | Promise<void> {
    const b = row.branch;
    if (row.kind === "bfile" && (action === "open" || action === "expand")) return this.fileDiff(row);
    if (row.kind === "bbuttons" && (action === "open" || action === "go"))
      return this.button(b, row.buttons[0]?.action ?? "");
    switch (action) {
      case "open":
        if (row.kind !== "branch") return;
        if (this.opened.has(b.name)) this.opened.delete(b.name);
        else this.opened.add(b.name);
        return;
      case "expand":
        this.opened.add(b.name);
        return;
      case "collapse": {
        this.opened.delete(b.name);
        return this.app.gitPanel.selectWhere((r) => r.kind === "branch" && r.branch.name === b.name);
      }
      case "go":
        return b.worktree?.gone
          ? this.button(b, "prune")
          : b.worktree && !b.here
            ? this.button(b, "go")
            : b.here
              ? this.app.message("info", `${b.name} is checked out here`)
              : this.menu(b);
      case "merge":
        return this.button(b, "merge");
      case "discard":
        return this.button(b, b.worktree?.gone ? "prune" : "remove");
      case "menu":
        return this.menu(b);
    }
  }

  /** A branch's menu (`.`, a right click): everything its buttons do, and comparing it against another base. */
  menu(b: Branch, at?: { x: number; y: number }): void {
    const w = b.worktree;
    const items: { label: string; action: string }[] = [];
    if (w?.gone) items.push({ label: "Prune the worktrees whose folders are gone", action: "prune" });
    else if (w && !b.here) items.push({ label: "Open its worktree", action: "go" });
    else if (!w) {
      items.push({ label: "Check it out here", action: "checkout" });
      items.push({ label: "Open it in a worktree…", action: "worktree" });
    }
    items.push({ label: "Merge…", action: "merge" });
    items.push({ label: "Compare against…", action: "compare" });
    if (w && !w.main && !b.here && !w.gone) items.push({ label: "Remove its worktree…", action: "remove" });
    items.push({ label: "A new branch from it…", action: "new" });
    items.push({ label: "Copy its name", action: "copy" });
    this.app.overlays.openList({
      title: sanitize(b.name),
      filterable: false,
      anchor: at,
      menu: true,
      items: items.map((it) => ({ label: it.label, data: it.action })),
      accept: (item) => {
        this.app.region = "sidebar";
        this.button(b, item.data as string);
      },
    });
  }

  /** A branch's button, or its menu's entry. */
  button(b: Branch, action: string): void {
    const app = this.app;
    const c = app.git.checkout;
    if (!c) return;
    switch (action) {
      case "go":
        return this.goInto(b);
      case "checkout":
        return app.git.beforeCheckout(() => {
          app.message("info", `checking out ${b.name}…`);
          void switchLater(c.root, b.name).then((why) => {
            if (why) app.message("warn", `git: ${why}`);
            app.git.checkHead();
            this.relisted();
          });
        });
      case "worktree":
        return this.worktreeFor(b);
      case "merge":
        return void this.mergeMenu(b);
      case "compare":
        return this.compare(b);
      case "remove":
        return this.remove(b);
      case "prune": {
        const why = pruneWorktrees(c.root);
        if (why) return app.message("warn", `git: ${why}`);
        app.message("info", "pruned: the worktrees whose folders are gone are forgotten");
        return this.relisted();
      }
      case "new":
        return this.newBranch(b.name);
      case "copy":
        return void app.copy(b.name);
    }
  }

  /** Into a branch's worktree (VV-D4): its vault, at the note open here when it has it, as `:worktrees` goes. */
  goInto(b: Branch): void {
    const app = this.app;
    const c = app.git.checkout;
    const w = b.worktree;
    if (!c || !w) return app.message("info", `${b.name} isn't checked out in a worktree`);
    if (w.gone) return app.message("warn", `its folder is gone: ${tildePath(w.path)} — d prunes it`);
    const here = relative(c.root, app.loc.root);
    const vault = join(w.path, here);
    if (!isVaultRoot(vault))
      return app.message("warn", `${vault} isn't a vault on that branch (none of ${rootMarkers().join(", ")} in it)`);
    const note = app.tabView?.buf.rel ?? null;
    const there = note && existsSync(join(vault, note)) ? join(vault, note) : null;
    const v = app.tabView;
    app.vaults.switchVault(rootAt(vault), there, there && v ? { ...v.topAnchor } : undefined);
  }

  /** A file a branch changed, its diff (GIT-D2) in the diff window: against its base, or in its worktree, not committed. */
  private async fileDiff(row: BranchFileRow): Promise<void> {
    const app = this.app;
    const c = app.git.checkout;
    if (!c) return;
    const query = beginGitRead(app, "Reading branch version");
    const b = row.branch;
    let before = "";
    let now = "";
    const back = backToPanel(app);
    if (row.against === "uncommitted" && b.worktree) {
      before = (await showLater({ root: b.worktree.path }, "HEAD", row.path, query.signal)) ?? "";
      // Overtaken meanwhile (another diff asked for, the vault left): nothing read or said for this one.
      if (!query.current()) return;
      const read = readForDiff(join(b.worktree.path, row.path));
      if (typeof read !== "string") return app.message("info", `${row.path}: ${read.why}`);
      now = read;
    } else if (row.base) {
      const from = await mergeBaseLater(c.root, row.base, b.tip);
      // A rename: before, under the name it had.
      before = from ? ((await showLater(c, from, row.from ?? row.path, query.signal)) ?? "") : "";
      now = (await showLater(c, b.tip, row.path, query.signal)) ?? "";
    }
    if (!query.current()) return;
    const against = row.against === "base" ? `against ${sanitize(row.base ?? "")}` : "not committed";
    openDiff(app, {
      before,
      now,
      path: join(c.root, row.path),
      title: `${sanitize(b.name)}: ${sanitize(row.from ? `${row.from} → ${row.path}` : row.path)} ${against} — esc: source control`,
      none: `${row.path}: nothing to show`,
      back,
    });
    app.host.requestRender();
  }

  /**
   * "Compare against…" (GIT-D10, D255): another base for a branch, kept; or back to the one guessed. The local
   * branches, then the remote-tracking ones (`origin/dev`, a pull request's base as the forge compares it, as of the
   * last fetch), then any branch, tag or commit typed.
   */
  private compare(b: Branch): void {
    const app = this.app;
    const c = app.git.checkout;
    const got = this.branches();
    if (!c || !got) return;
    const visit = app.vaults.visits;
    const keys = app.overlays.keysGo();
    void remoteBranchesLater(c).then((remotes) => {
      // Moved on meanwhile (another vault): nothing; your keys gone elsewhere since: nothing pops up there.
      if (!this.still(visit)) return;
      const kept = keptBases(c)[b.name];
      const others = got.branches.map((x) => x.name).filter((n) => n !== b.name);
      app.overlays.openListLater(
        {
          title: `Compare ${sanitize(b.name)} against…`,
          items: [
            ...(kept ? [{ label: "The base guessed from [git] bases", detail: `now ${kept}, kept`, data: null }] : []),
            ...others.map((n) => ({ label: sanitize(n), detail: n === kept ? "kept" : "", data: n })),
            ...remotes.map((n) => ({ label: sanitize(n), detail: n === kept ? "remote, kept" : "remote", data: n })),
            { label: "A branch, tag or commit…", detail: "typed: v2.3, a commit, HEAD~3", data: TYPED },
          ],
          accept: (item) =>
            item.data === TYPED ? this.compareTyped(b) : this.compareWith(b, item.data as string | null),
        },
        keys,
      );
    });
  }

  /** "Compare against…"'s last entry: a branch, tag or commit typed, checked as `--base` is (a revision as its commit). */
  private compareTyped(b: Branch): void {
    const app = this.app;
    const c = app.git.checkout;
    if (!c) return;
    app.overlays.prompt(`compare ${sanitize(b.name)} against: `, (typed) => {
      const visit = app.vaults.visits;
      // Said as it comes (D263): what's kept, or why not.
      void resolveBaseLater(c, typed).then((asked) => {
        if (!this.still(visit)) return;
        if ("error" in asked) app.message("warn", asked.error);
        else if (asked.full === `refs/heads/${b.name}`) app.message("info", `${b.name} can't be its own base`);
        else this.compareWith(b, asked.base, asked.commit ? typed.trim() : undefined);
      });
    });
  }

  /** A branch's base kept (or, null, guessed again), what was read against the old one dropped, and said. */
  private compareWith(b: Branch, base: string | null, typed?: string): void {
    const app = this.app;
    const c = app.git.checkout;
    if (!c) return;
    keepBase(c, b.name, base);
    this.reads.forgetBranch(b.name);
    app.git.forgetBase();
    app.message(
      "info",
      base
        ? `${b.name} is compared against ${base}${typed ? ` (${typed})` : ""} now`
        : `${b.name}'s base is guessed again`,
    );
  }

  /**
   * Remove a worktree (GIT-D9): only one whose branch is merged into its base, and none with uncommitted changes —
   * refused, said why — after asking; its branch kept unless asked. Its git-ignored files go with it, as git removes
   * them: the question names them, its notes first (never a busy folder's, such as `node_modules`).
   */
  private remove(b: Branch): void {
    return this.worktrees.remove(b);
  }

  /**
   * Still where an answer from git was asked for, as it comes: in that visit of that vault (`Vaults.visits`), never
   * left meanwhile — gone into again, it's another.
   */
  still(visit: number): boolean {
    return this.app.vaults.visits === visit;
  }

  /** The repository asked again once git has changed it, refused or not; the vault's as it is now. */
  relisted(): void {
    void this.app.git.refreshNow().then(() => this.app.host.requestRender());
  }

  /** A branch's row in the panel's rows (as it lists them now, unless given), by its name; -1 when it doesn't show
   *  (folded, filtered). */
  rowOf(name: string, rows = this.app.gitPanel.rows()): number {
    return rows.findIndex((r) => r.kind === "branch" && r.branch.name === name);
  }

  /** "Open in a worktree": a worktree made for a branch checked out nowhere, in the folder `[git] worktrees` names; gone into. */
  private worktreeFor(b: Branch): void {
    return this.worktrees.worktreeFor(b);
  }

  /**
   * A new branch (GIT-D9): its name, where it starts (`From`: this branch, the bases, any branch, a commit), and where
   * it goes — a new worktree, by default in `[git] worktrees`'s folder; checked out here; or just made. Its base is the
   * branch it's made from, kept (GIT-D10).
   */
  newBranch(from?: string): void {
    return this.worktrees.newBranch(from);
  }

  /**
   * "Merge…" (GIT-D9, GIT-D10): into its base unless another is picked — first the links it would break (the merge
   * review), then the merge itself, run where that branch is checked out: here, or in its worktree.
   */
  private async mergeMenu(b: Branch): Promise<void> {
    const app = this.app;
    const c = app.git.checkout;
    const got = this.branches();
    if (!c || !got) return;
    const visit = app.vaults.visits;
    const keys = app.overlays.keysGo();
    const st = await this.ask(b);
    this.mergeAsked(b, st, got.branches, visit, keys);
  }

  /** Merge…'s menu, once its base is known: the links it would break, the merge itself, or into another branch. */
  private mergeAsked(b: Branch, st: BranchStats | null, branches: Branch[], visit: number, keys: string): void {
    const app = this.app;
    const into = st?.base;
    // Said wherever you are by then; the menu only where it was asked.
    if (!into) return app.message("info", `${b.name} has no base to merge into — Compare against… sets one`);
    const c = app.git.checkout;
    // Moved on meanwhile (another vault): nothing; your keys gone elsewhere since: nothing pops up there.
    if (!c || !this.still(visit)) return;
    const target = branches.find((x) => x.name === into);
    const where = target?.here ? c.root : target?.worktree && !target.worktree.gone ? target.worktree.path : null;
    app.overlays.openListLater(
      {
        title: `Merge ${sanitize(b.name)} into ${sanitize(into)}`,
        filterable: false,
        items: [
          { label: "The links it would break", detail: "git's result, nothing changed", data: "review" },
          where
            ? {
                label: `Merge it${target?.here ? "" : ` in ${tildePath(where)}`}`,
                detail: `${st!.ahead} commit${st!.ahead === 1 ? "" : "s"}`,
                data: "merge",
              }
            : {
                label: `Merge it: check out ${sanitize(into)} first`,
                detail: "it's checked out nowhere",
                data: "nowhere",
              },
          { label: "Into another branch…", data: "other" },
        ],
        accept: (item) => {
          if (item.data === "review") return app.git.showMergeReview({ from: b.name, into });
          if (item.data === "nowhere")
            return app.message("info", `${into} isn't checked out anywhere: check it out, then merge ${b.name} there`);
          if (item.data === "other") return this.mergeInto(b, branches);
          this.runMerge(b.name, into, where!, !!target?.here);
        },
      },
      keys,
    );
  }

  /** Into another branch than its base: picked, then as Merge… goes on. */
  private mergeInto(b: Branch, branches: Branch[]): void {
    const app = this.app;
    const c = app.git.checkout!;
    app.overlays.openList({
      title: `Merge ${sanitize(b.name)} into…`,
      items: branches
        .filter((x) => x.name !== b.name && (x.here || (x.worktree && !x.worktree.gone)))
        .map((x) => ({ label: sanitize(x.name), detail: x.here ? "here" : tildePath(x.worktree!.path), data: x })),
      accept: (item) => {
        const t = item.data as Branch;
        this.runMerge(b.name, t.name, t.here ? c.root : t.worktree!.path, t.here);
      },
    });
  }

  /** The merge run where `into` is checked out: here, unsaved notes saved or kept first; conflicts said, to settle. */
  private runMerge(branch: string, into: string, where: string, here: boolean): void {
    const app = this.app;
    const go = () => {
      app.message("info", `merging ${branch} into ${into}…`);
      void mergeLater(where, branch).then((r) => {
        if (r.ok) app.message("info", `merged ${branch} into ${into}`);
        else if (r.conflict)
          app.message(
            "warn",
            `merging ${branch} into ${into} stopped on conflicts${here ? ": Conflicts lists them" : ` in ${tildePath(where)}`} — git merge --abort undoes it`,
          );
        else app.message("warn", `git: ${sanitize(r.why)}`);
        if (here) app.git.checkHead();
        this.relisted();
      });
    };
    if (here) app.git.beforeCheckout(go, { verb: "merge", noun: "the merge", done: "merged" });
    else go();
  }
}
