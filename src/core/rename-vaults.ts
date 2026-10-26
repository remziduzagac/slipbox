// A folder named (17.15, 21.10: `slipbox name`), made a vault of its own, and a vault made a plain folder again
// (18.11), as plans: its `.slipbox/` config's text, and the links that would stop reaching across the new boundary.

import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { climbsOut, readText } from "./foundation/platform/fsutil.ts";
import type { Graph, LinkRef } from "./workspace/graph/graph.ts";
import { formatPathLink, normKey, wikiPathCandidates } from "./workspace/links/links.ts";
import {
  IdentityEditError,
  identityReadsBack,
  newVaultId,
  readIdentity,
  VAULT_NAME,
  vaultConfigFile,
  withIdentity,
} from "./workspace/vaults/registry.ts";
import { openVault, Reach } from "./workspace/links/reach.ts";
import {
  folderIdentity,
  folderNamed,
  lookupFolder,
  pointerName,
  readFolders,
  travelTogether,
} from "./workspace/vaults/folders.ts";
import { formatPointer, isPointer, parsePointer } from "./workspace/links/pointer.ts";
import { findVaultRoot, hasMarker, isInside, markersAt, type VaultLocation } from "./workspace/vaults/vault.ts";
import { RenameError, type FileChange, type RenamePlan, shownFor, Collector, dirtyTrees } from "./rename-plan.ts";
import { type Site, NOTE_EXT, real, mdTarget, safeDecode } from "./rename-links.ts";

/**
 * Plan naming a `.slipbox/` folder (17.15, 21.10: `slipbox name`): its config's `name` — the old one
 * kept in `previous_names`, so a pointer by it still finds the folder — or, never named, a name and an
 * id. Links are paths, or pointers by name (which the relink brings to the new one): nothing else changes.
 */
