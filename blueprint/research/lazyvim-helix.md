---
status: current
created: "2026-11-08"
---

# Research: what LazyVim and Helix have that slipbox lacks

What LazyVim and Helix users reach for that slipbox didn't have on 2026-11-08, each with where slipbox stands and how
much it would matter, ranked. [EG](../workstreams/editor-gaps/README.md) settles what's built of it.

Provenance: *read* marks what was read on 2026-11-08 in lazyvim.org (its keymaps and the coding and editor plugin
pages), docs.helix-editor.com (keymap, text objects, commands) and the flash.nvim and grug-far.nvim READMEs; *memory*
marks what comes from memory, unchecked. Keys are in each tool's notation (LazyVim's `<leader>` is space). "Searched"
is a grep over `docs/manual`, `docs/guides` and `src/core/application/commands/areas`, or `src` where said; the line
numbers are `dev` at 5c4c5027.

## Top ten, ranked

1. **Jump labels** (flash `s`, Helix `gw`): reach any visible word, link or heading in two or three keys.
2. **Previews in lists**: see a hit from the switcher, search or references before you open it.
3. **Branch commit log with each commit's diff**: review an agent's branch one commit at a time.
4. **Problem jumps `]d`/`[d`, and the message at the cursor**: work through lint and LSP findings where they are.
5. **Syntax-aware text objects** (function, class, argument, comment, tag; Markdown blocks): `daf`, `cia`.
6. **Surround** (add, change and delete): wrap text in `**`, backticks, brackets or quotes.
7. **TODO/FIXME comments**: highlight them, jump between them and list them across the vault.
8. **Grow or shrink the selection by syntax node** (Helix `A-o`/`A-i`, LazyVim `<C-space>`).
9. **A better find in every note**: live results, the word under the cursor, a path filter, `]q` steps, resume.
10. **Fold a note's sections in the text** (`za`, `zM`, `zR`), for long agent-written documents.

## Editing and selections

- **Surround.** The mini.surround extra: `gsa` add, `gsd` delete, `gsr` replace, `gsf` find (*read*). Helix: `ms<char>`,
  `mr<from><to>`, `md<char>` (*read*). slipbox: absent ("surround" appears only at `docs/manual/concepts.md:73`, which
  is unrelated). **High**: emphasis, code spans, links and quotes are the most common Markdown edits.
- **Multiple selections.** Helix: `C`/`A-C` add a cursor below/above, `s` selects regex matches in the selection, `S`
  splits it, `A-s` splits on lines, `K`/`A-K` keep or drop matches, `,` keeps the primary, `&` aligns (*read*).
  slipbox: absent (searched "multiple cursors|multi-cursor|several cursors"); `c g n` then `.`
  (`docs/manual/keys.md:587-588`) and `:s///c` (`docs/manual/finding.md:215-248`) cover the common case. **Medium**.
- **Hard-wrap a paragraph.** Helix `:reflow [width]` (*read*); vim `gq`/`gw` (*memory*). slipbox: absent (searched
  "reflow|rewrap|hard wrap|g q"). `:'<,'>!fmt -w 120` (`docs/manual/keys.md:688`) mangles list markers and links.
  **Medium-high**: slipbox runs markdownlint (`docs/manual/editing.md:561`), which flags an agent's long lines.
- **Undo by time, and the undo history as a list.** Helix `A-u`/`A-U`, `:earlier 10m`, `:later` (*read*); LazyVim
  `<leader>su` undotree (*read*). slipbox: linear undo, where a reload from disk is one step
  (`docs/manual/editing.md:253-271`). **Medium**: go back to before the agent's last rewrite without counting `u`s.
- **Macros, named registers, yank history.** Helix `Q`/`q` and `"<reg>` (*read*); the yanky extra's `<leader>p` and
  `[y`/`]y`, and snacks' `<leader>s"` (*read*). slipbox: one register and no macros, since `q` closes
  (`docs/manual/editing.md:368`, `:399`). **Low-medium**: `.` and `:s` cover most repeated fixes.
