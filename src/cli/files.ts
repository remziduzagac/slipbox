// The CLI's file commands: a note or folder moved (17.15, 18.3), copied, deleted to the trash and restored (18.4);
// and every command whose edits are a rename's plan (7.2) — a heading renamed, the relink, the converter, an undo,
// a saved plan applied — previewed with --dry-run, saved with --plan (20.18), or carried out.

import { statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { isPointer } from "../core/pointer.ts";
import { landsInside, readText } from "../core/fsutil.ts";
import { openVault } from "../core/reach.ts";
import {
  type Applied,
  applyPlan,
  loggedRenames,
  moveTarget,
  outside,
  planFolderMove,
  planHeadingRename,
  planNoteRename,
  planRelink,
  planUndo,
  planVaultFolderMove,
  RenameError,
  type RenamePlan,
} from "../core/rename.ts";
import { planConvert } from "../core/convert.ts";
import {
  copyPath,
  emptyTrash,
  FileOpError,
  linksInto,
  listTrash,
  restorePath,
  type TrashItem,
  trashPath,
} from "../core/files.ts";
import { forgetPlan, listPlans, loadPlan, type SavedPlan, savePlan } from "../core/plans.ts";
import { isInside, isVaultRoot, recordLocation, rootAt } from "../core/vault.ts";
import { has, UsageError } from "./args.ts";
import { notIndexedSaid } from "../core/graph.ts";
import {
  EXIT,
  CliError,
  type Session,
  type Result,
  type Handler,
  requireArg,
  resolveNote,
  notIndexed,
} from "./common.ts";

/** Files and folders moved, copied, deleted and restored; the commands whose edits are a rename's plan. */
export const FILE_COMMANDS: Record<string, Handler> = {
  mv(s, rest) {
    const what = requireArg(rest, "note or folder");
    const to = destArg(s, rest[1], true);
    if (!to) throw new UsageError("missing the new path (mv <note|folder> <new-path>)");
    // A folder moves with everything in it, every link to any of it fixed (18.3).
    const dir = folderArg(s, what);
    // A vault nested in this one moves as a vault (18.7): links into it by path fixed, its id kept.
    // Into a folder that's there, or named with a `/` (DF-D4): the name kept.
    if (dir !== null && isVaultRoot(join(s.loc.root, dir)))
      return renameResult(s, () => planVaultFolderMove(s.graph, dir, moveTarget(s.graph, dir, to)));
    if (dir !== null) return renameResult(s, () => planFolderMove(s.graph, dir, moveTarget(s.graph, dir, to)));
    const rel = resolveNote(s, what, false);
    return renameResult(s, () => planNoteRename(s.graph, rel, moveTarget(s.graph, rel, to)));
  },

  cp(s, rest) {
    const what = requireArg(rest, "note or folder");
    const rel = folderArg(s, what) ?? resolveNote(s, what, false);
    // Into a folder that's there, or named with a `/`, as mv (DF-D20, DF-D21); into its own, beside it as
    // name-copy, as a paste there makes one.
    const dest = destArg(s, rest[1], true);
    const to = dest === undefined ? undefined : moveTarget(s.graph, rel, dest);
    try {
      const r = copyPath(s.graph, rel, to !== dest && to === rel ? undefined : to);
      // Where `walk.exclude` leaves the copy out (D246): made, and said that the vault never indexes it.
      const left = notIndexed(s, join(s.loc.root, r.to), r.dir);
      return {
        data: { ...r, ...(left ? { notIndexed: left } : {}) },
        human: `copied ${r.from} → ${r.to}${notIndexedSaid(left)}\n`,
      };
    } catch (err) {
      if (err instanceof FileOpError) throw new CliError(err.message, EXIT.refused);
      throw err;
    }
  },

  rm(s, rest) {
    const what = requireArg(rest, "note or folder");
    const rel = folderArg(s, what) ?? resolveNote(s, what, false);
    const breaking = linksInto(s.graph, rel);
    if (breaking) s.warnings.push(`${breaking} link${breaking === 1 ? "" : "s"} from other notes to ${rel} will break`);
    if (has(s.args, "dry-run"))
      return {
        data: { path: rel, dryRun: true, breaking, trashed: null },
        human: `would delete ${rel} to the trash\n`,
      };
    try {
      const item = trashPath(s.graph, s.loc, rel);
      return {
        data: { path: rel, dryRun: false, breaking, trashed: item },
        human: `deleted ${rel} to the trash (slipbox trash restore ${item.id})\n`,
      };
    } catch (err) {
      if (err instanceof FileOpError) throw new CliError(err.message, EXIT.refused);
      throw err;
    }
  },

  trash(s, rest) {
    const sub = rest[0] ?? "list";
    const row = (i: TrashItem) => `${i.at.slice(0, 16).replace("T", " ")}  ${i.shown}${i.dir ? "/" : ""}  (${i.id})\n`;
    const yes = has(s.args, "yes");
    if (yes && sub !== "empty") throw new UsageError("--yes is for trash empty");
    if (sub === "list") {
      const items = listTrash(s.loc);
      return { data: items, human: items.length ? items.map(row).join("") : "the trash is empty\n" };
    }
    // Emptied for good (DF-D14): listed first, as uninstall lists; removed only with --yes.
    if (sub === "empty") {
      if (rest[1] !== undefined) throw new UsageError("trash empty takes no item: it empties the whole trash");
      const items = yes ? emptyTrash(s.loc) : listTrash(s.loc);
      const n = `${items.length} item${items.length === 1 ? "" : "s"}`;
      const human = !items.length
        ? "the trash is empty\n"
        : yes
          ? `removed for good, ${n}:\n${items.map((i) => `  ${row(i)}`).join("")}`
          : `removes for good, ${n}:\n${items.map((i) => `  ${row(i)}`).join("")}nothing removed yet: again with --yes to remove these\n`;
      return { data: { removed: yes && items.length > 0, items }, human };
    }
    if (sub !== "restore") throw new UsageError(`trash: unknown subcommand ${sub} (list, restore <item>, empty)`);
    const which = rest[1];
    if (!which) throw new UsageError("trash restore needs an item: its id or its path (slipbox trash lists them)");
    try {
      const item = restorePath(s.graph, s.loc, which);
      return { data: item, human: `restored ${item.shown}\n` };
    } catch (err) {
      if (err instanceof FileOpError)
        throw new CliError(err.message, err.message.startsWith("nothing") ? EXIT.notFound : EXIT.refused);
      throw err;
    }
  },

  "rename-heading"(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"), false);
    const [, heading, to] = rest;
    if (heading === undefined || to === undefined)
      throw new UsageError("rename-heading takes the note, the heading and its new name");
    return renameResult(s, () => planHeadingRename(s.graph, rel, heading, to));
  },

  relink(s, rest) {
    const rels = rest[0] ? [resolveNote(s, rest[0])] : undefined;
    return renameResult(s, () => planRelink(s.graph, rels));
  },

  // The converter (20.1): wikilinks, and links from the vault's root, made relative paths — a note's,
  // or every note's. What it can't decide is left as written, and said.
  "convert-links"(s, rest) {
    const rels = rest[0] ? [resolveNote(s, rest[0])] : undefined;
    return renameResult(s, () => planConvert(s.graph, rels));
  },

  async undo(s) {
    // Nothing to undo here (none at all, or only another branch's): said as planUndo says it, exit 3.
    if (!loggedRenames(s.graph).length) {
      try {
        planUndo(s.graph);
      } catch (err) {
        throw new CliError((err as Error).message, EXIT.notFound);
      }
    }
    // A folder's rename taken back: the machine's list learns its name again.
    return relearnRenamedRoots(await renameResult(s, () => planUndo(s.graph)));
  },

  // A plan saved by --plan (20.18), applied: refused, nothing written, when any of its files changed
  // since it was made. --dry-run shows it, and says whether it's still good. With no id, the plans
  // waiting, newest first.
  async apply(s, rest) {
    if (!rest[0]) {
      const waiting = listPlans();
      return {
        data: waiting.map((p) => ({
          id: p.id,
          made: p.made,
          root: p.root,
          command: p.command,
          kind: kindWord(p.plan.kind),
          from: p.plan.from,
          to: p.plan.to,
          files: p.plan.files.length,
        })),
        human:
          waiting
            .map(
              (p) =>
                `${p.id}  ${p.made.slice(0, 16).replace("T", " ")}  ${p.command} ${p.plan.from}${p.plan.to ? ` → ${p.plan.to}` : ""}  (${p.plan.files.length} file${p.plan.files.length === 1 ? "" : "s"}, ${p.root})\n`,
            )
            .join("") || "no plans waiting\n",
      };
    }
    const saved = loadPlan(rest[0]);
    if (!saved) throw new CliError(`no plan ${rest[0]} (slipbox apply lists those waiting)`, EXIT.notFound);
    const g = openVault(saved.root);
    // Each file shown by where it is, never by what the plan says of it.
    for (const f of saved.plan.files) f.shown = g.shownPath(f.abs);
    const stale = saved.plan.files.filter((f) => {
      try {
        return readText(f.abs).text !== f.text;
      } catch {
        return true;
      }
    });
    if (has(s.args, "dry-run")) {
      if (stale.length)
        s.warnings.push(
          `stale: ${stale.map((f) => f.shown).join(", ")} changed since it was planned — applying it would be refused`,
        );
      const out = outside(g, saved.plan);
      if (out) s.warnings.push(`${out} — applying it would be refused`);
      return renameResult(s, () => saved.plan, g);
    }
    // A saved `name` applied: the machine's list learns the new name, as `name` itself teaches it.
    const r = relearnRenamedRoots(await renameResult(s, () => saved.plan, g));
    forgetPlan(saved.id);
    return r;
  },
};

/**
 * Where a move or copy goes: a path in this root, from it — or from the current folder when it says so
 * (./, ../), or the filesystem's when absolute, as mkdir and write --create take one. A pointer to
 * elsewhere is refused: a file moves within its own root. `into`, a move's (DF-D4): a folder is a place
 * to go — `.` and `..` the current folder and its parent, the root itself `/` — not refused.
 */
function destArg(s: Session, to: string | undefined, into = false): string | undefined {
  if (!to) return to;
  if (isPointer(to))
    throw new CliError(`${to}: a destination is a path, in the file's own folder — not a pointer`, EXIT.refused);
  const fromHere = into ? /^\.\.?(\/|$)/ : /^\.\.?\//;
  const abs = to.startsWith("/") ? to : fromHere.test(to) ? join(s.io.cwd, to) : join(s.loc.root, to);
  const rel = relative(s.loc.root, abs).split(sep).join("/");
  if ((!rel && !into) || !isInside(s.loc.root, abs))
    throw new CliError(`${to} is outside the vault (${s.loc.root})`, EXIT.refused);
  // Through a link out of the vault, followed or not, in home too: said as the TUI's move and copy say it (VV-D6).
  if (!landsInside(s.loc.root, abs)) throw new CliError(`${rel} would land outside the vault`, EXIT.refused);
  if (!rel) return "/";
  return to.endsWith("/") ? `${rel}/` : rel;
}

/** A folder of the root named on the command line (from cwd, or the root), or null. */
function folderArg(s: Session, arg: string): string | null {
  for (const abs of [arg.startsWith("/") ? arg : join(s.io.cwd, arg), join(s.loc.root, arg)]) {
    if (!isInside(s.loc.root, abs) || abs === s.loc.root) continue;
    try {
      if (statSync(abs).isDirectory()) return relative(s.loc.root, abs);
    } catch {}
  }
  return null;
}

/** A rename's plan (7.2), or, without --dry-run, the rename done. */
export async function renameResult(s: Session, plan: () => RenamePlan, g = s.graph): Promise<Result> {
  // A code file links from its comments (16.10): its grammar loaded first, so a move finds those too (20.19).
  await g.loadGrammars();
  let p: RenamePlan;
  let applied: Applied | null = null;
  let saved: SavedPlan | null = null;
  try {
    p = plan();
    // Two steps (20.18): the plan saved, tied to each file as it is now, for `slipbox apply` to write.
    if (has(s.args, "plan")) saved = savePlan(g.root, s.args.positional[0] ?? "", p);
    else if (!has(s.args, "dry-run")) {
      applied = applyPlan(g, p);
      for (const [, to] of p.vaults ?? []) recordLocation(rootAt(to)); // the machine's list follows
    }
  } catch (err) {
    if (err instanceof RenameError) throw new CliError(err.message, EXIT.refused);
    throw err;
  }
  s.warnings.push(
    ...p.warnings,
    ...p.skipped.map((x) => `${x.shown}:${x.line}: ${x.reason}`),
    ...(p.ambiguous ?? []).map(
      (a) =>
        `${a.shown}:${a.line}: ${a.written} matches ${a.candidates.length} notes (${a.candidates.join(", ")}) — left as it is: write it as a path, or pick one in the TUI`,
    ),
  );
  const links = p.files.reduce((n, f) => n + f.edits.length, 0);
  // A note or folder moved where `walk.exclude` leaves it out (D246): said after where it goes, done or to be done.
  const left =
    p.move && (p.kind === "note" || p.kind === "folder")
      ? g.notIndexed(relative(g.root, p.move.to).split(sep).join("/"), p.move.dir)
      : null;
  const verb = p.undo
    ? applied
      ? {
          note: "renamed",
          folder: "moved folder",
          vault: "renamed folder",
          relink: "undid the relink of",
          "make-vault": "",
          "unmake-vault": "",
          heading: "renamed heading",
          convert: "undid the conversion of",
          replace: "undid the replace of",
        }[p.kind]
      : {
          note: "would rename",
          folder: "would move folder",
          vault: "would rename folder",
          relink: "would undo the relink of",
          "make-vault": "",
          "unmake-vault": "",
          heading: "would rename heading",
          convert: "would undo the conversion of",
          replace: "would undo the replace of",
        }[p.kind]
    : applied
      ? {
          note: "renamed",
          folder: "moved folder",
          vault: "renamed folder",
          relink: "relinked",
          "make-vault": "made",
          "unmake-vault": "made",
          heading: "renamed heading",
          convert: "converted",
          replace: "replaced",
        }[p.kind]
      : {
          note: "would rename",
          folder: "would move folder",
          vault: "would rename folder",
          relink: "would relink",
          "make-vault": "would make",
          "unmake-vault": "would make",
          heading: "would rename heading",
          convert: "would convert",
          replace: "would replace",
        }[p.kind];
  const head = p.undo
    ? p.kind === "relink" || p.kind === "convert"
      ? `${verb} ${p.to}`
      : p.kind === "replace"
        ? `${verb} ${JSON.stringify(p.to)} with ${JSON.stringify(p.from)}`
        : `${verb} ${p.from} back to ${p.to}${notIndexedSaid(left)}`
    : p.kind === "replace"
      ? `${verb} ${JSON.stringify(p.from)} with ${JSON.stringify(p.to)}`
      : p.kind === "relink" || p.kind === "convert"
        ? `${verb} ${p.from}`
        : p.kind === "make-vault"
          ? `${verb} ${p.from}/ a vault of its own${p.to !== p.from ? `, called ${p.to}` : ""}`
          : p.kind === "unmake-vault"
            ? `${verb} ${p.from}/ part of ${p.to}`
            : `${verb} ${p.from} → ${p.to}${notIndexedSaid(left)}`;
  const human = [
    `${head}: ${links} change${links === 1 ? "" : "s"} in ${p.files.length} file${p.files.length === 1 ? "" : "s"}${saved ? ` — planned: slipbox apply ${saved.id} writes it (refused if any of these files changes first)` : ""}`,
    ...p.files.flatMap((f) => f.edits.map((e) => `  ${f.shown}:${e.line}\n    - ${e.before}\n    + ${e.after}`)),
    "",
  ].join("\n");
  return {
    data: {
      kind: kindWord(p.kind),
      from: p.from,
      to: p.to,
      dryRun: !applied,
      move: p.move,
      ...(left ? { notIndexed: left } : {}),
      files: p.files.map((f) => ({ path: f.shown, abs: f.abs, ...s.rootOf(f.abs), edits: f.edits })),
      warnings: p.warnings,
      skipped: p.skipped,
      ...(p.ambiguous ? { ambiguous: p.ambiguous } : {}),
      written: applied?.written ?? [],
      ...(p.undo ? { undo: { id: p.undo.id, at: p.undo.at } } : {}),
      ...(saved ? { plan: { id: saved.id, made: saved.made } } : {}),
    },
    human,
  };
}

/**
 * A folder's rename written (`undo`, `apply`): the machine's list learns the name its `.slipbox/` holds
 * now, as `name` teaches it — else pointers by that name fail elsewhere.
 */
function relearnRenamedRoots(r: Result): Result {
  const d = r.data as { kind: string; dryRun: boolean; files: { abs: string }[] };
  if (d.kind === "root" && !d.dryRun)
    for (const f of d.files)
      if (f.abs.endsWith(`${sep}.slipbox${sep}config.toml`)) recordLocation(rootAt(dirname(dirname(f.abs))));
  return r;
}

/**
 * A change's kind as the JSON says it (DF-D9): "root" where the code, and the logs it keeps, say vault —
 * a vault's naming `root`, `init`'s and `deinit`'s `make-root` and `unmake-root`. Values agents and scripts read,
 * kept when what's printed for a person came to say vault (VV-D1).
 */
function kindWord(kind: RenamePlan["kind"]): string {
  return kind === "vault"
    ? "root"
    : kind === "make-vault"
      ? "make-root"
      : kind === "unmake-vault"
        ? "unmake-root"
        : kind;
}
