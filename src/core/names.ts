// Names for display (plan 20.6; docs/idea.md, "Virtual vaults"): as short as they can be and unique on
// this machine. A vault's own name is what its `.slipbox/` declares, else its repository's, else its
// folder's; two vaults that would share one are told apart by their folders, joined with `.`
// (`work.docs`, `home.docs`) — never `/`, and never `:`, which separates a vault from a path. A
// worktree shows the branch checked out in it now: `pathfinder@refactor`. Never written into a file.

import { basename, dirname, join, relative, sep } from "node:path";
import { checkoutOf, headOf } from "./git.ts";
import { type KnownVault, readRegistry, slugName, vaultNamed } from "./registry.ts";
import { findVaultRoot, homeFolder, isInside, type VaultLocation } from "./vault.ts";

/** The branch checked out at `path` now (a detached head: its commit, short); null outside git. */
export function branchAt(path: string): string | null {
  const c = checkoutOf(path);
  if (!c) return null;
  const h = headOf(c);
  return h.branch ?? h.commit?.slice(0, 7) ?? null;
}

/** The folders that can tell a vault apart, nearest first, as name parts: its own when its name isn't it, then those above. */
function folders(path: string, name: string): string[] {
  const out: string[] = [];
  const own = slugName(basename(path)) || "_";
  if (own.toLowerCase() !== name.toLowerCase()) out.push(own);
  for (let dir = dirname(path); dirname(dir) !== dir; dir = dirname(dir)) out.push(slugName(basename(dir)) || "_");
  return out;
}

/**
 * Each vault's name to show, by its key: unique among the vaults this machine knows. Vaults that would
 * share a name each take their nearest folders, as few as tell them apart. A worktree's is its main
 * checkout's and the branch now (`branch`: asked of git, a test's stand-in).
 */
export function displayNames(known: KnownVault[], branch: (path: string) => string | null = branchAt): Map<string, string> {
  const vaults = known.filter((v) => v.kind === "vault");
  const out = new Map<string, string>();
  const own = (v: KnownVault) => v.name ?? (slugName(basename(v.path)) || "vault");
  const groups = new Map<string, KnownVault[]>();
  for (const v of vaults.filter((x) => !x.worktree)) {
    const k = own(v).toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.set(list[0]!.key, own(list[0]!));
      continue;
    }
    // Folders, nearest first, as few as tell them apart: a level they all share tells nothing and is
    // left out (`examples.halden`, not `examples.vault.halden`). Two at the same path (a stale entry)
    // keep a piece of their key.
    const ups = list.map((v) => folders(v.path, own(v)));
    const deepest = Math.max(...ups.map((u) => u.length));
    const levels: number[] = [];
    const at = (i: number) => [...levels].reverse().map((l) => ups[i]![l] ?? "_").concat(own(list[i]!)).join(".");
    const apart = () => new Set(list.map((_, i) => at(i).toLowerCase())).size === list.length;
    for (let level = 0; level < deepest && !apart(); level++) {
      if (new Set(ups.map((u) => (u[level] ?? "_").toLowerCase())).size > 1) levels.push(level);
    }
    list.forEach((v, i) => {
      const name = at(i);
      const twin = list.some((_, j) => j !== i && at(j).toLowerCase() === name.toLowerCase());
      out.set(v.key, twin ? `${name}.${(v.instance ?? v.key).slice(0, 4)}` : name);
    });
  }
  for (const v of vaults.filter((x) => x.worktree)) {
    const main = vaults.find((m) => !m.worktree && m.path === v.worktree!.main);
    const head = main ? out.get(main.key)! : own(v);
    out.set(v.key, `${head}@${branch(v.path) ?? v.worktree!.name}`);
  }
  return out;
}

/** One vault's name to show, among those this machine knows; its own name if it isn't listed yet. */
export function displayName(v: Pick<KnownVault, "key" | "name" | "path">, known: KnownVault[], branch?: (path: string) => string | null): string {
  return displayNames(known, branch).get(v.key) ?? v.name ?? (slugName(basename(v.path)) || "vault");
}

/** The opened vault's name to show: unique on this machine (20.6); a plain folder, unnamed, its path (20.22). */
export function locName(loc: Pick<VaultLocation, "mode" | "key" | "name" | "root">, known = readRegistry()): string {
  return loc.mode === "folder" ? tildePath(loc.root) : displayName({ key: loc.key, name: loc.name, path: loc.root }, known);
}

/** A path as it's shown: `~/…` in the home folder. */
export function tildePath(abs: string): string {
  const home = homeFolder();
  return abs === home ? "~" : abs.startsWith(`${home}/`) ? `~/${abs.slice(home.length + 1)}` : abs;
}

/**
 * A file as it's shown (20.12): in the vault `here`, its path there (`docs/plan.md`); in another
 * vault, a nested one too, that vault's name and its path there (`research:algorithms/dijkstra.md`);
 * in none, its path (`~/` for the home folder's). On screen and in the CLI only — never in a file.
 */
export function vaultForm(abs: string, here: string | null, nameOf: (root: string) => string | null): string {
  const posixRel = (from: string) => relative(from, abs).split(sep).join("/") || ".";
  const root = findVaultRoot(abs);
  if (here && (root === here || (!root && isInside(here, abs)))) return posixRel(here);
  if (root) return `${nameOf(root) ?? (slugName(basename(root)) || "vault")}:${posixRel(root)}`;
  const home = homeFolder();
  return abs.startsWith(`${home}/`) ? `~/${posixRel(home)}` : abs;
}

/**
 * A file named in the `vault:path` form (20.20): the vault, among those this machine knows, by the
 * name it's shown with (20.6) — or by its own, or an old one, when no other vault has it; the path in
 * it, from its root. Null when the part before `:` names no vault: a note's name can have a colon.
 * A path that climbs out of the vault (`..`) names nothing in it: null too.
 */
export function fromVaultForm(form: string, known = readRegistry(), branch?: (path: string) => string | null): { root: string; rel: string; abs: string } | null {
  const at = form.indexOf(":");
  if (at <= 0) return null;
  const name = form.slice(0, at).toLowerCase();
  const shown = displayNames(known, branch);
  let v = known.find((x) => shown.get(x.key)?.toLowerCase() === name);
  if (!v) {
    const own = vaultNamed(name, known).filter((x) => x.kind === "vault" && !x.worktree);
    if (own.length === 1) v = own[0];
  }
  if (!v) return null;
  const abs = join(v.path, form.slice(at + 1));
  if (!isInside(v.path, abs)) return null;
  return { root: v.path, rel: relative(v.path, abs).split(sep).join("/"), abs };
}

/**
 * A `vault:path` whose vault name several vaults share as their own (20.20): each one's form by the
 * name it's shown with (`work.docs:a.md`, `home.docs:a.md`), to pick from — never a guess between
 * them. Empty when it names one vault, or none.
 */
export function vaultFormChoices(form: string, known = readRegistry(), branch?: (path: string) => string | null): string[] {
  const at = form.indexOf(":");
  if (at <= 0 || fromVaultForm(form, known, branch)) return [];
  const own = vaultNamed(form.slice(0, at), known).filter((x) => x.kind === "vault" && !x.worktree);
  if (own.length < 2) return [];
  const shown = displayNames(known, branch);
  return own.map((v) => `${shown.get(v.key) ?? v.name}:${form.slice(at + 1)}`).sort();
}
