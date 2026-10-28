// Branch list/stat/file answers keep their original keys, last-answer admission and live visit guard.
import { checkoutOf } from "../../../../../core/workspace/git/git.ts";
import { refName } from "../../../../../core/workspace/git/branches/gitops.ts";
import {
  aheadBehindLater,
  type Branch,
  type BranchStats,
  branchChangedLater,
  branchesLater,
  dirtyLater,
  mergedLater,
} from "../../../../../core/workspace/git/branches/gitbranches.ts";
import { candidates, keptBases, nearest } from "../../../../../core/workspace/git/gitbase.ts";
import { checkoutStateLater } from "../../../../../core/workspace/git/gitrepos.ts";
import type { BranchFiles, BranchList } from "../contracts.ts";
import type { BranchReadHost } from "../contracts.ts";

/**
 * The list git's answer to `asked` is shown on, `now` the list asked last: `asked` itself while it's the last; else, a
 * newer question overtaking it, that one while what it shows is older (the same repository's, an earlier answer) —
 * git's news never leaves the list on one from before. A failure (null) is never shown: what's listed stays. Null: not
 * shown.
 */
export function shownOn(now: BranchList | null, asked: BranchList, branches: Branch[] | null): BranchList | null {
  if (branches === null) return null;
  if (now === asked) return asked;
  if (!now || now.root !== asked.root || now.answered >= asked.generation) return null;
  return now;
}

export class BranchReads {
  /** Drop just this branch's open-row answers when its comparison base changes. */
  forgetBranch(name: string): void {
    this.stats.delete(name);
    this.files.delete(name);
  }

  constructor(private readonly host: BranchReadHost) {}
  get app() {
    return this.host.app;
  }
  get currentList(): BranchList | null {
    return this.list;
  }

  private list: BranchList | null = null;

  private stats = new Map<string, { key: string; stats: BranchStats | null; asking: boolean }>();

  private files = new Map<string, BranchFiles>();

  /** The question asked of git: the repository's state as last seen (any news asks again). */
  private key(): string {
    return `${this.app.git.generation}\0${this.app.loc.root}`;
  }

  /** The branches, asked of git when it has news; the last answer meanwhile, null before the first. */
  branches(): { branches: Branch[]; merged: Set<string> } | null {
    const c = this.app.git.checkout;
    if (!c) return null;
    const root = this.app.loc.root;
    const generation = this.app.git.generation;
    if (this.list?.root !== root || this.list.generation !== generation) {
      // What's shown meanwhile: the last answer, the same repository's only.
      const had = this.list?.root === root ? this.list : null;
      const asked: BranchList = {
        root,
        generation,
        branches: had?.branches ?? null,
        merged: had?.merged ?? new Set<string>(),
        asking: null,
        answered: had?.answered ?? -1,
      };
      this.list = asked;
      asked.asking = (async () => {
        const branches = await branchesLater(c);
        const kept = keptBases(c);
        const git = this.app.config.git;
        const fallback = this.app.git.fallbackBase(c);
        const bases = [
          ...new Set([...candidates("", git), ...Object.values(kept), ...(fallback ? [fallback] : [])]),
        ].filter(refName);
        const sets = await Promise.all(bases.map((b) => mergedLater(c.root, b)));
        const into = new Map(bases.map((b, i) => [b, sets[i]] as const));
        const merged = new Set<string>();
        for (const b of branches ?? []) {
          // Merged into its kept base; else into any of its candidates, the nearest then (it leaves nothing of its
          // own).
          const k = kept[b.name];
          const of = k ? [k] : candidates(b.name, git);
          if (of.some((x) => into.get(x)?.has(b.name))) merged.add(b.name);
        }
        const shown = shownOn(this.list, asked, branches);
        if (!shown) return;
        shown.branches = branches;
        shown.merged = merged;
        shown.answered = asked.generation;
        this.app.host.requestRender();
      })().finally(() => {
        asked.asking = null;
      });
    }
    return this.list.branches ? { branches: this.list.branches, merged: this.list.merged } : null;
  }

  /**
   * Once a list of the branches asked for since this was called is shown — the repository as it is now, or newer:
   * true, unless the vault was left meanwhile or git couldn't list them. What a branch just made waits for, to be
   * selected. Each round waits for one of git's answers; with nothing asked, nothing to wait for.
   */
  async listed(): Promise<boolean> {
    const visit = this.app.vaults.visits;
    const since = this.app.git.generation;
    while (true) {
      this.branches();
      const asked = this.list;
      if (!asked) return false;
      if (asked.answered >= since) return asked.branches !== null;
      if (!asked.asking) return false;
      try {
        await asked.asking;
      } catch {
        return false;
      }
      if (!this.host.still(visit)) return false;
    }
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
  async ask(b: Branch): Promise<BranchStats | null> {
    const c = this.app.git.checkout;
    if (!c) return null;
    const git = this.app.config.git;
    // A base is a branch's name before git sees it (`refName`): one kept that isn't, passed over.
    const kept = [keptBases(c)[b.name] ?? ""].find(refName);
    const listed = kept ? [kept] : candidates(b.name, git);
    // None of them there, and the branch no trunk listed first: `[git] base`, main or master (GIT-D10).
    const trunk = !kept && !listed.length && candidates("", git).includes(b.name);
    const counts = await Promise.all(listed.map((base) => aheadBehindLater(c.root, base, b.name)));
    let near = nearest(listed.map((base, i) => ({ base, ahead: counts[i]?.ahead ?? null })));
    let ab = near === null ? null : counts[listed.indexOf(near)]!;
    const fallback = near || trunk ? null : this.app.git.fallbackBase(c);
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

  /** A branch opened up's files: against its base, and its worktree's uncommitted ones; asked in the background. */
  filesOf(b: Branch, base: string | null): BranchFiles | null {
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
}
