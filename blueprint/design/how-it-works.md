# How it works

The walkthrough of the whole system, end to end: one core and its two faces, the parts it is made of, how the CLI and
the TUI share the disk, the modules, a note's way from its bytes to the screen, what slipbox depends on, where it
keeps its files, and what it costs. Each part has a design file of its own, linked where the part is described
below; [terms.md](terms.md) defines the words, and [the decisions](../decisions/) give the reasons.

## One core, two faces

```text
                 ┌──────────────────────────────────────────┐
                 │ src/core — pure TypeScript, no terminal   │
                 │ vaults · walk · parse · links · graph     │
                 │ layout IR · themes · capture · watch      │
                 └───────┬──────────────┬───────────────────┘
                         ▼              ▼
                    src/tui         src/cli
                    OpenTUI         agents,
                    reader          scripts
```

The core's design had a third face, `slipbox lsp`, serving notes to editors; it was removed once links became plain
paths (D8, D67).

`src/main.ts` picks a face. A known subcommand runs the CLI. Anything else opens the TUI, but only
when stdin and stdout are terminals (`9.3`). The TUI is loaded with a dynamic `import()`, so a
CLI call never loads OpenTUI's native renderer.

Every user action is a named command (D11). `core/commands/*.ts` (by area, listed by `core/command-specs.ts`) give
each command id the CLI invocation that reaches the same state change, or mark it an interaction; the TUI implements
each one (`tui/actions.ts` and the `tui/actions-*.ts` of its area) in the `CommandRegistry` (`core/commands.ts`), and
keys, the palette and the `:` prompt run them by id. A command implemented without a spec, or specified without an
implementation, fails at start-up and fails a test ([tui.md](tui.md) § Parity with the CLI).

### The boundary is enforced, not hoped for

`scripts/check-boundary.ts` (`0.3`, D8) fails the build when:

| Directory | May not import |
| --- | --- |
| `src/core/` | `src/tui/`, `src/cli/`, `@opentui/*` |
| `src/cli/` | `src/tui/`, `@opentui/*` |

It runs in CI (`.github/workflows/ci.yml`) and in `bun run check`, as does `scripts/check-deps.ts`, the supply chain's
gates (`14.10`, [distribution.md](distribution.md) § The supply chain).

### Only the final draw step touches OpenTUI

Inside the TUI, the same rule applies one level down. `src/tui/app.ts` (the model, its features each a
controller of its own) and `src/tui/draw.ts` (painting, its regions in `draw-*.ts`) talk to an abstract
`Canvas` and `Host`. Only two files import OpenTUI:

| File | What it does with OpenTUI |
| --- | --- |
| `src/tui/opentui.ts` | `Canvas` over `OptimizedBuffer`; the full-screen `Renderable` |
| `src/tui/run.ts` | `createCliRenderer`, key, paste and mouse events, resize, OSC 52, shutdown |

What comes before the screen is taken is `run.ts`'s `prepare`, which needs no terminal (a test calls it):
the vault found, its config, the vault recorded as seen, and the graph. Recording comes before the graph
opens, so a named folder moved here by hand has its cache adopted first (`21.8`, [roots.md](roots.md) § State by
vault). The App is told what that found, and doesn't record the vault a second time, which would find nothing moved.

Shutdown saves positions and the session whatever ends the process: `ctrl+q`, or `SIGTERM`, `SIGHUP`,
`SIGINT`, `SIGQUIT` or `SIGPIPE`.

Everything else is testable headlessly with `TextCanvas` (see [testing.md](testing.md)).

## The CLI and the TUI: disk is the contract

A CLI call is a second process with a graph of its own. It reads the files, and the persisted cache when it is fresh
(the link index, `1.9`), never a TUI's unsaved buffers; it writes atomically and returns. The TUI takes a CLI write
as it takes any other program's: it reloads the note, or raises the conflict prompt when the note has unsaved
changes. The CLI never raises the prompt and never refuses a write because a note is open (D17). Concurrent CLI
writes are last-writer-wins and never torn; `--if-unchanged` refuses one when the note changed since it was read
(`9.10`).

Two things keep the CLI's view honest. Hand-offs save first: a capture into an open scratch, the context bundle and
handing a note to an editor write unsaved changes before the other side reads ([tui.md](tui.md) § Editing). And the
TUI lists the notes it holds unsaved in `dirty/<pid>.json` in the vault's state (`core/stale.ts`, `9.9`), which every
CLI call reads, ignoring the files of dead pids, and reports as a warning or a `stale` array: advisory, never a lock
([cli.md](../../docs/manual/cli.md) § Unsaved changes in a running slipbox).

## The parts

A file opened belongs to a vault, which the walk lists; its notes are parsed into the graph, their links resolved;
a note is laid out and drawn; and around that, search, editing, language servers, export and the rest. Each part, in
that order:

- **Vaults** ([roots.md](roots.md)): a file's vault is the nearest folder above it holding a vault marker (`.git`,
  `.slipbox/`, `.obsidian/`, `.zk/`), else home (`~`, a vault without one), else Elsewhere, which has no index (D69,
  VV-D1–VV-D4). The vault says what is indexed and searched first, what a leading `/` means, which link convention is
  followed, its settings, and where its state is kept. Nothing is written into a folder by opening it (D58). One walk
  lists its files for the index and the watcher alike (D40). A link out of the vault or home is followed only when you
  say so (VV-D6). Code: `core/vault.ts`, `core/home.ts`, `core/walk.ts`, `core/symlinks.ts`, `core/registry.ts`,
  `core/folders.ts`.
- **Links** ([links.md](links.md)): every link, whatever its written form, is read as a file and a fragment; each
  tool's forms are read and written at the edges (D68). The graph (`core/graph.ts`) holds the notes, their links and
  backlinks, parsed lazily; renames, repairs, plans and the merge review work on paths.
