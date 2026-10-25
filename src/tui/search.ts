// Finding in the TUI: the vault's search index kept as the app runs (6.5, 6.9) and the list ranked as you type;
// notes by tag and by type; find's replace row, and a replace across every note.

import { layoutMatches, matchText } from "../core/regex-jobs.ts";
import { compilePattern, findAll } from "../core/replace.ts";
import { planReplaceLater } from "../core/replace-files.ts";
import * as R from "./replacing.ts";
import { IndexJob, indexFile, search, type SearchHit, SearchIndex, type SearchResult } from "../core/search.ts";
import { leadsOut, peekAt } from "./peek.ts";
import { notesOfType, ofType, type TypedNote } from "../core/doctypes.ts";
import { type Scope, SCOPES, searchOthers } from "../core/scope.ts";
import { isListed } from "../core/vault.ts";
import { ELSEWHERE } from "../core/names.ts";
import { frontmatterFindings, rootTypes } from "../core/diagnostics.ts";
import type { App, View, ListItem, ListOverlay, PromptOverlay } from "./app.ts";
import type { Layout } from "../core/layout/ir.ts";
import type { FindState } from "./app.ts";
import { stringWidth, prefixWidths } from "../core/width.ts";
import { refilter } from "./overlays.ts";

/** Search: the index and its list, tags and types, replace across notes. */
export class Search {
  constructor(readonly app: App) {}

  /** The root's search index; null: none here (`~` or `/` opened as a plain folder, `[search] engine = "scan"`, SQLite couldn't). */
  index: SearchIndex | null = null;
  /** Bringing the index up to the files, a slice at a time; null when it's done. */
  job: IndexJob | null = null;
  private stopFeed: (() => void) | null = null;
  /** The search list on screen, refreshed when the index is ready. */
  private list: ListOverlay | null = null;

  stop(): void {
    this.stopFeed?.();
    this.stopFeed = null;
    this.index?.close();
    this.index = null;
    this.job = null;
    this.list = null;
  }

  /** The index opened (or made) and caught up in the background; the graph's changes followed. */
  start(): void {
    this.stop();
    if (isListed(this.app.loc) || this.app.config.search.engine === "scan") return;
    const idx = SearchIndex.open(this.app.loc);
    if (!idx) return;
    const g = this.app.graph;
    this.index = idx;
    // Every change the graph hears of, at once: a file is quick to index again.
    this.stopFeed = g.onChange((c) => {
      if (this.index !== idx || c.kind === "moved") return;
      try {
        indexFile(g, idx, c.path);
      } catch {}
    });
    let job: IndexJob;
    try {
      job = new IndexJob(g, idx);
    } catch {
      return;
    }
    if (job.done) {
      job.step();
      return;
    }
    this.job = job;
    const tick = () => {
      if (this.job !== job) return;
      let done = false;
      try {
        done = job.step(12);
      } catch {
        done = true;
      }
      if (!done) {
        const t = setTimeout(tick, 0);
        (t as { unref?: () => void }).unref?.();
        return;
      }
      this.job = null;
      if (this.app.overlay && this.app.overlay === this.list) refilter(this.app.overlay);
      this.app.host.requestRender();
    };
    const t = setTimeout(tick, 0);
    (t as { unref?: () => void }).unref?.();
  }

  /** Once the index is built and caught up (tests). */
  async whenIndexed(): Promise<void> {
    while (this.job) await new Promise((r) => setTimeout(r, 5));
  }

  /**
   * Search the vault: the index once it's caught up, else a scan of the files. Unsaved notes count
   * as they are on screen: scanned, in place of what the index has of them.
   */
  query(input: string, limit = 50): SearchResult {
    const idx = this.index && !this.job ? this.index : null;
    const unsaved = new Map<string, string>();
    for (const b of this.app.dirtyBuffers())
      if (b.rel !== null && !b.virtual && (this.app.graph.notes.has(b.rel) || b.kind.group === "data"))
        unsaved.set(b.rel, b.source);
    if (!idx) return search(this.app.graph, null, input, { limit, texts: unsaved });
    const r = search(this.app.graph, idx, input, { limit });
    if (!unsaved.size) return r;
    const mine = new Map(
      search(this.app.graph, null, input, {
        limit,
        texts: unsaved,
        only: [...unsaved.keys()],
        relax: r.relaxed,
      }).hits.map((h) => [h.path, h]),
    );
    const hits = r.hits.filter((h) => !unsaved.has(h.path) || mine.has(h.path)).map((h) => mine.get(h.path) ?? h);
    for (const h of mine.values()) if (!hits.includes(h)) hits.unshift(h);
    return { ...r, hits: hits.slice(0, limit) };
  }

