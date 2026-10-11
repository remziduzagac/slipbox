# Design changes

Each change names the root's design section it lands in at consolidation. A task writes the new text here as it does
the work; the root's files change only when DF is consolidated.

## MODIFIED design/trust.md § What runs (DF-D1)

`render.images_remote` and `lsp.auto_install` join `update.check` among the settings only your own config sets.

## MODIFIED design/export.md § Markdown, § Asking for one (DF-D2, DF-D3, DF-D5)

Pictures of the root only into `.export.assets/`; no export over a note of any root; `-o dir/` makes the folder.

## MODIFIED design/links.md § Renames and moves; design/tui.md § Renames, § Files in the explorer (DF-D4)

**design/links.md § Renames and moves**, a paragraph after the list of forms, before "No old name is written…":

> **Where a move lands** (DF-D4). A new path typed for a move — `slipbox mv`, `space n m`, `:mv` — that is a folder
> already, or ends in `/`, means into it, as the shell's `mv` does: the note, file or folder keeps its name there
> (`slipbox mv note.md ideas/` makes `ideas/note.md`), the folder made when it isn't there yet. The root itself is
> such a folder: `/` in the TUI; in the CLI, the root's path, or `.`, `./` at its top. Any other path is the whole
> new path, a note's extension added when it has none, and anything already there is refused, never overwritten. In
> the CLI, `.` and `..` are from the current folder, as `./` and `../` are; the plan (`--dry-run`, `--plan`) holds the
> path it lands on. A rename in place (the explorer's `r`) takes a name, never a folder to go into; the explorer's `m`
> and a paste pick the folder themselves (`core/rename.ts`, `moveTarget`).

Previously: nothing on it. The new path was always the whole path: `slipbox mv note.md ideas/` renamed the note to
`ideas.md` beside the folder, and a folder's name there was refused as existing.

**design/tui.md § Renames**, its first sentence:

> `space n m` (`:rename <path>`, `:mv`) asks for the note's new path, the old one typed already — a folder there, or a
> path ending in `/`, moves it into that folder ([links.md](links.md) § Renames and moves); the explorer's `r` …

Previously: "`space n m` (`:rename <path>`, `:mv`) asks for the note's new path, the old one typed already; the
explorer's `r` …"

**design/tui.md § Files in the explorer**: unchanged. Its `m` picks a folder from a tree, and a paste goes into the
selected folder: both were into a folder already.

## MODIFIED design/tui.md § External changes (DF-D6)

Adds a bullet after **Changed:**

- **Reloaded by hand** (`space n r`, `:reload`; DF-D6): a note without unsaved changes is read from disk again, as a
  change is. One with unsaved changes whose file is as it was loaded asks `Discard your changes to <note>? It's loaded
  from disk again: u brings them back.`: `y` loads the file as `:e!` does (one more undo step), `n` or `esc` keeps
  your text, and autosave is left as it was (the conflict prompt's `esc` would turn it off for the note: (k) Keep
  yours). A file that did change, or was deleted, goes as before: the conflict prompt.

Previously: nothing on `space n r`; it opened the conflict prompt whenever the note had unsaved changes.

## MODIFIED design/distribution.md § Installing (DF-D7)

The source launcher replaces a link at its path, never writes through it.

## MODIFIED design/lsp.md, design/tui.md § What's under the cursor (DF-D8, DF-D13)

Formatting with the file's own indentation (DF-T7 writes it).

The servers' table (DF-D13), its rows as `LANGUAGES` in `src/core/servers/languages.ts` has them:

| Languages | Servers, the main first (npm: installed when missing) |
| --- | --- |
| TypeScript, JavaScript, TSX, JSX | TypeScript 7's own (npm), vtsls for an older TypeScript (npm); eslint, biome |
| Python | pyright (npm); ruff |
| Rust, Go, Lua | rust-analyzer, gopls, lua-language-server |
| bash | bash-language-server (npm) |
| JSON, JSON with comments (`.jsonc`) | vscode-json-language-server (npm), biome |
| YAML, TOML | yaml-language-server (npm), the linter yamllint; taplo |
| CSS | vscode-css-language-server (npm), stylelint, biome |
| SCSS, Less | vscode-css-language-server (npm), stylelint |
| HTML | vscode-html-language-server (npm) |
| Dockerfile, PHP | docker-langserver (npm), the linter hadolint; intelephense (npm) |
| Swift, C, C++, Ruby (`.rb`, `Gemfile`, `Rakefile`) | sourcekit-lsp; clangd; ruby-lsp |

Other languages, Java and Kotlin among them, have no server built in: one is added in your config's
`[language-server.<name>]` and `[[language]]`.

Previously: one row for JSON, YAML and TOML, and one for CSS, SCSS, Less and HTML with biome for all three styles; no
`.jsonc`; Ruby by `.rb` alone.

## MODIFIED design/roots.md § How a root is named and shown, design/terms.md § Retired: the CLI's words (DF-D9)

design/roots.md § How a root is named and shown, a paragraph added at its end:

> The CLI says root where the code says vault, in its messages and its JSON, whose `schema` stays 1 (DF-D9): `info`'s
> `mode` is `root` or `folder`; a change's `kind` is `root` for a root's naming, `make-root` for `init` of a folder
> inside a root, `unmake-root` for `deinit`; a root nested in another is skipped by the walk as a `nested root`; and
> nothing to undo is "in this root". The renames log and the saved plans keep the code's words, `vault`, `make-vault`
> and `unmake-vault`, and the CLI says them as root when it prints them (`kindWord` in `cli/cli.ts`). A theme slipbox
> ships is `built-in`, as a document type is ([docs/manual/cli.md](../../docs/manual/cli.md) § `info`, § Moving,
> copying and deleting, § `themes`).

design/terms.md § Retired, the **vault** entry:

> - **vault**: a root, or a named folder (D79). The word stays in code and config (`core/vault.ts`, the `[vault]`
>   identity table, command ids such as `vault.init`), in the logs and plans slipbox keeps, and in the names of the
>   fixture and demo vaults; never in what the CLI prints or its JSON (DF-D9).

Previously: "The word stays in code and config (`core/vault.ts`, the `[vault]` identity table, command ids such as
`vault.init`) and in the names of the fixture and demo vaults." design/how-it-works.md has no CLI words to change.

