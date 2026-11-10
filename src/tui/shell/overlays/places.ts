// The lists of places (EG-D2): where a pick opens — `alt+enter` asks: here, the split or a new tab — and the last
// one again (`space '`), as it was: its kind, its query, its rows (not asked again), the row selected, its scroll,
// its preview shown or hidden. Kept while slipbox runs in this vault; going into another drops it.

import { sanitize } from "../../../core/foundation/text/sanitize.ts";
import type { Anchor } from "../../../core/workspace/session/position.ts";
import { leadsOut, ownPath, peekAt } from "../../documents/navigation/peek.ts";
import type { App } from "../../app/runtime/app.ts";
import { andThen } from "../../app/runtime/key-reads.ts";
import type { ListItem, ListOverlay, ListPlace } from "./list-types.ts";

/** Where a pick opens. */
export type Where = "here" | "split" | "tab";

/** The last list of places, and where a pick opens (`app.places`). */
export class Places {
  /** The last list of places opened: as it is when it closes, on a pick or `esc`. */
  last: ListOverlay | null = null;

  constructor(readonly app: App) {}

  /** A list of places opened: the one `space '` brings back once it's closed. */
  opened(o: ListOverlay): void {
    this.last = o;
  }

  /** Another vault gone into: its lists are that vault's, none yet. */
  left(): void {
    this.last = null;
    this.app.preview.reset();
  }

  /** `space '` (`list.resume`): the last list of places, as it was when it closed. */
  resume(): void {
    const o = this.last;
    if (!o)
      return this.app.message(
        "info",
        "no list of places to open again: the switcher, search, find in every note, references, backlinks and links are",
      );
    if (this.app.overlay) return;
    // Read again for it: a file may have changed since.
    this.app.preview.reset(o);
    this.app.overlay = o;
  }

  /**
   * `alt+enter` (`list.open_where`): where the selected row opens, asked — of the list of places open, else of the last
   * one, the palette having closed it. `esc` goes back to the list it was asked from.
   */
  askWhere(): void {
    const open = this.app.overlay?.kind === "list" && this.app.overlay.places ? this.app.overlay : null;
    const o = open ?? (this.app.overlay ? null : this.last);
    if (!o) return this.app.message("info", "alt+enter opens a list's pick where you say: no list of places is open");
    const item = o.filtered[o.selected]?.item;
    if (!item || item.header) return this.app.message("info", "nothing selected to open");
    this.app.overlays.openList({
      title: `Open ${sanitize(item.label)} where?`,
      filterable: false,
      items: [
        { label: "Here", hotkey: "h", data: "here" },
        { label: "In the split", hotkey: "s", data: "split" },
        { label: "In a new tab", hotkey: "t", data: "tab" },
      ],
      accept: (choice) => this.openPick(o, item, choice.data as Where),
      cancel: () => {
        if (open && !this.app.overlay) this.app.overlay = open;
      },
    });
  }

  /** The pick of list `o` opened `where`: here as the list itself opens it; elsewhere, at its place. */
  openPick(o: ListOverlay, item: ListItem, where: Where): unknown {
    if (where === "here") return o.accept(item);
    if (!item.place) return this.app.message("info", `${sanitize(item.label)}: no place to open there`);
    return openPlace(this.app, item.place, where);
  }
}

/**
 * A place opened in this window, the split's other one or a new tab, at its line. Another vault's file, or one outside
 * every vault, is read in a peek instead, as a link out of the vault is (VV-D7): looking never moves you.
 */
export function openPlace(app: App, place: ListPlace, where: Where): void | Promise<void> {
  const anchor: Anchor | undefined =
    place.line > 0 ? { heading: null, headingIndex: 0, offset: 0, line: place.line } : undefined;
  const out = leadsOut(app, place.abs);
  if (out) return peekAt(app, place.abs, out.loc, anchor);
  const rel = ownPath(app, place.abs);
  if (where === "split") app.windows.other();
  return andThen(where === "tab" ? app.openInNewTab(rel, anchor) : app.open(rel, anchor), () => {
    const v = app.view;
    if (!v || v.buf.abs !== place.abs || place.line <= 0) return;
    // On the hit's column in SOURCE view (a rendered row has none), as the list's own pick lands.
    const start = v.buf.lineStarts()[place.line - 1] ?? 0;
    app.placeAtLine(v, place.line, [...v.buf.source.slice(start, start + (place.range?.[0] ?? 0))].length + 1);
    app.region = "content";
  });
}
