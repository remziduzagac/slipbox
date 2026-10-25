// Default keymap (3.12), as decided in docs/manual/keys.md. Every binding names a command id
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
  // alt+← / alt+→ by words too, as macOS's option+arrows — and alt+b / alt+f, what its terminals send for them (meta-b
  // and meta-f, readline's word back and forward).
  ["cursor.word_prev", ["b", "ctrl+left", "alt+left", "alt+b"], ["shift+ctrl+left", "shift+alt+left"]],
  ["cursor.word_next", ["w", "ctrl+right", "alt+right", "alt+f"], ["shift+ctrl+right", "shift+alt+right"]],
  ["cursor.word_end", ["e"], []],
  // macOS's cmd+← / cmd+→ to the line's start and end — and ctrl+a / ctrl+e, what its terminals send for them (the
  // shell's start and end of line); cmd+↑ / cmd+↓ to the top and bottom, where a terminal reports cmd.
  ["cursor.line_start", ["0", "home", "cmd+left", "ctrl+a"], ["shift+home", "shift+cmd+left", "shift+ctrl+a"]],
  ["cursor.line_end", ["$", "end", "cmd+right", "ctrl+e"], ["shift+end", "shift+cmd+right", "shift+ctrl+e"]],
  ["cursor.first_nonblank", ["^"], []],
  ["cursor.top", ["g g", "ctrl+home", "cmd+up"], ["shift+ctrl+home", "shift+cmd+up"]],
  ["cursor.bottom", ["shift+g", "ctrl+end", "cmd+down"], ["shift+ctrl+end", "shift+cmd+down"]],
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
  ["cursor.match_bracket", ["%"], []],
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
  // Cut and paste, as every editor has them beside ctrl+c (vim's ctrl+v and ctrl+x, block selection and a number less,
  // slipbox hasn't).
  "ctrl+x": "edit.cut",
  "ctrl+v": "edit.paste",
  "y p": "copy.path",
  "y r": "copy.ref",
  "y l": "copy.link",
  // links
  tab: "link.next",
  "shift+tab": "link.prev",
  "] l": "link.next",
  "] s": "spell.next",
  "] t": "type.next",
  "[ t": "type.prev",
  "] c": "git.change_next",
  "[ c": "git.change_prev",
  "[ s": "spell.prev",
  "z =": "spell.suggest",
  "z g": "spell.add",
  "[ l": "link.prev",
  enter: "link.follow",
  "g f": "link.follow",
  "g x": "link.follow",
  "ctrl+enter": "link.follow_tab",
  "leader l n": "link.next",
  "leader l p": "link.prev",
  "leader l f": "link.follow",
  "leader l s": "link.follow_split",
  "leader l t": "link.follow_tab",
  "leader l y": "copy.link",
  "leader l i": "link.insert",
  "leader l l": "links.open",
  "leader l b": "backlinks.open",
  "leader l r": "link.relink",
  // history
  "ctrl+o": "history.back",
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
  // a picture at its own size, and scrolled sideways (PIC-D3; vim's zh and zl scroll sideways)
  "z p": "picture.size",
  "z h": "picture.scroll_left",
  "z l": "picture.scroll_right",
  "ctrl+g": "cursor.goto_line",
  "leader f l": "cursor.goto_line",
  // moving lines (VS Code's alt+up/down are the heading jumps here; JetBrains' keys, then)
  "alt+shift+up": "edit.move_line_up",
  "alt+shift+down": "edit.move_line_down",
  // the change list (vim's)
  "g ;": "change.prev",
  "g ,": "change.next",
  "g i": "edit.insert_last",
  // What's under the cursor (19.12, 19.13), as vim and LazyVim have it.
  "shift+k": "lsp.hover",
  "g d": "lsp.definition",
  "g y": "lsp.type_definition",
  "g shift+i": "lsp.implementation",
  "g r": "lsp.references",
  // What the code's language server changes (19.15), as LazyVim has them.
  "leader c r": "lsp.rename",
  "leader c a": "lsp.code_action",
  "leader c f": "lsp.format",
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
  "leader f s": "search.open",
  "leader f r": "find.replace",
  "ctrl+shift+h": "find.replace_vault",
  "leader f shift+r": "find.replace_vault",
  "ctrl+p": "switcher.open",
  "leader f f": "switcher.open",
  "leader f o": "outline.pick",
  "leader f t": "tag.list",
  "leader f d": "type.list",
  "leader f b": "breadcrumb.path",
  ":": "palette.open",
  "ctrl+shift+p": "palette.open",
  "leader f p": "palette.open",
  // ui
  "leader u u": "ui.list",
  "leader u t": "theme.pick",
  "leader u g": "glyphs.pick",
  "leader u shift+w": "ui.readable",
  "leader u z": "ui.zen",
  "leader u l": "ui.cursorline",
  "leader u n": "ui.line_numbers",
  "leader u s": "ui.spell",
  "leader u w": "ui.wrap",
  "alt+z": "ui.wrap",
  "leader u r": "ui.urls",
  "leader u m": "ui.mouse",
  "leader u d": "ui.problems_bar",
  "leader u shift+d": "ui.problem_marks",
  "leader u c": "ui.code_cells",
  // The code view's cell at the cursor (24.13), as its header's buttons; `z a` folds it, as vim folds.
  "leader k f": "cell.fold",
  "z a": "cell.fold",
  "leader k e": "cell.edit",
  "leader k y": "cell.copy",
  "leader k r": "cell.references",
  "leader k p": "cell.problems",
  "leader k s": "cell.scratch",
  "leader k d": "cell.fold_unchanged",
  // scratch
  "leader s s": "scratch.open",
  "leader s r": "scratch.open_right",
  "leader s a": "scratch.add",
  "leader s y": "scratch.copy",
  "leader s c": "context.copy",
  "leader s d": "scratch.clear",
  // The git panel (GIT-D12): open, focus, close, as space e the explorer; its own keys act there ([keys.git]).
  "leader g": "git.view",
  // note, folder, app
  "leader n r": "note.reload",
  "leader n e": "note.edit",
  "leader n v": "view.source",
  "ctrl+k": "view.source",
  "leader n l": "view.live",
  "leader n w": "note.save",
  "leader n shift+w": "note.save_all",
  "leader n c": "note.resolve",
  "leader n s": "note.send",
  "leader n p": "note.send_pick",
  "leader n o": "note.export",
  "leader n shift+o": "note.export_many",
  "leader n i": "note.info",
  "leader n n": "note.create",
  "leader n m": "note.rename",
  "leader n h": "heading.rename",
  "leader n d": "note.delete",
  "leader n f": "footnotes.cycle",
  "leader n shift+f": "footnote.add",
  "leader n shift+p": "note.properties",
  "leader n shift+m": "note.move",
  "leader n y": "note.yank",
  "leader n x": "note.cut",
  "leader n shift+y": "note.copy",
  "ctrl+n": "note.create",
  "ctrl+shift+n": "folder.create",
  "leader v r": "vault.reindex",
  "leader v l": "vault.links",
  "leader v i": "vault.info",
  "leader v c": "config.reload",
  "leader v v": "folders.open",
  "leader v n": "folder.name",
  "leader v shift+v": "folders.default",
  "leader v m": "vault.init",
  "leader v t": "trash.open",
  "leader v p": "problems.open",
  "leader n q": "problems.file",
  // Folders (18.13): the explorer's selected one when it has focus, else this note's.
  "leader d n": "folder.create",
  "leader d r": "folder.rename",
  "leader d m": "folder.move",
  "leader d d": "folder.delete",
  "leader d y": "folder.yank",
  "leader d x": "folder.cut",
  "leader d p": "folder.paste",
  "leader v shift+m": "vault.unmake",
  "leader v u": "trash.restore",
  "leader v shift+u": "rename.undo",
  "leader m": "messages.open",
  "leader r": "help.report",
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
  for (const [dir, letter] of [
    ["left", "h"],
    ["down", "j"],
    ["up", "k"],
    ["right", "l"],
  ] as const) {
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

/** Source mode: these win over the reading keys there, as in vim. */
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
  "g c": "edit.op_comment",
  "ctrl+/": "edit.comment_line",
  "ctrl+_": "edit.comment_line",
};

