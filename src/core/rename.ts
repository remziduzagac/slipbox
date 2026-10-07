// Renames and moves (17.15, with 7.1–7.3; docs/idea.md, "Moves, renames and backlinks"): a note or
// folder renamed or moved, with its links rewritten in every root this machine reaches; a root
// named — as byte-range edits at the positions the index recorded, never a re-serialised file
// (7.6). A plan is made first, to preview (7.2); it names the git trees that already have changes
// (7.3); applying it checks that no file it touches changed since.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { classify } from "./filetypes.ts";
import { atomicWrite, climbsOut, landsInside, readText } from "./fsutil.ts";
import type { Backlink, Graph, LinkKind, NoteEntry, ResolvedLink } from "./graph.ts";
import { extensionless, formatPathLink, normKey, pathForm, pathLink, type PathForm, pathNamed, wikiPathCandidates } from "./links.ts";
import { slugify } from "./parse.ts";
import { trashVaultMarker } from "./files.ts";
import { contentHash } from "./redirects.ts";
import { changedSpan, forgetRename, type LoggedRename, logRename, readRenames } from "./rename-log.ts";
import { forgetRoot, IdentityEditError, identityReadsBack, newVaultId, readIdentity, readRoots, VAULT_NAME, vaultConfigFile, withIdentity } from "./registry.ts";
import { openVault } from "./reach.ts";
import { copyAvailable, folderIdentity, folderNamed, pointerName, readFolders, recordFolder, travelTogether } from "./folders.ts";
import { formatPointer, isPointer, parsePointer, resolvePointer } from "./pointer.ts";
import { parseHosted } from "./hosting.ts";
import { checkoutOf } from "./git.ts";
import { findVaultRoot, hasMarker, initVault, isInside, markersAt, type VaultLocation } from "./vault.ts";

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
  kind: "note" | "folder" | "vault" | "relink" | "make-vault" | "unmake-vault" | "heading" | "convert";
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

/** A link as found in a file: where, how it's written, and where it should point now. */
interface Site {
  /** The linking file, absolute. */
  abs: string;
  kind: LinkKind;
  /** The target as written (a wikilink's, without `#heading` or `|text`). */
  target: string;
  line: number;
  column: number;
}

const NOTE_EXT = /\.(md|markdown)$/i;

// -------------------------------------------------------------------------------------------
// Rewriting one link

/**
 * The new target text of a wikilink whose note is now at `toRel` in the vault `g` — keeping the
 * way it was written: a name stays a name (a path when the name is taken, or `apart`: the note now in
 * another root than the link, where a name doesn't reach — 17.17, 21.3), a path a path, a relative
 * path relative, an extension written stays written.
 */
function wikiTarget(written: string, fromRelDir: string | null, toRel: string, g: Graph, movedFrom: string, apart = false): string {
  const t = written;
  // A note's `.md` only where it was written; any other file's extension is in its path, once.
  const isNote = NOTE_EXT.test(toRel);
  const ext = isNote && NOTE_EXT.test(t) ? posix.extname(toRel) : "";
  const stem = (p: string) => (isNote ? p.replace(NOTE_EXT, "") : p);
  if ((t.startsWith("./") || t.startsWith("../")) && fromRelDir !== null) {
    let r = posix.relative(fromRelDir, stem(toRel)) + ext;
    if (!r.startsWith("../")) r = `./${r}`;
    return r;
  }
  if (t.includes("/")) return (t.startsWith("/") ? "/" : "") + stem(toRel) + ext;
  const name = stem(posix.basename(toRel));
  // Another note with that name: the path, so it can't reach the wrong one.
  const taken = [...g.notes.keys()].some((p) => p !== movedFrom && p !== toRel && normKey(posix.basename(p).replace(NOTE_EXT, "")) === normKey(name));
  return (taken || apart ? stem(toRel) : name) + ext;
}

/** The root a file is in (or will be, not there yet), by its real path: the nearest marker's. */
function rootOfPath(abs: string): string {
  return real(findVaultRoot(abs) ?? "");
}

function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * A link written as a filesystem path (17.16) — relative, `~/`, absolute, `file://` — in a file at
 * `linkingAbs` (to be at `linkingAfter`), that reaches `fromAbs`: the same form, reaching `toAbs`
 * from where the file will be. Null when it isn't one, or reaches something else.
 */
function pathRetarget(written: string, linkingAbs: string, linkingAfter: string, fromAbs: string, toAbs: string, wiki: boolean): string | null {
  const hash = wiki ? -1 : written.indexOf("#");
  const frag = hash >= 0 ? written.slice(hash) : "";
  const path = hash >= 0 ? written.slice(0, hash) : written;
  const hit = pathLink(path, linkingAbs, wiki, undefined, true);
  if (!hit || real(hit.abs) !== real(fromAbs)) return null;
  // Written without its extension, it stays without it (21.2): a wikilink's, a markdown link's.
  const ext = !extensionless(path) || !NOTE_EXT.test(toAbs);
  let next = formatPathLink(hit.form, toAbs, linkingAfter, ext);
  if (hit.folder && path.endsWith("/")) next += "/";
  if (!wiki && hit.form !== "file-url" && (/%[0-9A-Fa-f]{2}/.test(path) || /\s/.test(next))) next = encodeURI(next);
  return next + frag;
}

/** A hosting URL with its path (the part after the ref) for another, encoded as a URL's path is; the rest kept. */
function hostedPath(url: string, was: string, now: string): string {
  const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");
  const u = new URL(url);
  const old = enc(was);
  if (!u.pathname.endsWith(`/${old}`)) return url;
  const extless = !/\.[A-Za-z0-9]+$/.test(was);
  u.pathname = u.pathname.slice(0, u.pathname.length - old.length) + enc(extless ? now.replace(NOTE_EXT, "") : now);
  return u.toString();
}

/**
 * A markdown link's new URL reaching `toAbs`, in the form it was written (21.2): from the root when it
 * started with `/` and the root holds the target, else relative from the linking file (`./` kept);
 * without its extension when written without one; a folder's trailing `/` kept.
 */
function mdTarget(written: string, linkingAbs: string, toAbs: string, g: Graph | null): string {
  const hash = written.indexOf("#");
  const frag = hash >= 0 ? written.slice(hash) : "";
  const path = hash >= 0 ? written.slice(0, hash) : written;
  // A link to the repository's hosting stays one: the URL, its path to where the file is now.
  const hosted = /^https?:\/\//i.test(written) ? parseHosted(written) : null;
  if (hosted?.path) {
    const top = checkoutOf(toAbs)?.root;
    if (top && isInside(top, toAbs)) return hostedPath(written, hosted.path, relative(top, toAbs).split("\\").join("/"));
  }
  // A pointer (21.7) stays one: its name and branch, the path from its folder's root to the file now —
  // without an extension, a folder's `/`, encoded, each as written. Out of that folder, into another
  // named one: a pointer to that one.
  const p = isPointer(path) ? parsePointer(path) : null;
  if (p) {
    const t = resolvePointer({ ...p, path: "", fragment: null });
    let into = t.status === "found" && isInside(t.root, toAbs) ? { name: p.name, branch: p.branch, root: t.root } : null;
    if (!into) {
      const there = findVaultRoot(toAbs);
      const ident = there ? folderIdentity(there) : null;
      if (there && ident) into = { name: pointerName({ key: ident.key, name: ident.name, remote: ident.remote }), branch: null, root: there };
    }
    if (into) {
      let rel = relative(into.root, toAbs).split("\\").join("/");
      if (extensionless(p.path) && NOTE_EXT.test(rel)) rel = rel.replace(NOTE_EXT, "");
      if (p.path.endsWith("/") && rel && !rel.endsWith("/")) rel += "/";
      const encode = /%[0-9A-Fa-f]{2}/.test(path) || /\s/.test(rel);
      return formatPointer({ name: into.name, branch: into.branch, path: rel, fragment: null }, encode ? encodeURI : undefined) + frag;
    }
  }
  let next: string;
  if (path.startsWith("/") && g && g.loc.mode !== "folder" && isInside(g.root, toAbs)) next = `/${relative(g.root, toAbs).split("\\").join("/")}`;
  else {
    next = relative(dirname(linkingAbs), toAbs).split("\\").join("/");
    if (path.startsWith("./") && !next.startsWith("../")) next = `./${next}`;
  }
  if (extensionless(path) && NOTE_EXT.test(next)) next = next.replace(NOTE_EXT, "");
  if (path.endsWith("/") && !next.endsWith("/")) next += "/";
  // Written percent-encoded (`my%20note.md`): encoded again.
  const encoded = /%[0-9A-Fa-f]{2}/.test(path) || /\s/.test(next);
  return (encoded ? encodeURI(next) : next) + frag;
}

/**
 * Replace a link's target in `text` at the site the index recorded: the wikilink or markdown link
 * starting at that line and column (a reference link's definition, wherever it is), or in a data
 * or code file the path on that line. Null when the link isn't there any more.
 */