- **Smaller edits.** Helix's `` ` ``/`` A-` `` lower/upper case, `C-a`/`C-x` increment (*read*), vim's `C-v` block
  selection and visual `p u U J r` (*memory*). slipbox has `~` on one character (`docs/manual/keys.md:577`); `ctrl+v`
  and `ctrl+x` are paste and cut (`docs/manual/editing.md:398`); its visual keys are listed in
  `src/tui/shell/input/keys/contexts.ts:27-44`. **Low**.
- **Auto-pairs on by default.** LazyVim loads mini.pairs, Markdown included (*read*); Helix's are on (*memory*). slipbox
  has them, but they start off (`docs/manual/editing.md:219`). **Low**: a default to rethink, not a missing feature.

## Motions and text objects

- **Jump labels.** flash.nvim: `s` labels matches in every window, `S` labels syntax nodes, `r` runs an operator
  remotely, and labels in `/` are opt-in (*read*). Helix `gw` labels every word on screen (*read*). slipbox: absent
  (searched "label|hint|jump"); it has `f`/`t` within a row (`docs/manual/keys.md:115-117`) and `tab` from link to link
  (`:182`). **High**: reading is slipbox's main mode, and labels on links would follow any link in two keys.
- **Syntax-aware text objects.** Helix `mi`/`ma` with `f` function, `t` type, `a` argument, `c` comment, `T` test, `g`
  change (*read*). LazyVim's mini.ai: `f`, `c` class, `o` block, `t` tag, `u` call, `d` digits, `e` case segment, `g`
  buffer (*read*). slipbox: only `w`, `W`, `"`, `'`, a backtick, `(`, `[`, `{`, `<` and `p`
  (`docs/manual/keys.md:592-599`, `src/tui/shell/input/vim/motions.ts:120-123`). **High**: the tree-sitter grammars
  are already shipped (`package.json:42-76`). The Markdown counterparts (fenced block, list item, section, link,
  table cell) are in neither tool.
- **Grow and shrink the selection by syntax node.** Helix `A-o`/`A-i`, `A-n`/`A-p` siblings (*read*); LazyVim
  `<C-space>` and `<BS>` (*read*). slipbox: absent (searched "expand|grow the selection|syntax tree"; `lens.grow` at
  `src/core/application/commands/areas/files.ts:65` sizes the lens). **Medium-high**: a statement or block in one key.
- **Jump by function, type, argument, comment or test.** Helix `]f`, `]t`, `]a`, `]c`, `]T` (*read*); LazyVim `]f`,
  `]c`, `]a` (*memory*). slipbox: `]]`/`[[` go between definitions (`docs/manual/code.md:216`); `]c` is git's
  (`docs/manual/keys.md:749`). **Low-medium**.
- **Marks and pinned files.** LazyVim's `<leader>sm` marks picker; harpoon's `<leader>1`-`9` and `<leader>h` (*read*).
  slipbox: none (searched "bookmark|marks|harpoon"); pinned tabs (`docs/manual/keys.md:316-321`) and history
  (`:225-248`) come closest. **Low-medium**. Also low: Helix `A-.` repeats any motion; slipbox's `;`/`,` repeat
  f/t only (`:117`).

## Navigation and pickers

- **A preview in lists.** Snacks, telescope and fzf-lua preview the file at the hit (*memory*); Helix's pickers do, and
  `C-t` toggles it (*read*). slipbox: each row is one line of text (`docs/manual/screen.md:462-479`); only the theme
  picker previews (`docs/manual/keys.md:698`). **High**: judge 20 search hits or references without opening each.
- **Open a pick in a split or a tab.** Helix `C-s`/`C-v` (*read*); snacks `<c-s>`/`<c-v>`/`<c-t>` (*memory*). slipbox:
  lists take only `enter` (`docs/manual/keys.md:1036-1050`); search's `o` enters another vault
  (`docs/manual/finding.md:117-118`). **Medium**.