/** Visual mode: these win over the normal keymap; movements extend the selection by themselves. */
export const DEFAULT_VISUAL_KEYS: Record<string, string> = {
  o: "visual.swap",
  "!": "shell.filter",
  y: "visual.yank",
  // Source mode: edit the selection. backspace and delete too, as a desktop editor's (a shift selection is a visual one).
  d: "visual.delete",
  x: "visual.delete",
  backspace: "visual.delete",
  delete: "visual.delete",
  c: "visual.change",
  ">": "visual.indent",
  "<": "visual.outdent",
  "g c": "visual.comment",
  "ctrl+/": "visual.comment",
  "ctrl+_": "visual.comment",
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
  // Hidden files and folders listed, or not (`files.hidden`): `.` is the row's menu.
  "shift+h": "toggle_hidden",
  // Making and changing files (18.x), in the selected folder or on the selected row. nvim-tree's
  // keys where they fit: r renames, d deletes (to the trash), y x p copy, cut and paste; n makes a
  // note (space n n too, as everywhere), N a folder.
  n: "new_note",
  "shift+n": "new_folder",
  r: "rename",
  "shift+r": "rename_root",
  m: "move",
  d: "delete",
  u: "restore",
  "shift+u": "undo_rename",
  y: "copy",
  x: "cut",
  p: "paste",
  // The row's whole path to the clipboard: nvim-tree's Y copies a path too.
  "shift+y": "copy_path",
  // A folder given .slipbox/, a root of its own; a root nested here made a plain folder again (18.11).
  v: "make_root",
  "shift+v": "unmake_root",
  // The selected row's menu, as its … button opens it.
  ".": "menu",
  // The view (VV-D5): zoomed in on the selected folder; a folder up — nvim-tree's and oil's `-`.
  z: "zoom_in",
  "-": "zoom_out",
  q: "close",
  escape: "leave",
};

