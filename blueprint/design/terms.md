# Terms

The words the design uses, alphabetically, each with the section that defines it. The user meets folders, notes and
vaults; most of the rest are the design's words. Terms the design no longer uses are under [Retired](#retired), with
what replaced them.

- **Add-on server**: a linter's language server, run beside a file's main server where the project has that linter's
  config. [lsp.md](lsp.md) § The client for code.
- **Anchor**: where a view's top or cursor is kept: the nearest heading above it, an offset and a fallback line, never
  a screen row. [tui.md](tui.md) § Positions.
- **The bar**: the problems bar, a column beside the text marking each line's problems while line numbers are off.
  [tui.md](tui.md) § Problems where they are.
- **Base**: the branch a branch is measured against: the one it was made from when slipbox made it, else the nearest
  of `[git] bases`, else `[git] base` (GIT-D10). [tui.md](tui.md) § Git.
- **Before and after**: a note's diff drawn as its changed blocks twice, lightly formatted, the removed words marked in
  the first and the added in the second (GIT-D2). [tui.md](tui.md) § Git.
- **Buffer**: one open file, with its text, its parse and its layouts by width, shown in views.
  [tui.md](tui.md) § Buffers, views, tabs, windows.
- **Busy folder**: a tool's output, environment or cache (`node_modules`, `build`, `target`, `.venv`…) that looks
  generated — ignored, or no note at its top: listed in the explorer, never indexed (VV-D8, D237). [roots.md](roots.md)
  § The walk.
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
- **Convention**: how a vault's links are written: their style, path and extension, from your setting, the vault's
  tool, its notes, else slipbox's own. [links.md](links.md) § Conventions.
- **Copy**: one copy of a named folder on this machine (a clone, a synced folder); its **default copy** is the one its
  pointers open. A worktree is not a copy. [roots.md](roots.md) § Named folders.
- **The current vault**: the vault whose workspace is shown; choosing a file of another goes into it (VV-D4).
  [tui.md](tui.md) § Going into a vault.
- **Data file**: TOML, INI, YAML, JSON or CSV, rendered as a document and edited as text.
  [rendering.md](rendering.md) § Data files.
- **The demo vault**: `examples/vault/`, halden: a fictional observatory's notes, which the render tests snapshot.
  [testing.md](testing.md) § The demo vault.
- **The diff window**: the floating window every diff opens in, a note's before and after, a code file's lines,
  side by side where there's room (GIT-D2, GIT-D7). [tui.md](tui.md) § Git.
- **Document type**: notes of a kind, known by where they are (`skill`, `adr`, your own), with rules for their
  frontmatter and an order. [document-types.md](document-types.md) § Types.
- **Embed**: `![[note]]` or `![](note.md)` alone in a paragraph, drawn in place, read-only.
  [rendering.md](rendering.md) § Blocks and inlines.
- **Elsewhere**: no-vault as users read it: every file outside home and every vault, one place for the machine, with
  its own tabs and no index (VV-D3). The code's mode `folder`. [roots.md](roots.md) § Elsewhere.
- **The explorer's zoom**: the part of the file system the explorer shows, one tree zoomed in and out along its
  breadcrumb (VV-D5); distinct from a window's READ or SOURCE view (VB-D1). [tui.md](tui.md) § Side panes.
- **Face**: a front end on the core: the TUI or the CLI. [how-it-works.md](how-it-works.md) § One core, two faces.
- **The fixture vault**: `tests/fixtures/vault/`, the cases the samples lack. [testing.md](testing.md) § The fixture
  vault.
- **Followed link**: a symlink out of its vault or home that you said to follow: read and indexed as part of where it
  is, the answer kept in slipbox's state (VV-D6). [roots.md](roots.md) § Links followed only when you say so.
- **Fragile link**: a link by name won by where it is written, which a note of that name nearer would take.
  [links.md](links.md) § How a link landed.
- **The git panel**: source control, the left panel's `±` view, `space g`: the working tree, this branch against its
  base, the branches with their worktrees, the other repositories in the view, by mouse as by keys (GIT-D8, GIT-D12).
  [tui.md](tui.md) § Side panes.
- **The graph**: the core's model of a vault's notes, their links, backlinks and tags, parsed lazily
  (`core/workspace/graph/graph.ts`).
  [how-it-works.md](how-it-works.md) § The parts.
