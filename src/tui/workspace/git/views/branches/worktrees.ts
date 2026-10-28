// Worktree and new-branch UI flows retain App interaction and branch-owner visit/selection guards.
import { sep } from "node:path";
import { headOf } from "../../../../../core/workspace/git/git.ts";
import { branchesOf } from "../../../../../core/workspace/git/branches/gitops.ts";
import {
  addWorktreeLater,
  badBranchName,
  type Branch,
  type BranchStats,
  ignoredLater,
  ignoredText,
  makeBranch,
  newWorktreeLater,
  orderBranches,
  realPath,
  removeWorktreeLater,
  switchLater,
  worktreeFolder,
} from "../../../../../core/workspace/git/branches/gitbranches.ts";
import { candidates, keepBase } from "../../../../../core/workspace/git/gitbase.ts";
import { tildePath } from "../../../../../core/workspace/vaults/names.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import { match } from "../../../../shell/overlays/match.ts";
import type { App } from "../../../../app/runtime/app.ts";
import type { Asked, BranchList, PanelRow } from "../contracts.ts";

export interface BranchWorktreeHost {
  readonly opened: Set<string>;
  readonly list: BranchList | null;
  ask(branch: Branch): Promise<BranchStats | null>;
  still(visit: number): boolean;
  relisted(): void;
  listed(): Promise<boolean>;
  rowOf(name: string, rows?: PanelRow[]): number;
  goInto(branch: Branch): void;
}

export class BranchWorktrees {
  constructor(
    private readonly app: App,
    private readonly host: BranchWorktreeHost,
  ) {}

  /**
   * Remove a worktree (GIT-D9): only one whose branch is merged into its base, and none with uncommitted changes —
   * refused, said why — after asking; its branch kept unless asked. Its git-ignored files go with it, as git removes
   * them: the question names them, its notes first (never a busy folder's, such as `node_modules`).
   */
  remove(b: Branch): void {
    const app = this.app;
    const c = app.git.checkout;
    const w = b.worktree;
    if (!c || !w) return app.message("info", `${b.name} has no worktree to remove`);
    const mine = realPath(app.loc.root);
    const there = realPath(w.path);
    // The folder you're in, however it was opened (a link to it too).
    if (b.here || mine === there || mine.startsWith(`${there}${sep}`))
      return app.message("info", "the worktree you're in can't be removed from here: go into another first");
    if (w.main) return app.message("info", "the main checkout isn't a worktree to remove");
    const visit = app.vaults.visits;
    const keys = app.overlays.keysGo();
    // What git says is said, wherever you are by then; the question only where it was asked.
    void Promise.all([this.host.ask(b), ignoredLater(w.path)]).then(([st, ignored]) => {
      if (!st) return app.message("warn", "git couldn't say where the branch stands");
      if (st.dirty)
        return app.message(
          "warn",
          `not removed: ${tildePath(w.path)} has ${st.dirty} uncommitted file${st.dirty === 1 ? "" : "s"} — commit or discard them there first`,
        );
      if (!st.base || !st.merged)
        return app.message(
          "warn",
          `not removed: ${b.name} isn't merged into ${st.base ?? "its base"} — ${st.ahead} commit${st.ahead === 1 ? "" : "s"} of its own; merge it first`,
        );
      // Moved on meanwhile (another vault): nothing; your keys gone elsewhere since: nothing pops up there.
      if (!this.host.still(visit)) return;
      // What git deletes with it, unasked: its ignored notes and files (D61: an ignored note is the vault's).
      const also = ignored ? ignoredText(ignored) : "";
      const detail = also ? `also deletes ${sanitize(also)}` : undefined;
      app.overlays.openListLater(
        {
          title: `Remove the worktree ${tildePath(w.path)}?`,
          filterable: false,
          items: [
            { label: `Remove it, keep ${sanitize(b.name)}`, ...(detail ? { detail } : {}), data: "keep" },
            {
              label: `Remove it and the branch ${sanitize(b.name)}`,
              detail: `merged into ${st.base}${detail ? `; ${detail}` : ""}`,
              data: "both",
            },
            { label: "Cancel", data: "cancel" },
          ],
          accept: (item) => {
            if (item.data === "cancel") return;
            const removing = app.vaults.visits;
            app.message("info", `removing the worktree ${tildePath(w.path)}…`);
            void removeWorktreeLater(c.root, w.path, item.data === "both" ? b.name : null).then((why) => {
              if (why) app.message("warn", `git: ${why}`);
              else {
                // Folded again here only: a branch of that name opened up in a vault gone into meanwhile is its own.
                if (this.host.still(removing)) this.host.opened.delete(b.name);
                app.message(
                  "info",
                  `removed the worktree ${tildePath(w.path)}${item.data === "both" ? `, and ${b.name}` : `; ${b.name} kept`}`,
                );
              }
              // Refused, git may have done some of it — the worktree removed and its branch kept, a folder partly
              // deleted: listed again all the same.
              this.host.relisted();
            });
          },
        },
        keys,
      );
    });
  }

