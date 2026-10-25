# Roadmap

Status: **initial design settled** (D210, 2026-10-11); phases 0–6+ built. The repository is public on GitHub and kept
to greenrepo (GR, consolidated 2026-10-13). Its history starts afresh on 2026-10-22, and 0.5.0 is its first release
(2026-10-22); 0.2.1 (2026-10-12) to 0.4.0 (2026-10-17) were released before, and aren't published any more.
Vaults and the explorer's view (VV) and reviewing, diffing and merging (GIT) are built, consolidated and documented
(2026-10-17), and in 0.4.0. Next: native Windows
(`14.14`–`14.17`); and, open in ideas.md, the skill as an npx package for common harnesses and how agents and slipbox
work together (§ Agent surface), and search's improvements (§ Search).
Automatic installation and maintenance of the bundled skill (#50) is in
[ASI](workstreams/agent-skill-install/README.md), extending `14.4`, `14.7` and `14.8`.

Each step's ID is the plan's stable item ID: cite it (`3.3`, `10.1`) rather than restating the work. Phases and
clusters differ: a cluster groups related items in dependency order, and its line in italics says which phase it
belongs to; a cluster's number is not a phase (`3.x` is the TUI and landed in phase 2). A ticked item is done,
decided, dropped, postponed or superseded, as its line says. A constraint is a requirement on other items, not a step,
so it has no box.

## Phases

| Phase | Focus | Clusters | Finish line |
| --- | --- | --- | --- |
| **0** | Codebase, CLI skeleton | Step 0, thin `9.1`–`9.3` | Boundary enforced in CI; fixture vault; `--json` exists |
| **1** | Rendering: leaf parity | `1.1`–`1.3`, all `2.x`, `slipbox render` | Replaces leaf for reading `docs/` |
| **2** | The app: beat leaf | `3.x`, `5.1`–`5.4`, `8.x`, link-follow, `9.3`–`9.4` | **An agent can drive it** |
| **3** | Editing | all of `4.x`, `5.5`–`5.10`, `7.2`–`7.5`, lint surface | Small edits stop provoking `$EDITOR` |
| **3b** | Files beyond markdown | all of `16.x` | Any text file opens; data files render; code has an outline |
| **4** | Vault and structure | `17.x`, rest of `1.x`, `6.x`, `7.1`, embeds | Backlinks and search on a real vault |
| **5** | LSP, code intelligence | `11.x`, `19.x`, `16.18`–`16.23` | nvim gets slipbox's graph; slipbox the servers' |
| **5b** | Plain paths, virtual vaults | `20.x` | Open any file or folder and work: paths, derived vaults |
| **5c** | Paths inside, conventions at the edges | `21.x` | Other tools' links read and written; no vaults |
| **6+** | Export, images, extensibility | `10.x`, `12.x`, `13.x` | — |

Every phase is built: 0 to 2 on 2026-09-25, 3 on 2026-09-28, 3b and 4 by 2026-10-01, 5b by 2026-10-03, 5 and 5c by
2026-10-07, and 6+ by 2026-10-10, but for `13.x`, deferred. `14.x`, distribution, is not a phase; neither are `15.x`
and `22.x`–`26.x`, which came after the phasing.

Why this order, and how it relates to the design's proposed first cut: D24.

## Step 0: codebase

*Phase 0.*

Everything here is cheap now and expensive later: that is the only thing the items have in common, and the only reason
they are step 0. Each line says why it could not wait.

- [x] **0.1** Repo, licence, README, `bun init`, strict TS.
- [x] **0.2** Module layout `core/` `tui/` `cli/` `lsp/`. Why now: the three-faces split.
- [x] **0.3** CI check: `core/` must not import `tui/`. Why now: OpenTUI is Bun-only FFI; a breach kills the CLI
  silently.
- [x] **0.4** Test runner and snapshot harness. Why now: snapshotting the pure layout stage *is* the strategy.
- [x] **0.5** Fixture vault: wikilinks, collisions, wide tables, CJK, frontmatter, CRLF. Why now: all tests use it.
- [x] **0.6** Pin OpenTUI exactly, write the upgrade policy. Why now: pre-1.0, 169 commits per 90 days.
- [x] **0.7** One width function; nothing else measures text. Why now: display width governs each wrap and
  cursor position.
- [x] **0.8** Command registry: every action named. Why now: palette, keymaps, modal layer and plugins all consume it.
- [x] **0.9** Config loader: TOML, user plus vault marker, vault wins. Why now: almost everything reads config.
- [x] **0.10** Storage: config vs cache vs state (D39). Why now: paths bake in; moving them needs a migration.
- [x] **0.11** The walk: extensions, ignores, symlinks, caps (D40). Why now: it changes graph, perf, indexing,
  watching.
- [x] **0.12** Version stamp in the vault marker dir. Why now: nothing to migrate *from* without it.

## Core: vault and graph (`1.x`)

*Phase 1 for `1.1`–`1.3`; phase 2 for link-follow from `1.4`, `1.5`, `1.8`–`1.10`; the rest phase 4.*

- [x] **1.1** Vault root discovery: marker dir, precedence, `--root`, single-file mode.
- [x] **1.2** File walk implementing `0.11`.
- [x] **1.3** Parse pipeline: remark + gfm + frontmatter + wiki-link.
- [x] **1.4** Link resolution, then build it: `nameToPath` as lists, collisions, case policy (D41).
- [x] **1.5** Backlinks map.
- [x] **1.6** Tags map: frontmatter `tags` and `#tags` in the text, nested, one tag whatever its case.
- [x] **1.7** Unresolved-link set (and ambiguous links): the Problems panel, This file and All, `slipbox problems`.
- [x] **1.8** Incremental single-file graph update.
- [x] **1.9** Index persistence: when, and to the cache location from `0.10`.
- [x] **1.10** `slipbox init` and the no-marker path: announce the degradation, offer to create.
- [x] **1.11** Embeds drawn in place: `![[note]]`, `#Heading`, `#^block`; read-only, loops and depth capped.

## Rendering (`2.x`)

*Phase 1.*

- [x] **2.1** mdast to layout IR: pure, framework-agnostic.
- [x] **2.2** Blocks and inlines: headings, lists, code, quotes, emphasis.
- [x] **2.3** Table allocator, including the aggregate-minimum overflow bug.
- [x] **2.4** Wrapping over `0.7`.
- [x] **2.5** Code-fence syntax highlighting.
- [x] **2.6** Theme tokens, built-ins, base16 loader.
- [x] **2.7** Readability defaults: render-width inset, inline-code background, bold fg, border contrast.
- [x] **2.8** Glyph capability: Nerd Font detection and an ASCII fallback set.
- **2.9** Constraint: strip terminal escapes from text on the way into layout (requirements.md § Constraints).

## TUI (`3.x`)

*Phase 2.*

- [x] **3.1** Renderer bootstrap, sidebar / content / status layout.
- [x] **3.2** Scroll with viewport-only rendering.
- [x] **3.3** Buffers, tabs, one split.
- [x] **3.4** Reading position per note.
- [x] **3.5** Reload anchoring: line number, heading, node id or content hash (D98).
- [x] **3.6** Back/forward history stack.
- [x] **3.7** File explorer.
- [x] **3.8** Quick switcher.
- [x] **3.9** Outline.
- [x] **3.10** Command palette over `0.8`.
- [x] **3.11** Mode taxonomy and dispatch order, plus the key collisions (D99).
- [x] **3.12** Default keymap.
- [x] **3.13** Message sink: one place for errors, warnings and script stderr.
- [x] **3.14** Narrow-terminal collapse.
- [x] **3.15** Session restore.
- [x] **3.16** Filters match each typed word with its letters together, words in any order, not letter by letter.
- [x] **3.17** Footnotes: the right panel's second view (`space n f`): each footnote, its references, jumps.
- [x] **3.18** Footnotes added (`space n shift+f`, `a`, `+`), edited, renamed, deleted; `slipbox footnotes … add`.
- [x] **3.19** Info: the right panel's first view: the file's place, vault, counts, state, properties, tags.
- [x] **3.20** Properties edited in a floating editor (`e`, `space n shift+p`): the frontmatter, written back.
- [x] **3.21** The lint surface: markdownlint-cli2's findings by line, status line, Problems; `problems --lint`.

## Editing (`4.x`)

*Phase 3.*

Order, in five steps (decided 2026-09-28, D144): the checkbox toggle (`4.11`), the first write;
hand-off, both kinds (`4.1`, `4.2`, `4.12`); source mode with the modal layer (`4.3`, `4.4`, `4.13`); saving and
conflicts (`4.5`–`4.10`, `5.5`–`5.7`); live preview (`4.14`).

- [x] **4.1** `$EDITOR` hand-off using OpenTUI `suspend()` / `resume()`.
- [x] **4.2** `editor.command` template with `{file}` and `{line}`: there is no portable line-number flag.
- [x] **4.3** In-app editor: built as `NoteBuffer` with `editing.ts` and `vim.ts`, not on `Textarea`.
- [x] **4.4** Modal layer: a state machine over the named actions from `0.8`.
- [x] **4.5** Undo/redo wiring, surviving external reload.
- [x] **4.6** Atomic save, temp plus rename.
- [x] **4.7** Autosave, long idle delay.
- [x] **4.8** Dirty-state indicators.
- [x] **4.9** Incremental reparse (done in `15.1`).
- [x] **4.10** Flush dirty buffers at handoff points: capture, context bundle, invoking an agent.
- [x] **4.11** Checkbox toggle: a key and a click on `[ ]`; the first write.
- [x] **4.12** Remote hand-off: open the note in an editor already running (nvim `--server`), no wait.
- [x] **4.13** Source mode: the raw markdown as a layout, so the reading keys work unchanged.
- [x] **4.14** Live preview: the block under the cursor as its source, edited in place (the lens).
- [x] **4.15** The lens scrolls inside a block taller than its maximum, with "↑ N lines" on its rules.
- [x] **4.16** Find and replace: a replace row under find (`ctrl+h`); vim's `:s` with `g` `i` `c`; `cgn` and `.`.
- [x] **4.17** The lens opens on the cursor's innermost section whole when it fits, and moves section to section.

## Concurrency (`5.x`)

*Phase 2 for `5.1`–`5.4`; phase 3 for `5.5`–`5.10`.*

- [x] **5.1** Watcher, debounce, ignore own writes.
- [x] **5.2** Watch-registration failure path: inotify limits on the Linux VMs; degrade loudly.
- [x] **5.3** Silent reload when clean.
- [x] **5.4** Surface an external change the moment it lands.
- [x] **5.5** Vim-shaped conflict prompt: `(L)oad` `(K)eep` `(D)iff` `(M)erge`.
- [x] **5.6** Autosave aborts on mtime change.
- [x] **5.7** Post-`(K)eep` state: autosave off until an explicit, confirmed save.
- [x] **5.8** Incremental graph update from watch events.
- [x] **5.9** `HEAD` moves as one event: git's changes held while it writes; no moves; each branch its tabs.
- [x] **5.10** Autosave waits out git's index lock, and so does the watcher's news (`5.9`).
- [x] **5.11** Git's marks in the explorer: each changed file's state, a folder with one; asked in the background.
- [x] **5.12** A merge's conflicts in Problems and `slipbox problems`: each unmerged file at its first marker.
- [x] **5.13** What this branch changed against the base, and a note's diff: `space g c`, `space g d`; CLI.
- [x] **5.14** The worktrees by branch: `space g w` opens this note in another; `slipbox worktrees`.

## Search (`6.x`)

*Phase 4.*

- [x] **6.1** Decided: our own index in the core (SQLite FTS5), a scan until it's built; an outside engine later
  (D114).
- [x] **6.2** Literal search: every match (`find`, `space f g`).
- [x] **6.3** Regex search (`find --regex`).
- [x] **6.4** Scoping by tag and folder: `#tag` / `tag:x` (nested tags too), `path:folder/`.
- [x] **6.5** Results list and navigation in the TUI (`space f s`): ranked as you type, the words marked.
- [x] **6.6** The search index: FTS5 in the cache, a row per file, BM25; caught up by size and mtime.
- [x] **6.7** The change feed: every change to the vault's files through the graph (`onChange`).
- [x] **6.8** `slipbox search` (ranked; the index, else a scan), `slipbox index`; `[search] engine`.
- [x] **6.9** The TUI keeps the index: built in idle slices, kept by the feed; unsaved notes searched as shown.
- [x] **6.10** Postponed (2026-10-07, D124): Scout became trailscout, its own project; slipbox uses its SDK when
  that exists.
- [x] **6.11** better-sqlite3 for the index; since 2026-10-10 the runtime's own, `node:sqlite` (`14.x`).
- [x] **6.12** Sections are scout's: the containment tree cut to the 400–1500 band; a hit cites its section.
- [x] **6.13** Dropped (2026-10-07, D124): `@slipbox/links` for scout: scout became trailscout (`6.10`), its own
  project.

## Write safety (`7.x`)

*Phase 3, except `7.1`, which needs the graph and lands in phase 4.*

- [x] **7.1** Rename with link fixing, as byte-range edits from mdast positions (done in `17.15`).
- [x] **7.2** Multi-file preview of the transaction (done in `17.15`).
- [x] **7.3** Confirm, and warn when the tree is already dirty (done in `17.15`).
- [x] **7.4** Undo a rename: `space v shift+u`, `slipbox undo`; the files as they were, what moved back.
- **7.5** Constraint: never write outside the vault root; decide what a symlink out means (requirements.md
  § Constraints).
- [x] **7.6** Frontmatter is spliced by byte range, never parsed and re-serialised (D148).

## Scratch capture (`8.x`)

*Phase 2.*

- [x] **8.1** The capture path is `slipbox capture`, called from nvim (D19).
- [x] **8.2** Storage location per `0.10`.
- [x] **8.3** Accumulator: `path:line` refs and excerpts.
- [x] **8.4** Markdown format carrying source refs.
- [x] **8.5** Clipboard: OSC 52, then `pbcopy` / `wl-copy`, then write a file and print the path.

## CLI face (`9.x`)

*Phase 0 for `9.1`–`9.2`, thin; `9.3`–`9.4` in phase 2, when agents start using it for real; `9.8` tracks every
phase; the rest grows as the phases do (D16).*

- [x] **9.1** The command list: read `zk` and `nb` first (D18).
- [x] **9.2** `--json` output separate from human output; stable exit codes; versioning.
- [x] **9.3** No-TTY behaviour: never start a TUI when stdout is a pipe.
- [x] **9.4** Cross-process semantics, decided: disk is the contract (D17).
- [x] **9.9** Advisory staleness file: the TUI writes dirty paths plus its pid; the CLI surfaces them.
- [x] **9.10** `--if-unchanged` for writers that must not clobber.
- [x] **9.5** Graph queries: links, backlinks, `tags`; orphans in `slipbox problems` (and the Problems panel).
- [x] **9.6** `capture` subcommand.
- [x] **9.7** Context bundle: `slipbox context <note>`, `space s c`: the note, its links and backlinks.
- [x] **9.8** The agent-facing skill that teaches the CLI.

## Export (`10.x`)

*Phase 6+. Decided 2026-10-09 (D184), `10.10`–`10.13` later the same day; signed off by the user 2026-10-10:
the prototypes are done.*

- [x] **10.1** Assembler: embeds drawn in, links inside the document or their text, pictures as on screen.
- [x] **10.2** HTML writer: one file, its pictures inside it; print-friendly.
- [x] **10.3** Markdown writer: portable; GitHub's heading ids, pictures copied beside it.
- [x] **10.4** DOCX writer, by `docx` (MIT): `slipbox export`, `space n o`.
- [x] **10.5** PDF writer, by `pdfkit` (MIT; decided 2026-10-09, D186): the machine's fonts, embedded.
- [x] **10.6** EPUB packaging over `10.2`, zipped by `fflate` (MIT).
- [x] **10.7** Dropped (2026-10-09, D184): a headless-browser tier: an external tool.
- [x] **10.8** Dropped (2026-10-09, D184): a pandoc tier: an external tool.
- [x] **10.9** Compose: notes picked in order, one document; `space n shift+o`; the CLI takes several.
- [x] **10.10** A picture a format doesn't hold made PNG first: BMP, GIF, WebP (libwebp as wasm).
- [x] **10.11** PDF lines laid out by slipbox: a picture in a sentence, maths on the baseline, code tinted.
- [x] **10.12** Emoji in a PDF in black and white, from a font that draws them so (Noto Emoji, Symbola…).
- [ ] **10.13** Deferred, see [Later](#later).
- [x] **10.14** Where an export goes, in a Save As window: places, the folder's folders and files, the name.

## LSP face (`11.x`)

*Phase 5. Removed in phase 5b (`20.23`, 2026-10-02, D67); the items record what was built.*

- [x] **11.1** `vscode-languageserver` and the protocol package under Bun and compiled, both ways (D170).
- [x] **11.2** Server skeleton over stdio: `slipbox lsp`, a graph per vault (`.slipbox/` only), kept current.
- [x] **11.3** `completion`, `definition`, `references`, `hover`: notes, aliases, `#heading`, `#^block`, embeds.
- [x] **11.4** `rename` returning a `WorkspaceEdit`: the editor supplies the preview.
- [x] **11.5** `publishDiagnostics`: broken and ambiguous links, conflicts; lint only with `[lsp] lint = true`.
- [x] **11.6** `documentSymbol` and `workspace/symbol`.
- [x] **11.7** Link ranges: where each link ends as well as where it starts, in the graph's records.
- [x] **11.8** Unsaved text: an open document's text stands for its file's until it's closed.
- [x] **11.9** Heading rename in the core: `[[note#Heading]]`, `note.md#heading` fixed everywhere; TUI, CLI too.
- [x] **11.10** `willRenameFiles`: a note moved in the editor's file tree has its links fixed.
- [x] **11.11** Code actions: make a missing note, pick an ambiguous link's target; the context bundle.
- [x] **11.12** nvim's setup documented: slipbox where `.slipbox/` is, marksman elsewhere.

## Code intelligence (`19.x`)

*Phase 5. Decided 2026-10-01 (D161).*

Order: `11.1` (the protocol library, for both directions), then the markdown server (`11.x`), then the diagnostics
display on today's findings (`19.8`–`19.11`), then the client and finding servers (`19.1`–`19.7`), reading features,
editing features, linters, and the languages (`16.18`–`16.23`).

- [x] **19.1** Client: spawn, initialize, document sync, shutdown, restart after a crash; one per server and root.
- [x] **19.2** Languages and servers: Helix's `[language-server.x]` and `[[language]]`; defaults per language.
- [x] **19.3** Roots per language, from markers (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`…).
- [x] **19.4** Finding: the user's config, the project (`node_modules/.bin`, `.venv/bin`…), `PATH`, Mason.
- [x] **19.5** Private installs: npm packages with Bun into slipbox's folder, pinned, scripts off; `auto_install`.
- [x] **19.6** Decided: trusted everywhere; servers and linters run the project's code (revised by `23.1`, D171).
- [x] **19.7** `slipbox doctor`: per language, each server and linter: found where, installable, or how to get it.
- [x] **19.8** Diagnostics: one list per file from every source (syntax, lint, links; servers to come).
- [x] **19.9** The bar: a column beside the text, each line's worst sign in its colour, the count past one.
- [x] **19.10** Ranges marked at a level (errors by default): in source mode, the lens and the rendered view.
- [x] **19.11** Toggles (`space u d`, `shift+d`) and `[diagnostics]`; the status line takes every source.
- [x] **19.12** Hover in a float; signature help as `(` and `,` are typed (`19.16`).
- [x] **19.13** Definition, type definition, implementations, references: a jump, or a list when there are several.
- [x] **19.14** The server's symbols where tree-sitter has none; the switcher's `#` the workspace's symbols.
- [x] **19.15** Rename, code actions, formatting: through `App.writeBuffer`, previewed like slipbox's renames.
- [x] **19.16** Completion in insert mode: on a trigger at once, on a word after a pause; narrowed as typed.
- [x] **19.17** Several servers per file: a main one and add-ons, merged; Helix's `only-features` splits the work.
- [x] **19.18** Linters with an LSP mode as add-ons, where the project has their config; the project's copy first.
- [x] **19.19** Linters without LSP in efm-langserver's keys (`lint-command`, `lint-formats`); hadolint, yamllint.
- [x] **19.20** Server settings from a project's `.vscode/settings.json`, over the config's, as VS Code does.
- [x] **19.21** markdownlint-cli2 found as a server is, else from the private install, rather than `npx`.
- [x] **19.22** CLI: `slipbox diagnostics <file>`: servers' and linters' findings, `--json`, for agents, scripts.
- [x] **19.23** Live: rust-analyzer, gopls, clangd, sourcekit-lsp, ruby-lsp, taplo, hadolint… (2026-10-07).

## Plain paths, virtual vaults (`20.x`)

*Phase 5b. Decided 2026-10-02, revised after a review (D56). In order: link semantics, the migration and identity
first; the index and what it shows second; repairs, the CLI and the merge review after; the removals as their
replacements land, the sweep last.*

*Revised by `21.x`: `21.12` removed `20.4`, `20.5`'s instances, `20.6`, `20.12`, `20.13` and `20.20`'s `vault:path`;
`20.14` and `20.15` show roots (`21.9`); `20.2`'s `/` starts from the nearest root first (`21.2`); `20.3`'s markers
widened by `21.1`; `20.2`'s `[[…]]` as text and `20.22`'s removal of resolving by name revised by `21.3` (wikilinks
read within their root); `20.11`'s links resolved per root, not per instance (`21.8`, `21.12`). The items record what
was built.*

`20.1` comes before `20.2`: the converter needs today's resolution, which `20.2` and `20.22` remove from reading (the
converter keeps it, as a legacy reader of its own). `20.23` was done second: the LSP face read wikilinks throughout,
and removing it first spared rewriting its tests only to delete them. `20.17`–`20.19` reuse the rename and move engine
(`7.1`–`7.3`, `17.12`, `17.15`) on paths, `17.12`'s redirects becoming evidence for a repair. Performance (`20.11`) is
measured, not assumed. Each item ends with its tests listed for the user's approval before any is run.

- [x] **20.1** The converter: `[[…]]` and `/…` links as relative paths, labels kept, fragments checked; previewed.
- [x] **20.2** Links are paths: `[[…]]` is text; `/` the filesystem's root; a broken link stays so till fixed.
- [x] **20.3** Vault boundaries: the nearest `.slipbox/` or git checkout; both in one folder, one; nested apart.
- [x] **20.4** Collections apart from instances: local ids; remotes and first commits as evidence; plain folders.
- [x] **20.5** Durable state: instances, their locations, confirmed moves; state by instance; today's moved once.
- [x] **20.6** Names: short, unique here, `.` for a collision, a worktree's branch now (`@`); never in a file.
- [x] **20.7** Settings: the nearest `.slipbox/config.toml`, then outer ones, then yours; programs yours only.
- [x] **20.8** The index on demand: folders opened, links followed, CLI paths; ignored and hidden when reached.
- [x] **20.9** The background auto-index of the home folder: low priority, paused while working, resumable.
- [x] **20.10** Freshness: sizes and times checked, folders listed again; coverage; a CLI refresh; drives away.
- [x] **20.11** The parse cache by content hash, parser version and format; links resolved per instance.
- [x] **20.12** The `vault:path` form: link without text, hover, backlinks, previews; the original on `space u r`.
- [x] **20.13** Completion offers `vault:path` and the full path, and writes the relative path.
- [x] **20.14** The status line: the vault and its branch (`pathfinder · main`), a worktree `pathfinder@refactor`.
- [x] **20.15** The explorer's roots: the vault opened, vaults followed into, pinned ones; never overlapping.
- [x] **20.16** Search by vault: the current one, then linked ones, then everything on a key; `--scope`.
- [x] **20.17** Repairs: changes made elsewhere fix the index; link fixes as plans; a moved vault's from the state.
- [x] **20.18** Generated edits as plans: tied to file hashes, stale ones refused; the CLI plans, then applies.
- [x] **20.19** Renames and moves on paths: the files linking in, and the moved file's own relative links.
- [x] **20.20** The CLI: `vault:path` in and out (`href` to write); files as saved; diagnostics, search, fixes.
- [x] **20.21** The merge review: links `git merge-tree`'s result breaks; after a merge, git's renames as evidence.
- [x] **20.22** Removed: the home vault, `[[vault:note]]`, resolving by name, links through redirects (`20.3`).
- [x] **20.23** Removed: the LSP face (`slipbox lsp`, `src/lsp/`, `[lsp] lint`, the nvim setup); the client stays.

## Paths inside, conventions at the edges (`21.x`)

*Phase 5c. Proposed 2026-10-05 and reviewed with the user; approved (D68), and built 2026-10-06 and 07. In
order: roots and the one model inside first; the conventions read, then found, then written; names and pointers next;
state, words and what's shown after; the removals as their replacements land, the sweep last.*

`21.1` comes first: `/`, wikilinks and conventions each read a root. `21.2`–`21.5` change no behaviour for relative
links, which stay as they are. `21.6` and `21.7` replace what vaults gave links between folders before `21.12` removes
it. Each item ends with its tests listed for the user's approval before any is run.

- [x] **21.1** Roots from markers: `.git`, `.slipbox/`, `.obsidian/`, `.zk/`; `root_markers`, yours; the nearest.
- [x] **21.2** Links as paths inside: `/` from the nearest root, then the filesystem; extensionless; to a folder.
- [x] **21.3** Wikilinks read within their root: names, paths, aliases, attachments; ties ambiguous; no root.
- [x] **21.4** Conventions found: your setting, the root's tool's (Obsidian, zk), the notes' majority, ours.
- [x] **21.5** Links written in the convention: completion, the picker, `slipbox link`; renames keep each form.
- [x] **21.6** Named folders: by remote (short, qualified), by `.slipbox/` name and id; copies, defaults; lookup.
- [x] **21.7** `slipbox://` pointers, `@branch` too: read, followed, backlinked, renamed; clashes asked; relinked.
- [x] **21.8** Personal state by root, positions by file; carried with a named folder's move; today's moved once.
- [x] **21.9** What's shown: the file's own forms; files by path in lists; the status line and explorer by roots.
- [x] **21.10** Words: `folders [default]`, `name`, pointers as args; `root`/`name` in JSON; `--scope here`.
- [x] **21.11** Repairs: the relink offered after moves made elsewhere; typed `research:x.md` flagged and fixed.
- [x] **21.12** Gone: `vault:path`, `previous_names`, collections, instances, display names, `vault-moved`, vaults.
- [x] **21.13** The sweep: the docs, the skill, the README, the e2e scenarios (run 2026-10-07; findings fixed).

## Images (`12.x`)

*Phase 6+. Decided 2026-10-08 (D127).*

Order: `12.7` checked, then `12.10`, `12.11`, `12.15`, `12.16`, `12.17`.

- [x] **12.1** Capability probe: OpenTUI's, which asks the terminal; never `$TERM`.
- [x] **12.2** `[render] images = auto | never`.
- [x] **12.3** Protocol emit through OpenTUI: Kitty graphics (herdr draws them too), sixel.
- [x] **12.4** Dropped (2026-10-08, D126): no half-block fallback: where a terminal draws no images, `▣ alt` and
  its link.
- **12.5** Constraint: alt text plus path is the floor; a note never becomes unreadable (requirements.md
  § Constraints).
- [x] **12.6** Sizing from cell pixel geometry: the text width, proportions kept, at most 12 rows.
- [x] **12.7** Sent once, drawn as Kitty's Unicode placeholders: text that scrolls; sixel waits on scroll.
- [x] **12.8** Scroll behaviour: a picture cut where it scrolls out of sight.
- [x] **12.9** Decode cache keyed by path and mtime.
- [x] **12.10** Mermaid as Unicode drawing (`beautiful-mermaid`, no browser): flowchart, state, sequence, ER…
- [x] **12.11** Maths read, `$…$` (Obsidian's rule: no space inside, no digit after) and `$$`, as Unicode.
- [x] **12.12** Images online: `ask` (the link; `enter` asks: once, or its site), `show`, `never`.
- [x] **12.13** Obsidian's `![[picture.png]]`: found as its link is; `|300`, `|240x180` its size.
- [x] **12.14** A picture in an embedded note: found from where that note is, drawn inside its frame.
- [x] **12.15** SVG drawn: rasterised by resvg (WebAssembly) into the cache: `![x](d.svg)`, `12.16`, `12.17`.
- [x] **12.16** Mermaid as a picture, by choice where images work (`12.10` the default), via `12.15`.
- [x] **12.17** Display maths typeset by MathJax as a picture, by choice, via `12.15`; inline stays text.

## Extensibility (`13.x`)

*Phase 6+. Deferred, the whole of it (2026-10-09, D37): for the future, not planned now.*

- [ ] **13.1** Deferred, see [Later](#later).
- **13.2** Constraint: arguments passed as argv, never interpolated into a shell string (requirements.md
  § Constraints).
- [ ] **13.3** Deferred, see [Later](#later).
- [ ] **13.4** Deferred, see [Later](#later).
- [ ] **13.5** Deferred, see [Later](#later).
- [ ] **13.6** Deferred, see [Later](#later).

## Distribution (`14.x`)

*Not a phase. A cheap local invocation exists from phase 1 so agents can call it; real packaging lands whenever it
first needs to run on a VM. Decided 2026-10-10 (D197); the licence (`14.6`) parked 2026-10-09 (D193), decided
2026-10-12 (GR-D3). The first release, 0.2.1, published 2026-10-12 (GR-D18).*

- [x] **14.1** `bun build --compile` per target; its autoload flags off (2026-10-10), in `build`, tested.
- [x] **14.2** Release assets: darwin-arm64, linux-x64, linux-arm64; `SHA256SUMS`, attestations. darwin-x64 until
  0.3.0 (D238, `14.18`).
- [x] **14.3** Homebrew: a formula each release, into a tap once it's published; Homebrew's own left to brew.
- [x] **14.4** Update path: `slipbox upgrade`; a daily check, on by default, that sends nothing identifying.
- [x] **14.5** Alpine (musl): `-musl` packs, OpenTUI's musl library fixed in; run in Alpine by CI.
- [x] **14.6** Decide slipbox's licence: MIT, Apache-2.0, or both; then a `LICENSE` file and the notices it ships
  (D193): Apache-2.0, the packs and the formula carrying it (2026-10-12, GR-D3).
- [x] **14.7** Installer: `curl … | sh`, the sums inside; a folder per version, `current`, `~/.local/bin`.
- [x] **14.8** `slipbox uninstall`: every path listed first, removed only with `--yes`; `--purge` all four.
- [x] **14.9** Folders: XDG's on Linux and macOS, as now; Windows' own (`%APPDATA%`…); `CACHEDIR.TAG`.
- [x] **14.10** Supply chain: exact pins, a 7-day cooldown, no install scripts, a licence gate, actions by hash.
- [x] **14.11** Language servers (`19.5`) installed from a full lockfile slipbox ships; behind ones reinstalled.
- [x] **14.12** Windows through WSL: the Linux release; Windows' clipboard, fonts; notes on its drives, said.
- [x] **14.13** On a real Mac before the first release: Apple's SQLite runs FTS5 and `bm25`; the binaries' signatures.
  Answered by CI's macOS runs on every change and the release builds: the search tests pass on Apple's SQLite; each
  Mac binary is signed ad hoc again and verified (2026-10-12, GR-D9).
- [ ] **14.14** Native Windows, staged: `.zip` packs (x64, arm64), a PowerShell installer; `upgrade`, `uninstall` there.
- [ ] **14.15** Native Windows: note paths kept with `/` from every `relative()`; path checks by `sep`, not `/`.
- [ ] **14.16** Native Windows: `:!` through `cmd.exe`, editors, the clipboard, processes and signals.
- [ ] **14.17** Native Windows: the test suite on a Windows runner; the TUI in Windows Terminal.
- [x] **14.18** Intel Macs dropped: no build, test job or formula block after 0.3.0, the last built for them; the
  installer and `slipbox upgrade` say so there, naming 0.3.0 (2026-10-17, D238).
- [x] **Crash reports**: Bun's own, sent on macOS and Windows unless `DO_NOT_TRACK` is set: turned off at start
  (D221; task T1).

## Performance (`15.x`)

*Not a phase: future optimization, not scheduled, found in the phase 2 review; neither matters for ordinary notes.*

- [x] **15.1** Incremental layout: parse by chunk, render by block, source mode by line; big notes on threads.
- [x] **15.2** Pathological nesting, as a cap: nesting past 60 renders as text, quadratic parser inputs tamed.

## Files beyond markdown (`16.x`)

*Phase 3b. Decided 2026-09-29 (D107). In order: the groundwork first, then each group.*

- [x] **16.1** File groups: which extensions are notes, data, text; their config (other note formats off).
- [x] **16.2** A reader per format (blocks with lines, headings, links, tasks, a tree); markdown the first.
- [x] **16.3** The walk and index see data and text files: link targets by path; the graph stays notes.
- [x] **16.4** Any text file opens (source mode only for code); the CLI's writers take all groups; `ls --files`.
- [x] **16.5** Explorer: notes and renderables, a key for all text files, patterns; `ctrl+p` and find follow.
- [x] **16.6** Lazy loading: parsers and grammars loaded on first use.
- [x] **16.7** Tree-sitter (TS, Python, shell, Lua, Go, Rust): multi-line strings and comments over highlight.js.
- [x] **16.8** Code outline and breadcrumb: functions, classes, methods, from a query per language.
- [x] **16.9** Syntax errors in code: gutter mark, underline, status count, out of insert; syntax only.
- [x] **16.10** Links in code comments: paths that resolve, `path:line`, URLs; into the graph as backlinks.
- [x] **16.11** Render TOML and INI: sections as headings, key–value rows, comments dimmed, records as tables.
- [x] **16.12** Render YAML and JSON the same way: nested objects as headings to a depth, then rows.
- [x] **16.13** Render CSV/TSV as a table: header detection, lazy layout past a size.
- [x] **16.14** Data files' lens (blocks: sections, keys, rows); a parse error on leaving insert → source mode.
- [x] **16.15** Links out of data files: paths that resolve, URLs, `$ref`, includes; into the graph.
- [x] **16.16** Dropped (built, then removed 2026-09-30, D112): Org as a note format.
- [x] **16.17** Dropped (built, then removed 2026-09-30, D112): AsciiDoc as a note format.
- [x] **16.18** Swift: grammar, highlighting, outline (built from source into `grammars/`).
- [x] **16.19** HTML and CSS, SCSS with it: grammars, outlines (HTML's headings and ids, CSS's rules).
- [x] **16.20** PHP; its HTML highlighted as HTML.
- [x] **16.21** Dockerfile: its stages in the outline.
- [x] **16.22** Vue, Svelte, Astro (and a page's scripts and styles): each part in its own language.
- [x] **16.23** Decided and done (2026-10-07, D123): Ruby and C/C++ have grammars, as the rest.

## Vaults (`17.x`)

*Phase 4. Decided 2026-09-30 (D42). In order: roots and storage, then names, then links across vaults, then the
TUI, then renames.*

*Revised by `20.x` and `21.x`: `17.2` and `17.8` removed in `20.22`; `17.4`'s `previous_names`, `17.6` and `17.7`'s
`previous_names` in `21.12`; `17.14` shows the named folders (`21.10`); `17.3`'s id keying replaced by state by root's
path (`21.8`); `17.12`'s redirect following removed in `20.22`; `17.18` revised `17.1` (2026-09-30, D44), and
`20.3` and `21.1` revised it again. `17.15` is where `7.1`–`7.3` landed; `7.4` (undo) came after. `17.20`–`17.24`
(decided the morning of 2026-10-02, D55) made a folder enough. The items record what was built.*

- [x] **17.1** Roots: the nearest `.slipbox/`, else the home vault; never `~` or `/` (revised by `17.18`).
- [x] **17.2** The home vault: `~/.local/share/slipbox/home/`, made on first use; loose files' links look beside.
- [x] **17.3** Storage keyed by the vault's id; state kept by path before ids moved over once.
- [x] **17.4** Vault identity in `.slipbox/config.toml`, `[vault]`: `id`, `name`, `aliases`, `previous_names`.
- [x] **17.5** Distinct names suggested: a vault's (`x-plan` inside `x`; a known name refused), a new note's.
- [x] **17.6** The machine's vaults, `vaults.json`: recorded on each open; `slipbox vaults` lists them.
- [x] **17.7** Note `aliases` resolve like names; `previous_names` (vault and note) as a checked fallback, said so.
- [x] **17.8** Interwiki links `[[vault:name]]`, `#heading`, `|text`; "unknown vault", where it was last seen.
- [x] **17.9** Path links across roots: `[t](../other/x.md)` reaches the file in whichever root holds it.
- [x] **17.10** Following a link into another vault switches the TUI to it; back returns; its index refreshed.
- [x] **17.11** Backlinks across vaults, from each vault's index as of its last indexing.
- [x] **17.12** Moves detected by content hash; redirects kept in the state; a link to the old path follows them.
- [x] **17.13** Explorer: vault folders with their own icon, the vault's name dimmed beside.
- [x] **17.14** The launcher: `~`, or a loose folder opened without a file, shows the known vaults and the folder.
- [x] **17.15** Renames across vaults (with `7.1`–`7.3`): links fixed in every reachable vault after a preview.
- [x] **17.16** Path links as other tools write them: `../` out of the root, `~/`, absolute, `file://`; wiki too.
- [x] **17.17** Nested vaults known to each other unopened; paths into them; the demo vault holds two, to test.
- [x] **17.18** Every vault has `.slipbox/` with id and name; a git repository is offered, not assumed.
- [x] **17.19** Git worktrees: separate vaults of one repository, told apart from `.git`; the branch shown.
- [x] **17.20** Superseded by `20.x` (2026-10-02, before it was built).
- [x] **17.21** Superseded by `20.x` (2026-10-02, before it was built).
- [x] **17.22** Superseded by `20.x` (2026-10-02, before it was built).
- [x] **17.23** Superseded by `20.x` (2026-10-02, before it was built).
- [x] **17.24** Superseded by `20.x` (2026-10-02, before it was built).

## Explorer: making and changing files (`18.x`)

*Phase 4. Decided 2026-09-30 (D149).*

- [x] **18.1** Buttons: a new note and folder on the explorer's title; rename, move, delete on the selected row.
- [x] **18.2** Keys: `n` / `N` new note, folder (`space n n` too); `r` rename, `m` move, `d` delete, `u` restore.
- [x] **18.3** Folders renamed and moved like notes: every link to anything in them fixed, after a preview.
- [x] **18.4** Delete to the vault's trash (in its state), links that break said; restore; `:trash`.
- [x] **18.5** Copy, cut and paste (`y`, `x`, `p`): a copy (`name-copy`), or a move with links fixed.
- [x] **18.6** CLI: `slipbox cp`, `rm`, `trash [restore]`; `mv` takes a folder.
- [x] **18.7** A nested vault's row: its folder renamed, moved, deleted; a fourth button renames the vault.
- [x] **18.8** The move picker is a tree: the explorer's folds, `←` / `→` fold, typing filters under the parents.
- [x] **18.9** The selected row's buttons become one, `…` (and `.`): a menu of its actions, each with its key.
- [x] **18.10** Questions float in a window: the answer typed, OK / Cancel; a yes-or-no's Yes / No (`y`, `n`).
- [x] **18.11** `v` makes a folder a vault, `shift+v` a nested vault a plain folder; `init <folder>`, `deinit`.
- [x] **18.12** A plan's writes into another vault's files reach its index at once (a second rename finds them).
- [x] **18.13** Leader keys for every file action: `space n` notes, `space d` folders, `space v` vaults.

## Notes over time and by their shape (`22.x`)

*Not a phase: from the design's list of what was deferred, given IDs 2026-10-07.*

- [x] **22.1** A note's history: its commits (`git log --follow`), an older version read, the diff to it.
- [x] **22.2** Frontmatter checked by its document type's rules (required keys, kinds, values): Problems.
- [x] **22.3** Document types by their conventions (ADRs, skills, yours): listed, ordered, `] t` / `[ t`.

## Running nothing of a folder's own (`23.x`)

*Not a phase. Decided 2026-10-07; revises `19.6` (D172).*

- [x] **23.1** Decided: a folder's own code never runs unless you trust its root: the TUI asks, or `[trust] roots`
  (D172).
- [x] **23.2** Programs only from your config, `PATH`, your installs, slipbox's: never a folder's own.
- [x] **23.3** A server's settings yours alone: no folder's `.slipbox/config.toml` or `.vscode/settings.json`.
- [x] **23.4** Servers in safe modes (rust-analyzer, gopls, TS, pyright); ruby-lsp, sourcekit-lsp, lua… held back.
- [x] **23.5** Linters whose config is code not run: ESLint, stylelint, markdownlint-cli2's `.cjs`/`customRules`.
- [x] **23.6** git: no fsmonitor, hooks, filters or drivers (`--attr-source` from the empty tree), no textconv.
- [x] **23.7** `[trust] roots` (paths, `~`, globs) in your config only, never a root's; the CLI never asks.
- [x] **23.10** The TUI asks once per root when it matters; answers in `trust.json`; `:trust`, `:untrust`.
- [x] **23.8** `slipbox doctor` and the TUI say a root isn't trusted, once, and what that limits.
- [x] **23.9** Bun reads no `bunfig.toml` or `.env` of its folder (2026-10-07; the compiled binary 2026-10-10).

## Code as a notebook (`24.x`)

*Not a phase. Decided 2026-10-07 (D125). `24.9`, decided 2026-10-09 (D130), replaced "Rust, Go mapped":
`24.11`–`24.16`'s TypeScript and Python became the generic view and its exceptions, their tests the proof nothing was
lost.*

- [x] **24.1** Decided: tokens verbatim, whitespace and decoration ours; shared categories mapped per language
  (D125).
- [x] **24.2** TS, TSX, JS: the document view by default (`[render] code`), `space n v` to source.
- [x] **24.3** Definitions as titles: kind in the margin, name bold, keywords dim; a blank row before each.
- [x] **24.4** Doc comments rendered as markdown; JSDoc's tags a definition list.
- [x] **24.5** Imports folded into one row naming them; `enter` unfolds.
- [x] **24.6** Long lines broken at their structure; the author's breaks kept, line numbers the file's.
- [x] **24.7** Indent guides; braces and semicolons dimmed.
- [x] **24.8** Folding any definition: `▾` / `▸`, `space k f`, `z a` (editing a row in place is `24.17`).
- [x] **24.9** The code view generic: each grammar's own queries, conventions as exceptions (D130).
- [x] **24.10** The lens on code: a line, a doc comment, the imports as written, highlighted; `esc esc` back.
- [x] **24.11** Comments as prose: markers gone; separators as sections; after code, notes in the margin.
- [x] **24.12** Python: docstrings above their definitions; JSDoc, Google, NumPy, reST read into one shape.
- [x] **24.13** A notebook: prose at full width, a cell per definition (boxes or bands), its header's buttons.
- [x] **24.14** Cells touch; tree lines join a class to its members, two columns in; a comment a cell.
- [x] **24.15** Boxes of a top and a left line, blank rows around them; the tree's lines; comments keep lines.
- [x] **24.16** The lens on code opens on the cursor's cell whole when it fits, and moves cell to cell.
- [x] **24.17** Dropped (2026-10-09, D131): typing in a row in place: the lens is where notes and code are edited.
- [x] **24.18** Dropped (2026-10-08, D129): folding inside a cell, an `if`'s body, a loop's: a cell folds whole.
- [x] **24.19** A definition's long signature: a parameter a row, `)` at its indent; not calls.
- [ ] **24.20** Deferred, see [Later](#later).
- [x] **24.21** A receiver dimmed with its `.` or `->` (`this.`, `self.`, `$this->`), not bare; with `24.9`.
- [x] **24.22** A licence header, or a "generated" banner, folded into a row naming it, as the imports are.

## Editing fundamentals (`25.x`)

*Not a phase. Decided 2026-10-09 (D155); built in this order, before git (`26.x`). `25.6` decided 2026-10-10
(D157). `25.7` is the part of `13.1` that runs what you type yourself; the rest of `13.x` stays deferred. `25.8`
was added 2026-10-09 at the user's asking.*

- [x] **25.1** Indentation per file: `.editorconfig`, else the file's own, else its language's.
- [x] **25.2** Comments toggled: `gc` and a motion, `gcc`, a selection's lines, `ctrl+/`; each language's.
- [x] **25.3** Brackets: `%` to the matching one (a motion too), both marked; pairs closed as typed, opt-in.
- [x] **25.4** Replace across files in the TUI: previewed as a rename is, undoable; `replace --all`.
- [x] **25.5** Word completion without a language server: the open files' words, `ctrl+n` / `ctrl+p`.
- [x] **25.6** Spelling in notes: misspelt words marked, their suggestions, a word added to your own list.
- [x] **25.7** A command run: `:!cmd`, its output in a window; lines filtered through one (`:'<,'>!sort`).
- [x] **25.8** A server's snippets: their tab stops and placeholders filled in turn, `tab` to the next.

## Git in the editor (`26.x`)

*Not a phase. Decided 2026-10-09 (D156); built after `25.x`. The working tree's git, where `5.11`–`5.14` and
`20.21` read at the branch's level.*

- [x] **26.1** Changed lines in the gutter against what's staged, unsaved text too; `]c` `[c`; preview, undo.
- [x] **26.2** Source control by the explorer: staged, changed, untracked, conflicts; stage, unstage, discard.
- [x] **26.3** Commit: its message in a floating editor; amend. Not trusted: its hooks don't run; it says so.
- [x] **26.4** Blame: who changed the cursor's line, when, the commit's message; a file's history with `22.1`.
- [x] **26.5** Branches: switched to or made from a picker, unsaved notes saved or kept first.
- [x] **26.6** Stash; fetch, pull (fast-forward), push: asked for, never automatic; ahead and behind on the status
  line. Deferred 2026-10-10 (D158), taken up by GIT (GIT-D4, GIT-T3); a conflict's ours, theirs or both is GIT's merge
  screen (GIT-D5).
- [x] **26.7** A branch's base given on opening (`--base`), a remote branch, tag or commit as a base, and the CLI's
  `changed` and `diff` measuring as the screen does (D255, #210).

## User documentation

*Not a phase. Accepted 2026-10-11, the first workstream after the initial design; consolidated the same day.*

- [x] **[User documentation](workstreams/archive/user-docs/README.md)** (DOC): guides and a manual in `docs/`, for
  the people who use slipbox; the keymap, configuration and CLI references became the manual's chapters (consolidated
  2026-10-11).

## What the docs found

*Not a phase. Accepted item by item 2026-10-11.*

- [x] **[What writing the docs found](workstreams/archive/doc-findings/README.md)** (DF): the bugs, the code and the
  design brought together, the gaps closed, and screenshots in the guides, as the user settled each (consolidated
  2026-10-12).

## The repository

*Not a phase. Accepted 2026-10-12, with the user's choices: public, Apache-2.0, the blueprint published.*

- [x] **[A green repository](workstreams/archive/greenrepo/README.md)** (GR): the repository to greenrepo, the user's
  standard: the licence, hardened CI on Linux and macOS, the repository's documents, the upkeep; published on GitHub,
  previews and the one-line installer, then the first release, 0.2.1 (consolidated 2026-10-13).

## The terminal tests

*Not a phase. Accepted 2026-10-13; started once #26, the lens's regression, is fixed.*

- [x] **[Terminal tests, headless and by feature](workstreams/archive/terminal-tests/README.md)** (TT): the terminal
  tests on
  Bun's pseudo-terminal and a headless xterm, in parallel and in CI on Linux and macOS; one check per feature, tied to
  the reference set's cases, coverage checked; content from the sample folders only.

## The documentation site

*Not a phase. Accepted 2026-10-14; consolidated the same day.*

- [x] **[The documentation site, and docs a newcomer can follow](workstreams/archive/docs-site/README.md)** (DS): the
  docs as a Starlight site on GitHub Pages, gathered from `docs/`; a front door with a path for each reader, a quick
  start, the concepts and an agent guide; every page's prose in plain sentences, the reference chapters' too; the
  familiar keys first (consolidated 2026-10-14).

## The big files split

*Not a phase. The user's, 2026-10-15 (D235): next, after VV-T2, VV-T4, VV-T7 and GIT-T3 land, before the rest of VV
and GIT.*

- [x] **The split**: `src/tui/app.ts` (11,500 lines, 436 methods) by concern — the explorer, the git panel, the lens,
  views and scrolling, the mouse, overlays and the peek, vaults and sessions, indexing and the watcher, find, conflicts
  — `App` keeping the shared state and the wiring; `cli.ts`, `draw.ts` and `actions.ts` likewise; each file under 1,500
  lines, the caps in `scripts/check-size.ts` lowered as they go. No behaviour changes; the terminal tests are its net.
  Done 2026-10-15: `App`'s features each a controller of its own, `draw.ts` by region, `actions.ts` by command area,
  `cli.ts`, `graph.ts`, `rename.ts` and `render.ts` by concern; no file past the limit, `CAPPED` empty.

## Vaults and the explorer's view

*Not a phase. Accepted 2026-10-15, settled in conversation the day before; the git workstream follows it. Built
2026-10-15 to 17; consolidated 2026-10-17, VV-T9's docs and screenshots still being written.*

- [x] **[Vaults and the explorer's view](workstreams/archive/vaults-and-view/README.md)** (VV): "vault" for every
  folder with a marker, home a vault without one, Elsewhere for the rest; the explorer as one tree, its view zoomed, a
  breadcrumb; links followed only when allowed; another vault's file in a peek; busy folders listed, a row's marks at
  its right; the git panel following the vault (consolidated 2026-10-17).

## Git: reviewing, diffing and merging

*Not a phase. Accepted 2026-10-15, after VV, whose vaults it follows. Built 2026-10-15 to 17; consolidated
2026-10-17, GIT-T8's docs and screenshots still being written.*

- [x] **[Reviewing, diffing and merging what an agent changed](workstreams/archive/git-review/README.md)** (GIT): an
  agent's change reviewed a hunk at a time, kept, reverted or noted; the git panel by mouse, with the branch's changes,
  the branches and their worktrees, each against its own base; fetch, pull, push and stash (`26.6`); diffs with their
  changed words, a note's before and after, code's scrolling sideways and side by side; a merge screen, with pulling
  where both sides moved and rebasing onto the base (consolidated 2026-10-17).

## Deferred maintenance review (`27.x`)

Accepted for later evaluation, not implementation. Evidence, qualifications and design questions live in
[the maintenance-gap review](research/maintenance-gaps.md). These items are separate from ENG and do not change
current requirements or product behavior. Start any resulting design change through its own workstream.

- [ ] **27.1** Evaluate a performance regression guard: small headless timing subset or comparable scheduled trends.
- [ ] **27.2** Evaluate an accessible plain CLI follow workflow, including real screen-reader validation.
- [ ] **27.3** Evaluate test-file size ratchets and splitting by owner with reusable fixtures.
- [ ] **27.4** Evaluate a local diagnostics bundle, with explicit collection scope and privacy-preserving defaults.
- [ ] **27.5** Review documented continuity and an isolated recovery drill; account-access changes remain owner choices.
- [ ] **27.6** Evaluate a non-blocking screenshot-refresh reminder for relevant UI changes.


## Documentation people can follow

*Not a phase. Accepted 2026-10-19 (DOCS-D2); merged and in use; consolidated 2026-10-26.*

- [x] **[Documentation people can follow](workstreams/archive/documentation/README.md)** (DOCS): the agreed learning
  path,
  guides, topic pages, reference and screenshots (DOCS-T1, DOCS-T2).

## Later

Agreed, but not scheduled.

- [ ] **10.13** Colour emoji in a PDF: the colour emoji font's own pictures, in a line (`10.11`; deferred 2026-10-09,
  D189).
- [ ] **13.1** Tier 0: commands shelling out with context substitution; `25.7` built the part that runs what you type
  yourself (deferred 2026-10-09, D37).
- [ ] **13.3** Sink: suspend and run in the foreground (deferred 2026-10-09, D37).
- [ ] **13.4** Sink: scratch or output buffer (deferred 2026-10-09, D37).
- [ ] **13.5** Sink: embedded terminal; optional, and never the path everything routes through (deferred 2026-10-09,
  D37).
- [ ] **13.6** Optional external-pane providers with a null backend, built and tested first (deferred 2026-10-09,
  D37).
- [ ] **Settings screen**: slipbox's own settings as a TOML screen on the data files' render, with the config's schema
  (defaults, allowed values, unknown keys) (`16.x`, D107).
- [ ] **24.20** Tabular code in columns: assignments, enum members, keys; columns inside rows (deferred 2026-10-09,
  D132).

The design's deferred list was sorted 2026-10-07, and most of it now has IDs: Mermaid and LaTeX are `12.10`–`12.11` and
`12.15`–`12.17`; composing notes, `10.9`; a note's history, frontmatter rules and document types, `22.x`; the live
checks with native servers, `19.23`. Diffs and git awareness are built (`5.11`, `5.13`, `5.14`, `20.21`), and the
working tree's git is `26.x`. Tier 2 plugins are dropped (D36). Anything else under the
design's community-plugin tier ([ideas.md](ideas.md)) gets an ID when it is scheduled.
