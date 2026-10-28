// Busy-folder inspection through the containing root and its live filter.

import { basename, dirname, relative, sep } from "node:path";
import type { Config } from "../../../application/config/config.ts";
import { findVaultRoot } from "../../vaults/vault.ts";
import { isBusyName } from "./policy.ts";
import type { BusyWhy } from "../contracts.ts";
import { WalkFilter } from "./filter.ts";

/**
 * The rule asked of a folder outside every walk at hand (the explorer's rows above or beside the vault open): ignored
 * as the walk of the vault holding it reads its `.gitignore`s; home and Elsewhere read none.
 */
export function busyFolderAt(abs: string, walk: Config["walk"]): boolean {
  if (!isBusyName(basename(abs))) return false;
  const { filter, rel } = filterHolding(abs, walk);
  return filter.busy(rel);
}

/** `busyFolderAt`, saying why (`busyWhy`): null when the folder `abs` isn't busy. */
export function busyFolderWhyAt(abs: string, walk: Config["walk"]): BusyWhy | null {
  if (!isBusyName(basename(abs))) return null;
  const { filter, rel } = filterHolding(abs, walk);
  return filter.busyWhy(rel);
}

/** The filter of the walk of the vault holding `abs`, and its path there; outside every vault, home's rules. */
export function filterHolding(abs: string, walk: Config["walk"]): { filter: WalkFilter; rel: string } {
  const root = findVaultRoot(dirname(abs));
  const filter = new WalkFilter(root ?? dirname(abs), walk, { home: !root });
  return { filter, rel: root ? relative(root, abs).split(sep).join("/") : basename(abs) };
}
