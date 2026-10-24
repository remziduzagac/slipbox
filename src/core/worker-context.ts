// What the TUI's walk and listing threads (T12), and its backlinks' (#10), can't see for themselves, carried with each
// request and taken as theirs before it's answered: the environment naming slipbox's own folders (a worker has the one
// the process started with, not the one now: a test's `HOME`), the root markers your config names, and what the
// followed links' targets answered (VV-D6: never asked there).

import { probeAnswers, takeProbeAnswers } from "./symlinks.ts";
import { rootMarkers, setRootMarkers } from "./vault.ts";

export interface WalkContext {
  env: Record<string, string>;
  markers: string[];
  probes: [string, { ok: boolean; at: number }][];
}

/** Whether `name` is one of the variables a walk reads (`WalkContext.env`). */
export const walkEnvName = (name: string): boolean =>
  name === "HOME" || name.startsWith("XDG_") || name.startsWith("SLIPBOX_");

/** What the thread that asks knows, as it is now. */
export function walkContext(): WalkContext {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env))
    if (value !== undefined && walkEnvName(name)) env[name] = value;
  return { env, markers: rootMarkers(), probes: probeAnswers() };
}

/** What the thread that asked knew, taken as this thread's own. */
export function enterContext(context: WalkContext): void {
  for (const name of Object.keys(process.env))
    if (walkEnvName(name) && !(name in context.env)) delete process.env[name];
  Object.assign(process.env, context.env);
  setRootMarkers(context.markers);
  takeProbeAnswers(context.probes);
}
