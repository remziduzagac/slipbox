---
status: review
assignee: claude-keys
blocked_by: []
created: "2026-10-11"
---

# DOC-T1: The keys chapter

`docs/manual/keys.md`: every key slipbox has, for looking up, from today's `docs/keymap.md`.

## Description

Rewrite `docs/keymap.md` as the manual's keys chapter: the notation, the conventions (the leader and which-key, the
other route for every `ctrl` chord, plain `q`, `ctrl+c`), the cursor, every group of keys, the keys in lists and
prompts, the mouse, the platform notes. Take out what is history or the design's: the opening on the phase 2 keymap,
"decided 2026-09-29", the IDs in tables and prose. The comparison with vim, VS Code and Obsidian stays only where it
tells someone coming from one of them what to expect. Keep the sections in the order help and the palette list their
commands (`COMMAND_GROUPS` in `src/core/command-specs.ts` follows them). The area chapters explain behaviour and link
here for the full lists, so a row stays a row: what the key does, briefly.

Check every table against `src/tui/keys.ts` (`DEFAULT_KEYS` and each mode's own table) and the command specs: a key
in the code but not the doc, or the reverse, is fixed in the chapter and noted in the Log.

## Acceptance criteria

- Every default key, in every mode, is in the chapter, and none that the code lacks.
- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).
- Removing the old reference, and the links to it (DOC-T11).

## References

- Delivers: requirements.md § The documents (`manual/keys.md`).
- Rests on: DOC-D2, DOC-D3.
- Sources: `docs/keymap.md`, `src/tui/keys.ts`, `src/core/command-specs.ts`, `blueprint/design/tui.md`.

## Log

- 2026-10-11: claude-keys started: read the brief, the workstream, the sources.
- 2026-10-11: Sources read: `docs/keymap.md`, `src/tui/keys.ts` (every mode's table, `DEFAULT_ALIASES`,
  `DEFAULT_GROUPS`), `src/core/command-specs.ts` (`COMMAND_GROUPS` for the order), `src/core/commands.ts` (key
  notation), the hard-coded keys in `src/tui/app.ts` (lists, prompts, questions, panel filters, the find and replace
  rows), `editing.ts` (insert mode), `completion.ts`, `snippets.ts`, `replacing.ts` (`:s///c`), `saveas.ts`, `vim.ts`,
  `gitview.ts`, `actions.ts` (help, the palette, `MOUSE_HELP`), `core/clipboard.ts`; design `tui.md` § Overlays,
  § Modes and dispatch.
- 2026-10-11: Tried headlessly (the `App` driven as `tests/tui.test.ts` does, scratch XDG folders) on the reference
  set's `work/product`: the rail buttons, `ctrl+backspace`, `y p` and `y y` in source mode and reading, `space u u`,
  `q` on tabs, `:footnotes`, `p` while reading. A script lists every default key, every mode, against the chapter
  (none left out, canonical spelling) and every `:` alias (none left out, none invented).
- 2026-10-11: Notation: keys written in the canonical modifier order help shows (`ctrl+shift+left`, `alt+shift+left`).
  `keys.ts` writes ten extend keys `shift+ctrl+…` / `shift+alt+…`; `tests/docs.test.ts`'s `keysLeftOut` compares the
  literal spelling, so it reports those ten until `asWritten` canonicalises (`canonSeq`) first. For DOC-T11.
- 2026-10-11: In the code, not in the old keymap: `ctrl+backspace` bound to find and replace (many terminals send it
  for `ctrl+h`); `ctrl+_` beside `ctrl+/` (source and visual); insert mode's `ctrl+[`, `ctrl+h`, `alt+backspace`; the
  replace row's `down` / `up`; source control's `l`, `h`, `a`, `shift+u`, `.`, `g g`, `shift+g`; the Problems panel's
  `l`, `o`, `s`; the save window's keys; `:tabo`, `:type`, `:source`, `:link`, `:search`, `:changes`, `:diff`,
  `:worktrees`, `:merge-review`, `:undo-rename`, `:context`, `:relink`, `:rename`, `:mv` missing from its alias table;
  `:vs`, `:sp`, `:tabnew` take a note. All in the chapter now.
- 2026-10-11: Old keymap against the code: the history view and source control open on a double-click, not a click;
  "`space v v` … `back` returns": no `back` entry found, left out; copying also tries `xsel`; in source mode and the lens
  `y` is the yank operator, so `y p` and `y r` don't work there ("y doesn't take p"), now said.
- 2026-10-11: Bug (not fixed): the left rail's `±` source control button does nothing when clicked: `clickHot`'s `btn`
  case in `src/tui/app.ts` has no `git` branch (tried: the panel stays closed; `space g s` opens it). The chapter says
  so as it is.
- 2026-10-11: Stale text in the code (not fixed): help's `MOUSE_HELP` says a click on the status line's path copies it
  (it opens the window's history with Copy path first), that a click opens a note in the explorer or jumps in the
  history (a double-click does), and its rail line names only `≡ ◷ ▤`. which-key's `DEFAULT_GROUPS` for `[`, `]` and
  `z` name only some of their keys (not `] s`, `] t`, `] c`, `z a`, `z =`, `z g`).
- 2026-10-11: Left to other chapters, linked: how the cursor moves (reading.md), vim's rules and where source mode
  differs, the substitute grammar, `:!` in full (editing.md, finding.md), resize limits (screen.md). The old keymap's
  long prose on those is not in this chapter.
- 2026-10-11: Done: `docs/manual/keys.md`, markdownlint clean, own anchors resolve, no IDs, no links into the
  blueprint; links to other chapters (no anchors) for DOC-T11. Status review.
