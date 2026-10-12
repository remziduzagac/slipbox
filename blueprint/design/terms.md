# Terms

The words the design uses, alphabetically, each with the section that defines it. The user meets folders and notes;
"root" and the rest are the design's words. Terms the design no longer uses are under [Retired](#retired), with what
replaced them.

- **Add-on server**: a linter's language server, run beside a file's main server where the project has that linter's
  config. [lsp.md](lsp.md) § The client for code.
- **Anchor**: where a view's top or cursor is kept: the nearest heading above it, an offset and a fallback line, never
  a screen row. [tui.md](tui.md) § Positions.
- **The bar**: the problems bar, a column beside the text marking each line's problems while line numbers are off.
  [tui.md](tui.md) § Problems where they are.
- **Buffer**: one open file, with its text, its parse and its layouts by width, shown in views.
  [tui.md](tui.md) § Buffers, views, tabs, windows.
- **Capture**: text appended to the scratch with its reference, by `slipbox capture` or from the TUI.
  [cli.md](../../docs/manual/cli.md) § The scratch and the context bundle.
- **Cell**: in the code view, one definition's code under a header holding its buttons and its documentation.
  [code-view.md](code-view.md).
- **Channel**: the releases an install follows, `stable` or `preview`, kept with the install.
  [distribution.md](distribution.md) § Channels.
- **Command**: a user action, named by an id; the **command registry** (`CommandRegistry`) holds them, each with its
  CLI equivalent or marked an interaction. [how-it-works.md](how-it-works.md) § One core, two faces.
- **Conflict prompt**: what a note with unsaved changes opens when it changes on disk: Load, Keep, Diff, Merge.
  [tui.md](tui.md) § Editing.
- **Context bundle**: a note, what it links to and what links to it, as one document for an agent (`slipbox context`,
  `space s c`). [cli.md](../../docs/manual/cli.md) § The scratch and the context bundle.
- **Convention**: how a root's links are written: their style, path and extension, from your setting, the root's tool,
  its notes, else slipbox's own. [links.md](links.md) § Conventions.
- **Copy**: one copy of a named folder on this machine (a clone, a synced folder); its **default copy** is the one its
  pointers open. A worktree is not a copy. [roots.md](roots.md) § Named folders.
- **Data file**: TOML, INI, YAML, JSON or CSV, rendered as a document and edited as text.
  [rendering.md](rendering.md) § Data files.
- **The demo vault**: `examples/vault/`, halden: a fictional observatory's notes, which the render tests snapshot.
  [testing.md](testing.md) § The demo vault.
- **Document type**: notes of a kind, known by where they are (`skill`, `adr`, your own), with rules for their
  frontmatter and an order. [document-types.md](document-types.md) § Types.
- **Embed**: `![[note]]` or `![](note.md)` alone in a paragraph, drawn in place, read-only.
  [rendering.md](rendering.md) § Blocks and inlines.
- **Face**: a front end on the core: the TUI or the CLI. [how-it-works.md](how-it-works.md) § One core, two faces.
- **The fixture vault**: `tests/fixtures/vault/`, the cases the samples lack. [testing.md](testing.md) § The fixture
  vault.
- **Fragile link**: a link by name won by where it is written, which a note of that name nearer would take.
  [links.md](links.md) § How a link landed.
- **The graph**: the core's model of a root's notes, their links, backlinks and tags, parsed lazily (`core/graph.ts`).
  [how-it-works.md](how-it-works.md) § The parts.
- **Hand-off**: a note given to another editor at the cursor's line: suspended in this terminal, or sent to one
  already running. [tui.md](tui.md) § Writing notes.
- **The index**: a root's link index and search index, in its cache: a cache, never what decides where a link points.
  [roots.md](roots.md) § The index.
- **Interaction**: a command with no CLI equivalent: the cursor, scrolling, selection, focus, panes, overlays.
  [tui.md](tui.md) § Parity with the CLI.
- **Key**: a root's storage key, `<basename>-<hash>` of its real path, naming its cache and state folders.
  [roots.md](roots.md) § Storage keys.
- **Landing**: where a link's fragment points in its note: a heading, a block's `^id`, a line.
  [links.md](links.md) § Where a link lands.
- **Layout IR**: the rows, links and headings a note is laid out into for a width, before anything is drawn.
  [rendering.md](rendering.md) § The layout IR.
- **The leader**: `space`, the key that starts the leader groups (`space n`, `space g`, …).
  [keys.md](../../docs/manual/keys.md) § Notation.
- **The lens**: live preview: the blocks around the cursor shown as their markdown between two rules, the rest of the
  note rendered. [tui.md](tui.md) § The lens.
- **The lint surface**: your markdownlint-cli2, run on notes, its findings read as problems.
  [tui.md](tui.md) § The lint surface.
- **The lookup**: the record of named folders, their copies and defaults (`folders.json`).
  [roots.md](roots.md) § Named folders.
- **Loose file**: a file under no root. [roots.md](roots.md) § Plain folders and loose files.
- **Main server**: the first of a language's servers that applies and is found. [lsp.md](lsp.md) § The client for
  code.
