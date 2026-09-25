// Default keymap (3.12), as decided in docs/design/keymap.md. Every binding names a command id
// from the registry (0.8), and config overrides any of it: `[keys]`, `[keys.visual]`,
// `[keys.explorer]`, `[keys.outline]`, the leader, which-key `[groups]` and `:` `[aliases]`.
// Sequences are written in config notation; `leader` stands for the configured leader key.

import { canonKey } from "../core/commands.ts";

/** Movement commands: bound plain to move, and with `shift+` (or in visual mode) to extend. */
const MOVES: [id: string, keys: string[], extendKeys: string[]][] = [
  ["cursor.left", ["h", "left"], ["shift+left"]],
  ["cursor.right", ["l", "right"], ["shift+right"]],
  ["cursor.up", ["k", "up"], ["shift+up"]],
  ["cursor.down", ["j", "down"], ["shift+down"]],
  ["cursor.word_prev", ["b", "alt+left"], ["shift+alt+left"]],
  ["cursor.word_next", ["w", "alt+right"], ["shift+alt+right"]],
  ["cursor.word_end", ["e"], []],
  ["cursor.line_start", ["0", "home", "ctrl+left", "cmd+left"], ["shift+home", "shift+ctrl+left", "shift+cmd+left"]],
  ["cursor.line_end", ["$", "end", "ctrl+right", "cmd+right"], ["shift+end", "shift+ctrl+right", "shift+cmd+right"]],
  ["cursor.first_nonblank", ["^"], []],
  ["cursor.top", ["g g", "ctrl+home"], ["shift+ctrl+home"]],
  ["cursor.bottom", ["shift+g", "ctrl+end"], ["shift+ctrl+end"]],
  ["cursor.heading_prev", ["[ [", "alt+up"], []],
  ["cursor.heading_next", ["] ]", "alt+down"], []],
  ["cursor.paragraph_prev", ["{", "ctrl+up"], ["shift+ctrl+up"]],
  ["cursor.paragraph_next", ["}", "ctrl+down"], ["shift+ctrl+down"]],
  ["cursor.half_down", ["ctrl+d"], []],
  ["cursor.half_up", ["ctrl+u"], []],
  ["cursor.page_down", ["pagedown"], ["shift+pagedown"]],
  ["cursor.page_up", ["pageup"], ["shift+pageup"]],
];

export const MOVE_COMMANDS = new Set(MOVES.map((m) => m[0]));

function movementBindings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, keys, ext] of MOVES) {
    for (const k of keys) out[k] = id;
    for (const k of ext) out[k] = `${id} extend`;
  }
  return out;
}

