// The scratch (4.10, #43): a note of your own outside the vault for what you capture, floating over the windows or
// in the window on the right.

import { relative } from "node:path";
import { climbsOut } from "../core/fsutil.ts";
import { placeAt, startInsert } from "./editing.ts";
import { appendScratch, dropEmptyAsks, ensureScratch, scratchLocation } from "../core/capture.ts";
import type { NoteBuffer } from "./buffer.ts";
import type { App, UiState } from "./app.ts";
import { editable } from "./app.ts";

/** The scratch and capture. */
export class Scratch {
  constructor(readonly app: App) {}

  location() {
    return scratchLocation(this.app.loc, this.app.config);
  }

  /** What a message about an entry added adds when the scratch is in the vault where it's never indexed (D246). */
  notIndexed(): string {
    return this.app.files.notIndexed(this.location().path);
  }

  /**
   * An entry added to the scratch, the scratch left as it is — shown, or not (a review's note, GIT-D3): its text after,
   * or null when it couldn't be (an open scratch's typing that couldn't be saved first).
   */
  add(entry: string): string | null {
    const loc = this.location();
    // An open, changed scratch is saved first, so the entry goes after what you typed (4.10).
    const scratchBuf = this.app.buffers.get(loc.path) ?? this.app.buffers.get(relative(this.app.loc.root, loc.path));
    if (scratchBuf?.dirty && !this.app.saving.save(scratchBuf)) return null;
    const text = appendScratch(loc, entry, true);
    const rel = relative(this.app.loc.root, loc.path);
    if (!climbsOut(rel)) this.app.watcher?.noteOwnWrite(rel);
    const open = this.app.buffers.get(loc.path) ?? this.app.buffers.get(rel);
    if (open) {
      open.load();
      for (const v of this.app.allViews()) if (v.buf === open) v.layoutKey = "";
    }
    return text;
  }

  capture(entry: string): void {
    const text = this.add(entry);
    if (text === null) return;
    const loc = this.location();
    // The scratch opened on the entry (#43), typing after its **Note:** (D229): a word about it said at once.
    const at = text.length - 1;
    this.open(undefined, at);
    const v = this.app.floating?.kind === "scratch" ? this.app.floating.view : this.app.tabView;
    if (v?.buf.abs !== loc.path) return;
    if (!editable(v)) this.app.lens.setViewMode(v, this.app.lens.editMode(v)); // the lens opened on the entry, or the source
    startInsert(this.app, v, () => at);
    this.app.message("info", `added to the scratch${this.notIndexed()}; add a note, esc then q closes it`);
  }

  /** The scratch's empty notes dropped as it closes (D229): a capture with nothing said about it is its reference. */
  tidy(buf: NoteBuffer): void {
    const next = dropEmptyAsks(buf.source);
    if (next !== buf.source) buf.edit(0, buf.source.length, next);
  }

  /**
   * The scratch (#43): floating over the windows, or in the window on the right (in a split already, its other
   * window), as `[capture] open_in` or the UI settings say, or `where` — either way a window like any, the note
   * rendered, the lens to edit it. The cursor goes to `at` (a capture's entry), else where it was left. Empty, it opens
   * too, to be typed in; closed, what was typed is saved.
   */
  open(where: UiState["scratch_in"] = this.app.ui.scratch_in, at?: number): void {
    const f = this.app.floating;
    if (f?.kind === "scratch" && where === "float") {
      if (at !== undefined) placeAt(this.app, f.view, at);
      return;
    }
    if (f && !this.app.overlays.closeFloating()) return;
    const loc = this.location();
    try {
      ensureScratch(loc);
    } catch (err) {
      return this.app.message("error", `scratch: ${(err as Error).message}`);
    }
    if (where === "right") {
      const t = this.app.tab;
      if (!t) return this.app.openInNewTab(loc.path);
      const shown = t.views.findIndex((v) => v.buf.abs === loc.path);
      if (shown >= 0) t.active = shown;
      else {
        const here = t.views[0]!;
        if (t.views.length === 1) {
          t.orientation = "side";
          t.views.push(this.app.makeView(here.buf, { ...here.topAnchor }, { ...here.curAnchor }));
        }
        t.active = 1;
        this.app.open(loc.path, undefined, t.views[1]);
      }
      const v = this.app.tabView;
      if (at !== undefined && v?.buf.abs === loc.path) placeAt(this.app, v, at);
      this.app.region = "content";
      return;
    }
    const buf = this.app.buffer(loc.path);
    if (!buf) return;
    // Shown as any note is, rendered, the lens to edit it; ctrl+k, its markdown.
    const fv = this.app.makeView(buf);
    this.app.floating = { kind: "scratch", view: fv, title: "Scratch" };
    this.app.region = "content";
    if (at !== undefined) placeAt(this.app, fv, at);
  }
}
