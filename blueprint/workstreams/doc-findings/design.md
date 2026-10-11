# Design changes

Each change names the root's design section it lands in at consolidation. A task writes the new text here as it does
the work; the root's files change only when DF is consolidated.

## MODIFIED design/trust.md § What runs (DF-D1)

Its second paragraph becomes:

> Trusted or not, a folder's config never names a program to run, nor lets slipbox reach the network: `editor.command`,
> `editor.remote`, `lint.command`, a server's `command`, `args` and `environment`, a linter's `lint-command`, and any
> server or linter slipbox doesn't build in, are your own config's only, and so is `[trust]` (D160, D166, D177); so
> are `render.images_remote` and `lsp.auto_install`, since fetching a note's web pictures tells their sites who read
> what, and installing fetches from npm (DF-D1). A folder's file that sets one is ignored, with a warning, whichever
> way it sets it. `update.check` is read from your own config alone where it's used (§ Updates in distribution.md),
> and a folder's is not warned of. Nor may a folder's `[keys]` or `[aliases]` name a command that throws work away or
> runs a program (`shell.run`, `shell.filter`), so a clone can't put one on `ctrl+s` or `:wq` (`USER_ONLY`, each
> with its reason, and `VAULT_FORBIDDEN_COMMANDS` in `core/config.ts`;
> [configuration.md](../../docs/manual/configuration.md), "What only your own file can set").

Previously: "Trusted or not, a folder's config never names a program to run: … are your own config's only, and so is
`[trust]` (D160, D166, D177). Nor may …", nothing on the network.

