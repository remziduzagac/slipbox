// Completion while typing (plan 19.16): a code file's language server offers what can go at the
// cursor — at once after one of its trigger characters (`.`), else once a word is begun, after a
// pause — narrowed as typing goes on, asked again only when the server said its list was partial.
// And signature help after `(` and `,`. A popup under the cursor; the keys are vim's and blink's.

import { pathToFileURL } from "node:url";
import type { CompletionItem, CompletionList, SignatureHelp, TextEdit } from "vscode-languageserver-protocol";
import type { App, View } from "./app.ts";
import { offsetOf, placeAt } from "./editing.ts";
import { rank } from "./match.ts";

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

/** What a key types, if it's text. */
function typedOf(key: string): string | null {
  return key === "space" ? " " : [...key].length === 1 ? key : /^shift\+.$/.test(key) ? key.slice(6).toUpperCase() : null;
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

/** After a key typed in insert mode: the popup narrowed, asked for or closed; signature help on `(` and `,`. */
export function afterInsertKey(app: App, view: View, key: string): void {
  const s = app.servers;
  if (!s?.isOpen(view.buf.abs) || !view.insert) {
    app.completion = null;
    app.signature = null;
    return;
  }
  const typed = typedOf(key);
  const at = offsetOf(app, view);
  const from = wordStart(view.buf.source, at);
  const t = app.serverTriggers(view.buf.abs);
  if (typed !== null && t.signature.includes(typed)) void signature(app, view);
  if (typed === ")") app.signature = null;
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
  // Anything else typed — a space, an operator — ends the word.
  app.completion = null;
}

/** Asked of the file's servers: what goes at the cursor (`trigger`, the character that asked). */
async function ask(app: App, view: View, trigger: string | null): Promise<void> {
  const s = app.servers!;
  // This ask stands for any waiting: a word's pause then a `.` asks once, for the `.`.
  if (timer) clearTimeout(timer);
  timer = null;
  const mine = ++asked;
  app.syncServers(view.buf);
  const params = {
    textDocument: { uri: pathToFileURL(view.buf.abs).href },
    position: app.lspPosition(view),
    context: trigger ? { triggerKind: 2, triggerCharacter: trigger } : { triggerKind: 1 },
  };
  const r = await s.request<CompletionItem[] | CompletionList>(view.buf.abs, "textDocument/completion", params, "completionProvider", "completion");
  if (!view.insert || app.view !== view || mine !== asked) return;
  const list = r ? (Array.isArray(r.result) ? { items: r.result, isIncomplete: false } : r.result) : null;
  if (!list?.items.length) {
    app.completion = null;
    return app.host.requestRender();
  }
  const at = offsetOf(app, view);
  app.completion = { view, from: wordStart(view.buf.source, at), items: list.items, shown: [], selected: 0, incomplete: list.isIncomplete };
  narrow(app, app.completion);
  app.host.requestRender();
}

/** The items the word typed so far keeps, best first: by match, then the server's order. */
function narrow(app: App, c: CompletionState): void {
  const word = c.view.buf.source.slice(c.from, offsetOf(app, c.view));
  const byServer = [...c.items].sort((a, b) => (a.sortText ?? a.label).localeCompare(b.sortText ?? b.label));
  c.shown = word ? rank(word, byServer, (i) => i.filterText ?? i.label).map((r) => r.item) : byServer;
  c.selected = 0;
  if (!c.shown.length) app.completion = null;
}

/** A snippet's text as plain text: its placeholders' text kept, its tab stops gone. */
function plain(text: string): string {
  return text.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\{\d+\}|\$\d+/g, "");
}

/** The chosen item put in: its edit (from where it starts to the cursor), else its text over the word; then its other edits (an import). */
function accept(app: App, c: CompletionState): void {
  const item = c.shown[c.selected]!;
  const view = c.view;
  const buf = view.buf;
  const at = offsetOf(app, view);
  const starts = buf.lineStarts();
  const offset = (p: { line: number; character: number }) => (starts[p.line] ?? buf.source.length) + p.character;
  const edit = item.textEdit;
  const from = edit ? offset("range" in edit ? edit.range.start : edit.insert.start) : c.from;
  const raw = edit ? edit.newText : (item.insertText ?? item.label);
  const text = item.insertTextFormat === 2 ? plain(raw) : raw;
  buf.edit(from, at - from, text);
  placeAt(app, view, from + text.length, true);
  if (item.additionalTextEdits?.length) applyElsewhere(app, view, item.additionalTextEdits);
  app.completion = null;
}

/** An item's other edits (an import at the top), the cursor kept on its text. */
function applyElsewhere(app: App, view: View, edits: TextEdit[]): void {
  const before = view.buf.source.length;
  const at = offsetOf(app, view);
  app.applyWorkspaceEdit({ changes: { [pathToFileURL(view.buf.abs).href]: edits } });
  const starts = view.buf.lineStarts();
  // Edits above the cursor moved it on by what they added.
  const above = edits.filter((e) => (starts[e.range.start.line] ?? 0) + e.range.start.character <= at);
  if (above.length) placeAt(app, view, at + (view.buf.source.length - before), true);
}

/** The signature being typed, from the file's servers: its label, its active parameter marked. */
async function signature(app: App, view: View): Promise<void> {
  const s = app.servers!;
  app.syncServers(view.buf);
  const r = await s.request<SignatureHelp>(view.buf.abs, "textDocument/signatureHelp", { textDocument: { uri: pathToFileURL(view.buf.abs).href }, position: app.lspPosition(view) }, "signatureHelpProvider", "signature-help");
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