export function planVaultRename(loc: VaultLocation, newName: string): RenamePlan {
  if (loc.mode !== "vault" || !hasMarker(loc.root))
    throw new RenameError(`${loc.root} has no .slipbox/ to hold a name: slipbox init --name gives it one`);
  if (!VAULT_NAME.test(newName))
    throw new RenameError(
      `"${newName}" can't be a folder's name: letters, digits, ".", "_" and "-" only, no spaces, "/" or ":"`,
    );
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
  if (!identityReadsBack(have, next, { id, name: newName, ...(oldName ? { previous: oldName } : {}) }))
    throw new RenameError(new IdentityEditError().message);
  const after = oldName ? `name = "${newName}" (previous_names + ${oldName})` : `name = "${newName}"`;
  const files: FileChange[] = [
    {
      abs: cfg,
      shown: ".slipbox/config.toml",
      vault: null,
      edits: [{ line: 0, before: oldName ? `name = "${oldName}"` : "(no name)", after }],
      text,
      next,
    },
  ];
  return {
    kind: "vault",
    from: oldName ?? loc.root,
    to: newName,
    move: null,
    files,
    warnings: dirtyTrees([cfg]),
    skipped: [],
  };
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
  table = nameLine.test(table)
    ? table.replace(nameLine, `name = ${JSON.stringify(newName)}`)
    : `\nname = ${JSON.stringify(newName)}${table}`;
  // On one line or several (as a formatter writes a long array), a comment after it or in it.
  const prev = /^previous_names[ \t]*=[ \t]*\[([\s\S]*?)\][ \t]*(#.*)?$/m.exec(table);
  if (prev) {
    const items = prev[1]!
      .split("\n")
      .map((l) => l.replace(/#.*$/, ""))
      .join(",")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!items.map((x) => x.replace(/^["']|["']$/g, "")).includes(oldName)) items.push(JSON.stringify(oldName));
    table = table.replace(prev[0], `previous_names = [${items.join(", ")}]${prev[2] ? ` ${prev[2]}` : ""}`);
  } else {
    const nl = table.endsWith("\n") ? "" : "\n";
    const at = table.search(/\n\s*$/);
    table =
      at >= 0
        ? `${table.slice(0, at)}\nprevious_names = [${JSON.stringify(oldName)}]${table.slice(at)}`
        : `${table}${nl}previous_names = [${JSON.stringify(oldName)}]\n`;
  }
  return t.slice(0, start) + table + t.slice(end);
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
  return (
    (/%[0-9A-Fa-f]{2}/.test(written) || /\s/.test(next) ? encodeURI(next) : next) +
    (hash >= 0 ? written.slice(hash) : "")
  );
}

/** A markdown link that names a web page, a place in the note, or a file by the filesystem's own path. */
function notARootPath(url: string): boolean {
  return (
    (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^file:/i.test(url)) ||
    /^file:/i.test(url) ||
    url.startsWith("~/") ||
    url.startsWith("#")
  );
}

/**
 * Whether a wikilink written as a path (`[[docs/plan]]`, not `./`/`../` nor a name) reaches `targetAbs`
 * read from the root at `rootAbs` (21.3, 17.16): the file as written, else its note.
 */
function wikiPathReaches(written: string, rootAbs: string, targetAbs: string): boolean {
  const t = written.trim();
  if (!t.includes("/") || /^\.\.?\//.test(t)) return false;
  return wikiPathCandidates(join(rootAbs, t.replace(/^\/+/, ""))).some(
    (c) => c === targetAbs || (existsSync(c) && real(c) === real(targetAbs)),
  );
}

/**
 * A wikilink's target rewritten to reach `targetAbs` from `linkingAbs`, read in the root `rootAbs`: its
 * path from that root when it's in it and that path is one (it has a `/` — a top-level note's is a name),
 * else a relative path. `.md` only where it was written; another file's extension always.
 */
function wikiTo(written: string, linkingAbs: string, rootAbs: string, targetAbs: string): string {
  const fromRoot = relative(rootAbs, targetAbs).split(sep).join("/");
  const next =
    !climbsOut(fromRoot) && !isAbsolute(fromRoot) && fromRoot.includes("/")
      ? fromRoot
      : formatPathLink("relative", targetAbs, linkingAbs, true);
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
  if (!f || f === "." || f === ".." || f.startsWith("../"))
    throw new RenameError(`${folderRel} isn't a folder inside ${g.root}`);
  return f;
}

/**
 * Plan giving the folder `folderRel` of `parent` a `.slipbox/` of its own — a root, named `name` when
 * one is given (18.11, 21.10). Links are paths (20.2): relative, or the filesystem's own, they reach
 * across the new boundary as they are; one that wouldn't is rewritten to reach what it did.
 */
export function planMakeVault(
  parent: Graph,
  folderRel: string,
  name: string | null,
  opts: { private?: boolean } = {},
): RenamePlan {
  // In home (VV-D2) too: a folder of it made a vault of its own.
  if (parent.loc.mode === "folder")
    throw new RenameError(`${parent.root} isn't a vault: make it one first (slipbox init)`);
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
      if (!urlReaches(l.target, linkingAbs, rootAfter, targetAbs))
        c.edit(site, urlTo(l.target, linkingAbs, rootAfter, targetAbs), null);
    }
  }
  const files = c.result();
  return {
    kind: "make-vault",
    from: F,
    to: name ?? F,
    move: null,
    files,
    warnings: dirtyTrees([Fabs, ...files.map((f) => f.abs)]),
    skipped: c.skipped,
    makeVault: { root: Fabs, name, private: !!opts.private },
  };
}

/** A folder's new name: one a pointer can carry, and no different folder's on this machine (21.6). */
function checkVaultName(name: string, except?: string): void {
  if (!VAULT_NAME.test(name))
    throw new RenameError(
      `"${name}" can't be a folder's name: letters, digits, ".", "_" and "-" only, no spaces, "/" or ":"`,
    );
  const other = folderNamed(name, except);
  if (other.length)
    throw new RenameError(
      `a different folder is called "${name}", at ${other[0]!.default ?? other[0]!.copies[0]?.path}`,
    );
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
  if (others.length)
    throw new RenameError(`${F} is a vault by its ${others.join(", ")} too: it stays one, with or without .slipbox/`);
  const v = openVault(Vabs);
  v.ensureAll();
  parent.ensureAll();
  const P = parent.loc.name ?? parent.root;
  const c = new Collector(parent);
  // The names a wikilink reaches once its notes are the parent's: how many files answer to each.
  const named = new Map<string, number>();
  for (const p of [
    ...parent.notes.keys(),
    ...parent.filePaths(),
    ...[...v.notes.keys(), ...v.filePaths()].map((x) => `${F}/${x}`),
  ]) {
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
        const reaches = t.includes("/")
          ? wikiPathReaches(t, parent.root, targetAbs)
          : r.via === "alias" || (named.get(wikiNameKey(targetAbs)) ?? 0) <= 1;
        if (!reaches) c.edit(site, wikiTo(l.target, linkingAbs, parent.root, targetAbs), null);
        continue;
      }
      if (!urlReaches(l.target, linkingAbs, parent.root, targetAbs))
        c.edit(site, urlTo(l.target, linkingAbs, parent.root, targetAbs), null);
    }
  }
  // The parent's names: one its notes share with a note of the vault would land on either — a path.
  const vNamed = new Set([...v.notes.keys(), ...v.filePaths()].map(wikiNameKey));
  for (const [rel, e] of parent.notes) {
    for (const l of e.links) {
      if ((l.kind !== "wiki" && l.kind !== "embed") || l.target.includes("/") || !l.target.trim()) continue;
      const r = parent.resolveLink(l, rel);
      if (
        (r.resolvedKind !== "note" && r.resolvedKind !== "file") ||
        !r.path ||
        isAbsolute(r.path) ||
        r.via === "alias"
      )
        continue;
      if (!vNamed.has(wikiNameKey(r.path))) continue;
      const linkingAbs = join(parent.root, rel);
      c.edit(
        { abs: linkingAbs, kind: l.kind, target: l.target, line: l.line, column: l.column },
        wikiTo(l.target, linkingAbs, parent.root, join(parent.root, r.path)),
        null,
      );
    }
  }
  const unpointed = pointersByItsName(parent, v, F, c);
  const out = c.result();
  const warnings = [...dirtyTrees([Vabs, ...out.map((f) => f.abs)]), ...unpointed];
  // Settings of its own go with its .slipbox/.
  let config = "";
  try {
    config = readText(vaultConfigFile(Vabs)).text;
  } catch {}
  const tables = [...config.matchAll(/^\[([^\]]+)\][ \t]*(#.*)?$/gm)]
    .map((m) => m[1]!.trim())
    .filter((t) => t !== "vault");
  if (tables.length)
    warnings.push(
      `${F}/.slipbox/config.toml has settings of its own (${tables.map((t) => `[${t}]`).join(", ")}): they go with its .slipbox/ to the trash`,
    );
  return {
    kind: "unmake-vault",
    from: F,
    to: P,
    move: null,
    files: out,
    warnings,
    skipped: c.skipped,
    unmakeVault: { root: Vabs, name: v.loc.name ?? basename(Vabs) },
  };
}

/**
 * The pointers naming the folder `v` (nested at `F` in `parent`) by its name (21.7), into `c`: the name
 * goes with its `.slipbox/`, and nothing could resolve them after (18.11). From its own notes, the
 * parent's, and every other root's this machine reaches (as of their last indexing), each becomes the
 * link a file gets to where its target will be (design/links.md § Between folders): a relative path where
 * the two travel together, else the parent's pointer when the parent is named, else a relative path. A
 * pointer opening another copy of the folder still reaches one: left. One at a branch, which no path can
 * name, becomes the parent's pointer at that branch, or is left and said: the warnings returned.
 */
function pointersByItsName(parent: Graph, v: Graph, F: string, c: Collector): string[] {
  const ident = folderIdentity(v.root);
  if (!ident) return [];
  const folders = readFolders();
  const V = v.root;
  const P = parent.root;
  const pIdent = folderIdentity(P);
  const warnings: string[] = [];
  const sources: { abs: string; vault: string | null; links: LinkRef[] }[] = [
    ...[...v.notes].map(([rel, e]) => ({ abs: join(V, rel), vault: null, links: e.links })),
    ...[...parent.notes].map(([rel, e]) => ({ abs: join(P, rel), vault: null, links: e.links })),
    // The parent's are read above, as they are now; every other root's from its index.
    ...new Reach(v.loc).notesElsewhere(v).filter((n) => real(n.root) !== real(P)),
  ];
  for (const s of sources) {
    // Where its file's root will be: the parent's, for the folder's own.
    const own = findVaultRoot(s.abs);
    const rootAfter = own && real(own) === real(V) ? P : own;
    const together = !!rootAfter && (real(rootAfter) === real(P) || travelTogether(rootAfter, P));
    for (const l of s.links) {
      if ((l.kind !== "markdown" && l.kind !== "image") || !isPointer(l.target)) continue;
      const p = parsePointer(l.target, folders);
      const found = p ? lookupFolder(p.name, folders) : null;
      if (!p || found?.status !== "found" || found.folder.key !== ident.key || real(found.path) !== real(V)) continue;
      const targetAbs = join(V, p.path);
      if (climbsOut(relative(V, targetAbs))) continue; // a pointer's path stays in its folder: it reached nothing
      const hash = l.target.indexOf("#");
      const frag = hash >= 0 ? l.target.slice(hash) : "";
      const written = hash >= 0 ? l.target.slice(0, hash) : l.target;
      const encode = (path: string) => /%[0-9A-Fa-f]{2}/.test(written) || /\s/.test(path);
      const site: Site = { abs: s.abs, kind: l.kind, target: l.target, line: l.line, column: l.column };
      if (pIdent && (p.branch || !together)) {
        const path = `${F}${p.path ? `/${p.path}` : written.endsWith("/") ? "/" : ""}`;
        const name = pointerName({ key: pIdent.key, name: pIdent.name, remote: pIdent.remote }, folders);
        c.edit(
          site,
          formatPointer({ name, branch: p.branch, path, fragment: null }, encode(path) ? encodeURI : undefined) + frag,
          s.vault,
        );
        continue;
      }
      if (p.branch) {
        warnings.push(
          `${shownFor(parent, s.abs)}:${l.line}: ${l.target} names ${ident.name} at a branch, which no path can: left as it is`,
        );
        continue;
      }
      let rel = relative(dirname(s.abs), targetAbs).split(sep).join("/") || ".";
      if (written.endsWith("/") && !rel.endsWith("/")) rel += "/";
      c.edit(site, (encode(rel) ? encodeURI(rel) : rel) + frag, s.vault);
    }
  }
  return warnings;
}
