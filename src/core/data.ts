// Data files as documents (plan 16.11–16.13, docs/idea.md "Files beyond markdown").
//
// A data file is read into the same tree a note is: sections become headings (so the outline,
// the breadcrumb and `[[file.toml#section]]` work unchanged), each key a `dataField` node on its
// own source lines (so the lens edits one key, with its comment), records a table, comment lines
// a `dataComment`. Nothing here ever re-serializes a value: editing is always on the text.
//
// TOML, INI and .env are read line by line (their structure is lines), and validated by a real
// parser where there is one (smol-toml); YAML and JSON come from `yaml`'s document tree, which
// keeps positions and comments; JSON is validated by JSON.parse. CSV/TSV is one table.

import type { Heading, Root, RootContent, Table, TableRow } from "mdast";
import { parse as parseToml } from "smol-toml";
import { isMap, isPair, isScalar, isSeq, LineCounter, type Node as YamlNode, parseAllDocuments, type Scalar } from "yaml";
import { stringWidth } from "./width.ts";

/** One key and its value, on source lines `position` (its comment lines above included). */
export interface DataField {
  type: "dataField";
  key: string;
  /** The value as it reads: a string unquoted, anything else as written (whitespace folded). */
  value: string;
  kind: "string" | "number" | "boolean" | "date" | "null" | "list" | "table" | "other";
  /** A comment after the value on its line, or the comment lines above the key. */
  comment: string | null;
  /** The key column's width, shared by the keys of one section so they line up. */
  keyWidth: number;
  /** The key's own line (its position starts at a comment above it, when there is one). */
  keyLine: number;
  position: { start: { line: number; column: number }; end: { line: number; column: number } };
}

/** Comment lines on their own, between keys or sections. */
export interface DataComment {
  type: "dataComment";
  text: string;
  position: { start: { line: number; column: number }; end: { line: number; column: number } };
}

export interface ParsedData {
  tree: Root;
  /** Why the file doesn't parse (it then shows in source mode, the error said). */
  error: string | null;
}

/** Keys wider than this share the column no further: they're cut with … instead. */
const KEY_MAX = 28;
/** Nested objects become headings this many levels deep; deeper, a key's value reads inline. */
const HEADING_DEPTH = 3;
/** A CSV longer than this renders its first rows; source mode has them all. */
const CSV_ROWS = 2000;

const pos = (a: number, b = a) => ({ start: { line: a, column: 1 }, end: { line: b, column: 1 } });

export function parseData(format: string, source: string): ParsedData {
  try {
    switch (format) {
      case "toml":
        return readToml(source);
      case "ini":
        return readIni(source);
      case "yaml":
        return readYaml(source, false);
      case "json":
        return readYaml(source, true);
      case "csv":
        return readDelimited(source, ",");
      case "tsv":
        return readDelimited(source, "\t");
      default:
        return { tree: { type: "root", children: [] }, error: `no reader for ${format}` };
    }
  } catch (err) {
    return { tree: { type: "root", children: [] }, error: firstLine((err as Error).message) };
  }
}

function firstLine(s: string): string {
  return s.split("\n")[0]!.trim();
}

function heading(depth: number, text: string, line: number): Heading {
  return { type: "heading", depth: Math.max(1, Math.min(6, depth)) as Heading["depth"], children: [{ type: "text", value: text }], position: pos(line) };
}

/** Line up each run of keys (between headings) on the widest key, up to KEY_MAX. */
function alignKeys(nodes: RootContent[]): void {
  let run: DataField[] = [];
  const flush = () => {
    const w = Math.min(KEY_MAX, Math.max(0, ...run.map((f) => stringWidth(f.key))));
    for (const f of run) f.keyWidth = w;
    run = [];
  };
  for (const n of nodes) {
    if ((n as unknown as DataField).type === "dataField") run.push(n as unknown as DataField);
    else if (n.type === "heading" || n.type === "table") flush();
  }
  flush();
}

