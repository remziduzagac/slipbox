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
}

const I = null; // interaction: needs a human at a terminal

export const COMMAND_SPECS: CommandSpec[] = [
  // cursor and scrolling
  { id: "cursor.left", title: "Cursor left", cli: I },
  { id: "cursor.right", title: "Cursor right", cli: I },
  { id: "cursor.up", title: "Cursor up", cli: I },
  { id: "cursor.down", title: "Cursor down", cli: I },
  { id: "cursor.word_prev", title: "Previous word", cli: I },
  { id: "cursor.word_next", title: "Next word", cli: I },
  { id: "cursor.word_end", title: "End of word", cli: I },
  { id: "cursor.line_start", title: "Start of row", cli: I },
  { id: "cursor.line_end", title: "End of row", cli: I },
  { id: "cursor.first_nonblank", title: "First non-blank of row", cli: I },
  { id: "cursor.top", title: "Top of note", cli: I },
  { id: "cursor.bottom", title: "Bottom of note", cli: I },
  { id: "cursor.heading_prev", title: "Previous heading", cli: I },
  { id: "cursor.heading_next", title: "Next heading", cli: I },
  { id: "cursor.paragraph_prev", title: "Previous paragraph", cli: I },
  { id: "cursor.paragraph_next", title: "Next paragraph", cli: I },
  { id: "cursor.half_down", title: "Half page down", cli: I },
  { id: "cursor.half_up", title: "Half page up", cli: I },
  { id: "cursor.page_down", title: "Page down", cli: I },
  { id: "cursor.page_up", title: "Page up", cli: I },
  // selection and copy
  { id: "visual.char", title: "Visual mode (characters)", cli: I },
  { id: "visual.line", title: "Visual mode (rows)", cli: I },
  { id: "visual.swap", title: "Swap selection ends", cli: I },
  { id: "visual.yank", title: "Copy selection and leave visual mode", cli: I },
  { id: "visual.exit", title: "Leave visual mode", cli: I },
  { id: "app.escape", title: "Cancel: selection, find highlights", cli: I },
  { id: "copy.smart", title: "Copy selection or cursor row", cli: I },
  { id: "copy.selection", title: "Copy selection", cli: I },
  { id: "copy.path", title: "Copy note path", cli: "slipbox resolve <note>" },
  { id: "copy.ref", title: "Copy path:line of cursor row", cli: "slipbox resolve <note>" },
  { id: "copy.link", title: "Copy link target", cli: "slipbox resolve <link> --from <note>" },
  // links and history
  { id: "link.next", title: "Next link", cli: I },
  { id: "link.prev", title: "Previous link", cli: I },
  { id: "link.follow", title: "Follow link", cli: "slipbox resolve <link> --from <note>" },
  { id: "link.follow_split", title: "Follow link into the split", cli: "slipbox resolve <link> --from <note>" },
  { id: "links.open", title: "Links from this note", cli: "slipbox links <note>" },
  { id: "backlinks.open", title: "Backlinks: notes linking here", cli: "slipbox backlinks <note>" },
  { id: "history.back", title: "Back", cli: I },
  { id: "history.forward", title: "Forward", cli: I },
  { id: "history.list", title: "History", cli: I },
  // windows and tabs
  { id: "window.split_side", title: "Split side by side", cli: I },
  { id: "window.split_stacked", title: "Split stacked", cli: I },
  { id: "window.focus_left", title: "Focus left", cli: I },
  { id: "window.focus_down", title: "Focus down", cli: I },
  { id: "window.focus_up", title: "Focus up", cli: I },
  { id: "window.focus_right", title: "Focus right", cli: I },
  { id: "window.other", title: "Other window", cli: I },
  { id: "window.move_left", title: "Move window left", cli: I },
  { id: "window.move_down", title: "Move window down", cli: I },
  { id: "window.move_up", title: "Move window up", cli: I },
  { id: "window.move_right", title: "Move window right", cli: I },
  { id: "window.swap", title: "Swap windows", cli: I },
  { id: "window.close", title: "Close window", cli: I },
  { id: "window.only", title: "Keep only this window", cli: I },
  { id: "tab.new", title: "New tab with this note", cli: I },
  { id: "tab.list", title: "Tabs", cli: I },
  { id: "tab.next", title: "Next tab", cli: I },
  { id: "tab.prev", title: "Previous tab", cli: I },
  { id: "tab.goto", title: "Go to tab N", cli: I },
  { id: "tab.move_left", title: "Move tab left", cli: I },
  { id: "tab.move_right", title: "Move tab right", cli: I },
  { id: "tab.close", title: "Close tab", cli: I },
  // panes
  { id: "explorer.cycle", title: "Explorer: open, focus, close", cli: "slipbox ls" },
  { id: "explorer.reveal", title: "Reveal note in explorer", cli: I },
  { id: "outline.toggle", title: "Outline pane", cli: "slipbox outline <note>" },
  // find
  { id: "find.open", title: "Find in note", cli: I },
  { id: "find.next", title: "Next match", cli: I },
  { id: "find.prev", title: "Previous match", cli: I },
  { id: "find.clear", title: "Clear find highlights", cli: I },
  { id: "switcher.open", title: "Quick switcher: find a note", cli: "slipbox ls" },
  { id: "outline.pick", title: "Find a heading in this note", cli: "slipbox outline <note>" },
  { id: "palette.open", title: "Command palette", cli: "slipbox commands" },
  { id: "note.open", title: "Open a note", cli: "slipbox render <note>" },
  // ui
  { id: "ui.list", title: "UI settings", cli: I },
  { id: "theme.pick", title: "Theme", cli: "slipbox render --theme <name>" },
  { id: "theme.set", title: "Set theme", cli: "slipbox render --theme <name>" },
  { id: "glyphs.pick", title: "Glyphs", cli: "slipbox render --glyphs <set>" },
  { id: "glyphs.set", title: "Set glyphs", cli: "slipbox render --glyphs <set>" },
  { id: "ui.readable", title: "Readable width", cli: "slipbox render --width <n>" },
  { id: "ui.zen", title: "Zen mode", cli: I },
  { id: "ui.cursorline", title: "Cursor-row highlight", cli: I },
  { id: "ui.line_numbers", title: "Line numbers", cli: I },
  { id: "ui.urls", title: "Show link URLs", cli: "slipbox render --plain" },
  { id: "ui.mouse", title: "Mouse", cli: I },
  // scratch
  { id: "scratch.open", title: "Open the scratch", cli: "slipbox scratch show" },
  { id: "scratch.add", title: "Add to the scratch", cli: "slipbox capture --ref <path:line> [--snippet]" },
  { id: "scratch.copy", title: "Copy the scratch", cli: "slipbox scratch copy" },
  { id: "scratch.clear", title: "Clear the scratch", cli: "slipbox scratch clear" },
  // note, vault, app
  { id: "note.reload", title: "Reload note from disk", cli: "slipbox render <note>" },
  { id: "note.info", title: "Note info", cli: "slipbox links <note> --json" },
  { id: "vault.reindex", title: "Reindex the vault", cli: "slipbox ls" },
  { id: "vault.info", title: "Vault info", cli: "slipbox info" },
  { id: "config.reload", title: "Reload configuration", cli: "slipbox info" },
  { id: "messages.open", title: "Messages", cli: "slipbox info" },
  { id: "help.open", title: "All keys and commands", cli: "slipbox commands" },
  { id: "app.quit", title: "Quit", cli: I },
];

export function commandSpec(id: string): CommandSpec | undefined {
  return COMMAND_SPECS.find((c) => c.id === id);
}
