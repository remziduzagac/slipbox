// Generated edits as plans (plan 20.18; blueprint/design/links.md § Repairs): a rename's, a move's, a
// relink's edits saved as a plan in a first step, applied in a second — tied to each file's content
// as it was when planned, refused when any has changed since: a stale plan is never applied. So an
// agent reviews before it writes. A plan applies once; applied, it's gone.

import { randomBytes } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, readJson, writeJson } from "./foundation/platform/fsutil.ts";
import { stateHome } from "./foundation/platform/paths.ts";
import type { RenamePlan } from "./rename.ts";

export interface SavedPlan {
  version: 1;
  id: string;
  /** When it was made (ISO 8601). */
  made: string;
  /** The vault it was made in: applied, it's opened there again. */
  root: string;
  /** The command that made it, for saying so. */
  command: string;
  plan: RenamePlan;
}

export function plansDir(): string {
  return join(stateHome(), "plans");
}

/** Save `plan`, made by `command` in the vault at `root`: its id, for `slipbox apply`. */
export function savePlan(root: string, command: string, plan: RenamePlan, now = new Date()): SavedPlan {
  const saved: SavedPlan = {
    version: 1,
    id: randomBytes(4).toString("hex"),
    made: now.toISOString(),
    root,
    command,
    plan,
  };
  ensureDir(plansDir());
  writeJson(planFile(saved.id), saved);
  return saved;
}

function planFile(id: string): string {
  return join(plansDir(), `${id}.json`);
}

const PLAN_ID = /^[0-9a-f]{8}$/;

/**
 * A saved plan by its id, from slipbox's own plans folder — never a file named by its path: a plan says what to
 * write, so only one slipbox saved is applied. Null when there's none, or it isn't one.
 */
export function loadPlan(id: string): SavedPlan | null {
  if (!PLAN_ID.test(id)) return null;
  const p = readJson<SavedPlan | null>(planFile(id), null);
  return p?.version === 1 && p.id === id && typeof p.root === "string" && p.plan && Array.isArray(p.plan.files)
    ? p
    : null;
}

/** A plan applied (or given up): gone. */
export function forgetPlan(id: string): void {
  rmSync(planFile(id), { force: true });
}

/** The plans waiting to be applied, newest first. */
export function listPlans(): SavedPlan[] {
  let names: string[] = [];
  try {
    names = readdirSync(plansDir()).filter((n) => /^[0-9a-f]{8}\.json$/.test(n));
  } catch {}
  return names
    .map((n) => loadPlan(n.slice(0, -".json".length)))
    .filter((p): p is SavedPlan => !!p)
    .sort((a, b) => (a.made < b.made ? 1 : -1));
}
