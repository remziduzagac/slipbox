// Overlays: the lists (pickers, menus, the palette's), prompts and yes-or-no dialogs over the windows, and their
// keys; the floating window closed or left.

import * as R from "./replacing.ts";
import { cancelGitRead } from "./gitquery.ts";
import { TOP } from "../core/position.ts";
import { saveAsKey } from "./saveas.ts";
import { NoteBuffer } from "./buffer.ts";
import { keyChar } from "./keys.ts";
import type { App, View, ListItem, ListOverlay, Overlay, PromptOverlay } from "./app.ts";
import { rank } from "./match.ts";
import { mergeClosed } from "./mergescreen.ts";
import { reviewEnded } from "./review.ts";

/** Lists, prompts, dialogs, and the floating window's closing. */
export class Overlays {
  constructor(readonly app: App) {}

  /** Close the floating editor, writing its text back first when it changed; false while that asks. A commit's: left. */
  closeFloating(): boolean {
    const f = this.app.floating;
    if (!f) return true;
    if (f.kind === "properties" && f.view.buf.dirty && !this.app.properties.write(f.view.buf.source, false, true))
      return false;
    // The scratch's typing saved as it closes (#43); a save refused (changed on disk meanwhile) keeps it open.
    if (f.kind === "scratch") {
      this.app.scratch.tidy(f.view.buf);
      if (f.view.buf.dirty && !this.app.saving.save(f.view.buf)) return false;
      this.app.history.remember(f.view);
    }
    this.app.floating = null;
    if (f.kind === "commit") {
      this.app.message("info", f.amend ? "not amended" : "not committed");
      this.app.git.commitDone(f.from);
    }
    // A report left (RPT-D1): back where it was opened from.
    if (f.kind === "report") this.app.report.closed(f.from);
    // A review closed (GIT-D3): what it did, said.
    if (f.kind === "review") reviewEnded(this.app, f.review);
    return true;
  }

  /**
   * The floating window closed by you (`esc`, `q`, `:q`): a diff's goes back to what it was opened from (GIT-D2); the
   * merge screen of the conflict prompt's (M)erge, to the prompt (GIT-D5).
   */
  leaveFloating(): void | Promise<void> {
    const f = this.app.floating;
    if (!this.closeFloating()) return;
    // Back to what it was opened from, which may be read again from git: the key's turn waits for it.
    if (f?.kind === "diff") return f.diff.back?.();
    if (f?.kind === "merge") mergeClosed(this.app, f.merge);
  }

