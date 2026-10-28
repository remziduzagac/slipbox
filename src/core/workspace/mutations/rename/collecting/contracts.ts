// Rename errors and plan/edit records shared below planning and execution.

export class RenameError extends Error {}

export interface Edit {
  line: number;
  /** The line before and after, for the preview. */
  before: string;
  after: string;
}

export interface FileChange {
  /** Absolute. */
  abs: string;
  /** How to show it: its path from this root, else `~/…`, else absolute (21.9). */
  shown: string;
  vault: string | null;
  edits: Edit[];
  /** The text as planned from, and as it will be. */
  text: string;
  next: string;
  /** Other names the file has here, in its folder, that edited it alike (D260): written once, indexed again each. */
  also?: string[];
}

export interface RenamePlan {
  /** `replace`: a find's matches replaced across files (25.4), `from` the find and `to` its replacement. */
  kind: "note" | "folder" | "vault" | "relink" | "make-vault" | "unmake-vault" | "heading" | "convert" | "replace";
  from: string;
  to: string;
  /** What moves: a file or a folder, absolute paths; null for a vault's rename or a relink. */
  move: { from: string; to: string; dir: boolean; link?: boolean } | null;
  /** Every file that moves, vault paths old → new (a folder's: each file in it). */
  moves?: [string, string][];
  /** Vaults that move with a vault's folder (18.7), absolute roots old → new: the machine's list follows. */
  vaults?: [string, string][];
  /** A folder made a vault of its own (18.11): its root, its name, and whether it's private. */
  makeVault?: { root: string; name: string | null; private: boolean };
  /** A vault nested here made a plain folder of it (18.11): its root and the name it had. */
  unmakeVault?: { root: string; name: string };
  files: FileChange[];
  warnings: string[];
  /** Links the index knew of that the file no longer has where it said: left alone. */
  skipped: { shown: string; line: number; reason: string }[];
  /** A plan that undoes a rename (7.4): the rename's id in the vault's log, and when it was done. */
  undo?: { id: string; at: string; made: string | null };
  /** Links the plan can't decide for itself (20.1: a wikilink several notes answer to): each to pick. */
  ambiguous?: Ambiguous[];
}

/** A link with several possible targets, for the user to pick one of. */
export interface Ambiguous {
  /** The link's place, `rel:line:column`: what a pick names. */
  key: string;
  shown: string;
  line: number;
  /** The link as written. */
  written: string;
  /** Vault-relative. */
  candidates: string[];
}
