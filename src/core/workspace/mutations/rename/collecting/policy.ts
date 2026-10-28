// Original rewrite admission, displayed paths and existing-entry identity.

import { lstatSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { realTarget } from "../../../../foundation/platform/fsutil.ts";
import type { Graph } from "../../../graph/graph.ts";
import { isLink, movedLinkText, writesThrough } from "../../../vaults/symlinks.ts";
import { findVaultRoot, homeOf, isInside, vaultOf } from "../../../vaults/vault.ts";
import type { RenamePlan } from "./contracts.ts";

/** Where a link leads the file at `abs` that a plan may not write (`mayRewrite`, VV-D6), said. */
export const whereItLeads = (g: Graph, abs: string): string =>
  landsHidden(g, abs) ? "a link leads it into a folder the walk doesn't list" : "a link leads it out of the vault";

/** Why a plan may not write the file at `abs` (`mayRewrite`), said as its skipped row says it. */
export const notRewritten = (g: Graph, abs: string): string => `${whereItLeads(g, abs)}: not rewritten`;

/**
 * Whether a link on the way leads a write to `abs` where the vault or home holding it doesn't list (VV-D6): by its
 * real path, in a hidden folder or file of that place, `.git` and `.slipbox` among them, but one this vault has
 * reached there (20.8) — refused as it's refused named there, as the command line's `checkWritable` measures it: one
 * into `.shelved/`, or `~/notes/x.md → ~/.bashrc`. A path no link leads elsewhere is where it's named: a vault's
 * own `config.toml` is its own.
 */
export function landsHidden(g: Graph, abs: string): boolean {
  const real = realTarget(abs);
  const rootReal = realTarget(g.root);
  if (asNamed(g.root, abs, real, rootReal)) return false;
  // Past a link, the place it's named in by its path: a vault reached through one has its own config.toml.
  const named = vaultOf(abs);
  if (named && asNamed(named, abs, real)) return false;
  const place = vaultOf(real);
  if (!place) return false;
  const placeReal = realTarget(place);
  const there = relative(placeReal, real);
  if (!there.split(sep).some((part) => part.startsWith("."))) return false;
  return !(placeReal === rootReal && g.reached.has(there.split(sep).join("/")));
}

/** Whether `abs`, under `root`, lands where it's named, `real` its real path: no link on the way past `root`. */
export function asNamed(root: string, abs: string, real: string, rootReal = realTarget(root)): boolean {
  return isInside(root, abs) && join(rootReal, relative(root, abs)) === real;
}

/**
 * Whether a plan may write the file at `abs` (VV-D6): it lands where each place holding it allows — this vault, when
 * it's under it, and the nearest vault holding it, else home: a vault's never out of it by its real path, followed or
 * not; home's through the links home follows. A note reached through a link out of its vault is read, never written.
 * Elsewhere's only while it's the place open: it has no index for another's plan to find it by.
 */
export function mayRewrite(g: Graph, abs: string): boolean {
  if (landsHidden(g, abs)) return false;
  const here = isInside(g.root, abs);
  if (here && !writesThrough(g.loc, abs)) return false;
  const own = findVaultRoot(abs);
  if (own) return own === g.root || writesThrough({ mode: "vault", root: own }, abs);
  const home = homeOf(abs);
  if (home) return home === g.root || writesThrough({ mode: "home", root: home }, abs);
  return here && g.loc.mode === "folder";
}

/** Where a link's file is, as shown (21.9): its path from this root, else from home (`~/…`), else absolute. */
export function shownFor(g: Graph, abs: string): string {
  return g.shownPath(abs);
}

/** A path the walk lists only when it's reached (20.8): something hidden on its way. A busy folder is the filter's. */
export function walkSkips(rel: string): boolean {
  return rel.split("/").some((s) => s.startsWith("."));
}

/**
 * Whether `a` and `b` are one entry, as a case-only rename on a disk that ignores case has it: a link its own, never
 * what it leads to — a link moved onto its target, or onto another link to it, goes over something else (D260).
 */
export function sameEntry(a: string, b: string): boolean {
  try {
    const x = lstatSync(a);
    const y = lstatSync(b);
    // A second name for one file (a hard link) is another entry: one entry is in one folder, its name another case.
    if (x.ino !== y.ino || x.dev !== y.dev || realTarget(dirname(a)) !== realTarget(dirname(b))) return false;
    return basename(a).toLowerCase() === basename(b).toLowerCase();
  } catch {
    return false;
  }
}

/**
 * What a plan moving a link says of it (D260): a relative one moved itself to another folder is written again there, to
 * lead where it did — no link's edit, so said. `from` and `to` as the plan shows them.
 */
export function relinkSaid(move: RenamePlan["move"], from: string, to: string): string[] {
  const text = move?.link && isLink(move.from) ? movedLinkText(move.from, move.to) : null;
  return text ? [`${from} is a relative link: written again at ${to} to lead where it did (${text})`] : [];
}
