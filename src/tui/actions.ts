// Command implementations for the TUI. Ids and titles come from core/command-specs.ts, so the CLI
// can list them and the parity test can check them; this is where each one does its work. The
// keys are in keys.ts and docs/design/keymap.md.

import { readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CodeAction, Command as LspCommand, Hover, Location, LocationLink, MarkedString, MarkupContent, Range, SymbolInformation, TextEdit, WorkspaceEdit, WorkspaceSymbol } from "vscode-languageserver-protocol";
import { anchorsOf } from "../core/parse.ts";
import { blockLine, findHeading, landingText, lineFragment } from "../core/landing.ts";
import { isAbsolute, join, posix, relative } from "node:path";
import { backgroundStatus, describeBackground } from "../core/autoindex.ts";
import { rootLabel, tildePath } from "../core/names.ts";
import { isPointer, parsePointer, resolvePointer } from "../core/pointer.ts";
import { noteProblems, type Problem } from "../core/diagnostics.ts";
import { copyAvailable, folderIdentity, readFolders, recordFolder } from "../core/folders.ts";
import { slugName } from "../core/registry.ts";
import { isNotePath } from "../core/links.ts";
import { hasMarker, initVault, isInside, isNeverRoot, rootAt } from "../core/vault.ts";
import { planHeadingRename, planNoteRename, planRelink, planVaultRename } from "../core/rename.ts";
import { copyPath } from "../core/files.ts";
import { classify } from "../core/filetypes.ts";
import { clearScratch, formatEntry, readScratch } from "../core/capture.ts";
import { COMMAND_GROUPS, COMMAND_SPECS, commandGroup } from "../core/command-specs.ts";
import { canonKey, type Command } from "../core/commands.ts";
import type { LayoutLink } from "../core/layout/ir.ts";
import { slugify } from "../core/parse.ts";
import { compilePattern, findAll, parseSubstitute } from "../core/replace.ts";
import { readText } from "../core/fsutil.ts";
import { sanitize } from "../core/sanitize.ts";
import { graphemes } from "../core/width.ts";
import type { Anchor } from "../core/position.ts";
import { cacheDir, stateDir } from "../core/paths.ts";
import { listThemes, loadTheme } from "../core/theme/index.ts";
import type { App, ListItem, Loc, PromptOverlay, UiState, View } from "./app.ts";
import { editable, computeFind, KIND_NAMES, refilter } from "./app.ts";
import * as C from "./cursor.ts";
import { linkTokens } from "../core/syntax.ts";
import type { Feature } from "../core/servers/languages.ts";
import { readerFor } from "../core/readers.ts";
import * as E from "./editing.ts";
import * as R from "./replacing.ts";
import * as V from "./vim.ts";
import { rank } from "./match.ts";
import { EXPLORER_ACTION_INFO, FILTER_KEYS_HELP, HISTORY_ACTION_INFO, OUTLINE_ACTION_INFO, prettyKey, RESIZE_ACTIONS, spellKey } from "./keys.ts";

type Run = Command<App>["run"];

function withView<T>(a: App, fn: (v: View) => T): T | void {
  const v = a.view;
  if (!v) return a.message("info", "no note open");
  return fn(v); // an async command's promise goes back to the dispatcher, which awaits it
}

/** Where a symbol is: a vault note's line (its heading), else a file's line and character. */
type Spot = { rel: string; line: number } | { rel: null; abs: string; line: number; character: number };

/**
 * The switcher's `#` (VS Code's): the workspace's symbols — the current file's servers', asked as the
 * query's typed (each answer refilling the list it was asked from, the last asked's only), or, where
 * no server gives them (a note), the root's headings: slipbox's own symbols.
 */
function workspaceSymbols(a: App, overlay: App["overlay"]): { list: (query: string) => ListItem[] } {
  const from = a.view?.buf.abs ?? null;
  const servers = a.servers;
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
      if (a.view) a.syncServers(a.view.buf);
      const got = await servers!.requestAll<(SymbolInformation | WorkspaceSymbol)[]>(from!, "workspace/symbol", { query }, "workspaceSymbolProvider", "workspace-symbols");
      if (asked !== query) return;
      answered = got.flatMap((g) => g.result ?? []).map((sym): ListItem => {
        const abs = fileURLToPath(sym.location.uri);
        const range = "range" in sym.location ? sym.location.range : null;
        const line = (range?.start.line ?? 0) + 1;
        const rel = relative(a.loc.root, abs);
        const where = rel.startsWith("..") ? abs : rel;
        const data: Spot = { rel: null, abs, line, character: range?.start.character ?? 0 };
        return { label: sym.name, hint: KIND_NAMES[sym.kind] ?? "", detail: `${sym.containerName ? `${sym.containerName} · ` : ""}${where}:${line}`, data };
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
      headings ??= [...a.graph.notes.values()].flatMap((n) => n.headings.map((h): ListItem => ({ label: h.text, hint: "#".repeat(h.depth), detail: `${n.rel}:${h.line}`, data: { rel: n.rel, line: h.line } as Spot })));
      return query.trim() ? rank(query, headings, (i) => [i.label, i.detail ?? ""]).slice(0, 500).map((r) => r.item) : headings.slice(0, 500);
    },
  };
}

/** A cursor command: compute the target from the layout, then move (extending when asked). */
function motion(target: (a: App, v: View) => C.Pos, opts: { keepGoal?: boolean } = {}): Run {
  return (a, arg) =>
    withView(a, (v) => {
      a.moveCursor(v, target(a, v), { extend: arg === "extend", keepGoal: opts.keepGoal });
    });
}

/** u / ctrl+r: the cursor goes back to where the change was. */
function undoRedo(a: App, v: View, which: "undo" | "redo"): void {
  if (v.insert) E.stopInsert(a, v);
  a.vim.undoing = true; // not a change for `.` to repeat
  const at = which === "undo" ? v.buf.undo() : v.buf.redo();
  if (at === null) return a.message("info", which === "undo" ? "nothing to undo" : "nothing to redo");
  for (const w of a.allViews()) if (w.buf === v.buf) w.layoutKey = "";
  if (editable(v)) E.placeAt(a, v, at);
  a.message("info", v.buf.dirty ? which === "undo" ? "undone" : "redone" : `${which === "undo" ? "undone" : "redone"} — as saved`);
}

const noRange: V.Range = { from: 0, to: 0, linewise: false };

/** An editing command: in a source window (switching a rendered one first), on an editable note. */
function sourceEdit(a: App, run: (v: View) => void | Promise<void>, edits = true): Promise<void> | void {
  return withView(a, (v) => {
    const why = E.cannotEdit(v);
    if (edits && why) return a.message("warn", `${why} — not editing`);
    if (!editable(v)) {
      const mode = a.editMode();
      a.setViewMode(v, mode);
      a.message("info", mode === "live" ? "the lens: editing the markdown around the cursor — esc esc closes it" : "source — editing the markdown");
    }
    return run(v);
  });
}

/** `n` characters from the cursor, on its line; null on an empty line or at its end. */
function charsRange(a: App, v: View, n: number): V.Range | null {
  const at = E.offsetOf(a, v);
  const end = E.lineEnd(v, at);
  if (at >= end) return null;
  let to = at;
  for (let k = 0; k < n && to < end; k++) to = E.nextBoundary(v.buf.source, to);
  return { from: at, to: Math.min(to, end), linewise: false };
}

/** A count typed before gg or G, in an editable window: the start of that source line. */
function countedLine(a: App, v: View): C.Pos | null {
  if (!editable(v) || !a.vim.count) return null;
  const n = V.takeCount(a);
  const starts = v.buf.lineStarts();
  E.placeAt(a, v, starts[Math.min(n, starts.length) - 1] ?? 0);
  return { ...v.cur };
}

/**
 * G where the text is editable: the last source line's first non-blank, as vim has it. (The last
 * rendered row belongs to its block's first line: in the lens, `Gdd` would take the wrong line.)
 */
function lastLine(a: App, v: View): C.Pos {
  const starts = v.buf.lineStarts();
  const n = Math.max(1, starts.length - (v.buf.source.endsWith("\n") ? 1 : 0));
  E.placeAt(a, v, (starts[n - 1] ?? 0) + /^\s*/.exec(E.lineText(v, n))![0].length);
  return { ...v.cur };
}

/** D / C: to the end of the line (with a count, of the line count-1 below). */
function toLineEnd(a: App, v: View, n: number): V.Range | null {
  const at = E.offsetOf(a, v);
  // The note's lines, not the empty one after its final newline; from the last, a count has
  // nowhere to go (vim's $ fails there, so 5D does nothing).
  const real = Math.max(1, v.buf.lineStarts().length - (v.buf.source.endsWith("\n") ? 1 : 0));
  const here = E.lineOf(v, at);
  if (n > 1 && here >= real) return null;
  const last = Math.min(here + n - 1, real);
  const end = (v.buf.lineStarts()[last - 1] ?? 0) + E.lineText(v, last).length;
  return { from: at, to: Math.max(at, end), linewise: false };
}

/** J: `n` lines into one, each break and the next line's indentation becoming a space. */
function joinLines(a: App, v: View, n: number): void {
  const buf = v.buf;
  const first = E.lineOf(v, E.offsetOf(a, v));
  const lines = buf.lineStarts().length - (buf.source.endsWith("\n") ? 1 : 0);
  if (first >= lines) return;
  buf.beginStep(E.offsetOf(a, v));
  let at = 0;
  for (let k = 1; k < n && first < lines - (k - 1); k++) {
    const end = (buf.lineStarts()[first - 1] ?? 0) + E.lineText(v, first).length;
    const next = buf.lineStarts()[first];
    if (next === undefined) break;
    const lead = /^\s*/.exec(E.lineText(v, first + 1))![0].length;
    // No space after one already, into an empty line, before an empty one, or before a closing ) (vim).
    const here = E.lineText(v, first);
    const after = E.lineText(v, first + 1).trimStart();
    const sep = here.endsWith(" ") || !here.trim() || !after || after.startsWith(")") ? "" : " ";
    buf.edit(end, next + lead - end, sep);
    at = end;
  }
  buf.endStep(at);
  E.placeAt(a, v, at);
}

/** d / c / > / < on a visual selection (char or line), in source mode. */
function visualOp(a: App, op: "d" | "c" | ">" | "<"): void {
  withView(a, (v) => {
    if (!editable(v)) return a.message("info", "editing is in source mode (space n v) or live preview (space n l)");
    const why = E.cannotEdit(v);
    if (why) return a.message("warn", `${why} — not editing`);
    const [s, e] = C.ordered(v.sel?.anchor ?? v.cur, v.cur);
    const line = v.visual === "line";
    Object.assign(v, { visual: null, sel: null });
    const from = E.offsetAtPos(a, v, s);
    const to = E.offsetAtPos(a, v, e);
    const r = line ? V.linesRange(v, E.lineOf(v, from), E.lineOf(v, to)) : { from, to: Math.min(E.nextBoundary(v.buf.source, to), Math.max(to, E.lineEnd(v, to))), linewise: false };
    // For `.`: the same change on as much text, said in keys.
    const lines = E.lineOf(v, to) - E.lineOf(v, from) + 1;
    const chars = graphemes(v.buf.source.slice(r.from, r.to)).length; // as l moves: by character
    const keys = line ? ["shift+v", ...Array(lines - 1).fill("j"), op] : lines === 1 ? ["v", ...Array(Math.max(0, chars - 1)).fill("l"), op] : null;
    const before = v.buf.version;
    const times = op === ">" || op === "<" ? V.takeCount(a) : 1;
    V.apply(a, v, op, { ...r, times });
    V.recordVisual(a, times > 1 ? null : keys, op === "c", before);
  });
}

function lay(a: App, v: View) {
  return a.currentLayout(v);
}

// ---------------------------------------------------------------------------------------------
// Links

/**
 * The link under the cursor on a source row (source mode, the lens), read from the markdown: a
 * `[[wikilink]]`, an `![[embed]]` or a `[text](url)` around the cursor. Rendered rows carry their
 * links; source rows are the text itself.
 */