function replaceAt(text: string, site: Site, next: string, group: string): { text: string; line: number } | null {
  const lines = text.split("\n");
  const at = site.line - 1;
  const line = lines[at];
  if (line === undefined) return null;
  const col = Math.max(0, site.column - 1);
  const put = (i: number, from: number, to: number, what: string) => {
    lines[i] = lines[i]!.slice(0, from) + what + lines[i]!.slice(to);
    return { text: lines.join("\n"), line: i + 1 };
  };
  // The index's column counts characters its own way (a wide one, a tab): of the links on the
  // line with this target, the one nearest to it.
  const nearest = <T extends { at: number }>(hits: T[]) => hits.sort((a, b) => Math.abs(a.at - col) - Math.abs(b.at - col))[0];
  if (group === "note" && (site.kind === "wiki" || site.kind === "embed")) {
    const hits: { at: number; from: number; to: number }[] = [];
    for (let open = line.indexOf("[["); open >= 0; open = line.indexOf("[[", open + 2)) {
      const close = line.indexOf("]]", open + 2);
      if (close < 0) break;
      const inner = line.slice(open + 2, close);
      const end = inner.search(/\\?\||#|\^/);
      const head = end < 0 ? inner : inner.slice(0, end);
      const lead = head.length - head.trimStart().length;
      if (head.trim() === site.target) hits.push({ at: open > 0 && line[open - 1] === "!" ? open - 1 : open, from: open + 2 + lead, to: open + 2 + lead + head.trim().length });
    }
    const hit = nearest(hits);
    return hit ? put(at, hit.from, hit.to, next) : null;
  }
  if (group === "note" && (site.kind === "markdown" || site.kind === "image")) {
    const hits: { at: number; start: number; raw: string }[] = [];
    for (const m of line.matchAll(/\]\(\s*(<[^>\n]*>|[^)\s]*)/g)) {
      const raw = m[1]!;
      const url = raw.startsWith("<") ? raw.slice(1, -1) : raw;
      if (url !== site.target && safeDecode(url) !== site.target) continue;
      // The link starts at its `[` (or `![`): the nearest one before its `](`.
      const open = line.lastIndexOf("[", m.index);
      hits.push({ at: open > 0 && line[open - 1] === "!" ? open - 1 : open, start: m.index + m[0].length - raw.length, raw });
    }
    const hit = nearest(hits);
    if (hit) return put(at, hit.start, hit.start + hit.raw.length, hit.raw.startsWith("<") ? `<${safeDecode(next)}>` : next);
    // A reference link: its definition, wherever it is.
    for (let i = 0; i < lines.length; i++) {
      const d = /^( {0,3}\[[^\]]+\]:[ \t]*)(<[^>\n]*>|\S+)/.exec(lines[i]!);
      if (!d) continue;
      const raw = d[2]!;
      const url = raw.startsWith("<") ? raw.slice(1, -1) : raw;
      if (url !== site.target && safeDecode(url) !== site.target) continue;
      return put(i, d[1]!.length, d[1]!.length + raw.length, raw.startsWith("<") ? `<${safeDecode(next)}>` : next);
    }
    return null;
  }
  // A data file's value or a code comment's path: the old path, as written on that line.
  const old = site.target.split("#")[0]!.replace(/^\//, "");
  const i = line.indexOf(old, col) >= 0 ? line.indexOf(old, col) : line.indexOf(old);
  if (i < 0 || !old) return null;
  return put(at, i, i + old.length, next.split("#")[0]!.replace(/^\//, ""));
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// -------------------------------------------------------------------------------------------
// Plans

/** Where a link's file is, as shown (21.9): its path from this root, else from home (`~/…`), else absolute. */
function shownFor(g: Graph, abs: string): string {
  return g.shownPath(abs);
}

export class Collector {
  readonly files = new Map<string, FileChange>();
  readonly skipped: RenamePlan["skipped"] = [];

  constructor(readonly g: Graph) {}

  /** The file's change so far (its text read once, then edited in turn). */
  file(abs: string, vault: string | null): FileChange | null {
    let f = this.files.get(abs);
    if (!f) {
      let text: string;
      try {
        text = readText(abs).text;
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
    if (!f) return void this.skipped.push({ shown: shownFor(this.g, site.abs), line: site.line, reason: "can't be read" });
    const group = classify(site.abs, this.g.config.walk.extensions).group;
    const r = replaceAt(f.next, site, next, group);
    if (!r) return void this.skipped.push({ shown: f.shown, line: site.line, reason: `no link to ${site.target} there any more (its index is older than the file)` });
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
    if (!f) return void this.skipped.push({ shown: shownFor(this.g, abs), line, reason: "can't be read" });
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
    return [...this.files.values()].filter((f) => f.next !== f.text).map((f) => ({ ...f, edits: f.edits.sort((a, b) => a.line - b.line) }));
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
      const status = execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
      if (status.trim()) out.push(`${root} already has uncommitted changes (git): these edits will mix with them`);
    } catch {
      // not a git repository, or no git: nothing to warn about
    }
  }
  return out;
}

/** A path the walk never lists: something hidden on its way, or in `node_modules`. */
function walkSkips(rel: string): boolean {
  return rel.split("/").some((s) => s.startsWith(".") || s === "node_modules");
}

/** A vault path as the user typed it: normalized, inside the vault, and not somewhere hidden. */
function cleanTarget(g: Graph, input: string): string {
  const rel = posix.normalize(input.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, ""));
  if (rel.startsWith("../") || rel === ".." || rel === "." || isAbsolute(rel)) throw new RenameError(`${input} isn't inside the vault`);
  if (walkSkips(rel)) throw new RenameError(`${input}: the walk leaves hidden folders and node_modules out`);
  if (!landsInside(g.root, join(g.root, rel))) throw new RenameError(`${rel} would land outside the root`);
  const where = fileInTheWay(g.root, rel);
  if (where) throw new RenameError(`${where} is a file: ${rel} can't go under it`);
  return rel;
}

/** A file where a folder of the path `rel` would have to be (`x.md` for `x.md/a.md`), or null. */
function fileInTheWay(root: string, rel: string): string | null {
  const parts = rel.split("/");
  for (let i = 1; i < parts.length; i++) {
    const at = parts.slice(0, i).join("/");
    try {
      if (!statSync(join(root, at)).isDirectory()) return at;
    } catch {
      return null; // not there: made when the move makes its folder
    }
  }
  return null;
}

/** Whether two paths are one file (a case-only rename on a case-insensitive disk): by inode, not by name. */
function sameFile(a: string, b: string): boolean {
  try {
    const x = statSync(a);
    const y = statSync(b);
    return x.ino === y.ino && x.dev === y.dev;
  } catch {
    return false;
  }
}

/**
 * Plan renaming or moving a note (or any file of the vault) to `toRel` (7.1, 17.15): every link to
 * it — in this vault, and in other vaults' indexes — rewritten; its own relative links fixed for
 * its new folder. Nothing else is written into it: links reach it by its path (21.12).
 */
export function planNoteRename(g: Graph, fromRel: string, toInput: string): RenamePlan {
  const isNote = g.notes.has(fromRel);
  if (!isNote && !g.filePaths().includes(fromRel)) throw new RenameError(`no note or file ${fromRel} in ${g.root}`);
  let toRel = cleanTarget(g, toInput);
  if (posix.extname(toRel) === "" || (isNote && !NOTE_EXT.test(toRel))) toRel += posix.extname(fromRel);
  if (toRel === fromRel) throw new RenameError(`${fromRel} is already there`);
  if (existsSync(join(g.root, toRel)) && !sameFile(join(g.root, fromRel), join(g.root, toRel))) throw new RenameError(`${toRel} exists; not overwriting it`);
  return planMove(g, new Map([[fromRel, toRel]]), { kind: "note", from: fromRel, to: toRel, move: { from: join(g.root, fromRel), to: join(g.root, toRel), dir: false } });
}

/**
 * Plan renaming or moving a folder (18.3): every note and file in it moves with it, and every link to
 * any of them is rewritten — links between two of them that move together stay as they are.
 */
export function planFolderMove(g: Graph, fromDir: string, toInput: string): RenamePlan {
  const from = posix.normalize(fromDir.replace(/\/+$/, ""));
  if (!g.dirs.includes(from) || !from || from === ".") throw new RenameError(`no folder ${fromDir} in ${g.root}`);
  const to = cleanTarget(g, toInput);
  if (to === from) throw new RenameError(`${from} is already there`);
  if (to.startsWith(`${from}/`)) throw new RenameError(`${from} can't move into itself`);
  if (existsSync(join(g.root, to)) && !sameFile(join(g.root, from), join(g.root, to))) throw new RenameError(`${to} exists; not overwriting it`);
  const moves = new Map<string, string>();
  for (const rel of [...g.notes.keys(), ...g.filePaths()]) if (rel.startsWith(`${from}/`)) moves.set(rel, `${to}${rel.slice(from.length)}`);
  // A root nested in it moves with it (18.7): the links into it and out of it as its own move's.
  const fromAbs = join(g.root, from);
  const toAbs = join(g.root, to);
  const moving = (abs: string) => abs === fromAbs || abs.startsWith(`${fromAbs}/`);
  const shift = (abs: string) => (moving(abs) ? toAbs + abs.slice(fromAbs.length) : abs);
  const nested = g.nestedRoots().filter((r) => r.startsWith(`${from}/`));
  const roots = nested.length ? (c: Collector) => nested.flatMap((r) => nestedRootEdits(g, c, join(g.root, r), moving, shift)) : undefined;
  return planMove(g, moves, { kind: "folder", from, to, move: { from: fromAbs, to: toAbs, dir: true } }, foldersMoving(g, from, to), roots);
}

/** The folder `from` and every folder in it, each to where it goes under `to` (links to a folder, 21.2). */
function foldersMoving(g: Graph, from: string, to: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of [from, ...g.dirs]) if (d === from || d.startsWith(`${from}/`)) out.set(d, `${to}${d.slice(from.length)}`);
  return out;
}

/**
 * The plan for moving files (`moves`: vault paths, old → new): each link to a moved file rewritten
 * from where its file will be, each moved note's relative links to what stays put rewritten from
 * where it will be.
 */
function planMove(g: Graph, moves: Map<string, string>, head: Pick<RenamePlan, "kind" | "from" | "to" | "move">, folders = new Map<string, string>(), roots?: (c: Collector) => [string, string][]): RenamePlan {
  const c = new Collector(g);
  const abs = (rel: string) => join(g.root, rel);
  const mv = head.move;
  /** Where a file will be: its new place if it moves (a folder's, a root nested in it too), else where it is. */
  const after = (fileAbs: string) => {
    if (!isInside(g.root, fileAbs)) return fileAbs;
    const moved = moves.get(relative(g.root, fileAbs));
    if (moved) return abs(moved);
    return mv?.dir && fileAbs.startsWith(`${mv.from}/`) ? mv.to + fileAbs.slice(mv.from.length) : fileAbs;
  };
  for (const [fromRel, toRel] of moves) {
    const isNote = g.notes.has(fromRel);
    const entry: NoteEntry | undefined = isNote ? g.entry(fromRel) : undefined;
    const aliases = new Set((entry?.aliases ?? []).map(normKey));
    const oldName = posix.basename(fromRel).replace(NOTE_EXT, "");
    // Every link to it: this vault's and other vaults' (17.11).
    for (const b of g.backlinks(fromRel)) {
      const linking = isAbsolute(b.from) ? b.from : abs(b.from);
      const site: Site = { abs: linking, kind: b.kind, target: b.target, line: b.line, column: b.column };
      c.edit(site, retargetBacklink(g, b, linking, after(linking), fromRel, toRel, aliases, oldName), b.vault ?? null);
    }
    // Its own relative links to what stays put, from where it will be. Into a root nested here, every
    // link by a name or from the top too: they'd be read from that root (17.17, 21.3) — relative paths.
    const crosses = rootOfPath(abs(toRel)) !== real(g.root);
    if (!entry || (posix.dirname(fromRel) === posix.dirname(toRel) && !crosses)) continue;
    for (const l of entry.links) {
      const wikiLink = l.kind === "wiki" || l.kind === "embed";
      if (l.kind !== "markdown" && l.kind !== "image" && !(wikiLink && (crosses || /^\.\.?\//.test(l.target)))) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(l.target) || l.target.startsWith("#") || (l.target.startsWith("/") && !crosses) || l.target.startsWith("~/")) continue;
      const r = g.resolveLink(l, fromRel);
      if ((r.resolvedKind !== "note" && r.resolvedKind !== "file" && r.resolvedKind !== "folder") || !r.path) continue;
      if (!isAbsolute(r.path) && (moves.has(r.path) || folders.has(r.path))) continue; // moving too: rewritten as its backlink
      if (isAbsolute(r.path) && after(r.path) !== r.path) continue; // a root nested in the folder: moving with it
      const targetAbs = isAbsolute(r.path) ? r.path : abs(r.path);
      const site: Site = { abs: abs(fromRel), kind: l.kind, target: l.target, line: l.line, column: l.column };
      const wiki = l.kind === "wiki" || l.kind === "embed";
      // Out of the vault (17.16): a relative path from where the note will be.
      const next = wiki
        ? isAbsolute(r.path) || crosses
          ? formatPathLink("relative", targetAbs, abs(toRel), /\.[A-Za-z0-9]+$/.test(l.target))
          : wikiTarget(l.target, posix.dirname(toRel), r.path, g, "")
        : mdTarget(l.target, abs(toRel), targetAbs, crosses ? null : g);
      c.edit(site, next, null);
    }
  }
  // Links to a folder that moves (21.2): to where it goes, each in its form.
  for (const [fromDir, toDir] of folders) {
    for (const b of g.backlinks(fromDir)) {
      const linking = isAbsolute(b.from) ? b.from : abs(b.from);
      const site: Site = { abs: linking, kind: b.kind, target: b.target, line: b.line, column: b.column };
      const byPath = pathForm(b.target) ? pathRetarget(b.target, linking, after(linking), abs(fromDir), abs(toDir), false) : null;
      c.edit(site, byPath ?? mdTarget(b.target, after(linking), abs(toDir), g), null);
    }
  }
  const vaults = roots?.(c) ?? [];
  const files = c.result();
  const warnings = dirtyTrees([head.move!.from, ...files.map((f) => f.abs)]);
  return { ...head, moves: [...moves], ...(vaults.length ? { vaults } : {}), files, warnings, skipped: c.skipped };
}

/**
 * Plan moving or renaming the folder of a vault nested in `parent` (18.7). The vault moves whole —
 * the vaults nested in it too — and every link into it by path, from the parent and from the other
 * vaults this machine reaches, is rewritten, as are its notes' relative links out of it. Links within
 * what moves, and pointers (`slipbox://name/…`, 21.7), stay as they are: they name the same folder.
 */
export function planVaultFolderMove(parent: Graph, fromRel: string, toInput: string): RenamePlan {
  const from = posix.normalize(fromRel.replace(/\/+$/, ""));
  if (!parent.nestedRoots().includes(from)) throw new RenameError(`no vault nested at ${fromRel} in ${parent.root}`);
  const to = cleanTarget(parent, toInput);
  if (to === from) throw new RenameError(`${from} is already there`);
  if (to.startsWith(`${from}/`)) throw new RenameError(`${from} can't move into itself`);
  if (existsSync(join(parent.root, to)) && !sameFile(join(parent.root, from), join(parent.root, to))) throw new RenameError(`${to} exists; not overwriting it`);
  const fromAbs = join(parent.root, from);
  const toAbs = join(parent.root, to);
  const moving = (abs: string) => abs === fromAbs || abs.startsWith(`${fromAbs}/`);
  const shift = (abs: string) => (moving(abs) ? toAbs + abs.slice(fromAbs.length) : abs);
  const c = new Collector(parent);
  const vaults = nestedRootEdits(parent, c, fromAbs, moving, shift);
  const files = c.result();
  const warnings = dirtyTrees([fromAbs, ...files.map((f) => f.abs)]);
  return {
    kind: "folder",
    from,
    to,
    move: { from: fromAbs, to: toAbs, dir: true },
    moves: [],
    vaults,
    files,
    warnings,
    skipped: c.skipped,
  };
}

/**
 * The edits a root nested in `parent` at `rootAbs` needs when it moves (18.7), into `c`: the links into
 * it — the parent's and the other roots' this machine reaches — and its notes' relative links out of
 * it, each from where its file will be (`shift`); links within what moves (`moving`) stay as they are.
 * The roots that move, it and those nested in it, old → new.
 */
function nestedRootEdits(parent: Graph, c: Collector, rootAbs: string, moving: (abs: string) => boolean, shift: (abs: string) => string): [string, string][] {
  // Other vaults' links are read from their indexes: the parent's, fresh.
  parent.ensureAll();
  const graphs: Graph[] = [];
  const queue = [rootAbs];
  while (queue.length) {
    const g = openVault(queue.shift()!);
    graphs.push(g);
    for (const n of g.nestedRoots()) queue.push(join(g.root, n));
  }
  // The parent's own links into it, from its index in memory (a note moving with it keeps its link)…
  for (const l of linksIntoFolder(parent, rootAbs)) {
    if (moving(l.backlink.from)) continue;
    const next = retargetInto(l.backlink, l.targetAbs, shift(l.targetAbs));
    if (next !== null) c.edit({ abs: l.backlink.from, kind: l.backlink.kind, target: l.backlink.target, line: l.backlink.line, column: l.backlink.column }, next, null);
  }
  for (const g of graphs) {
    g.ensureAll();
    // …and other vaults', from theirs.
    for (const rel of [...g.notes.keys(), ...g.filePaths()]) {
      const targetAbs = join(g.root, rel);
      for (const b of g.backlinks(rel)) {
        // The parent's own links are rewritten above; a root nested beside this one has its own.
        if (!isAbsolute(b.from) || moving(b.from) || (isInside(parent.root, b.from) && real(findVaultRoot(b.from) ?? "") === real(parent.root))) continue;
        const next = retargetInto(b, targetAbs, shift(targetAbs));
        if (next !== null) c.edit({ abs: b.from, kind: b.kind, target: b.target, line: b.line, column: b.column }, next, b.vault ?? null);
      }
    }
    // Out of it, from where its notes will be.
    for (const [rel, entry] of g.notes) {
      const noteAbs = join(g.root, rel);
      for (const l of entry.links) {
        const wiki = l.kind === "wiki" || l.kind === "embed";
        if (wiki ? !/^\.\.?\//.test(l.target) : /^[a-z][a-z0-9+.-]*:/i.test(l.target) || /^[#/~]/.test(l.target)) continue;
        const r = g.resolveLink(l, rel);
        if ((r.resolvedKind !== "note" && r.resolvedKind !== "file") || !r.path || !isAbsolute(r.path) || moving(r.path)) continue;
        const next = wiki ? formatPathLink("relative", r.path, shift(noteAbs), /\.[A-Za-z0-9]+$/.test(l.target)) : mdTarget(l.target, shift(noteAbs), r.path, null);
        c.edit({ abs: noteAbs, kind: l.kind, target: l.target, line: l.line, column: l.column }, next, null);
      }
    }
  }
  return graphs.map((g) => [g.root, shift(g.root)]);
}

/** The links of `g`'s notes that reach into the folder at `folderAbs` (a vault nested in it), each as
 *  a backlink from its note (absolute), with the file it reaches. */
export function linksIntoFolder(g: Graph, folderAbs: string): { backlink: Backlink; targetAbs: string }[] {
  g.ensureAll();
  const out: { backlink: Backlink; targetAbs: string }[] = [];
  for (const [rel, entry] of g.notes) {
    for (const l of entry.links) {
      const r = g.resolveLink(l, rel);
      if ((r.resolvedKind !== "note" && r.resolvedKind !== "file") || !r.path || !isAbsolute(r.path)) continue;
      if (r.path !== folderAbs && !r.path.startsWith(`${folderAbs}/`)) continue;
      out.push({ backlink: { from: join(g.root, rel), line: l.line, column: l.column, end: l.end, text: l.text, kind: l.kind, target: l.target, heading: l.heading, block: l.block, alias: l.alias }, targetAbs: r.path });
    }
  }
  return out;
}

/** A link from another vault to a file of a moving vault, rewritten to where the file will be; null
 *  when it needs nothing (by the vault's name). */
function retargetInto(b: Backlink, oldAbs: string, newAbs: string): string | null {
  // A pointer names the folder, wherever it is (21.7): nothing to rewrite.
  if (isPointer(b.target)) return null;
  const wiki = b.kind === "wiki" || b.kind === "embed";
  if (pathForm(b.target)) {
    const byPath = pathRetarget(b.target, b.from, b.from, oldAbs, newAbs, wiki);
    if (byPath !== null) return byPath;
    // `/x.md`: the linking vault's root, kept so.
    if (!b.target.startsWith("/")) return null;
  }
  const linkRoot = findVaultRoot(b.from) ?? dirname(b.from);
  if (wiki) {
    // A vault path into a vault nested in the linking one (17.17): the new vault path.
    const ext = /\.[A-Za-z0-9]+$/.test(b.target) ? "" : NOTE_EXT;
    const p = relative(linkRoot, newAbs).split("\\").join("/");
    return (b.target.startsWith("/") ? "/" : "") + (ext ? p.replace(ext, "") : p);
  }
  if (b.target.startsWith("/")) {
    const hash = b.target.indexOf("#");
    return `/${relative(linkRoot, newAbs).split("\\").join("/")}${hash >= 0 ? b.target.slice(hash) : ""}`;
  }
  return mdTarget(b.target, b.from, newAbs, null);
}

/** The new target text of a link to a moved file, written in `linking` (which will be at `linkingAfter`). */
function retargetBacklink(g: Graph, b: Backlink, linking: string, linkingAfter: string, fromRel: string, toRel: string, aliases: Set<string>, oldName: string): string {
  const toAbs = join(g.root, toRel);
  const byPath = pathForm(b.target) ? pathRetarget(b.target, linking, linkingAfter, join(g.root, fromRel), toAbs, b.kind === "wiki" || b.kind === "embed") : null;
  if (byPath) return byPath;
  if (b.kind === "wiki" || b.kind === "embed") {
    const name = posix.basename(b.target).replace(NOTE_EXT, "");
    // Written as an alias: still right after the rename.
    if (!b.target.includes("/") && aliases.has(normKey(name)) && normKey(name) !== normKey(oldName)) return b.target;
    const fromDir = isInside(g.root, linkingAfter) ? posix.dirname(relative(g.root, linkingAfter)) : null;
    // Moved into a root nested here: a name ends at its boundary, a path from the top reaches in (17.17).
    return wikiTarget(b.target, fromDir, toRel, g, fromRel, rootOfPath(linkingAfter) !== rootOfPath(toAbs));
  }
  return mdTarget(b.target, linkingAfter, toAbs, isInside(g.root, linkingAfter) ? g : null);
}

/**
 * Plan naming a `.slipbox/` folder (17.15, 21.10: `slipbox name`): its config's `name` — the old one
 * kept in `previous_names`, so a pointer by it still finds the folder — or, never named, a name and an
 * id. Links are paths, or pointers by name (which the relink brings to the new one): nothing else changes.
 */
export function planVaultRename(loc: VaultLocation, newName: string): RenamePlan {
  if (loc.mode !== "vault" || !hasMarker(loc.root)) throw new RenameError(`${loc.root} has no .slipbox/ to hold a name: slipbox init --name gives it one`);
  if (!VAULT_NAME.test(newName)) throw new RenameError(`"${newName}" can't be a folder's name: letters, digits, ".", "_" and "-" only, no spaces, "/" or ":"`);
  const cfg = vaultConfigFile(loc.root);
  const have = readIdentity(cfg);
  const oldName = have.name;
  if (newName === oldName) throw new RenameError(`the folder is already called ${oldName}`);
  checkVaultName(newName, loc.root);
  const text = readText(cfg).text;
  // Named before: the new name, the old one kept. Never: a name, and an id to tell its copies apart.
  const id = oldName ? have.id : (have.id ?? newVaultId());
  const next = oldName ? renameInConfig(text, oldName, newName) : withIdentity(text, have, { id: id!, name: newName });
  // The edit is textual: read back, it must be the same folder by its new name, the old one kept —
  // else (a `[ vault ]` header, dotted `vault.name` keys) nothing is written. Never named too.
  if (!identityReadsBack(have, next, { id, name: newName, ...(oldName ? { previous: oldName } : {}) })) throw new RenameError(new IdentityEditError().message);
  const after = oldName ? `name = "${newName}" (previous_names + ${oldName})` : `name = "${newName}"`;
  const files: FileChange[] = [{ abs: cfg, shown: ".slipbox/config.toml", vault: null, edits: [{ line: 0, before: oldName ? `name = "${oldName}"` : "(no name)", after }], text, next }];
  return { kind: "vault", from: oldName ?? loc.root, to: newName, move: null, files, warnings: dirtyTrees([cfg]), skipped: [] };
}

/** `[vault] name` replaced, and the old name added to `previous_names`, as text. */
function renameInConfig(text: string, oldName: string, newName: string): string {
  const header = /^\[vault\][ \t]*(#.*)?$/m.exec(text);
  let t = text;
  if (!header) {
    if (t && !t.endsWith("\n")) t += "\n";
    return `${t}\n[vault]\nname = ${JSON.stringify(newName)}\nprevious_names = [${JSON.stringify(oldName)}]\n`;
  }
  const start = header.index + header[0].length;
  const nextTable = /^\[[^\]]+\][ \t]*(#.*)?$/m.exec(t.slice(start));
  const end = nextTable ? start + nextTable.index : t.length;
  let table = t.slice(start, end);
  const nameLine = /^name[ \t]*=.*$/m;
  table = nameLine.test(table) ? table.replace(nameLine, `name = ${JSON.stringify(newName)}`) : `\nname = ${JSON.stringify(newName)}${table}`;
  // On one line or several (as a formatter writes a long array), a comment after it or in it.
  const prev = /^previous_names[ \t]*=[ \t]*\[([\s\S]*?)\][ \t]*(#.*)?$/m.exec(table);
  if (prev) {
    const items = prev[1]!.split("\n").map((l) => l.replace(/#.*$/, "")).join(",").split(",").map((x) => x.trim()).filter(Boolean);
    if (!items.map((x) => x.replace(/^["']|["']$/g, "")).includes(oldName)) items.push(JSON.stringify(oldName));
    table = table.replace(prev[0], `previous_names = [${items.join(", ")}]${prev[2] ? ` ${prev[2]}` : ""}`);
  } else {
    const nl = table.endsWith("\n") ? "" : "\n";
    const at = table.search(/\n\s*$/);
    table = at >= 0 ? `${table.slice(0, at)}\nprevious_names = [${JSON.stringify(oldName)}]${table.slice(at)}` : `${table}${nl}previous_names = [${JSON.stringify(oldName)}]\n`;
  }
  return t.slice(0, start) + table + t.slice(end);
}

/**
 * Plan rewriting links that reach nothing but whose file was seen to move (17.12, 20.2), to its path
 * now; pointers by a folder's old name (21.10), to its name now; and paths into a named folder that
 * doesn't travel with this one, as pointers (21.7). In `rels`, or every note, which also fixes the
 * root's own last move (20.17).
 */
export function planRelink(g: Graph, rels?: string[], opts: { pointers?: boolean } = {}): RenamePlan {
  g.ensureAll();
  const c = new Collector(g);
  for (const rel of rels ?? [...g.notes.keys()]) {
    for (const l of g.linksOf(rel)) {
      // A path that reaches nothing, whose file was seen to move (20.2: evidence, not resolution).
      const to = g.movedTarget(l, rel);
      const abs = join(g.root, rel);
      const site: Site = { abs, kind: l.kind, target: l.target, line: l.line, column: l.column };
      if (to) {
        // Each in its own form: a wikilink's path a wikilink's (relative kept, `.md` only if written).
        const wiki = l.kind === "wiki" || l.kind === "embed";
        c.edit(site, wiki ? wikiTarget(l.target, posix.dirname(rel), to, g, "") : mdTarget(l.target, abs, join(g.root, to), g), null);
        continue;
      }
      // A pointer by a name its folder had (21.10, renamed with `slipbox name`): the name it has now.
      if (isPointer(l.target) && l.via === "old-name") {
        const p = parsePointer(l.target);
        const t = p ? resolvePointer(p) : null;
        if (p && t?.status === "found") {
          c.edit(site, l.target.replace(`slipbox://${p.name}`, `slipbox://${pointerName(t.folder)}`), null);
          continue;
        }
      }
      // A path into a named folder that doesn't travel with this one (21.7): its pointer.
      const ptr = opts.pointers === false ? null : pointerOffer(g, l, rel);
      if (ptr) c.edit(site, ptr, null);
    }
  }
  // The whole vault: the links its own move broke, too (20.17).
  const moved = rels ? null : lastMove(g);
  if (moved) vaultMoveFixes(g, moved, c);
  const files = c.result();
  return { kind: "relink", from: rels?.join(", ") ?? "every note", to: "", move: null, files, warnings: dirtyTrees(files.map((f) => f.abs)), skipped: c.skipped };
}

/**
 * A markdown link's path out of this root into a named folder that doesn't travel with it (21.7):
 * the pointer to write instead — for one that reaches the file, and for one broken where a copy of
 * that folder was (moved by hand). Only one that reaches the file now; the fragment kept.
 */
function pointerOffer(g: Graph, l: ResolvedLink, fromRel: string): string | null {
  if (l.kind !== "markdown" && l.kind !== "image") return null;
  const hash = l.target.indexOf("#");
  const path = hash >= 0 ? l.target.slice(0, hash) : l.target;
  const frag = hash >= 0 ? l.target.slice(hash) : "";
  if (!pathForm(path) || pathForm(path) === "file-url") return null;
  let abs: string | null = null;
  if ((l.resolvedKind === "note" || l.resolvedKind === "file" || l.resolvedKind === "folder") && l.path && isAbsolute(l.path)) abs = l.path;
  else if (l.resolvedKind === "unresolved" && pathForm(path) === "relative") {
    let decoded = path;
    try {
      decoded = decodeURIComponent(path);
    } catch {}
    abs = join(dirname(join(g.root, fromRel)), decoded);
  }
  if (!abs || isInside(g.root, abs)) return null;
  const folders = readFolders();
  // Its folder: the root holding it now; else a copy of a named folder that isn't here any more.
  const there = existsSync(abs) ? findVaultRoot(abs) : null;
  const ident = there ? folderIdentity(there) : null;
  let hit = ident && there ? { f: folders.find((x) => x.key === ident.key), root: there } : null;
  if (!hit?.f) {
    const was = folders.flatMap((f) => f.copies.filter((c) => !copyAvailable(c.path) && isInside(c.path, abs!)).map((c) => ({ f, root: c.path })))[0];
    hit = was ?? null;
  }
  // A named folder moved by hand, its state along (21.8): where it was, as its move was kept.
  for (const r of hit?.f ? [] : readRoots()) {
    const m = (r.moved ?? []).find((x) => !existsSync(x.from) && isInside(x.from, abs!));
    const id = m ? folderIdentity(r.path) : null;
    const f = id ? folders.find((x) => x.key === id.key) : undefined;
    if (m && f) {
      hit = { f, root: m.from };
      break;
    }
  }
  if (!hit?.f || travelTogether(g.root, hit.root)) return null;
  const p = { name: pointerName(hit.f, folders), branch: null, path: relative(hit.root, abs).split(sep).join("/"), fragment: null };
  const t = resolvePointer(p, folders);
  if (t.status !== "found" || !pathLink(t.abs, join(g.root, fromRel), false, undefined, true)) return null;
  return formatPointer(p, /%[0-9A-Fa-f]{2}/.test(path) || /\s/.test(p.path) ? encodeURI : undefined) + frag;
}

/** This vault's last confirmed move to where it is now (20.5), if it has one. */
function lastMove(g: Graph): string | null {
  const entry = readRoots().find((v) => v.kind === "vault" && v.key === g.loc.key);
  const m = entry?.moved?.filter((x) => x.to === g.root).at(-1);
  return m && m.from !== g.root ? m.from : null;
}

/**
 * The links a vault's move broke (20.17), fixed from what the state knows — where it was (`from`) and
 * is now — rather than guessed: its own links out of it by a path from where it was, now reaching
 * nothing, to where they reached from there; and the links into where it was, in the other vaults
 * this machine knows (as of their index), to where it is. Each in its own form (relative, `~/`,
 * absolute).
 */
function vaultMoveFixes(g: Graph, from: string, c: Collector): void {
  const to = g.root;
  const pathOf = (target: string) => {
    const p = target.split("#")[0]!;
    return p && !/^[a-z][a-z0-9+.-]*:/i.test(p) ? p : null;
  };
  // In its own form, reaching `abs` from `linking`: the fragment kept, encoded as written.
  const retarget = (written: string, form: PathForm, abs: string, linking: string) => {
    const hash = written.indexOf("#");
    const path = hash >= 0 ? written.slice(0, hash) : written;
    let next = formatPathLink(form, abs, linking, true);
    if (form !== "file-url" && (/%[0-9A-Fa-f]{2}/.test(path) || /\s/.test(next))) next = encodeURI(next);
    return next + (hash >= 0 ? written.slice(hash) : "");
  };
  for (const rel of g.notes.keys()) {
    for (const l of g.linksOf(rel)) {
      if ((l.kind !== "markdown" && l.kind !== "image") || !pathOf(l.target) || l.target.startsWith("/") || l.target.startsWith("~/")) continue;
      if (g.resolveLink(l, rel).resolvedKind !== "unresolved") continue;
      const was = pathNamed(pathOf(l.target)!, join(from, rel));
      if (!was || isInside(from, was.abs) || !existsSync(was.abs)) continue;
      c.edit({ abs: join(to, rel), kind: l.kind, target: l.target, line: l.line, column: l.column }, retarget(l.target, was.form, was.abs, join(to, rel)), null);
    }
  }
  for (const v of readRoots()) {
    if (v.kind !== "vault" || v.path === to || isInside(to, v.path) || !existsSync(v.path)) continue;
    const og = g.reach?.graphAt(v.path) ?? null;
    if (!og) continue;
    for (const rel of og.notes.keys()) {
      const linking = join(og.root, rel);
      for (const l of og.linksOf(rel)) {
        if ((l.kind !== "markdown" && l.kind !== "image") || !pathOf(l.target)) continue;
        const was = pathNamed(pathOf(l.target)!, linking);
        if (!was || !isInside(from, was.abs) || existsSync(was.abs)) continue;
        const now = join(to, relative(from, was.abs));
        if (!existsSync(now)) continue;
        c.edit({ abs: linking, kind: l.kind, target: l.target, line: l.line, column: l.column }, retarget(l.target, was.form, now, linking), g.reach?.vaultOf(og.root) ?? null);
      }
    }
  }
}

// -------------------------------------------------------------------------------------------
// A folder made a vault of its own, and a vault made a plain folder again (18.11)

/** Whether a markdown link's URL, read as a path — from the linking file's folder, or `rootAbs`
 *  for `/…` (or the filesystem's own `/…`) — reaches `targetAbs`. */
function urlReaches(url: string, linkingAbs: string, rootAbs: string, targetAbs: string): boolean {
  const path = safeDecode(url.split("#")[0]!);
  if (!path) return false;
  const abs = path.startsWith("/") ? join(rootAbs, path) : join(dirname(linkingAbs), path);
  if (abs === targetAbs || real(abs) === real(targetAbs)) return true;
  return path.startsWith("/") && real(path) === real(targetAbs);
}

/** A markdown link's URL rewritten to reach `targetAbs`: from `rootAbs` when written from a root, else relative. */
function urlTo(written: string, linkingAbs: string, rootAbs: string, targetAbs: string): string {
  if (!written.startsWith("/") || !isInside(rootAbs, targetAbs)) return mdTarget(written, linkingAbs, targetAbs, null);
  const hash = written.indexOf("#");
  const next = `/${relative(rootAbs, targetAbs).split(sep).join("/")}`;
  return (/%[0-9A-Fa-f]{2}/.test(written) || /\s/.test(next) ? encodeURI(next) : next) + (hash >= 0 ? written.slice(hash) : "");
}

/** A markdown link that names a web page, a place in the note, or a file by the filesystem's own path. */
function notARootPath(url: string): boolean {
  return (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^file:/i.test(url)) || /^file:/i.test(url) || url.startsWith("~/") || url.startsWith("#");
}

/**
 * Whether a wikilink written as a path (`[[docs/plan]]`, not `./`/`../` nor a name) reaches `targetAbs`
 * read from the root at `rootAbs` (21.3, 17.16): the file as written, else its note.
 */
function wikiPathReaches(written: string, rootAbs: string, targetAbs: string): boolean {
  const t = written.trim();
  if (!t.includes("/") || /^\.\.?\//.test(t)) return false;
  return wikiPathCandidates(join(rootAbs, t.replace(/^\/+/, ""))).some((c) => c === targetAbs || (existsSync(c) && real(c) === real(targetAbs)));
}

/**
 * A wikilink's target rewritten to reach `targetAbs` from `linkingAbs`, read in the root `rootAbs`: its
 * path from that root when it's in it and that path is one (it has a `/` — a top-level note's is a name),
 * else a relative path. `.md` only where it was written; another file's extension always.
 */
function wikiTo(written: string, linkingAbs: string, rootAbs: string, targetAbs: string): string {
  const fromRoot = relative(rootAbs, targetAbs).split(sep).join("/");
  const next = !climbsOut(fromRoot) && !isAbsolute(fromRoot) && fromRoot.includes("/") ? fromRoot : formatPathLink("relative", targetAbs, linkingAbs, true);
  return NOTE_EXT.test(written) || !NOTE_EXT.test(targetAbs) ? next : next.replace(NOTE_EXT, "");
}

/** The names a wikilink reaches files by (21.3): a note's without its extension, any other file's whole, case-folded. */
function wikiNameKey(path: string): string {
  const b = posix.basename(path);
  return normKey(NOTE_EXT.test(b) ? b.replace(NOTE_EXT, "") : b);
}

/** Normalized folder path as typed, inside the vault. */
function folderPath(g: Graph, folderRel: string): string {
  const f = posix.normalize(folderRel.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, ""));
  if (!f || f === "." || f === ".." || f.startsWith("../")) throw new RenameError(`${folderRel} isn't a folder inside ${g.root}`);
  return f;
}

/**
 * Plan giving the folder `folderRel` of `parent` a `.slipbox/` of its own — a root, named `name` when
 * one is given (18.11, 21.10). Links are paths (20.2): relative, or the filesystem's own, they reach
 * across the new boundary as they are; one that wouldn't is rewritten to reach what it did.
 */
export function planMakeVault(parent: Graph, folderRel: string, name: string | null, opts: { private?: boolean } = {}): RenamePlan {
  if (parent.loc.mode !== "vault") throw new RenameError(`${parent.root} isn't a vault: make it one first (slipbox init)`);
  const F = folderPath(parent, folderRel);
  if (parent.nestedRoots().includes(F)) throw new RenameError(`${F} is already a vault`);
  if (!parent.dirs.includes(F)) throw new RenameError(`no folder ${F} in ${parent.root}`);
  if (F.split("/").some((s) => s.startsWith("."))) throw new RenameError(`${F}: hidden folders aren't the vault's`);
  if (name !== null) checkVaultName(name);
  const Fabs = join(parent.root, F);
  const inF = (rel: string) => rel.startsWith(`${F}/`);
  parent.ensureAll();
  const c = new Collector(parent);
  for (const [rel, entry] of parent.notes) {
    const linkingAbs = join(parent.root, rel);
    const fromIn = inF(rel);
    for (const l of entry.links) {
      const wiki = l.kind === "wiki" || l.kind === "embed";
      if (l.kind !== "markdown" && l.kind !== "image" && !wiki) continue;
      const r = parent.resolveLink(l, rel);
      if ((r.resolvedKind !== "note" && r.resolvedKind !== "file") || !r.path) continue;
      const targetAbs = isAbsolute(r.path) ? r.path : join(parent.root, r.path);
      if (!isInside(parent.root, targetAbs)) continue; // elsewhere: this changes nothing about it
      const toIn = inF(relative(parent.root, targetAbs).split(sep).join("/"));
      if (!fromIn && !toIn) continue;
      const rootAfter = fromIn ? Fabs : parent.root;
      const site = { abs: linkingAbs, kind: l.kind, target: l.target, line: l.line, column: l.column };
      if (wiki) {
        // A wikilink (21.3): a relative path reaches as it did; a name ends at F's boundary — kept
        // only within it — and a path is read from the root it's in now.
        const t = l.target.trim();
        if (/^\.\.?\//.test(t)) continue;
        const reaches = t.includes("/") ? wikiPathReaches(t, rootAfter, targetAbs) : fromIn && toIn;
        if (!reaches) c.edit(site, wikiTo(l.target, linkingAbs, rootAfter, targetAbs), null);
        continue;
      }
      if (notARootPath(l.target)) continue;
      if (!urlReaches(l.target, linkingAbs, rootAfter, targetAbs)) c.edit(site, urlTo(l.target, linkingAbs, rootAfter, targetAbs), null);
    }
  }
  const files = c.result();
  return { kind: "make-vault", from: F, to: name ?? F, move: null, files, warnings: dirtyTrees([Fabs, ...files.map((f) => f.abs)]), skipped: c.skipped, makeVault: { root: Fabs, name, private: !!opts.private } };
}

/** A folder's new name: one a pointer can carry, and no different folder's on this machine (21.6). */
function checkVaultName(name: string, except?: string): void {
  if (!VAULT_NAME.test(name)) throw new RenameError(`"${name}" can't be a folder's name: letters, digits, ".", "_" and "-" only, no spaces, "/" or ":"`);
  const other = folderNamed(name, except);
  if (other.length) throw new RenameError(`a different folder is called "${name}", at ${other[0]!.default ?? other[0]!.copies[0]?.path}`);
}

/**
 * Plan making the vault nested at `folderRel` a plain folder of `parent` (18.11): its notes become
 * the parent's. Links are paths (20.2): they reach as they did, but for one that wouldn't, rewritten.
 * Its `.slipbox/` goes to the parent's trash, and the machine forgets the vault.
 */
export function planUnmakeVault(parent: Graph, folderRel: string): RenamePlan {
  const F = folderPath(parent, folderRel);
  if (!parent.nestedRoots().includes(F)) throw new RenameError(`no vault nested at ${F} in ${parent.root}`);
  const Vabs = join(parent.root, F);
  // A git checkout is a vault by itself (20.3): without its .slipbox/ it would be one still.
  const others = markersAt(Vabs).filter((m) => m !== ".slipbox");
  if (others.length) throw new RenameError(`${F} is a root by its ${others.join(", ")} too: it stays one, with or without .slipbox/`);
  const v = openVault(Vabs);
  v.ensureAll();
  parent.ensureAll();
  const P = parent.loc.name ?? parent.root;
  const c = new Collector(parent);
  // The names a wikilink reaches once its notes are the parent's: how many files answer to each.
  const named = new Map<string, number>();
  for (const p of [...parent.notes.keys(), ...parent.filePaths(), ...[...v.notes.keys(), ...v.filePaths()].map((x) => `${F}/${x}`)]) {
    const k = wikiNameKey(p);
    named.set(k, (named.get(k) ?? 0) + 1);
  }
  // Its own links within it.
  for (const [vr, e] of v.notes) {
    const linkingAbs = join(Vabs, vr);
    for (const l of e.links) {
      const wiki = l.kind === "wiki" || l.kind === "embed";
      if ((l.kind !== "markdown" && l.kind !== "image" && !wiki) || (!wiki && notARootPath(l.target))) continue;
      const r = v.resolveLink(l, vr);
      if ((r.resolvedKind !== "note" && r.resolvedKind !== "file") || !r.path) continue;
      const targetAbs = isAbsolute(r.path) ? r.path : join(Vabs, r.path);
      if (!isInside(Vabs, targetAbs)) continue; // out of it: a path reaches the same
      const site = { abs: linkingAbs, kind: l.kind, target: l.target, line: l.line, column: l.column };
      if (wiki) {
        // A wikilink (21.3): a relative path reaches as it did; a path is read from the parent's root
        // now; a name stays one only while no other file of the parent answers to it.
        const t = l.target.trim();
        if (/^\.\.?\//.test(t)) continue;
        const reaches = t.includes("/") ? wikiPathReaches(t, parent.root, targetAbs) : r.via === "alias" || (named.get(wikiNameKey(targetAbs)) ?? 0) <= 1;
        if (!reaches) c.edit(site, wikiTo(l.target, linkingAbs, parent.root, targetAbs), null);
        continue;
      }
      if (!urlReaches(l.target, linkingAbs, parent.root, targetAbs)) c.edit(site, urlTo(l.target, linkingAbs, parent.root, targetAbs), null);
    }
  }
  // The parent's names: one its notes share with a note of the vault would land on either — a path.
  const vNamed = new Set([...v.notes.keys(), ...v.filePaths()].map(wikiNameKey));
  for (const [rel, e] of parent.notes) {
    for (const l of e.links) {
      if ((l.kind !== "wiki" && l.kind !== "embed") || l.target.includes("/") || !l.target.trim()) continue;
      const r = parent.resolveLink(l, rel);
      if ((r.resolvedKind !== "note" && r.resolvedKind !== "file") || !r.path || isAbsolute(r.path) || r.via === "alias") continue;
      if (!vNamed.has(wikiNameKey(r.path))) continue;
      const linkingAbs = join(parent.root, rel);
      c.edit({ abs: linkingAbs, kind: l.kind, target: l.target, line: l.line, column: l.column }, wikiTo(l.target, linkingAbs, parent.root, join(parent.root, r.path)), null);
    }
  }
  const out = c.result();
  const warnings = dirtyTrees([Vabs, ...out.map((f) => f.abs)]);
  // Settings of its own go with its .slipbox/.
  let config = "";
  try {
    config = readText(vaultConfigFile(Vabs)).text;
  } catch {}
  const tables = [...config.matchAll(/^\[([^\]]+)\][ \t]*(#.*)?$/gm)].map((m) => m[1]!.trim()).filter((t) => t !== "vault");
  if (tables.length) warnings.push(`${F}/.slipbox/config.toml has settings of its own (${tables.map((t) => `[${t}]`).join(", ")}): they go with its .slipbox/ to the trash`);
  return { kind: "unmake-vault", from: F, to: P, move: null, files: out, warnings, skipped: c.skipped, unmakeVault: { root: Vabs, name: v.loc.name ?? basename(Vabs) } };
}

// -------------------------------------------------------------------------------------------
// Undoing (7.4)

/** The vault's renames that can be undone here — made on this branch — newest last (its log). */
export function loggedRenames(g: Graph): LoggedRename[] {
  const branch = g.branchNow();
  return readRenames(g.loc).filter((x) => x.branch === undefined || x.branch === branch);
}

/**
 * Undo the vault's last rename, move or relink (7.4): the newest in its log, as a plan of its own —
 * each file it rewrote given back the text it had, what moved moved back — so it's previewed and
 * carried out as a rename is, and the index, redirects and open notes follow it the same way.
 * Refused when a file it wrote has changed since, or what moved isn't where it went.
 */
export function planUndo(g: Graph): RenamePlan {
  // The newest made on this branch (5.9): one made on another is that branch's to undo.
  const all = readRenames(g.loc);
  const branch = g.branchNow();
  const r = all.filter((x) => x.branch === undefined || x.branch === branch).at(-1);
  if (!r) {
    const other = all.at(-1);
    if (other) throw new RenameError(`nothing to undo on ${branch ? `branch ${branch}` : "this checkout"}: the last rename was made on ${other.branch ? `branch ${other.branch}` : "a detached HEAD"}`);
    throw new RenameError("nothing to undo: no rename, move or relink has been done in this vault");
  }
  const what = r.kind === "relink" ? "relink" : r.kind === "convert" ? "conversion to path links" : r.kind === "folder" ? `move of ${r.from}/` : r.kind === "vault" ? `folder's naming as ${r.to}` : `rename of ${r.from}`;
  const files: FileChange[] = [];
  for (const f of r.files) {
    let now: string;
    try {
      now = readText(f.abs).text;
    } catch {
      throw new RenameError(`${f.shown} isn't there any more: the ${what} can't be undone`);
    }
    if (contentHash(now) !== f.hash) throw new RenameError(`${f.shown} has changed since: the ${what} can't be undone`);
    const edits = f.edits.map((e) => ({ line: e.line, before: e.after, after: e.before }));
    files.push({ abs: f.abs, shown: f.shown, vault: f.vault, edits, text: now, next: now.slice(0, f.at) + f.was + now.slice(f.at + f.length) });
  }
  const move = r.move ? { from: r.move.to, to: r.move.from, dir: r.move.dir } : null;
  if (move && !existsSync(move.from)) throw new RenameError(`${relative(g.root, move.from)} isn't there any more: the ${what} can't be undone`);
  if (move && existsSync(move.to) && !sameFile(move.from, move.to)) throw new RenameError(`${relative(g.root, move.to)} exists again: the ${what} can't be undone`);
  const back = (pairs: [string, string][]) => pairs.map(([a, b]): [string, string] => [b, a]);
  const warnings = dirtyTrees(files.map((f) => f.abs));
  return { kind: r.kind, from: r.to, to: r.from, move, moves: back(r.moves), vaults: back(r.vaults), files, warnings, skipped: [], undo: { id: r.id, at: r.at, made: r.made ?? null } };
}

// -------------------------------------------------------------------------------------------
// Applying

export interface Applied {
  written: string[];
  moved: { from: string; to: string } | null;
}

/**
 * Carry a plan out: every file it touches still as it was planned from (else nothing is written),
 * then the edits, then the move. The vault's index and redirects follow.
 */
export function applyPlan(g: Graph, plan: RenamePlan): Applied {
  for (const f of plan.files) {
    let now: string;
    try {
      now = readText(f.abs).text;
    } catch {
      throw new RenameError(`${f.shown} can't be read any more; nothing changed`);
    }
    if (contentHash(now) !== contentHash(f.text)) throw new RenameError(`${f.shown} changed since the preview; nothing changed — plan again`);
  }
  const mv = plan.move;
  if (mv && existsSync(mv.to) && !sameFile(mv.from, mv.to)) throw new RenameError(`${mv.to} exists now; nothing changed`);
  /** Where a file of the plan is written: at its new place when it moves. */
  const dest = (fileAbs: string) => {
    if (!mv) return fileAbs;
    if (fileAbs === mv.from) return mv.to;
    return mv.dir && fileAbs.startsWith(`${mv.from}/`) ? mv.to + fileAbs.slice(mv.from.length) : fileAbs;
  };
  const written: string[] = [];
  /** The first folder the move made to hold it, if it made any: an undo takes it away again, empty. */
  let made: string | null = null;
  // A folder moves whole — everything in it, whatever the walk lists — before its files' edits. A
  // file's folder is made first too: if it can't be (a file is in the way), nothing is written.
  if (mv?.dir) {
    made = mkdirSync(dirname(mv.to), { recursive: true }) ?? null;
    renameSync(mv.from, mv.to);
  }
  /** A case-only rename on a case-insensitive disk: the file written at its new name is the old one. */
  const oneFile = !!mv && !mv.dir && sameFile(mv.from, mv.to);
  if (mv && !mv.dir) {
    try {
      made = mkdirSync(dirname(mv.to), { recursive: true }) ?? null;
    } catch (err) {
      throw new RenameError(`${dirname(mv.to)} can't be made (${(err as NodeJS.ErrnoException).code ?? err}); nothing changed`);
    }
  }
  for (const f of plan.files) {
    if (mv && !mv.dir && f.abs === mv.from) continue; // written at its new place, below
    atomicWrite(dest(f.abs), f.next);
    written.push(dest(f.abs));
  }
  if (mv && !mv.dir) {
    const own = plan.files.find((f) => f.abs === mv.from);
    if (own) {
      atomicWrite(mv.to, own.next);
      if (!oneFile) unlinkSync(mv.from);
    } else renameSync(mv.from, mv.to);
    written.push(mv.to);
  }
  // A folder made a vault, or a vault a plain folder (18.11): its .slipbox/ made, or put in the
  // trash; the parent's walk, and so its index, changes where the boundary was.
  // Other vaults' files written: their indexes learn it now, as when they're next opened — the
  // backlinks they give, and the next plan, read the links they hold now.
  const others = new Set<string>();
  for (const abs of written) {
    const root = findVaultRoot(abs);
    if (root && real(root) !== real(g.root)) others.add(root);
  }
  const reindexOthers = () => {
    for (const root of others) {
      try {
        openVault(root).ensureAll();
      } catch {}
    }
  };
  if (plan.makeVault || plan.unmakeVault) {
    if (plan.makeVault) initVault(plan.makeVault.root, plan.makeVault.name ?? undefined, { private: plan.makeVault.private });
    else {
      trashVaultMarker(g.loc, g.root, plan.unmakeVault!.root);
      forgetRoot(plan.unmakeVault!.root);
      recordFolder(plan.unmakeVault!.root); // its name gone with its .slipbox/ (21.6)
    }
    g.build(true, "lazy");
    reindexOthers();
    return { written, moved: null };
  }
  reindexOthers();
  // The vault's log (7.4): a rename carried out is logged, so it can be undone; an undo, forgotten.
  if (plan.undo) {
    forgetRename(g.loc, plan.undo.id);
    // The folders the rename made to hold what moved, if they're empty now.
    const gone: string[] = [];
    for (let d = mv ? dirname(mv.from) : null; plan.undo.made && d && isInside(plan.undo.made, d); d = dirname(d)) {
      try {
        rmdirSync(d);
        gone.push(relative(g.root, d));
      } catch {
        break;
      }
    }
    if (gone.length) g.dirs = g.dirs.filter((x) => !gone.includes(x));
  } else if ((plan.files.length || mv) && (plan.kind === "note" || plan.kind === "folder" || plan.kind === "vault" || plan.kind === "relink" || plan.kind === "heading" || plan.kind === "convert")) {
    // Only one that changed something: an empty one would stand in front of the last real one, and
    // an undo would take back nothing.
    logRename(g.loc, {
      id: randomUUID(),
      at: new Date().toISOString(),
      kind: plan.kind,
      from: plan.from,
      to: plan.to,
      move: mv,
      made,
      branch: g.branchNow(),
      moves: plan.moves ?? [],
      vaults: plan.vaults ?? [],
      files: plan.files.map((f) => ({ abs: dest(f.abs), shown: f.shown, vault: f.vault, edits: f.edits, hash: contentHash(f.next), ...changedSpan(f.text, f.next) })),
    });
  }
  // Links to the old places still find the new ones (17.12); the vault's index follows.
  if (plan.moves?.length) {
    g.redirects?.add(plan.moves);
    g.moved(plan.moves);
  }
  for (const [from] of plan.moves ?? []) {
    if (g.notes.has(from)) g.removeFile(from);
    else g.removeAsset(from);
  }
  const touched = new Set([...written, ...(plan.moves ?? []).map(([, to]) => join(g.root, to))]);
  for (const abs of touched) {
    if (!isInside(g.root, abs)) continue;
    // A moved vault's files are its own, not this vault's (18.7); so are a nested root's (17.17),
    // reindexed with the others.
    if (plan.vaults?.some(([, to]) => abs === to || abs.startsWith(`${to}/`))) continue;
    const own = findVaultRoot(abs);
    if (own && real(own) !== real(g.root)) continue;
    const rel = relative(g.root, abs);
    // What the walk leaves out (`.slipbox/config.toml`, a naming's) isn't one of the root's files —
    // unless a link reached it (20.8).
    const key = rel.split(sep).join("/");
    if (walkSkips(key) && !g.notes.has(key) && !g.reached.has(key)) continue;
    try {
      const st = statSync(abs);
      if (classify(rel, g.config.walk.extensions).group === "note") g.updateFile(rel, { rel, abs, size: st.size, mtimeMs: st.mtimeMs });
      else g.addAsset(rel);
    } catch {}
  }
  // A plain folder's (one holding a root nested in it, too), not a root's own folder.
  if (mv?.dir && !plan.vaults?.some(([from]) => from === mv.from)) {
    const from = relative(g.root, mv.from);
    const to = relative(g.root, mv.to);
    g.dirs = [...new Set(g.dirs.map((d) => (d === from || d.startsWith(`${from}/`) ? to + d.slice(from.length) : d)).concat(to.split("/").map((_, i, a) => a.slice(0, i + 1).join("/"))))];
  }
  return { written, moved: mv ? { from: mv.from, to: mv.to } : null };
}

// -------------------------------------------------------------------------------------------
// A heading renamed (11.9)

/** Whether a link's `#fragment` names a heading: by its text (any case) or its slug. */
function namesHeading(fragment: string, text: string): boolean {
  return normKey(fragment.trim()) === normKey(text) || normKey(slugify(fragment)) === normKey(slugify(text));
}

/**
 * The heading on line `n` (1-based) of `lines`, its text now `next`: an ATX heading (`## Goals ##`)
 * or a setext one (`Goals` over a `---` or `===` underline), its indent, its explicit id (`{#g}`) and
 * its closing hashes or underline kept. Null when line `n` isn't a heading's.
 */
function headingLine(lines: string[], n: number, next: string): string | null {
  const line = lines[n - 1]?.replace(/\r$/, "");
  if (line === undefined) return null;
  const id = "([ \\t]*\\{#[^\\s{}#]+(?:\\s[^{}]*)?\\})?";
  const atx = new RegExp(`^(\\s{0,3}#{1,6}[ \\t]+)(.*?)${id}([ \\t]+#+[ \\t]*)?$`).exec(line);
  if (atx) return `${atx[1]}${next}${atx[3] ?? ""}${atx[4] ?? ""}`;
  const under = lines[n]?.replace(/\r$/, "");
  if (under === undefined || !/^ {0,3}(=+|-+)[ \t]*$/.test(under) || !line.trim()) return null;
  const setext = new RegExp(`^( {0,3})(.*?)${id}([ \\t]*)$`).exec(line);
  return setext ? `${setext[1]}${next}${setext[3] ?? ""}${setext[4] ?? ""}` : null;
}

/**
 * A link's `#heading` rewritten on a line at its site: in `[[target#Heading|text]]` the heading part,
 * in `[x](path#fragment)` the fragment — kept in its form, the slug (`#new-name`) or the text
 * (`#New%20Name`). The link nearest the site's column; null when it isn't there any more.
 */
function retitle(line: string, site: Site, old: string, next: string): string | null {
  const col = Math.max(0, site.column - 1);
  const hits: { at: number; from: number; to: number; put: string }[] = [];
  if (site.kind === "wiki" || site.kind === "embed") {
    for (let open = line.indexOf("[["); open >= 0; open = line.indexOf("[[", open + 2)) {
      const close = line.indexOf("]]", open + 2);
      if (close < 0) break;
      const inner = line.slice(open + 2, close);
      const hash = inner.indexOf("#");
      const bar = inner.search(/\\?\|/);
      if (hash < 0 || (bar >= 0 && bar < hash) || inner.slice(0, hash).trim() !== site.target) continue;
      const end = bar >= 0 ? bar : inner.length;
      const frag = inner.slice(hash + 1, end);
      if (!namesHeading(frag, old)) continue;
      hits.push({ at: open > 0 && line[open - 1] === "!" ? open - 1 : open, from: open + 3 + hash, to: open + 2 + end, put: next });
    }
  } else {
    for (const m of line.matchAll(/\]\(\s*(<[^>\n]*>|[^)\s]*)/g)) {
      const raw = m[1]!;
      const angled = raw.startsWith("<");
      const url = angled ? raw.slice(1, -1) : raw;
      if (url !== site.target && safeDecode(url) !== site.target) continue;
      const hash = url.indexOf("#");
      if (hash < 0) continue;
      const frag = url.slice(hash + 1);
      const decoded = safeDecode(frag);
      if (!namesHeading(decoded, old)) continue;
      // Written as the heading's text (`#My%20Heading`), it stays text; else the slug.
      const asText = decoded.toLowerCase() === old.toLowerCase() && decoded !== slugify(old);
      const put = asText ? (angled ? next : next.replace(/ /g, "%20")) : slugify(next);
      const start = m.index + m[0].length - raw.length + (angled ? 1 : 0) + hash + 1;
      const open = line.lastIndexOf("[", m.index);
      hits.push({ at: open > 0 && line[open - 1] === "!" ? open - 1 : open, from: start, to: start + frag.length, put });
    }
  }
  const hit = hits.sort((a, b) => Math.abs(a.at - col) - Math.abs(b.at - col))[0];
  return hit ? line.slice(0, hit.from) + hit.put + line.slice(hit.to) : null;
}

/**
 * Plan renaming a heading of a note (11.9): its line, and every link to it — `[[note#Heading]]`,
 * `![[note#Heading]]`, `[x](note.md#heading)`, the note's own `[[#Heading]]` and `[x](#heading)` — in
 * this vault and the others reached. Refused when two of its headings share the name (a link can't
 * tell them apart), or another heading has the new one.
 */
export function planHeadingRename(g: Graph, rel: string, heading: string, toText: string): RenamePlan {
  const entry = g.entry(rel);
  if (!entry) throw new RenameError(`no note ${rel} in ${g.root}`);
  const h = entry.headings.find((x) => namesHeading(heading, x.text));
  if (!h) throw new RenameError(`no heading "${heading}" in ${rel}`);
  const next = toText.trim();
  if (!next) throw new RenameError("a heading needs a name");
  if (entry.headings.some((x) => x !== h && slugify(x.text) === slugify(h.text))) throw new RenameError(`${rel} has two headings "${h.text}": links can't tell them apart`);
  if (next === h.text) throw new RenameError(`the heading is "${next}" already`);
  if (entry.headings.some((x) => x !== h && slugify(x.text) === slugify(next))) throw new RenameError(`${rel} has a heading "${next}" already`);
  const c = new Collector(g);
  const own = join(g.root, rel);
  // The heading itself first: when it can't be rewritten, nothing is — its links renamed alone would break.
  const text = c.file(own, null)?.text;
  if (text === undefined) throw new RenameError(`${rel} can't be read`);
  const retitled = headingLine(text.split("\n"), h.line, next);
  if (retitled === null) throw new RenameError(`the heading "${h.text}" isn't on line ${h.line} of ${rel} any more (its index is older than the file): nothing renamed`);
  c.line(own, null, h.line, () => retitled, "the heading isn't on its line any more");
  const fragment = (l: { kind: LinkKind; target: string; heading: string | null }) => {
    if (l.kind === "wiki" || l.kind === "embed") return l.heading;
    const i = l.target.indexOf("#");
    return i < 0 ? null : safeDecode(l.target.slice(i + 1));
  };
  const site = (abs: string, l: { kind: LinkKind; target: string; line: number; column: number }) => ({ abs, kind: l.kind, target: l.target, line: l.line, column: l.column });
  for (const b of g.backlinks(rel)) {
    const f = fragment(b);
    if (f === null || !namesHeading(f, h.text)) continue;
    const abs = isAbsolute(b.from) ? b.from : join(g.root, b.from);
    c.line(abs, b.vault ?? null, b.line, (line) => retitle(line, site(abs, b), h.text, next), "no link to the heading there any more");
  }
  // Its own links to it: by an anchor alone, or by its own path or name (backlinks leave a note's links to itself out).
  const self = (r: Pick<ResolvedLink, "resolvedKind" | "path">) => r.resolvedKind === "anchor" || (r.resolvedKind === "note" && !!r.path && (r.path === rel || r.path === own));
  for (const l of entry.links) {
    const f = fragment(l);
    if (f === null || !namesHeading(f, h.text) || !self(g.resolveLink(l, rel))) continue;
    c.line(own, null, l.line, (line) => retitle(line, site(own, l), h.text, next), "no link to the heading there any more");
  }
  const files = c.result();
  return { kind: "heading", from: `${rel}#${h.text}`, to: `${rel}#${next}`, move: null, files, warnings: dirtyTrees(files.map((f) => f.abs)), skipped: c.skipped };
}
