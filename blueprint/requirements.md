# Requirements

slipbox is for a developer working with AI agents in a terminal, often over SSH on the machine that holds the
repository, where nothing beyond the terminal can be assumed (D3). It lets them read markdown and any other text file
well in that terminal, follow and search the links between them, edit them, and hand their notes to agents, while
agents read and change the same files through a CLI (D33).

## Goals

- **A shared workspace for humans and agents over plain files.** A person in the TUI and an agent on the CLI see the
  same files, the same links and the same answers, the TUI and the CLI reading one index. A feature earns its place by
  how well it serves that shared work (D33).
- **Reading better than leaf and nvim.** Markdown reads better in slipbox than in leaf, the rendering bar, or in nvim
  with render-markdown, whose rendering is what started slipbox: slipbox replaces leaf for reading `docs/` (D2, D4,
  D25).
- **An agent can drive it**, from the first phases on: the intended daily mode is the UI and an agent together, not
  the UI with agents bolted on (D16, D26).
- **The scratch replaces `prompt-buffer.lua`:** references and excerpts collected from wherever the work is, per
  project, and handed to an agent (D19, D20, D30).
- **Small edits stop provoking a reach for `$EDITOR`**, which stays a key away for anything substantial (D134).
- **Open any folder or file and work:** nothing to set up, and no vault to make, name or manage. An Obsidian vault or a
  zk notebook opens unchanged, its links, tags, aliases and link settings read as its own tool reads them (D53, D68,
  D72, D79).
- **Open source, with contributors** (D193).

## Non-goals

- A markdown previewer with extras, or Obsidian without the GUI (D33).
- Obsidian's life-management features: daily notes, random note, the unique note creator (timestamp-titled notes:
  descriptive file names and renames that fix links instead), the audio recorder, workspaces (restoring a session is
  not this), the web viewer. Nor what a terminal can't hold or slipbox doesn't need: Canvas, Graph view, Slides, Sync,
  Publish, Bases, File recovery (D1, D33).
- All of vim, or an IDE: vim's marks, macros, named registers and block selection aren't wanted (D146, D155).
- Lint rules of slipbox's own, and installing native language servers or linters: the system is the user's (D160,
  D162).
- Git in the editor from the CLI: an agent runs `git` itself (D156).
- A typesetting engine: a PDF good enough to hand someone a note (D181). Credentials for an online service: Google Docs
  is reached by a Word file, uploaded (D183).
- For now: extending slipbox with commands that shell out, output sinks and external panes, all deferred (D37);
  in-process plugins, dropped (D36); a server agents connect to, deferred, not rejected (D13); an outside search
  engine, postponed until trailscout has an SDK (D124).

## Reading

- Markdown is rendered in the terminal from remark's parse by slipbox's own layout: tables laid out to fit the width,
  no column narrower than its longest word when the minimums fit; words wrapped at their boundaries; the readability
  defaults carried over from the user's nvim; the line under the cursor stays rendered (D7, D89, D96, D97).
- Themes are built in, Tokyo Night by default; light themes genuinely work; a theme switches live, with a preview, and
  no restart; a mode follows the terminal's own colours; `NO_COLOR` gives something readable (D91–D95).
- An embedded note is drawn in place, read-only (D113). Pictures are drawn where the terminal can (asked of the
  terminal, never read from `$TERM`, and never required), and Mermaid and maths in the terminal's own characters
  first, as pictures by choice, in the theme's colours (D100, D126, D127).
- A reading position survives a resize, and an agent's insert above it (D98). Notes open as buffers, shown in tabs,
  with one split (D141).

How: design/rendering.md; design/tui.md § Screen layout, § Positions.

## Files beyond markdown, and code

- slipbox opens any text file, in three groups: notes, rendered; data and config files, rendered as documents with
  their source a key away; text and source, in source mode. Binary files don't open, and stay link targets (D107).
- Markdown is the only note format: `.org` and `.adoc` open as text (D112).
- A data file's edits are always on its text: its comments, key order and formatting survive (D108).
- Source files are parsed by tree-sitter grammars, loaded when first needed: highlighting, an outline, and links in
  comments only (D109, D121–D123).
