// The explorer's rows the vault's walk doesn't give it (VV-D8), from the listings of the folders of the vault's own tree
// it shows (SD-T7: read on the disk threads, `Listings`, as the folders outside the vault are): what the walk leaves out
// — a busy folder (`node_modules`, `build`…), what `.gitignore` or `walk.exclude` leaves out, home's skip list
// (`Downloads`) — listed and browsed, never indexed; and what it hasn't reached: a folder it couldn't read, home's
// folders before its walk, a folder or file come since. Each entry's verdict is the walk's filter's, made where it was
// listed. Hidden names are listed only while `files.hidden` is on (its `shift+h`), left out as the walk leaves them,
// `.git` never; a link is left to the walk's rules (VV-D6). Nothing here reads the disk: a folder not listed yet keeps
// the walk's rows meanwhile, and says so once its listing has taken a moment.

import { join, posix } from "node:path";
import { classify, type FileGroup } from "../../../core/documents/model/filetypes.ts";
import { type ListedEntry, listsName } from "../../../core/workspace/walk/listing.ts";
import type { ExplorerReadContext, ExplorerRowState } from "./contracts.ts";

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
  /** What its folder's listing read of it: its marks', a vault's name. */
  listed: ListedEntry;
}

/** What the explorer has from the walk, by path in the vault. */
export interface Walked {
  /** Its folders. */
  dirs: ReadonlySet<string>;
  /** The vaults nested in it: rows of their own. */
  vaults: { has(rel: string): boolean };
  /** A note or file it lists. */
  file(rel: string): boolean;
}

/** What the listings of the vault's own folders shown give the tree. */
export interface FromDisk {
  /** The entries the walk didn't give, by path in the vault. */
  found: Map<string, DiskEntry>;
  /** Every entry of those listings, by path in the vault, the walk's or not: its row's marks, where a link leads, a
   *  nested vault's name. */
  listed: Map<string, ListedEntry>;
  /** The folders whose first listing is still being read, long enough that their rows say so ("" the top). */
  pending: string[];
  /** The folders whose listing gave no answer, in its thread's words (a folder's own error, its row's marks say). */
  failed: Map<string, string>;
}

/**
 * What the disk adds to the vault's own tree from `sub` ("" its top): the entries the walk didn't give in `sub`, and in
 * each folder unfolded under it that is the vault's own — walked or not reached yet alike — from their listings, each
 * entry as its listing judged it. A folder left out isn't looked into here: its rows are listed a level at a time by its
 * path, as a folder outside the vault's are. A folder a link the walk followed leads to is listed for its rows' marks
 * alone, as the walk gave it. `lists`: whether the explorer lists a file of the vault (`files.show`, `files.include`,
 * `files.exclude`).
 */
export function fromDisk(
  app: Pick<ExplorerReadContext, "loc" | "ui" | "config">,
  listings: ExplorerRowState["listings"],
  sub: string,
  expanded: ReadonlySet<string>,
  walked: Walked,
  lists: (rel: string, group: FileGroup) => boolean,
): FromDisk {
  const out: FromDisk = { found: new Map(), listed: new Map(), pending: [], failed: new Map() };
  const showHidden = app.ui.hidden_files;
  const queue: { dir: string; finds: boolean }[] = [{ dir: sub, finds: true }];
  for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
    const { dir, finds } = at;
    const abs = join(app.loc.root, dir);
    const listing = listings.get(abs, true);
    // A folder's own error (gone, not yours to read): its row's marks say it, nothing in it to ask for.
    if (listing?.error && !listing.error.includes(" ")) continue;
    if (!listing || listing.error !== null) {
      // Not listed yet — said once it's taken a moment — or its thread gave no answer, in its words: its walked folders
      // unfolded are asked for all the same, for their rows' marks alone, their rows the walk's meanwhile — which of
      // them is a link the walk followed (VV-D6), whose own entries are never the vault's, is this listing's to say.
      if (listing?.error) out.failed.set(dir, listing.error);
      else if (listings.pending(abs, true)) out.pending.push(dir);
      for (const d of walked.dirs)
        if (expanded.has(d) && posix.dirname(d) === (dir || ".") && !posix.basename(d).startsWith("."))
          queue.push({ dir: d, finds: false });
      continue;
    }
    for (const e of listing.entries) {
      if (!listsName(e.name, showHidden)) continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      out.listed.set(rel, e);
      // A link: the walk's rules (VV-D6), not a folder or file here; one it followed, listed for its rows' marks.
      if (e.link) {
        if (e.dir && walked.dirs.has(rel) && expanded.has(rel)) queue.push({ dir: rel, finds: false });
        continue;
      }
      if (e.dir) {
        if (walked.vaults.has(rel)) continue;
        // A hidden folder: left out (`hidden`; `.slipbox`, slipbox's own), whatever the walk knows of it — a note made
        // there puts it among the walk's folders — and listed by its path, as the busy ones are.
        if (e.name.startsWith(".") || !walked.dirs.has(rel)) {
          const why = e.excluded ?? null;
          // A vault the walk didn't see (made since): its own, a row once the walk finds it. In a link's folder, only
          // what the walk gave.
          if (why === "nested vault" || !finds) continue;
          out.found.set(rel, { rel, dir: true, leftOut: why, listed: e });
          if (why !== null) continue;
        }
        if (expanded.has(rel)) queue.push({ dir: rel, finds });
      } else if (finds && e.file && !walked.file(rel)) {
        const { group } = classify(e.name, app.config.walk.extensions);
        if (!lists(rel, group)) continue;
        out.found.set(rel, { rel, dir: false, leftOut: e.excluded ?? null, group, listed: e });
      }
    }
  }
  return out;
}

export { listsName };