export const DEFAULT_KEYS: Record<string, string> = {
  ...movementBindings(),
  // selection and copy
  v: "visual.char",
  "shift+v": "visual.line",
  escape: "app.escape",
  "y y": "copy.smart",
  "ctrl+c": "copy.selection",
  "y p": "copy.path",
  "y r": "copy.ref",
  "y l": "copy.link",
  // links
  "ctrl+tab": "link.next",
  "ctrl+shift+tab": "link.prev",
  enter: "link.follow",
  "ctrl+enter": "link.follow",
  "leader l n": "link.next",
  "leader l p": "link.prev",
  "leader l f": "link.follow",
  "leader l s": "link.follow_split",
  "leader l y": "copy.link",
  "leader l l": "links.open",
  "leader l b": "backlinks.open",
  // history
  "shift+h": "history.back",
  "shift+l": "history.forward",
  "ctrl+backspace": "history.back",
  "leader h p": "history.back",
  "leader h n": "history.forward",
  "leader h h": "history.list",
  // windows (focus and move are added below, for letters and arrows)
  "ctrl+w v": "window.split_side",
  "ctrl+w |": "window.split_side",
  "ctrl+w s": "window.split_stacked",
  "ctrl+w -": "window.split_stacked",
  "ctrl+w w": "window.other",
  "ctrl+w x": "window.swap",
  "ctrl+w q": "window.close",
  "ctrl+w o": "window.only",
  "leader w v": "window.split_side",
  "leader w s": "window.split_stacked",
  "leader w w": "window.other",
  "leader w x": "window.swap",
  "leader w q": "window.close",
  "leader w o": "window.only",
  // tabs (1..9 added below)
  "ctrl+t o": "tab.new",
  "ctrl+t t": "tab.list",
  "ctrl+t n": "tab.next",
  "ctrl+t right": "tab.next",
  "ctrl+pagedown": "tab.next",
  "ctrl+t p": "tab.prev",
  "ctrl+t left": "tab.prev",
  "ctrl+pageup": "tab.prev",
  "ctrl+t shift+h": "tab.move_left",
  "ctrl+t shift+left": "tab.move_left",
  "ctrl+t shift+l": "tab.move_right",
  "ctrl+t shift+right": "tab.move_right",
  "ctrl+t q": "tab.close",
  "leader t o": "tab.new",
  "leader t t": "tab.list",
  "leader t n": "tab.next",
  "leader t p": "tab.prev",
  "leader t shift+h": "tab.move_left",
  "leader t shift+left": "tab.move_left",
  "leader t shift+l": "tab.move_right",
  "leader t shift+right": "tab.move_right",
  "leader t q": "tab.close",
  // explorer and outline
  "ctrl+e": "explorer.cycle",
  "leader e": "explorer.cycle",
  "ctrl+shift+e": "explorer.reveal",
  "leader shift+e": "explorer.reveal",
  "ctrl+o": "outline.toggle",
  "leader o": "outline.toggle",
  // find
  "ctrl+f": "find.open",
  "/": "find.open",
  n: "find.next",
  "shift+n": "find.prev",
  "leader f /": "find.open",
  "ctrl+p": "switcher.open",
  "leader f f": "switcher.open",
  "leader f o": "outline.pick",
  ":": "palette.open",
  "leader f p": "palette.open",
  // ui
  "leader u u": "ui.list",
  "leader u t": "theme.pick",
  "leader u g": "glyphs.pick",
  "leader u w": "ui.readable",
  "leader u z": "ui.zen",
  "leader u l": "ui.cursorline",
  "leader u n": "ui.line_numbers",
  "leader u r": "ui.urls",
  "leader u m": "ui.mouse",
  // scratch
  "leader s s": "scratch.open",
  "leader s a": "scratch.add",
  "leader s y": "scratch.copy",
  "leader s d": "scratch.clear",
  // note, vault, app
  "leader n r": "note.reload",
  "leader n i": "note.info",
  "leader v r": "vault.reindex",
  "leader v i": "vault.info",
  "leader v c": "config.reload",
  "leader m": "messages.open",
  "leader ?": "help.open",
  "leader q q": "app.quit",
  "ctrl+q": "app.quit",
  // resizing: a mode, entered with one chord, left with esc
  "ctrl+alt+w": "window.resize_mode",
  "leader w r": "window.resize_mode",
  "ctrl+w =": "window.equalize",
  "leader w =": "window.equalize",
};

for (const prefix of ["ctrl+w", "leader w"]) {
  for (const [dir, letter] of [["left", "h"], ["down", "j"], ["up", "k"], ["right", "l"]] as const) {
    DEFAULT_KEYS[`${prefix} ${letter}`] = `window.focus_${dir}`;
    DEFAULT_KEYS[`${prefix} ${dir}`] = `window.focus_${dir}`;
    DEFAULT_KEYS[`${prefix} shift+${letter}`] = `window.move_${dir}`;
    DEFAULT_KEYS[`${prefix} shift+${dir}`] = `window.move_${dir}`;
  }
}
for (let i = 1; i <= 9; i++) {
  DEFAULT_KEYS[`ctrl+t ${i}`] = `tab.goto ${i}`;
  DEFAULT_KEYS[`leader t ${i}`] = `tab.goto ${i}`;
}

/** Visual mode: these win over the normal keymap; movements extend the selection by themselves. */
export const DEFAULT_VISUAL_KEYS: Record<string, string> = {
  o: "visual.swap",
  y: "visual.yank",
  escape: "visual.exit",
  v: "visual.char",
  "shift+v": "visual.line",
};

/** Keys inside the explorer: key → explorer action. */
export const DEFAULT_EXPLORER_KEYS: Record<string, string> = {
  j: "down",
  down: "down",
  k: "up",
  up: "up",
  enter: "open_tab",
  l: "open",
  right: "open",
  h: "collapse",
  left: "collapse",
  s: "open_split",
  "g g": "top",
  "shift+g": "bottom",
  q: "close",
  escape: "leave",
};

export const EXPLORER_ACTIONS = ["down", "up", "open_tab", "open", "collapse", "open_split", "top", "bottom", "close", "leave"];

/** Keys inside the outline pane: key → outline action. */
export const DEFAULT_OUTLINE_KEYS: Record<string, string> = {
  j: "down",
  down: "down",
  k: "up",
  up: "up",
  enter: "jump",
  h: "fold",
  left: "fold",
  l: "unfold",
  right: "unfold",
  "g g": "top",
  "shift+g": "bottom",
  q: "close",
  escape: "leave",
};

export const OUTLINE_ACTIONS = ["down", "up", "jump", "fold", "unfold", "top", "bottom", "close", "leave"];

