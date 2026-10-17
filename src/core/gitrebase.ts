// A merge or a rebase from the TUI (GIT-D6): this branch rebased onto its base, and what's under way — read from
// git's own files, no git run, so the status line can say it each frame ("rebasing 2/5") — continued, a commit
// skipped, or aborted. git runs without a terminal or an editor: a commit settled on the way keeps its message
// (`GIT_EDITOR=true`). In a vault not trusted, `gitArgs`'s guards hold (no hook runs, no merge driver), and nothing is
// signed: the repository's own config could name the program that signs.

import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Checkout } from "./git.ts";
import { gitArgs } from "./gitops.ts";
import { editorless, gitReason, type RemoteDone } from "./gitremote.ts";
import { isTrusted } from "./trust.ts";

/** A merge or a rebase under way: how far a rebase has got and the branch it rebases; what a merge brings in. */
export interface Operation {
  kind: "merge" | "rebase";
  /** A rebase's step (from 1) and its steps, as git counts them; null where it doesn't say. */
  step: number | null;
  total: number | null;
  /** The branch being rebased; null for a detached HEAD, or a merge. */
  branch: string | null;
  /** What a merge brings in, as its message names it (`origin/main`); null for a rebase, or when it doesn't. */
  merging: string | null;
}

/**
 * What's under way in a checkout, from git's own files: a rebase (`rebase-merge/`, `rebase-apply/`), a merge
 * (`MERGE_HEAD`); null when nothing is. A `git am` (`rebase-apply/applying`) is none of slipbox's.
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
  if (!existsSync(join(c.gitDir, "MERGE_HEAD"))) return null;
  const msg = read("MERGE_MSG")?.split("\n")[0] ?? "";
  return { kind: "merge", step: null, total: null, branch: null, merging: /'([^']+)'/.exec(msg)?.[1] ?? null };
}

/** What's under way, as the status line says it: `rebasing 2/5`, `merging`. */
export function operationText(op: Operation): string {
  if (op.kind === "merge") return "merging";
  return op.step && op.total ? `rebasing ${Math.min(op.step, op.total)}/${op.total}` : "rebasing";
}

/** A quick question to git, waited for: its output, or null when it failed. */
function ask(c: Pick<Checkout, "root">, args: string[]): string | null {
  try {
    return execFileSync("git", gitArgs(c.root, args), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000,
    });
  } catch {
    return null;
  }
}

/** How far HEAD and `base` have each gone since they parted: HEAD's own commits and the base's; null without git. */
export function aheadBehind(c: Pick<Checkout, "root">, base: string): { ahead: number; behind: number } | null {
  const out = ask(c, ["rev-list", "--left-right", "--count", `${base}...HEAD`]);
  const m = /^(\d+)\s+(\d+)/.exec(out?.trim() ?? "");
  return m ? { ahead: Number(m[2]), behind: Number(m[1]) } : null;
}

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
      { encoding: "utf8", env: editorless(process.env), timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
      (err, out, stderr) => {
        if (!err) return done({ ok: true, out, err: stderr });
        const killed = (err as { killed?: boolean }).killed;
        done({ ok: false, why: killed ? "git took too long, and was stopped" : gitReason(stderr, out), login: false });
      },
    );
  });
}

/** This branch rebased onto `onto` (the base's tip): its own commits replayed after it. */
export const rebaseLater = (c: Pick<Checkout, "root">, onto: string): Promise<RemoteDone> =>
  runLater(c, ["rebase", onto]);

/** What's under way, continued: a rebase's next commit; a merge's commit, made with its own message. */
export const continueLater = (c: Pick<Checkout, "root">, op: Operation): Promise<RemoteDone> =>
  runLater(c, op.kind === "rebase" ? ["rebase", "--continue"] : ["commit", "--no-edit"]);

/** A rebase's commit left out, and the rebase on to the next. */
export const skipLater = (c: Pick<Checkout, "root">): Promise<RemoteDone> => runLater(c, ["rebase", "--skip"]);

/** What's under way, aborted: the branch back where it was before it began. */
export const abortLater = (c: Pick<Checkout, "root">, op: Operation): Promise<RemoteDone> =>
  runLater(c, [op.kind, "--abort"]);
