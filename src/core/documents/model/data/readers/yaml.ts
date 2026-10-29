// YAML document-tree positions and explicit JSON validation, retaining the original branches.

import type { RootContent, Table } from "mdast";
import {
  isMap,
  isPair,
  isScalar,
  isSeq,
  LineCounter,
  type Node as YamlNode,
  parseAllDocuments,
  type Scalar,
} from "yaml";
import { stringWidth } from "../../../../foundation/text/width.ts";
import type { DataField, ParsedData } from "../contracts.ts";
import { stripJsonComments } from "./json.ts";
import { KEY_MAX, firstLine, pos, table } from "../nodes.ts";
import { REFERENCE_KEYS, fieldLink } from "../links.ts";

export function readYaml(source: string, json: boolean): ParsedData {
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
  const srcLines = text.split("\n");
  let docStart = 1;
  list.forEach((doc, d) => {
    // Where this document's text starts: the line after its `---` (the first has none).
    if (d > 0) {
      let k = docStart;
      while (k <= srcLines.length && !/^---(\s|$)/.test(srcLines[k - 1]!)) k++;
      docStart = k + 1;
    }
    if (doc.errors.length && !error) {
      const e = doc.errors[0]!;
      error = `line ${lineOf(e.pos[0])}: ${firstLine(e.message)}`;
    }
    const contents = doc.contents as YamlNode | null;
    // A comment block before a document's content (a blank line after it keeps it off the first
    // key): the file's, or the document's, opening prose.
    // (The parser keeps it on the document, or — after a `---` — on its content.)
    const opening = (
      (doc as { commentBefore?: string | null }).commentBefore ??
      (contents as { commentBefore?: string | null } | null)?.commentBefore
    )?.trim();
    if (opening) {
      // Its lines are the first comment lines of the document (the parser keeps no position for
      // them): after the previous document's `---`, blank lines skipped.
      const n = opening.split("\n").length;
      let start = d === 0 ? 1 : docStart;
      while (start <= srcLines.length && !srcLines[start - 1]!.trimStart().startsWith("#")) start++;
      out.push({
        type: "dataComment",
        text: opening
          .split("\n")
          .map((l) => l.trim())
          .join("\n"),
        position: pos(start, start + n - 1),
      } as unknown as RootContent);
    }
    // Several documents (`---`): each a branch of its own, its keys under it.
    if (list.length > 1) {
      const line = contents?.range ? lineOf(contents.range[0]) : 1;
      out.push({
        type: "dataField",
        key: `document ${d + 1}`,
        value: "",
        kind: "table",
        comment: null,
        keyWidth: 0,
        keyLine: line,
        position: pos(line),
        tree: { lasts: [], branch: true },
      } as unknown as RootContent);
    }
    if (contents) walkYaml(contents, list.length > 1 ? [] : null, out, lineOf);
  });
  return { tree: { type: "root", children: out }, error };
}