/** Keys in resize mode: key → resize action. Anything else leaves the mode. */
export const DEFAULT_RESIZE_KEYS: Record<string, string> = {
  h: "narrower",
  left: "narrower",
  l: "wider",
  right: "wider",
  k: "shorter",
  up: "shorter",
  j: "taller",
  down: "taller",
  "=": "equalize",
  escape: "leave",
  enter: "leave",
  q: "leave",
};

export const RESIZE_ACTIONS: Record<string, { title: string; desc: string }> = {
  narrower: { title: "Narrower", desc: "shrink the focused pane" },
  wider: { title: "Wider", desc: "grow the focused pane" },
  shorter: { title: "Shorter", desc: "shrink in a stacked split" },
  taller: { title: "Taller", desc: "grow in a stacked split" },
  equalize: { title: "Equal sizes", desc: "reset the split and pane widths" },
  leave: { title: "Leave resize mode", desc: "back to reading" },
};

/** which-key groups by prefix, in config notation: "name: short explanation". */
export const DEFAULT_GROUPS: Record<string, string> = {
  "leader l": "links: follow, list and copy links",
  "leader h": "history: back, forward, everywhere visited",
  "leader w": "window: split, focus, move, resize",
  "leader t": "tabs: open, switch, reorder, close",
  "leader f": "find: notes, headings, text, commands",
  "leader u": "ui: theme, icons, width, zen, toggles",
  "leader s": "scratch: collect references for agents",
  "leader n": "note: reload, info",
  "leader v": "vault: reindex, info, reload config",
  "leader q": "session: quit",
  y: "copy: selection, path, reference, link",
  "ctrl+w": "window: split, focus, move, resize",
  "ctrl+t": "tabs: open, switch, reorder, close",
  g: "go: top of the note",
  "[": "previous: heading",
  "]": "next: heading",
};

/** A group's value is "name" or "name: explanation". */
export function parseGroup(value: string): { name: string; desc: string } {
  const i = value.indexOf(":");
  return i < 0 ? { name: value.trim(), desc: "" } : { name: value.slice(0, i).trim(), desc: value.slice(i + 1).trim() };
}

/** `:` aliases: alias → command spec. The rest of the typed line becomes the argument. */
export const DEFAULT_ALIASES: Record<string, string> = {
  q: "app.quit",
  quit: "app.quit",
  e: "note.open",
  open: "note.open",
  theme: "theme.set",
  glyphs: "glyphs.set",
  zen: "ui.zen",
  vs: "window.split_side",
  sp: "window.split_stacked",
  tabnew: "tab.new",
  noh: "find.clear",
  messages: "messages.open",
  reload: "note.reload",
  reindex: "vault.reindex",
  config: "config.reload",
};

export interface KeyLike {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  option?: boolean;
  super?: boolean;
  sequence: string;
}

const RENAME: Record<string, string> = { return: "enter", esc: "escape", " ": "space", del: "delete" };

/** Name a key event canonically, so it compares equal to config notation (see canonKey). */
export function keyName(k: KeyLike): string {
  const seq = k.sequence ?? "";
  const alt = k.meta || !!k.option;
  const cmd = !!k.super;
  // Printable text with no modifier names itself: `$`, `{`, `?`, `G` (→ shift+g), `é`.
  if (!k.ctrl && !alt && !cmd && seq && [...seq].length === 1 && !/[\x00-\x1f\x7f]/.test(seq)) {
    if (seq === " ") return k.shift ? "shift+space" : "space";
    return canonKey(seq);
  }
  let name = RENAME[k.name] ?? k.name ?? "";
  // Many terminals send ctrl+backspace as ^H, which parses as plain backspace.
  if (name === "backspace" && seq === "\x08" && !k.ctrl) return "ctrl+backspace";
  if (!name && seq.length === 1) name = seq;
  const mods: string[] = [];
  if (k.ctrl) mods.push("ctrl");
  if (alt) mods.push("alt");
  if (k.shift) mods.push("shift");
  if (cmd) mods.push("cmd");
  return canonKey([...mods, name.length === 1 ? name.toLowerCase() : name].join("+"));
}

/** Short human form for the popup, palette and help: `ctrl+w shift+h` → `C-w S-h`. */
export function prettyKey(seq: string, leader = "space"): string {
  const leaderKey = canonKey(leader);
  return seq
    .split(" ")
    .map((k) => {
      if (k === leaderKey) return "␣";
      return k
        .replace(/^ctrl\+/, "C-")
        .replace(/alt\+/, "M-")
        .replace(/shift\+/, "S-")
        .replace(/cmd\+/, "D-")
        .replace(/(^|-)space$/, "$1␣");
    })
    .join(" ");
}