  /** "Open in a worktree": a worktree made for a branch checked out nowhere, in the folder `[git] worktrees` names; gone into. */
  worktreeFor(b: Branch): void {
    const app = this.app;
    const c = app.git.checkout;
    if (!c) return;
    const folder = worktreeFolder(app.config.git.worktrees, c.main ?? c.root, b.name);
    this.askFolder(folder, (to) => {
      const visit = app.vaults.visits;
      const keys = app.overlays.keysGo();
      app.message("info", `checking ${b.name} out at ${tildePath(to)}…`);
      void addWorktreeLater(c.root, to, b.name).then((why) => {
        if (why) app.message("warn", `git: ${why}`);
        else app.message("info", `${b.name} is in a worktree at ${tildePath(to)}`);
        // Moved on meanwhile (another vault): said, and nothing more — never gone into from wherever you are now.
        // Refused, a worktree stopped partway, or refused by a hook once checked out, may be there: listed again.
        if (!this.host.still(visit)) return;
        void app.git.refreshNow().then(() => {
          app.host.requestRender();
          if (why || !this.host.still(visit)) return;
          // Something else has your keys by now (a question, typing): not taken from it, the vault left under it.
          if (app.overlays.busy(keys))
            return app.message("info", `${b.name}'s worktree not gone into — o goes into it`);
          this.host.goInto({ ...b, worktree: { path: to, main: false, gone: false } });
        });
      });
    });
  }

  /** The folder a worktree goes in, asked: the template's, or typed instead. */
  private askFolder(folder: string, go: (to: string) => void): void {
    const app = this.app;
    app.overlays.openList({
      title: "The worktree's folder",
      filterable: false,
      items: [
        { label: tildePath(folder), detail: "as [git] worktrees says", data: folder },
        { label: "Another folder…", data: null },
      ],
      accept: (item) => {
        if (item.data) return go(item.data as string);
        app.overlays.prompt("folder for the worktree: ", (typed) => {
          const t = typed.trim();
          if (!t) return;
          go(worktreeFolder(t, folder, ""));
        });
        const o = app.overlay;
        if (o?.kind === "prompt") o.text = tildePath(folder);
      },
    });
  }

  /**
   * A new branch (GIT-D9): its name, where it starts (`From`: this branch, the bases, any branch, a commit), and where
   * it goes — a new worktree, by default in `[git] worktrees`'s folder; checked out here; or just made. Its base is the
   * branch it's made from, kept (GIT-D10).
   */
  newBranch(from?: string): void {
    const app = this.app;
    const c = app.git.checkout;
    if (!c) return app.message("info", "not a git repository");
    app.overlays.prompt("new branch: ", (typed) => {
      const name = typed.trim();
      const bad = badBranchName(c.root, name);
      if (bad) return app.message("warn", bad);
      if (from) return this.newWhere(name, from);
      const here = headOf(c).branch;
      // Asked now, not from the panel's list: that one may not have come back from git yet.
      const listed = branchesOf(c) ?? [];
      const bases = candidates("", app.config.git).filter((b) => listed.includes(b));
      const first = [...new Set([...(here ? [here] : []), ...bases])];
      app.overlays.openList({
        title: `${sanitize(name)}: from where?`,
        items: [
          ...first.map((b) => ({ label: sanitize(b), detail: b === here ? "this branch" : "a base", data: b })),
          ...listed.filter((b) => !first.includes(b)).map((b) => ({ label: sanitize(b), data: b })),
          { label: "A commit…", detail: "its hash, or any ref", data: null },
        ],
        accept: (item) => {
          if (item.data) return this.newWhere(name, item.data as string);
          app.overlays.prompt("from commit: ", (ref) => ref.trim() && this.newWhere(name, ref.trim()));
        },
      });
    });
  }

