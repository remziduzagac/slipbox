# Architecture

How the code is laid out and why, as built in phases 0–5c. The *why* of the product is in `docs/idea.md`; the
decisions that gated this code are in [decisions.md](decisions.md).

## One core, two faces

```text
                 ┌──────────────────────────────────────────┐
                 │ src/core — pure TypeScript, no terminal   │
                 │ vault · walk · parse · links · graph      │
                 │ layout IR · themes · capture · watch      │
                 └───────┬──────────────┬───────────────────┘
                         ▼              ▼
                    src/tui         src/cli
                    OpenTUI         agents,
                    reader          scripts
```

A third face, `src/lsp` (`slipbox lsp`, serving notes to editors, `11.x`), was removed with plain paths (`20.23`).

`src/main.ts` picks a face. A known subcommand runs the CLI. Anything else opens the TUI, but only
when stdin and stdout are terminals (plan `9.3`). The TUI is loaded with a dynamic `import()`, so a
CLI call never loads OpenTUI's native renderer.

### The boundary is enforced, not hoped for

`scripts/check-boundary.ts` (plan `0.3`) fails the build when:

| Directory | May not import |
| --- | --- |
| `src/core/` | `src/tui/`, `src/cli/`, `@opentui/*` |
| `src/cli/` | `src/tui/`, `@opentui/*` |

It runs in CI (`.github/workflows/ci.yml`) and in `bun run check`.

### Only the final draw step touches OpenTUI

Inside the TUI, the same rule applies one level down. `src/tui/app.ts` (the model) and
`src/tui/draw.ts` (painting) talk to an abstract `Canvas` and `Host`. Only two files import
OpenTUI:

| File | What it does with OpenTUI |
| --- | --- |
| `src/tui/opentui.ts` | `Canvas` over `OptimizedBuffer`; the full-screen `Renderable` |
| `src/tui/run.ts` | `createCliRenderer`, key, paste and mouse events, resize, OSC 52, shutdown |

What comes before the screen is taken is `run.ts`'s `prepare`, which needs no terminal (a test calls it):
the root found, its config, the root recorded as seen, and the graph. Recording comes before the graph
opens, so a named folder moved here by hand has its cache adopted first (21.8). The App is told what that
found, and doesn't record the root a second time, which would find nothing moved.

Shutdown saves positions and the session whatever ends the process: `ctrl+q`, or `SIGTERM`, `SIGHUP`,
`SIGINT`, `SIGQUIT` or `SIGPIPE`.

Everything else is testable headlessly with `TextCanvas` (see [testing.md](testing.md)).

## Module map

