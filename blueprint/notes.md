# Notes

How slipbox's design was discussed and built, session by session, oldest first. No transcripts were kept before the
blueprint, and none were backfilled (D210): the sessions up to 2026-10-10 are converted from what the earlier documents
recorded, the handoff's dated updates, the plan's paragraphs on what was decided with the user, and the decisions'
dates. Each says what was asked, decided, built and found, and cites the decisions rather than restating them.

## Naming and scope (2026-09-24)

- The exploration began as "find a nicer way to read markdown than nvim", and ended with slipbox named and scoped: a
  terminal markdown notes app, starting from Obsidian's model without the GUI (D1; reframed 2026-10-02, D33).
- "Just use nvim plus render-markdown" was re-proposed three times while the idea took shape; nvim's rendering is the
  dissatisfaction slipbox answers, so it was ruled out and held as a constraint (D2; ideas.md § Product).
- slipbox is used inside herdr but never requires it or any multiplexer; a bare terminal over SSH is first-class (D3).
- The editing model: both an in-app editor for small edits and `$EDITOR` for anything substantial (D134); the hand-off
  first, the in-app editor right after the first cut (D135); what the editor can do settled when it's built (D136).
  Live preview in Obsidian's model was not chosen (ideas.md § Editing).
- Agents writing while you read: the vault watched, clean notes reloaded silently (D137); autosave on after a long idle
  delay (D138); a vim-shaped conflict prompt (D139); autosave never wins a conflict (D140).
- Two consequences for the first cut, agreed the same day: the in-app editor sits just outside it, and autosave and the
  conflict prompt travel with the editor, so the cut is read plus capture (D135).

## Scope and effort (2026-09-24 to 2026-09-25)

- The 1,500–3,000 line estimate is for the core only: app state, file browsing, root handling, the PKM layer, keymaps
  and rendering. Export writers, images, the theme system, git awareness, templates and an editing model plausibly take
  it past 15,000 lines before tests, and leaf spends about a third of its total on tests (research/prior-art.md
  § leaf). The two numbers had been used interchangeably, and the small one made the whole feature list look
  affordable.