  /** The search list (6.5): notes ranked by the words as they're typed; enter opens one at its match. */
  open(seed = ""): void {
    // Elsewhere has no index (VV-D3): nothing to search across, said so rather than shown empty.
    if (this.app.loc.mode === "folder")
      return this.app.message(
        "info",
        `${ELSEWHERE} has no index to search — search finds in a vault or home: space v v goes into one`,
      );
    let list: ListOverlay | null = null;
    // By root (20.16, 21.10): here; ctrl+a widens to the folders linked to or from it, then to every one.
    let scope: Scope = "here";
    const titled = (t: string) => {
      if (list) list.title = t;
      return t;
    };
    const where = () =>
      scope === "here" ? "" : scope === "linked" ? " — and the folders linked to it" : " — and every folder known";
    const HELP =
      'search here — words, "a phrase", prefix*, -not, title:word, #tag, path:folder/ — ctrl+a: more folders';
    const item = (h: SearchHit & { shown?: string }): ListItem => {
      const lead = h.heading ? `${h.heading} — ` : "";
      return {
        label: `${h.shown ?? h.path}:${h.line}`,
        detail: `${lead}${h.snippet}`,
        detailMarks: h.marks.map(([a, b]) => [a + lead.length, b + lead.length] as [number, number]),
        hint: h.more ? `+${h.more}` : undefined,
        data: h,
      };
    };
    const source = (input: string): ListItem[] => {
      if (!input.trim()) return titled(`${HELP}${where()}`), [];
      const job = this.job;
      if (job && this.index)
        return (
          titled(
            `search — the folder is being indexed: ${job.indexed.toLocaleString("en")} of ${job.todo.length.toLocaleString("en")} files…`,
          ),
          []
        );
      const r = this.query(input);
      const others = scope === "here" ? null : searchOthers(this.app.graph, input, scope);
      const n = r.hits.length + (others?.hits.length ?? 0);
      titled(
        `"${input.trim()}" — ${n} ${n === 1 ? "file" : "files"}${r.relaxed ? " with some of the words" : ""}${r.engine === "scan" ? " (scanned: no index here)" : ""}${where()}`,
      );
      const items = r.hits.map(item);
      if (others?.hits.length)
        items.push(
          { label: scope === "linked" ? "linked folders" : "other folders", header: true, data: null },
          ...others.hits.map(item),
        );
      return items;
    };
    this.app.overlays.openList({
      title: HELP,
      items: [],
      source,
      input: seed,
      accept: (item) => {
        const h = item.data as { path: string; line: number; column: number; abs?: string; vault?: string | null };
        // Another vault's: read in a peek, at the line (VV-D7), going there a choice.
        const out = h.abs ? leadsOut(this.app, h.abs) : null;
        if (out) return peekAt(this.app, out.abs, out.loc, { heading: null, headingIndex: 0, offset: 0, line: h.line });
        this.app.openAt(h.path, h.line, h.column);
      },
      widen: () => {
        scope = SCOPES[(SCOPES.indexOf(scope) + 1) % SCOPES.length]!;
      },
    });
    list = this.app.overlay as ListOverlay;
    this.list = list;
    if (seed) list.title = titled(list.title);
  }

  /** The vault's tags (1.6), with how many notes carry each, nested ones under their parents: pick one for its notes. */
  openTagList(): void {
    const tags = this.app.graph.tags();
    if (!tags.length) return this.app.message("info", "no tags here: #tag in a note, or tags: in its frontmatter");
    this.app.overlays.openList({
      title: `Tags (${tags.length})`,
      items: tags.map((t) => ({
        label: `#${t.tag}`,
        hint: `${t.count} note${t.count === 1 ? "" : "s"}`,
        indent: t.tag.split("/").length - 1,
        data: t.tag,
      })),
      accept: (it) => this.openTagNotes(it.data as string),
    });
  }

