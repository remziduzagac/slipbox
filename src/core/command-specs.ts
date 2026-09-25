// The named command list (0.8) as data, with each command's CLI parity (plan "Principles").
//
// The TUI binds implementations to these ids; the CLI lists them (`slipbox commands`). Every
// command either names the CLI invocation that reaches the same state change, or is marked an
// interaction — cursor, scroll, selection, focus, panes, overlays — the one stated exception
// class. A test enforces that nothing is left undeclared, so parity cannot quietly decay.

export interface CommandSpec {
  id: string;
  title: string;
  /** CLI invocation reaching the same state change, or null for a TUI-only interaction. */
  cli: string | null;
  /** A short explanation, shown under the entry in the which-key popup and in the palette. */
  desc: string;
}

const I = null; // interaction: needs a human at a terminal

export const COMMAND_SPECS: CommandSpec[] = [
  // cursor and scrolling
  { id: "cursor.left", title: "Cursor left", cli: I, desc: "one character left" },
  { id: "cursor.right", title: "Cursor right", cli: I, desc: "one character right" },
  { id: "cursor.up", title: "Cursor up", cli: I, desc: "one row up" },
  { id: "cursor.down", title: "Cursor down", cli: I, desc: "one row down" },
  { id: "cursor.word_prev", title: "Previous word", cli: I, desc: "start of the previous word" },
  { id: "cursor.word_next", title: "Next word", cli: I, desc: "start of the next word" },
  { id: "cursor.word_end", title: "End of word", cli: I, desc: "end of this or the next word" },
  { id: "cursor.line_start", title: "Start of row", cli: I, desc: "first column of the row" },
  { id: "cursor.line_end", title: "End of row", cli: I, desc: "last character of the row" },
  { id: "cursor.first_nonblank", title: "First non-blank of row", cli: I, desc: "first non-blank character of the row" },
  { id: "cursor.top", title: "Top of note", cli: I, desc: "first row of the note" },
  { id: "cursor.bottom", title: "Bottom of note", cli: I, desc: "last row of the note" },
  { id: "cursor.heading_prev", title: "Previous heading", cli: I, desc: "the heading before the cursor" },
  { id: "cursor.heading_next", title: "Next heading", cli: I, desc: "the heading after the cursor" },
  { id: "cursor.paragraph_prev", title: "Previous paragraph", cli: I, desc: "the blank row before this block" },
  { id: "cursor.paragraph_next", title: "Next paragraph", cli: I, desc: "the blank row after this block" },
  { id: "cursor.half_down", title: "Half page down", cli: I, desc: "half a page, cursor and view together" },
  { id: "cursor.half_up", title: "Half page up", cli: I, desc: "half a page, cursor and view together" },
  { id: "cursor.page_down", title: "Page down", cli: I, desc: "a page, cursor and view together" },
  { id: "cursor.page_up", title: "Page up", cli: I, desc: "a page, cursor and view together" },
  // selection and copy
  { id: "visual.char", title: "Visual mode (characters)", cli: I, desc: "select by character as the cursor moves" },
  { id: "visual.line", title: "Visual mode (rows)", cli: I, desc: "select whole rows as the cursor moves" },
  { id: "visual.swap", title: "Swap selection ends", cli: I, desc: "jump to the other end of the selection" },
  { id: "visual.yank", title: "Copy selection and leave visual mode", cli: I, desc: "copy what is selected and stop selecting" },
  { id: "visual.exit", title: "Leave visual mode", cli: I, desc: "stop selecting" },
  { id: "app.escape", title: "Cancel: selection, find highlights", cli: I, desc: "clear the selection, then find highlights" },
  { id: "copy.smart", title: "Copy selection or cursor row", cli: I, desc: "the selection, or the whole cursor row" },
  { id: "copy.selection", title: "Copy selection", cli: I, desc: "only when something is selected" },
  { id: "copy.path", title: "Copy note path", cli: "slipbox resolve <note>", desc: "the note's absolute path" },
  { id: "copy.ref", title: "Copy path:line of cursor row", cli: "slipbox resolve <note>", desc: "path:line of the cursor row, for prompts" },
  { id: "copy.link", title: "Copy link target", cli: "slipbox resolve <link> --from <note>", desc: "where the link under the cursor points" },
  // links and history
  { id: "link.next", title: "Next link", cli: I, desc: "move the cursor to the next link" },
  { id: "link.prev", title: "Previous link", cli: I, desc: "move the cursor to the previous link" },
  { id: "link.follow", title: "Follow link", cli: "slipbox resolve <link> --from <note>", desc: "open the link under the cursor" },
  { id: "link.follow_split", title: "Follow link into the split", cli: "slipbox resolve <link> --from <note>", desc: "open it in the other window" },
  { id: "links.open", title: "Links from this note", cli: "slipbox links <note>", desc: "every link in this note, with its status" },
  { id: "backlinks.open", title: "Backlinks: notes linking here", cli: "slipbox backlinks <note>", desc: "notes that link to this one" },
  { id: "history.back", title: "Back", cli: I, desc: "where you were before" },
  { id: "history.forward", title: "Forward", cli: I, desc: "undo a back" },
  { id: "history.list", title: "History", cli: I, desc: "every place visited; jump anywhere" },
  // windows and tabs
  { id: "window.split_side", title: "Split side by side", cli: I, desc: "two windows, side by side" },
  { id: "window.split_stacked", title: "Split stacked", cli: I, desc: "two windows, one above the other" },
  { id: "window.focus_left", title: "Focus left", cli: I, desc: "the window or pane to the left" },
  { id: "window.focus_down", title: "Focus down", cli: I, desc: "the window below" },
  { id: "window.focus_up", title: "Focus up", cli: I, desc: "the window above" },
  { id: "window.focus_right", title: "Focus right", cli: I, desc: "the window or pane to the right" },
  { id: "window.other", title: "Other window", cli: I, desc: "switch between the two windows" },
  { id: "window.move_left", title: "Move window left", cli: I, desc: "make this the left window" },
  { id: "window.move_down", title: "Move window down", cli: I, desc: "make this the bottom window" },
  { id: "window.move_up", title: "Move window up", cli: I, desc: "make this the top window" },
  { id: "window.move_right", title: "Move window right", cli: I, desc: "make this the right window" },
  { id: "window.swap", title: "Swap windows", cli: I, desc: "exchange the two windows" },
  { id: "window.close", title: "Close window", cli: I, desc: "close this window" },
  { id: "window.only", title: "Keep only this window", cli: I, desc: "close the other window" },
  { id: "window.resize_mode", title: "Resize mode", cli: I, desc: "resize with h j k l or arrows until esc" },
  { id: "window.equalize", title: "Equal window sizes", cli: I, desc: "give both windows the same size" },
  { id: "tab.new", title: "New tab with this note", cli: I, desc: "a new tab showing this note" },
  { id: "tab.list", title: "Tabs", cli: I, desc: "every tab; pick one" },
  { id: "tab.next", title: "Next tab", cli: I, desc: "the tab to the right" },
  { id: "tab.prev", title: "Previous tab", cli: I, desc: "the tab to the left" },
  { id: "tab.goto", title: "Go to tab N", cli: I, desc: "jump to tab number N" },
  { id: "tab.move_left", title: "Move tab left", cli: I, desc: "reorder: move this tab left" },
  { id: "tab.move_right", title: "Move tab right", cli: I, desc: "reorder: move this tab right" },
  { id: "tab.close", title: "Close tab", cli: I, desc: "close this tab" },
  // panes
  { id: "explorer.cycle", title: "Explorer: open, focus, close", cli: "slipbox ls", desc: "open the file tree, focus it, then close it" },
  { id: "explorer.reveal", title: "Reveal note in explorer", cli: I, desc: "select this note in the file tree" },
  { id: "outline.cycle", title: "Outline: open, focus, close", cli: "slipbox outline <note>", desc: "the headings of this note, on the right" },
  { id: "outline.toggle", title: "Show or hide the outline", cli: "slipbox outline <note>", desc: "opening it also focuses it" },
  // find
  { id: "find.open", title: "Find in note", cli: I, desc: "search this note; the cursor goes to the match" },
  { id: "find.next", title: "Next match", cli: I, desc: "the next match" },
  { id: "find.prev", title: "Previous match", cli: I, desc: "the previous match" },
  { id: "find.clear", title: "Clear find highlights", cli: I, desc: "remove the find highlights" },
  { id: "switcher.open", title: "Quick switcher: find a note", cli: "slipbox ls", desc: "open any note by typing part of its name" },
  { id: "outline.pick", title: "Find a heading in this note", cli: "slipbox outline <note>", desc: "jump to a heading by typing part of it" },
  { id: "palette.open", title: "Command palette", cli: "slipbox commands", desc: "run any command by name, or :alias" },
  { id: "note.open", title: "Open a note", cli: "slipbox render <note>", desc: "open a note by name" },
  // ui
  { id: "ui.list", title: "UI settings", cli: I, desc: "every UI setting and its value" },
  { id: "theme.pick", title: "Theme", cli: "slipbox render --theme <name>", desc: "choose a theme with a live preview" },
  { id: "theme.set", title: "Set theme", cli: "slipbox render --theme <name>", desc: "switch to a named theme" },
  { id: "glyphs.pick", title: "Glyphs", cli: "slipbox render --glyphs <set>", desc: "nerd, unicode or ascii icons, previewed" },
  { id: "glyphs.set", title: "Set glyphs", cli: "slipbox render --glyphs <set>", desc: "switch the icon set" },
  { id: "ui.readable", title: "Readable width", cli: "slipbox render --width <n>", desc: "narrow, centred text column" },
  { id: "ui.zen", title: "Zen mode", cli: I, desc: "hide everything but the note" },
  { id: "ui.cursorline", title: "Cursor-row highlight", cli: I, desc: "highlight the cursor row" },
  { id: "ui.line_numbers", title: "Line numbers", cli: I, desc: "source line numbers on the left" },
  { id: "ui.urls", title: "Show link URLs", cli: "slipbox render --plain", desc: "print link addresses after their text" },
  { id: "ui.mouse", title: "Mouse", cli: I, desc: "off lets the terminal select text itself" },
  // scratch
  { id: "scratch.open", title: "Open the scratch", cli: "slipbox scratch show", desc: "the scratch; it updates as agents add to it" },
  { id: "scratch.add", title: "Add to the scratch", cli: "slipbox capture --ref <path:line> [--snippet]", desc: "the selection or the cursor row, with its path:line" },
  { id: "scratch.copy", title: "Copy the scratch", cli: "slipbox scratch copy", desc: "copy the whole scratch" },
  { id: "scratch.clear", title: "Clear the scratch", cli: "slipbox scratch clear", desc: "empty the scratch (asks first)" },
  // note, vault, app
  { id: "note.reload", title: "Reload note from disk", cli: "slipbox render <note>", desc: "read the note from disk again" },
  { id: "note.info", title: "Note info", cli: "slipbox links <note> --json", desc: "path, size, links, backlinks, encoding" },
  { id: "vault.reindex", title: "Reindex the vault", cli: "slipbox ls", desc: "re-walk and re-read every note" },
  { id: "vault.info", title: "Vault info", cli: "slipbox info", desc: "root, notes, watcher, cache and state" },
  { id: "config.reload", title: "Reload configuration", cli: "slipbox info", desc: "apply config changes now (saving also does it)" },
  { id: "messages.open", title: "Messages", cli: "slipbox info", desc: "everything slipbox has said" },
  { id: "help.open", title: "All keys and commands", cli: "slipbox commands", desc: "every key and command, searchable" },
  { id: "app.quit", title: "Quit", cli: I, desc: "save positions and the session, then exit" },
];

export function commandSpec(id: string): CommandSpec | undefined {
  return COMMAND_SPECS.find((c) => c.id === id);
}
