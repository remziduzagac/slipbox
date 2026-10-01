// What the LSP face answers (plan 11.3–11.6), each a question to the core about a note as the
// editor has it (11.8). Positions are the protocol's: lines and characters from 0, characters in
// UTF-16 units — the graph's are from 1 in the same units, so they convert by one.

import { isAbsolute, posix } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type CodeAction,
  CodeActionKind,
  type CompletionItem,
  CompletionItemKind,
  type CompletionList,
  type Diagnostic,
  DiagnosticSeverity,
  type DocumentSymbol,
  type Hover,
  type Location,
  type Position,
  type Range,
  SymbolKind,
  type TextEdit,
  type WorkspaceEdit,
  type WorkspaceSymbol,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Graph, LinkRef, Pos, ResolvedLink } from "../core/graph.ts";
import { blockIds, landingLine, landingText } from "../core/landing.ts";
import { diffLines } from "../core/merge.ts";
import { planHeadingRename, planNoteRename, RenameError, type RenamePlan } from "../core/rename.ts";
import { extensionOf, isKnownExtension } from "../core/filetypes.ts";
import { slugify } from "../core/parse.ts";

/** The protocol's range for a span of the graph's (lines and columns from 1, the end after its last character). */
export function rangeOf(start: Pos, end: Pos): Range {
  return { start: { line: start.line - 1, character: start.column - 1 }, end: { line: end.line - 1, character: end.column - 1 } };
}

/** A line's start, as a range: where a jump to a note or a heading lands. */
function lineRange(line: number): Range {
  return { start: { line: line - 1, character: 0 }, end: { line: line - 1, character: 0 } };
}

/** A file's URI: a vault path, or an absolute one in another root. */
export function uriOf(g: Graph, path: string): string {
  return pathToFileURL(isAbsolute(path) ? path : g.abs(path)).href;
}

/** The link under a position: the one whose span holds it (its last character included, not what follows). */
export function linkAt(g: Graph, rel: string, pos: Position): ResolvedLink | null {
  const entry = g.entry(rel);
  if (!entry) return null;
  const at = { line: pos.line + 1, column: pos.character + 1 };
  const before = (a: Pos, b: Pos) => a.line < b.line || (a.line === b.line && a.column < b.column);
  const l = entry.links.find((x) => !before(at, x) && before(at, x.end));
  return l ? { ...l, ...g.resolveLink(l, rel) } : null;
}

/** A link's `#fragment`: a wikilink's heading, or a markdown link's part after `#` (decoded). */
function fragmentOf(l: Pick<LinkRef, "kind" | "target" | "heading">): string | null {
  if (l.kind === "wiki" || l.kind === "embed") return l.heading;
  const i = l.target.indexOf("#");
  if (i < 0) return null;
  try {
    return decodeURIComponent(l.target.slice(i + 1));
  } catch {
    return l.target.slice(i + 1);
  }
}

/** Where a link goes: its note (or file), at its heading or block; each candidate when it's ambiguous. */
export function definition(g: Graph, rel: string, pos: Position): Location[] {
  const l = linkAt(g, rel, pos);
  if (!l) return [];
  const frag = fragmentOf(l);
  const land = (path: string) => ({ uri: uriOf(g, path), range: lineRange(landingLine(g, path, frag, l.block) ?? 1) });
  switch (l.resolvedKind) {
    case "note":
    case "file":
      return l.path ? [land(l.path)] : [];
    case "anchor":
      // `[[#Heading]]`, `[x](#heading)`: this note's heading.
      return [land(rel)];
    case "ambiguous":
      return l.candidates.map(land);
    default:
      // External and unresolved links go nowhere.
      return [];
  }
}

/**
 * What links here. On a link: what links to where it goes (a heading's links, when it names one);
 * on a heading: the links to that heading; anywhere else: the links to this note. The declaration —
 * the note, or the heading — first when it's asked for.
 */
