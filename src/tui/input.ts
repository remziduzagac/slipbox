// Keys and pastes (docs/manual/keys.md): handled one at a time, in order, through the focused pane's keys → visual
// mode's → source mode's → the normal keymap; a sequence pending shows the which-key popup.

import { deleteTypedSelection, insertKey, insertText } from "./editing.ts";
import { insertRecord, PASTE, put, vimKey, visualKey } from "./vim.ts";
import * as R from "./replacing.ts";
import type { Keymap } from "../core/commands.ts";
import { afterSnippetKey, snippetKey } from "./snippets.ts";
import { afterInsertKey, afterPaste, completeWords, completionKey } from "./completion.ts";
import { sanitize } from "../core/sanitize.ts";
import {
  EXPLORER_ACTION_INFO,
  HISTORY_ACTION_INFO,
  GIT_ACTION_INFO,
  PROBLEMS_ACTION_INFO,
  OUTLINE_ACTION_INFO,
  FOOTNOTE_ACTION_INFO,
  INFO_ACTION_INFO,
  RESIZE_ACTIONS,
  keyChar,
  prettyKey,
} from "./keys.ts";
import type { App } from "./app.ts";
import { editable } from "./app.ts";
import { refilter } from "./overlays.ts";

/** Keys and pastes: dispatch, sequences, the which-key popup. */
export class Input {
  constructor(readonly app: App) {}

  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  /** The which-key popup is showing for `pending`. */
  whichKey = false;
  private whichKeyTimer: ReturnType<typeof setTimeout> | null = null;

  // -------------------------------------------------------------------------------------------
  // Input. Dispatch order (decision 3.11): a paste → overlay → a pane's filter → insert (the
  // completion popup's keys first) → a character awaited (f, t, r) → (in source and the lens: counts
  // and an operator's motion around the rest, vim.ts) → resize mode → pending sequence → the
  // focused pane's keys → visual mode's → source mode's → the normal keymap. The which-key popup
  // shows while a sequence is pending.

  /**
   * Pasted text (bracketed paste): into the text while typing, after the cursor in normal mode
   * (as p), into the open list's filter or prompt (first line only, sanitized); reading, nowhere.
   */
  paste(text: string): Promise<void> {
    // In turn with the keys (never between two of them), and recorded as a key of its own.
    return this.handleKey(`${PASTE}${text}`);
  }

  private async pasteNow(text: string): Promise<void> {
    const o = this.app.overlay;
    const iv = this.app.view;
    if (!o && this.app.region === "content" && iv?.insert) {
      // Into the text, its line breaks the note's own (over a selection made while typing); part of the change for `.`.
      deleteTypedSelection(this.app, iv);
      insertText(this.app, iv, text.replace(/\r\n?/g, "\n").replaceAll("\n", iv.buf.eol));
      afterPaste(this.app);
      return insertRecord(this.app, iv, `${PASTE}${text}`);
    }
    // In normal mode where the text is editable: put after the cursor, as p does — and, as p is,
    // a change `.` repeats (the paste a key of its own).
    if (!o && this.app.region === "content" && iv && editable(iv)) {
      const before = iv.buf.version;
      await put(this.app, iv, true, text.replace(/\r\n?/g, "\n"));
      const s = this.app.vim;
      if (!s.replaying && iv.buf.version !== before) {
        s.seq = [`${PASTE}${text}`];
        s.seqVersion = before;
        s.undoing = false;
        s.inInsert = false;
        s.lastChange = [...s.seq];
      }
      return;
    }
    // Into the git panel's message box, while it's typed in: every line of it.
    if (!o && this.app.region === "sidebar" && this.app.leftView === "git" && this.app.gitPanel.typing) {
      this.app.gitPanel.message += sanitize(text.replace(/\r\n?/g, "\n"));
      return;
    }
    const line = sanitize(text.replace(/\r\n?/g, "\n").split("\n")[0] ?? "");
    if (!line) return;
    if (!o) {
      // A side pane's filter being typed in: its first line, as typed.
      if (this.app.region === "sidebar" && this.app.panels.sidebarShown && this.app.sidebar.filtering) {
        this.app.sidebar.filter = (this.app.sidebar.filter ?? "") + line;
        this.app.panels.sidebarRefiltered();
      } else if (this.app.region === "outline" && this.app.panels.outlineShown && this.app.outline.filtering) {
        this.app.outline.filter = (this.app.outline.filter ?? "") + line;
        this.app.panels.outlineRefiltered();
      } else if (this.app.region === "problems" && this.app.problems.list().filtering) {
        this.app.problems.list().filter += line;
        this.app.problems.refiltered();
      }
      return;
    }
    if (o.kind === "prompt") {
      // Into the field being typed in: the replace field when it has focus; none in a yes/no
      // question or while each match is confirmed (keys there are answers, not text).
      if (o.confirm || o.replace?.confirm) return;
      if (o.replace?.focus) {
        o.replace.text += line;
        return;
      }
      o.text += line;
      o.change?.(o.text);
      if (o.replace && o.view) R.refresh(this.app, o, o.view);
    } else if (o.kind === "saveas") {
      // Into the name, or the new folder's.
      if (o.creating !== null) o.creating += line;
      else {
        o.name += line;
        o.focus = "name";
      }
    } else if (o.filterable) {
      o.input += line;
      refilter(o);
      const item = o.filtered[o.selected];
      if (item) o.move?.(item.item);
    }
  }

