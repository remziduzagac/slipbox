// Theme lookup: built-ins, then base16/base24 YAML files in ~/.config/slipbox/themes/.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { userThemesDir } from "../paths.ts";
import { base16ToPalette, parseBase16 } from "./base16.ts";
import { builtinThemes } from "./builtin.ts";
import { monoTheme, type Theme, terminalTheme, themeFromPalette } from "./theme.ts";

export * from "./theme.ts";

export const DEFAULT_THEME = "tokyo-night";

export interface ThemeListing {
  name: string;
  source: "builtin" | "base16" | "user";
  path?: string;
}

export function listThemes(dir = userThemesDir()): ThemeListing[] {
  // A user file shadows a built-in of the same name (loadTheme looks there first), so list it once.
  const user = userThemeFiles(dir);
  const shadowed = new Set(user.map((f) => f.name));
  const out: ThemeListing[] = [];
  for (const [name] of builtinThemes()) if (!shadowed.has(name)) out.push({ name, source: "builtin" });
  for (const name of ["terminal", "mono"]) if (!shadowed.has(name)) out.push({ name, source: "builtin" });
  for (const f of user) out.push({ name: f.name, source: "user", path: f.path });
  return out;
}

function userThemeFiles(dir: string): { name: string; path: string }[] {
  try {
    return readdirSync(dir)
      .filter((f) => /\.ya?ml$/i.test(f))
      .map((f) => ({ name: f.replace(/\.ya?ml$/i, ""), path: join(dir, f) }));
  } catch {
    return [];
  }
}

export interface ThemeResult {
  theme: Theme;
  warning: string | null;
}

/** Resolve a theme by name. Unknown or broken themes fall back to the default with a warning. */
export function loadTheme(name: string, dir = userThemesDir()): ThemeResult {
  const user = userThemeFiles(dir).find((f) => f.name === name);
  if (!user && name === "terminal") return { theme: terminalTheme(), warning: null };
  if (!user && name === "mono") return { theme: monoTheme(), warning: null };
  if (user) {
    try {
      const scheme = parseBase16(readFileSync(user.path, "utf8"), name);
      return { theme: themeFromPalette(name, base16ToPalette(scheme), "user"), warning: null };
    } catch (err) {
      return fallback(`theme ${name}: ${user.path}: ${(err as Error).message}`);
    }
  }
  const builtin = builtinThemes().get(name);
  if (builtin) return { theme: builtin(), warning: null };
  return fallback(`unknown theme "${name}" — using ${DEFAULT_THEME}. \`slipbox themes\` lists them.`);
}

function fallback(warning: string): ThemeResult {
  return { theme: builtinThemes().get(DEFAULT_THEME)!(), warning };
}
