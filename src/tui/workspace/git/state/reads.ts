// Git checkout/status refresh: the same serialized requests update controller-owned live state.
import { posix } from "node:path";
import type { Checkout } from "../../../../core/workspace/git/git.ts";
import { type GitState, inVault, stateOf } from "../../../../core/workspace/git/branches/gitops.ts";
import { statusLater } from "../../../../core/workspace/git/staging/gitstage.ts";
import { checkoutAt } from "../../../../core/workspace/vaults/vault.ts";
import type { GitReadHost } from "./contracts.ts";

export class GitReads {
  constructor(private readonly host: GitReadHost) {}
  get app() {
    return this.host.app;
  }

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
      this.host.states = null;
      this.host.track = null;
      this.host.folders.clear();
      // News all the same: the git panel's repositories in the view are asked again (VV-D10).
      this.host.generation++;
      return Promise.resolve();
    }
    this.asking = statusLater(c)
      .then((answer) => {
        if (this.app.loc.root !== root) return;
        const entries = answer?.entries ?? null;
        // Each file's two letters for the source control view (26.2); one state each for the explorer's marks.
        this.host.entries = entries;
        // The branch against its upstream, as of the last fetch (26.6): the ↑ and ↓ after it where you are (where.ts).
        this.host.track = answer?.track ?? null;
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
        this.host.states = status ? states : null;
        this.host.folders = folders;
        this.app.explorer.invalidateTree();
        // What's staged may have changed with it: the gutter's asked again (26.1), and the view's texts (26.2).
        this.host.generation++;
      })
      .finally(() => {
        this.asking = null;
      });
    return this.asking;
  }
}

/** A folder's git state is its strongest file's (5.11). */
const GIT_RANK: Record<GitState, number> = { deleted: 0, renamed: 1, modified: 2, new: 3, conflict: 4 };
