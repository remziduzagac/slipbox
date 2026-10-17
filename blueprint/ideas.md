# Ideas

Proposals and alternatives, by topic, each with the date it came up and, once settled, its outcome: chosen, not
chosen or deferred, with the decision that settled it; built, with its roadmap step, where no decision covers it. An
idea without an outcome is still open. Nothing here is agreed: the decisions are.

## Product

- Just use nvim plus render-markdown: nvim technically has every other feature on the list. Re-proposed three times
  while the idea took shape. (2026-09-24) Not chosen (D2).
- Fork leaf (`RivoLink/leaf`, Rust, MIT), the rendering quality bar, keeping its renderer and rewriting the rest; it
  can't be wrapped, being a binary-only crate. (2026-09-25) Not chosen (D4).
- Remote vaults: mounting or syncing a vault across machines, `lazyrsync` the candidate. Out of scope as written: you
  work on the machine that holds the repository, reaching it by SSH and running slipbox there. (2026-09-25)
- Describing slipbox as an AI companion with a comprehensive editor, its scope raised past small edits in the
  requirements; saying it has no AI of its own; leading with "notes app". (2026-10-13) Not chosen (D226): the
  description names the coding agent, and the editor is necessary and sufficient.

## Stack

- Switch to Rust and build on `basalt-core` and `basalt-widgets`: a ready domain layer, ratatui's maturity, and a
  genuinely small binary instead of Bun's tens of MB with an embedded runtime. (2026-09-25) Not chosen (D5).
- Contribute to basalt instead of building, the same posture as leaf's issue #298: its limitation list is slipbox's
  feature list, and its architecture invites contribution. Worth watching. (2026-09-25) Not chosen (D5).
- Stay on Bun and TypeScript: basalt is prior art, its UX and limitations studied, none of its code reused.
  (2026-09-25) Chosen (D5).
- Node.js 26.4.0+ with `--experimental-ffi` instead of Bun, OpenTUI's other runtime floor: possible, not comfortable.
  (2026-09-25) Not chosen (D5).
- Ink for the TUI: v7.1.1, nine years old, safer on every conventional measure. (2026-09-25) Not chosen (D6).
- OpenTUI's `Markdown` component on marked, customised through its `renderNode` hook (Path 1). Still worth an hour to
  see how OpenTUI's defaults look. (2026-09-25) Not chosen (D7).

## Architecture

- zk as the engine: shell out to `zk` for the graph, backlinks, search, tags and templates. (2026-09-25) Not chosen
  (D8).
- zk as an optional enhancement tier, the same shape as pandoc and the multiplexers: never a dependency, and no reason
  to skip writing the native layer. (2026-09-25)
- Consume `markdown-oxide`, a PKM language server, for link following, backlinks, rename and tags. (2026-09-25) Not
  chosen (D10).
- Depend on a notes library: `obsidian-utils`, `obsidian-vault-parser`. (2026-09-25) Not chosen (D10).

## Agent surface

- A server like nvim's, which agents connect to and drive: a socket to the running TUI would see unsaved buffers and
  could raise its prompt. (2026-09-25) Not chosen for now (D13); D17's Verify says when it comes forward.
- Plugins per coding agent: a Claude Code skill, a Codex extension. (2026-09-25) Not chosen as the mechanism (D13); one
  skill teaches the CLI (D22).
- The command list and output schema (`9.1`), once the shape (a CLI) and the cross-process semantics (disk is the
  contract) were settled. (2026-09-25) Chosen (D18).
- Lock files between the TUI and the CLI. (2026-09-25) Not chosen (D17).
- Shadow copies of unsaved buffers for the CLI to read: the tempting one and the worst, since an agent would work
  against content that never existed. (2026-09-25) Not chosen (D17).
- The CLI raising the TUI's conflict prompt. (2026-09-25) Not chosen (D17).
- The CLI refusing to write a file that is open and unsaved in the TUI. (2026-09-25) Not chosen (D17).
- Expose the link graph over the CLI, so agents do graph-based retrieval (`karpathywiki` runs Personalized PageRank
  over the wiki-link graph) with no LLM work in slipbox: slipbox owns the graph, agents own the reasoning.
  (2026-09-25) Chosen (D27, D32).
