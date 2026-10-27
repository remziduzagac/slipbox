// A merge or a rebase from the TUI (GIT-D6): this branch rebased onto its base, and what's under way — a merge, a
// rebase, or a cherry-pick or a revert started in a terminal, read from git's own files, no git run, so where you are
// can say it each frame ("rebasing 2/5") — continued, a commit skipped, or aborted. git runs without a terminal or an editor: a commit settled on the way keeps its message
// (`GIT_EDITOR=true`). In a vault not trusted, `gitArgs`'s guards hold (no hook runs, no merge driver), and nothing is
// signed: the repository's own config could name the program that signs. Tracked files changed, which git won't rebase
// over, are stashed and put back after when you say so (`--autostash`, D247): git keeps them in the stash where putting
// them back conflicts.

import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Checkout } from "../git.ts";
import { gitArgs } from "./gitops.ts";
import { editorless, failureOf, inEnglish, type RemoteDone, refusedName, withAutostash } from "./gitremote.ts";
import { parseEntries } from "../staging/gitstage.ts";
import { isTrusted } from "../../vaults/trust.ts";

/** What can be under way: a merge, a rebase, or a cherry-pick or a revert (started in a terminal). */
export type OperationKind = "merge" | "rebase" | "cherry-pick" | "revert";

/**
 * A merge, a rebase, a cherry-pick or a revert under way: how far a rebase has got and the branch it rebases; what a
 * merge brings in; the commit a cherry-pick or a revert is at.
 */
export interface Operation {
  kind: OperationKind;
  /** A rebase's step (from 1) and its steps, as git counts them; null where it doesn't say. */
  step: number | null;
  total: number | null;
  /** The branch being rebased; null for a detached HEAD, or a merge. */
  branch: string | null;
  /** What a merge brings in, as its message names it (`origin/main`); null for a rebase, or when it doesn't. */
  merging: string | null;
  /** The commit a cherry-pick or a revert is at, by its subject; absent (or null) where git's files don't say. */
  commit?: string | null;
}

/** How each kind is said: its noun, what it's doing, what Continue and Skip do, and what it says once done. */
export const OPERATIONS: Record<
  OperationKind,
  { noun: string; doing: string; carryOn: string; skip: string | null; continuing: string; done: string }
> = {
  rebase: {
    noun: "rebase",
    doing: "Rebasing",
    carryOn: "commits what's settled, and replays the next",
    skip: "leaves this commit out, and replays the next",
    continuing: "continuing the rebase",
    done: "rebased: the rebase is done",
  },
  merge: {
    noun: "merge",
    doing: "Merging",
    carryOn: "commits the merge",
    skip: null,
    continuing: "concluding the merge",
    done: "merged: the merge committed",
  },
  "cherry-pick": {
    noun: "cherry-pick",
    doing: "Cherry-picking",
    carryOn: "commits what's settled, and picks the next, if there's one",
    skip: "leaves this commit out, and picks the next",
    continuing: "continuing the cherry-pick",
    done: "cherry-picked: the cherry-pick is done",
  },
  revert: {
    noun: "revert",
    doing: "Reverting",
    carryOn: "commits what's settled, and reverts the next, if there's one",
    skip: "leaves this commit as it is, and reverts the next",
    continuing: "continuing the revert",
    done: "reverted: the revert is done",
  },
};

/**
 * What's under way in a checkout, from git's own files: a rebase (`rebase-merge/`, `rebase-apply/`), a merge
 * (`MERGE_HEAD`), a cherry-pick or a revert (`CHERRY_PICK_HEAD`, `REVERT_HEAD`; a series of them, `sequencer/`, between
 * its commits too); null when nothing is. A `git am` (`rebase-apply/applying`) is none of slipbox's.
 */
export function operationOf(c: Pick<Checkout, "gitDir">): Operation | null {
  const read = (p: string) => {
    try {
      return readFileSync(join(c.gitDir, p), "utf8").trim();
    } catch {
      return null;
    }
  };
  for (const dir of ["rebase-merge", "rebase-apply"] as const) {
    if (!existsSync(join(c.gitDir, dir))) continue;
    if (dir === "rebase-apply" && existsSync(join(c.gitDir, dir, "applying"))) return null;
    const num = (f: string) => {
      const n = Number(read(`${dir}/${f}`));
      return Number.isInteger(n) && n > 0 ? n : null;
    };
    const head = read(`${dir}/head-name`);
    return {
      kind: "rebase",
      step: num(dir === "rebase-merge" ? "msgnum" : "next"),
      total: num(dir === "rebase-merge" ? "end" : "last"),
      branch: head?.startsWith("refs/heads/") ? head.slice("refs/heads/".length) : null,
      merging: null,
    };
  }
  const msg = read("MERGE_MSG")?.split("\n")[0] ?? "";
  if (existsSync(join(c.gitDir, "MERGE_HEAD")))
    return { kind: "merge", step: null, total: null, branch: null, merging: /'([^']+)'/.exec(msg)?.[1] ?? null };
  // A cherry-pick or a revert stopped at a commit: its message (MERGE_MSG) names the commit — a revert's, quoted.
  const picking = existsSync(join(c.gitDir, "CHERRY_PICK_HEAD"));
  if (picking || existsSync(join(c.gitDir, "REVERT_HEAD"))) {
    const commit = picking ? msg : (/^Revert "(.*)"$/.exec(msg)?.[1] ?? msg);
    return { ...none(picking ? "cherry-pick" : "revert"), commit: commit || null };
  }
  // A series between its commits (one committed by hand): what it does next, as its list says.
  if (!existsSync(join(c.gitDir, "sequencer"))) return null;
  const next = (read("sequencer/todo") ?? "").split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "";
  return none(/^\s*(revert|r)\s/.test(next) ? "revert" : "cherry-pick");
}