- **Search** ([search.md](search.md)): a vault's files ranked by words, in the core so the CLI and the TUI share it:
  an SQLite FTS5 index in the vault's cache, else a scan (D114); `find` beside it, unranked (D119).
- **Rendering** ([rendering.md](rendering.md)): a note's markdown tree laid out as rows for a width: blocks, tables,
  wrapping, themes, glyphs; pure, so the CLI's `render` and the TUI draw the same (§ Data flow for one note).
- **The TUI** ([tui.md](tui.md)): the reader and the editor: panes, buffers and tabs, the explorer and its view, the
  peek, source mode and the lens, saving, autosave and the conflict prompt, external changes, git: the git panel, diffs,
  the review, the merge screen; files beyond notes too. Its keys are the user's reference,
  [keys.md](../../docs/manual/keys.md).
- **Code as a notebook** ([code-view.md](code-view.md)): a source file rendered as a document, a cell per
  definition, its comments as prose, its tokens verbatim (D125).
- **Document types** ([document-types.md](document-types.md)): notes of a kind, known by where they are: their
  frontmatter's rules, their order, their status (D133).
- **Language servers** ([lsp.md](lsp.md)): slipbox is a client of the language servers and linters of the code it
  opens; their problems are the file's, beside its own (D161, D163, D167).
- **Trust** ([trust.md](trust.md)): nothing of a folder's own runs unless you trust its vault (D172), and no link out
  of a vault is read unless you follow it (VV-D6).
- **Export** ([export.md](export.md)): notes as one document, in Word, PDF, a web page, an e-book or Markdown, every
  format written by slipbox itself (D184).
- **Distribution** ([distribution.md](distribution.md)): folders per platform, the supply chain's gates, releases and
  previews, installing, channels, updates and the notices a release ships; the skill for agents in the binary.
- **Testing** ([testing.md](testing.md)): the headless tests, the terminal tests in a herdr pane, the fixture and demo
  vaults and the reference set.

The CLI's commands are the user's reference, [cli.md](../../docs/manual/cli.md); every setting is
[configuration.md](../../docs/manual/configuration.md).

## Module map

