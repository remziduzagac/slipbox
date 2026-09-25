// The named command list (0.8) as data, with each command's CLI parity (plan "Principles").
//
// The TUI binds implementations to these ids; the CLI lists them (`slipbox commands`). Every
// command either names the CLI invocation that reaches the same state change, or is marked an
// interaction — scroll, cursor, modes, overlays — the one stated exception class. A test enforces
// that nothing is left undeclared, so parity cannot quietly decay.

export interface CommandSpec {
  id: string;
  title: string;
  /** CLI invocation reaching the same state change, or null for a TUI-only interaction. */
  cli: string | null;
}

const I = null; // interaction: needs a human at a terminal

export const COMMAND_SPECS: CommandSpec[] = [
  // reading and scrolling — interactions
  { id: "scroll.down", title: "Scroll down one line", cli: I },
  { id: "scroll.up", title: "Scroll up one line", cli: I },
  { id: "scroll.half_down", title: "Scroll down half a page", cli: I },
  { id: "scroll.half_up", title: "Scroll up half a page", cli: I },
  { id: "scroll.page_down", title: "Scroll down a page", cli: I },
  { id: "scroll.page_up", title: "Scroll up a page", cli: I },
  { id: "scroll.top", title: "Go to the top", cli: I },
  { id: "scroll.bottom", title: "Go to the bottom", cli: I },
  { id: "heading.next", title: "Jump to the next heading", cli: I },
  { id: "heading.prev", title: "Jump to the previous heading", cli: I },
  // notes and navigation
  { id: "note.open", title: "Open a note", cli: "slipbox render <note>" },
  { id: "note.reload", title: "Reload the note from disk", cli: "slipbox render <note>" },
  { id: "note.copy_path", title: "Copy the note's path", cli: "slipbox resolve <note>" },
  { id: "note.copy_ref", title: "Copy a path:line reference to the top line", cli: "slipbox resolve <note>" },
  { id: "link.next", title: "Focus the next link", cli: I },
  { id: "link.prev", title: "Focus the previous link", cli: I },
  { id: "link.follow", title: "Follow the focused link", cli: "slipbox resolve <link> --from <note>" },
  { id: "link.follow_split", title: "Follow the focused link in the split", cli: "slipbox resolve <link> --from <note>" },
  { id: "link.copy", title: "Copy the focused link's target", cli: "slipbox resolve <link> --from <note>" },
  { id: "history.back", title: "Go back", cli: I },
  { id: "history.forward", title: "Go forward", cli: I },
  { id: "switcher.open", title: "Quick switcher", cli: "slipbox ls" },
  { id: "outline.open", title: "Outline of the note", cli: "slipbox outline <note>" },
  { id: "links.open", title: "Links from this note", cli: "slipbox links <note>" },
  { id: "backlinks.open", title: "Notes linking here", cli: "slipbox backlinks <note>" },
  { id: "palette.open", title: "Command palette", cli: "slipbox commands" },
  { id: "find.open", title: "Find in note", cli: I },
  { id: "find.next", title: "Next match", cli: I },
  { id: "find.prev", title: "Previous match", cli: I },
  // buffers, tabs, split
  { id: "tab.new", title: "Open a new tab", cli: I },
  { id: "tab.close", title: "Close the tab", cli: I },
  { id: "tab.next", title: "Next tab", cli: I },
  { id: "tab.prev", title: "Previous tab", cli: I },
  { id: "split.toggle", title: "Open or close the split", cli: I },
  { id: "split.focus", title: "Focus the other pane", cli: I },
  { id: "buffers.open", title: "Open buffers", cli: I },
  // sidebar
  { id: "sidebar.toggle", title: "Show or hide the file explorer", cli: I },
  { id: "sidebar.focus", title: "Focus the file explorer", cli: I },
  { id: "sidebar.reveal", title: "Reveal the note in the explorer", cli: I },
  // capture
  { id: "capture.ref", title: "Capture a reference to the top line", cli: "slipbox capture --ref <path:line>" },
  { id: "capture.selection", title: "Capture the selection", cli: "slipbox capture --ref <path:l-m> --snippet" },
  { id: "scratch.open", title: "Open the scratch", cli: "slipbox scratch show" },
  { id: "scratch.copy", title: "Copy the scratch to the clipboard", cli: "slipbox scratch copy" },
  { id: "scratch.clear", title: "Clear the scratch", cli: "slipbox scratch clear" },
  { id: "selection.copy", title: "Copy the selection", cli: I },
  // look and feel
  { id: "theme.select", title: "Choose a theme (live preview)", cli: "slipbox render --theme <name>" },
  { id: "theme.set", title: "Set the theme", cli: "slipbox render --theme <name>" },
  { id: "glyphs.cycle", title: "Cycle glyphs: nerd, unicode, ascii", cli: "slipbox render (render.glyphs in config)" },
  // app
  { id: "messages.open", title: "Messages", cli: "slipbox info" },
  { id: "help.open", title: "Key bindings", cli: "slipbox commands" },
  { id: "vault.reindex", title: "Rebuild the vault index", cli: "slipbox ls" },
  { id: "app.quit", title: "Quit", cli: I },
  { id: "overlay.close", title: "Close the overlay", cli: I },
];

export function commandSpec(id: string): CommandSpec | undefined {
  return COMMAND_SPECS.find((c) => c.id === id);
}
