// File operations beyond renames (18.2–18.5): a note or folder deleted to the vault's trash and
// restored from it, and a note or folder copied. Moves and renames, which rewrite links, are
// core/rename.ts's. The trash is personal — in the vault's state, never in the folder: a delete
// is undone by restoring, not by git.

import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative } from "node:path";
import { classify } from "./filetypes.ts";
import { landsInside, readJson, writeJson } from "./fsutil.ts";
import type { Backlink, Graph } from "./graph.ts";
import { type Keyed, stateDir } from "./paths.ts";
import { openVault } from "./reach.ts";
import { linksIntoFolder } from "./rename.ts";
import { isInside } from "./vault.ts";

export class FileOpError extends Error {}

export interface TrashItem {
  id: string;
  /** Where it was: absolute, and as shown. */
  abs: string;
  shown: string;
  dir: boolean;
  /** When it was deleted (ISO 8601). */
  at: string;
}

interface TrashFile {
  version: 1;
  items: TrashItem[];
}

export function trashDir(v: Keyed): string {
  return join(stateDir(v), "trash");
}

function trashIndex(v: Keyed): string {
  return join(trashDir(v), "trash.json");
}

export function listTrash(v: Keyed): TrashItem[] {
  const f = readJson<TrashFile | null>(trashIndex(v), null);
  if (!f || f.version !== 1 || !Array.isArray(f.items)) return [];
  return f.items.filter((i) => i && typeof i.id === "string" && typeof i.abs === "string");
}

function saveTrash(v: Keyed, items: TrashItem[]): void {
  writeJson(trashIndex(v), { version: 1, items } satisfies TrashFile);
}

/** Move a path, across filesystems too (the state dir may be on another). */
function move(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    cpSync(from, to, { recursive: true, preserveTimestamps: true });
    rmSync(from, { recursive: true, force: true });
  }
}

/** A vault path of `g` that names a note, a file or a folder of it, checked. */
function vaultPath(g: Graph, rel: string): { rel: string; abs: string; dir: boolean } {
  const clean = posix.normalize(rel.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, ""));
  if (!clean || clean === "." || clean.startsWith("../") || clean === "..") throw new FileOpError(`${rel} isn't inside the root`);
  if (clean.split("/").some((s) => s === ".slipbox" || s === ".git")) throw new FileOpError(`${rel}: slipbox's and git's own folders aren't notes`);
  const abs = join(g.root, clean);
  if (!landsInside(g.root, abs)) throw new FileOpError(`${rel} resolves outside the root`);
  let dir: boolean;
  try {
    dir = statSync(abs).isDirectory();
  } catch {
    throw new FileOpError(`no note, file or folder ${clean} in ${g.root}`);
  }
  return { rel: clean, abs, dir };
}

/** The notes and files of `g` a delete or copy of `rel` takes (a folder's: all in it). */
export function within(g: Graph, rel: string): string[] {
  return [...g.notes.keys(), ...g.filePaths()].filter((p) => p === rel || p.startsWith(`${rel}/`));
}

/**
 * How many links from notes that stay would break: to `rel`, or to anything in it. A vault nested
 * in `g` (18.7): this vault's links into it, and other vaults' (from their indexes).
 */
export function linksInto(g: Graph, rel: string): number {
  if (g.nestedRoots().includes(rel)) {
    const abs = join(g.root, rel);
    const v = openVault(abs);
    const outside = (b: Backlink) => isAbsolute(b.from) && !isInside(g.root, b.from);
    return linksIntoFolder(g, abs).length + [...v.notes.keys(), ...v.filePaths()].reduce((n, p) => n + v.backlinks(p).filter(outside).length, 0);
  }
  const inside = new Set(within(g, rel));
  let n = 0;
  for (const p of inside) for (const b of g.backlinks(p)) if (!inside.has(b.from)) n++;
  return n;
}

/**
 * Delete a note, file or folder to the vault's trash (18.4): moved, never unlinked, with where it
 * was, so `restore` puts it back. The graph forgets it.
 */