- Code reads as a document, every token as written; every file keeps its source mode (D125, D130).
- Notes of a kind (an agent skill's `SKILL.md`, an ADR) are known by where they are: their frontmatter's rules checked,
  their order and status read, with nothing written or kept (D133).

How: design/tui.md § Files beyond notes; design/rendering.md § Data files; design/code-view.md;
design/document-types.md.

## Roots and links

- A file's root is its nearest folder holding `.git`, `.slipbox/`, `.obsidian/` or `.zk/`, however it is opened. A
  folder without a marker works too; `$HOME` and `/` are never a root, and opened, are listed a level at a time (D58,
  D69, D80).
- Opening a folder writes nothing into it: nothing derived or personal lives in the user's folders. Reading positions,
  sessions, the scratch and the trash stay on the machine, kept by path (D39, D58, D76).
- Every link form other tools write is read: a path relative to the file, `/` from the root, a path without its
  extension, a folder, a wikilink with its aliases and attachments, `file://`, `~/`, a link in front matter, the
  repository's own hosting URL (D68, D70, D71, D81, D85, D87). One matcher decides where a fragment lands (D84).
- Links are written in each root's own convention, and a link slipbox writes never lands elsewhere (D72, D82, D83).
- A link means the same on every machine: it resolves by the files and fixed rules, never by what the index holds; a
  tie is ambiguous, never guessed; how each link landed is said (D61, D71, D86).
- Links between folders that don't travel together keep working when another machine lays them out differently:
  `slipbox://` pointers name a named folder, never a copy (D73–D75).
- Tags are Obsidian's (D53).
- A rename or a move fixes every link to it, after a preview of every file, and can be undone. A move made elsewhere
  is found from evidence, and the relink is offered; before a merge, the links it would break are shown (D63, D66,
  D78, D143, D152).

How: design/roots.md; design/links.md.

## Navigating and search

- Links are followed, with history back and forward; backlinks, the outline, the quick switcher and the command
  palette are a key away (D11, D27).
- The explorer shows the root of what's opened, and a folder a link was followed into beside it; files on screen are
  shown by path, as the file says (D65, D77).
- Search is slipbox's own, in the core, shared by the TUI and the CLI, and always answers, from the index or a scan:
  words, phrases, prefixes, exclusions, titles, tags and folders, ranked; a hit opens where most of its words are
  (D114–D118). `find` lists every match of a literal or a regex beside it (D119). Search covers the root, the folders
  linked to or from it, or everything indexed (D64, D79).

How: design/tui.md § Following links, § Side panes, § Overlays; design/search.md.

## Editing

- An in-app editor for small edits; a hand-off for anything substantial, to `$EDITOR` in this terminal or to an
  editor already running (D134, D145).
- The editor is vim-shaped and consistent with the other modes: source mode is another layout of the note, and the
  lens edits the block under the cursor in place within the rendered note; undo survives a reload from disk (D146,
  D147).
- Agents write while you read: a note without unsaved changes reloads silently; an outside change to one with unsaved
  changes is said when it lands, and prompts (Load, Keep, Diff, Merge); nothing is resolved automatically. Autosave
  runs after a long idle delay, and quitting with unsaved notes names them (D137–D140). A branch switch is one change
  (D153).
- Frontmatter is changed by byte range, never re-serialised; properties are edited as its text; footnotes are added and
  changed as GFM's (D148, D150, D151).
- The fundamentals short of an IDE: indentation per file, comments, brackets, replace across files, word completion,
  spelling (English and Turkish bundled), a command run, a server's snippets (D155, D157).
- The explorer makes, renames, moves, copies and deletes notes and folders, by buttons and keys; a delete goes to a
  trash, and can be restored (D149).

How: design/tui.md § Editing, § Source mode, § The lens, § Writing notes, § External changes, § Files in the explorer.

## Agents and the CLI

- **CLI parity.** The CLI reaches every state change the TUI makes, not every interaction: the cursor, scrolling,
  selection, modes, panes, overlays and the conflict prompt are the TUI's alone, and so is git in the editor (D14,
  D156). Every user action is a named command, declared with its CLI equivalent (D11).
- **Disk is the contract.** A CLI call sees saved files only, never an unsaved buffer; it writes atomically, and is
  never blocked by an open editor. It is told which notes the TUI holds unsaved, and a careful writer can refuse to
  clobber (`--if-unchanged`). A hand-off (capture, the context bundle, invoking an agent) saves unsaved notes first
  (D17, D145).
- `--json` prints one object, apart from human output; exit codes are stable; the TUI never starts without a terminal
  (D18). A small subset of commands is stable and versioned; the rest may change before 1.0 (D15).
- A generated edit is planned and applied as two explicit steps (D63).
- A skill teaches agents the CLI, kept current with every change (D22).
- The agent surface grows with slipbox rather than arriving at the end: agents have used it since the first phases
  (D16).

How: design/tui.md § Parity with the CLI; docs/cli.md.

## Capture and the context bundle

- Anything (an nvim keybinding, an agent, a shell) captures into a per-project scratch by `slipbox capture`, which the
  user reads in the TUI (D19). The scratch is markdown, each entry with its source reference (`path:42-50`), kept in
  the state folder unless asked otherwise (D20).
- The scratch and a context bundle are copied by OSC 52, else a local tool, else a file, so copying works over SSH
  (D21).
