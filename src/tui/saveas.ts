// A "Save As" window (plan 10.14), for where an export goes: places down the left — beside the note, where you
// exported last, your folders, this root — the folder you're in on the right, its folders and files (a file's size and
// date), and the file's name at the bottom. `tab` moves between the three; in the folder, `enter` or `→` goes into a
// folder (a file: its name taken), `←` up, typing jumps to what starts so (`.` first: the hidden ones too), `~` home,
// `ctrl+n` a new folder; `enter` in the name exports. The mouse: a click picks, a second opens, the wheel scrolls.

import { mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { namesFolder } from "../core/export/index.ts";
import type { App } from "./app.ts";
import { keyChar } from "./keys.ts";

export interface SaveEntry {
  name: string;
  dir: boolean;
  /** The row that goes up a folder. */
  up?: boolean;
  size: number;
  mtime: number;
}

export interface SavePlace {
  label: string;
  path: string;
}

export interface SaveAsOverlay {
  kind: "saveas";
  title: string;
  /** The folder shown, whole. */
  dir: string;
  /** The file's name, as typed. */
  name: string;
  /** The name it was opened with: what a folder typed into gives back. */
  suggested: string;
  focus: "places" | "files" | "name";
  places: SavePlace[];
  place: number;
  placeScroll: number;
  entries: SaveEntry[];
  selected: number;
  scroll: number;
  /** Hidden files and folders shown (typing a `.` first shows them). */
  hidden: boolean;
  /** A new folder's name being typed (`ctrl+n`), else null. */
  creating: string | null;
  /** Why the folder shows nothing it holds (it can't be read), or why a folder couldn't be made. */
  error: string | null;
  /** What's been typed in the folder to jump to an entry, and when. */
  typed: { text: string; at: number };
  /** The last click on an entry: a second on it soon after opens it. */
  click: { index: number; at: number } | null;
  /** The file chosen: its whole path. */
  accept(path: string): void;
  cancel?(): void;
}

/** A second click within this long opens what the first picked. */
const DOUBLE_MS = 450;
/** Typing to jump starts again after this long. */
const TYPED_MS = 1000;

/** The entries of `dir`: "‥" first (but at `/`), its folders, then its files, by name; hidden ones when asked. */
export function listFolder(dir: string, hidden: boolean): { entries: SaveEntry[]; error: string | null } {
  const up: SaveEntry[] = dirname(dir) !== dir ? [{ name: "‥", dir: true, up: true, size: 0, mtime: 0 }] : [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    return { entries: up, error: `can't be read (${(err as NodeJS.ErrnoException).code ?? "error"})` };
  }
  const entries: SaveEntry[] = [];
  for (const name of names) {
    if (!hidden && name.startsWith(".")) continue;
    try {
      const st = statSync(join(dir, name));
      if (st.isDirectory() || st.isFile())
        entries.push({ name, dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs });
    } catch {}
  }
  const byName = (a: SaveEntry, b: SaveEntry) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  return {
    entries: [...up, ...entries.filter((e) => e.dir).sort(byName), ...entries.filter((e) => !e.dir).sort(byName)],
    error: null,
  };
}

/** The window, opened at `dir` with `name` typed: the name has the focus, so `enter` exports at once. */
export function openSaveAs(
  app: App,
  opts: {
    title: string;
    dir: string;
    name: string;
    places: SavePlace[];
    accept: (path: string) => void;
    cancel?: () => void;
  },
): SaveAsOverlay {
  const o: SaveAsOverlay = {
    kind: "saveas",
    title: opts.title,
    dir: opts.dir,
    name: opts.name,
    suggested: opts.name,
    focus: "name",
    places: opts.places,
    place: 0,
    placeScroll: 0,
    entries: [],
    selected: 0,
    scroll: 0,
    hidden: false,
    creating: null,
    error: null,
    typed: { text: "", at: 0 },
    click: null,
    accept: opts.accept,
    cancel: opts.cancel,
  };
  go(o, opts.dir);
  app.overlay = o;
  return o;
}

/** Into `dir`: its entries listed, the place it is marked; `from`, the folder come up from, selected. */
export function go(o: SaveAsOverlay, dir: string, from?: string): void {
  o.dir = dir;
  const listed = listFolder(dir, o.hidden);
  o.entries = listed.entries;
  o.error = listed.error;
  const back = from ? o.entries.findIndex((e) => e.dir && !e.up && join(dir, e.name) === from) : -1;
  o.selected = back >= 0 ? back : o.entries[0]?.up && o.entries.length > 1 ? 1 : 0;
  o.scroll = 0;
  const here = placeOf(o.places, dir);
  if (here >= 0) o.place = here;
}

/** The place `dir` is in: the one it is, else the nearest that holds it; -1 for none. */
export function placeOf(places: SavePlace[], dir: string): number {
  let best = -1;
  for (const [i, p] of places.entries()) {
    const holds = dir === p.path || dir.startsWith(p.path.endsWith("/") ? p.path : `${p.path}/`);
    if (holds && (best < 0 || p.path.length > places[best]!.path.length)) best = i;
  }
  return best;
}

/** The entry selected, opened: a folder gone into, "‥" up, a file's name taken (the name gets the focus). */
function open(o: SaveAsOverlay): void {
  const e = o.entries[o.selected];
  if (!e) return;
  if (e.up) return go(o, dirname(o.dir), o.dir);
  if (e.dir) return go(o, join(o.dir, e.name));
  o.name = e.name;
  o.focus = "name";
}

/** The file the name says, in the folder shown (`~/` home; a path from the folder, or whole). */
export function chosen(app: App, o: SaveAsOverlay): string {
  const n = o.name.trim();
  return n.startsWith("~/") ? join(app.home, n.slice(2)) : isAbsolute(n) ? n : resolve(o.dir, n);
}

/**
 * Export: the window closed and the file given, or — the name a folder — that folder gone into; one ending in `/` made
 * first where it isn't there.
 */
function finish(app: App, o: SaveAsOverlay): void {
  if (!o.name.trim()) return;
  const path = chosen(app, o);
  let folder = false;
  try {
    folder = statSync(path).isDirectory();
  } catch {}
  if (!folder && namesFolder(o.name.trim())) {
    try {
      mkdirSync(path, { recursive: true });
      folder = true;
    } catch (err) {
      o.error = `${o.name.trim()} can't be made (${(err as NodeJS.ErrnoException).code ?? "error"})`;
      return;
    }
  }
  if (folder) {
    go(o, path);
    o.name = o.suggested;
    return;
  }
  app.overlay = null;
  o.accept(path);
}

/** A new folder, named as typed, made where you are and gone into. */
function create(o: SaveAsOverlay): void {
  const name = (o.creating ?? "").trim();
  o.creating = null;
  if (!name || name.includes("/")) return;
  try {
    mkdirSync(join(o.dir, name));
  } catch (err) {
    o.error = `${name} can't be made (${(err as NodeJS.ErrnoException).code ?? "error"})`;
    return;
  }
  go(o, join(o.dir, name));
}

const FOCUS: SaveAsOverlay["focus"][] = ["places", "files", "name"];

/** A key in the window. */
export function saveAsKey(app: App, o: SaveAsOverlay, key: string): void {
  const typed = keyChar(key);
  if (o.creating !== null) {
    if (key === "escape" || key === "ctrl+c") o.creating = null;
    else if (key === "enter") create(o);
    else if (key === "backspace") o.creating = [...o.creating].slice(0, -1).join("");
    else if (typed !== null) o.creating += typed;
    return;
  }
  if (key === "escape" || key === "ctrl+c" || key === "ctrl+g") {
    app.overlay = null;
    return o.cancel?.();
  }
  if (key === "tab" || key === "shift+tab") {
    o.focus = FOCUS[(FOCUS.indexOf(o.focus) + (key === "tab" ? 1 : FOCUS.length - 1)) % FOCUS.length]!;
    return;
  }
  if (key === "ctrl+n") {
    o.creating = "";
    o.error = null;
    return;
  }
  if (o.focus === "name") {
    if (key === "enter") return finish(app, o);
    if (key === "down" || key === "up") o.focus = "files";
    else if (key === "backspace") o.name = [...o.name].slice(0, -1).join("");
    else if (key === "ctrl+w" || key === "ctrl+backspace") o.name = o.name.replace(/[^/\s]*[/\s]*$/, "");
    else if (key === "ctrl+u") o.name = "";
    else if (typed !== null) o.name += typed;
    return;
  }
  if (o.focus === "places") {
    if (key === "up") o.place = Math.max(0, o.place - 1);
    else if (key === "down") o.place = Math.min(o.places.length - 1, o.place + 1);
    else if (key === "enter" || key === "right") {
      const p = o.places[o.place];
      if (p) go(o, p.path);
      o.focus = "files";
    }
    return;
  }
  // The folder. A key that isn't typing starts what's typed again.
  if (typed === null) o.typed = { text: "", at: 0 };
  const n = o.entries.length;
  const page = 10;
  if (key === "up") o.selected = Math.max(0, o.selected - 1);
  else if (key === "down") o.selected = Math.min(n - 1, o.selected + 1);
  else if (key === "pageup") o.selected = Math.max(0, o.selected - page);
  else if (key === "pagedown") o.selected = Math.min(n - 1, o.selected + page);
  else if (key === "home") o.selected = 0;
  else if (key === "end") o.selected = Math.max(0, n - 1);
  else if (key === "enter" || key === "right") open(o);
  else if (key === "left" || key === "backspace") {
    if (dirname(o.dir) !== o.dir) go(o, dirname(o.dir), o.dir);
  } else if (typed === "~") {
    o.typed = { text: "", at: 0 };
    go(o, app.home);
  } else if (typed !== null) jump(app, o, typed);
}

/** Typing in the folder: to the next entry whose name starts with what's been typed; a `.` first shows hidden ones. */
function jump(app: App, o: SaveAsOverlay, ch: string): void {
  const now = app.now();
  const text = (now - o.typed.at < TYPED_MS ? o.typed.text : "") + ch;
  o.typed = { text, at: now };
  if (text === "." && !o.hidden) {
    o.hidden = true;
    const at = o.entries[o.selected]?.name;
    go(o, o.dir);
    o.selected = Math.max(
      0,
      o.entries.findIndex((e) => e.name === at),
    );
  }
  const lower = text.toLowerCase();
  const n = o.entries.length;
  // A letter again (one typed alone) goes on to the next that starts so.
  const from = text.length === 1 ? o.selected + 1 : o.selected;
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n;
    const e = o.entries[i]!;
    if (!e.up && e.name.toLowerCase().startsWith(lower)) {
      o.selected = i;
      return;
    }
  }
}