/** A cherry-pick or a revert, as git's files say it: no steps, branch or merge. */
const none = (kind: "cherry-pick" | "revert"): Operation => ({
  kind,
  step: null,
  total: null,
  branch: null,
  merging: null,
});

/** What's under way, as where you are says it: `rebasing 2/5`, `merging`, `cherry-picking`, `reverting`. */
export function operationText(op: Operation): string {
  if (op.kind !== "rebase") return OPERATIONS[op.kind].doing.toLowerCase();
  return op.step && op.total ? `rebasing ${Math.min(op.step, op.total)}/${op.total}` : "rebasing";
}

/** A quick question to git, waited for: its output, or null when it failed. */
function ask(c: Pick<Checkout, "root">, args: string[]): string | null {
  try {
    return execFileSync("git", gitArgs(c.root, args), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * How far HEAD and `base` have each gone since they parted: HEAD's own commits and the base's; null without git, or
 * for a base whose name isn't passed to git (`refusedName`).
 */
export function aheadBehind(c: Pick<Checkout, "root">, base: string): { ahead: number; behind: number } | null {
  if (refusedName("the base", base)) return null;
  const out = ask(c, ["rev-list", "--left-right", "--count", "--end-of-options", `${base}...HEAD`]);
  const m = /^(\d+)\s+(\d+)/.exec(out?.trim() ?? "");
  return m ? { ahead: Number(m[2]), behind: Number(m[1]) } : null;
}

/**
 * The files changed that git won't start a rebase over (D247), from the checkout's top folder: tracked ones, staged or
 * not. Not untracked files — git rebases past them, refusing in its words only where one would be overwritten, and
 * leaves them where they are — nor a submodule's changes, which git doesn't look at either. Null without git.
 */
export function changedTracked(c: Pick<Checkout, "root">): string[] | null {
  const out = ask(c, ["status", "--porcelain=v1", "-z", "--untracked-files=no", "--ignore-submodules=all"]);
  return out === null ? null : parseEntries(out).map((e) => e.path);
}

/**
 * Whether git kept the changes it stashed for a rebase (`--autostash`, D247) in the stash: putting them back at the
 * rebase's end conflicted (`withAutostash`: a new stash left behind).
 */
export const stashKept = (r: RemoteDone): r is RemoteDone & { ok: true; kept: string } => r.ok && r.kept !== undefined;

/**
 * How a pull brings two sides together by default, as git's config says: a rebase where `branch.<name>.rebase`, else
 * `pull.rebase`, is true (or a kind of rebase), else a merge.
 */
export function pullDefault(c: Pick<Checkout, "root">, branch: string): "merge" | "rebase" {
  const get = (key: string) => ask(c, ["config", "--get", key])?.trim() || null;
  const v = (get(`branch.${branch}.rebase`) ?? get("pull.rebase") ?? "").toLowerCase();
  return /^(true|yes|on|1|merges|m|interactive|i)$/.test(v) ? "rebase" : "merge";
}

/** A command that moves the branch on (a rebase's, a merge's), in the background: what git printed, or why not. */
function runLater(c: Pick<Checkout, "root">, args: string[]): Promise<RemoteDone> {
  // Not trusted: nothing signed (the repository's config could name the signing program).
  const unsigned = isTrusted(c.root) ? [] : ["-c", "commit.gpgSign=false"];
  return new Promise((done) => {
    execFile(
      "git",
      [...unsigned, ...gitArgs(c.root, args)],
      // git's words in English: a conflict, a refusal, as matched (`gitReason`).
      { encoding: "utf8", env: inEnglish(editorless(process.env)), timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
      (err, out, stderr) => {
        if (!err) return done({ ok: true, out, err: stderr });
        done({ ok: false, why: failureOf(err, stderr, out), login: false });
      },
    );
  });
}

/**
 * This branch rebased onto `onto` (the base's tip): its own commits replayed after it. The name checked first. With
 * `autostash` (D247), the files changed stashed first and put back after (`--autostash`).
 */
export function rebaseLater(c: Pick<Checkout, "root">, onto: string, autostash = false): Promise<RemoteDone> {
  const why = refusedName("the base", onto);
  if (why) return Promise.resolve({ ok: false, why, login: false });
  const rebase = () => runLater(c, ["rebase", ...(autostash ? ["--autostash"] : []), "--end-of-options", onto]);
  return autostash ? withAutostash(c, rebase) : rebase();
}

/**
 * What's under way, continued: a rebase's next commit, a cherry-pick's or a revert's (its commit made with the message
 * git prepared); a merge's commit, made with its own message.
 */
export const continueLater = (c: Pick<Checkout, "root">, op: Operation): Promise<RemoteDone> =>
  ended(c, op, () => runLater(c, op.kind === "merge" ? ["commit", "--no-edit"] : [op.kind, "--continue"]));

/** A rebase's, a cherry-pick's or a revert's commit left out, and it on to the next (a merge has none: git refuses). */
export const skipLater = (c: Pick<Checkout, "root">, op: Operation): Promise<RemoteDone> =>
  ended(c, op, () => runLater(c, [op.kind, "--skip"]));

/** What's under way, aborted: the branch back where it was before it began. */
export const abortLater = (c: Pick<Checkout, "root">, op: Operation): Promise<RemoteDone> =>
  ended(c, op, () => runLater(c, [op.kind, "--abort"]));

/** A rebase's step: where it ends the rebase, the changes it stashed are put back — or kept (`withAutostash`). */
const ended = (c: Pick<Checkout, "root">, op: Operation, run: () => Promise<RemoteDone>): Promise<RemoteDone> =>
  op.kind === "rebase" ? withAutostash(c, run) : run();
