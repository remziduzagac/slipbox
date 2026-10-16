// The git panel's branches (GIT-D9, GIT-D10, GIT-D13): the repository's branches, a worktree marked on its branch
// (`⎇`, its folder), each against its own base — ahead of it, behind it, merged — and a worktree's uncommitted files;
// this branch first, then those in a worktree, then those touched lately, the merged and the untouched folded. Opened up
// in place, a branch shows its changes, a file's diff a click away, and what it offers: going into its worktree, or
// checking it out here or in a worktree of its own; a merge; a merged worktree removed, a gone one pruned. A new branch
// starts where it's asked to, in a new worktree if ticked, its base kept. git is asked in the background, a branch's
// figures only for the rows on screen.

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { checkoutOf, headOf } from "../core/git.ts";
import { baseBranch, branchesOf, type Changed, inVault, showAt } from "../core/gitops.ts";
import { type StatusEntry, switchBranch } from "../core/gitstage.ts";
import { backToPanel } from "./gitview.ts";
import {
  addWorktree,
  aheadBehindLater,
  badBranchName,
  type Branch,
  type BranchStats,
  branchChangedLater,
  branchesLater,
  dirtyLater,
  makeBranch,
  mergeBaseLater,
  mergedLater,
  mergeLater,
  orderBranches,
  pruneWorktrees,
  removeWorktree,
  worktreeFolder,
} from "../core/gitbranches.ts";
import { candidates, keepBase, keptBases, nearest } from "../core/gitbase.ts";
import { checkoutStateLater } from "../core/gitrepos.ts";
import { tildePath } from "../core/names.ts";
import { sanitize } from "../core/sanitize.ts";
import { isVaultRoot, rootAt, rootMarkers } from "../core/vault.ts";
import { openDiff } from "./diffview.ts";
import { match } from "./match.ts";
import type { App } from "./app.ts";
import type { HeadingRow, PanelRow } from "./gitpanel.ts";

/** A branch's row; `open` while it's opened up in place. */
export interface BranchRow {
  kind: "branch";
  branch: Branch;
  open: boolean;
}

/** A line under a branch opened up: its worktree's folder, or that the folder is gone. */
export interface BranchLineRow {
  kind: "bline";
  branch: Branch;
  text: string;
  gone: boolean;
}

/** A branch's buttons, opened up: `[Open] [Merge…]`, or `[Check out here] [Open in a worktree] [Merge…]`. */
export interface BranchButtonsRow {
  kind: "bbuttons";
  branch: Branch;
  buttons: { action: string; label: string }[];
}

/** A file a branch changed: against its base (committed), or in its worktree, not committed. */
export interface BranchFileRow {
  kind: "bfile";
  branch: Branch;
  against: "base" | "uncommitted";
  path: string;
  letter: string;
  base: string | null;
}

/** A label over a branch's files: "Uncommitted (2)", "Against main (5)". */
export interface BranchSubRow {
  kind: "bsub";
  branch: Branch;
  label: string;
}

export type BranchViewRow = BranchRow | BranchLineRow | BranchButtonsRow | BranchFileRow | BranchSubRow;

/** What git has said of a branch's changes, opened up. */
interface BranchFiles {
  key: string;
  base: Changed[] | null;
  uncommitted: StatusEntry[] | null;
}

/** The branches' state: their list, which are merged, each one's figures, the ones opened up. */
export class BranchView {
  constructor(readonly app: App) {}

  private list: { key: string; branches: Branch[] | null; merged: Set<string> } | null = null;
  private stats = new Map<string, { key: string; stats: BranchStats | null; asking: boolean }>();
  private files = new Map<string, BranchFiles>();
  /** The branches opened up, by name. */
  readonly opened = new Set<string>();

  /** The question asked of git: the repository's state as last seen (any news asks again). */
  private key(): string {
    return `${this.app.git.generation}\0${this.app.loc.root}`;
  }

