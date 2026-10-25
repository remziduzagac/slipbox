// Command specs: UI settings, themes, glyphs, the code view's cells and the scratch.

import type { CommandSpec } from "../command-specs";

const I = null; // interaction: needs a human at a terminal

export const UI_SPECS: CommandSpec[] = [
  {
    id: "html.details_toggle",
    title: "Toggle HTML details",
    cli: null,
    desc: "Opens or closes the HTML disclosure at the cursor",
  },
  {
    id: "picture.copy_path",
    title: "Copy picture path",
    cli: null,
    desc: "Copies the caption's picture path or address",
  },
  { id: "picture.copy_caption", title: "Copy picture caption", cli: null, desc: "Copies the picture's alt text" },
  {
    id: "picture.copy_image",
    title: "Copy picture image",
    cli: null,
    desc: "Copies image bytes with an optional system clipboard helper",
  },
  // ui
  { id: "ui.list", title: "UI settings", cli: I, desc: "Lists every UI setting and its value" },
  { id: "theme.pick", title: "Theme", cli: I, desc: "Picks a theme, previewed live" },
  { id: "theme.set", title: "Set theme", cli: I, desc: "Switches to a named theme" },
  { id: "glyphs.pick", title: "Glyphs", cli: I, desc: "Picks nerd, unicode or ascii icons, previewed" },
  { id: "glyphs.set", title: "Set glyphs", cli: I, desc: "Switches the icon set" },
  { id: "ui.readable", title: "Readable width", cli: I, desc: "Caps the text to a narrow, centred column" },
  { id: "ui.zen", title: "Zen mode", cli: I, desc: "Hides everything but the note" },
  { id: "ui.cursorline", title: "Cursor-row highlight", cli: I, desc: "Highlights the cursor row" },
  { id: "ui.line_numbers", title: "Line numbers", cli: I, desc: "Shows source line numbers on the left" },
  { id: "ui.wrap", title: "Wrap long lines", cli: I, desc: "Wraps to the pane, or scrolls sideways when off" },
  {
    id: "ui.window_header",
    title: "Window header",
    cli: I,
    desc: "Shows or hides the row atop each window: its name in a split, the breadcrumb, the Read, Lens and Source buttons",
  },
  {
    id: "ui.breadcrumb",
    title: "Breadcrumb",
    cli: I,
    desc: "Shows or hides the heading path on each window's header; the header stays",
  },
  {
    id: "background.open",
    title: "Background work",
    cli: I,
    desc: "Lists running work, its controls and recent outcomes",
  },
  { id: "background.cancel", title: "Cancel background task", cli: I, desc: "Cancels the selected background task" },
  { id: "background.restart", title: "Restart background task", cli: I, desc: "Stops and restarts the selected task" },
  {
    id: "background.pause",
    title: "Pause or resume background task",
    cli: I,
    desc: "Pauses or resumes sliced indexing",
  },
  {
    id: "background.dismiss",
    title: "Dismiss finished task",
    cli: I,
    desc: "Dismisses a recent outcome or retained failure",
  },
  { id: "app.about", title: "About slipbox", cli: I, desc: "Shows the full version, channel and upgrade information" },
  {
    id: "app.release_notes",
    title: "Copy release notes address",
    cli: I,
    desc: "Copies the newer version's release notes link",
  },
  { id: "explorer.focus", title: "Focus explorer", cli: I, desc: "Opens and focuses the explorer at its current zoom" },
  {
    id: "ui.spell",
    title: "Spelling",
    cli: "slipbox spell <note>",
    desc: "Marks the words a note's dictionaries don't know — its front matter's lang, else [spell] languages; ] s goes to the next, z = suggests",
  },
  {
    id: "ui.problems_bar",
    title: "Problems bar",
    cli: I,
    desc: "Shows or hides the column beside the text with each line's problems, counted and coloured by the worst (with line numbers on, the numbers take the colour instead)",
  },
  {
    id: "ui.problem_marks",
    title: "Problems marked in the text",
    cli: I,
    desc: "Underlines where each problem is, in source mode and the rendered view",
  },
  {
    id: "ui.code_cells",
    title: "Code cells: boxes or bands",
    cli: I,
    desc: "How the code view draws its cells: each in a box, or on a tinted band",
  },
  {
    id: "ui.code_wrap",
    title: "Code blocks: scroll or wrap",
    cli: I,
    desc: "A code block too wide for the window: scrolled sideways on its own, or its long lines wrapped",
  },
  {
    id: "ui.scratch_in",
    title: "Scratch: floating or on the right",
    cli: I,
    desc: "Where the scratch opens: floating over the windows, or in the window on the right",
  },
  // the code view's cells (24.13): the one at the cursor, as its header's buttons do
  {
    id: "cell.fold",
    title: "Fold or unfold the cell",
    cli: I,
    desc: "Folds the code cell at the cursor to its header, or opens it again",
  },
  {
    id: "cell.edit",
    title: "Edit the cell",
    cli: I,
    desc: "Opens the lens on the code cell at the cursor: its lines as written, to type into",
  },
  {
    id: "cell.copy",
    title: "Copy the cell",
    cli: "slipbox read <note>",
    desc: "Copies the code cell at the cursor: its lines as the file has them",
  },
  {
    id: "cell.references",
    title: "Where the cell's definition is used",
    cli: "slipbox backlinks <note>",
    desc: "The places that use the cell's definition, from its language server",
  },
  {
    id: "cell.problems",
    title: "The cell's problems",
    cli: "slipbox diagnostics <file>",
    desc: "The Problems panel on this file, on the cell's first problem",
  },
  {
    id: "cell.scratch",
    title: "Add the cell to the scratch",
    cli: "slipbox capture --ref <path:line> [--snippet]",
    desc: "Adds the code cell at the cursor to the scratch, with its path and lines, for an agent",
  },
  {
    id: "cell.fold_unchanged",
    title: "Fold the cells that didn't change",
    cli: I,
    desc: "Folds each code cell with no change against what's staged to its header, opening those with one; again, opens them all",
  },
  { id: "ui.urls", title: "Show link URLs", cli: I, desc: "Prints link addresses after their text" },
  { id: "ui.mouse", title: "Mouse", cli: I, desc: "Turns the mouse off so the terminal selects" },
  // scratch
  {
    id: "scratch.open",
    title: "Open the scratch",
    cli: "slipbox scratch show",
    desc: "Opens the scratch, floating or on the right as [capture] open_in says; it updates as agents add",
  },
  {
    id: "scratch.open_right",
    title: "Open the scratch on the right",
    cli: I,
    desc: "Opens the scratch in the window on the right, whatever [capture] open_in says",
  },
  {
    id: "scratch.add",
    title: "Add to the scratch",
    cli: "slipbox capture --ref <path:line> [--snippet]",
    desc: "Adds the selection or cursor row, with path:line",
  },
  { id: "scratch.copy", title: "Copy the scratch", cli: "slipbox scratch copy", desc: "Copies the whole scratch" },
  {
    id: "context.copy",
    title: "Copy the note's context for an agent",
    cli: "slipbox context <note> --copy",
    desc: "The note, what it links to and what links to it, as one markdown document on the clipboard ([context] sets how far); unsaved notes saved first",
  },
  {
    id: "scratch.clear",
    title: "Clear the scratch",
    cli: "slipbox scratch clear",
    desc: "Empties the scratch (asks first)",
  },
];
