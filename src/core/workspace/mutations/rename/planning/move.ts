// Move link collection and the original followed-link exclusion after a folder moves.

import { readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, parse, posix, relative, sep } from "node:path";
import { classify } from "../../../../documents/model/filetypes.ts";
import { realTarget } from "../../../../foundation/platform/fsutil.ts";
import type { Graph, NoteEntry } from "../../../graph/graph.ts";
import { formatPathLink, normKey, pathForm } from "../../../links/links.ts";
import { isLink, linkAnswer } from "../../../vaults/symlinks.ts";
import { isInside } from "../../../vaults/vault.ts";
import type { RenamePlan } from "../collecting/contracts.ts";
import { Collector } from "../collecting/collector.ts";
import { dirtyTrees } from "../collecting/dirty-trees.ts";
import { relinkSaid } from "../collecting/policy.ts";
import { type Site, NOTE_EXT, wikiTarget, rootOfPath, real, pathRetarget, mdTarget } from "../rename-links.ts";
import { ownFileLinks, retargetBacklink } from "../rewriting/links.ts";

/**
 * What a folder moving from `from` to `to` leaves of the files it reaches through a link in it (D260), its links left
 * as the move leaves them: a followed one, its answer staying where it was, isn't followed at its new place; a
 * relative one leading out of the folder leads elsewhere from there. An edit for the file it reaches now would be
 * right for no name: that file left, and said. A file is judged by the first link on its way under the folder; where
 * a relative one leads after is read from its own text, from its folder's new place.
 */
function leftByFolderMove(from: string, to: string): (abs: string) => string | null {
  const fromReal = realTarget(from);
  const toReal = realTarget(to);
  const within = (p: string, dir: string) => p === dir || p.startsWith(`${dir}${sep}`);
  const moved = (p: string) => (within(p, fromReal) ? toReal + p.slice(fromReal.length) : p);
  /**
   * Where the link `p`'s text leads once the folder has moved, as the disk will read it: a part at a time from the
   * link's folder's new place, each name followed on the disk as it is — inside the folder where it is now — a `..` its
   * parent; null where it reaches nothing (where the folder was, or what isn't there).
   */
  const leadsAfter = (p: string): string | null => {
    const text = readlinkSync(p);
    let at = isAbsolute(text) ? parse(text).root : moved(realTarget(dirname(p)));
    for (const part of text.split(process.platform === "win32" ? /[\\/]/ : "/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        at = dirname(at);
        continue;
      }
      const next = join(at, part);
      if (within(next, fromReal) && !within(next, toReal)) return null; // where the folder was: gone
      try {
        at = moved(realpathSync(within(next, toReal) ? fromReal + next.slice(toReal.length) : next));
      } catch {
        return null;
      }
    }
    return at;
  };
  return (abs) => {
    if (abs === from || !abs.startsWith(`${from}/`)) return null;
    const parts = relative(from, abs).split(sep);
    for (let i = 1; i <= parts.length; i++) {
      const p = join(from, ...parts.slice(0, i));
      if (!isLink(p)) continue;
      if (linkAnswer(p) === "follow")
        return "a followed link moving with its folder isn't followed at its new place: not rewritten";
      return leadsAfter(p) === moved(realTarget(p))
        ? null
        : "a link moving with its folder leads elsewhere after: not rewritten";
    }
    return null;
  };
}

/**
 * The plan for moving files (`moves`: vault paths, old → new): each link to a moved file rewritten
 * from where its file will be, each moved note's relative links to what stays put rewritten from
 * where it will be.
 */
export function planMove(
  g: Graph,
  moves: Map<string, string>,
  head: Pick<RenamePlan, "kind" | "from" | "to" | "move">,
  folders = new Map<string, string>(),
  roots?: (c: Collector) => [string, string][],
): RenamePlan {
  const c = new Collector(g);
  const abs = (rel: string) => join(g.root, rel);
  const mv = head.move;
  if (mv?.dir && !mv.link) c.leave = leftByFolderMove(mv.from, mv.to);
  /** What the plan says beside its edits. */
  const said: string[] = [];
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
    if (posix.dirname(fromRel) === posix.dirname(toRel) && !crosses) continue;
    // A link's note is what it leads to (D260): reached by another name too, one this plan doesn't move with it, its
    // own links are that name's as much, so left as they are, and said.
    const linked = isLink(abs(fromRel)) && classify(fromRel, g.config.walk.extensions).group !== "binary"; // links of its own
    const also = linked ? (c.otherNames(abs(fromRel)).find((r) => !moves.has(r)) ?? null) : null;
    if (also) {
      said.push(`${fromRel}: what it leads to is ${also} too: its own links left as they are`);
      continue;
    }
    if (!entry) {
      ownFileLinks(
        g,
        c,
        fromRel,
        toRel,
        crosses,
        (r) => (!isAbsolute(r) && (moves.has(r) || folders.has(r))) || (isAbsolute(r) && after(r) !== r),
      );
      continue;
    }
    for (const l of entry.links) {
      const wikiLink = l.kind === "wiki" || l.kind === "embed";
      if (l.kind !== "markdown" && l.kind !== "image" && !(wikiLink && (crosses || /^\.\.?\//.test(l.target))))
        continue;
      if (
        /^[a-z][a-z0-9+.-]*:/i.test(l.target) ||
        l.target.startsWith("#") ||
        (l.target.startsWith("/") && !crosses) ||
        l.target.startsWith("~/")
      )
        continue;
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
      const byPath = pathForm(b.target)
        ? pathRetarget(b.target, linking, after(linking), abs(fromDir), abs(toDir), false)
        : null;
      c.edit(site, byPath ?? mdTarget(b.target, after(linking), abs(toDir), g), null);
    }
  }
  const vaults = roots?.(c) ?? [];
  const files = c.result();
  const warnings = [
    ...dirtyTrees([head.move!.from, ...files.map((f) => f.abs)]),
    ...said,
    ...relinkSaid(mv, head.from, head.to),
  ];
  return { ...head, moves: [...moves], ...(vaults.length ? { vaults } : {}), files, warnings, skipped: c.skipped };
}