- A context bundle gives an agent notes, what they link to and what links to them, as one markdown document, gathered
  deterministically from disk, with what was left out named (D32).

How: docs/cli.md § Capture and the scratch, § The context bundle.

## Code intelligence

- slipbox is a client of the language servers of the code it opens, in the TUI and on the CLI: problems, hover,
  definitions, references, symbols, rename, code actions, formatting, completion (D161).
- A language's servers are found; those on npm are installed privately when first needed, pinned, and native ones
  never installed (D162, D202).
- slipbox runs the linters you already use (markdownlint-cli2 for notes, a project's linters where it has their
  config) and ships no rules of its own (D160, D163, D164).
- Settings are in the formats other tools already read, with nothing slipbox-only to learn (D165).
- Problems from every source (syntax, lint, servers, linters) look alike, in source mode, the lens and the rendered
  view (D167).

How: design/lsp.md; design/tui.md § The lint surface, § Problems where they are, § What's under the cursor.

## Git

- For reviewing: what a branch changed against its merge base, a note's diff, the worktrees, a merge's conflicts in
  Problems, and the links a merge would break (D66, D154).
- In the editor, the TUI's alone: changed lines in the gutter, source control, commit, blame and a file's history,
  branches. Stash and the remote's commands are deferred (D156, D158).
- git runs nothing of a repository's own where its root isn't trusted (D175).

How: design/tui.md § Git; docs/cli.md § Git.

## Export

- Notes are exported as Word, PDF, a web page, an e-book and portable Markdown: one note, or several as one document,
  a chapter each, in the order picked. Links inside the document stay links, any other becomes its text, never
  literal `[[brackets]]`; embeds, pictures, diagrams and maths are drawn in as on screen (D178, D179, D181, D186–D188).
- Word comes first. An export goes beside its note by default; the TUI asks where in a Save As window (D185, D190).
- What export may depend on: § Constraints.

How: design/export.md.

## Keys and configuration

- Keys keep vim's meaning where slipbox has the action, then the `ctrl` keys desktop editors share, and everything else
  is under the leader, `space`; every binding is a named command, and can be remapped (D11, D106).
- Every `ctrl+` chord has another route; plain `q` never quits, and `ctrl+c` only copies (D99). What macOS terminals
  send for a Mac's own keys is bound (D128).
- Configuration is TOML: the user's, then each root's `.slipbox/config.toml`, deeper over broader. slipbox runs
  correctly with no config at all (D12, D62).

How: docs/keymap.md; docs/configuration.md; design/tui.md § Modes and dispatch.

## Distribution

- slipbox is one binary, built by `bun build --compile` (D5, D10), released for the platforms in § Constraints, and
  installed by a script that checks each download against its release's sums (D197).
- `slipbox upgrade` installs a newer release; the TUI checks for one once a day, on by default (D199). Homebrew gets a
  formula with each release, and an install brew made is left to brew (D204).

How: design/distribution.md.

## Quality goals

- **Rendering at least as good as leaf's** (D4, D25, D88, D89). Checked by slipbox replacing leaf for reading `docs/`,
  phase 1's finish line, and by the render tests: every demo note at six widths, in both glyph sets, with no row past
  its width, and the table allocator over 5,000 generated inputs (design/testing.md § Strategy).
- **Everything a person can change, an agent can** (D11, D14). Checked by the command registry: a command implemented
  without its CLI equivalent declared, or declared and not implemented, fails at start-up and fails a test
  (design/tui.md § Parity with the CLI).
- **A contract agents can rely on** (D15, D18). The stable commands' `--json` shapes change only with `schema`; checked
  by `tests/cli.test.ts`, which runs every command as an agent meets it (docs/cli.md § Stability).
- **The CLI never needs a terminal** (D8). The core imports nothing from the TUI or OpenTUI, nor the CLI from the TUI.
  Checked by `bun run check:boundary`, in `bun run check` and in CI (design/how-it-works.md § The boundary is
  enforced, not hoped for).
- **A note is never lost, nor rewritten unseen** (D7, D40, D63, D139, D140, D142, D148). Every write is atomic;
  autosave never overwrites another writer's change; every generated edit is a plan, shown first and refused when a
  file changed since; CRLF, a BOM, no final newline and invalid UTF-8 survive an edit. Checked by the fixture vault's
  awkward files (design/testing.md § The fixture vault), and by exit 5 for a stale plan or `--if-unchanged`
  (docs/cli.md § Output contract).
- **Safe to open anything** (D166, D172–D177, D195). Nothing a folder brings runs unless you trust its root: not its
  programs, nor the code its servers would run, its git config and files, or the `bunfig.toml` and `.env` Bun would
  read. A folder's own config never names a program to run, nor trusts itself; trusting takes no file edited; an agent
  can't grant it. Checked by the tests, one of them that the compiled binary loads nothing of its folder, and said by
  `slipbox doctor` (design/trust.md).
