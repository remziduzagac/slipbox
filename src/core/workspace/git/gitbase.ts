// Each branch's own base (GIT-D10): what a branch changed is measured against the branch it was made from, not one
// base for the repository. The base kept when slipbox made the branch (the New form's `From`, in slipbox's state,
// `bases.json`), or set since ("Compare against…"); else the nearest of `[git] bases` — the one that leaves the branch
// fewest commits of its own — `[git] base` among them when you set it; else main or master, as before.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureDir, readJson, writeJson } from "../../foundation/platform/fsutil.ts";
import { type Checkout, checkoutOf, headOf } from "./git.ts";
import { baseBranch, gitArgs, gitReadLater, refName } from "./branches/gitops.ts";
import { stateHome } from "../../foundation/platform/paths.ts";

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

/** The same base policy with asynchronous, cancellable lookups for a foreground read. */
export async function baseForLater(
  c: Pick<Checkout, "root" | "common">,
  branch: string,
  config: { base: string; bases: string[] },
  signal?: AbortSignal,
): Promise<{ base: string; how: BaseHow } | null> {
  const kept = keptBases(c);
  const refs = [
    ...new Set([
      ...candidates(branch, config),
      ...(kept[branch] ? [kept[branch]!] : []),
      ...(config.base ? [config.base] : ["main", "master"]),
    ]),
  ].filter(refName);
  const present = new Map(
    await Promise.all(
      refs.map(
        async (ref) =>
          [
            ref,
            (await gitReadLater(
              c,
              ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
              false,
              signal,
            )) !== null,
          ] as const,
      ),
    ),
  );
  const selected = kept[branch];
  if (selected && selected !== branch && present.get(selected)) return { base: selected, how: "kept" };
  const listed = candidates(branch, config).filter((ref) => present.get(ref));
  const counts = new Map<string, number | null>();
  if (listed.length > 1)
    await Promise.all(
      listed.map(async (base) => {
        const count = await gitReadLater(
          c,
          ["rev-list", "--count", "--end-of-options", `${base}..${branch}`],
          false,
          signal,
        );
        counts.set(base, count === null ? null : Number(count.trim()));
      }),
    );
  return chooseBase(branch, {
    ...config,
    kept,
    exists: (ref) => !!present.get(ref),
    ahead: (base) => counts.get(base) ?? null,
    fallback: () => (config.base ? [config.base] : ["main", "master"]).find((ref) => present.get(ref)) ?? null,
  });
}

/**
 * A base asked for by name (`--base`, "Compare against…" typed): a branch, remote branch or tag by its plain name
 * (`dev`, `origin/dev`, `v2.3`), whichever way it was spelt; anything else — a commit, `HEAD~3`, `ORIG_HEAD` — as the
 * commit it names, so a kept base never moves with HEAD. `commit`: kept as a commit other than what was typed. `full`:
 * the ref's full name (`refs/heads/dev`), "" for a commit. An error when it names no commit, or can't be a revision.
 */
export type AskedBase = { base: string; commit: boolean; full: string } | { error: string };

/** What git says a ref typed is: the commit it names, and its full name — "" when it's no branch, remote or tag. */
export interface FoundRef {
  commit: string;
  full: string;
}

/** A branch's, remote branch's or tag's plain name from its full name (`refs/remotes/origin/dev`); null for the rest. */
export function plainName(full: string): string | null {
  for (const at of ["refs/heads/", "refs/remotes/", "refs/tags/"])
    if (full.startsWith(at)) return refName(full.slice(at.length)) ? full.slice(at.length) : null;
  return null;
}

/** Why `rev` can't be handed to git as a revision — an option, a space, a control character — or null. */
function notARevision(rev: string): string | null {
  return !rev || rev.startsWith("-") || /[\u0000- \u007f]/.test(rev) ? `"${rev}" isn't a branch or commit` : null;
}

/**
 * `AskedBase` from what was typed and git's answer (`find`): null when it names no commit. `heads/dev`, `refs/heads/dev`
 * and `dev` are one base, `dev`; `HEAD` is the branch checked out's; `origin`, its default branch's.
 */
export function askedBase(rev: string, find: (rev: string) => FoundRef | null): AskedBase {
  const r = rev.trim();
  const bad = notARevision(r);
  if (bad) return { error: bad };
  // Handed to git after `--end-of-options` alone.
  const found = find(r);
  if (!found) return { error: `no branch or commit "${r}" in the repository` };
  const name = plainName(found.full);
  return name
    ? { base: name, commit: false, full: found.full }
    : { base: found.commit, commit: found.commit !== r, full: "" };
}

