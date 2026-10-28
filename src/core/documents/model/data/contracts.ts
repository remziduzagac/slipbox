// Positioned data-document records; format readers retain their own semantics.

import type { Root } from "mdast";
import type { fieldLink } from "./links.ts";

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
  /** YAML's and JSON's rows: its place in the tree (the guides), and whether children follow. */
  tree?: TreePlace;
}

/**
 * A row's place in a data file's tree (16.12): for each level below the top, whether the row — or
 * its ancestor at that level — is the last of its siblings. `branch`: an object or list whose rows
 * follow; `above`: comment lines above a key (drawn inside its parent's guides).
 */
export interface TreePlace {
  lasts: boolean[];
  branch?: boolean;
  above?: boolean;
}

/** Comment lines on their own, between keys or sections. */
export interface DataComment {
  type: "dataComment";
  tree?: TreePlace;
  text: string;
  position: { start: { line: number; column: number }; end: { line: number; column: number } };
}

export interface ParsedData {
  tree: Root;
  /** Why the file doesn't parse (it then shows in source mode, the error said). */
  error: string | null;
}

/** A records table's cell that is a link (16.15): as `fieldLink` reads its value under its column's key. */
export type CellLink = NonNullable<ReturnType<typeof fieldLink>>;
