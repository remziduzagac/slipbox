// The peek (VV-D7): another vault's file, or one of Elsewhere's (VV-D3), read where you are — a large floating window,
// the note rendered, read-only, found in with `/`, copied from. Looking never moves you; going there is a choice: `o`
// goes there (VV-D4), `t` keeps it as a tab here, read-only, `z` fills the screen, `esc` closes it. A link inside it to
// its own vault, or a third, moves the peek (`ctrl+o` back); one to this vault closes it and opens there.

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  askBacklinks,
  backlinkStops,
  type BacklinkRow,
  type BacklinksAnswer,
  configSignature,
  vaultSignature,
} from "../core/backlinks-jobs.ts";
import { classify } from "../core/filetypes.ts";
import { readText } from "../core/foundation/platform/fsutil.ts";
import type { Graph } from "../core/graph.ts";
import { ELSEWHERE, rootLabel, tildePath } from "../core/names.ts";
import type { Anchor, CursorAnchor } from "../core/position.ts";
import { Reach } from "../core/reach.ts";
import { noteIndexed } from "../core/registry.ts";
import { sanitize } from "../core/foundation/text/sanitize.ts";
import { linkSaid, probeFollowed } from "../core/symlinks.ts";
import { isInside, locateVault, type VaultLocation, vaultOf } from "../core/vault.ts";
import { stringWidth, truncate, truncateStart } from "../core/foundation/text/width.ts";
import type { App, View } from "./app.ts";
import { NoteBuffer } from "./buffer.ts";
import { parseInSlices } from "./watch.ts";

/** A place a peek showed, for `ctrl+o` inside it: with the backlinks it listed, shown again at once when it's back. */
interface Place {
  abs: string;
  loc: VaultLocation;
  top: Anchor;
  cursor: CursorAnchor;
  rows?: BacklinkRow[];
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
  /** Not read: a link of its place's on its way isn't followed there (VV-D6) — the peek says so, and `o` goes there. */
  unread?: boolean;
  /** Its note's backlinks being worked out on their thread (#10): settled once they're shown, or the peek moved on. */
  reading?: Promise<void>;
  /** The backlinks it lists, once they've come; or those it listed when last here, until they come again. */
  rows?: BacklinkRow[];
}

/**
 * The link keeping the peek from reading `abs` (VV-D6): one of this vault's on its way, asked about first (`gate`), or
 * one the place it's peeked into hasn't followed, by that place's rule — that vault's, home's, Elsewhere's from the
 * file's own folder.
 */
function unfollowed(app: App, abs: string, loc: VaultLocation): { link: string; target: string | null } | null {
  return app.following.blocked(abs) ?? app.following.blockedThere(abs, loc);
}

/** What a peek shows of a file it doesn't read (VV-D6): the link, and that going there is where it's asked. */
function notRead(b: { link: string; target: string | null }, label: string): string {
  return `**Not read here:** ${md(linkSaid(b.link, b.target))} isn't followed in ${md(label)}. \`o\` goes there, where opening it asks.\n`;
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
  // A link of this vault's on the way, not followed: asked first, as opening it here would ask (VV-D6).
  if (app.following.gate(abs, () => peekAt(app, abs, loc, anchor))) return;
  const kind = classify(abs, app.config.walk.extensions);
  if (kind.group === "binary") return app.message("warn", `${tildePath(abs)} is a binary file; slipbox opens text`);
  // One the place it's in hasn't followed: not read, said so in the peek — `o` goes there, to choose.
  const b = unfollowed(app, abs, loc);
  let text: string;
  if (b) text = notRead(b, rootLabel(loc));
  else {
    try {
      text = readText(abs).text;
    } catch {
      return app.message("error", `cannot read ${tildePath(abs)}`);
    }
    if (kind.group !== "note" && text.slice(0, 8192).includes("\u0000"))
      return app.message("warn", `${tildePath(abs)} holds binary bytes; slipbox opens text`);
  }
  const was = peekOf(app);
  const back = was ? [...was.back, here(app)!] : [];
  if (!was && app.floating && !app.overlays.closeFloating()) return;
  show(app, { abs, loc, back, fwd: [], full: was?.full ?? false, ...(b ? { unread: true } : {}) }, text, anchor);
}

