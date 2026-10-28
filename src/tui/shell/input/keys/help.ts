// Action descriptions, prefix groups and help labels, shared by the keymap and its presentation.
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

/** The Problems panel takes the explorer's keymap too (1.7), `tab` switching its tabs:
 *  what its actions do there, for help. */
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