export function references(g: Graph, rel: string, pos: Position, withDeclaration: boolean): Location[] {
  const l = linkAt(g, rel, pos);
  let target = rel;
  let heading: string | null = null;
  if (l) {
    if (l.resolvedKind === "note" && l.path && !isAbsolute(l.path)) target = l.path;
    else if (l.resolvedKind !== "anchor") return [];
    heading = fragmentOf(l);
  } else {
    // A heading's line: its links. The title (the first heading, at the top level) is the note's.
    const headings = g.entry(rel)?.headings ?? [];
    const h = headings.find((x) => x.line === pos.line + 1);
    heading = h && !(h === headings[0] && h.depth === 1) ? h.text : null;
  }
  const slug = heading === null ? null : slugify(heading);
  const out: Location[] = [];
  if (withDeclaration) out.push({ uri: uriOf(g, target), range: lineRange((heading && landingLine(g, target, heading, null)) || 1) });
  for (const b of g.backlinks(target)) {
    const f = fragmentOf(b);
    if (slug !== null && (f === null || slugify(f) !== slug)) continue;
    out.push({ uri: uriOf(g, b.from), range: rangeOf(b, b.end) });
  }
  // This note's own links to itself (`[[#Heading]]`, `[x](#heading)`) aren't backlinks: they count here.
  if (target === rel && slug !== null) {
    for (const own of g.entry(rel)?.links ?? []) {
      const self = g.resolveLink(own, rel).resolvedKind === "anchor";
      if (self && fragmentOf(own) !== null && slugify(fragmentOf(own)!) === slug) out.push({ uri: uriOf(g, rel), range: rangeOf(own, own.end) });
    }
  }
  return out;
}

/** A path as a hover names it: the vault's own as is, another root's with its vault. */
function shownPath(g: Graph, l: ResolvedLink): string {
  return l.vault ? `${l.vault}: ${l.path}` : l.path!;
}

/** A fence around text that may hold fences itself: longer than any inside. */
function fenced(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/^\s*(`{3,})/gm)].map((m) => m[1]!.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}markdown\n${text}\n${fence}`;
}

const VIA = { alias: "an alias", "previous-name": "a previous name", redirect: "a redirect (it moved)" } as const;

/**
 * What a link reaches, under the pointer: the note's path and where it lands — the heading's section,
 * the block, or its start — as the note has it; an ambiguous link's candidates; why one reaches
 * nothing. Off a link, nothing.
 */
export function hover(g: Graph, rel: string, pos: Position): Hover | null {
  const l = linkAt(g, rel, pos);
  if (!l) return null;
  const frag = fragmentOf(l);
  const range = rangeOf(l, l.end);
  const say = (value: string): Hover => ({ contents: { kind: "markdown", value }, range });
  switch (l.resolvedKind) {
    case "note":
    case "anchor": {
      const path = l.resolvedKind === "anchor" ? rel : l.path!;
      const where = l.resolvedKind === "anchor" ? `this note` : `\`${shownPath(g, l)}\``;
      const text = landingText(g, path, frag, l.block);
      const head = [`${where}${frag ? ` › ${l.block ? `^${l.block}` : frag}` : ""}`];
      if (l.via) head.push(`reached by ${VIA[l.via]}`);
      if (text === null) return say(`${head.join(" — ")}\n\n${frag ? "no such heading or block there" : "can't be read"}`);
      return say(`${head.join(" — ")}\n\n${fenced(text)}`);
    }
    case "file":
      return say(`\`${shownPath(g, l)}\` — a file`);
    case "external":
      return say(l.target);
    case "ambiguous":
      return say(`matches ${l.candidates.length} notes:\n\n${l.candidates.map((c) => `- \`${c}\``).join("\n")}`);
    default:
      return say(l.reason ?? `no note named \`${l.target}\` yet`);
  }
}

/** At most this many notes offered at once: typing more asks again (the list is incomplete). */
const COMPLETION_MAX = 100;

const NOTE_EXT = /\.(md|markdown)$/i;

/** How a link from `rel` names a note: its name when that reaches it from here, else its path. */
export function linkName(g: Graph, rel: string, path: string): string {
  const name = posix.basename(path).replace(NOTE_EXT, "");
  const r = g.resolveLink({ kind: "wiki", target: name }, rel);
  return r.resolvedKind === "note" && r.path === path ? name : path.replace(NOTE_EXT, "");
}

/**
 * What can be typed at a position on `line` (its text): after `[[` (or `![[`), a note by name — and
 * by alias, written `name|alias` — or, with `![[`, a file too; after `[[note#`, the note's headings;
 * after `[[note#^`, its blocks; after a `#` that starts a word, the vault's tags. Null elsewhere.
 */