- The skill as a package installable with npx, for the common harnesses (Claude Code, Codex and the like): today it
  installs only from a source checkout (`scripts/install-local.sh --skill`), so a release install has no way to give
  an agent the skill. The user's answer when DF settled it (C3). One skill still (D22), packaged per harness, which
  touches D13's "not chosen as the mechanism". (2026-10-11) Open: a workstream of its own, to scope (the package's name,
  the harnesses, publishing to npm). (2026-10-12) A release install has the skill now, from the binary (`slipbox skill
  --install`, GR-D10); the package per harness is still open.
- How agents and slipbox work together, in more detail. (2026-10-11) Open: the user's note, to discuss later.
- Send the scratch to the agent in one key: in herdr, `herdr agent prompt` puts it in as the agent's next message, as
  plannotator-tui sends its feedback ([research/plannotator.md](research/plannotator.md)); copied and pasted
  (`space s c`) elsewhere. (2026-10-14)
- Remember what was sent to the agent: send only what is new since the last send, then finish and archive, as
  plannotator-tui's `E`, `S` and `F`. The scratch has no notion of "given to the agent". (2026-10-14)
- Review an agent's reply, not only its files: its recent replies, read from its session's transcript (Claude Code,
  Codex and others), opened as a document to read, mark and answer, as plannotator-tui's `last`. (2026-10-14)
- A pane's recent output as a document to review, as Plannotator's herdr plugin does with `herdr terminal`.
  (2026-10-14)
- The skill teaching a loop: the agent writes its plan, opens it in slipbox for review and ends its turn; the review
  comes back as its next message, as plannotator-tui's draft skill has it. (2026-10-14)
- Annotations that leave the document alone: a selection marked as a comment, an approval or a rejection, kept outside
  the file and sent numbered with its lines, as plannotator-tui does. To weigh against the scratch's At and Note
  entries, which are a note of their own. (2026-10-14) Not chosen for reviewing a change (GIT-D3): its notes go to the
  scratch, sent in one key.

## Capture

- The CLI moves earlier than planned, so nvim captures from the code buffer through it: the catch in v1's second
  done-test (`8.1`). (2026-09-25) Chosen (D19).
- An nvim-side sender keeping its own local scratch. (2026-09-25) Not chosen (D19).
- Rewrite phase 2's second done-test. (2026-09-25) Not chosen (D19).
- Quick capture from anywhere: `slipbox capture "text"` appends to an inbox note from any shell, CLI-shaped, so agents
  use the same entry point. (2026-09-25) Chosen (D19), appending to the scratch.
- Keep the scratch inside the vault, where agents can see it. (2026-09-25) Chosen as an option (D20); the state
  directory is the default.
- Keep the scratch in the cache directory, `~/.cache/slipbox/<hash>/`, where git cannot see it: the place reserved for
  derived data. (2026-09-25) Not chosen (D20).
- A custom scratch format. (2026-09-25) Not chosen (D20).
- Capture, templates and macros, as `quickadd`, overlapping `knap` and the scratch capture. (2026-09-25) Capture chosen
  as `slipbox capture` (D19); templates and macros open.

## Context bundle

- Context bundle export, possibly the centre of gravity: "this note, plus its backlinks, plus everything it links to,
  as one blob" for an agent; the scratch generalised through the link graph, done deterministically, with a depth
  limit; naturally CLI-shaped. (2026-09-25) Chosen (D32).
- One assembler (`10.1`) for export, the context bundle and composing notes, so three features get cheaper.
  (2026-09-25) Not chosen for the bundle (D32); export and composing notes share it (D179).
- A limit on characters rather than files. (2026-10-01) Not chosen (D32).

## Configuration

- A setup screen on the first run, choosing the options people most often change: the theme, the glyphs, the keys'
  leader, where new worktrees go (`[git] worktrees`). The user's, while answering the git workstream's questions.
  (2026-10-15)
- A JSON config. (2026-09-25) Not chosen (D12).
- A TypeScript config. (2026-09-25) Not chosen (D12).

## Phasing

- v1, a first cut of read-and-navigate plus capture: a vault by its marker; rendering with the table allocator;
  wikilinks, backlinks, unresolved links; outline, switcher, literal search; positions, several notes open; scratch
  capture; the `$EDITOR` hand-off; one theme plus the base16 loader. (2026-09-25) Not chosen as the schedule (D30).
- Waiting outside that cut: export, inline images, the full theme set, embeds, heading and block references, aliases,
  templates, the tags view, page preview, git awareness, the CLI and agent surface, plugins, Mermaid and LaTeX.
  (2026-09-25) Not chosen as the schedule (D30); the CLI came forward to phases 1 and 2 (D16).
