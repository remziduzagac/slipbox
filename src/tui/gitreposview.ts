// The git panel following the vault (VV-D10, GIT-D11): the repositories in the explorer's view — under the current
// vault's own panel, folded, when it's a repository; the panel itself when it isn't (home, a vault without git,
// Elsewhere) — each with what it has to say, ordered by what needs attention, opened up in place (its checkouts, a
// worktree's branch among them; its changes, a file's diff a click away), gone into with `o`. In home, the rest of home's
// repositories folded and counted under them. git is asked only about the rows on screen, in the background, again
// when it has news and when the panel is opened.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Checkout } from "../core/git.ts";
import { showAt } from "../core/gitops.ts";
import type { StatusEntry } from "../core/gitstage.ts";
import { attention, type CheckoutState, checkoutStateLater, type RepoFound, reposUnder } from "../core/gitrepos.ts";
import { repoKey } from "../core/gitbase.ts";
import { tildePath } from "../core/names.ts";
import { sanitize } from "../core/sanitize.ts";
import { homeFolder, isInside, isVaultRoot, rootAt } from "../core/vault.ts";
import { openDiff } from "./diffview.ts";
import { match } from "./match.ts";
import type { App } from "./app.ts";
import type { PanelRow } from "./gitpanel.ts";

/** A repository's row; `open` while it's opened up. */
export interface RepoRow {
  kind: "repo";
  repo: RepoFound;
  open: boolean;
}

/** One of a repository's checkouts, opened up: the main one, a worktree with its branch. */
export interface RepoCheckoutRow {
  kind: "rcheckout";
  repo: RepoFound;
  checkout: Checkout;
}

/** A file a checkout changed, not committed. */
export interface RepoFileRow {
  kind: "rfile";
  repo: RepoFound;
  checkout: Checkout;
  entry: StatusEntry;
}

export type RepoViewRow = RepoRow | RepoCheckoutRow | RepoFileRow;

/** The repositories found in a folder, by the question asked. */
interface Found {
  key: string;
  repos: RepoFound[] | null;
}

/** The repositories in the view and in home: found, each checkout's state asked when its row shows. */
export class RepoView {
  constructor(readonly app: App) {}

  private view: Found | null = null;
  private home: Found | null = null;
  private states = new Map<string, { key: string; state: CheckoutState | null; asking: boolean }>();
  /** The repositories opened up, by key. */
  readonly opened = new Set<string>();
  /** Bumped when the panel is opened: everything asked again (VV-D10, the focus coming back). */
  private round = 0;

  /** Asked again: the panel opened, git's news. */
  again(): void {
    this.round++;
  }

  private found(slot: "view" | "home", dir: string): RepoFound[] | null {
    const key = `${this.round}\0${dir}`;
    const had = this[slot];
    if (had?.key !== key) {
      const asked: Found = { key, repos: had?.repos ?? null };
      this[slot] = asked;
      void reposUnder(dir).then((repos) => {
        if (this[slot] !== asked) return;
        asked.repos = repos;
        this.app.host.requestRender();
      });
    }
    return this[slot]!.repos;
  }

  /** A checkout's state: asked when its row is on screen and git has had news since; null until it has answered. */
  stateOf(c: Checkout): CheckoutState | null {
    const key = `${this.round}\0${this.app.git.generation}`;
    const had = this.states.get(c.root);
    if (had?.key === key || had?.asking) return had?.state ?? null;
    const entry = { key, state: had?.state ?? null, asking: true };
    this.states.set(c.root, entry);
    void checkoutStateLater(c).then((state) => {
      entry.state = state;
      entry.asking = false;
      this.app.host.requestRender();
    });
    return entry.state;
  }

  /** What a checkout's state is already known to be, not asking. */
  known(c: Checkout): CheckoutState | null {
    return this.states.get(c.root)?.state ?? null;
  }

  /**
   * The rows: the repositories in the view (the current vault's own left out, it has the panel), by what needs
   * attention; `mode` "all" when they're the panel, "others" folded under it. In home, the rest of home's after them.
   */
  rows(mode: "all" | "others"): PanelRow[] {
    const app = this.app;
    const p = app.gitPanel;
    const q = app.sidebar.filter ?? "";
    const view = app.explorer.top || app.loc.root;
    const own = app.git.checkout ? repoKey(app.git.checkout) : null;
    const repos = this.found("view", view);
    const rows: PanelRow[] = [];
    if (repos === null) return mode === "all" ? [{ kind: "note", text: "looking for repositories…" }] : [];
    const list = this.ordered(repos.filter((r) => r.key !== own && (!q || match(q, r.name))));
    if (mode === "all")
      rows.push({
        kind: "note",
        text: list.length
          ? `${tildePath(view)} holds ${list.length} ${list.length === 1 ? "repository" : "repositories"}`
          : q
            ? "no matches"
            : `no git repository in ${tildePath(view)}`,
      });
    if (list.length && mode === "others") {
      rows.push({ kind: "heading", section: "repos", label: `Other repositories (${list.length})` });
      if (p.folded.has("repos") && !q) return rows;
    }
    for (const r of list) rows.push(...this.repoRows(r));
    // Home's others, folded and counted (VV-T8): where they're the panel, and the view is a folder in home.
    const home = homeFolder();
    if (mode === "all" && view !== home && isInside(home, view)) {
      const all = this.found("home", home);
      const seen = new Set(repos.map((r) => r.key));
      const rest = (all ?? []).filter((r) => !seen.has(r.key) && r.key !== own && (!q || match(q, r.name)));
      if (rest.length) {
        rows.push({ kind: "heading", section: "home", label: `Elsewhere in home (${rest.length})` });
        if (!p.folded.has("home") || q) for (const r of this.ordered(rest)) rows.push(...this.repoRows(r));
      }
    }
    return rows;
  }

