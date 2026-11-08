# Design changes

Each change names the root's design section it lands in at consolidation; they're grouped by that section, the
decisions cited in each. A task writes its text here as it does the work; the root's files change only when EG is
consolidated. Three root decisions change in part, and each gets a dated note under it then: D141's one split
(EG-D21), D155's marks "not wanted" and its closing pairs opt-in (EG-D20, EG-D22), and GIT-D12's `space g` as the git
panel itself (EG-D15). Command ids and keys are the design; file, type and role
names are proposals, the tasks' to settle. Every key is a binding of a named command in
`core/application/commands/areas/`, remappable as every key is; "an interaction" is a command whose spec's `cli` is
`null`. What a decision leaves open is marked **Open**, for the task that builds it.

## MODIFIED design/tui.md § The TUI (its code table)

Adds these rows: a controller App owns where the feature has state of its own (named after it, as `app.explorer` is;
D235, ORG-D1), else the feature's module:

| File | Role |
| --- | --- |
| `documents/navigation/labels.ts` | jump labels: targets, labels drawn, keys typed (`app.labels`; EG-D3) |
| `shell/overlays/preview.ts` | a list of places' preview (`app.preview`; EG-D2) |
| `shell/overlays/drawing/lists/preview.ts` | the list and its preview placed, the preview drawn (EG-D2) |
| `documents/views/drawing/marks/hit.ts` | the preview's hit, marked in its window (EG-D2) |
| `shell/overlays/places.ts` | the last list of places and its hits, `space '` and `] q` (`app.places`; EG-D2, EG-D10) |
| `documents/editing/structure.ts` | text objects, syntax jumps, growing the selection (`app.structure`; EG-D6, EG-D7) |
| `documents/editing/surround.ts` | surround: add, delete, change, wrap on type (EG-D8) |
| `documents/editing/selections.ts` | several selections, by view (`app.selections`; EG-D14) |
| `documents/views/folds.ts` | each tab's folded sections (`app.folds`; EG-D11) |
| `documents/diagnostics/problems/at-cursor.ts` | problem jumps, the cursor's problem and its window (EG-D5) |
| `documents/diagnostics/todos.ts` | TODO marks in the file, the vault's list (`app.todos`; EG-D9) |
| `documents/editing/undo-list.ts` | undo by time and the undo list (EG-D13) |
| `app/clipboard/yanks.ts` | the copies kept: `space p`, `[ y` / `] y` (`app.yanks`; EG-D20) |
| `documents/navigation/marks.ts` | marks (`app.noteMarks`, apart from the explorer's `Marks`; EG-D20) |
| `documents/navigation/calls.ts` | the call hierarchy's list (EG-D19) |
| `workspace/git/views/log/` | a branch's commits, a commit's files and its change to one (`app.gitLog`; EG-D4) |
| `workspace/git/blame-column.ts` | blame for the file, as a column (`app.blameColumn`; EG-D16) |
| `workspace/git/inline-diff.ts` | the inline diff (`app.inlineDiff`; EG-D17) |

In the core, pure: `core/documents/editing/reflow.ts` (EG-D12), `core/documents/diagnostics/todos.ts` (EG-D9),
`core/workspace/git/forge.ts` (EG-D18).

Previously: none of these; the table ends with the OpenTUI binding.

## MODIFIED design/tui.md § Ownership verification and separate adjustments

The model keeps one App buffer map and a global tab list; a tab holds a tree of windows (EG-D21): a node is a view, or
a split of two or more nodes with its orientation and its children's shares. Splitting shares a NoteBuffer and its undo
history as now, and each view keeps its cursor, selection, scroll and mode. Workspace persistence stores the tree. Of
the roadmap's Later item "Window/tab ownership and document tools", EG takes only a tab's free splits and zoom
(EG-D21); windows owning tab lists, focus across them and the document tools' context stay there.

Previously: a tab contains one or two views (`app/runtime/contracts.ts` `Tab`: `views`, `active`, `orientation`,
`ratio`); the window/tab hierarchy is later work.

## MODIFIED design/tui.md § Screen layout (plan `3.1`)

- **The status line** (EG-D5): with the cursor on a problem shown in the file (§ Problems where they are), its right
  side says the problem's message — the worst at the cursor, `+n` when more are there — in its severity's colour,
  sanitized and cut to the room left; the words count and `tab N/M` give way to it first. The counts stay as they are.
  **Open:** its place against the link under the cursor, on a link that has a problem.
- **The window header** (EG-D21): a zoomed window's header says `zoomed` after its name (`drawWindowHeader`); the status
  line and the top bar stay. **Open:** where it's said with no header (turned off, zen, a window under 8 rows).

Previously: the status line counts the file's problems by severity, "never what one says, which is the Problems
panel's"; the header holds a split's name, the breadcrumb, the view buttons and `▤`.

## MODIFIED design/tui.md § The cursor

Adds, after "What follows from it":

- **Jump labels** (EG-D3; `cursor.jump`, an interaction; `s` in the reading keymap, `g w` there and in `[keys.source]`;
  `JumpLabels`): one command, in reading and in SOURCE view. Its targets are what each window of the tab shows on
  screen (both of a split): every word start, by `cursor.ts`'s word classes (each CJK character a word), and every link,
  by its drawn position in `Layout.links`; never a decor row (the lens's rules, a cell's header, a fold row). Each gets
  a label of one or two letters from a home-row alphabet, the nearest to the cursor the shortest, drawn over the
  target's first cells (`jump_label`), its width by `core/foundation/text/width.ts`. The keys after it are the labels'
  (§ Modes and dispatch): each narrows them, a whole label moves the cursor there and focuses its window, and `esc`, or
  a key no label starts with, cancels. On a link, `enter` then follows it, as `enter` does. **Open:** the lens, whose
  keys are SOURCE view's; and whether it's an operator's motion (`d g w`), as any cursor command after an operator is
  today.
- **Syntax jumps** (EG-D6): `] f` / `[ f` (`cursor.function_next`, `cursor.function_prev`) the next or previous
  function, `] a` / `[ a` (`cursor.argument_next`, `_prev`) argument, `] o` / `[ o` (`cursor.block_next`, `_prev`)
  block, by the code's grammar (§ Editing, "The structure"); in a note, `] o` / `[ o` go to the next or previous fenced
  code block. Classes and types stay on `]]` / `[[`. Each is a motion, after an operator too. **Open:** inside a note's
  fenced block, whether `] o` is the code's next block or the next fence; in which views (the code view's reading too).
