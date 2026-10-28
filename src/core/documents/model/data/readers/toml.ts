// TOML line positions, parsed validation, multiline values and record tables.

import type { Heading, Root, RootContent } from "mdast";
import { parse as parseToml } from "smol-toml";
import type { DataField, ParsedData } from "../contracts.ts";
import { alignKeys, firstLine, heading, kindOf, pos, standsAlone, table } from "../nodes.ts";
import { fieldLink } from "../links.ts";

// ---------------------------------------------------------------------------------------------
// TOML
/** A value's end: where brackets and strings (triple-quoted too) close, and a trailing comment. */
export function scanValue(
  lines: string[],
  i: number,
  from: number,
): { end: number; value: string; comment: string | null } {
  let depth = 0;
  let str: string | null = null; // the open quote: ", ', """ or '''
  let value = "";
  let comment: string | null = null;
  for (let l = i; l < lines.length; l++) {
    const line = lines[l]!.replace(/\r$/, "");
    let k = l === i ? from : 0;
    for (; k < line.length; k++) {
      const ch = line[k]!;
      if (str) {
        if (ch === "\\" && str !== "'" && str !== "'''") {
          k++;
          continue;
        }
        if (line.startsWith(str, k)) {
          k += str.length - 1;
          str = null;
        }
        continue;
      }
      if (line.startsWith('"""', k) || line.startsWith("'''", k)) {
        str = line.slice(k, k + 3);
        k += 2;
      } else if (ch === '"' || ch === "'") str = ch;
      else if (ch === "[" || ch === "{") depth++;
      else if (ch === "]" || ch === "}") depth--;
      else if (ch === "#") {
        comment = line.slice(k + 1).trim() || null;
        break;
      }
    }
    value += (value ? " " : "") + line.slice(l === i ? from : 0, k).trim();
    if (!str && depth <= 0) return { end: l, value: value.trim(), comment };
  }
  return { end: lines.length - 1, value: value.trim(), comment };
}

/** A TOML value as it reads: a basic or literal string unquoted, the rest as written. */
export function tomlDisplay(raw: string): { value: string; kind: DataField["kind"] } {
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(raw);
  if (m)
    return {
      value: m[1]!.replace(/\\(["\\nt])/g, (_, c: string) => (c === "n" ? " " : c === "t" ? " " : c)),
      kind: "string",
    };
  const l = /^'([^']*)'$/.exec(raw);
  if (l) return { value: l[1]!, kind: "string" };
  if (/^("""|''')/.test(raw))
    return { value: raw.replace(/^("""|''')\s*|\s*("""|''')$/g, "").replace(/\s+/g, " "), kind: "string" };
  return { value: raw.replace(/\s+/g, " "), kind: kindOf(raw) };
}

export function readToml(source: string): ParsedData {
  let error: string | null = null;
  try {
    parseToml(source);
  } catch (err) {
    error = firstLine((err as Error).message);
  }
  const lines = source.split("\n");
  const out: RootContent[] = [];
  let pending: { text: string[]; line: number } | null = null; // comment lines waiting for a key
  const flushComment = () => {
    if (pending)
      out.push({
        type: "dataComment",
        text: pending.text.join("\n"),
        position: pos(pending.line, pending.line + pending.text.length - 1),
      } as unknown as RootContent);
    pending = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.replace(/\r$/, "").trim();
    if (!t) {
      flushComment();
      continue;
    }
    if (t.startsWith("#")) {
      pending ??= { text: [], line: i + 1 };
      pending.text.push(t.replace(/^#\s?/, ""));
      continue;
    }
    const header = /^\[\[\s*([^\]]+?)\s*\]\]|^\[\s*([^\]]+?)\s*\]/.exec(t);
    if (header) {
      flushComment();
      const name = (header[1] ?? header[2])!;
      out.push(heading(name.split(".").length, name, i + 1));
      continue;
    }
    const eq = keyEnd(t);
    if (eq < 0) {
      flushComment();
      continue; // not TOML (the error, from the parser, says so)
    }
    const key = t
      .slice(0, eq)
      .trim()
      .replace(/^"(.*)"$|^'(.*)'$/, "$1$2");
    const start = lines[i]!.indexOf("=", lines[i]!.indexOf(t.slice(0, eq).trim()) + eq - 1);
    const v = scanValue(lines, i, start + 1);
    const shown = tomlDisplay(v.value);
    // A comment line above a key is its comment — unless it has its own after the value, or the
    // one above is several lines or opens the file (prose about more than this key): then that
    // stays a block of its own.
    if (v.comment || standsAlone(pending, out)) flushComment();
    const first = pending ? pending.line : i + 1;
    const comment = v.comment ?? (pending ? pending.text.join(" ") : null);
    pending = null;
    out.push({
      type: "dataField",
      key,
      value: shown.value,
      kind: shown.kind,
      comment,
      keyWidth: 0,
      keyLine: i + 1,
      position: pos(first, v.end + 1),
    } as unknown as RootContent);
    i = v.end;
  }
  flushComment();
  const tree: Root = { type: "root", children: tomlRecords(out) };
  alignKeys(tree.children);
  return { tree, error };
}

/** The `=` after a key (bare, quoted or dotted), or -1. */
export function keyEnd(t: string): number {
  let q: string | null = null;
  for (let k = 0; k < t.length; k++) {
    const ch = t[k]!;
    if (q) {
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === "=") return k;
  }
  return -1;
}

/**
 * Runs of `[[name]]` entries whose keys are all plain values read better as one table: a row an
 * entry (on its header's line), a column a key.
 */
export function tomlRecords(nodes: RootContent[]): RootContent[] {
  const out: RootContent[] = [];
  const isField = (n: RootContent | undefined) => (n as unknown as DataField | undefined)?.type === "dataField";
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const name = n.type === "heading" ? (n.children[0] as { value: string }).value : null;
    // An entry: its heading, then its fields; the run goes on while the next heading has the name.
    const entries: { line: number; fields: DataField[] }[] = [];
    let j = i;
    while (
      name &&
      nodes[j]?.type === "heading" &&
      (nodes[j] as Heading & { children: { value: string }[] }).children[0]!.value === name
    ) {
      const fields: DataField[] = [];
      let k = j + 1;
      while (isField(nodes[k])) fields.push(nodes[k++] as unknown as DataField);
      entries.push({ line: nodes[j]!.position!.start.line, fields });
      j = k;
    }
    const plain =
      entries.length >= 2 &&
      entries.every(
        (e) =>
          e.fields.length && e.fields.every((f) => f.kind !== "table" && f.kind !== "list" && !f.value.includes("\n")),
      );
    if (!plain) {
      out.push(n);
      continue;
    }
    const cols = [...new Set(entries.flatMap((e) => e.fields.map((f) => f.key)))];
    out.push(heading(n.type === "heading" ? n.depth : 1, name!, entries[0]!.line));
    const rows = entries.map((e) => {
      const fields = cols.map((c) => e.fields.find((f) => f.key === c));
      return {
        line: e.line,
        cells: fields.map((f) => f?.value ?? ""),
        links: fields.map((f) => (f ? fieldLink(f) : null)),
      };
    });
    out.push(table(cols, rows, entries[0]!.line));
    i = j - 1;
  }
  return out;
}
