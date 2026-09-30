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
  ["cursor.word_prev", ["b", "ctrl+left"], ["shift+ctrl+left"]],
  ["cursor.word_next", ["w", "ctrl+right"], ["shift+ctrl+right"]],
  ["cursor.word_end", ["e"], []],
  ["cursor.line_start", ["0", "home", "cmd+left"], ["shift+home", "shift+cmd+left"]],
  ["cursor.line_end", ["$", "end", "cmd+right"], ["shift+end", "shift+cmd+right"]],
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
  ["cursor.screen_top", ["shift+h"], []],
  ["cursor.screen_middle", ["shift+m"], []],
  ["cursor.screen_bottom", ["shift+l"], []],
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
  tab: "link.next",
  "shift+tab": "link.prev",
  "] l": "link.next",
  "[ l": "link.prev",
  enter: "link.follow",
  "g f": "link.follow",
  "g x": "link.follow",
  "ctrl+enter": "link.follow_split",
  "leader l n": "link.next",
  "leader l p": "link.prev",
  "leader l f": "link.follow",
  "leader l s": "link.follow_split",
  "leader l y": "copy.link",
  "leader l l": "links.open",
  "leader l b": "backlinks.open",
  "leader l r": "link.relink",
  // history
  "ctrl+o": "history.back",
  "alt+left": "history.back",
  "alt+right": "history.forward",
  "leader h p": "history.back",
  "leader h n": "history.forward",
  "leader h h": "history.list",
  // windows (focus and move are added below, for letters and arrows)
  "ctrl+w v": "window.split_side",
  "ctrl+\\": "window.split_side",
  "ctrl+w s": "window.split_stacked",
  "ctrl+w w": "window.other",
  "ctrl+w x": "window.swap",
  "ctrl+w q": "window.close",
  "ctrl+w f": "link.follow_split",
  "leader w f": "link.follow_split",
  q: "window.close",
  "ctrl+w o": "window.only",
  "leader w v": "window.split_side",
  "leader w s": "window.split_stacked",
  "leader w w": "window.other",
  "leader w x": "window.swap",
  "leader w q": "window.close",
  "leader w o": "window.only",
  // tabs (1..9 added below)
  "ctrl+t c": "tab.new",
  "ctrl+t t": "tab.list",
  "ctrl+t n": "tab.next",
  "ctrl+t right": "tab.next",
  "ctrl+pagedown": "tab.next",
  "ctrl+tab": "tab.next",
  "g t": "tab.next",
  "ctrl+t p": "tab.prev",
  "ctrl+t left": "tab.prev",
  "ctrl+pageup": "tab.prev",
  "ctrl+shift+tab": "tab.prev",
  "g shift+t": "tab.prev",
  "ctrl+t shift+h": "tab.move_left",
  "ctrl+t shift+left": "tab.move_left",
  "ctrl+t shift+l": "tab.move_right",
  "ctrl+t shift+right": "tab.move_right",
  "ctrl+shift+pageup": "tab.move_left",
  "ctrl+shift+pagedown": "tab.move_right",
  "ctrl+t q": "tab.close",
  "ctrl+t o": "tab.close_others",
  "ctrl+t m": "tab.pin",
  "ctrl+t shift+q": "tab.close_all",
  "leader t c": "tab.new",
  "leader t t": "tab.list",
  "leader t n": "tab.next",
  "leader t right": "tab.next",
  "leader t p": "tab.prev",
  "leader t left": "tab.prev",
  "leader t shift+h": "tab.move_left",
  "leader t shift+left": "tab.move_left",
  "leader t shift+l": "tab.move_right",
  "leader t shift+right": "tab.move_right",
  "leader t q": "tab.close",
  "leader t o": "tab.close_others",
  "leader t m": "tab.pin",
  "leader t shift+q": "tab.close_all",
  // explorer and outline
  "leader e": "explorer.cycle",
  "leader shift+e": "explorer.reveal",
  "leader o": "outline.cycle",
  // find
  "ctrl+f": "find.open",
  "/": "find.open",
  n: "find.next",
  "shift+n": "find.prev",
  "ctrl+l": "task.toggle",
  "leader n t": "task.toggle",
  // scrolling the cursor's line to the middle, top or bottom (vim's z commands)
  "z z": "scroll.center",
  "z t": "scroll.top",
  "z b": "scroll.bottom",
  "ctrl+g": "cursor.goto_line",
  "leader f l": "cursor.goto_line",
  // moving lines (VS Code's alt+up/down are the heading jumps here; JetBrains' keys, then)
  "alt+shift+up": "edit.move_line_up",
  "alt+shift+down": "edit.move_line_down",
  // the change list (vim's)
  "g ;": "change.prev",
  "g ,": "change.next",
  "g i": "edit.insert_last",
  // the lens's size, by hand
  "+": "lens.grow",
  "-": "lens.shrink",
  "=": "lens.reset",
  // editing (source mode; from the render they switch the window to source first)
  i: "edit.insert",
  a: "edit.append",
  "shift+i": "edit.insert_line_start",
  "shift+a": "edit.append_line_end",
  o: "edit.open_below",
  "shift+o": "edit.open_above",
  u: "edit.undo",
  "ctrl+z": "edit.undo",
  "ctrl+r": "edit.redo",
  "shift+u": "edit.redo",
  "ctrl+y": "edit.redo",
  "ctrl+s": "note.save",
  "*": "find.word_next",
  f: "cursor.find_char f",
  "shift+f": "cursor.find_char F",
  t: "cursor.find_char t",
  "shift+t": "cursor.find_char T",
  ";": "cursor.find_repeat",
  ",": "cursor.find_repeat back",
  "#": "find.word_prev",
  "leader f /": "find.open",
  "ctrl+h": "find.replace",
  "ctrl+backspace": "find.replace", // what many terminals send for ctrl+h (the same byte)
  "ctrl+shift+f": "find.vault",
  "leader f g": "find.vault",
  "leader f r": "find.replace",
  "ctrl+p": "switcher.open",
  "leader f f": "switcher.open",
  "leader f o": "outline.pick",
  "leader f b": "breadcrumb.path",
  ":": "palette.open",
  "ctrl+shift+p": "palette.open",
  "leader f p": "palette.open",
  // ui
  "leader u u": "ui.list",
  "leader u t": "theme.pick",
  "leader u g": "glyphs.pick",
  "leader u d": "ui.readable",
  "leader u z": "ui.zen",
  "leader u l": "ui.cursorline",
  "leader u n": "ui.line_numbers",
  "leader u w": "ui.wrap",
  "alt+z": "ui.wrap",
  "leader u r": "ui.urls",
  "leader u m": "ui.mouse",
  "leader u b": "ui.top_bar",
  // scratch
  "leader s s": "scratch.open",
  "leader s a": "scratch.add",
  "leader s y": "scratch.copy",
  "leader s d": "scratch.clear",
  // note, vault, app
  "leader n r": "note.reload",
  "leader n e": "note.edit",
  "leader n v": "view.source",
  "ctrl+e": "view.source",
  "leader n l": "view.live",
  "leader n w": "note.save",
  "leader n shift+w": "note.save_all",
  "leader n c": "note.resolve",
  "leader n s": "note.send",
  "leader n p": "note.send_pick",
  "leader n i": "note.info",
  "leader n n": "note.create",
  "leader n m": "note.rename",
  "leader n d": "note.delete",
  "ctrl+n": "note.create",
  "ctrl+shift+n": "folder.create",
  "leader v d": "folder.create",
  "leader v r": "vault.reindex",
  "leader v i": "vault.info",
  "leader v c": "config.reload",
  "leader v v": "vault.switch",
  "leader v n": "vault.rename",
  "leader v m": "vault.init",
  "leader v t": "trash.open",
  "leader m": "messages.open",
  "?": "help.open",
  "leader ?": "help.open",
  "leader q q": "app.quit",
  "ctrl+q": "app.quit",
  // resizing: a mode, entered with one chord, left with esc
  "leader w r": "window.resize_mode",
  "ctrl+w =": "window.equalize",
  "leader w =": "window.equalize",
  // One step each, as in vim, then resize mode so the key repeats on its own.
  "ctrl+w >": "window.wider",
  "ctrl+w <": "window.narrower",
  "ctrl+w +": "window.taller",
  "ctrl+w -": "window.shorter",
  "leader w >": "window.wider",
  "leader w <": "window.narrower",
  "leader w +": "window.taller",
  "leader w -": "window.shorter",
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
  DEFAULT_KEYS[`alt+${i}`] = `tab.goto ${i}`; // VS Code's (and browsers' on Linux)
}

