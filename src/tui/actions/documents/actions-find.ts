// The commands that find (`find.*`, `search.*`, `switcher.*`, `type.*`, `tag.*`): find in a note and its matches
// stepped through, search across the vault, the switcher with its symbols, notes by type and by tag.

import { cancelRegex, matchText, retryRegex } from "../../../core/workspace/search/regex-jobs.ts";
import { type Run, withView, lay } from "../actions.ts";
import * as V from "../../shell/input/vim.ts";
import { computeFind, computeFindReady } from "../../documents/search/find.ts";
import { compilePattern } from "../../../core/documents/editing/replace.ts";
import type { FindState, ListItem, PromptOverlay, App, View } from "../../app/runtime/app.ts";
import { readText, climbsOut } from "../../../core/foundation/platform/fsutil.ts";
import { sanitize } from "../../../core/foundation/text/sanitize.ts";
import * as E from "../../documents/editing/editing.ts";
import * as R from "../../documents/search/replacing.ts";
import * as C from "../../documents/editing/cursor.ts";
import { refilter } from "../../shell/overlays/overlays.ts";
import type { SymbolInformation, WorkspaceSymbol } from "vscode-languageserver-protocol";
import { fileURLToPath } from "node:url";
import { relative } from "node:path";
import { KIND_NAMES } from "../../documents/diagnostics/languages.ts";
import { rank } from "../../shell/overlays/match.ts";

/** Finding: find in a note and replace, search, the switcher, notes by type and by tag. */
const vaultFindOwners = new WeakMap<App, AbortController>();

