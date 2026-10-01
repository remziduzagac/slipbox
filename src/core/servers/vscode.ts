// A project's `.vscode/settings.json` (plan 19.20): its servers' settings, as VS Code answers them —
// what a project has set for VS Code already counts in slipbox, nothing restated. VS Code's own
// order: the defaults, then the user's (slipbox's config, a vault's over it), then the workspace's.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** The nearest `.vscode/settings.json` at or above a project's top folder, short of the home folder. */
export function vscodeSettingsFile(root: string): string | null {
  const home = homedir();
  for (let dir = root; dir !== home && dirname(dir) !== dir; dir = dirname(dir)) {
    const file = join(dir, ".vscode", "settings.json");
    if (existsSync(file)) return file;
  }
  return null;
}

/**
 * Its settings nested, as a server asks for them by section: `"python.analysis.typeCheckingMode"`
 * becomes `python.analysis.typeCheckingMode`, merged with any nested form beside it. A language's own
 * (`"[python]": {…}`) are VS Code's per-language overrides: left out. Null when there's none, or it
 * doesn't parse (JSON with comments and trailing commas, as VS Code reads it).
 */
export function vscodeSettings(root: string): Record<string, unknown> | null {
  const file = vscodeSettingsFile(root);
  if (!file) return null;
  let flat: unknown;
  try {
    flat = Bun.JSONC.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (!isObject(flat)) return null;
  let out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (key.startsWith("[")) continue;
    const nested: Record<string, unknown> = {};
    let at = nested;
    const parts = key.split(".");
    parts.slice(0, -1).forEach((p) => (at = at[p] = {}));
    at[parts.at(-1)!] = value;
    out = mergeSettings(out, nested);
  }
  return out;
}

/** `over` merged into `base`, tables by key, anything else replaced. */
export function mergeSettings(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const was = out[k];
    out[k] = isObject(v) && isObject(was) ? mergeSettings(was, v) : v;
  }
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
