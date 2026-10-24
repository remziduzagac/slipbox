// The commands of files and vaults (`note.*`, `folder.*`, `vault.*`, `trash.*`, `root.*`): notes and folders made,
// opened, moved, renamed, exported and deleted; vaults made, unmade and described; a root trusted.

import { type Run, withView } from "./actions.ts";
import { isPointer } from "../core/pointer.ts";
import { fileLink } from "./actions-links.ts";
import { join, dirname, isAbsolute, relative } from "node:path";
import { isInside, isNeverRoot, hasMarker, initVault, rootAt } from "../core/vault.ts";
import { classify } from "../core/filetypes.ts";
import { revert } from "./actions-edit.ts";
import { copyPath } from "../core/files.ts";
import { planHeadingRename, planVaultRename } from "../core/rename.ts";
import { folderIdentity, readFolders, recordFolder, copyAvailable } from "../core/folders.ts";
import { tildePath, rootLabel } from "../core/names.ts";
import { describeCap } from "../core/home.ts";
import { describeBackground, backgroundStatus } from "../core/autoindex.ts";
import { cacheDir, stateDir } from "../core/paths.ts";
import { statSync } from "node:fs";
import type { App } from "./app.ts";

/** Files and vaults: notes and folders made, opened, moved, renamed, exported and deleted; vaults made and switched; trust. */
export function fileActions(): Record<string, Run> {
  return {
    // New notes and folders: beside the current note, or in the explorer's selected folder.
    "note.create": (a, arg) => {
      if (!arg) return a.files.promptNewNote();
      const r = a.files.createNote(arg, a.files.newItemBase());
      if (r) a.open(r.open);
    },
    "folder.create": (a, arg) =>
      arg ? void a.files.createFolder(arg, a.files.newItemBase()) : a.files.promptNewFolder(),
    "note.export": (a, arg) => a.exporter.exportNote(arg || undefined),
    "note.export_cancel": (a) => {
      a.exporter.cancel();
    },
    "note.export_many": (a) => a.exporter.compose(),
    "note.open": (a, arg) => {
      if (!arg) return void a.run("switcher.open");
      // A pointer (21.10): the file it names, in its folder's copy here.
      if (isPointer(arg)) {
        const r = a.graph.resolveLink({ kind: "markdown", target: arg }, a.view?.buf.rel ?? "");
        if ((r.resolvedKind === "note" || r.resolvedKind === "file") && r.path) return a.open(r.path);
        return a.message(
          "warn",
          `${arg}: ${r.reason ?? (r.resolvedKind === "ambiguous" ? `matches ${r.candidates.join(", ")}` : "not found")}`,
        );
      }
      const r = a.graph.findNote(arg, a.loc.root);
      if (r.status === "resolved") return a.open(r.path);
      if (r.status === "ambiguous") return a.message("warn", `"${arg}" matches ${r.candidates.join(", ")}`);
      // A file by its whole path outside this vault: gone to, into its vault — Elsewhere's among them (VV-D3, VV-D4).
      if (isAbsolute(arg) && (a.loc.mode === "folder" || !isInside(a.loc.root, arg)) && isFile(arg)) return a.open(arg);
      // Any other file of the vault, by its path with its extension (16.4), as :e opens it in vim — from the vault's
      // top, or its whole path inside the vault.
      const rel = isAbsolute(arg) ? relative(a.loc.root, arg) : arg.replace(/^\.?\//, "");
      if (a.graph.filePaths().includes(rel)) return fileLink(a, rel);
      const abs = join(a.loc.root, rel);
      // Through a link not followed (VV-D6): never made the vault's unasked — opened, it asks first.
      if (rel && isInside(a.loc.root, abs) && isFile(abs) && a.following.blocked(abs)) return a.open(rel);
      // There on disk, but the vault hasn't heard of it yet (written a moment ago, the watcher not yet
      // told): the vault told now, as the watcher would, and it opened as its own.
      if (rel && isInside(a.loc.root, abs) && isFile(abs) && walked(a, rel)) {
        const isNote = classify(rel, a.config.walk.extensions).group === "note";
        a.watch.applyChanges({ changes: [{ rel, kind: "created", isNote }], rescan: false });
        return fileLink(a, rel);
      }
      // Git-ignored, or in a hidden folder: reached by opening it (20.8), it's the vault's from now on.
      if (rel && isInside(a.loc.root, abs) && a.graph.reachFile(rel, { keep: true }))
        return a.graph.notes.has(rel) ? a.open(rel) : fileLink(a, rel);
      // Left out and never reached (D249) — a busy folder (D237), `walk.exclude`, a vault of its own, home's skip list
      // (VV-D2): opened as the explorer opens its `⊘` row, by the row's path, and never indexed.
      if (rel && isInside(a.loc.root, abs) && isFile(abs)) return a.open(a.explorer.rowPath(abs));
      a.message("warn", `no note or file "${arg}"`);
    },
    // note, vault, app
    // Unsaved changes and the file as it was (DF-D6): yours thrown away only when you say so, autosave as it was; a file
    // that changed too is the conflict prompt's.
    "note.reload": (a) =>
      withView(a, (v) => {
        const buf = v.buf;
        if (!buf.dirty || buf.deleted || buf.changedOnDisk()) return a.watch.reloadBuffer(buf);
        a.overlays.confirm(
          `Discard your changes to ${a.displayName(buf)}? It's loaded from disk again: u brings them back.`,
          () => revert(a, buf),
        );
      }),
    // The Info view (3.19), the right panel's first: what the file on screen is; its button above the outline's.
    "note.info": (a) => a.panels.openRightView("info", "cycle"),
    "note.properties": (a) => a.properties.open(),
    "vault.reindex": (a) => {
      a.graph.build(true, "lazy");
      // What follows a build: the watcher, the background parse, search, the explorer and the layouts.
      a.watch.rebuilt();
      a.message("info", `reindexed ${a.graph.notes.size} notes in ${a.graph.stats.ms.toFixed(0)} ms`);
    },
    "note.delete": (a) => {
      const t = a.explorer.noteTarget();
      if (t) a.files.deleteItem(t);
    },
    "note.move": (a) => {
      const t = a.explorer.noteTarget();
      if (t) a.files.moveItem(t);
    },
    "note.yank": (a) => {
      const t = a.explorer.noteTarget();
      if (t) a.files.clipItem("copy", t);
    },
    "note.cut": (a) => {
      const t = a.explorer.noteTarget();
      if (t) a.files.clipItem("cut", t);
    },
    "folder.rename": (a) => {
      const f = a.explorer.folderTarget();
      if (f) a.files.renameItem(f);
    },
    "folder.move": (a) => {
      const f = a.explorer.folderTarget();
      if (f) a.files.moveItem(f);
    },
    "folder.delete": (a) => {
      const f = a.explorer.folderTarget();
      if (f) a.files.deleteItem(f);
    },
    "folder.yank": (a) => {
      const f = a.explorer.folderTarget();
      if (f) a.files.clipItem("copy", f);
    },
    "folder.cut": (a) => {
      const f = a.explorer.folderTarget();
      if (f) a.files.clipItem("cut", f);
    },
    "folder.paste": (a) => a.files.pasteItem(),
    "trash.restore": (a) => a.files.restoreLast(),
    "rename.undo": (a) => a.renaming.undo(),
    "vault.unmake": (a) => a.vaults.unmakeHere(),
    "note.copy": (a) =>
      withView(a, (v) => {
        if (!v.buf.rel) return a.message("warn", "only a note or file of this vault can be copied here");
        try {
          const r = copyPath(a.graph, v.buf.rel);
          a.open(r.to);
          a.message("info", `copied ${r.from} → ${r.to}`);
        } catch (err) {
          a.message("warn", (err as Error).message);
        }
      }),
    "trash.open": (a) => a.files.openTrash(),
    "trash.empty": (a) => a.files.openTrash(true),
    "vault.init": (a) => {
      // In a root, or home (VV-D2): the explorer's selected folder (or this note's) a root of its own (18.11).
      if (a.loc.mode !== "folder") return a.vaults.makeHere();
      const dir = a.loc.root;
      if (isNeverRoot(dir)) return a.message("warn", `${dir} can't have a .slipbox/: slipbox never indexes all of it`);
      a.vaults.choices(dir);
    },
    "note.rename": (a, arg) => {
      const t = a.explorer.noteTarget();
      if (!t) return;
      if (arg) return a.renaming.noteTo(t.rel, arg);
      a.renaming.prompt(t.rel);
    },
    "heading.rename": (a, arg) =>
      withView(a, (v) => {
        const rel = v.buf.rel;
        if (!rel || !a.graph.notes.has(rel))
          return a.message("warn", "only a note of this vault has its headings renamed with their links");
        // The section the cursor is in: the last heading at or above its line.
        const line = a.cursorLine(v);
        const h = [...(a.graph.entry(rel)?.headings ?? [])].reverse().find((x) => x.line <= line);
        if (!h) return a.message("warn", "no heading here: the cursor is above the first");
        if (arg) return a.renaming.preview(() => planHeadingRename(a.graph, rel, h.text, arg));
        a.renaming.promptHeading(rel, h.text);
      }),
    "vault.switch_save": (a) => a.vaults.chooseSwitch("save"),
    "vault.switch_discard": (a) => a.vaults.chooseSwitch("discard"),
    "vault.switch_stay": (a) => a.vaults.chooseSwitch("stay"),
    "folders.open": (a) => a.vaults.openFolders(),
    "folders.default": (a) => a.vaults.chooseDefaultCopy(),
    // A root's trust (23.x): the root you opened, or the shown file's project when it's elsewhere.
    "root.trust": (a) =>
      a.languages.trustRoot(a.languages.trustTarget(a.view ? dirname(a.view.buf.abs) : a.loc.root), true),
    "root.untrust": (a) =>
      a.languages.trustRoot(a.languages.trustTarget(a.view ? dirname(a.view.buf.abs) : a.loc.root), false),
    // The symlinks you've answered (VV-D6): one forgotten is asked about again; one followed, followed no more.
    "vault.links": (a) => a.following.list(),
    "folder.name": (a, arg) => {
      // The explorer's selected root (one nested here), when it has focus.
      const item = a.explorer.focused() ? a.explorer.item() : null;
      if (item?.vault && !arg) return a.vaults.renameItem(item);
      if (a.loc.mode === "folder") return a.message("warn", `${a.loc.root} has no vault to name: :init makes one`);
      if (a.loc.mode === "home")
        return a.message("warn", "home is ~, and takes no name: :init gives a folder in it a .slipbox/ to name");
      const go = (name: string) => {
        const ident = folderIdentity(a.loc.root);
        const taken = readFolders().find((f) => f.key !== ident?.key && f.name.toLowerCase() === name.toLowerCase());
        if (taken)
          return a.message(
            "warn",
            `a different folder is called ${name}, at ${tildePath(taken.default ?? taken.copies[0]?.path ?? "")}: pick another`,
          );
        // A .slipbox/ folder's: renamed, its old name kept (previewed); a repository's: a .slipbox/ to hold one.
        if (hasMarker(a.loc.root)) return a.renaming.preview(() => planVaultRename(a.loc, name));
        try {
          initVault(a.loc.root, name);
        } catch (err) {
          return a.message("warn", (err as Error).message);
        }
        recordFolder(a.loc.root);
        // Its name from now on: the top bar, the Info, what pointers are written with (21.9).
        a.loc = rootAt(a.loc.root);
        a.message("info", `${tildePath(a.loc.root)} is named ${name} (.slipbox/ made to hold it)`);
      };
      if (arg) return go(arg.trim());
      a.overlays.prompt(`name ${tildePath(a.loc.root)}, as pointers name it: `, (t) => t.trim() && go(t.trim()));
    },
    "vault.info": (a) => {
      const g = a.graph;
      // Its name and copies, as pointers find it (21.6).
      const ident = a.loc.mode === "vault" ? folderIdentity(a.loc.root) : null;
      const named = ident ? readFolders().find((f) => f.key === ident.key) : undefined;
      infoList(a, "Vault", [
        ["vault", a.loc.root],
        ["mode", a.loc.mode],
        [
          "name",
          ident
            ? `${rootLabel(a.loc)}${a.loc.aliases.length ? ` (also ${a.loc.aliases.join(", ")})` : ""}`
            : `none — ${a.loc.mode === "folder" ? "no vault" : a.loc.mode === "home" ? "home is ~" : "no remote and no .slipbox/ name"}: linked to by relative path`,
        ],
        ["notes", String(g.notes.size)],
        ["indexing", a.indexing ? `${a.indexing} left` : "done"],
        // Home's walk (VV-D2): made while nobody is working, as far as its cap.
        ...(g.home
          ? [
              [
                "walk",
                `${g.home.walked === null ? "not yet: home's top alone, the rest while nobody is working" : `home walked ${new Date(g.home.walked).toISOString().slice(0, 16).replace("T", " ")}`}${g.home.capped ? ` — ${describeCap(g.home.capped, g.home.asked)}` : ""}`,
              ] as [string, string],
            ]
          : []),
        // How fresh, and what else is covered (20.10).
        [
          "index",
          `${g.indexedAt() ? `written ${g.indexedAt()!.toISOString().slice(0, 16).replace("T", " ")}` : "not written yet"}${g.reached.size ? `, ${g.reached.size} reached outside the walk` : ""}`,
        ],
        ["home", describeBackground(backgroundStatus(a.config))],
        [
          "watcher",
          a.watcher
            ? a.watcher.degraded
              ? `degraded: ${a.watcher.degraded}`
              : `${a.watcher.watchedCount} directories${a.watcher.polledDirs.length ? `, ${a.watcher.polledDirs.length} polled` : ""}`
            : "off",
        ],
        ["cache", cacheDir(a.loc)],
        ["state", stateDir(a.loc)],
        ["scratch", a.scratch.location().path],
        ...g.skipped.map((s) => ["skipped", `${s.rel} — ${s.reason}`] as [string, string]),
        ...(named?.copies ?? [])
          .filter((c) => c.path !== ident?.copy)
          .map(
            (c) => ["copy", `${tildePath(c.path)}${copyAvailable(c.path) ? "" : " (not here)"}`] as [string, string],
          ),
      ]);
    },
  };
}

export function isFile(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

/** Whether the vault's walk takes a path: it and each folder above it (a hidden folder, a busy one, an ignored one aren't). */
function walked(a: App, rel: string): boolean {
  const parts = rel.split("/");
  return parts.every(
    (_, i) => a.graph.filter.exclusion(parts.slice(0, i + 1).join("/"), i < parts.length - 1) === null,
  );
}

// ---------------------------------------------------------------------------------------------

function infoList(a: App, title: string, rows: [string, string][]): void {
  const w = Math.max(...rows.map(([k]) => k.length));
  a.overlays.openList({
    title: `${title} — enter copies a line`,
    filterable: false,
    items: rows.map(([k, v]) => ({ label: `${k.padEnd(w)}  ${v}`, data: `${k}: ${v}` })),
    accept: (item) => void a.copy(item.data as string),
  });
}
