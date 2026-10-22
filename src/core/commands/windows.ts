// Command specs: windows, tabs, panes, the explorer, the outline and find.

import type { CommandSpec } from "../command-specs";

const I = null; // interaction: needs a human at a terminal

export const WINDOW_SPECS: CommandSpec[] = [
  // windows and tabs
  { id: "window.split_side", title: "Split side by side", cli: I, desc: "Splits the window into two, side by side" },
  {
    id: "window.split_stacked",
    title: "Split stacked",
    cli: I,
    desc: "Splits the window into two, one above the other",
  },
  { id: "window.focus_left", title: "Focus left", cli: I, desc: "Focuses the window or pane to the left" },
  { id: "window.focus_down", title: "Focus down", cli: I, desc: "Focuses the window below" },
  { id: "window.focus_up", title: "Focus up", cli: I, desc: "Focuses the window above" },
  { id: "window.focus_right", title: "Focus right", cli: I, desc: "Focuses the window or pane to the right" },
  { id: "window.other", title: "Other window", cli: I, desc: "Switches focus between the two windows" },
  { id: "window.move_left", title: "Move window left", cli: I, desc: "Moves this window to the left side" },
  { id: "window.move_down", title: "Move window down", cli: I, desc: "Moves this window to the bottom" },
  { id: "window.move_up", title: "Move window up", cli: I, desc: "Moves this window to the top" },
  { id: "window.move_right", title: "Move window right", cli: I, desc: "Moves this window to the right side" },
  { id: "window.swap", title: "Swap windows", cli: I, desc: "Swaps the two windows' places" },
  {
    id: "window.close",
    title: "Close window",
    cli: I,
    desc: "Closes this window, or the tab when it's the last window; never quits (ctrl+q does)",
  },
  {
    id: "window.close_or_quit",
    title: "Close window, quit on the last",
    cli: I,
    desc: "Closes this window, or its tab; on the very last one, quits (vim's :q)",
  },
  { id: "window.only", title: "Keep only this window", cli: I, desc: "Closes the other window" },
  { id: "window.resize_mode", title: "Resize mode", cli: I, desc: "Resizes with h j k l or arrows until esc" },
  {
    id: "breadcrumb.path",
    title: "Heading path",
    cli: I,
    desc: "Lists the headings the cursor is under, as a dropdown; pick one to jump",
  },
  { id: "window.equalize", title: "Equal window sizes", cli: I, desc: "Gives both windows the same size" },
  { id: "window.wider", title: "Wider", cli: I, desc: "Grows the focused pane or window, then stays in resize mode" },
  {
    id: "window.narrower",
    title: "Narrower",
    cli: I,
    desc: "Shrinks the focused pane or window, then stays in resize mode",
  },
  {
    id: "window.taller",
    title: "Taller",
    cli: I,
    desc: "Grows the window in a stacked split, then stays in resize mode",
  },
  {
    id: "window.shorter",
    title: "Shorter",
    cli: I,
    desc: "Shrinks the window in a stacked split, then stays in resize mode",
  },
  {
    id: "tab.new",
    title: "New tab with this note",
    cli: I,
    desc: "Opens this note in a new tab; in a split, moves this window out into a tab of its own",
  },
  { id: "tab.list", title: "Tabs", cli: I, desc: "Lists every tab; pick one to switch" },
  { id: "tab.next", title: "Next tab", cli: I, desc: "Switches to the tab on the right" },
  { id: "tab.prev", title: "Previous tab", cli: I, desc: "Switches to the tab on the left" },
  { id: "tab.goto", title: "Go to tab N", cli: I, desc: "Switches to tab number N" },
  { id: "tab.move_left", title: "Move tab left", cli: I, desc: "Moves this tab one place left" },
  { id: "tab.move_right", title: "Move tab right", cli: I, desc: "Moves this tab one place right" },
  { id: "tab.close", title: "Close tab", cli: I, desc: "Closes this tab" },
  {
    id: "tab.pin",
    title: "Pin or unpin tab",
    cli: I,
    desc: "Pins this tab at the left: links and notes opened from it open in new tabs, and close others / all keep it",
  },
  {
    id: "tab.close_others",
    title: "Close other tabs",
    cli: I,
    desc: "Keeps only this tab; unsaved notes stay open, unsaved",
  },
  {
    id: "tab.close_all",
    title: "Close all tabs",
    cli: I,
    desc: "Closes every tab, the explorer ready to open a note; unsaved notes stay open, unsaved",
  },
  // panes
  {
    id: "explorer.cycle",
    title: "Explorer: open, focus, close",
    cli: "slipbox ls",
    desc: "Opens the file tree, then focuses, closes it",
  },
  { id: "explorer.reveal", title: "Reveal note in explorer", cli: I, desc: "Selects this note in the file tree" },
  {
    id: "explorer.toggle_hidden",
    title: "Show or hide hidden files",
    cli: I,
    desc: "The explorer lists the files and folders whose names start with a dot, not indexed (⊘), or stops (files.hidden)",
  },
  {
    id: "outline.cycle",
    title: "Outline: open, focus, close",
    cli: "slipbox outline <note>",
    desc: "Opens the outline, then focuses, then closes it",
  },
  {
    id: "outline.toggle",
    title: "Show or hide the outline",
    cli: "slipbox outline <note>",
    desc: "Shows the outline (focusing it) or hides it",
  },
  {
    id: "footnotes.cycle",
    title: "Footnotes: open, focus, close",
    cli: "slipbox footnotes <note>",
    desc: "Opens the note's footnotes in the right panel, then focuses, then closes them",
  },
  {
    id: "footnote.add",
    title: "Add a footnote",
    cli: "slipbox footnotes <note> add <line[:col]> <text>",
    desc: "Asks its text: [^N] after the word the cursor is on, [^N]: text at the note's end; saved, one undo step",
  },
  {
    id: "footnotes.toggle",
    title: "Show or hide the footnotes",
    cli: "slipbox footnotes <note>",
    desc: "Each footnote, its text and references, in the right panel (focusing it), or hides it",
  },
  // find
  {
    id: "find.open",
    title: "Find in note",
    cli: "slipbox find <query> [<note>]",
    desc: "Searches this note; the cursor goes to matches",
  },
  {
    id: "find.replace",
    title: "Find and replace",
    cli: "slipbox replace <note> <old> <new>",
    desc: "Find with a replace row under it: enter replaces one, alt+enter all, as one undo step",
  },
  {
    id: "find.vault",
    title: "Find in every note",
    cli: "slipbox find <query>",
    desc: "Every line of every note (and open file) with the text or regex; enter opens the note at the match",
  },
  {
    id: "shell.run",
    title: "Run a command",
    cli: I,
    desc: ":!cmd — your shell runs it in the vault's top folder, % the file's path; its output in a window, enter on a path:line opens it",
  },
  {
    id: "shell.filter",
    title: "Filter lines through a command",
    cli: I,
    desc: ":'<,'>!sort, :%!cmd, :.!cmd, :3,7!cmd — the lines replaced by what it prints, one undo step; ! in visual mode",
  },
  {
    id: "shell.stop",
    title: "Stop the running command",
    cli: I,
    desc: "Ends the command :! started, and what it started",
  },
  {
    id: "find.replace_vault",
    title: "Replace in every note",
    cli: "slipbox replace --all <old> <new> [--files]",
    desc: "Asks what to find and what with, then previews each line it changes in every note and shown file: enter does it, space v shift+u undoes it",
  },
];
