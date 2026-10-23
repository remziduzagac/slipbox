// A plan carried out (7.1–7.3): every file it touches still as it was planned from, then the edits, then the move,
// the index and the redirects following; logged, so it can be undone (7.4) — the undo a plan of its own.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { classify } from "./filetypes.ts";
import { atomicWrite, entryInside, landsInside, readText, realTarget } from "./fsutil.ts";
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
  walkSkips,
  sameFile,
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
    });
  }
  const move = r.move ? { from: r.move.to, to: r.move.from, dir: r.move.dir } : null;
  if (move && !existsSync(move.from))
    throw new RenameError(`${relative(g.root, move.from)} isn't there any more: the ${what} can't be undone`);
  if (move && existsSync(move.to) && !sameFile(move.from, move.to))
    throw new RenameError(`${relative(g.root, move.to)} exists again: the ${what} can't be undone`);
  // Back only inside the vault: a link that leads out of it now, where the folder was, isn't moved through (VV-D6).
  const out = outside(g, { files, move, vaults: r.vaults });
  if (out) throw new RenameError(`${out}: the ${what} can't be undone`);
  const back = (pairs: [string, string][]) => pairs.map(([a, b]): [string, string] => [b, a]);
  const warnings = dirtyTrees(files.map((f) => f.abs));
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
 * `mayRewrite` allows; what moves, from and to, inside the vault by its real path — a link named itself by its entry
 * (`entryInside`, D?1) — as a folder made a vault or a vault made a plain folder.
 */
export function outside(
  g: Graph,
  plan: Pick<RenamePlan, "files" | "move" | "makeVault" | "unmakeVault" | "vaults">,
): string | null {
  for (const f of plan.files)
    if (!mayRewrite(g, f.abs))
      return `${g.shownPath(f.abs)}: a link leads it out of the vault, where nothing is written`;
  // A link named itself by its entry (D?1); one carrying vaults by where it leads, as a vault is known by its real path.
  const from = plan.move?.from;
  if (from && !(plan.vaults?.length ? landsInside : entryInside)(g.root, from))
    return `${g.shownPath(from)} resolves outside the vault`;
  const ends = [plan.move?.to, plan.makeVault?.root, plan.unmakeVault?.root];
  for (const end of ends) if (end && !landsInside(g.root, end)) return `${g.shownPath(end)} resolves outside the vault`;
  return null;
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
  if (mv && existsSync(mv.to) && !sameFile(mv.from, mv.to))
    throw new RenameError(`${mv.to} exists now; nothing changed`);
  /** Where a file of the plan is written: at its new place when it moves. */
  const dest = (fileAbs: string) => {
    if (!mv) return fileAbs;
    if (fileAbs === mv.from) return mv.to;
    return mv.dir && fileAbs.startsWith(`${mv.from}/`) ? mv.to + fileAbs.slice(mv.from.length) : fileAbs;
  };
  const written: string[] = [];
  /** The first folder the move made to hold it, if it made any: an undo takes it away again, empty. */
  let made: string | null = null;
  /** A link named itself moves as a link (D?1): its entry, its answer with it, what it leads to staying. */
  const link = !!mv && isLink(mv.from);
  const warnings: string[] = [];
  // Where each file is written, found before anything moves: through a link it's reached by, never over it — where
  // it was read and checked (`outside`), as a link moving with a folder may lead elsewhere after. What the folder's
  // move takes along, there.
  const fromReal = mv?.dir && !link ? realTarget(mv.from) : null;
  const toReal = fromReal && mv ? realTarget(mv.to) : "";
  const at = new Map<string, string>();
  for (const f of plan.files) {
    const t = realTarget(f.abs);
    at.set(
      f.abs,
      fromReal && (t === fromReal || t.startsWith(`${fromReal}${sep}`)) ? toReal + t.slice(fromReal.length) : t,
    );
  }
  // A folder moves whole — everything in it, whatever the walk lists — before its files' edits. A
  // file's folder is made first too: if it can't be (a file is in the way), nothing is written.
  if (mv?.dir) {
    made = mkdirSync(dirname(mv.to), { recursive: true }) ?? null;
    if (link) warnings.push(...said(moveLink(mv.from, mv.to)));
    else renameSync(mv.from, mv.to);
  }
  /** A case-only rename on a case-insensitive disk: the file written at its new name is the old one. */
  const oneFile = !!mv && !mv.dir && sameFile(mv.from, mv.to);
  if (mv && !mv.dir) {
    try {
      made = mkdirSync(dirname(mv.to), { recursive: true }) ?? null;
    } catch (err) {
      throw new RenameError(
        `${dirname(mv.to)} can't be made (${(err as NodeJS.ErrnoException).code ?? err}); nothing changed`,
      );
    }
  }
  for (const f of plan.files) {
    if (mv && !mv.dir && f.abs === mv.from) continue; // written at its new place, below
    atomicWrite(at.get(f.abs)!, text(f));
    written.push(dest(f.abs));
  }
  if (mv && !mv.dir) {
    const own = plan.files.find((f) => f.abs === mv.from);
    if (link) {
      warnings.push(...said(moveLink(mv.from, mv.to)));
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
  for (const abs of written) {
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
  return { written, moved: mv ? { from: mv.from, to: mv.to } : null, warnings };
}

/** A warning, as a list: none for null. */
const said = (warning: string | null): string[] => (warning ? [warning] : []);