- Nothing is a research problem: it is assembly of known solutions. The risk is volume, not difficulty.
- The one intricate piece is table layout: parsing GFM tables is solved, laying them out in a fixed width is the work.
  render-markdown's allocator is the starting point, with its known flaw fixed on the way across
  (research/prior-art.md § render-markdown.nvim's table allocator; D89). Display width is not only a table concern:
  it is decided once, in the layout stage (D88).
- Honest risk: feasibility isn't the risk; finishing is. A few weeks of evenings on something intended to be used can
  become something maintained instead.
- Hence a first cut, read-and-navigate plus capture, with two done-tests (ideas.md § Phasing). The phases became the
  schedule and the cut the statement of what "usable" means, its done-tests the finish lines of phases 1 and 2 (D30).

## Prior art, the stack and the plan (2026-09-25)

- **Research:** the prior art checked, leaf, zk, basalt, obsidian.nvim, frogmouth, nb and glow, in
  research/prior-art.md; the stack installed and measured, not assumed, in research/stack.md; images in the terminal
  in research/terminal-images.md.
- The stack: build rather than fork leaf (D4); Bun and TypeScript, not Rust on basalt's crates (D5); OpenTUI over Ink,
  pinned exactly (D6); remark, not OpenTUI's `Markdown` component (D7).
- The architecture: one core and its faces, the core importing nothing from the TUI (D8); an LSP face once the core is
  stable (D9); the notes layer in process (D10); every user action a named command (D11); TOML configuration (D12).
- The agent surface: a CLI, a server deferred, not rejected (D13); the CLI reaching every state change (D14); a small
  stable subset (D15); agents driving slipbox from phases 1 and 2 (D16); disk is the contract (D17); the command list
  read against zk and nb (D18); a skill teaching the CLI (D22).
- Capture: `slipbox capture` is the capture path (D19); the scratch per project, in state (D20); the clipboard by
  OSC 52 first (D21).
- Extensibility in three tiers, the built-in path standing alone (D23); arguments as argv, never a shell string (D159).
- The phases: 0 to 6+, moved only deliberately (D24), with their reasons (D25–D29); the phases are the schedule (D30).
- Roots and storage: a `.slipbox/` marks a vault root (D38); config, cache and state apart (D39); one walk for the
  index and the watcher (D40); links resolve by one policy, never the filesystem's (D41).
- Rendering: one width function (D88); the table allocator (D89); terminal escapes stripped (D90); themes built in,
  Tokyo Night by default (D91–D95); nvim's readability defaults, the cursor's line kept rendered (D96, D97); reload
  anchoring (D98); modes and dispatch (D99); images (D100–D104).
- Open notes and write safety: buffers, tabs and one split (D141); atomic writes, never outside the root (D142); a
  rename with link fixing previewed, confirmed and recoverable (D143).
- Export in scope, through an assembler of its own and writers slipbox has itself; Google Docs by a Word file
  (D178–D183).
- The design documents describe the code as built, and change with it (D206).
- **Standing risk:** OpenTUI is pre-1.0 and moving fast; pinning works, upgrades will not be free; mitigated by
  keeping the mdast-to-layout stage pure (D6).
- **Open (as idea.md left them):** search's engine (`6.1`), the scratch's place (`8.2`), the PDF base (`10.5`),
  worktrees, the multiplexer hand-off (`13.6`), and whether `vscode-languageserver` runs under Bun (`11.1`). ideas.md
  has each, with what settled it.

## Planning phase 0 (2026-09-25)

- Phase 0 is not generic scaffolding: every item in it is there because it is cheap now and expensive later (D24).
- Two items deserve special attention. `0.3`, a CI check that `core/` never imports `tui/`: the CLI must run without a
  terminal renderer, and only a check that fails the build keeps that true (D8). `0.8`, every action a named command
  from the first commit: the palette, the keymaps, the modal layer and any plugin tier consume the registry, and
  retrofitting it means touching every action (D11).
- Three decisions gated phase 0: `0.10`, the storage layout (D39); `0.11`, the walk (D40); `9.1`, the CLI command list
  (D18).
- `0.11` is the one most likely underestimated: vaults are git repositories, so the walk meets `node_modules/`,
  `target/` and vendored `README.md` files. Got wrong, `[[README]]` resolves into a dependency, the 25 ms graph becomes
  seconds, and the watcher subscribes to tens of thousands of files (D40).
- `0.11` and `5.2` are the same decision seen twice: what the walk excludes is what the watcher does not subscribe to;
  decided apart, they would disagree (D40).
- `0.10` has a second half that is easy to miss: what the per-vault hash hashes. An absolute path means state does not
  travel between the Mac and the VMs, and every git worktree of one repository keys separately (D39; later D45, D76).
- `1.9` is load-bearing earlier than it looks: with agents calling the CLI from phase 2, rebuilding the graph on every
  call is waste (D27, D17).
- The assembler appears three times, in export, the context bundle and composing notes: build `10.1` once (D179). The
  bundle later went its own way (D32).
- Autosave and the conflict prompt are dead code without the in-app editor: `4.7` and `5.5`–`5.7` wait for `4.3`
  (D135, D144).
- Constraints are not tasks: `2.9`, `7.5`, `12.5` and `13.2` live inside the items they constrain, or arrive later as
  an audit (D90, D142, D101, D159; requirements.md § Constraints).
- The demo vault holds `0.5`'s rendering fixtures: the wide-table case that started the project, a 1,231-line
  document, 216 dense table rows, a note covering every link form and display width. The vault cases live in the test
  vault (design/testing.md).
- **Built:** phases 0 to 2 the same day: rendering, a read-only TUI and the agent CLI. Measured that day: a cold
  5,000-note vault renders a note in 175 ms (design/how-it-works.md § Performance, measured).

## Editing, in five steps (2026-09-28)

- Phase 3's order: the checkbox toggle, the first write; the hand-off, both kinds; source mode with the modal layer;
  saving and conflicts; live preview (D144).
- The hand-off in two kinds, suspend and remote (D145); source mode another layout of the note, editing a vim-shaped
  layer over it (D146); live preview chosen after all, as the lens (D147, amending D134); frontmatter spliced by byte
  range (D148); editing's modes and keys joining the dispatch order (D105).
- **Built:** phase 3, the same day.

## Files beyond markdown (2026-09-29)

- Phase 3b before the vault: the review work slipbox serves, reading what agents produced, means configs and code as
  much as notes, so every text file has to open well first (D31).
- Any text file opens, in three groups (D107); data files render as documents and are edited as text (D108); source
  files go through tree-sitter, loaded lazily (D109); a reader per note format (D110).
- Pathological nesting is capped, from the phase 2 review (D111).
- The keys: vim's first, the desktop editors' `ctrl` keys next, the leader for the rest (D106), set beside vim's,
  VS Code's and Obsidian's in research/keymap-comparison.md.
- **Built:** phase 3b, the same day, with Org and AsciiDoc as note formats (`16.16`, `16.17`).

## Vaults (2026-09-30)

- Vaults decided: a file's root is its nearest `.slipbox/`, else the home vault (D42, D43); identity and storage by
  the vault's id (D44, D45); names and aliases (D46); links across vaults (D47, D48); moves detected by content and
  kept as redirects (D49); switching vaults and the launcher (D50); a vault's icon (D51); renames across vaults after a
  preview (D52); tags as Obsidian's (D53).
- Revised the same day: every vault has a `.slipbox/`, and a git repository is offered, not assumed (D44).
- Markdown is the only note format: Org and AsciiDoc, built the day before, dropped (D112).
- The explorer makes and changes files, decided with the user: buttons as well as keys, file operations with the
  rename's link fixing, a trash (D149).
- Footnotes are added and changed as GFM's, never reordered (D150).
- **Built:** the vaults (`17.x`), renames across vaults landing `7.1`–`7.3` (`17.15`).
- **Next:** the rest of `1.x`, search (`6.x`) and embeds. Still open: rename undo (`7.4`); a `HEAD` change as a branch
  switch (`5.9`); the lint surface. Incremental reparse (`4.9`) moved to `15.1`.

## Search, code intelligence and git for review (2026-10-01)

- Search is slipbox's own, small, in the core (D114): a row per file (D115), scout's sections (D116), files read by a
  quick pass (D117), kept current two ways (D118), `find` beside it (D119). Its SQLite better-sqlite3, chosen with
  scout (D191).
- A big note costs what changes, its first parse on threads (D120); embedded notes drawn in place, read-only (D113).
- The lint surface runs your linter rather than shipping one (D160).
- Phase 5 decided: slipbox an LSP client for the code it opens (D161); servers found, npm ones installed privately
  (D162); linters by the same rule (D163, D164); settings in the formats other tools read, programs from your own
  config only (D165, D166); diagnostics alike from every source (D167); slipbox serving markdown to editors (D168);
  the order and the new languages (D169); one protocol library, both ways (D170).
- Trust: everything trusted, as in nvim and Helix, decided with the user (D171).
- A git worktree is a separate vault of the same repository (D54).
- The context bundle (D32).
- Properties edited as the frontmatter's text (D151); a rename undone by restoring (D152); a branch switch as one event
  (D153); git, for reviewing (D154).
- **Verified:** `vscode-languageserver` runs under Bun as under Node, and in the compiled binary (D9, D170).

## Plain paths, virtual vaults (2026-10-02)

- In the morning: a folder is enough, with scope, settings and identity apart (D55). Superseded the same day, before
  any of it was built.
- Plain paths and virtual vaults, decided with the user over a long discussion and revised the same day after a review
  (D56): the converter (D57); a file's vault its nearest `.slipbox/` or git checkout, no home vault (D58); collections
  apart from instances (D59); names for display (D60); the index a cache (D61); settings deeper over broader (D62);
  generated edits as plans (D63); search by vault (D64); the status line and the explorer's roots (D65); the merge
  review (D66); the LSP face removed (D67).
- Phase 5b, plain paths, before the rest of phase 5 (D34).
- slipbox reframed: a shared workspace for humans and agents over plain files, not Obsidian without the GUI (D33).
- After a session that installed linters for live probes and drove terminal tests unasked, the user's instruction:
  tests that touch the machine and its panes are listed for approval before they run (D207).

## Plain paths built (2026-10-03)

- **Built since 2026-09-30:** search (`6.x`), the lint surface (`3.21`), a branch switch as one event (`5.9`), rename
  undo (`7.4`), the LSP face (`11.x`) and code intelligence (`19.x`).
- **Built 2026-10-02 and 03:** all of `20.x`, the LSP face removed in it (`20.23`). The parse cache shared by content
  reads a second copy about 150 times faster (`20.11`).
- **Next:** phase 5's grammars (`16.18`–`16.22`), with `16.23` asked about Ruby and C/C++.

## Paths inside, conventions at the edges (2026-10-05)

- Proposed with the user after comparing how other tools handle links (research/link-conventions.md), and reviewed
  with the user section by section the same day; approved (D68). Phase 5c, after the review of 5b (D35).
- Roots come from markers (D69); a leading `/` means the nearest root, then the filesystem (D70); wikilinks read again,
  within their root (D71); each root's link convention followed (D72); between folders, the convention, a pointer,
  else a relative path (D73); named folders (D74); `slipbox://` pointers (D75); personal state by root's path,
  positions by file (D76); the screen shows what the file says (D77); the relink offered after moves made elsewhere
  (D78); vaults stop being a concept (D79).

## Links checked while building (2026-10-06)

- While `21.x` was built: a file's root is its nearest, however it is opened (D80); a link to a folder resolves (D81);
  a markdown link is never by name (D82); a link slipbox writes never lands elsewhere (D83).
- From trailscout's review of slipbox's link resolution, each point checked against the code: one matcher for where a
  fragment lands (D84); links in front matter are links (D85); how each link landed is said, a fragile tie linted
  (D86); a link to the repository's own hosting is the file in this copy (D87).
- For `21.x` and the terminal tests' gaps, the user let new scenarios be written and run without waiting; what ran is
  still reported (D207).

## Trust, code as a notebook, the rest of phase 5 (2026-10-07)

- Run nothing of a folder's own unless you trust its root, decided with the user after trailscout's review of what
  makes a repository's code run (D172–D176), revising everything-trusted (D171). The first plan that day made
  `[trust] roots` in your config the only way to trust; revised with the user, the TUI asks and trusting takes no
  editing (D177; ideas.md § Trust).
- Code as a notebook, decided with the user: code reads as a document, its tokens verbatim (D125).
- Grammars npm has no WebAssembly for are built from source (D121); a file in several languages is parsed part by part
  (D122); Ruby and C/C++ get grammars (D123).
- Scout became trailscout, its own project: postponed, and `@slipbox/links` dropped (D124).
- In-process plugins dropped (D36).
- The design's deferred list sorted: a note's history, frontmatter rules and document types given IDs (`22.x`).
- **Built:** `21.x`; the rest of phase 5 (`16.18`–`16.23`), and jumps to type definitions and implementations
  (`19.13`).
- **Found:** the `21.x` terminal scenarios run in full, 111 in six panes. The 17 that failed were fixed (`d0eff65`):
  one was slipbox's own (a named folder moved by hand had its state carried, but its move was lost at the start, never
  said nor its relink offered); the rest were scenarios still in the old words.