export function findActions(): Record<string, Run> {
  return {
    // Spelling (25.6): vim's keys, on the words its marks show.
    "type.list": (a, arg) => (arg ? a.search.openTypeNotes(arg) : a.search.openTypeList()),
    "type.next": (a) => a.search.typeStep(1),
    "type.prev": (a) => a.search.typeStep(-1),
    // find
    "find.open": (a) =>
      withView(a, (v) => {
        const prev = v.find;
        const start = { ...v.cur };
        a.overlays.prompt(
          "/",
          async (text) => {
            // An empty search clears the find rather than leaving "/ 0/0" behind.
            if (!text) {
              v.find = null;
              return V.finishSearchOp(a, v, false);
            }
            retryRegex(v); // asked for again: one that failed is tried afresh
            const ready = await settledFind(a, v, text, v.find?.current ?? 0);
            if (!ready) return;
            v.find = ready;
            if (v.find.error) a.message("warn", `${v.find.failed ? "search failed" : "not a regex"}: ${v.find.error}`);
            else if (!v.find.matches.length) a.message("info", `not found: ${text}`);
            if (v.find.error || !v.find.matches.length) a.moveCursor(v, start);
            // After an operator (d/foo): it covers the text up to the match.
            V.finishSearchOp(a, v, v.find.matches.length > 0);
          },
          async (text) => {
            const ready = await settledFind(a, v, text, 0);
            const overlay = a.overlay;
            if (!ready || overlay?.kind !== "prompt" || overlay.text !== text) return;
            v.find = ready;
            const first = v.find.matches.findIndex(
              (m) => m.row > start.row || (m.row === start.row && m.col >= start.col),
            );
            const i = first >= 0 ? first : 0;
            const m = v.find.matches[i];
            if (m) {
              v.find.current = i;
              toMatch(a, v, m);
            } else a.moveCursor(v, start); // nothing matches (yet): back where the search began, as vim
          },
          () => {
            cancelRegex(v);
            v.find = prev;
            a.moveCursor(v, start);
            V.finishSearchOp(a, v, false);
          },
          v, // typed in this window's find row
        );
      }),
    // Search the vault (ctrl+shift+f, space f g): every note and every file the explorer shows, an
    // open one as it is now (unsaved changes and all); enter opens it at the match.
    "search.open": (a, arg) => a.search.open(arg ?? ""),
    "find.vault": (a, arg) => {
      const run = async (query: string) => {
        if (!query.trim()) return;
        vaultFindOwners.get(a)?.abort();
        const abort = new AbortController();
        vaultFindOwners.set(a, abort);
        const graph = a.graph;
        const overlay = a.overlay;
        const versions = [...a.buffers.values()].map((b) => [b, b.version] as const);
        const o = a.view?.findOpts ?? { regex: false, whole: false };
        const re = compilePattern(query, o);
        if (typeof re === "string") return a.message("warn", `not a regex: ${re}`);
        const paths = [...a.graph.notes.keys(), ...a.explorer.shownFiles().map((f) => f.path)].sort();
        const items: ListItem[] = [];
        let total = 0;
        let limited = false;
        for (const rel of paths) {
          let text: string;
          try {
            text = a.buffers.get(rel)?.source ?? readText(a.graph.abs(rel)).text;
          } catch {
            continue;
          }
          let lastLine = -1;
          // Lines counted on from the last match, never from the top again.
          let line = 1;
          let counted = 0;
          let result: Awaited<ReturnType<typeof matchText>>;
          try {
            result = await matchText(text, re, { regex: o.regex, show: true, signal: abort.signal });
          } catch (error) {
            return a.message("warn", `search failed: ${(error as Error).message}`);
          }
          if (
            a.quitting ||
            abort.signal.aborted ||
            a.graph !== graph ||
            a.overlay !== overlay ||
            versions.some(([b, version]) => b.version !== version)
          )
            return;
          limited ||= result.limited;
          for (const m of result.matches) {
            total++;
            for (let i = text.indexOf("\n", counted); i >= 0 && i < m.from; i = text.indexOf("\n", i + 1)) line++;
            counted = m.from;
            if (line === lastLine || items.length >= VAULT_SEARCH_MAX) continue; // a line once, however many matches
            lastLine = line;
            const start = text.lastIndexOf("\n", m.from - 1) + 1;
            const end = text.indexOf("\n", m.from);
            const row = sanitize(text.slice(start, end < 0 ? text.length : end).replace(/\t/g, " ")).trim();
            items.push({
              label: `${rel}:${line}`,
              detail: row.length > 160 ? `${row.slice(0, 160)}…` : row,
              data: { rel, line },
            });
          }
        }
        if (!items.length) return a.message("info", `not found here: ${query}`);
        a.overlays.openList({
          title: `"${query}" — ${total}${limited ? "+" : ""} match${total === 1 ? "" : "es"} in ${new Set(items.map((i) => (i.data as { rel: string }).rel)).size} files${items.length >= VAULT_SEARCH_MAX ? ` (the first ${VAULT_SEARCH_MAX} lines)` : ""}`,
          items,
          accept: (item) => {
            const { rel, line } = item.data as { rel: string; line: number };
            a.open(rel, { heading: null, headingIndex: 0, offset: 0, line });
            const v = a.view;
            if (v?.buf.rel === rel) E.placeAt(a, v, v.buf.lineStarts()[line - 1] ?? 0);
          },
        });
      };
      if (arg) return run(arg);
      const label = () => a.search.acrossLabel("find in every note");
      a.overlays.prompt(label(), run);
      if (a.view) (a.overlay as PromptOverlay).toggles = { view: a.view, label };
    },
    // Replace across files (25.4): asked, then previewed and carried out as a rename is.
    "find.replace_vault": (a) => a.search.replaceInEveryNote(),
    // Find and replace: the find row with a replace row under it, on the markdown (replacing.ts).
    // A selection on one line is the query; across lines, it's where to replace.
    "find.replace": (a) =>
      withView(a, async (v) => {
        let seed = v.find?.query ?? "";
        let range: [number, number] | undefined;
        if (v.sel) {
          const [p, q] =
            v.sel.anchor.row < v.cur.row || (v.sel.anchor.row === v.cur.row && v.sel.anchor.col <= v.cur.col)
              ? [v.sel.anchor, v.cur]
              : [v.cur, v.sel.anchor];
          const text = a.views.selectionText(v);
          if (text && !text.includes("\n") && !v.sel.line) seed = text;
          else {
            const starts = v.buf.lineStarts();
            const lineOf = (at: number) => starts.findLastIndex((s) => s <= at);
            const from = starts[lineOf(E.offsetAtPos(a, v, p))]!;
            const next = starts[lineOf(E.offsetAtPos(a, v, q)) + 1];
            range = [from, next ?? v.buf.source.length];
          }
          v.sel = null;
        }
        await a.run("find.open");
        const o = a.overlay;
        if (o?.kind !== "prompt" || o.view !== v) return;
        await R.openReplace(a, o, v, range);
        if (seed) {
          o.text = seed;
          await o.change?.(seed);
          await R.refresh(a, o, v);
        } else o.replace!.focus = false; // nothing to find yet: type it first
      }),
    // n always forward, N always backward (not vim's "the way the search went").
    "find.next": (a) => findStep(a, 1),
    "find.prev": (a) => findStep(a, -1),
    "find.substitute": (a, arg) =>
      withView(a, (v) => {
        if (!arg) return a.message("info", "type it on the command line: :s/old/new/ or :%s/old/new/g");
        return R.substitute(a, v, arg);
      }),
    "find.word_next": (a) => findWord(a, 1),
    "find.word_prev": (a) => findWord(a, -1),
    "find.clear": (a) =>
      withView(a, (v) => {
        v.find = null;
      }),
    "switcher.open": (a) => {
      // Recent first — the previous one at the top, so ctrl+p enter goes back — then the rest.
      const current = a.view?.buf.key;
      const rank = new Map(a.history.recentNotes.filter((k) => k !== current).map((k, i) => [k, i]));
      const notes = [...a.graph.notes.values()];
      // The files the explorer shows (files.show, its toggle, the patterns) come too (16.5).
      const files = a.explorer.shownFiles();
      const items: ListItem[] = [
        ...notes.map((n) => ({
          label: n.rel,
          detail:
            n.title !==
            n.rel
              .replace(/\.(md|markdown)$/i, "")
              .split("/")
              .pop()
              ? n.title
              : undefined,
          data: n.rel,
        })),
        ...files.map((f) => ({ label: f.path, hint: f.group === "data" ? "data" : "file", data: f.path })),
      ];
      // Notes and files together: a recent file comes before notes not opened lately.
      const ordered = items
        .map((x, i) => ({ x, i, r: rank.get(x.data as string) ?? Number.POSITIVE_INFINITY }))
        .sort((p, q) => p.r - q.r || p.i - q.i)
        .map((e) => e.x);
      a.overlays.openList({
        title: files.length ? `Open (${notes.length} notes, ${files.length} files)` : `Open note (${notes.length})`,
        items: ordered,
        source: (input) => (input.startsWith("#") ? symbols.list(input.slice(1)) : null),
        accept: (item) => {
          const at = item.data as string | Spot;
          if (typeof at === "string") a.open(at);
          else if (at.rel !== null) a.openAt(at.rel, at.line);
          else a.languages.openLocation(at.abs, at.line - 1, at.character);
        },
      });
      const symbols = workspaceSymbols(a, a.overlay);
    },
    "tag.list": (a, arg) => (arg ? a.search.openTagNotes(arg) : a.search.openTagList()),
  };
}

