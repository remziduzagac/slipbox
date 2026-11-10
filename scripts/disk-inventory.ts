// The slow-disk workstream's inventory (SD-D12; blueprint/workstreams/slow-disk/README.md § The inventory), for
// `check:boundary`: each of its files reads the disk through the seam (SD-D10, `DISK_SEAM`), or `DISK_READERS` says
// why it still imports a read of node:fs. scripts/check-boundary.ts runs it over the repository, whose tree always
// holds it; a test's small tree, written for the other rules, asks to be left out (`--no-inventory`).

import { existsSync } from "node:fs";
import { join } from "node:path";

/** The seam every read the slow-disk workstream moves goes through (SD-D10). */
export const DISK_SEAM = "src/core/foundation/platform/disk.ts";

/** node:fs's reads (SD-D12): a stat, a listing, a file's text, an existence or access check — sync, callback, promised
 *  or streamed — and a file watched by polling its stat. Its writes, `watch` (a folder's watch registered), `open`,
 *  `constants` and its types are none. */
export const DISK_READS = new Set([
  "access",
  "accessSync",
  "createReadStream",
  "exists",
  "existsSync",
  "fstat",
  "fstatSync",
  "glob",
  "globSync",
  "lstat",
  "lstatSync",
  "openAsBlob",
  "opendir",
  "opendirSync",
  "read",
  "readdir",
  "readdirSync",
  "readFile",
  "readFileSync",
  "readlink",
  "readlinkSync",
  "readSync",
  "readv",
  "readvSync",
  "realpath",
  "realpathSync",
  "stat",
  "statfs",
  "statfsSync",
  "statSync",
  "watchFile",
]);

const FS = `["'](?:node:)?fs(?:/promises)?["']`;
const FS_MODULE = new RegExp(`^${FS}$`);

/** A file's text with its comments taken out, so a read named in one counts for nothing. A `//` right after a colon or
 *  a quote (a URL, a string's start) is left; one elsewhere in a string cuts the rest of its line, which can miss a read
 *  but never make one up. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** The names a `{ … }` of an import or an export takes of node:fs: its reads (`DISK_READS`), and where `promises` lands
 *  (`wholes`). A name taken as a type loads nothing. */
function namesOf(list: string, reads: Set<string>, wholes: string[]): void {
  for (const part of list.split(",")) {
    const [name, local] = part.trim().split(/\s+as\s+/);
    if (!name || name.startsWith("type ")) continue;
    if (name === "promises") wholes.push(local ?? name);
    else if (DISK_READS.has(name)) reads.add(name);
  }
}

/**
 * The reads of the disk a file's text makes (`DISK_READS`): imported or exported again by name (`statSync`;
 * fs/promises' `readFile`), or used of a module imported whole (`fs.statSync`, `fs.promises.readFile`,
 * `promises.readFile`); one loaded at run time (`require`, `import(…)`) counts as reading, and so does a file of Bun's
 * (`Bun.file`: its `text()`, `exists()`, `size`, …). `import type` loads nothing; comments count for nothing.
 */
