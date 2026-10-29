// Data reference-key admission and link discovery.

import type { Root } from "mdast";
import type { CellLink, DataField } from "./contracts.ts";

// ---------------------------------------------------------------------------------------------
// Links out of data files (16.15)
/** Keys whose value is a reference by intent: counted whether or not it resolves. */
export const REFERENCE_KEYS = /^(\$ref|\$schema|schema|include|includes|extends|import|imports|file|path)$/i;

const URL = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;

/** A path-like value: no spaces, a separator or a file extension (`schemas/user.json`, `../base.toml`). */
const PATHLIKE =
  /^(?:\.{0,2}\/)?[\w.@~-]+(?:\/[\w.@~-]+)*(?:\.[A-Za-z0-9]{1,10})(?:#\S*)?$|^(?:\.{0,2}\/)?[\w.@~-]+(?:\/[\w.@~-]+)+\/?$/;

export interface DataLink {
  /** The value as a link target (a path relative to the file, maybe with #fragment, or a URL). */
  target: string;
  key: string;
  line: number;
  /** A URL, or a reference key's value: a link even when it doesn't resolve (then reported broken). */
  explicit: boolean;
}

/** The link a key's value is, if any: a URL, a reference key's value, or a path-like string (which
 *  counts only if it resolves — the caller checks). Only a single text value is one: a list, a
 *  number, a boolean, a date or a null under `includes` or `path` is no link. */
export function fieldLink(
  f: Pick<DataField, "key" | "value"> & { kind?: DataField["kind"] },
): { target: string; explicit: boolean } | null {
  if (f.kind && f.kind !== "string" && f.kind !== "other") return null;
  const v = f.value.trim();
  if (!v || v.length > 500) return null;
  if (URL.test(v)) return { target: v, explicit: true };
  if (REFERENCE_KEYS.test(f.key) && !/\s/.test(v)) return { target: v, explicit: true };
  if (PATHLIKE.test(v) && !/^\d+(\.\d+)+$/.test(v)) return { target: v, explicit: false };
  return null;
}

/** Every key's link candidate in a data file's tree (resolution is the graph's): a field's, and a
 *  records table's cells', each under its column's key on its record's line. */
export function dataLinks(tree: Root): DataLink[] {
  const out: DataLink[] = [];
  for (const n of tree.children) {
    if (n.type === "table") {
      const keys = (n.children[0]?.children ?? []).map(
        (c) => (c.children[0] as { value?: string } | undefined)?.value ?? "",
      );
      for (const row of n.children.slice(1)) {
        row.children.forEach((c, i) => {
          const l = (c.data as { link?: CellLink } | undefined)?.link;
          if (l) out.push({ ...l, key: keys[i] ?? "", line: row.position?.start.line ?? 1 });
        });
      }
      continue;
    }
    const f = n as unknown as DataField;
    if (f.type !== "dataField") continue;
    const l = fieldLink(f);
    if (l) out.push({ ...l, key: f.key, line: f.keyLine });
  }
  return out;
}