  /**
   * A key from the terminal. Keys are handled one at a time, in order: a key arriving while
   * another is still being handled (a fast typist, a paste, a command that awaits) waits its turn.
   */
  handleKey(key: string): Promise<void> {
    this.app.lastInputAt = this.app.now();
    const start = () => {
      this.keysInFlight++;
      return this.processKey(key).finally(() => this.keysInFlight--);
    };
    // Nothing in flight: start now (a click's key acts at once); else after the ones before it.
    this.keyQueue = this.keysInFlight === 0 ? start() : this.keyQueue.then(start);
    return this.keyQueue;
  }

  private keyQueue: Promise<void> = Promise.resolve();
  private keysInFlight = 0;

  /** Handle a key now, not queued: `.` replays its keys through this, inside its own turn. */
  async processKey(key: string): Promise<void> {
    // A big note still parsing (15.1): the key acts on it once it's there, not on its placeholder.
    while (this.app.views.parses.size) await Promise.all(this.app.views.parses);
    this.app.panels.fixRegion();
    try {
      await this.dispatchKey(key);
    } catch (err) {
      this.app.message("error", (err as Error).message);
    }
    this.app.saving.scheduleAutosave(); // the idle clock starts again at each key
    this.app.session.publishDirty();
    this.app.session.publishState();
    // A conflict that arrived while typing: its prompt now that typing stopped — not on the esc that
    // stopped it, since a second esc (closing the lens) would dismiss it unread.
    if (!this.app.overlay && key !== "escape" && !this.app.allViews().some((v) => v.insert)) {
      const waiting = this.app.allViews().find((v) => v.buf.conflictWaiting)?.buf;
      if (waiting) {
        if (waiting.dirty && waiting.changedOnDisk()) this.app.saving.conflictPrompt(waiting);
        else waiting.conflictWaiting = false;
      }
    }
    // A root's trust, asked while something else was open or someone typed: now, the same way.
    if (key !== "escape") this.app.languages.askTrustNow();
    this.app.host.requestRender();
  }

