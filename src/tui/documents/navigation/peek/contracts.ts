// Shared peek records and reach-holder/backlink result types.

import type { BacklinkRow } from "../../../../core/workspace/graph/backlinks-jobs.ts";
import type { Anchor, CursorAnchor } from "../../../../core/workspace/session/position.ts";
import type { Reach } from "../../../../core/workspace/links/reach.ts";
import type { VaultLocation } from "../../../../core/workspace/vaults/vault.ts";

/** A place a peek showed, for `ctrl+o` inside it: with the backlinks it listed, shown again at once when it's back. */
export interface Place {
  abs: string;
  loc: VaultLocation;
  top: Anchor;
  cursor: CursorAnchor;
  rows?: BacklinkRow[];
}

export interface Peek {
  /** The file read, by its absolute path. */
  abs: string;
  /** Its vault; outside every vault, Elsewhere's location from its folder (mode `folder`, VV-D3). */
  loc: VaultLocation;
  /** How its vault is named: its name, else its path; outside every vault, `Elsewhere`. */
  label: string;
  /** Where links inside it moved it from, and back again: `ctrl+o`, and forward. */
  back: Place[];
  fwd: Place[];
  /** `z`: the whole screen, not most of it. */
  full: boolean;
  /** Not read: a link of its place's on its way isn't followed there (VV-D6) — the peek says so, and `o` goes there. */
  unread?: boolean;
  /** Its note's backlinks being worked out on their thread (#10): settled once they're shown, or the peek moved on. */
  reading?: Promise<void>;
  /** The backlinks it lists, once they've come; or those it listed when last here, until they come again. */
  rows?: BacklinkRow[];
}

/**
 * Where a graph of another vault is held: this TUI's reach, as it is when asked (a rename may have made it anew) — or a
 * peeked vault's own reach, for a third vault that vault's links reach, while that vault's graph is held itself; null,
 * let go of.
 */
export type Holder = () => Reach | null;

/**
 * Where a peeked note's backlinks are (#10): being read from its vault's index, or its index being built, on their
 * thread; none to show (home without an index); shown; or not worked out, and why.
 */
export type BacklinksState = "reading" | "building" | "none" | BacklinkRow[] | { failed: string };
