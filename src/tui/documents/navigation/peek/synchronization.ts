// Serialize graph catch-up, parsing, retirement and reach updates for each live App.

import { relative } from "node:path";
import {
  askBacklinks,
  type BacklinksAnswer,
  configSignature,
  vaultSignature,
} from "../../../../core/workspace/graph/backlinks-jobs.ts";
import type { Graph } from "../../../../core/workspace/graph/graph.ts";
import { Reach } from "../../../../core/workspace/links/reach.ts";
import { noteIndexed } from "../../../../core/workspace/vaults/registry.ts";
import { type VaultLocation, vaultOf } from "../../../../core/workspace/vaults/vault.ts";
import type { App } from "../../../app/runtime/app.ts";
import type { NoteBuffer } from "../../buffers/buffer.ts";
import { parseInSlices } from "../../../app/runtime/watch.ts";
import type { Holder } from "./contracts.ts";
import { peekProbe } from "./probe.ts";

/**
 * Each vault's catch-ups here, one after another (#10): an answer that comes while another's catch-up awaits its probe
 * is read against the graph that one leaves, never against one it let go of.
 */
export const catching = new WeakMap<App, Map<string, Promise<void>>>();

/**
 * Another vault's graph, read on the main thread for its links (`vaultGraph`), caught up with what its thread just
 * read — after any catch-up of that vault still under way (`catching`).
 */
export function caughtUp(
  app: App,
  graph: Graph,
  answer: BacklinksAnswer,
  holder: Holder = () => app.reach,
): Promise<void> {
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
export async function catchUp(app: App, asked: Graph, answer: BacklinksAnswer, holder: Holder): Promise<void> {
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
export async function rebuilt(
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
export function parseHere(app: App, graph: Graph, holder: Holder): void {
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
export function reopened(app: App, graph: Graph, reach: Reach): Graph | null {
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
export const parsing = new WeakSet<Graph>();

export const retired = new WeakSet<Graph>();

/**
 * Every view laid out again once another vault's graph here caught up: a peek's or a kept tab's reads through it, and
 * this vault's own notes may reach a note of it by a name it has only now.
 */
export function relayout(app: App): void {
  // Not a screen going away.
  if (app.quitting) return;
  for (const b of everyBuffer(app)) b.invalidateLayouts();
  app.relayoutAll();
  app.host.requestRender();
}

/** Every buffer open here: in the tabs, and the peek's. */
export function everyBuffer(app: App): Set<NoteBuffer> {
  return new Set([...app.buffers.values(), ...app.allViews().map((v) => v.buf)]);
}

/** A graph's walk signature here, kept by its generation: `vaultSignature` sorts and hashes the whole walk. */
export const signatures = new WeakMap<Graph, { generation: number; signature: string }>();

export function signatureOf(graph: Graph): string {
  const hit = signatures.get(graph);
  if (hit?.generation === graph.generation) return hit.signature;
  const signature = vaultSignature(graph);
  signatures.set(graph, { generation: graph.generation, signature });
  return signature;
}

/** The vaults nested in a vault, as its walk found them, in a word. */
export function nestedIn(graph: Graph): string {
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
export function reachedFor(app: App, holder: Holder): (g: Graph) => void {
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
export function reachFrom(app: App, graph: Graph): void {
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
 * Another vault's graph, as this one reaches it (opened once, its index read; caught up on its thread): its links
 * out, and other vaults' links into it, read as its own vault reaches them.
 */
export function vaultGraph(app: App, root: string): Graph | null {
  const graph = app.reach.graphAt(root);
  if (graph && !graph.reach) reachFrom(app, graph);
  return graph;
}