/**
 * A find typed in a window, once it's worked out (a regex's in the worker): for the window as it's laid out then. Laid
 * out anew meanwhile (a resize, a picture arriving), its rows are another layout's, so it's worked out again. Null when
 * it no longer counts: the query or the note changed.
 */
async function settledFind(a: App, v: View, text: string, current: number): Promise<FindState | null> {
  const o = v.findOpts ?? { regex: false, whole: false };
  const version = v.buf.version;
  for (;;) {
    const layout = lay(a, v);
    v.find = computeFind(layout, text, current, o.whole, o.regex, false, v);
    const ready = await computeFindReady(layout, text, v.find.current, o.whole, o.regex, false, v);
    if (a.quitting || v.buf.version !== version || v.find?.query !== text) return null;
    if (lay(a, v) === layout) return ready;
  }
}

/** The cursor to a find's match; in a code block that scrolls sideways, the match in sight whole where it fits. */
function toMatch(a: App, v: View, m: { row: number; col: number; len: number }): void {
  a.moveCursor(v, { row: m.row, col: m.col });
  a.code.reveal(v, lay(a, v), m.row, m.col, m.col + m.len);
}

/**
 * `n` / `shift+n`, as in vim: the next match after the cursor (or before it), wrapping around the
 * note, wherever the cursor has moved since the last one.
 */
function findStep(a: App, dir: 1 | -1, from?: { row: number; col: number }): void {
  const v = a.view;
  if (v?.find?.pending) return a.message("info", "searching…");
  if (v?.find?.failed) return a.message("warn", `search failed: ${v.find.error}`);
  if (!v?.find?.matches.length) return a.message("info", "no search — ctrl+f or / starts one");
  const ms = v.find.matches;
  const n = ms.length;
  const at = from ?? v.cur;
  const cmp = (m: { row: number; col: number }) => (m.row - at.row) * 1e9 + (m.col - at.col);
  let i = dir === 1 ? ms.findIndex((m) => cmp(m) > 0) : ms.findLastIndex((m) => cmp(m) < 0);
  const wrapped = i < 0;
  if (wrapped) i = dir === 1 ? 0 : n - 1;
  v.find.current = i;
  const m = ms[i]!;
  toMatch(a, v, m);
  a.message(
    "info",
    `${i + 1}/${n}  ${v.find.query}${wrapped ? (dir === 1 ? "  (from the top)" : "  (from the bottom)") : ""}`,
  );
}