/** Source mode: these win over the reading keys there (`x` deletes a character instead of
 *  ticking a task, as in vim). */
export const DEFAULT_SOURCE_KEYS: Record<string, string> = {
  x: "edit.delete_char",
  d: "edit.op_delete",
  c: "edit.op_change",
  y: "edit.op_yank",
  ">": "edit.op_indent",
  "<": "edit.op_outdent",
  "shift+d": "edit.delete_to_end",
  "shift+c": "edit.change_to_end",
  s: "edit.substitute",
  "shift+s": "edit.substitute_line",
  r: "edit.replace_char",
  "shift+j": "edit.join",
  p: "edit.paste_after",
  "shift+p": "edit.paste_before",
  "~": "edit.toggle_case",
  ".": "edit.repeat",
};

/** Visual mode: these win over the normal keymap; movements extend the selection by themselves. */
export const DEFAULT_VISUAL_KEYS: Record<string, string> = {
  o: "visual.swap",
  y: "visual.yank",
  // Source mode: edit the selection.
  d: "visual.delete",
  x: "visual.delete",
  c: "visual.change",
  ">": "visual.indent",
  "<": "visual.outdent",
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
  l: "expand",
  right: "expand",
  o: "open",
  h: "collapse",
  left: "collapse",
  s: "open_split",
  "g g": "top",
  "shift+g": "bottom",
  "/": "filter",
  a: "all_files",
  // Making and changing files (18.x), in the selected folder or on the selected row. nvim-tree's
  // keys where they fit: r renames, d deletes (to the trash), y x p copy, cut and paste; n makes a
  // note (space n n too, as everywhere), N a folder.
  n: "new_note",
  "shift+n": "new_folder",
  r: "rename",
  "shift+r": "rename_vault",
  m: "move",
  d: "delete",
  u: "restore",
  y: "copy",
  x: "cut",
  p: "paste",
  // A folder made a vault of its own; a vault nested here made a plain folder again (18.11).
  v: "make_vault",
  "shift+v": "unmake_vault",
  // The selected row's menu, as its … button opens it.
  ".": "menu",
  q: "close",
  escape: "leave",
};

