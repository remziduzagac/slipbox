// Renames and moves (17.15, with 7.1–7.3; blueprint/design/links.md § Renames and moves): a note or
// folder renamed or moved, with its links rewritten in every root this machine reaches; a root
// named — as byte-range edits at the positions the index recorded, never a re-serialised file
// (7.6). A plan is made first, to preview (7.2); it names the git trees that already have changes
// (7.3); applying it checks that no file it touches changed since.
//
// Here, the moves and the relink planned. A plan's shape is rename-plan.ts's, one link's rewriting
// rename-links.ts's; a folder named or made a vault is rename-vaults.ts's, a heading renamed
// rename-heading.ts's; carrying a plan out and undoing it, rename-apply.ts's. All of it is imported from here.

import { existsSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, parse, posix, relative, sep } from "node:path";
import { classify } from "../../../documents/model/filetypes.ts";
import { entryAt, entryInside, realTarget } from "../../../foundation/platform/fsutil.ts";
import type { Backlink, Graph, NoteEntry, ResolvedLink } from "../../graph/graph.ts";
import {
  extensionless,
  formatPathLink,
  normKey,
  pathForm,
  pathLink,
  type PathForm,
  pathNamed,
} from "../../links/links.ts";
import { readRoots } from "../../vaults/registry.ts";
import { openVault } from "../../links/reach.ts";
import {
  copyAvailable,
  folderIdentity,
  pointerName,
  pointerNaming,
  pointerWarnings,
  readFolders,
  travelTogether,
} from "../../vaults/folders.ts";
import { formatPointer, isPointer, parsePointer, resolvePointer } from "../../links/pointer.ts";
import { isLink, linkAnswer } from "../../vaults/symlinks.ts";
import { findVaultRoot, isHome, isInside } from "../../vaults/vault.ts";
import { holdsNotes } from "../../walk/walk.ts";
import {
  RenameError,
  type RenamePlan,
  Collector,
  dirtyTrees,
  relinkSaid,
  walkSkips,
  sameEntry,
} from "./rename-plan.ts";
import { type Site, NOTE_EXT, wikiTarget, rootOfPath, real, pathRetarget, mdTarget } from "./rename-links.ts";

export { RenameError, Collector, dirtyTrees } from "./rename-plan.ts";
export type { Edit, FileChange, RenamePlan, Ambiguous } from "./rename-plan.ts";
export { planVaultRename, planMakeVault, planUnmakeVault } from "./rename-vaults.ts";
export { loggedRenames, planUndo, applyPlan, outside } from "./rename-apply.ts";
export type { Applied } from "./rename-apply.ts";
export { planHeadingRename } from "./rename-heading.ts";

/**
 * A vault path as the user typed it: normalized, inside the vault, and not somewhere hidden. `holds`: what moves there
 * — a note or file, or a folder of them, never where the vault doesn't index it (a busy folder, VV-D8); a vault indexes
 * its own. `notes`: what moves puts a note directly in the folder it lands in (a note; a folder with one at its top).
 */