  /** The document types here (22.3) — skill, adr, the config's — each with how many notes are of it: pick one for its
   *  notes. */
  openTypeList(): void {
    const types = rootTypes(this.app.graph);
    const notes = [...this.app.graph.notes.keys()];
    const findings = frontmatterFindings(this.app.graph);
    this.app.overlays.openList({
      title: `Document types (${types.length})`,
      items: types.map((t) => {
        const n = notes.filter((rel) => ofType(rel, t)).length;
        const bad = findings.filter((f) => ofType(f.path, t)).length;
        return {
          label: t.name,
          hint: `${n} note${n === 1 ? "" : "s"}${bad ? `, ${bad} breaking its rules` : ""}${t.source === "config" ? " · yours" : ""}`,
          data: t.name,
        };
      }),
      accept: (it) => this.openTypeNotes(it.data as string),
    });
  }

  /** A type's notes (22.3), by number then path, each its status — what supersedes it too: pick one to open. */
  openTypeNotes(name: string): void {
    const t = rootTypes(this.app.graph).find((x) => x.name === name);
    if (!t) return this.app.message("info", `no document type "${name}" here: space f d lists them`);
    const list = this.typedNotes(t.name);
    if (!list.length) return this.app.message("info", `no ${t.name} notes here (${t.paths.join(", ")})`);
    this.app.overlays.openList({
      title: `${t.name} — ${list.length} note${list.length === 1 ? "" : "s"}`,
      items: list.map((n) => ({
        label: `${n.number === null ? "" : `${n.number}  `}${n.title || n.path}`,
        hint: `${n.status ? `${n.status}${n.supersededBy ? ` → ${n.supersededBy}` : ""} · ` : ""}${n.path}`,
        data: n.path,
      })),
      accept: (it) => {
        this.app.region = "content";
        this.app.open(it.data as string);
      },
    });
  }

  /** A type's notes, in their order, titles read. */
  private typedNotes(name: string): TypedNote[] {
    const t = rootTypes(this.app.graph).find((x) => x.name === name);
    if (!t) return [];
    const notes = [...this.app.graph.notes.entries()].map(([path, e]) => ({ path, title: e.title ?? "" }));
    return notesOfType(t, notes, (rel) => this.app.graph.textOf(rel));
  }

  /** `] t` / `[ t` (22.3): the next or previous note of this note's document type, in the type's order. */
  typeStep(dir: 1 | -1): void {
    const rel = this.app.view?.buf.rel;
    if (!rel) return this.app.message("info", "open a note of a document type: space f d lists them");
    const t = rootTypes(this.app.graph).find((x) => ofType(rel, x));
    if (!t) return this.app.message("info", `${rel} is of no document type: space f d lists them`);
    const list = this.typedNotes(t.name);
    const i = list.findIndex((n) => n.path === rel);
    const next = list[i + dir];
    if (!next) return this.app.message("info", `the ${dir > 0 ? "last" : "first"} ${t.name} (${list.length})`);
    this.app.open(next.path);
    this.app.message("info", `${t.name} ${i + dir + 1} of ${list.length}${next.status ? ` — ${next.status}` : ""}`);
  }

  /** The notes with a tag (1.6) — its nested tags' too: pick one to open. */
  openTagNotes(tag: string): void {
    const t = this.app.graph.tagged(tag);
    if (!t) return this.app.message("info", `no note has #${tag.replace(/^#/, "")}`);
    this.app.overlays.openList({
      title: `#${t.tag} — ${t.notes.length} note${t.notes.length === 1 ? "" : "s"}`,
      items: t.notes.map((rel) => ({ label: rel, hint: this.app.graph.notes.get(rel)?.title ?? "", data: rel })),
      accept: (it) => {
        this.app.region = "content";
        this.app.open(it.data as string);
      },
    });
  }

