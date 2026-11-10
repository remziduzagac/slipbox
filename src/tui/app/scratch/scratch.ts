// The scratch (4.10, #43): a note of your own outside the vault for what you capture, floating over the windows or
// in the window on the right.

import { statSync } from "node:fs";
import { relative } from "node:path";
import { readRegular } from "../../../core/foundation/platform/fsutil.ts";
import { type StalePlace, stalePlaces } from "../../../core/workspace/mutations/scratch-places.ts";
import { parseMarkdown } from "../../../core/documents/markdown/parse.ts";
import { ruleParts } from "../../../core/rendering/layout/markdown/live.ts";
import { climbsOut } from "../../../core/foundation/platform/fsutil.ts";
import { placeAt, startInsert } from "../../documents/editing/editing.ts";
import {
  appendScratch,
  dropEmptyAsks,
  ensureScratch,
  fenceLanguage,
  scratchLocation,
} from "../../../core/workspace/mutations/capture.ts";
import type { NoteBuffer } from "../../documents/buffers/buffer.ts";
import type { App, UiState, View } from "../runtime/app.ts";
import { andThen } from "../runtime/key-reads.ts";
import { editable } from "../../documents/editing/editable.ts";

/** The most of a file read to check a place in it. */
const PLACE_FILE = 16 << 20;

/** The scratch and capture. */
export class Scratch {
  constructor(readonly app: App) {}

  /** Its places checked, for its text's version, again at most every two seconds; the files read, by when changed. */
  private checked: { version: number; at: number; list: StalePlace[] } | null = null;
  private readonly files = new Map<string, { stamp: string; text: string | null }>();

  /** Its places whose lines aren't what was captured (D229): moved, changed, or their file gone. */
  places(buf: NoteBuffer): StalePlace[] {
    const now = Date.now();
    const c = this.checked;
    if (c && c.version === buf.version && now - c.at < 2000) return c.list;
    const read = (abs: string): string | null => {
      let stamp: string;
      try {
        const st = statSync(abs);
        stamp = `${st.mtimeMs}:${st.size}`;
      } catch {
        return null;
      }
      const hit = this.files.get(abs);
      if (hit?.stamp === stamp) return hit.text;
      let text: string | null = null;
      try {
        text = readRegular(abs, PLACE_FILE).toString("utf8");
      } catch {}
      this.files.set(abs, { stamp, text });
      return text;
    };
    const list = stalePlaces(buf.source, this.app.loc.root, read);
    this.checked = { version: buf.version, at: now, list };
    return list;
  }

  /** Where a place written `target` has its lines now, when they moved since captured: its first line. */
  movedTo(target: string): number | null {
    return this.checked?.list.find((p) => p.target === target && p.now)?.now?.startLine ?? null;
  }

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
    void andThen(this.open(undefined, at), () => {
      const v = this.app.floating?.kind === "scratch" ? this.app.floating.view : this.app.tabView;
      if (v?.buf.abs !== loc.path) return;
      if (!editable(v)) this.app.lens.setViewMode(v, this.app.lens.editMode(v)); // the lens opened on the entry, or the source
      startInsert(this.app, v, () => at);
      this.app.message("info", `added to the scratch${this.notIndexed()}; add a note, esc then q closes it`);
    });
  }

  /** A capture's fence language: a code file's, highlighted in the scratch; none for a note's lines, read as written. */
  language(buf: NoteBuffer): string {
    return buf.kind.group === "note" ? "" : fenceLanguage(buf.abs);
  }

  /**
   * The entry under the cursor in the scratch: its lines between two rules (with no rule, all of it), and the lines a
   * delete takes — it and the rule before it, or, the first, the rule after it. A string says why there's none.
   */
  private entry(): { view: View; lines: [number, number]; cut: [number, number] } | string {
    const v = this.app.view;
    if (!v || v.buf.abs !== this.location().path)
      return "in the scratch: the entry under the cursor (space s s opens it)";
    const line = this.app.currentLayout(v).lines[v.cur.row]?.src ?? 1;
    const tree = parseMarkdown(v.buf.source).tree;
    const count = v.buf.lineStarts().length;
    const parts = ruleParts(tree, count);
    if (!parts.length)
      return v.buf.source.trim() ? { view: v, lines: [1, count], cut: [1, count] } : "the scratch is empty";
    const i = parts.findIndex((p) => line >= p[0] && line <= p[1]);
    if (i < 0) return "on a rule: no entry here";
    const part = parts[i]!;
    const rule = tree.children
      .filter((n) => n.type === "thematicBreak" && (n.position?.start.line ?? count) < part[0])
      .at(-1)?.position?.start.line;
    const next = parts[i + 1]?.[0];
    const cut: [number, number] =
      rule !== undefined ? [rule, part[1]] : next !== undefined ? [part[0], next - 1] : part;
    return { view: v, lines: part, cut };
  }

  /** The entry under the cursor copied: its lines, an empty note left out. */
  copyEntry(): void {
    const e = this.entry();
    if (typeof e === "string") return this.app.message("info", e);
    const text = dropEmptyAsks(
      e.view.buf
        .lines()
        .slice(e.lines[0] - 1, e.lines[1])
        .join("\n"),
    ).trim();
    if (!text) return this.app.message("info", "the entry is empty");
    this.app.copy(`${text}\n`, true, "the entry");
  }

  /** The entry under the cursor deleted, with its rule: one undo step, saved. */
  deleteEntry(): void {
    const e = this.entry();
    if (typeof e === "string") return this.app.message("info", e);
    const starts = e.view.buf.lineStarts();
    const at = starts[e.cut[0] - 1] ?? 0;
    const end = starts[e.cut[1]] ?? e.view.buf.source.length;
    this.app.views.applyNoteEdits([{ at, length: end - at, text: "" }], "entry deleted · u brings it back", at);
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
  open(where: UiState["scratch_in"] = this.app.ui.scratch_in, at?: number): void | Promise<void> {
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
      const placed = () => {
        const v = this.app.tabView;
        if (at !== undefined && v?.buf.abs === loc.path) placeAt(this.app, v, at);
        this.app.region = "content";
      };
      const shown = t.views.findIndex((v) => v.buf.abs === loc.path);
      if (shown >= 0) {
        t.active = shown;
        return placed();
      }
      const here = t.views[0]!;
      if (t.views.length === 1) {
        t.orientation = "side";
        t.views.push(this.app.makeView(here.buf, { ...here.topAnchor }, { ...here.curAnchor }));
      }
      t.active = 1;
      // Its place once it's there: read on a disk thread, a key's read.
      return andThen(this.app.open(loc.path, undefined, t.views[1]), placed);
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
