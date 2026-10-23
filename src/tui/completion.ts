// Completion while typing (plan 19.16): a code file's language server offers what can go at the
// cursor — at once after one of its trigger characters (`.`), else once a word is begun, after a
// pause — narrowed as typing goes on, asked again only when the server said its list was partial.
// And signature help after `(` and `,`. A popup under the cursor; the keys are vim's and blink's.
// In a note, a link's target is slipbox's own to complete (20.13): the files it could reach, by
// their path as shown (21.9) and their full path; the one picked written as the root's convention writes it
// (21.5) — a markdown link's path as its path and extension say, a wikilink's (`[[`) by name or path.
// Anywhere, ctrl+n / ctrl+p with no popup completes a word from the open files' words, no server asked (25.5).

import { existsSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { CompletionItem, CompletionList, SignatureHelp, TextEdit } from "vscode-languageserver-protocol";
import { conventionOf, type LinkStyle } from "../core/convention.ts";
import { linkDestination, linkEnds, type PointerMemo } from "../core/write-link.ts";
import { readJson } from "../core/fsutil.ts";
import { cacheDir } from "../core/paths.ts";
import { readRoots } from "../core/registry.ts";
import { homeFolder } from "../core/vault.ts";
import type { App, View } from "./app.ts";
import { offsetOf, placeAt, prevBoundary } from "./editing.ts";
import { keyChar } from "./keys.ts";
import { RANKED, rank } from "./match.ts";
import { PASTE } from "./vim.ts";
import { startSnippet } from "./snippets.ts";
import { expandSnippet, type SnippetContext } from "../core/snippet.ts";
import { indentUnit } from "../core/indent.ts";

export interface CompletionState {
  view: View;
  /** Where the word being completed starts: a text offset. */
  from: number;
  items: CompletionItem[];
  /** The items the typed word keeps, best first. */
  shown: CompletionItem[];
  selected: number;
  /** The server said its list was partial: typing asks it again. */
  incomplete: boolean;
  /** A link's target being completed (20.13), in this style: slipbox's list, no server's. */
  links?: LinkStyle;
  /** A link's: where its target's line starts, and how far its start is from the line's end: an indent before it
   *  leaves both. */
  line?: number;
  tail?: number;
  /** A link's words typed so far, each with the items it matched in the list's order: a word typed on from one
   *  matches no other. */
  steps?: { typed: string; matched: CompletionItem[] }[];
  /** A word completed from the open files' words (25.5): narrowed by how it starts, kept in their order. */
  words?: boolean;
}

/** A signature being typed: its label, and the active parameter's span in it. */
export interface SignatureState {
  view: View;
  label: string;
  active: [number, number] | null;
}

const WORD = /[\p{L}\p{N}_$]/u;

/** Where the word ending at `at` starts. */
export function wordStart(source: string, at: number): number {
  let i = at;
  while (i > 0 && WORD.test(source[i - 1]!)) i--;
  return i;
}

/** A key in insert mode while the popup shows: true when it's the popup's — moving, accepting, closing. */
export function completionKey(app: App, view: View, key: string): boolean {
  const c = app.completion;
  if (!c || c.view !== view || !c.shown.length) return false;
  switch (key) {
    case "ctrl+n":
    case "down":
      c.selected = (c.selected + 1) % c.shown.length;
      return true;
    case "ctrl+p":
    case "up":
      c.selected = (c.selected - 1 + c.shown.length) % c.shown.length;
      return true;
    case "tab":
    case "enter":
      accept(app, c);
      return true;
    case "ctrl+e":
      app.completion = null;
      return true;
    case "escape":
      // Closes it, and insert too, as vim's escape does.
      app.completion = null;
      app.signature = null;
      return false;
  }
  return false;
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Each ask's number: an answer to an older one than the last is dropped. */
let asked = 0;
/** Each signature help ask's number, likewise — and `)` closing it drops the answer on its way. An answer for an
 *  older text stands (the server's for the text at the `(`, the argument typed since): only the last ask's counts. */
let signatureAsked = 0;

/** A word of the open files, to complete one with (25.5): two of a word's characters or more. */
const WORDS = /[\p{L}\p{N}_$]{2,}/gu;

/**
 * ctrl+n / ctrl+p in insert mode with no popup (25.5), as vim's: the words of the open files that start as the one
 * before the cursor does — this file's first, from the cursor on and around from the top (ctrl+p: back from the
 * cursor, and around from the end), then the other open files', each named. The popup is completion's, its keys
 * too; typing narrows it, and a character no word has closes it.
 */
export function completeWords(app: App, view: View, back: boolean): void {
  // Asked for these: a server's ask waiting on a pause, or its answer on the way, would put its own in their place.
  if (timer) clearTimeout(timer);
  timer = null;
  asked++;
  const src = view.buf.source;
  const at = offsetOf(app, view);
  const from = wordStart(src, at);
  const items: CompletionItem[] = [];
  const seen = new Set<string>();
  const add = (word: string, detail?: string) => {
    if (seen.has(word)) return;
    seen.add(word);
    items.push(detail ? { label: word, detail } : { label: word });
  };
  // Not the word the cursor is in: it's the one being completed.
  const here = [...src.matchAll(WORDS)].filter((m) => !(m.index <= from && m.index + m[0].length >= at));
  const after = here.filter((m) => m.index >= at);
  const before = here.filter((m) => m.index < at);
  for (const m of back ? [...before.reverse(), ...after.reverse()] : [...after, ...before]) add(m[0]);
  for (const b of app.buffers.values()) {
    if (b === view.buf) continue;
    const name = app.displayName(b);
    for (const m of b.source.matchAll(WORDS)) add(m[0], name);
  }
  const c: CompletionState = { view, from, items, shown: [], selected: 0, incomplete: false, words: true };
  app.completion = c;
  narrow(app, c);
  if (!app.completion)
    app.message(
      "info",
      from < at ? `no word in the open files starts with ${src.slice(from, at)}` : "no words in the open files",
    );
}

/** After a key typed in insert mode: the popup narrowed, asked for or closed; signature help on `(` and `,`. */
export function afterInsertKey(app: App, view: View, key: string): void {
  // Words completed (25.5): narrowed while the word goes on, closed when it ends.
  const w = app.completion;
  if (w?.words) {
    const typed = keyChar(key);
    const going = key === "backspace" || (typed !== null && WORD.test(typed));
    if (w.view === view && view.insert && going && wordStart(view.buf.source, offsetOf(app, view)) === w.from)
      return narrow(app, w);
    app.completion = null;
  }
  // A link's target in a note (20.13): from just after `](` or `[[` (21.5), narrowed as it's typed.
  if (view.insert && view.buf.kind.group === "note") {
    const at = offsetOf(app, view);
    const md = linkTargetStart(view.buf.source, at);
    const wiki = md === null ? wikiTargetStart(view.buf.source, at) : null;
    const from = md ?? wiki;
    const c = app.completion;
    if (from !== null) {
      const style: LinkStyle = md !== null ? "markdown" : "wiki";
      const src = view.buf.source;
      const line = src.lastIndexOf("\n", from - 1) + 1;
      const end = src.indexOf("\n", from);
      const tail = (end < 0 ? src.length : end) - from;
      // The same target's list: typed into where it starts, or moved along its line by an indent, what follows its
      // start unchanged. Another target, on this line or another, gets its own.
      if (c?.links === style && c.view === view && (c.from === from || (c.line === line && c.tail === tail))) {
        c.from = from;
        c.line = line;
        c.tail = tail;
        return narrow(app, c);
      }
      app.completion = {
        view,
        from,
        items: inOrder(linkItems(app, view, style)),
        shown: [],
        selected: 0,
        incomplete: false,
        links: style,
        line,
        tail,
      };
      return narrow(app, app.completion);
    }
    if (c?.links) app.completion = null;
  }
  const s = app.languages.servers;
  if (!s?.isOpen(view.buf.abs) || !view.insert) {
    app.completion = null;
    app.signature = null;
    return;
  }
  const typed = keyChar(key);
  const at = offsetOf(app, view);
  const from = wordStart(view.buf.source, at);
  const t = app.languages.triggers(view.buf.abs);
  if (typed !== null && t.signature.includes(typed)) void signature(app, view);
  if (typed === ")") {
    signatureAsked++;
    app.signature = null;
  }
  if (typed !== null && t.completion.includes(typed)) return void ask(app, view, typed);
  const c = app.completion;
  if (key === "backspace" || (typed !== null && WORD.test(typed))) {
    if (from === at) {
      app.completion = null;
      return;
    }
    if (c && c.view === view && c.from === from && !c.incomplete) return narrow(app, c);
    // A word begun: asked once typing pauses, not per key.
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (view.insert) void ask(app, view, null);
    }, 100);
    (timer as { unref?: () => void }).unref?.();
    return;
  }
  // Anything else typed — a space, an operator — ends the word, and the ask its pause was to make, or made (#37):
  // else a slow answer (signature help's, at `(`) lets the pause pass, and the popup opens after the `(`.
  if (timer) clearTimeout(timer);
  timer = null;
  asked++;
  app.completion = null;
}