| Module | Steps | Role |
| --- | --- | --- |
| `core/width.ts` | 0.7 | the one width function: graphemes, East Asian width, emoji |
| `core/fsutil.ts` | 4.6, 7.5 | atomic writes keeping the mode; `writeNote` (never out of the vault); reads |
| `core/sanitize.ts` | 2.9 | strips terminal escapes on the way into layout |
| `core/paths.ts` | 0.10, 21.8 | config, cache and state directories; a vault's key, by its path |
| `core/config.ts` | 0.9, 20.7 | TOML: defaults ← yours ← each enclosing vault's ← its own; warnings, never crashes |
| `core/vault.ts` | 1.1, 1.10, 0.12, 17.1, 20.3, 21.8 | a file's vault, home or Elsewhere; recorded; state moved |
| `core/home.ts` | VV-D2 | home's walk, made in slices and kept (`walk.json`); its graph built from it; the cap |
| `core/mounts.ts` | VV-D2 | the mount table, read without touching a mount: home's walk never goes into another disk |
| `core/symlinks.ts` | VV-D6 | links followed only when you say so: the answers, a link's scope, writes, the probe |
| `core/registry.ts` | 17.3–17.6, 21.8 | `[vault]` identity; the machine's vaults by path (`roots.json`) |
| `core/remotes.ts` | 21.6 | a repository's remotes as `host/path`: what names it, what hosting URLs are its |
| `core/parsecache.ts` | 20.11 | notes' parsed content by content hash, shared by every copy on the machine |
| `core/names.ts` | 21.9 | a vault as it's told: its name, else its path (`~/…`); `name@branch`; `~`, `Elsewhere` |
| `core/git.ts` | 17.19 | a vault's git checkout, from `.git`: the main one or a worktree, the branch |
| `core/gitops.ts` | 5.11–5.14, 23.6 | git run for what `.git` can't say cheaply: status, changes, a file at a commit |
| `core/mergereview.ts` | 20.21 | before a merge: the links `git merge-tree`'s result would break, each cause and fix |
| `core/reach.ts` | 17.9–17.11 | other vaults: paths out of the vault, their backlinks here, a peek's graph; `[[x:…]]` |
| `core/redirects.ts` | 17.12 | moves seen, by content hash; where an old path went |
| `core/rename.ts` | 7.1–7.3, 17.15, 20.19 | renames and moves: each link rewritten as byte-range edits, previewed |
| `core/rename-plan.ts` | 7.2, 7.3 | a plan's shape; its edits collected, each file read once; git trees with changes |
| `core/rename-links.ts` | 7.6, 17.15 | one link rewritten in the form it was written, at the place the index recorded |
| `core/rename-vaults.ts` | 18.11, 21.10 | a folder named, made a vault of its own, or part of its vault again: plans |
| `core/rename-apply.ts` | 7.1–7.4 | a plan carried out, its files unchanged since, the index following; undone |
| `core/rename-heading.ts` | 11.9 | a heading renamed, with every link to it |
| `core/plans.ts` | 20.18 | edits as plans: saved, tied to file contents, refused once stale, applied once |
| `core/convert.ts` | 20.1 | the converter: `[[…]]` and `/…` links made relative paths, by their own old rules |
| `core/rename-log.ts` | 7.4 | each rename's files and moves, as it found them: what an undo gives back |
| `core/files.ts` | 18.4, 18.5, 18.11 | delete to the vault's trash and restore; copy; an unmade vault's `.slipbox/` |
| `core/walk.ts` | 1.2, 0.11 | the walk and `WalkFilter`, shared with the watcher |
| `core/wikilink.ts` | 1.3 | micromark tokenizer for `[[link]]` and `![[embed]]` |
| `core/footnotes.ts` | 3.17 | a note's footnotes: labels, definitions, references, in GFM's order |
| `core/tags.ts` | 1.6 | micromark tokenizer for `#tag`; tag names and keys (the graph's tag index) |
| `core/parse.ts` | 1.3 | remark + gfm + frontmatter + wikilinks; headings, slugs |
| `core/obsidian.ts` | DF-D17 | Obsidian's `==highlight==` and `%%comment%%`, read into the tree; a block comment too |
| `core/parse-pool.ts` | 15.1 | a big note's chunks parsed on up to four workers (`parse-worker.ts`), into its cache |
| `core/workers.ts` | 15.1, 25.6 | where a worker's script is, from the source or in the compiled binary (D232) |
| `core/links.ts` | 1.4 | `LinkIndex`: case policy, collisions, markdown URLs |
| `core/search.ts` | 6.x | search: the query, a file read for it, the index kept, the index or a scan, hits located |
| `core/search-index.ts` | 6.6 | the search index: SQLite FTS5 in the cache, a row per file, BM25 |
| `core/scope.ts` | 20.16, 21.10 | search by vault: `here`, then linked vaults, then every vault known (`--scope`) |
| `core/autoindex.ts` | 20.9 | the background auto-index: home walked in slices and indexed, then the vaults in it |
| `core/sqlite.ts` | 6.6 | the runtime's SQLite (`node:sqlite`): the few calls the index and the parse cache make |
| `core/trust.ts` | 23.x | the vaults whose own code may run: your answers (`trust.json`), your `[trust] roots` |
| `core/graph.ts` | 1.5–1.9, 6.7, 11.8 | notes, links, backlinks, lazy parsing, the index; change feed; unsaved text |
| `core/graph-types.ts` | 1.5–1.7 | a note's entry, a link as written and resolved, a backlink, a problem; how sure |
| `core/graph-extract.ts` | 1.5, 1.6, 20.11 | a note's entry from its text: title, headings, links, tags, names |
| `core/graph-resolve.ts` | 20.2, 21.2–21.7 | `LinkResolver`: by path, name, alias, pointer, hosting URL; moves |
| `core/readers.ts` | 16.2 | a reader per note format: its parse into mdast, headings and links off raw lines |
| `core/filetypes.ts` | 16.1 | a file's group (note, data, text, binary) and format, by extension |
| `core/doctypes.ts` | 22.2, 22.3 | document types: notes of a kind by where they are; their rules, order, status |
| `core/convention.ts` | 21.4 | a vault's links' convention: your setting, its tool's, its notes', ours |
| `core/write-link.ts` | 21.5 | a link as slipbox writes one: completion, the link picker, `slipbox link` |
| `core/folders.ts` | 21.6 | named folders: by `.slipbox/` name, else remote; copies, the default; the lookup |
| `core/pointer.ts` | 21.7 | `slipbox://` pointers: parsed, resolved (a branch: its worktree, or from git), written |
| `core/hosting.ts` | — | a repository's hosting URLs (GitHub, GitLab, Bitbucket) read as its files |
| `core/data.ts` | 16.11–16.15 | data files (TOML, INI, YAML, JSON, CSV) read into a document tree; their links |
| `core/lazy.ts` | 16.6 | modules and assets loaded on first use: asked synchronously, heard when ready |
| `core/diagrams.ts` | 12.10 | Mermaid drawn in box drawing (loaded on first use), or why it's its code |
| `core/math.ts` | 12.11 | maths as Unicode text: a formula, a display's rows (aligned, cases, matrices) |
| `core/svg.ts` | 12.15 | SVG rasterised (resvg, on first use), a machine's font for words; CSS variables resolved |
| `core/typeset.ts` | 12.17 | a display's maths typeset as an SVG (MathJax, loaded on first use) |
| `core/imagecache.ts` | 12.12 | where a picture on the web is kept once fetched: a file per address |
| `core/export/assemble.ts` | 10.1 | notes as one document: chapters, embeds drawn in, links inside it, pictures found |
| `core/export/mark.ts` | 10.3, DF-D25 | the mark a Markdown export carries, read without loading the writers |
| `core/export/docx.ts` | 10.4 | the document as Word's `.docx` (`docx`, loaded when exporting) |
| `core/export/pdf.ts` | 10.5, 10.11 | the document as a PDF: lines laid out here, set by pdfkit; a font a character |
| `core/export/fonts.ts` | 10.5 | a PDF's fonts, found in the machine's font folders: sans, mono, fallbacks |
| `core/export/hast.ts` | 10.2, 10.6 | a chapter as HTML's tree: ids, pictures where kept, maths, code, footnotes |
| `core/export/html.ts` | 10.2 | the document as one HTML file, its pictures inside it |
| `core/export/epub.ts` | 10.6 | the document as an EPUB 3 (fflate): XHTML chapters, contents, pictures |
| `core/export/markdown.ts` | 10.3 | the document as portable Markdown, its pictures copied beside it |
| `core/export/images.ts` | 10.x | a picture's kind and size from its header; an SVG rasterised; its size as shown |
| `core/export/convert.ts` | 10.10 | a picture a format doesn't hold made PNG first: BMP, GIF, WebP decoded |
| `core/export/style.ts` | 10.x | the look on paper: print's colours, callouts', code's; the stylesheet |
| `core/export/index.ts` | 10.x | the formats by name, where an export goes, writing it ([export.md](export.md)) |
| `tui/placeholders.ts` | 12.7 | Kitty's Unicode placeholders: a picture's id, its cells as text, sent once, let go |
| `core/syntax.ts` | 16.7–16.9, 16.18–16.22 | tree-sitter: spans, outline, errors, comments; parts in other languages |
| `core/docformats.ts` | 24.4 | a doc comment read into one shape, whatever wrote it: JSDoc, Google, NumPy, Sphinx |
| `core/landing.ts` | 11.3 | where a link lands in its note — a heading, a block's `^id`, `L42` — and its text there |
| `core/note.ts` | 2.x, 1.11 | a note rendered for a pane: parse, resolve links, embeds' notes, lay out (CLI and TUI) |
| `core/layout/*` | 2.1–2.8 | mdast → layout IR; tables; wrap; highlighting; ANSI |
| `core/layout/source.ts` | 4.13 | the markdown as a layout, with each cell's source offset |
| `core/layout/live.ts` | 4.14 | a note's blocks; the lens composed into the render |
| `core/tasks.ts` | 4.11 | a task's checkbox toggled as a one-byte edit |
| `core/words.ts` | — | word counts for the status line and note info: Han and kana by character |
| `core/editor.ts` | 4.1, 4.2, 4.12 | hand-off templates to argv, never through a shell |
| `core/indent.ts` | 25.1 | a file's indentation: `.editorconfig`, else its lines, else its language; save rules |
| `core/comments.ts` | 25.2 | each language's comment markers; lines commented or uncommented, as vim-commentary does |
| `core/brackets.ts` | 25.3 | the bracket matching one (`%`, the marks); pairs closed as typed, stepped over, deleted |
| `core/nvim.ts` | 4.12 | finding and asking the running nvims |
| `core/replace.ts` | 4.16 | find's patterns (plain, regex, whole words), replacements, vim's `:s` parsed |
| `core/replace-files.ts` | 25.4 | a find replaced across files, as a rename's plan: previewed, undone |
| `core/gitlog.ts` | 26.4, 22.1 | a line's last commit (blame of the last commit); a file's log through renames |
| `core/gitstage.ts` | 26.2 | status's two letters; a file or one change staged, unstaged, discarded |
| `core/gitsigns.ts` | 26.1 | a file's changes against what's staged: runs of lines added, changed, deleted; signs |
| `core/shell.ts` | 25.7 | a `:!` line parsed; a command run by your shell, its output kept; stopped with its children |
| `core/snippet.ts` | 25.8 | a server's snippet expanded: its text, its stops and their mirrors, `$0` last |
| `core/spell.ts` | 25.6 | a note's prose word by word; Hunspell dictionaries: slipbox's, yours, the system's |
| `core/spell-thread.ts` | 25.6 | the spell checker's thread (`spell-worker.ts`, D232): its dictionaries, its answers |
| `core/hunspell.ts` | 25.6 | Hunspell as WebAssembly: a dictionary built; loaded by the spell checker's thread alone |
| `core/myers.ts` | 5.5, GIT-D2 | the line diff every diff is: Myers' in linear space, as git's, its cost capped |
| `core/merge.ts` | 5.5, GIT-D2 | changed words in paired lines, three-way merge, a diff's rows; what a diff compares |
| `core/blockdiff.ts` | GIT-D2 | a note's diff before and after: the line diff widened to the blocks it touches |
| `core/conflicts.ts` | GIT-D5 | a file in conflict for the merge screen: markers, the index's stages, the result |
| `core/gitreview.ts` | GIT-D3 | the review's hunk shown, found again, a note's scratch entry, the end's tally |
| `core/gitremote.ts` | 26.6, GIT-D4 | fetch, pull, push, stash, without a terminal; a pull merged or rebased |
| `core/gitrebase.ts` | GIT-D6, D247 | a rebase onto the base, over files changed; what's under way, from git's files |
| `core/gitbranches.ts` | GIT-D9, GIT-D13 | the branches, where each is checked out; worktrees made, removed |
| `core/gitbase.ts` | GIT-D10 | each branch's own base: kept (`bases.json`), else the nearest of `[git] bases` |
| `core/gitrepos.ts` | VV-D10 | the repositories under a folder, each checkout grouped with its own, their state |
| `core/layout/diff.ts` | GIT-D2 | a diff's rows: signs, highlighting, changed words, heads and folds, sideways scroll |
| `core/layout/blockdiff.ts` | GIT-D2 | before and after laid out: frames, light formatting, the marked words |
| `core/layout/splitdiff.ts` | GIT-D7 | a code file's diff side by side, the two sides scrolling together |
| `core/layout/screen.ts` | GIT-D3, GIT-D5 | a screen of text rows and diffs: the review's, the merge screen's |
| `core/theme/*` | 2.6 | semantic roles, built-in themes, base16 loader |
| `core/glyphs.ts` | 2.8 | Nerd, Unicode and ASCII glyph sets |
| `core/commands.ts` | 0.8 | `CommandRegistry` and `Keymap` |
| `core/command-specs.ts` | 0.8, parity | the `CommandSpec` type and `COMMAND_SPECS`, built from `core/commands/*.ts` |
| `core/commands/*.ts` | 0.8, parity, D235 | every command id with its CLI equivalent, by area |
| `core/position.ts` | 3.4, 3.5, 3.15 | anchors, reading positions, session file |
| `core/watch.ts` | 5.1, 5.2 | per-directory watcher, debounce, polling fallbacks |
| `core/vault-feed.ts` | 5.1, 5.9, 5.10 | the watcher's news into a graph, held while git writes (TUI) |
| `core/capture.ts` | 8.2–8.4 | scratch location, reference format, append |
| `core/context.ts` | 9.7 | the context bundle: a note, its links and backlinks, as one document for an agent |
| `core/lint.ts` | 3.21 | the lint surface: your markdownlint-cli2 run, its findings read |
| `core/servers/languages.ts` | 19.2 | languages and their servers, built in and in Helix's shape from the config |
| `core/servers/find.ts` | 19.3, 19.4 | a file's project root; where a server's program is; which servers serve a file |
| `core/servers/install.ts` | 19.5, 14.11 | npm servers installed from slipbox's locks, a folder each, scripts off |
| `core/servers/locks.ts` | 14.11 | those locks, made by `scripts/lock-servers.ts` |
| `core/servers/manager.ts` | 19.1 | the servers of open files: one per server and project, installed, restarted |
| `core/servers/doctor.ts` | 19.7 | each language's servers and where each is; a file's, in its project |
| `core/servers/client.ts` | 19.1 | a language server as slipbox's client: started, files synced, diagnostics, stopped |
| `core/servers/linters.ts` | 19.19 | linters with no language server, in efm-langserver's keys, via the lint surface |
| `core/servers/vscode.ts` | 19.20 | a project's `.vscode/settings.json` answering its servers' settings |
| `core/diagnostics.ts` | 19.8, 11.5 | a file's problems from every source, one shape: links, conflicts, syntax, lint |
| `core/clipboard.ts` | 8.5 | OSC 52 (up to 100 KB of base64), then pbcopy / clip.exe / wl-copy / xclip, then a file |
| `core/release.ts` | 14.2 | what a release build was told when built; how a preview is named; the Pages site |
| `core/install.ts` | 14.8 | the installer's layout read; how slipbox was installed; its channel; `uninstall`'s plan |
| `core/update.ts` | 14.4 | the newest the channel offers, from its sums; the daily check; `upgrade` |
| `core/skill.ts` | GR-D10 | the skill for agents, built in: printed; installed, never over another's file or a link |
| `core/wsl.ts` | 14.12 | WSL known; Windows' drives from its mounts; their fonts; notes on one, said |
| `core/stale.ts` | 9.9 | advisory list of unsaved paths, pid-stamped: the TUI writes it, the CLI reads it |
| `cli/cli.ts` | 9.1–9.6 | the CLI face: the dispatcher, the help, each command's arguments and flags; `--json` |
| `cli/common.ts` | 9.2, 9.4, 9.10 | the session; errors, exit codes; a note named, resolved; a note read and written |
| `cli/render.ts` | 2.x, 10.x | `render`, `export` |
| `cli/reading.ts` | 9.5, 25.6 | `outline`, `read`, `ls`, `find`, `spell` |
| `cli/writing.ts` | 9.4, 9.10, 25.4 | `write`, `task`, `replace`, `footnotes`, `mkdir` |
| `cli/links.ts` | 9.5, 21.5 | `link`, `resolve`, `links`, `backlinks`, `problems`, `tags` |
| `cli/files.ts` | 7.x, 18.x | `mv`, `cp`, `rm`, `trash`, `rename-heading`, `relink`, `convert-links`, `undo`, `apply` |
| `cli/vaults.ts` | 18.11, 21.6, 21.10 | `init`, `deinit`, `name`, `folders` |
| `cli/git.ts` | 5.11–5.14, 20.21 | `changed`, `merge-review`, `diff`, `worktrees` |
| `cli/search.ts` | 6.x, 20.9, 20.10 | `search`, `index` |
| `cli/info.ts` | 22.3 | `info`, `stat`, `types`, `themes`, `history`, `commands` |
| `cli/servers.ts` | 19.7, 19.22 | `doctor`, `diagnostics` |
| `cli/agents.ts` | 4.12, 8.2–8.4, 9.7 | `context`, `capture`, `scratch`, `send` |
| `cli/install.ts` | 14.4, 14.8, GR-D10 | `upgrade`, `channel`, `uninstall`, `skill` |
| `cli/args.ts` | 9.1 | flag parsing: flags anywhere, `--x=v` or `--x v`, `--` ends flags |
| `version.ts` | — | the version, one source |
| `tui/*` | 3.x, 5.3–5.7 | the app: reading, panes, saving and conflicts |
| `tui/app.ts` | D235 | the model: the state every part shares and the wiring; a controller per feature (`app.git`) |
| `tui/actions*.ts` | 0.8 | the commands' implementations, by area, registered by `registerActions` |
| `tui/draw*.ts` | 3.1, 3.2 | painting: the frame, then each region (windows, panels, status line, overlays) |
| `tui/buffer.ts` | 4.5–4.8 | a note's text, its undo steps, unsaved state, BOM and line endings |
| `tui/editing.ts` | 4.3 | the cursor as a text offset; insert mode |
| `tui/vim.ts` | 4.4 | counts, operators and text objects, the register, `.` |
| `tui/replacing.ts` | 4.16 | the replace row, `:s` and its confirm, `gn`'s matches |
| `tui/githistory.ts` | 26.4, 22.1 | blame and a file's history: a version read, its diff to now |
| `tui/gitview.ts` | 26.2, GIT-D8 | the git panel's working tree: its sections, a file's changes, what its keys run |
| `tui/gitpanel.ts` | GIT-D8, GIT-D12 | the git panel: its top, buttons, rows, keys and footer; `space g` |
| `tui/gitbranchview.ts` | GIT-D9, GIT-D10 | the git panel's branches: worktrees, bases; made, removed, merged |
| `tui/gitreposview.ts` | VV-D10, GIT-D11 | the git panel's repositories in the view, ordered by what needs attention |
| `tui/gitmouse.ts` | GIT-D8 | the git panel by mouse; the status line's branch; a change's sign in the gutter |
| `tui/diffview.ts` | GIT-D2, GIT-D7 | the diff window: blocks or lines, side by side; `tab`, `enter`, `esc` |
| `tui/review.ts` | GIT-D3 | the review: a hunk at a time, kept, reverted, noted; its keys |
| `tui/mergescreen.ts` | GIT-D5 | the merge screen: a card a conflict, the result, saved and staged; its keys |
| `tui/gitremote.ts` | 26.6, GIT-D4 | fetch, pull, push and stash from the TUI, in the background, one at a time |
| `tui/rebase.ts` | GIT-D6, D247 | a diverged pull asked about, a rebase onto the base and its stash; what's under way |
| `tui/explorer.ts` | 3.7, VV-D5 | the explorer: one tree and its view, the breadcrumb, zooming; rows, keys, menu |
| `tui/explorer-disk.ts` | VV-D8 | the explorer's rows the walk doesn't give: what it leaves out or hasn't reached |
| `tui/marks.ts` | VV-D9, D244 | a row's marks: the index's state, what describes the row; why it isn't indexed |
| `tui/peek.ts` | VV-D7 | the peek: another vault's file read in place; `o`, `t`, `z`; its backlinks |
| `tui/following.ts` | VV-D6 | the question a link not followed asks; follow, just look, no; the probe |
| `tui/gitchanges.ts` | 26.1 | `] c`, `[ c` to a change against what's staged; its preview; one undone |
| `tui/shellrun.ts` | 25.7 | `:!cmd`'s output window, `:{range}!cmd`'s lines replaced, one command at a time |
| `tui/snippets.ts` | 25.8 | a snippet's stops while typing: `tab` through them, placeholders replaced, mirrors |
| `tui/spelling.ts` | 25.6 | misspelt words where a window shows them: the marks, `] s`, `z =`, `z g` |
| `tui/completion.ts` | 19.16, 20.13, 25.5 | completion as typed: a server's items, links' targets, open files' words |
| `tui/saveas.ts` | 10.14 | the Save As window an export opens: places, the folder's entries, the name; its keys |

## Data flow for one note

```text
file bytes ──readText──▶ text (BOM noted, invalid UTF-8 → U+FFFD)
          ──parseMarkdown──▶ mdast with positions + frontmatter
          ──renderTree(width, glyphs, resolveLink)──▶ Layout { lines, links, headings }
          ──▶ tui/draw.ts through Canvas          (TUI)
          ──▶ layout/ansi.ts to a string          (slipbox render)
```

Link statuses (resolved, unresolved, ambiguous) are decided during layout by a resolver function
injected from the graph, so the layout stays pure and knows nothing about the vault.

## Dependencies

Runtime dependencies, all pure JavaScript (or WebAssembly) except OpenTUI (native, prebuilt for each platform in the
package — no build toolchain). SQLite is the runtime's own, `node:sqlite` (D196; [distribution.md](distribution.md)
§ SQLite):