  /** The new branch's place: in a new worktree (the default), here, or nowhere yet. */
  private newWhere(name: string, from: string): void {
    const app = this.app;
    const c = app.git.checkout!;
    const folder = worktreeFolder(app.config.git.worktrees, c.main ?? c.root, name);
    const make = (): boolean => {
      const why = makeBranch(c.root, name, from);
      if (why) {
        app.message("warn", `git: ${why}`);
        return false;
      }
      keepBase(c, name, from);
      return true;
    };
    // The branch made, opened up and, once git lists it, selected — in the vault it was asked for in still, each step
    // of the way. Selected only with the git panel showing and nothing done in it since (a key, a click): used
    // meanwhile, its selection stays where you put it — a row moved by the panel itself (rows coming and going, the
    // selection kept within them) isn't you. Unfolded to (one just made from its base is merged, so folded with the
    // older ones), once it's listed and never against the panel's filter.
    const shown = (at: Asked) => {
      if (!this.host.still(at.visit)) return;
      this.host.opened.add(name);
      void app.git.refreshNow().then(async () => {
        if (!this.host.still(at.visit) || !(await this.host.listed())) return;
        app.host.requestRender();
        if (!app.panels.sidebarShown || app.leftView !== "git" || app.gitPanel.touched !== at.touched) return;
        const rows = app.gitPanel.rows();
        // Listed, and the panel showing its branches (not "asking git…"): else nothing to unfold to.
        const list = this.host.list?.branches;
        if (!list?.some((b) => b.name === name)) return;
        if (!rows.some((r) => r.kind === "heading" && r.section === "branches")) return;
        const q = app.sidebar.filter ?? "";
        if (q && !match(q, name)) return;
        let i = this.host.rowOf(name, rows);
        if (i < 0) {
          // Folded: the Branches, or the merged and older among them, as the panel orders them.
          const merged = this.host.list?.merged ?? new Set<string>();
          const older = orderBranches(list, (b) => merged.has(b.name), app.now()).folded.some((b) => b.name === name);
          app.gitPanel.folded.delete("branches");
          if (older) app.gitPanel.folded.delete("older");
          i = this.host.rowOf(name);
        }
        if (i < 0) return;
        // Picked, kept to as rows move (D261), and brought into sight, as a key's move would.
        app.gitPanel.select(i, app.gitPanel.rows(), true);
      });
    };
    const done = (said: string, at: Asked) => {
      app.message("info", said);
      shown(at);
    };
    app.overlays.openList({
      title: `${sanitize(name)} from ${sanitize(from)}: where?`,
      filterable: false,
      items: [
        { label: "In a new worktree", detail: tildePath(folder), data: "worktree" },
        { label: "In a new worktree, in another folder…", data: "elsewhere" },
        { label: "Check it out here", data: "here" },
        { label: "Just make it", data: "make" },
      ],
      accept: (item) => {
        const how = item.data as string;
        const at: Asked = { visit: app.vaults.visits, touched: app.gitPanel.touched };
        // The branch and its worktree in one: a folder git won't take leaves no branch behind.
        const inWorktree = (to: string) => {
          app.message("info", `making ${name} in a new worktree at ${tildePath(to)}…`);
          void newWorktreeLater(c.root, to, name, from).then(({ why, left }) => {
            // Made, or refused once made and left — stopped partway, a hook refusing once checked out: the branch
            // keeps its base. Refused with nothing left (a branch there before isn't one it made): listed again.
            if (!why || left) keepBase(c, name, from);
            if (!why)
              return done(`made ${name} from ${from}, in a new worktree at ${tildePath(to)} — o goes into it`, at);
            app.message("warn", `git: ${why}`);
            // Left: shown as a made one is — git's refusal said, nothing claimed done.
            if (!left) return this.host.relisted();
            shown(at);
          });
        };
        if (how === "worktree") return inWorktree(folder);
        if (how === "elsewhere") {
          app.overlays.prompt(
            "folder for the worktree: ",
            (typed) => typed.trim() && inWorktree(worktreeFolder(typed.trim(), folder, "")),
          );
          const o = app.overlay;
          if (o?.kind === "prompt") o.text = tildePath(folder);
          return;
        }
        if (how === "make") return make() && done(`made ${name} from ${from}`, at);
        app.git.beforeCheckout(() => {
          if (!make()) return;
          void switchLater(c.root, name).then((why) => {
            // Refused or not, HEAD may have moved (stopped partway; a hook refusing once switched): seen at once.
            app.git.checkHead();
            if (why) {
              // Made all the same, only not checked out (or not all of it): shown as one just made is.
              app.message("warn", `${name} made, but git: ${why}`);
              return shown(at);
            }
            done(`made ${name} from ${from}, and checked it out`, at);
          });
        });
      },
    });
  }
}
