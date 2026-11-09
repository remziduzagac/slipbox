// A branch's commits and a commit's files (EG-D4), asked of git in the background as the panel draws them: a branch's
// again whenever git has news (the checkout's last answer shown meanwhile, against the same base); a commit's once,
// since what a commit changed never changes.

import type { Changed } from "../../../../../core/workspace/git/branches/gitops.ts";
import {
  type BranchCommit,
  branchLogLater,
  commitFilesLater,
} from "../../../../../core/workspace/git/history/gitlog.ts";
import type { App } from "../../../../app/runtime/app.ts";

/** A branch's commits as git last listed them in a checkout: asked by `key`, null until the first answer. */
interface Listed {
  key: string;
  base: string;
  commits: BranchCommit[] | null;
}

/** The most commits a branch lists. */
export const MAX_COMMITS = 500;

export class CommitReads {
  constructor(private readonly app: App) {}

  /** By checkout and branch: back in a checkout, its last answer is shown at once, not asked again from nothing. */
  private lists = new Map<string, Listed>();

  private files = new Map<string, Changed[] | null>();

  /**
   * `branch`'s commits since `base`, newest first: asked when git has news (or the branch's tip moved, `tip`); the last
   * answer meanwhile, null before the first.
   */
  commitsOf(branch: string, base: string, tip = ""): BranchCommit[] | null {
    const c = this.app.git.checkout;
    if (!c) return null;
    const id = `${c.root}\0${branch}`;
    const key = `${this.app.git.generation}\0${base}\0${tip}`;
    const had = this.lists.get(id);
    if (had?.key === key) return had.commits;
    const asked: Listed = { key, base, commits: had?.base === base ? had.commits : null };
    this.lists.set(id, asked);
    void branchLogLater(c, base, branch, MAX_COMMITS).then((commits) => {
      if (this.lists.get(id) !== asked) return;
      asked.commits = commits ?? [];
      this.app.host.requestRender();
    });
    return asked.commits;
  }

  /** A commit's files, by path: asked once, null until git answers (a failure, none). */
  filesOf(commit: BranchCommit): Changed[] | null {
    const c = this.app.git.checkout;
    if (!c) return null;
    const key = `${c.common}\0${commit.hash}`;
    if (this.files.has(key)) return this.files.get(key)!;
    this.files.set(key, null);
    void commitFilesLater(c, commit).then((files) => {
      this.files.set(key, files ?? []);
      this.app.host.requestRender();
    });
    return null;
  }
}
