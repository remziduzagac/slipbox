// Open a read-only peek and apply backlink replies only to its current owner. Its file is read on a disk thread, no key
// waiting (SD-T5): the peek says `reading…` until it comes.

import { relative } from "node:path";
import { askBacklinks, backlinkStops, type BacklinksAnswer } from "../../../../core/workspace/graph/backlinks-jobs.ts";
import { classify } from "../../../../core/documents/model/filetypes.ts";
import type { Graph } from "../../../../core/workspace/graph/graph.ts";
import { rootLabel, tildePath } from "../../../../core/workspace/vaults/names.ts";
import type { Anchor, CursorAnchor } from "../../../../core/workspace/session/position.ts";
import type { VaultLocation } from "../../../../core/workspace/vaults/vault.ts";
import { answerOpen, type OpenAnswer } from "../../../../core/workspace/walk/key-jobs.ts";
import { diskThreads } from "../../../../core/workspace/walk/walk-thread.ts";
import type { App } from "../../../app/runtime/app.ts";
import { NoteBuffer } from "../../buffers/buffer.ts";
import { goThere, leadsOut, peekAsk } from "./paths.ts";
import { here, peekOf } from "./state.ts";
import { notRead, peekTitle, withBacklinks, withoutIndex } from "./presentation.ts";
import type { BacklinksState, Peek } from "./contracts.ts";
import { caughtUp, keepCaughtUp, parseHere, vaultGraph } from "./synchronization.ts";

/**
 * Where a link, a backlink or a search hit leads (VV-D7): out of this vault, read in a peek — or, `go`, gone into at
 * once — and true; this vault's own, false, for its caller to open as it does, a peek closed first.
 */
export function peekInstead(app: App, path: string, anchor?: Anchor, go = false, shown?: () => void): boolean {
  const out = leadsOut(app, path);
  if (!out) {
    if (peekOf(app)) app.overlays.closeFloating();
    return false;
  }
  if (go) {
    goThere(app, out.abs, out.loc, anchor);
    shown?.();
  } else peekAt(app, out.abs, out.loc, anchor, shown);
  return true;
}

/**
 * Read `abs` in the peek, at `anchor`: opened, or — a peek open already — moved there, where it was kept for `ctrl+o`.
 * A note shows its backlinks after its text when its vault has an index; else it says how to see them. `shown`, once
 * its text is there: read on a disk thread, later, the keys not waiting for it.
 */
export function peekAt(app: App, abs: string, loc: VaultLocation, anchor?: Anchor, shown?: () => void): void {
  // A link of this vault's on the way, not followed: asked first, as opening it here would ask (VV-D6). On a disk
  // thread, its way is checked with its read, and asked about once it's answered (`readPeek`).
  const again = () => peekAt(app, abs, loc, anchor, shown);
  if (!app.reads.offThread && app.following.gate(abs, again)) return;
  const kind = classify(abs, app.config.walk.extensions);
  if (kind.group === "binary") return app.message("warn", `${tildePath(abs)} is a binary file; slipbox opens text`);
  const open = (text: string, unread?: true) => {
    const was = peekOf(app);
    // Read again where it wasn't (a link answered): in its place, not a place further on.
    const back = was ? (was.unread && was.abs === abs ? was.back : [...was.back, here(app)!]) : [];
    if (!was && app.floating && !app.overlays.closeFloating()) return;
    show(app, { abs, loc, back, fwd: [], full: was?.full ?? false, ...(unread ? { unread } : {}) }, text, anchor);
  };
  readPeek(
    app,
    abs,
    loc,
    open,
    (why) =>
      why === "binary"
        ? said(app, "warn", `${tildePath(abs)} holds binary bytes; slipbox opens text`)
        : said(app, "error", `cannot read ${tildePath(abs)}`),
    { ...(anchor ? { anchor } : {}), again, ...(shown ? { shown } : {}) },
  );
}

/** `text` said, and given back to be shown. */
export function said(app: App, level: "warn" | "error", text: string): string {
  app.message(level, text);
  return text;
}

