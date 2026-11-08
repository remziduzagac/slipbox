# Requirements

## Goals

- Anywhere on screen in a few keys: a word or a link by its label, the next problem, TODO, function or hit (EG-D3,
  EG-D5, EG-D6, EG-D9, EG-D10).
- A list of places judged without opening each: its row's place previewed, opened where you want it, and the list
  back as it was (EG-D2).
- An agent's branch reviewed a commit at a time; its lines' authors and its changes seen in the file itself; the
  cursor's change and file worked on without going into the git panel (EG-D4, EG-D15–EG-D17).
- Markdown edited by what it is: a section, a list item, a fenced block or a link taken whole; emphasis, code and
  links wrapped round text and taken off again; paragraphs wrapped to the width the linter wants, and back (EG-D6–EG-D8,
  EG-D12).
- An agent's long document read by its headings, its sections folded (EG-D11).
- Going back in time: an undo step picked from a list, each with its time, an earlier copy pasted, a place marked and
  returned to (EG-D13, EG-D20).
- The servers' help in the file: the types left implicit, the uses of a name, who calls a function, the imports a move
  breaks fixed with it (EG-D19).
- Several places edited at once, Helix's way (EG-D14).
- More than two windows in a tab, and one zoomed for a while (EG-D21).

## Non-goals

- A full IDE: debug adapters, test runners, toolchain managers and language extras, a plugin manager, AI chat inside
  the editor, a profiler, animations, a dashboard, a terminal of its own (EG-D1).
- vim's macros, named registers and block selection, which D155 left out and still does (EG-D20).
- An undo tree, undo kept across restarts, wrapping as you type (EG-D12, EG-D13).
- A forge's pull requests and issues in slipbox: `gh` has them (EG-D18, GIT-D1).
- `ctrl+space`: the user's, left unbound (EG-D7).

## Builds on

- The lists and their overlays (design/tui.md § Overlays), the peek (VV-D7) and the history (`3.6`).
- The syntax pass and its worker, the code view's cells (`24.x`), and the Markdown parse with its layout IR (`2.1`).
- The lint surface and the Problems panel (`3.21`, `1.7`, `19.8`–`19.11`); the scratch for an agent.
- Find in every note and replace across files (`25.4`, D119), and the regex worker.
- The git panel and its actions (GIT-D8–GIT-D13), the gutter's changes (`26.1`), a file's history and blame (`26.4`),
  the diff and its drawing (GIT-D2), each branch's base (GIT-D10), the opener a problem report uses (RPT-D3).
- The language server client (`19.x`) and the rename's preview with its undo (D152).
- The workspace and its positions (`3.4`, `3.15`, D98).

## Acceptance criteria

- **Lists of places** (EG-T1): the switcher, search, find in every note, references, backlinks and links preview the
  selected row's place, beside the list on a wide screen and under it on a narrow one; `ctrl+t` hides and shows it;
  `alt+enter` opens a pick here, in the split or in a new tab; `space '` reopens the last one as it was. A terminal
  check covers each at 120 and 80 columns.
- **Jump labels** (EG-T2): `s` while reading and `g w` in SOURCE view label the words and links of both windows of a
  split; a label typed moves the cursor and focuses its window; `esc` leaves it as it was.
- **Problems** (EG-T3): on the reference set, `] d` and `[ d` visit a file's problems in order, around the ends; the
  status line says the cursor's; `space c d`'s `y` copies it and `s` puts it in the scratch.
- **Git** (EG-T4, EG-T12): `space g g` opens the panel; from a note, `space g s` stages the change at the cursor and
  `space g d` reverts it after asking; the panel lists a branch's commits since its base, a commit's files and a
  file's change; `:log` too; `space g y` copies a GitHub and a GitLab line link; `space g b` shows the blame column,
  `space g o` the inline diff, against what's staged, then the base.
- **The structure** (EG-T5, EG-T6): `d a h`, `c i k`, `y a l`, `v i o` on notes, and `d a f`, `c i a` on TypeScript,
  Python and Rust, take what they name; `] f` and `] o` go there; `alt+o` grows through a note's tree and a function's,
  and `alt+i` comes back; `y s i w b`, `c s *` then a backtick, `d s (` and a mark typed over a selection wrap and
  unwrap.
- **TODOs** (EG-T7): the reference set's TODOs are coloured where they're marks and not in prose or a string;
  `] x` visits the file's; `space f x` lists the vault's.
