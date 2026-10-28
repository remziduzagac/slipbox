// Server, language, linter and document-type field contracts.

import { KEY_KINDS } from "../../../documents/model/doctypes.ts";
import { isBoolean, isPlainObject, isString, isStrings, validRegex } from "./predicates.ts";

/**
 * A field's type check, and how a warning says what it must be. Fields not named here are kept as given,
 * silently, so a Helix `languages.toml` section (or efm's keys) pastes in; only a known field spelled with
 * underscores (`lint_command`, `file_types`) is warned of, a slip in these tables of hyphens.
 */
export type FieldCheck = [check: (v: unknown) => boolean, must: string];

export const STRINGS: FieldCheck = [isStrings, "a list of strings"];

/** A language's server: its name, or `{ name, only-features, except-features }` (Helix's). */
export const isServerRef = (v: unknown): boolean =>
  isString(v) ||
  (isPlainObject(v) &&
    isString(v.name) &&
    (v["only-features"] === undefined || isStrings(v["only-features"])) &&
    (v["except-features"] === undefined || isStrings(v["except-features"])));

export const SERVER_FIELDS: Record<string, FieldCheck> = {
  command: [isString, "a string"],
  args: STRINGS,
  config: [isPlainObject, "a table"],
  environment: [(v) => isPlainObject(v) && Object.values(v).every(isString), "a table of strings"],
  "required-root-patterns": STRINGS,
};

export const LANGUAGE_FIELDS: Record<string, FieldCheck> = {
  "language-servers": [
    (v) => Array.isArray(v) && v.every(isServerRef),
    "a list of server names, or of { name, only-features, except-features }",
  ],
  roots: STRINGS,
  "file-types": STRINGS,
  "language-id": [isString, "a string"],
  linters: STRINGS,
};

export const LINTER_FIELDS: Record<string, FieldCheck> = {
  "lint-command": [isString, "a string"],
  "lint-stdin": [isBoolean, "true or false"],
  "lint-formats": STRINGS,
  "lint-source": [isString, "a string"],
  "lint-severity": [(v) => v === 1 || v === 2 || v === 3 || v === 4, "1, 2, 3 or 4"],
  "lint-ignore-exit-code": [isBoolean, "true or false"],
  "root-markers": STRINGS,
  "require-marker": [isBoolean, "true or false"],
};

export const TYPE_FIELDS: Record<string, FieldCheck> = {
  paths: STRINGS,
  required: STRINGS,
  keys: [
    (v) => isPlainObject(v) && Object.values(v).every((k) => (KEY_KINDS as readonly unknown[]).includes(k)),
    `a table of key = kind (${KEY_KINDS.join(", ")})`,
  ],
  values: [(v) => isPlainObject(v) && Object.values(v).every(Array.isArray), "a table of key = [allowed values]"],
  number: [
    (v) => typeof v === "string" && validRegex(v),
    "a pattern (a regular expression) whose first group is the number",
  ],
  status: [isString, "a frontmatter key"],
};

/** A copy of `table` without the fields of the wrong type, or a known one spelled with underscores, each warned of;
 * the rest kept. */
export function checkFields(
  table: Record<string, unknown>,
  fields: Record<string, FieldCheck>,
  where: string,
  file: string,
  warnings: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(table)) {
    const field = Object.hasOwn(fields, k) ? fields[k] : undefined;
    const hyphened = k.replace(/_/g, "-");
    if (!field && hyphened !== k && Object.hasOwn(fields, hyphened))
      warnings.push(`config: ${file}: ${where}.${k} is spelled ${hyphened}; ignored`);
    else if (field && !field[0](v)) warnings.push(`config: ${file}: ${where}.${k} must be ${field[1]}; ignored`);
    else out[k] = v;
  }
  return out;
}
