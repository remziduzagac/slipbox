// The width reflow wraps a note to (EG-D12), from the first that says one: `[editor] text_width`; the markdownlint
// config the lint surface finds for the file, its `MD013` (`line-length`) `line_length`; `.editorconfig`'s
// `max_line_length` for it, read as indentation reads it (25.1); else 80. markdownlint's configs are read as data —
// JSON, JSONC, YAML — never one that's code (`.cjs`, `.mjs`), which is passed over: from the file's folder up to its
// vault's top, nearer first, and then `~/.markdownlint-cli2.jsonc` where the vault has none of its own, as the lint
// surface runs the linter. Only a length a config states counts: one that turns `MD013` off says there's none, and
// one that leaves it at markdownlint's own default says nothing, so the next is asked.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { stripJsonComments } from "../model/data.ts";
import { CODE_CONFIGS, VAULT_CONFIGS } from "../diagnostics/lint.ts";
import { editorConfigFor } from "./indent.ts";

/** The width, and what said it: `editor.text_width`, a markdownlint config's path, `.editorconfig`, or the default. */
export interface TextWidth {
  width: number;
  from: string;
}

/** Wrapped to this when nothing says otherwise: markdownlint's and most editors' own. */
export const DEFAULT_TEXT_WIDTH = 80;

type Read = (path: string) => string | null;

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * What a markdownlint config's text says of `MD013`'s length: a width, `"off"` where it turns the rule off, or null
 * where it says nothing (no `MD013` or `line-length`, a length left at the default, a file that doesn't parse). A
 * markdownlint-cli2 config holds the rules under `config`.
 */
export function md013Length(name: string, text: string): number | "off" | null {
  let data: unknown;
  try {
    data = /\.ya?ml$/.test(name) ? parseYaml(text) : JSON.parse(stripJsonComments(text));
  } catch {
    return null;
  }
  const rules = name.startsWith(".markdownlint-cli2.") ? (isObject(data) ? data.config : null) : data;
  if (!isObject(rules)) return null;
  for (const [key, value] of Object.entries(rules)) {
    if (!["md013", "line-length"].includes(key.toLowerCase())) continue;
    if (value === false) return "off";
    const length = isObject(value) ? value.line_length : null;
    if (typeof length === "number" && length >= 1) return Math.floor(length);
  }
  return null;
}

/** The markdownlint config that states the file's line length, and it; null when none does or one turns it off. */
function markdownlintWidth(abs: string, root: string, read: Read, home: string): TextWidth | null {
  const inRoot = !relative(root, abs).startsWith("..");
  const dirs: string[] = [];
  for (let dir = dirname(abs); ; dir = dirname(dir)) {
    dirs.push(dir);
    if (!inRoot || dir === root || dirname(dir) === dir) break;
  }
  const data = VAULT_CONFIGS.filter((f) => !CODE_CONFIGS.includes(f));
  const files = dirs.flatMap((dir) => data.map((name) => ({ name, path: join(dir, name) })));
  // The linter runs from the vault's top with your own config where the vault has none (lintCommand).
  const yours = join(home, ".markdownlint-cli2.jsonc");
  if (!VAULT_CONFIGS.some((f) => read(join(root, f)) !== null) && !files.some((f) => f.path === yours))
    files.push({ name: ".markdownlint-cli2.jsonc", path: yours });
  for (const { name, path } of files) {
    const text = read(path);
    if (text === null) continue;
    const said = md013Length(name, text);
    if (said === "off") return null;
    if (said !== null) return { width: said, from: path.split(sep).join("/") };
  }
  return null;
}

/** The width to wrap the file at `abs`, in the vault at `root`, to: see the top of this file. */
export function textWidthFor(
  abs: string,
  root: string,
  configured: number,
  read: Read = readOrNull,
  home: string = homedir(),
): TextWidth {
  if (configured >= 1) return { width: Math.floor(configured), from: "editor.text_width" };
  const lint = markdownlintWidth(abs, root, read, home);
  if (lint) return lint;
  const max = Number(editorConfigFor(abs, read).get("max_line_length"));
  if (Number.isInteger(max) && max >= 1) return { width: max, from: ".editorconfig" };
  return { width: DEFAULT_TEXT_WIDTH, from: "the default" };
}
