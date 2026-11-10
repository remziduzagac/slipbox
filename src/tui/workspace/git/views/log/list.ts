// `:log` (`git.log`, `space g l`; EG-D4): this branch's commits since its own base in a window, as `:changes` lists the
// files — newest first, each its short hash, subject, author and day. `enter` on one lists its files; `enter` on a
// file shows the commit's change to it in the diff window; `esc` goes back a step each time: the files, the commits.

import { headOf } from "../../../../../core/workspace/git/git.ts";
import { inVault, type GitState } from "../../../../../core/workspace/git/branches/gitops.ts";
import {
  type BranchCommit,
  branchLogLater,
  commitFilesLater,
} from "../../../../../core/workspace/git/history/gitlog.ts";
import type { Role } from "../../../../../core/rendering/theme/index.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import type { App } from "../../../../app/runtime/app.ts";
import { beginGitRead } from "../../gitquery.ts";
import { GIT_MARK } from "../../marks.ts";
import { MAX_COMMITS } from "./reads.ts";

/** A commit's date, as a day. */
export const day = (time: number) => new Date(time * 1000).toISOString().slice(0, 10);

/** A commit as a title names it: its short hash and its subject. */
export const commitTitle = (k: BranchCommit) => `${k.hash.slice(0, 7)} ${sanitize(k.subject)}`;

/** A file's state letter's colour, as `:changes` has them. */
const ROLE: Record<GitState, Role> = {
  new: "git_new",
  modified: "git_modified",
  renamed: "git_modified",
  deleted: "diff_del",
  conflict: "git_conflict",
};

const files = (n: number) => `${n} file${n === 1 ? "" : "s"}`;

/** This branch's commits since its base, in a window; `selected`, the commit to select (coming back from its files). */
export async function openLog(app: App, selected?: string): Promise<void> {
  const c = app.git.checkout;
  if (!c) return app.message("info", "not in a git repository");
  const here = app.gitLog.here();
  if (!here) {
    const branch = headOf(c).branch;
    return app.message(
      "info",
      branch
        ? `${sanitize(branch)} is a base: :log lists a branch's commits since its own base`
        : "HEAD is detached: :log lists a branch's commits since its base",
    );
  }
  const query = await beginGitRead(app, "Reading the branch's commits");
  if (!query) return;
  const commits = await branchLogLater(c, here.base, here.branch, MAX_COMMITS, query.signal);
  if (!(await query.current())) return;
  if (commits === null) return app.message("warn", "git couldn't list the branch's commits");
  if (!commits.length) return app.message("info", `no commits since ${sanitize(here.base)}`);
  app.overlays.openList({
    title: `${sanitize(here.branch)}: ${commits.length} commit${commits.length === 1 ? "" : "s"} since ${sanitize(here.base)} — enter: its files`,
    items: commits.map((k) => ({
      label: commitTitle(k),
      detail: `${sanitize(k.author)} · ${day(k.time)}`,
      data: k,
    })),
    selected: Math.max(
      0,
      commits.findIndex((k) => k.hash === selected),
    ),
    accept: (item) => openCommit(app, item.data as BranchCommit),
  });
  app.host.requestRender();
}

/** A commit's files, in a window; `enter`: its change to one; `esc`: the commits again. */
async function openCommit(app: App, k: BranchCommit, selected?: string): Promise<void> {
  const c = app.git.checkout;
  if (!c) return;
  const query = await beginGitRead(app, "Reading the commit's files");
  if (!query) return;
  const changed = await commitFilesLater(c, k, query.signal);
  if (!(await query.current())) return;
  if (changed === null) return app.message("warn", `git couldn't list ${k.hash.slice(0, 7)}'s files`);
  const back = () => openLog(app, k.hash);
  if (!changed.length) {
    app.message("info", `${k.hash.slice(0, 7)} changed no file`);
    return back();
  }
  app.overlays.openList({
    title: `${commitTitle(k)}: ${files(changed.length)} — enter: its change · esc: the commits`,
    items: changed.map((f) => {
      const rel = inVault(c, app.loc.root, f.path);
      return {
        label: `${GIT_MARK[f.state]} ${sanitize(rel ?? f.path)}`,
        role: ROLE[f.state],
        detail: f.from ? `from ${sanitize(inVault(c, app.loc.root, f.from) ?? f.from)}` : undefined,
        data: { file: f, rel },
      };
    }),
    selected: Math.max(
      0,
      changed.findIndex((f) => f.path === selected),
    ),
    accept: (item) => {
      const { file, rel } = item.data as { file: (typeof changed)[number]; rel: string | null };
      return app.gitLog.fileDiff({ commit: k, file, rel }, () => openCommit(app, k, file.path), "the files");
    },
    cancel: () => void back(),
  });
  app.host.requestRender();
}
