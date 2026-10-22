// The CLI's git commands (5.11–5.14): what this branch changed against the base, a note's diff from where it left
// the base, the links a merge would break (20.21), the repository's worktrees.

import { join, relative } from "node:path";
import { type Checkout, checkoutOf, headOf } from "../core/git.ts";
import { type BaseHow, baseFor as branchBase, resolveBase } from "../core/gitbase.ts";
import {
  baseBranch,
  changedSince,
  type GitState,
  inCheckout,
  inVault,
  mergeBaseOf,
  showAt,
  worktreeList,
} from "../core/gitops.ts";
import { comparable, diffRows, unseenChange } from "../core/merge.ts";
import { sanitize } from "../core/sanitize.ts";
import { readText } from "../core/fsutil.ts";
import { describeBreak, type MergeReview, MergeReviewError, reviewMerge } from "../core/mergereview.ts";
import { flag } from "./args.ts";
import { EXIT, CliError, type Session, type Handler, requireArg, resolveNote } from "./common.ts";

/** Git (5.11–5.14): what this branch changed, a note's diff, what a merge would break, the worktrees. */
export const GIT_COMMANDS: Record<string, Handler> = {
  // Git (5.11–5.14): what this branch changed against the base, a note's diff, the worktrees.
  changed(s) {
    const c = checkoutFor(s);
    const { base, how } = baseFor(s, c);
    const r = changedSince(c, base);
    if (!r) throw new CliError("git couldn't say what changed", 1);
    const files = r.files
      .map((f) => ({
        path: inVault(c, s.loc.root, f.path),
        state: f.state,
        ...(f.from ? { from: inVault(c, s.loc.root, f.from) ?? f.from } : {}),
      }))
      .filter((f): f is typeof f & { path: string } => f.path !== null);
    const human = files
      .map((f) => `${STATE_LETTER[f.state]} ${f.path}${f.from ? `  (from ${f.from})` : ""}\n`)
      .join("");
    return {
      data: { base, baseChosen: how, mergeBase: r.mergeBase, files },
      human: human || `nothing changed against ${base}\n`,
    };
  },

  "merge-review"(s, rest) {
    // Before a merge (20.21): the links git's tentative result would break, the working tree untouched.
    const from = requireArg(rest, "branch to merge");
    const c = checkoutFor(s);
    let r: MergeReview;
    try {
      r = reviewMerge(c, s.loc.root, from, flag(s.args, "into") ?? "HEAD");
    } catch (err) {
      if (err instanceof MergeReviewError)
        throw new CliError(err.message, /^no branch or commit/.test(err.message) ? EXIT.notFound : EXIT.error);
      throw err;
    }
    const n = r.breaks.length;
    const human = [
      `merging ${r.from} into ${r.into}: ${n ? `${n} link${n === 1 ? "" : "s"} would break` : "no link would break"}${r.conflicts.length ? `; git can't merge ${r.conflicts.length} file${r.conflicts.length === 1 ? "" : "s"} (${r.conflicts.join(", ")})` : ""}`,
      ...r.breaks.map((b) => `  ${b.path}:${b.line}:${b.column}  ${b.target} — ${describeBreak(b)}`),
    ];
    return { data: r, human: `${human.join("\n")}\n` };
  },

  diff(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"), false);
    const c = checkoutFor(s);
    const { base, how } = baseFor(s, c);
    const mergeBase = mergeBaseOf(c, base);
    if (!mergeBase) throw new CliError(`this branch and ${base} have no commit in common`, EXIT.notFound);
    const shown = showAt(c, mergeBase, inCheckout(c, s.loc.root, rel));
    const before = shown ?? "";
    const read = readText(s.graph.abs(rel));
    // The file as git has it (its byte order mark too); line endings and the mark not compared, as the TUI's diff has it.
    const now = (read.bom ? "\uFEFF" : "") + read.text;
    const rows = diffRows(comparable(before), comparable(now));
    const human = rows.map((r) => (r.kind === "@@" ? `@@ ${r.text}` : `${r.kind} ${sanitize(r.text)}`)).join("\n");
    const only = rows.length ? null : unseenChange(before, now);
    return {
      data: { path: rel, base, baseChosen: how, mergeBase, new: shown === null, rows },
      human: rows.length
        ? `${human}\n`
        : only
          ? `only ${only} changed from ${base}\n`
          : `no differences from ${base}\n`,
    };
  },

  worktrees(s) {
    const c = checkoutFor(s);
    const list = worktreeList(c);
    if (!list) throw new CliError("git couldn't list the worktrees", 1);
    const data = list.map((w) => ({
      ...w,
      root: join(w.path, relative(c.root, s.loc.root)),
      current: w.path === c.root,
    }));
    return {
      data,
      human: data
        .map(
          (w) =>
            `${w.current ? "*" : " "} ${w.branch ?? `(${w.head?.slice(0, 7) ?? "detached"})`}  ${w.path}${w.main ? "  (main)" : ""}\n`,
        )
        .join(""),
    };
  },
};

/** The vault's git checkout, for the git commands (5.11–5.14); refused outside one (exit 3). */
function checkoutFor(s: Session): Checkout {
  const c = checkoutOf(s.loc.root);
  if (!c) throw new CliError(`${s.loc.root} isn't in a git repository`, EXIT.notFound);
  return c;
}

/**
 * The base, as the screen chooses it (D255): `--base` (a revision such as `HEAD~3` as its commit); else the branch's
 * own (GIT-D10) — kept, else the nearest of `[git] bases`; else `[git] base`, main or master. Exit 3 when there's none.
 */
function baseFor(s: Session, c: Checkout): { base: string; how: BaseHow | "given" } {
  const given = flag(s.args, "base");
  if (given !== undefined) {
    const asked = resolveBase(c, given);
    if ("error" in asked) throw new CliError(asked.error, EXIT.notFound);
    return { base: asked.base, how: "given" };
  }
  const branch = headOf(c).branch;
  const own = branch ? branchBase(c, branch, s.config.git) : null;
  if (own) return own;
  const configured = s.config.git.base;
  const base = baseBranch(c, configured);
  if (!base)
    throw new CliError(
      configured
        ? `no branch or commit "${configured}" in the repository`
        : "no base branch: neither main nor master is there — --base <ref>, or [git] base",
      EXIT.notFound,
    );
  return { base, how: "configured" };
}

/** A file's state as one letter: what the explorer marks it with. */
const STATE_LETTER: Record<GitState, string> = { new: "+", modified: "M", renamed: "R", deleted: "D", conflict: "!" };