## MODIFIED design/code-view.md § How it behaves; design/tui.md § Problems where they are (DF-D10)

slipbox's syntax errors in the code view too.

## MODIFIED design/tui.md § Positions (DF-D11)

In the Session item: "The tabs and windows are restored when slipbox starts with no note named, no path or a folder
(`slipbox ~/notes`), if `ui.restore_session` is on; a file named opens that file alone. UI setting overrides and recent
commands on every start."

Previously: "The tabs and windows are restored when slipbox starts with no path, if `ui.restore_session` is on; UI
setting overrides and recent commands on every start."

## MODIFIED design/rendering.md § Glyphs (DF-D12)

"A set named in the config (`render.glyphs`) forces it; where the config says `auto`, `SLIPBOX_GLYPHS` chooses one
before the detection above; and in the TUI `space u g` picks one with a live preview (`:glyphs <set>` sets it
directly)."

Previously: "`SLIPBOX_GLYPHS` or the config value forces a set, and in the TUI `space u g` picks one with a live
preview (`:glyphs <set>` sets it directly)."

## MODIFIED design/tui.md § Files in the explorer; design/how-it-works.md § Storage (DF-D14)

**design/tui.md § Files in the explorer**, the **Delete (`d`)** bullet, from "`space v t` (`:trash`)":

> `space v t` (`:trash`) lists the trash, `enter` restoring an item — refused when something is at its place again;
> its last row, **Empty the trash…** (`up` from the first; `trash.empty`, `:empty-trash`, opens the list on it), asks
> — "Empty the trash? Its 3 items go for good: none can be restored." — and `y` removes, for good, the items the list
> showed (one deleted since stays), as `slipbox trash empty --yes` does after its listing (DF-D14). The trash keeps
> nothing past 30 days: an older item is removed, its folder too, whenever the trash is next read or written — listed,
> restored from, deleted to (`core/files.ts`, `listTrash`, `TRASH_DAYS`). An open note deleted shows its last text, …