| Package | Used for |
| --- | --- |
| `@opentui/core` **0.5.12, pinned exactly** | the TUI renderer and input |
| `unified`, `remark-parse`, `remark-gfm`, `remark-frontmatter` | parsing, with source positions |
| `mdast-util-to-string` | heading text fallback |
| `highlight.js` | code-fence highlighting, in the core so CLI and TUI match |
| `get-east-asian-width` | the width function |
| `ignore` | gitignore semantics for the walk |
| `smol-toml`, `yaml` | config; frontmatter and base16 schemes |
| `vscode-languageserver-protocol`, `-textdocument` | the client's protocol (19.x), a file's text as a server has it |
| `web-tree-sitter` 0.25 and a grammar package per language (`tree-sitter-*`) | source files' structure (16.7, 16.18) |
| `beautiful-mermaid` **1.1.3, pinned exactly** (with `elkjs`, EPL-2.0) | Mermaid drawn in characters (12.10) |
| `remark-math` 6.0.0 | `$…$` and `$$` blocks read (12.11); KaTeX comes with it, never imported |
| `unicodeit` 0.7.5 | LaTeX's symbols as Unicode (12.11); its table is the LaTeX Project Public License's too |
| `@resvg/resvg-wasm` 2.6.2 | SVG rasterised (12.15), as WebAssembly: no native build; MPL-2.0 |
| `mathjax-full` 3.2.2 | a display's maths typeset as a picture (12.17); Apache-2.0 |
| `docx` 9.9.0 | Word export (10.4); MIT, its zip (JSZip) MIT or GPLv3, taken under MIT |
| `pdfkit` 0.20.2, `fontkit` 2.0.4 | PDF export (10.5): the layout, the fonts read and embedded; MIT |
| `fflate` 0.8.3 | the EPUB's zip (10.6); MIT |
| `linebreak` 1.1.0 | where a PDF's line may break (10.11): Unicode's UAX #14; MIT |
| `@jsquash/webp` 1.5.0 | a WebP decoded for an export (10.10): libwebp as WebAssembly; Apache-2.0, libwebp BSD-3 |
| `mdast-util-to-hast` 13.2.1, `hast-util-to-html` 9.0.5 | HTML and EPUB export (10.2, 10.6): markdown's tree as HTML |
| `mdast-util-to-markdown` 2.2.0, `-gfm` 3.1.0, `-math` 3.0.0 | Markdown export (10.3): the tree written again |
| `hunspell-asm` 4.0.2 | spelling (25.6): Hunspell as WebAssembly; MIT, Hunspell taken under MPL-1.1 |
| `dictionary-en` 4.0.0, `dictionary-tr` 2.0.0 | the dictionaries shipped (25.6): MIT and BSD (SCOWL); MIT |