- **Fast at 5,000 notes, and on a big note** (D17, D111, D120). The first note paints within a tenth of a second
  while the graph builds in the background or comes from the cache; editing a big note costs what changed. Checked
  by `bun scripts/bench.ts` (design/testing.md § Timings; the measurements in design/how-it-works.md § Performance,
  measured).
- **Nothing identifying leaves the machine** (D199). The update check asks for the latest release and sends nothing
  that identifies you; only the TUI checks, never the CLI; `DO_NOT_TRACK` or the config turns it off. Still to check:
  Bun's own crash reports in the compiled binary, to be turned off or said (D199's Verify).

## Constraints

Fixed rules every part keeps. The roadmap's constraint items (`2.9`, `7.5`, `12.5`, `13.2`) point here.

### From the premise

Each was decided after a wrong turn, and is not re-litigated:

- **Standalone** (D3). slipbox never requires herdr, tmux, zellij or any multiplexer; a bare terminal over SSH is
  first-class. What a multiplexer would give (a second pane, detach, scrollback) slipbox gives itself, or degrades to a
  lesser path that still works; multiplexer integration is detected and optional, never assumed. An external binary
  may be an optional enhancement, never a requirement.
- **nvim's rendering is ruled out** (D2): "just use nvim plus render-markdown" is not an answer, though nvim has every
  other feature.
- **CLI parity** (D14), **disk is the contract** (D17), **agents from phases 1 and 2** (D16): § Agents and the CLI.
- **The core imports nothing from the TUI** (D8): § Quality goals.

### Safety

- **`2.9`** (D90): terminal escapes are stripped from text on its way into the layout. Every string entering the
  layout passes through `sanitize`, and the CLI's human output is sanitised alike, so no escape sequence in a note
  reaches the terminal. design/rendering.md § Escapes.
- **`7.5`** (D142, D69, D79): slipbox never writes outside the root. A symlinked note is written through to its
  target, and a target outside the root is refused; nothing is made outside the root. The plan's "vault root" is the
  root now, vaults having stopped being a concept. design/tui.md § Writing notes.
- **`12.5`** (D101, D126): a note never becomes unreadable because a picture couldn't render: its alt text and its link
  are the floor. design/rendering.md § Blocks and inlines.
- **`13.2`** (D159, D37): values substituted into a command slipbox runs are passed as an argument vector, never
  interpolated into a shell string; a shell, if wanted, is quoted properly and the config says so. The editor's
  hand-off holds to it now, and whatever of `13.x` is built later will.

### Licences

- **slipbox's own:** to be open source; the licence is parked (`14.6`, D193). Until it is chosen there is no `LICENSE`
  file, and `package.json` says MIT.
- **Dependencies:** permissive (MIT, ISC, BSD, Apache-2.0, BlueOak, Zlib). Weak copyleft is accepted for use, by name:
  `elkjs` (EPL-2.0), `@resvg/resvg-wasm` (MPL-2.0), Hunspell (MPL-1.1). A new dependency's licence, and its own
  dependencies', is checked before it is added (D192, D194, D201). design/distribution.md § Notices.
- **Export:** no external tool. Every format is written by TypeScript or JavaScript under a permissive licence, and a
  format that would need a tool isn't offered (D180, D184).

### Platforms

- macOS (arm64, x64) and Linux (x64, arm64; glibc, and Alpine's musl) are released, each built on its own in CI
  (D197, D203). Windows is reached through WSL; native Windows is staged as `14.14`–`14.17` (D205).
- Releases are neither signed nor notarized at first; before the first release, a real Mac checks the binaries'
  signatures and Apple's SQLite (`14.13`, D196, D198).
- Folders are XDG's on Linux and macOS, and Windows' own on Windows; an `XDG_*` set is respected everywhere (D39,
  D200).
- A Linux build needs no newer glibc than Bun's and OpenTUI's, 2.17 (D196).

### Dependencies

- Bun and TypeScript, compiled into one binary with its runtime embedded (D5). Bun 1.4.2 is the floor: what slipbox is
  built and tested on.
- OpenTUI is pinned exactly, with a written upgrade policy, and only the final draw step touches it (D6).
- No Node: npm language servers and markdownlint-cli2 run on slipbox's own Bun, installed into its own folder from
  lockfiles it ships, never globally (D162, D164, D170, D202).
- SQLite is the runtime's own, through `node:sqlite`: nothing native is packaged per platform (D196).
- The supply chain's gates: exact versions, no install scripts, a version taken only once it is a week old, a licence
  gate, CI's actions pinned by their commit's full hash; checked by `bun run check:deps` (D201).
  design/distribution.md § The supply chain.
