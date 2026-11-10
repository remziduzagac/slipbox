// A merge or a rebase from the TUI (GIT-D6): this branch rebased onto its base, and what's under way — a merge, a
// rebase, or a cherry-pick or a revert started in a terminal, read from git's own files (operation.ts) — continued, a
// commit skipped, or aborted. git runs without a terminal or an editor: a commit settled on the way keeps its message
// (`GIT_EDITOR=true`). In a vault not trusted, `gitArgs`'s guards hold (no hook runs, no merge driver), and nothing is
// signed: the repository's own config could name the program that signs. Tracked files changed, which git won't rebase
// over, are stashed and put back after when you say so (`--autostash`, D247): git keeps them in the stash where putting
// them back conflicts.

import { execFile, execFileSync } from "node:child_process";
import type { Checkout } from "../git.ts";
import { gitArgs } from "./gitops.ts";
import { editorless, failureOf, inEnglish, type RemoteDone, refusedName, withAutostash } from "./gitremote.ts";
import type { Operation } from "./operation.ts";
import { parseEntries } from "../staging/gitstage.ts";
import { isTrusted } from "../../vaults/trust.ts";

export { OPERATIONS, type Operation, type OperationKind, operationOf, operationText } from "./operation.ts";

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
