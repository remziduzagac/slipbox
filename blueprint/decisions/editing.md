# Decisions: editing

How notes are edited and written: the in-app editor and the hand-off, open notes, concurrent edits, write safety and
renames, the explorer's file operations, and git in the editor.

## D134: An in-app editor for small edits, `$EDITOR` for anything substantial (4.1, 4.3, 2026-09-24)

> **Amended by D145 (2026-09-28):** a second kind of hand-off, to an editor already running elsewhere.
>
> **Amended by D147 (2026-09-28):** live preview is chosen after all, as the lens.

**Decision:** Both: an in-app editor for small edits (fix a typo, change a word, edit a table cell, add a line), and
`$EDITOR` for anything substantial (restructure a document, bulk edits, anything with real thinking). This is
deliberately the same shape as [leaf issue #298](https://github.com/RivoLink/leaf/issues/298), filed against leaf for
exactly this reason: an in-app edit mode reachable from the rendered view, with `Ctrl+E` kept for anything bigger.

**Why:** small edits should stop provoking a reach for `$EDITOR`, the metric leaf's #298 argued from. slipbox asked
leaf for it; slipbox should have it.

**Not chosen:** live preview, the Obsidian model, where the rendered view is the editor and the cursor line reveals its
source, because it would need cursor-to-source mapping for every node type and editing inside table cells, and keeping
the row under the cursor rendered is what made the nvim setup pleasant to read: un-rendering it was tried and rejected
(ideas.md § Editing).

**Verify:** small edits stop provoking a reach for `$EDITOR`.

## D135: The `$EDITOR` hand-off first, the in-app editor right after v1 (4.1, 4.3, 2026-09-24)

> **Amended by D28 (2026-09-25):** the hand-off stays in phase 3 with the rest of editing;
> phase 2 never writes a note.
>
> **Detailed by D144 (2026-09-28):** phase 3's five steps, the hand-off the second, before source mode.

**Decision:** The `$EDITOR` hand-off comes first: spawn the editor on the file at the current line, wait, reload the
buffer. The in-app editor is then the first thing after v1: committed, not a maybe, just not first.

**Why:** the hand-off is nearly free, and it makes v1 a usable tool rather than a reader. It has to exist regardless:
an external editor is one more external writer, and concurrent-edit handling has to cope with those anyway.

## D136: What the in-app editor can do is settled when it's built (4.3–4.5, 4.9, 2026-09-24)

> **Verified (2026-09-25):** `Textarea` is not modal, but its primitives are native and complete: the modal layer is a
> state machine over named actions, and no `edtui` equivalent is needed (research/stack.md).
>
> **Amended by D146 (2026-09-28):** the editor is a layer over source mode, another layout of the note, built as
> `NoteBuffer` rather than on `Textarea`.

**Decision:** The in-app editor's capability is left open, to be settled when it is built rather than guessed at now.
Its likely basis is OpenTUI's own editing component, `Textarea`. Either way it has modal, vim-style keys; undo and
redo per buffer, surviving an external reload; incremental reparse; and the raw/rendered switch as a mode on the
buffer, which the buffer model has to carry.

**Why:** vim-style keys match leaf, nvim, yazi and helix in this stack. Re-parsing a whole document per keystroke is
fine for a small note and not for a large one.

**Verify:** whether `Textarea` carries modal editing, or a modal layer has to go over it; leaf's #298 pointed at
`edtui` for this gap on the Rust side.

## D137: Agents write while you read: watch the vault, reload clean notes silently (5.1–5.4, 5.8, 2026-09-24)

**Decision:** slipbox watches the whole vault, not just open files, and reloads any buffer with no unsaved changes
silently, as vim does with `autoread` on. An external write to a note with unsaved changes is said when it lands (a
marker in the status line or on the buffer), not at save time. Watch events are debounced, slipbox's own writes are
ignored, and the graph is updated incrementally from the events rather than rebuilt. Detail: design/tui.md § External
changes.

**Why:** agents writing while you read is the product's premise, so core rather than an edge case. Agents write
constantly, and a prompt per write would be unusable. They write in bursts, and editors write by temp-and-rename, which
looks like delete-then-create; a watcher that saw its own writes would react to itself. The graph depends on files
nobody has open, and a rebuild is 25 ms at 52 files and seconds at 5,000. Saying a change at once turns a surprise
into a decision, and it is cheap, given the watcher exists.

**Not chosen:** a `W11`-style prompt on each external change (ideas.md § Concurrency).

## D138: Autosave on, after a long idle delay (4.7, 4.8, 2026-09-24)

> **Amended by D153 (2026-10-01):** autosave also waits while git holds its index lock.

**Decision:** Autosave is on, idle-based: about 30 seconds without a keystroke by default, configurable, and settable
to off. An explicit save is always available, and a note with unsaved changes is marked so (4.8). Quitting with
unsaved notes is a refusal that names them (`:wq` saves and quits, `:q!` discards), never a silent save. Detail:
design/tui.md § Editing.

**Why:** the delay is the point: autosave should fire when you have actually stopped, never mid-thought.

**Cost:** a short delay would have kept the unsaved window under a second and made conflicts nearly impossible. With
30 seconds plus however long you were typing, an agent will land a write in a note with unsaved changes during normal
use, so the conflict path (D139) is load-bearing: built properly and early within the editing work, travelling with
the in-app editor, never bolted on after autosave ships.

**Not chosen:** a short autosave delay; a silent save on quit (ideas.md § Concurrency).

## D139: A genuine conflict prompts, in vim's shape: Load, Keep, Diff, Merge (5.5, 5.7, 2026-09-24)

**Decision:** When a note with unsaved changes changes on disk, slipbox prompts, modelled on vim's `W12: File has
changed and the buffer was changed in Vim as well`: it stops, names the situation, and makes you choose; nothing is
resolved automatically. **(L)oad** takes theirs, reloading from disk and losing the buffer's edits; **(K)eep** keeps
yours and does not reload; **(D)iff** shows the difference first, then you choose; **(M)erge** is a three-way merge in
the app, conflicts marked for you to sort out (built so, not in `$EDITOR`). Two behaviours are copied from vim exactly:
it does not nag (once you have answered for a change, it stops asking about that change), and it warns again at write
time. After (K)eep the buffer is knowingly out of step with disk: autosave stays off for it until an explicit save,
and that save confirms once that it is overwriting a newer file. Detail: design/tui.md § Editing.

**Why:** vim's handling is the model to copy rather than improve on. Write time is the moment your version would
overwrite theirs. Keeping your version is allowed; doing it silently, or by a timer, is not. OpenTUI ships a `Diff`
component, so the expensive-sounding choice is nearly free.

## D140: Autosave never wins a conflict (5.6, 2026-09-24)

**Decision:** Before writing, autosave compares the file's mtime and size with what was read. If the file changed
underneath, autosave aborts and escalates to the conflict prompt (D139).

**Why:** an autosave that silently overwrites an agent's work is worse than no autosave at all: it destroys the other
party's edit with no user action and no prompt, the one failure mode that would make slipbox untrustworthy for its own
premise.

## D141: Open notes: buffers, tabs and one split (3.3, 3.4, 2026-09-25)

**Decision:** Notes open something like vim's tabs. The minimum is a buffer list and a switcher; the likely shape is
tabs, and one split so a note can be read beside another. The reading position per note (3.4) is exactly the state a
buffer holds, so the two are one feature. A buffer carries a mode, which ties open notes to the editing model (D136)
and to session restore (3.15). Detail: design/tui.md § Buffers, views, tabs, windows.

**Why:** leaf opens one file at a time in one view; the wanted behaviour, raised when this design was first discussed,
is "something like vim tabs".

## D142: Notes are written atomically, and never outside the vault root (4.6, 7.5, 2026-09-25)

**Decision:** Every write is atomic: a temp file, then a rename within the same directory. slipbox never writes
outside the vault root (constraint 7.5), which lives inside the items it constrains; what a symlink pointing out of
the root means was left to decide there. Detail: design/tui.md § Writing notes.

**Why:** notes are not regenerable, so write safety is stated rather than assumed: a crash or a full disk must never
truncate a note.

## D143: A rename with link fixing is previewed, confirmed and recoverable (7.1–7.3, 2026-09-25)

> **Detailed by D52 (2026-09-30):** built with renames across vaults, each link rewritten as a byte-range edit
> from mdast positions.
>
> **Detailed by D152 (2026-10-01):** the single-step undo is built, by restoring.

**Decision:** A rename that fixes links is treated as a bulk mutation of files the user never opened: it shows a
preview listing every file and every edit, asks for an explicit confirmation, and ideally can be undone in one step.
When the vault is a git repository the confirmation says so, and it warns when the tree already has changes. Detail:
design/tui.md § Renames; docs/cli.md § Renames.

**Why:** it is the one feature that can damage a whole vault in one keystroke; the risk is larger than the
"non-trivial" the PKM design gave it. The vault is usually a repository, so a bulk rewrite is recoverable, except when
the tree was already dirty.

## D144: Phase 3, editing, in five steps (4.x, 5.5–5.7, 2026-09-28)

**Decision:** Phase 3 is built in this order:

1. **The checkbox toggle** (4.11): the first write; one byte-range edit, atomic, through the same write path
   everything after it uses.
2. **The hand-off, both kinds** (4.1, 4.2, 4.12; D145).
3. **Source mode with the modal layer** (4.3, 4.4, 4.13; D146).
4. **Saving and conflicts** (4.5–4.10, 5.5–5.7): atomic saves, autosave after a long idle, the dirty marker, and the
   vim-shaped conflict prompt when an agent writes a note with unsaved changes (D138–D140).
5. **Live preview** (4.14; D147), its look tuned once it works.

**Why:** each step stands on the one before. The smallest write lays the write path the rest use; autosave and the
conflict prompt are dead code without the in-app editor; live preview swaps a block of the rendered layout for its
source layout, so it needs source mode, and per-block re-layout (15.1, at least for one block).

## D145: The hand-off in two kinds: suspend, and remote (4.1, 4.2, 4.10, 4.12, 2026-09-28)

**Decision:** One `{file}` / `{line}` template, and whether slipbox waits for it. *Suspend* steps aside for
`$EDITOR` in this terminal and reloads on return; *remote* tells an editor already running elsewhere (nvim's
`--server`, `code -g`) to open the note and keeps going, the watcher picking up its saves. Unsaved notes are saved at
every hand-off point: a hand-off, a capture, the context bundle, invoking an agent (4.10). Detail: design/tui.md §
Writing notes.

**Why:** there is no portable line-number flag, so a template says where the line goes. The other side reads the file
from disk, like everything an agent reads (D17).

## D146: Source mode is another layout of the note; editing is a vim-shaped layer (4.3–4.5, 4.13, 2026-09-28)

**Decision:** Source mode is another layout of the same note, not another editor: the raw markdown, a source line per
row, lightly highlighted, every row recording the source offset of each cell. Editing is a thin layer that maps the
cursor to an offset: vim-shaped (insert, operators and motions, `.`, counts), every operator a named command
(D11), the keys the ones the rendered view has. A good editor, consistent with the other modes; not all of vim.
A table is edited as its markdown. Undo is kept as source edits, so it survives an external reload (4.5). It is built
as `NoteBuffer` with `editing.ts` and `vim.ts`, not on `Textarea`. Detail: design/tui.md § Source mode, § Editing.

**Why:** everything built on the layout (motions, find, `*`, visual, the mouse, wrap, line numbers, scrollbars) then
works on the markdown unchanged.

**Not chosen:** an editor of its own beside the layout, on OpenTUI's `Textarea` with a modal layer over it (ideas.md §
Editing).

## D147: Live preview is the lens (4.14, 2026-09-28)

**Decision:** Live preview is chosen, as a lens, reversing D134's "not chosen". Reading, everything is rendered.
Editing, whole blocks around the cursor are shown as their markdown between two clear rules, the rest rendered above
and below: the rendered layout with the block under the cursor swapped for its source layout (D146), edited in place.
It opens with the editing keys and closes on `esc`. It is composed into the render rather than re-rendered. Detail:
design/tui.md § The lens.

**Why:** an explicit editing session needs no per-node mapping: a whole block is source or it isn't, nothing is half
rendered, and a table is edited as its markdown. Composed, a keystroke never re-parses the note.

**Not chosen:** the Obsidian model, where the cursor line quietly reveals its source inside the rendered view, because
it needs cursor-to-source mapping for every node type and editing inside table cells, and un-rendering the cursor row
was tried in nvim and rejected: keeping it rendered is what made reading pleasant (ideas.md § Editing).

## D148: Frontmatter is spliced by byte range (7.6, 2026-09-28)

**Decision:** Frontmatter is spliced by byte range, never parsed and re-serialised.

**Why:** a splice changes only the text meant, as the rename's link edits (7.1) and the checkbox toggle (4.11) do;
re-serialising would rewrite frontmatter nobody touched. mdast carries the source positions that give the ranges,
which is why remark was chosen (D5).

**Not chosen:** parsing the frontmatter and serialising it again (ideas.md § Write safety).

## D149: The explorer makes and changes files (18.x, 2026-09-30)

**Decision:** The explorer makes and changes files with buttons as well as keys: new notes and folders, rename, move,
copy, cut and paste, delete and restore, for folders as for notes. Its file operations fix links
as the rename does, after its preview (D143). A delete moves the file to the vault's trash, in its state, rather than
unlinking it. The keys are nvim-tree's where they fit (`n`, `r`, `m`, `d`, `y`, `x`, `p`), and the CLI has each
(`cp`, `rm`, `trash`, `mv` of a folder). Added to it since: a nested vault's folder (18.7), the move picker as a tree
(18.8), the selected row's buttons as one `…` menu (18.9), questions in a floating window (18.10), a folder made a
vault and back (18.11), and a leader key for every file action (18.13). Detail: design/tui.md § Files in the explorer;
docs/cli.md § Renames.

**Why:** a move or a rename in the explorer is the rename's bulk mutation, so it gets the rename's link fixing and
preview; and notes are not regenerable (D142), so a delete can be taken back from the trash.

**Not chosen:** deleting by unlinking (ideas.md § Write safety).

## D150: Footnotes are added and changed as GFM's, never reordered (3.18, 2026-09-30)

**Decision:** A footnote stays GFM's, in the note: `[^label]` where it's cited, `[^label]: text` wherever it's
defined. A new one takes the next free number and its definition goes at the note's end; definitions are never
reordered. Its reference goes after the word the cursor is on, never inside a link's or code's syntax. Edits, renames
and deletes change the text they name and nothing else. Detail: design/tui.md § Side panes ("Adding and changing
footnotes").

**Why:** tidying definitions into reference order would rewrite footnotes nobody touched.

**Not chosen:** reordering definitions into reference order (ideas.md § Editing).

## D151: Properties are edited as the frontmatter's text (3.20, 2026-10-01)

**Decision:** A note's properties are its frontmatter's text, edited as text: in a floating window holding a view of a
buffer that isn't a file, with the same editing keys, undo and highlighting as any. They are written back into the
note's frontmatter as one edit, never parsed and re-serialised (D148). Closing writes back, as leaving the lens keeps
its edits. Text that doesn't parse is written only if you say so, and so is text written over a frontmatter that
changed under it. Detail: design/tui.md § Side panes ("The properties editor").

**Why:** closing can write back without asking: there's nothing to lose by accident, since the note's undo takes it
back.

## D152: A rename is undone by restoring, not by renaming back (7.4, 2026-10-01)

> **Amended by D153 (2026-10-01):** in a git checkout a rename is undone only on the branch it was made on.

**Decision:** Each rename logs, in the vault's state, every file it wrote with the span of text that was different
before, and the undo gives exactly that back, as a plan of its own: previewed, guarded, and followed by the index and
the open notes the way a rename is. It's refused when a file has changed since the rename wrote it. The log is a
stack, the newest undone first; there's no redo: a rename does it again. Detail: design/tui.md § Renames; docs/cli.md
§ Renames.

**Why:** renaming back would plan again from the vault as it is now, and a name only one way round (a link that became
a path to stay unambiguous, a previous name added) wouldn't come back as it was written. Once a file has changed, the
text around the span is no longer the rename's to take back.

**Not chosen:** undoing a rename by renaming back (ideas.md § Write safety).

## D153: A branch switch is one event (5.9, 5.10, 2026-10-01)

**Decision:** git's own lock decides when to look: the watcher's news is held while `index.lock` exists and applied
together after, and autosave waits it out too (5.10). HEAD, read from `.git` each second and with each batch, decides
what it was:

- **Not moves.** The files of a switch aren't paired as moves, nor, at the next open, those of an index written on
  another branch (it records its branch). A pull or a merge keeps the branch: a rename it brings is a real one.
- **Each branch its tabs**, kept in the one session: switching back to a branch is going back to what you had there.
  Never over an unsaved note.
- **Undo is the branch's:** each rename records the branch it was made on, and is offered only there.

Detail: design/tui.md § External changes, § Positions ("Each branch's tabs").

**Why:** a checkout rewrites any number of files at once, and the watcher sees each on its own: reloads, moves
detected by content hash, a session's tabs on notes that may not exist here. A note only one branch has goes and comes
back at each switch; taken for a move, it would leave redirects (D49) that make `[[name]]` find the other
branch's note, never offering to make it. Closing an unsaved note would lose it. On another branch a rename's undo is
in the way of nothing, and the hash check would refuse it anyway.

**Not chosen:** taking a branch switch's files for moves (ideas.md § Git).

## D154: Git, for reviewing (5.11–5.14, 2026-10-01)

> **Amended by D156 (2026-10-09):** the working tree's git comes into the TUI: staging, unstaging, discarding,
> committing.

**Decision:** What slipbox shows of git is what a review needs: which files a branch changed, and how. Changes are
measured from the merge base with the base branch, as a pull request's diff is, and uncommitted and untracked files
count. The explorer's marks come from `git status` asked in the background, a moment after anything changed, never on
the keystroke's path; what's on request (a diff, the changes, the worktrees) asks git there and then. A merge's
conflicts are listed in Problems (5.12). Staging and committing stay git's: slipbox shows, it doesn't commit. Detail:
design/tui.md § Git; docs/cli.md § Git.

**Why:** worktrees are agents' tasks. Against the base's tip, what `main` did since would show up too, backwards. An
agent's work isn't always committed.

**Not chosen:** changes measured against the base branch's tip (ideas.md § Git).

## D155: Editing fundamentals, short of an IDE (25.x, 2026-10-09)

**Decision:** What a good editor does, short of an IDE, built in this order before git in the editor (D156):

- indentation per file: `.editorconfig`, else the file's own, else its language's; saving as `.editorconfig` says,
  trailing whitespace trimmed and the final newline added only where it asks (25.1);
- comments toggled: `gc` and a motion, `gcc`, a selection's lines, `ctrl+/`; each language's markers (25.2);
- brackets: `%` to the matching one, both marked; pairs closed as typed, opt-in (25.3);
- replace across files in the TUI, previewed as a rename is and undoable; `replace --all` (25.4);
- word completion without a language server, from the open files' words (25.5);
- spelling in notes (25.6; D157);
- a command run: `:!cmd`, its output in a window, and lines filtered through one (25.7);
- a server's snippets, their tab stops and placeholders filled in turn (25.8), added the same day at the user's asking.

Not wanted: vim's marks, macros, named registers and block selection. Detail: design/tui.md § Editing, § Overlays,
§ UI settings, § What's under the cursor.

**Why:** the editor is to be a good one, consistent with the other modes, not all of vim (D146). A command run is the
part of `13.1` that runs what you type yourself; the rest of `13.x` stays deferred (D37). Snippets were added
because completion with a language server (`19.16`) asked for none (`snippetSupport: false`), so a function came
without its arguments' places to fill.

**Not chosen:** vim's marks, macros, named registers and block selection (ideas.md § Editing).

## D156: Git in the editor: the working tree's, the TUI's alone (26.x, 2026-10-09)

**Decision:** Beside the git for reviewing at the branch's level (D154, `20.21`), the TUI gets the working tree's,
built after 25.x:

- changed lines in the gutter against what's staged, unsaved text too; `]c` `[c`; a change previewed and undone (26.1);
- source control by the explorer: staged, changed, untracked, conflicts; a file or one change staged, unstaged or
  discarded, discarding after asking (26.2);
- commit, its message in a floating editor, and amend (26.3);
- blame, and a file's history with `22.1` (26.4);
- branches switched to or made from a picker, unsaved notes saved or kept first (26.5);
- later and opt-in: stash; fetch, pull and push; a conflict's ours, theirs or both (26.6).

It runs the system's `git`, as before, with `23.6`'s guards where a root isn't trusted (D172): there a commit's
hooks don't run, and it says so. It is the TUI's alone, with no CLI equivalents. Detail: design/tui.md § Git, § Side
panes ("Source control").

**Why:** an agent has `git` itself. A repository's hooks are the folder's own code, which runs only where its root is
trusted.

## D157: Spelling by Hunspell as WebAssembly, English and Turkish bundled (25.6, 2026-10-10)

**Decision:** Misspelt words in notes are marked, with their suggestions, and a word can be added to your own list.
English and Turkish come with slipbox; any other language is the user's own Hunspell dictionary (`[spell]
dictionaries`, else the system's). Hunspell runs as WebAssembly (`hunspell-asm`). Spelling is off by default (`space u
s`); a note's front matter `lang:` names its languages. Detail: design/tui.md § UI settings ("Spelling");
docs/configuration.md § Spelling.

**Why:** as WebAssembly, Hunspell opens Turkish in 270 ms and about 20 MB, where nspell, pure JavaScript, took 950 ms
and 250 MB for the same answers. Its licence, MPL-1.1, was accepted for it (D194).

**Not chosen:** nspell (ideas.md § Editing).

## D158: Stash and the remote's commands deferred (26.6, 2026-10-10)

**Decision:** `26.6` is deferred: stash; fetch, pull and push, asked for and never automatic; a conflict's ours,
theirs or both. It waits on the roadmap's Later list.

**Why:** it was planned from the start as later and opt-in (D156); 26.1–26.5 cover the working tree without it.
