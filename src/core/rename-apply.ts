// A plan carried out (7.1–7.3): every file it touches still as it was planned from, then the edits, then the move,
// the index and the redirects following; logged, so it can be undone (7.4) — the undo a plan of its own.

import { randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, renameSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { classify } from "./filetypes.ts";
import { atomicWrite, entryAt, entryInside, landsInside, readText, realTarget } from "./fsutil.ts";
import type { Graph } from "./graph.ts";
import { trashVaultMarker } from "./files.ts";
import { contentHash } from "./redirects.ts";
import { changedSpan, forgetRename, type LoggedRename, logRename, readRenames } from "./rename-log.ts";
import { forgetRoot } from "./registry.ts";
import { openVault } from "./reach.ts";
import { recordFolder } from "./folders.ts";
import { findVaultRoot, initVault, isInside } from "./vault.ts";
import {
  RenameError,
  type FileChange,
  type RenamePlan,
  dirtyTrees,
  mayRewrite,
  relinkSaid,
  walkSkips,
  sameEntry,
  whereItLeads,
} from "./rename-plan.ts";
import { real } from "./rename-links.ts";
import { isLink, moveLink } from "./symlinks.ts";

// -------------------------------------------------------------------------------------------
// Undoing (7.4)

/** The vault's renames that can be undone here — made on this branch — newest last (its log). */
export function loggedRenames(g: Graph): LoggedRename[] {
  const branch = g.branchNow();
  return readRenames(g.loc).filter((x) => x.branch === undefined || x.branch === branch);
}

/**
 * Undo the vault's last rename, move or relink (7.4): the newest in its log, as a plan of its own —
 * each file it rewrote given back the text it had, what moved moved back — so it's previewed and
 * carried out as a rename is, and the index, redirects and open notes follow it the same way.
 * Refused when a file it wrote has changed since, or what moved isn't where it went.
 */
export function planUndo(g: Graph): RenamePlan {
  // The newest made on this branch (5.9): one made on another is that branch's to undo.
  const all = readRenames(g.loc);
  const branch = g.branchNow();
  const r = all.filter((x) => x.branch === undefined || x.branch === branch).at(-1);
  if (!r) {
    const other = all.at(-1);
    if (other)
      throw new RenameError(
        `nothing to undo on ${branch ? `branch ${branch}` : "this checkout"}: the last rename was made on ${other.branch ? `branch ${other.branch}` : "a detached HEAD"}`,
      );
    throw new RenameError("nothing to undo: no rename, move, relink or replace has been done in this vault");
  }
  const what =
    r.kind === "relink"
      ? "relink"
      : r.kind === "convert"
        ? "conversion to path links"
        : r.kind === "replace"
          ? `replace of ${r.from}`
          : r.kind === "folder"
            ? `move of ${r.from}/`
            : r.kind === "vault"
              ? `folder's naming as ${r.to}`
              : `rename of ${r.from}`;
  const files: FileChange[] = [];
  for (const f of r.files) {
    let now: string;
    try {
      now = readText(f.abs).text;
    } catch {
      throw new RenameError(`${f.shown} isn't there any more: the ${what} can't be undone`);
    }
    if (contentHash(now) !== f.hash) throw new RenameError(`${f.shown} has changed since: the ${what} can't be undone`);
    const edits = f.edits.map((e) => ({ line: e.line, before: e.after, after: e.before }));
    files.push({
      abs: f.abs,
      shown: f.shown,
      vault: f.vault,
      edits,
      text: now,
      next: now.slice(0, f.at) + f.was + now.slice(f.at + f.length),
      ...(f.also ? { also: f.also } : {}),
    });
  }
  // A link moved as a link moves back as one (D?1); anything else, a link now where it went among them, as it moved.
  const move = r.move
    ? { from: r.move.to, to: r.move.from, dir: r.move.dir, ...(r.move.link ? { link: true } : {}) }
    : null;
  if (move && !(move.link ? entryAt : existsSync)(move.from))
    throw new RenameError(`${relative(g.root, move.from)} isn't there any more: the ${what} can't be undone`);
  if (move && entryAt(move.to) && !sameEntry(move.from, move.to))
    throw new RenameError(`${relative(g.root, move.to)} exists again: the ${what} can't be undone`);
  // Back only inside the vault: a link that leads out of it now, where the folder was, isn't moved through (VV-D6).
  const out = outside(g, { files, move, vaults: r.vaults });
  if (out) throw new RenameError(`${out}: the ${what} can't be undone`);
  const back = (pairs: [string, string][]) => pairs.map(([a, b]): [string, string] => [b, a]);
  const warnings = [...dirtyTrees(files.map((f) => f.abs)), ...relinkSaid(move, r.to, r.from)];
  return {
    kind: r.kind,
    from: r.to,
    to: r.from,
    move,
    moves: back(r.moves),
    vaults: back(r.vaults),
    files,
    warnings,
    skipped: [],
    undo: { id: r.id, at: r.at, made: r.made ?? null },
  };
}

// -------------------------------------------------------------------------------------------
// Applying

export interface Applied {
  written: string[];
  moved: { from: string; to: string } | null;
  /** What was done but not all of it: a link moved whose answer couldn't be kept for its new place (D?1). */
  warnings: string[];
}

/**
 * What of a plan would land out of where it may (VV-D6), said; null when nothing would. Every file it writes where
 * `mayRewrite` allows; what moves, from and to, inside the vault by its real path — a link planned as one by its entry
 * (`entryInside`, D?1), but one a vault moves with, whose place is its real path — as a folder made a vault or a vault
 * made a plain folder.
 */
export function outside(
  g: Graph,
  plan: Pick<RenamePlan, "files" | "move" | "makeVault" | "unmakeVault" | "vaults">,
): string | null {
  for (const f of plan.files)
    if (!mayRewrite(g, f.abs)) return `${g.shownPath(f.abs)}: ${whereItLeads(g, f.abs)}, where nothing is written`;
  // A link planned as one by its entry (D?1); a link that wasn't (put where something else went) by where it leads.
  if (plan.move && !entryInside(g.root, plan.move.from, movesAsLink(plan)))
    return `${g.shownPath(plan.move.from)} resolves outside the vault`;
  // What a link moved as a link lands as is its own entry, in its folder (on a disk that ignores case, the very one).
  const to = plan.move && movesAsLink(plan) ? dirname(plan.move.to) : plan.move?.to;
  const ends = [to, plan.makeVault?.root, plan.unmakeVault?.root];
  for (const end of ends) if (end && !landsInside(g.root, end)) return `${g.shownPath(end)} resolves outside the vault`;
  return null;
}

/** Whether a plan's move moves a link as a link (D?1): planned as one, a link still, and no vault moving with it. */
function movesAsLink(plan: Pick<RenamePlan, "move" | "vaults">): boolean {
  return !!plan.move?.link && !plan.vaults?.length && isLink(plan.move.from);
}

/**
 * Carry a plan out: every file it touches still as it was planned from (else nothing is written),
 * then the edits, then the move. The vault's index and redirects follow. Nothing is written where
 * a link leads it out of the vault (`outside`): a plan saved, or one undone, is checked as it's carried out.
 */
export function applyPlan(g: Graph, plan: RenamePlan): Applied {
  const out = outside(g, plan);
  if (out) throw new RenameError(`${out}; nothing changed`);
  /** The files that start with a byte order mark: a plan's texts are read without it, and it's written back. */
  const bom = new Set<string>();
  for (const f of plan.files) {
    let now: string;
    try {
      const d = readText(f.abs);
      now = d.text;
      if (d.bom) bom.add(f.abs);
    } catch {
      throw new RenameError(`${f.shown} can't be read any more; nothing changed`);
    }
    if (contentHash(now) !== contentHash(f.text))
      throw new RenameError(`${f.shown} changed since the preview; nothing changed — plan again`);
  }
  const text = (f: FileChange) => (bom.has(f.abs) ? `\uFEFF${f.next}` : f.next);
  const mv = plan.move;
  if (mv && entryAt(mv.to) && !sameEntry(mv.from, mv.to)) throw new RenameError(`${mv.to} exists now; nothing changed`);
  /** Where a file of the plan is written: at its new place when it moves. */
  const dest = (fileAbs: string) => {
    if (!mv) return fileAbs;
    if (fileAbs === mv.from) return mv.to;
    return mv.dir && fileAbs.startsWith(`${mv.from}/`) ? mv.to + fileAbs.slice(mv.from.length) : fileAbs;
  };
  const written: string[] = [];
  /** The first folder the move made to hold it, if it made any: an undo takes it away again, empty. */
  let made: string | null = null;
  /** A link planned as one moves as a link (D?1): its entry, its answer with it, what it leads to staying. */
  const link = movesAsLink(plan);
  const warnings: string[] = [];
  /** The link moved, its answer not kept where it is now: not followed there, so the index is walked again. */
  let unfollowed = false;
  /** What moves, moved before anything is written — a link as a link: if it can't be, nothing has changed, the folders
   *  made for it gone. */
  const moveFirst = (from: string, to: string) => {
    try {
      if (!link) renameSync(from, to);
      else {
        const lost = moveLink(from, to);
        if (lost) warnings.push(lost);
        unfollowed = !!lost;
      }
    } catch (err) {
      for (let d = dirname(to); made && isInside(made, d); d = dirname(d)) {
        try {
          rmdirSync(d);
        } catch {
          break;
        }
      }
      throw new RenameError(
        `${g.shownPath(from)} can't be moved (${(err as NodeJS.ErrnoException).code ?? err}); nothing changed`,
      );
    }
  };
  // Where each file is written, found before anything moves: through a link it's reached by, never over it — where
  // it was read and checked (`outside`), as a link moving with a folder may lead elsewhere after. What the folder's
  // move takes along, there.
  const fromReal = mv?.dir && !link ? realTarget(mv.from) : null;
  const toReal = fromReal && mv ? realTarget(mv.to) : "";
  // Each written where it can be, its folder writable (and searched), before anything moves: else nothing is.
  const at = new Map<string, string>();
  for (const f of plan.files) {
    const t = realTarget(f.abs);
    at.set(
      f.abs,
      fromReal && (t === fromReal || t.startsWith(`${fromReal}${sep}`)) ? toReal + t.slice(fromReal.length) : t,
    );
    if (mv && !mv.dir && !link && f.abs === mv.from) continue; // written at its new place
    try {
      accessSync(dirname(t), constants.W_OK | constants.X_OK);
    } catch (err) {
      throw new RenameError(
        `${f.shown} can't be written where it is (${(err as NodeJS.ErrnoException).code ?? err}); nothing changed`,
      );
    }
  }
  // A file moves last, after the edits (a link's, first): the folder it leaves, and the one it goes into, writable too.
  if (mv && !mv.dir && !link) {
    let into = dirname(mv.to);
    while (!existsSync(into) && dirname(into) !== into) into = dirname(into);
    for (const dir of [dirname(mv.from), into]) {
      try {
        accessSync(dir, constants.W_OK | constants.X_OK);
      } catch (err) {
        throw new RenameError(
          `${g.shownPath(mv.from)} can't be moved (${(err as NodeJS.ErrnoException).code ?? err}); nothing changed`,
        );
      }
    }
  }
  /** The folder what moves goes into, made first: if it can't be (a file in the way, a folder shut), nothing is. */
  const makeInto = (to: string) => {
    try {
      made = mkdirSync(dirname(to), { recursive: true }) ?? null;
    } catch (err) {
      throw new RenameError(
        `${dirname(to)} can't be made (${(err as NodeJS.ErrnoException).code ?? err}); nothing changed`,
      );
    }
  };
  // A folder moves whole — everything in it, whatever the walk lists — before its files' edits.
  if (mv?.dir) {
    makeInto(mv.to);
    moveFirst(mv.from, mv.to);
  }
  /** A case-only rename on a case-insensitive disk: the file written at its new name is the old one. */
  const oneFile = !!mv && !mv.dir && sameEntry(mv.from, mv.to);
  if (mv && !mv.dir) makeInto(mv.to);
  // A file's link moves first too, as a folder does: if it can't be made where it goes, nothing is written.
  if (mv && !mv.dir && link) moveFirst(mv.from, mv.to);
  for (const f of plan.files) {
    if (mv && !mv.dir && f.abs === mv.from) continue; // written at its new place, below
    atomicWrite(at.get(f.abs)!, text(f));
    written.push(dest(f.abs), ...(f.also ?? []).map(dest)); // its other names indexed again too
  }
  if (mv && !mv.dir) {
    const own = plan.files.find((f) => f.abs === mv.from);
    if (link) {
      if (own) atomicWrite(at.get(own.abs)!, text(own));
    } else if (own) {
      atomicWrite(mv.to, text(own));
      if (!oneFile) unlinkSync(mv.from);
    } else renameSync(mv.from, mv.to);
    written.push(mv.to);
  }
  // A folder made a vault, or a vault a plain folder (18.11): its .slipbox/ made, or put in the
  // trash; the parent's walk, and so its index, changes where the boundary was.
  // Other vaults' files written: their indexes learn it now, as when they're next opened — the
  // backlinks they give, and the next plan, read the links they hold now.
  const others = new Set<string>();
  for (const abs of [...written, ...at.values()]) {
    const root = findVaultRoot(abs);
    if (root && real(root) !== real(g.root)) others.add(root);
  }
  const reindexOthers = () => {
    for (const root of others) {
      try {
        openVault(root).ensureAll();
      } catch {}
    }
  };
  if (plan.makeVault || plan.unmakeVault) {
    if (plan.makeVault)
      initVault(plan.makeVault.root, plan.makeVault.name ?? undefined, { private: plan.makeVault.private });
    else {
      trashVaultMarker(g.loc, g.root, plan.unmakeVault!.root);
      forgetRoot(plan.unmakeVault!.root);
      recordFolder(plan.unmakeVault!.root); // its name gone with its .slipbox/ (21.6)
    }
    g.build(true, "lazy");
    reindexOthers();
    return { written, moved: null, warnings };
  }
  reindexOthers();
  // The vault's log (7.4): a rename carried out is logged, so it can be undone; an undo, forgotten.
  if (plan.undo) {
    forgetRename(g.loc, plan.undo.id);
    // The folders the rename made to hold what moved, if they're empty now.
    const gone: string[] = [];
    for (let d = mv ? dirname(mv.from) : null; plan.undo.made && d && isInside(plan.undo.made, d); d = dirname(d)) {
      try {
        rmdirSync(d);
        gone.push(relative(g.root, d));
      } catch {
        break;
      }
    }
    if (gone.length) g.dirs = g.dirs.filter((x) => !gone.includes(x));
  } else if (
    (plan.files.length || mv) &&
    (plan.kind === "note" ||
      plan.kind === "folder" ||
      plan.kind === "vault" ||
      plan.kind === "relink" ||
      plan.kind === "heading" ||
      plan.kind === "convert" ||
      plan.kind === "replace")
  ) {
    // Only one that changed something: an empty one would stand in front of the last real one, and
    // an undo would take back nothing.
    logRename(g.loc, {
      id: randomUUID(),
      at: new Date().toISOString(),
      kind: plan.kind,
      from: plan.from,
      to: plan.to,
      move: mv,
      made,
      branch: g.branchNow(),
      moves: plan.moves ?? [],
      vaults: plan.vaults ?? [],
      files: plan.files.map((f) => ({
        abs: dest(f.abs),
        shown: f.shown,
        vault: f.vault,
        edits: f.edits,
        hash: contentHash(f.next),
        ...changedSpan(f.text, f.next),
        ...(f.also ? { also: f.also.map(dest) } : {}),
      })),
    });
  }
  // Links to the old places still find the new ones (17.12); the vault's index follows.
  if (plan.moves?.length) {
    g.redirects?.add(plan.moves);
    g.moved(plan.moves);
  }
  for (const [from] of plan.moves ?? []) {
    if (g.notes.has(from)) g.removeFile(from);
    else g.removeAsset(from);
  }
  const touched = new Set([...written, ...(plan.moves ?? []).map(([, to]) => join(g.root, to))]);
  for (const abs of touched) {
    if (!isInside(g.root, abs)) continue;
    // Through a link moved without its answer: not followed at its new name, so not read (VV-D6).
    if (unfollowed && mv && (abs === mv.to || abs.startsWith(`${mv.to}/`))) continue;
    // A moved vault's files are its own, not this vault's (18.7); so are a nested root's (17.17),
    // reindexed with the others.
    if (plan.vaults?.some(([, to]) => abs === to || abs.startsWith(`${to}/`))) continue;
    const own = findVaultRoot(abs);
    if (own && real(own) !== real(g.root)) continue;
    const rel = relative(g.root, abs);
    // What the walk leaves out (`.slipbox/config.toml`, a naming's) isn't one of the root's files —
    // unless a link reached it (20.8).
    const key = rel.split(sep).join("/");
    if ((walkSkips(key) || !g.admits(key)) && !g.notes.has(key) && !g.reached.has(key)) continue;
    try {
      const st = statSync(abs);
      if (classify(rel, g.config.walk.extensions).group === "note")
        g.updateFile(rel, { rel, abs, size: st.size, mtimeMs: st.mtimeMs });
      else g.addAsset(rel);
    } catch {}
  }
  // A plain folder's (one holding a root nested in it, too), not a root's own folder.
  if (mv?.dir && !plan.vaults?.some(([from]) => from === mv.from)) {
    const from = relative(g.root, mv.from);
    const to = relative(g.root, mv.to);
    g.dirs = [
      ...new Set(
        g.dirs
          .map((d) => (d === from || d.startsWith(`${from}/`) ? to + d.slice(from.length) : d))
          .concat(to.split("/").map((_, i, a) => a.slice(0, i + 1).join("/"))),
      ),
    ];
  }
  // A link moved without its answer isn't followed at its new name (VV-D6): the index as the walk has it now, never
  // read through it — the link a row of its own, not followed.
  if (unfollowed) g.build(true, "lazy");
  return { written, moved: mv ? { from: mv.from, to: mv.to } : null, warnings };
}