/**
 * `*` / `#`, as in vim: search for the whole word under the cursor (or, off a word, the next one on
 * its row), forward or backward from it.
 */
function findWord(a: App, dir: 1 | -1): void {
  const v = a.view;
  if (!v) return;
  const layout = lay(a, v);
  const cs = C.cells(layout.lines[v.cur.row]);
  const isWord = (g: string) => /^[\p{L}\p{N}_]/u.test(g);
  let k = cs.findIndex((c) => c.x + c.w > v.cur.col);
  if (k >= 0) while (k < cs.length && !isWord(cs[k]!.g)) k++;
  if (k < 0 || k >= cs.length) return a.message("info", "no word under the cursor");
  let s = k;
  while (s > 0 && isWord(cs[s - 1]!.g)) s--;
  let e = k;
  while (e < cs.length - 1 && isWord(cs[e + 1]!.g)) e++;
  const word = cs
    .slice(s, e + 1)
    .map((c) => c.g)
    .join("");
  v.find = computeFind(layout, word, 0, true);
  // From the word's start: forward skips this one, backward finds the one before it.
  findStep(a, dir, { row: v.cur.row, col: cs[s]!.x });
}

/** Vault search lists this many matching lines at most (the count says how many there were). */
const VAULT_SEARCH_MAX = 1000;

/**
 * The switcher's `#` (VS Code's): the workspace's symbols — the current file's servers', asked as the
 * query's typed (each answer refilling the list it was asked from, the last asked's only), or, where
 * no server gives them (a note), the root's headings: slipbox's own symbols.
 */
function workspaceSymbols(a: App, overlay: App["overlay"]): { list: (query: string) => ListItem[] } {
  const from = a.view?.buf.abs ?? null;
  const servers = a.languages.servers;
  let viaServer = false;
  let answered: ListItem[] = [];
  let asked: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const refresh = () => {
    const o = a.overlay;
    if (o !== overlay || o?.kind !== "list" || !o.input.startsWith("#")) return;
    refilter(o);
    a.host.requestRender();
  };
  if (servers && from && servers.isOpen(from)) {
    void servers.offers(from, "workspace-symbols", "workspaceSymbolProvider").then((yes) => {
      viaServer = yes;
      if (yes) refresh();
    });
  }
  const ask = (query: string) => {
    if (asked === query) return;
    asked = query;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (a.view) a.languages.sync(a.view.buf);
      const got = await servers!.requestAll<(SymbolInformation | WorkspaceSymbol)[]>(
        from!,
        "workspace/symbol",
        { query },
        "workspaceSymbolProvider",
        "workspace-symbols",
      );
      if (asked !== query) return;
      answered = got
        .flatMap((g) => g.result ?? [])
        .map((sym): ListItem => {
          const abs = fileURLToPath(sym.location.uri);
          const range = "range" in sym.location ? sym.location.range : null;
          const line = (range?.start.line ?? 0) + 1;
          const rel = relative(a.loc.root, abs);
          const where = climbsOut(rel) ? abs : rel;
          const data: Spot = { rel: null, abs, line, character: range?.start.character ?? 0 };
          return {
            label: sym.name,
            hint: KIND_NAMES[sym.kind] ?? "",
            detail: `${sym.containerName ? `${sym.containerName} · ` : ""}${where}:${line}`,
            data,
          };
        });
      refresh();
    }, 120);
    (timer as { unref?: () => void }).unref?.();
  };
  let headings: ListItem[] | null = null;
  return {
    list: (query) => {
      if (viaServer) {
        ask(query);
        return answered;
      }
      headings ??= [...a.graph.notes.values()].flatMap((n) =>
        n.headings.map(
          (h): ListItem => ({
            label: h.text,
            hint: "#".repeat(h.depth),
            detail: `${n.rel}:${h.line}`,
            data: { rel: n.rel, line: h.line } as Spot,
          }),
        ),
      );
      return query.trim()
        ? rank(query, headings, (i) => [i.label, i.detail ?? ""])
            .slice(0, 500)
            .map((r) => r.item)
        : headings.slice(0, 500);
    },
  };
}

/** Where a symbol is: a vault note's line (its heading), else a file's line and character. */
type Spot = { rel: string; line: number } | { rel: null; abs: string; line: number; character: number };
