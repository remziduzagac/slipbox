// Peek path admission, root discovery and explicit destination switching.

import { existsSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import type { Anchor } from "../../../../core/workspace/session/position.ts";
import { isInside, locateVault, type VaultLocation } from "../../../../core/workspace/vaults/vault.ts";
import { linkPlace, type OpenAsk } from "../../../../core/workspace/walk/key-jobs.ts";
import type { App } from "../../../app/runtime/app.ts";

/**
 * The link keeping the peek from reading `abs` (VV-D6): one of this vault's on its way, asked about first (`gate`), or
 * one the place it's peeked into hasn't followed, by that place's rule — that vault's, home's, Elsewhere's from the
 * file's own folder.
 */
export function unfollowed(app: App, abs: string, loc: VaultLocation): { link: string; target: string | null } | null {
  return app.following.blocked(abs) ?? app.following.blockedThere(abs, loc);
}

/**
 * `abs` read for a peek or a list's preview (SD-T5): its text alone, its way checked as `unfollowed` checks it — this
 * vault's links on it first (`own`: whether they're asked; a block `at` 0 is theirs), then the place it's in (`loc`).
 */
export function peekAsk(app: App, abs: string, loc: VaultLocation): { ask: OpenAsk; own: boolean } {
  const own = app.loc.mode === "folder" || isInside(app.loc.root, abs);
  const ways = [...(own ? [linkPlace(app.loc)] : []), linkPlace(loc)];
  return { ask: { path: abs, outside: false, ways, looking: [...app.following.looking], textOnly: true }, own };
}

/**
 * Where a path leads, when it leads out of this vault — into another vault, or into Elsewhere: its absolute path and
 * that vault (Elsewhere's location from its folder). Null for this vault's own, or for nothing there.
 */
export function leadsOut(app: App, path: string): { abs: string; loc: VaultLocation } | null {
  const abs = isAbsolute(path) ? path : join(app.loc.root, path);
  if (!existsSync(abs)) return null;
  let loc: VaultLocation;
  try {
    loc = locateVault({ path: abs });
  } catch {
    return null;
  }
  // A vault's own files, nested vaults apart (each is its own, VV-D4) — home's too, a vault without a marker (VV-D2);
  // in Elsewhere, every file outside home and the vaults: it's one place (VV-D3).
  if (loc.mode !== "folder") return loc.root === app.loc.root ? null : { abs, loc };
  return app.loc.mode === "folder" ? null : { abs, loc };
}

/** A path as this vault reaches it: one of its own by its path in it, any other absolute. */
export function ownPath(app: App, path: string): string {
  // Elsewhere's (VV-D3) by their whole paths, wherever they are.
  if (!isAbsolute(path) || app.loc.mode === "folder" || leadsOut(app, path) || !isInside(app.loc.root, path))
    return path;
  return relative(app.loc.root, path) || path;
}

/**
 * Go where a file is (VV-D4): into its vault — Elsewhere among them (VV-D3) — the tabs becoming its own, as a switch
 * does (`ctrl+o` back). A switch refused (a note unsaved, said) leaves the peek as it was.
 */
export function goThere(app: App, abs: string, loc: VaultLocation, anchor?: Anchor): void {
  const f = app.floating;
  if (!app.vaults.switchVault(loc, abs, anchor) && f?.kind === "peek" && !app.floating) app.floating = f;
}
