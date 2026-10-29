// Configuration merge rules, retired settings and range/enum validation.

import { deepMerge, type LanguageConfig, type ServerConfig } from "../../../documents/servers/languages.ts";
import type { LinterConfig } from "../../../documents/servers/linters.ts";
import type { TypeConfig } from "../../../documents/model/doctypes.ts";
import { isPlainObject } from "./predicates.ts";
import { LANGUAGE_FIELDS, LINTER_FIELDS, SERVER_FIELDS, TYPE_FIELDS, checkFields } from "./fields.ts";

/** Settings that were, and why they aren't: said once, never an unknown key's warning. */
const RETIRED: Record<string, string> = {
  "ui.top_bar": "the top bar is always shown",
  rename: "renames no longer write a note's old name into it; links reach notes by their paths",
};

/** Values your config may still say vault for, each read as the word that took its place (DF-D22). */
const OLD_VALUES: Record<string, Record<string, string>> = {
  "capture.location": { vault: "root" },
  // The explorer's actions, bound in [keys.explorer].
  "keys.explorer": { rename_vault: "rename_root", make_vault: "make_root", unmake_vault: "unmake_root" },
};

/** The word that took an old one's place where `path` takes it, else the value as given. */
function renewed(path: string, value: string): string {
  const old = Object.hasOwn(OLD_VALUES, path) ? OLD_VALUES[path]! : {};
  return Object.hasOwn(old, value) ? old[value]! : value;
}

/** Keys whose values come from a fixed set. Anything else is a warning and the default stays. */
const ENUMS: Record<string, readonly string[]> = {
  "render.glyphs": ["auto", "nerd", "unicode", "ascii"],
  "render.show_urls": ["auto", "always", "never"],
  "render.code_cells": ["box", "band"],
  "render.code_wrap": ["scroll", "wrap"],
  "render.caption": ["bottom", "top"],
  "render.images": ["auto", "never"],
  "render.images_remote": ["ask", "show", "never"],
  "render.mermaid": ["text", "picture"],
  "render.math": ["text", "picture"],
  "capture.location": ["state", "root"],
  "capture.open_in": ["float", "right"],
  "git.signs_at": ["gutter_left", "gutter_right", "window_right"],
  "git.diff": ["blocks", "source"],
  "git.diff_layout": ["auto", "unified", "split"],
  "lint.enabled": ["auto", "on", "off"],
  "search.engine": ["auto", "index", "scan"],
  "diagnostics.bar": ["auto", "on", "off"],
  "diagnostics.marks": ["off", "error", "warning", "info"],
  "diagnostics.severity": ["error", "warning", "info", "hint"],
  "ui.lines": ["light", "heavy"],
  "ui.relative_numbers": ["lens", "source", "both", "off"],
  "files.show": ["auto", "notes", "renderable", "all"],
  "editor.edit_in": ["source", "lens", "live"],
  "links.style": ["auto", "markdown", "wiki"],
  "links.path": ["auto", "relative", "root", "name"],
  "links.extension": ["auto", "keep", "drop"],
};

/** Numeric keys and their allowed range. */
const RANGES: Record<string, [number, number]> = {
  "editor.lens_min_rows": [1, 200],
  "editor.lens_max": [0.1, 1],
  "editor.autosave_ms": [0, 3_600_000],
  "render.inset": [0, 40],
  "render.max_width": [0, 1000],
  "walk.max_file_size": [1, 1 << 30],
  "index.idle_seconds": [1, 86_400],
  "ui.sidebar_width": [8, 200],
  "ui.outline_width": [8, 200],
  "ui.split_ratio": [0.2, 0.8],
  "ui.readable_max": [20, 1000],
  "ui.scrolloff": [0, 50],
  // Up to 2,000 of the reading positions kept (positions.json holds the newest 5,000, every root's).
  "ui.history_limit": [0, 2000],
  "input.which_key_delay_ms": [0, 10_000],
  "ui.narrow_width": [0, 1000],
  "watch.debounce_ms": [0, 10_000],
  "watch.poll_ms": [50, 600_000],
  "context.depth": [0, 5],
  "context.limit": [1, 500],
};