/** Inside a markdown link's target (`[text](do|`): where the target starts, else null. */
export function linkTargetStart(source: string, at: number): number | null {
  const line = source.slice(source.lastIndexOf("\n", at - 1) + 1, at);
  const m = /\]\(([^()\s<>]*)$/.exec(line);
  return m ? at - m[1]!.length : null;
}

/** Inside a wikilink's target (`[[Da|`, `![[pic`): where the target starts, else null. */
export function wikiTargetStart(source: string, at: number): number | null {
  const line = source.slice(source.lastIndexOf("\n", at - 1) + 1, at);
  const m = /\[\[([^\]|#[]*)$/.exec(line);
  return m ? at - m[1]!.length : null;
}

/**
 * The files a link from this note could reach (20.13): this vault's notes and files, each by its path
 * here, and (a markdown link's) other vaults' notes, each by its path as shown (21.9) — the full path beside each,
 * and either typed narrows. Picked, it's written as the root's convention writes it in `style` (21.5);
 * a wikilink reaches only its own root's (21.3).
 */
function linkItems(app: App, view: View, style: LinkStyle): CompletionItem[] {
  const g = app.graph;
  const c = conventionOf(g, app.config, app.settings.origins, style);
  const home = homeFolder();
  const tilde = (abs: string) => (abs.startsWith(`${home}/`) ? `~/${relative(home, abs)}` : abs);
  // Each other vault's pointer name worked out once, not once per note: per note it read every named folder.
  const memo: PointerMemo = { root: g.root, naming: new Map() };
  const item = (abs: string, form: string, here: boolean): CompletionItem => {
    const ends = linkEnds(g, view.buf.abs, abs, memo);
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
  // Other vaults' notes, as of their last index: what the machine knows, read once per completion.
  for (const v of readRoots()) {
    if (v.kind !== "vault" || v.worktree || v.path === g.root || !existsSync(v.path)) continue;
    const entries = readJson<{ entries?: Record<string, unknown> } | null>(
      join(cacheDir(v), "index.json"),
      null,
    )?.entries;
    for (const rel of Object.keys(entries ?? {})) {
      const abs = join(v.path, rel);
      out.push(item(abs, g.shownPath(abs), false));
    }
  }
  return out;
}

/** Asked of the file's servers: what goes at the cursor (`trigger`, the character that asked). */
async function ask(app: App, view: View, trigger: string | null): Promise<void> {
  const s = app.languages.servers!;
  // This ask stands for any waiting: a word's pause then a `.` asks once, for the `.`.
  if (timer) clearTimeout(timer);
  timer = null;
  const mine = ++asked;
  app.languages.sync(view.buf);
  const params = {
    textDocument: { uri: pathToFileURL(view.buf.abs).href },
    position: app.languages.position(view),
    context: trigger ? { triggerKind: 2, triggerCharacter: trigger } : { triggerKind: 1 },
  };
  const r = await s.request<CompletionItem[] | CompletionList>(
    view.buf.abs,
    "textDocument/completion",
    params,
    "completionProvider",
    "completion",
  );
  if (!view.insert || app.view !== view || mine !== asked) return;
  const list = r ? (Array.isArray(r.result) ? { items: r.result, isIncomplete: false } : r.result) : null;
  if (!list?.items.length) {
    app.completion = null;
    return app.host.requestRender();
  }
  const at = offsetOf(app, view);
  app.completion = {
    view,
    from: wordStart(view.buf.source, at),
    items: list.items,
    shown: [],
    selected: 0,
    incomplete: list.isIncomplete,
  };
  narrow(app, app.completion);
  app.host.requestRender();
}

/**
 * The items the word typed so far keeps, best first: by match, then the server's order. The open files' words (25.5)
 * by how they start — any case while it's typed in lower case, as find's smart case — in the order found.
 */
function narrow(app: App, c: CompletionState): void {
  const word = c.view.buf.source.slice(c.from, offsetOf(app, c.view));
  if (c.words) {
    const fold = !/\p{Lu}/u.test(word);
    const start = fold ? word.toLowerCase() : word;
    c.shown = c.items.filter((i) => i.label !== word && (fold ? i.label.toLowerCase() : i.label).startsWith(start));
    c.selected = 0;
    if (!c.shown.length) app.completion = null;
    return;
  }
  const key = (i: CompletionItem) => i.filterText ?? i.label;
  if (c.links) {
    // A word typed on from another matches only what that one did: each word is matched whole (3.16), and a capital
    // only makes it match as typed. So a key ranks only the matches of the longest word typed before that it types
    // on from, the last key's or, after a backspace, a shorter one's: none past a non-match, however many notes the
    // list holds. The list is in order since it was built.
    const steps = (c.steps ??= []);
    while (steps.length && !word.startsWith(steps.at(-1)!.typed)) steps.pop();
    const among = steps.at(-1)?.matched ?? c.items;
    const hits = word ? rank(word, among, key, Number.POSITIVE_INFINITY) : null;
    const kept = hits && new Set(hits.map((h) => h.item));
    if (kept && steps.at(-1)?.typed !== word) steps.push({ typed: word, matched: among.filter((i) => kept.has(i)) });
    c.shown = hits ? hits.slice(0, RANKED).map((h) => h.item) : c.items;
    c.selected = 0;
    // Kept while nothing matches, showing nothing, until its target ends: built again per key, it would read every
    // vault's index each time. A backspace back to a match shows it again.
    return;
  }
  const byServer = inOrder(c.items);
  c.shown = word ? rank(word, byServer, key).map((r) => r.item) : byServer;
  c.selected = 0;
  if (!c.shown.length) app.completion = null;
}

/** The items in the server's order: by `sortText`, else the label. */
function inOrder(items: CompletionItem[]): CompletionItem[] {
  return [...items].sort((a, b) => (a.sortText ?? a.label).localeCompare(b.sortText ?? b.label));
}

/** What a snippet (25.8) is expanded with here: the line's indentation, the file's unit, the file's variables. */
function snippetContext(_app: App, view: View, at: number): SnippetContext {
  const buf = view.buf;
  const lineStart = buf.source.lastIndexOf("\n", at - 1) + 1;
  const lineEnd = buf.source.indexOf("\n", at);
  const line = buf.source.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
  const n = buf.source.slice(0, at).split("\n").length;
  return {
    indent: /^[ \t]*/.exec(line)![0],
    unit: indentUnit(buf.indent()),
    vars: {
      TM_FILENAME: basename(buf.abs),
      TM_FILENAME_BASE: basename(buf.abs).replace(/\.[^.]*$/, ""),
      TM_DIRECTORY: dirname(buf.abs),
      TM_FILEPATH: buf.abs,
      TM_LINE_INDEX: String(n - 1),
      TM_LINE_NUMBER: String(n),
      TM_CURRENT_LINE: line,
      TM_CURRENT_WORD: buf.source.slice(wordStart(buf.source, at), at),
      TM_SELECTED_TEXT: "",
    },
  };
}

/** The chosen item put in: its edit (from where it starts to the cursor), else its text over the word; then its other edits (an import). */
function accept(app: App, c: CompletionState): void {
  const item = c.shown[c.selected]!;
  const pointer = c.links ? (item.data as { pointerTo?: string; style?: LinkStyle } | undefined) : undefined;
  if (pointer?.pointerTo) return acceptPointer(app, c, pointer.pointerTo, pointer.style ?? "markdown");
  const view = c.view;
  const buf = view.buf;
  const at = offsetOf(app, view);
  const starts = buf.lineStarts();
  const offset = (p: { line: number; character: number }) => (starts[p.line] ?? buf.source.length) + p.character;
  const edit = item.textEdit;
  const from = edit ? offset("range" in edit ? edit.range.start : edit.insert.start) : c.from;
  const raw = edit ? edit.newText : (item.insertText ?? item.label);
  // A snippet (25.8): expanded, its stops to tab through.
  const snippet = item.insertTextFormat === 2 ? expandSnippet(raw, snippetContext(app, view, from)) : null;
  const text = snippet ? snippet.text : raw;
  const stops = snippet && snippet.stops.length > 1;
  // For `.`: the accept as the keys that make the same text — a backspace per character it
  // replaced, then the rest as a paste (a key of its own, insertRecord). Edits elsewhere (an
  // import added) can't be said in keys: then the change isn't repeated at all, never wrongly.
  const s = app.vim;
  if (s.inInsert && !s.replaying) {
    // Its stops typed into can't be said in keys either.
    if (item.additionalTextEdits?.length || from > at || stops) {
      s.inInsert = false;
      s.lastChange = null;
    } else {
      for (let k = at; k > from; k = prevBoundary(buf.source, k)) s.seq.push("backspace");
      s.seq.push(`${PASTE}${text}`);
    }
  }
  buf.edit(from, at - from, text);
  placeAt(app, view, from + text.length, true);
  // Followed before the other edits, which move its stops along.
  if (snippet) startSnippet(app, view, from, snippet);
  if (item.additionalTextEdits?.length) applyElsewhere(app, view, item.additionalTextEdits);
  app.completion = null;
}

/**
 * A pointer picked (21.7): written once its name is settled (`writeLinkAsked`) — a name different folders share asks
 * first, a private one is said (D74, D83). Asked, it's written when answered, if the note hasn't changed meanwhile,
 * and isn't repeated by `.`: the keys that answered weren't the note's.
 */
function acceptPointer(app: App, c: CompletionState, to: string, style: LinkStyle): void {
  const view = c.view;
  const at = offsetOf(app, view);
  const version = view.buf.version;
  app.completion = null;
  let now = true;
  app.linking.writeLinkAsked(view.buf.abs, to, (ends) => {
    if (view.buf.version !== version)
      return app.message("warn", "the note changed while you picked: complete the link again");
    const text = linkDestination(conventionOf(app.graph, app.config, app.settings.origins, style), style, ends);
    const s = app.vim;
    if (s.inInsert && !s.replaying) {
      if (now) {
        for (let k = at; k > c.from; k = prevBoundary(view.buf.source, k)) s.seq.push("backspace");
        s.seq.push(`${PASTE}${text}`);
      } else {
        s.inInsert = false;
        s.lastChange = null;
      }
    }
    view.buf.edit(c.from, at - c.from, text);
    placeAt(app, view, c.from + text.length, true);
  });
  now = false;
}

/** An item's other edits (an import at the top), the cursor kept on its text. */
function applyElsewhere(app: App, view: View, edits: TextEdit[]): void {
  const before = view.buf.source.length;
  const at = offsetOf(app, view);
  app.languages.applyWorkspaceEdit({ changes: { [pathToFileURL(view.buf.abs).href]: edits } });
  const starts = view.buf.lineStarts();
  // Edits above the cursor moved it on by what they added.
  const above = edits.filter((e) => (starts[e.range.start.line] ?? 0) + e.range.start.character <= at);
  if (above.length) placeAt(app, view, at + (view.buf.source.length - before), true);
}

/** The signature being typed, from the file's servers: its label, its active parameter marked. */
async function signature(app: App, view: View): Promise<void> {
  const s = app.languages.servers!;
  const mine = ++signatureAsked;
  app.languages.sync(view.buf);
  const r = await s.request<SignatureHelp>(
    view.buf.abs,
    "textDocument/signatureHelp",
    { textDocument: { uri: pathToFileURL(view.buf.abs).href }, position: app.languages.position(view) },
    "signatureHelpProvider",
    "signature-help",
  );
  if (mine !== signatureAsked) return;
  const help = r?.result;
  const sig = help?.signatures[help.activeSignature ?? 0];
  if (!sig || !view.insert) {
    app.signature = null;
    return app.host.requestRender();
  }
  const param = sig.parameters?.[sig.activeParameter ?? help!.activeParameter ?? 0];
  let active: [number, number] | null = null;
  if (param) {
    if (Array.isArray(param.label)) active = param.label as [number, number];
    else {
      const i = sig.label.indexOf(param.label);
      if (i >= 0) active = [i, i + param.label.length];
    }
  }
  app.signature = { view, label: sig.label, active };
  app.host.requestRender();
}
