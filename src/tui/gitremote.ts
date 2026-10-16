// The remote's commands and stash from the TUI (plan 26.6, GIT-D4), source control's keys and the palette's commands
// (`:fetch`, `:pull`, `:push`, `:stash`): `f` fetches, `p` pulls (fast-forward; where both sides moved, asking
// merge or rebase, GIT-D6; `l` opens a file up there), `shift+p` pushes to the branch's upstream — asking to set one, `origin/<branch>`, where there's none — and `z` lists
// the stashes: the changes saved with a message, one applied, popped or dropped (after asking). `space g` gets none of
// its own: it becomes the git panel's (GIT-T9). Each runs in the background, one at a time, and a message says
// how it went: git's own words when it failed, with a hint where a login was what it lacked. Never on a timer. Before a
// pull or a stash changes the files, unsaved notes are saved or kept (`beforeCheckout`, as a branch switch, 26.5); HEAD
// moving on is the watcher's (5.9).

import { type Checkout, headOf } from "../core/git.ts";
import {
  fetchLater,
  headShort,
  pullLater,
  pushLater,
  type RemoteDone,
  remotesOf,
  type Stash,
  stashesOf,
  stashLater,
  stashSaveLater,
  upstreamFor,
  upstreamOf,
} from "../core/gitremote.ts";
import { sanitize } from "../core/sanitize.ts";
import { isTrusted } from "../core/trust.ts";
import type { App } from "./app.ts";
import { askDiverged } from "./rebase.ts";

/** What's running, by app: one of these at a time. */
const running = new WeakMap<App, string>();

/** The checkout, when there's one and nothing of this kind is running; else null, said why. */
function ready(app: App): Checkout | null {
  const c = app.git.checkout;
  if (!c) {
    app.message("info", "not a git checkout");
    return null;
  }
  const busy = running.get(app);
  if (busy) {
    app.message("info", `git is still ${busy} — a moment`);
    return null;
  }
  return c;
}

/** A failure as it's said: git's words, and a hint at what would get past it. */
function failed(app: App, verb: string, why: string, login: boolean): void {
  const words = sanitize(why);
  const hint = login
    ? ` — git in a terminal can log in (git ${verb}), then try here again`
    : /\[rejected\].*\((fetch first|non-fast-forward)\)/.test(words)
      ? " — the remote has commits this branch hasn't: fetch them (f) and pull (p) first"
      : "";
  app.message("warn", `git: ${words}${hint}`);
}

/**
 * `work` run in the background, one git command at a time (a merge's and a rebase's too, rebase.ts), `doing` said while
 * it runs; `after` given git's answer, whether it went or not. Refused while another runs (one asked for before a
 * question about unsaved notes was answered).
 */
export function runInBackground(
  app: App,
  doing: string,
  work: () => Promise<RemoteDone>,
  after: (r: RemoteDone) => Promise<void> | void,
): void {
  const busy = running.get(app);
  if (busy) return app.message("info", `git is still ${busy} — a moment`);
  running.set(app, doing);
  app.message("info", `${doing}…`);
  void work()
    .then(async (r) => {
      running.delete(app);
      await after(r);
    })
    .catch((err) => {
      running.delete(app);
      app.message("warn", `git: ${sanitize((err as Error).message)}`);
    })
    .finally(() => {
      void app.git.refreshNow().then(() => app.host.requestRender());
      app.host.requestRender();
    });
}

/** `runInBackground`, `done` given git's answer when it went; a failure said in git's words. */
function inBackground(
  app: App,
  doing: string,
  verb: string,
  work: () => Promise<RemoteDone>,
  done: (r: Extract<RemoteDone, { ok: true }>) => Promise<void> | void,
): void {
  runInBackground(app, doing, work, (r) => (r.ok ? done(r) : failed(app, verb, r.why, r.login)));
}

/** An upstream's name as git shows it: `origin/main`. */
const shown = (up: { remote: string; ref: string }) => `${up.remote}/${up.ref.replace(/^refs\/heads\//, "")}`;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Fetch (`f`): the branch's remote fetched (else origin), and how the branch stands against its upstream now. */
export function gitFetch(app: App): void {
  const c = ready(app);
  if (!c) return;
  const remotes = remotesOf(c);
  if (remotes === null) return app.message("warn", "git couldn't list the remotes");
  if (!remotes.length) return app.message("info", "no remote to fetch from — git remote add names one");
  inBackground(
    app,
    "fetching",
    "fetch",
    () => fetchLater(c),
    async () => {
      await app.git.refreshNow();
      const t = app.git.track;
      if (!t?.branch || !t.upstream)
        return app.message("info", "fetched — this branch has no upstream to compare with");
      if (t.gone) return app.message("info", `fetched: ${t.upstream} is gone from the remote`);
      app.message(
        "info",
        t.behind
          ? `fetched: ${t.branch} is ${plural(t.behind, "commit")} behind ${t.upstream} — p pulls (:pull)`
          : `fetched: nothing new on ${t.upstream}`,
      );
    },
  );
}

/**
 * Pull (`p`): the upstream's commits brought in, fast-forward — unsaved notes saved or kept first. Where both sides
 * moved, asked: merge, rebase or nothing (GIT-D6, rebase.ts).
 */