export const EXPLORER_ACTIONS = [
  "down", "up", "open_tab", "expand", "open", "collapse", "open_split", "top", "bottom", "filter", "all_files",
  "new_note", "new_folder", "rename", "rename_vault", "move", "delete", "restore", "copy", "cut", "paste", "make_vault", "unmake_vault", "menu", "close", "leave",
];

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
  "/": "filter",
  q: "close",
  escape: "leave",
};

export const OUTLINE_ACTIONS = ["down", "up", "jump", "fold", "unfold", "top", "bottom", "filter", "close", "leave"];

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
  ">": "wider",
  "<": "narrower",
  "+": "taller",
  "-": "shorter",
  "=": "equalize",
  escape: "leave",
  enter: "leave",
  q: "leave",
};

/** What the explorer's and the outline's actions do, for help. */
export const EXPLORER_ACTION_INFO: Record<string, { title: string; desc: string }> = {
  down: { title: "Move down", desc: "Selects the next row; nothing opens" },
  up: { title: "Move up", desc: "Selects the previous row; nothing opens" },
  open_tab: { title: "Open as a tab", desc: "Opens the note in a tab (or switches to its tab); folds or unfolds a folder" },
  expand: { title: "Open as a tab / unfold", desc: "Opens the note in a tab; unfolds a folder" },
  open: { title: "Open here", desc: "Replaces the current window's note with this one" },
  collapse: { title: "Fold", desc: "Folds the folder, or goes to its parent" },
  open_split: { title: "Open in the split", desc: "Opens the note in the other window" },
  top: { title: "Top", desc: "Selects the first row" },
  bottom: { title: "Bottom", desc: "Selects the last row" },
  filter: { title: "Filter", desc: "Type to narrow the rows (the tree keeps its folders); enter opens, esc clears" },
  all_files: { title: "All files", desc: "Shows every text file, or back to files.show (notes and data files)" },
  new_note: { title: "New note here", desc: "Asks for a name and makes the note in the selected folder (or beside the selected file)" },
  new_folder: { title: "New folder here", desc: "Asks for a name and makes the folder in the selected folder (or beside the selected file)" },
  rename: { title: "Rename", desc: "A new name for the selected note, file or folder, in its folder; every link to it fixed after a preview" },
  rename_vault: { title: "Rename the vault", desc: "On a vault's row: its name (r renames its folder); [[name:…]] links fixed everywhere after a preview" },
  move: { title: "Move to…", desc: "Picks a folder for the selected note, file or folder; every link to it fixed after a preview" },
  delete: { title: "Delete", desc: "Moves the selected note, file or folder to the vault's trash (asks first; u restores)" },
  restore: { title: "Restore", desc: "Puts back what was deleted last (the trash, :trash, has the rest)" },
  copy: { title: "Copy", desc: "Copies the selected note, file or folder: p pastes a copy in the selected folder" },
  cut: { title: "Cut", desc: "Cuts the selected note, file or folder: p moves it to the selected folder, links fixed" },
  paste: { title: "Paste", desc: "Into the selected folder (or beside the selected file): a copy, or what was cut, moved" },
  make_vault: { title: "Make it a vault", desc: "The selected folder becomes a vault of its own (its .slipbox/); links that would stop reaching across fixed after a preview" },
  unmake_vault: { title: "Make it a plain folder", desc: "The selected vault's notes become this vault's; [[its-name:…]] links fixed after a preview, its .slipbox/ to the trash" },
  menu: { title: "Actions…", desc: "The selected row's menu, as its … button opens it: rename, move, delete, copy…" },
  close: { title: "Close the explorer", desc: "Closes it; focus returns to the note" },
  leave: { title: "Back to the note", desc: "Focuses the note; the explorer stays open" },
};

