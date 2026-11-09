// A branch's commits (EG-D4; `app.gitLog`): in the git panel, "This branch's commits", after what it changed against
// its base — the commits since the branch's own base, newest first — and a branch's opened up in Branches, under its
// files; `:log` lists the same in a window (list.ts). `enter`, `l` or a click opens a commit up into its files, each
// with its state letter; `enter` on one shows that commit's change to it in the diff window, as every diff is drawn,
// `esc` back where it was asked from. Read in the background (reads.ts); rows known by what they are (D261).

import { existsSync } from "node:fs";
import { join } from "node:path";
import { headOf } from "../../../../../core/workspace/git/git.ts";
import { type Changed, inVault, showLater } from "../../../../../core/workspace/git/branches/gitops.ts";
import type { Branch } from "../../../../../core/workspace/git/branches/gitbranches.ts";
import type { BranchCommit } from "../../../../../core/workspace/git/history/gitlog.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import { match } from "../../../../shell/overlays/match.ts";
import type { App } from "../../../../app/runtime/app.ts";
import { beginGitRead } from "../../gitquery.ts";
import { openDiff } from "../changes/diffview.ts";
import { backToPanel } from "../panel/gitview.ts";
import type { CommitFileRow, CommitRow, PanelRow } from "../contracts.ts";
import { CommitReads } from "./reads.ts";
import { commitTitle, openLog } from "./list.ts";

/** A commit's file as a diff's title names it: a rename's old path before its new. */
const fileTitle = (f: Changed) => sanitize(f.from ? `${f.from} → ${f.path}` : f.path);

export class GitLog {
  readonly reads: CommitReads;

  constructor(readonly app: App) {
    this.reads = new CommitReads(app);
  }

  /** The commits opened up into their files: `branch\0hash`, this branch's section's with no branch. */
  readonly opened = new Set<string>();

  private key = (branch: Branch | null, k: BranchCommit) => `${branch?.name ?? ""}\0${k.hash}`;

  /** This branch and its own base, when it has one: none on a detached HEAD, nor on the base itself. */
  here(): { branch: string; base: string } | null {
    const c = this.app.git.checkout;
    const branch = c ? headOf(c).branch : null;
    if (!c || !branch) return null;
    const base = this.app.git.baseOf(c, branch);
    return base && base !== branch ? { branch, base } : null;
  }

  /** "This branch's commits": its heading, then each commit, opened up into its files; the filter keeps commits by
   *  their hash and subject. */
  rows(q: string): PanelRow[] {
    const here = this.here();
    const commits = here ? this.reads.commitsOf(here.branch, here.base) : null;
    const shown = (commits ?? []).filter((k) => !q || match(q, `${k.hash.slice(0, 7)} ${k.subject}`));
    if (!shown.length) return [];
    const rows: PanelRow[] = [
      { kind: "heading", section: "commits", label: `This branch's commits (${shown.length})` },
    ];
    if (this.app.gitPanel.folded.has("commits") && !q) return rows;
    for (const k of shown) rows.push(...this.commitRows(k, null));
    return rows;
  }

  /** A branch opened up in Branches: its commits since its base, under `Commits (n)`. */
  branchRows(b: Branch, base: string): PanelRow[] {
    const commits = this.reads.commitsOf(b.name, base, b.tip);
    return [
      {
        kind: "bsub",
        branch: b,
        against: "commits",
        label: commits ? `Commits (${commits.length})` : "Commits: asking git…",
      },
      ...(commits ?? []).flatMap((k) => this.commitRows(k, b)),
    ];
  }

  /** A commit's row and, opened up, its files. */
  private commitRows(k: BranchCommit, branch: Branch | null): PanelRow[] {
    const open = this.opened.has(this.key(branch, k));
    const rows: PanelRow[] = [{ kind: "commit", commit: k, branch, open }];
    if (!open) return rows;
    const files = this.reads.filesOf(k);
    if (files === null) return [...rows, { kind: "note", text: "asking git…" }];
    const c = this.app.git.checkout!;
    for (const file of files)
      rows.push({ kind: "cfile", commit: k, branch, file, rel: inVault(c, this.app.loc.root, file.path) });
    return rows;
  }