export function gitPull(app: App): void {
  const c = ready(app);
  if (!c) return;
  const branch = headOf(c).branch;
  if (!branch) return app.message("info", "not on a branch: nothing to pull into");
  const up = upstreamOf(c, branch);
  if (!up)
    return app.message("info", `${branch} has no upstream to pull from — a push (shift+p, :push) asks to set one`);
  app.git.beforeCheckout(
    () => {
      const before = headShort(c);
      runInBackground(
        app,
        "pulling",
        () => pullLater(c),
        (r) => {
          // Both sides moved: git can't fast-forward. Asked how to bring them together instead.
          if (!r.ok && !r.login && /not possible to fast-forward/i.test(r.why))
            return askDiverged(app, c, branch, shown(up));
          if (!r.ok) return failed(app, "pull", r.why, r.login);
          // HEAD moved on its branch: seen now, as the watcher would see it, the tabs kept (no switch).
          app.git.checkHead();
          const now = headShort(c);
          app.message(
            "info",
            now === before ? `${branch} is up to date with ${shown(up)}` : `pulled: ${branch} fast-forwarded to ${now}`,
          );
        },
      );
    },
    { verb: "pull", noun: "the pull", done: "pulled" },
  );
}

/** Push (`shift+p`): the branch pushed to its upstream; with none, asked to push it to origin and track it there. */
export function gitPush(app: App): void {
  const c = ready(app);
  if (!c) return;
  const branch = headOf(c).branch;
  if (!branch) return app.message("info", "not on a branch: nothing to push");
  const up = upstreamOf(c, branch);
  if (up) return push(app, c, branch, up, false);
  const remotes = remotesOf(c);
  if (remotes === null) return app.message("warn", "git couldn't list the remotes");
  if (!remotes.length) return app.message("info", "no remote to push to — git remote add names one");
  const to = upstreamFor(branch, remotes);
  if (!to)
    return app.message(
      "info",
      `${branch} has no upstream, and no remote is called origin — git push -u <remote> ${branch} sets one`,
    );
  app.overlays.confirm(`${branch} has no upstream. Push it to ${to.remote}/${to.branch}, and track it there?`, () =>
    push(app, c, branch, { remote: to.remote, ref: `refs/heads/${to.branch}` }, true),
  );
}

function push(app: App, c: Checkout, branch: string, to: { remote: string; ref: string }, track: boolean): void {
  // Not trusted: the repository's hooks don't run — its pre-push neither — and nothing is signed; said so.
  const trusted = isTrusted(c.root);
  inBackground(
    app,
    "pushing",
    "push",
    () => pushLater(c, branch, to, track),
    (r) => {
      const already = /Everything up-to-date/.test(r.err);
      const said = already
        ? `${shown(to)} is up to date: nothing to push${track ? `, and ${branch} tracks it now` : ""}`
        : `pushed ${branch} to ${shown(to)}${track ? ", its upstream now" : ""}`;
      app.message("info", trusted ? said : `${said} — this vault isn't trusted, so no hook ran`);
    },
  );
}

/** The stashes (`z`), newest first, after the ways to stash the changes; enter on one: pop, apply or drop it. */
export function gitStash(app: App): void {
  const c = ready(app);
  if (!c) return;
  const stashes = stashesOf(c);
  if (stashes === null) return app.message("warn", "git couldn't list the stashes");
  app.overlays.openList({
    title: `Stashes (${stashes.length}) — enter: pop, apply or drop one`,
    items: [
      { label: "Stash the changes…", detail: "with a message; untracked files stay", data: "save" },
      { label: "Stash the changes, untracked files too…", detail: "with a message", data: "save-all" },
      ...stashes.map((s) => ({ label: `${s.ref}  ${sanitize(s.message)}`, detail: sanitize(s.when), data: s })),
    ],
    accept: (item) => {
      if (item.data === "save" || item.data === "save-all") {
        const untracked = item.data === "save-all";
        return app.overlays.prompt("stash message: ", (message) => stashSave(app, c, message.trim(), untracked));
      }
      stashActions(app, c, item.data as Stash);
    },
  });
}

function stashSave(app: App, c: Checkout, message: string, untracked: boolean): void {
  app.git.beforeCheckout(
    () =>
      inBackground(
        app,
        "stashing",
        "stash",
        () => stashSaveLater(c, message, untracked),
        (r) =>
          app.message(
            "info",
            /No local changes to save/.test(r.out)
              ? "nothing to stash: no local changes"
              : `stashed${message ? `: ${sanitize(message)}` : ""}${untracked ? ", untracked files too" : ""}`,
          ),
      ),
    { verb: "stash", noun: "the stash", done: "stashed" },
  );
}

/** One stash's ways: popped (applied, then dropped), applied (kept), dropped (after asking). esc: back to the list. */
function stashActions(app: App, c: Checkout, s: Stash): void {
  const name = `${s.ref} (${sanitize(s.message)})`;
  app.overlays.openList({
    title: `${s.ref}: ${sanitize(s.message)}`,
    items: [
      { label: "Pop it", detail: "applied to the files, then dropped from the list", data: "pop" },
      { label: "Apply it", detail: "applied to the files, kept in the list", data: "apply" },
      { label: "Drop it…", detail: "gone from the list, after asking", data: "drop" },
    ],
    accept: (item) => {
      const how = item.data as "pop" | "apply" | "drop";
      if (how === "drop")
        return app.overlays.confirm(`Drop ${name}? Its changes are gone with it.`, () =>
          inBackground(
            app,
            "dropping the stash",
            "stash drop",
            () => stashLater(c, "drop", s),
            () => app.message("info", `dropped ${name}`),
          ),
        );
      app.git.beforeCheckout(
        () =>
          inBackground(
            app,
            how === "pop" ? "popping the stash" : "applying the stash",
            `stash ${how}`,
            () => stashLater(c, how, s),
            () => app.message("info", `${how === "pop" ? "popped" : "applied"} ${name}`),
          ),
        { verb: `${how} the stash`, noun: "the stash", done: how === "pop" ? "popped" : "applied" },
      );
    },
    cancel: () => gitStash(app),
  });
}