  /** ⇄ / alt+h: the replace row under a window's find row, opened (with find, if need be) or closed. */
  async toggleReplaceRow(view: View): Promise<void> {
    const o = this.app.overlay;
    const typing = o?.kind === "prompt" && o.view === view ? o : null;
    if (typing?.replace?.confirm) return;
    if (typing?.replace) {
      typing.replace = undefined;
      typing.change?.(typing.text);
    } else if (typing) R.openReplace(this.app, typing, view);
    else await this.app.run("find.replace");
  }

  /** Flip a window's find toggle (regex, whole words); the search it has redoes itself with it. */
  toggleFindOpt(view: View, key: "regex" | "whole"): void {
    const o = { ...(view.findOpts ?? { regex: false, whole: false }) };
    o[key] = !o[key];
    view.findOpts = o;
    const typing = this.app.overlay?.kind === "prompt" && this.app.overlay.view === view;
    if (view.find && !typing) {
      const f = computeFind(
        this.app.currentLayout(view),
        view.find.query,
        view.find.current,
        o.whole,
        o.regex,
        false,
        view,
      );
      view.find = f;
    }
    this.app.message("info", `${key === "regex" ? "regex" : "whole words"}: ${o[key] ? "on" : "off"}`);
  }

  /** Keys in the replace field: its text, enter replaces one, alt+enter (alt+a) all, ctrl+n/p move. */
  async replaceFieldKey(o: PromptOverlay, view: View, key: string, typed: string | null): Promise<void> {
    const r = o.replace!;
    switch (key) {
      case "enter":
        return R.replaceOne(this.app, o, view);
      case "alt+enter":
      case "alt+a":
        return R.replaceAll(this.app, o, view);
      case "ctrl+n":
      case "down":
        return R.stepMatch(this.app, o, view, 1);
      case "ctrl+p":
      case "up":
        return R.stepMatch(this.app, o, view, -1);
      case "backspace":
        r.text = [...r.text].slice(0, -1).join("");
        return;
      case "ctrl+w":
      case "ctrl+backspace":
        r.text = r.text.replace(/\S*\s*$/, "");
        return;
      case "ctrl+u":
        r.text = "";
        return;
    }
    if (typed !== null) r.text += typed;
  }

  /** A find across files' label: what it asks, and which of the window's find toggles are on. */
  acrossLabel(base: string, view = this.app.view): string {
    const o = view?.findOpts;
    const on = [o?.regex && "regex", o?.whole && "whole words"].filter(Boolean);
    return `${base}${on.length ? ` (${on.join(", ")})` : ""}`;
  }

  /**
   * Replace across files (25.4): what to find — the find's query, or a selection on one line, typed already — then
   * what with, then the rename's preview of every line it changes, in every note and every file the explorer shows;
   * enter does it, `space v shift+u` takes it back. The window's find toggles are its (alt+r, alt+w flip them here).
   * Refused where an unsaved file has a match: its text on disk isn't what's open.
   */
  replaceInEveryNote(): void {
    const view = this.app.view;
    const opts = () => ({ ...(view?.findOpts ?? { regex: false, whole: false }) });
    const said = (base: string) => () => this.acrossLabel(base, view);
    const selected = view?.sel && !view.sel.line ? this.app.views.selectionText(view) : "";
    const seed = selected && !selected.includes("\n") ? selected : (view?.find?.query ?? "");
    const find = said("replace in every note — find");
    this.app.overlays.prompt(find(), (query) => {
      if (!query) return;
      const re = compilePattern(query, opts());
      if (typeof re === "string") return this.app.message("warn", `not a regex: ${re}`);
      const withLabel = said(`replace ${JSON.stringify(query)} in every note with`);
      this.app.overlays.prompt(withLabel(), async (replacement) => {
        // The toggles as they are now: flipped here, the query may be no regex.
        const o = opts();
        const re = compilePattern(query, o);
        if (typeof re === "string") return this.app.message("warn", `not a regex: ${re}`);
        const graph = this.app.graph;
        const versions = [...this.app.buffers.values()].map((b) => [b, b.version] as const);
        const rels = [...this.app.graph.notes.keys(), ...this.app.explorer.shownFiles().map((f) => f.path)];
        const abs = new Set(rels.map((r) => this.app.graph.abs(r)));
        const dirty = [];
        try {
          for (const b of this.app.dirtyBuffers()) {
            if (abs.has(b.abs) && (await matchText(b.source, re, { regex: o.regex, empty: o.regex })).matches.length)
              dirty.push(b);
          }
        } catch (error) {
          return this.app.message("warn", `search failed: ${(error as Error).message}`);
        }
        if (dirty.length)
          return this.app.message(
            "warn",
            `unsaved: ${dirty.map((b) => this.app.displayName(b)).join(", ")} — save first: the replace rewrites ${dirty.length === 1 ? "it" : "them"}`,
          );
        try {
          const plan = await planReplaceLater(this.app.graph, query, replacement, rels, o);
          if (
            !this.app.quitting &&
            this.app.graph === graph &&
            this.app.overlay === null &&
            versions.every(([b, version]) => b.version === version)
          )
            this.app.renaming.preview(() => plan);
        } catch (error) {
          this.app.message("warn", `search failed: ${(error as Error).message}`);
        }
      });
      if (view) (this.app.overlay as PromptOverlay).toggles = { view, label: withLabel };
    });
    (this.app.overlay as PromptOverlay).text = seed;
    if (view) (this.app.overlay as PromptOverlay).toggles = { view, label: find };
  }
}

