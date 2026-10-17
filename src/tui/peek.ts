// The peek (VV-D7): another vault's file, or one of Elsewhere's (VV-D3), read where you are — a large floating window,
// the note rendered, read-only, found in with `/`, copied from. Looking never moves you; going there is a choice: `o`
// goes there (VV-D4), `t` keeps it as a tab here, read-only, `z` fills the screen, `esc` closes it. A link inside it to
// its own vault, or a third, moves the peek (`ctrl+o` back); one to this vault closes it and opens there.

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { classify } from "../core/filetypes.ts";
import { readText } from "../core/fsutil.ts";
import type { Graph } from "../core/graph.ts";
import { ELSEWHERE, rootLabel, tildePath } from "../core/names.ts";
import type { Anchor, CursorAnchor } from "../core/position.ts";
import { Reach } from "../core/reach.ts";
import { sanitize } from "../core/sanitize.ts";
import { isInside, locateVault, type VaultLocation, vaultAt } from "../core/vault.ts";
import { stringWidth, truncate, truncateStart } from "../core/width.ts";
import type { App, View } from "./app.ts";
import { NoteBuffer } from "./buffer.ts";

/** A place a peek showed, for `ctrl+o` inside it. */
interface Place {
  abs: string;
  loc: VaultLocation;
  top: Anchor;
  cursor: CursorAnchor;
}

export interface Peek {
  /** The file read, by its absolute path. */
  abs: string;
  /** Its vault; outside every vault, Elsewhere's location from its folder (mode `folder`, VV-D3). */
  loc: VaultLocation;
  /** How its vault is named: its name, else its path; outside every vault, `Elsewhere`. */
  label: string;
  /** Where links inside it moved it from, and back again: `ctrl+o`, and forward. */
  back: Place[];
  fwd: Place[];
  /** `z`: the whole screen, not most of it. */
  full: boolean;
}

/** The peek open, when the floating window is one (and `view`, given, is its window). */
export function peekOf(app: App, view: View | null = null): Peek | null {
  const f = app.floating;
  if (f?.kind !== "peek") return null;
  return view && view !== f.view ? null : f.peek;
}

/**
 * Where a path leads, when it leads out of this vault — into another vault, or into Elsewhere: its absolute path and
 * that vault (Elsewhere's location from its folder). Null for this vault's own, or for nothing there.
 */
export function leadsOut(app: App, path: string): { abs: string; loc: VaultLocation } | null {
  const abs = isAbsolute(path) ? path : join(app.loc.root, path);
  if (!existsSync(abs)) return null;
  let loc: VaultLocation;
  try {
    loc = locateVault({ path: abs });
  } catch {
    return null;
  }
  // A vault's own files, nested vaults apart (each is its own, VV-D4) — home's too, a vault without a marker (VV-D2);
  // in Elsewhere, every file outside home and the vaults: it's one place (VV-D3).
  if (loc.mode !== "folder") return loc.root === app.loc.root ? null : { abs, loc };
  return app.loc.mode === "folder" ? null : { abs, loc };
}

/**
 * Where a link, a backlink or a search hit leads (VV-D7): out of this vault, read in a peek — or, `go`, gone into at
 * once — and true; this vault's own, false, for its caller to open as it does, a peek closed first.
 */
export function peekInstead(app: App, path: string, anchor?: Anchor, go = false): boolean {
  const out = leadsOut(app, path);
  if (!out) {
    if (peekOf(app)) app.overlays.closeFloating();
    return false;
  }
  if (go) goThere(app, out.abs, out.loc, anchor);
  else peekAt(app, out.abs, out.loc, anchor);
  return true;
}

/** A path as this vault reaches it: one of its own by its path in it, any other absolute. */
export function ownPath(app: App, path: string): string {
  // Elsewhere's (VV-D3) by their whole paths, wherever they are.
  if (!isAbsolute(path) || app.loc.mode === "folder" || leadsOut(app, path) || !isInside(app.loc.root, path))
    return path;
  return relative(app.loc.root, path) || path;
}

/**
 * Read `abs` in the peek, at `anchor`: opened, or — a peek open already — moved there, where it was kept for `ctrl+o`.
 * A note shows its backlinks after its text when its vault has an index; else it says how to see them.
 */