/** A node's value as one line: scalars as they read, lists and maps inline. */
function inline(node: YamlNode | null | undefined): string {
  if (!node) return "";
  if (isScalar(node)) return node.value === null ? "null" : String(node.value);
  if (isSeq(node)) return `[${node.items.map((x) => inline(x as YamlNode)).join(", ")}]`;
  if (isMap(node))
    return `{${node.items.map((p) => `${inline(p.key as YamlNode)}: ${inline(p.value as YamlNode)}`).join(", ")}}`;
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

/** A small map of plain values reads on one line (`{connect: 5, idle: 300}`) up to this width. */
const INLINE_MAP = 40;

/** Whether a value is a leaf row: a scalar, a list of scalars, an empty or a small plain map. */
function leaf(node: YamlNode | null | undefined): boolean {
  if (!node || (!isMap(node) && !isSeq(node))) return true;
  const items = (node as unknown as { items: unknown[] }).items;
  if (!items.length) return true;
  if (isSeq(node)) return items.every((x) => !isMap(x as YamlNode) && !isSeq(x as YamlNode));
  const pairs = (node as unknown as { items: { key: YamlNode; value: YamlNode }[] }).items;
  const plain = pairs.every((p) => !isMap(p.value) && !isSeq(p.value));
  // A reference (`$ref`, `include`…) keeps a row of its own: its value is a link.
  return plain && !pairs.some((p) => REFERENCE_KEYS.test(inline(p.key))) && inline(node).length <= INLINE_MAP;
}

/**
 * YAML's and JSON's structure as a tree (16.12): every key a row of its own, with its place — for
 * each level below the top, whether the row (or its ancestor there) is the last of its siblings
 * (`lasts`), which the renderer draws as guides. An object, or a list that isn't plain, is a
 * branch row with its children after it; a list of records is a table in the tree. Each row keeps
 * its own source lines, so the lens edits it. `lasts`: the parent's place; null at the top.
 */
function walkYaml(node: YamlNode, lasts: boolean[] | null, out: RootContent[], lineOf: (o: number) => number): void {
  const lineAt = (n: YamlNode | null | undefined, fallback = 1) => (n?.range ? lineOf(n.range[0]) : fallback);
  type Child = { name: string; key: YamlNode | null; value: YamlNode | null; line: number };
  let children: Child[];
  if (isMap(node)) {
    children = node.items
      .filter((p) => isPair(p))
      .map((p) => ({
        name: inline(p.key as YamlNode),
        key: p.key as YamlNode | null,
        value: p.value as YamlNode | null,
        line: lineAt(p.key as YamlNode, lineAt(p.value as YamlNode)),
      }));
  } else if (isSeq(node) && node.items.length) {
    if (records(node)) {
      out.push(treeTable(recordTable(node, lineOf), lasts ? [...lasts, true] : []));
      return;
    }
    children = node.items.map((it, i) => ({
      name: `${i + 1}`,
      key: null,
      value: it as YamlNode,
      line: lineAt(it as YamlNode),
    }));
  } else {
    out.push({
      type: "dataField",
      key: "value",
      value: inline(node),
      kind: scalarKind(node),
      comment: null,
      keyWidth: 0,
      keyLine: lineAt(node),
      position: pos(lineAt(node)),
      tree: { lasts: lasts ?? [] },
    } as unknown as RootContent);
    return;
  }
  // Sibling leaves share one key column. In a list, if one object is a branch, all are (item 1
  // drawn open and item 2 inline would read as two kinds of thing).
  const leaves: DataField[] = [];
  const openMaps = isSeq(node) && children.some((c) => isMap(c.value) && !leaf(c.value));
  children.forEach((c, k) => {
    const place = lasts ? [...lasts, k === children.length - 1] : [];
    // The comment lines above a key are its comment when they're one line; several, or the file's
    // opening ones, or those above a branch, are a block of their own (as in TOML).
    let before =
      (c.key as { commentBefore?: string } | null)?.commentBefore?.trim() ||
      (c.value as { commentBefore?: string } | null)?.commentBefore?.trim() ||
      null;
    const branch =
      !leaf(c.value) || (openMaps && isMap(c.value) && (c.value as unknown as { items: unknown[] }).items.length > 0);
    const opening = k === 0 && (lasts === null || lasts.length === 0); // a document's first key
    if (before && (before.includes("\n") || opening || branch)) {
      const n = before.split("\n").length;
      out.push({
        type: "dataComment",
        text: before
          .split("\n")
          .map((l) => l.trim())
          .join("\n"),
        position: pos(Math.max(1, c.line - n), c.line - 1),
        tree: { lasts: place, above: true },
      } as unknown as RootContent);
      before = null;
    }
    const comment =
      [before, (c.value as { comment?: string } | null)?.comment].filter(Boolean).join(" ").trim() || null;
    if (branch) {
      out.push({
        type: "dataField",
        key: c.name,
        value: "",
        kind: isSeq(c.value) ? "list" : "table",
        comment,
        keyWidth: 0,
        keyLine: c.line,
        position: pos(c.line),
        tree: { lasts: place, branch: true },
      } as unknown as RootContent);
      walkYaml(c.value!, place, out, lineOf);
    } else {
      const end = c.value?.range ? lineOf(Math.max(c.value.range[0], c.value.range[1] - 1)) : c.line;
      const first = before ? Math.max(1, c.line - before.split("\n").length) : c.line;
      const f = {
        type: "dataField",
        key: c.name,
        value: inline(c.value),
        kind: scalarKind(c.value),
        comment,
        keyWidth: 0,
        keyLine: c.line,
        position: pos(first, Math.max(c.line, end)),
        tree: { lasts: place },
      } as unknown as DataField;
      leaves.push(f);
      out.push(f as unknown as RootContent);
    }
  });
  const w = Math.min(KEY_MAX, Math.max(0, ...leaves.map((f) => stringWidth(f.key))));
  for (const f of leaves) f.keyWidth = w;
}

/** A table of records as a row of the tree: drawn under its key, inside the guides. */
function treeTable(t: Table, lasts: boolean[]): RootContent {
  return { ...t, data: { ...t.data, tree: { lasts } } } as RootContent;
}

/** A list of two or more maps whose values are all plain: a table's rows. */
function records(seq: YamlNode): boolean {
  if (!isSeq(seq) || seq.items.length < 2) return false;
  return seq.items.every(
    (it) =>
      isMap(it) &&
      (it as { items: { value: unknown }[] }).items.every(
        (p) => !isMap(p.value as YamlNode) && !isSeq(p.value as YamlNode),
      ),
  );
}

function recordTable(seq: YamlNode, lineOf: (o: number) => number): Table {
  const items = (seq as unknown as { items: YamlNode[] }).items;
  const cols = [
    ...new Set(items.flatMap((m) => (m as unknown as { items: { key: YamlNode }[] }).items.map((p) => inline(p.key)))),
  ];
  const rows = items.map((m) => {
    const pairs = (m as unknown as { items: { key: YamlNode; value: YamlNode }[] }).items;
    const values = cols.map((c) => pairs.find((p) => inline(p.key) === c));
    const links = values.map((p, k) =>
      p ? fieldLink({ key: cols[k]!, value: inline(p.value), kind: scalarKind(p.value) }) : null,
    );
    return { line: m.range ? lineOf(m.range[0]) : 1, cells: values.map((p) => inline(p?.value)), links };
  });
  return table(cols, rows, rows[0]?.line ?? 1);
}