  /** The panel's action on a commit's row, or one of its files'. */
  action(row: CommitRow | CommitFileRow, action: string): void | Promise<void> {
    const app = this.app;
    const key = this.key(row.branch, row.commit);
    const commitRow = (r: PanelRow) =>
      r.kind === "commit" && r.commit.hash === row.commit.hash && r.branch?.name === row.branch?.name;
    if (row.kind === "cfile") {
      switch (action) {
        case "open":
        case "expand":
          return this.fileDiff(row, backToPanel(app), "source control");
        case "go":
          return this.openFile(row);
        case "collapse":
          this.opened.delete(key);
          return app.gitPanel.selectWhere(commitRow);
        case "menu":
          return this.menu(row);
      }
      return;
    }
    switch (action) {
      case "open":
        if (this.opened.has(key)) this.opened.delete(key);
        else this.opened.add(key);
        return;
      case "expand":
        this.opened.add(key);
        return;
      case "collapse":
        if (this.opened.delete(key) || !row.branch) return;
        // Folded already, under a branch: the branch folds, as from its files.
        return app.gitPanel.branches.action({ kind: "branch", branch: row.branch, open: true }, "collapse");
      case "menu":
        return this.menu(row);
    }
  }

  /**
   * A commit's change to one of its files, in the diff window (GIT-D2): its text in the commit's first parent, a
   * rename's under the name it had there, and in the commit. `esc`: `back`, which the title names (`backTo`).
   */
  async fileDiff(
    row: Pick<CommitFileRow, "commit" | "file" | "rel">,
    back: () => void | Promise<void>,
    backTo: string,
  ): Promise<void> {
    const app = this.app;
    const c = app.git.checkout;
    if (!c) return;
    const k = row.commit;
    const f = row.file;
    const query = beginGitRead(app, "Reading the commit's change");
    const [before, now] = await Promise.all([
      k.parent && f.state !== "new" ? showLater(c, k.parent, f.from ?? f.path, query.signal) : Promise.resolve(""),
      f.state === "deleted" ? Promise.resolve("") : showLater(c, k.hash, f.path, query.signal),
    ]);
    if (!query.current()) return;
    openDiff(app, {
      before: before ?? "",
      now: now ?? "",
      path: row.rel ?? join(c.root, f.path),
      title: `${commitTitle(k)}: ${fileTitle(f)} — esc: ${backTo}`,
      none: `${f.path}: nothing to show`,
      back,
    });
    app.host.requestRender();
  }

  /** `o` on a commit's file: the file as it is now, opened. */
  private openFile(row: CommitFileRow): void {
    const app = this.app;
    if (row.rel === null) return app.message("warn", `${row.file.path} is outside this vault`);
    if (!existsSync(join(app.loc.root, row.rel))) return app.message("info", `${row.rel} isn't here now`);
    app.openOrSwitchTab(row.rel);
    app.region = "content";
  }

  /** A commit's menu, or its file's (`.`, a right click): what its keys do, and copying it. */
  menu(row: CommitRow | CommitFileRow, at?: { x: number; y: number }): void {
    const app = this.app;
    const items: { label: string; action: string; run: () => void }[] =
      row.kind === "commit"
        ? [
            { label: row.open ? "Fold its files" : "Its files", action: "open", run: () => this.action(row, "open") },
            { label: "Copy its hash", action: "", run: () => void app.copy(row.commit.hash) },
          ]
        : [
            { label: "Its change", action: "open", run: () => this.action(row, "open") },
            { label: "Open it", action: "go", run: () => this.action(row, "go") },
            { label: "Copy its path", action: "", run: () => void app.copy(row.rel ?? row.file.path) },
          ];
    app.overlays.openList({
      title: row.kind === "commit" ? commitTitle(row.commit) : sanitize(row.file.path),
      filterable: false,
      anchor: at,
      menu: true,
      items: items.map((it) => {
        const key = it.action ? app.gitPanel.keyFor(it.action) : null;
        return { label: it.label, hint: key ?? undefined, ...(key?.length === 1 ? { hotkey: key } : {}), data: it };
      }),
      accept: (item) => {
        app.region = "sidebar";
        (item.data as (typeof items)[number]).run();
      },
    });
  }

  /** `:log` (`git.log`, `space g l`): this branch's commits in a window. */
  open(): Promise<void> {
    return openLog(this.app);
  }
}