export const EXPLORER_ACTIONS = [
  "down",
  "up",
  "open_tab",
  "expand",
  "open",
  "collapse",
  "open_split",
  "top",
  "bottom",
  "filter",
  "all_files",
  "toggle_hidden",
  "new_note",
  "new_folder",
  "rename",
  "rename_root",
  "move",
  "delete",
  "restore",
  "undo_rename",
  "copy",
  "cut",
  "paste",
  "copy_path",
  "make_root",
  "unmake_root",
  "menu",
  "zoom_in",
  "zoom_out",
  "close",
  "leave",
];

/**
 * Keys inside the git panel (GIT-D12): key → the panel's action, on the row selected. Its buttons and its footer say
 * them. Continuing, skipping and aborting what's under way have no key of their own: their buttons, or `shift+r`.
 */
export const DEFAULT_GIT_KEYS: Record<string, string> = {
  j: "down",
  down: "down",
  k: "up",
  up: "up",
  "g g": "top",
  "shift+g": "bottom",
  l: "expand",
  right: "expand",
  h: "collapse",
  left: "collapse",
  enter: "open",
  o: "go",
  ".": "menu",
  s: "stage",
  u: "unstage",
  d: "discard",
  a: "stage_all",
  "shift+u": "unstage_all",
  i: "message",
  c: "commit",
  "shift+c": "amend",
  f: "fetch",
  p: "pull",
  "shift+p": "push",
  z: "stash",
  n: "new_branch",
  m: "merge",
  v: "review",
  x: "resolve",
  "shift+r": "rebase",
  "/": "filter",
  q: "close",
  escape: "leave",
};

export const GIT_ACTIONS = [
  "down",
  "up",
  "top",
  "bottom",
  "expand",
  "collapse",
  "open",
  "go",
  "menu",
  "stage",
  "unstage",
  "discard",
  "stage_all",
  "unstage_all",
  "message",
  "commit",
  "amend",
  "fetch",
  "pull",
  "push",
  "stash",
  "new_branch",
  "merge",
  "review",
  "resolve",
  "rebase",
  "continue",
  "skip",
  "abort",
  "filter",
  "close",
  "leave",
];

