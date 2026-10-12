// The file walk (plan 1.2), implementing decision 0.11. The watcher uses the same `WalkFilter`,
// so what the walk excludes is exactly what the watcher does not subscribe to (5.2).

import { type Dirent, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { readRegular, SMALL_FILE } from "./fsutil.ts";
import { join, relative, sep } from "node:path";
import ignore, { type Ignore } from "ignore";
import type { Config } from "./config.ts";
import { isInside, isVaultRoot, MARKER } from "./vault.ts";

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
}

export interface WalkResult {
  files: NoteFile[];
  /** Non-note files (vault-relative), for resolving `![[diagram.png]]` by name. */
  assets: string[];
  /** Every directory walked, `""` for the root — the watcher subscribes to exactly these. */
  dirs: string[];
  skipped: Skipped[];
  errors: string[];
}

const ALWAYS_SKIPPED = new Set([".git", MARKER, "node_modules"]);
/** git's default `core.ignorecase`: true on macOS (case-insensitive filesystem), false on Linux. */
const GIT_IGNORECASE = process.platform === "darwin" || process.platform === "win32";

export class WalkFilter {
  private readonly extensions: Set<string>;
  private readonly gitignores = new Map<string, Ignore | null>();
  private readonly configIgnore: Ignore;

  constructor(
    readonly root: string,
    private readonly walk: Config["walk"],
  ) {
    this.extensions = new Set(walk.extensions.map((e) => e.replace(/^\./, "").toLowerCase()));
    this.configIgnore = ignore({ ignorecase: GIT_IGNORECASE }).add(walk.exclude);
  }

  isNoteName(name: string): boolean {
    const dot = name.lastIndexOf(".");
    return dot > 0 && this.extensions.has(name.slice(dot + 1).toLowerCase());
  }

  get maxFileSize(): number {
    return this.walk.max_file_size;
  }

  /**
   * Whether `rel` may be indexed when it's reached though the walk leaves it out (20.8): nothing on
   * its way is always skipped, excluded by `walk.exclude` or a vault of its own — only a hidden
   * folder or `.gitignore` keeps it from the walk.
   */
  reachable(rel: string): boolean {
    const parts = rel.split("/");
    if (parts.some((p) => !p || p === "." || p === "..")) return false;
    for (let i = 0; i < parts.length; i++) {
      const prefix = parts.slice(0, i + 1).join("/");
      const why = this.exclusion(prefix, i < parts.length - 1);
      if (why !== null && why !== "hidden" && why !== ".gitignore") return false;
      // A root of its own, hidden or git-ignored too (a vendored clone): `exclusion` says why the
      // walk skips it before it looks for markers.
      if (why !== null && i < parts.length - 1 && isVaultRoot(join(this.root, prefix))) return false;
    }
    return true;
  }

  /** Why `rel` is excluded, or null when it is part of the vault. Ancestors are assumed walked. */
  exclusion(rel: string, isDir: boolean): string | null {
    const name = rel.slice(rel.lastIndexOf("/") + 1);
    if (ALWAYS_SKIPPED.has(name)) return "always skipped";
    if (name.startsWith(".")) return "hidden";
    if (this.configIgnore.ignores(isDir ? `${rel}/` : rel)) return "walk.exclude";
    // git semantics: every .gitignore from the root down applies to the path relative to its own
    // directory, and the last one with an opinion wins — so a deeper `!keep.md` re-includes.
    // (A directory already excluded is never descended into, as with git.)
    let ignored = false;
    let dir = "";
    const parts = rel.split("/");
    for (let i = 0; i < parts.length; i++) {
      const ig = this.gitignoreFor(dir);
      if (ig) {
        const sub = parts.slice(i).join("/");
        const t = ig.test(isDir ? `${sub}/` : sub);
        if (t.ignored) ignored = true;
        else if (t.unignored) ignored = false;
      }
      dir = dir ? `${dir}/${parts[i]}` : parts[i]!;
    }
    if (ignored) return ".gitignore";
    // A folder holding a root marker (`walk.root_markers`, 21.1: `.git`, `.slipbox/`, `.obsidian/`, `.zk/`…)
    // inside: a root of its own (20.3).
    if (isDir && isVaultRoot(join(this.root, rel))) return "nested root";
    return null;
  }

  /** Drop a cached .gitignore, e.g. when the watcher sees it change. */
  invalidate(dirRel: string): void {
    this.gitignores.delete(dirRel);
  }

  private gitignoreFor(dirRel: string): Ignore | null {
    if (this.gitignores.has(dirRel)) return this.gitignores.get(dirRel)!;
    let ig: Ignore | null = null;
    try {
      const text = readRegular(join(this.root, dirRel, ".gitignore"), SMALL_FILE).toString("utf8");
      ig = ignore({ ignorecase: GIT_IGNORECASE }).add(text);
    } catch {}
    this.gitignores.set(dirRel, ig);
    return ig;
  }
}

