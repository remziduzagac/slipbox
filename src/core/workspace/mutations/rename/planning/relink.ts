// Relink, pointer offers and evidence from a vault moved by hand.

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import type { Graph, ResolvedLink } from "../../../graph/graph.ts";
import { formatPathLink, pathForm, pathLink, type PathForm, pathNamed } from "../../../links/links.ts";
import { readRoots } from "../../../vaults/registry.ts";
import {
  copyAvailable,
  folderIdentity,
  pointerName,
  pointerNaming,
  pointerWarnings,
  readFolders,
  travelTogether,
} from "../../../vaults/folders.ts";
import { formatPointer, isPointer, parsePointer, resolvePointer } from "../../../links/pointer.ts";
import { findVaultRoot, isHome, isInside } from "../../../vaults/vault.ts";
import type { RenamePlan } from "../collecting/contracts.ts";
import { Collector } from "../collecting/collector.ts";
import { dirtyTrees } from "../collecting/dirty-trees.ts";
import { type Site, wikiTarget, mdTarget } from "../rename-links.ts";

/**
 * Plan rewriting links that reach nothing but whose file was seen to move (17.12, 20.2), to its path
 * now; pointers by a folder's old name (21.10), to its name now; and paths into a named folder that
 * doesn't travel with this one, as pointers (21.7). In `rels`, or every note, which also fixes the
 * root's own last move (20.17).
 */
export function planRelink(g: Graph, rels?: string[], opts: { pointers?: boolean } = {}): RenamePlan {
  g.ensureAll();
  const c = new Collector(g);
  /** What the pointers it writes say (D74): a private name, a qualified one on a clash. */
  const said = new Set<string>();
  for (const rel of rels ?? [...g.notes.keys()]) {
    for (const l of g.linksOf(rel)) {
      // A path that reaches nothing, whose file was seen to move (20.2: evidence, not resolution).
      const to = g.movedTarget(l, rel);
      const abs = join(g.root, rel);
      const site: Site = { abs, kind: l.kind, target: l.target, line: l.line, column: l.column };
      if (to) {
        // Each in its own form: a wikilink's path a wikilink's (relative kept, `.md` only if written).
        const wiki = l.kind === "wiki" || l.kind === "embed";
        c.edit(
          site,
          wiki ? wikiTarget(l.target, posix.dirname(rel), to, g, "") : mdTarget(l.target, abs, join(g.root, to), g),
          null,
        );
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
      const ptr = opts.pointers === false ? null : pointerOffer(g, l, rel, said);
      if (ptr) c.edit(site, ptr, null);
    }
  }
  // The whole vault: the links its own move broke, too (20.17).
  const moved = rels ? null : lastMove(g);
  if (moved) vaultMoveFixes(g, moved, c);
  const files = c.result();
  return {
    kind: "relink",
    from: rels?.join(", ") ?? "every note",
    to: "",
    move: null,
    files,
    warnings: [...said, ...dirtyTrees(files.map((f) => f.abs))],
    skipped: c.skipped,
  };
}

/**
 * A markdown link's path out of this root into a named folder that doesn't travel with it (21.7):
 * the pointer to write instead — for one that reaches the file, and for one broken where a copy of
 * that folder was (moved by hand). Only one that reaches the file now; the fragment kept.
 */
function pointerOffer(g: Graph, l: ResolvedLink, fromRel: string, said: Set<string>): string | null {
  if (l.kind !== "markdown" && l.kind !== "image") return null;
  const hash = l.target.indexOf("#");
  const path = hash >= 0 ? l.target.slice(0, hash) : l.target;
  const frag = hash >= 0 ? l.target.slice(hash) : "";
  if (!pathForm(path) || pathForm(path) === "file-url") return null;
  let abs: string | null = null;
  if (
    (l.resolvedKind === "note" || l.resolvedKind === "file" || l.resolvedKind === "folder") &&
    l.path &&
    isAbsolute(l.path)
  )
    abs = l.path;
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
    const was = folders.flatMap((f) =>
      f.copies.filter((c) => !copyAvailable(c.path) && isInside(c.path, abs!)).map((c) => ({ f, root: c.path })),
    )[0];
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
  const naming = pointerNaming(hit.f, folders);
  const p = { name: naming.name, branch: null, path: relative(hit.root, abs).split(sep).join("/"), fragment: null };
  const t = resolvePointer(p, folders);
  if (t.status !== "found" || !pathLink(t.abs, join(g.root, fromRel), false, undefined, true)) return null;
  // Its name private, or written qualified on a clash: said in the plan (D74, D83).
  for (const w of pointerWarnings(naming)) said.add(w);
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
      if (
        (l.kind !== "markdown" && l.kind !== "image") ||
        !pathOf(l.target) ||
        l.target.startsWith("/") ||
        l.target.startsWith("~/")
      )
        continue;
      if (g.resolveLink(l, rel).resolvedKind !== "unresolved") continue;
      const was = pathNamed(pathOf(l.target)!, join(from, rel));
      if (!was || isInside(from, was.abs) || !existsSync(was.abs)) continue;
      c.edit(
        { abs: join(to, rel), kind: l.kind, target: l.target, line: l.line, column: l.column },
        retarget(l.target, was.form, was.abs, join(to, rel)),
        null,
      );
    }
  }
  for (const v of readRoots()) {
    // Home's notes too (VV-D2), as of its index.
    const linker = v.kind === "vault" || (v.kind === "home" && isHome(v.path));
    if (!linker || v.path === to || isInside(to, v.path) || !existsSync(v.path)) continue;
    const og = g.reach?.graphAt(v.path, { known: true }) ?? null;
    if (!og) continue;
    for (const rel of og.notes.keys()) {
      const linking = join(og.root, rel);
      for (const l of og.linksOf(rel)) {
        if ((l.kind !== "markdown" && l.kind !== "image") || !pathOf(l.target)) continue;
        const was = pathNamed(pathOf(l.target)!, linking);
        if (!was || !isInside(from, was.abs) || existsSync(was.abs)) continue;
        const now = join(to, relative(from, was.abs));
        if (!existsSync(now)) continue;
        c.edit(
          { abs: linking, kind: l.kind, target: l.target, line: l.line, column: l.column },
          retarget(l.target, was.form, now, linking),
          g.reach?.vaultOf(og.root) ?? null,
        );
      }
    }
  }
}