/** A peek's file read on a disk thread: the newest, whose answer is taken. An earlier one is withdrawn while it waits
 *  for a thread, else left to finish — its thread not started afresh for it — and its answer dropped. */
const peekReads = new WeakMap<App, AbortController>();

/** How a peek's file is read (`readPeek`). */
export interface PeekRead {
  /** Where it's shown, and its cursor. */
  anchor?: Anchor;
  cursor?: CursorAnchor;
  /** A link of this vault's keeping it asked about too (as `gate` asks), and the peek made again once it's answered. */
  again?: () => void;
  /** Once its text is shown. */
  shown?: () => void;
  /** The peek left where it is till it's read (a step back or forward): no `reading…`, and one that can't be read
   *  leaves it there, `failed` saying why. */
  stay?: boolean;
}

/**
 * `abs` read for the peek, its way checked as the place it's in (`loc`) has it (VV-D6), and `open`ed with its text; not
 * read there — a link not followed — said in the peek (`o` goes there, to choose); gone, or holding binary bytes (a
 * note's own name aside), `failed` says why. A test's App reads it here at once (SD-D10); else a disk thread does, no
 * key waiting (SD-T5): the peek opens saying `reading…` (`open`'s `unread`) until it comes, then shows it there at
 * `anchor` — or, not read, why — while that peek still shows; another peek's read drops it. `how.stay`: no `reading…`,
 * `open` or `failed` once it comes.
 */
export function readPeek(
  app: App,
  abs: string,
  loc: VaultLocation,
  open: (text: string, unread?: true) => void,
  failed: (why: "unread" | "binary") => string,
  how: PeekRead = {},
): void {
  const { anchor, cursor, again, shown } = how;
  const note = classify(abs, app.config.walk.extensions).group === "note";
  const { ask, own } = peekAsk(app, abs, loc);
  /** What's shown of the answer `a` (null: none came): its text, or what keeps it unread. */
  const answered = (a: OpenAnswer | null): { text: string; unread?: true; no?: "unread" | "binary" } => {
    const b = a?.blocked;
    if (b) {
      if (again && own && b.at === 0) app.following.ask(b.link, b.target, again);
      return { text: notRead(b, rootLabel(loc)), unread: true };
    }
    const text = a?.read && !("error" in a.read) ? a.read.text : null;
    if (text === null) return { text: "", unread: true, no: "unread" };
    return !note && text.slice(0, 8192).includes("\u0000") ? { text, unread: true, no: "binary" } : { text };
  };
  peekReads.get(app)?.abort();
  peekReads.delete(app);
  if (!app.reads.offThread) {
    const s = answered(answerOpen(ask));
    if (s.no) return void failed(s.no);
    open(s.text, s.unread);
    if (!s.unread) shown?.();
    return;
  }
  if (!how.stay) open("reading…", true);
  const f = app.floating;
  if (f?.kind !== "peek") return;
  const reading = f.peek;
  const newest = new AbortController();
  peekReads.set(app, newest);
  const { label: _, unread: __, ...p } = reading;
  // In the background, no key waiting: a key's read finds a thread free.
  void diskThreads()
    .open(ask, undefined, true, newest.signal)
    .catch(() => null)
    .then((a) => {
      const g = app.floating;
      // Another peek's read since, or the peek moved on or closed: dropped.
      if (peekReads.get(app) !== newest || g?.kind !== "peek" || g.peek !== reading) return;
      peekReads.delete(app);
      const s = answered(a);
      if (!how.stay) show(app, s.unread ? { ...p, unread: true } : p, s.no ? failed(s.no) : s.text, anchor, cursor);
      else if (s.no) failed(s.no);
      else open(s.text, s.unread);
      if (!s.unread) shown?.();
      app.host.requestRender();
    });
}

