// Nested-root planning and the original cross-root backlink collection.

import { isAbsolute, join, posix } from "node:path";
import { entryAt } from "../../../../foundation/platform/fsutil.ts";
import type { Backlink, Graph } from "../../../graph/graph.ts";
import { formatPathLink } from "../../../links/links.ts";
import { openVault } from "../../../links/reach.ts";
import { findVaultRoot, isInside } from "../../../vaults/vault.ts";
import { RenameError, type RenamePlan } from "../collecting/contracts.ts";
import { Collector } from "../collecting/collector.ts";
import { dirtyTrees } from "../collecting/dirty-trees.ts";
import { sameEntry } from "../collecting/policy.ts";
import { real, mdTarget } from "../rename-links.ts";
import { checkSource, cleanTarget } from "./targets.ts";
import { retargetInto } from "../rewriting/links.ts";

/**
 * Plan moving or renaming the folder of a vault nested in `parent` (18.7). The vault moves whole —
 * the vaults nested in it too — and every link into it by path, from the parent and from the other
 * vaults this machine reaches, is rewritten, as are its notes' relative links out of it. Links within
 * what moves, and pointers (`slipbox://name/…`, 21.7), stay as they are: they name the same folder.
 */
export function planVaultFolderMove(parent: Graph, fromRel: string, toInput: string): RenamePlan {
  const from = posix.normalize(fromRel.replace(/\/+$/, ""));
  if (!parent.nestedRoots().includes(from)) throw new RenameError(`no vault nested at ${fromRel} in ${parent.root}`);
  checkSource(parent, from, true);
  const to = cleanTarget(parent, toInput, "vault");
  if (to === from) throw new RenameError(`${from} is already there`);
  if (to.startsWith(`${from}/`)) throw new RenameError(`${from} can't move into itself`);
  if (entryAt(join(parent.root, to)) && !sameEntry(join(parent.root, from), join(parent.root, to)))
    throw new RenameError(`${to} exists; not overwriting it`);
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
export function nestedRootEdits(
  parent: Graph,
  c: Collector,
  rootAbs: string,
  moving: (abs: string) => boolean,
  shift: (abs: string) => string,
): [string, string][] {
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
    if (next !== null)
      c.edit(
        {
          abs: l.backlink.from,
          kind: l.backlink.kind,
          target: l.backlink.target,
          line: l.backlink.line,
          column: l.backlink.column,
        },
        next,
        null,
      );
  }
  for (const g of graphs) {
    g.ensureAll();
    // …and other vaults', from theirs.
    for (const rel of [...g.notes.keys(), ...g.filePaths()]) {
      const targetAbs = join(g.root, rel);
      for (const b of g.backlinks(rel)) {
        // The parent's own links are rewritten above; a root nested beside this one has its own.
        if (
          !isAbsolute(b.from) ||
          moving(b.from) ||
          (isInside(parent.root, b.from) && real(findVaultRoot(b.from) ?? "") === real(parent.root))
        )
          continue;
        const next = retargetInto(b, targetAbs, shift(targetAbs));
        if (next !== null)
          c.edit(
            { abs: b.from, kind: b.kind, target: b.target, line: b.line, column: b.column },
            next,
            b.vault ?? null,
          );
      }
    }
    // Out of it, from where its notes will be.
    for (const [rel, entry] of g.notes) {
      const noteAbs = join(g.root, rel);
      for (const l of entry.links) {
        const wiki = l.kind === "wiki" || l.kind === "embed";
        if (wiki ? !/^\.\.?\//.test(l.target) : /^[a-z][a-z0-9+.-]*:/i.test(l.target) || /^[#/~]/.test(l.target))
          continue;
        const r = g.resolveLink(l, rel);
        if (
          (r.resolvedKind !== "note" && r.resolvedKind !== "file") ||
          !r.path ||
          !isAbsolute(r.path) ||
          moving(r.path)
        )
          continue;
        const next = wiki
          ? formatPathLink("relative", r.path, shift(noteAbs), /\.[A-Za-z0-9]+$/.test(l.target))
          : mdTarget(l.target, shift(noteAbs), r.path, null);
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
      out.push({
        backlink: {
          from: join(g.root, rel),
          line: l.line,
          column: l.column,
          end: l.end,
          text: l.text,
          kind: l.kind,
          target: l.target,
          heading: l.heading,
          block: l.block,
          alias: l.alias,
        },
        targetAbs: r.path,
      });
    }
  }
  return out;
}