- **Hand-off**: a note given to another editor at the cursor's line: suspended in this terminal, or sent to one
  already running. [tui.md](tui.md) § Writing notes.
- **Home**: `~`, a vault without a marker: its files those no other vault holds, its index built with a skip list, in
  slices while nobody works (VV-D2). [roots.md](roots.md) § Home.
- **The index**: a vault's link index and search index, in its cache: a cache, never what decides where a link points.
  [roots.md](roots.md) § The index.
- **Interaction**: a command with no CLI equivalent: the cursor, scrolling, selection, focus, panes, overlays.
  [tui.md](tui.md) § Parity with the CLI.
- **Key**: a vault's storage key, `<basename>-<hash>` of its real path, naming its cache and state folders; Elsewhere's
  is `elsewhere`.
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
- **Main server**: the first of a language's servers that applies and is found. [lsp.md](lsp.md) § The client for
  code.
- **The merge screen**: git's conflicts in a file settled a card at a time, yours and theirs against the base
  (GIT-D5). [tui.md](tui.md) § Git.
- **Mode**: vim's NORMAL, INSERT, VISUAL or V-LINE, distinct from the window's view (VB-D1).
  [tui.md](tui.md) § Screen layout.
- **Named folder**: a vault a pointer can name, by its `.slipbox/` name, else its repository's remote.
  [roots.md](roots.md) § Named folders.
- **No-vault**: the design's word for Elsewhere (VV-D3).
- **Peek**: another vault's file, or one outside every vault, read in a large floating window, read-only, where a link,
  a backlink or a search hit led; going there a choice (`o`, VV-D7). [tui.md](tui.md) § The peek.
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
- **The review**: the working tree's changes walked a hunk at a time, each kept, reverted or noted for the agent
  (GIT-D3). [tui.md](tui.md) § Git.
- **Relink**: the repair that rewrites the links a move broke, from the move's evidence.
  [links.md](links.md) § Repairs.
- **Safe mode**: a language server started so that it runs nothing of the project's own, in a vault you don't trust.
  [lsp.md](lsp.md) § The client for code ("Trust").
- **The scratch**: a markdown file per vault, in slipbox's state by default, where captures go with their references.
  [how-it-works.md](how-it-works.md) § Storage.
- **Row marks**: an explorer row's columns at its right: the index's state, git's mark, what describes the row
  (VV-D9); why one is `⊘`, on the status line and in Info (D244). [tui.md](tui.md) § Side panes.
- **Session**: the file a vault's workspaces are kept in, with what they share (`session.json`, the `Session`); users
  read workspace (WSP-D6). [tui.md](tui.md) § Positions.
- **SOURCE view**: a note shown as its raw markdown: another layout of the same note. [tui.md](tui.md) § SOURCE view.
- **Skip list**: what home's walk leaves out instead of a `.gitignore`: hidden and system folders, `Downloads`, the busy
  folders, files not notes or text (VV-D2). [roots.md](roots.md) § Home.
- **Staleness file**: `dirty/<pid>.json` in a vault's state, listing the notes a TUI holds unsaved, which the CLI
  reports. [how-it-works.md](how-it-works.md) § The CLI and the TUI: disk is the contract.
- **Step ID**: a roadmap step's number (`3.11`; `21.x` for its group), cited beside what it built.
  [roadmap.md](../roadmap.md).
- **Travel together**: two files carried by one clone, or by one folder moved as a whole.
  [links.md](links.md) § Between folders.
- **Trusted vault**: a vault whose own code may run: one you trusted when asked, or one your config's `[trust] roots`
  lists. [trust.md](trust.md) § Trusting a vault.
- **Vault**: the nearest folder above a file holding a vault marker, else home; what `/`, a wikilink's names, the
  convention and settings are measured from. Every file is in exactly one vault, home, or Elsewhere (VV-D1, VV-D4). The
  content boundary and the unit you trust, whether you trust it being yours (WSP-D1). The word users read and the
  code's, `core/workspace/vaults/vault.ts` and `vault.init`. [roots.md](roots.md) § Vaults and markers.
- **Vault marker**: `.git`, `.slipbox/`, `.obsidian/` or `.zk/` (`walk.root_markers`).
  [roots.md](roots.md) § Vaults and markers.