export function diskReadsOf(source: string): string[] {
  const text = code(source);
  const reads = new Set<string>();
  const wholes: string[] = [];
  for (const m of text.matchAll(/\bimport\s+(?!type\s)([^;'"]*?)\s*from\s*(["'][^"']+["'])/g)) {
    if (!FS_MODULE.test(m[2]!)) continue;
    const named = /\{([^}]*)\}/.exec(m[1]!);
    if (named) namesOf(named[1]!, reads, wholes);
    const whole = m[1]!
      .replace(/\{[^}]*\}/, "")
      .replace(/,/g, " ")
      .trim();
    const local = /\*\s*as\s+(\w+)/.exec(whole)?.[1] ?? /^(\w+)/.exec(whole)?.[1];
    if (local) wholes.push(local);
  }
  for (const m of text.matchAll(new RegExp(`\\bexport\\s*\\{([^}]*)\\}\\s*from\\s*${FS}`, "g")))
    namesOf(m[1]!, reads, wholes);
  for (const w of wholes)
    for (const m of text.matchAll(new RegExp(`\\b${w}\\.(?:promises\\.)?(\\w+)`, "g")))
      if (DISK_READS.has(m[1]!)) reads.add(m[1]!);
  if (new RegExp(`\\bexport\\s*\\*[^;'"]*from\\s*${FS}|(?:\\brequire|\\bimport)\\s*\\(\\s*${FS}`).test(text))
    reads.add("node:fs");
  if (/\bBun\s*\.\s*file\s*\(/.test(text)) reads.add("Bun.file");
  return [...reads].sort();
}

/**
 * The slow-disk inventory that reads the disk through the seam alone (`DISK_SEAM`): SD-T1 moved their reads there, or
 * they make none of their own. An import of a read of node:fs in one fails the check. Each later task moves its files
 * here from `DISK_READERS`.
 */
export const SEAM_READERS = [
  "src/core/workspace/git/branches/gitrebase.ts",
  "src/core/workspace/git/branches/operation-status.ts",
  "src/core/workspace/git/branches/operation.ts",
  "src/core/workspace/git/git.ts",
  "src/core/workspace/graph/autoindex.ts",
  "src/core/workspace/graph/feed.ts",
  "src/core/workspace/graph/graph.ts",
  "src/core/workspace/graph/moves/reconcile.ts",
  "src/core/workspace/graph/refresh.ts",
  "src/core/workspace/graph/watch.ts",
  "src/core/workspace/graph/watch/contracts.ts",
  "src/core/workspace/graph/watch/directories.ts",
  "src/core/workspace/graph/watch/io.ts",
  "src/core/workspace/graph/watch/judging.ts",
  "src/core/workspace/graph/watch/reads.ts",
  "src/core/workspace/graph/watch/reconciliation.ts",
  "src/core/workspace/graph/watch/state.ts",
  "src/core/workspace/graph/watch/ticks.ts",
  "src/core/workspace/links/convention.ts",
  "src/core/workspace/vaults/home/cache.ts",
  "src/core/workspace/vaults/vault-feed.ts",
  "src/core/workspace/walk/filtering/filter.ts",
  "src/core/workspace/walk/key-jobs.ts",
  "src/core/workspace/walk/listing.ts",
  "src/core/workspace/walk/look-jobs.ts",
  "src/core/workspace/walk/own-jobs.ts",
  "src/core/workspace/walk/traversal/symlinks.ts",
  "src/tui/actions/documents/actions-edit.ts",
  "src/tui/actions/documents/actions-links.ts",
  "src/tui/actions/workspace/actions-files.ts",
  "src/tui/app/runtime/builds.ts",
  "src/tui/app/runtime/graph-refresh.ts",
  "src/tui/app/runtime/key-reads.ts",
  "src/tui/app/runtime/look.ts",
  "src/tui/app/runtime/startup.ts",
  "src/tui/app/settings/settings.ts",
  "src/tui/documents/buffers/buffer.ts",
  "src/tui/documents/buffers/opening.ts",
  "src/tui/documents/diagnostics/draw-problems.ts",
  "src/tui/documents/diagnostics/problems.ts",
  "src/tui/documents/editing/completion/items.ts",
  "src/tui/documents/navigation/peek/history.ts",
  "src/tui/documents/navigation/peek/opening.ts",
  "src/tui/documents/tools/info/info.ts",
  "src/tui/shell/overlays/preview.ts",
  "src/tui/shell/screen/topbar/where.ts",
  "src/tui/workspace/explorer/actions/items.ts",
  "src/tui/workspace/explorer/explorer-disk.ts",
  "src/tui/workspace/explorer/explorer.ts",
  "src/tui/workspace/explorer/marks.ts",
  "src/tui/workspace/explorer/navigation.ts",
  "src/tui/workspace/explorer/renaming.ts",
  "src/tui/workspace/explorer/rows/paths.ts",
  "src/tui/workspace/explorer/rows/tree.ts",
  "src/tui/workspace/git/gitquery.ts",
  "src/tui/workspace/git/views/log/log.ts",
  "src/tui/workspace/git/views/panel/draw-git.ts",
  "src/tui/workspace/session/session.ts",
] as const;

/**
 * The inventory's files still allowed to import node:fs's reads, each with why: the task that moves them, or the
 * decision that keeps them. One that no longer imports a read fails the check until its entry goes.
 *
 * What the check doesn't see: it reads imports alone. A read through a helper (fsutil.ts's `readText`, `stamp`,
 * `readJson`) passes it, and so does a call to the seam made synchronously on the screen's thread. The seam keeps two
 * listings apart (disk.ts): the walk's (`readFolder`), which the stand-in slows on every thread, the screen's too, so
 * T12's checks see a walk put back there; and the rest (`entries`, each stat and read), which it slows on every thread
 * but the screen's, and a test holds on the thread it asks — so the screen's thread reads those as it did. A task's
 * held tests take the hold on the screen's thread too, for the reads it moves (SD-T5's first): a read of them left
 * there holds the test's key past the hold's deadline (`gaveUp`). The net grows task by task; the check keeps the list
 * honest.
 */
export const DISK_READERS: Record<string, string> = {
  "src/core/application/distribution/install.ts": "the upgrade check, in slipbox's data folder: kept (SD-D1's note)",
  "src/core/foundation/platform/fsutil.ts":
    "a write's own reads and its guards' (`landsInside`, `entryAt`): kept (SD-D7); `readJson` reads through the seam",
  "src/core/workspace/graph/graph-lookup.ts": "a link into a nested vault, as it's drawn (SD-T11)",
  "src/core/workspace/graph/graph-resolve.ts": "a `/…` link's first folder, as it's drawn (SD-T11)",
  "src/core/workspace/links/links.ts": "a name's case on a disk that folds it (`onDisk`), as it's drawn (SD-T11)",
  "src/core/workspace/mutations/files.ts": "a file operation's guards before it writes: kept (SD-D7)",
  "src/core/workspace/mutations/rename/rename-apply.ts": "a rename's guards before it writes: kept (SD-D7)",
  "src/core/workspace/session/position.ts":
    "a root's positions of before 21.8, looked for at the start: kept (SD-D9); at a vault gone into, a disk thread's (SD-T9)",
  "src/core/workspace/vaults/folders.ts":
    "a named folder's copies, read with a write or as a key names one: kept (SD-D7); the Vaults window's, a disk thread's (SD-T9)",
  "src/core/workspace/vaults/registry.ts":
    "the machine's list moved once and recorded, with its write: kept (SD-D7); the Vaults window's, a disk thread's (SD-T9)",
  "src/core/workspace/vaults/symlinks.ts":
    "a link's own read as it's answered or a rename moves it: kept (SD-D7); the answers kept, the TUI's look's (SD-T9)",
  "src/tui/app/distribution/update-observation.ts": "the upgrade check, in slipbox's data folder: kept (SD-D1's note)",
  "src/tui/app/runtime/watch.ts": "an open note the watcher's batch names, checked with a disk thread's `read` (SD-T6)",
  "src/tui/app/scratch/scratch.ts": "the scratch's places, kept and asked of a disk thread (SD-T11)",
  "src/tui/documents/media/images.ts": "a picture's file, as it's drawn (SD-T11)",
  "src/tui/documents/saving/saving.ts": "a save's own checks: kept (SD-D7)",
  "src/tui/shell/terminal/run.ts": "what's read before the screen is taken: kept (SD-D9)",
  "src/tui/workspace/git/git.ts": "git's lock looked for (`indexLocked`), with the TUI's look (SD-T4)",
  "src/tui/workspace/git/views/panel/gitview.ts": "a file read for its diff (`readForDiff`), a key's own: kept",
  "src/tui/workspace/vaults/vaults.ts":
    "whether a tab's file, or one a switch opens or offers a peek at, is there: not moved yet (SD-T8's Open)",
};

/** Whether `check:boundary` holds a tree to the inventory: always, but for a test's small tree that asks not to be. */
export const inventoryHeld = (argv = process.argv): boolean => !argv.includes("--no-inventory");

/** A file of the slow-disk inventory: a read of its own (`diskReadsOf`) where it isn't listed (`DISK_READERS`), or
 *  listed where it makes none. */
export function diskReadViolations(from: string, text: string): string[] {
  const listed = Object.hasOwn(DISK_READERS, from);
  if (!listed && !(SEAM_READERS as readonly string[]).includes(from)) return [];
  const reads = diskReadsOf(text);
  if (reads.length && !listed)
    return [
      `${from}: reads the disk itself (${reads.join(", ")}): the slow-disk inventory reads through ${DISK_SEAM} (SD-D10), or DISK_READERS lists it, with why`,
    ];
  if (!reads.length && listed)
    return [
      `${from}: reads nothing of the disk itself, but DISK_READERS lists it (${DISK_READERS[from]}): take its entry out`,
    ];
  return [];
}

/** The seam and the inventory's files not in the tree at `root`: moved or renamed, each entry to follow its file. */
export function inventoryGone(root: string): string[] {
  const gone = [DISK_SEAM, ...SEAM_READERS, ...Object.keys(DISK_READERS)].filter((f) => !existsSync(join(root, f)));
  return gone.map((f) =>
    f === DISK_SEAM
      ? `${f}: the seam the slow-disk inventory reads through (SD-D10), but not there (moved or renamed: DISK_SEAM follows it)`
      : `${f}: in the slow-disk inventory, but not there (moved or renamed: its entry follows it)`,
  );
}
