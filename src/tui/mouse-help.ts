// The mouse's part of help (`?`), kept apart from the actions so the docs' tests read it without the TUI (D230).

/** The mouse, for help: [what, how, detail] — as the keys chapter's § Mouse has it (docs/manual/keys.md). */
export const MOUSE_HELP: [string, string[], string][] = [
  // In the notes.
  ["Move the cursor", ["click"], "Moves the cursor to where you click in a note; on a link, follows it"],
  [
    "Select and copy",
    ["drag"],
    "Selects the text you drag over and copies it on release; in source mode or the lens, a selection d, c and x act on",
  ],
  [
    "Peek, or go there",
    ["click", "ctrl+click"],
    "On a link out of the vault: a click peeks at the file, ctrl+click goes there at once",
  ],
  ["Select a word / a row", ["double-click", "triple-click"], "Selects the word or the whole row, and copies it"],
  ["Tick a task", ["click"], "On its box (☐ / ☑): ticks or unticks it"],
  [
    "A picture at its own size",
    ["click"],
    "On a picture: shows it at its own size, scrolled sideways where it's wider than the window; again, fits it to the window",
  ],
  [
    "Scroll",
    ["wheel"],
    "Scrolls the note (sideways too, when wrapping is off), a panel (its selection stays) or a list (its selection moves only to stay in view); over a code block too wide or a picture at its own size, a sideways wheel or shift with it scrolls it; over the tab strip, switches tabs",
  ],
  // Around them.
  [
    "Show a panel's view",
    ["click"],
    "On a rail: ≡ the explorer, ◷ the history, ± source control, ℹ Info, ▤ the outline, ¹ the footnotes, focused; again hides it",
  ],
  ["Open the command palette", ["click"], "On the top bar's slipbox"],
  [
    "Switch a window's mode",
    ["click"],
    "On a window's header: Read, Lens or Source shows it rendered, in the lens or as written, and focuses it; one in italics says why it can't",
  ],
  [
    "Jump to a heading",
    ["click"],
    "On a heading in a window's breadcrumb: scrolls that window to it and focuses it; the breadcrumb's icon finds a heading, its … lists the ones the cursor is under",
  ],
  [
    "Switch, reorder, close tabs",
    ["click", "drag", "middle-click"],
    "On the tab strip: switches, drags to reorder, closes (so does ×); its +N lists the tabs that don't fit",
  ],
  [
    "Resize panes and splits",
    ["drag"],
    "Drags a pane's border, or the Problems panel's rule, to resize what's beside it",
  ],
  ["Scroll to a place", ["click", "drag"], "On a scrollbar (either direction): jumps there, or drags it"],
  ["Back / forward", ["click"], "On the status line's ‹ / ›: back and forward in the window's history"],
  ["The window's history", ["click"], "On the status line's path: the places the window has been, Copy path first"],
  [
    "The branches",
    ["click"],
    "On the status line's vault and branch, in a repository: pull, push and fetch, then the branches to check one out",
  ],
  ["A change in the gutter", ["click"], "On a change's sign: the change, with Revert and Stage"],
  [
    "The problems",
    ["click"],
    "On the status line's problems: the Problems panel on This file (All when it has none), or closes it; a sign in the problems bar or a coloured line number: on that problem",
  ],
  ["The messages", ["click"], "On a message's floating box: the messages list"],
  ["which-key's entries", ["click"], "A group opens it; a command runs"],
  ["A code cell's buttons", ["click"], "As its keys (space k): fold, edit, copy, references, problems, scratch"],
  // In the panels and lists.
  [
    "Open a note as a tab",
    ["click", "double-click"],
    "In the explorer: a click selects a note, a double-click opens it as a tab; a click on a folder folds or unfolds it",
  ],
  ["Go to a place", ["click", "double-click"], "In the history: a click selects, a double-click goes there"],
  [
    "Work in source control",
    ["click", "double-click", "right-click"],
    "In the git panel: a file's row shows its diff, a double-click opens it; under the pointer, a row's buttons (+ stage, − unstage, ↺ discard, ⧉ its diff) and a heading's; its message box, buttons and branches as their keys; a right click, the row's menu",
  ],
  ["Go to a heading", ["click"], "In the outline: goes to the heading; on ▾ / ▸, folds or unfolds it"],
  ["Go to a footnote", ["click"], "In the footnotes or Info: goes to the footnote, or opens what the row names"],
  [
    "Problems' tabs and rows",
    ["click"],
    "A tab's title switches to it; a row: This file shows the problem and goes there on a second click, All opens it",
  ],
  [
    "Pick or answer",
    ["click"],
    "A list's entry picks it; a question's buttons (OK, Cancel; Yes, No) answer it; outside a list or a question closes it (a question: cancelled)",
  ],
];