/** Ranged settings that may be fractional; every other ranged number must be whole. */
const FRACTIONAL = new Set(["ui.split_ratio", "editor.lens_max"]);

/** Merge `over` into `base`, typed by `base`'s shape. Unknown keys and wrong types are warnings. */
export function merge<T>(base: T, over: Record<string, unknown>, file: string, prefix: string, warnings: string[]): T {
  const out = { ...(base as Record<string, unknown>) };
  for (const [key, supplied] of Object.entries(over)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value =
      path === "render.code" && typeof supplied === "string" && ["document", "source"].includes(supplied)
        ? supplied === "document"
        : path === "editor.edit_in" && supplied === "live"
          ? "lens"
          : supplied;
    // Colour overrides: kept as given (tables merge by key) and validated against the theme. A
    // role's fields merge, at the top and in a theme's own table ([colors.<theme>]) alike.
    if (prefix === "colors") {
      const prev = out[key];
      const fields = (p: unknown, v: unknown) => (isPlainObject(p) && isPlainObject(v) ? { ...p, ...v } : v);
      out[key] =
        isPlainObject(prev) && isPlainObject(value)
          ? { ...prev, ...Object.fromEntries(Object.entries(value).map(([r, v]) => [r, fields(prev[r], v)])) }
          : value;
      continue;
    }
    // Language servers (19.2): each by name, its settings merged (all the way down), the rest
    // replaced; languages by name. A field of the wrong type is dropped with a warning.
    if (!prefix && key === "language-server") {
      if (!isPlainObject(value) || !Object.values(value).every(isPlainObject))
        warnings.push(`config: ${file}: [language-server.<name>] must be tables`);
      else {
        const was = out[key] as Record<string, ServerConfig>;
        const next: Record<string, ServerConfig> = { ...was };
        for (const [name, given] of Object.entries(value)) {
          const s = checkFields(
            given as Record<string, unknown>,
            SERVER_FIELDS,
            `language-server.${name}`,
            file,
            warnings,
          ) as ServerConfig;
          const before = (Object.hasOwn(next, name) ? next[name] : undefined) ?? {};
          next[name] = {
            ...before,
            ...s,
            ...(before.config && s.config ? { config: deepMerge(before.config, s.config) } : {}),
          };
        }
        out[key] = next;
      }
      continue;
    }
    // Linters (19.19): each by name, the keys given replacing its own.
    if (!prefix && key === "linter") {
      if (!isPlainObject(value) || !Object.values(value).every(isPlainObject))
        warnings.push(`config: ${file}: [linter.<name>] must be tables`);
      else {
        const was = out[key] as Record<string, LinterConfig>;
        const checked = Object.entries(value).map(
          ([name, l]) =>
            [name, checkFields(l as Record<string, unknown>, LINTER_FIELDS, `linter.${name}`, file, warnings)] as const,
        );
        out[key] = {
          ...was,
          ...Object.fromEntries(
            checked.map(([name, l]) => [name, { ...(Object.hasOwn(was, name) ? was[name] : undefined), ...l }]),
          ),
        };
      }
      continue;
    }
    // Document types (22.2, 22.3): each by name, the fields given replacing its own — a folder's too: they only read.
    if (!prefix && key === "types") {
      if (!isPlainObject(value) || !Object.values(value).every(isPlainObject))
        warnings.push(`config: ${file}: [types.<name>] must be tables`);
      else {
        const was = out[key] as Record<string, TypeConfig>;
        const checked = Object.entries(value).map(
          ([name, t]) =>
            [name, checkFields(t as Record<string, unknown>, TYPE_FIELDS, `types.${name}`, file, warnings)] as const,
        );
        out[key] = {
          ...was,
          ...Object.fromEntries(
            checked.map(([name, t]) => [name, { ...(Object.hasOwn(was, name) ? was[name] : undefined), ...t }]),
          ),
        };
      }
      continue;
    }
    if (!prefix && key === "language") {
      if (!Array.isArray(value) || !value.every((l) => isPlainObject(l) && typeof l.name === "string"))
        warnings.push(`config: ${file}: [[language]] entries need a name`);
      else {
        const list = [...(out[key] as LanguageConfig[])];
        for (const given of value as Record<string, unknown>[]) {
          const l = checkFields(
            given,
            LANGUAGE_FIELDS,
            `language.${given.name}`,
            file,
            warnings,
          ) as unknown as LanguageConfig;
          const i = list.findIndex((x) => x.name === l.name);
          if (i >= 0) list[i] = { ...list[i]!, ...l };
          else list.push(l);
        }
        out[key] = list;
      }
      continue;
    }
    // String maps: key bindings (with context sub-tables), aliases, group names, dictionaries by language.
    if (
      prefix === "keys" ||
      prefix === "aliases" ||
      prefix === "groups" ||
      prefix === "spell.dictionaries" ||
      /^keys\.(visual|source|explorer|git|outline|footnotes|info|resize)$/.test(prefix)
    ) {
      const table =
        prefix === "keys" &&
        ["visual", "source", "explorer", "git", "outline", "footnotes", "info", "resize"].includes(key);
      if (table && !isPlainObject(value))
        warnings.push(`config: ${file}: ${path} must be a table of key = "command" (a mode's own keys)`);
      else if (typeof value === "string") out[key] = renewed(prefix, value);
      else if (table)
        out[key] = merge(
          (out[key] as Record<string, string> | undefined) ?? {},
          value as Record<string, unknown>,
          file,
          `keys.${key}`,
          warnings,
        );
      else warnings.push(`config: ${file}: ${path} must be a string`);
      continue;
    }
    if (RETIRED[path]) {
      warnings.push(`config: ${file}: "${path}" is retired — ${RETIRED[path]}`);
      continue;
    }
    if (!(key in out)) {
      warnings.push(`config: ${file}: unknown key "${path}"`);
      continue;
    }
    const current = out[key];
    if (isPlainObject(current)) {
      if (isPlainObject(value)) out[key] = merge(current, value, file, path, warnings);
      else warnings.push(`config: ${file}: "${path}" must be a table`);
    } else if (Array.isArray(current)) {
      // Strings only: an inline table in the list is a mistake to report, not to crash the file on.
      if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        if (path === "walk.extensions" && !value.length)
          warnings.push(
            `config: ${file}: "${path}" can't be empty (no note would be found); keeping ${JSON.stringify(current)}`,
          );
        else out[key] = value;
      } else if (Array.isArray(value)) warnings.push(`config: ${file}: "${path}" must be a list of strings`);
      else if (path === "editor.remote" && typeof value === "string")
        out[key] = value.trim() ? [value] : []; // one command
      else warnings.push(`config: ${file}: "${path}" must be an array`);
    } else if (typeof current === typeof value) {
      if (typeof value === "string" && renewed(path, value) !== value) {
        out[key] = renewed(path, value);
        continue;
      }
      const allowed = ENUMS[path];
      const range = RANGES[path];
      if (allowed && !allowed.includes(value as string)) {
        // The value as written in JSON: a control character in it shown as `\u001b`, never stripped to look allowed.
        warnings.push(`config: ${file}: "${path}" must be one of ${allowed.join(", ")} (got ${JSON.stringify(value)})`);
      } else if (
        range &&
        (!Number.isFinite(value as number) || (value as number) < range[0] || (value as number) > range[1])
      ) {
        warnings.push(`config: ${file}: "${path}" must be between ${range[0]} and ${range[1]} (got ${value})`);
      } else if (range && !FRACTIONAL.has(path) && !Number.isInteger(value)) {
        warnings.push(`config: ${file}: "${path}" must be a whole number (got ${value})`);
      } else out[key] = value;
    } else {
      warnings.push(`config: ${file}: "${path}" must be a ${typeof current}`);
    }
  }
  return out as T;
}