- **Left:** Scout (`6.10`), until trailscout has an SDK, and phase 6+.

## Pictures and prototypes (2026-10-08)

- Pictures through OpenTUI, Kitty graphics and sixel, no blocks (D126); the terminal's own first, pictures by choice
  in the theme's colours, decided with the user (D127); what macOS terminals send for a Mac's own keys bound (D128); a
  cell folds whole (D129).
- Prototypes are tried with the user before the roadmap marks them done (D208).
- **Built, as prototypes:** code as a notebook (`24.x`) for TypeScript, TSX, JavaScript and Python; pictures (`12.x`):
  a local image under its `▣ alt` line, an online one as `[render] images_remote` says, `![[picture.png]]` by name,
  pictures in an embedded note. Also line numbers on by default, the lens opening on a whole section (`4.17`), macOS's
  cmd-arrow keys. The plan marked every built item done.
- **Next:** `12.7` confirmed, Mermaid as Unicode (`12.10`), maths as text (`12.11`), then SVG (`12.15`) and pictures of
  both by choice (`12.16`, `12.17`).

## Export decided, extensibility deferred (2026-10-09)

- All of `12.x` built and, with `24.x`, marked done once the user had tried them.
- Extensibility deferred, the whole of it: the user's call while sorting what was left once images were done (D37).
- The code view generic, on each grammar's own queries, decided with the user (D130); typing into a row in place
  dropped (D131); tabular code in columns deferred (D132).
