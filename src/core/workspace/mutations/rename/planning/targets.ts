// Rename target normalization and existing-entry/source admission.

import { statSync } from "node:fs";
import { isAbsolute, join, posix } from "node:path";
import { entryInside } from "../../../../foundation/platform/fsutil.ts";
import type { Graph } from "../../../graph/graph.ts";
import { isLink } from "../../../vaults/symlinks.ts";
import { RenameError } from "../collecting/contracts.ts";
import { walkSkips, sameEntry } from "../collecting/policy.ts";

/**
 * A vault path as the user typed it: normalized, inside the vault, and not somewhere hidden. `holds`: what moves there
 * — a note or file, or a folder of them, never where the vault doesn't index it (a busy folder, VV-D8); a vault indexes
 * its own. `notes`: what moves puts a note directly in the folder it lands in (a note; a folder with one at its top).
 */
export function cleanTarget(g: Graph, input: string, holds: "file" | "folder" | "vault", notes = false): string {
  const rel = posix.normalize(input.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, ""));
  if (rel.startsWith("../") || rel === ".." || rel === "." || isAbsolute(rel))
    throw new RenameError(`${input} isn't inside the vault`);
  if (walkSkips(rel)) throw new RenameError(`${input}: the walk leaves hidden folders out`);
  const never = holds === "vault" ? null : g.neverIndexed(rel, holds === "folder", notes);
  if (never) throw new RenameError(`${input}: ${never}`);
  // A link there (the one moving, on a disk that ignores case) is its own entry, in its folder: not where it leads.
  const at = join(g.root, rel);
  if (!entryInside(g.root, at, true)) throw new RenameError(`${rel} would land outside the vault`);
  const where = fileInTheWay(g.root, rel);
  if (where) throw new RenameError(`${where} is a file: ${rel} can't go under it`);
  return rel;
}

/**
 * What moves, by its real path inside the vault (VV-D6): nothing is moved out of where a link leads, followed or
 * not, as nothing is moved into it — in home too, as a copy or a delete there. A link named itself moves as a link,
 * its target staying where it is (D260): its entry is checked, in its folder by its real path — but one leading to a
 * vault, or to a folder holding one (`vaults`), whose place is known by its real path: no link's name moves it.
 * Whether it moves as a link, for its plan's `move.link`.
 */
export function checkSource(g: Graph, rel: string, vaults = false): boolean {
  const abs = join(g.root, rel);
  const link = !vaults && isLink(abs);
  if (!entryInside(g.root, abs, link)) throw new RenameError(`${rel} resolves outside the vault`);
  return link;
}

/**
 * Where a move typed as a path lands (DF-D4): a new path that is a folder already, or ends in `/`, means
 * into it, as the shell's `mv` does — `ideas/` (or `ideas`, there) for `note.md` is `ideas/note.md`, and the
 * root itself (`/`, `.`) takes it to the top. Any other path is the whole new path, as typed. Not for a
 * rename in place (`r`), whose name is a name: a folder of that name beside it is no place to go into.
 */
export function moveTarget(g: Graph, fromRel: string, input: string): string {
  const typed = input.replace(/\\/g, "/");
  const rel = posix.normalize(typed.replace(/^\/+/, "").replace(/\/+$/, "") || ".");
  const name = posix.basename(fromRel);
  if (rel === ".") return name; // the root, a folder that's always there
  if (typed.endsWith("/")) return `${rel}/${name}`;
  if (rel.startsWith("../") || rel === "..") return input; // refused as it is, where its plan checks
  const abs = join(g.root, rel);
  let folder = false;
  try {
    folder = statSync(abs).isDirectory();
  } catch {}
  // A folder's case-only rename on a disk that ignores case: the "folder" there is itself.
  return folder && !sameEntry(join(g.root, fromRel), abs) ? `${rel}/${name}` : input;
}

/** A file where a folder of the path `rel` would have to be (`x.md` for `x.md/a.md`), or null. */
export function fileInTheWay(root: string, rel: string): string | null {
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
