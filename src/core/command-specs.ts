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
  { id: "cursor.left", title: "Cursor left", cli: I, desc: "Moves the cursor one character left" },
  { id: "cursor.right", title: "Cursor right", cli: I, desc: "Moves the cursor one character right" },
  { id: "cursor.up", title: "Cursor up", cli: I, desc: "Moves the cursor up one row" },
  { id: "cursor.down", title: "Cursor down", cli: I, desc: "Moves the cursor down one row" },
  { id: "cursor.word_prev", title: "Previous word", cli: I, desc: "Moves to the start of the previous word" },
  { id: "cursor.word_next", title: "Next word", cli: I, desc: "Moves to the start of the next word" },
  { id: "cursor.word_end", title: "End of word", cli: I, desc: "Moves to the end of this word, or the next" },
  { id: "cursor.line_start", title: "Start of row", cli: I, desc: "Moves the cursor to the start of the row" },
  { id: "cursor.line_end", title: "End of row", cli: I, desc: "Moves the cursor to the end of the row" },
  { id: "cursor.first_nonblank", title: "First non-blank of row", cli: I, desc: "Moves to the row's first non-blank character" },
  { id: "cursor.top", title: "Top of note", cli: I, desc: "Moves the cursor to the top of the note" },
  { id: "cursor.bottom", title: "Bottom of note", cli: I, desc: "Moves the cursor to the bottom of the note" },
  { id: "cursor.heading_prev", title: "Previous heading", cli: I, desc: "Moves to the heading before the cursor" },
  { id: "cursor.heading_next", title: "Next heading", cli: I, desc: "Moves to the heading after the cursor" },
  { id: "cursor.paragraph_prev", title: "Previous paragraph", cli: I, desc: "Moves to the blank row before this block" },
  { id: "cursor.paragraph_next", title: "Next paragraph", cli: I, desc: "Moves to the blank row after this block" },
  { id: "cursor.half_down", title: "Half page down", cli: I, desc: "Scrolls half a page down, cursor along" },
  { id: "cursor.half_up", title: "Half page up", cli: I, desc: "Scrolls half a page up, cursor along" },
  { id: "cursor.page_down", title: "Page down", cli: I, desc: "Scrolls a page down, cursor along" },
  { id: "cursor.page_up", title: "Page up", cli: I, desc: "Scrolls a page up, cursor along" },
  // selection and copy
  { id: "visual.char", title: "Visual mode (characters)", cli: I, desc: "Starts selecting by character as you move" },
  { id: "visual.line", title: "Visual mode (rows)", cli: I, desc: "Starts selecting whole rows as you move" },
  { id: "visual.swap", title: "Swap selection ends", cli: I, desc: "Jumps to the other end of the selection" },
  { id: "visual.yank", title: "Copy selection and leave visual mode", cli: I, desc: "Copies the selection and stops selecting" },
  { id: "visual.exit", title: "Leave visual mode", cli: I, desc: "Stops selecting, copying nothing" },
  { id: "app.escape", title: "Cancel: selection, find highlights", cli: I, desc: "Clears the selection, then find highlights" },
  { id: "copy.smart", title: "Copy selection or cursor row", cli: I, desc: "Copies the selection, or else the cursor row" },
  { id: "copy.selection", title: "Copy selection", cli: I, desc: "Copies the selection, if there is one" },
  { id: "copy.path", title: "Copy note path", cli: "slipbox resolve <note>", desc: "Copies the note's absolute path" },
  { id: "copy.ref", title: "Copy path:line of cursor row", cli: "slipbox resolve <note>", desc: "Copies path:line of the cursor row, for prompts" },
  { id: "copy.link", title: "Copy link target", cli: "slipbox resolve <link> --from <note>", desc: "Copies where the link under the cursor points" },
  // links and history
  { id: "link.next", title: "Next link", cli: I, desc: "Moves the cursor to the next link" },
  { id: "link.prev", title: "Previous link", cli: I, desc: "Moves the cursor to the previous link" },
  { id: "link.follow", title: "Follow link", cli: "slipbox resolve <link> --from <note>", desc: "Opens the link under the cursor" },
  { id: "link.follow_split", title: "Follow link into the split", cli: "slipbox resolve <link> --from <note>", desc: "Opens the link under the cursor in the split" },
  { id: "links.open", title: "Links from this note", cli: "slipbox links <note>", desc: "Lists every link in this note, with its status" },
  { id: "backlinks.open", title: "Backlinks: notes linking here", cli: "slipbox backlinks <note>", desc: "Lists the notes that link to this one" },
  { id: "history.back", title: "Back", cli: I, desc: "Goes back to where you were before" },
  { id: "history.forward", title: "Forward", cli: I, desc: "Goes forward again, undoing a back" },
  { id: "history.list", title: "History", cli: I, desc: "Shows every place visited in the left panel; pick one to jump" },
  // windows and tabs
  { id: "window.split_side", title: "Split side by side", cli: I, desc: "Splits the window into two, side by side" },
  { id: "window.split_stacked", title: "Split stacked", cli: I, desc: "Splits the window into two, one above the other" },
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
  { id: "window.close", title: "Close window", cli: I, desc: "Closes this window" },
  { id: "window.only", title: "Keep only this window", cli: I, desc: "Closes the other window" },
  { id: "window.resize_mode", title: "Resize mode", cli: I, desc: "Resizes with h j k l or arrows until esc" },
  { id: "breadcrumb.path", title: "Heading path", cli: I, desc: "Lists the headings the cursor is under, as a dropdown; pick one to jump" },
  { id: "window.equalize", title: "Equal window sizes", cli: I, desc: "Gives both windows the same size" },
  { id: "window.wider", title: "Wider", cli: I, desc: "Grows the focused pane or window, then stays in resize mode" },
  { id: "window.narrower", title: "Narrower", cli: I, desc: "Shrinks the focused pane or window, then stays in resize mode" },
  { id: "window.taller", title: "Taller", cli: I, desc: "Grows the window in a stacked split, then stays in resize mode" },
  { id: "window.shorter", title: "Shorter", cli: I, desc: "Shrinks the window in a stacked split, then stays in resize mode" },
  { id: "tab.new", title: "New tab with this note", cli: I, desc: "Opens this note in a new tab" },
  { id: "tab.list", title: "Tabs", cli: I, desc: "Lists every tab; pick one to switch" },
  { id: "tab.next", title: "Next tab", cli: I, desc: "Switches to the tab on the right" },
  { id: "tab.prev", title: "Previous tab", cli: I, desc: "Switches to the tab on the left" },
  { id: "tab.goto", title: "Go to tab N", cli: I, desc: "Switches to tab number N" },
  { id: "tab.move_left", title: "Move tab left", cli: I, desc: "Moves this tab one place left" },
  { id: "tab.move_right", title: "Move tab right", cli: I, desc: "Moves this tab one place right" },
  { id: "tab.close", title: "Close tab", cli: I, desc: "Closes this tab" },
  // panes
  { id: "explorer.cycle", title: "Explorer: open, focus, close", cli: "slipbox ls", desc: "Opens the file tree, then focuses, closes it" },
  { id: "explorer.reveal", title: "Reveal note in explorer", cli: I, desc: "Selects this note in the file tree" },
  { id: "outline.cycle", title: "Outline: open, focus, close", cli: "slipbox outline <note>", desc: "Opens the outline, then focuses, then closes it" },
  { id: "outline.toggle", title: "Show or hide the outline", cli: "slipbox outline <note>", desc: "Shows the outline (focusing it) or hides it" },
  // find
  { id: "find.open", title: "Find in note", cli: I, desc: "Searches this note; the cursor goes to matches" },
  { id: "find.next", title: "Next match", cli: I, desc: "Moves to the next match after the cursor, wrapping at the end" },
  { id: "find.prev", title: "Previous match", cli: I, desc: "Moves to the previous match before the cursor, wrapping at the top" },
  { id: "find.word_next", title: "Find the word under the cursor", cli: I, desc: "Searches for the whole word under the cursor, forward (vim's *)" },
  { id: "find.word_prev", title: "Find the word under the cursor, backward", cli: I, desc: "Searches for the whole word under the cursor, backward (vim's #)" },
  { id: "find.clear", title: "Clear find highlights", cli: I, desc: "Removes the find highlights" },
  { id: "task.toggle", title: "Toggle task", cli: I, desc: "Ticks or unticks the checkbox of the task item at the cursor; a click on [ ] does too" },
  { id: "switcher.open", title: "Quick switcher: find a note", cli: "slipbox ls", desc: "Opens a note by typing part of its name" },
  { id: "outline.pick", title: "Find a heading in this note", cli: "slipbox outline <note>", desc: "Jumps to a heading by typing part of it" },
  { id: "palette.open", title: "Command palette", cli: "slipbox commands", desc: "Runs any command by name, or an :alias" },
  { id: "note.open", title: "Open a note", cli: "slipbox render <note>", desc: "Opens a note by name" },
  // ui
  { id: "ui.list", title: "UI settings", cli: I, desc: "Lists every UI setting and its value" },
  { id: "theme.pick", title: "Theme", cli: "slipbox render --theme <name>", desc: "Picks a theme, previewed live" },
  { id: "theme.set", title: "Set theme", cli: "slipbox render --theme <name>", desc: "Switches to a named theme" },
  { id: "glyphs.pick", title: "Glyphs", cli: "slipbox render --glyphs <set>", desc: "Picks nerd, unicode or ascii icons, previewed" },
  { id: "glyphs.set", title: "Set glyphs", cli: "slipbox render --glyphs <set>", desc: "Switches the icon set" },
  { id: "ui.readable", title: "Readable width", cli: "slipbox render --width <n>", desc: "Caps the text to a narrow, centred column" },
  { id: "ui.zen", title: "Zen mode", cli: I, desc: "Hides everything but the note" },
  { id: "ui.cursorline", title: "Cursor-row highlight", cli: I, desc: "Highlights the cursor row" },
  { id: "ui.line_numbers", title: "Line numbers", cli: I, desc: "Shows source line numbers on the left" },
  { id: "ui.wrap", title: "Wrap long lines", cli: "slipbox render --width <n>", desc: "Wraps to the pane, or scrolls sideways when off" },
  { id: "ui.urls", title: "Show link URLs", cli: "slipbox render --plain", desc: "Prints link addresses after their text" },
  { id: "ui.mouse", title: "Mouse", cli: I, desc: "Turns the mouse off so the terminal selects" },
  // scratch
  { id: "scratch.open", title: "Open the scratch", cli: "slipbox scratch show", desc: "Opens the scratch; it updates as agents add" },
  { id: "scratch.add", title: "Add to the scratch", cli: "slipbox capture --ref <path:line> [--snippet]", desc: "Adds the selection or cursor row, with path:line" },
  { id: "scratch.copy", title: "Copy the scratch", cli: "slipbox scratch copy", desc: "Copies the whole scratch" },
  { id: "scratch.clear", title: "Clear the scratch", cli: "slipbox scratch clear", desc: "Empties the scratch (asks first)" },
  // note, vault, app
  { id: "note.reload", title: "Reload note from disk", cli: "slipbox render <note>", desc: "Reads the note from disk again" },
  { id: "note.edit", title: "Edit in your editor", cli: I, desc: "Hands the note to your editor at the cursor's line, in this terminal; back here when it closes" },
  { id: "note.send", title: "Send to your running editor", cli: I, desc: "Opens the note at the cursor's line in an editor already running elsewhere ([editor] remote)" },
  { id: "note.info", title: "Note info", cli: "slipbox links <note> --json", desc: "Shows path, size, links, backlinks, encoding" },
  { id: "vault.reindex", title: "Reindex the vault", cli: "slipbox ls", desc: "Re-walks and re-reads every note" },
  { id: "vault.info", title: "Vault info", cli: "slipbox info", desc: "Shows root, notes, watcher, cache and state" },
  { id: "config.reload", title: "Reload configuration", cli: "slipbox info", desc: "Applies config changes now (saving does too)" },
  { id: "messages.open", title: "Messages", cli: "slipbox info", desc: "Lists everything slipbox has said" },
  { id: "help.open", title: "All keys and commands", cli: "slipbox commands", desc: "Lists every key and command, searchable" },
  { id: "app.quit", title: "Quit", cli: I, desc: "Saves positions and the session, then quits" },
];

