// Completion while typing (plan 19.16): a code file's language server offers what can go at the
// cursor — at once after one of its trigger characters (`.`), else once a word is begun, after a
// pause — narrowed as typing goes on, asked again only when the server said its list was partial.
// And signature help after `(` and `,`. A popup under the cursor; the keys are vim's and blink's.
// In a note, a link's target is slipbox's own to complete (20.13): the files it could reach, by
// their path as shown (21.9) and their full path; the one picked written as the root's convention writes it
// (21.5) — a markdown link's path as its path and extension say, a wikilink's (`[[`) by name or path.
// Anywhere, ctrl+n / ctrl+p with no popup completes a word from the open files' words, no server asked (25.5).

import { pathToFileURL } from "node:url";
import type { CompletionItem, CompletionList, SignatureHelp, TextEdit } from "vscode-languageserver-protocol";
import { conventionOf, type LinkStyle } from "../../../core/workspace/links/convention.ts";
import { linkDestination } from "../../../core/workspace/links/write-link.ts";
import type { App, View } from "../../app/runtime/app.ts";
import { offsetOf, placeAt, prevBoundary } from "./editing.ts";
import { keyChar } from "../../shell/input/keys.ts";
import { RANKED, rank } from "../../shell/overlays/match.ts";
import { PASTE } from "../../shell/input/vim.ts";
import { startSnippet } from "./snippets.ts";
import { expandSnippet } from "../../../core/documents/editing/snippet.ts";

import type { CompletionState } from "./completion/contracts.ts";
import { WORD, wordStart, linkTargetStart, wikiTargetStart, snippetContext } from "./completion/context.ts";
import { linkItems, inOrder } from "./completion/items.ts";
export type { CompletionState, SignatureState } from "./completion/contracts.ts";
export { wordStart, linkTargetStart, wikiTargetStart } from "./completion/context.ts";

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
      const start = view.buf.source.lastIndexOf("\n", from - 1) + 1;
      const before = view.buf.source.slice(start, from).trimStart();
      // The same target's list: on its line, what's before it unchanged but for the indent, as typing into it or an
      // indent leaves it. Another target, on this line or another, gets its own.
      const same = c?.lineStart === start && c.before === before;
      if (c?.links === style && c.view === view && same) {
        c.from = from;
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
        lineStart: start,
        before,
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

/**
 * A paste while typing: the popup closed and a pending ask dropped, as a word ended does, so the next `tab` or `enter`
 * never writes over what was pasted; the next key typed in a link's target makes its list again.
 */
export function afterPaste(app: App): void {
  if (timer) clearTimeout(timer);
  timer = null;
  asked++;
  app.completion = null;
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