/** The peek showing `p`'s file: its buffer, read-only, its links read in its own vault. */
export function show(app: App, p: Omit<Peek, "label">, text: string, anchor?: Anchor, cursor?: CursorAnchor): void {
  const graph = p.loc.mode !== "folder" ? vaultGraph(app, p.loc.root) : null;
  const rel = graph ? relative(p.loc.root, p.abs) : null;
  const label = rootLabel(p.loc);
  // Whether its vault has an index, asked before anything reads it: a note's backlinks are read from it.
  const indexed = !!graph && graph.indexedAt() !== null;
  const buf = new NoteBuffer(null, p.abs, `peek:${p.abs}`);
  // Not read, it shows what's said of it, as Markdown.
  buf.kind = p.unread ? { group: "note", format: "markdown" } : classify(p.abs, app.config.walk.extensions);
  buf.virtual = { save: () => true };
  buf.readOnly = "a peek is read-only — o goes there, to edit it";
  buf.elsewhere = { vault: label, graph, rel };
  const markdown = !p.unread && buf.kind.group === "note" && buf.kind.format === "markdown";
  // A note's backlinks, from its vault's index; one without, built for the peek — but home's, built in slices while
  // nobody works (VV-D2).
  const ask = markdown && graph && rel !== null && (indexed || graph.loc.mode !== "home") ? { graph, rel } : null;
  // Back at a place (`ctrl+o`), the list it showed there, until its thread's comes: the cursor there finds its row.
  buf.loadText(
    ask
      ? withBacklinks(text, p.abs, label, p.rows ?? (indexed ? "reading" : "building"))
      : markdown && graph && rel !== null
        ? withBacklinks(text, p.abs, label, "none")
        : markdown && p.loc.mode === "folder"
          ? withoutIndex(text)
          : text,
  );
  const view = app.makeView(buf, anchor ? { ...anchor } : undefined, cursor);
  const peek: Peek = { ...p, label };
  const title = peekTitle({ ...p, label }, rel);
  app.floating = { kind: "peek", view, title, peek };
  app.region = "content";
  if (ask) peek.reading = readBacklinks(app, peek, ask.graph, text, ask.rel);
}

/**
 * The peeked note's backlinks, worked out on their thread (#10, D259), shown under its text when they come — the note
 * read as it was when peeked at, not the buffer's text with the line saying they're coming — if the peek still shows
 * it; then, whatever it shows by then, the graph its links are read in caught up, laid out again. Never rejected:
 * nothing awaits it but a test.
 */
async function readBacklinks(app: App, peek: Peek, graph: Graph, text: string, rel: string): Promise<void> {
  let state: BacklinksState;
  let answer: BacklinksAnswer | null = null;
  const stops = backlinkStops();
  try {
    answer = await askBacklinks({ root: graph.root, rel, own: app.loc.root });
    if (!answer) {
      // Its peek gone before its turn, or taken back from its thread for a newer peek's: the vault still caught up —
      // its index built, if it had none — after the peeks'; not when the thread was stopped (slipbox quitting, another
      // vault gone into), nor when this TUI let go of the graph.
      if (!app.quitting && backlinkStops() === stops && app.reach.held(graph.root) === graph) keepCaughtUp(app, graph);
      return;
    }
    state = answer.indexed ? answer.rows! : "none";
  } catch (e) {
    state = { failed: e instanceof Error ? e.message : String(e) };
    // Its thread failed (it couldn't start, it crashed, its time ran out): the notes the graph here lacks parsed here,
    // in slices, so the links its note makes are found all the same.
    parseHere(app, graph, () => app.reach);
  }
  try {
    const f = app.floating;
    // The same peek (a rename may have given this TUI another reach since: its rows stand).
    if (!app.quitting && f?.kind === "peek" && f.peek === peek) {
      // The list it shows now, kept with its place for `ctrl+o`: none, when it says why there's none.
      peek.rows = Array.isArray(state) ? state : undefined;
      f.view.buf.loadText(withBacklinks(text, peek.abs, peek.label, state));
      f.view.layoutKey = "";
      app.host.requestRender();
    }
    // Its rows first, then the graph here: its probe may wait on a disk, its rebuild read the vault's index.
    if (answer) await caughtUp(app, graph, answer);
  } catch {}
}