  /** The branches, asked of git when it has news; the last answer meanwhile, null before the first. */
  branches(): { branches: Branch[]; merged: Set<string> } | null {
    const c = this.app.git.checkout;
    if (!c) return null;
    const key = this.key();
    if (this.list?.key !== key) {
      const asked = { key, branches: this.list?.branches ?? null, merged: this.list?.merged ?? new Set<string>() };
      this.list = asked;
      void (async () => {
        const branches = await branchesLater(c);
        const kept = keptBases(c);
        const git = this.app.config.git;
        const fallback = baseBranch(c, git.base);
        const bases = [...new Set([...candidates("", git), ...Object.values(kept), ...(fallback ? [fallback] : [])])];
        const sets = await Promise.all(bases.map((b) => mergedLater(c.root, b)));
        const into = new Map(bases.map((b, i) => [b, sets[i]] as const));
        const merged = new Set<string>();
        for (const b of branches ?? []) {
          // Merged into its kept base; else into any of its candidates, the nearest then (it leaves nothing of its own).
          const k = kept[b.name];
          const of = k ? [k] : candidates(b.name, git);
          if (of.some((x) => into.get(x)?.has(b.name))) merged.add(b.name);
        }
        if (this.list !== asked) return;
        asked.branches = branches;
        asked.merged = merged;
        this.app.host.requestRender();
      })();
    }
    return this.list.branches ? { branches: this.list.branches, merged: this.list.merged } : null;
  }

  /** The branch checked out here, as git last listed it. */
  here(): Branch | null {
    return this.list?.branches?.find((b) => b.here) ?? null;
  }

  /** A branch's figures (GIT-D9): asked when its row is on screen and git has news since; null until git answers. */
  statsOf(b: Branch): BranchStats | null {
    const key = `${this.key()}\0${b.tip}`;
    const had = this.stats.get(b.name);
    if (had?.key === key || had?.asking) return had?.stats ?? null;
    const entry = { key, stats: had?.stats ?? null, asking: true };
    this.stats.set(b.name, entry);
    void this.ask(b).then((stats) => {
      entry.stats = stats;
      entry.asking = false;
      // News meanwhile: asked again on the next draw.
      if (entry.key !== `${this.key()}\0${b.tip}`) entry.key = "";
      this.app.host.requestRender();
    });
    return entry.stats;
  }

  /** A branch's base, ahead and behind, merged, and its worktree's uncommitted files — asked of git. */
  private async ask(b: Branch): Promise<BranchStats | null> {
    const c = this.app.git.checkout;
    if (!c) return null;
    const git = this.app.config.git;
    const kept = keptBases(c)[b.name];
    const listed = kept ? [kept] : candidates(b.name, git);
    // None of them there, and the branch no trunk listed first: `[git] base`, main or master (GIT-D10).
    const trunk = !kept && !listed.length && candidates("", git).includes(b.name);
    const counts = await Promise.all(listed.map((base) => aheadBehindLater(c.root, base, b.name)));
    let near = nearest(listed.map((base, i) => ({ base, ahead: counts[i]?.ahead ?? null })));
    let ab = near === null ? null : counts[listed.indexOf(near)]!;
    const fallback = near || trunk ? null : baseBranch(c, git.base);
    if (fallback && fallback !== b.name) {
      near = fallback;
      ab = await aheadBehindLater(c.root, fallback, b.name);
    }
    const dirty = b.here
      ? (this.app.git.entries?.length ?? null)
      : b.worktree && !b.worktree.gone
        ? await dirtyLater(b.worktree.path)
        : null;
    return { base: near, ahead: ab?.ahead ?? 0, behind: ab?.behind ?? 0, merged: !!ab && ab.ahead === 0, dirty };
  }