export function peekAt(app: App, abs: string, loc: VaultLocation, anchor?: Anchor): void {
  const kind = classify(abs, app.config.walk.extensions);
  if (kind.group === "binary") return app.message("warn", `${tildePath(abs)} is a binary file; slipbox opens text`);
  let text: string;
  try {
    text = readText(abs).text;
  } catch {
    return app.message("error", `cannot read ${tildePath(abs)}`);
  }
  if (kind.group !== "note" && text.slice(0, 8192).includes("\u0000"))
    return app.message("warn", `${tildePath(abs)} holds binary bytes; slipbox opens text`);
  const was = peekOf(app);
  const back = was ? [...was.back, here(app)!] : [];
  if (!was && app.floating && !app.overlays.closeFloating()) return;
  show(app, { abs, loc, back, fwd: [], full: was?.full ?? false }, text, anchor);
}

/** The peek showing `p`'s file: its buffer, read-only, its links read in its own vault. */
function show(app: App, p: Omit<Peek, "label">, text: string, anchor?: Anchor, cursor?: CursorAnchor): void {
  const graph = p.loc.mode !== "folder" ? vaultGraph(app, p.loc.root) : null;
  const rel = graph ? relative(p.loc.root, p.abs) : null;
  const label = rootLabel(p.loc);
  // Whether its vault has an index, asked before anything reads it: a note's backlinks are read from it.
  const indexed = !!graph && graph.indexedAt() !== null;
  const buf = new NoteBuffer(null, p.abs, `peek:${p.abs}`);
  buf.kind = classify(p.abs, app.config.walk.extensions);
  buf.virtual = { save: () => true };
  buf.readOnly = "a peek is read-only — o goes there, to edit it";
  buf.elsewhere = { vault: label, graph, rel };
  const markdown = buf.kind.group === "note" && buf.kind.format === "markdown";
  buf.loadText(
    markdown && graph && rel !== null
      ? withBacklinks(text, p.abs, label, indexed ? graph : null, rel)
      : markdown && p.loc.mode === "folder"
        ? withoutIndex(text)
        : text,
  );
  const view = app.makeView(buf, anchor ? { ...anchor } : undefined, cursor);
  const peek: Peek = { ...p, label };
  const title = peekTitle({ ...p, label }, rel);
  app.floating = { kind: "peek", view, title, peek };
  app.region = "content";
}

/**
 * A peek's title, `kestrel › docs/architecture.md` (`Elsewhere › /etc/hosts`), in `width` columns: short of room, its
 * path is cut from the front, so where it is and the file's name stay.
 */
export function peekTitle(
  p: Pick<Peek, "abs" | "label">,
  rel: string | null,
  width = Number.POSITIVE_INFINITY,
): string {
  const head = `${sanitize(p.label)} › `;
  const path = sanitize(rel ?? tildePath(p.abs));
  const room = width - stringWidth(head);
  if (stringWidth(path) <= room) return `${head}${path}`;
  if (room < 8) return truncate(`${head}${path}`, width);
  return `${head}${truncateStart(path, room)}`;
}

/**
 * Another vault's graph, as this one reaches it (opened once, its index refreshed): its links out, and other vaults'
 * links into it, read as its own vault reaches them.
 */
export function vaultGraph(app: App, root: string): Graph | null {
  const graph = app.reach.graphAt(root);
  if (graph && !graph.reach) graph.reach = new Reach(vaultAt(root));
  return graph;
}

