# Architecture

How the code is laid out and why, as built in phases 0–3. The *why* of the product is in `docs/idea.md`; the
decisions that gated this code are in [decisions.md](decisions.md).

## One core, three faces

```text
                 ┌──────────────────────────────────────────┐
                 │ src/core — pure TypeScript, no terminal   │
                 │ vault · walk · parse · links · graph      │
                 │ layout IR · themes · capture · watch      │
                 └───────┬──────────────┬──────────────┬────┘
                         ▼              ▼              ▼
                    src/tui         src/cli        src/lsp
                    OpenTUI         agents,        (phase 5,
                    reader          scripts         empty)
```

`src/main.ts` picks a face. A known subcommand runs the CLI. Anything else opens the TUI, but only
when stdin and stdout are terminals (plan `9.3`). The TUI is loaded with a dynamic `import()`, so a
CLI call never loads OpenTUI's native renderer.

### The boundary is enforced, not hoped for

`scripts/check-boundary.ts` (plan `0.3`) fails the build when:

| Directory | May not import |
| --- | --- |
| `src/core/` | `src/tui/`, `src/cli/`, `src/lsp/`, `@opentui/*` |
| `src/cli/` | `src/tui/`, `@opentui/*` |
| `src/lsp/` | `src/tui/`, `@opentui/*` |

It runs in CI (`.github/workflows/ci.yml`) and in `bun run check`.

### Only the final draw step touches OpenTUI

Inside the TUI, the same rule applies one level down. `src/tui/app.ts` (the model) and
`src/tui/draw.ts` (painting) talk to an abstract `Canvas` and `Host`. Only two files import
OpenTUI:

| File | What it does with OpenTUI |
| --- | --- |
| `src/tui/opentui.ts` | `Canvas` over `OptimizedBuffer`; the full-screen `Renderable` |
| `src/tui/run.ts` | `createCliRenderer`, key, paste and mouse events, resize, OSC 52, shutdown |

Shutdown saves positions and the session whatever ends the process: `ctrl+q`, or `SIGTERM`, `SIGHUP`,
`SIGINT`, `SIGQUIT` or `SIGPIPE`.

Everything else is testable headlessly with `TextCanvas` (see [testing.md](testing.md)).

## Module map

| Module | Plan items | Role |
| --- | --- | --- |
| `core/width.ts` | 0.7 | the one width function: graphemes, East Asian width, emoji |
| `core/fsutil.ts` | 4.6, 7.5 | atomic writes keeping the mode; `writeNote` (never out of the vault); reads |
| `core/sanitize.ts` | 2.9 | strips terminal escapes on the way into layout |
| `core/paths.ts` | 0.10 | config, cache and state directories; the vault key |
| `core/config.ts` | 0.9 | TOML: defaults ← user ← vault; warnings, never crashes |
| `core/vault.ts` | 1.1, 1.10, 0.12, 17.1, 17.18 | a file's root: a vault or the home vault; identity on open; `init` |
| `core/registry.ts` | 17.2–17.6 | a vault's identity, the home vault, the machine's vaults, storage keys, names |
| `core/git.ts` | 17.19 | a vault's git checkout, from `.git`: the main one or a worktree, the branch |
| `core/gitops.ts` | 5.11–5.14 | git run for what `.git` can't say cheaply: status, changes, a file at a commit |
| `core/reach.ts` | 17.8–17.11 | other vaults: `[[vault:note]]`, paths out of the root, their backlinks here |
| `core/redirects.ts` | 17.12 | moves seen, by content hash; where an old path went |
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
| `core/graph.ts` | 1.5, 1.8, 1.9, 6.7 | notes, links, backlinks, lazy parsing, persisted index; the change feed |
| `core/readers.ts` | 16.2 | a reader per note format: its parse into mdast, headings and links off raw lines |
| `core/filetypes.ts` | 16.1 | a file's group (note, data, text, binary) and format, by extension |
| `core/data.ts` | 16.11–16.15 | data files (TOML, INI, YAML, JSON, CSV) read into a document tree; their links |
| `core/lazy.ts` | 16.6 | modules and assets loaded on first use: asked synchronously, heard when ready |
| `core/syntax.ts` | 16.7–16.9 | tree-sitter grammars: multi-line spans, outline, syntax errors, comments |
| `core/note.ts` | 2.x | a note rendered for a pane: parse, resolve links, lay out (CLI and TUI) |
| `core/layout/*` | 2.1–2.8 | mdast → layout IR; tables; wrap; highlighting; ANSI |
| `core/layout/source.ts` | 4.13 | the markdown as a layout, with each cell's source offset |
| `core/layout/live.ts` | 4.14 | a note's blocks; the lens composed into the render |
| `core/tasks.ts` | 4.11 | a task's checkbox toggled as a one-byte edit |
| `core/editor.ts` | 4.1, 4.2, 4.12 | hand-off templates to argv, never through a shell |
| `core/nvim.ts` | 4.12 | finding and asking the running nvims |
| `core/replace.ts` | 4.16 | find's patterns (plain, regex, whole words), replacements, vim's `:s` parsed |
| `core/merge.ts` | 5.5 | line diff (Myers), three-way merge, the diff the conflict prompt shows |
| `core/theme/*` | 2.6 | semantic roles, built-in themes, base16 loader |
| `core/glyphs.ts` | 2.8 | Nerd, Unicode and ASCII glyph sets |
| `core/commands.ts` | 0.8 | `CommandRegistry` and `Keymap` |
| `core/command-specs.ts` | 0.8, parity | every command id with its CLI equivalent |
| `core/position.ts` | 3.4, 3.5, 3.15 | anchors, reading positions, session file |
| `core/watch.ts` | 5.1, 5.2 | per-directory watcher, debounce, polling fallbacks |
| `core/capture.ts` | 8.2–8.4 | scratch location, reference format, append |
| `core/context.ts` | 9.7 | the context bundle: a note, its links and backlinks, as one document for an agent |
| `core/lint.ts` | 3.21 | the lint surface: your markdownlint-cli2 run, its findings read |
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