- v1's done-tests: it replaces leaf for reading this repo's `docs/`, and the scratch capture replaces
  `prompt-buffer.lua`; both measurable, both things already done daily. (2026-09-25) Chosen (D30), as the finish lines
  of phases 1 and 2.
- The `$EDITOR` hand-off in phase 2, as the v1 cut lists it. (2026-09-25) Not chosen (D28).
- The LSP face in phase 3. (2026-09-25) Not chosen (D29).

## Process

- Snapshot tests on rendered output, and property tests on the table allocator: its upstream bug (minimum widths
  checked only in aggregate) is known, and generated inputs find its siblings. (2026-09-25) Built (`0.4`, `2.3`).
- Backfill workstreams for the past phases. (2026-10-11) Not chosen (D210).
- Keep the plan's item IDs as the decisions' IDs. (2026-10-11) Not chosen (D210).
- Drive a running slipbox from inside it, for the terminal tests and the screenshots, as ttt's `--exec` does (keys,
  typing, waiting for text, a screenshot): steadier and faster than reading a headless terminal's screen, and the
  screenshots without a herdr pane. Over a socket, as ttt's `--listen`, it would be D13's server, not chosen for agents
  for now. (2026-10-14)
- Random input: thousands of random keys and events against the app, each crash's log replayable, as ttt fuzzes in
  Docker. (2026-10-14)

## Roots and vaults

- A git checkout's top as a root by itself, without a marker: a git-root fallback. (2026-09-25) Not chosen (D38);
  offered, not assumed (D44); chosen (D58, D69).
- A bare `.slipbox.conf` file as the marker, rather than a `.slipbox/` directory. (2026-09-25) Not chosen (D38).
- Worktree awareness: one vault per repository doesn't answer several worktrees of one repository; `git rev-parse
  --git-common-dir` finds the shared repository, and a `[[link]]` differs per branch, which argues for separate vaults
  aware of their siblings over one merged vault. (2026-09-25) Chosen (D54).
- A `~/.slipbox/` marker for the home vault. (2026-09-30) Not chosen (D43).
- The home vault as one namespace, by indexing `~` or counting the files this machine opened. (2026-09-30) Not chosen
  (D43).
- A folder-name stand-in for a vault's name; state keyed by path; a second kind of root. (2026-09-30) Not chosen
  (D44); state by path chosen later (D76), a folder's own name never (D74).
- "Workspace" or "project" for the folders slipbox works in, rather than vault: VS Code's users know a workspace as a
  window's set of folders, and a project reads as code. (2026-10-14) Not chosen (VV-D1).
- Several trees in the explorer at once, or a workspace of several vaults open together; or always the whole home
  tree. (2026-10-14) Not chosen (VV-D5): two trees becoming one confused; the whole home tree is noisy and deep, and the
  view reaches it by zooming out.
- Busy folders left out by name only where they're a tool's: `build`, `vendor`, `target`, `dist` or `cache` in an
  Obsidian vault or a `.slipbox/` folder are as likely a person's notes, and today they're never indexed there, nor
  can a setting bring one back (design/roots.md § The walk). By the vault's kind, by what the folder holds, or a
  setting. Until then, nothing new is put there: a new note, a move or a copy into one is refused. (2026-10-17) Open.
- The busy folders' case: a cache is one in any case (`Caches`, `PIP-CACHE`), the other names only as listed, so
  `Build/` or `Target/` is indexed where `build/` isn't. Exact as now, any case for all, or by git's `core.ignorecase`
  (insensitive on macOS) as `.gitignore` is (design/roots.md § The walk). (2026-10-17) Open.
- A vault whose own folder is hidden or has a busy folder's name (`~/.dotfiles`, a repository cloned into `vendor/`)
  is never found by the background index, nor indexed as a vault nested in another: the skip list and the busy
  folders are checked before the markers. (2026-10-17) Open.
- Un-following a link: a followed link's answer is kept until the link leads elsewhere, with no command, menu or CLI
  to take it back; and a "no" kept asks again at every open, as no answer does. (2026-10-17) Open.
- A link not followed still has its target statted on the main thread, by the walk, Elsewhere's listing and the
  explorer: a mount that hangs behind it can hold them up; only followed links are probed off the thread.
  (2026-10-17) Open.
- A folder link out of the vault goes into the vault holding it, from a peek too: looking moves you there, where
  VV-D7 says it never does. Peek at a folder, or ask. (2026-10-17) Open.
- A peek's cost and freshness: the first peek into a vault builds its graph on the main thread, and a backlinks list
  parses the notes changed since its index; the other vault's graph and its backlinks are kept, unwatched, until
  going into another vault. Built in the background, watched, or asked again on each peek. (2026-10-17) Open.
- The git panel's files of another checkout or branch shown in a peek, as VV-D7 and VV-D10 had them; they open in the
  diff window. (2026-10-17) Open.
- The git panel asking git again when the terminal gets the focus back (VV-D10): it asks when the panel is shown.
  (2026-10-17) Open.

## Storage and state

- A `.slipbox.local/` folder for personal data, travelling with the folder. (2026-09-30) Not chosen (D45); revisit
  only if personal data ever has to travel with a folder, or be visible beside it.

## Links

- Another root's data and code files' links as backlinks here: their links saved in the root's index beside its
  notes', code files read with their grammars at index time. (2026-10-11)
- Link resolution (`1.4`): name collisions, case sensitivity across macOS and Linux, and whether to follow Obsidian's
  path conventions so an existing vault opens unchanged. (2026-09-25) Chosen (D41).
- Links between vaults, left as a separate problem for later. (2026-09-25) Chosen (D47, D48).
- `file:line` references as first-class links: `prompt-buffer.lua` already emits `path:42-50`; jumping from a note to
  that line makes notes link into code. (2026-09-25) Chosen (D84): `#L42` in a note's links, `path:42` in code
  comments (`16.10`).