/** Moving about a list pane — the outline, the footnotes, Info: key → action. */
const PANE_KEYS: Record<string, string> = {
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

const PANE_ACTIONS = ["down", "up", "jump", "fold", "unfold", "top", "bottom", "filter", "close", "leave"];

/** Keys inside the outline pane: key → outline action. */
export const DEFAULT_OUTLINE_KEYS: Record<string, string> = { ...PANE_KEYS, r: "rename" };

export const OUTLINE_ACTIONS = [...PANE_ACTIONS, "rename"];

/** Keys inside the footnotes view (3.18): the outline's, and adding and changing footnotes. */
export const DEFAULT_FOOTNOTE_KEYS: Record<string, string> = {
  ...PANE_KEYS,
  a: "add",
  e: "edit",
  d: "delete",
  r: "rename",
};

export const FOOTNOTE_ACTIONS = [...PANE_ACTIONS, "add", "edit", "delete", "rename"];

/** Keys inside the Info view (3.19): the outline's, and `y` to copy a row's value. */
export const DEFAULT_INFO_KEYS: Record<string, string> = { ...PANE_KEYS, y: "copy", e: "edit", x: "export" };

export const INFO_ACTIONS = [...PANE_ACTIONS, "copy", "edit", "export"];

/** What the Info view's actions do, for help and which-key. */
export const INFO_ACTION_INFO: Record<
  string,
  {
    title: string;
    desc: string;
  }
> = {
  export: { title: "Export the note", desc: "Offers export formats for the current note" },
  down: { title: "Move down", desc: "Selects the next row" },
  up: { title: "Move up", desc: "Selects the previous row" },
  jump: {
    title: "Open",
    desc: "A property: its line in the frontmatter; a tag: its notes; links, backlinks, headings, footnotes: their list or view; else copies the value",
  },
  fold: { title: "Fold", desc: "Folds the section, or goes from a row to its section" },
  unfold: { title: "Unfold", desc: "Unfolds the section" },
  top: { title: "Top", desc: "Selects the first row" },
  bottom: { title: "Bottom", desc: "Selects the last row" },
  filter: { title: "Filter", desc: "Type to narrow the rows by name and value; enter opens, esc clears" },
  copy: { title: "Copy", desc: "Copies the row's value (a path whole)" },
  edit: {
    title: "Edit the properties",
    desc: "The note's frontmatter in a floating editor (every editing key); closed or saved, written back",
  },
  close: { title: "Close the Info", desc: "Closes the right panel; focus returns to the note" },
  leave: { title: "Back to the note", desc: "Focuses the note; the Info stays open" },
};

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

/** A peek's own keys (VV-D7), over the note's while it's open: commands, as the note's keys are. */
export const DEFAULT_PEEK_KEYS: Record<string, string> = {
  o: "peek.go",
  t: "peek.tab",
  z: "peek.fill",
};

/** A review's own keys (GIT-D3), over the note's while it's open: commands, as the note's keys are. */
export const DEFAULT_REVIEW_KEYS: Record<string, string> = {
  y: "git.review_keep",
  x: "git.review_revert",
  c: "git.review_note",
  n: "git.review_next",
  p: "git.review_prev",
  enter: "git.review_go",
  tab: "git.diff_view",
};

/** The merge screen's own keys (GIT-D5), over the note's while it's open. */
export const DEFAULT_MERGE_KEYS: Record<string, string> = {
  o: "git.merge_ours",
  t: "git.merge_theirs",
  b: "git.merge_both",
  "shift+b": "git.merge_both_theirs",
  e: "git.merge_edit",
  a: "git.merge_agent",
  n: "git.merge_next",
  p: "git.merge_prev",
  w: "git.merge_save",
  s: "git.merge_stage",
  tab: "git.diff_view",
};

/** A diff window's own keys (GIT-D2), over the note's while it has the cursor: commands, as the note's keys are. */
export const DEFAULT_DIFF_KEYS: Record<string, string> = {
  tab: "git.diff_view",
};

/** What the explorer's and the outline's actions do, for help. */
export const EXPLORER_ACTION_INFO: Record<string, { title: string; desc: string }> = {
  down: { title: "Move down", desc: "Selects the next row; nothing opens" },
  up: { title: "Move up", desc: "Selects the previous row; nothing opens" },
  open_tab: {
    title: "Open as a tab",
    desc: "Opens the note in a tab (or switches to its tab); folds or unfolds a folder; goes into another vault",
  },
  expand: { title: "Open as a tab / unfold", desc: "Opens the note in a tab; unfolds a folder or a vault in place" },
  open: { title: "Open here", desc: "Replaces the current window's note with this one" },
  collapse: { title: "Fold", desc: "Folds the folder, or goes to its parent" },
  open_split: { title: "Open in the split", desc: "Opens the note in the other window" },
  top: { title: "Top", desc: "Selects the first row" },
  bottom: { title: "Bottom", desc: "Selects the last row" },
  filter: { title: "Filter", desc: "Type to narrow the rows (the tree keeps its folders); enter opens, esc clears" },
  all_files: {
    title: "All files",
    desc: "Shows every text file, or back to what files.show lists (auto: notes and data files in a notes vault)",
  },
  toggle_hidden: {
    title: "Hidden files",
    desc: "Lists the files and folders whose names start with a dot, not indexed (⊘), or stops; .git never (files.hidden)",
  },
  new_note: {
    title: "New note here",
    desc: "Asks for a name and makes the note in the selected folder (or beside the selected file)",
  },
  new_folder: {
    title: "New folder here",
    desc: "Asks for a name and makes the folder in the selected folder (or beside the selected file)",
  },
  rename: {
    title: "Rename",
    desc: "A new name for the selected note, file or folder, in its folder; every link to it fixed after a preview",
  },
  rename_root: {
    title: "Name it",
    desc: "On a nested vault's row: its name, as pointers name it (r renames its folder); after a preview",
  },
  move: {
    title: "Move to…",
    desc: "Picks a folder for the selected note, file or folder; every link to it fixed after a preview",
  },
  delete: { title: "Delete", desc: "Moves the selected note, file or folder to the trash (asks first; u restores)" },
  restore: { title: "Restore", desc: "Puts back what was deleted last (the trash, :trash, has the rest)" },
  undo_rename: {
    title: "Undo the last rename",
    desc: "Takes back the last rename, move or relink here after a preview (u puts back a delete)",
  },
  copy: { title: "Copy", desc: "Copies the selected note, file or folder: p pastes a copy in the selected folder" },
  cut: { title: "Cut", desc: "Cuts the selected note, file or folder: p moves it to the selected folder, links fixed" },
  paste: {
    title: "Paste",
    desc: "Into the selected folder (or beside the selected file): a copy, or what was cut, moved",
  },
  copy_path: { title: "Copy path", desc: "Copies the selected row's whole path: a note's, a file's or a folder's" },
  make_root: {
    title: "Give it .slipbox/",
    desc: "The selected folder becomes a vault of its own (its .slipbox/, a name if given); links that would stop reaching across fixed after a preview",
  },
  unmake_root: {
    title: "Make it part of the vault holding it",
    desc: "The selected vault's notes become this one's; links fixed after a preview, its .slipbox/ to the trash",
  },
  menu: { title: "Actions…", desc: "The selected row's menu, as its … button opens it: rename, move, delete, copy…" },
  zoom_in: {
    title: "Zoom in",
    desc: "The explorer zooms to the selected folder or vault (a file's, its folder); the breadcrumb leads back up",
  },
  zoom_out: { title: "Zoom out", desc: "The explorer zooms to the folder holding it, the folder it showed unfolded" },
  close: { title: "Close the explorer", desc: "Closes it; focus returns to the note" },
  leave: { title: "Back to the note", desc: "Focuses the note; the explorer stays open" },
};

/** The history view takes the explorer's keymap; what its actions do there, for help. Several
 *  actions jump (enter, l, o, s), so they share one entry. */
export const HISTORY_ACTION_INFO: Record<string, { title: string; desc: string; actions?: string[] }> = {
  down: { title: "Move down", desc: "Selects the older place; nothing jumps" },
  up: { title: "Move up", desc: "Selects the newer place; nothing jumps" },
  jump: {
    title: "Jump there",
    desc: "Moves the window there; the places before become back, after it forward",
    actions: ["open_tab", "expand", "open", "open_split"],
  },
  top: { title: "Top", desc: "Selects the newest place" },
  bottom: { title: "Bottom", desc: "Selects the oldest place" },
  filter: { title: "Filter", desc: "Type to narrow the places by path; enter jumps, esc clears" },
  close: { title: "Close the history", desc: "Closes it; focus returns to the note" },
  leave: { title: "Back to the note", desc: "Focuses the note; the history stays open" },
};

/** What the git panel's actions do (GIT-D12), for help, which-key and its footer. */
export const GIT_ACTION_INFO: Record<string, { title: string; desc: string; actions?: string[] }> = {
  down: { title: "Move down", desc: "Selects the next row" },
  up: { title: "Move up", desc: "Selects the row before" },
  top: { title: "Top", desc: "Selects the first row" },
  bottom: { title: "Bottom", desc: "Selects the last row" },
  open: {
    title: "Its diff, or fold",
    desc: "A file's diff, or a change's, in the diff window; a section's heading folds or unfolds; a branch or a repository opens up in place",
  },
  go: {
    title: "Go there",
    desc: "Opens the file at its change; goes into a branch's worktree, or a repository",
  },
  expand: {
    title: "Open up",
    desc: "A file into its changes (a staged one's against the last commit, a changed one's against what's staged); a branch or a repository in place",
  },
  collapse: { title: "Fold", desc: "Folds what's opened up; from inside it, back to its row" },
  menu: { title: "Its menu", desc: "Everything the row offers, as a right click opens it" },
  stage: {
    title: "Stage",
    desc: "Stages the file, or the one change; a conflict's file, marked resolved; on a heading, every file under it",
  },
  unstage: { title: "Unstage", desc: "Unstages the file, or the one change; on Staged's heading, everything" },
  discard: {
    title: "Discard",
    desc: "Discards what isn't staged — the file's, the change's, on Changes' heading every file's — after asking; an untracked file to the trash; a merged branch's worktree removed",
  },
  stage_all: { title: "Stage everything", desc: "Stages every change, untracked files too (git add -A)" },
  unstage_all: { title: "Unstage everything", desc: "Unstages every change" },
  message: {
    title: "Type the message",
    desc: "Into the message box: ctrl+enter commits, enter opens the editor, esc leaves it",
  },
  commit: {
    title: "Commit",
    desc: "Commits what's staged with the box's message; with none, the message in a floating editor (ctrl+s commits)",
  },
  amend: {
    title: "Amend",
    desc: "The last commit's message in the floating editor: ctrl+s amends it with what's staged",
  },
  fetch: { title: "Fetch", desc: "Fetches the branch's remote, in the background (:fetch)" },
  pull: {
    title: "Pull",
    desc: "Brings in the upstream's new commits; where both sides moved, asks: merge, rebase or nothing (:pull)",
  },
  review: {
    title: "Review",
    desc: "The changes that aren't staged, a hunk at a time: y keeps one, x reverts it, c notes it for the agent (:review)",
  },
  resolve: {
    title: "The merge screen",
    desc: "A file in conflict settled a conflict at a time: yours, theirs or both, then saved and staged (:resolve)",
  },
  rebase: {
    title: "Rebase onto the base",
    desc: "Rebases the branch onto the base, after asking; while a merge or rebase is under way: continue, skip or abort (:rebase)",
  },
  continue: {
    title: "Continue",
    desc: "The merge or rebase under way, once nothing's in conflict: the merge committed, the rebase's next commit (:continue)",
  },
  skip: { title: "Skip the commit", desc: "Leaves out the commit the rebase stopped at, and replays the next (:skip)" },
  abort: { title: "Abort", desc: "Gives up the merge or rebase under way: the branch back where it was (:abort)" },
  push: {
    title: "Push",
    desc: "Pushes the branch to its upstream; with none, asks to push it to origin and track it (:push)",
  },
  stash: {
    title: "Stashes",
    desc: "The changes stashed with a message, or a stash popped, applied or dropped (:stash)",
  },
  new_branch: {
    title: "New branch",
    desc: "A name, where it starts, and where it goes: a new worktree, here, or just made",
  },
  merge: {
    title: "Merge…",
    desc: "The selected branch into its base: the links it would break, then the merge, where the base is checked out",
  },
  filter: { title: "Filter", desc: "Type to narrow the files, branches and repositories by name" },
  close: { title: "Close the git panel", desc: "Closes it; focus returns to the note" },
  leave: { title: "Back to the note", desc: "Focuses the note; the panel stays open" },
};

/** The Problems panel takes the explorer's keymap too (1.7), `tab` switching its tabs: what its actions do there, for help. */
export const PROBLEMS_ACTION_INFO: Record<string, { title: string; desc: string; actions?: string[] }> = {
  show_all: { title: "Show all lint findings", desc: "Toggle findings hidden by view settings or lint.ignore" },
  down: { title: "Move down", desc: "Selects the next problem (This file: the note shows it, marked)" },
  up: { title: "Move up", desc: "Selects the previous problem" },
  jump: {
    title: "Go there",
    desc: "Opens the note at the problem (a section's heading: folds or unfolds it)",
    actions: ["open_tab", "expand", "open", "open_split"],
  },
  collapse: { title: "Fold", desc: "All: folds the section, or goes from a problem to its section" },
  top: { title: "Top", desc: "Selects the first row" },
  bottom: { title: "Bottom", desc: "Selects the last row" },
  switch: { title: "Other tab", desc: "Between This file and All" },
  cut: { title: "The merge screen", desc: "All: on a merge's conflict, its file settled on the merge screen" },
  filter: {
    title: "Filter",
    desc: "Type to narrow the problems (This file: by place, message or line; All: by note and link); enter goes there, esc clears",
  },
  close: { title: "Close the problems", desc: "Closes the bottom panel; focus returns to the note" },
  leave: { title: "Back to the note", desc: "Focuses the note; the problems stay open" },
};

/** Keys while a left panel's filter (`/`) has them, for help. Fixed, not from a keymap. */
export const FILTER_KEYS_HELP: [string, string[], string][] = [
  [
    "Narrow the rows",
    ["type"],
    "Filters the explorer (folders kept), the history by path, or the outline (parents kept)",
  ],
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
  rename: {
    title: "Rename the heading",
    desc: "Every link to it fixed wherever it's reached, after a preview (a note's headings)",
  },
};

/** The footnotes view takes the outline's keymap (3.17); what its actions do there, for help. */
export const FOOTNOTE_ACTION_INFO: Record<string, { title: string; desc: string }> = {
  down: { title: "Move down", desc: "Selects the next footnote or reference" },
  up: { title: "Move up", desc: "Selects the previous footnote or reference" },
  jump: { title: "Jump", desc: "Moves the note to the footnote's definition, or to that reference, and focuses it" },
  fold: { title: "Fold", desc: "Hides a footnote's references, or goes from a reference to its footnote" },
  unfold: { title: "Unfold", desc: "Shows a footnote's references, each with its line" },
  top: { title: "Top", desc: "Selects the first footnote" },
  bottom: { title: "Bottom", desc: "Selects the last row" },
  filter: { title: "Filter", desc: "Type to narrow the footnotes by label and text; enter jumps, esc clears" },
  add: {
    title: "Add a footnote",
    desc: "Asks its text: [^N] after the word the cursor is on in the note, [^N]: text at its end",
  },
  edit: { title: "Edit its text", desc: "Asks the selected footnote's new text; its definition becomes one line" },
  delete: { title: "Delete it", desc: "The selected footnote's references and definition, after asking" },
  rename: {
    title: "Rename its label",
    desc: "A new label for the selected footnote, in its references and its definition",
  },
  close: { title: "Close the footnotes", desc: "Closes the right panel; focus returns to the note" },
  leave: { title: "Back to the note", desc: "Focuses the note; the footnotes stay open" },
};

export const RESIZE_ACTIONS: Record<string, { title: string; desc: string }> = {
  narrower: { title: "Narrower", desc: "Shrinks the focused pane or window" },
  wider: { title: "Wider", desc: "Grows the focused pane or window" },
  shorter: { title: "Shorter", desc: "Shrinks the window in a stacked split, or the Problems panel when focused" },
  taller: { title: "Taller", desc: "Grows the window in a stacked split, or the Problems panel when focused" },
  equalize: { title: "Equal sizes", desc: "Evens the split and resets pane widths" },
  leave: { title: "Leave resize mode", desc: "Back to reading" },
};

/** which-key groups by prefix, in config notation: "name: short explanation". */
export const DEFAULT_GROUPS: Record<string, string> = {
  "leader l": "links: follow, list and copy links",
  "leader h": "history: back, forward, everywhere visited",
  "leader w": "window: split, focus, move, resize",
  "leader t": "tabs: open, switch, reorder, close",
  "leader f": "find: notes, headings, tags, text, commands",
  "leader u": "ui: theme, icons, width, zen, toggles",
  "leader s": "scratch: collect references for agents",
  "leader k": "cell: fold, edit, copy, references, problems, scratch — the code view's cell at the cursor",
  "leader c": "code: rename, actions, format — the language server's",
  "leader n": "note: new, rename, move, delete, copy, cut, source, the lens, save, edit elsewhere, reload, info",
  "leader d": "folder: new, rename, move, delete, copy, cut, paste — the explorer's selected one, or this note's",
  "leader v":
    "folders: go into one, its copies, name it, .slipbox/ in or out, the trash, restore, reindex, info, reload config, symlinks answered",
  "leader q": "session: quit",
  y: "copy: selection, path, reference, link",
  "ctrl+w": "window: split, focus, move, resize",
  "ctrl+t": "tabs: open, switch, reorder, close",
  g: "go: top (g), definition (d), type (y), implementations (I), references (r), link (f x), tabs (t T), changes (; ,), last insert (i)",
  z: "scroll: the cursor's line to the middle (z), top (t), bottom (b); a picture: its own size (p), sideways (h l); spelling: suggestions (=), add the word (g); fold the cell (a)",
  "[": "previous: heading ([), link (l), misspelt word (s), change (c), note of this type (t)",
  "]": "next: heading (]), link (l), misspelt word (s), change (c), note of this type (t)",
};

/** A group's value is "name" or "name: explanation". */
export function parseGroup(value: string): { name: string; desc: string } {
  const i = value.indexOf(":");
  return i < 0 ? { name: value.trim(), desc: "" } : { name: value.slice(0, i).trim(), desc: value.slice(i + 1).trim() };
}

/** `:` aliases: alias → command spec. The rest of the typed line becomes the argument. */
export const DEFAULT_ALIASES: Record<string, string> = {
  tags: "tag.list",
  types: "type.list",
  type: "type.list",
  problems: "problems.open",
  footnotes: "footnotes.toggle",
  tag: "tag.list",
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
  restart: "app.restart",
  upgrade: "app.upgrade",
  "e!": "note.revert",
  open: "note.open",
  theme: "theme.set",
  glyphs: "glyphs.set",
  zen: "ui.zen",
  wrap: "ui.wrap",
  hidden: "explorer.toggle_hidden",
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
  report: "help.report",
  reload: "note.reload",
  reindex: "vault.reindex",
  init: "vault.init",
  rename: "note.rename",
  mv: "note.rename",
  relink: "link.relink",
  link: "link.insert",
  folders: "folders.open",
  "folders-default": "folders.default",
  trust: "root.trust",
  untrust: "root.untrust",
  symlinks: "vault.links",
  name: "folder.name",
  "convert-links": "link.convert",
  context: "context.copy",
  export: "note.export",
  "export-notes": "note.export_many",
  search: "search.open",
  changes: "git.changes",
  diff: "git.diff",
  worktrees: "git.worktrees",
  "merge-review": "git.merge_review",
  // The remote's commands and stash (26.6): source control's f, p, shift+p and z.
  fetch: "git.fetch",
  pull: "git.pull",
  push: "git.push",
  stash: "git.stash",
  // The review, the merge screen, rebasing, and a merge or rebase under way (GIT-D3, GIT-D5, GIT-D6).
  review: "git.review",
  resolve: "git.merge_screen",
  rebase: "git.rebase",
  continue: "git.continue",
  skip: "git.skip",
  abort: "git.abort",
  "undo-rename": "rename.undo",
  delete: "note.delete",
  trash: "trash.open",
  "empty-trash": "trash.empty",
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

/**
 * The character a key types (`shift+w` is W, `shift+9` is `(`, `shift+space` — as the kitty
 * protocol reports a shifted space — a space), or null for a named key.
 */
export function keyChar(key: string): string | null {
  if (key === "space" || key === "shift+space") return " ";
  if ([...key].length === 1) return key;
  const m = /^shift\+(.)$/.exec(key);
  if (!m) return null;
  const SHIFTED: Record<string, string> = {
    "9": "(",
    "0": ")",
    "[": "{",
    "]": "}",
    ",": "<",
    ".": ">",
    "'": '"',
    "`": "~",
  };
  return SHIFTED[m[1]!] ?? m[1]!.toUpperCase();
}

/** A key sequence spelled out for reading (help, the palette): `ctrl+d`, `space l y`, `esc`. */
export function spellKey(seq: string): string {
  return seq
    .split(" ")
    .map((k) => k.replace(/(^|\+)escape$/, "$1esc"))
    .join(" ");
}

/** Short human form for which-key and the status line: `ctrl+w shift+h` → `C-w S-h`. */
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