- **`alt+.`** (`cursor.repeat_motion`, EG-D22): the last motion run in this window again, with its count — any cursor
  command, a `] d` or a `w` as well as an `f x`; `;` and `,` stay `f` and `t`'s.

And to **Selection**:

- **Growing and shrinking it** (EG-D7; `visual.grow` `alt+o`, `visual.shrink` `alt+i`, `visual.sibling_next` `alt+n`,
  `visual.sibling_prev` `alt+p`; in SOURCE view and the lens): `alt+o` with nothing selected selects the cursor's word,
  in visual mode; each `alt+o` after it selects the smallest node that encloses the selection and is larger than it;
  `alt+i` goes back a step; `alt+n` / `alt+p` move the selection to the node's next or previous sibling. A note's nodes
  are its Markdown tree's (a word, an inline node, a paragraph, a list item, a list, a section with its heading); code's
  are its grammar's — a code file's, a code cell's, a fenced block's by its language, then the fence and the note's
  tree above it. The steps grown through are kept on the view (`Structure`), so `alt+i` returns exactly; any other
  change of the selection drops them. `ctrl+space` stays unbound: it's the user's.
- **Several at once** (EG-D14; `Selections`): Helix's model. A view's selection becomes a list, the primary first, each
  an anchor and a cursor kept as source anchors (§ Positions) and drawn as one is (`selection`; the other cursors in a
  role of their own). Its commands: a cursor added below or above, the goal column kept (`visual.add_below`,
  `visual.add_above`); the matches of a regex inside the selections selected (`visual.select_matches`); each split on
  a regex or on its lines (`visual.split_regex`, `visual.split_lines`); those that match kept or dropped
  (`visual.keep_matches`, `visual.drop_matches`); the primary kept alone (`visual.keep_primary`); their starts aligned
  (`visual.align`). A regex is asked in a question and matched by the regex worker (search.md § Native regex matching).
  An operator, typing or a paste acts at each, as one undo step; `esc` goes back to the primary alone. **Keys:**
  Helix's clash with vim's here (`shift+c`, `s`, `shift+k`, `,`), so its task proposes them, mostly inside visual mode,
  for the user to settle.

Previously: the motions are pure functions over the layout (characters, rows with a goal column, words, row start and
end, top and bottom, headings, paragraphs); a selection is one anchor plus the cursor, made by `shift`+movement, visual
mode or a drag; `;` and `,` repeat `f` and `t` only; nothing labels the screen or reads the syntax tree.

## MODIFIED design/tui.md § Buffers, views, tabs, windows (plan `3.3`)