- Export decided with the user: no external tool, every format TypeScript or JavaScript (D184); Word first, an export
  beside its note (D185); PDF by pdfkit (D186); a picture a format doesn't hold made PNG first, the PDF's lines laid
  out by slipbox, emoji in black and white (D187–D189); where an export goes, in a Save As window (D190).
- Editing fundamentals, short of an IDE, decided with the user (D155), a server's snippets (`25.8`) added at the
  user's asking; git in the editor, the working tree's, after them (D156).
- Licences: dependencies permissive, weak copyleft accepted for use (D192); slipbox to be open source, its licence
  weighed and parked (D193; ideas.md § Licence).
- **Built:** the code view generic (`24.9`), long signatures (`24.19`), receivers dimmed (`24.21`), licence headers
  folded (`24.22`); export begun: the assembler and the writers (`10.1`–`10.6`), several notes as one document
  (`10.9`), then `10.10`–`10.12` and `10.14`.

## Distribution, and trying what is built (2026-10-10)

- Export signed off by the user: the prototypes are done.
- Distribution decided with the user after reading trailscout's packaging design: macOS and Linux first (D197); no
  signing at first (D198); a daily update check that sends nothing identifying (D199); XDG's folders on macOS too
  (D200); the supply chain's gates (D201); language servers from lockfiles (D202); Alpine and Homebrew, asked for by
  the user (D203, D204); Windows through WSL, native Windows staged (D205). The licence left for later again (D193).