  /** By what needs attention (VV-D10), as far as git has said; then by name. */
  private ordered(repos: RepoFound[]): RepoFound[] {
    const score = (r: RepoFound) => attention(r.checkouts.map((c) => this.known(c)));
    return [...repos].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  }

  /** A repository's row; opened up, its checkouts, and the main one's uncommitted files. */
  private repoRows(r: RepoFound): PanelRow[] {
    const open = this.opened.has(r.key);
    const rows: PanelRow[] = [{ kind: "repo", repo: r, open }];
    if (!open) return rows;
    for (const c of r.checkouts) {
      rows.push({ kind: "rcheckout", repo: r, checkout: c });
      for (const e of this.stateOf(c)?.entries ?? []) rows.push({ kind: "rfile", repo: r, checkout: c, entry: e });
    }
    return rows;
  }

  /** What a repository says at its row's end: its checkouts' uncommitted files, ahead and behind; clean. */
  summary(r: RepoFound): { text: string; review: boolean } | null {
    const g = this.app.glyphs;
    const states = r.checkouts.map((c) => this.stateOf(c));
    if (states.every((s) => !s)) return null;
    const changed = states.reduce((n, s) => n + (s?.entries.length ?? 0), 0);
    const t = states[0]?.track;
    const parts = [
      changed ? `${g.git.edited}${changed}` : "",
      t?.ahead ? `${g.gitAhead}${t.ahead}` : "",
      t?.behind ? `${g.gitBehind}${t.behind}` : "",
    ].filter(Boolean);
    const review = states.slice(1).some((s) => s?.entries.length);
    return { text: parts.length ? parts.join(" ") : "clean", review };
  }

  /** The panel's action on a repository's rows. */
  action(row: RepoViewRow, action: string): void {
    const r = row.repo;
    switch (action) {
      case "open":
        if (row.kind === "rfile") return this.fileDiff(row);
        if (row.kind === "rcheckout") return this.goInto(row.checkout);
        if (this.opened.has(r.key)) this.opened.delete(r.key);
        else this.opened.add(r.key);
        return;
      case "expand":
        if (row.kind === "rfile") return this.fileDiff(row);
        this.opened.add(r.key);
        return;
      case "collapse":
        this.opened.delete(r.key);
        this.app.sidebar.selected = Math.max(
          0,
          this.app.gitPanel.rows().findIndex((x) => x.kind === "repo" && x.repo.key === r.key),
        );
        return;
      case "go":
        return this.goInto(
          row.kind === "repo" ? r.checkouts[0]! : row.checkout,
          row.kind === "rfile" ? row.entry.path : null,
        );
      case "menu":
        return this.menu(row);
    }
  }

  /** Into a repository's vault (VV-D4), or a worktree's — at a file of it, when one was picked. */
  goInto(c: Checkout, file: string | null = null): void {
    const app = this.app;
    if (!isVaultRoot(c.root) && !existsSync(join(c.root, ".git")))
      return app.message("warn", `${tildePath(c.root)} isn't a repository any more`);
    const at = file && existsSync(join(c.root, file)) ? join(c.root, file) : null;
    app.vaults.switchVault(rootAt(c.root), at);
  }

  /** A row's menu: going in, opening up, copying the path. */
  menu(row: RepoViewRow, at?: { x: number; y: number }): void {
    const app = this.app;
    const c = row.kind === "repo" ? row.repo.checkouts[0]! : row.checkout;
    const items = [
      { label: "Go into it", data: "go" },
      ...(row.kind === "rfile" ? [{ label: "Its diff", data: "open" }] : []),
      { label: "Copy its path", data: "copy" },
    ];
    app.overlays.openList({
      title: sanitize(row.kind === "rfile" ? row.entry.path : row.repo.name),
      filterable: false,
      anchor: at,
      menu: true,
      items,
      accept: (item) => {
        if (item.data === "copy")
          return void app.copy(row.kind === "rfile" ? join(row.checkout.root, row.entry.path) : c.root);
        this.action(row, item.data as string);
      },
    });
  }

  /** A checkout's uncommitted file, its diff against the last commit in the diff window. */
  private fileDiff(row: RepoFileRow): void {
    const app = this.app;
    const c = row.checkout;
    const abs = join(c.root, row.entry.path);
    let now = "";
    try {
      now = existsSync(abs) ? readFileSync(abs, "utf8") : "";
    } catch {}
    const before = row.entry.x === "?" ? "" : (showAt(c, "HEAD", row.entry.path) ?? "");
    const from = app.region;
    openDiff(app, {
      before,
      now,
      path: abs,
      title: `${tildePath(c.root)}: ${sanitize(row.entry.path)} against its last commit — esc: source control`,
      none: `${row.entry.path}: nothing to show`,
      back: () => {
        if (from === "sidebar" && app.panels.sidebarShown) app.region = "sidebar";
      },
    });
  }

  /** A checkout's line, opened up: the main one or a worktree, its branch and where it is. */
  checkoutLabel(r: RepoFound, c: Checkout): { mark: string; branch: string; where: string } {
    const g = this.app.glyphs;
    const s = this.known(c);
    const main = c === r.checkouts[0] && !c.worktree;
    return {
      mark: main ? g.git.here : g.git.worktree,
      branch: sanitize(s?.branch ?? "…"),
      where: tildePath(c.root),
    };
  }
}