  /** The section's rows: the heading, then the branches in order, the merged and older folded under one of their own. */
  rows(): PanelRow[] {
    const p = this.app.gitPanel;
    const got = this.branches();
    const q = this.app.sidebar.filter ?? "";
    const heading: HeadingRow = { kind: "heading", section: "branches", label: "Branches" };
    if (!got) return [heading, { kind: "note", text: "asking git…" }];
    const { branches, merged } = got;
    const order = orderBranches(branches, (b) => merged.has(b.name), this.app.now());
    const keep = (b: Branch) => !q || match(q, b.name);
    const shown = order.shown.filter(keep);
    const folded = order.folded.filter(keep);
    if (q && !shown.length && !folded.length) return [];
    heading.label = `Branches (${shown.length + folded.length})`;
    const rows: PanelRow[] = [heading];
    if (p.folded.has("branches")) return rows;
    for (const b of shown) rows.push(...this.branchRows(b));
    if (folded.length) {
      rows.push({ kind: "heading", section: "older", label: `Merged or older (${folded.length})` });
      if (!p.folded.has("older") || q) for (const b of folded) rows.push(...this.branchRows(b));
    }
    return rows;
  }

  /** A branch's row, and opened up, what it holds and offers. */
  private branchRows(b: Branch): PanelRow[] {
    const open = this.opened.has(b.name);
    const rows: PanelRow[] = [{ kind: "branch", branch: b, open }];
    if (!open) return rows;
    const st = this.statsOf(b);
    const w = b.worktree;
    if (w?.gone)
      return [
        ...rows,
        { kind: "bline", branch: b, text: `its folder is gone: ${tildePath(w.path)}`, gone: true },
        { kind: "bbuttons", branch: b, buttons: [{ action: "prune", label: "Prune" }] },
      ];
    if (w && !b.here) rows.push({ kind: "bline", branch: b, text: tildePath(w.path), gone: false });
    const buttons: { action: string; label: string }[] = b.here
      ? []
      : w
        ? [{ action: "go", label: "Open" }]
        : [
            { action: "checkout", label: "Check out here" },
            { action: "worktree", label: "Open in a worktree" },
          ];
    // The review (v) comes here, beside Open. Merge… whatever git says yet: the buttons never move under the pointer.
    buttons.push({ action: "merge", label: "Merge…" });
    if (w && !w.main && !b.here) buttons.push({ action: "remove", label: "Remove…" });
    if (buttons.length) rows.push({ kind: "bbuttons", branch: b, buttons });
    const files = this.filesOf(b, st?.base ?? null);
    if (w && !b.here) {
      const un = files?.uncommitted;
      rows.push({ kind: "bsub", branch: b, label: un ? `Uncommitted (${un.length})` : "Uncommitted: asking git…" });
      for (const e of un ?? [])
        rows.push({
          kind: "bfile",
          branch: b,
          against: "uncommitted",
          path: e.path,
          letter: e.x === "?" ? "?" : e.x !== " " ? e.x : e.y,
          base: null,
        });
    }
    if (st?.base) {
      const of = files?.base;
      rows.push({
        kind: "bsub",
        branch: b,
        label: of ? `Against ${sanitize(st.base)} (${of.length})` : `Against ${sanitize(st.base)}: asking git…`,
      });
      for (const f of of ?? [])
        rows.push({
          kind: "bfile",
          branch: b,
          against: "base",
          path: f.path,
          letter: f.state === "new" ? "+" : f.state === "deleted" ? "D" : f.state === "renamed" ? "R" : "M",
          base: st.base,
        });
    }
    return rows;
  }