/** The history view takes the explorer's keymap; what its actions do there, for help. Several
 *  actions jump (enter, l, o, s), so they share one entry. */
export const HISTORY_ACTION_INFO: Record<string, { title: string; desc: string; actions?: string[] }> = {
  down: { title: "Move down", desc: "Selects the older place; nothing jumps" },
  up: { title: "Move up", desc: "Selects the newer place; nothing jumps" },
  jump: { title: "Jump there", desc: "Moves the window there; the places before become back, after it forward", actions: ["open_tab", "expand", "open", "open_split"] },
  top: { title: "Top", desc: "Selects the newest place" },
  bottom: { title: "Bottom", desc: "Selects the oldest place" },
  filter: { title: "Filter", desc: "Type to narrow the places by path; enter jumps, esc clears" },
  close: { title: "Close the history", desc: "Closes it; focus returns to the note" },
  leave: { title: "Back to the note", desc: "Focuses the note; the history stays open" },
};

/** Keys while a left panel's filter (`/`) has them, for help. Fixed, not from a keymap. */
export const FILTER_KEYS_HELP: [string, string[], string][] = [
  ["Narrow the rows", ["type"], "Filters the explorer (folders kept), the history by path, or the outline (parents kept)"],
  ["Move", ["down", "up", "ctrl+n", "ctrl+p"], "Moves through the matches"],
  ["Open or jump", ["enter"], "Opens the note as a tab, or jumps to the place or heading; the filter clears"],
  ["Clear the filter", ["esc"], "Clears it; the whole tree or history comes back"],
  ["Delete", ["backspace", "ctrl+w", "ctrl+u"], "A character, a word, or everything typed"],
];

export const OUTLINE_ACTION_INFO: Record<string, { title: string; desc: string }> = {
  down: { title: "Move down", desc: "Selects the next heading" },
  up: { title: "Move up", desc: "Selects the previous heading" },
  jump: { title: "Jump", desc: "Moves the note to the heading and focuses it" },
  fold: { title: "Fold", desc: "Hides the sub-headings, or goes to the parent" },
  unfold: { title: "Unfold", desc: "Shows the sub-headings" },
  top: { title: "Top", desc: "Selects the first heading" },
  bottom: { title: "Bottom", desc: "Selects the last heading" },
  filter: { title: "Filter", desc: "Type to narrow the headings (their parents kept); enter jumps, esc clears" },
  close: { title: "Close the outline", desc: "Closes it; focus returns to the note" },
  leave: { title: "Back to the note", desc: "Focuses the note; the outline stays open" },
};