Previously: "`space v t` (`:trash`) lists the trash, `enter` restoring an item — refused when something is at its
place again." Nothing emptied the trash: it only grew, a note deleted for being private staying in it.

**design/how-it-works.md § Storage**, the trash's row:

> | the trash (`18.4`) | `$XDG_STATE_HOME/slipbox/<key>/trash/` (`trash.json`, and an item per folder; 30 days,
> emptied by `slipbox trash empty`) |

(one line in the table.) Previously: "(`trash.json`, and an item per folder)".

## MODIFIED design/tui.md § Editing, § The cursor, § Modes and dispatch (DF-D15)

**§ Editing** adds a paragraph after the first ("…so tabs, wide characters and wrapped rows edit exactly where they
show."):

**Desktop keys while typing** (DF-D15). Insert mode keeps vim's keys and adds a desktop editor's, none of them keys
vim's insert mode uses here (`editing.ts`, `insertKey`). `ctrl+z` and `ctrl+y` undo and redo without leaving it: what
was typed so far closes as a step of its own, the undo or redo runs, and a new step opens at the cursor, so text typed
after an undo ends the redo, as in a desktop editor; `.` then repeats what's typed from there, as an `i` would have
started it. The page keys move the cursor a window's height less two rows, over rows of text only (the lens's rules
stop them, as they stop the arrows), and in source mode scroll the view as far, as reading's page keys do;
`ctrl+home` and `ctrl+end` go to the note's start and end, as `cmd+up` and `cmd+down`. `shift` with any of typing's
moves (the arrows, `home` and `end`, the page keys, the word keys, the `cmd` arrows and `ctrl+a` / `ctrl+e`) selects:
the window's selection, anchored where the cursor was, its ends between characters as the cursor is while typing, so
the character after its end is neither drawn in it nor taken (`typedSelection`). With one, a character typed, `enter`
or a paste (`ctrl+v`, or the terminal's own) replaces it; `backspace`, `delete`, `ctrl+w` and `ctrl+u` delete it;
what it replaces or deletes isn't copied, so a paste over it puts what was copied before. `ctrl+c` copies it and
`ctrl+x` cuts it, to the clipboard and the register; `ctrl+c` leaves insert only with nothing selected. `left` and
`right` go to its start and end; any other key lets it go and does what it does; leaving insert drops it. These keys
are fixed, as insert mode's others are (`ctrl+s` among them), not a keymap's.

**§ The cursor**, its **Selection** paragraph, becomes:

**Selection.** A selection is an anchor plus the cursor. It's extended by `shift`+movement or by visual mode (`v` by
character, `shift+v` by whole row); `o` swaps the ends, and `esc` clears it. A mouse drag makes one too, copied on
release. In source mode or the lens, one made by a drag or by `shift`+movement is a visual selection (as vim's mouse
makes one; DF-D15), so `d`, `c`, `x`, `>`, `<` and `y` act on it, any movement extends it and `esc` leaves it; an
operator's shifted motion (`d shift+right`) leaves none behind. While typing, `shift`+movement selects as a desktop
editor does (§ Editing). Copied text is the rendered text, which is what you saw. A double-click on a link follows it
once: the second click, landing in the note it opened, is swallowed.

Previously: "…A mouse drag makes one too, copied on release; in source mode or the lens it is a visual selection (as
vim's mouse makes one), so `d`, `c`, `x`, `>`, `<` and `y` act on it and `esc` leaves it. Copied text is…": a
`shift` selection in source mode was a plain one, which `d`, `x` and `c` didn't act on.

**§ Modes and dispatch**, the table's insert row: `| insert | typed text, and the few keys that edit, move or select
| i, a, o in source or the lens |`.

Previously: "typed text, and the few keys that edit or move".

## MODIFIED design/rendering.md § Blocks and inlines (DF-D17)

Obsidian's `==highlight==` and `%%comment%%`.

## MODIFIED design/links.md § Wikilinks (DF-D18)

An export's pictures left out of lookups by name.

## MODIFIED design/roots.md § Search scope, design/links.md § Where a link lands, design/roots.md § Named folders

Not changes: the code brought in line with them (B1, B2, A8).