Runtime dependencies, all pure JavaScript except OpenTUI:

| Package | Used for |
| --- | --- |
| `@opentui/core` **0.5.12, pinned exactly** | the TUI renderer and input |
| `unified`, `remark-parse`, `remark-gfm`, `remark-frontmatter` | parsing, with source positions |
| `mdast-util-to-string` | heading text fallback |
| `highlight.js` | code-fence highlighting, in the core so CLI and TUI match |
| `get-east-asian-width` | the width function |
| `ignore` | gitignore semantics for the walk |
| `smol-toml`, `yaml` | config; frontmatter and base16 schemes |

No external binary is required (hard constraint 1). The clipboard tools are used when present
and never needed.

### OpenTUI upgrade policy (plan `0.6`)

OpenTUI is pre-1.0 and moves fast, so it is pinned to an exact version in `package.json`
(`"0.5.12"`, no caret). To upgrade:

1. Read the changelog from the pinned version to the target.
2. Bump the pin, run `bun run check`. The `OpenTUI end to end` test in `tests/tui.test.ts`
   exercises the adapter through OpenTUI's own test renderer.
3. Launch the TUI and check the four things the adapter uses: `drawText` and `fillRect` output,
   key names (`keyName` in `tui/keys.ts`), mouse events, and `copyToClipboardOSC52`.
4. Only `tui/opentui.ts` and `tui/run.ts` should need changes. If anything else does, the
   boundary has leaked; fix that first.

## Storage

Decision `0.10`. Nothing derived is ever written into the vault.

| What | Where |
| --- | --- |
| user config | `$XDG_CONFIG_HOME/slipbox/config.toml` (or `--config`, `$SLIPBOX_CONFIG`) |
| vault config and identity | `<vault>/.slipbox/config.toml` (`[vault]`: `id`, `name`…), plus `.slipbox/version` |
| the home vault's | `$XDG_DATA_HOME/slipbox/home/config.toml` |
| the machine's vaults | `$XDG_STATE_HOME/slipbox/vaults.json` |
| user themes | `$XDG_CONFIG_HOME/slipbox/themes/*.yaml` (base16 / base24) |
| link index | `$XDG_CACHE_HOME/slipbox/<key>/index.json` |
| search index (`6.6`) | `$XDG_CACHE_HOME/slipbox/<key>/search.db` (SQLite FTS5, WAL) |
| reading positions | `$XDG_STATE_HOME/slipbox/<key>/positions.json` |
| session | `$XDG_STATE_HOME/slipbox/<key>/session.json` |
| clipboard fallback (no OSC 52 or clipboard tool) | `$XDG_STATE_HOME/slipbox/<key>/clipboard.txt` |
| scratch | `$XDG_STATE_HOME/slipbox/<key>/scratch.md`, or in the vault by config |
| staleness | `$XDG_STATE_HOME/slipbox/<key>/dirty/<pid>.json` |
| redirects (moves seen: `17.12`) | `$XDG_STATE_HOME/slipbox/<key>/redirects.json` |
| renames, to undo (`7.4`) | `$XDG_STATE_HOME/slipbox/<key>/renames.json` (the last 20) |
| the trash (`18.4`) | `$XDG_STATE_HOME/slipbox/<key>/trash/` (`trash.json`, and an item per folder) |

`<key>` is the vault's id, else `<basename>-<sha256(realpath)[:12]>` (`docs/design/decisions.md`, `0.10`). The home
vault's session is per loose folder: `sessions/<basename>-<hash>.json`.

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
slice always parses at least one whole note, so a big note holds the screen while it is indexed.

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
