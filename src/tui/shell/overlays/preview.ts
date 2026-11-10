// A list of places' preview (EG-D2): the selected row's place, as slipbox shows its file — a note rendered, code in the
// code view, a data file rendered, else SOURCE view — read-only, landed at the hit a third of the way down, the hit
// marked. Of the file's buffer when it's open (its unsaved text as typed), else of a virtual one read for it off the
// keys (`preview:<path>`, as a peek's: never written, never a remembered place), the last few kept while the list is
// open; another vault's file through its graph, as a peek reads it. `ctrl+t` hides or shows it for every list of
// places, until it's pressed again.

import { basename, relative } from "node:path";
import { classify } from "../../../core/documents/model/filetypes.ts";
import type { Layout } from "../../../core/rendering/layout/ir.ts";
import { rootLabel } from "../../../core/workspace/vaults/names.ts";
import { answerOpen, type OpenAnswer } from "../../../core/workspace/walk/key-jobs.ts";
import { diskThreads } from "../../../core/workspace/walk/walk-thread.ts";
import { linkSaid } from "../../../core/workspace/vaults/symlinks.ts";
import type { Anchor } from "../../../core/workspace/session/position.ts";
import { NoteBuffer } from "../../documents/buffers/buffer.ts";
import { leadsOut, peekTitle, vaultGraph } from "../../documents/navigation/peek.ts";
import { peekAsk } from "../../documents/navigation/peek/paths.ts";
import type { App, View } from "../../app/runtime/app.ts";
import type { Rect } from "../screen/geometry.ts";
import type { ListOverlay, ListPlace } from "./list-types.ts";

/** How many files read for a list are kept while it's open. */
const KEPT = 8;

/** What the preview shows: the place's window, titled, or a line saying why there's none (`reading…`). */
export type Shown = { title: string; view: View } | { title: string; said: string };

/** The preview of the lists of places (`app.preview`). */
export class ListPreview {
  /** `ctrl+t`: shown beside or under every list of places, or hidden, until it's pressed again. */
  shown = true;
  /** The list it was last drawn for: another one, and what was read for that one is let go of. */
  private list: ListOverlay | null = null;
  /** The files read for the list, by absolute path, the newest last; and why one couldn't be. */
  private readonly read = new Map<string, NoteBuffer>();
  private readonly failed = new Map<string, string>();
  /** The file being read: the selection moved on before it came, its answer is dropped — the read itself withdrawn
   *  while it waits for a thread, else left to finish, its thread not started afresh for it. */
  private reading: string | null = null;
  private waiting: AbortController | null = null;
  /** The window shown, for the place it shows. */
  private current: { key: string; shown: Shown } | null = null;

  constructor(readonly app: App) {}

  /** `ctrl+t`, or a click on the list's `ctrl+t hide`: the preview hidden, or shown again. */
  toggle(): void {
    this.shown = !this.shown;
  }

  /** What was read let go of: another list, the last one opened again, another vault. */
  reset(list: ListOverlay | null = null): void {
    this.list = list;
    this.read.clear();
    this.failed.clear();
    this.waiting?.abort();
    this.reading = this.waiting = null;
    this.current = null;
  }

  /** What the preview of `o` shows now: its selected row's place, or why it shows none. */
  show(o: ListOverlay, place: ListPlace | undefined): Shown {
    if (o !== this.list) this.reset(o);
    if (!place) return { title: "", said: "nothing here to preview" };
    const key = `${place.abs}\n${place.line}\n${place.range?.join(":") ?? ""}\n${place.text ?? ""}`;
    if (this.current?.key === key) return this.current.shown;
    const title = this.titleOf(place);
    const buf = [...this.app.buffers.values()].find((b) => b.abs === place.abs) ?? this.read.get(place.abs);
    if (!buf) {
      const why = this.failed.get(place.abs);
      if (why) return { title, said: why };
      this.readOff(o, place.abs);
      return { title, said: "reading…" };
    }
    // No line (the switcher's file): where you were reading it, as opening it lands; else its top.
    const at: Anchor | null =
      place.line > 0
        ? { heading: null, headingIndex: 0, offset: 0, line: place.line }
        : buf.rel !== null
          ? this.app.positions.get(buf.rel)
          : null;
    const view = this.app.makeView(buf, at ?? undefined);
    view.preview = { line: place.line, ...(place.range ? { range: place.range } : {}), text: place.text };
    const shown = { title, view };
    this.current = { key, shown };
    return shown;
  }

