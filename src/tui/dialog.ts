// The dialog (UPG): a question with controls of its own — its text, a select of choices, one marked, and checkboxes —
// framed like the other popups (`draw-overlays.ts` draws it). The update offer is its first, a restart's question
// about notes unsaved its second. The cursor moves over the choices, then the checkboxes (`↑`/`↓`, `j`/`k`, `tab`,
// `ctrl+n`/`ctrl+p`, wrapping), marking a choice it lands on; `space` ticks a checkbox; `enter` does the choice
// marked; `esc` cancels. A click on a choice does it, on a checkbox ticks it, outside cancels. One that opens on its
// own drops the keys, pastes and clicks that arrived in its first half second, by when each arrived — one meant for a
// note never answers it.

import type { App } from "./app.ts";

export interface DialogChoice {
  id: string;
  label: string;
  /** What it does, said under the rule while the cursor is on it. */
  help: string;
}

export interface DialogCheckbox {
  id: string;
  label: string;
  help: string;
  ticked: boolean;
  /** The choices it goes with: with any other marked, it's dimmed, and not taken. */
  with?: string[];
}

export interface DialogOverlay {
  kind: "dialog";
  title: string;
  text: string;
  choices: DialogChoice[];
  checkboxes: DialogCheckbox[];
  /** The choice marked. */
  chosen: number;
  /** The row under the cursor: a choice's index, then the checkboxes', after the choices. */
  cursor: number;
  /** What `esc` does, said in the keys' row: `not now`, `cancel`. */
  escape: string;
  /** When it opened; opened on its own (`unasked`), what arrives before half a second on is dropped. */
  openedAt: number;
  unasked: boolean;
  /** The choice done, with the checkboxes ticked (a dimmed one never is). */
  done(choice: string, ticked: Set<string>): void;
  cancel?(): void;
}

/** What arrives this soon after an unasked dialog opens is dropped. */
export const DROP_MS = 500;

/** The dialog opened over everything: the first choice marked, the cursor on it. */
export function openDialog(
  app: App,
  opts: {
    title: string;
    text: string;
    choices: DialogChoice[];
    checkboxes?: DialogCheckbox[];
    escape?: string;
    unasked?: boolean;
    done: DialogOverlay["done"];
    cancel?: () => void;
  },
): DialogOverlay {
  const o: DialogOverlay = {
    kind: "dialog",
    title: opts.title,
    text: opts.text,
    choices: opts.choices,
    checkboxes: opts.checkboxes ?? [],
    chosen: 0,
    cursor: 0,
    escape: opts.escape ?? "cancel",
    openedAt: app.now(),
    unasked: opts.unasked ?? false,
    done: opts.done,
    cancel: opts.cancel,
  };
  app.overlay = o;
  return o;
}

/** Whether a checkbox is dimmed: it goes with other choices than the one marked. */
export function dimmed(o: DialogOverlay, box: DialogCheckbox): boolean {
  return !!box.with && !box.with.includes(o.choices[o.chosen]?.id ?? "");
}

/** What arrived at `at` is too early to answer it: before it opened, or in its first half second. */
export function tooEarly(o: DialogOverlay, at: number): boolean {
  return o.unasked && at < o.openedAt + DROP_MS;
}

/** The help of the row under the cursor. */
export function cursorHelp(o: DialogOverlay): string {
  const n = o.choices.length;
  return o.cursor < n ? (o.choices[o.cursor]?.help ?? "") : (o.checkboxes[o.cursor - n]?.help ?? "");
}

function moveTo(o: DialogOverlay, row: number): void {
  const rows = o.choices.length + o.checkboxes.length;
  o.cursor = (row + rows) % rows;
  if (o.cursor < o.choices.length) o.chosen = o.cursor;
}

function tick(o: DialogOverlay, i: number): void {
  const box = o.checkboxes[i];
  if (box && !dimmed(o, box)) box.ticked = !box.ticked;
}

function finish(app: App, o: DialogOverlay): void {
  const choice = o.choices[o.chosen];
  if (!choice) return;
  app.overlay = null;
  o.done(choice.id, new Set(o.checkboxes.filter((b) => b.ticked && !dimmed(o, b)).map((b) => b.id)));
}

function cancel(app: App, o: DialogOverlay): void {
  app.overlay = null;
  o.cancel?.();
}

const UP = new Set(["up", "k", "shift+tab", "ctrl+p"]);
const DOWN = new Set(["down", "j", "tab", "ctrl+n"]);

/** A key in the dialog, arrived at `at`. */
export function dialogKey(app: App, o: DialogOverlay, key: string, at: number): void {
  if (tooEarly(o, at)) return;
  if (UP.has(key)) return moveTo(o, o.cursor - 1);
  if (DOWN.has(key)) return moveTo(o, o.cursor + 1);
  if (key === "space") {
    if (o.cursor >= o.choices.length) tick(o, o.cursor - o.choices.length);
    return;
  }
  if (key === "enter") return finish(app, o);
  if (key === "escape" || key === "ctrl+c" || key === "ctrl+g") return cancel(app, o);
}

/** Where the dialog's parts are on screen, for the mouse (`draw-overlays.ts` fills it). */
export interface DialogGeometry {
  box: { x: number; y: number; w: number; h: number };
  /** Each choice's row, then each checkbox's: its y, and the row's number as the cursor counts them. */
  rows: { y: number; x: number; w: number; row: number }[];
}

/** The mouse in the dialog, now: a choice clicked is marked and done; a checkbox clicked ticks; outside cancels. */
export function dialogMouse(app: App, o: DialogOverlay, ev: { type: string; x: number; y: number }, g: DialogGeometry) {
  if (ev.type !== "down" || tooEarly(o, app.now())) return;
  const hit = g.rows.find((r) => r.y === ev.y && ev.x >= r.x && ev.x < r.x + r.w);
  if (hit) {
    moveTo(o, hit.row);
    if (hit.row < o.choices.length) return finish(app, o);
    return tick(o, hit.row - o.choices.length);
  }
  const b = g.box;
  if (ev.x < b.x || ev.x >= b.x + b.w || ev.y < b.y || ev.y >= b.y + b.h) cancel(app, o);
}
