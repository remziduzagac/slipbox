// Collections apart from instances (plan 20.4; docs/idea.md, "Virtual vaults"). A collection is what
// a vault is — a `.slipbox/`'s id, or a repository recognised by its remotes or its first commits:
// evidence that two folders hold the same thing, never an identity. An instance is one copy on this
// machine — a clone, a worktree, an opened plain folder — with a local id slipbox gives it, kept in
// the machine's list with where it is (registry.ts).

import { execFileSync } from "node:child_process";
import { isAbsolute, join, normalize, resolve } from "node:path";
import { readRegular, SMALL_FILE } from "./fsutil.ts";
import { checkoutOf } from "./git.ts";
import { readIdentity, vaultConfigFile } from "./registry.ts";

/** What a folder holds, as evidence: any one shared with another folder's says it's the same. */
export interface Collection {
  /** `.slipbox/`'s `[vault] id`, when it has one. */
  slipbox: string | null;
  /** The repository's remotes: host and path, never a user or a password (`normalizeRemote`). */
  remotes: string[];
  /** Its first commits: one, or several when unrelated histories were merged. */
  roots: string[];
}

export const NO_COLLECTION: Collection = { slipbox: null, remotes: [], roots: [] };

/** Whether two folders hold the same thing: the same `.slipbox/` id, a remote or a first commit shared. */
export function sameCollection(a: Collection | undefined, b: Collection | undefined): boolean {
  if (!a || !b) return false;
  if (a.slipbox && a.slipbox === b.slipbox) return true;
  return a.remotes.some((r) => b.remotes.includes(r)) || a.roots.some((r) => b.roots.includes(r));
}

/** No collection to speak of: a plain folder's. */
export function isEmptyCollection(c: Collection | undefined): boolean {
  return !c || (!c.slipbox && !c.remotes.length && !c.roots.length);
}

/**
 * A remote's URL as evidence: `host/path` — no scheme, user, password, port or `.git` — so one
 * repository compares equal over ssh and https (`git@github.com:a/b.git`, `https://github.com/a/b`);
 * a local one as `file:` and its absolute path, a relative one from `top`. Null when it isn't a URL.
 */
export function normalizeRemote(url: string, top: string): string | null {
  const u = url.trim();
  if (!u) return null;
  const local = (p: string) => `file:${normalize(p).replace(/\/+$/, "").replace(/\/\.git$/i, "").replace(/\.git$/i, "")}`;
  const tidy = (host: string, path: string) => {
    const p = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
    return host && p ? `${host.toLowerCase()}/${p}` : null;
  };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return null;
    }
    let path = parsed.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {}
    return parsed.protocol === "file:" ? local(path) : tidy(parsed.hostname, path);
  }
  if (isAbsolute(u)) return local(u);
  // scp-like, `[user@]host:path`: a colon before any slash.
  const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(u);
  if (scp) return tidy(scp[1]!, scp[2]!);
  return local(resolve(top, u));
}

/** The `[remote "…"] url`s of a git config file, as evidence. */
export function remotesIn(configText: string, top: string): string[] {
  const out = new Set<string>();
  let inRemote = false;
  for (const raw of configText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    if (line.startsWith("[")) {
      inRemote = /^\[\s*remote\s+"(?:[^"\\]|\\.)*"\s*\]/i.test(line);
      continue;
    }
    if (!inRemote) continue;
    const kv = /^url\s*=\s*(.*)$/i.exec(line);
    if (!kv) continue;
    let value = kv[1]!.trim();
    if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    const n = normalizeRemote(value, top);
    if (n) out.add(n);
  }
  return [...out].sort();
}

/** The first commits of the checkout at `top` (git's answer), or none: no git, no commit yet. */
export function rootCommits(top: string): string[] {
  try {
    const out = execFileSync("git", ["-C", top, "rev-list", "--max-parents=0", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
    return out.split("\n").filter((l) => /^[0-9a-f]{40,64}$/.test(l)).sort();
  } catch {
    return [];
  }
}

/**
 * The evidence for the folder at `root`: its `.slipbox/` id, and its repository's remotes and first
 * commits. `known` is what was found before: first commits don't change, so git is asked once.
 */
export function collectionOf(root: string, known?: Collection): Collection {
  const slipbox = readIdentity(vaultConfigFile(root)).id;
  const c = checkoutOf(root);
  if (!c) return { slipbox, remotes: [], roots: [] };
  let config = "";
  try {
    config = readRegular(join(c.common, "config"), SMALL_FILE).toString("utf8");
  } catch {}
  const remotes = remotesIn(config, c.main ?? c.root);
  const roots = known?.roots.length ? known.roots : rootCommits(c.root);
  return { slipbox, remotes, roots };
}

/** The evidence, said briefly: `.slipbox/ 3f2a…, github.com/a/b, first commit 1a2b3c4`. */
export function describeCollection(c: Collection | undefined): string {
  if (isEmptyCollection(c)) return "none: a folder of its own";
  const parts = [...(c!.slipbox ? [`.slipbox/ ${c!.slipbox}`] : []), ...c!.remotes, ...c!.roots.map((r) => `first commit ${r.slice(0, 7)}`)];
  return parts.join(", ");
}

/** Other copies, as info lists them: the five seen last, each by its path, then how many more. */
export function copiesShown(copies: { path: string; seen: string; worktree?: { name: string } }[], max = 5): string[] {
  const sorted = [...copies].sort((a, b) => (a.seen < b.seen ? 1 : -1));
  const shown = sorted.slice(0, max).map((v) => `${v.path}${v.worktree ? ` (worktree ${v.worktree.name})` : ""}`);
  return sorted.length > max ? [...shown, `and ${sorted.length - max} more: slipbox vaults lists them`] : shown;
}