Beside it, design/rendering.md § Blocks and inlines, on a picture on the internet: "fetched only as `[render]
images_remote` says" becomes "fetched only as `[render] images_remote` says, in your own config (DF-D1)"; and
design/lsp.md § The client for code, **Installing**: "`[lsp] auto_install = false` stops that" becomes "`[lsp]
auto_install = false`, in your own config only (DF-D1), stops that".

## MODIFIED design/export.md § Asking for one, § Markdown, § Known limits (DF-D2, DF-D3, DF-D5)

**§ Asking for one**, the CLI's bullets on where the file goes and what it replaces:

- The file goes to `--out` (or `-o`), from the working folder; a folder, one there or a path ending in `/` (made when
  the export is written), gets the first note's name in it, and its own name says no format (DF-D5). Without `-o`, it
  goes beside the first note, under its name (D185): `notes/report.md` gives `notes/report.docx`. Markdown's is
  `notes/report.export.md`, apart from the note it's of.
- A file already there is replaced, as `-o` does in any tool. A note never is (exit 5), of this root or any other
  (DF-D3): this root's as its index has them; another's, a file of a note's name in a folder that is a root, where it
  is reached or where it really is (a symlinked folder counts). An earlier Markdown export is: its frontmatter's
  `generator: slipbox` says it is one.

Previously: "a folder gets the first note's name in it" (a path ending in `/` that wasn't there was a file of that
name, and `-o out.v2/` took `.v2` for a format); "A note of the root never is (exit 5), but for an earlier Markdown
export" (another root's note was replaced).

**§ Asking for one**, the TUI's Save As keys, the name's sentence, and what's replaced:

- … In the name, `↓` goes to the folder; a name may be a path, from the folder (`~/` home), and a folder named is gone
  into, one ending in `/` made first where it isn't there (DF-D5), as `ctrl+n` makes one.
- A file there is replaced only after `y` to "rep.docx is there — replace it?" (`n`: the window again); a note of any
  root is refused, the window kept (an earlier Markdown export aside, which is asked about as a file is) (DF-D3).

Previously: "a folder named is gone into" (a name ending in `/` that wasn't there was exported to as a file); "a note
is refused" (this root's only).

**§ Markdown**, the bullet on pictures:

- **Pictures** are copied into a folder beside it, `report.export.assets/`: only files that are pictures by what they
  hold (a raster's header, an SVG's start), from inside the root by where they really are, or a picture from the web,
  its cached copy (DF-D2). Each goes by its own name (one from the web by its address's, with its kind's extension
  where that names none); a second of a name is numbered. Obsidian's size is kept where Obsidian reads it:
  `![alt|240](…)`. A picture on the web with no copy here stays a picture, its address as it was. Anything else a
  picture link names — a file that isn't a picture, one outside the root — is a link to it from the export,
  `[alt](../notes.txt)` (its alt, else its file's name), nothing of it copied; one on another drive is its words. The
  folder answers no lookup by name ([links.md](links.md) § Wikilinks).

Previously: "Pictures are copied into a folder beside it, `report.export.assets/`, each by its own name …": whatever a
picture link named, a text file or a file outside the root included.

**§ Known limits**, the first bullet:

- A picture is read wherever its link points, as on screen. A note from elsewhere can name a picture outside the
  root, and its export as Word, PDF, a web page or an e-book would hold that picture; a Markdown export links it
  (DF-D2).

Previously: "… and its export would hold that picture."

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

Adds, at the section's end:

> **The source launcher**, `scripts/install-local.sh`, writes a small script at the same path (`~/.local/bin/slipbox`,
> or `$SLIPBOX_BIN_DIR`'s) that runs the checkout with Bun, given slipbox's own `bunfig.toml` and no `.env` (trust.md
> § Bun's own reading). A link found there, a release's to `<data>/current/slipbox` or any other, is removed and the
> script written in its place, never through it: writing through a release's link would overwrite the release's
> binary with the launcher. It says so: `replaced the link <path> -> <target> (a release's, which stays installed)
> with this launcher`, or, for a link of another kind, that what it pointed to is left as it is (DF-D7). A release's
> own files are never written: they stay installed until `slipbox uninstall --yes` removes them, the launcher kept as
> no longer the installer's link (§ Uninstalling).

Previously: the launcher appeared only in step 2, as what the installer leaves alone; nothing said what the launcher
does over a release's link.

## MODIFIED design/lsp.md, design/tui.md § What's under the cursor (DF-D8, DF-D13)

**DF-D8**, design/tui.md § What's under the cursor: its `space c f` item becomes

- **`space c f`** formats the file as its server does (the first that formats), one undo step; left unsaved. The server
  is asked to indent as slipbox works the file's indentation out (`25.1`, § Editing): its `.editorconfig`, else its
  own lines, else its language's — `tabSize` that step (a tab's width where it's tabs), `insertSpaces` unless it's
  tabs; never a fixed 2 (DF-D8).

Previously: "**`space c f`** formats the file as its server does (the first that formats), one undo step; left
unsaved." The request said `tabSize: 2` whatever the file, so a server that follows it re-indented a 4-space file to 2.
design/lsp.md says nothing of formatting's options: unchanged by DF-D8.

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

slipbox's syntax errors in the code view too; and a comment's paths links in its prose there (A13).

design/code-view.md § How it behaves, its **Problems** item becomes

- **Problems** show as in source mode, from every source alike: the bar's signs, the marks, the Problems panel —
  slipbox's own syntax errors among them, out of insert, until a server has answered (`16.9`, DF-D10) — and a cell's
  header counts its own. A mark is on a row's text only, never on a cell's header, borders or padding, which carry a
  line, not its text.

Previously: "**Problems** show as in source mode: the bar's signs, the marks, the Problems panel — and a cell's header
counts its own. …" — the code left slipbox's own syntax errors out of the code view.

A13 (no decision: the code brought in line with design/tui.md § Files beyond notes, whose links in comments are
"drawn as links, `enter` follows them"), design/code-view.md § How it behaves, after **The cursor**:

- **Links in comments** (`16.10`): a comment's paths that name a file of the root are links in its prose — a doc's, a
  comment's box, a comment among code — drawn and followed as a Markdown link in it is (`enter`, `] l`, the links list),
  to their line where they name one (`path:42`); on a row of code (a note beside code, a comment kept as written) they
  are drawn as source mode draws them, and `enter` reads them from the text.

design/tui.md § Problems where they are: "its syntax errors (`16.9`; in source mode, out of insert, for the text as it
is)" becomes "its syntax errors (`16.9`; in source mode and the code view, out of insert, for the text as it is;
DF-D10)".

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

Obsidian's `==highlight==` and `%%comment%%`; with design/rendering.md § Themes, design/export.md § The assembler,
§ Markdown, and a section after rendering.md § The wikilink tokenizer.

design/rendering.md § Blocks and inlines: the opening sentence becomes "`layout/render.ts` handles every mdast node
remark-gfm produces, plus `#tags` and Obsidian's highlights and comments." (previously "… plus `#tags`."), and the
table gains two rows:

| Node | Rendering |
| --- | --- |
| highlight | `==text==` (Obsidian): its text in the `highlight` role, a marker's yellow behind it, what's inside too |
| comment | `%%text%%` (Obsidian): hidden — in a line, the white space where it was made one; alone, no row |

and **Inline** gains, after `~~strike~~`: "Obsidian's `==highlight==` in the `highlight` role, on its background — a
link or code inside it too — and its `%%comments%%` hidden while reading, shown as typed in source mode and the lens,
which draw the file's text (DF-D17): `a %%note%% b` reads `a b`, `oil %%note%%.` reads `oil.`, a paragraph of nothing
but comments leaves no row, and a comment over blank lines (below) no rows. Rows keep their source lines."

New section, after § The wikilink tokenizer:

**Obsidian's highlights and comments** (DF-D17). `core/obsidian.ts` is a micromark extension too, so neither is read
inside code, `\==` and `\%%` stay text, and each node has its position. A highlight pairs as GFM's `~~strike~~` does:
exactly two `=`, flanking as emphasis does, so `a == b` and `===` are text, and what's inside is read as any text
(`==**bold**==`, a link). A comment pairs any two `%%` of a paragraph, spaces or not, across its lines; what's inside is
read too, so a link, a tag or a task in a comment is still the note's — counted, renamed with its note — only not drawn.
A comment over blank lines — from a paragraph that starts with a `%%` pairing with nothing to the next block at its
level that ends with one (a list or a quote whose last line does: a `%%` right after a list is its last item's lazy
line) — becomes a block of its own (`commentBlock`) after the parse, once its chunks are one; its blocks are read as any
are. One never closed is text.

design/rendering.md § Themes: the roles gain `highlight` (a palette's yellow blended into the page, 30% dark, 40%
light; the terminal's yellow behind black; `mono` reversed, `inverse` now carried to a span's style and the ANSI
writer).

design/export.md § The assembler: **Dropped** becomes "frontmatter, link definitions, HTML blocks and Obsidian's
comments (DF-D17: in a line, the white space where one was made one; a paragraph of them; one over blank lines) — what
a reader of the note never sees isn't in what's sent." (previously "frontmatter, link definitions and HTML blocks.");
the paragraph on paper gains "an Obsidian highlight on a marker's yellow (`<mark>` in HTML and an EPUB, Word's yellow
highlight, a PDF's tint)". § Markdown, **Kept as written** gains "a highlight as `==…==`".

## MODIFIED design/links.md § Wikilinks (DF-D18)

The bullet **What it reaches**:

