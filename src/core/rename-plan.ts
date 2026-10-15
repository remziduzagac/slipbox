// A rename's plan (7.2): what it changes, file by file and line by line, before anything is written — its shape,
// the collector that reads each file once and edits it in turn, and the git trees that have changes already (7.3).

import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname } from "node:path";
import { classify } from "./filetypes.ts";
import { readText } from "./fsutil.ts";
import type { Graph } from "./graph.ts";
import { gitArgs } from "./gitops.ts";
import { findVaultRoot } from "./vault.ts";
import { type Site, replaceAt } from "./rename-links.ts";

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
}

export interface RenamePlan {
  /** `replace`: a find's matches replaced across files (25.4), `from` the find and `to` its replacement. */
  kind: "note" | "folder" | "vault" | "relink" | "make-vault" | "unmake-vault" | "heading" | "convert" | "replace";
  from: string;
  to: string;
  /** What moves: a file or a folder, absolute paths; null for a vault's rename or a relink. */
  move: { from: string; to: string; dir: boolean } | null;
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

/** Where a link's file is, as shown (21.9): its path from this root, else from home (`~/…`), else absolute. */
export function shownFor(g: Graph, abs: string): string {
  return g.shownPath(abs);
}

export class Collector {
  readonly files = new Map<string, FileChange>();
  readonly skipped: RenamePlan["skipped"] = [];
  /** Why a file can't be rewritten, where it's more than unreadable. */
  private readonly why = new Map<string, string>();

  constructor(readonly g: Graph) {}

  /** Why the file at `abs` isn't rewritten, for its skipped rows. */
  private reason(abs: string): string {
    return this.why.get(abs) ?? "can't be read";
  }

  /**
   * The file's change so far (its text read once, then edited in turn); null where it can't be — or mustn't be: one
   * not valid UTF-8 would be written back with U+FFFD where its bytes were.
   */
  file(abs: string, vault: string | null): FileChange | null {
    let f = this.files.get(abs);
    if (!f) {
      let text: string;
      try {
        const d = readText(abs);
        if (d.invalidUtf8) {
          this.why.set(abs, "not valid UTF-8: not rewritten");
          return null;
        }
        text = d.text;
      } catch {
        return null;
      }
      f = { abs, shown: shownFor(this.g, abs), vault, edits: [], text, next: text };
      this.files.set(abs, f);
    }
    return f;
  }

  /** Rewrite one link site to `next`; noted as skipped when the file no longer has it there. */
  edit(site: Site, next: string, vault: string | null): void {
    if (next === site.target) return;
    const f = this.file(site.abs, vault);
    if (!f)
      return void this.skipped.push({
        shown: shownFor(this.g, site.abs),
        line: site.line,
        reason: this.reason(site.abs),
      });
    const group = classify(site.abs, this.g.config.walk.extensions).group;
    const r = replaceAt(f.next, site, next, group);
    if (!r)
      return void this.skipped.push({
        shown: f.shown,
        line: site.line,
        reason: `no link to ${site.target} there any more (its index is older than the file)`,
      });
    const before = f.next.split("\n")[r.line - 1]!;
    f.next = r.text;
    const after = f.next.split("\n")[r.line - 1]!;
    const same = f.edits.find((e) => e.line === r.line);
    if (same) same.after = after;
    else f.edits.push({ line: r.line, before: before.replace(/\r$/, ""), after: after.replace(/\r$/, "") });
  }

  /** Rewrite one line of a file by `fn` (null: the line isn't what was expected; skipped, with why). */
  line(abs: string, vault: string | null, line: number, fn: (text: string) => string | null, why: string): void {
    const f = this.file(abs, vault);
    if (!f) return void this.skipped.push({ shown: shownFor(this.g, abs), line, reason: this.reason(abs) });
    const lines = f.next.split("\n");
    const before = lines[line - 1];
    const cr = before?.endsWith("\r") ? "\r" : "";
    const after = before === undefined ? null : fn(before.replace(/\r$/, ""));
    if (after === null) return void this.skipped.push({ shown: f.shown, line, reason: why });
    if (after === before!.replace(/\r$/, "")) return;
    lines[line - 1] = after + cr;
    f.next = lines.join("\n");
    const same = f.edits.find((e) => e.line === line);
    if (same) same.after = after;
    else f.edits.push({ line, before: before!.replace(/\r$/, ""), after });
  }

  result(): FileChange[] {
    return [...this.files.values()]
      .filter((f) => f.next !== f.text)
      .map((f) => ({ ...f, edits: f.edits.sort((a, b) => a.line - b.line) }));
  }
}

/** Roots with uncommitted changes in git, among those the plan writes to (7.3). */
export function dirtyTrees(paths: string[]): string[] {
  const roots = new Set<string>();
  for (const p of paths) {
    // git answers for any folder in the tree; the vault's root, else the file's folder, is asked.
    roots.add(findVaultRoot(p) ?? dirname(p));
  }
  const out: string[] = [];
  for (const root of roots) {
    try {
      const status = execFileSync("git", gitArgs(root, ["status", "--porcelain"]), {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      });
      if (status.trim()) out.push(`${root} already has uncommitted changes (git): these edits will mix with them`);
    } catch {
      // not a git repository, or no git: nothing to warn about
    }
  }
  return out;
}

/** A path the walk never lists: something hidden on its way, or in `node_modules`. */
export function walkSkips(rel: string): boolean {
  return rel.split("/").some((s) => s.startsWith(".") || s === "node_modules");
}

/** Whether two paths are one file (a case-only rename on a case-insensitive disk): by inode, not by name. */
export function sameFile(a: string, b: string): boolean {
  try {
    const x = statSync(a);
    const y = statSync(b);
    return x.ino === y.ino && x.dev === y.dev;
  } catch {
    return false;
  }
}