function kindOf(value: string): DataField["kind"] {
  const v = value.trim();
  if (/^(true|false|yes|no|on|off)$/i.test(v)) return "boolean";
  if (/^[+-]?(\d[\d_]*)(\.\d+)?([eE][+-]?\d+)?$/.test(v) || /^0x[\da-f_]+$/i.test(v) || /^[+-]?(inf|nan)$/.test(v)) return "number";
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(v)) return "date";
  if (/^\[/.test(v)) return "list";
  if (/^\{/.test(v)) return "table";
  return "other";
}

// ---------------------------------------------------------------------------------------------
// TOML

/** A value's end: where brackets and strings (triple-quoted too) close, and a trailing comment. */
function scanValue(lines: string[], i: number, from: number): { end: number; value: string; comment: string | null } {
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
function tomlDisplay(raw: string): { value: string; kind: DataField["kind"] } {
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(raw);
  if (m) return { value: m[1]!.replace(/\\(["\\nt])/g, (_, c: string) => (c === "n" ? " " : c === "t" ? " " : c)), kind: "string" };
  const l = /^'([^']*)'$/.exec(raw);
  if (l) return { value: l[1]!, kind: "string" };
  if (/^("""|''')/.test(raw)) return { value: raw.replace(/^("""|''')\s*|\s*("""|''')$/g, "").replace(/\s+/g, " "), kind: "string" };
  return { value: raw.replace(/\s+/g, " "), kind: kindOf(raw) };
}

function readToml(source: string): ParsedData {
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
    if (pending) out.push({ type: "dataComment", text: pending.text.join("\n"), position: pos(pending.line, pending.line + pending.text.length - 1) } as unknown as RootContent);
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
    const key = t.slice(0, eq).trim().replace(/^"(.*)"$|^'(.*)'$/, "$1$2");
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
    out.push({ type: "dataField", key, value: shown.value, kind: shown.kind, comment, keyWidth: 0, keyLine: i + 1, position: pos(first, v.end + 1) } as unknown as RootContent);
    i = v.end;
  }
  flushComment();
  const tree: Root = { type: "root", children: tomlRecords(out) };
  alignKeys(tree.children);
  return { tree, error };
}

/** The `=` after a key (bare, quoted or dotted), or -1. */
function keyEnd(t: string): number {
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
function tomlRecords(nodes: RootContent[]): RootContent[] {
  const out: RootContent[] = [];
  const isField = (n: RootContent | undefined) => (n as unknown as DataField | undefined)?.type === "dataField";
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const name = n.type === "heading" ? (n.children[0] as { value: string }).value : null;
    // An entry: its heading, then its fields; the run goes on while the next heading has the name.
    const entries: { line: number; fields: DataField[] }[] = [];
    let j = i;
    while (name && nodes[j]?.type === "heading" && (nodes[j] as Heading & { children: { value: string }[] }).children[0]!.value === name) {
      const fields: DataField[] = [];
      let k = j + 1;
      while (isField(nodes[k])) fields.push(nodes[k++] as unknown as DataField);
      entries.push({ line: nodes[j]!.position!.start.line, fields });
      j = k;
    }
    const plain = entries.length >= 2 && entries.every((e) => e.fields.length && e.fields.every((f) => f.kind !== "table" && f.kind !== "list" && !f.value.includes("\n")));
    if (!plain) {
      out.push(n);
      continue;
    }
    const cols = [...new Set(entries.flatMap((e) => e.fields.map((f) => f.key)))];
    out.push(heading(n.type === "heading" ? n.depth : 1, name!, entries[0]!.line));
    out.push(table(cols, entries.map((e) => ({ line: e.line, cells: cols.map((c) => e.fields.find((f) => f.key === c)?.value ?? "") })), entries[0]!.line));
    i = j - 1;
  }
  return out;
}

function table(header: string[], rows: { line: number; cells: string[] }[], line: number): Table {
  const row = (cells: string[], at: number): TableRow => ({
    type: "tableRow",
    children: cells.map((c) => ({ type: "tableCell", children: c ? [{ type: "text", value: c }] : [], position: pos(at) })),
    position: pos(at),
  });
  const last = rows.length ? rows[rows.length - 1]!.line : line;
  return { type: "table", align: header.map(() => null), children: [row(header, line), ...rows.map((r) => row(r.cells, r.line))], position: pos(line, last) };
}

// ---------------------------------------------------------------------------------------------
// INI and .env

/** Comment lines above a key that are not its comment: more than one line, or the file's opening. */
function standsAlone(pending: { text: string[]; line: number } | null, out: RootContent[]): boolean {
  return !!pending && (pending.text.length > 1 || !out.length);
}

function readIni(source: string): ParsedData {
  const lines = source.split("\n");
  const out: RootContent[] = [];
  let pending: { text: string[]; line: number } | null = null;
  const flushComment = () => {
    if (pending) out.push({ type: "dataComment", text: pending.text.join("\n"), position: pos(pending.line, pending.line + pending.text.length - 1) } as unknown as RootContent);
    pending = null;
  };
  let error: string | null = null;
  lines.forEach((raw, i) => {
    const t = raw.replace(/\r$/, "").trim();
    if (!t) return flushComment();
    if (t.startsWith("#") || t.startsWith(";")) {
      pending ??= { text: [], line: i + 1 };
      pending.text.push(t.replace(/^[#;]\s?/, ""));
      return;
    }
    const section = /^\[\s*([^\]]+?)\s*\]$/.exec(t);
    if (section) {
      flushComment();
      out.push(heading(section[1]!.split(".").length, section[1]!, i + 1));
      return;
    }
    const kv = /^(?:export\s+)?([^=:]+?)\s*[=:]\s*(.*)$/.exec(t);
    if (!kv && !/^[\w.-]+$/.test(t)) {
      error ??= `line ${i + 1}: neither a section, a key nor a comment`;
      flushComment();
      return;
    }
    const key = kv ? kv[1]! : t;
    let value = kv ? kv[2]! : "";
    let comment: string | null = null;
    const c = /\s[#;]\s?(.*)$/.exec(value);
    if (c && !/^["']/.test(value)) {
      comment = c[1]!.trim() || null;
      value = value.slice(0, c.index).trim();
    }
    const quoted = /^"(.*)"$|^'(.*)'$/.exec(value);
    if (comment || standsAlone(pending, out)) flushComment();
    const first = pending ? pending.line : i + 1;
    comment ??= pending ? pending.text.join(" ") : null;
    pending = null;
    out.push({ type: "dataField", key, value: quoted ? (quoted[1] ?? quoted[2])! : value, kind: quoted ? "string" : kindOf(value), comment, keyWidth: 0, keyLine: i + 1, position: pos(first, i + 1) } as unknown as RootContent);
  });
  flushComment();
  const tree: Root = { type: "root", children: out };
  alignKeys(tree.children);
  return { tree, error };
}

// ---------------------------------------------------------------------------------------------
// YAML and JSON

/** JSON with // and /* comments (jsonc) as JSON: the comments blanked, strings kept. */
function stripJsonComments(s: string): string {
  let out = "";
  let str = false;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k]!;
    if (str) {
      out += ch;
      if (ch === "\\") out += s[++k] ?? "";
      else if (ch === '"') str = false;
    } else if (ch === '"') {
      str = true;
      out += ch;
    } else if (s.startsWith("//", k)) {
      while (k < s.length && s[k] !== "\n") k++;
      out += "\n";
    } else if (s.startsWith("/*", k)) {
      const end = s.indexOf("*/", k + 2);
      const body = s.slice(k, end < 0 ? s.length : end + 2);
      out += body.replace(/[^\n]/g, " ");
      k = (end < 0 ? s.length : end + 2) - 1;
    } else out += ch;
  }
  return out;
}

function readYaml(source: string, json: boolean): ParsedData {
  const text = json ? stripJsonComments(source) : source;
  let error: string | null = null;
  if (json) {
    try {
      JSON.parse(text);
    } catch (err) {
      error = firstLine((err as Error).message);
    }
  }
  const lc = new LineCounter();
  const docs = parseAllDocuments(text, { lineCounter: lc, uniqueKeys: false, prettyErrors: false });
  const list = Array.isArray(docs) ? docs : [docs];
  const lineOf = (offset: number) => lc.linePos(offset).line;
  const out: RootContent[] = [];
  list.forEach((doc, d) => {
    if (doc.errors.length && !error) {
      const e = doc.errors[0]!;
      error = `line ${lineOf(e.pos[0])}: ${firstLine(e.message)}`;
    }
    const contents = doc.contents as YamlNode | null;
    if (list.length > 1) out.push(heading(1, `document ${d + 1}`, contents?.range ? lineOf(contents.range[0]) : 1));
    if (contents) walkYaml(contents, list.length > 1 ? 2 : 1, out, lineOf, source);
  });
  const tree: Root = { type: "root", children: out };
  alignKeys(tree.children);
  return { tree, error };
}

/** A node's value as one line: scalars as they read, lists and maps inline. */
function inline(node: YamlNode | null | undefined): string {
  if (!node) return "";
  if (isScalar(node)) return node.value === null ? "null" : String(node.value);
  if (isSeq(node)) return `[${node.items.map((x) => inline(x as YamlNode)).join(", ")}]`;
  if (isMap(node)) return `{${node.items.map((p) => `${inline(p.key as YamlNode)}: ${inline(p.value as YamlNode)}`).join(", ")}}`;
  return String((node as { toString(): string }).toString()).replace(/\s+/g, " ");
}

function scalarKind(node: YamlNode | null | undefined): DataField["kind"] {
  if (!node) return "null";
  if (isSeq(node)) return "list";
  if (isMap(node)) return "table";
  if (!isScalar(node)) return "other";
  const v = (node as Scalar).value;
  if (v === null) return "null";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number" || typeof v === "bigint") return "number";
  if (v instanceof Date) return "date";
  return "string";
}

function walkYaml(node: YamlNode, depth: number, out: RootContent[], lineOf: (o: number) => number, source: string): void {
  const lineAt = (n: YamlNode | null | undefined, fallback = 1) => (n?.range ? lineOf(n.range[0]) : fallback);
  if (isMap(node)) {
    for (const pair of node.items) {
      if (!isPair(pair)) continue;
      const key = pair.key as YamlNode | null;
      const value = pair.value as YamlNode | null;
      const name = inline(key);
      const keyLine = lineAt(key);
      // The comment lines above a key are its comment when they're one line; several, or the
      // file's opening ones, or those above a section, are a block of their own (as in TOML).
      let before = (key as { commentBefore?: string } | null)?.commentBefore?.trim() || null;
      const section = (isMap(value) && value.items.length && depth <= HEADING_DEPTH) || (isSeq(value) && records(value));
      if (before && (before.includes("\n") || !out.length || section)) {
        const n = before.split("\n").length;
        out.push({ type: "dataComment", text: before.split("\n").map((l) => l.trim()).join("\n"), position: pos(Math.max(1, keyLine - n), keyLine - 1) } as unknown as RootContent);
        before = null;
      }
      const comment = [before, (value as { comment?: string } | null)?.comment].filter(Boolean).join(" ").trim() || null;
      if (isMap(value) && value.items.length && depth <= HEADING_DEPTH) {
        out.push(heading(depth, name, keyLine));
        walkYaml(value, depth + 1, out, lineOf, source);
      } else if (isSeq(value) && records(value)) {
        out.push(heading(depth, name, keyLine));
        out.push(recordTable(value, lineOf));
      } else {
        const end = value?.range ? lineOf(Math.max(value.range[0], value.range[1] - 1)) : keyLine;
        const first = before ? Math.max(1, keyLine - before.split("\n").length) : keyLine;
        out.push({ type: "dataField", key: name, value: inline(value), kind: scalarKind(value), comment, keyWidth: 0, keyLine, position: pos(first, Math.max(keyLine, end)) } as unknown as RootContent);
      }
    }
  } else if (isSeq(node)) {
    if (records(node)) out.push(recordTable(node, lineOf));
    else
      node.items.forEach((item, i) => {
        const n = item as YamlNode;
        if (isMap(n) && depth <= HEADING_DEPTH) {
          out.push(heading(depth, `${i + 1}`, lineAt(n)));
          walkYaml(n, depth + 1, out, lineOf, source);
        } else out.push({ type: "dataField", key: `${i + 1}`, value: inline(n), kind: scalarKind(n), comment: null, keyWidth: 0, keyLine: lineAt(n), position: pos(lineAt(n)) } as unknown as RootContent);
      });
  } else {
    out.push({ type: "dataField", key: "value", value: inline(node), kind: scalarKind(node), comment: null, keyWidth: 0, keyLine: lineAt(node), position: pos(lineAt(node)) } as unknown as RootContent);
  }
}

/** A list of two or more maps whose values are all plain: a table's rows. */
function records(seq: YamlNode): boolean {
  if (!isSeq(seq) || seq.items.length < 2) return false;
  return seq.items.every((it) => isMap(it) && (it as { items: { value: unknown }[] }).items.every((p) => !isMap(p.value as YamlNode) && !isSeq(p.value as YamlNode)));
}

function recordTable(seq: YamlNode, lineOf: (o: number) => number): Table {
  const items = (seq as unknown as { items: YamlNode[] }).items;
  const cols = [...new Set(items.flatMap((m) => (m as unknown as { items: { key: YamlNode }[] }).items.map((p) => inline(p.key))))];
  const rows = items.map((m) => {
    const pairs = (m as unknown as { items: { key: YamlNode; value: YamlNode }[] }).items;
    return { line: m.range ? lineOf(m.range[0]) : 1, cells: cols.map((c) => inline(pairs.find((p) => inline(p.key) === c)?.value)) };
  });
  return table(cols, rows, rows[0]?.line ?? 1);
}

// ---------------------------------------------------------------------------------------------
// CSV and TSV

function readDelimited(source: string, sep: string): ParsedData {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let error: string | null = null;
  for (let k = 0; k <= source.length; k++) {
    const ch = source[k];
    if (quoted) {
      if (ch === undefined) {
        error = `line ${rowLine}: a quoted field never closes`;
        break;
      }
      if (ch === '"') {
        if (source[k + 1] === '"') {
          cell += '"';
          k++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch === "\n" || ch === "\r" ? " " : ch;
      }
      continue;
    }
    if (ch === '"' && !cell) quoted = true;
    else if (ch === sep) {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === undefined) {
      if (ch === undefined && !cells.length && !cell) break;
      cells.push(cell.replace(/\r$/, ""));
      if (cells.some((c) => c.trim())) rows.push({ line: rowLine, cells });
      cells = [];
      cell = "";
      line++;
      rowLine = line;
    } else cell += ch;
  }
  const out: RootContent[] = [];
  if (rows.length) {
    const width = Math.max(...rows.map((r) => r.cells.length));
    const pad = (c: string[]) => [...c, ...Array(width - c.length).fill("")];
    const [head, ...body] = rows;
    const shown = body.slice(0, CSV_ROWS);
    out.push(table(pad(head!.cells), shown.map((r) => ({ line: r.line, cells: pad(r.cells) })), head!.line));
    if (body.length > CSV_ROWS) out.push({ type: "dataComment", text: `… ${body.length - CSV_ROWS} more rows — source mode (space n v) shows them all`, position: pos(shown[shown.length - 1]!.line + 1) } as unknown as RootContent);
  }
  return { tree: { type: "root", children: out }, error };
}

// ---------------------------------------------------------------------------------------------
// Links out of data files (16.15)

/** Keys whose value is a reference by intent: counted whether or not it resolves. */
const REFERENCE_KEYS = /^(\$ref|\$schema|schema|include|includes|extends|import|imports|file|path)$/i;
const URL = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
/** A path-like value: no spaces, a separator or a file extension (`schemas/user.json`, `../base.toml`). */
const PATHLIKE = /^(?:\.{0,2}\/)?[\w.@~-]+(?:\/[\w.@~-]+)*(?:\.[A-Za-z0-9]{1,10})(?:#\S*)?$|^(?:\.{0,2}\/)?[\w.@~-]+(?:\/[\w.@~-]+)+\/?$/;

export interface DataLink {
  /** The value as a link target (a path relative to the file, maybe with #fragment, or a URL). */
  target: string;
  key: string;
  line: number;
  /** A URL, or a reference key's value: a link even when it doesn't resolve (then reported broken). */
  explicit: boolean;
}

/** The link a key's value is, if any: a URL, a reference key's value, or a path-like string (which
 *  counts only if it resolves — the caller checks). */
export function fieldLink(f: Pick<DataField, "key" | "value">): { target: string; explicit: boolean } | null {
  const v = f.value.trim();
  if (!v || v.length > 500) return null;
  if (URL.test(v)) return { target: v, explicit: true };
  if (REFERENCE_KEYS.test(f.key) && !/\s/.test(v)) return { target: v, explicit: true };
  if (PATHLIKE.test(v) && !/^\d+(\.\d+)+$/.test(v)) return { target: v, explicit: false };
  return null;
}

/** Every key's link candidate in a data file's tree (resolution is the graph's). */
export function dataLinks(tree: Root): DataLink[] {
  const out: DataLink[] = [];
  for (const n of tree.children) {
    const f = n as unknown as DataField;
    if (f.type !== "dataField") continue;
    const l = fieldLink(f);
    if (l) out.push({ ...l, key: f.key, line: f.keyLine });
  }
  return out;
}
