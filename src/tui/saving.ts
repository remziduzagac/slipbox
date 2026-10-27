// Saving and conflicts: a note saved (atomically, through App.writeBuffer), autosaved when idle, its conflict with
// the disk resolved — keep, reload, merge, diff — and leaving with unsaved changes asked about.

import { existsSync } from "node:fs";
import { readText } from "../core/foundation/platform/fsutil.ts";
import { merge3 } from "../core/merge.ts";
import { stopInsert } from "./editing.ts";
import { openDiff } from "./diffview.ts";
import { openPromptMerge } from "./mergescreen.ts";
import type { NoteBuffer } from "./buffer.ts";
import type { App } from "./app.ts";

/** Saving, autosave, conflicts with the disk, and leaving. */
export class Saving {
  constructor(readonly app: App) {}

  /** Quit, unless something is unsaved (`app.quit`; `:q!` quits anyway). */
  requestQuit(force = false): void {
    for (const v of this.app.allViews()) if (v.insert) stopInsert(this.app, v);
    // The properties editor's text (not a buffer of the list): written back first, or asked about.
    if (this.app.floating && !force && !this.app.overlays.closeFloating()) return;
    const dirty = this.app.dirtyBuffers();
    if (dirty.length && !force) {
      return this.app.message(
        "warn",
        `unsaved changes in ${dirty.map((b) => this.app.displayName(b)).join(", ")} — :w saves, :q! quits without saving`,
      );
    }
    this.app.quit();
  }

  /**
   * Save a buffer (`:w`, ctrl+s): its text, with its BOM and line endings, through writeBuffer. If
   * the file changed on disk since it was loaded, not blindly: after (K)eep yours it asks first;
   * otherwise the conflict prompt decides.
   */
  save(buf: NoteBuffer, quiet = false): boolean {
    // A virtual buffer (3.20): its text written where it belongs (a note's frontmatter).
    if (buf.virtual) {
      if (!buf.virtual.save(buf.source)) return false;
      buf.markSaved();
      return true;
    }
    if (buf.invalidUtf8) {
      this.app.message("error", `${buf.key} isn't valid UTF-8 — not saving over it`);
      return false;
    }
    // Read through a link not followed now (VV-D6): refused as `writeBuffer` refuses it, before anything looks at the
    // file through the link.
    if (buf.throughLink) return this.app.writeBuffer(buf, buf.contentToSave(), true);
    // A note deleted on disk that's there again (an agent recreated it) is a change like any:
    // never written over without asking.
    if (buf.deleted && existsSync(buf.abs)) buf.deleted = false;
    if (buf.changedOnDisk() && !buf.deleted) {
      if (quiet) return false;
      if (buf.conflictKept) this.confirmOverwrite(buf);
      else this.conflictPrompt(buf);
      return false;
    }
    // What `.editorconfig` asks of a save (25.1): trailing whitespace, the final newline — in the text first.
    buf.applySaveRules();
    return this.app.writeBuffer(buf, buf.contentToSave(), true);
  }

  /** After (K)eep yours: a save asks before writing over the file's other version. */
  private confirmOverwrite(buf: NoteBuffer): void {
    this.app.overlays.openList({
      title: `${this.app.displayName(buf)} changed on disk — write yours over it?`,
      filterable: false,
      items: [
        { label: "(y) Yes, write mine over it", hotkey: "y", data: "y" },
        { label: "(n) No, keep both as they are", hotkey: "n", data: "n" },
        { label: "(d) Show the differences first", hotkey: "d", data: "d" },
      ],
      accept: (item) => {
        if (item.data === "y" && this.app.writeBuffer(buf, buf.contentToSave(), true))
          this.app.message(
            "info",
            `saved ${this.app.displayName(buf)}${this.app.files.notIndexed(buf.abs)} over the file on disk`,
          );
        else if (item.data === "d") this.showDiff(buf, () => this.confirmOverwrite(buf));
      },
    });
  }

  /**
   * The conflict prompt (5.5): a note with unsaved changes changed on disk. (L)oad theirs — yours
   * stays one `u` away; (K)eep yours — autosave off, and saving asks first; (D)iff; (M)erge the two
   * against the version you started from, marking what both changed.
   */
  conflictPrompt(buf: NoteBuffer): void {
    // Theirs is read through the link, which isn't followed now (VV-D6): nothing to compare until it is (it's lifted).
    if (buf.throughLink && this.app.following.blocked(buf.abs, true)) return;
    // Not while you type, into it or any note: letters meant for the text would pick l, k, d or m.
    // It opens once typing has stopped (processKey).
    if (this.app.allViews().some((v) => v.insert)) {
      if (!buf.conflictWaiting)
        this.app.message("warn", `${this.app.displayName(buf)} changed on disk — esc, then choose what to keep`);
      buf.conflictWaiting = true;
      return;
    }
    const waiting = buf.conflictWaiting;
    buf.conflictWaiting = false;
    if (this.app.overlay) {
      // Its own prompt already open: nothing to add. Another list open: said once, not per write.
      const own =
        this.app.overlay.kind === "list" &&
        this.app.overlay.title.startsWith(`${this.app.displayName(buf)} changed on disk`);
      if (!own && !waiting)
        this.app.message(
          "warn",
          `${this.app.displayName(buf)} changed on disk while you have unsaved changes — space n c resolves it`,
        );
      buf.conflictWaiting = !own;
      return;
    }
    for (const v of this.app.allViews()) if (v.insert && v.buf === buf) stopInsert(this.app, v);
    const name = this.app.displayName(buf);
    this.app.overlays.openList({
      title: `${name} changed on disk, and you have unsaved changes`,
      filterable: false,
      items: [
        { label: "(l) Load theirs", detail: "yours stays one u away", hotkey: "l", data: "l" },
        { label: "(k) Keep yours", detail: "autosave off; saving asks first", hotkey: "k", data: "k" },
        { label: "(d) Diff", detail: "yours → theirs", hotkey: "d", data: "d" },
        { label: "(m) Merge", detail: "both, conflicts marked", hotkey: "m", data: "m" },
      ],
      accept: (item) => this.resolveConflict(buf, item.data as string),
      cancel: () => {
        buf.conflictKept = true;
        this.app.message("warn", `${name}: keeping yours for now — space n c to resolve`);
      },
    });
  }