const findReady = new WeakMap<FindState, Promise<FindState>>();
export function computeFind(
  layout: Layout,
  query: string,
  current = 0,
  whole = false,
  regex = false,
  ignoreCase = false,
  owner: object = layout,
): FindState {
  const matches: FindState["matches"] = [];
  let error: string | undefined;
  if (query) {
    const re = compilePattern(query, { regex, whole, ignoreCase });
    if (typeof re === "string") error = re;
    else if (regex) {
      const lines = layout.lines.map((line) => (line.decor ? "" : line.spans.map((span) => span.text).join("")));
      const entry = layoutMatches(lines, re, owner);
      const finish = (): FindState => {
        if (!entry.value)
          return {
            query,
            matches: [],
            current: 0,
            whole,
            regex,
            error: entry.error ?? "search cancelled",
            failed: true,
          };
        const columns = new Map<number, number[]>();
        const offsets = new Map<number, number[]>();
        for (const match of entry.value.matches) {
          const row = offsets.get(match.row) ?? [];
          row.push(match.from);
          offsets.set(match.row, row);
        }
        for (const [row, starts] of offsets) columns.set(row, prefixWidths(lines[row]!, starts));
        const indices = new Map<number, number>();
        const matches = entry.value.matches.map((match) => {
          const index = indices.get(match.row) ?? 0;
          indices.set(match.row, index + 1);
          return {
            row: match.row,
            col: columns.get(match.row)![index]!,
            len: stringWidth(lines[match.row]!.slice(match.from, match.to)),
          };
        });
        return {
          query,
          matches,
          current: Math.min(current, Math.max(0, matches.length - 1)),
          whole,
          regex,
          limited: entry.value.limited,
        };
      };
      if (entry.value || entry.error || entry.abort.signal.aborted) return finish();
      const pending: FindState = { query, matches: [], current: 0, whole, regex, pending: true };
      findReady.set(pending, entry.pending.then(finish));
      return pending;
    } else {
      // Plain text, worked out at once: every match, as many as there are (n reaches the last).
      layout.lines.forEach((line, row) => {
        if (line.decor) return; // the lens's rules aren't the note's text
        const text = line.spans.map((span) => span.text).join("");
        for (const match of findAll(text, re))
          matches.push({
            row,
            col: stringWidth(text.slice(0, match.from)),
            len: stringWidth(text.slice(match.from, match.to)),
          });
      });
    }
  }
  return {
    query,
    matches,
    current: Math.min(current, Math.max(0, matches.length - 1)),
    whole,
    regex,
    error,
  };
}
export async function computeFindReady(...args: Parameters<typeof computeFind>): Promise<FindState> {
  const state = computeFind(...args);
  return (await findReady.get(state)) ?? state;
}