export function completion(g: Graph, rel: string, line: string, pos: Position): CompletionList | null {
  const before = line.slice(0, pos.character);
  const after = line.slice(pos.character);
  const replace = (typed: string): Range => ({ start: { line: pos.line, character: pos.character - typed.length }, end: pos });
  const wiki = /(!?)\[\[([^[\]]*)$/.exec(before);
  if (wiki) {
    const embed = wiki[1] === "!";
    const query = wiki[2]!;
    if (query.includes("|")) return null;
    const close = after.startsWith("]]") || after.startsWith("|") || after.startsWith("#") ? "" : "]]";
    const hash = query.indexOf("#");
    if (hash >= 0) return { isIncomplete: false, items: within(g, rel, query.slice(0, hash), query.slice(hash + 1), replace, close) };
    return notes(g, rel, query, replace(query), close, embed);
  }
  const tag = /(^|\s)#([\p{L}\p{N}_/-]*)$/u.exec(before);
  // `#` alone at a line's start begins a heading, not a tag.
  if (tag && !(tag[1] === "" && tag[2] === "" && before.trim() === "#")) {
    // The tags notes carry, as first written — not the one being typed here, nor a parent no note has.
    g.ensureAll();
    const tags = new Map<string, { tag: string; notes: string[] }>();
    for (const [path, e] of g.notes) {
      for (const t of e.tags) {
        const key = t.toLowerCase();
        const seen = tags.get(key) ?? { tag: t, notes: [] };
        seen.notes.push(path);
        tags.set(key, seen);
      }
    }
    const typing = tags.get(tag[2]!.toLowerCase());
    if (typing?.notes.length === 1 && typing.notes[0] === rel) tags.delete(tag[2]!.toLowerCase());
    const items: CompletionItem[] = [...tags.values()].map((t) => ({
      label: `#${t.tag}`,
      kind: CompletionItemKind.Keyword,
      detail: `${t.notes.length} note${t.notes.length === 1 ? "" : "s"}`,
      filterText: `#${t.tag}`,
      textEdit: { range: replace(`#${tag[2]}`), newText: `#${t.tag}` },
    }));
    return { isIncomplete: false, items };
  }
  return null;
}

/** The notes (with `![[`, the files too) a query's words are all in — by name, title, alias or path. */
function notes(g: Graph, rel: string, query: string, range: Range, close: string, embed: boolean): CompletionList {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (...fields: string[]) => words.every((w) => fields.some((f) => f.toLowerCase().includes(w)));
  // Every note read, so its title and aliases count (the persisted index makes this cheap).
  g.ensureAll();
  const items: CompletionItem[] = [];
  let more = false;
  const add = (item: CompletionItem) => {
    if (items.length >= COMPLETION_MAX) more = true;
    else items.push(item);
  };
  for (const [path, e] of g.notes) {
    const name = linkName(g, rel, path);
    if (has(name, e.title, path)) {
      add({ label: name, kind: CompletionItemKind.File, detail: path, documentation: e.title, filterText: `${name} ${e.title}`, textEdit: { range, newText: `${name}${close}` } });
    }
    for (const alias of e.aliases) {
      if (!has(alias, name, path)) continue;
      add({ label: alias, kind: CompletionItemKind.File, detail: `${path} (alias)`, filterText: alias, textEdit: { range, newText: `${name}|${alias}${close}` } });
    }
  }
  if (embed) {
    for (const path of g.filePaths().sort()) {
      if (has(path)) add({ label: posix.basename(path), kind: CompletionItemKind.File, detail: path, filterText: path, textEdit: { range, newText: `${path}${close}` } });
    }
  }
  return { isIncomplete: more || words.length > 0, items };
}

/** Inside `[[target#…`: the target's headings, or after `#^`, its blocks. */
function within(g: Graph, rel: string, target: string, typed: string, replace: (t: string) => Range, close: string): CompletionItem[] {
  const r = target ? g.resolveLink({ kind: "wiki", target }, rel) : { resolvedKind: "note", path: rel };
  if (r.resolvedKind !== "note" || !r.path) return [];
  const path = r.path;
  if (typed.startsWith("^")) {
    return blockIds(g.textOf(path) ?? "").map((b) => ({
      label: `^${b.id}`,
      kind: CompletionItemKind.Reference,
      detail: `line ${b.line}`,
      documentation: { kind: "markdown", value: fenced(landingText(g, path, null, b.id) ?? "") },
      filterText: `^${b.id}`,
      textEdit: { range: replace(typed), newText: `^${b.id}${close}` },
    }));
  }
  return (g.entryAnywhere(path)?.headings ?? []).filter((h) => h.text.trim()).map((h) => ({
    label: h.text,
    kind: CompletionItemKind.Reference,
    detail: `${"#".repeat(h.depth)} line ${h.line}`,
    filterText: h.text,
    textEdit: { range: replace(typed), newText: `${h.text}${close}` },
  }));
}

/**
 * A note's problems, for the editor (11.5): a link that reaches nothing — a note not written yet is
 * information, a missing file or an unknown vault a warning — or several notes; a heading or block a
 * link names that its note hasn't; git's conflict markers, an error.
 */
export function diagnostics(g: Graph, rel: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const add = (l: LinkRef, severity: DiagnosticSeverity, code: string, message: string) =>
    out.push({ range: rangeOf(l, l.end), severity, code, source: "slipbox", message });
  for (const l of g.linksOf(rel)) {
    const wiki = l.kind === "wiki" || l.kind === "embed";
    const frag = fragmentOf(l);
    switch (l.resolvedKind) {
      case "unresolved":
        if (l.reason) add(l, DiagnosticSeverity.Warning, "unresolved", l.reason);
        else if (wiki) add(l, DiagnosticSeverity.Information, "unresolved", `no note named "${l.target}" yet`);
        else add(l, DiagnosticSeverity.Warning, "unresolved", `broken link: ${l.target}`);
        break;
      case "ambiguous":
        add(l, DiagnosticSeverity.Warning, "ambiguous", `"${l.target}" matches ${l.candidates.length} notes: ${l.candidates.join(", ")}`);
        break;
      case "note":
      case "anchor": {
        if ((!frag && !l.block) || (frag && /^L\d+$/.test(frag))) break;
        const path = l.resolvedKind === "anchor" ? rel : l.path!;
        if (landingLine(g, path, frag, l.block) !== null) break;
        const where = l.resolvedKind === "anchor" ? "this note" : isAbsolute(path) ? posix.basename(path) : path;
        const block = l.block ?? (frag!.startsWith("^") ? frag!.slice(1) : null);
        if (block) add(l, DiagnosticSeverity.Warning, "no-block", `no block ^${block} in ${where}`);
        else add(l, DiagnosticSeverity.Warning, "no-heading", `no heading "${frag}" in ${where}`);
        break;
      }
    }
  }
  const lines = (g.textOf(rel) ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^<{7}(\s|$)/.test(lines[i]!)) continue;
    let end = lines.findIndex((x, j) => j > i && /^>{7}(\s|$)/.test(x));
    if (end < 0) end = i;
    out.push({
      range: { start: { line: i, character: 0 }, end: { line: end, character: lines[end]!.replace(/\r$/, "").length } },
      severity: DiagnosticSeverity.Error,
      code: "conflict",
      source: "slipbox",
      message: "a merge conflict: both sides are still here",
    });
  }
  return out;
}

/** A note's outline (11.6): its headings, each holding the ones under it, its range its whole section. */
export function documentSymbols(g: Graph, rel: string): DocumentSymbol[] {
  const headings = (g.entry(rel)?.headings ?? []).filter((h) => h.text.trim());
  const lines = (g.textOf(rel) ?? "").split("\n").map((l) => l.replace(/\r$/, ""));
  const lastLine = Math.max(0, lines.length - (lines.at(-1) === "" ? 2 : 1));
  const top: DocumentSymbol[] = [];
  const open: { depth: number; sym: DocumentSymbol }[] = [];
  headings.forEach((h, i) => {
    // Its section ends before the next heading as high, or at the note's end.
    const next = headings.slice(i + 1).find((x) => x.depth <= h.depth);
    const end = next ? next.line - 2 : lastLine;
    const line = h.line - 1;
    const sym: DocumentSymbol = {
      name: h.text,
      detail: "#".repeat(h.depth),
      kind: SymbolKind.String,
      range: { start: { line, character: 0 }, end: { line: Math.max(line, end), character: lines[Math.max(line, end)]?.length ?? 0 } },
      selectionRange: { start: { line, character: 0 }, end: { line, character: lines[line]?.length ?? 0 } },
      children: [],
    };
    while (open.length && open[open.length - 1]!.depth >= h.depth) open.pop();
    (open.length ? open[open.length - 1]!.sym.children! : top).push(sym);
    open.push({ depth: h.depth, sym });
  });
  return top;
}

/** At most this many symbols for a query across the vault. */
const WORKSPACE_MAX = 200;

/** The vault's notes — by name, title or alias — and headings that hold every word of a query (11.6). */
export function workspaceSymbols(g: Graph, query: string): WorkspaceSymbol[] {
  g.ensureAll();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (...fields: string[]) => words.every((w) => fields.some((f) => f.toLowerCase().includes(w)));
  const notes: WorkspaceSymbol[] = [];
  const headings: WorkspaceSymbol[] = [];
  for (const [path, e] of [...g.notes].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const uri = uriOf(g, path);
    if (has(posix.basename(path).replace(NOTE_EXT, ""), e.title, ...e.aliases)) {
      notes.push({ name: e.title, kind: SymbolKind.File, containerName: path, location: { uri, range: lineRange(1) } });
    }
    for (const h of e.headings) {
      if (h.text.trim() && words.length && has(h.text)) headings.push({ name: h.text, kind: SymbolKind.String, containerName: path, location: { uri, range: lineRange(h.line) } });
    }
  }
  // Notes first: a name is what's looked for most often.
  return [...notes, ...headings].slice(0, WORKSPACE_MAX);
}

type RenameTarget = { kind: "note"; path: string; range: Range } | { kind: "heading"; text: string; range: Range };

/** What a rename at a position renames: on a link, its note (11.4) in this vault; on a heading's line, the heading (11.9). */
function renameTarget(g: Graph, rel: string, pos: Position): RenameTarget | null {
  const l = linkAt(g, rel, pos);
  if (l) return l.resolvedKind === "note" && l.path && !isAbsolute(l.path) ? { kind: "note", path: l.path, range: rangeOf(l, l.end) } : null;
  const h = g.entry(rel)?.headings.find((x) => x.line === pos.line + 1 && x.text.trim());
  if (!h) return null;
  // The heading's text on its line: after the #s, before any closing ones.
  const line = (g.textOf(rel) ?? "").split("\n")[h.line - 1]?.replace(/\r$/, "") ?? "";
  const m = /^(\s{0,3}#{1,6}[ \t]+)(.*?)([ \t]+#+[ \t]*)?$/.exec(line);
  const from = m ? m[1]!.length : 0;
  return { kind: "heading", text: h.text, range: { start: { line: h.line - 1, character: from }, end: { line: h.line - 1, character: from + (m?.[2]!.length ?? line.length) } } };
}

/** What a rename at a position would rename, and its name now; null where there's nothing to rename. */
export function prepareRename(g: Graph, rel: string, pos: Position): { range: Range; placeholder: string } | null {
  const t = renameTarget(g, rel, pos);
  if (!t) return null;
  return { range: t.range, placeholder: t.kind === "note" ? posix.basename(t.path).replace(NOTE_EXT, "") : t.text };
}

/**
 * The rename planned, as the TUI and the CLI plan it: the linked note to `newName` — in its own folder,
 * or a path from the vault's root when it has a `/` (11.4) — or the heading (11.9); every link fixed.
 */
export function renamePlan(g: Graph, rel: string, pos: Position, newName: string): RenamePlan {
  const t = renameTarget(g, rel, pos);
  if (!t) throw new RenameError("nothing to rename here: on a link, its note is renamed; on a heading, the heading");
  const name = newName.trim();
  if (!name) throw new RenameError("a new name is needed");
  if (t.kind === "heading") return planHeadingRename(g, rel, t.text, name);
  return planNoteRename(g, t.path, name.includes("/") ? name : posix.join(posix.dirname(t.path), name));
}

/** The edits that make `text` into `next`, a run of changed lines each. */
export function textEdits(text: string, next: string): TextEdit[] {
  const from = TextDocument.create("", "", 0, text);
  const a = text.split("\n");
  const b = next.split("\n");
  const offsets = (lines: string[]) => {
    const at = [0];
    for (const l of lines) at.push(at[at.length - 1]! + l.length + 1);
    return at;
  };
  const ao = offsets(a);
  const bo = offsets(b);
  return diffLines(a, b).map((h) => {
    // A run reaching the last line ends one past the text's end (positionAt and slice stop there),
    // and starts at the newline before it: the text may not end in one, and neither may the next.
    const last = h.aStart > 0 && h.aStart + h.aLen === a.length;
    const part = next.slice(bo[h.bStart]!, bo[h.bStart + h.bLen]!);
    return {
      range: { start: from.positionAt(ao[h.aStart]! - (last ? 1 : 0)), end: from.positionAt(ao[h.aStart + h.aLen]!) },
      newText: last ? (h.bLen ? `\n${part}` : "") : part,
    };
  });
}

/** A rename plan as the editor applies it: each file's edits (by its path before the move), then the move. */
export function workspaceEdit(plan: RenamePlan, version: (uri: string) => number | null): WorkspaceEdit {
  const changes: NonNullable<WorkspaceEdit["documentChanges"]> = plan.files.map((f) => {
    const uri = pathToFileURL(f.abs).href;
    return { textDocument: { uri, version: version(uri) }, edits: textEdits(f.text, f.next) };
  });
  if (plan.move) changes.push({ kind: "rename", oldUri: pathToFileURL(plan.move.from).href, newUri: pathToFileURL(plan.move.to).href });
  return { documentChanges: changes };
}

/** The command that copies a note's context bundle (9.7) for an agent. */
export const CONTEXT_COMMAND = "slipbox.context";

/** Where a note a link names would be made: beside the linking note, or from the vault's root for a path. */
function newNotePath(g: Graph, rel: string, target: string): string | null {
  const name = target.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!name || name.split("/").some((x) => x === ".." || x.startsWith("."))) return null;
  const path = name.includes("/") || posix.dirname(rel) === "." ? name : `${posix.dirname(rel)}/${name}`;
  const ext = extensionOf(path);
  return ext && isKnownExtension(ext) ? path : `${path}.md`;
}

/**
 * What can be done at a range of a note (11.11): a link to a note not written yet, the note made (as
 * the TUI makes it: beside this one, its title a heading); an ambiguous link, pointed at each of its
 * notes by path; and the note's context bundle, copied for an agent. `createsFiles`: the editor makes
 * a file an edit names (else no note is offered).
 */
export function codeActions(g: Graph, rel: string, range: Range, line: (n: number) => string, createsFiles: boolean): CodeAction[] {
  const out: CodeAction[] = [];
  const entry = g.entry(rel);
  const touches = (l: LinkRef) => {
    const r = rangeOf(l, l.end);
    const after = (a: Position, b: Position) => a.line > b.line || (a.line === b.line && a.character > b.character);
    return !after(r.start, range.end) && !after(range.start, r.end);
  };
  for (const l of entry?.links ?? []) {
    if (!touches(l) || (l.kind !== "wiki" && l.kind !== "embed")) continue;
    const r = g.resolveLink(l, rel);
    if (r.resolvedKind === "unresolved" && !r.reason && createsFiles) {
      const path = newNotePath(g, rel, l.target);
      if (!path || g.notes.has(path)) continue;
      const uri = uriOf(g, path);
      const name = posix.basename(path).replace(/\.[^.]+$/, "");
      out.push({
        title: `Make the note ${path}`,
        kind: CodeActionKind.QuickFix,
        isPreferred: true,
        edit: {
          documentChanges: [
            { kind: "create", uri, options: { ignoreIfExists: true } },
            { textDocument: { uri, version: null }, edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: NOTE_EXT.test(path) ? `# ${name}\n\n` : "" }] },
          ],
        },
      });
    }
    if (r.resolvedKind === "ambiguous") {
      // The link as written, its target swapped for each note's path (its #heading and |text kept).
      const text = line(l.line - 1);
      const span = text.slice(l.column - 1, l.end.line === l.line ? l.end.column - 1 : undefined);
      const open = span.indexOf("[[") + 2;
      for (const c of r.candidates) {
        const next = `${span.slice(0, open)}${span.slice(open).replace(l.target, c.replace(NOTE_EXT, ""))}`;
        out.push({
          title: `Link to ${c}`,
          kind: CodeActionKind.QuickFix,
          edit: { changes: { [uriOf(g, rel)]: [{ range: { start: { line: l.line - 1, character: l.column - 1 }, end: { line: l.line - 1, character: l.column - 1 + span.length } }, newText: next }] } },
        });
      }
    }
  }
  if (entry) out.push({ title: "Copy this note's context for an agent", kind: CodeActionKind.Source, command: { title: "Copy this note's context for an agent", command: CONTEXT_COMMAND, arguments: [uriOf(g, rel)] } });
  return out;
}