- The compiled binary loads nothing of the folder it starts in (D195); SQLite is the runtime's own, `node:sqlite`,
  better-sqlite3 dropped (D196, superseding D191); Hunspell taken under MPL-1.1 (D194).
- Spelling by Hunspell, English and Turkish bundled, decided with the user (D157); stash and the remote's commands
  deferred (D158).
- Document types, known by where they are (D133).
- The agent tries what it builds, in a herdr tab of its own on the reference set, rather than handing it over to try:
  trying `22.2` and `22.3` took minutes and found nothing the user had to judge (D209).
- **Built:** editing's fundamentals (`25.1`–`25.8`); git in the editor (`26.1`–`26.5`); distribution (`14.x`), but
  the licence (`14.6`), the checks on a real Mac (`14.13`) and native Windows (`14.14`–`14.17`); document types
  (`22.2`, `22.3`).
- **Found:** every prototype tried live on the reference set. Fixed, each with a regression test: a read-only window
  that took typing, the commit editor's first letter and its retry, source control's selection after staging, a
  config warning that hid an escape, and git's attribute guard failing open.

## Converting to a blueprint (2026-10-11)

- The user asked for slipbox's documents to become a blueprint, the user's method for keeping a project's thinking
  beside its code (D210).
- **Questions:** 1 where the documents go; 2 how decisions are numbered; 3 whether past work is backfilled.
- 1, where: `docs/` keeps only user documentation (the keymap, the configuration reference, the CLI reference);
  everything else moves into `blueprint/` (D210).
- 2, numbering: D1 onward, each title naming its plan item; the plan's item IDs stay as the roadmap's step IDs (D210).
- 3, backfill: none. The initial design is settled now, past phases stay ticked on the roadmap, and workstreams start
  with the next change (D210; ideas.md § Process).
- **Open:** the code and the old decisions disagree on Mason's `bin`. The decisions for `11.1` put it on the language
  servers' `PATH` when slipbox finds Mason; `core/servers/client.ts` spawns a server with slipbox's environment and the
  server's own `environment` only, Mason's `bin` searched for programs alone. Left out of D170 and the design; which is
  right is the user's to decide.
- **Open:** Bun's own crash reports, sent on macOS and Windows unless `DO_NOT_TRACK` is set, to be checked in the
  compiled binary, and turned off or said (D199's Verify; the roadmap's crash-reports step).
- **Open:** research/keymap-comparison.md's slipbox column has fallen behind docs/keymap.md: refresh it, or leave it
  marked outdated.
- **Open:** the minimum for open notes, a buffer list and a switcher (D141), was never built nor decided against: the
  TUI keeps buffers internally, with no buffer list.
- **Open:** design/rendering.md draws YAML and JSON as a tree, every key a row inside guides, where D108 and `16.12`
  said nested objects become headings down to a depth; no decision records the change.