| Module | Plan items | Role |
| --- | --- | --- |
| `core/width.ts` | 0.7 | the one width function: graphemes, East Asian width, emoji |
| `core/fsutil.ts` | 4.6, 7.5 | atomic writes keeping the mode; `writeNote` (never out of the vault); reads |
| `core/sanitize.ts` | 2.9 | strips terminal escapes on the way into layout |
| `core/paths.ts` | 0.10, 21.8 | config, cache and state directories; a root's key, by its path |
| `core/config.ts` | 0.9 | TOML: defaults ← user ← vault; warnings, never crashes |
| `core/vault.ts` | 1.1, 1.10, 0.12, 17.1, 20.3, 21.8 | a file's root; recording it, a moved folder's state along |
| `core/registry.ts` | 17.3–17.6, 21.8 | `[vault]` identity; the machine's roots by path (`roots.json`) |
| `core/remotes.ts` | 21.6 | a repository's remotes as `host/path`: what names it, what hosting URLs are its |
| `core/parsecache.ts` | 20.11 | notes' parsed content by content hash, shared by every copy on the machine |
| `core/names.ts` | 21.9 | a root as it's told: its name, else its path (`~/…`); `name@branch` for a worktree |
| `core/git.ts` | 17.19 | a vault's git checkout, from `.git`: the main one or a worktree, the branch |
| `core/gitops.ts` | 5.11–5.14 | git run for what `.git` can't say cheaply: status, changes, a file at a commit |
| `core/mergereview.ts` | 20.21 | before a merge: the links `git merge-tree`'s result would break, each cause and fix |
| `core/reach.ts` | 17.9–17.11 | other roots: paths out of the root, their backlinks here; the converter's `[[x:…]]` |
| `core/redirects.ts` | 17.12 | moves seen, by content hash; where an old path went |
| `core/rename.ts` | 7.1–7.3, 17.15, 20.19 | renames and moves: each link rewritten as byte-range edits, previewed |
| `core/plans.ts` | 20.18 | edits as plans: saved, tied to file contents, refused once stale, applied once |
| `core/convert.ts` | 20.1 | the converter: `[[…]]` and `/…` links made relative paths, by their own old rules |
| `core/rename-log.ts` | 7.4 | each rename's files and moves, as it found them: what an undo gives back |
| `core/files.ts` | 18.4, 18.5, 18.11 | delete to the vault's trash and restore; copy; an unmade vault's `.slipbox/` |
| `core/walk.ts` | 1.2, 0.11 | the walk and `WalkFilter`, shared with the watcher |
| `core/wikilink.ts` | 1.3 | micromark tokenizer for `[[link]]` and `![[embed]]` |
| `core/footnotes.ts` | 3.17 | a note's footnotes: labels, definitions, references, in GFM's order |
| `core/tags.ts` | 1.6 | micromark tokenizer for `#tag`; tag names and keys (the graph's tag index) |
| `core/parse.ts` | 1.3 | remark + gfm + frontmatter + wikilinks; headings, slugs |
| `core/parse-pool.ts` | 15.1 | a big note's chunks parsed on up to four workers (`parse-worker.ts`), into its cache |
| `core/links.ts` | 1.4 | `LinkIndex`: case policy, collisions, markdown URLs |
| `core/search.ts` | 6.x | search: the query, a file read for it, the index kept, the index or a scan, hits located |
| `core/search-index.ts` | 6.6 | the search index: SQLite FTS5 in the cache, a row per file, BM25 |
| `core/scope.ts` | 20.16, 21.10 | search by root: `here`, then linked roots, then every root known (`--scope`) |
| `core/autoindex.ts` | 20.9 | the background auto-index: the home folder walked in slices, its roots indexed |
| `core/sqlite.ts` | 6.6 | better-sqlite3, loaded so a compiled binary embeds its SQLite |
| `core/trust.ts` | 23.x | the roots whose own code may run: your answers (`trust.json`), your `[trust] roots` |
| `core/graph.ts` | 1.5–1.9, 6.7, 11.8 | notes, links, backlinks, lazy parsing, the index; change feed; unsaved text |
| `core/readers.ts` | 16.2 | a reader per note format: its parse into mdast, headings and links off raw lines |
| `core/filetypes.ts` | 16.1 | a file's group (note, data, text, binary) and format, by extension |
| `core/convention.ts` | 21.4 | a root's links' convention: your setting, its tool's, its notes', ours |
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
| `core/export/index.ts` | 10.x | the formats by name, where an export goes, writing it (`docs/design/export.md`) |
| `tui/placeholders.ts` | 12.7 | Kitty's Unicode placeholders: a picture's id, its cells as text, sent once, let go |
| `core/syntax.ts` | 16.7–16.9, 16.18–16.22 | tree-sitter: spans, outline, errors, comments; parts in other languages |
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
| `core/merge.ts` | 5.5 | line diff (Myers), three-way merge, the diff the conflict prompt shows |
| `core/theme/*` | 2.6 | semantic roles, built-in themes, base16 loader |
| `core/glyphs.ts` | 2.8 | Nerd, Unicode and ASCII glyph sets |
| `core/commands.ts` | 0.8 | `CommandRegistry` and `Keymap` |
| `core/command-specs.ts` | 0.8, parity | every command id with its CLI equivalent |
| `core/position.ts` | 3.4, 3.5, 3.15 | anchors, reading positions, session file |
| `core/watch.ts` | 5.1, 5.2 | per-directory watcher, debounce, polling fallbacks |
| `core/vault-feed.ts` | 5.1, 5.9, 5.10 | the watcher's news into a graph, held while git writes (TUI) |
| `core/capture.ts` | 8.2–8.4 | scratch location, reference format, append |
| `core/context.ts` | 9.7 | the context bundle: a note, its links and backlinks, as one document for an agent |
| `core/lint.ts` | 3.21 | the lint surface: your markdownlint-cli2 run, its findings read |
| `core/servers/languages.ts` | 19.2 | languages and their servers, built in and in Helix's shape from the config |
| `core/servers/find.ts` | 19.3, 19.4 | a file's project root; where a server's program is; which servers serve a file |
| `core/servers/install.ts` | 19.5 | npm servers installed into slipbox's own folder, pinned, scripts off |
| `core/servers/manager.ts` | 19.1 | the servers of open files: one per server and project, installed, restarted |
| `core/servers/doctor.ts` | 19.7 | each language's servers and where each is; a file's, in its project |
| `core/servers/client.ts` | 19.1 | a language server as slipbox's client: started, files synced, diagnostics, stopped |
| `core/servers/linters.ts` | 19.19 | linters with no language server, in efm-langserver's keys, via the lint surface |
| `core/servers/vscode.ts` | 19.20 | a project's `.vscode/settings.json` answering its servers' settings |
| `core/diagnostics.ts` | 19.8, 11.5 | a file's problems from every source, one shape: links, conflicts, syntax, lint |
| `core/clipboard.ts` | 8.5 | OSC 52 (up to 100 KB of base64), then pbcopy / wl-copy / xclip, then a file |
| `core/stale.ts` | 9.9 | advisory list of unsaved paths, pid-stamped: the TUI writes it, the CLI reads it |
| `cli/cli.ts` | 9.1–9.6 | the CLI face |
| `cli/args.ts` | 9.1 | flag parsing: flags anywhere, `--x=v` or `--x v`, `--` ends flags |
| `version.ts` | — | the version, one source |
| `tui/*` | 3.x, 5.3–5.7 | the app: reading, panes, saving and conflicts |
| `tui/buffer.ts` | 4.5–4.8 | a note's text, its undo steps, unsaved state, BOM and line endings |
| `tui/editing.ts` | 4.3 | the cursor as a text offset; insert mode |
| `tui/vim.ts` | 4.4 | counts, operators and text objects, the register, `.` |
| `tui/replacing.ts` | 4.16 | the replace row, `:s` and its confirm, `gn`'s matches |
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

Runtime dependencies, all pure JavaScript except OpenTUI and better-sqlite3 (native, prebuilt for each platform in the
package — no build toolchain):

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
| `better-sqlite3` | the search index's SQLite, its own (3.53.4) bundled; needs Bun 1.4.2, on Linux glibc 2.34 |
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
| `mdast-util-to-markdown` 2.1.2, `-gfm` 3.1.0, `-math` 3.0.0 | Markdown export (10.3): the tree written again |

The grammars npm ships no WebAssembly for — Swift, SCSS, Vue, Astro, Dockerfile — are built from their sources at
pinned commits into `grammars/` by `scripts/build-grammars.ts`, committed with their licences (`grammars/README.md`).

Licences: permissive, but for two weak-copyleft libraries accepted for use — `elkjs` (EPL-2.0) and resvg (MPL-2.0).
What a distributed binary owes them is `14.6` in the plan.

No external binary is required (hard constraint 1). The clipboard tools are used when present
and never needed.

### OpenTUI upgrade policy (plan `0.6`)

OpenTUI is pre-1.0 and moves fast, so it is pinned to an exact version in `package.json`
(`"0.5.12"`, no caret). To upgrade:

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

Decision `0.10`. Nothing derived is ever written into the vault. An export (`10.x`) is asked for, not derived: it goes
where it's told, beside its note by default.

| What | Where |
| --- | --- |
| user config | `$XDG_CONFIG_HOME/slipbox/config.toml` (or `--config`, `$SLIPBOX_CONFIG`) |
| a root's config and identity | `<root>/.slipbox/config.toml` (`[vault]`: `id`, `name`…), plus `.slipbox/version` |
| the machine's roots (`21.8`) | `$XDG_STATE_HOME/slipbox/roots.json` (by path; moves kept) |
| the roots you trust, or kept safe (`23.x`) | `$XDG_STATE_HOME/slipbox/trust.json` (your answers, by path) |
| named folders (`21.6`) | `$XDG_STATE_HOME/slipbox/folders.json` (names, copies, defaults) |
| user themes | `$XDG_CONFIG_HOME/slipbox/themes/*.yaml` (base16 / base24) |
| link index | `$XDG_CACHE_HOME/slipbox/<key>/index.json` |
| search index (`6.6`) | `$XDG_CACHE_HOME/slipbox/<key>/search.db` (SQLite FTS5, WAL) |
| parse cache, shared (`20.11`) | `$XDG_CACHE_HOME/slipbox/parsed.db` (by content) |
| pictures (`12.12`, `12.15`) | `$XDG_CACHE_HOME/slipbox/images/` (a file per web address; SVGs as drawn, by width) |
| reading positions (`21.8`) | `$XDG_STATE_HOME/slipbox/positions.json` (by file, the machine's) |
| session | `$XDG_STATE_HOME/slipbox/<key>/session.json` |
| pinned roots (`20.15`, `:pin-root`) | `$XDG_STATE_HOME/slipbox/<key>/roots.json` |
| where an export went last (`10.14`) | `$XDG_STATE_HOME/slipbox/<key>/export.json` |
| branch heads seen (`20.21`) | `$XDG_STATE_HOME/slipbox/<key>/heads.json` (each branch's last commit) |
| clipboard fallback (no OSC 52 or clipboard tool) | `$XDG_STATE_HOME/slipbox/<key>/clipboard.txt` |
| scratch | `$XDG_STATE_HOME/slipbox/<key>/scratch.md`, or in the vault by config |
| staleness | `$XDG_STATE_HOME/slipbox/<key>/dirty/<pid>.json` |
| redirects (moves seen: `17.12`) | `$XDG_STATE_HOME/slipbox/<key>/redirects.json` |
| renames, to undo (`7.4`) | `$XDG_STATE_HOME/slipbox/<key>/renames.json` (the last 20) |
| the trash (`18.4`) | `$XDG_STATE_HOME/slipbox/<key>/trash/` (`trash.json`, and an item per folder) |
| the background index (`20.9`) | `$XDG_STATE_HOME/slipbox/autoindex.json` (its place), `activity` (CLI last used) |
| saved plans (`20.18`, `--plan`) | `$XDG_STATE_HOME/slipbox/plans/<id>.json` (for `slipbox apply`; gone once applied) |
| language servers installed (`19.5`) | `$XDG_DATA_HOME/slipbox/tools/` |

`<key>` is the root's path — a plain folder's when there's none: `<basename>-<sha256(realpath)[:12]>` (`21.8`;
`docs/design/decisions.md`, `0.10`). A named folder moved by hand takes it along.

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

**Big notes (plan `15.1`).** Three things keep a big note's cost in proportion to what changed, and two more keep
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