- **Named folder**: a root a pointer can name, by its `.slipbox/` name, else its repository's remote.
  [roots.md](roots.md) § Named folders.
- **Plain folder**: a folder outside every root, opened by its path, standing in for a root.
  [roots.md](roots.md) § Plain folders and loose files.
- **Plan**: a generated edit, previewed, tied to each file's content hash, refused once stale, applied once
  (`--plan`, `slipbox apply`). [links.md](links.md) § Repairs.
- **Pointer**: a `slipbox://<name>[@branch]/<path>#fragment` link into a named folder.
  [links.md](links.md) § Pointers.
- **Preview**: `main` built and published as a pre-release before it's released, from the `test` branch.
  [distribution.md](distribution.md) § Previews.
- **Problems**: a file's findings from every source (links, conflicts, syntax, lint, servers), in one shape.
  [tui.md](tui.md) § Problems where they are.
- **Reading position**: where a note was left, its cursor included, kept per file. [tui.md](tui.md) § Positions.
- **The reference set**: `examples/home/`, a developer's home folder in which every feature is in realistic use,
  built with real git histories. [testing.md](testing.md) § The reference set.
- **Relink**: the repair that rewrites the links a move broke, from the move's evidence.
  [links.md](links.md) § Repairs.
- **Root**: the nearest folder above a file holding a root marker; what `/`, a wikilink's names, the convention and
  settings are measured from. [roots.md](roots.md) § Roots and markers.
- **Root marker**: `.git`, `.slipbox/`, `.obsidian/` or `.zk/` (`walk.root_markers`).
  [roots.md](roots.md) § Roots and markers.
- **Safe mode**: a language server started so that it runs nothing of the project's own, in a root you don't trust.
  [lsp.md](lsp.md) § The client for code ("Trust").
- **The scratch**: a markdown file per root, in slipbox's state by default, where captures go with their references.
  [how-it-works.md](how-it-works.md) § Storage.
- **Session**: a root's tabs, splits, cursors and pane widths, restored when slipbox starts there.
  [tui.md](tui.md) § Positions.
- **Source mode**: a note shown as its raw markdown: another layout of the same note. [tui.md](tui.md) § Source mode.
- **Staleness file**: `dirty/<pid>.json` in a root's state, listing the notes a TUI holds unsaved, which the CLI
  reports. [how-it-works.md](how-it-works.md) § The CLI and the TUI: disk is the contract.
- **Step ID**: a roadmap step's number (`3.11`; `21.x` for its group), cited beside what it built.
  [roadmap.md](../roadmap.md).
- **Travel together**: two files carried by one clone, or by one folder moved as a whole.
  [links.md](links.md) § Between folders.
- **Trusted root**: a root whose own code may run: one you trusted when asked, or one your config's `[trust] roots`
  lists. [trust.md](trust.md) § Trusting a root.
- **View**: a window: a buffer with its own cursor, top row, selection and find; a **tab** holds one, or two in a
  split. [tui.md](tui.md) § Buffers, views, tabs, windows.
- **The walk**: the listing of a root's files, shared by the index and the watcher. [roots.md](roots.md) § The walk.
- **Which-key**: the popup listing the keys a pending sequence can take next. [tui.md](tui.md) § Screen layout.
- **Wikilink**: `[[name]]` or `[[path#heading|text]]`, a link by name or path, within its root.
  [links.md](links.md) § Wikilinks.
- **Worktree**: a git worktree: its repository at a branch, a root of its own, shown as `name@branch`.
  [roots.md](roots.md) § Worktrees.

## Retired

Older decisions use these; the design doesn't.

- **collection**, **instance**: a named folder, and its copies (D59, D79).
- **home vault**, **single-file mode**: gone; a plain folder stands in (D58).
- **the LSP face** (`slipbox lsp`): removed; editors' own markdown servers follow path links, and agents use the CLI
  (D67).
- **scope** (D55, never built): the root (D56, D80).
- **Scout**: now trailscout, a project of its own; the outside search engine waits for its SDK (D124). Search still
  cuts sections as scout does (D116).
- **vault**: a root, or a named folder (D79). The word stays in code (`core/vault.ts`, command ids such as
  `vault.init`, which `[keys]` and `[aliases]` name), in the `[vault]` identity table, in the logs and plans slipbox
  keeps, and in the names of the fixture and demo vaults; never in what the CLI prints or its JSON (DF-D9). Your
  config's other words say root: `capture.location = "root"`, the explorer's actions `rename_root`, `make_root` and
  `unmake_root` (`[keys.explorer]`), the colour role `sidebar_root`; the old words, `vault`, `rename_vault`,
  `make_vault`, `unmake_vault` and `sidebar_vault`, are read as them, unwarned, and the docs show root (DF-D22;
  `OLD_VALUES` in `core/config.ts`, `OLD_ROLES` in `core/theme/theme.ts`).
- **`[[vault:note]]`**, **`vault:path`**: a pointer, `slipbox://name/path`, in files; a path on screen (D60, D75, D79).
- **`slipbox vaults`**, **`rename-vault`**, **`--scope vault`**: `slipbox folders`, `slipbox name`, `--scope here`
  (D79).
