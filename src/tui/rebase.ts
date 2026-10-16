// Pulling where both sides moved, and rebasing onto the base (GIT-D6). A pull that can't fast-forward asks: merge,
// rebase, or nothing — git's `pull.rebase` the default. `shift+r` in the git panel (`git.rebase`, `:rebase`) rebases
// this branch onto its base's tip, after asking; while a merge or a rebase is under way it offers continue, skip and
// abort instead (`git.continue`, `git.skip`, `git.abort`; `:continue`, `:skip`, `:abort`; the panel's buttons, which
// gitpanel.ts shows meanwhile). A stop at a conflict opens
// the merge screen on it; the status line says what's under way ("rebasing 2/5"). Each runs in the background, one git
// command at a time with the remote's (gitremote.ts), unsaved notes saved or kept first. In a vault not trusted, no hook
// runs and nothing is signed.

import { type Checkout, headOf } from "../core/git.ts";
import { baseBranch } from "../core/gitops.ts";
import {
  abortLater,
  aheadBehind,
  continueLater,
  type Operation,
  operationOf,
  operationText,
  pullDefault,
  rebaseLater,
  skipLater,
} from "../core/gitrebase.ts";
import { pullLater, type RemoteDone } from "../core/gitremote.ts";
import { sanitize } from "../core/sanitize.ts";
import { isTrusted } from "../core/trust.ts";
import type { App } from "./app.ts";
import { runInBackground } from "./gitremote.ts";
import { conflictedFiles, mergeOf, openMergeScreen } from "./mergescreen.ts";

/** What's under way in the vault's checkout, as last read: read again when git has news, or half a second on. */
const seen = new WeakMap<App, { at: number; generation: number; op: Operation | null }>();

/** What's under way now: the status line asks each frame, so git's files are read again only now and then. */
export function operationNow(app: App): Operation | null {
  const c = app.git.checkout;
  if (!c) return null;
  const s = seen.get(app);
  const now = app.now();
  if (s && s.generation === app.git.generation && now - s.at < 500) return s.op;
  const op = operationOf(c);
  seen.set(app, { at: now, generation: app.git.generation, op });
  return op;
}