- **What it reaches,** in order: a note by its name (its file's) or by its path; a path out of the root or into a
  root nested in it; an attachment, relative to the note, then from the root, then by its file name anywhere in the
  root, as Obsidian finds one (`![[dal.png]]`), but in a Markdown export's pictures (`*.export.assets/`), whose copies
  would answer for the pictures they were copied from, unless the name goes through such a folder
  (`[[report.export.assets/dal.png]]`) (DF-D18); a note by an alias its front matter gives (`aliases` or `alias`),
  after every file name (D71, D46). The converter's reading of the old wikilinks leaves them out alike.

Previously: "… then by its file name anywhere in the root, as Obsidian finds one (`![[dal.png]]`); …", an export's
copies included, so one beside a note could win over the picture, or tie with it.

## MODIFIED design/roots.md § Search scope, design/links.md § Where a link lands, design/roots.md § Named folders

The code brought in line with them (B1, B2, A8): no decision, as they said it already. What the sections say more
exactly now, in their words:

### design/roots.md § Named folders

ADDED, a bullet after "**A copy gone**":

- **A clone with a `.slipbox/` name of its own,** given to tell it from the repository it was cloned from, is still a
  copy of that repository: the lookup takes a repository's copies, one remote, as one folder, whatever their
  `.slipbox/` call them (`byRepository` in `core/folders.ts`). By the remote, a qualified pointer and a hosting URL open
  the repository's default copy: the one called by the remote's name (its last part, as its `.slipbox/` name, an alias
  or the remote's own), else the first found; that one not here, another copy of the repository, said so. The clone's
  own name opens the clone, and a pointer written to a copy of the same repository is no clash.

MODIFIED, in "**Different folders of one name:**": "following a pointer by that name lists each folder by its path, a
repository once whatever its copies, to open what it names there, … the CLI gives the candidates, each folder's path
(exit 4)."

Previously: "following a pointer by that name lists each folder, to open what it names there, … the CLI gives the
candidates (exit 4)."

### design/roots.md § Search scope

MODIFIED: "every root leaves out worktrees, whose notes are their main checkout's, even one a note links into (by
`@branch`, or by path)."

Previously: "every root leaves out worktrees, whose notes are their main checkout's."

### design/links.md § Where a link lands

MODIFIED: "A fragment that lands nowhere opens the note at its top, and which heading or block isn't there is said, in
the TUI's message line and the CLI's `warnings` (`resolve` gives the note, its `line` null). Where it lands is shown
by the hover and `shift+k`: the heading's section, the block, the lines ([tui.md](../../design/tui.md) § What's
under the cursor); `resolve` gives its line, a block's and lines' as a heading's."

Previously: "A fragment that lands nowhere opens the note at its top. Where it lands is shown by the hover and
`shift+k`: the heading's section, the block, the lines ([tui.md](../../design/tui.md) § What's under the cursor)."

## MODIFIED design/export.md § The assembler, § Known limits (DF-D24, DF-D25)

Every format embeds the root's pictures only; any Markdown export's pictures folder out of lookups by name.

## MODIFIED design/links.md § Renames and moves; design/tui.md § Files in the explorer (DF-D20, DF-D21)

`cp` into a folder as `mv`; a trailing `/` always a folder to go into, made if missing.

## MODIFIED design/terms.md § Retired; design/tui.md, design/roots.md where config words appear (DF-D22)

Your config takes root wherever it takes vault.

## MODIFIED design/trust.md § What runs (DF-D23)

A folder's `update.check` warned of, as DF-D1's settings are.

## MODIFIED design/tui.md § What's under the cursor (DF-D26)

The hover on a link to a missing heading or block says it opens the note at its top.

## MODIFIED design/roots.md § Named folders (DF-D30)

A named clone made the default copy, and named as its repository.

## MODIFIED design/tui.md § Overlays, the which-key popup (DF-D31)

A top-level prefix's popup carries its group's explanation in its title.

## MODIFIED design/testing.md, the terminal tests' files

Rows for `world-export.ts` (the export window: formats, the window's keys, replacing, notes in order, `:export`) and
`world-fixes.ts` (what writing the docs found, fixed: typing without vim, reload, the trash, moves, clones, the code
view's links and errors, Obsidian's highlights and comments, a folder's network settings, the Save As window's
folders).