- Following a link to a note that doesn't exist offers to create it, optionally from a template. (2026-09-25) Built,
  without the template: the new-note prompt (design/tui.md § Following links).
- Keep links correct when files move, as `consistent-attachments-and-links`. (2026-09-25) Chosen (D143).
- Orphans, unresolved links and unused attachments, as `find-unlinked-files`: nearly free from the graph. (2026-09-25)
  Built for orphans and unresolved links (`1.7`, `9.5`); unused attachments open.
- Rename and merge tags across the vault, as `tag-wrangler`. (2026-09-25)
- A central index merged across vaults. (2026-09-30) Not chosen (D47).
- A rename journal. (2026-09-30) Not chosen (D49).
- Rewriting other vaults' files at rename time without asking. (2026-09-30) Not chosen (D52).
- Resolving a link to an old path through the redirects a move left. (2026-09-30) Chosen (D49), then not chosen (D56):
  a move is evidence for a repair, never a way to resolve.
- A compatibility layer reading wikilinks for Obsidian-style tools. (2026-10-02) Chosen (D71).
- A `post-merge` hook running the link fix, installed by default. (2026-10-02) Not chosen (D66).
- Relinking links between separate repositories to fit each machine's layout. (2026-10-05) Not chosen (D73): a
  repository shared by machines with different layouts gets "fixed" back and forth; pointers instead (D75).

## Reading

- Anchor a reloaded view by a node id or a content hash, `3.5`'s other candidates. (2026-09-25) Not chosen (D98).
- Un-render the line under the cursor to edit it in place, as nvim's anti-conceal does; tried in nvim for wrapped
  tables and rejected. (2026-09-25) Not chosen (D97).
- Narrow terminals: at 60 columns no table fits and the sidebar can't sit beside the content; pick the collapse
  deliberately. (2026-09-25) Built (`3.14`).
- The input model: vim-like keys, remappable from the first version rather than later, and whether the mouse is
  supported at all. (2026-09-25) Chosen (D11, D99, D106); the mouse is supported.
- A code block too wide for the window: its long lines wrapped, marked `↪` (as built until then); the whole window
  scrolled sideways for it, as with wrapping off; or the block scrolled sideways on its own, as GitHub's and VS Code's
  previews do. (2026-10-14) The block on its own chosen, wrapping kept as a setting (D233).

## Themes

- Reuse workslate's role names (`@theme_base_bg`, `@theme_text_fg`, `@theme_accent_bg`, …), so a theme ports between
  workslate and slipbox by copying values. (2026-09-25) Not chosen (D93).
- Syntax themes as downloaded data: VS Code theme JSON through shiki, or a converter to OpenTUI's TextMate-shaped
  `SyntaxStyle.fromTheme`. (2026-09-25) Not chosen (D93).

## Navigation

- A back/forward history stack, taken from frogmouth: following wikilinks without one leaves no way back but the
  switcher. (2026-09-25) Built (`3.6`).