The grammars npm ships no WebAssembly for — Swift, SCSS, Vue, Astro, Dockerfile — are built from their sources at
pinned commits into `grammars/` by `scripts/build-grammars.ts`, committed with their licences (`grammars/README.md`;
D121).

Dev only: `vscode-languageserver` 10.1.2, for the tests' fake language server (`tests/fixtures/fake-lsp.ts`); the
server's half of the protocol library left the runtime with the LSP face (D170, D67). `@biomejs/biome` 2.5.15 formats
and lints the code (GR-D7), and `markdownlint-cli2` 0.23.3 lints the repository's Markdown, at the version slipbox
installs for notes ([repository.md](repository.md) § The check).

Licences: permissive, but for three weak-copyleft libraries accepted for use: `elkjs` (EPL-2.0), resvg (MPL-2.0)
and Hunspell (MPL-1.1, in `hunspell-asm`) (D192, D194). What a distributed binary owes them:
[distribution.md](distribution.md) § Notices.

No external binary is required (D3). The clipboard tools are used when present and never needed.

### OpenTUI upgrade policy (`0.6`)

OpenTUI is pre-1.0 and moves fast, so it is pinned to an exact version in `package.json`
(`"0.5.12"`, no caret; D6). To upgrade:

1. Read the changelog from the pinned version to the target.
2. Bump the pin, run `bun run check`. The `OpenTUI end to end` test in `tests/tui.test.ts`
   exercises the adapter through OpenTUI's own test renderer.
