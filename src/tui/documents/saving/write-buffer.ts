// The implementation of App.writeBuffer: every note write keeps the same safety and watcher contract.
import { dirname, relative } from "node:path";
import { entryAt, WriteRefused, writeNote } from "../../../core/foundation/platform/fsutil.ts";
import { isInside } from "../../../core/workspace/vaults/vault.ts";
import { writesThrough } from "../../../core/workspace/vaults/symlinks.ts";
import type { NoteBuffer } from "../buffers/buffer.ts";
import type { App } from "../../app/runtime/app.ts";

export function writeBuffer(
  app: App,
  buf: NoteBuffer,
  content: string | Uint8Array,
  saving = false,
  overwriteNew = false,
): boolean {
  // A virtual buffer (3.20) is no file: its text goes where it belongs by its own save, never to its name on disk.
  if (buf.virtual) {
    app.message("warn", `${app.displayName(buf)} is the floating window's, not a file: not written`);
    return false;
  }
  // Read through a link not followed now (VV-D6: looked at, or forgotten with unsaved text): never written through it.
  if (buf.throughLink) {
    app.message("warn", `${buf.key} not written: ${buf.readOnly ?? "read through a link not followed"}`);
    return false;
  }
  // A vault's file stays inside the vault, one its graph doesn't know too (past `walk.max_file_size`); a file from
  // outside it (the scratch) inside its folder. Through a link you follow, home's and Elsewhere's are written where it
  // leads; a vault's never out of it (VV-D6).
  const inVault = buf.rel !== null || (app.loc.mode === "vault" && !buf.elsewhere && isInside(app.loc.root, buf.abs));
  const root = inVault ? app.loc.root : dirname(buf.abs);
  const through = app.loc.mode !== "vault" && !buf.elsewhere && writesThrough(app.loc, buf.abs);
  const wasNew = buf.newFile;
  const creating = wasNew && !overwriteNew;
  if (creating && entryAt(buf.abs)) {
    app.saving.conflictPrompt(buf);
    return false;
  }
  let written: ReturnType<typeof writeNote>;
  try {
    written = writeNote(root, buf.abs, content, { through, create: creating });
  } catch (err) {
    if (creating && entryAt(buf.abs)) {
      app.saving.conflictPrompt(buf);
      return false;
    }
    app.message(
      "error",
      err instanceof WriteRefused ? err.message : `can't write ${buf.key}: ${(err as Error).message}`,
    );
    return false;
  }
  // Stamped as written: an agent's write landing right after is a change, not ours.
  if (buf.rel !== null) app.watcher?.noteOwnWrite(buf.rel, written);
  app.git.refresh();
  // The index learns what we wrote (the watcher skips our own writes): the note's links, for
  // backlinks, and its stamp — a later watcher resync from the index must not take our own
  // save for someone else's change.
  if (buf.rel !== null && app.graph.notes.has(buf.rel))
    app.graph.updateFile(buf.rel, { rel: buf.rel, abs: buf.abs, size: written.size, mtimeMs: written.mtimeMs });
  else if (buf.rel !== null) app.graph.fileChanged(buf.rel);
  if (saving) {
    // The text on disk is what's in the buffer: keep it, its history and every cursor.
    buf.deleted = false;
    buf.markSaved(written);
    if (wasNew) {
      const rel = relative(app.loc.root, buf.abs);
      if (app.graph.admits(rel)) app.files.addFolders(dirname(rel));
      app.graph.reachFile(rel);
      app.claim(buf);
      if (buf.rel !== null) app.watcher?.noteOwnWrite(buf.rel, written);
      app.explorer.invalidateTree();
      app.relayoutAll();
    }
    app.languages.servers?.save(buf.abs, buf.source);
    return true;
  }
  buf.load();
  for (const v of app.allViews()) if (v.buf === buf) v.layoutKey = ""; // keeps the anchors (3.5)
  return true;
}