/** Where the window's parts are on screen, for the mouse (`draw.ts` fills it). */
export interface SaveAsGeometry {
  box: { x: number; y: number; w: number; h: number };
  places: { x: number; y: number; w: number; h: number };
  files: { x: number; y: number; w: number; h: number };
  name: { x: number; y: number; w: number; h: number };
}

const inside = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** The mouse in the window: a place clicked goes there; an entry clicked is picked, clicked again opened; the name
 *  clicked takes the focus; the wheel scrolls the folder or the places; a click outside cancels. */
export function saveAsMouse(
  app: App,
  o: SaveAsOverlay,
  ev: { type: string; x: number; y: number; scroll?: { direction: string } },
  g: SaveAsGeometry,
  hot: string | null,
): void {
  if (ev.type === "scroll") {
    const d = ev.scroll?.direction === "up" ? -3 : ev.scroll?.direction === "down" ? 3 : 0;
    if (inside(g.places, ev.x, ev.y))
      o.placeScroll = Math.max(0, Math.min(Math.max(0, o.places.length - g.places.h), o.placeScroll + d));
    else {
      o.scroll = Math.max(0, Math.min(Math.max(0, o.entries.length - g.files.h), o.scroll + d));
      o.selected = Math.min(Math.max(o.selected, o.scroll), o.scroll + g.files.h - 1, o.entries.length - 1);
    }
    return;
  }
  if (ev.type !== "down") return;
  if (hot === "sav:ok") return finish(app, o);
  if (hot === "sav:cancel") return saveAsKey(app, o, "escape");
  if (inside(g.places, ev.x, ev.y)) {
    const i = o.placeScroll + ev.y - g.places.y;
    const p = o.places[i];
    if (!p) return;
    o.place = i;
    o.focus = "places";
    go(o, p.path);
    return;
  }
  if (inside(g.files, ev.x, ev.y)) {
    const i = o.scroll + ev.y - g.files.y;
    if (!o.entries[i]) return;
    const now = app.now();
    const again = o.click?.index === i && now - o.click.at < DOUBLE_MS;
    o.selected = i;
    o.focus = "files";
    o.click = again ? null : { index: i, at: now };
    if (again) open(o);
    return;
  }
  if (inside(g.name, ev.x, ev.y)) {
    o.focus = "name";
    return;
  }
  if (!inside(g.box, ev.x, ev.y)) saveAsKey(app, o, "escape");
}

/** A size as a person reads it: `812 B`, `84 KB`, `3.1 MB`. */
export function sizeText(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A date as a file list shows it: `Sep 30` this year, `2025-09-30` before. */
export function dateText(ms: number, now: number): string {
  const d = new Date(ms);
  if (d.getFullYear() === new Date(now).getFullYear())
    return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, " ")}`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