export function trashPath(g: Graph, v: Keyed, rel: string, now = new Date()): TrashItem {
  const p = vaultPath(g, rel);
  const id = `${now.toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
  const gone = within(g, p.rel);
  move(p.abs, join(trashDir(v), id, basename(p.abs)));
  const item: TrashItem = { id, abs: p.abs, shown: p.rel, dir: p.dir, at: now.toISOString() };
  saveTrash(v, [item, ...listTrash(v)]);
  for (const f of gone) {
    if (g.notes.has(f)) g.removeFile(f);
    else g.removeAsset(f);
  }
  if (p.dir) g.dirs = g.dirs.filter((d) => d !== p.rel && !d.startsWith(`${p.rel}/`));
  return item;
}

/**
 * A vault made a plain folder (18.11): its `.slipbox/` into the trash of the vault holding it,
 * restored like anything deleted — which makes it a vault again.
 */
export function trashVaultMarker(v: Keyed, parentRoot: string, vaultRoot: string, now = new Date()): TrashItem {
  const abs = join(vaultRoot, ".slipbox");
  const id = `${now.toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
  move(abs, join(trashDir(v), id, ".slipbox"));
  const item: TrashItem = { id, abs, shown: `${relative(parentRoot, vaultRoot)}/.slipbox`, dir: true, at: now.toISOString() };
  saveTrash(v, [item, ...listTrash(v)]);
  return item;
}

/**
 * Put a deleted note, file or folder back where it was (18.4): `which` is its id, or its path
 * (the latest of that path). Refused when something is there now.
 */
export function restorePath(g: Graph | null, v: Keyed, which: string): TrashItem {
  const items = listTrash(v);
  const item = items.find((i) => i.id === which) ?? items.find((i) => i.shown === which || i.abs === which);
  if (!item) throw new FileOpError(`nothing in the trash named ${which}`);
  if (existsSync(item.abs)) throw new FileOpError(`${item.shown} exists again; not restoring over it`);
  move(join(trashDir(v), item.id, basename(item.abs)), item.abs);
  rmSync(join(trashDir(v), item.id), { recursive: true, force: true });
  saveTrash(v, items.filter((i) => i.id !== item.id));
  if (g && isInside(g.root, item.abs)) {
    if (item.dir) g.build(true, "lazy");
    else {
      const rel = relative(g.root, item.abs);
      const st = statSync(item.abs);
      if (classify(rel, g.config.walk.extensions).group === "note") g.updateFile(rel, { rel, abs: item.abs, size: st.size, mtimeMs: st.mtimeMs });
      else g.addAsset(rel);
    }
  }
  return item;
}

/** A free name beside `rel` for its copy: `name-copy.md`, `name-copy-2.md`… */
function copyName(g: Graph, rel: string, dir: boolean): string {
  const ext = dir ? "" : posix.extname(rel);
  const stem = ext ? rel.slice(0, -ext.length) : rel;
  let out = `${stem}-copy${ext}`;
  for (let i = 2; existsSync(join(g.root, out)); i++) out = `${stem}-copy-${i}${ext}`;
  return out;
}

/**
 * Copy a note, file or folder (18.5): to `toRel`, else beside it as `name-copy`. The copy's links
 * are its original's, as written; nothing links to it yet. Refused onto something that exists.
 */
export function copyPath(g: Graph, rel: string, toRel?: string): { from: string; to: string; dir: boolean } {
  const p = vaultPath(g, rel);
  let to = toRel ? posix.normalize(toRel.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")) : copyName(g, p.rel, p.dir);
  if (toRel && !p.dir && posix.extname(to) === "" && posix.extname(p.rel)) to += posix.extname(p.rel);
  if (!to || to.startsWith("../") || to === "..") throw new FileOpError(`${toRel} isn't inside the root`);
  if (to === p.rel || to.startsWith(`${p.rel}/`)) throw new FileOpError(`${p.rel} can't be copied into itself`);
  const toAbs = join(g.root, to);
  if (existsSync(toAbs)) throw new FileOpError(`${to} exists; not overwriting it`);
  if (!landsInside(g.root, toAbs)) throw new FileOpError(`${to} would land outside the root`);
  mkdirSync(dirname(toAbs), { recursive: true });
  cpSync(p.abs, toAbs, { recursive: true, errorOnExist: true, force: false });
  if (p.dir) g.build(true, "lazy");
  else {
    const st = statSync(toAbs);
    if (classify(to, g.config.walk.extensions).group === "note") g.updateFile(to, { rel: to, abs: toAbs, size: st.size, mtimeMs: st.mtimeMs });
    else g.addAsset(to);
  }
  return { from: p.rel, to, dir: p.dir };
}