  /** The keymaps consulted in the current state, in priority order, with how to run a hit. */
  private maps(): {
    map: Keymap;
    run: (spec: string) => Promise<void> | void;
    info?: Record<string, { title: string; desc: string }>;
  }[] {
    const out: {
      map: Keymap;
      run: (spec: string) => Promise<void> | void;
      info?: Record<string, { title: string; desc: string }>;
    }[] = [];
    // A pane's own actions carry their titles (which-key says "New note here", as help does).
    if (this.app.region === "sidebar" && this.app.panels.sidebarShown)
      out.push(
        // The git panel's own keys (GIT-D12); the history takes the explorer's, read its way.
        this.app.leftView === "git"
          ? { map: this.app.gitKeys, run: (a) => this.app.gitPanel.action(a), info: GIT_ACTION_INFO }
          : {
              map: this.app.explorerKeys,
              run: (a) => this.app.explorer.action(a),
              info: this.app.leftView === "history" ? HISTORY_ACTION_INFO : EXPLORER_ACTION_INFO,
            },
      );
    if (this.app.region === "problems" && this.app.problems.panel.shown)
      out.push({
        map: this.app.problemsKeys,
        run: (a) => this.app.problems.panelAction(a),
        info: PROBLEMS_ACTION_INFO,
      });
    if (this.app.region === "outline" && this.app.panels.outlineShown) {
      out.push(
        this.app.rightView === "footnotes"
          ? { map: this.app.footnoteKeys, run: (a) => this.app.footnotes.action(a), info: FOOTNOTE_ACTION_INFO }
          : this.app.rightView === "info"
            ? { map: this.app.infoKeys, run: (a) => this.app.info.action(a), info: INFO_ACTION_INFO }
            : { map: this.app.outlineKeys, run: (a) => this.app.outlineView.action(a), info: OUTLINE_ACTION_INFO },
      );
    }
    if (this.app.view?.visual) out.push({ map: this.app.visualKeys, run: (s) => this.app.run(s) });
    // A peek's own keys (VV-D7) over the note's: o goes there, t keeps it as a tab, z fills the screen.
    else if (this.app.region === "content" && this.app.floating?.kind === "peek")
      out.push({ map: this.app.peekKeys, run: (s) => this.app.run(s) });
    // A review's (GIT-D3) and the merge screen's (GIT-D5): y, x, c; o, t, b and the rest.
    else if (this.app.region === "content" && this.app.floating?.kind === "review")
      out.push({ map: this.app.reviewKeys, run: (s) => this.app.run(s) });
    else if (this.app.region === "content" && this.app.floating?.kind === "merge")
      out.push({ map: this.app.mergeKeys, run: (s) => this.app.run(s) });
    // A diff window's (GIT-D2): tab switches a note's between its blocks and its lines.
    else if (this.app.region === "content" && this.app.floating?.kind === "diff")
      out.push({ map: this.app.diffKeys, run: (s) => this.app.run(s) });
    // Source mode's own keys (x deletes a character there) before the reading ones.
    if (this.app.region === "content" && editable(this.app.view) && !this.app.view!.visual)
      out.push({ map: this.app.sourceKeys, run: (s) => this.app.run(s) });
    out.push({ map: this.app.keymap, run: (s) => this.app.run(s) });
    return out;
  }

  /** which-key entries one level below the pending prefix, across the active keymaps. */
  whichKeyEntries(): { key: string; label: string; desc: string; group: boolean }[] {
    if (this.app.panels.resizeMode && !this.app.pending.length) {
      return mergeSameAction(
        this.app.resizeKeys.children("").map((c) => {
          const a = RESIZE_ACTIONS[c.spec ?? ""];
          return { key: c.key, label: a?.title ?? c.spec ?? "", desc: a?.desc ?? "", group: false, spec: c.spec };
        }),
      );
    }
    const prefix = this.app.pending.join(" ");
    const seen = new Map<string, { key: string; label: string; desc: string; group: boolean }>();
    const specs = new Map<string, string>();
    for (const { map, info } of this.maps()) {
      for (const c of map.children(prefix)) {
        if (seen.has(c.key)) continue;
        if (c.spec && !(c.group && !c.spec)) specs.set(c.key, c.spec);
        const full = prefix ? `${prefix} ${c.key}` : c.key;
        const group = c.group && !c.spec;
        if (group) {
          const g = this.app.groups.get(full);
          seen.set(c.key, { key: c.key, label: `+${g?.name ?? "more"}`, desc: g?.desc ?? "", group });
          continue;
        }
        const id = c.spec?.split(" ")[0] ?? "";
        const cmd = this.app.registry.get(id);
        const action = info?.[c.spec ?? ""];
        seen.set(c.key, {
          key: c.key,
          label: action?.title ?? cmd?.title ?? c.spec?.replace(/_/g, " ") ?? "",
          desc: action?.desc ?? cmd?.description ?? "",
          group,
        });
      }
    }
    return mergeSameAction([...seen.values()].map((e) => ({ ...e, spec: specs.get(e.key) ?? null })));
  }

  groupName(prefix: string[]): string {
    if (this.app.panels.resizeMode && !prefix.length) return "resize";
    const seq = prefix.join(" ");
    if (seq === this.app.leader) return "leader";
    return this.app.groups.get(seq)?.name ?? "";
  }