export const RESIZE_ACTIONS: Record<string, { title: string; desc: string }> = {
  narrower: { title: "Narrower", desc: "Shrinks the focused pane or window" },
  wider: { title: "Wider", desc: "Grows the focused pane or window" },
  shorter: { title: "Shorter", desc: "Shrinks the window in a stacked split" },
  taller: { title: "Taller", desc: "Grows the window in a stacked split" },
  equalize: { title: "Equal sizes", desc: "Evens the split and resets pane widths" },
  leave: { title: "Leave resize mode", desc: "Back to reading" },
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
  "leader n": "note: new, rename, delete, source, the lens, save, edit elsewhere, reload, info",
  "leader v": "vault: switch, make, rename, new folder, the trash, reindex, info, reload config",
  "leader q": "session: quit",
  y: "copy: selection, path, reference, link",
  "ctrl+w": "window: split, focus, move, resize",
  "ctrl+t": "tabs: open, switch, reorder, close",
  g: "go: top (g), link (f x), tabs (t T), changes (; ,), last insert (i)",
  z: "scroll: the cursor's line to the middle (z), top (t), bottom (b)",
  "[": "previous: heading ([), link (l)",
  "]": "next: heading (]), link (l)",
};

/** A group's value is "name" or "name: explanation". */
export function parseGroup(value: string): { name: string; desc: string } {
  const i = value.indexOf(":");
  return i < 0 ? { name: value.trim(), desc: "" } : { name: value.slice(0, i).trim(), desc: value.slice(i + 1).trim() };
}

/** `:` aliases: alias → command spec. The rest of the typed line becomes the argument. */
export const DEFAULT_ALIASES: Record<string, string> = {
  q: "window.close_or_quit",
  quit: "window.close_or_quit",
  qa: "app.quit",
  qall: "app.quit",
  help: "help.open",
  lens: "view.live",
  e: "note.open",
  source: "view.source",
  live: "view.live",
  w: "note.save",
  write: "note.save",
  "w!": "note.save_force",
  wq: "app.save_quit",
  wa: "note.save_all",
  wall: "note.save_all",
  wqa: "app.save_quit",
  xa: "app.save_quit",
  x: "app.save_quit",
  "q!": "app.quit_force",
  "e!": "note.revert",
  open: "note.open",
  theme: "theme.set",
  glyphs: "glyphs.set",
  zen: "ui.zen",
  wrap: "ui.wrap",
  vs: "window.split_side",
  sp: "window.split_stacked",
  tabnew: "tab.new",
  new: "note.create",
  mkdir: "folder.create",
  tabonly: "tab.close_others",
  tabpin: "tab.pin",
  tabo: "tab.close_others",
  noh: "find.clear",
  messages: "messages.open",
  reload: "note.reload",
  reindex: "vault.reindex",
  vaults: "vault.switch",
  init: "vault.init",
  rename: "note.rename",
  mv: "note.rename",
  relink: "link.relink",
  delete: "note.delete",
  trash: "trash.open",
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

const RENAME: Record<string, string> = {
  return: "enter",
  esc: "escape",
  " ": "space",
  del: "delete",
  // The keypad under the kitty protocol, which reports its keys apart from the main ones.
  kpenter: "enter",
  kpleft: "left",
  kpright: "right",
  kpup: "up",
  kpdown: "down",
  kphome: "home",
  kpend: "end",
  kppageup: "pageup",
  kppagedown: "pagedown",
  kpdelete: "delete",
};

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
  // Legacy terminals send ctrl+j as a line feed.
  if (name === "linefeed" && !k.ctrl) return "ctrl+j";
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

/** Short human form for which-key and the status line: `ctrl+w shift+h` → `C-w S-h`. */
/** A key sequence spelled out for reading (help, the palette): `ctrl+d`, `space l y`, `esc`. */
export function spellKey(seq: string): string {
  return seq
    .split(" ")
    .map((k) => k.replace(/(^|\+)escape$/, "$1esc"))
    .join(" ");
}

export function prettyKey(seq: string, leader = "space"): string {
  const leaderKey = canonKey(leader);
  return seq
    .split(" ")
    .map((k) => {
      if (k === leaderKey) return leaderKey === "space" ? "␣" : prettyKey(leaderKey); // the leader as it is
      return k
        .replace(/^ctrl\+/, "C-")
        .replace(/alt\+/, "M-")
        .replace(/shift\+/, "S-")
        .replace(/cmd\+/, "D-")
        .replace(/(^|-)space$/, "$1␣");
    })
    .join(" ");
}