export function walkVault(root: string, filter: WalkFilter): WalkResult {
  const result: WalkResult = { files: [], assets: [], dirs: [], skipped: [], errors: [] };
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {}
  walkDir(root, realRoot, "", filter, result);
  // A symlinked note whose target the walk already includes is the same note twice: it would
  // double every backlink. Keep it only when its target is not otherwise in the vault.
  const walked = new Set(result.files.filter((f) => !symlinkTargets.has(f)).map((f) => f.rel));
  result.files = result.files.filter((f) => {
    const target = symlinkTargets.get(f);
    if (target === undefined || !walked.has(target)) return true;
    result.skipped.push({ rel: f.rel, reason: `symlink to ${target}, already in the root` });
    return false;
  });
  symlinkTargets.clear();
  result.files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return result;
}

function walkDir(root: string, realRoot: string, dirRel: string, filter: WalkFilter, out: WalkResult): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(join(root, dirRel), { withFileTypes: true });
  } catch (err) {
    out.errors.push(`${dirRel || "."}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`);
    return;
  }
  out.dirs.push(dirRel);
  for (const entry of entries) {
    const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
    const abs = join(root, rel);
    if (entry.isDirectory()) {
      const why = filter.exclusion(rel, true);
      if (why === null) walkDir(root, realRoot, rel, filter, out);
      else if (why === "nested root") out.skipped.push({ rel, reason: why });
      continue;
    }
    if (entry.isSymbolicLink()) {
      handleSymlink(abs, rel, realRoot, filter, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (filter.exclusion(rel, false) !== null) continue;
    if (filter.isNoteName(entry.name)) addFile(abs, rel, filter, out);
    else out.assets.push(rel);
  }
}

/**
 * What the walk makes of the symlink at `abs` (0.11) — the watcher too, so both take the same: a
 * directory is never followed; a file is kept only inside the root (`realRoot`, its real path), any
 * file, a note or not; anything else is skipped, with why (`special`: a FIFO, socket or device).
 */
export function symlinkVerdict(
  abs: string,
  realRoot: string,
): { kept: true; target: string } | { kept: false; reason: string | null; special?: boolean } {
  let target: string;
  try {
    target = realpathSync(abs);
  } catch {
    return { kept: false, reason: "broken symlink" };
  }
  let st;
  try {
    st = statSync(target);
  } catch {
    return { kept: false, reason: null };
  }
  if (st.isDirectory()) return { kept: false, reason: "symlinked directory (not followed)" };
  // A FIFO, socket or device: reading one would hang.
  if (!st.isFile()) return { kept: false, reason: "symlink to something that isn't a file", special: true };
  if (!isInside(realRoot, target)) return { kept: false, reason: "symlink points outside the root" };
  return { kept: true, target };
}

function handleSymlink(abs: string, rel: string, realRoot: string, filter: WalkFilter, out: WalkResult): void {
  const v = symlinkVerdict(abs, realRoot);
  if (!v.kept) {
    if (v.reason && (!v.special || filter.isNoteName(rel.slice(rel.lastIndexOf("/") + 1))))
      out.skipped.push({ rel, reason: v.reason });
    return;
  }
  const target = v.target;
  if (filter.exclusion(rel, false) !== null) return;
  if (!filter.isNoteName(rel.slice(rel.lastIndexOf("/") + 1))) {
    out.assets.push(rel);
    return;
  }
  addFile(abs, rel, filter, out);
  const added = out.files[out.files.length - 1];
  if (added?.rel === rel) symlinkTargets.set(added, relative(realRoot, target).split(sep).join("/"));
}

/** Symlinked notes found during the current walk → their target, vault-relative. */
const symlinkTargets = new Map<NoteFile, string>();

function addFile(abs: string, rel: string, filter: WalkFilter, out: WalkResult): void {
  try {
    const st = statSync(abs);
    if (st.size > filter.maxFileSize) {
      out.skipped.push({ rel, reason: `larger than walk.max_file_size (${st.size} bytes)` });
      return;
    }
    out.files.push({ rel, abs, size: st.size, mtimeMs: st.mtimeMs });
  } catch (err) {
    out.errors.push(`${rel}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`);
  }
}

/** Single-file mode: only the notes directly in one directory. */
export function listDirectory(dir: string, filter: WalkFilter): WalkResult {
  const result: WalkResult = { files: [], assets: [], dirs: [""], skipped: [], errors: [] };
  let entries: Dirent[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    result.errors.push(`${dir}: ${(err as Error).message}`);
  }
  for (const e of entries) {
    if (!filter.isNoteName(e.name) || filter.exclusion(e.name, false) !== null) continue;
    const abs = join(dir, e.name);
    try {
      const st = lstatSync(abs).isSymbolicLink() ? statSync(abs) : lstatSync(abs);
      if (!st.isFile()) continue;
      if (st.size > filter.maxFileSize) {
        result.skipped.push({ rel: e.name, reason: `larger than walk.max_file_size (${st.size} bytes)` });
        continue;
      }
      result.files.push({ rel: e.name, abs, size: st.size, mtimeMs: st.mtimeMs });
    } catch {}
  }
  result.files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return result;
}
