// Document types (plans 22.2, 22.3): notes of a kind, known by where they are — a skill's SKILL.md, an ADR in an
// adr/ folder — with what their frontmatter must have, checked and said in Problems (22.2); and their conventions read
// (22.3): a number from the file's name, for their order; a status ("Accepted", "Superseded by 0007"), and what
// supersedes one. Built in: `skill` and `adr`. Your own, or a folder's for its notes, in `[types.<name>]`: one named
// as a built-in changes the keys it gives; `paths = []` turns a type off. Like Obsidian's Bases, driven by conventions
// rather than a database: nothing is written, nothing kept.

import { basename, posix } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import type { Problem } from "../../diagnostics.ts";

/** A frontmatter key's kind, as a type's `keys` names it. */
export type KeyKind = "string" | "number" | "boolean" | "date" | "list" | "table";
export const KEY_KINDS: readonly KeyKind[] = ["string", "number", "boolean", "date", "list", "table"];

/** A type as a config gives it (`[types.<name>]`): every field optional, a built-in's filling the rest. */
export interface TypeConfig {
  /** The notes it's for: globs from the root — `**` any folders, `*` any name. */
  paths?: string[];
  /** Keys each must have; dotted for a key inside a table (`metadata.type`). */
  required?: string[];
  /** A key's kind, when it's there. */
  keys?: Record<string, KeyKind>;
  /** A key's allowed values, when it's there. */
  values?: Record<string, unknown[]>;
  /** A pattern on the file's name whose first group is its number: their order, and how one names another. */
  number?: string;
  /** The frontmatter key of its status; without one, a `Status:` line or a `## Status` section's first line. */
  status?: string;
}

export interface DocType {
  name: string;
  source: "built-in" | "config";
  paths: string[];
  required: string[];
  keys: Record<string, KeyKind>;
  values: Record<string, unknown[]>;
  number: RegExp | null;
  status: string | null;
}

export const BUILT_IN_TYPES: Record<string, TypeConfig> = {
  // Agent skills: SKILL.md, with the frontmatter skills are found by.
  skill: { paths: ["**/SKILL.md"], required: ["name", "description"], keys: { name: "string", description: "string" } },
  // Architecture decision records: numbered, one a file, in a folder of their own; a status, often "Superseded by".
  adr: {
    paths: ["**/adr/*.md", "**/adrs/*.md", "**/decisions/*.md", "**/decision-records/*.md"],
    number: "^(?:adr-?)?(\\d+)",
    status: "status",
  },
};

function regex(pattern: string | undefined): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