  /**
   * A top-level prefix's explanation (`z`, `[`, `]`, `g`…), for its popup's title (DF-D31): no popup above it lists
   * its group with it, as the leader's lists `+links`. Empty for any other.
   */
  groupExplanation(prefix: string[]): string {
    return prefix.length === 1 ? (this.app.groups.get(prefix[0]!)?.desc ?? "") : "";
  }

  clearPending(): void {
    this.app.pending = [];
    this.whichKey = false;
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    if (this.whichKeyTimer) clearTimeout(this.whichKeyTimer);
    this.pendingTimer = null;
    this.whichKeyTimer = null;
  }

  private startPending(key: string): void {
    this.app.pending.push(key);
    if (!this.app.config.input.which_key) return;
    if (this.app.pending[0] === this.app.leader) this.whichKey = true;
    else if (!this.whichKey && !this.whichKeyTimer) {
      this.whichKeyTimer = setTimeout(() => {
        this.whichKeyTimer = null;
        if (this.app.pending.length) {
          this.whichKey = true;
          this.app.host.requestRender();
        }
      }, this.app.config.input.which_key_delay_ms);
      (this.whichKeyTimer as { unref?: () => void }).unref?.();
    }
  }

  private async dispatchKey(key: string): Promise<void> {
    if (key.startsWith(PASTE)) return this.pasteNow(key.slice(PASTE.length));
    if (this.app.overlay) return this.app.overlays.key(this.app.overlay, key);
    if (
      this.app.region === "sidebar" &&
      this.app.panels.sidebarShown &&
      this.app.sidebar.filtering &&
      !this.app.pending.length
    )
      return this.app.panels.filterKey(key);
    // The git panel's message box, typed in (GIT-D8).
    if (
      this.app.region === "sidebar" &&
      this.app.panels.sidebarShown &&
      this.app.leftView === "git" &&
      this.app.gitPanel.typing &&
      !this.app.pending.length
    )
      return this.app.gitPanel.messageKey(key);
    if (
      this.app.region === "outline" &&
      this.app.panels.outlineShown &&
      this.app.outline.filtering &&
      !this.app.pending.length
    )
      return this.app.panels.outlineFilterKey(key);
    if (
      this.app.region === "problems" &&
      this.app.problems.panel.shown &&
      this.app.problems.list().filtering &&
      !this.app.pending.length
    )
      return this.app.problems.filterKey(key);
    // Insert mode: keys are text, except the few that edit or move (editing.ts); save still works.
    const iv = this.app.view;
    if (this.app.region === "content" && iv?.insert && !this.app.pending.length) {
      if (key === "ctrl+s") return void this.app.run("note.save");
      // Undo and redo as a desktop editor has them (DF-D15): typing goes on after them.
      if (key === "ctrl+z" || key === "ctrl+y") return void this.app.run(key === "ctrl+z" ? "edit.undo" : "edit.redo");
      // The completion popup's keys first (19.16): moving in it, accepting, closing.
      if (completionKey(this.app, iv, key)) {
        // ctrl+e closing it is part of the change: `.` closes the popup its replay opens again.
        if (key === "ctrl+e") insertRecord(this.app, iv, key);
        return;
      }
      // None showing: a word from the open files' words (25.5). Not a key of the change: the word accepted is.
      if (key === "ctrl+n" || key === "ctrl+p") {
        iv.sel = null;
        return completeWords(this.app, iv, key === "ctrl+p");
      }
      // A snippet's stops (25.8): tab and shift+tab between them; the first key at one replacing its placeholder.
      if (snippetKey(this.app, iv, key)) return;
      await insertKey(this.app, iv, key);
      afterInsertKey(this.app, iv, key);
      afterSnippetKey(this.app, iv);
      return insertRecord(this.app, iv, key);
    }
    // A command waiting for one character (f, t) in the render; in source vim.ts has it.
    if (this.app.region === "content" && this.app.vim.awaitChar && !editable(iv)) {
      const f = this.app.vim.awaitChar;
      this.app.vim.awaitChar = null;
      const ch = keyChar(key);
      if (ch !== null) f(ch);
      return;
    }
    // Source mode's normal mode: counts, operators and `.` around the keymaps (vim.ts).
    if (this.app.region === "content" && iv && editable(iv) && !iv.visual && !this.app.panels.resizeMode)
      return vimKey(this.app, iv, key, () => this.dispatchMapped(key));
    if (this.app.region === "content" && iv?.visual && !this.app.panels.resizeMode)
      return visualKey(this.app, iv, key, () => this.dispatchMapped(key));
    // From the render, a key that starts typing (o, i, a, A, I, O) switches the window to source:
    // the change it starts is recorded for `.` as if made there (insertRecord ends it at esc).
    const s = this.app.vim;
    const start =
      this.app.region === "content" && iv && !this.app.panels.resizeMode && !s.replaying
        ? { keys: [...this.app.pending, key], version: iv.buf.version }
        : null;
    await this.dispatchMapped(key);
    const v = this.app.view;
    if (start && v && v === iv && v.insert && editable(v)) {
      s.seq = start.keys;
      s.seqVersion = start.version;
      s.undoing = false;
      s.inInsert = true;
    }
  }