- **Resume the last list.** LazyVim `<leader>sR`, Helix `space '` (*read*). slipbox: absent (searched "resume|last
  picker"). **Medium**: after reading one hit, go back to the rest. Also low: the alternate file in one key (LazyVim
  ``<leader>` ``, Helix `ga`/`gm` (*read*)); slipbox uses `ctrl+p enter` (`docs/manual/finding.md:26-27`).

## Search and replace

- **Find in every note: live, from the word, filtered.** LazyVim `<leader>/` (live grep) and `<leader>sw` (the word or
  selection) (*read*); grug-far's files filter, flags and paths (*read*); Helix `space /` (*read*). slipbox: a prompt,
  then a list of at most 1,000 lines from every note and shown file; nothing is prefilled
  (`docs/manual/finding.md:266-277`; `src/tui/actions/documents/actions-find.ts:81-153`, which opens the prompt empty at
  `:153`). **High**.
- **Step through hits after the list closes.** LazyVim `]q`/`[q`, with trouble or quickfix (*read*). slipbox: the list
  closes on `enter` (`actions-find.ts:143-148`), and there's no next-hit key (searched "quickfix"). **Medium**.
- **Replace across files, match by match.** grug-far lets you edit result lines and sync them, delete a line to skip
  it, and keep a history (*read*). slipbox previews, then replaces all or nothing (`docs/manual/finding.md:279-296`).
  **Medium**: for an agent's rename where a few hits must stay.

## Git

- **The branch's log, with each commit's diff.** LazyVim `<leader>gl` and `<leader>gL` (*read*); lazygit (*memory*).
  slipbox has a file's history (`docs/manual/git.md:560-571`) and the branch's diff as one whole (`:782-803`), but no
  list of the branch's commits (searched "commits" in `docs/manual/git.md`). **High**.
- **Stage or reset the change at the cursor, by key.** gitsigns `<leader>ghs`/`ghr` (hunk), `ghS` (buffer), `ghu`
  (undo stage), `ih` (hunk object) (*read*). slipbox has Preview and Undo the change
  (`src/core/application/commands/areas/git.ts:224-235`), but stages only by a click on the gutter sign
  (`docs/manual/git.md:154-166`) or with `s` in the panel or the review (`docs/manual/keys.md:777`, `:809`). **Medium**.
- **Blame for the whole file.** gitsigns `<leader>ghB` (*read*). slipbox: the cursor's line, in a floating window
  (`docs/manual/git.md:545-558`). **Medium**: it would show which lines the agent's commits wrote.
- **An inline diff in the file.** The mini.diff extra's `<leader>go` overlay (*read*). slipbox: diffs float
  (`docs/manual/git.md:811-816`), and `space k d` folds the unchanged cells (`docs/manual/keys.md:742`). **Medium**.
- **A line's web link.** LazyVim `<leader>gB` opens it, `<leader>gY` copies it (*read*). slipbox: absent (searched
  "github|browser"); `y r` copies `path:line` (`docs/manual/keys.md:163`). **Low-medium**. Pull request and issue
  pickers (snacks `<leader>gp`/`gi`, octo (*read*)) are **low**: `gh` covers them.

## Code and LSP

- **Problem jumps, and the problem at the cursor.** LazyVim `]d`/`[d`, `]e`, `]w`, `<leader>cd` (*read*); Helix `]d`,
  `]D`, `:yank-diagnostic` (*read*), inline diagnostics (*memory*). slipbox marks and counts problems
  (`docs/manual/code.md:651-694`); you read them in the Problems panel, whose `j`/`k` move the note
  (`docs/manual/keys.md:916-932`). There is no next-problem command (`files.ts:313-330`; searched `src` for
  `problem.next`). **High**: copying a problem, or sending it to the scratch for the agent, would fit too.
- **TODO comments.** todo-comments highlights TODO/FIX/HACK/NOTE, with `]t`/`[t`, `<leader>st` and `<leader>xt`
  (*read*). slipbox: absent (searched "TODO|FIXME"); it has `- [ ]` tasks (`docs/manual/editing.md:492`), and `]t` is
  the next note of a type (`docs/manual/keys.md:489`). **High**: agents leave TODOs and "not implemented" stubs.
- **Inlay hints.** LazyVim `<leader>uh` (*read*); Helix `display-inlay-hints` (*memory*). slipbox: absent (no
  `inlayHint` in `src`). **Medium**: it would show the types an agent left implicit.
- **Highlight references under the cursor.** snacks.words with `]]`/`[[` and `<a-n>`/`<a-p>` (*read*); Helix `space h`
  (*read*). slipbox: absent (no `documentHighlight` in `src`); `g r` lists them (`docs/manual/code.md:523`). **Medium**.
- **Call hierarchy, and a file rename that fixes imports.** LazyVim `gai`/`gao` and `<leader>cR` (*read*). slipbox: no
  `callHierarchy` or `willRenameFiles` in `src`; a rename fixes Markdown links (`docs/manual/files.md:337-372`).
  **Low-medium**.
- **Formatting and servers.** Helix `=` formats a selection, `:lsp-restart` (*read*); conform's format-on-save (*read*).
  slipbox formats the whole file by key (`src/core/application/commands/areas/motion.ts:278`) and has `slipbox doctor`
  (`docs/manual/code.md:400`). **Low**.

## UI and windows

- **Fold a note's sections.** LazyVim: treesitter folds under the `z` group (*read*; the foldexpr *memory*). slipbox:
  the outline folds its own list (`docs/manual/finding.md:314`) and code cells fold whole (`docs/manual/code.md:205`),
  but nothing folds in a note's text (searched "fold" in `reading.md` and `editing.md`). **Medium-high**.
- **Zoom a window.** LazyVim `<leader>wm`/`<leader>uZ` (*read*). slipbox: `window.only` closes the other window
  (`windows.ts:38`), and zen hides everything but the note (`ui.ts:34`). **Low-medium**: maximize a split, then return.
- **Smaller.** vim and Helix split freely (*memory*), and slipbox allows two windows per tab
  (`docs/manual/keys.md:252`); snacks.indent `<leader>ug` (*read*), where slipbox has indent guides in the code view
  only (`docs/manual/code.md:113`). **Low**.

## Sessions

slipbox restores workspaces per vault, branch and home folder (`docs/manual/screen.md:630-664`), beyond
persistence.nvim's `<leader>qs`/`ql`/`qS` (*read*); Helix has none (*memory*). Only `<leader>qd` (skip this session) is
missing; slipbox has the global `ui.restore_session = false` (`:643`). **Low**.

**Already in slipbox:** which-key, palette, help, switcher with `#` symbols (`docs/manual/finding.md:43-46`), outline,
breadcrumb, history as jumplist, pinned tabs, explorer git and problem marks (`docs/manual/files.md:151`, `:180`),
gutter signs, LSP hover/definition/references/rename/actions, signature help (`docs/manual/code.md:571`), relative
numbers (`docs/manual/configuration.md:97`), `:'<,'>!` filters, zen, messages.

**Left out:** debug adapters (nvim-dap), test runners (neotest), toolchains and language extras (mason, venv, metals,
LaTeX, REST), plugin management (lazy.nvim), AI chat plugins, the profiler, animations, the dashboard, a terminal.

## Sources

- [LazyVim's keymaps](https://www.lazyvim.org/keymaps) and its
  [coding](https://www.lazyvim.org/plugins/coding) and [editor](https://www.lazyvim.org/plugins/editor) plugins.
- Helix's [keymap](https://docs.helix-editor.com/keymap.html),
  [text objects](https://docs.helix-editor.com/textobjects.html) and
  [commands](https://docs.helix-editor.com/commands.html).
- [flash.nvim](https://github.com/folke/flash.nvim) and [grug-far.nvim](https://github.com/MagicDuck/grug-far.nvim):
  their READMEs.