- **View**: a window's READ or SOURCE presentation; the lens is a toggle within READ (VB-D1). The code's `View`
  still holds a buffer with its own cursor, top row, selection and find; a **tab** holds one, or two in a split.
  [tui.md](tui.md) § Buffers, views, tabs, windows.
- **The walk**: the listing of a vault's files, shared by the index and the watcher. [roots.md](roots.md) § The walk.
- **Where you are**: explorer zoom, workspace and git, grouped on the permanent top bar (VB-D3, VB-D6).
  [tui.md](tui.md) § Screen layout.
- **Which-key**: the popup listing the keys a pending sequence can take next. [tui.md](tui.md) § Screen layout.
- **Wikilink**: `[[name]]` or `[[path#heading|text]]`, a link by name or path, within its vault.
  [links.md](links.md) § Wikilinks.
- **Window header**: the row atop each window: in a split its file’s name, the breadcrumb, the mode’s buttons,
  and `▤` without the right rail (HDR-D1). [tui.md](tui.md) § Screen layout.
- **Workspace**: your tabs and windows in a place — the splits, each window's note, cursor and history: one per branch
  of a git checkout, one per folder of home opened by name and home's own, else the vault's own; personal, in
  slipbox's state, never in the vault (WSP-D1, WSP-D2). Not VS Code's workspace, the folders a window opened (a vault,
  here); Obsidian's workspaces, saved layouts, are nearer, though slipbox keeps one per place by itself. Nor D33's
  "shared workspace", slipbox as a whole. [tui.md](tui.md) § Positions.
- **Worktree**: a git worktree: its repository at a branch, a vault of its own, shown as `name@branch` outside the
  permanent bar, which separates the vault name and branch (VB-D6).
  [roots.md](roots.md) § Worktrees.

## Retired

Older decisions use these; the design doesn't.

- **collection**, **instance**: a named folder, and its copies (D59, D79).
- **home vault**, **single-file mode**: gone; a plain folder stood in (D58), then home and Elsewhere (VV-D2, VV-D3).
- **the launcher**: the named folders' list opened over a plain folder (D50, D79): gone; `space v v` lists them from
  anywhere (VV-D5).
- **plain folder**, **loose file**: a folder, a file, outside every vault, opened by its path: Elsewhere now, and a
  file of it is Elsewhere's, never opened beside a vault's notes (VV-D3); `~` is home (VV-D2).
- **the roots beside the tree**, **pinned roots** (`:pin-root`): the explorer's other roots (D65, D77): gone; the
  explorer's zoom holds them (VV-D5).
- **the LSP face** (`slipbox lsp`): removed; editors' own markdown servers follow path links, and agents use the CLI
  (D67).
- **root**, **root marker**, **trusted root**: a vault, a vault marker, a trusted vault (VV-D1, reversing D79's choice
  of root for what users read). The word stays where agents, scripts and configs depend on it: the `--root` flag and
  `SLIPBOX_ROOT`, the `root` field of the CLI's JSON and its values, the settings `[trust] roots`, `walk.root_markers`,
  `capture.location = "root"` and `links.path = "root"`, the explorer's actions `rename_root`, `make_root` and
  `unmake_root`, the colour role `sidebar_root`, the command ids `root.trust` and `root.untrust`, and the state file
  `roots.json`. The settings' older words, `vault`, `rename_vault`, `make_vault`, `unmake_vault` and `sidebar_vault`,
  are still read as them, unwarned (DF-D22; `OLD_VALUES` in `core/application/config/config.ts`, `OLD_ROLES` in
  `core/rendering/theme/theme.ts`).
- **scope** (D55, never built): the vault (D56, D80).
- **session**, for what slipbox restores: a workspace (WSP-D1); the word stays in `ui.restore_session` and
  `session.json`.
- **Scout**: now trailscout, a project of its own; the outside search engine waits for its SDK (D124). Search still
  cuts sections as scout does (D116).
- **`[[vault:note]]`**, **`vault:path`**: a pointer, `slipbox://name/path`, in files; a path on screen (D60, D75, D79).
- **`slipbox vaults`**, **`rename-vault`**, **`--scope vault`**: `slipbox folders`, `slipbox name`, `--scope here`
  (D79).
