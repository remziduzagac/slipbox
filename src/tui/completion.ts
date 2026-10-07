// Completion while typing (plan 19.16): a code file's language server offers what can go at the
// cursor — at once after one of its trigger characters (`.`), else once a word is begun, after a
// pause — narrowed as typing goes on, asked again only when the server said its list was partial.
// And signature help after `(` and `,`. A popup under the cursor; the keys are vim's and blink's.
// In a note, a link's target is slipbox's own to complete (20.13): the files it could reach, by
// their path as shown (21.9) and their full path; the one picked written as the root's convention writes it
// (21.5) — a markdown link's path as its path and extension say, a wikilink's (`[[`) by name or path.

import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { CompletionItem, CompletionList, SignatureHelp, TextEdit } from "vscode-languageserver-protocol";
import { conventionOf, type LinkStyle } from "../core/convention.ts";
import { linkDestination, linkEnds } from "../core/write-link.ts";
import { readJson } from "../core/fsutil.ts";
import { cacheDir } from "../core/paths.ts";
import { readRoots } from "../core/registry.ts";
import { homeFolder } from "../core/vault.ts";
import type { App, View } from "./app.ts";
import { offsetOf, placeAt, prevBoundary } from "./editing.ts";
import { keyChar } from "./keys.ts";
import { rank } from "./match.ts";
import { PASTE } from "./vim.ts";

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
  /** A link's target being completed (20.13): slipbox's list, no server's. */
  links?: boolean;
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

/** After a key typed in insert mode: the popup narrowed, asked for or closed; signature help on `(` and `,`. */
export function afterInsertKey(app: App, view: View, key: string): void {
  // A link's target in a note (20.13): from just after `](` or `[[` (21.5), narrowed as it's typed.
  if (view.insert && view.buf.kind.group === "note") {
    const at = offsetOf(app, view);
    const md = linkTargetStart(view.buf.source, at);
    const wiki = md === null ? wikiTargetStart(view.buf.source, at) : null;
    const from = md ?? wiki;
    const c = app.completion;
    if (from !== null) {
      if (c?.links && c.view === view && c.from === from) return narrow(app, c);
      app.completion = { view, from, items: linkItems(app, view, md !== null ? "markdown" : "wiki"), shown: [], selected: 0, incomplete: false, links: true };
      return narrow(app, app.completion);
    }
    if (c?.links) app.completion = null;
  }
  const s = app.servers;
  if (!s?.isOpen(view.buf.abs) || !view.insert) {
    app.completion = null;
    app.signature = null;
    return;
  }
  const typed = keyChar(key);
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
  const c = conventionOf(g, app.config, app.configOrigins, style);
  const home = homeFolder();
  const tilde = (abs: string) => (abs.startsWith(`${home}/`) ? `~/${relative(home, abs)}` : abs);
  const item = (abs: string, form: string, here: boolean): CompletionItem => {
    const dest = linkDestination(c, style, linkEnds(g, view.buf.abs, abs));
    return {
      // A wikilink's shows what it writes (a name, a path); a markdown link's, the file by its path as shown (21.9).
      label: style === "wiki" ? dest : form,
      detail: style === "wiki" ? form : tilde(abs),
      filterText: `${form} ${dest} ${abs}`,
      sortText: `${here ? 0 : 1}${form}`,
      insertText: dest,
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
    const entries = readJson<{ entries?: Record<string, unknown> } | null>(join(cacheDir(v), "index.json"), null)?.entries;
    for (const rel of Object.keys(entries ?? {})) {
      const abs = join(v.path, rel);
      out.push(item(abs, g.shownPath(abs), false));
    }
  }
  return out;
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
  // For `.`: the accept as the keys that make the same text — a backspace per character it
  // replaced, then the rest as a paste (a key of its own, insertRecord). Edits elsewhere (an
  // import added) can't be said in keys: then the change isn't repeated at all, never wrongly.
  const s = app.vim;
  if (s.inInsert && !s.replaying) {
    if (item.additionalTextEdits?.length || from > at) {
      s.inInsert = false;
      s.lastChange = null;
    } else {
      for (let k = at; k > from; k = prevBoundary(buf.source, k)) s.seq.push("backspace");
      s.seq.push(`${PASTE}${text}`);
    }
  }
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
