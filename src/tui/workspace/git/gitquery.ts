// One foreground git read per app. Requests never reopen a result for an obsolete view or revision. What a read is
// read against — git's index, `HEAD`, the note's file — is asked of a disk thread (SD-T5): before git starts, as a key's
// own read (the keys wait, `esc` gives it up), and again once git answers, no key waiting, to tell whether it moved.
import { answerGit, type GitAnswer, type GitAsk } from "../../../core/workspace/walk/key-jobs.ts";
import type { App } from "../../app/runtime/app.ts";

const active = new WeakMap<App, AbortController>();

/** A git read under way: its signal, and whether what it was read against holds still (a newer read, the view, the
 *  vault or git's files moved: dropped) — `current`, asked of a disk thread once, before what was read is shown;
 *  `live`, here at once, without git's files, between one step of it and the next. */
export interface GitQuery {
  signal: AbortSignal;
  current(): Promise<boolean>;
  live(): boolean;
}

/** What `ask` reads: on a disk thread — a key's, unless `background` — or here at once on a test's App (SD-D10). */
function groundOf(app: App, ask: GitAsk, background = false): Promise<GitAnswer | null> {
  if (!app.reads.offThread) return Promise.resolve(answerGit(ask));
  return app.reads.ask("git's files", null, (t, stop, bg) => t.gitRead(ask, stop, bg), "not read", background);
}

/** A git read begun, `label` said; null when what it's read against didn't answer, was given up, or moved meanwhile. */
export async function beginGitRead(app: App, label: string, watchIndex = false): Promise<GitQuery | null> {
  active.get(app)?.abort();
  const controller = new AbortController();
  active.set(app, controller);
  const checkout = app.git.checkout;
  const root = checkout?.root;
  const view = app.view;
  const version = view?.buf.version;
  const location = app.loc.root;
  const overlay = app.overlay;
  const ask: GitAsk = {
    git: checkout ? { gitDir: checkout.gitDir, common: checkout.common } : null,
    note: view?.buf.abs ?? null,
  };
  app.message("info", `${label}…`);
  const same = () =>
    !controller.signal.aborted &&
    !app.quitting &&
    app.loc.root === location &&
    app.git.checkout?.root === root &&
    app.view === view &&
    view?.buf.version === version &&
    app.overlay === overlay;
  const was = await groundOf(app, ask);
  if (!was || !same()) return null;
  return {
    signal: controller.signal,
    live: same,
    current: async () => {
      if (!same()) return false;
      const now = await groundOf(app, ask, true);
      return (
        !!now &&
        same() &&
        now.note === was.note &&
        now.head === was.head &&
        (!checkout || !watchIndex || now.index === was.index)
      );
    },
  };
}

export function cancelGitRead(app: App): void {
  active.get(app)?.abort();
  active.delete(app);
}