- **Find and replace** (EG-T8): the list fills as the query is typed; it opens on the cursor's word; `path:` narrows it;
  `] q` steps after it's closed; a replace with two rows dropped leaves those two matches and undoes in one step.
- **Folds** (EG-T9): `z a` on a heading folds its section to a row saying how many lines; `z shift+m` and `z
  shift+r`; a jump into a folded section opens it; the folds come back after a restart, and a section an agent's
  rewrite kept stays folded.
- **Reflow** (EG-T10): `g q i p` wraps a list item, a quote and a paragraph with a link and a code span longer than
  the width, as EG-D12 says; `g shift+q` joins them back; the width comes from the reference set's markdownlint config.
- **Undo** (EG-T11): after three reloads from disk, `space h u` goes back before them.
- **Language servers** (EG-T13): with the TypeScript server, inlay hints show and hide; the uses of a name are marked
  and `] r` steps; `space c i` lists the callers; moving a file fixes an import in the preview. Live checks against the
  server, listed for approval first (D207).
- **Copies and marks** (EG-T14): `space p` pastes the third copy back; `m a` and `` ` a `` return
  after an edit above and after an agent's rewrite; `m A` from another note.
- **Smaller ones** (EG-T15): each of EG-D22's keys does what it says; closing pairs are on in a fresh config.
- **Windows** (EG-T16): three windows in a tab, in both orientations, saved and restored; `ctrl+w z` zooms one and
  puts everything back.
- **Several selections** (EG-T17): the keys the user settled; an edit at three cursors is one undo step.
- Every new `ctrl` chord has another route (D99): a list's preview and a replace's dropped row by a click as by key.
- Every bug found gets a regression test; every part a terminal check; `bun run check` passes; the docs say it all
  without the blueprint's IDs (EG-T18).

## Changes

### MODIFIED requirements.md § Non-goals

"All of vim, or an IDE: vim's macros, named registers and block selection aren't wanted (D146, D155, EG-D20)."

Previously: "All of vim, or an IDE: vim's marks, macros, named registers and block selection aren't wanted (D146,
D155)."

### MODIFIED requirements.md § Navigating and search

Adds: any word or link on screen reached by its label (EG-D3); a list of places previewed, opened where you choose,
and opened again as it was (EG-D2); find in every note live, from the cursor's word, narrowed by path, its hits
stepped through after it closes (EG-D10); marks, and the note before this one in a key (EG-D20, EG-D22); the vault's
TODOs listed (EG-D9).

Previously: links followed with history, backlinks, the outline, the switcher and the palette a key away; `find`
lists every match of a literal or a regex beside it.

### MODIFIED requirements.md § Editing

Adds: text objects and jumps by syntax, Markdown's and code's, and the selection grown and shrunk by them (EG-D6,
EG-D7); surround, and a mark typed over a selection wrapping it (EG-D8); reflow both ways (EG-D12); a note's sections
folded (EG-D11); undo by time and its steps listed (EG-D13); the copies kept (EG-D20); several selections at once
(EG-D14); a replace across files with rows left out (EG-D10); vim's case operators and the rest of its visual keys,
and closing pairs on by default (EG-D22).

Previously: "The fundamentals short of an IDE: indentation per file, comments, brackets, replace across files, word
completion, spelling (English and Turkish bundled), a command run, a server's snippets (D155, D157)", closing pairs
opt-in.

### MODIFIED requirements.md § Code intelligence

Adds: problems stepped through where they are, the cursor's said on the status line and shown whole (EG-D5); inlay
hints, the uses of a name marked, the call hierarchy and imports fixed on a file's rename (EG-D19).

Previously: "problems, hover, definitions, references, symbols, rename, code actions, formatting, completion (D161)".

### MODIFIED requirements.md § Git

Adds: a branch's commits listed, each commit's files and its change to one (EG-D4); blame for the whole file, as a
column (EG-D16); the changes drawn in the file itself (EG-D17); a line's web link (EG-D18); `space g` a group for
the note's change and file, the panel on `space g g` (EG-D15).

Previously: "blame and a file's history", blame the cursor's line; the git panel on `space g` (GIT-D12).

### MODIFIED requirements.md § Keys and configuration

Adds: `ctrl+space` is never bound (EG-D7).

Previously: nothing said of `ctrl+space`.