- Reading position per note, from day one: leaf's `HistoryEntry` stores only a path, so returning to a file drops you
  at the top; cheap at the start, awkward to retrofit. (2026-09-25) Chosen (D141).
- Session restore: reopen the notes that were open; not Obsidian's workspaces, just not losing your place.
  (2026-09-25) Built (`3.15`).
- A switcher that finds headings and symbols, not just file names, as `darlal-switcher-plus`. (2026-09-25) Built
  (`19.14`).
- Recent files and favourites, as `recent-files-obsidian`. (2026-09-25) Recency built, in the quick switcher (`3.8`);
  favourites open.
- Fast browsing through breadcrumb dropdowns, as `quick-explorer`. (2026-09-25) The explorer's breadcrumb is built,
  a click on a folder zooming the view there (VV-D5); no dropdowns. (2026-10-17)
- A hierarchical parent, child and sibling structure beyond flat links, as `breadcrumbs`. (2026-09-25)

## Search

- Ranked full-text vault search, as `omnisearch`. (2026-09-25) Chosen (D114).
- `tobi/qmd` or `zk` as the search engine: the candidates, zk already shipping it, qmd the likely implementation.
  (2026-09-25) Not chosen (D114): an index of slipbox's own.
- Note similarity by embeddings, as `smart-connections`: possibly just `qmd` plus the link graph. (2026-09-25)
  Deferred (D124), with the outside engine.
- A row per section in the index. (2026-10-01) Not chosen (D115).
- Read files for the index with the markdown parser: a first build of a big vault would take a minute. (2026-10-01)
  Not chosen (D117).
- Scout, an outside engine behind the same API (semantic search, the graph), and `@slipbox/links` for it.
  (2026-10-01) Deferred (D124); `@slipbox/links` not chosen (D124).