/** Text read as Markdown as it is: what would format it, or end a link's text, escaped. */
function md(s: string): string {
  return s.replace(/[\\`*_[\]<>|~$]/g, "\\$&");
}

/**
 * A note's text and, under a rule, its backlinks (`graph`, its vault's, when it has an index): each a link to the
 * line linking here, from the note's folder — a link inside the peek like any. Without an index, how to see them.
 */
function withBacklinks(text: string, abs: string, label: string, graph: Graph | null, rel: string): string {
  const end = text.endsWith("\n") ? "" : "\n";
  if (!graph)
    return `${text}${end}\n---\n\n**Linked from:** ${md(label)} has no index here yet — \`o\` goes there, and finds them.\n`;
  const list = graph.backlinks(rel);
  if (!list.length) return `${text}${end}\n---\n\n**Linked from:** no note links here.\n`;
  const rows = list.map((b) => {
    const from = isAbsolute(b.from) ? b.from : join(graph.root, b.from);
    const href = relative(dirname(abs), from).replace(/[%#]/g, (c) => encodeURIComponent(c));
    const shown = graph.shownPath(from);
    return `- [${md(shown)}:${b.line}](<${href}#L${b.line}>)${b.text ? ` — ${md(b.text)}` : ""}`;
  });
  return `${text}${end}\n---\n\n**Linked from** (${list.length}):\n\n${rows.join("\n")}\n`;
}

/** A note of Elsewhere's (VV-D3) and, under a rule, why it has no backlinks: Elsewhere has no index. */
function withoutIndex(text: string): string {
  const end = text.endsWith("\n") ? "" : "\n";
  return `${text}${end}\n---\n\n**Linked from:** no backlinks in ${ELSEWHERE} — it has no index; a note in a vault or home has them.\n`;
}

/** Where the peek is now, to come back to. */
function here(app: App): Place | null {
  const f = app.floating;
  if (f?.kind !== "peek") return null;
  return { abs: f.peek.abs, loc: f.peek.loc, top: { ...f.view.topAnchor }, cursor: { ...f.view.curAnchor } };
}

/** `ctrl+o` (back) and forward inside the peek: the file a link moved it from, where it was read. */
export function peekStep(app: App, dir: "back" | "forward"): void {
  const p = peekOf(app);
  if (!p) return;
  const from = dir === "back" ? p.back : p.fwd;
  const to = here(app)!;
  const place = from.at(-1);
  if (!place)
    return app.message(
      "info",
      dir === "back" ? "the peek's first place — esc closes it, o goes there" : "no later place in the peek",
    );
  let text: string;
  try {
    text = readText(place.abs).text;
  } catch {
    from.pop();
    return app.message("warn", `${tildePath(place.abs)} is gone`);
  }
  from.pop();
  const back = dir === "back" ? p.back : [...p.back, to];
  const fwd = dir === "back" ? [...p.fwd, to] : p.fwd;
  show(app, { abs: place.abs, loc: place.loc, back, fwd, full: p.full }, text, place.top, place.cursor);
}

/**
 * Go where a file is (VV-D4): into its vault — Elsewhere among them (VV-D3) — the tabs becoming its own, as a switch
 * does (`ctrl+o` back). A switch refused (a note unsaved, said) leaves the peek as it was.
 */
export function goThere(app: App, abs: string, loc: VaultLocation, anchor?: Anchor): void {
  const f = app.floating;
  if (!app.vaults.switchVault(loc, abs, anchor) && f?.kind === "peek" && !app.floating) app.floating = f;
}

/** `o` in a peek: go there, where it's read. On a tab kept from a peek, into its vault, at the same place. */
export function peekGo(app: App): void {
  const f = app.floating;
  if (f?.kind === "peek") return goThere(app, f.peek.abs, f.peek.loc, { ...f.view.curAnchor.anchor });
  const v = app.view;
  if (!v?.buf.elsewhere) return app.message("info", "nothing to go to: o goes where a peek's file is");
  let loc: VaultLocation;
  try {
    loc = locateVault({ path: v.buf.abs });
  } catch {
    return app.message("warn", `${tildePath(v.buf.abs)} is gone`);
  }
  goThere(app, v.buf.abs, loc, { ...v.curAnchor.anchor });
}

/**
 * `t` in a peek: keep it as a tab here — the file read-only, marked with its vault's name (its tab, its path),
 * Elsewhere's too (VV-D3).
 */
export function peekKeep(app: App): void {
  const f = app.floating;
  if (f?.kind !== "peek") return app.message("info", "t keeps a peek as a tab: there's no peek open");
  const { abs, loc, label } = f.peek;
  const top = { ...f.view.topAnchor };
  const cursor = { ...f.view.curAnchor };
  app.overlays.closeFloating();
  const open = app.buffers.get(abs);
  const buf = open ?? app.buffer(abs);
  if (!buf) return;
  // Another vault's file is marked so by `buffer` (VV-D7), Elsewhere's too (VV-D3).
  if (!open && !buf.elsewhere && loc.mode === "folder") {
    buf.elsewhere = { vault: label, graph: null, rel: null };
    buf.readOnly = `read-only here: ${label}'s — o goes there, to edit it`;
  }
  const i = app.tabs.findIndex((t) => t.views.some((v) => v.buf === buf));
  if (i >= 0) {
    app.activeTab = i;
    const t = app.tabs[i]!;
    t.active = t.views.findIndex((v) => v.buf === buf);
  } else {
    app.tabs.push({
      views: [app.makeView(buf, top, cursor)],
      active: 0,
      orientation: "side",
      ratio: app.config.ui.split_ratio,
    });
    app.activeTab = app.tabs.length - 1;
  }
  app.region = "content";
  app.message("info", `${app.displayName(buf)}: kept as a tab, ${buf.readOnly ? "read-only" : "as it was open"}`);
}

/** `z` in a peek: the whole screen, or most of it again. */
export function peekFill(app: App): void {
  const p = peekOf(app);
  if (!p) return app.message("info", "z fills the screen with a peek: there's no peek open");
  p.full = !p.full;
  app.floating!.view.layoutKey = "";
}
