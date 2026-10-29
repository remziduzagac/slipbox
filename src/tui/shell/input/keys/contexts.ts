// Source, visual, pane and modal bindings and their allowed actions.
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
  // Source mode: edit the selection. backspace and delete too, as a desktop editor's
  // (a shift selection is a visual one).
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
