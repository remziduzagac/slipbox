// Walk records and limits shared by filters, traversal and worker clients.

import type { Config } from "../../application/config/config.ts";

export interface NoteFile {
  /** Vault-relative, always `/`-separated. */
  rel: string;
  abs: string;
  size: number;
  mtimeMs: number;
}

export interface Skipped {
  rel: string;
  reason: string;
  /** A link the walk didn't go through (VV-D6): where it leads, by its real path, and whether that's a folder. */
  link?: { target: string; dir: boolean };
}

export interface WalkResult {
  files: NoteFile[];
  /** Non-note files (vault-relative), for resolving `![[diagram.png]]` by name. */
  assets: string[];
  /** Every directory walked, `""` for the root — the watcher subscribes to exactly these. */
  dirs: string[];
  skipped: Skipped[];
  errors: string[];
  /** Home's walk (`SlicedWalk`, VV-D2): each folder's stamp as it was listed (`dirStamp`), by its path. */
  times?: Map<string, Stamp>;
}

/**
 * A folder's stamp in home's walk kept (#12): its mtime and its ctime as it was listed, which moves whenever its time
 * is set — so one put back to exactly its stamp still tells; `RELIST` (-1), to list it again (`stampOf`).
 */
export type Stamp = readonly [mtime: number, ctime: number];

/** Which of the rule's two things make a busy folder busy (D237): `.gitignore` ignores it; no note at its top. */
export interface BusyWhy {
  ignored: boolean;
  noNotes: boolean;
}

/** Why home's walk leaves a folder out (VV-D2). */
export type HomeSkip = "hidden" | "system folder" | "Downloads";

/** What makes a filter (T12): its folder, its walk settings, its opts — for one made the same elsewhere (`filterFrom`). */
export interface FilterSettings {
  root: string;
  walk: Config["walk"];
  opts: { home?: boolean; platform?: string };
}

/** A walk's cap: so many notes, so many folders, and so many other files (none: no cap on them). */
export interface WalkLimits {
  notes: number;
  folders: number;
  assets?: number;
}

/** What stopped a walk short: its cap of notes, or of folders. */
export type WalkCap = "notes" | "folders";

/** What the walk makes of a symlink: kept (a file read, a folder walked), or skipped with why. */
export type LinkVerdict =
  | { kept: true; target: string; dir: boolean }
  | { kept: false; reason: string | null; special?: boolean; link?: { target: string; dir: boolean } };
