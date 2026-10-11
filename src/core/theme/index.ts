// Theme lookup: built-ins, then base16/base24 YAML files in ~/.config/slipbox/themes/.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { userThemesDir } from "../paths.ts";
import { base16ToPalette, parseBase16 } from "./base16.ts";
import { builtinThemes } from "./builtin.ts";
import { type Color, monoTheme, type Role, ROLES, type RoleStyle, type Theme, terminalTheme, themeFromPalette } from "./theme.ts";

export * from "./theme.ts";

export const DEFAULT_THEME = "tokyo-night";

export interface ThemeListing {
  name: string;
  source: "built-in" | "base16" | "user";
  path?: string;
}

export function listThemes(dir = userThemesDir()): ThemeListing[] {
  // A user file shadows a built-in of the same name (loadTheme looks there first), so list it once.
  const user = userThemeFiles(dir);
  const shadowed = new Set(user.map((f) => f.name));
  const out: ThemeListing[] = [];
  for (const [name] of builtinThemes()) if (!shadowed.has(name)) out.push({ name, source: "built-in" });
  for (const name of ["terminal", "mono"]) if (!shadowed.has(name)) out.push({ name, source: "built-in" });
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

/** A colour in config: `#rrggbb`, `default`, or a terminal palette number 0–255. */
function parseColor(v: unknown): Color | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 255) return `ansi:${v}`;
  if (typeof v !== "string") return null;
  if (/^#[0-9a-fA-F]{6}$/.test(v) || v === "default") return v;
  if (/^(ansi:)?\d{1,3}$/.test(v) && Number(v.replace("ansi:", "")) <= 255) return `ansi:${v.replace("ansi:", "")}`;
  return null;
}

const ATTRS = ["bold", "italic", "underline", "dim"] as const;

/**
 * Apply `[colors]` from config to a theme: `role = "#rrggbb"` sets the foreground, a table sets
 * `fg`, `bg` and the attributes; `[colors.<theme>]` applies only to that theme. Only the given
 * fields change. Under NO_COLOR (the mono theme) colours are ignored and attributes still apply.
 * Problems are warnings, never failures.
 */
export function applyColorOverrides(theme: Theme, colors: Record<string, unknown>): { theme: Theme; warnings: string[] } {
  const warnings: string[] = [];
  const roles = { ...theme.roles };
  const mono = theme.name === "mono";
  const one = (role: string, v: unknown, where: string, apply: boolean) => {
    if (!(ROLES as readonly string[]).includes(role)) return void warnings.push(`config: ${where}: unknown role "${role}"`);
    const spec: RoleStyle = {};
    if (typeof v === "string" || typeof v === "number") {
      const c = parseColor(v);
      if (!c) return void warnings.push(`config: ${where}.${role}: not a colour: ${JSON.stringify(v)} (use "#rrggbb", "default" or 0–255)`);
      spec.fg = c;
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v)) {
        if (k === "fg" || k === "bg") {
          const c = parseColor(x);
          if (c) spec[k] = c;
          else warnings.push(`config: ${where}.${role}.${k}: not a colour: ${JSON.stringify(x)}`);
        } else if ((ATTRS as readonly string[]).includes(k)) {
          if (typeof x === "boolean") spec[k as (typeof ATTRS)[number]] = x;
          else warnings.push(`config: ${where}.${role}.${k} must be true or false`);
        } else warnings.push(`config: ${where}.${role}: unknown field "${k}" (fg, bg, ${ATTRS.join(", ")})`);
      }
    } else return void warnings.push(`config: ${where}.${role}: a colour or a table`);
    if (mono) {
      delete spec.fg;
      delete spec.bg;
    }
    if (apply) roles[role as Role] = { ...roles[role as Role], ...spec };
  };
  for (const [key, v] of Object.entries(colors)) {
    // A table whose key isn't a role is a theme's own overrides.
    if (!(ROLES as readonly string[]).includes(key) && v && typeof v === "object" && !Array.isArray(v)) {
      for (const [role, x] of Object.entries(v as Record<string, unknown>)) one(role, x, `colors.${key}`, key === theme.name);
    } else one(key, v, "colors", true);
  }
  return { theme: { ...theme, roles }, warnings };
}