function sourceLinkAt(a: App, v: View): LayoutLink | null {
  const row = lay(a, v).lines[v.cur.row];
  if (!row?.srcMap) return null;
  const at = E.offsetOf(a, v);
  const line = E.lineOf(v, at);
  const text = E.lineText(v, line);
  const col = at - (v.buf.lineStarts()[line - 1] ?? 0);
  const base = { status: "unknown" as const, line: -1, col: -1, src: line };
  // A text file's: a URL, or a path naming a file of the vault, `path:42` at its line (16.10) — in
  // a comment or not (an import's path is worth following too).
  if (v.buf.kind.group === "text") {
    const t = linkTokens(text).find((k) => col >= k.index && col < k.index + k.length);
    if (!t) return null;
    if (t.url) return { ...base, kind: "markdown", target: t.target, heading: null, text: t.target };
    const path = v.buf.rel ? a.graph.commentPath(t.target, v.buf.rel) : null;
    return path ? { ...base, kind: "markdown", target: `/${path}${t.at ? `#L${t.at}` : ""}`, heading: null, text: t.target } : null;
  }
  // A note's: its format's link syntax (16.2).
  if (v.buf.kind.group !== "note") return null;
  const l = readerFor(v.buf.kind.format).linkAt(text, col);
  return l ? { ...base, ...l } : null;
}

function followLink(a: App, link: LayoutLink, inSplit: boolean): void {
  const view = a.view;
  if (!view) return;
  // A link drawn inside an embed (1.11) is the embedded note's: followed from there.
  const from = link.from ?? view.buf.rel;
  const go = (path: string, heading: string | null) => {
    const anchor = heading ? (lineAnchor(heading) ?? headingAnchor(a, path, heading, link.kind === "wiki" || link.kind === "embed")) : undefined;
    if (inSplit) a.otherWindow();
    a.open(path, anchor);
  };
  switch (link.kind) {
    case "tag":
      // A tag (1.6): the notes that carry it.
      return a.openTagNotes(link.target);
    case "footnote": {
      const layout = lay(a, view);
      // The definition's first row, by identifier (whatever the label's case, in a quote or a list).
      const row = layout.lines.findIndex((l) => l.footnoteDef !== undefined && l.footnoteDef.toLowerCase() === link.target.toLowerCase());
      if (row < 0) return a.message("warn", `footnote [^${link.target}] has no definition`);
      a.pushHistory(view);
      a.moveCursor(view, { row, col: 0 });
      return;
    }
    case "wiki":
    case "embed": {
      if (!link.target) {
        // `[[#Heading]]` inside an embed: the embedded note's heading, in it.
        if (link.heading && link.from && link.from !== view.buf.rel) return go(link.from, link.heading);
        if (link.heading) jumpToHeading(a, view, link.heading, true);
        return;
      }
      if (!from) return a.message("warn", `[[${link.target}]]: a wikilink is read within a root — this file has none`);
      const r = a.graph.resolveLink({ kind: link.kind, target: link.target }, from);
      if (r.via) a.message("info", `[[${link.target}]] reached ${r.path} by ${r.via === "alias" ? "an alias" : r.via === "previous-name" ? "a previous name" : "a redirect"}`);
      // `#^id`: the block it marks, by its line (21.3), as a path link's lands.
      const landing = (path: string) => {
        if (!link.heading?.startsWith("^")) return link.heading;
        const at = blockLine(a.graph, path, link.heading.slice(1));
        return at === null ? null : `L${at}`;
      };
      if (r.resolvedKind === "note") return go(r.path!, landing(r.path!));
      if (r.resolvedKind === "file") return fileLink(a, r.path!, link.heading, inSplit);
      if (r.resolvedKind === "ambiguous") {
        // Two notes of a name, or two attachments (`![[dal.png]]`, 21.3): one picked, opened as its link would.
        const notes = r.candidates.every(isNotePath);
        return a.openList({
          title: `[[${link.target}]] matches ${r.candidates.length} ${notes ? "notes" : "files"}`,
          items: r.candidates.map((c) => ({ label: c, data: c })),
          accept: (item) => (isNotePath(item.data as string) ? go(item.data as string, link.heading) : fileLink(a, item.data as string, link.heading, inSplit)),
        });
      }
      // In another vault, or a vault this machine doesn't know: say which (17.8).
      if (r.reason) return a.message("warn", `[[${link.target}]]: ${r.reason}`);
      // No note by that name yet: make it (beside the note linking to it), the name typed already.
      return a.promptNewNote(posix.dirname(from) === "." ? "" : posix.dirname(from), link.target);
    }
    case "markdown":
    case "image": {
      // A URL — a pointer too (21.7), which names its folder: followed from a file of no root as well.
      const external = /^[a-z][a-z0-9+.-]*:/i.test(link.target);
      if (!from && !external) return a.message("warn", `${link.target}: this file is outside the root — open its folder to follow its links`);
      const r = a.graph.resolveLink({ kind: link.kind === "image" ? "image" : "markdown", target: link.target }, from ?? "");
      if (r.resolvedKind === "external") {
        a.copy(link.target, false);
        return a.message("info", `copied: ${link.target}`);
      }
      // The fragment, decoded when it can be (`%zz` can't); a block's `^id` lands on its block, as
      // the line it marks (a converted `[[note#^id]]`, 20.1), or at the top when it isn't there.
      const raw = link.target.includes("#") ? link.target.slice(link.target.indexOf("#") + 1) : "";
      let frag: string | null = null;
      if (raw) {
        try {
          frag = decodeURIComponent(raw);
        } catch {
          frag = raw;
        }
      }
      const at = (path: string) => {
        if (!frag?.startsWith("^")) return frag;
        const line = blockLine(a.graph, path, frag.slice(1));
        return line === null ? null : `L${line}`;
      };
      // A pointer (21.7): its folder by a name it had, or another copy than the one links open — said so;
      // a branch not checked out here, the file read from git; a name of different folders, picked.
      if (r.via === "old-name") a.message("info", `${link.target} reached ${r.vault} by a name it had`);
      if (r.via === "another-copy") a.message("info", `${link.target}: the copy of ${r.vault} links open isn't here — another copy`);
      if (r.gitRef) return a.showFromGit(r.gitRef, link.target);
      if (r.resolvedKind === "ambiguous" && isPointer(link.target)) return pickPointerFolder(a, link.target, frag, inSplit);
      // Not on this machine, gone, no such file there: why — never a new note by a pointer's name. A
      // folder named the old way (`research:x.md`, 21.11): why, and its pointer.
      if (r.resolvedKind === "unresolved" && (isPointer(link.target) || r.suggest)) return a.message("warn", r.suggest ? r.reason! : `${link.target}: ${r.reason ?? "not found"}`);
      if (r.resolvedKind === "anchor") {
        const here = link.from ?? view.buf.rel;
        if (frag && here && (here !== view.buf.rel || frag.startsWith("^"))) return go(here, at(here));
        if (frag) jumpToHeading(a, view, frag);
        return;
      }
      if (r.resolvedKind === "note") return go(r.path!, at(r.path!));
      if (r.resolvedKind === "file") return fileLink(a, r.path!, frag, inSplit);
      if (r.resolvedKind === "folder") return a.revealFolder(r.path!);
      // Its file seen to move (17.12): where, and the fix (20.2: a move never resolves a link).
      const as = { kind: link.kind === "image" ? ("image" as const) : ("markdown" as const), target: link.target };
      const to = from ? a.graph.movedTarget(as, from) : null;
      // A note not written yet: made where the link names it, its name typed already (a wikilink's
      // was offered so; a path names its place, so no other note's name stands in the way).
      const yet = from && !to ? a.graph.missingNote(as, from) : null;
      if (yet) {
        const dir = posix.dirname(yet);
        const name = posix.basename(yet).replace(/\.(md|markdown)$/i, "");
        return a.promptNewNote(dir === "." ? "" : dir, name, name);
      }
      return a.message("warn", to ? `broken link: ${link.target} — moved to ${to}: space l r relinks it` : `broken link: ${link.target}`);
    }
  }
}

/**
 * A pointer whose name different folders have (21.7): each, to open what it names there; and, for a
 * `.slipbox/` folder, renaming its name — the parent folder's name prefixed as a suggestion, the
 * edit to its config previewed first. Not now (esc) leaves it ambiguous, picked when followed again.
 */
function pickPointerFolder(a: App, target: string, frag: string | null, inSplit: boolean): void {
  const p = parsePointer(target);
  const t = p ? resolvePointer(p) : null;
  if (!p || t?.status !== "ambiguous") return;
  const items: ListItem[] = [];
  for (const f of t.folders) {
    const at = f.default ?? f.copies[0]?.path;
    if (!at) continue;
    items.push({ label: tildePath(at), detail: f.remote ?? `.slipbox/ ${f.id ?? ""}`.trim(), data: { open: join(at, p.path) } });
  }
  for (const f of t.folders.filter((x) => !x.remote)) {
    const at = f.default ?? f.copies[0]?.path;
    if (at) items.push({ label: `Rename ${tildePath(at)}'s name…`, detail: `${f.name} → ${slugName(posix.basename(posix.dirname(at)))}-${f.name}`, data: { rename: at, name: f.name } });
  }
  a.openList({
    title: `${p.name}: ${t.folders.length} different folders have this name — which is meant?`,
    items,
    filterable: false,
    accept: (item) => {
      const d = item.data as { open?: string; rename?: string; name?: string };
      if (d.open) {
        if (inSplit) a.otherWindow();
        return a.open(d.open, frag ? (lineAnchor(frag) ?? headingAnchor(a, d.open, frag)) : undefined);
      }
      const root = d.rename!;
      const suggested = `${slugName(posix.basename(posix.dirname(root)))}-${d.name}`;
      a.prompt(`rename ${d.name} at ${tildePath(root)} to: `, (name) => name.trim() && a.previewRename(() => planVaultRename(rootAt(root), name.trim())));
      if (a.overlay?.kind === "prompt") a.overlay.text = suggested;
    },
  });
}

/** `g;` / `g,`: the change before or after in the note's change list. */
function changeStep(a: App, dir: -1 | 1): void {
  withView(a, (v) => {
    const b = v.buf;
    if (!b.changes.length) return a.message("info", "no changes in this note yet");
    const i = b.changeAt + dir;
    if (i < 0) return a.message("info", "at the oldest change");
    if (i >= b.changes.length) return a.message("info", "at the newest change");
    b.changeAt = i;
    E.placeAt(a, v, Math.min(b.changes[i]!, b.source.length));
    a.message("info", `change ${i + 1} of ${b.changes.length}`);
  });
}

function lensStep(a: App, step: 1 | -1): void {
  withView(a, (v) => {
    if (!v.live) return a.message("info", "the lens isn't open — space n l opens it");
    Object.assign(v, { lensStep: step, layoutKey: "" });
  });
}

function fileLink(a: App, rel: string, heading: string | null = null, inSplit = false): void {
  // A data or text file opens (16.4) — at a data file's section when the link names one
  // (`[[config.toml#editor]]`); a binary one's path is copied (images render later).
  if (classify(rel, a.config.walk.extensions).group !== "binary") {
    if (inSplit) a.otherWindow();
    const line = heading ? lineAnchor(heading) : undefined;
    a.open(rel, line);
    if (heading && !line && a.view) jumpToHeading(a, a.view, heading);
    return;
  }
  a.copy(join(a.loc.root, rel), false);
  a.message("info", `attachment ${rel} — path copied (images render in a later phase)`);
}

/** A line fragment (GitHub's `L42`, `L42-L50`, `L42C5-L45C10`; a code comment's `path:42`, 16.10): its first line. */
function lineAnchor(fragment: string): Anchor | undefined {
  const f = lineFragment(fragment);
  return f ? { heading: null, headingIndex: 0, offset: 0, line: f.line } : undefined;
}

/** Where a fragment lands in a note (landing.ts: an id, a heading by slug or text, a path of headings), as an anchor. */
function headingAnchor(a: App, path: string, heading: string, wiki = false): Anchor | undefined {
  // A note of another vault too (17.10): its heading is found in that vault's index.
  const note = a.graph.entryAnywhere(path);
  const hit = note ? findHeading(note.headings, note.anchors ?? [], heading, wiki) : null;
  if (!hit) {
    a.message("warn", `no heading "${heading}" in ${path}`);
    return undefined;
  }
  if (hit.ambiguous) a.message("info", `${path} has several headings "${heading}": the first`);
  if (hit.heading === null) return { heading: null, headingIndex: 0, offset: 0, line: hit.line };
  const h = note!.headings[hit.heading]!;
  const idx = note!.headings.filter((x) => x.slug === h.slug && x.line < h.line).length;
  return { heading: h.slug, headingIndex: idx, offset: 0, line: h.line };
}

/**
 * A JSON pointer (`#/components/schemas/Frame`, a `$ref`'s) as a heading: each segment the next
 * level's key under the one before, in a data file's tree (16.12). A list index counts from 0,
 * the tree's item rows from 1.
 */
function pointerHeading(headings: { level: number; text: string }[], pointer: string): number {
  const segs = pointer.slice(1).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let at = -1;
  let level = 0;
  for (const seg of segs) {
    const want = [seg, ...(/^\d+$/.test(seg) ? [String(Number(seg) + 1)] : [])];
    let found = -1;
    for (let i = at + 1; i < headings.length; i++) {
      const h = headings[i]!;
      if (h.level <= level) break; // out of the parent's rows
      if (h.level === level + 1 && want.includes(h.text)) {
        found = i;
        break;
      }
    }
    if (found < 0) return -1;
    at = found;
    level++;
  }
  return at;
}

function jumpToHeading(a: App, view: View, heading: string, wiki = false): void {
  const layout = lay(a, view);
  const p = heading.startsWith("/") ? pointerHeading(layout.headings, heading) : -1;
  if (p >= 0) {
    a.pushHistory(view);
    return a.moveCursor(view, { row: layout.headings[p]!.line, col: 0 });
  }
  // As a link finds one (landing.ts): its id, an anchor (`<a id>`, from the note's parse), its slug, its text.
  const heads = layout.headings.map((h) => ({ depth: h.level, text: h.text, slug: h.slug, line: h.src, id: h.id }));
  const anchors = view.buf.kind.group === "note" && view.buf.parsed && !view.buf.parsing ? anchorsOf(view.buf.parsed.tree) : [];
  const hit = findHeading(heads, anchors, heading, wiki);
  if (!hit) return a.message("warn", `no heading "${heading}" here`);
  if (hit.ambiguous) a.message("info", `several headings "${heading}" here: the first`);
  a.pushHistory(view);
  if (hit.heading !== null) return a.moveCursor(view, { row: layout.headings[hit.heading]!.line, col: 0 });
  const row = layout.lines.findIndex((l) => l.src >= hit.line);
  a.moveCursor(view, { row: Math.max(0, row), col: 0 });
}

function cycleLink(a: App, dir: 1 | -1): void {
  withView(a, (v) => {
    const layout = lay(a, v);
    const links = layout.links.map((l, i) => ({ l, i })).filter((x) => x.l.line >= 0);
    if (!links.length) return a.message("info", "no links in this note");
    // Off a link, a link starting right at the cursor counts as the next one.
    const onLink = a.linkUnderCursor(v) >= 0;
    const after = (x: { l: LayoutLink }) => x.l.line > v.cur.row || (x.l.line === v.cur.row && (onLink ? x.l.col > v.cur.col : x.l.col >= v.cur.col));
    const before = (x: { l: LayoutLink }) => x.l.line < v.cur.row || (x.l.line === v.cur.row && x.l.col < v.cur.col);
    const next = dir === 1 ? (links.find(after) ?? links[0]!) : ([...links].reverse().find(before) ?? links[links.length - 1]!);
    a.moveCursor(v, { row: next.l.line, col: next.l.col });
  });
}

function linkTarget(a: App, v: View, link: LayoutLink): string {
  if (link.kind === "tag") return `#${link.target}`;
  if (!v.buf.rel || link.kind === "footnote") return link.target;
  const r = a.graph.resolveLink({ kind: link.kind, target: link.target }, v.buf.rel);
  return r.path && r.resolvedKind !== "external" ? join(a.loc.root, r.path) : link.target;
}

// ---------------------------------------------------------------------------------------------
// The `:` prompt: matching commands, plus exact aliases that win, plus argument completion.

function argCandidates(a: App, cmd: string): string[] | null {
  switch (cmd) {
    case "note.open":
    case "window.split_side":
    case "window.split_stacked":
    case "tab.new":
    case "link.convert":
      return cmd === "note.open" ? [...a.graph.notes.keys(), ...a.graph.filePaths().filter((p) => classify(p, a.config.walk.extensions).group !== "binary")] : [...a.graph.notes.keys()];
    case "theme.set":
      return listThemes().map((t) => t.name);
    case "glyphs.set":
      return ["nerd", "unicode", "ascii", "auto"];
    case "tag.list":
      return a.graph.tags().map((t) => t.tag);
    default:
      return null;
  }
}

/** Commands whose argument is free text, with nothing to complete: a new name, a line, a query. */
const FREE_ARG = new Set(["note.create", "folder.create", "cursor.goto_line", "find.vault", "search.open", "note.rename", "heading.rename", "folder.name"]);

/** Commands in the order of core/command-specs.ts, which follows docs/design/keymap.md. */
const SPEC_ORDER = new Map(COMMAND_SPECS.map((c, i) => [c.id, i]));
function inSpecOrder<T extends { id: string }>(commands: T[]): T[] {
  return [...commands].sort((x, y) => (SPEC_ORDER.get(x.id) ?? 1e9) - (SPEC_ORDER.get(y.id) ?? 1e9));
}

/** Run a command chosen from the palette or help, remembering it for the palette's Recent. */
function runChosen(a: App, spec: string): void {
  a.noteRecent(spec.split(" ")[0]!);
  void a.run(spec).then(() => a.host.requestRender());
}

/** A group heading: a blank row before it (unless first), the title, a rule under it. */
function heading(title: string, first: boolean): ListItem[] {
  return [...(first ? [] : [{ label: "", header: true, data: null }]), { label: title, header: true, data: null }, { label: "", header: true, rule: true, data: null }];
}

/**
 * Items under group headings, in the groups' order (docs/design/keymap.md). What no group in the
 * order claims goes under "Other", last, so nothing is ever left out.
 */
function grouped(items: ListItem[], groupOf: (item: ListItem) => string, order: string[], first = true): ListItem[] {
  const out: ListItem[] = [];
  for (const title of order) {
    const members = items.filter((i) => groupOf(i) === title);
    if (members.length) out.push(...heading(title, first && !out.length), ...members);
  }
  const rest = items.filter((i) => !order.includes(groupOf(i)));
  if (rest.length) out.push(...heading("Other", first && !out.length), ...rest);
  return out;
}

/**
 * At most three bindings shown, plain ones first (a variant like "extend the selection" after);
 * the rest go to the footer.
 */
function topKeys(keys: string[], variants: Set<string>, desc: string): { keys: string[]; more: string[]; detail: string } {
  const ordered = [...keys.filter((k) => !variants.has(k)), ...keys.filter((k) => variants.has(k))];
  return { keys: ordered.slice(0, 3), more: ordered.slice(3), detail: desc };
}

/**
 * The palette (`:`): for doing things. An empty query shows Recent, then every command by group;
 * typing ranks the best match first. Each command shows its first key and alias; the selected
 * one's description is in the footer.
 */
function openPalette(a: App): void {
  // From a selection: its lines are '<,'> (vim's marks), already typed, for :'<,'>s.
  const v = a.view;
  let input = "";
  if (v?.sel) {
    const lines = a.currentLayout(v).lines;
    const x = lines[v.sel.anchor.row]?.src ?? 1;
    const y = lines[v.cur.row]?.src ?? 1;
    v.visualLines = [Math.min(x, y), Math.max(x, y)];
    input = "'<,'>";
  }
  const commands = inSpecOrder(a.registry.list().filter((c) => !c.hidden));
  const aliasOf = new Map<string, string[]>();
  for (const [al, spec] of Object.entries(a.aliases)) {
    const list = aliasOf.get(spec) ?? [];
    list.push(`:${al}`);
    aliasOf.set(spec, list);
  }
  const commandItems: ListItem[] = commands.map((c) => {
    const keys = [...new Set([...a.keymap.keysFor(c.id), ...a.sourceKeys.keysFor(c.id), ...a.visualKeys.keysFor(c.id)])].map(spellKey);
    const aliases = aliasOf.get(c.id) ?? [];
    // Two fixed columns, the first key and the first alias (empty when there is none); the rest
    // in the footer.
    return { label: c.title, detail: c.description ?? c.id, keys: [keys[0] ?? "", aliases[0] ?? ""], more: [...keys.slice(1), ...aliases.slice(1)], data: c.id };
  });
  const byId = new Map(commandItems.map((i) => [i.data as string, i]));
  const recent = a.recentCommands.map((id) => byId.get(id)).filter((i): i is ListItem => !!i);
  const browse: ListItem[] = [
    ...(recent.length ? [...heading("Recent", true), ...recent] : []),
    ...grouped(commandItems, (i) => commandGroup(i.data as string), COMMAND_GROUPS.map((g) => g.title), !recent.length),
  ];
  a.openList({
    title: "Commands — type a name, or an alias like :q",
    items: commandItems,
    footer: true,
    alignKeysAcrossList: true,
    input,
    source: (input) => {
      if (!input.trim()) return browse;
      // :42, vim's: that line.
      if (/^\s*\d+\s*$/.test(input)) return [{ label: `Go to line ${input.trim()}`, detail: "cursor.goto_line", keys: ["", `:${input.trim()}`], data: `cursor.goto_line ${input.trim()}` }];
      // A substitute (vim's :s): one entry, run by enter.
      if (parseSubstitute(input)) return [{ label: "Substitute", detail: input.trim(), keys: ["", ":s"], data: `find.substitute ${input.trim()}` }];
      const m = /^(\S+)\s(.*)$/.exec(input);
      const aliasSpec = m ? a.aliases[m[1]!] : undefined;
      if (aliasSpec) {
        const cands = argCandidates(a, aliasSpec.split(" ")[0]!);
        if (cands) {
          return rank(m![2]!, cands, (x) => x, 200).map(({ item }) => ({ label: item, detail: `${m![1]} ${item}`, data: `${aliasSpec} ${item}` }));
        }
      }
      const exact = a.aliases[input.trim()];
      const ranked = rank(input.trim(), commandItems, (i) => [i.label, i.detail ?? ""]).map((r) => r.item);
      if (exact) {
        const title = a.registry.get(exact.split(" ")[0]!)?.title ?? exact;
        return [{ label: title, detail: `alias for ${exact}`, keys: ["", `:${input.trim()}`], data: exact }, ...ranked.filter((i) => i.data !== exact)];
      }
      return ranked;
    },
    submit: (input) => {
      // :2,5s/…, :.,$s/…: ranges :s doesn't take — said, never a silent nothing.
      if (/^\s*[\d.$,+-]+s[^\w\s\\]/.test(input)) {
        a.overlay = null;
        a.message("warn", "`:s` takes the line, `%` or `'<,'>` — select the lines (V) and type :, or use :%s");
        return true;
      }
      if (parseSubstitute(input)) {
        a.overlay = null;
        void a.run(`find.substitute ${input.trim()}`).then(() => a.host.requestRender());
        return true;
      }
      if (/^\s*\d+\s*$/.test(input)) {
        a.overlay = null;
        void a.run(`cursor.goto_line ${input.trim()}`).then(() => a.host.requestRender());
        return true;
      }
      // An exact alias (optionally with an argument) wins over the matches, unless another
      // entry was picked: moved to with the keys, or clicked (its row is first while unmoved).
      const m = /^(\S+)(?:\s+(.*))?$/.exec(input.trim());
      if (!m) return false;
      const spec = a.aliases[m[1]!];
      if (!spec) return false;
      const arg = m[2]?.trim();
      if (!arg && a.overlay?.kind === "list" && a.overlay.selected > 0) return false;
      if (arg && argCandidates(a, spec.split(" ")[0]!) && a.overlay?.kind === "list") {
        // With an argument that completes, prefer the highlighted candidate.
        const sel = a.overlay.filtered[a.overlay.selected]?.item;
        a.overlay = null;
        runChosen(a, sel ? (sel.data as string) : `${spec} ${arg}`);
        return true;
      }
      // An argument the command doesn't take: the typing is probably a title ("zen mode"), which the
      // list picks; when nothing there matches either (:w other.md), it's said, never dropped.
      if (arg && !argCandidates(a, spec.split(" ")[0]!) && !FREE_ARG.has(spec) && !spec.includes(" ")) {
        if (a.overlay?.kind === "list" && a.overlay.filtered.some((e) => !e.item.header)) return false;
        a.overlay = null;
        a.message("warn", `:${m[1]} takes no argument (${arg} ignored)`);
        return true;
      }
      a.overlay = null;
      runChosen(a, arg ? `${spec} ${arg}` : spec);
      return true;
    },
    accept: (item) => {
      if (typeof item.data === "string") runChosen(a, item.data);
    },
  });
}

/**
 * Help (`?`, `space ?`): for learning the keys. Every command with all its keys, by group, plus what
 * works inside the explorer, the outline, visual and resize mode, and the mouse. Filtering keeps
 * the groups; enter runs a command (the in-pane and mouse entries are reference only). Opened
 * from the explorer, the outline or visual mode, it starts at that section.
 */
function openHelp(a: App): void {
  const commands: ListItem[] = inSpecOrder(a.registry.list()).map((c) => {
    // Every keymap's keys: the reading ones, source mode's own ([keys.source]) and visual mode's.
    const plain = [...a.keymap.keysFor(c.id), ...a.sourceKeys.keysFor(c.id), ...a.visualKeys.keysFor(c.id)].map(spellKey);
    // Bindings with an argument (e.g. "cursor.down extend") are variants: shown after the plain ones.
    const variants = a.keymap.entries().filter(([, v]) => v.startsWith(`${c.id} `)).map(([k]) => spellKey(k));
    return { label: c.title, ...topKeys([...new Set([...plain, ...variants])], new Set(variants), c.description ?? c.id), data: c.id };
  });
  // An entry per action with its keys; `actions` gathers several that do the same there.
  const pane = (keymap: { keysFor(action: string): string[] }, info: Record<string, { title: string; desc: string; actions?: string[] }>): ListItem[] =>
    Object.entries(info)
      .map(([action, i]) => ({ label: i.title, ...topKeys((i.actions ?? [action]).flatMap((x) => keymap.keysFor(x)).map(spellKey), new Set(), i.desc), data: null }))
      .filter((i) => i.keys.length);
  const items: ListItem[] = [
    ...grouped(commands, (i) => commandGroup(i.data as string), COMMAND_GROUPS.map((g) => g.title)),
    ...heading("Inside the explorer", false),
    ...pane(a.explorerKeys, EXPLORER_ACTION_INFO),
    ...heading("Inside the history", false),
    ...pane(a.explorerKeys, HISTORY_ACTION_INFO),
    ...heading("Filtering a panel (/)", false),
    ...FILTER_KEYS_HELP.map(([label, keys, detail]) => ({ label, ...topKeys(keys.map((k) => (k === "type" ? k : spellKey(k))), new Set(), detail), data: null })),
    ...heading("Inside the outline", false),
    ...pane(a.outlineKeys, OUTLINE_ACTION_INFO),
    ...heading("Resize mode", false),
    ...pane(a.resizeKeys, RESIZE_ACTIONS),
    ...heading("Mouse", false),
    ...MOUSE_HELP.map(([label, keys, detail]) => ({ label, ...topKeys(keys, new Set(), detail), data: null })),
  ];
  // Start where the keys are about what you're doing: the focused pane's, or visual mode's.
  const section = a.region === "sidebar" ? (a.leftView === "history" ? "Inside the history" : "Inside the explorer") : a.region === "outline" ? "Inside the outline" : a.view?.visual ? "Selection & copy" : null;
  const at = section ? items.findIndex((i) => i.header && i.label === section) : -1; // the title row
  a.openList({
    title: "Keys — type to filter, enter runs a command",
    items,
    footer: true,
    keepGroups: true,
    selected: at >= 0 ? at + 1 : undefined,
    accept: (item) => {
      if (typeof item.data === "string") runChosen(a, item.data);
    },
  });
  // With the section's heading at the top of the list.
  if (at >= 0 && a.overlay?.kind === "list") a.overlay.scroll = at;
}

/** The mouse, for help: [what, how, detail]. */
const MOUSE_HELP: [string, string[], string][] = [
  ["Move the cursor", ["click"], "Moves the cursor to where you click in a note; on a link, follows it"],
  ["Select and copy", ["drag"], "Selects the text you drag over and copies it on release"],
  ["Select a word / a row", ["double-click", "triple-click"], "Selects the word or the whole row, and copies it"],
  ["Scroll", ["wheel"], "Scrolls the note, a pane or a list, or switches tabs"],
  ["Show a panel's view", ["click"], "On a rail: ≡ the explorer, ◷ the history, ▤ the outline; again hides it"],
  ["Open a note as a tab", ["click"], "In the explorer: opens the note as a tab; on a folder, folds or unfolds it"],
  ["Jump to a place", ["click"], "In the history: moves the window back or forward to that place"],
  ["Jump to a heading", ["click"], "In the outline or a breadcrumb: moves the note there; on ▾ / ▸, folds"],
  ["Switch, reorder, close tabs", ["click", "drag", "middle-click"], "On the tab strip: switches, drags to reorder, closes (so does ×)"],
  ["Resize panes and splits", ["drag"], "Drags a border to resize what's beside it"],
  ["Scroll to a place", ["click", "drag"], "On a scrollbar (either direction): jumps there, or drags the thumb"],
  ["Open the heading path", ["click"], "On the breadcrumb's …: the whole path as a dropdown"],
  ["Copy the note's path", ["click"], "On the path in the status line: copies the absolute path"],
];

// ---------------------------------------------------------------------------------------------
// UI settings

const UI_TOGGLES: { key: keyof UiState; id: string; title: string }[] = [
  { key: "readable_width", id: "ui.readable", title: "Readable width" },
  { key: "zen", id: "ui.zen", title: "Zen mode" },
  { key: "cursorline", id: "ui.cursorline", title: "Cursor-row highlight" },
  { key: "line_numbers", id: "ui.line_numbers", title: "Line numbers" },
  { key: "wrap", id: "ui.wrap", title: "Wrap long lines" },
  { key: "urls", id: "ui.urls", title: "Show link URLs" },
  { key: "mouse", id: "ui.mouse", title: "Mouse" },
  { key: "breadcrumb", id: "ui.breadcrumb", title: "Breadcrumb" },
  { key: "top_bar", id: "ui.top_bar", title: "Top bar" },
  { key: "problems_bar", id: "ui.problems_bar", title: "Problems bar" },
  { key: "problem_marks", id: "ui.problem_marks", title: "Problems marked in the text" },
];

function toggle(a: App, key: keyof UiState, title: string): void {
  const next = !a.ui[key];
  a.setUi(key, next as never);
  a.message("info", `${title}: ${next ? "on" : "off"}`);
}

function pickTheme(a: App): void {
  const before = a.ui.theme;
  const themes = listThemes();
  a.openList({
    title: "Theme (live preview)",
    items: themes.map((t) => ({ label: t.name, hint: t.source, data: t.name })),
    selected: themes.findIndex((t) => t.name === before),
    move: (item) => {
      a.theme = a.themeNamed(item.data as string).theme;
    },
    accept: (item) => {
      a.setUi("theme", item.data as string);
      a.message("info", `theme ${a.theme.name} · theme = "${a.theme.name}" in config makes it the default`);
    },
    // Back to the setting as it is now (a config reload may have changed it while the list was open).
    cancel: () => {
      a.theme = a.themeNamed(a.ui.theme).theme;
    },
  });
}

function pickGlyphs(a: App): void {
  const before = a.ui.glyphs;
  const sets = ["nerd", "unicode", "ascii", "auto"];
  const preview = (mode: string) => {
    a.glyphs = a.glyphSet(mode);
    a.relayoutAll();
  };
  a.openList({
    title: "Glyphs (live preview)",
    items: sets.map((s) => ({ label: s, hint: s === "auto" ? "detect from the terminal" : undefined, data: s })),
    selected: Math.max(0, sets.indexOf(before)),
    move: (item) => preview(item.data as string),
    accept: (item) => {
      a.setUi("glyphs", item.data as string);
      a.message("info", `glyphs: ${item.data}`);
    },
    cancel: () => preview(a.ui.glyphs), // the setting now, not when the list opened
  });
}

// ---------------------------------------------------------------------------------------------

function infoList(a: App, title: string, rows: [string, string][]): void {
  const w = Math.max(...rows.map(([k]) => k.length));
  a.openList({
    title: `${title} — enter copies a line`,
    filterable: false,
    items: rows.map(([k, v]) => ({ label: `${k.padEnd(w)}  ${v}`, data: `${k}: ${v}` })),
    accept: (item) => void a.copy(item.data as string),
  });
}

/**
 * `n` / `shift+n`, as in vim: the next match after the cursor (or before it), wrapping around the
 * note, wherever the cursor has moved since the last one.
 */
function findStep(a: App, dir: 1 | -1, from?: { row: number; col: number }): void {
  const v = a.view;
  if (!v?.find || !v.find.matches.length) return a.message("info", "no search — ctrl+f or / starts one");
  const ms = v.find.matches;
  const n = ms.length;
  const at = from ?? v.cur;
  const cmp = (m: { row: number; col: number }) => (m.row - at.row) * 1e9 + (m.col - at.col);
  let i = dir === 1 ? ms.findIndex((m) => cmp(m) > 0) : ms.findLastIndex((m) => cmp(m) < 0);
  const wrapped = i < 0;
  if (wrapped) i = dir === 1 ? 0 : n - 1;
  v.find.current = i;
  const m = ms[i]!;
  a.moveCursor(v, { row: m.row, col: m.col });
  a.message("info", `${i + 1}/${n}  ${v.find.query}${wrapped ? (dir === 1 ? "  (from the top)" : "  (from the bottom)") : ""}`);
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
  const word = cs.slice(s, e + 1).map((c) => c.g).join("");
  v.find = computeFind(layout, word, 0, true);
  // From the word's start: forward skips this one, backward finds the one before it.
  findStep(a, dir, { row: v.cur.row, col: cs[s]!.x });
}

/** Vault search lists this many matching lines at most (the count says how many there were). */
const VAULT_SEARCH_MAX = 1000;

export function registerActions(app: App): void {
  const impl: Record<string, Run> = {
    // cursor
    "cursor.left": motion((a, v) => C.left(lay(a, v), v.cur)),
    "cursor.right": motion((a, v) => C.right(lay(a, v), v.cur)),
    "cursor.up": motion((a, v) => C.vertical(lay(a, v), v.cur, -1, v.goal), { keepGoal: true }),
    "cursor.down": motion((a, v) => C.vertical(lay(a, v), v.cur, 1, v.goal), { keepGoal: true }),
    "cursor.word_prev": motion((a, v) => C.wordPrev(lay(a, v), v.cur)),
    "cursor.word_next": motion((a, v) => C.wordNext(lay(a, v), v.cur)),
    "cursor.word_end": motion((a, v) => C.wordEnd(lay(a, v), v.cur)),
    "cursor.line_start": motion((a, v) => C.lineStart(lay(a, v), v.cur)),
    "cursor.line_end": motion((a, v) => C.lineEnd(lay(a, v), v.cur)),
    "cursor.first_nonblank": motion((a, v) => C.firstNonBlank(lay(a, v), v.cur)),
    // gg and G; with a count in source mode (3gg, 5G), that line of the note, as vim.
    "cursor.top": motion((a, v) => countedLine(a, v) ?? C.top(lay(a, v))),
    "cursor.bottom": motion((a, v) => countedLine(a, v) ?? (editable(v) ? lastLine(a, v) : C.bottom(lay(a, v)))),
    "cursor.heading_prev": motion((a, v) => C.headingPrev(lay(a, v), v.cur)),
    "cursor.heading_next": motion((a, v) => C.headingNext(lay(a, v), v.cur)),
    "cursor.paragraph_prev": motion((a, v) => C.paragraphPrev(lay(a, v), v.cur)),
    "cursor.paragraph_next": motion((a, v) => C.paragraphNext(lay(a, v), v.cur)),
    "cursor.screen_top": motion((a, v) => C.firstNonBlank(lay(a, v), a.screenRow(v, "top"))),
    "cursor.screen_middle": motion((a, v) => C.firstNonBlank(lay(a, v), a.screenRow(v, "middle"))),
    "cursor.screen_bottom": motion((a, v) => C.firstNonBlank(lay(a, v), a.screenRow(v, "bottom"))),
    "scroll.center": (a) => withView(a, (v) => a.scrollCursorTo(v, "center")),
    "scroll.top": (a) => withView(a, (v) => a.scrollCursorTo(v, "top")),
    "scroll.bottom": (a) => withView(a, (v) => a.scrollCursorTo(v, "bottom")),
    "cursor.goto_line": (a, arg) =>
      withView(a, (v) => {
        const go = (text: string) => {
          const n = Number(text.trim());
          if (!Number.isInteger(n) || n < 1) return a.message("warn", `not a line number: ${text}`);
          a.pushHistory(v);
          // Onto that line's text: in a rendered paragraph joined from several, not its row's end.
          a.placeAtLine(v, Math.min(n, v.buf.lineStarts().length));
        };
        if (arg) return go(arg);
        a.prompt("line", go, undefined, undefined, v);
      }),
    "cursor.half_down": (a) => withView(a, (v) => a.scrollBy(v, Math.max(1, Math.floor(v.height / 2)), true)),
    "cursor.half_up": (a) => withView(a, (v) => a.scrollBy(v, -Math.max(1, Math.floor(v.height / 2)), true)),
    "cursor.page_down": (a, arg) =>
      withView(a, (v) => {
        const n = Math.max(1, v.height - 2);
        if (arg === "extend") a.moveCursor(v, C.vertical(lay(a, v), v.cur, n, v.goal), { extend: true, keepGoal: true });
        else a.scrollBy(v, n, true);
      }),
    "cursor.page_up": (a, arg) =>
      withView(a, (v) => {
        const n = Math.max(1, v.height - 2);
        if (arg === "extend") a.moveCursor(v, C.vertical(lay(a, v), v.cur, -n, v.goal), { extend: true, keepGoal: true });
        else a.scrollBy(v, -n, true);
      }),
    // selection
    "visual.char": (a) =>
      withView(a, (v) => {
        if (v.visual === "char") return void Object.assign(v, { visual: null, sel: null });
        v.visual = "char";
        if (v.sel) v.sel.line = false;
        else a.select(v, { ...v.cur }, false);
      }),
    "visual.line": (a) =>
      withView(a, (v) => {
        if (v.visual === "line") return void Object.assign(v, { visual: null, sel: null });
        v.visual = "line";
        if (v.sel) v.sel.line = true;
        else a.select(v, { ...v.cur }, true);
      }),
    "visual.swap": (a) =>
      withView(a, (v) => {
        if (!v.sel) return;
        const anchor = v.sel.anchor;
        a.select(v, { ...v.cur }, v.sel.line);
        a.moveCursor(v, anchor);
      }),
    "visual.yank": (a) =>
      withView(a, (v) => {
        const text = a.selectionText(v);
        if (text) a.copy(text);
        // In source mode the text is the markdown itself: it's what p puts back, too.
        if (text && editable(v)) a.vim.register = { text: v.visual === "line" ? `${text}\n` : text, linewise: v.visual === "line" };
        // The cursor goes to the selection's start, as vim's does: p and P then put where expected.
        const [start] = C.ordered(v.sel?.anchor ?? v.cur, v.cur);
        Object.assign(v, { visual: null, sel: null });
        if (editable(v)) a.moveCursor(v, start);
      }),
    "visual.exit": (a) =>
      withView(a, (v) => {
        a.vim.awaitChar = null; // an f / t left waiting never takes a later key
        Object.assign(v, { visual: null, sel: null });
      }),
    "app.escape": (a) => {
      const v = a.view;
      if (!v) return;
      if (v.sel || v.visual) Object.assign(v, { visual: null, sel: null });
      else if (a.floating && v === a.floating.view && !v.find) a.closeFloating(); // the floating editor: closed, written back (3.20)
      else if (v.live) a.setViewMode(v, "rendered"); // esc in normal mode closes the lens
      else if (v.find) v.find = null;
      else if (a.region !== "content") a.region = "content";
    },
    "copy.smart": (a) =>
      withView(a, (v) => {
        if (v.sel) {
          a.copy(a.selectionText(v));
          Object.assign(v, { visual: null, sel: null });
          return;
        }
        const row = C.cells(lay(a, v).lines[v.cur.row]).map((c) => c.g).join("").trim();
        if (row) a.copy(row);
        else a.message("info", "nothing on this row to copy");
      }),
    "copy.selection": (a) =>
      withView(a, (v) => {
        if (!v.sel) return a.message("info", `nothing selected · ${prettyKey("ctrl+q")} quits`);
        a.copy(a.selectionText(v));
      }),
    "copy.path": (a) => withView(a, (v) => void a.copy(v.buf.abs)),
    "copy.ref": (a) => withView(a, (v) => void a.copy(`${v.buf.rel ?? v.buf.abs}:${lay(a, v).lines[v.cur.row]?.src ?? 1}`)),
    "copy.link": (a) =>
      withView(a, (v) => {
        const i = a.linkUnderCursor(v);
        if (i < 0) return a.message("info", "no link under the cursor");
        a.copy(linkTarget(a, v, lay(a, v).links[i]!));
      }),
    // links
    "link.insert": (a) => withView(a, (v) => a.insertLink(v)),
    "link.next": (a) => cycleLink(a, 1),
    "link.prev": (a) => cycleLink(a, -1),
    "link.follow": (a) =>
      withView(a, (v) => {
        const i = a.linkForFollow(v);
        const link = i >= 0 ? lay(a, v).links[i]! : sourceLinkAt(a, v);
        if (!link) {
          // The keys bound to the next link, as configured: one of its own, and the leader's.
          const keys = a.keymap.keysFor("link.next");
          const lead = canonKey(a.leader);
          const said = [keys.find((k) => k.split(" ")[0] !== lead), keys.find((k) => k.split(" ")[0] === lead)].filter((k) => k !== undefined).map((k) => prettyKey(k, a.leader));
          return a.message("info", said.length ? `no link here · ${said.join(" or ")} goes to the next one` : "no link here");
        }
        followLink(a, link, false);
      }),
    "link.follow_split": (a) =>
      withView(a, (v) => {
        const i = a.linkForFollow(v);
        const link = i >= 0 ? lay(a, v).links[i]! : sourceLinkAt(a, v);
        if (!link) return a.message("info", "no link here");
        followLink(a, link, true);
      }),
    "links.open": (a) =>
      withView(a, (v) => {
        const layout = lay(a, v);
        if (!layout.links.length) return a.message("info", "no links in this note");
        a.openList({
          title: `Links from ${v.buf.name}`,
          items: layout.links.map((l, i) => ({
            label: l.text,
            detail: l.kind === "markdown" || l.kind === "image" ? l.target : `[[${l.target}${l.heading ? `#${l.heading}` : ""}]]`,
            hint: l.status,
            data: i,
          })),
          accept: (item) => {
            const l = layout.links[item.data as number]!;
            if (l.line >= 0) a.moveCursor(v, { row: l.line, col: l.col });
            followLink(a, l, false);
          },
        });
      }),
    "backlinks.open": (a) =>
      withView(a, (v) => {
        if (!v.buf.rel) return a.message("info", "backlinks are kept for the notes of a root (or the folder opened)");
        const bl = a.graph.backlinks(v.buf.rel);
        if (!bl.length) return a.message("info", `no notes link to ${v.buf.rel}`);
        a.openList({
          title: `Linking to ${v.buf.name} (${bl.length})`,
          // Another root's link (17.11): by its path, as files are shown (21.9).
          items: bl.map((b) => ({ label: b.vault ? a.graph.shownPath(b.from) : b.from, detail: b.text, hint: `${b.line}`, data: b })),
          accept: (item) => {
            const b = item.data as { from: string; line: number };
            a.open(b.from, { heading: null, headingIndex: 0, offset: b.line - 1, line: b.line });
          },
        });
      }),
    // history
    "edit.move_line_up": (a) => withView(a, (v) => E.moveLines(a, v, -1)),
    "edit.move_line_down": (a) => withView(a, (v) => E.moveLines(a, v, 1)),
    "change.prev": (a) => changeStep(a, -1),
    "change.next": (a) => changeStep(a, 1),
    "edit.insert_last": (a) =>
      withView(a, (v) => {
        const at = v.buf.lastInsert;
        if (at === null) return a.message("info", "no insert yet in this note");
        a.pushHistory(v);
        E.startInsert(a, v, () => Math.min(at, v.buf.source.length));
      }),
    "history.back": (a) => a.history("back"),
    "history.forward": (a) => a.history("forward"),
    // The left panel on the history, like the explorer: open and focus, focus, close.
    "history.list": (a) =>
      withView(a, (v) => {
        // Nothing but this note — no timeline in this window, no note read lately in another.
        const others = a.historyRows().filter((r) => !r.here && !r.heading).length;
        if (!others && !v.back.length && !v.fwd.length && !(a.sidebarShown && a.leftView === "history")) return a.message("info", "no history yet");
        a.openLeftView("history", "cycle");
      }),
    // windows
    // :vs <note> and :sp <note> (vim's): the split, then that note in it.
    "window.split_side": async (a, arg) => {
      a.splitWith("side");
      if (arg) await a.run(`note.open ${arg}`);
    },
    "window.split_stacked": async (a, arg) => {
      a.splitWith("stacked");
      if (arg) await a.run(`note.open ${arg}`);
    },
    "window.focus_left": (a) => a.focusDir("left"),
    "window.focus_down": (a) => a.focusDir("down"),
    "window.focus_up": (a) => a.focusDir("up"),
    "window.focus_right": (a) => a.focusDir("right"),
    "window.other": (a) => {
      const t = a.tab;
      if (a.region !== "content") a.region = "content";
      else if (t && t.views.length > 1) t.active = (t.active + 1) % t.views.length;
    },
    "window.move_left": (a) => a.moveWindow("left"),
    "window.move_down": (a) => a.moveWindow("down"),
    "window.move_up": (a) => a.moveWindow("up"),
    "window.move_right": (a) => a.moveWindow("right"),
    "window.resize_mode": (a) => {
      a.resizeMode = true;
    },
    "window.equalize": (a) => a.resizeAction("equalize"),
    "breadcrumb.path": (a) => a.openHeadingPath(),
    // One step, then resize mode: the same key (or h j k l) goes on resizing without the chord.
    ...Object.fromEntries(
      (["wider", "narrower", "taller", "shorter"] as const).map((step) => [
        `window.${step}`,
        (a: App) => {
          a.resizeAction(step);
          a.resizeMode = true;
        },
      ]),
    ),
    "window.swap": (a) => {
      const t = a.tab;
      if (!t || t.views.length < 2) return a.message("info", "only one window");
      t.views.reverse();
      t.active = 1 - t.active;
    },
    "window.close": (a) => a.closeWindow(),
    "window.close_or_quit": (a) => a.closeOrQuit(),
    "window.only": (a) => {
      const t = a.tab;
      if (!t || t.views.length < 2) return;
      const keep = t.views[t.active]!;
      for (const v of t.views) if (v !== keep) a.remember(v);
      t.views = [keep];
      t.active = 0;
    },
    // tabs
    // :tabnew <note>: a new tab on that note; without one, on this note.
    "tab.new": (a, arg) =>
      withView(a, async (v) => {
        a.tabs.splice(a.activeTab + 1, 0, { views: [a.makeView(v.buf, { ...v.topAnchor }, { ...v.curAnchor })], active: 0, orientation: "side", ratio: a.config.ui.split_ratio });
        a.activeTab += 1;
        if (arg) await a.run(`note.open ${arg}`);
      }),
    "tab.list": (a) =>
      a.openList({
        title: `Tabs (${a.tabs.length})`,
        items: a.tabs.map((t, i) => ({ label: `${i + 1}  ${a.displayName(t.views[t.active]!.buf)}`, hint: t.views.length > 1 ? "split" : undefined, data: i })),
        selected: a.activeTab,
        accept: (item) => {
          a.activeTab = item.data as number;
        },
      }),
    "tab.next": (a) => {
      if (a.tabs.length) a.activeTab = (a.activeTab + 1) % a.tabs.length;
    },
    "tab.prev": (a) => {
      if (a.tabs.length) a.activeTab = (a.activeTab - 1 + a.tabs.length) % a.tabs.length;
    },
    "tab.goto": (a, arg) => {
      const n = Number(arg) - 1;
      if (Number.isInteger(n) && n >= 0 && n < a.tabs.length) a.activeTab = n;
      else a.message("info", `no tab ${arg}`);
    },
    "tab.move_left": (a) => a.moveTab(-1),
    "tab.move_right": (a) => a.moveTab(1),
    "tab.pin": (a) => a.togglePin(),
    "tab.close": (a) => a.closeTab(),
    // panes
    // Closed (or showing the history) → open on the tree and focus; open elsewhere → focus; focused → close.
    "explorer.cycle": (a) => a.openLeftView("explorer", "cycle"),
    "explorer.reveal": (a) => {
      a.switchLeftView("explorer");
      a.sidebar.filter = "";
      a.sidebar.filtering = false;
      a.showSidebar(true);
      a.revealInSidebar();
      a.region = "sidebar";
    },
    // Like the explorer: closed → open and focus; open elsewhere → focus; focused → close.
    "outline.cycle": (a) => a.openRightView("outline", "cycle"),
    // The ▤ button: show (and focus) or hide.
    "outline.toggle": (a) => a.openRightView("outline"),
    // The right panel's other view (3.17): the note's footnotes, its button under the outline's.
    "footnotes.cycle": (a) => a.openRightView("footnotes", "cycle"),
    "footnotes.toggle": (a) => a.openRightView("footnotes"),
    "footnote.add": (a) => a.addFootnote(),
    // find
    "find.open": (a) =>
      withView(a, (v) => {
        const prev = v.find;
        const start = { ...v.cur };
        a.prompt(
          "/",
          (text) => {
            // An empty search clears the find rather than leaving "/ 0/0" behind.
            if (!text) {
              v.find = null;
              return V.finishSearchOp(a, v, false);
            }
            const o = v.findOpts ?? { regex: false, whole: false };
            v.find = computeFind(lay(a, v), text, v.find?.current ?? 0, o.whole, o.regex);
            if (v.find.error) a.message("warn", `not a regex: ${v.find.error}`);
            else if (!v.find.matches.length) a.message("info", `not found: ${text}`);
            if (v.find.error || !v.find.matches.length) a.moveCursor(v, start);
            // After an operator (d/foo): it covers the text up to the match.
            V.finishSearchOp(a, v, v.find.matches.length > 0);
          },
          (text) => {
            const o = v.findOpts ?? { regex: false, whole: false };
            v.find = computeFind(lay(a, v), text, 0, o.whole, o.regex);
            const first = v.find.matches.findIndex((m) => m.row > start.row || (m.row === start.row && m.col >= start.col));
            const i = first >= 0 ? first : 0;
            const m = v.find.matches[i];
            if (m) {
              v.find.current = i;
              a.moveCursor(v, { row: m.row, col: m.col });
            } else a.moveCursor(v, start); // nothing matches (yet): back where the search began, as vim
          },
          () => {
            v.find = prev;
            a.moveCursor(v, start);
            V.finishSearchOp(a, v, false);
          },
          v, // typed in this window's find row
        );
      }),
    // Search the vault (ctrl+shift+f, space f g): every note and every file the explorer shows, an
    // open one as it is now (unsaved changes and all); enter opens it at the match.
    "search.open": (a, arg) => a.openSearch(arg ?? ""),
    "git.changes": (a) => a.openChanges(),
    "git.diff": (a) => a.openGitDiff(),
    "git.worktrees": (a) => a.openWorktrees(),
    "git.merge_review": (a) => a.openMergeReview(),
    "find.vault": (a, arg) => {
      const run = (query: string) => {
        if (!query.trim()) return;
        const o = a.view?.findOpts ?? { regex: false, whole: false };
        const re = compilePattern(query, o);
        if (typeof re === "string") return a.message("warn", `not a regex: ${re}`);
        const paths = [...a.graph.notes.keys(), ...a.shownFiles().map((f) => f.path)].sort();
        const items: ListItem[] = [];
        let total = 0;
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
          for (const m of findAll(text, re)) {
            total++;
            for (let i = text.indexOf("\n", counted); i >= 0 && i < m.from; i = text.indexOf("\n", i + 1)) line++;
            counted = m.from;
            if (line === lastLine || items.length >= VAULT_SEARCH_MAX) continue; // a line once, however many matches
            lastLine = line;
            const start = text.lastIndexOf("\n", m.from - 1) + 1;
            const end = text.indexOf("\n", m.from);
            const row = sanitize(text.slice(start, end < 0 ? text.length : end).replace(/\t/g, " ")).trim();
            items.push({ label: `${rel}:${line}`, detail: row.length > 160 ? `${row.slice(0, 160)}…` : row, data: { rel, line } });
          }
        }
        if (!items.length) return a.message("info", `not found here: ${query}`);
        a.openList({
          title: `"${query}" — ${total} match${total === 1 ? "" : "es"} in ${new Set(items.map((i) => (i.data as { rel: string }).rel)).size} files${items.length >= VAULT_SEARCH_MAX ? ` (the first ${VAULT_SEARCH_MAX} lines)` : ""}`,
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
      a.prompt("find in every note", run);
    },
    // Find and replace: the find row with a replace row under it, on the markdown (replacing.ts).
    // A selection on one line is the query; across lines, it's where to replace.
    "find.replace": (a) =>
      withView(a, async (v) => {
        let seed = v.find?.query ?? "";
        let range: [number, number] | undefined;
        if (v.sel) {
          const [p, q] = v.sel.anchor.row < v.cur.row || (v.sel.anchor.row === v.cur.row && v.sel.anchor.col <= v.cur.col) ? [v.sel.anchor, v.cur] : [v.cur, v.sel.anchor];
          const text = a.selectionText(v);
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
        R.openReplace(a, o, v, range);
        if (seed) {
          o.text = seed;
          o.change?.(seed);
          R.refresh(a, o, v);
        } else o.replace!.focus = false; // nothing to find yet: type it first
      }),
    // f F t T: a character on the line; ; and , again, the same way or back.
    "cursor.find_char": (a, arg) =>
      withView(a, (v) => {
        const kind = (arg === "F" || arg === "t" || arg === "T" ? arg : "f") as V.FindKind;
        const n = V.takeCount(a);
        a.vim.awaitChar = (ch) => {
          a.vim.lastFind = { kind, ch };
          const to = C.findChar(lay(a, v), v.cur, kind, ch, n);
          if (to) a.moveCursor(v, to);
        };
      }),
    "cursor.find_repeat": (a, arg) =>
      withView(a, (v) => {
        const f = a.vim.lastFind;
        if (!f) return a.message("info", "no f or t to repeat yet");
        const to = C.findChar(lay(a, v), v.cur, arg === "back" ? V.reverseFind(f.kind) : f.kind, f.ch, V.takeCount(a), true);
        if (to) a.moveCursor(v, to);
      }),
    // n always forward, N always backward (not vim's "the way the search went").
    "find.next": (a) => findStep(a, 1),
    "find.prev": (a) => findStep(a, -1),
    "task.toggle": (a) => withView(a, (v) => a.toggleTaskAt(v)),
    "note.edit": (a) => withView(a, (v) => a.editInEditor(v)),
    "view.source": (a) =>
      withView(a, (v) => {
        const was = v.source;
        a.setViewMode(v, v.source ? "rendered" : "source");
        if (v.source === was) return; // refused (a file with no render): its own message says why
        a.message("info", v.source ? "source — the note's markdown" : "rendered");
      }),
    "view.live": (a) =>
      withView(a, (v) => {
        const was = v.live;
        a.setViewMode(v, v.live ? "rendered" : "live");
        if (v.live === was) return;
        a.message("info", v.live ? "the lens: the markdown around the cursor — esc closes it" : "rendered");
      }),
    // The lens's size by hand: a block more or less, kept as it moves; `=` lets it size itself.
    "lens.grow": (a) => lensStep(a, 1),
    "lens.shrink": (a) => lensStep(a, -1),
    "lens.reset": (a) =>
      withView(a, (v) => {
        if (!v.live) return a.message("info", "the lens isn't open — space n l opens it");
        Object.assign(v, { lensSize: undefined, liveBase: undefined, layoutKey: "" });
      }),
    // New notes and folders: beside the current note, or in the explorer's selected folder.
    "note.create": (a, arg) => {
      if (!arg) return a.promptNewNote();
      const r = a.createNote(arg, a.newItemBase());
      if (r) a.open(r.rel);
    },
    "folder.create": (a, arg) => (arg ? void a.createFolder(arg, a.newItemBase()) : a.promptNewFolder()),
    "tab.close_others": (a) => a.closeOtherTabs(),
    "tab.close_all": (a) => a.closeAllTabs(),
    // Editing (source mode; step 3). Entering insert from the render switches to source first.
    "edit.insert": (a) => withView(a, (v) => E.startInsert(a, v, (w) => E.offsetOf(a, w))),
    "edit.append": (a) =>
      withView(a, (v) =>
        E.startInsert(a, v, (w) => {
          const at = E.offsetOf(a, w);
          return Math.min(E.nextBoundary(w.buf.source, at), E.lineEnd(w, at));
        }),
      ),
    "edit.insert_line_start": (a) =>
      withView(a, (v) =>
        E.startInsert(a, v, (w) => {
          const src = E.lineOf(w, E.offsetOf(a, w));
          return (w.buf.lineStarts()[src - 1] ?? 0) + /^\s*/.exec(E.lineText(w, src))![0].length;
        }),
      ),
    "edit.append_line_end": (a) => withView(a, (v) => E.startInsert(a, v, (w) => E.lineEnd(w, E.offsetOf(a, w)))),
    "edit.open_below": (a) =>
      withView(a, (v) => {
        E.startInsert(a, v, (w) => E.lineEnd(w, E.offsetOf(a, w)));
        if (v.insert) E.newline(a, v);
      }),
    "edit.open_above": (a) =>
      withView(a, (v) => {
        E.startInsert(a, v, (w) => w.buf.lineStarts()[E.lineOf(w, E.offsetOf(a, w)) - 1] ?? 0);
        if (!v.insert) return;
        const at = E.offsetOf(a, v);
        const indent = /^\s*/.exec(E.lineText(v, E.lineOf(v, at)))![0];
        v.buf.edit(at, 0, indent + v.buf.eol);
        E.placeAt(a, v, at + indent.length, true);
      }),
    // x on an empty line has nothing to take: nothing happens (vim beeps), the register kept.
    "edit.delete_char": (a) =>
      sourceEdit(a, (v) => {
        const r = charsRange(a, v, V.takeCount(a));
        if (r) V.apply(a, v, "d", r);
      }),
    // Operators wait for a motion or a text object (vim.ts reads what follows).
    "edit.op_delete": (a) => sourceEdit(a, () => V.startOperator(a, "d")),
    "edit.op_change": (a) => sourceEdit(a, () => V.startOperator(a, "c")),
    "edit.op_yank": (a) => sourceEdit(a, () => V.startOperator(a, "y"), false),
    "edit.op_indent": (a) => sourceEdit(a, () => V.startOperator(a, ">")),
    "edit.op_outdent": (a) => sourceEdit(a, () => V.startOperator(a, "<")),
    "edit.delete_to_end": (a) =>
      sourceEdit(a, (v) => {
        const r = toLineEnd(a, v, V.takeCount(a));
        if (r) V.apply(a, v, "d", r);
      }),
    "edit.change_to_end": (a) =>
      sourceEdit(a, (v) => {
        const r = toLineEnd(a, v, V.takeCount(a));
        if (r) V.apply(a, v, "c", r);
      }),
    "edit.substitute": (a) => sourceEdit(a, (v) => V.apply(a, v, "c", charsRange(a, v, V.takeCount(a)) ?? { ...noRange, from: E.offsetOf(a, v), to: E.offsetOf(a, v) })),
    "edit.substitute_line": (a) =>
      sourceEdit(a, (v) => {
        const first = E.lineOf(v, E.offsetOf(a, v));
        V.apply(a, v, "c", V.linesRange(v, first, first + V.takeCount(a) - 1));
      }),
    "edit.replace_char": (a) =>
      sourceEdit(a, (v) => {
        const n = V.takeCount(a);
        a.vim.awaitChar = (ch) => {
          const r = charsRange(a, v, n);
          if (!r || graphemes(v.buf.source.slice(r.from, r.to)).length < n) return; // by character, as l steps
          v.buf.edit(r.from, r.to - r.from, ch.repeat(n), r.from);
          E.placeAt(a, v, r.from + ch.length * (n - 1));
        };
      }),
    "edit.join": (a) => sourceEdit(a, (v) => joinLines(a, v, Math.max(2, V.takeCount(a)))),
    "edit.paste_after": (a) => sourceEdit(a, (v) => V.put(a, v, true)),
    "edit.paste_before": (a) => sourceEdit(a, (v) => V.put(a, v, false)),
    "edit.toggle_case": (a) =>
      sourceEdit(a, (v) => {
        const r = charsRange(a, v, V.takeCount(a));
        if (!r) return;
        const t = v.buf.source.slice(r.from, r.to);
        // Each letter on its own; one whose other case has another length (ß → SS, İ → i̇) stays.
        const flipped = [...t]
          .map((c) => {
            const f = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
            return f.length === c.length ? f : c;
          })
          .join("");
        if (flipped !== t) v.buf.edit(r.from, t.length, flipped, r.from);
        E.placeAt(a, v, Math.min(r.to, Math.max(r.from, E.lineEnd(v, r.from) - 1)));
      }),
    "edit.repeat": (a) => sourceEdit(a, () => V.repeat(a)),
    // Visual mode's operators, on the selection (source mode).
    "visual.delete": (a) => visualOp(a, "d"),
    "visual.change": (a) => visualOp(a, "c"),
    "visual.indent": (a) => visualOp(a, ">"),
    "visual.outdent": (a) => visualOp(a, "<"),
    "find.substitute": (a, arg) =>
      withView(a, (v) => {
        if (!arg) return a.message("info", "type it on the command line: :s/old/new/ or :%s/old/new/g");
        R.substitute(a, v, arg);
      }),
    "edit.undo": (a) => withView(a, (v) => undoRedo(a, v, "undo")),
    "edit.redo": (a) => withView(a, (v) => undoRedo(a, v, "redo")),
    "note.save": (a) =>
      withView(a, (v) => {
        if (!v.buf.dirty && !v.buf.changedOnDisk()) return a.message("info", `${a.displayName(v.buf)} has no changes to save`);
        if (a.saveBuffer(v.buf)) a.message("info", `saved ${a.displayName(v.buf)}`);
      }),
    "note.save_force": (a) =>
      withView(a, (v) => {
        if (a.writeBuffer(v.buf, v.buf.contentToSave(), true)) a.message("info", `saved ${a.displayName(v.buf)} over the file on disk`);
      }),
    "note.revert": (a) =>
      withView(a, (v) => {
        for (const w of a.allViews()) if (w.buf === v.buf) w.insert = false;
        if (!v.buf.load()) return a.message("warn", `${v.buf.key} is gone from disk`);
        for (const w of a.allViews()) if (w.buf === v.buf) w.layoutKey = "";
        a.message("info", `${a.displayName(v.buf)} reloaded from disk — u brings your changes back`);
      }),
    "note.resolve": (a) =>
      withView(a, (v) => {
        if (!v.buf.dirty || !v.buf.changedOnDisk()) return a.message("info", `${a.displayName(v.buf)} has no conflict with the file on disk`);
        a.conflictPrompt(v.buf);
      }),
    "note.save_all": (a) => {
      for (const v of a.allViews()) if (v.insert) E.stopInsert(a, v);
      // The properties editor's changes too: written into their note (which it saves), the editor kept open.
      const f = a.floating?.kind === "properties" && a.floating.view.buf.dirty ? a.floating : null;
      const dirty = [...(f ? [f.view.buf] : []), ...a.dirtyBuffers().filter((b) => b !== f?.note)];
      if (!dirty.length) return a.message("info", "nothing to save");
      const saved = dirty.filter((b) => a.saveBuffer(b, true)).length;
      if (saved === dirty.length) a.message("info", `saved ${saved} note${saved === 1 ? "" : "s"}`);
      else a.message("warn", `saved ${saved} of ${dirty.length} — the others say why above`);
    },
    "app.save_quit": (a) => {
      for (const v of a.allViews()) if (v.insert) E.stopInsert(a, v);
      for (const b of a.dirtyBuffers()) if (!a.saveBuffer(b)) return;
      a.requestQuit();
    },
    "app.quit_force": (a) => a.requestQuit(true),
    "note.send": (a) => withView(a, (v) => a.sendToEditor(v)),
    "note.send_pick": (a) => withView(a, (v) => a.sendToEditor(v, true)),
    "find.word_next": (a) => findWord(a, 1),
    "find.word_prev": (a) => findWord(a, -1),
    "find.clear": (a) =>
      withView(a, (v) => {
        v.find = null;
      }),
    "switcher.open": (a) => {
      // Recent first — the previous one at the top, so ctrl+p enter goes back — then the rest.
      const current = a.view?.buf.key;
      const rank = new Map(a.recentNotes.filter((k) => k !== current).map((k, i) => [k, i]));
      const notes = [...a.graph.notes.values()];
      // The files the explorer shows (files.show, its toggle, the patterns) come too (16.5).
      const files = a.shownFiles();
      const items: ListItem[] = [
        ...notes.map((n) => ({
          label: n.rel,
          detail: n.title !== n.rel.replace(/\.(md|markdown)$/i, "").split("/").pop() ? n.title : undefined,
          data: n.rel,
        })),
        ...files.map((f) => ({ label: f.path, hint: f.group === "data" ? "data" : "file", data: f.path })),
      ];
      // Notes and files together: a recent file comes before notes not opened lately.
      const ordered = items.map((x, i) => ({ x, i, r: rank.get(x.data as string) ?? Number.POSITIVE_INFINITY })).sort((p, q) => p.r - q.r || p.i - q.i).map((e) => e.x);
      a.openList({
        title: files.length ? `Open (${notes.length} notes, ${files.length} files)` : `Open note (${notes.length})`,
        items: ordered,
        source: (input) => (input.startsWith("#") ? symbols.list(input.slice(1)) : null),
        accept: (item) => {
          const at = item.data as string | Spot;
          if (typeof at === "string") a.open(at);
          else if (at.rel !== null) a.openAt(at.rel, at.line);
          else a.openLocation(at.abs, at.line - 1, at.character);
        },
      });
      const symbols = workspaceSymbols(a, a.overlay);
    },
    "outline.pick": (a) =>
      withView(a, (v) => {
        const layout = lay(a, v);
        if (!layout.headings.length) return a.message("info", "no headings in this note");
        const current = [...layout.headings].reverse().findIndex((h) => h.line <= v.cur.row);
        a.openList({
          title: `Headings — ${v.buf.name}`,
          items: layout.headings.map((h) => ({ label: h.text.replace(/\s+/g, " "), indent: h.level - 1, hint: `${h.src}`, data: h.line })),
          accept: (item) => {
            a.pushHistory(v);
            a.moveCursor(v, { row: item.data as number, col: 0 });
          },
          selected: current < 0 ? 0 : layout.headings.length - 1 - current,
        });
      }),
    "palette.open": (a) => openPalette(a),
    "note.open": (a, arg) => {
      if (!arg) return void a.run("switcher.open");
      // A pointer (21.10): the file it names, in its folder's copy here.
      if (isPointer(arg)) {
        const r = a.graph.resolveLink({ kind: "markdown", target: arg }, a.view?.buf.rel ?? "");
        if ((r.resolvedKind === "note" || r.resolvedKind === "file") && r.path) return a.open(r.path);
        return a.message("warn", `${arg}: ${r.reason ?? (r.resolvedKind === "ambiguous" ? `matches ${r.candidates.join(", ")}` : "not found")}`);
      }
      const r = a.graph.findNote(arg, a.loc.root);
      if (r.status === "resolved") return a.open(r.path);
      if (r.status === "ambiguous") return a.message("warn", `"${arg}" matches ${r.candidates.join(", ")}`);
      // Any other file of the vault, by its path with its extension (16.4), as :e opens it in vim.
      const rel = arg.replace(/^\.?\//, "");
      if (a.graph.filePaths().includes(rel)) return fileLink(a, rel);
      // There on disk, but the vault hasn't heard of it yet (written a moment ago, the watcher not yet
      // told): the vault told now, as the watcher would, and it opened as its own.
      const abs = join(a.loc.root, rel);
      if (rel && isInside(a.loc.root, abs) && isFile(abs) && walked(a, rel)) {
        const isNote = classify(rel, a.config.walk.extensions).group === "note";
        a.applyChanges({ changes: [{ rel, kind: "created", isNote }], rescan: false });
        return fileLink(a, rel);
      }
      // Git-ignored, or in a hidden folder: reached by opening it (20.8), it's the vault's from now on.
      if (rel && isInside(a.loc.root, abs) && a.graph.reachFile(rel, { keep: true })) return a.graph.notes.has(rel) ? a.open(rel) : fileLink(a, rel);
      a.message("warn", `no note or file "${arg}"`);
    },
    // ui
    "ui.list": (a) => {
      const onOff = (b: boolean) => (b ? "on" : "off");
      const items: ListItem[] = [
        { label: "Theme", hint: a.ui.theme, data: "theme.pick" },
        { label: "Glyphs", hint: a.ui.glyphs, data: "glyphs.pick" },
        ...UI_TOGGLES.map((t) => ({ label: t.title, hint: onOff(a.ui[t.key] as boolean), data: t.id })),
      ];
      a.openList({ title: "UI settings — enter changes one", items, accept: (item) => void a.run(item.data as string).then(() => a.host.requestRender()) });
    },
    "theme.pick": (a) => {
      if (process.env.NO_COLOR) a.message("info", "NO_COLOR is set: the theme you pick applies once it's unset");
      pickTheme(a);
    },
    "theme.set": (a, arg) => {
      if (!arg) return pickTheme(a);
      const t = loadTheme(arg);
      if (t.warning) return a.message("warn", t.warning);
      a.setUi("theme", arg);
      if (process.env.NO_COLOR) a.message("info", `NO_COLOR is set: theme ${arg} applies once it's unset`);
    },
    "glyphs.pick": (a) => pickGlyphs(a),
    "glyphs.set": (a, arg) => {
      if (!arg || !["nerd", "unicode", "ascii", "auto"].includes(arg)) return a.message("warn", "glyphs: nerd, unicode, ascii or auto");
      a.setUi("glyphs", arg);
    },
    // scratch
    "scratch.open": (a) => {
      const loc = a.scratch();
      if (!readScratch(loc).trim()) return a.message("info", `the scratch is empty · ${prettyKey(`${a.leader} s a`, a.leader)} adds to it`);
      a.open(loc.path);
    },
    "scratch.add": (a) =>
      withView(a, (v) => {
        const layout = lay(a, v);
        if (v.sel) {
          const [p, q] = C.ordered(v.sel.anchor, v.cur);
          const r1 = layout.lines[p.row]?.src ?? 1;
          const r2 = layout.lines[q.row]?.src ?? r1;
          a.capture(formatEntry({ ref: { path: v.buf.abs, startLine: r1, endLine: r2 }, snippetText: a.selectionText(v), lang: "" }, a.loc.root));
          Object.assign(v, { visual: null, sel: null });
          return;
        }
        const line = layout.lines[v.cur.row]?.src ?? 1;
        a.capture(formatEntry({ ref: { path: v.buf.abs, startLine: line, endLine: line } }, a.loc.root));
      }),
    "context.copy": (a) => a.copyContext(),
    "scratch.copy": (a) => {
      const text = readScratch(a.scratch());
      if (!text.trim()) return a.message("info", "the scratch is empty");
      a.copy(text);
    },
    "scratch.clear": (a) => {
      a.confirm("Clear the scratch?", () => {
        clearScratch(a.scratch());
        a.message("info", "scratch cleared");
        const buf = a.buffers.get(a.scratch().path);
        if (buf) a.reloadBuffer(buf);
      });
    },
    // note, vault, app
    "note.reload": (a) => withView(a, (v) => a.reloadBuffer(v.buf)),
    // The Info view (3.19), the right panel's first: what the file on screen is; its button above the outline's.
    "note.info": (a) => a.openRightView("info", "cycle"),
    "info.toggle": (a) => a.openRightView("info"),
    "note.properties": (a) => a.openPropertiesEditor(),
    "vault.reindex": (a) => {
      a.graph.build(true, "lazy");
      a.indexInBackground();
      a.invalidateTree();
      for (const b of a.buffers.values()) b.invalidateLayouts();
      a.relayoutAll();
      a.message("info", `reindexed ${a.graph.notes.size} notes in ${a.graph.stats.ms.toFixed(0)} ms`);
    },
    "note.delete": (a) => {
      const t = a.noteTarget();
      if (t) a.deleteItem(t);
    },
    "note.move": (a) => {
      const t = a.noteTarget();
      if (t) a.moveItem(t);
    },
    "note.yank": (a) => {
      const t = a.noteTarget();
      if (t) a.clipItem("copy", t);
    },
    "note.cut": (a) => {
      const t = a.noteTarget();
      if (t) a.clipItem("cut", t);
    },
    "folder.rename": (a) => {
      const f = a.folderTarget();
      if (f) a.renameItem(f);
    },
    "folder.move": (a) => {
      const f = a.folderTarget();
      if (f) a.moveItem(f);
    },
    "folder.delete": (a) => {
      const f = a.folderTarget();
      if (f) a.deleteItem(f);
    },
    "folder.yank": (a) => {
      const f = a.folderTarget();
      if (f) a.clipItem("copy", f);
    },
    "folder.cut": (a) => {
      const f = a.folderTarget();
      if (f) a.clipItem("cut", f);
    },
    "folder.paste": (a) => a.pasteItem(),
    "trash.restore": (a) => a.restoreLast(),
    "rename.undo": (a) => a.undoRename(),
    "vault.unmake": (a) => a.unmakeVaultHere(),
    "note.copy": (a) =>
      withView(a, (v) => {
        if (!v.buf.rel) return a.message("warn", "only a note or file of this root can be copied here");
        try {
          const r = copyPath(a.graph, v.buf.rel);
          a.open(r.to);
          a.message("info", `copied ${r.from} → ${r.to}`);
        } catch (err) {
          a.message("warn", (err as Error).message);
        }
      }),
    "trash.open": (a) => a.openTrash(),
    "tag.list": (a, arg) => (arg ? a.openTagNotes(arg) : a.openTagList()),
    // The left panel's Problems view (1.7): open, focus, close — made afresh when it opens.
    "problems.open": (a) => {
      a.graph.forgetProblems();
      a.lintVault();
      a.openLeftView("problems", "cycle");
    },
    "vault.init": (a) => {
      // In a root: the explorer's selected folder (or this note's) a root of its own (18.11).
      if (a.loc.mode === "vault") return a.makeVaultHere();
      const dir = a.loc.root;
      if (isNeverRoot(dir)) return a.message("warn", `${dir} can't have a .slipbox/: slipbox never indexes all of it`);
      a.vaultChoices(dir);
    },
    "note.rename": (a, arg) => {
      const t = a.noteTarget();
      if (!t) return;
      if (arg) return a.previewRename(() => planNoteRename(a.graph, t.rel, arg));
      a.promptRename(t.rel);
    },
    // What's under the cursor (19.12, 19.13): a code file's language server answers; in a note, slipbox does.
    "lsp.hover": (a) =>
      withView(a, async (v) => {
        if (v.buf.rel && a.graph.notes.has(v.buf.rel)) {
          const link = a.linkUnderCursor(v) >= 0 ? a.currentLayout(v).links[a.linkUnderCursor(v)] : undefined;
          if (!link) return a.message("info", "nothing to show here: on a link, where it lands");
          const r = a.graph.resolveLink({ kind: link.kind === "embed" ? "embed" : link.kind === "wiki" ? "wiki" : "markdown", target: link.target }, link.from ?? v.buf.rel);
          if (r.resolvedKind !== "note" && r.resolvedKind !== "anchor") return a.message("info", `${link.target}: ${r.resolvedKind === "ambiguous" ? `matches ${r.candidates.join(", ")}` : r.resolvedKind === "external" ? link.target : r.reason ?? "no such note yet"}`);
          const path = r.resolvedKind === "anchor" ? v.buf.rel : r.path!;
          // A path's `#fragment`: a heading (by its slug or text), or a block's `^id` (20.2).
          let frag = link.heading;
          if (!frag && link.target.includes("#")) {
            frag = link.target.slice(link.target.indexOf("#") + 1);
            try {
              frag = decodeURIComponent(frag);
            } catch {}
          }
          const block = frag?.startsWith("^") ? frag.slice(1) : null;
          const wiki = link.kind === "wiki" || link.kind === "embed";
          const text = landingText(a.graph, path, block ? null : frag, block, undefined, wiki);
          const entry = frag && !block ? a.graph.entryAnywhere(path) : undefined;
          const hit = entry && frag ? findHeading(entry.headings, entry.anchors ?? [], frag, wiki) : null;
          const heading = block ? null : (hit?.heading != null ? entry!.headings[hit.heading]!.text : null) || frag;
          // Titled by its path as shown (21.9): from this root, else `~/…`, else absolute.
          const shown = isAbsolute(path) ? a.graph.shownPath(path) : path;
          return a.openHover(text ?? "(nothing there)", `${shown}${block ? ` ^${block}` : heading ? ` › ${heading}` : ""}`);
        }
        a.syncServers(v.buf);
        const s = a.servers;
        if (!s?.isOpen(v.buf.abs)) return a.message("info", "no language server for this file (slipbox doctor says which it would have)");
        const answer = await s.request<Hover>(v.buf.abs, "textDocument/hover", { textDocument: { uri: pathToFileURL(v.buf.abs).href }, position: a.lspPosition(v) }, "hoverProvider", "hover");
        const text = answer ? hoverText(answer.result) : "";
        if (!text.trim()) return a.message("info", "the language server has nothing to say here");
        a.openHover(text, `${answer!.server}`);
      }),
    "lsp.definition": (a) =>
      withView(a, async (v) => {
        if (v.buf.rel && a.graph.notes.has(v.buf.rel)) return void a.run("link.follow");
        await goTo(a, v, "textDocument/definition", "definitionProvider", "goto-definition", ["definition", "definitions"]);
      }),
    // Where the type of what's under the cursor is defined, and what implements it (19.13).
    "lsp.type_definition": (a) => withView(a, (v) => goTo(a, v, "textDocument/typeDefinition", "typeDefinitionProvider", "goto-type-definition", ["type definition", "type definitions"])),
    "lsp.implementation": (a) => withView(a, (v) => goTo(a, v, "textDocument/implementation", "implementationProvider", "goto-implementation", ["implementation", "implementations"])),
    "lsp.references": (a) =>
      withView(a, async (v) => {
        if (v.buf.rel && a.graph.notes.has(v.buf.rel)) return void a.run("backlinks.open");
        a.syncServers(v.buf);
        const s = a.servers;
        if (!s?.isOpen(v.buf.abs)) return a.message("info", "no language server for this file (slipbox doctor says which it would have)");
        // Every server that finds references has its say, together.
        const answers = await s.requestAll<Location[]>(v.buf.abs, "textDocument/references", { textDocument: { uri: pathToFileURL(v.buf.abs).href }, position: a.lspPosition(v), context: { includeDeclaration: false } }, "referencesProvider", "goto-reference");
        const seen = new Set<string>();
        const locs = answers.flatMap((x) => locations(x.result)).filter((l) => {
          const key = `${l.path}:${l.line}:${l.character}`;
          return !seen.has(key) && !!seen.add(key);
        });
        if (!locs.length) return a.message("info", "no references found");
        pickLocation(a, `${locs.length} reference${locs.length === 1 ? "" : "s"}`, locs);
      }),
    // What a code file's language server changes (19.15): a rename, its fixes, its formatting.
    "lsp.rename": (a, arg) =>
      withView(a, async (v) => {
        if (v.buf.rel && a.graph.notes.has(v.buf.rel)) return void a.run(arg ? `heading.rename ${arg}` : "heading.rename");
        a.syncServers(v.buf);
        const s = a.servers;
        if (!s?.isOpen(v.buf.abs)) return a.message("info", "no language server for this file (slipbox doctor says which it would have)");
        const where = { textDocument: { uri: pathToFileURL(v.buf.abs).href }, position: a.lspPosition(v) };
        const prep = await s.request<Range | { range: Range; placeholder: string } | { defaultBehavior: boolean }>(v.buf.abs, "textDocument/prepareRename", where, "renameProvider", "rename-symbol");
        const range = prep && "start" in prep.result ? prep.result : prep && "range" in prep.result ? prep.result.range : null;
        const word = range ? textIn(v.buf.source, v.buf.lineStarts(), range) : "";
        const name = prep && "placeholder" in prep.result ? prep.result.placeholder : word;
        const go = async (to: string) => {
          const r = await s.request<WorkspaceEdit>(v.buf.abs, "textDocument/rename", { ...where, newName: to }, "renameProvider", "rename-symbol");
          if (!r) return a.message("warn", "the language server can't rename this");
          a.previewWorkspaceEdit(`rename ${name || "it"} → ${to}`, r.result);
          a.host.requestRender();
        };
        if (arg) return go(arg);
        a.prompt(`rename ${name || "this"} to: `, (to) => void (to.trim() && go(to.trim())));
        (a.overlay as PromptOverlay).text = name;
      }),
    "lsp.code_action": (a) =>
      withView(a, async (v) => {
        a.syncServers(v.buf);
        const s = a.servers;
        // In a note, slipbox's own fixes for the cursor's line too (a fragile link named for sure).
        const line = a.lspPosition(v).line + 1;
        const own = v.buf.kind.group === "note" && v.buf.rel !== null ? noteProblems(a.graph, v.buf.rel).filter((p) => p.fix && p.start.line <= line && line <= p.end.line) : [];
        const fix = (p: Problem) => {
          const starts = v.buf.lineStarts();
          const at = starts[p.start.line - 1]! + p.start.column - 1;
          const to = starts[p.end.line - 1]! + p.end.column - 1;
          a.applyNoteEdits([{ at, length: to - at, text: p.fix!.text }], p.fix!.title);
        };
        if (!s?.isOpen(v.buf.abs)) {
          if (!own.length) return a.message("info", "code actions are a language server's: none for this file (slipbox doctor)");
          return a.openList({ title: "Code actions", items: own.map((p) => ({ label: p.fix!.title, hint: "slipbox", data: p })), accept: (item) => fix(item.data as Problem) });
        }
        const position = a.lspPosition(v);
        const range = { start: position, end: position };
        // The problems on this line, as each server gave them: its fixes for them.
        const diagnostics = [...v.buf.serverProblems.values()].filter((p) => p.version === v.buf.version).flatMap((p) => p.raw).filter((d) => d.range.start.line <= position.line && position.line <= d.range.end.line);
        const answers = await s.requestAll<(CodeAction | LspCommand)[]>(v.buf.abs, "textDocument/codeAction", { textDocument: { uri: pathToFileURL(v.buf.abs).href }, range, context: { diagnostics } }, "codeActionProvider", "code-action");
        const actions = answers.flatMap((x) => x.result.map((action) => ({ action, server: x.server }))).filter(({ action }) => !("disabled" in action && action.disabled));
        if (!actions.length && !own.length) return a.message("info", "no code actions here");
        actions.sort((x, y) => Number("isPreferred" in y.action && !!y.action.isPreferred) - Number("isPreferred" in x.action && !!x.action.isPreferred));
        a.openList({
          title: "Code actions",
          items: [...own.map((p) => ({ label: p.fix!.title, hint: "slipbox", data: { own: p } })), ...actions.map((x) => ({ label: x.action.title, hint: x.server, data: x }))],
          accept: (item) => {
            const d = item.data as { own?: Problem } & { action: CodeAction | LspCommand; server: string };
            if (d.own) return fix(d.own);
            void runAction(a, v.buf.abs, d);
          },
        });
      }),
    "lsp.format": (a) =>
      withView(a, async (v) => {
        a.syncServers(v.buf);
        const s = a.servers;
        if (!s?.isOpen(v.buf.abs)) return a.message("info", "formatting is a language server's: none for this file (slipbox doctor)");
        const options = { tabSize: 2, insertSpaces: !v.buf.source.includes("\n\t") };
        const r = await s.request<TextEdit[]>(v.buf.abs, "textDocument/formatting", { textDocument: { uri: pathToFileURL(v.buf.abs).href }, options }, "documentFormattingProvider", "format");
        if (!r) return a.message("info", "the language server doesn't format this");
        if (!r.result.length) return a.message("info", `formatted already (${r.server})`);
        a.applyWorkspaceEdit({ changes: { [pathToFileURL(v.buf.abs).href]: r.result } });
        a.message("info", `formatted by ${r.server}`);
      }),
    "heading.rename": (a, arg) =>
      withView(a, (v) => {
        const rel = v.buf.rel;
        if (!rel || !a.graph.notes.has(rel)) return a.message("warn", "only a note of this root has its headings renamed with their links");
        // The section the cursor is in: the last heading at or above its line.
        const line = a.cursorLine(v);
        const h = [...(a.graph.entry(rel)?.headings ?? [])].reverse().find((x) => x.line <= line);
        if (!h) return a.message("warn", "no heading here: the cursor is above the first");
        if (arg) return a.previewRename(() => planHeadingRename(a.graph, rel, h.text, arg));
        a.promptHeadingRename(rel, h.text);
      }),
    "folders.open": (a) => a.openFolders(),
    "folders.default": (a) => a.chooseDefaultCopy(),
    "folder.name": (a, arg) => {
      // The explorer's selected root (one nested here), when it has focus.
      const item = a.explorerFocused() ? a.explorerItem() : null;
      if (item?.vault && !arg) return a.renameVaultItem(item);
      if (a.loc.mode === "folder") return a.message("warn", `${a.loc.root} has no root to name: :init makes one`);
      const go = (name: string) => {
        const ident = folderIdentity(a.loc.root);
        const taken = readFolders().find((f) => f.key !== ident?.key && f.name.toLowerCase() === name.toLowerCase());
        if (taken) return a.message("warn", `a different folder is called ${name}, at ${tildePath(taken.default ?? taken.copies[0]?.path ?? "")}: pick another`);
        // A .slipbox/ folder's: renamed, its old name kept (previewed); a repository's: a .slipbox/ to hold one.
        if (hasMarker(a.loc.root)) return a.previewRename(() => planVaultRename(a.loc, name));
        try {
          initVault(a.loc.root, name);
        } catch (err) {
          return a.message("warn", (err as Error).message);
        }
        recordFolder(a.loc.root);
        // Its name from now on: the status line, the Info, what pointers are written with (21.9).
        a.loc = rootAt(a.loc.root);
        a.message("info", `${tildePath(a.loc.root)} is named ${name} (.slipbox/ made to hold it)`);
      };
      if (arg) return go(arg.trim());
      a.prompt(`name ${tildePath(a.loc.root)}, as pointers name it: `, (t) => t.trim() && go(t.trim()));
    },
    "link.convert": (a, arg) => {
      // A note named: its links; else every note's.
      if (!arg) return a.previewConvert();
      const r = a.graph.findNote(arg, a.loc.root);
      if (r.status !== "resolved") return a.message("warn", r.status === "ambiguous" ? `"${arg}" matches ${r.candidates.join(", ")}` : `no note "${arg}"`);
      a.previewConvert([r.path]);
    },
    "link.relink": (a) =>
      withView(a, (v) => {
        if (!v.buf.rel) return a.message("warn", "only this root's notes are relinked");
        const rel = v.buf.rel;
        a.previewRename(() => planRelink(a.graph, [rel]));
      }),
    "vault.pin_root": (a) => a.togglePinnedRoot(),
    "vault.info": (a) => {
      const g = a.graph;
      // Its name and copies, as pointers find it (21.6).
      const ident = a.loc.mode === "vault" ? folderIdentity(a.loc.root) : null;
      const named = ident ? readFolders().find((f) => f.key === ident.key) : undefined;
      infoList(a, "Root", [
        ["root", a.loc.root],
        ["mode", a.loc.mode],
        ["name", ident ? `${rootLabel(a.loc)}${a.loc.aliases.length ? ` (also ${a.loc.aliases.join(", ")})` : ""}` : `none — ${a.loc.mode === "folder" ? "no root" : "no remote and no .slipbox/ name"}: linked to by relative path`],
        ["notes", String(g.notes.size)],
        ["indexing", a.indexing ? `${a.indexing} left` : "done"],
        // How fresh, and what else is covered (20.10).
        ["index", `${g.indexedAt() ? `written ${g.indexedAt()!.toISOString().slice(0, 16).replace("T", " ")}` : "not written yet"}${g.reached.size ? `, ${g.reached.size} reached outside the walk` : ""}`],
        ["home", describeBackground(backgroundStatus(a.config))],
        ["watcher", a.watcher ? (a.watcher.degraded ? `degraded: ${a.watcher.degraded}` : `${a.watcher.watchedCount} directories${a.watcher.polledDirs.length ? `, ${a.watcher.polledDirs.length} polled` : ""}`) : "off"],
        ["cache", cacheDir(a.loc)],
        ["state", stateDir(a.loc)],
        ["scratch", a.scratch().path],
        ...g.skipped.map((s) => ["skipped", `${s.rel} — ${s.reason}`] as [string, string]),
        ...(named?.copies ?? []).filter((c) => c.path !== ident?.copy).map((c) => ["copy", `${tildePath(c.path)}${copyAvailable(c.path) ? "" : " (not here)"}`] as [string, string]),
      ]);
    },
    "config.reload": (a) => a.reloadConfig("manual"),
    "messages.open": (a) => {
      if (!a.messages.length) return a.message("info", "no messages");
      a.openList({
        title: "Messages",
        items: [...a.messages].reverse().map((m) => ({ label: m.text, hint: `${m.level} ${new Date(m.at).toTimeString().slice(0, 8)}`, data: m.text })),
        accept: (item) => void a.copy(item.data as string),
      });
    },
    "help.open": (a) => openHelp(a),
    "app.quit": (a) => a.requestQuit(),
  };
  for (const t of UI_TOGGLES) impl[t.id] = (a) => toggle(a, t.key, t.title);

  for (const spec of COMMAND_SPECS) {
    const run = impl[spec.id];
    if (!run) throw new Error(`command ${spec.id} is specified but not implemented`);
    app.registry.register({ id: spec.id, title: spec.title, description: spec.desc, run, hidden: spec.id === "app.escape" });
  }
  for (const id of Object.keys(impl)) if (!app.registry.get(id)) throw new Error(`command ${id} has no spec in core/command-specs.ts`);
}

function isFile(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

/** Whether the vault's walk takes a path: it and each folder above it (a hidden folder, node_modules, an ignored one aren't). */
function walked(a: App, rel: string): boolean {
  const parts = rel.split("/");
  return parts.every((_, i) => a.graph.filter.exclusion(parts.slice(0, i + 1).join("/"), i < parts.length - 1) === null);
}

/** A hover's contents as markdown: markup, a marked string, or several. */
function hoverText(h: Hover): string {
  const one = (c: MarkupContent | MarkedString): string => (typeof c === "string" ? c : "kind" in c ? c.value : `\`\`\`${c.language}\n${c.value}\n\`\`\``);
  return Array.isArray(h.contents) ? h.contents.map(one).join("\n\n") : one(h.contents);
}

/** Locations a server gives, as files and positions (a `LocationLink`'s target). */
/**
 * A jump the file's language server answers (19.13): one place, gone to; several, a list to pick
 * from. `what`: the answer's name, one and many.
 */
async function goTo(a: App, v: View, method: string, capability: string, feature: Feature, what: [string, string]): Promise<void> {
  a.syncServers(v.buf);
  const s = a.servers;
  if (!s?.isOpen(v.buf.abs)) return a.message("info", "no language server for this file (slipbox doctor says which it would have)");
  if (!(await s.offers(v.buf.abs, feature, capability))) return a.message("info", `the language server doesn't find ${what[1]}`);
  const answer = await s.request<Location | Location[] | LocationLink[]>(v.buf.abs, method, { textDocument: { uri: pathToFileURL(v.buf.abs).href }, position: a.lspPosition(v) }, capability, feature);
  const locs = answer ? locations(answer.result) : [];
  if (!locs.length) return a.message("info", `no ${what[0]} found here`);
  if (locs.length === 1) return a.openLocation(locs[0]!.path, locs[0]!.line, locs[0]!.character);
  pickLocation(a, `${locs.length} ${what[1]}`, locs);
}

function locations(r: Location | Location[] | LocationLink[] | null): { path: string; line: number; character: number }[] {
  const list = r === null ? [] : Array.isArray(r) ? r : [r];
  return list.flatMap((l) => {
    const uri = "targetUri" in l ? l.targetUri : l.uri;
    const range = "targetSelectionRange" in l ? l.targetSelectionRange : l.range;
    return uri.startsWith("file:") ? [{ path: fileURLToPath(uri), line: range.start.line, character: range.start.character }] : [];
  });
}

/** Several locations: a list to pick from, each its file and line, its text there. */
function pickLocation(a: App, title: string, locs: { path: string; line: number; character: number }[]): void {
  const shown = (p: string) => (p.startsWith(`${a.loc.root}/`) ? p.slice(a.loc.root.length + 1) : p);
  a.openList({
    title,
    items: locs.map((l) => ({ label: `${shown(l.path)}:${l.line + 1}`, detail: lineOf(l.path, l.line), data: l })),
    accept: (item) => {
      const l = item.data as { path: string; line: number; character: number };
      a.openLocation(l.path, l.line, l.character);
    },
  });
}

/** A file's line, trimmed (for a list of locations); empty when it can't be read. */
function lineOf(path: string, line: number): string {
  try {
    return (readFileSync(path, "utf8").split("\n")[line] ?? "").trim();
  } catch {
    return "";
  }
}

/** The text a range of the protocol's covers (lines and UTF-16 characters, from 0). */
function textIn(source: string, starts: number[], r: Range): string {
  const at = (p: Range["start"]) => (starts[p.line] ?? source.length) + p.character;
  return source.slice(at(r.start), at(r.end));
}

/** A code action carried out: resolved first when it came without its edit, its edit made, then its command run. */
async function runAction(a: App, path: string, chosen: { action: CodeAction | LspCommand; server: string }): Promise<void> {
  const s = a.servers!;
  let action = chosen.action;
  if (!("command" in action && typeof action.command === "string")) {
    const ca = action as CodeAction;
    if (!ca.edit && !ca.command) action = (await s.requestOf<CodeAction>(path, chosen.server, "codeAction/resolve", ca)) ?? ca;
  }
  const command = typeof (action as LspCommand).command === "string" ? (action as LspCommand) : (action as CodeAction).command;
  const edit = "edit" in action ? (action as CodeAction).edit : undefined;
  if (edit) a.applyWorkspaceEdit(edit);
  // The server has the text the edit made before it runs a command on it.
  const buf = a.view?.buf;
  if (buf) a.syncServers(buf);
  // Its command is the server's to run; an edit it asks for then comes back as workspace/applyEdit.
  if (command) await s.requestOf(path, chosen.server, "workspace/executeCommand", { command: command.command, arguments: command.arguments });
  a.message("info", action.title);
  a.host.requestRender();
}