- Improving search, cheapest first: partial matches ranked rather than all words or any; links (an in-link boost,
  one hop out from the top hits); word forms (porter for English, a stemmer or five-letter prefixes for Turkish); did
  you mean; identifiers split in code; a row per section (against D115); vectors per section, opt-in, fused by RRF
  (against D124's deferral). Measured first on 30 to 50 real queries, each change kept only if the score rises.
  (2026-10-11) Open: to look at later ([research/search-improvements.md](research/search-improvements.md)).
- A find-and-replace pattern that backtracks badly: Bun's engine gives up on one run after about a second and says
  "no match", so `(a+)+$` blocks the TUI a second per file and quietly misses matches there (found triaging CodeQL's
  #11, workstream GR). Run it in a worker with a time limit, or say a run was cut short. (2026-10-12) Open.

## Embeds

- Edit an embedded note inside the note that shows it. (2026-10-01) Not chosen (D113): every key would ask which note
  it's in.

## Files beyond markdown

- Data files: YAML, JSON and CSV viewed and edited; frontmatter is already YAML, so a YAML editor is most of a
  properties editor, and CSV to `TextTable` is nearly free. (2026-09-25) Chosen (D107, D108).
- Diffs, part of review too: a separate discussion, possibly a separate tool. (2026-09-29) Chosen (D154): a note's diff
  and a branch's changes are slipbox's (`5.13`).
- Write an edited data value back by re-serialising the file. (2026-09-29) Not chosen (D108).
- AsciiDoc rendered by asciidoctor.js, loaded lazily, beside a line scanner to index. (2026-09-29) Not chosen (D110).
- AsciiDoc's conditionals, attribute substitution and expanded includes, later, behind the same reader. (2026-09-29)
  Not chosen (D112), with AsciiDoc.
- Org (through `uniorg`) and AsciiDoc as note formats, off by default. (2026-09-29) Built, then not chosen (D112).
- Prebuilt grammars from a bundle, `tree-sitter-wasms`. (2026-10-07) Not chosen (D121): its Swift is older.
- A file in several languages parsed with tree-sitter's included ranges on one parser. (2026-10-07) Not chosen (D122).

## Code view

- Draw code's tokens otherwise, such as `->` as `→`. (2026-10-07) Not chosen (D125).
- Map each language by hand, Rust and Go next. (2026-10-07) Not chosen (D130).
- Fold inside a cell: an `if`'s body, a loop's. (2026-10-08) Not chosen (D129).
- Type in a row in place, without the lens. (2026-10-09) Not chosen (D131).
- Tabular code in columns: assignments, enum members, an object's keys. (2026-10-09) Deferred (D132).

## Document types

- Document-type awareness: ADRs (numbered, "superseded by"), plans (threads, status headers) and skills (required
  frontmatter plus sections) recognised, for type-aware navigation; like Obsidian's Bases, but driven by conventions.
  (2026-09-25) Chosen (D133).
- Frontmatter validation: `SKILL.md` requires `name` and `description`, memory files `name`, `description` and
  `metadata.type`; a per-directory schema flags what is missing or malformed. (2026-09-25) Chosen (D133).
- A database, as Obsidian's Bases keeps. (2026-09-25) Not chosen (D133).

## Images

- Unicode half-block or quadrant blocks in true colour as the fallback ladder's middle rung, `chafa` the reference.
  (2026-09-25) Not chosen (D126).
- iTerm2's inline images (OSC 1337) as a third protocol, the only part of the capability layer OpenTUI lacks.
  (2026-09-25) Not chosen (D126).
- An `images = always` override. (2026-09-25) Not chosen (D126).
- Mermaid through `mermaid-cli` to a real PNG: a headless Chromium per diagram. (2026-09-25) Not chosen (D127).
- `mermaid-ascii` for diagrams in text: its labelled nodes are broken. (2026-09-25) Not chosen (D127).
- For `mermaid-ascii`'s broken labels: fix it upstream, or port `AlexanderGrooff/mermaid-ascii` (Go) or `mmdflux`
  (Rust, a crate leaf depends on). (2026-09-25) Not chosen (D127): `beautiful-mermaid` draws Mermaid.
- Mermaid's CSS variables flattened (`flattenVars`, `core/svg.ts`) loop on a variable whose value names itself after
  other text (`--a: (var(--a)`); only the library's own variables reach it today, so no note can (found triaging
  CodeQL, workstream GR). A guard on the depth. (2026-10-12) Open.

## Performance

- Targets stated rather than hoped for: 5,000 notes, first paint under a tenth of a second; past some size the graph
  builds in the background or from the cache while the first note renders. (2026-09-25) Built (`1.9`): measured at
  5,000 notes (design/how-it-works.md § Performance, measured).
- The large single note, a different problem: viewport-only rendering and incremental reparse. (2026-09-25) Chosen
  (D120).
- Parse pathologically nested notes off the main thread, the other half of `15.2`'s first wording. (2026-09-27) Not
  chosen (D111).
- Lay out only what's in view, the lever left for big notes; no ordinary note needs it yet (D120). (2026-10-01)

## Editing

- Live preview in the Obsidian model: the rendered view is the editor, and the cursor line reveals its source inside
  it. (2026-09-24) Not chosen (D134, D147).
- Build the in-app editor on OpenTUI's `Textarea`, with a modal layer over it. (2026-09-24) Not chosen (D146).
- A separate editor component, as leaf needed `edtui`. (2026-09-25) Not chosen (D136): `Textarea`'s primitives are
  native, and the vim grammar is a state machine over named actions.
- An `editor.command` template with `{file}` and `{line}` in config, since a line number has no portable form.
  (2026-09-25) Chosen (D145).
- Insert and jump between footnotes, as `obsidian-footnotes`. (2026-09-25) Chosen (D150); jumps built (`3.17`).
- Tables edited by tabbing between cells, aligned and reformatted, as `table-editor-obsidian`: high value, given how
  much the table allocator already matters. (2026-09-25)
- List and section editing: indent, move items, fold, as `obsidian-outliner`. (2026-09-25)
- Templates for new notes: `knap` already is one. (2026-09-25)
- Grammar and style checking, as `obsidian-languagetool-plugin`. (2026-09-25)
- Live preview as an explicit lens: whole blocks around the cursor as their markdown between two rules, the rest
  rendered. (2026-09-28) Chosen (D147).
- Tidy footnote definitions into reference order. (2026-09-30) Not chosen (D150).
- vim's marks, macros, named registers and block selection. (2026-10-09) Not chosen (D155).
- nspell, pure JavaScript, for spelling: 950 ms and 250 MB to open Turkish. (2026-10-10) Not chosen (D157).
- Several cursors at once, each typing the same edit, as ttt and VS Code have ([research/ttt.md](research/ttt.md)):
  the desktop editor's answer to what vim's block selection does, which D155 left out. (2026-10-14)
- Format a file as it's saved, through its language server, as ttt does: `lsp.format` is a key today, never on save.
  (2026-10-14)
- A keymap without modes, as ttt's default is VS Code's: typing types at once, no `i` first, and vim's keys are an
  option. The familiar keys are bound already (DS-D6); `i` is what a desktop editor's user still meets. (2026-10-14)

## Concurrency

- A `W11`-style prompt on each external change, instead of a silent reload. (2026-09-24) Not chosen (D137).
- A short autosave delay, keeping the unsaved window under a second so conflicts are nearly impossible. (2026-09-24)
  Not chosen (D138).
- Save silently on quit with unsaved notes. (2026-09-24) Not chosen (D138).
- The watch's first moment on macOS: a watch starts a moment after it's asked for there, so a change made in that
  instant isn't heard, and nothing sweeps for it unless the watcher degrades (found by CI's Intel Mac, workstream GR).
  One sweep of the known notes' stats a second after the watch starts would catch it. (2026-10-12) Open.