- **Open:** writing design/links.md and design/roots.md against the code found where the code does less than the old
  documents and decisions said. The design says what the code does; for each, the code is right (a decision) or the
  decision is (a task):
  - a wikilink reaches outside its root only by `./` or `../`; `~/`, absolute and `file://` paths in a wikilink stay
    unresolved, though `17.16` (D48) read them;
  - `slipbox deinit` rewrites `/…` links and wikilinks, not pointers by the folder's name, which then break;
  - a private name's pointer is written without saying so (D74, D75), and writing a pointer to a clashing name doesn't
    ask to rename one: only following an ambiguous pointer asks;
  - the merge review reads paths and wikilinks, not pointers or hosting URLs, and shows its fixes without writing
    them (D66);
  - another root's hosting URLs, data files and code files don't count as backlinks here;
  - a rename falls back from a name to a path whenever another note has the name, not only when the name would be
    ambiguous (D83);
  - a moved code or data file's own paths aren't rewritten; a note's relative links are, when its folder changes
    (D63);
  - only wikilinks say how they landed; every link still gets a certainty (D86);
  - the watcher pairs a move with the first same-hash file within a minute, without the index's uniqueness check;
  - the background index has no user excludes and runs only from the TUI's idle check (D61); the parse cache's key
    holds no settings, since parsing reads none;
  - search's `all` scope is every root the machine knows, opened and caught up on demand (D64);
  - docs/configuration.md § The links' convention says the convention covers capture, but captures are `path:line`
    code spans; docs/cli.md § Naming notes still says "vault".
- **Open:** the walk's careful reads of files a folder controls (no blocking, regular files only, a size cap:
  design/roots.md § The walk) and what a symlink out of the root means for a write (`7.5`, design/tui.md § Writing
  notes) are built, but no decision records them.
- **Open:** the reading side, likewise: when a heading's occurrence is gone on reload, the code takes the first heading
  of that slug and the absolute line only when none has it (D98 says the line); resize mode is entered by `space w r`
  or `ctrl+w` with `> < + -`, not the `ctrl+alt+w` D99's table gives; search with `[search] engine = auto` scans the
  files until the index is built whole, and searches notes and data files, not text or code (D114).

## Reconciling with the code (2026-10-11)

- The user, on the open items above: "we don't have buffers", and the rest is for the agent to fix; then "do not run
  full e2e, you can check fixed part".
- **Where the code was right, a decision:** no buffer list (D211); YAML and JSON as a tree, its reason from the commit
  that made it (D212); reload anchoring's fallback (D213); what search covers and its widest scope (D214); widths the
  terminal's (D215); a wikilink leaves its root only by `./` or `../` (D216); a rename's fallback to a path (D217); the
  background index and the parse cache's key (D218). Built without a decision, now recorded: careful reads (D219),
  writes through a symlink (D220).
- **Where the decisions were right, a task (all in `review`, for the user to accept):** Bun's crash reports turned
  off at start (D221, T1: checked by crashing Bun with curl's connection watched through a local proxy); Mason's `bin`
  on the servers' `PATH` (D222, T2: shellcheck's findings now reach `slipbox diagnostics`); the watcher's move pairing
  (T3); `deinit` relinking pointers (T4); a pointer written says a private name, and asks on a clash (T5); the merge
  review reads hosting links and pointers naming its folder (T6); another root's hosting links are backlinks (T7);
  a moved code or data file's own paths (T8, which also found comments read only one `../`); every link says how it
  landed (T9). Each fix has a regression test, mutation-checked.
- Done in three worktrees by three agents, picked onto `main`; the full check passes but for one timing test (a big
  note's slices under 250 ms) that fails under load before the fixes as after them (236–310 ms against 240–339 ms).
  The terminal scenarios for the fixed parts, eight in two sized panes: all pass.
- Also: docs/cli.md says root, not vault, and lists every `how`; the keymap comparison is current again; the user's
  slipbox state had entries for the scratch folders left by testing, removed (backed up first).
- **Open:** T7 counts another root's notes' links, not its data and code files': a root's saved index holds only its
  notes' links. Counting the others means saving more in the index (D39, D61), and reading code files' links needs
  their grammars at index time (ideas.md § Links).

- The user accepted T1–T9: done, moved to `tasks/archive/`.
