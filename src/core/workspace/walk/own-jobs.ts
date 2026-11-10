// slipbox's own folders read on a disk thread (SD-T9; disk-jobs.ts hands these here): a vault's session as it's gone
// into, the vaults the machine knows as the Vaults window opens, other vaults' notes as a link's completion opens. Each
// read as the screen's thread would read it — the same code, through the seam (SD-D10) — the folders found as it is
// asked (`walkContext`'s environment: XDG_STATE_HOME, XDG_CACHE_HOME).

import { join } from "node:path";
import * as disk from "../../foundation/platform/disk.ts";
import { readJson } from "../../foundation/platform/fsutil.ts";
import { cacheDir, stateDir } from "../../foundation/platform/paths.ts";
import { type PointerMemo, pointerAt } from "../links/write-link.ts";
import type { PointerNaming } from "../vaults/folders.ts";
import { loadSession, type SessionState, type StatePlace } from "../session/position.ts";
import { readRoots } from "../vaults/registry.ts";
import { knownVaults, type VaultEntry } from "../vaults/vault-list.ts";

export type OwnJob = { op: "session"; place: StatePlace } | { op: "vaults" } | { op: "otherNotes"; root: string };

/** A vault's session as it's gone into, and the positions it kept itself before they were the machine's (21.8), as
 *  written then (null: none). */
export interface SessionRead {
  session: SessionState | null;
  positions: unknown;
}

/** Another vault's note a link from `root` could reach: the pointer a link to it is written with (null: none). */
export interface OtherNote {
  abs: string;
  at: { pointer: string; naming: PointerNaming } | null;
}

export type OwnAnswer = { session: SessionRead } | { vaults: VaultEntry[] } | { notes: OtherNote[] };

/** The positions file a vault kept itself before 21.8, taken in once. */
export const ownPositionsFile = (place: StatePlace): string => join(stateDir(place), "positions.json");

/** A vault's session and its positions of before (`SessionRead`). */
export function sessionRead(place: StatePlace): SessionRead {
  return { session: loadSession(place), positions: readJson<unknown>(ownPositionsFile(place), null) };
}

/** Other vaults' notes, as of their last index (20.13): the machine's list, each vault looked for, its `index.json`
 *  read; each note's pointer from `root` worked out (`pointerAt`), what pointers share worked out once. */
export function otherNotes(root: string): OtherNote[] {
  const memo: PointerMemo = { root, naming: new Map() };
  const out: OtherNote[] = [];
  for (const v of readRoots()) {
    if (v.kind !== "vault" || v.worktree || v.path === root || !disk.exists(v.path)) continue;
    const entries = readJson<{ entries?: Record<string, unknown> } | null>(
      join(cacheDir(v), "index.json"),
      null,
    )?.entries;
    for (const rel of Object.keys(entries ?? {})) {
      const abs = join(v.path, rel);
      out.push({ abs, at: pointerAt(root, abs, memo) });
    }
  }
  return out;
}

/** A job answered here: what it asked for, read as the screen's thread would. */
export function answerOwnJob(job: OwnJob): OwnAnswer {
  switch (job.op) {
    case "session":
      return { session: sessionRead(job.place) };
    case "vaults":
      return { vaults: knownVaults() };
    case "otherNotes":
      return { notes: otherNotes(job.root) };
  }
}
