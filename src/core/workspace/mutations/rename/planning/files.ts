// Note/file and ordinary folder planning over the original graph and collector.

import { join, posix } from "node:path";
import { entryAt } from "../../../../foundation/platform/fsutil.ts";
import type { Graph } from "../../../graph/graph.ts";
import { holdsNotes } from "../../../walk/walk.ts";
import { RenameError, type RenamePlan } from "../collecting/contracts.ts";
import type { Collector } from "../collecting/collector.ts";
import { sameEntry } from "../collecting/policy.ts";
import { NOTE_EXT } from "../rename-links.ts";
import { checkSource, cleanTarget } from "./targets.ts";
import { planMove } from "./move.ts";
import { nestedRootEdits } from "./nested.ts";

/**
 * Plan renaming or moving a note (or any file of the vault) to `toRel` (7.1, 17.15): every link to
 * it — in this vault, and in other vaults' indexes — rewritten; its own relative links fixed for
 * its new folder. Nothing else is written into it: links reach it by its path (21.12).
 */
export function planNoteRename(g: Graph, fromRel: string, toInput: string): RenamePlan {
  const isNote = g.notes.has(fromRel);
  if (!isNote && !g.filePaths().includes(fromRel)) throw new RenameError(`no note or file ${fromRel} in ${g.root}`);
  const link = checkSource(g, fromRel);
  let toRel = cleanTarget(g, toInput, "file", isNote);
  if (posix.extname(toRel) === "" || (isNote && !NOTE_EXT.test(toRel))) toRel += posix.extname(fromRel);
  if (toRel === fromRel) throw new RenameError(`${fromRel} is already there`);
  if (entryAt(join(g.root, toRel)) && !sameEntry(join(g.root, fromRel), join(g.root, toRel)))
    throw new RenameError(`${toRel} exists; not overwriting it`);
  return planMove(g, new Map([[fromRel, toRel]]), {
    kind: "note",
    from: fromRel,
    to: toRel,
    move: { from: join(g.root, fromRel), to: join(g.root, toRel), dir: false, ...(link ? { link } : {}) },
  });
}

/**
 * Plan renaming or moving a folder (18.3): every note and file in it moves with it, and every link to
 * any of them is rewritten — links between two of them that move together stay as they are.
 */
export function planFolderMove(g: Graph, fromDir: string, toInput: string): RenamePlan {
  const from = posix.normalize(fromDir.replace(/\/+$/, ""));
  if (!g.dirs.includes(from) || !from || from === ".") throw new RenameError(`no folder ${fromDir} in ${g.root}`);
  const nested = g.nestedRoots().filter((r) => r.startsWith(`${from}/`));
  const link = checkSource(g, from, nested.length > 0);
  const to = cleanTarget(
    g,
    toInput,
    "folder",
    holdsNotes(join(g.root, from), (n) => g.filter.isNoteName(n)),
  );
  if (to === from) throw new RenameError(`${from} is already there`);
  if (to.startsWith(`${from}/`)) throw new RenameError(`${from} can't move into itself`);
  if (entryAt(join(g.root, to)) && !sameEntry(join(g.root, from), join(g.root, to)))
    throw new RenameError(`${to} exists; not overwriting it`);
  const moves = new Map<string, string>();
  for (const rel of [...g.notes.keys(), ...g.filePaths()])
    if (rel.startsWith(`${from}/`)) moves.set(rel, `${to}${rel.slice(from.length)}`);
  // A root nested in it moves with it (18.7): the links into it and out of it as its own move's.
  const fromAbs = join(g.root, from);
  const toAbs = join(g.root, to);
  const moving = (abs: string) => abs === fromAbs || abs.startsWith(`${fromAbs}/`);
  const shift = (abs: string) => (moving(abs) ? toAbs + abs.slice(fromAbs.length) : abs);
  const roots = nested.length
    ? (c: Collector) => nested.flatMap((r) => nestedRootEdits(g, c, join(g.root, r), moving, shift))
    : undefined;
  return planMove(
    g,
    moves,
    { kind: "folder", from, to, move: { from: fromAbs, to: toAbs, dir: true, ...(link ? { link } : {}) } },
    foldersMoving(g, from, to),
    roots,
  );
}

/** The folder `from` and every folder in it, each to where it goes under `to` (links to a folder, 21.2). */
function foldersMoving(g: Graph, from: string, to: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of [from, ...g.dirs])
    if (d === from || d.startsWith(`${from}/`)) out.set(d, `${to}${d.slice(from.length)}`);
  return out;
}
