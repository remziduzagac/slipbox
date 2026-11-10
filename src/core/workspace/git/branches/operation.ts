// What's under way in a checkout — a merge, a rebase, a cherry-pick or a revert (GIT-D6) — read from git's own files,
// no git run, through the seam (SD-D10): the TUI's look reads it on a disk thread each second (SD-T4), and the top bar
// and the git panel draw what it last found (SD-D13); a key that acts on it reads it at once.

import { join } from "node:path";
import * as disk from "../../../foundation/platform/disk.ts";
import type { Checkout } from "../git.ts";

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
      return disk.readFile(join(c.gitDir, p)).toString("utf8").trim();
    } catch {
      return null;
    }
  };
  for (const dir of ["rebase-merge", "rebase-apply"] as const) {
    if (!disk.exists(join(c.gitDir, dir))) continue;
    if (dir === "rebase-apply" && disk.exists(join(c.gitDir, dir, "applying"))) return null;
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
  if (disk.exists(join(c.gitDir, "MERGE_HEAD")))
    return { kind: "merge", step: null, total: null, branch: null, merging: /'([^']+)'/.exec(msg)?.[1] ?? null };
  // A cherry-pick or a revert stopped at a commit: its message (MERGE_MSG) names the commit — a revert's, quoted.
  const picking = disk.exists(join(c.gitDir, "CHERRY_PICK_HEAD"));
  if (picking || disk.exists(join(c.gitDir, "REVERT_HEAD"))) {
    const commit = picking ? msg : (/^Revert "(.*)"$/.exec(msg)?.[1] ?? msg);
    return { ...none(picking ? "cherry-pick" : "revert"), commit: commit || null };
  }
  // A series between its commits (one committed by hand): what it does next, as its list says.
  if (!disk.exists(join(c.gitDir, "sequencer"))) return null;
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