## Write safety

- Text encodings round-tripped: CRLF, BOM, non-UTF-8 files, files without a trailing newline; a tool that rewrites
  notes must not "fix" anything it wasn't asked to. (2026-09-25) Built (`0.5`, `4.5`–`4.8`): a buffer keeps its
  file's BOM and line endings.
- Parse the frontmatter and serialise it again. (2026-09-28) Not chosen (D148).
- Delete a file by unlinking it. (2026-09-30) Not chosen (D149).
- Undo a rename by renaming back. (2026-10-01) Not chosen (D152).

## Git

- Git awareness, the strongest differentiator, since these vaults are git repositories: modified and untracked notes
  marked in the explorer; a note diffed against `HEAD` (OpenTUI ships a `Diff` component). (2026-09-25) Chosen (D154).
- Per-note history. (2026-09-25) Built (`22.1`).
- "What changed since I last looked": the review loop for agent-written notes, with watch mode and the `streaming`
  prop. (2026-09-25) The working tree's changes reviewed a hunk at a time are built (GIT-D3); "since I last looked" is
  still open. (2026-10-17)
- Take a branch switch's files for moves. (2026-10-01) Not chosen (D153).
- A diff drawn by OpenTUI's `Diff` component; a note's diff as reading lays the note out, its changes marked in place
  (GIT's first draft, which the user found would be confused with the note); a diff by character. (2026-10-14) Not
  chosen (GIT-D2): slipbox draws its own rows, a note's before and after, by word.
- A three-pane merge screen, base, yours and theirs side by side above the result. (2026-10-14) Not chosen (GIT-D5):
  too narrow beside an agent; the cards hold the same, a conflict at a time.
- Side by side for notes. (2026-10-14) Not chosen (GIT-D7): before and after shows a note's change where it is.
- A Worktrees section of its own in the git panel, the other branches in a picker. (2026-10-14) Not chosen (GIT-D9):
  one list of branches, a worktree marked on its branch.
- A fetch in the background; a git client's whole range (interactive rebase, cherry-pick, submodules, remotes, a
  commit graph, a forge's pull requests). (2026-10-14) Not chosen (GIT-D4, GIT-D1).
- A first-run screen choosing such options as where a new worktree goes (GIT-D13). (2026-10-15) Open.
- Tables for the diff window's, the review's, the merge screen's and the peek's own keys, as `[keys.git]` is the git
  panel's: their commands are bound in `[keys]` only. (2026-10-17) Open.
- Measure a branch's changes against the base branch's tip. (2026-10-01) Not chosen (D154).
- The changes marked in the scrollbar's track as well as the gutter, as ttt added (#895): where a file's changes are,
  at a glance. Not chosen with the signs (D225), as instead of them; raised again beside them. (2026-10-14)

## Linting

- Run this repo's linter, don't ship one: `markdownlint-cli2` against `~/.markdownlint-cli2.jsonc`, its violations
  inline. (2026-09-25) Chosen (D160).
- Rules or a formatter of slipbox's own: they would fight the rules and the `markdown-style` skill that already exist.
  (2026-09-25) Not chosen (D160).
- Format on save, as `obsidian-linter`, honouring this repo's markdownlint config rather than competing with it.
  (2026-09-25) The config honoured (D160); format on save open.

## Code intelligence

- Check whether `vscode-languageserver` runs cleanly under Bun (`11.1`) before relying on the three-face split: the
  LSP face must work without OpenTUI. (2026-09-25) Chosen (D170), verified 2026-10-01 (D9).
- Install native language servers too, as npm ones are. (2026-10-01) Not chosen (D162): the system is the user's.
- A settings format of slipbox's own for servers and linters: one more thing to learn and keep in step. (2026-10-01)
  Not chosen (D165).
- `vscode-languageclient` as the client's library: VS Code's own, it needs VS Code's API. (2026-10-01) Not chosen
  (D170).

## Trust

- Ask per folder or repository whether to trust it, or keep a list of trusted places. (2026-10-01) Not chosen (D171),
  then chosen (D177).
- `[trust] roots` in your own config as the only way to trust a root: opening a folder would mean editing a file.
  (2026-10-07) Not chosen (D177).
- The CLI asking whether to trust a root: an agent can't answer, and could be talked into it. (2026-10-07) Not chosen
  (D177).

## Export

- pandoc as the export engine, a hard dependency. (2026-09-25) Not chosen (D180).
- A headless-browser tier: slipbox's own HTML printed to PDF by a browser found on the machine (Chrome
  `--headless --print-to-pdf` honours `@page` and `column-count`), better than pdfkit for anything print-shaped.
  (2026-09-25) Chosen (D182), then not chosen (D184).