  /**
   * What's under the cursor, in the floating window (19.12): markdown, rendered — a language server's
   * hover, or where a note's link lands. Read-only; esc or q closes it.
   */
  openHover(markdown: string, title: string): void {
    if (this.app.floating && !this.closeFloating()) return;
    const buf = new NoteBuffer(null, `hover:${title}`, `hover:${title}`);
    buf.kind = { group: "note", format: "markdown" };
    buf.virtual = { save: () => true };
    // Read, selected and copied from — never typed in (a version from git said read-only took typing).
    buf.readOnly = "the floating window is read-only";
    buf.loadText(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
    const fv = this.app.makeView(buf, { ...TOP }, { anchor: { ...TOP }, sub: 0, col: 0 });
    this.app.floating = { kind: "hover", view: fv, title };
    this.app.region = "content";
  }

  // -------------------------------------------------------------------------------------------
  // Overlays

  openList(opts: {
    title: string;
    items: ListItem[];
    accept: (item: ListItem) => unknown;
    move?: (item: ListItem) => void;
    cancel?: () => void;
    filterable?: boolean;
    selected?: number;
    source?: (input: string) => ListItem[] | null;
    submit?: (input: string) => boolean | Promise<boolean>;
    footer?: boolean;
    keepGroups?: boolean;
    alignKeysAcrossList?: boolean;
    anchor?: { x: number; y: number };
    menu?: boolean;
    /** Already typed in its filter. */
    input?: string;
    fold?: (item: ListItem, open: boolean) => boolean;
    widen?: () => void;
  }): void {
    const o: ListOverlay = {
      kind: "list",
      title: opts.title,
      input: opts.input ?? "",
      filterable: opts.filterable ?? true,
      items: opts.items,
      source: opts.source,
      filtered: [],
      selected: 0,
      scroll: 0,
      accept: opts.accept,
      submit: opts.submit,
      move: opts.move,
      cancel: opts.cancel,
      footer: opts.footer,
      keepGroups: opts.keepGroups,
      alignKeysAcrossList: opts.alignKeysAcrossList,
      anchor: opts.anchor,
      menu: opts.menu,
      fold: opts.fold,
      widen: opts.widen,
    };
    refilter(o);
    if (opts.selected !== undefined)
      o.selected = selectable(o, Math.max(0, Math.min(opts.selected, o.filtered.length - 1)), 1);
    this.app.overlay = o;
  }

  /**
   * Where your keys go now besides the app's own commands, as `Input.dispatchKey` sends them: a question, a key
   * sequence begun, a filter typed in (the left panel's, the outline's, Problems'), the git panel's message box, a
   * window over the note (a diff, the peek), the note in insert mode, a command of the note's waiting for its next key
   * (an operator, a count, `f`'s character), visual mode, resizing panes; "" for none.
   */
  keysGo(): string {
    const app = this.app;
    if (app.overlay) return "question";
    if (app.pending.length) return "sequence";
    const left = app.region === "sidebar" && app.panels.sidebarShown;
    if (left && app.sidebar.filtering) return "filter";
    if (left && app.leftView === "git" && app.gitPanel.typing) return "message";
    if (app.region === "outline" && app.panels.outlineShown && app.outline.filtering) return "outline's filter";
    if (app.region === "problems" && app.problems.panel.shown && app.problems.list().filtering)
      return "Problems' filter";
    if (app.region === "content" && app.floating) return "window";
    if (app.region === "content" && app.view?.insert) return "note";
    const vim = app.vim;
    if (app.region === "content" && (vim.op || vim.count || vim.awaitChar)) return "command";
    if (app.panels.resizeMode) return "resize";
    if (app.region === "content" && app.view?.visual) return "visual";
    return "";
  }

  /**
   * Whether something else has your keys since `since` (`keysGo` then, as something was asked for): a list opened now
   * would take them from it, a key meant for that answering the list. Where they went then isn't "else".
   */
  busy(since = ""): boolean {
    const now = this.keysGo();
    return now !== "" && now !== since;
  }

  /**
   * A list opened once something answers in the background (git, a helper), asked for when your keys went to `since`:
   * drawn as it comes, as a message is (D263), and never while something else has them (`busy`) — then it isn't opened,
   * and said so, to ask again; false.
   */
  openListLater(opts: Parameters<Overlays["openList"]>[0], since = ""): boolean {
    if (this.busy(since)) {
      this.app.message("info", `${opts.title} — not asked over what you were doing: ask again`);
      return false;
    }
    this.openList(opts);
    this.app.host.requestRender();
    return true;
  }

  prompt(
    label: string,
    accept: (text: string) => unknown,
    change?: (text: string) => unknown,
    cancel?: () => void,
    view?: View,
  ): void {
    this.app.overlay = { kind: "prompt", label, text: "", accept, change, cancel, view };
  }

  /** Ask a yes-or-no question (a floating window, like every question): `y` yes, `n` or `esc` no. */
  confirm(question: string, yes: () => void, no?: () => void): void {
    this.app.overlay = { kind: "prompt", label: question, text: "", confirm: true, accept: () => yes(), cancel: no };
  }

  /** A question's buttons, clicked: OK or Yes accepts, Cancel or No cancels. */
  answerDialog(ok: boolean): void {
    const o = this.app.overlay;
    if (o?.kind !== "prompt" || o.view) return;
    if (!ok) return this.close(true);
    this.app.overlay = null;
    o.accept(o.text);
  }

  close(cancelled: boolean): void {
    if (cancelled) cancelGitRead(this.app);
    const o = this.app.overlay;
    this.app.overlay = null;
    if (cancelled) o?.cancel?.();
  }

  private changed(o: PromptOverlay): void {
    void Promise.resolve(o.change?.(o.text)).finally(() => this.app.host.requestRender());
  }

  async key(o: Overlay, key: string): Promise<void> {
    if (o.kind === "saveas") return saveAsKey(this.app, o, key);
    // Replacing: closing the rows keeps the search, the cursor and the edits (nothing to cancel).
    if (o.kind === "prompt" && o.replace?.confirm && o.view) return R.confirmKey(this.app, o, o.view, key);
    if (o.kind === "prompt" && o.replace && (key === "escape" || key === "ctrl+c" || key === "ctrl+g")) {
      this.app.overlay = null;
      return void (await o.accept(o.text));
    }
    if (key === "escape" || key === "ctrl+c" || key === "ctrl+g") return this.close(true);
    const typed = keyChar(key);
    if (o.kind === "prompt" && o.confirm) {
      if (typed === "y" || typed === "Y") return this.answerDialog(true);
      if (typed === "n" || typed === "N") return this.answerDialog(false);
      return;
    }
    if (o.kind === "prompt") {
      // A find across files: the window's toggles, said in its label.
      if (o.toggles && (key === "alt+r" || key === "alt+w")) {
        this.app.search.toggleFindOpt(o.toggles.view, key === "alt+r" ? "regex" : "whole");
        o.label = o.toggles.label();
        return;
      }
      // The find row's toggles, while typing in it.
      if (o.view && (key === "alt+r" || key === "alt+w")) {
        this.app.search.toggleFindOpt(o.view, key === "alt+r" ? "regex" : "whole");
        if (o.replace) void R.refresh(this.app, o, o.view).finally(() => this.app.host.requestRender());
        else this.changed(o);
        return;
      }
      if (o.view && key === "alt+h") return void this.app.search.toggleReplaceRow(o.view);
      // Find's replace field: tab or ctrl+h into it, shift+tab back to the find field.
      if (o.view && (key === "tab" || key === "ctrl+h")) return R.openReplace(this.app, o, o.view);
      if (o.view && o.replace && key === "shift+tab") {
        o.replace.focus = false;
        return;
      }
      if (o.view && o.replace?.focus) return this.app.search.replaceFieldKey(o, o.view, key, typed);
      if (o.view && o.replace && key === "enter") {
        // Closing the pair keeps the search (and what was replaced); it doesn't undo anything.
        this.app.overlay = null;
        return void (await o.accept(o.text));
      }
      if (key === "enter") {
        this.app.overlay = null;
        return void (await o.accept(o.text));
      }
      if (key === "backspace") o.text = [...o.text].slice(0, -1).join("");
      else if (key === "ctrl+w" || key === "ctrl+backspace") o.text = o.text.replace(/\S*\s*$/, "");
      else if (key === "ctrl+u") o.text = "";
      else if (typed !== null) o.text += typed;
      else return;
      this.changed(o);
      if (o.replace && o.view) void R.refresh(this.app, o, o.view).finally(() => this.app.host.requestRender()); // the count of what enter would replace, as you type
      return;
    }
    // A tree (the folder picker): ← folds, → unfolds; the selection stays on its item.
    if (o.fold && (key === "left" || key === "right")) {
      const cur = o.filtered[o.selected]?.item;
      if (cur && o.fold(cur, key === "right")) {
        refilter(o);
        const at = o.filtered.findIndex((e) => e.item.data === cur.data);
        if (at >= 0) o.selected = at;
      }
      return;
    }
    const n = o.filtered.length;
    // Group headings are skipped, in the direction of travel.
    const moveTo = (i: number, dir = i >= o.selected ? 1 : -1) => {
      o.wheeled = false;
      o.selected = selectable(o, Math.max(0, Math.min(n - 1, i)), dir);
      const item = o.filtered[o.selected];
      if (item) o.move?.(item.item);
    };
    switch (key) {
      case "enter": {
        // Awaited only when it's a promise: an ordinary list's enter (a click's too) acts at once, as it did.
        const submitted = o.submit?.(o.input);
        if (submitted instanceof Promise ? await submitted : submitted) {
          if (this.app.overlay === o) this.app.overlay = null;
          return;
        }
        const item = o.filtered[o.selected];
        if (!item) return this.close(true); // nothing to accept: undo any live preview
        this.app.overlay = null;
        await o.accept(item.item);
        return;
      }
      case "down":
      case "ctrl+n":
      case "ctrl+j":
      case "tab":
        return moveTo(step(o, 1), 1);
      case "up":
      case "ctrl+p":
      case "ctrl+k":
      case "shift+tab":
        return moveTo(step(o, -1), -1);
      case "pagedown":
      case "ctrl+d":
        return moveTo(o.selected + 10);
      case "pageup":
      case "ctrl+u":
        return moveTo(o.selected - 10);
      case "ctrl+a":
        if (!o.widen) break;
        o.widen();
        refilter(o);
        return;
    }
    if (!o.filterable) {
      // An item's own key picks it.
      // Its case first (a menu's `R` isn't its `r`), then either.
      const exact = o.filtered.findIndex((e) => e.item.hotkey && e.item.hotkey === typed);
      const hot =
        exact >= 0
          ? exact
          : o.filtered.findIndex((e) => e.item.hotkey && e.item.hotkey === (typed ?? "").toLowerCase());
      if (hot >= 0) {
        o.selected = hot;
        return this.key(o, "enter");
      }
      if (key === "j") return moveTo(o.selected + 1);
      if (key === "k") return moveTo(o.selected - 1);
      return;
    }
    if (key === "backspace") o.input = [...o.input].slice(0, -1).join("");
    else if (key === "ctrl+w" || key === "ctrl+backspace") o.input = o.input.replace(/\S*\s*$/, "");
    else if (typed !== null) o.input += typed;
    else return;
    refilter(o);
    const item = o.filtered[o.selected];
    if (item) o.move?.(item.item);
  }
}

export function refilter(o: ListOverlay): void {
  const computed = o.source?.(o.input) ?? null;
  if (computed) {
    o.filtered = computed.map((item) => ({ item, positions: [] }));
  } else if (o.keepGroups && o.input.trim()) {
    // The matches in their original order, each under its group heading (with its blank row and
    // rule); a group with no match disappears, and the list never starts with a blank row.
    const ranked = rank(
      o.input,
      o.items.filter((i) => !i.header),
      (i) => [i.label, i.detail ?? ""],
    );
    const hit = new Map(ranked.map((r) => [r.item, r.match.positions]));
    o.filtered = [];
    let heading: ListItem[] = [];
    let prevHeader = false;
    for (const item of o.items) {
      if (item.header) {
        if (!prevHeader) heading = [];
        heading.push(item);
        prevHeader = true;
        continue;
      }
      prevHeader = false;
      if (!hit.has(item)) continue;
      for (const hd of heading)
        if (o.filtered.length || hd.label || hd.rule) o.filtered.push({ item: hd, positions: [] });
      heading = [];
      o.filtered.push({ item, positions: hit.get(item)! });
    }
  } else if (o.input.trim()) {
    const ranked = rank(
      o.input,
      o.items.filter((i) => !i.header),
      (i) => [i.label, i.detail ?? ""],
    );
    o.filtered = ranked.map((r) => ({ item: r.item, positions: r.match.positions }));
  } else {
    o.filtered = o.items.map((item) => ({ item, positions: [] }));
  }
  o.scroll = 0;
  o.wheeled = false;
  const hit = o.filtered.findIndex((e) => e.item.context);
  o.selected =
    hit >= 0
      ? Math.max(
          0,
          o.filtered.findIndex((e) => !e.item.context && !e.item.header),
        )
      : selectable(o, 0, 1);
}

/** One entry up or down, skipping headings, wrapping around past the first or last entry. */
export function step(o: ListOverlay, dir: number): number {
  const n = o.filtered.length;
  for (let k = o.selected + dir; k >= 0 && k < n; k += dir) if (!o.filtered[k]!.item.header) return k;
  for (let k = dir > 0 ? 0 : n - 1; k >= 0 && k < n; k += dir) if (!o.filtered[k]!.item.header) return k;
  return o.selected;
}

/** The nearest item at or after `i` (before, for dir -1) that is not a group heading. */
export function selectable(o: ListOverlay, i: number, dir: number): number {
  const n = o.filtered.length;
  for (let k = i; k >= 0 && k < n; k += dir) if (!o.filtered[k]!.item.header) return k;
  for (let k = i; k >= 0 && k < n; k -= dir) if (!o.filtered[k]!.item.header) return k;
  return 0;
}