/** The status line's words for what's under way — `rebasing 2/5`, `merging` — and the branch a rebase is of. */
export function operationStatus(app: App): { text: string; branch: string | null } | null {
  const op = operationNow(app);
  return op ? { text: operationText(op), branch: op.branch } : null;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * After git moved the branch (a pull, a rebase, continue, skip, abort): HEAD seen, git asked again. A stop at a
 * conflict opens the merge screen on it; one for another reason is said, with what comes next; else `done` is said.
 */
async function after(app: App, r: RemoteDone, done: string): Promise<void> {
  const c = app.git.checkout;
  if (!c) return;
  app.git.checkHead();
  await app.git.refreshNow();
  seen.delete(app);
  const op = operationOf(c);
  const trust = isTrusted(c.root) ? "" : " — this vault isn't trusted, so no hook ran";
  if (!op) {
    // Nothing under way any more: a merge screen of git's left open is of nothing.
    const m = mergeOf(app);
    if (m && m.path !== null) app.floating = null;
    if (!r.ok) return app.message("warn", `git: ${sanitize(r.why)}`);
    return app.message("info", `${done}${trust}`);
  }
  const files = conflictedFiles(app);
  const where =
    op.kind === "rebase"
      ? `the rebase stopped${op.step && op.total ? ` at commit ${op.step} of ${op.total}` : ""}`
      : "the merge stopped";
  const next = op.kind === "rebase" ? "shift+r continues" : "shift+r concludes the merge";
  if (files.length) {
    app.message(
      "warn",
      `${where}: ${plural(files.length, "file")} in conflict (${files.map(sanitize).join(", ")}) — settle on the merge screen, s stages, then ${next}`,
    );
    return openMergeScreen(app, files[0]);
  }
  app.message(
    r.ok ? "info" : "warn",
    `${where}${r.ok ? "" : `: ${sanitize(r.why)}`} — shift+r continues, skips or aborts`,
  );
}

/**
 * A pull that couldn't fast-forward (26.6): both sides moved. Asked — merge, rebase, or nothing — git's `pull.rebase`
 * the default; then pulled that way.
 */
export function askDiverged(app: App, c: Checkout, branch: string, upstream: string): void {
  const way = pullDefault(c, branch);
  const mark = (it: "merge" | "rebase") => (way === it ? " — the default (pull.rebase)" : "");
  app.overlays.openList({
    title: `${sanitize(branch)} and ${sanitize(upstream)} have both moved on — bring them together?`,
    filterable: false,
    items: [
      {
        label: `(m) Merge ${sanitize(upstream)} into ${sanitize(branch)}`,
        detail: `a merge commit; a conflict opens the merge screen${mark("merge")}`,
        hotkey: "m",
        data: "merge",
      },
      {
        label: `(r) Rebase ${sanitize(branch)} onto ${sanitize(upstream)}`,
        detail: `its own commits replayed after ${sanitize(upstream)}'s${mark("rebase")}`,
        hotkey: "r",
        data: "rebase",
      },
      { label: "(n) Nothing", detail: "both left as they are", hotkey: "n", data: "nothing" },
    ],
    selected: way === "rebase" ? 1 : 0,
    accept: (item) => {
      const how = item.data as "merge" | "rebase" | "nothing";
      if (how === "nothing") return app.message("info", `nothing pulled: ${branch} and ${upstream} as they were`);
      runInBackground(
        app,
        how === "merge" ? `merging ${upstream}` : `rebasing onto ${upstream}`,
        () => pullLater(c, how),
        (r) =>
          after(
            app,
            r,
            how === "merge"
              ? `pulled: merged ${upstream} into ${branch}`
              : `pulled: ${branch} rebased onto ${upstream}`,
          ),
      );
    },
  });
}

/**
 * `shift+r`: this branch rebased onto its base's tip (its own, GIT-D10) — asked first, unsaved notes saved or kept. While a merge or a
 * rebase is under way: continue, skip or abort it, or the merge screen on a file still in conflict.
 */
export function gitRebase(app: App): void {
  const c = app.git.checkout;
  if (!c) return app.message("info", "not a git checkout");
  const op = operationOf(c);
  if (op) return underWay(app, op);
  const branch = headOf(c).branch;
  if (!branch) return app.message("info", "not on a branch: nothing to rebase");
  // The branch's own base (GIT-D10), else `[git] base`, main or master.
  const base = app.git.baseOf(c, branch) ?? baseBranch(c, app.config.git.base);
  if (!base) return app.message("warn", "no base branch: neither main nor master is there — [git] base sets one");
  if (base === branch) return app.message("info", `${branch} is the base: nothing to rebase it onto`);
  const ab = aheadBehind(c, base);
  if (!ab) return app.message("warn", `git couldn't compare ${branch} with ${base}`);
  if (!ab.behind) return app.message("info", `${branch} has all of ${base} already: nothing to rebase`);
  app.overlays.confirm(
    `Rebase ${branch} onto ${base}? Its ${plural(ab.ahead, "commit")} replayed after ${base}'s ${ab.behind} new.`,
    () =>
      app.git.beforeCheckout(
        () =>
          runInBackground(
            app,
            `rebasing onto ${base}`,
            () => rebaseLater(c, base),
            (r) => after(app, r, `rebased ${branch} onto ${base}`),
          ),
        { verb: "rebase", noun: "the rebase", done: "rebased" },
      ),
  );
}

/** What's under way, and what to do with it: continue, skip (a rebase's), abort; a file still in conflict, settled. */
function underWay(app: App, op: Operation): void {
  const files = conflictedFiles(app);
  const what =
    op.kind === "rebase"
      ? `Rebasing${op.branch ? ` ${op.branch}` : ""}${op.step && op.total ? `: ${op.step} of ${op.total}` : ""}`
      : `Merging${op.merging ? ` ${op.merging}` : ""}`;
  app.overlays.openList({
    title: `${sanitize(what)}${files.length ? ` — ${plural(files.length, "file")} in conflict` : ""}`,
    filterable: false,
    items: [
      ...(files.length
        ? [
            {
              label: "(x) Settle the conflicts",
              detail: `the merge screen on ${sanitize(files[0]!)}`,
              hotkey: "x",
              data: "x",
            },
          ]
        : []),
      {
        label: "(c) Continue",
        detail: op.kind === "rebase" ? "commits what's settled, and replays the next" : "commits the merge",
        hotkey: "c",
        data: "c",
      },
      ...(op.kind === "rebase"
        ? [{ label: "(s) Skip this commit", detail: "leaves it out, and replays the next", hotkey: "s", data: "s" }]
        : []),
      { label: "(a) Abort", detail: `the branch back where it was before the ${op.kind}`, hotkey: "a", data: "a" },
    ],
    accept: (item) => {
      const pick = item.data as "x" | "c" | "s" | "a";
      if (pick === "x") return openMergeScreen(app, files[0]);
      void app.run(pick === "c" ? "git.continue" : pick === "s" ? "git.skip" : "git.abort");
    },
  });
}

/** What's under way, when something is; null (said) when nothing is, or there's no git. */
function underWayNow(app: App, kind?: "rebase"): { c: Checkout; op: Operation } | null {
  const c = app.git.checkout;
  if (!c) {
    app.message("info", "not a git checkout");
    return null;
  }
  const op = operationOf(c);
  if (!op || (kind && op.kind !== kind)) {
    app.message("info", kind ? "no rebase under way: only a rebase skips a commit" : "no merge or rebase under way");
    return null;
  }
  return { c, op };
}

/** `git.continue`: a rebase's next commit, or a merge's commit — once no file is in conflict. */
export function gitContinue(app: App): void {
  const now = underWayNow(app);
  if (!now) return;
  const { c, op } = now;
  const files = conflictedFiles(app);
  if (files.length)
    return app.message(
      "info",
      `still in conflict: ${files.map(sanitize).join(", ")} — x settles a file on the merge screen, s stages it`,
    );
  app.git.beforeCheckout(
    () =>
      runInBackground(
        app,
        op.kind === "rebase" ? "continuing the rebase" : "concluding the merge",
        () => continueLater(c, op),
        (r) => after(app, r, op.kind === "rebase" ? "rebased: the rebase is done" : "merged: the merge committed"),
      ),
    { verb: "continue", noun: `the ${op.kind}`, done: "continued" },
  );
}

/** `git.skip`: a rebase's commit left out. */
export function gitSkip(app: App): void {
  const now = underWayNow(app, "rebase");
  if (!now) return;
  app.git.beforeCheckout(
    () =>
      runInBackground(
        app,
        "skipping the commit",
        () => skipLater(now.c),
        (r) => after(app, r, "rebased: the rebase is done, a commit skipped"),
      ),
    { verb: "skip", noun: "the rebase", done: "skipped" },
  );
}

/** `git.abort`: the merge or rebase under way given up, the branch back where it was. */
export function gitAbort(app: App): void {
  const now = underWayNow(app);
  if (!now) return;
  const { c, op } = now;
  const branch = op.branch ?? headOf(c).branch;
  app.git.beforeCheckout(
    () =>
      runInBackground(
        app,
        `aborting the ${op.kind}`,
        () => abortLater(c, op),
        (r) => after(app, r, `the ${op.kind} aborted${branch ? `: ${branch} as it was` : ""}`),
      ),
    { verb: "abort", noun: `the ${op.kind}`, done: "aborted" },
  );
}
