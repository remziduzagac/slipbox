// Configuration value predicates and safe relative-path validation.

export const isString = (v: unknown): boolean => typeof v === "string";

export const isStrings = (v: unknown): boolean => Array.isArray(v) && v.every(isString);

export const isBoolean = (v: unknown): boolean => typeof v === "boolean";

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

export function validRegex(s: string): boolean {
  try {
    new RegExp(s);
    return true;
  } catch {
    return false;
  }
}

/** A relative path that stays inside its base: not empty, not absolute, no `..` segment. */
export function isSafeRelative(p: string): boolean {
  if (!p.trim() || p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p)) return false;
  // No "..", and no hidden segment: .git/, .slipbox/ and dot-files are never a scratch.
  return !p.split(/[\\/]/).some((seg) => seg === ".." || seg.startsWith("."));
}