export function commandSpec(id: string): CommandSpec | undefined {
  return COMMAND_SPECS.find((c) => c.id === id);
}

/**
 * The groups commands are listed under in help and the palette: the sections of
 * docs/design/keymap.md, in its order. The first group whose pattern matches an id wins.
 */
export const COMMAND_GROUPS: { title: string; ids: RegExp }[] = [
  { title: "Cursor", ids: /^cursor\./ },
  { title: "Selection & copy", ids: /^(visual\.|copy\.|app\.escape$)/ },
  { title: "Links & history", ids: /^(link\.|links\.|backlinks\.|history\.)/ },
  { title: "Windows", ids: /^window\./ },
  { title: "Tabs", ids: /^tab\./ },
  { title: "Explorer", ids: /^explorer\./ },
  { title: "Outline", ids: /^outline\.(cycle|toggle)$/ },
  { title: "Find", ids: /^(find\.|switcher\.|outline\.pick$|breadcrumb\.path$|palette\.|note\.open$)/ },
  { title: "Editing", ids: /^(task\.|edit\.)/ },
  { title: "UI", ids: /^(ui\.|theme\.|glyphs\.)/ },
  { title: "Scratch", ids: /^scratch\./ },
  { title: "Note, vault, app", ids: /^(note\.|vault\.|config\.|messages\.|help\.|app\.)/ },
];

export function commandGroup(id: string): string {
  return COMMAND_GROUPS.find((g) => g.ids.test(id))?.title ?? "Other";
}
