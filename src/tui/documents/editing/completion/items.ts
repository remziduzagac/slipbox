// Link item production and stable completion ordering.

import { relative } from "node:path";
import type { CompletionItem } from "vscode-languageserver-protocol";
import { conventionOf, type LinkStyle } from "../../../../core/workspace/links/convention.ts";
import { linkDestination, linkEnds, type PointerMemo } from "../../../../core/workspace/links/write-link.ts";
import { homeFolder } from "../../../../core/workspace/vaults/vault.ts";
import { type OtherNote, otherNotes } from "../../../../core/workspace/walk/own-jobs.ts";
import { diskThreads } from "../../../../core/workspace/walk/walk-thread.ts";
import type { App, View } from "../../../app/runtime/app.ts";

/** Other vaults' notes as a disk thread last read them, for links from `root` (SD-T9): what a link's completion offers
 *  at once, each App its own. */
const kept = new WeakMap<App, { root: string; notes: OtherNote[] }>();

/** A read of other vaults' notes out for an App: the list its answer goes to, the last one opened, its items built for
 *  its own note (`take`: whether that list is still open); `again` once a list was opened while it was out. */
interface Asking {
  root: string;
  take: (notes: OtherNote[]) => boolean;
  again: boolean;
}
const asking = new WeakMap<App, Asking>();

/**
 * The files a link from this note could reach (20.13): this vault's notes and files, each by its path
 * here, and (a markdown link's) other vaults' notes, each by its path as shown (21.9) — the full path beside each,
 * and either typed narrows. Picked, it's written as the root's convention writes it in `style` (21.5);
 * a wikilink reaches only its own root's (21.3). Other vaults' are read on a disk thread, in the background, no key
 * waiting behind them (SD-T9): those it last read offered at once, and `more` given them as read now — to build, and
 * saying whether its list is still open — once it answers for the vault still open (SD-D5). One read out at a time: a
 * list opened meanwhile takes its answer, then, still open, one more, so a vault indexed since it was asked is offered
 * (20.13), however many lists opened. A test's App reads them here.
 */
export function linkItems(
  app: App,
  view: View,
  style: LinkStyle,
  more?: (others: () => CompletionItem[]) => boolean,
): CompletionItem[] {
  const g = app.graph;
  // From the notes parsed so far, the rest's texts read on a disk thread (SD-T6): offered at once.
  const c = g.texts.partially(() => conventionOf(g, app.config, app.settings.origins, style, app.settings.tool()));
  const home = homeFolder();
  const tilde = (abs: string) => (abs.startsWith(`${home}/`) ? `~/${relative(home, abs)}` : abs);
  // Each other vault's pointer name worked out once, not once per note: per note it read every named folder.
  const memo: PointerMemo = { root: g.root, naming: new Map() };
  const item = (abs: string, form: string, here: boolean, at?: OtherNote["at"]): CompletionItem => {
    const ends = linkEnds(g, view.buf.abs, abs, memo, at);
    const dest = linkDestination(c, style, ends);
    return {
      // A wikilink's shows what it writes (a name, a path); a markdown link's, the file by its path as shown (21.9).
      label: style === "wiki" ? dest : form,
      detail: style === "wiki" ? form : tilde(abs),
      filterText: `${form} ${dest} ${abs}`,
      sortText: `${here ? 0 : 1}${form}`,
      insertText: dest,
      // A pointer's name is settled when it's picked: asked on a clash, said when private (D74, D83).
      ...(ends.pointer && ends.naming && (ends.naming.clash.length || ends.naming.private)
        ? { data: { pointerTo: abs, style } }
        : {}),
    };
  };
  const out: CompletionItem[] = [];
  for (const rel of [...g.notes.keys(), ...g.filePaths()]) {
    const abs = g.abs(rel);
    if (abs !== view.buf.abs) out.push(item(abs, rel, true));
  }
  if (style === "wiki") return out;
  // Other vaults' notes, as of their last index: what the machine knows.
  const others = (notes: OtherNote[]) => notes.map((n) => item(n.abs, g.shownPath(n.abs), false, n.at));
  if (!app.reads.offThread) return [...out, ...others(otherNotes(g.root))];
  const last = kept.get(app);
  if (last?.root === g.root) out.push(...others(last.notes));
  const take = (notes: OtherNote[]) => more?.(() => others(notes)) ?? false;
  const pending = asking.get(app);
  if (pending?.root === g.root) {
    pending.take = take;
    pending.again = true;
    return out;
  }
  readOthers(app, { root: g.root, take, again: false });
  return out;
}

/** Other vaults' notes read for `ask`'s list, kept, and given to the list opened last; once more, while that list is
 *  open, when it was opened after this read was asked. */
function readOthers(app: App, ask: Asking): void {
  const g = app.graph;
  asking.set(app, ask);
  diskThreads()
    .own({ op: "otherNotes", root: ask.root }, "key", true)
    .then(
      (a) => {
        if (asking.get(app) === ask) asking.delete(app);
        if (!("notes" in a) || app.graph !== g) return;
        kept.set(app, { root: ask.root, notes: a.notes });
        if (ask.take(a.notes) && ask.again) readOthers(app, { root: ask.root, take: ask.take, again: false });
      },
      () => {
        if (asking.get(app) === ask) asking.delete(app);
      },
    );
}

/** The items in the server's order: by `sortText`, else the label. */
export function inOrder(items: CompletionItem[]): CompletionItem[] {
  return [...items].sort((a, b) => (a.sortText ?? a.label).localeCompare(b.sortText ?? b.label));
}