3. Launch the TUI and check what the adapter uses: `drawText` and `fillRect` output, key names
   (`keyName` in `tui/keys.ts`), paste, mouse and resize events, `widthMethod` (a wcwidth
   terminal's rows must not drift), `suspend`/`resume` (the `$EDITOR` hand-off),
   `setTerminalTitle`, `setBackgroundColor`, `useMouse`, `copyToClipboardOSC52`, and `destroy`. And pictures:
   `NativeImage` (decode, `resize`, `raw`), `drawImage` for sixel, and the **private** `writeOut` that sends Kitty
   placeholders' pictures in step with the frames (12.7) — still there, still ordered with the frame's output.
4. Only `tui/opentui.ts` and `tui/run.ts` should need changes. If anything else does, the
   boundary has leaked; fix that first.

## Storage

Nothing derived or personal is ever written into a vault, and nothing at all by opening it (D39, D58, D76). An export
(`10.x`) is asked for, not derived: it goes where it's told, beside its note by default (D185). Config, cache, state
and data each have a folder of their own, and a vault's cache and state are kept under its key
([roots.md](roots.md) § State by vault):

| What | Where |
| --- | --- |
| user config | `$XDG_CONFIG_HOME/slipbox/config.toml` (or `--config`, `$SLIPBOX_CONFIG`) |
| a vault's config and identity | `<vault>/.slipbox/config.toml` (`[vault]`: `id`, `name`…), plus `.slipbox/version` |
| the machine's vaults (`21.8`) | `$XDG_STATE_HOME/slipbox/roots.json` (by path; moves kept; never Elsewhere) |
| the vaults you trust, or kept safe (`23.x`) | `$XDG_STATE_HOME/slipbox/trust.json` (your answers, by path) |
| the links you followed, or not (VV-D6) | `$XDG_STATE_HOME/slipbox/links.json` (by link and target) |
| each branch's base (GIT-D10) | `$XDG_STATE_HOME/slipbox/bases.json` (by repository, kept by From or Compare) |
| named folders (`21.6`) | `$XDG_STATE_HOME/slipbox/folders.json` (names, copies, defaults) |
| user themes | `$XDG_CONFIG_HOME/slipbox/themes/*.yaml` (base16 / base24) |
| link index | `$XDG_CACHE_HOME/slipbox/<key>/index.json` |
| search index (`6.6`) | `$XDG_CACHE_HOME/slipbox/<key>/search.db` (SQLite FTS5, WAL) |
| home's walk (VV-D2) | `$XDG_CACHE_HOME/slipbox/<home's key>/walk.json` (made in slices, kept; its cap) |
| parse cache, shared (`20.11`) | `$XDG_CACHE_HOME/slipbox/parsed.db` (by content) |
| pictures (`12.12`, `12.15`) | `$XDG_CACHE_HOME/slipbox/images/` (a file per web address; SVGs as drawn, by width) |
| reading positions (`21.8`) | `$XDG_STATE_HOME/slipbox/positions.json` (by file, the machine's) |
| session | `$XDG_STATE_HOME/slipbox/<key>/session.json` |
| where an export went last (`10.14`) | `$XDG_STATE_HOME/slipbox/<key>/export.json` |
| branch heads seen (`20.21`) | `$XDG_STATE_HOME/slipbox/<key>/heads.json` (each branch's last commit) |
| clipboard fallback (no OSC 52 or clipboard tool) | `$XDG_STATE_HOME/slipbox/<key>/clipboard.txt` |
| scratch | `$XDG_STATE_HOME/slipbox/<key>/scratch.md`, or in the vault by config |
| staleness | `$XDG_STATE_HOME/slipbox/<key>/dirty/<pid>.json` |
| redirects (moves seen: `17.12`) | `$XDG_STATE_HOME/slipbox/<key>/redirects.json` |
| renames, to undo (`7.4`) | `$XDG_STATE_HOME/slipbox/<key>/renames.json` (the last 20) |
| the trash (`18.4`) | `$XDG_STATE_HOME/slipbox/<key>/trash/` (`trash.json`, an item per folder; kept 30 days: DF-D14) |
| the background index (`20.9`) | `$XDG_STATE_HOME/slipbox/autoindex.json` (its place), `activity` (CLI last used) |
| saved plans (`20.18`, `--plan`) | `$XDG_STATE_HOME/slipbox/plans/<id>.json` (for `slipbox apply`; gone once applied) |
| the update check (`14.4`) | `$XDG_STATE_HOME/slipbox/update.json` (when it last asked, what it found) |
| language servers installed (`19.5`, `14.11`) | `$XDG_DATA_HOME/slipbox/tools/<package>/<lock>/` (each from its lock) |
| your own words, spelling's (`25.6`) | `$XDG_DATA_HOME/slipbox/spell/words.txt` |
| the cache's tag (`14.9`) | `$XDG_CACHE_HOME/slipbox/CACHEDIR.TAG`: backup tools skip the cache |

The four folders are XDG's, their defaults (`~/.config`, `~/.cache`, `~/.local/state`, `~/.local/share`) when the
variables are unset, on macOS too; on Windows, `%APPDATA%\slipbox` and `%LOCALAPPDATA%\slipbox\cache`, `\state` and
`\data`. An `XDG_*` that is set, absolute, is taken on every platform (`core/paths.ts`, `storeDir`; D200;
[distribution.md](distribution.md) § Folders).

`<key>` is the vault's path, home's too: `<basename>-<sha256(realpath)[:12]>`; Elsewhere's is `elsewhere` (`21.8`;
[roots.md](roots.md) § Storage keys). What is kept by vault and what by file, how a moved folder's state follows it,
and when a vault's identity is written: [roots.md](roots.md) § State by vault and § `.slipbox/`. The parse cache,
shared by every copy on the machine: [roots.md](roots.md) § The index.

The scratch is in the state folder by default, so it is never committed by accident; `slipbox scratch path` and
`show` keep it visible to agents. `capture.location = "root"` (`"vault"`, the old word, read as it; DF-D22) puts it at
`<vault>/<capture.file>` in a vault with a marker, never in home or Elsewhere (D20).

## Performance, measured

Measured on this machine (aarch64 VM) on 2026-09-25:

| Case | Time |
| --- | --- |
| `slipbox render` of a note, cold 5,000-note vault | 175 ms end to end, including Bun start-up |
| rebuild of the 5,000-note index from cache | 55 ms |
| backlinks map over 5,000 cached notes | 23 ms |
| first full parse of 5,000 notes (≈15 MB) | 11 s, once; the TUI does it in the background |
| parse + layout of the 61 KB `operations-handbook.md`, warm | 41 ms + at most 23 ms |
| the same, cold process | ≈170 ms |

The graph parses lazily. The walk alone supplies every note name, which is all link resolution
needs, so `render` and `resolve` never parse the whole vault. `backlinks`, `ls --json` and
`outline` parse what they need and persist it. The TUI paints the first note straight away and
parses the rest in slices of about 12 ms between frames, showing `indexing N…` in the top bar. A
slice parses at least one whole note, so a big one (128 KB and up) is parsed on the workers first (below), the
slices passing it by; the main thread only puts its chunks together. Where threads can't start, a slice parses it.

**Big notes (`15.1`, D120).** Three things keep a big note's cost in proportion to what changed, and two more keep
the whole-note work — the first open, a change of width — short:

- **The parse is in chunks** (`parseMarkdown` in `core/parse.ts`): the note is cut where the result
  is certain to be the same as a whole parse — after a blank line, a heading, a closed fence or
  HTML block, and inside a list only where the block certainly began as one — each chunk parsed on
  its own, lists the cut split joined again, and reference and footnote definitions from other
  chunks stood in for. A buffer caches the chunks by their text, so an edit or a reload parses
  only the chunks it touched. Smaller parses are also faster (remark is superlinear on long lists).
- **The render caches blocks** (`renderTree`): each top-level block's rows are kept by a token
  the parse gives the block, which survives the chunk being moved by an edit above it; a moved
  block is copied to its new place and renumbered, not rendered again.
- **Source mode lays out changed lines** (`layoutSource`): the lines before and after an edit are
  reused, shifted when lines were added or taken away; the highlighter's per-line state says where
  reuse may resume. Headings are found line by line as it goes.
- **A big note parses on other threads** (`core/parse-pool.ts`): when what's left to parse of a note is 128 KB or
  more (a first open, a reload that changed most of it), its chunks are split among up to four workers, which send
  their nodes back as JSON into the buffer's parse cache — so the parse that follows here finds every chunk done.
  Meanwhile the view draws one line, `reading big.md — 20,000 lines…`, without moving (its reading position waits
  for the real layout); a key waits for the parse and then acts on the note, and a click is dropped. The Info and
  footnotes views wait too, rather than parse here. Where threads can't start, or one fails, the note is parsed
  here as any other. The workers stop after a minute idle.
- **Wrapping is mostly ASCII work** (`core/layout/wrap.ts`, `core/width.ts`): a paragraph of printable ASCII is
  wrapped by ranges of its text, not a grapheme object per character (the same rows, exactly: a randomised test
  holds the two paths together); other text goes through the grapheme segmenter only around what isn't ASCII
  (between two printable ASCII characters is always a boundary); short strings' widths (a bullet, a border) are
  remembered; and a code block is highlighted once, not again at each width.

Measured with `bun scripts/bench.ts` (median, this machine, 2026-10-01):

| Case | 1,000 lines | 20,000 lines (400 KB) |
| --- | --- | --- |
| open: the first frame | 50 ms | 30 ms (`reading…`; was 790, the whole parse) |
| open: the note drawn | 50 ms | 380 ms (was 790) |
| move the cursor (`j`) | 1 ms | 1 ms |
| type a key in source mode | 1.3 ms | 13–18 ms |
| type a key in the lens | 2 ms | 18 ms |
| leave insert mode in the lens | 5–10 ms | 40 ms (was 80; 1,453 before the chunks) |
| a reload after an agent's write | 5 ms | 45–50 ms (was 70; 1,418 before the chunks) |
| a width change (resize, a pane) | 4 ms | 70 ms (was 200) |
| CLI `task <note> <line>` on 20,000 tasks | — | 135 ms (it parses the line's chunk) |

What still grows with the note: a width change re-wraps every block (70 ms at 20,000 lines), and a first open
parses all of it (on other threads, 380 ms). Laying out only what's in view first is the lever left; nothing an
ordinary note needs.
