// Server edits normalized, previewed and applied through the original controller and buffers.

import { fileURLToPath } from "node:url";
import type { TextEdit as LspTextEdit, WorkspaceEdit } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { readFileSync } from "node:fs";
import { diffLines } from "../../../../core/workspace/git/merge/merge.ts";
import type { App, ListItem } from "../../../app/runtime/app.ts";

export interface WorkspaceEditContext {
  readonly app: Pick<App, "allViews" | "loc" | "buffer" | "saving" | "buffers" | "overlays" | "message">;
  editsOf(edit: WorkspaceEdit): { path: string; edits: LspTextEdit[] }[];
  applyWorkspaceEdit(edit: WorkspaceEdit): { files: number; edits: number };
}

/** A server's edit as each file's text edits: `changes`, or `documentChanges`' text edits
 * (a file to make, move or delete is left out). */
export function editsOf(edit: WorkspaceEdit): { path: string; edits: LspTextEdit[] }[] {
  const out = new Map<string, LspTextEdit[]>();
  const add = (uri: string, edits: LspTextEdit[]) => {
    if (!uri.startsWith("file:")) return;
    const path = fileURLToPath(uri);
    out.set(path, [...(out.get(path) ?? []), ...edits]);
  };
  for (const [uri, edits] of Object.entries(edit.changes ?? {})) add(uri, edits);
  for (const c of edit.documentChanges ?? [])
    if ("textDocument" in c)
      add(
        c.textDocument.uri,
        c.edits.filter((e): e is LspTextEdit => "newText" in e),
      );
  return [...out].map(([path, edits]) => ({ path, edits }));
}

/**
 * A server's edit made (19.15), through the buffers: each file's edits one undo step; a file no window
 * shows is saved (writeBuffer), so what's on disk is the edit's; one shown is left for its saving.
 */
export function applyWorkspaceEdit(owner: WorkspaceEditContext, edit: WorkspaceEdit): { files: number; edits: number } {
  let files = 0;
  let count = 0;
  const shown = new Set(owner.app.allViews().map((v) => v.buf));
  for (const { path, edits } of owner.editsOf(edit)) {
    const inVault = path.startsWith(`${owner.app.loc.root}/`);
    const buf = owner.app.buffer(inVault ? path.slice(owner.app.loc.root.length + 1) : path);
    if (!buf || !edits.length) continue;
    const wasDirty = buf.dirty;
    // Offsets as the preview's (and LSP's): a character past its line's end is the line's end.
    const doc = TextDocument.create("", "", 0, buf.source);
    const at = (p: { line: number; character: number }) => doc.offsetAt(p);
    // Last first, so each edit's offsets still hold; of inserts at one place, the later one first,
    // so their text reads in the array's order (as LSP has it, and as the preview showed it).
    const sorted = edits
      .map((e, i) => ({ from: at(e.range.start), to: at(e.range.end), text: e.newText, i }))
      .sort((a, b) => b.from - a.from || b.i - a.i);
    buf.beginStep(sorted.at(-1)!.from);
    for (const e of sorted) buf.edit(e.from, e.to - e.from, e.text);
    buf.endStep(sorted.at(-1)!.from);
    for (const v of owner.app.allViews()) if (v.buf === buf) v.layoutKey = "";
    if (!shown.has(buf) && !wasDirty) owner.app.saving.save(buf, true);
    files++;
    count += edits.length;
  }
  return { files, edits: count };
}

/** A server's edit previewed: each line it changes, in each file, before and after; enter makes it. */
export function previewWorkspaceEdit(
  owner: WorkspaceEditContext,
  title: string,
  edit: WorkspaceEdit,
  done: () => void = () => {},
): void {
  const items: ListItem[] = [];
  let n = 0;
  for (const { path, edits } of owner.editsOf(edit)) {
    const open = [...owner.app.buffers.values()].find((b) => b.abs === path);
    let text: string;
    try {
      text = open?.source ?? readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const doc = TextDocument.create("", "", 0, text);
    const next = TextDocument.applyEdits(doc, edits);
    const a = text.split("\n");
    const b = next.split("\n");
    const shown = path.startsWith(`${owner.app.loc.root}/`) ? path.slice(owner.app.loc.root.length + 1) : path;
    for (const h of diffLines(a, b)) {
      for (let k = 0; k < Math.max(h.aLen, h.bLen); k++) {
        items.push({
          label: `${shown}:${h.aStart + k + 1}`,
          detail: `${(a[h.aStart + k] ?? "").trim()}  →  ${(b[h.bStart + k] ?? "").trim()}`,
          data: null,
        });
        n++;
      }
    }
  }
  if (!items.length) return owner.app.message("info", "the server changes nothing");
  const files = new Set(items.map((i) => i.label.slice(0, i.label.lastIndexOf(":")))).size;
  owner.app.overlays.openList({
    title: `${title}: ${n} change${n === 1 ? "" : "s"} in ${files} file${files === 1 ? "" : "s"} — enter: do it, esc: cancel`,
    items,
    filterable: false,
    accept: () => {
      const r = owner.applyWorkspaceEdit(edit);
      owner.app.message(
        "info",
        `${title}: ${r.edits} change${r.edits === 1 ? "" : "s"} in ${r.files} file${r.files === 1 ? "" : "s"}`,
      );
      done();
    },
  });
}