/** The types of a root: the built-in ones, each changed by the config's of its name, then the config's own; by name. */
export function docTypes(config: Record<string, TypeConfig> = {}): DocType[] {
  const names = new Set([...Object.keys(BUILT_IN_TYPES), ...Object.keys(config)]);
  const out: DocType[] = [];
  for (const name of names) {
    const given = Object.hasOwn(config, name) ? config[name] : undefined;
    const t: TypeConfig = { ...(Object.hasOwn(BUILT_IN_TYPES, name) ? BUILT_IN_TYPES[name] : undefined), ...given };
    if (!t.paths?.length) continue;
    out.push({
      name,
      source: given ? "config" : "built-in",
      paths: t.paths,
      required: t.required ?? [],
      keys: t.keys ?? {},
      values: t.values ?? {},
      number: regex(t.number),
      status: t.status ?? null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const globs = new Map<string, Bun.Glob>();

/** Whether a path from the root matches one of a type's globs. */
export function ofType(rel: string, type: DocType): boolean {
  return type.paths.some((p) => {
    let g = globs.get(p);
    if (!g) globs.set(p, (g = new Bun.Glob(p)));
    return g.match(rel);
  });
}

/** A note's frontmatter block: its format, its lines, and the file line its first one is on; null without one. */
export function frontmatterBlock(text: string): { format: "yaml" | "toml"; lines: string[]; first: number } | null {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const fence = lines[0]?.trimEnd();
  if (fence !== "---" && fence !== "+++") return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === fence);
  if (end < 0) return null;
  return { format: fence === "---" ? "yaml" : "toml", lines: lines.slice(1, end), first: 2 };
}

/** A value at a dotted key, or undefined. */
function valueAt(data: Record<string, unknown>, key: string): unknown {
  let v: unknown = data;
  for (const part of key.split(".")) {
    if (v === null || typeof v !== "object" || Array.isArray(v) || !Object.hasOwn(v, part)) return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The line a dotted key is written on in the frontmatter (YAML's `key:`, TOML's `key =` or `[table]`), from 0; -1. */
function keyLine(lines: string[], key: string): number {
  let at = 0;
  let found = -1;
  for (const part of key.split(".")) {
    const re = new RegExp(`^\\s*(?:${escape(part)}\\s*[:=]|\\[\\s*${escape(part)}\\s*\\])`);
    const i = lines.findIndex((l, n) => n >= at && re.test(l));
    if (i < 0) return found;
    found = i;
    at = i + 1;
  }
  return found;
}

/** Whether a value is of a kind. A date: a TOML date, or text as YAML writes one (`2026-10-10`, a time after it). */
export function isKind(v: unknown, kind: KeyKind): boolean {
  switch (kind) {
    case "string":
      return typeof v === "string";
    case "number":
      return typeof v === "number";
    case "boolean":
      return typeof v === "boolean";
    case "date":
      return (
        v instanceof Date ||
        (typeof v === "string" &&
          /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(v))
      );
    case "list":
      return Array.isArray(v);
    case "table":
      return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
  }
}

const said = (v: unknown) =>
  Array.isArray(v)
    ? "a list"
    : v instanceof Date
      ? "a date"
      : v === null
        ? "empty"
        : typeof v === "object"
          ? "a table"
          : `${typeof v === "string" ? "text" : `a ${typeof v}`}`;

/** What's wrong with a note's frontmatter, by its types' rules (22.2): a key missing, of another kind, a value not allowed. */
export function frontmatterProblems(text: string, types: DocType[]): Problem[] {
  const ruled = types.filter((t) => t.required.length || Object.keys(t.keys).length || Object.keys(t.values).length);
  if (!ruled.length) return [];
  const fileLines = text.split("\n");
  const at = (line: number, message: string): Problem => ({
    start: { line, column: 1 },
    end: { line, column: (fileLines[line - 1]?.replace(/\r$/, "").length ?? 0) + 1 },
    severity: "warning",
    source: "slipbox",
    code: "frontmatter",
    message,
  });
  const block = frontmatterBlock(text);
  const out: Problem[] = [];
  if (!block) {
    for (const t of ruled)
      if (t.required.length) out.push(at(1, `a ${t.name} note needs frontmatter: ${t.required.join(", ")}`));
    return out;
  }
  let data: Record<string, unknown>;
  try {
    const raw = block.lines.join("\n");
    const v = block.format === "yaml" ? parseYaml(raw, { logLevel: "error", uniqueKeys: false }) : parseToml(raw);
    data = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch (err) {
    const why = (err as Error).message.split("\n")[0] ?? "it doesn't parse";
    return [at(1, `its frontmatter doesn't parse (${why}): ${ruled.map((t) => t.name).join(", ")}'s rules unchecked`)];
  }
  const lineOf = (key: string) => {
    const i = keyLine(block.lines, key);
    return i < 0 ? 1 : block.first + i;
  };
  for (const t of ruled) {
    for (const key of t.required) {
      const v = valueAt(data, key);
      if (v === undefined || v === null || v === "") out.push(at(1, `${t.name}: "${key}" is missing`));
    }
    for (const [key, kind] of Object.entries(t.keys)) {
      const v = valueAt(data, key);
      if (v !== undefined && v !== null && !isKind(v, kind))
        out.push(at(lineOf(key), `${t.name}: "${key}" should be a ${kind}, not ${said(v)}`));
    }
    for (const [key, allowed] of Object.entries(t.values)) {
      const v = valueAt(data, key);
      if (v === undefined || v === null) continue;
      const same = (a: unknown) => a === v || (a instanceof Date && v instanceof Date && a.getTime() === v.getTime());
      if (!allowed.some(same))
        out.push(
          at(
            lineOf(key),
            `${t.name}: "${key}" is ${JSON.stringify(v)}, not one of ${allowed.map((a) => JSON.stringify(a)).join(", ")}`,
          ),
        );
    }
  }
  return out;
}

/** A note of a type, as its list shows it (22.3). */
export interface TypedNote {
  path: string;
  title: string;
  /** From its file's name, by the type's `number`. */
  number: number | null;
  /** As written: its frontmatter's, or its Status line's. */
  status: string | null;
  /** What its status says supersedes it: a note of this root, when one can be told. */
  supersededBy: string | null;
}

/** A note's status: its type's frontmatter key, else a `Status: …` line, else a `## Status` section's first line. */
export function statusOf(text: string, key: string | null): string | null {
  const block = frontmatterBlock(text);
  if (block && key) {
    try {
      const raw = block.lines.join("\n");
      const data = (
        block.format === "yaml" ? parseYaml(raw, { logLevel: "error", uniqueKeys: false }) : parseToml(raw)
      ) as Record<string, unknown> | null;
      const v = data && typeof data === "object" ? valueAt(data, key) : undefined;
      if (typeof v === "string" && v.trim()) return v.trim();
    } catch {}
  }
  const body = (block ? text.split("\n").slice(block.lines.length + 2) : text.split("\n")).map((l) =>
    l.replace(/\r$/, ""),
  );
  for (let i = 0; i < body.length; i++) {
    const line = body[i]!;
    // `Status: x`, `**Status:** x`, `**Status**: x`; the value bold, or not.
    const inline = /^\s*(?:[-*]\s+)?(?:\*\*|__)?status(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.+?)\s*$/i.exec(line);
    if (inline?.[1]) return inline[1].replace(/(?:\*\*|__)$/, "").trim();
    if (/^#{1,6}\s+status\s*$/i.test(line)) {
      const next = body.slice(i + 1).find((l) => l.trim());
      if (next && !/^#{1,6}\s/.test(next)) return next.trim();
    }
  }
  return null;
}

/** What a status says supersedes its note — `Superseded by [0007](0007-x.md)`, `by [[0007-x]]`, `by ADR-0007`, `by D7`:
 *  the note it names, among the type's (a link from where the note is, a name, a number); null when there's none. */
export function supersededBy(
  status: string,
  rel: string,
  ofTheType: { path: string; number: number | null }[],
): string | null {
  const m = /superseded\s+by\s+(.+)/i.exec(status);
  if (!m) return null;
  const rest = m[1]!;
  const link = /\]\(([^)\s]+)\)/.exec(rest)?.[1];
  if (link) {
    let href = link.split("#")[0]!;
    try {
      href = decodeURIComponent(href);
    } catch {}
    const target = posix.normalize(posix.join(posix.dirname(rel), href));
    if (ofTheType.some((n) => n.path === target)) return target;
  }
  const wiki = /\[\[([^\]|#]+)/.exec(rest)?.[1]?.trim();
  if (wiki) {
    const hit = ofTheType.find(
      (n) => n.path === wiki || n.path === `${wiki}.md` || basename(n.path, ".md") === basename(wiki, ".md"),
    );
    if (hit) return hit.path;
  }
  const num = /(?:^|[^\w])(?:[a-z]+-?)?0*(\d+)\b/i.exec(rest)?.[1];
  if (num !== undefined) return ofTheType.find((n) => n.number === Number(num))?.path ?? null;
  return null;
}

/** A type's notes among `notes` (paths from the root, and how to read one), by number, then path; each its status. */
export function notesOfType(
  type: DocType,
  notes: { path: string; title: string }[],
  read: (rel: string) => string | null,
): TypedNote[] {
  const mine = notes
    .filter((n) => ofType(n.path, type))
    .map((n) => {
      const digits = type.number?.exec(basename(n.path))?.[1];
      const text = read(n.path) ?? "";
      return {
        path: n.path,
        title: n.title,
        number: digits === undefined ? null : Number(digits),
        status: statusOf(text, type.status),
        supersededBy: null as string | null,
      };
    })
    .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.path.localeCompare(b.path));
  for (const n of mine) n.supersededBy = n.status ? supersededBy(n.status, n.path, mine) : null;
  return mine;
}