function cleanTarget(g: Graph, input: string, holds: "file" | "folder" | "vault", notes = false): string {
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
function checkSource(g: Graph, rel: string, vaults = false): boolean {
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

/** The folder `from` and every folder in it, each to where it goes under `to` (links to a folder, 21.2). */
function foldersMoving(g: Graph, from: string, to: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of [from, ...g.dirs])
    if (d === from || d.startsWith(`${from}/`)) out.set(d, `${to}${d.slice(from.length)}`);
  return out;
}

/**
 * The plan for moving files (`moves`: vault paths, old → new): each link to a moved file rewritten
 * from where its file will be, each moved note's relative links to what stays put rewritten from
 * where it will be.
 */
function planMove(
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

/**
 * A code or data file's own paths, moved from `fromRel` to `toRel` (D63): a comment's (16.10) and a data
 * file's links (16.15) written relative to the file, rewritten to reach what they reached from where it
 * will be, each in its own form, as a note's own relative links are. A comment's path the root's
 * fallback still reaches (`docs/x.md`, read from the root when nothing is there beside the file) and a
 * `/…` from the root are left, but into a root nested here (`crosses`), where `/` is that root's; a URL
 * too. `moving`: a target that moves with it (a vault path, or an absolute one), its own backlink's.
 */
function ownFileLinks(
  g: Graph,
  c: Collector,
  fromRel: string,
  toRel: string,
  crosses: boolean,
  moving: (path: string) => boolean,
): void {
  const data = classify(fromRel, g.config.walk.extensions).group === "data";
  const toAbs = join(g.root, toRel);
  for (const l of g.fileLinksOf(fromRel)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(l.target) || l.target.startsWith("#")) continue;
    const r = g.resolveLink(l, fromRel);
    if (
      (r.resolvedKind !== "note" && r.resolvedKind !== "file" && r.resolvedKind !== "folder") ||
      !r.path ||
      moving(r.path)
    )
      continue;
    const targetAbs = isAbsolute(r.path) ? r.path : join(g.root, r.path);
    // As written: a data file's value is its target; a comment's, its text (`util.ts:12:3` its path, the
    // line and column kept), the index's target being its path from the root.
    const written = data ? l.target : l.target.includes("#L") ? l.text.slice(0, l.text.indexOf(":")) : l.text;
    if (!written || (written.startsWith("/") && !crosses)) continue;
    if (!data && !crosses && !written.startsWith("/")) {
      // Read beside the file first, else from the root: left where that still lands on it.
      const beside = posix.normalize(posix.join(posix.dirname(toRel), written));
      const lands = !beside.startsWith("..") && g.known(beside) ? beside : posix.normalize(written);
      if (lands === r.path) continue;
    }
    c.edit(
      { abs: join(g.root, fromRel), kind: l.kind, target: written, line: l.line, column: l.column },
      relativeAs(written, toAbs, targetAbs),
      null,
    );
  }
}

/**
 * A path written relative to its file (`../docs/x.md`, `./user.yaml#/defs`), from `fileAbs`, reaching
 * `targetAbs`: `./` kept, an extension left off where it was, a folder's `/` and the fragment kept;
 * never encoded, since a comment or a data file's value isn't a URL.
 */
function relativeAs(written: string, fileAbs: string, targetAbs: string): string {
  const hash = written.indexOf("#");
  const frag = hash >= 0 ? written.slice(hash) : "";
  const path = hash >= 0 ? written.slice(0, hash) : written;
  let next = relative(dirname(fileAbs), targetAbs).split(sep).join("/") || ".";
  if (path.startsWith("./") && !next.startsWith("../")) next = `./${next}`;
  if (extensionless(path) && NOTE_EXT.test(next)) next = next.replace(NOTE_EXT, "");
  if (path.endsWith("/") && !next.endsWith("/")) next += "/";
  return next + frag;
}

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
function nestedRootEdits(
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

/** A link from another vault to a file of a moving vault, rewritten to where the file will be; null
 *  when it needs nothing (by the vault's name). */
function retargetInto(b: Backlink, oldAbs: string, newAbs: string): string | null {
  // A pointer names the folder, wherever it is (21.7): nothing to rewrite.
  if (isPointer(b.target)) return null;
  const wiki = b.kind === "wiki" || b.kind === "embed";
  if (pathForm(b.target)) {
    const byPath = pathRetarget(b.target, b.from, b.from, oldAbs, newAbs, wiki);
    if (byPath !== null) return byPath;
    // `/x.md`: the linking vault's root, kept so.
    if (!b.target.startsWith("/")) return null;
  }
  const linkRoot = findVaultRoot(b.from) ?? dirname(b.from);
  if (wiki) {
    // A vault path into a vault nested in the linking one (17.17): the new vault path.
    const ext = /\.[A-Za-z0-9]+$/.test(b.target) ? "" : NOTE_EXT;
    const p = relative(linkRoot, newAbs).split("\\").join("/");
    return (b.target.startsWith("/") ? "/" : "") + (ext ? p.replace(ext, "") : p);
  }
  if (b.target.startsWith("/")) {
    const hash = b.target.indexOf("#");
    return `/${relative(linkRoot, newAbs).split("\\").join("/")}${hash >= 0 ? b.target.slice(hash) : ""}`;
  }
  return mdTarget(b.target, b.from, newAbs, null);
}

/** The new target text of a link to a moved file, written in `linking` (which will be at `linkingAfter`). */
function retargetBacklink(
  g: Graph,
  b: Backlink,
  linking: string,
  linkingAfter: string,
  fromRel: string,
  toRel: string,
  aliases: Set<string>,
  oldName: string,
): string {
  const toAbs = join(g.root, toRel);
  const byPath = pathForm(b.target)
    ? pathRetarget(
        b.target,
        linking,
        linkingAfter,
        join(g.root, fromRel),
        toAbs,
        b.kind === "wiki" || b.kind === "embed",
      )
    : null;
  if (byPath) return byPath;
  if (b.kind === "wiki" || b.kind === "embed") {
    const name = posix.basename(b.target).replace(NOTE_EXT, "");
    // Written as an alias: still right after the rename.
    if (!b.target.includes("/") && aliases.has(normKey(name)) && normKey(name) !== normKey(oldName)) return b.target;
    const fromDir = isInside(g.root, linkingAfter) ? posix.dirname(relative(g.root, linkingAfter)) : null;
    // Moved into a root nested here: a name ends at its boundary, a path from the top reaches in (17.17).
    return wikiTarget(b.target, fromDir, toRel, g, fromRel, rootOfPath(linkingAfter) !== rootOfPath(toAbs));
  }
  return mdTarget(b.target, linkingAfter, toAbs, isInside(g.root, linkingAfter) ? g : null);
}

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
