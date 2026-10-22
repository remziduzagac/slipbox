// Links in a view: the one under the cursor and how it landed, and a link inserted — to a note picked, written as
// the vault's convention says (21.4), asked when it says nothing.

import { posix } from "node:path";
import { cannotEdit, insertText } from "./editing.ts";
import { conventionOf } from "../core/convention.ts";
import { type LinkEnds, linkEnds, writeLink } from "../core/write-link.ts";
import { describeLanding } from "../core/graph.ts";
import type { LayoutLink } from "../core/layout/ir.ts";
import { planVaultRename } from "../core/rename.ts";
import { slugName } from "../core/registry.ts";
import { tildePath } from "../core/names.ts";
import { privateNameWarning } from "../core/folders.ts";
import { findVaultRoot, hasMarker, rootAt } from "../core/vault.ts";
import type { App, View, ListItem } from "./app.ts";
import type { Layout } from "../core/layout/ir.ts";
import { stringWidth } from "../core/width.ts";

/** Links under the cursor, and links inserted. */
export class Linking {
  constructor(readonly app: App) {}

  /** How a link under the cursor landed when a tie decided it ("the nearest of 2 named so"); else null. */
  linkLanded(view: View, link: LayoutLink): string | null {
    const from = link.from ?? view.buf.rel;
    if (from === null || link.kind === "tag" || link.kind === "footnote") return null;
    return describeLanding(this.app.graph.resolveLink({ kind: link.kind, target: link.target }, from));
  }

  /** The link under the cursor, if any. */
  linkUnderCursor(view = this.app.view): number {
    if (!view) return -1;
    return linkAt(this.app.currentLayout(view), view.cur.row, view.cur.col);
  }

  /** The link under the cursor, else the first link on the cursor row. */
  linkForFollow(view: View): number {
    const layout = this.app.currentLayout(view);
    const at = linkAt(layout, view.cur.row, view.cur.col);
    if (at >= 0) return at;
    for (const s of layout.lines[view.cur.row]?.spans ?? []) if (s.link !== undefined) return s.link;
    return -1;
  }

  /**
   * The link picker (21.5): a note or file of this root picked, and a link to it written at the
   * cursor as the root's convention writes one — typing, where the cursor is; reading, after the word
   * under it (out of a link or code span), as a footnote's reference goes — then saved.
   */
  insertLink(view: View): void {
    const why =
      view.buf.kind.group !== "note" || view.buf.rel === null
        ? "links are written in this folder's notes"
        : cannotEdit(view);
    if (why) return this.app.message("info", why);
    const g = this.app.graph;
    const version = view.buf.version;
    const rels = [...g.notes.keys(), ...g.filePaths()].filter((r) => r !== view.buf.rel).sort();
    this.app.overlays.openList({
      title: "Link to…",
      items: rels.map((r) => ({ label: r, data: r })),
      accept: (item) => {
        if (view.buf.version !== version)
          return this.app.message("warn", "the note changed while you picked: insert the link again");
        // A pointer by a name different folders share asks first; a private one is said (D74, D83).
        this.writeLinkAsked(view.buf.abs, g.abs(item.data as string), (ends) => {
          if (view.buf.version !== version)
            return this.app.message("warn", "the note changed while you picked: insert the link again");
          const c = conventionOf(g, this.app.config, this.app.settings.origins);
          const title = ends.to.note ? (g.entry(item.data as string)?.title ?? "") : "";
          const link = writeLink(
            c,
            c.style.value,
            ends,
            c.style.value === "wiki" ? "" : title || posix.basename(item.data as string),
          );
          if (view.insert) {
            insertText(this.app, view, link);
            return this.app.message("info", `linked ${item.data as string}`);
          }
          const at = this.app.footnotes.refAt(view);
          const before = view.buf.source[at - 1];
          const text = `${before && !/\s/.test(before) ? " " : ""}${link}`;
          this.app.views.applyNoteEdits(
            [{ at, length: 0, text }],
            `linked ${item.data as string}: ${link}`,
            at + text.length,
          );
        });
      },
    });
  }

  /**
   * A link about to be written from `fromAbs` to `toAbs` (21.5), its ends worked out now. A pointer by a name different
   * folders share asks first (D74, D83): rename one of them — `slipbox name`'s rename, the parent folder's name
   * prefixed as a suggestion, previewed — and the link is written once that's done, by the name it has then; or
   * write the qualified name, or, with none, the short one, which asks which when followed. Esc writes nothing. A
   * private name, once written, is said: the pointer works on this machine only.
   */
  writeLinkAsked(fromAbs: string, toAbs: string, write: (ends: LinkEnds) => void): void {
    const ends = linkEnds(this.app.graph, fromAbs, toAbs);
    const n = ends.pointer ? ends.naming : null;
    const done = () => {
      write(ends);
      const priv = n ? privateNameWarning(n) : null;
      if (priv) this.app.message("warn", priv);
    };
    if (!n?.clash.length) return done();
    const items: ListItem[] = [
      n.name !== n.short
        ? { label: `Write it by its qualified name, ${n.name}`, detail: ends.pointer!, data: null }
        : { label: `Write it by ${n.short} as it is`, detail: "followed, it asks which folder is meant", data: null },
    ];
    // Renaming one that has it as its name, a `.slipbox/` one: the folder linked to, or another (an alias stays).
    const there = findVaultRoot(toAbs);
    const named = n.clash
      .filter((f) => f.name.toLowerCase() === n.short.toLowerCase())
      .map((f) => ({ name: f.name, at: f.default ?? f.copies[0]?.path }));
    for (const f of [...(there ? [{ name: n.short, at: there }] : []), ...named]) {
      if (f.at && hasMarker(f.at))
        items.push({
          label: `Rename ${tildePath(f.at)}'s name first…`,
          detail: `${f.name} → ${slugName(posix.basename(posix.dirname(f.at)))}-${f.name}`,
          data: f,
        });
    }
    this.app.overlays.openList({
      title: `${n.short}: ${n.clash.length + 1} different folders have this name — how is the link written?`,
      items,
      filterable: false,
      accept: (item) => {
        const f = item.data as { name: string; at: string } | null;
        if (!f) return done();
        this.app.overlays.prompt(`rename ${f.name} at ${tildePath(f.at)} to: `, (typed) => {
          if (!typed.trim()) return;
          this.app.renaming.preview(
            () => planVaultRename(rootAt(f.at), typed.trim()),
            (plan) => {
              this.app.renaming.apply(plan);
              this.writeLinkAsked(fromAbs, toAbs, write);
            },
          );
        });
        if (this.app.overlay?.kind === "prompt")
          this.app.overlay.text = `${slugName(posix.basename(posix.dirname(f.at)))}-${f.name}`;
      },
    });
  }
}

/** Link index at a layout cell, or -1. */
export function linkAt(layout: Layout, row: number, col: number): number {
  const line = layout.lines[row];
  if (!line) return -1;
  let x = 0;
  for (const s of line.spans) {
    const w = stringWidth(s.text);
    if (col >= x && col < x + w && s.link !== undefined) return s.link;
    x += w;
  }
  return -1;
}