- **Tab** (EG-D21): a tree of windows. `ctrl+w v` and `ctrl+w s` (`window.split_side`, `window.split_stacked`) split
  the active window again however many there are: the new window joins its split when the orientation is the same,
  else the two make a new split in its place. Each window keeps the least room it has now (24 columns of note; a
  stacked pair under 6 rows shows only the active one), a side-by-side split too narrow for its windows falls back to
  stacked as one below 80 content columns does, and each share stays between 15% and 85% of its split.
  `window.focus_*` goes to the window that way on the screen (past them, the side panes, as now), `window.move_*` moves
  the window to that edge of the tab, `window.other` goes to the next window in order, `window.swap` swaps it with its
  next sibling, `window.only` closes the others, `window.close` gives its room to its siblings, and resize mode changes
  the share of the active window's split. `ctrl+t c` moves the window out into a tab of its own, as now. "The split" a
  pick or a link opens into (`ctrl+w f`, `space l s`, the explorer's and the Problems panel's `s`, `alt+enter`'s
  choice, the scratch's `"right"`) is the window last active before this one in the tab, made by a split when it's
  alone. **Open:** that rule, checked against each of those.
- **Zoom** (EG-D21; `window.zoom`, `ctrl+w z`, `space w m`, an interaction): the active window fills the tab's content
  area, the other windows and the side panes hidden but kept — the tree, the shares, which panes were open; again, all
  back as it was. It's the tab's (`Tab.zoomed`), not saved in the workspace. **Open:** what else ends it (a split, a
  focus move, a pane opened).
- **Folded sections** (EG-D11; `Folds`): `z a` (`fold.toggle`) folds or opens the section the cursor is in — the
  innermost, its heading and what's under it to the next heading of its level or higher, as the lens finds a section —
  in a note's rendered view and SOURCE view; in the code view, the cell, as `cell.fold` does (`space k f` stays
  `cell.fold`). `z c` / `z o` (`fold.close`, `fold.open`) close or open it; `z shift+m` (`fold.all`) folds every section
  to its heading (in code, every cell), `z shift+r` (`fold.none`) opens them all. A folded section is its heading and a
  dim `▸ 12 lines` row (rendering.md § Blocks and inlines); a click on that row, or a jump into the section (find, `n`,
  a link's heading or line, the outline, `] d`, an undo or an outside change placing the cursor there), opens it. Kept
  per tab (§ Positions), each window's layout made with its tab's folds of its note. **Open:** a peek's `z`
  (`peek.fill`) holds every `z` key there; what an operator on a folded heading takes (`d d`).

Previously: "Notes open as buffers, shown in tabs, with one split (D141)"; a tab is one window, or two in a split with
an orientation and a ratio (the first window's share); `window.only` closes the other window; `z a` folds a code cell,
and nothing folds a note's text.

## MODIFIED design/tui.md § Positions (plans `3.4`, `3.5`, `3.15`)

Adds to **Saved state**:

- **Workspaces** (EG-D21): a tab's window tree — each split's orientation and shares, each window's note, cursor and
  history — in place of its split; a workspace saved before is read as a tree of its one or two windows.
- **Folds** (EG-D11): each tab's folded sections, by note and by each section's heading anchor (its slug and
  occurrence, as a position's: D98), so a section stays folded when an agent rewrites the note around it, and one
  whose heading is gone opens; a code file's folded cells with them. In the workspace, restored with it. **Open:**
  "per tab" makes two windows of one tab on one note share their folds; per window is the other reading.
- **Marks** (EG-D20; `mark.set` `m <letter>`, `mark.go` `` ` <letter> ``, `mark.go_line` `' <letter>`, `mark.list`
  `space h m`, each an interaction; `NoteMarks`): `m` and a lowercase letter marks the cursor's place in this note, an
  uppercase one across the vault; `` ` `` and the letter goes there (another note opened, a place pushed onto the
  history), `'` to its line's first non-blank character. A mark is a source anchor as the cursor's (the nearest
  heading, an offset, a fallback line, the row's text; D98): an edit here moves it with the text, and a reload — an
  agent's rewrite — finds it again as a reading position is found. `space h m` lists them, this note's then the
  vault's, each its letter, `path:line` and the line's text, with the preview (§ Overlays). Kept with the session, in
  the vault's `session.json`. **Open:** per workspace, or shared by them as the recent notes are.
- **Quitting without it, this once** (EG-D22; `app.quit_no_session`, `space q d`): quits as `app.quit` does (refused
  while a note is unsaved), the workspace not written, so the next start restores the one before. `ui.restore_session`
  is unchanged. **Open:** whether the reading positions are written.

Previously: a workspace is the tabs, the active and pinned ones, splits with their orientation and ratio, and each
window's note, cursor and history; nothing keeps folds or marks; quitting always writes the positions and the
workspace.

## MODIFIED design/tui.md § History (plan `3.6`)

Adds (EG-D22): ``space ` `` and `ctrl+^` (`note.alternate`, an interaction) open in this window the note before this
one — the last place in its timeline that's in another note, else the quick switcher's previous note — pushed onto the
history as a link followed is, so the key again comes back.

Previously: back and forward stacks of places, 200 deep, and the history list; going back to the note before this one
is `ctrl+p enter` (§ Overlays).

## MODIFIED design/tui.md § Renames (plans `17.15`, `7.1`–`7.4`)

Adds (EG-D19): renaming or moving a code file — `space n m`, the explorer's `r` and `m`, a folder moved with code in
it — asks each running server of its project that registered for it (`workspace.fileOperations.willRename`, with its
filters) for the edits the rename needs (`workspace/willRenameFiles`): the imports that point at it. Their lines join
the same preview as the links', each with its server (`src/app.ts:3 from "./old" → from "./new"`); `enter` makes them
through the buffers, as a server's edits are made (§ What's under the cursor, "What a server changes"), with the move,
then tells the servers (`workspace/didRenameFiles`). A server that doesn't answer in time leaves its edits out, said in
the preview. **Open:** whether `slipbox mv` asks the servers too (the CLI's commands are relied on, D18), and whether
`space v shift+u` takes the imports back with the rest (D152).

Previously: a rename's preview lists every line it changes in every vault — the Markdown links, and the paths in code
comments and strings that name the file with its extension (`16.10`); an import written without one (`./old`) is left
as it is.

## MODIFIED design/tui.md § Side panes ("Source control")

- **Opening it** (EG-D15): `space g g` (`git.view`) opens it and focuses it, again closes it, as `space e` the
  explorer; `space g` is a group (§ Git).
- **This branch's commits** (EG-D4; `GitLog`): a section after **This branch against main** — the commits since the
  branch's own base, newest first, each its short hash, subject, author and day (sanitized, cut by
  `core/foundation/text/width.ts`, the subject giving way first); none on the base itself. `enter`, `l` or a click opens
  a commit up into its files, each with its state letter as This branch against main draws them; `enter` on a file
  shows that commit's change to it in the diff window, drawn as every diff is (§ Git), `esc` back to the panel. Asked
  in the background whenever git has news (§ Git, "A branch's commits"); its rows kept by what they are (D261: a commit
  by its hash, a file by its commit and path).
- **The Branches section** (EG-D4): a branch opened up lists its commits too, after its files against its base
  (`Commits (n)`, its own side of `base...branch`), each opened up and shown as above.

Previously: `space g` (`git.view`) opens, focuses and closes the panel (GIT-D12); its sections are Conflicts, Staged,
Changes, Untracked, This branch against main, This file, Branches and Other repositories; a branch opened up shows its
worktree, its buttons, its uncommitted files and its files against its base, no commits.

## MODIFIED design/tui.md § Overlays

- **Lists of places** (EG-D2): the quick switcher (its `#` symbols too), search (`space f s`), find in every note,
  references (`g r`, `space k r`), backlinks and links; and the lists EG adds that hold places: the TODOs (EG-D9), the
  call hierarchy (EG-D19), the marks (EG-D20), the undo steps (EG-D13). A list's item may carry its place (a path, its
  vault, a line, a range); the palette, help, the menus, the dialog and the theme and glyph pickers carry none and stay
  as they are. History, named in EG-D2, is a side pane (`history.list`, `space h h`), not a list here, so it has no
  preview; search, a list of places EG-D2 didn't name, has one.
- **The preview** (EG-D2; `ListPreview`): the selected row's place, as slipbox shows its file — a note rendered, code
  in the code view, a data file rendered, else SOURCE view — in a read-only view: of the file's buffer when it's open
  (unsaved text as typed), else of a virtual buffer read for it (`preview:<path>`, as a peek's: never written, never a
  remembered place, no language server or linter, the last eight kept while the list is open); another vault's file
  through its graph, as a peek reads it, and a file a link not followed leads to (VV-D6) or a binary one said instead.
  At the hit: landed as a link to a line lands (§ Following links), a third of the way down, once for each layout the
  window is given; its range marked (`link_focus`), or, without a range, the text the row found, else the line's
  words. A file is read off the keys: moving on before it's read drops it, `reading…` meanwhile. Its title, in its
  frame, is the place (`notes/index.md:12`, another vault's as a peek names it). On a screen `ui.narrow_width` (90)
  wide or more it's beside the list: both as tall as a full list (30 rows, or the content area less two), the list
  half the width (its usual 100 columns at most) and the preview the rest. On a narrower one it's under the list: the
  list's usual width, two-fifths of the height its rows, the preview the rest. With less room than 8 rows and 30
  columns for it, the list is drawn alone. The list's bottom border says `ctrl+t hide · alt+enter where`; `ctrl+t`, a
  list's own key, or a click on `ctrl+t hide` (D99: every `ctrl` chord has another route), hides or shows it for every
  list of places until it's pressed again. A click in the preview leaves the list open. The copies' list (EG-D20)
  previews the text itself. **Settled** (EG-T1): `ctrl+t`'s choice is not a UI setting; it's kept while slipbox runs,
  as the list itself is.
- **Where a pick opens** (EG-D2; `list.open_where`, `alt+enter`, an interaction): a question with a key a choice — `h`
  here, `s` the split (§ Buffers, views, tabs, windows: the other window, or a new one beside this), `t` a new tab — as
  the conflict prompt asks; `esc` goes back to the list. `h` does what the list's `enter` does; `s` and `t` open the
  row's place at its line, on its range. Another vault's file opens in a peek wherever it's asked to, as a link to it
  does (VV-D7). Windows Terminal takes `alt+enter` for full screen by default, so the palette's command is the other
  way. **Settled** (EG-T1): the palette opens over the list and closes it, so `list.open_where` asks about the open
  list of places, else the last one (`space '`'s), its row selected; `alt+enter` in a list runs the same command.
- **The last list** (EG-D2; `list.resume`, `space '`; `Places`): the last list of places opened, once it's closed — on
  a pick or `esc` — opens again as it was: the list itself, kept, so its kind, its query, its rows (not asked again),
  the row selected, its scroll, its preview shown or hidden. Its preview is read again, a file having maybe changed. A
  links list opened again over another note opens its pick where its link leads (its place), not a link of that note.
  Kept while slipbox runs in this vault; going into another drops it. Nothing happens while another overlay is open.
- **Find in every note** (EG-D10; `find.vault`, `ctrl+shift+f`, `space f g`): no question first. The list has a query
  row of its own, matched as it's typed — each query a request to the regex worker, a newer one taking back the one
  before (search.md § Native regex matching) — the window's toggles in it (`alt+r`, `alt+w`). It opens with the
  selection on one line, else the cursor's word, typed and selected, so typing replaces it; `space f w`
  (`find.vault_word`) lists that word's hits at once. A `path:ops/` word narrows the files to those whose path starts
  so, as in a search; the rest is the text or the regex. After a pick closes it, `] q` / `[ q` (`find.vault_next`,
  `find.vault_prev`) open its next or previous hit, in its order, around the ends, kept in `Places` with the list.
  **Open:** whether `] q` steps through the last list of places whatever its kind.
- **Replace in every note** (EG-D10): in its preview, each row shows its line before and after; `ctrl+x`, or a click
  on the row's mark, drops a row — that match stays as it is — or brings it back, and the title counts what's kept
  (`18 of 20 to replace`). `enter` replaces the rows kept, the plan built without the matches dropped
  (`planReplaceLater`), one entry of the rename stack (`space v shift+u`), as now.
- **The which-key popup** (EG-D15): `space g` is a group, named in `DEFAULT_GROUPS` as `space l` is; the `[`, `]`, `z`
  and `g` groups' explanations, and `space c`, `space f`, `space h`, `space u`, `space w` and `space q`'s, name the keys
  EG adds.

Previously: pickers are rows of text; only the theme and glyph pickers preview (D95); a list takes the arrows,
`ctrl+n` / `ctrl+p`, `enter` and `esc`, and nothing opens a pick anywhere else; find in every note asks its text
first, empty, then lists each line as `path:line`; replace in every note's preview lists each line it changes, `enter`
replacing them all or `esc` none; `space g` is one command.

## MODIFIED design/tui.md § UI settings

Adds to the list: inlay hints (`space u h`, `ui.inlay_hints`; `[lsp] inlay_hints = false`, EG-D19); the uses of the
symbol marked (`space u shift+r`, `ui.mark_references`; `[editor] mark_references = true`, EG-D19); faint indent
guides in notes (`space u i`, `ui.indent_guides`; `[ui] indent_guides = true`, EG-D22). Each is remembered as the
others are.

Previously: theme and glyphs, readable width, zen, the cursor-row band, line numbers, the problems bar and marks, the
window header, the breadcrumb, wrapping, code blocks too wide, link URLs, mouse capture, spelling.

## MODIFIED design/tui.md § SOURCE view (plan `4.13`)

- **Folded sections** (EG-D11): fold here as in the rendered view (§ Buffers, views, tabs, windows): a folded section
  is its heading's line and a fold row, its lines left out of the layout. The fold row is decor: the cursor steps over
  it, from the heading to the line after the section.
- **What a row shows that isn't text** (EG-D16, EG-D17, EG-D19): an inlay hint's cells and an inline diff's removed
  lines are drawn but map to no offset (rendering.md § The layout IR): the cursor steps over them, and a selection, a
  copy and find leave them out. The blame column is a column before the text, after the gutter, as the gutter is.

Previously: each cell drawn records the offset in its source line it shows, "so a cursor column maps to an exact place
in the text"; the gutter keeps git and problem signs; every source line is a row.

## MODIFIED design/tui.md § The lens: live preview (plan `4.14`)

Adds: the text objects, growing the selection, surround, reflow and several selections work in it as in SOURCE view,
its rows being source rows (EG-D6, EG-D7, EG-D8, EG-D12, EG-D14). A folded section the lens would take in is opened
first (EG-D11).

Previously: the lens's rows are source rows with their `srcMap`, so everything in § Editing works there; nothing folds.

## MODIFIED design/tui.md § Editing (plans `4.3`, `4.4`, `4.5`)

Adds:

- **The structure** (EG-D6, EG-D7; `Structure`): the text objects, the syntax jumps and growing the selection read the
  nodes around the cursor. A note's are its Markdown tree's, from the parse of the text as it is (only the chunks
  typing touched parsed again, D120). Code's are its grammar's — a code file's, a code cell's, a note's fenced block's —
  from a query per language (the function, class, parameter and block captures of the textobject queries nvim and
  Helix ship; memory, checked in its task) run in the syntax worker beside its pass
  (`core/documents/syntax/syntax-worker.ts`): its answer gains the nodes' ranges, for the text it parsed. A key that
  needs a pass still under way waits for its answer, as a key waits for what it does.
- **Text objects** (EG-D6): `textObject` (`tui/shell/input/vim/motions.ts`) gains, in code, `f` a function, `c` a class
  or type, `a` an argument, `o` a block; in a note, `h` a section (its heading to the next of its level or higher;
  `i h` without the heading's line), `l` a list item (`i l` its text, without its marker), `o` a fenced block (`i o`
  its lines between the fences), `k` a link (`i k` its text, `a k` the whole) — `i` the inside, `a` the whole. After
  the operators and in visual mode, in SOURCE view and the lens; a count takes the enclosing one. **Open:** in a note's
  fenced block, `o` is both the code's block and the fence.
- **Surround** (EG-D8; `edit.surround_add` `y s <motion or object> <mark>`, `edit.surround_delete` `d s <mark>`,
  `edit.surround_change` `c s <old> <new>`, `visual.surround` `shift+s <mark>`; `[keys.source]` and the visual
  keymap): the marks are `*` italic, `b` bold, `` ` `` code (as many backticks as the text inside needs), `~`
  strikethrough, `l` a link (the text its text, its target left empty and typed into), the brackets `(`, `[`, `{`, `<`
  and the quotes `"`, `'`. Deleting and changing find the nearest pair of that mark around the cursor: emphasis, code
  and links by the note's tree, brackets across lines as `%` matches them, quotes on the line. One undo step each; `.`
  repeats it. `y s`, `d s` and `c s` are bindings of their own beside the operators: `s` is no motion there.
- **Wrap on type** (EG-D8): while typing, a mark typed over the selection (`typedSelection`) wraps it instead of
  replacing it, the selection kept on the text inside. **Open:** whether only with `editor.auto_pairs` on, and which
  characters (the brackets and quotes `autoPair` closes; `*`, `~`, `` ` ``).
- **Reflow** (EG-D12; `edit.op_reflow` `g q`, `visual.reflow` visual `g q`, `edit.op_unwrap` `g shift+q`,
  `visual.unwrap`; `:reflow [width]` `edit.reflow` and `:unwrap` `edit.unwrap`, on the selection's lines, else the
  paragraph at the cursor): `core/documents/editing/reflow.ts`, pure, over the note's tree for the range. `g q` wraps
  each paragraph and list item to the width at spaces, widths by `core/foundation/text/width.ts`; `g shift+q` joins
  each back to one line. A list item's marker and its continuation's indent, a quote's `>` on every line and a hard
  break (two spaces, `\`) are kept; a link, a wikilink and a code span are never broken (one longer than the width has
  a line of its own); headings, tables, fenced code, HTML and the front matter are left as they are. The width:
  `[editor] text_width` when set, else the file's markdownlint `MD013` `line_length` (the config the lint surface finds
  for it, read as data, never one that's code: `.cjs`, `.mjs`), else `.editorconfig`'s `max_line_length` (read as
  indentation reads it, `25.1`), else 80. One undo step, its line endings the file's.
- **Undo by time, and its list** (EG-D13; `edit.earlier` `:earlier 10m`, `edit.later` `:later 10m`, `edit.undo_list`
  `space h u`): each `UndoStep` (`NoteBuffer`) gains when it was made and its kind — typing, an edit, a reload from
  disk, a replace, a server's edit, a merge — and a save marks the step it saved. `:earlier` and `:later` take `s`, `m`,
  `h` and `f` (saves: `1f` the text at the last save before this one) and undo or redo to the newest step at or before
  that time, a step at a time, so `u` and `ctrl+r` go on from there. `space h u` lists the note's steps newest first,
  each its time and kind, the saves marked; `enter` undoes or redoes to it, the preview showing that step's text's diff
  to now (`layoutDiff`). Undo stays linear: an edit after an undo drops what was undone, as now. Kept in the buffer
  while slipbox runs, as undo is.
- **The copies kept** (EG-D20; `yank.list` `space p`, `yank.prev` `[ y`, `yank.next` `] y`; `Yanks`): the last 20
  copies and cuts — each text that reaches the clipboard and the register — newest first, the same text once, for the
  session, not saved. `space p` lists them with the preview, `enter` pasting the one picked after the cursor (in an
  editable window). Right after a paste, `[ y` / `] y` (`[keys.source]`) put the previous or next copy in its place, one
  undo step with the paste. The clipboard stays the one register. **Open:** whether an operator's delete (`d`, `x`),
  which writes the register, counts as a cut.
- **Case, and visual mode's keys** (EG-D22): `g u`, `g shift+u` and `g ~` (`edit.op_lower`, `edit.op_upper`,
  `edit.op_toggle_case`) are operators in `[keys.source]`; visual mode adds `u`, `shift+u`, `~` (`visual.lower`,
  `visual.upper`, `visual.toggle_case`), `shift+j` (`visual.join`), `r <char>` (`visual.replace_char`) and `p`
  (`visual.paste`, the selection replaced by what's copied), where the text is editable. Case follows the note's `lang`,
  as spelling reads it (Turkish's dotted and dotless i).
- **Auto-pairs** (EG-D22): `[editor] auto_pairs = true` is the default.

Previously: the text objects are `w`, `W`, `"`, `'`, `` ` ``, `(`, `b`, `[`, `{`, `B`, `<` and `p`, found in the text
alone; the operators are `d`, `c`, `y`, `>`, `<` and `gc`; a character typed over a typed selection replaces it; one
register; undo is linear, each step an edit with no time; visual mode's keys are `o`, `!`, `y`, `d`, `x`, `c`, `>`,
`<` and `gc`; `~` toggles one character; `auto_pairs` is off by default.

## MODIFIED design/tui.md § What's under the cursor (plans `19.12`, `19.13`)

Adds (EG-D19; lsp.md § The client for code has the requests):

- **Inlay hints** (`[lsp] inlay_hints = false`; `ui.inlay_hints`, `space u h`): in code — the code view's rows of code
  and SOURCE view — the hints its server gives for the lines shown (`textDocument/inlayHint`, by range), asked again
  after each change reaches the server and when the view scrolls, an answer about an older text dropped. Drawn dim
  (`inlay_hint`) where the server places them, their text sanitized, their widths by `width.ts`; never part of the
  text (§ SOURCE view).
- **Uses of the symbol** (`[editor] mark_references = true`, `space u shift+r`; `lsp.reference_next` `] r`,
  `lsp.reference_prev` `[ r`): in code, the cursor resting on a name for a quarter second asks its other uses in the
  file (`textDocument/documentHighlight`), marked until the cursor leaves the name or the text changes, writes apart
  from reads (`reference_write`, `reference_read`). In a note, the cursor on a link marks the note's other links to the
  same place, by what each resolves to in the graph. `] r` / `[ r` step through those marked, around the ends.
- **The call hierarchy** (`lsp.incoming_calls` `space c i`, `lsp.outgoing_calls` `space c o`; `Calls`): the function
  at the cursor (`textDocument/prepareCallHierarchy`), then its callers (`callHierarchy/incomingCalls`) or what it calls
  (`callHierarchy/outgoingCalls`), as a list of places with the preview, each its name, its container and `path:line`.
  `right` on one asks for its own callers (or callees) and shows them under it, indented — the list's folding, as a
  tree (`shell/overlays/overlays.ts`) — and `left` folds them.
- **Formatting a selection** (`visual.format` visual `=`, `edit.op_format` `g =` with a motion or object): the range,
  formatted by the first of the file's servers that formats a range (`textDocument/rangeFormatting`), with `space c
  f`'s indentation; one undo step, left unsaved. A server that formats only whole files is said.
- **`:lsp-restart`** (`lsp.restart`): the file's servers stopped and started again, told their files again, their
  crashes counted afresh.

Previously: `shift+k` hover, `g d`, `g r`, `g y`, `g shift+i`; `space c r`, `space c a` and `space c f` (the whole
file); completion, snippets and signature help while typing; no hints, uses, calls, range formatting or restart.

## MODIFIED design/tui.md § Problems where they are (plans `19.8`–`19.11`)

Adds (EG-D5; `problems/at-cursor.ts`, reading the file's problems as the Problems panel's This file lists them):

- **Jumps:** `] d` / `[ d` (`problem.next`, `problem.prev`) go to the next or previous problem shown in the file — at
  `[diagnostics] severity` and up, the lint surface's filters applied — by where it starts, around the ends; `] e` /
  `[ e` (`problem.error_next`, `problem.error_prev`) errors only. SOURCE view and the lens land on its column, the
  rendered view as a link to a line lands.
- **On the status line:** the cursor on a problem — inside its range in SOURCE view and the lens, on the text its line
  became in the rendered view — puts its message there (§ Screen layout).
- **In full** (`problem.show`, `space c d`): a floating window, read-only as the hover's, with each problem at the
  cursor: its severity, its whole message, who found it (`slipbox unresolved`, `markdownlint MD013`, a server and its
  code) and its place. Its own keys (`DEFAULT_PROBLEM_KEYS`, as a peek has its own): `y` (`problem.copy`) copies it as
  `path:line:col severity: message (who)`, `s` (`problem.scratch`) adds it to the scratch without opening it
  (`Scratch.add`, as the review's note: its place on `**At:**`, its message fenced); `esc` and `q` close it.

Previously: a file's problems show in the bar, as marks, and as counts on the status line; what one says is the
Problems panel's, whose `j` / `k` move the note through them; no key goes to the next one.

## ADDED design/tui.md § TODOs and stubs

After § The Problems panel (EG-D9; `core/documents/diagnostics/todos.ts` finds them, `Todos` keeps the vault's):

- **What one is:** TODO, FIXME, FIX, HACK, XXX or BUG where it's a mark — in a code comment, the word followed by `:`;
  in a note, a line or a list item (a task's too) starting with one and `:` — and the stubs agents leave, found among
  the grammar's tokens outside strings and comments: `todo!()`, `unimplemented!()`, `raise NotImplementedError`,
  `throw new Error("not implemented")`. Code's comments are the syntax pass's (§ Files beyond notes), a note's fenced
  code among them; a note's lines are its parse's, never inside a code span.
- **Coloured** in every view — rendered, SOURCE view, the lens, the code view — the word and its `:` in `todo` (FIXME,
  FIX and BUG in `todo_fix`), a stub whole.
- **In the file:** `] x` / `[ x` (`todo.next`, `todo.prev`), around the ends.
- **In the vault:** `space f x` (`todo.list`) lists those of every note and every text file the explorer shows, each
  its word, `path:line` and its text, with the preview (§ Overlays). Gathered where the graph gathers code comments'
  links (`20.19`: the vault's code grammars loaded in the background), a note's from its lines, and kept current as
  the graph hears a file change. **Open:** a CLI equivalent (`slipbox find` can't tell a comment), else an interaction.

## MODIFIED design/tui.md § Git (plans `5.11`–`5.14`, `26.x`)

- **`space g`, a group** (EG-D15): `space g` shows the which-key popup, and `space g g` opens the panel
  (`git.view`), whose keys act there as now. Beside it, the note's own change and file, the cursor standing for the
  panel's selected row — the change on its line (the gutter's hunk) when it's on one, else the note's file — with the
  panel's letters where the panel has the action: `space g s` stages that change (`git.change_stage`, as the gutter
  menu's Stage it, `stageSign`) or the file (refused while it's unsaved, as git stages what's on disk); `space g u`
  unstages the file (the gutter's changes are against what's staged, so the line holds none staged); `space g d`
  reverts the change (`git.change_undo`, asked first now, one undo step as Revert it is). The rest take letters the
  panel uses only to move: `space g enter` previews the change (`git.change_preview`, as `enter` shows a row's diff),
  `space g h` this file's history (`git.history`), `space g l` the branch's commits (`git.log`), `space g o` the inline
  diff, `space g b` the blame column, `space g shift+b` who changed this line (`git.blame`), `space g shift+d` the
  file's diff against the base (`git.diff`), `space g y` / `space g w` the line's web link. Each is an interaction
  (D156). Commit, amend, fetch, pull, push, stash, review, a new branch, merge, the merge screen and rebase stay the
  panel's keys. GIT-D12 gets a note: `space g` is a group again, the panel on `space g g`.
- **A branch's commits** (EG-D4; `git.log`, `:log`; `core/workspace/git/history/gitlog.ts`): `branchLogLater` reads
  `git log base..branch` (the branch's own base, `Git.baseOf`; this branch, or one opened up in Branches), newest first,
  each its hash, subject, author and date; `commitFilesLater` a commit's files (`git diff-tree -r -M --name-status
  --root`, a merge's against its first parent); a file's change, its text in the commit's parent and in the commit
  (`git show`), read as `readForDiff` reads, drawn in the diff window. Each through `gitReadLater` (§ Asynchronous git
  reads). `:log` lists the same in a window, as `:changes` lists the files. A list, not a graph: GIT-D1's commit graph
  stays out.
- **Blame for the file** (EG-D16; `git.blame_file`, `space g b`; `BlameColumn`): toggles a dim column beside the
  text, after the gutter: the file blamed as the cursor's line is (the last commit, never the working tree;
  `blameFileLater`, `git blame --porcelain HEAD`), mapped to the text now through the line diff, a line changed since
  `not committed yet`. Each run of lines from one commit gets its short hash, author and age on its first row, newer
  commits brighter (`blame`, from dim toward the text's colour by age); by line in SOURCE view, by block in a rendered
  note (the newest commit among its lines). `space g shift+b` on a line, or a click on an entry, shows its commit as
  now; the cursor never stops on the column. Asked again when git has news. Its width is the file's widest entry, the
  author cut first, by `width.ts`. **Open:** the code view's rows.
- **The inline diff** (EG-D17; `git.inline_diff`, `space g o`; `InlineDiff`): in the window itself, first against
  what's staged (the gutter's hunks), again against the branch's base (`Git.baseOf`'s merge base), again off. Removed
  lines are rows of their own where they were (`diff_del`, dim and struck; not text: § SOURCE view); added and changed
  lines are tinted (`diff_add`, a changed line's words on `diff_add_word`, paired as the diff pairs them). By block in
  a rendered note: the before-and-after's groups (`blockDiff`), a removed block drawn before its place, a changed one
  tinted. `] c` / `[ c` step through the hunks of the diff shown. The window's, not saved. **Open:** the code view.
- **A line's web link** (EG-D18; `git.web_copy` `space g y`, `git.web_open` `space g w`;
  `core/workspace/git/forge.ts`): the cursor's line, or a selection's lines as a range, at the commit checked out (its
  hash), on the forge the remote names (the branch's upstream's remote, else origin) — its URL, `git@host:owner/repo`,
  `ssh://` or `https://`, read for GitHub, GitLab, Codeberg or Bitbucket, each in its own form (GitHub's
  `/blob/<hash>/<path>#L10-L20`, GitLab's `#L10-20`; memory, checked in its task). `space g y` copies it, `space g w`
  opens it with the platform's opener, as a problem report opens (RPT-D3: `open`, `wslview` or `explorer.exe`,
  `xdg-open` with a display) — never over SSH, where it's copied instead, as § Following links says of a URL. Another
  forge's remote, or none, is said. Pull request and issue pickers stay `gh`'s. **Open:** a line not committed, a
  commit not pushed.

Previously: `space g` is the git panel (`git.view`, GIT-D12), with no `space g` keys of their own; the cursor's change
is `] c` / `[ c`, the gutter sign's menu (Revert it, Stage it) and the palette's Preview the change and Undo the change,
which asks nothing; blame is the cursor's line in a floating window; a file's history lists its commits, and nothing a
branch's; a diff is drawn only in the floating window; a forge's pull requests and a commit graph stay out (GIT-D1).

## MODIFIED design/tui.md § Modes and dispatch

Adds a layer to the table, and to two of its rows:

| Mode | Owns keys | Examples |
| --- | --- | --- |
| labels | the next keys, as a label (EG-D3) | after `s`, `g w` |
| a character | also surround's marks (EG-D8), a mark's letter (EG-D20) | after `y s i w`, `m`, `` ` ``, `'` |
| floating | also the problem window's keys (EG-D5) | `y`, `s` |

Labels come in the dispatch order right after a key awaited as a character. The keys EG adds, by keymap:

| Keymap | Keys |
| --- | --- |
| normal | `s`, `g w`; `] d` `[ d` `] e` `[ e`; `] x` `[ x`; `] q` `[ q`; `] r` `[ r` |
| normal | `] f` `[ f` `] a` `[ a` `] o` `[ o`; `alt+.`; `m`, `` ` ``, `'`; `ctrl+^`; `ctrl+w z` |
| normal | `z c`, `z o`, `z shift+m`, `z shift+r`; `z a` now `fold.toggle` |
| leader | `space '`, `space p`, ``space ` ``; `space c d` `i` `o`; `space f w` `x`; `space h m` `u` |
| leader | `space g` (a group: `g`, `s` `u` `d`, `enter` `h` `l` `o` `b` `shift+b` `shift+d` `y` `w`) |
| leader | `space u h` `shift+r` `i`; `space w m`; `space q d` |
| source | `y s`, `d s`, `c s`; `g q`, `g shift+q`; `g u`, `g shift+u`, `g ~`; `g =`; `[ y` `] y`; `alt+o` |
| visual | `shift+s`; `g q`, `g shift+q`; `u`, `shift+u`, `~`, `shift+j`, `r`, `p`; `=` |
| visual | `alt+o`, `alt+i`, `alt+n`, `alt+p` |
| a list | `ctrl+t`, `alt+enter`; in replace in every note's preview, `ctrl+x` |
| problem window | `y`, `s` (`DEFAULT_PROBLEM_KEYS`) |
| several selections | its task's (EG-D14) |

Previously: the layers overlay, filter, insert, a character, operator, resize, pending, pane, visual, floating, source
and normal; `z a` is `cell.fold`; `space g` is `git.view`.

## MODIFIED design/tui.md § Parity with the CLI

Adds: EG's commands are interactions — the cursor, selections, folds, lists, editing (D14), git in the editor (D156),
the language servers' — but `find.vault_word`, which is `slipbox find <word> --whole` as `find.vault` is
`slipbox find <query>`. **Open:** `path:` in `slipbox find`; `todo.list`'s; the rename's imports in `slipbox mv`; a
replace with rows left out, which `slipbox replace --all` has no form for.

Previously: each command is declared with the CLI invocation that reaches its state change, or as an interaction.

## MODIFIED design/lsp.md § The client for code (`19.x`)

Adds (EG-D19):

- **What slipbox says it takes** at `initialize`: inlay hints (and `workspace/inlayHint/refresh`, answered by asking
  again), document highlights, the call hierarchy, range formatting, and file operations (`workspace.fileOperations`:
  `willRename`, `didRename`).
- **Several servers on one file:** the features gain Helix's `inlay-hints` and `document-highlight`, and slipbox's
  `call-hierarchy` and `file-rename`, each limited as the others are (`only-features`, `except-features`). A main server
  does them all, an add-on none of them; hints, highlights and the call hierarchy go to the first that does them and
  answers, a file rename to every server that registered for it, their edits together.
- **Restarting** (`lsp.restart`): a server stopped as quitting stops it (`shutdown`, `exit`, then a kill), started
  again and told its files, its crashes counted afresh; one that failed to start is tried again.

Previously: the client asks for diagnostics, hover, definitions, references, symbols, completion, signature help,
renames, code actions and formatting the file — Helix's thirteen feature names; a server starts again only after a
crash, and is left stopped past three in five minutes.

## MODIFIED design/search.md § Find

Adds (EG-D10): the TUI's find in every note asks `find` as its query is typed, each query its own request to the regex
worker, a newer one taking back the one before (§ Native regex matching). A `path:` word narrows the files by their
path, as `path:` does in a search's query; the rest is matched as the literal or the regex. **Open:** how a literal
`path:` is found, and whether the CLI's `find` takes it.

Previously: `find` is every match of a literal or a regex, unranked (D119).

## MODIFIED design/code-view.md § How it behaves

Adds:

- **Folding** (EG-D11): `z a` folds the cell as now, through `fold.toggle`; `z c` / `z o` close and open it; `z
  shift+m` folds every cell to its header (a class with its members), `z shift+r` opens them all. Restored with the
  tab (tui.md § Positions).
- **The structure** (EG-D6, EG-D7): in its lens, the text objects and growing the selection by the grammar; `] f`, `]
  a` and `] o` across its cells, landing on the row the node starts on, by each cell's map to the file.
- **Inlay hints and uses** (EG-D19): on rows of code only, never on a header, a border or prose.
- **TODOs** (EG-D9): coloured in its documentation's and comments' prose.
- **Open:** the blame column and the inline diff here (EG-D16, EG-D17): by row of code, or by cell.

Previously: `z a` and `space k f` fold the cell at the cursor, and `space k d` the unchanged ones; the lens is the
cursor's cell; the cursor, find, problem marks and jumps land by each cell's map to the file.

## MODIFIED design/rendering.md § The layout IR (plan `2.1`)

Adds: a layout may be made with sections folded (EG-D11), their rows left out and a fold row in their place
(`Line.fold`: the lines it holds, and how many), so a buffer keeps its layouts by width and by folds. A `Span` may be
`virtual` (EG-D17, EG-D19): drawn, never text — no offset in `srcMap`, stepped over by the cursor, left out of a
selection, a copy and find — and a row of them alone is `decor`. `slipbox render` folds nothing and draws no virtual
span: they're the TUI's.

Previously: `Line { spans; src; fill?; heading?; srcMap?; decor?; lens?; footnoteDef?; scroll? }` and `Span { text;
role; attrs; bg?; link?; src?; task? }`; a decor row is a frame row the cursor steps over, mapping to no text.

## MODIFIED design/rendering.md § Blocks and inlines (plan `2.2`)

Adds:

- **A folded section** (EG-D11): its heading as ever, then `▸ 12 lines` (`dim`; the glyph set's fold mark, ascii
  `>`), the count of its source lines folded.
- **Indent guides** (EG-D22): faint guides down a nested list's items, at each enclosing item's marker column, in
  `tree_guide`'s colour or a role of their own, toggled (tui.md § UI settings). Not for quotes, which draw a `▎` bar
  per row and level already.
- **TODOs** (EG-D9): the mark's word in its role, in a paragraph, a list item or a task's text.
- **The inline diff** (EG-D17): a removed block laid out once, dim and struck, before the block now in its place; a
  changed or added block's rows tinted, the changed words marked (tui.md § Git).

Previously: a list has bullets per depth, numbers right-aligned and a hanging indent; a quote a `▎` bar per row, its
text italic and dim; nothing folds or marks a TODO.

## MODIFIED design/rendering.md § Themes (plan `2.6`)

Adds roles, each mapped from the palette in every theme, `terminal`'s and `mono`'s by attributes: `jump_label`
(EG-D3), the other selections' cursors (EG-D14), `todo` and `todo_fix` (EG-D9), `inlay_hint`, `reference_read` and
`reference_write` (EG-D19), `blame` (EG-D16), and the indent guides' if they get one (EG-D22). The fold row and the
inline diff use `dim` and the diff's roles (EG-D11, EG-D17).

Previously: about 100 roles, none of these.