- A pandoc tier: when installed and configured, its targets (ODT, RTF, LaTeX, reST, MediaWiki, its PDF engines) as
  extra menu entries marked as pandoc's; a nicer DOCX from it offered as a preference. (2026-09-25) Chosen (D182),
  then not chosen (D184).
- Native PDF typesetting (`10.5`), the only genuinely hard part of export: how far to take it, and `pdfkit` or
  `@react-pdf/renderer` as the base. (2026-09-25) Chosen (D186): `pdfkit`, its lines laid out by slipbox (D188).
- `@react-pdf/renderer` for the PDF: flexbox layout, the mental model slipbox has through OpenTUI, so some structure
  might carry over. (2026-09-25) Not chosen (D186).
- Compose notes into one document: select notes, order them, export the result; the multi-note entry point to the
  assembler. (2026-09-25) Chosen (D179).
- Upload to Google Docs through its API: an API client, OAuth, stored credentials. (2026-09-25) Not chosen (D183).
- A one-step upload to Google Docs, if ever wanted: detect `rclone` or a `gdrive` CLI and shell out to it, the same
  detect-and-degrade shape, with no secrets of slipbox's own. (2026-09-25)
- Where an export goes, picked step by step: a list of places, then a folder from the root's tree or one browsed
  anywhere, then the file's name, `tab` completing a path. (2026-10-09) Not chosen (D190).

## Extensibility

- Tier 2: TypeScript modules loaded at startup that register commands, add panes or hook rendering as OpenTUI's
  `renderNode` does. (2026-09-25) Not chosen (D36).
- Plugins in Lua, in a sandbox, each capability asked for, with a community registry, as ttt has: the model if
  slipbox ever takes extensions; close to how it trusts a folder (D172). (2026-10-14)
- The optional multiplexer hand-off (`13.6`): whether "run it beside me" is worth building at all, beside the three
  built-in output sinks. (2026-09-25) Deferred (D37).

## Distribution

- Binaries for `darwin-arm64` and `linux-arm64` at minimum, probably `linux-x64` too, and a brew formula eventually,
  leaf's release assets the pattern; the install and update path still unaddressed. (2026-09-25) Chosen (D197, D199,
  D204).
- better-sqlite3 for the index: a SQLite of its own, the same everywhere, chosen with scout. (2026-10-01) Chosen
  (D191), then not chosen (D196).
- `bun:sqlite`, Bun's own SQLite API, the index's until 2026-10-01. (2026-10-01) Not chosen (D191, D196).
- Sign and notarize the macOS binaries from the first release. (2026-10-10) Not chosen (D198).
- Keep slipbox's folders in `~/Library` on macOS. (2026-10-10) Not chosen (D200).
- More ways to install, as ttt has: AUR, a Nix flake, binaries for Windows itself. (2026-10-14)

## Licence

- slipbox under MIT. (2026-10-09) Weighed; the choice parked (D193). (2026-10-12) Not chosen (GR-D3).
- slipbox under Apache-2.0. (2026-10-09) Weighed; the choice parked (D193). (2026-10-12) Chosen (GR-D3).
- slipbox under both, "MIT OR Apache-2.0". (2026-10-09) Weighed; the choice parked (D193). (2026-10-12) Not chosen
  (GR-D3).

## Documentation

- User documentation for people: guides for the tasks a newcomer meets, and a manual covering everything, in
  `docs/`. (2026-10-11) Taken up in (DOC); done, consolidated 2026-10-11.
