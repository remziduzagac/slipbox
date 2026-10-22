// Advisory staleness (plan 9.9, decision 9.4): the TUI lists paths with unsaved changes in a small
// file in the state dir — never in the vault — stamped with its pid. The CLI surfaces it as a
// warning and a `stale` array. Advisory only, never a lock.

import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, readJson, writeJson } from "./fsutil.ts";
import { type Keyed, stateDir } from "./paths.ts";

interface StaleFile {
  pid: number;
  updated: string;
  paths: string[];
}

function fileFor(v: Keyed, pid: number): string {
  return join(stateDir(v), "dirty", `${pid}.json`);
}

/** Record this process's dirty paths; an empty list removes the file. */
export function writeDirty(v: Keyed, paths: string[], pid = process.pid): void {
  const file = fileFor(v, pid);
  if (!paths.length) {
    try {
      unlinkSync(file);
    } catch {}
    return;
  }
  ensureDir(join(stateDir(v), "dirty"));
  writeJson(file, { pid, updated: new Date().toISOString(), paths } satisfies StaleFile);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export interface StaleEntry {
  path: string;
  pid: number;
}

/** Paths some live slipbox TUI holds unsaved. Files from dead pids are ignored (and pruned). */
export function readStale(v: Keyed): StaleEntry[] {
  const dir = join(stateDir(v), "dirty");
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: StaleEntry[] = [];
  for (const name of names) {
    const data = readJson<StaleFile | null>(join(dir, name), null);
    // Advisory only: a file of the wrong shape is ignored, never a failure of every command.
    if (
      !data ||
      typeof data.pid !== "number" ||
      !Array.isArray(data.paths) ||
      !data.paths.every((p) => typeof p === "string")
    )
      continue;
    if (!alive(data.pid)) {
      try {
        unlinkSync(join(dir, name));
      } catch {}
      continue;
    }
    for (const p of data.paths) out.push({ path: p, pid: data.pid });
  }
  return out;
}
