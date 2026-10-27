// Shared trash storage and vault-marker operations (18.4, 18.11, DF-D14), below file/rename orchestration.
// This module must not import mutation controllers; both file operations and rename execution use it.

import { randomBytes } from "node:crypto";
import { cpSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { readJson, writeJson } from "../../foundation/platform/fsutil.ts";
import { type Keyed, stateDir } from "../../foundation/platform/paths.ts";

export interface TrashItem {
  id: string;
  /** Where it was: absolute, and as shown. */
  abs: string;
  shown: string;
  dir: boolean;
  /** When it was deleted (ISO 8601). */
  at: string;
}

interface TrashFile {
  version: 1;
  items: TrashItem[];
}

export function trashDir(v: Keyed): string {
  return join(stateDir(v), "trash");
}

function trashIndex(v: Keyed): string {
  return join(trashDir(v), "trash.json");
}

/** How long the trash keeps a thing (DF-D14): older, it goes for good when the trash is next read or written. */
export const TRASH_DAYS = 30;

/** What's in the trash, newest first; anything older than {@link TRASH_DAYS} removed for good on the way. */
export function listTrash(v: Keyed, now = new Date()): TrashItem[] {
  const f = readJson<TrashFile | null>(trashIndex(v), null);
  if (f?.version !== 1 || !Array.isArray(f.items)) return [];
  const items = f.items.filter((i) => i && typeof i.id === "string" && typeof i.abs === "string");
  const since = now.getTime() - TRASH_DAYS * 86_400_000;
  // A date that doesn't read is kept: only what is surely older goes.
  const old = new Set(items.filter((i) => Date.parse(i.at) < since).map((i) => i.id));
  if (!old.size) return items;
  const kept = items.filter((i) => !old.has(i.id));
  removeItems(v, kept, old);
  return kept;
}

/**
 * Empty the trash (DF-D14): every item — or those of `ids`, what a preview showed — gone for good. The list
 * is written first, so a stop halfway leaves bytes in the trash's folder, never an item that can't be restored.
 */
export function emptyTrash(v: Keyed, ids?: readonly string[], now = new Date()): TrashItem[] {
  const items = listTrash(v, now);
  const want = ids ? new Set(ids) : null;
  const gone = items.filter((i) => !want || want.has(i.id));
  if (gone.length)
    removeItems(
      v,
      items.filter((i) => !gone.includes(i)),
      new Set(gone.map((i) => i.id)),
    );
  return gone;
}

/** The trash's list written as `kept`, then the folders of `gone` removed from disk. */
function removeItems(v: Keyed, kept: TrashItem[], gone: Set<string>): void {
  saveTrash(v, kept);
  for (const id of gone) {
    // An id is the trash's own name for a folder in it; one edited to climb out is never followed.
    if (!/^[\w-]+$/.test(id)) continue;
    rmSync(join(trashDir(v), id), { recursive: true, force: true });
  }
}

export function saveTrash(v: Keyed, items: TrashItem[]): void {
  writeJson(trashIndex(v), { version: 1, items } satisfies TrashFile);
}

/** Move a path, across filesystems too (the state dir may be on another). */
export function moveTrashPath(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    cpSync(from, to, { recursive: true, preserveTimestamps: true });
    rmSync(from, { recursive: true, force: true });
  }
}

/**
 * A vault made a plain folder (18.11): its `.slipbox/` into the trash of the vault holding it,
 * restored like anything deleted — which makes it a vault again.
 */
export function trashVaultMarker(v: Keyed, parentRoot: string, vaultRoot: string, now = new Date()): TrashItem {
  const abs = join(vaultRoot, ".slipbox");
  const id = `${now.toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
  moveTrashPath(abs, join(trashDir(v), id, ".slipbox"));
  const item: TrashItem = {
    id,
    abs,
    shown: `${relative(parentRoot, vaultRoot)}/.slipbox`,
    dir: true,
    at: now.toISOString(),
  };
  saveTrash(v, [item, ...listTrash(v, now)]);
  return item;
}
