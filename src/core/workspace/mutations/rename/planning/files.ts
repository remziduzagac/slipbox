// Note/file and ordinary folder planning over the original graph and collector.

import { statSync } from "node:fs";
import { join, posix } from "node:path";
import { climbsOut, entryAt } from "../../../../foundation/platform/fsutil.ts";
import type { Graph } from "../../../graph/graph.ts";
import { walkLeavesOut } from "../../../graph/reach/files.ts";
import { holdsNotes } from "../../../walk/walk.ts";
import { RenameError, type RenamePlan } from "../collecting/contracts.ts";
import type { Collector } from "../collecting/collector.ts";
import { sameEntry } from "../collecting/policy.ts";
import { NOTE_EXT, real } from "../rename-links.ts";
import { isLink } from "../../../vaults/symlinks.ts";
import { isInside, isListed } from "../../../vaults/vault.ts";
import { checkSource, cleanTarget, inOwnFolder, ownRefused } from "./targets.ts";
import { planMove } from "./move.ts";
import { nestedRootEdits } from "./nested.ts";

/**
 * Plan renaming or moving a note (or any file of the vault) to `toRel` (7.1, 17.15): every link to
 * it — in this vault, and in other vaults' indexes — rewritten; its own relative links fixed for
 * its new folder. Nothing else is written into it: links reach it by its path (21.12). `own`: slipbox's and git's own
 * folders too, as the explorer moves all its walk leaves out (D278).
 */
export function planNoteRename(g: Graph, fromRel: string, toInput: string, { own = false } = {}): RenamePlan {
  const isNote = g.notes.has(fromRel);
  const known = isNote || g.filePaths().includes(fromRel);
  // One the index doesn't hold (D278): a plain move, nothing of it to rewrite.
  const left = known ? null : unindexed(g, fromRel, false, `no note or file ${fromRel} in ${g.root}`, own);
  const link = checkSource(g, fromRel);
  const notes = known ? isNote : g.filter.isNoteName(posix.basename(fromRel));
  let toRel = cleanTarget(g, toInput, "file", notes, left !== null, own);
  if (posix.extname(toRel) === "" || (isNote && !NOTE_EXT.test(toRel))) toRel += posix.extname(fromRel);
  if (toRel === fromRel) throw new RenameError(`${fromRel} is already there`);
  if (entryAt(join(g.root, toRel)) && !sameEntry(join(g.root, fromRel), join(g.root, toRel)))
    throw new RenameError(`${toRel} exists; not overwriting it`);
  const plan = planMove(g, new Map([[fromRel, toRel]]), {
    kind: "note",
    from: fromRel,
    to: toRel,
    move: { from: join(g.root, fromRel), to: join(g.root, toRel), dir: false, ...(link ? { link } : {}) },
  });
  return left !== null && walkLeavesOut(g, toRel) === null ? { ...plan, comesIn: true } : plan;
}

/**
 * What a move's source the index doesn't hold is (D278): there on the disk, inside the vault, in no vault of its own.
 * Why its walk leaves it out (`walkLeavesOut`), or null for one it hasn't walked yet (a file come since). Refused with
 * `missing`, as such a source was before, where it's none of those, a link the walk didn't take (VV-D6), and in
 * Elsewhere, which indexes nothing; refused, said, under a link — a second name moves nothing of the vault's by it —
 * and in slipbox's or git's own folder, but with `own`.
 */
function unindexed(g: Graph, rel: string, dir: boolean, missing: string, own: boolean): string | null {
  if (isListed(g.loc) || !rel || rel === "." || climbsOut(rel)) throw new RenameError(missing);
  if (g.skipped.some((s) => s.link && s.rel === rel)) throw new RenameError(missing);
  if (!own && inOwnFolder(rel)) throw new RenameError(ownRefused(rel));
  let isDir: boolean;
  try {
    isDir = statSync(join(g.root, rel)).isDirectory();
  } catch {
    throw new RenameError(missing);
  }
  const parts = rel.split("/");
  for (let i = 1; i < parts.length; i++)
    if (isLink(join(g.root, ...parts.slice(0, i))))
      throw new RenameError(`${rel} is reached through a link (${parts.slice(0, i).join("/")}): move it where it is`);
  const why = isDir === dir ? walkLeavesOut(g, rel, dir) : "nested vault";
  if (why === "nested vault") throw new RenameError(missing);
  return why;
}

/**
 * Plan renaming or moving a folder (18.3): every note and file in it moves with it, and every link to
 * any of them is rewritten — links between two of them that move together stay as they are. `own`: as a note's.
 */
export function planFolderMove(g: Graph, fromDir: string, toInput: string, { own = false } = {}): RenamePlan {
  const from = posix.normalize(fromDir.replace(/\/+$/, ""));
  const missing = `no folder ${fromDir} in ${g.root}`;
  if (!from || from === ".") throw new RenameError(missing);
  // One the walk didn't give (D278): moved as it is, and what of it a link reached (20.8) with its links.
  const left = g.dirs.includes(from) ? null : unindexed(g, from, true, missing, own);
  const nested = g.nestedRoots().filter((r) => r.startsWith(`${from}/`));
  const link = checkSource(g, from, nested.length > 0);
  const held = [...g.notes.keys(), ...g.filePaths()].filter((rel) => rel.startsWith(`${from}/`));
  // Where the walk leaves it out too, when the index holds nothing of it: nothing leaves the index that way.
  const to = cleanTarget(
    g,
    toInput,
    "folder",
    holdsNotes(join(g.root, from), (n) => g.filter.isNoteName(n)),
    left !== null && !held.length,
    own,
  );
  if (to === from) throw new RenameError(`${from} is already there`);
  if (to.startsWith(`${from}/`)) throw new RenameError(`${from} can't move into itself`);
  if (entryAt(join(g.root, to)) && !sameEntry(join(g.root, from), join(g.root, to)))
    throw new RenameError(`${to} exists; not overwriting it`);
  const moves = new Map<string, string>();
  for (const rel of held) moves.set(rel, `${to}${rel.slice(from.length)}`);
  // A root nested in it moves with it (18.7): the links into it and out of it as its own move's.
  const fromAbs = join(g.root, from);
  const toAbs = join(g.root, to);
  const moving = (abs: string) => abs === fromAbs || abs.startsWith(`${fromAbs}/`);
  const shift = (abs: string) => (moving(abs) ? toAbs + abs.slice(fromAbs.length) : abs);
  // One reached through a followed link in it isn't in it: the link moves, not the vault (#53).
  const inIt = (r: string) => isInside(real(fromAbs), real(join(g.root, r)));
  const roots = nested.length
    ? (c: Collector) => nested.flatMap((r) => nestedRootEdits(g, c, join(g.root, r), moving, shift, !inIt(r)))
    : undefined;
  const plan = planMove(
    g,
    moves,
    { kind: "folder", from, to, move: { from: fromAbs, to: toAbs, dir: true, ...(link ? { link } : {}) } },
    foldersMoving(g, from, to),
    roots,
  );
  return left !== null && walkLeavesOut(g, to, true) === null ? { ...plan, comesIn: true } : plan;
}

/** The folder `from` and every folder in it, each to where it goes under `to` (links to a folder, 21.2). */
function foldersMoving(g: Graph, from: string, to: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of [from, ...g.dirs])
    if (d === from || d.startsWith(`${from}/`)) out.set(d, `${to}${d.slice(from.length)}`);
  return out;
}