  resolveConflict(buf: NoteBuffer, choice: string): void {
    const name = this.app.displayName(buf);
    const views = this.app.allViews().filter((v) => v.buf === buf);
    if (choice === "l") {
      if (!buf.load()) return this.app.message("warn", `${buf.key} is gone from disk`);
      for (const v of views) v.layoutKey = "";
      return this.app.message("info", `loaded theirs — u brings yours back`);
    }
    if (choice === "k") {
      buf.conflictKept = true;
      return this.app.message("info", `keeping yours — autosave is off for ${name} until you save (it asks first)`);
    }
    let theirs: string;
    try {
      theirs = readText(buf.abs).text;
    } catch {
      return this.app.message("warn", `${buf.key} is gone from disk`);
    }
    if (choice === "d") return this.showDiff(buf, () => this.conflictPrompt(buf), theirs);
    // Merge: base (as loaded), yours, theirs. Where both changed the same lines, the merge screen settles them
    // (GIT-D5); else the result is an undo step, and the file is theirs now.
    const r = merge3(buf.baseText, buf.source, theirs);
    if (r.conflicts) return openPromptMerge(this.app, buf, theirs);
    buf.edit(0, buf.source.length, r.text);
    buf.rebase(theirs);
    buf.markers = false;
    for (const v of views) v.layoutKey = "";
    this.app.message("info", "merged cleanly — unsaved; :w writes it");
  }

  /** Yours → theirs in the diff window (GIT-D2); closing it, or enter, goes back to where it came from. */
  showDiff(buf: NoteBuffer, back: () => void, theirs?: string): void {
    let disk = theirs;
    if (disk === undefined) {
      try {
        disk = readText(buf.abs).text;
      } catch {
        return this.app.message("warn", `${buf.key} is gone from disk`);
      }
    }
    openDiff(this.app, {
      before: buf.source,
      now: disk,
      path: buf.rel ?? buf.abs,
      title: `Diff — yours → theirs (${this.app.displayName(buf)})`,
      back,
    });
  }

  // Autosave (4.7): a changed note is saved after `editor.autosave_ms` with no key pressed.

  private timer: ReturnType<typeof setTimeout> | null = null;

  /** (Re)start the idle clock, when something is unsaved. */
  scheduleAutosave(): void {
    const ms = this.app.config.editor.autosave_ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!ms || this.app.quitting || !this.app.dirtyBuffers().length) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.autosave();
      this.app.host.requestRender();
    }, ms);
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Save what can be: not mid-insert, not after (K)eep yours, not over a changed file (the
   *  conflict prompt comes instead, 5.6), not while git holds its index lock (5.10). */
  autosave(): void {
    let later = false;
    for (const buf of this.app.dirtyBuffers()) {
      if (this.app.allViews().some((v) => v.buf === buf && v.insert) || this.app.git.indexLocked()) {
        later = true;
        continue;
      }
      if (buf.conflictKept || buf.markers || buf.invalidUtf8 || buf.deleted || buf.throughLink) continue;
      if (buf.changedOnDisk()) {
        this.conflictPrompt(buf);
        continue;
      }
      if (this.app.writeBuffer(buf, buf.contentToSave(), true))
        this.app.message("info", `autosaved ${this.app.displayName(buf)}${this.app.files.notIndexed(buf.abs)}`);
    }
    if (later) this.scheduleAutosave();
    this.app.session.publishDirty();
  }

  /** Whether this root can be left now: nothing unsaved; said when not. */
  canLeave(): boolean {
    // The floating window first: changed properties go into their note (or it asks, and nothing
    // switches); the note they made unsaved then refuses the switch below.
    if (this.app.floating && !this.app.overlays.closeFloating()) return false;
    const dirty = this.app.dirtyBuffers();
    if (dirty.length) {
      this.app.message(
        "warn",
        `unsaved: ${dirty.map((b) => this.app.displayName(b)).join(", ")} — save (:wa) or revert before leaving ${this.app.vaults.label(this.app.loc)}`,
      );
      return false;
    }
    return true;
  }
}