  /** A branch opened up's files: against its base, and its worktree's uncommitted ones; asked in the background. */
  private filesOf(b: Branch, base: string | null): BranchFiles | null {
    const c = this.app.git.checkout;
    if (!c) return null;
    const key = `${this.key()}\0${b.tip}\0${base}`;
    const had = this.files.get(b.name);
    if (had?.key === key) return had;
    const entry: BranchFiles = { key, base: had?.base ?? null, uncommitted: had?.uncommitted ?? null };
    this.files.set(b.name, entry);
    const there = b.worktree && !b.worktree.gone && !b.here ? checkoutOf(b.worktree.path) : null;
    void (async () => {
      const [of, state] = await Promise.all([
        base ? branchChangedLater(c.root, base, b.name) : Promise.resolve(null),
        there ? checkoutStateLater(there) : null,
      ]);
      entry.base = of ?? [];
      entry.uncommitted = state?.entries ?? [];
      this.app.host.requestRender();
    })();
    return entry;
  }

  // ---------------------------------------------------------------------------------------------
  // What a branch's row does

  /** The panel's action on a branch's rows. */
  action(row: BranchViewRow, action: string): void {
    const b = row.branch;
    if (row.kind === "bfile" && (action === "open" || action === "expand")) return void this.fileDiff(row);
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
      case "collapse":
        this.opened.delete(b.name);
        this.app.sidebar.selected = Math.max(
          0,
          this.app.gitPanel.rows().findIndex((r) => r.kind === "branch" && r.branch.name === b.name),
        );
        return;
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
          const why = switchBranch(c, b.name);
          if (why) return app.message("warn", `git: ${why}`);
          app.git.checkHead();
          void app.git.refreshNow().then(() => app.host.requestRender());
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
        return void app.git.refreshNow().then(() => app.host.requestRender());
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
    const b = row.branch;
    let before = "";
    let now = "";
    const back = backToPanel(app);
    if (row.against === "uncommitted" && b.worktree) {
      before = showAt({ root: b.worktree.path }, "HEAD", row.path) ?? "";
      try {
        now = readFileSync(join(b.worktree.path, row.path), "utf8");
      } catch {}
    } else if (row.base) {
      const from = await mergeBaseLater(c.root, row.base, b.name);
      before = from ? (showAt(c, from, row.path) ?? "") : "";
      now = showAt(c, b.name, row.path) ?? "";
    }
    const against = row.against === "base" ? `against ${sanitize(row.base ?? "")}` : "not committed";
    openDiff(app, {
      before,
      now,
      path: join(c.root, row.path),
      title: `${sanitize(b.name)}: ${sanitize(row.path)} ${against} — esc: source control`,
      none: `${row.path}: nothing to show`,
      back,
    });
    app.host.requestRender();
  }

  /** "Compare against…" (GIT-D10): another base for a branch, kept; or back to the one guessed. */
  private compare(b: Branch): void {
    const app = this.app;
    const c = app.git.checkout;
    const got = this.branches();
    if (!c || !got) return;
    const kept = keptBases(c)[b.name];
    const others = got.branches.map((x) => x.name).filter((n) => n !== b.name);
    app.overlays.openList({
      title: `Compare ${sanitize(b.name)} against…`,
      items: [
        ...(kept ? [{ label: "The base guessed from [git] bases", detail: `now ${kept}, kept`, data: null }] : []),
        ...others.map((n) => ({ label: sanitize(n), detail: n === kept ? "kept" : "", data: n })),
      ],
      accept: (item) => {
        keepBase(c, b.name, item.data as string | null);
        this.stats.delete(b.name);
        this.files.delete(b.name);
        app.git.forgetBase();
        app.message(
          "info",
          item.data ? `${b.name} is compared against ${item.data} now` : `${b.name}'s base is guessed again`,
        );
      },
    });
  }