const commitArgs = (rev: string) => ["rev-parse", "--verify", "--quiet", "--end-of-options", `${rev}^{commit}`];
const fullArgs = (rev: string) => ["rev-parse", "--verify", "--quiet", "--symbolic-full-name", "--end-of-options", rev];

/** `askedBase`, asking git now. */
export function resolveBase(c: Pick<Checkout, "root">, rev: string): AskedBase {
  return askedBase(rev, (r) => {
    const commit = ask(c.root, commitArgs(r))?.trim();
    return commit ? { commit, full: ask(c.root, fullArgs(r))?.trim() ?? "" } : null;
  });
}

/** `askedBase`, without waiting on git: the screen's. */
export async function resolveBaseLater(
  c: Pick<Checkout, "root">,
  rev: string,
  signal?: AbortSignal,
): Promise<AskedBase> {
  const r = rev.trim();
  const bad = notARevision(r);
  if (bad) return { error: bad };
  const [commit, full] = await Promise.all([
    gitReadLater(c, commitArgs(r), false, signal),
    gitReadLater(c, fullArgs(r), false, signal),
  ]);
  return askedBase(r, () => (commit?.trim() ? { commit: commit.trim(), full: full?.trim() ?? "" } : null));
}

/**
 * `slipbox [path] --base <ref>`: the base of the branch checked out at `root`, kept as "Compare against…" keeps it, so
 * the screen and the next session measure the branch against it. `error`: the ref names no commit, and the screen isn't
 * opened. `warn`: kept for nothing — not a repository, a detached HEAD, the branch itself. `note`: kept, and said.
 */
export function baseAtOpen(root: string, rev: string): { error: string } | { warn: string } | { note: string } {
  const c = checkoutOf(root);
  if (!c) return { warn: `--base ${rev}: not in a git repository, so it's ignored` };
  const asked = resolveBase(c, rev);
  if ("error" in asked) return { error: `--base: ${asked.error}` };
  const branch = headOf(c).branch;
  if (!branch) return { warn: `--base ${asked.base}: HEAD is detached, so there's no branch to keep it for` };
  if (asked.full === `refs/heads/${branch}`)
    return { warn: `--base ${rev.trim()}: that's the branch itself, so its base is guessed` };
  keepBase(c, branch, asked.base);
  return { note: `${branch} is compared against ${asked.base}${asked.commit ? ` (${rev.trim()})` : ""} now` };
}

/** Whether `ref` is a remote-tracking branch (`origin/dev`): only as fresh as the last fetch. */
export function isRemoteTracking(c: Pick<Checkout, "common">, ref: string): boolean {
  if (!refName(ref) || !ref.includes("/")) return false;
  if (existsSync(join(c.common, "refs", "remotes", ref))) return true;
  try {
    return readFileSync(join(c.common, "packed-refs"), "utf8").includes(` refs/remotes/${ref}\n`);
  } catch {
    return false;
  }
}

/**
 * When a remote-tracking branch last moved here (its reflog's last entry, written by the fetch that moved it); null
 * where git keeps no such record, as for a branch a clone made. A fetch that finds nothing new doesn't move it.
 */
export function remoteMovedAt(c: Pick<Checkout, "common">, ref: string): number | null {
  try {
    const lines = readFileSync(join(c.common, "logs", "refs", "remotes", ref), "utf8")
      .trimEnd()
      .split("\n");
    const when = / (\d+) [+-]\d{4}\t/.exec(lines.at(-1) ?? "");
    return when ? Number(when[1]) * 1000 : null;
  } catch {
    return null;
  }
}

/** How long ago `at` was, in a few words: `just now`, `5 min ago`, `3 h ago`, `2 days ago`. */
export function agoSaid(at: number, now = Date.now()): string {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** The remote-tracking branches (`origin/dev`), not their `HEAD`s, without waiting on git. */
export async function remoteBranchesLater(c: Pick<Checkout, "root">, signal?: AbortSignal): Promise<string[]> {
  const out = await gitReadLater(
    c,
    ["for-each-ref", "--format=%(refname:short)%00%(symref)", "refs/remotes/"],
    false,
    signal,
  );
  return (out ?? "")
    .split("\n")
    .map((line) => line.split("\0"))
    .filter(([name, symref]) => !!name && !symref && name.includes("/") && refName(name))
    .map(([name]) => name!);
}
