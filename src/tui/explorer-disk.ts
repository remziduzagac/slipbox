// The explorer's rows the vault's walk doesn't give it (VV-D8), read from the disk in each folder of the vault's own
// tree it shows: what the walk leaves out — a busy folder (`node_modules`, `build`…), what `.gitignore` or
// `walk.exclude` leaves out, home's skip list (`Downloads`) — listed and browsed, never indexed; and what it hasn't
// reached: a folder it couldn't read, home's folders before its walk, a folder or file come since. Hidden names are
// listed only while `files.hidden` is on (its `shift+h`), left out as the walk leaves them, `.git` never; a link is left
// to the walk's rules (VV-D6).

import { type Dirent, readdirSync } from "node:fs";
import { join } from "node:path";
import { classify, type FileGroup } from "../core/filetypes.ts";
import { listsName } from "../core/listing.ts";
import type { App } from "./app.ts";

/** An entry of a folder of the vault's own tree that the walk didn't give. */
export interface DiskEntry {
  /** Its path in the vault. */
  rel: string;
  dir: boolean;
  /** Why the walk leaves it out (`busy folder`, `.gitignore`, `Downloads`…); null: the vault's own, the walk not there
   *  (yet). */
  leftOut: string | null;
  /** A file's kind. */
  group?: FileGroup;
}

/** What the explorer has from the walk, by path in the vault. */
export interface Walked {
  /** Its folders. */
  dirs: ReadonlySet<string>;
  /** The vaults nested in it: rows of their own. */
  vaults: ReadonlyMap<string, unknown>;
  /** A note or file it lists. */
  file(rel: string): boolean;
}

/**
 * What the disk adds to the vault's own tree from `sub` ("" its top): the entries the walk didn't give in `sub`, and in
 * each folder unfolded under it that is the vault's own — walked or not reached yet alike. A folder left out isn't
 * looked into here: its rows are listed a level at a time by its path, as a folder outside the vault's are. `lists`:
 * whether the explorer lists a file of the vault (`files.show`, `files.include`, `files.exclude`).
 */
export function fromDisk(
  app: App,
  sub: string,
  expanded: ReadonlySet<string>,
  walked: Walked,
  lists: (rel: string, group: FileGroup) => boolean,
): Map<string, DiskEntry> {
  const out = new Map<string, DiskEntry>();
  const filter = app.graph.filter;
  const showHidden = app.ui.hidden_files;
  const queue = [sub];
  for (let dir = queue.shift(); dir !== undefined; dir = queue.shift()) {
    let entries: Dirent[];
    try {
      entries = readdirSync(join(app.loc.root, dir), { withFileTypes: true });
    } catch {
      continue; // gone, or not yours to read: its row says so
    }
    for (const e of entries) {
      // A link: the walk's rules (VV-D6), not a folder or file here. git's own folder: never listed. A hidden name: only
      // while `files.hidden` is on.
      if (e.isSymbolicLink() || !listsName(e.name, showHidden)) continue;
      const hidden = e.name.startsWith(".");
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (walked.vaults.has(rel)) continue;
        // A hidden folder: left out (`hidden`; `.slipbox`, slipbox's own), whatever the walk knows of it — a note made
        // there puts it among the walk's folders — and listed by its path, as the busy ones are.
        if (hidden || !walked.dirs.has(rel)) {
          const why = filter.exclusion(rel, true);
          // A vault the walk didn't see (made since): its own, a row once the walk finds it.
          if (why === "nested vault") continue;
          out.set(rel, { rel, dir: true, leftOut: why });
          if (why !== null) continue;
        }
        if (expanded.has(rel)) queue.push(rel);
      } else if (e.isFile() && !walked.file(rel)) {
        const { group } = classify(e.name, app.config.walk.extensions);
        if (!lists(rel, group)) continue;
        out.set(rel, { rel, dir: false, leftOut: filter.exclusion(rel, false), group });
      }
    }
  }
  return out;
}

export { listsName };
