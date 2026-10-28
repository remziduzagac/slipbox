// Vim register, counts and pending grammar records remain owned by App.
import type { App } from "../../../app/runtime/app.ts";

export type Op = "d" | "c" | "y" | ">" | "<" | "gc";

export type FindKind = "f" | "F" | "t" | "T";

export interface Range {
  from: number;
  to: number;
  linewise: boolean;
  /** > and < in visual mode with a count (V3>): that many levels. */
  times?: number;
}

export function reverseFind(k: FindKind): FindKind {
  return ({ f: "F", F: "f", t: "T", T: "t" } as const)[k];
}

export interface VimState {
  /** Digits typed before a command (`3dw`, `d3w`). */
  count: string;
  /** An operator waiting for its motion: which, its count, the motion keys so far. */
  op: { op: Op; count: number; given: boolean; keys: string[]; object: "i" | "a" | null; char: FindKind | null } | null;
  /** A command waiting for one character (`r`, `f`). */
  awaitChar: ((ch: string) => void) | null;
  /** Which, as the status chip shows it while it waits (`r`, `2f`, `T`). */
  awaitKey?: string;
  /** The last f / F / t / T and its character, for ; and ,. */
  lastFind: { kind: FindKind; ch: string } | null;
  /** An operator waiting for a search to finish (d/foo): where it started. */
  searchOp: { op: Op; from: number } | null;
  /** The unnamed register: the last text deleted, changed or yanked. */
  register: { text: string; linewise: boolean } | null;
  /** The keys of the last change, for `.`, and the ones of the change being made. */
  lastChange: string[] | null;
  /** A change went on into insert mode (c, i, o…): its typed keys are part of it, up to esc. */
  inInsert?: boolean;
  seq: string[];
  seqVersion: number;
  replaying: boolean;
  /** Set by undo/redo, which change the text but aren't changes to repeat. */
  undoing: boolean;
  /** Visual mode's i or a, waiting for its object (viw, va"). */
  visualObject?: "i" | "a" | null;
}

export function newVimState(): VimState {
  return {
    count: "",
    op: null,
    awaitChar: null,
    lastFind: null,
    searchOp: null,
    register: null,
    lastChange: null,
    seq: [],
    seqVersion: -1,
    replaying: false,
    undoing: false,
  };
}

/** The count typed before a command (1 without one); reading it clears it. */
export function takeCount(app: App): number {
  const n = Number(app.vim.count) || 1;
  app.vim.count = "";
  return Math.min(n, 10000);
}