/** The peek showing `p`'s file: its buffer, read-only, its links read in its own vault. */
function show(app: App, p: Omit<Peek, "label">, text: string, anchor?: Anchor, cursor?: CursorAnchor): void {
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

/** How the links a vault follows are asked whether they answer, here (a test holds the answer back). */
export const peekProbe = { followed: probeFollowed };

/**
 * Each vault's catch-ups here, one after another (#10): an answer that comes while another's catch-up awaits its probe
 * is read against the graph that one leaves, never against one it let go of.
 */
const catching = new WeakMap<App, Map<string, Promise<void>>>();

/**
 * Where a graph of another vault is held: this TUI's reach, as it is when asked (a rename may have made it anew) — or a
 * peeked vault's own reach, for a third vault that vault's links reach, while that vault's graph is held itself; null,
 * let go of.
 */
type Holder = () => Reach | null;

/**
 * Another vault's graph, read on the main thread for its links (`vaultGraph`), caught up with what its thread just
 * read — after any catch-up of that vault still under way (`catching`).
 */
function caughtUp(app: App, graph: Graph, answer: BacklinksAnswer, holder: Holder = () => app.reach): Promise<void> {
  let byRoot = catching.get(app);
  if (!byRoot) catching.set(app, (byRoot = new Map()));
  const root = graph.root;
  const step = (byRoot.get(root) ?? Promise.resolve()).then(() => catchUp(app, graph, answer, holder));
  const settled = step.catch(() => {});
  byRoot.set(root, settled);
  void settled.then(() => {
    if (byRoot.get(root) === settled) byRoot.delete(root);
  });
  return step;
}

/**
 * The graph held now for `asked`'s vault (`holder`), against the answer (#10) — the answer is of the vault on disk, and
 * a rename may have given this TUI another reach since, whose graph of that vault it then catches up; none held
 * (another vault gone into since), nothing. Its walk changed, or it has notes it didn't parse that its index has now:
 * opened again from that index, the roots in and around it found again, every view laid out again. Its settings
 * changed since it was opened: opened anew with them.
 */
async function catchUp(app: App, asked: Graph, answer: BacklinksAnswer, holder: Holder): Promise<void> {
  if (app.quitting || !answer.indexed) return;
  if (answer.wrote) noteIndexed(asked.loc.key);
  const others = answer.wrote || answer.others.length > 0;
  // This vault's backlinks from others read again, every view laid out with them, whatever becomes of the graph there:
  // an index just written may hold some (that vault's notes deleted, a vault nested in it built for the first time).
  // The explorer's rows too: a vault's says whether it has an index.
  if (others) {
    app.graph.othersChanged();
    app.explorer.invalidateTree();
  }
  let laidOut = false;
  try {
    laidOut = await rebuilt(app, asked, answer, holder);
  } finally {
    // The vaults nested in it stamped indexed once the rebuild has recorded those found: one new since isn't in the
    // machine's list before. Not once slipbox is quitting.
    if (answer.others.length && !app.quitting) noteIndexed(answer.others);
    // Laid out again whatever the rebuild did, failed included.
    if (others && !laidOut) relayout(app);
  }
}

/** The graph held for `asked`'s vault caught up with the answer (`catchUp`): true when it was, and laid out again. */
async function rebuilt(
  app: App,
  asked: Graph,
  answer: Extract<BacklinksAnswer, { indexed: true }>,
  holder: Holder,
): Promise<boolean> {
  // The one held now — never opened for this — and an answer caught up before this one may have opened it anew.
  const reach = holder();
  const graph = reach?.held(asked.root);
  if (!reach || !graph) return false;
  // Its redirects read again when next asked: its thread, catching it up, may have found moves and written them — the
  // only one that does (`readOnly`).
  graph.forgetRedirects();
  const settings = answer.config !== configSignature(graph.config);
  // Its walk the thread's, every note parsed — or being parsed here, which a rebuild would start again.
  // Home's notes still to parse are never parsed here (VV-D2): an index written since it was built — by its thread,
  // a run another answer rode on, the background index, the CLI — may hold them; else a rebuild reads the same, at
  // each answer, for a note slipbox can't read, which stays to parse.
  const pending = !!graph.pendingCount && !parsing.has(graph) && (graph.loc.mode !== "home" || graph.indexChanged());
  if (!settings && answer.signature === signatureOf(graph) && !pending) return false;
  // The links it follows asked here too, as its thread asked them (VV-D6): else this walk leaves out what that one has.
  await peekProbe.followed(graph.root);
  if (app.quitting || holder()?.held(graph.root) !== graph) return false;
  let g: Graph | null = graph;
  if (settings) g = reopened(app, graph, reach);
  else {
    // A graph a link opened has no reach of its own yet: given one now, the walk made.
    const was = graph.reach ? nestedIn(graph) : null;
    graph.build(true, "lazy");
    // The roots in and around it found only then, or when the vaults in it changed: each found is recorded in the
    // machine's list, its file read and written again — not for an answer that changes nothing.
    if (nestedIn(graph) !== was) reachFrom(app, graph);
  }
  if (!g) return false;
  relayout(app);
  // Notes its index still lacks: the thread couldn't write it (a full disk, a cache folder read-only).
  parseHere(app, g, holder);
  return true;
}

/**
 * Another vault's notes the graph here lacks, parsed here as this vault's own are — a slice at a time, a big one on the
 * parse threads, never all at once — when its thread can't give them (#10): it couldn't write the index, or couldn't
 * run. Stopped once the graph is let go of: one opened anew with other settings has its own parse.
 */
function parseHere(app: App, graph: Graph, holder: Holder): void {
  // Home's are parsed while nobody works, by the background index (VV-D2): never here meanwhile.
  if (graph.loc.mode === "home") return;
  if (!graph.pendingCount || parsing.has(graph) || app.quitting || holder()?.held(graph.root) !== graph) return;
  parsing.add(graph);
  parseInSlices(() => graph, {
    stopped: () => app.quitting || retired.has(graph) || holder()?.held(graph.root) !== graph,
    done: () => {
      parsing.delete(graph);
      relayout(app);
    },
  });
}

/**
 * Another vault's graph opened anew, with its settings as they are now: let go of, every buffer reading through it
 * given the new one. Its settings are fixed when it's made, and with others it walks and resolves differently.
 */
function reopened(app: App, graph: Graph, reach: Reach): Graph | null {
  // Not opened anew (the vault gone since): the old kept, its buffers reading through it still.
  const fresh = reach.reopen(graph.root);
  if (!fresh) return null;
  retired.add(graph);
  for (const b of everyBuffer(app))
    if (b.elsewhere?.graph === graph) b.elsewhere = { ...b.elsewhere, graph: fresh, rel: relative(fresh.root, b.abs) };
  // Its reach last: every buffer reads through the new graph whatever finding the roots around it does.
  if (!fresh.reach) reachFrom(app, fresh);
  return fresh;
}

/** Other vaults' graphs being parsed here, a slice at a time (`catchUp`); and those let go of, opened anew. */
const parsing = new WeakSet<Graph>();
const retired = new WeakSet<Graph>();

/**
 * Every view laid out again once another vault's graph here caught up: a peek's or a kept tab's reads through it, and
 * this vault's own notes may reach a note of it by a name it has only now.
 */
function relayout(app: App): void {
  // Not a screen going away.
  if (app.quitting) return;
  for (const b of everyBuffer(app)) b.invalidateLayouts();
  app.relayoutAll();
  app.host.requestRender();
}

/** Every buffer open here: in the tabs, and the peek's. */
function everyBuffer(app: App): Set<NoteBuffer> {
  return new Set([...app.buffers.values(), ...app.allViews().map((v) => v.buf)]);
}

/** A graph's walk signature here, kept by its generation: `vaultSignature` sorts and hashes the whole walk. */
const signatures = new WeakMap<Graph, { generation: number; signature: string }>();

function signatureOf(graph: Graph): string {
  const hit = signatures.get(graph);
  if (hit?.generation === graph.generation) return hit.signature;
  const signature = vaultSignature(graph);
  signatures.set(graph, { generation: graph.generation, signature });
  return signature;
}

/** The vaults nested in a vault, as its walk found them, in a word. */
function nestedIn(graph: Graph): string {
  return graph.nestedRoots().sort().join("\0");
}

/**
 * The TUI's reach of other vaults (#10): never `thorough` — a vault is never parsed whole here to look for a name — and
 * each graph it opens for a link with notes its index lacks caught up on the backlinks' thread (`keepCaughtUp`), its
 * index built if it has none (home's excepted, VV-D2), the screen laid out again then: a name only those notes declare
 * is found a moment later. One taken from the machine's list (a search of every vault, a relink) only once a link
 * reaches it.
 */
export function tuiReach(app: App, loc: VaultLocation): Reach {
  // Their state — indexes, redirects, the commit caught up with — written by the thread, never here (nor `git diff`
  // run here to find moves); a vault nested in this one with none, built there too.
  return new Reach(loc, {
    thorough: false,
    readOnly: true,
    nested: "open",
    opened: reachedFor(app, () => app.reach),
  });
}

/**
 * The `opened` of a reach of the TUI's: asked once what opened it is done — a peek opening it asks of the vault itself,
 * and the catch-up rides on it — when its index is behind: notes to parse, or notes gone that it still lists, links
 * from them counted here. Not this TUI's own vault, reached from another (`[[here:note]]`): its index is its own
 * graph's, indexed in the background here, and its state is written on this thread alone.
 */
function reachedFor(app: App, holder: Holder): (g: Graph) => void {
  return (g) =>
    queueMicrotask(() => {
      if (g.indexBehind && g.loc.key !== app.loc.key) keepCaughtUp(app, g, holder);
    });
}

/**
 * This TUI's reach made anew (a rename made or unmade a vault): every buffer of another vault's file — a kept tab's,
 * the peek's — given that vault's graph as the new reach opens it, and laid out again; the old reach's graphs are let
 * go, never caught up again.
 */
export function reachedAgain(app: App): void {
  const fresh = new Set<Graph>();
  for (const b of everyBuffer(app)) {
    const e = b.elsewhere;
    if (!e?.graph) continue;
    retired.add(e.graph);
    // Where its file is now: a vault unmade, its file is this vault's, or none's — read without a vault's links, never
    // opened as a vault it isn't any more.
    const root = vaultOf(b.abs);
    const graph = root === e.graph.root ? vaultGraph(app, root) : null;
    b.elsewhere = { ...e, graph, rel: graph ? relative(graph.root, b.abs) : null };
    if (graph) fresh.add(graph);
  }
  relayout(app);
  // Each caught up, as the old was — its index built if it has none, home's excepted (VV-D2): what the old one's
  // catch-up was doing, its answer, comes to the new one too.
  for (const g of fresh) keepCaughtUp(app, g);
}

/**
 * Another vault's graph, reaching from its own vault (the TUI's way: laid out as it's parsed, never parsed whole here
 * first). The roots nested in it and around it recorded here: its backlinks' thread reads them from the machine's
 * list, and indexes those without an index, writing to the list nothing itself (`backlinks-jobs.ts`).
 */
function reachFrom(app: App, graph: Graph): void {
  // A third vault its links reach, caught up as this TUI's are: held by this reach, as the graph has it then — while
  // this TUI holds the graph itself, not retired.
  const holder: Holder = () =>
    !retired.has(graph) && app.reach.held(graph.root) === graph ? (graph.reach as Reach) : null;
  const reach = new Reach(graph.loc, {
    thorough: false,
    readOnly: true,
    nested: "none",
    opened: reachedFor(app, holder),
  });
  graph.reach = reach;
  reach.discover(graph);
}

/**
 * A tab of another vault's file (`markElsewhere`): that vault's index caught up on the thread, and the graph its links
 * are read in with it — as a peek's are (#10).
 */
export function keepCaughtUp(app: App, graph: Graph, holder: Holder = () => app.reach): void {
  if (app.quitting) return;
  void askBacklinks({ root: graph.root, rel: null, own: app.loc.root })
    .then(
      (answer) => (answer ? caughtUp(app, graph, answer, holder) : undefined),
      // Its thread failed: the notes the graph here lacks parsed here, in slices.
      () => parseHere(app, graph, holder),
    )
    .catch(() => {});
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
 * Another vault's graph, as this one reaches it (opened once, its index read; caught up on its thread): its links
 * out, and other vaults' links into it, read as its own vault reaches them.
 */
export function vaultGraph(app: App, root: string): Graph | null {
  const graph = app.reach.graphAt(root);
  if (graph && !graph.reach) reachFrom(app, graph);
  return graph;
}

/** Text read as Markdown as it is: what would format it, or end a link's text, escaped. */
function md(s: string): string {
  return s.replace(/[\\`*_[\]<>|~$]/g, "\\$&");
}

/** A file's name on one line: a control character in it — a newline — shown as its escape (`\n`, `\x1b`). */
function visible(s: string): string {
  const named: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };
  return s.replace(/[\x00-\x1f\x7f]/g, (c) => named[c] ?? `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

/**
 * Where a peeked note's backlinks are (#10): being read from its vault's index, or its index being built, on their
 * thread; none to show (home without an index); shown; or not worked out, and why.
 */
type BacklinksState = "reading" | "building" | "none" | BacklinkRow[] | { failed: string };

/**
 * A note's text and, under a rule, its backlinks: each a link to the line linking here, from the note's folder — a
 * link inside the peek like any. While they're worked out, or without them, a line saying so.
 */
function withBacklinks(text: string, abs: string, label: string, state: BacklinksState): string {
  const end = text.endsWith("\n") ? "" : "\n";
  const said = (s: string) => `${text}${end}\n---\n\n**Linked from:** ${s}\n`;
  if (state === "reading") return said(`reading ${md(label)}'s index…`);
  if (state === "building")
    return said(`${md(label)} has no index here yet — building it; they're shown when it's done.`);
  if (state === "none") return said(`${md(label)} has no index here yet — \`o\` goes there, and finds them.`);
  if (!Array.isArray(state)) return said(`not worked out — ${md(visible(state.failed))}.`);
  if (!state.length) return said("no note links here.");
  const rows = state.map((b) => {
    // What would end the `<…>` or its line, or start a fragment, percent-encoded: a file's name can hold any of them.
    const href = relative(dirname(abs), b.from).replace(/[%#<>\x00-\x1f\x7f]/g, (c) => encodeURIComponent(c));
    return `- [${md(visible(b.shown))}:${b.line}](<${href}#L${b.line}>)${b.text ? ` — ${md(b.text)}` : ""}`;
  });
  return `${text}${end}\n---\n\n**Linked from** (${state.length}):\n\n${rows.join("\n")}\n`;
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
  return {
    abs: f.peek.abs,
    loc: f.peek.loc,
    top: { ...f.view.topAnchor },
    cursor: { ...f.view.curAnchor },
    ...(f.peek.rows ? { rows: f.peek.rows } : {}),
  };
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
  // Read as a link to it is: not through a link not followed, which can have changed since (VV-D6).
  const b = unfollowed(app, place.abs, place.loc);
  let text: string;
  if (b) text = notRead(b, rootLabel(place.loc));
  else
    try {
      text = readText(place.abs).text;
    } catch {
      from.pop();
      return app.message("warn", `${tildePath(place.abs)} is gone`);
    }
  from.pop();
  const back = dir === "back" ? p.back : [...p.back, to];
  const fwd = dir === "back" ? [...p.fwd, to] : p.fwd;
  show(
    app,
    {
      abs: place.abs,
      loc: place.loc,
      back,
      fwd,
      full: p.full,
      ...(b ? { unread: true } : {}),
      ...(place.rows && !b ? { rows: place.rows } : {}),
    },
    text,
    place.top,
    place.cursor,
  );
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
  // A tab reads it: not through a link its place hasn't followed (VV-D6).
  const b = unfollowed(app, abs, loc);
  if (b)
    return app.message("warn", `${linkSaid(b.link, b.target)} isn't followed in ${label} — o goes there to choose`);
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