  /** The preview's title: the place as the list names it — this vault's file by its path, another's by its vault. */
  private titleOf(place: ListPlace): string {
    const out = leadsOut(this.app, place.abs);
    const line = place.line > 0 ? `:${place.line}` : "";
    if (!out) return `${relative(this.app.loc.root, place.abs) || basename(place.abs)}${line}`;
    const graph = out.loc.mode !== "folder";
    return `${peekTitle({ abs: place.abs, label: rootLabel(out.loc) }, graph ? relative(out.loc.root, place.abs) : null)}${line}`;
  }

  /** `abs` read off the keys, for the list `o`: kept once it's come, if the selection is still on it. */
  private readOff(o: ListOverlay, abs: string): void {
    if (this.reading === abs) return;
    this.reading = abs;
    const out = leadsOut(this.app, abs);
    const kind = classify(abs, this.app.config.walk.extensions);
    if (kind.group === "binary") return this.settled(o, abs, `${basename(abs)} is a binary file`);
    // On a disk thread (SD-T5), its way checked with it; a test's App reads it here (SD-D10), once the keys taken so far
    // are: never waited for.
    const { ask } = peekAsk(this.app, abs, out?.loc ?? this.app.loc);
    // In the background, no key waiting: a key's read finds a thread free.
    this.waiting?.abort();
    const waiting = (this.waiting = new AbortController());
    const read: Promise<OpenAnswer> = this.app.reads.offThread
      ? diskThreads().open(ask, undefined, true, waiting.signal)
      : new Promise<void>((later) => setTimeout(later, 0)).then(() => answerOpen(ask));
    void read.then(
      ({ read: r, blocked }) => {
        if (this.list !== o || this.reading !== abs) return; // moved on before it came: dropped
        // Not through a link the place it's in hasn't followed (VV-D6): said, as a peek says it.
        if (blocked) return this.settled(o, abs, `${linkSaid(blocked.link, blocked.target)} isn't followed here`);
        if (!r || "error" in r) return this.settled(o, abs, `${basename(abs)} can't be read`);
        const text = r.text;
        if (kind.group !== "note" && text.slice(0, 8192).includes("\u0000"))
          return this.settled(o, abs, `${basename(abs)} holds binary bytes`);
        const graph = out && out.loc.mode !== "folder" ? vaultGraph(this.app, out.loc.root) : null;
        const own = !out && this.app.loc.mode !== "folder" ? relative(this.app.loc.root, abs) : null;
        const buf = new NoteBuffer(own, abs, `preview:${abs}`);
        buf.kind = kind;
        buf.virtual = { save: () => true };
        buf.readOnly = "a preview is read-only";
        if (out) buf.elsewhere = { vault: rootLabel(out.loc), graph, rel: graph ? relative(out.loc.root, abs) : null };
        buf.loadText(text);
        this.read.delete(abs);
        this.read.set(abs, buf);
        while (this.read.size > KEPT) this.read.delete(this.read.keys().next().value!);
        this.settled(o, abs);
      },
      () => {
        if (this.list === o && this.reading === abs) this.settled(o, abs, `${basename(abs)} didn't answer`);
      },
    );
  }

  /** A read settled, for the list `o`: its file kept, or why not; drawn again. */
  private settled(o: ListOverlay, abs: string, why?: string): void {
    if (this.list !== o) return;
    if (this.reading === abs) this.reading = null;
    if (why) this.failed.set(abs, why);
    this.current = null;
    this.app.host.requestRender();
  }

  /**
   * The window sized to `rect` as `drawPane` sizes one without a header, and landed at its hit a third of the way down
   * (as a link to a line lands, § Following links), once for each layout it's given.
   */
  land(view: View, rect: Rect): void {
    const h = !this.app.ui.wrap && rect.h > 3 ? rect.h - 1 : rect.h;
    Object.assign(view, { height: h, pictureRows: h, width: rect.w - 1 });
    const layout = this.app.currentLayout(view);
    const p = view.preview;
    if (!p || p.landed === view.layoutKey) return;
    p.landed = view.layoutKey;
    if (p.line <= 0) return;
    view.cur = { row: hitRow(layout, p.line), col: 0 };
    view.curAnchor = this.app.views.cursorAnchorFor(layout, view.cur);
    view.top = this.app.views.clampTop(view, layout, view.cur.row - Math.floor(h / 3));
    this.app.views.anchorTop(view, layout);
  }
}

/** The row a source line starts on: its own, or the row of a paragraph holding it; past the end, the last. */
export function hitRow(layout: Layout, line: number): number {
  const own = layout.lines.findIndex((l) => !l.decor && l.src === line);
  if (own >= 0) return own;
  const inside = layout.lines.findIndex((l) => !l.decor && l.spans.some((s) => s.src === line));
  if (inside >= 0) return inside;
  const after = layout.lines.findIndex((l) => !l.decor && l.src > line);
  return Math.max(0, after < 0 ? layout.lines.length - 1 : after - 1);
}