  /**
   * Remove a worktree (GIT-D9): only one whose branch is merged into its base, and none with uncommitted changes —
   * refused, said why — after asking; its branch kept unless asked.
   */
  private remove(b: Branch): void {
    const app = this.app;
    const c = app.git.checkout;
    const w = b.worktree;
    if (!c || !w) return app.message("info", `${b.name} has no worktree to remove`);
    if (b.here) return app.message("info", "the worktree you're in can't be removed from here: go into another first");
    if (w.main) return app.message("info", "the main checkout isn't a worktree to remove");
    void this.ask(b).then((st) => {
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
      app.overlays.openList({
        title: `Remove the worktree ${tildePath(w.path)}?`,
        filterable: false,
        items: [
          { label: `Remove it, keep ${sanitize(b.name)}`, data: "keep" },
          { label: `Remove it and the branch ${sanitize(b.name)}`, detail: `merged into ${st.base}`, data: "both" },
          { label: "Cancel", data: "cancel" },
        ],
        accept: (item) => {
          if (item.data === "cancel") return;
          const why = removeWorktree(c.root, w.path, item.data === "both" ? b.name : null);
          if (why) return app.message("warn", `git: ${why}`);
          this.opened.delete(b.name);
          app.message(
            "info",
            `removed the worktree ${tildePath(w.path)}${item.data === "both" ? `, and ${b.name}` : `; ${b.name} kept`}`,
          );
          void app.git.refreshNow().then(() => app.host.requestRender());
        },
      });
    });
  }

  /** "Open in a worktree": a worktree made for a branch checked out nowhere, in the folder `[git] worktrees` names; gone into. */
  private worktreeFor(b: Branch): void {
    const app = this.app;
    const c = app.git.checkout;
    if (!c) return;
    const folder = worktreeFolder(app.config.git.worktrees, c.main ?? c.root, b.name);
    this.askFolder(folder, (to) => {
      const why = addWorktree(c.root, to, b.name);
      if (why) return app.message("warn", `git: ${why}`);
      app.message("info", `${b.name} is in a worktree at ${tildePath(to)}`);
      void app.git.refreshNow().then(() => {
        app.host.requestRender();
        this.goInto({ ...b, worktree: { path: to, main: false, gone: false } });
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
   * A new branch (GIT-D9): its name, where it starts (`From`: this branch, the bases, any branch, a commit), and where it
   * goes — a new worktree, by default in `[git] worktrees`'s folder; checked out here; or just made. Its base is the
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
    const done = (said: string) => {
      app.message("info", said);
      this.opened.add(name);
      void app.git.refreshNow().then(() => {
        const i = app.gitPanel.rows().findIndex((r) => r.kind === "branch" && r.branch.name === name);
        if (i >= 0) app.sidebar.selected = i;
        app.host.requestRender();
      });
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
        const inWorktree = (to: string) => {
          if (!make()) return;
          const why = addWorktree(c.root, to, name);
          if (why) return app.message("warn", `${name} made, but git: ${why}`);
          done(`made ${name} from ${from}, in a new worktree at ${tildePath(to)} — o goes into it`);
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
        if (how === "make") return make() && done(`made ${name} from ${from}`);
        app.git.beforeCheckout(() => {
          if (!make()) return;
          const why = switchBranch(c, name);
          if (why) return app.message("warn", `${name} made, but git: ${why}`);
          app.git.checkHead();
          done(`made ${name} from ${from}, and checked it out`);
        });
      },
    });
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
    const st = await this.ask(b);
    const into = st?.base;
    if (!into) return app.message("info", `${b.name} has no base to merge into — Compare against… sets one`);
    const target = got.branches.find((x) => x.name === into);
    const where = target?.here ? c.root : target?.worktree && !target.worktree.gone ? target.worktree.path : null;
    app.overlays.openList({
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
        if (item.data === "other") return this.mergeInto(b, got.branches);
        this.runMerge(b.name, into, where!, !!target?.here);
      },
    });
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
        void app.git.refreshNow().then(() => app.host.requestRender());
      });
    };
    if (here) app.git.beforeCheckout(go, { verb: "merge", noun: "the merge", done: "merged" });
    else go();
  }
}

/** A path of the checkout, as the vault knows it; null outside it. */
export function vaultPath(app: App, path: string): string | null {
  const c = app.git.checkout;
  return c ? inVault(c, app.loc.root, path) : null;
}
