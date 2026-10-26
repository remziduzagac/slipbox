// The repositories in a folder, for the git panel following the vault (VV-D10, GIT-D11): found by looking a few levels
// down — not into hidden or busy folders, nor into a repository, whose folders are its own — each checkout grouped with
// the others of its repository (a worktree beside its main one), and what each has to say: its branch, its uncommitted
// files, how far it's ahead of its upstream and behind it. Asked in the background, only for the rows the panel shows;
// ordered by what needs attention.

import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { type Checkout, checkoutOf, headOf } from "./git.ts";
import { repoKey } from "./gitbase.ts";
import type { Track } from "./gitremote.ts";
import { type StatusEntry, statusLater } from "./gitstage.ts";
import { type Config, DEFAULT_CONFIG } from "./application/config/config.ts";
import { busyFolderAt } from "./workspace/walk/walk.ts";

/** A repository found: its checkouts in the folder looked in, the main one first. */
export interface RepoFound {
  /** Its key (its shared git folder): one for all its checkouts. */
  key: string;
  /** Its name: its main checkout's folder's. */
  name: string;
  checkouts: Checkout[];
}

/** How far down a folder's repositories are looked for, and how many folders at most. */
export const REPO_DEPTH = 3;
const MAX_FOLDERS = 2000;

/**
 * The repositories under `dir` (it among them when it is one), looked for `depth` levels down: hidden folders and busy
 * ones (`node_modules`, `target`… that look generated, D237; `walk` says what a note is) aren't looked into, nor is a
 * repository. A worktree found beside its main checkout is listed under it.
 */
export async function reposUnder(
  dir: string,
  depth = REPO_DEPTH,
  walk: Config["walk"] = DEFAULT_CONFIG.walk,
): Promise<RepoFound[]> {
  const found: Checkout[] = [];
  let seen = 0;
  const look = async (at: string, level: number): Promise<void> => {
    if (seen++ > MAX_FOLDERS) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(at, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.name === ".git")) {
      const c = checkoutOf(at);
      if (c && c.root === at) {
        found.push(c);
        return;
      }
    }
    if (level >= depth) return;
    const folders = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !busyFolderAt(join(at, e.name), walk))
      .map((e) => e.name)
      .sort();
    for (const name of folders) await look(join(at, name), level + 1);
  };
  await look(dir, 0);
  return groupRepos(found);
}

/** Checkouts grouped by repository, the main checkout first, each group named after it; by name. */
export function groupRepos(checkouts: Checkout[]): RepoFound[] {
  const by = new Map<string, Checkout[]>();
  for (const c of checkouts) {
    const key = repoKey(c);
    by.set(key, [...(by.get(key) ?? []), c]);
  }
  return [...by.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort(
        (a, b) => Number(!!a.worktree) - Number(!!b.worktree) || a.root.localeCompare(b.root),
      );
      const first = sorted[0]!;
      return { key, name: basename(first.main ?? first.root), checkouts: sorted };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

/** What a checkout has to say: its branch, its uncommitted files, where it stands against its upstream. */
export interface CheckoutState {
  branch: string | null;
  entries: StatusEntry[];
  track: Track | null;
}

/** A checkout's state, asked in the background; null without git. */
export async function checkoutStateLater(c: Checkout): Promise<CheckoutState | null> {
  const answer = await statusLater(c);
  if (!answer) return null;
  const h = headOf(c);
  return { branch: h.branch ?? (h.commit ? h.commit.slice(0, 7) : null), entries: answer.entries, track: answer.track };
}

/**
 * How much a repository needs attention (VV-D10), most first: something to review (a worktree's changes, an agent's
 * work), changes, ahead of or behind its upstream, clean; 0 while git hasn't said.
 */
export function attention(states: (CheckoutState | null | undefined)[]): number {
  if (states.every((s) => !s)) return 0;
  const [main, ...trees] = states;
  if (trees.some((s) => s?.entries.length)) return 4;
  if (main?.entries.length) return 3;
  if (states.some((s) => s?.track && (s.track.ahead || s.track.behind))) return 2;
  return 1;
}
