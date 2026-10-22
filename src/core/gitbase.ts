// Each branch's own base (GIT-D10): what a branch changed is measured against the branch it was made from, not one
// base for the repository. The base kept when slipbox made the branch (the New form's `From`, in slipbox's state,
// `bases.json`), or set since ("Compare against…"); else the nearest of `[git] bases` — the one that leaves the branch
// fewest commits of its own — `[git] base` among them when you set it; else main or master, as before.

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureDir, readJson, writeJson } from "./fsutil.ts";
import type { Checkout } from "./git.ts";
import { baseBranch, gitArgs, refName } from "./gitops.ts";
import { stateHome } from "./paths.ts";

/** Where the kept bases are: one file for the machine, by repository. */
export function basesFile(): string {
  return join(stateHome(), "bases.json");
}

/** A repository's key: its shared git folder's real path, one for every checkout of it. */
export function repoKey(c: Pick<Checkout, "common">): string {
  try {
    return realpathSync(c.common);
  } catch {
    return resolve(c.common);
  }
}

type Kept = Record<string, Record<string, string>>;

function readKept(): Kept {
  const raw = readJson<{ repos?: unknown } | null>(basesFile(), null);
  const repos = raw && typeof raw.repos === "object" && raw.repos ? (raw.repos as Record<string, unknown>) : {};
  const out: Kept = {};
  for (const [repo, branches] of Object.entries(repos)) {
    if (!branches || typeof branches !== "object") continue;
    out[repo] = Object.fromEntries(
      Object.entries(branches as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    );
  }
  return out;
}

/** The bases kept for a repository's branches, by branch. */
export function keptBases(c: Pick<Checkout, "common">): Record<string, string> {
  return readKept()[repoKey(c)] ?? {};
}

/** A branch's base kept from now on — or, null, guessed again. */
export function keepBase(c: Pick<Checkout, "common">, branch: string, base: string | null): void {
  const all = readKept();
  const key = repoKey(c);
  const mine = { ...(all[key] ?? {}) };
  if (base === null) delete mine[branch];
  else mine[branch] = base;
  if (Object.keys(mine).length) all[key] = mine;
  else delete all[key];
  ensureDir(stateHome());
  writeJson(basesFile(), { version: 1, repos: all });
}

/** How a base was chosen: kept for the branch, the nearest of `[git] bases`, or main or master. */
export type BaseHow = "kept" | "nearest" | "configured";

/**
 * The nearest of the candidates (GIT-D10): the one that leaves the branch fewest commits of its own — `ahead` is
 * `git rev-list --count <candidate>..<branch>`, null where git couldn't say — a tie going to the first listed.
 */
export function nearest(candidates: { base: string; ahead: number | null }[]): string | null {
  let best: { base: string; ahead: number } | null = null;
  for (const c of candidates)
    if (c.ahead !== null && (best === null || c.ahead < best.ahead)) best = { base: c.base, ahead: c.ahead };
  return best?.base ?? null;
}

/** What a base is chosen with: a repository's kept bases, `[git] bases`, `[git] base`, and git to ask. */
export interface BaseQuery {
  kept: Record<string, string>;
  bases: string[];
  base: string;
  exists: (ref: string) => boolean;
  ahead: (base: string, branch: string) => number | null;
  /** `[git] base`, else main or master, as before; null when there's none. */
  fallback: () => string | null;
}

/**
 * The candidates `branch`'s base is guessed among: `[git] bases`, and `[git] base` when you set one. A base listed is
 * measured only against those listed before it — `["main", "dev"]`: dev against main, main against none — so the trunk
 * is never measured against a branch made from it.
 */
export function candidates(branch: string, config: { base: string; bases: string[] }): string[] {
  // Each a ref's name (`refName`): anything else is never handed to git.
  const listed = [...new Set([...config.bases, ...(config.base ? [config.base] : [])])].filter(refName);
  const at = listed.indexOf(branch);
  return at < 0 ? listed : listed.slice(0, at);
}

/**
 * A branch's base (GIT-D10): kept, when slipbox made it or "Compare against…" set it, and it's still there; else the
 * nearest of the candidates there are, the branch never its own; else main or master. Null when there's none, or the
 * branch is its own base (main's, as `[git] bases` comes).
 */
export function chooseBase(branch: string, q: BaseQuery): { base: string; how: BaseHow } | null {
  const kept = q.kept[branch];
  if (kept && kept !== branch && refName(kept) && q.exists(kept)) return { base: kept, how: "kept" };
  const all = candidates(branch, q);
  const listed = all.filter((b) => q.exists(b));
  if (listed.length === 1) return { base: listed[0]!, how: "nearest" };
  const near = nearest(listed.map((b) => ({ base: b, ahead: q.ahead(b, branch) })));
  if (near) return { base: near, how: "nearest" };
  // A base listed first, none before it: the trunk, measured against nothing.
  if (!all.length && candidates("", q).includes(branch)) return null;
  const fallback = q.fallback();
  return fallback && fallback !== branch ? { base: fallback, how: "configured" } : null;
}

/** git asked now, quickly: its output, or null when it failed. */
function ask(root: string, args: string[]): string | null {
  try {
    return execFileSync("git", gitArgs(root, args), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000,
    });
  } catch {
    return null;
  }
}

/** `chooseBase` for a branch of checkout `c`, asking git now (one count a candidate). */
export function baseFor(
  c: Pick<Checkout, "root" | "common">,
  branch: string,
  config: { base: string; bases: string[] },
): { base: string; how: BaseHow } | null {
  return chooseBase(branch, {
    kept: keptBases(c),
    bases: config.bases,
    base: config.base,
    exists: (ref) => ask(c.root, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`]) !== null,
    ahead: (base, b) => {
      const out = ask(c.root, ["rev-list", "--count", "--end-of-options", `${base}..${b}`]);
      return out === null ? null : Number(out.trim());
    },
    fallback: () => baseBranch(c, config.base),
  });
}
