// Git base memoization and foreground base resolution retain their original generation and cancellation rules.
import { baseFor, baseForLater } from "../../../../core/workspace/git/gitbase.ts";
import { type Checkout, headOf } from "../../../../core/workspace/git/git.ts";
import { baseBranch, baseBranchLater } from "../../../../core/workspace/git/branches/gitops.ts";
import type { GitBaseHost } from "./contracts.ts";

export class GitBases {
  constructor(private readonly host: GitBaseHost) {}
  get app() {
    return this.host.app;
  }

  private baseMemo: { key: string; base: string | null } | null = null;

  private fallbackMemo: { key: string; base: string | null } | null = null;

  /**
   * A branch's own base (GIT-D10): kept when slipbox made it, else the nearest of `[git] bases`, else `[git] base`,
   * main or master; null for the base itself, or with none. Asked of git once each time it has news.
   */
  baseOf(c: Checkout, branch: string | null): string | null {
    if (!branch) return this.fallbackBase(c);
    const key = `${this.host.generation}\0${c.root}\0${branch}`;
    if (this.baseMemo?.key !== key)
      this.baseMemo = { key, base: baseFor(c, branch, this.app.config.git)?.base ?? null };
    return this.baseMemo.base;
  }

  /**
   * `[git] base`, else main or master, as there are (`baseBranch`): asked of git once each time it has news, not on
   * every frame that draws it.
   */
  fallbackBase(c: Checkout): string | null {
    const key = `${this.host.generation}\0${c.root}\0${this.app.config.git.base}`;
    if (this.fallbackMemo?.key !== key) this.fallbackMemo = { key, base: baseBranch(c, this.app.config.git.base) };
    return this.fallbackMemo.base;
  }

  /** The base asked again (one kept or dropped: "Compare against…"). */
  forgetBase(): void {
    this.baseMemo = null;
    this.fallbackMemo = null;
  }

  /**
   * The base branch here, not waiting on git: this branch's own (GIT-D10); on a detached HEAD, or where it has none,
   * the fallback (`[git] base`, else main or master). Null when the read is no longer wanted, or there's none: then
   * said.
   */
  async baseLater(c: Checkout, query: { signal: AbortSignal; current: () => boolean }): Promise<string | null> {
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
}