  /** A key through the keymaps: resize mode's, then pending sequences, then the bindings. */
  private async dispatchMapped(key: string): Promise<void> {
    if (this.app.panels.resizeMode && !this.app.pending.length) {
      const action = this.app.resizeKeys.lookup(key);
      if (action) return this.app.panels.resizeAction(action);
      // Any other key leaves resize mode and does what it normally does.
      this.app.panels.resizeMode = false;
    }
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (this.app.pending.length && key === "escape") return this.clearPending();
    if (this.app.pending.length && key === "backspace") {
      this.app.pending.pop();
      if (!this.app.pending.length) this.clearPending();
      return;
    }
    const seq = [...this.app.pending, key].join(" ");
    const maps = this.maps();
    const at = maps.findIndex((m) => m.map.lookup(seq) !== undefined);
    // Only keymaps at or above the one holding the binding may turn the key into a prefix:
    // visual mode's `y` must not wait for the normal keymap's `y y`.
    const prefixAt = maps.slice(0, at >= 0 ? at + 1 : maps.length).findIndex((m) => m.map.isPrefix(seq));
    // …and a prefix in a keymap above the binding's is that keymap's own: the explorer's `n n`
    // isn't the note's `n` (find next) after a pause.
    const hit =
      at >= 0 && !(prefixAt >= 0 && prefixAt < at) ? { ...maps[at]!, spec: maps[at]!.map.lookup(seq) } : undefined;
    if (prefixAt >= 0) {
      this.startPending(key);
      if (hit) {
        // Both a binding and a prefix: run it unless another key follows promptly.
        this.pendingTimer = setTimeout(() => {
          this.pendingTimer = null;
          this.clearPending();
          void Promise.resolve(hit.run(hit.spec!)).then(() => this.app.host.requestRender());
        }, this.app.config.input.which_key_delay_ms);
      }
      return;
    }
    this.clearPending();
    if (hit) return hit.run(hit.spec!);
    if (key !== "escape") this.app.message("info", `${prettyKey(seq, this.app.leader)} is not bound — ? lists keys`);
  }
}

// ---------------------------------------------------------------------------------------------

/** Keys that run the same action share one which-key entry: `h left → Narrower`. */
export function mergeSameAction(
  entries: { key: string; label: string; desc: string; group: boolean; spec: string | null }[],
): { key: string; label: string; desc: string; group: boolean }[] {
  const out: { key: string; label: string; desc: string; group: boolean; spec: string | null }[] = [];
  for (const e of entries.sort((a, b) => Number(b.group) - Number(a.group) || a.key.localeCompare(b.key))) {
    const same = !e.group && e.spec ? out.find((o) => !o.group && o.spec === e.spec) : undefined;
    if (same) same.key = `${same.key} ${e.key}`;
    else out.push({ ...e });
  }
  // Within an entry, letters before named keys (`j down`, `q enter escape`); entries by first key.
  const order = (a: string, b: string) => a.length - b.length || a.localeCompare(b);
  for (const o of out) o.key = o.key.split(" ").sort(order).join(" ");
  out.sort((a, b) => Number(b.group) - Number(a.group) || order(a.key.split(" ")[0]!, b.key.split(" ")[0]!));
  return out.map(({ spec: _, ...rest }) => rest);
}
