# slipbox — decisions taken during phases 0–3

Decided 2026-09-25 while building phases 0–2, and 2026-09-28 for phase 3. Each entry answers a
**decide** item in `docs/plan.md`; the item ID is the heading. The plan's "Still open" table points
here.

## `0.10` — storage layout

*Superseded by `20.x` (decided 2026-10-02, built): personal state by instance, kept with the instances and confirmed
moves in the durable state (`20.5`); the cache shared by content (`20.11`); no home vault (`20.22`). This is how
storage works now.*

Four kinds of data, four places. Nothing derived ever lives in the vault. Revised 2026-09-30 by the vault design
(`docs/idea.md`, "Vaults — decided 2026-09-30"; plan `17.3`).

| Kind | Location | Holds | Safe to delete |
| --- | --- | --- | --- |
| config | `$XDG_CONFIG_HOME/slipbox/config.toml`, then the vault's | user and vault settings | no |
| cache | `$XDG_CACHE_HOME/slipbox/<key>/` | the persisted link index | yes, rebuilt on demand |
| cache, shared | `$XDG_CACHE_HOME/slipbox/parsed.db` | parsed content, by content (`20.11`) | yes, rebuilt as read |
| state | `$XDG_STATE_HOME/slipbox/<key>/` | positions, session, scratch, staleness, redirects, trash | no: yours |
| state, the machine's | `$XDG_STATE_HOME/slipbox/vaults.json` | the instances seen, their moves | no: the keys |
| data | `$XDG_DATA_HOME/slipbox/tools/` | language servers installed for you (`19.x`) | yes, installed again |

XDG defaults apply when the variables are unset (`~/.config`, `~/.cache`, `~/.local/state`, `~/.local/share`) on
macOS too — the terminal stack here is XDG-shaped on both machines.

**The key** is the instance's id (`20.5`): one copy of a vault on this machine — a clone, a worktree, a folder with
`.slipbox/` — has a local id slipbox gives it the first time it's seen, kept in `vaults.json` with where it is, and
never written into the folder. It's found by the folder's path. So two copies of a vault never share a session,
whatever their `.slipbox/` ids say, and a git vault without `.slipbox/` (`20.3`) has state of its own like any other.
A worktree that `git worktree move` took elsewhere is found again by git's name for it. Any other copy that turns
up where none was is new — unless it's confirmed to be one gone from where it was (below). A plain folder opened
outside every vault (`20.22`) is keyed by its path, `<basename>-<hash>`, the hash the first 12 hex characters of
SHA-256 over the root's **real path**: moved, it starts afresh. So is a vault when `vaults.json` can't be written.

**Moves are confirmed, not guessed** (`20.5`). A vault opened where it wasn't seen before, while a copy of the same
collection (`20.4`) is gone from where it was and was last seen before this one appeared, is asked about: "did it move
here?" In the TUI, a question when the vault opens — yes takes the gone copy's instance and its state (the one made
here meanwhile goes), no isn't asked again, `esc` asks next time; in the CLI, a warning on every command until
`slipbox vault-moved <old-path>` (or `--not`) answers. Each confirmed move is kept with the instance. The last time a
vault was seen is written at most every ten minutes, so a copy gone within minutes of another appearing may be asked
about too: no is the answer.

**Today's state moved once** (`20.5`): state and cache kept under the keys of before — a vault's id, a copy's
`<id>-<hash>`, a worktree's `<id>-wt-<name>`, a path's `<basename>-<hash>` — move to the instance's key the first
time it's opened, and `vaults.json` follows.

Consequences, accepted deliberately:

- State does not travel between the Mac and the VMs. Reading position is machine-local anyway.
- **A vault moved by hand loses its state until confirmed:** the question is the price of never handing one copy's
  session to another.
- A plain folder's state is its own, by its path (`20.22`): moved, it starts afresh. The home vault that held every
  loose folder's (`17.2`) is gone; its `$XDG_DATA_HOME/slipbox/home/config.toml` is no longer read.

**The parse cache is shared by content** (`20.11`): what a note says once parsed — links as written, headings, tags,
aliases, a title of its own — is kept in one SQLite file by its text's hash, its format and the parser's version
(`INDEX_VERSION`, bumped whenever what's extracted changes), for every copy on this machine: a worktree, a branch
switched to, a clone parses only what no copy has. A title from the file's name, the file's BOM and line endings are
the file's own, never cached; where a link points depends on where the file is, so links are resolved and backlinks
derived per copy. `SLIPBOX_PARSE_CACHE=off` goes without it.

**The scratch (`8.2`)** lives in the state dir by default, because a scratch inside the repo gets committed by
accident. It is not invisible to agents: `slipbox scratch path` and `slipbox scratch show` expose it. Setting
`capture.location = "vault"` puts it at `<vault>/<capture.file>` instead, for anyone who wants agents to see it
without the CLI.

## `0.11` — the file walk

One predicate, used by both the walk and the watcher (`5.2` is this decision seen again).

- **Extensions:** `.md` and `.markdown`, case-insensitive. Configurable as `walk.extensions`.
- **Always skipped:** `.git`, `.slipbox`, `node_modules`, and every entry whose name starts with a dot.
- **`.gitignore` is honoured**, including nested ones, with git's own semantics. The vault is usually a repo, and what
  git ignores (`target/`, `dist/`, vendored trees) is exactly what must not resolve `[[README]]`. Every
  `.gitignore` from the root down applies, and the deepest one with an opinion wins, so `!keep.md` re-includes. Case
  follows git's default `core.ignorecase`: insensitive on macOS, sensitive on Linux.
- **`walk.exclude`** adds gitignore-syntax patterns from config.
- **Reached, then indexed** (`20.8`): a git-ignored file, or one under a hidden folder, isn't walked, but is indexed
  when it's reached — a note's link points at it (and then its own links reach further), or it's opened in the TUI or
  named to the CLI — and stays indexed after (the list kept with the index). `.git`, `.slipbox`, `node_modules`,
  `walk.exclude` and a vault of its own are never reached: named, such a file is read and nothing more. A loose
  folder is listed, not indexed, and reaches nothing. Reached files aren't watched: they're read again when the
  index is next built.
- **Nested roots are boundaries.** A subdirectory holding a root marker of its own — `.slipbox/`, a git checkout's
  top (a repository, a submodule), an Obsidian vault's `.obsidian/`, a zk notebook's `.zk/` (`walk.root_markers`,
  `21.1`) — is a different root and is not walked (`20.3`; before, only a `.slipbox/` was, `17.18`). This keeps a
  fixture vault inside a repo from leaking into it, and a repository's notes, or an Obsidian vault's, its own.
- **Symlinks:** a symlinked *file* is included when its real path is inside the vault root, unless that target is
  already walked, since the same note twice would double every backlink. A symlinked *directory* is never followed:
  no cycles, no escaping the root. Anything pointing outside the root is skipped and reported (`7.5` constraint),
  and so is one pointing at something that isn't a file (a FIFO or a device, which a read would hang on).
- **Files a vault controls are read with care.** A cloned or unpacked vault can hold a symlink to `/dev/zero` or a
  FIFO where a note, `.gitignore`, `.slipbox/config.toml` or `.slipbox/version` should be. Every such read
  (`readRegular` in `core/fsutil.ts`) opens without blocking and refuses anything but a regular file, and the small
  files have a size cap (1 MB), so a hostile vault gets a warning, never a hang.
- **A plain folder** opened outside every vault is walked as a vault is (`20.22`); `$HOME` or `/` opened so is
  listed with the same filter and size cap, its one directory, not below it.
- **Size cap:** files over `walk.max_file_size` (default 4 MiB) are listed as skipped, not parsed.
- **Errors never abort.** Unreadable directories and files are collected and reported as warnings.
- **Encoding:** read as UTF-8. Invalid sequences decode to U+FFFD and the file is flagged; a BOM is noted and
  stripped for parsing only.

## `9.1` — the CLI command list

Read against zk's and nb's surfaces. Small on purpose. Global flags: `--root <dir>`, `--config <file>`, `--json`,
`--color auto|always|never`.

| Command | What it does | Stability |
| --- | --- | --- |
| `slipbox [path]` | open the TUI; refuses when stdin or stdout is not a terminal (`9.3`) | — |
| `slipbox render <note>` | render to stdout; `--width`, `--theme`, `--glyphs`, `--plain` | **stable v1** |
| `slipbox capture [text]` | append to the scratch: `--ref`, `--stdin`, `--snippet`, `--lang` | **stable v1** |
| `slipbox scratch show\|path\|clear\|copy` | read, locate, wipe or copy the scratch | **stable v1** |
| `slipbox resolve <link>` | follow a link: `[[target]]` text to a path; `--from <note>` | **stable v1** |
| `slipbox links <note>` | outgoing links with resolution status | **stable v1** |
| `slipbox backlinks <note>` | notes linking to a note | **stable v1** |
| `slipbox ls` | list notes | churns |
| `slipbox outline <note>` | headings with source lines | churns |
| `slipbox find <query> [note]` | text in a note or the vault: `--regex`, `--whole`, `--ignore-case` | churns |
| `slipbox replace <note> <old> <new>` | replace; `--regex`, `--first(-per-line)`, `--lines`, `--dry-run` | churns |
| `slipbox task <note> [line]` | list a note's tasks, or toggle one; `--check`, `--uncheck` | churns |
| `slipbox read <note>` | the raw text and its sha, for `--if-unchanged` | churns |
| `slipbox write <note> [text]` | write a note atomically, in the vault; `--stdin`, `--append`, `--create` | churns |
| `slipbox send <note>` | open it in a running editor (`editor.remote`); `--line`, `--server` | churns |
| `slipbox history` | notes the TUI read lately, newest first, and its open tabs | churns |
| `slipbox init [dir]` | create the `.slipbox/` marker (`1.10`) | churns |
| `slipbox info` | vault root, mode, config/cache/state paths, versions, staleness | churns |
| `slipbox themes` | list built-in and loaded themes | churns |
| `slipbox commands` | list the command registry (`0.8`) | churns |

**`--json`** always prints one object: `{"schema": 1, "ok": true, "command": "...", "data": ..., "warnings": [...],
"stale": [...]}`. Human output goes to stdout, diagnostics to stderr.

**Exit codes:** `0` ok, `1` error, `2` usage, `3` not found (note or link target), `4` ambiguous (a link, or
several nvims for `send`), `5` refused: by `--if-unchanged`, a write outside the vault or to what isn't a note of it,
`--create` over an existing file, a note that isn't valid UTF-8, a read of a symlink leading out of the vault.

**What reaches the state, from the CLI.** Every command in `core/command-specs.ts` names its CLI equivalent or is an
interaction (cursor, scroll, windows, modes, the UI's own toggles, the conflict prompt). Editing keys are
interactions; the state they change, a note's text, is reached by `write`, `replace` and `task`.

## `1.4` — link resolution

*Superseded by `20.2` and `20.22` (built 2026-10-02/03), then in part by `21.3` (built 2026-10-06): wikilinks are
read again, within their root, by the rules below — a name, a path, an alias, an attachment by its name (two of a
name, as two notes: the nearest, then the shortest). Previous names, `[[vault:note]]` and remembered moves stay
unread but by the converter (`20.1`); a leading `/` is the nearest root's (`21.2`); a move is evidence for a fix,
never a way to resolve.*

One policy everywhere, never the filesystem's:

- **Case-insensitive**, after Unicode NFC. `[[Readme]]` resolves to `readme.md` on the Mac and on beaver alike. The
  Turkish i's fold too (2026-10-06): `İ` lowers to `i` with a combining dot, which goes, and `ı` is `i` — so `[[izmir]]`
  finds `İzmir.md` and `[[ILIK]]` `ılık.md`; the exact spelling still breaks a tie (`links.ts` `normKey`).
- **Forms.** `[[name]]` matches file basenames without extension. `[[dir/name]]` matches a path suffix aligned on
  segments. `[[name.md]]` is accepted. `#heading`, `^block` and `|alias` are split off first; `\|` is an alias
  divider too, because that is how a wikilink is written inside a table cell.
- **Collisions** are a candidate list, never a silent pick. Disambiguation order: an exact-case match; then a candidate
  in the linking note's own directory; then the deepest shared directory with the linking note; then the shortest
  path (Obsidian's shortest-when-unambiguous). Still tied → **ambiguous**, all candidates returned, and the TUI shows
  a picker.
- **Markdown links** `[t](path.md)` resolve relative to the linking note; a leading `/` means the vault root.
- **Non-markdown targets** (`![[diagram.png]]`) resolve relative to the note, then the vault root,
  then by file name anywhere in the vault (several matches are ambiguous).
- **A loose file** (the home vault) resolves only within its own directory, not below it.

Extended 2026-09-30 by the vault design (plan `17.7`–`17.11`; `docs/idea.md`, "Links"), in this order after a
note's own name and path:

- **`[[vault:name]]`** (also `#heading`, `|text`): `vault` is a vault this machine knows (`vaults.json`) by its name or
  an alias; `name` then resolves there by the rules above, from the vault's root. The vault is opened once, with its
  own config, and its index refreshed (indexing on demand). This vault's own name reaches its own notes. A note named
  `a:b` here wins over vault `a`. Unknown, it's **unresolved** with a reason — `unknown vault "x"`, `no note "y" in
  vault "x"`, or `vault "x" was last seen at <path>` when the list knows it but the folder is gone. The home vault is
  never a target.
- **Aliases:** frontmatter `aliases` (or `alias`) reach the note like its name, after every file name; several go
  through the same disambiguation.
- **Previous names**, a fallback only and said so (`via`): frontmatter `previous_names` when exactly one note claims
  the name (several: ambiguous); for a vault, `[vault] previous_names`, counted only while that vault's config still
  says so under the same id — a new vault that took an old name can't take its links. *Later:* `21.3` reads a note's
  previous names only in the converter, and `21.12` stops writing them; a folder's still find it by pointer.
- **Paths out of the root:** `[t](../other/x.md)` reaches the file when it exists, in whichever root holds it.
- **Filesystem paths** (`17.16`), for what other editors and agents write: `../` out of the root, `~/` (the home
  folder), an absolute path, a `file://` URL — in a markdown link (percent-decoded) or a wikilink (without an
  extension, a note: `.md`, `.markdown`). A leading `/` is the vault's root first (GitHub's reading), the
  filesystem's when nothing there matches. A path landing in this vault is its note or file like any other link's
  (and a backlink); elsewhere, the file by its absolute path. Other vaults' links in these forms count as backlinks
  here too.
- **Moves** (`17.12`), last: a path, `[[dir/old]]` or `[[old]]` that reaches nothing follows the vault's redirects
  (`redirects.json` in its state), chains included, to where the note is now (`via: "redirect"`). A move is detected
  by content, whoever made it (slipbox, `mv`, git, a file manager): the index keeps each note's content hash, and a
  note gone from one path whose text turns up at exactly one new path — and no other gone note had that text — was
  moved. The watcher's removal and arrival pair up the same way, in either order, within a minute. Redirects are
  state, not cache: only seeing the move teaches one.
- **Backlinks across vaults:** a note's backlinks include the links other vaults' indexes (in the cache) make into
  it — `[[thisvault:name]]` and paths — as fresh as each one's last indexing. Vaults nested in this one and the ones
  holding it count like any other: the walk leaves their files to them.
- **Nested vaults know each other** (`17.17`): the vaults nested in this one (the walk's boundaries) and the ones it
  sits in (the folders above) are recorded in `vaults.json` when a link or backlink needs them, so `[[name:note]]`
  reaches them, and their links count, without their having been opened on this machine first; a nested one with no
  index yet is indexed then. A vault path into a nested vault — `[t](outreach/index.md)`, `[[outreach/index]]` —
  reaches the note there, as a path out of the root does.
- **Making and unmaking a vault** (`18.11`): a folder made a vault, or a nested vault made a plain folder, keeps every
  link reaching what it reached — only the ones that would stop are rewritten, each as close to how it was written as
  still works (a name stays a name, with the vault's name before it across the boundary; a name two notes would share
  once merged becomes a path). Paths are left alone: they reach their file wherever the roots are.
- **Same-named vaults:** several vaults a name reaches are ambiguous — unless exactly one of them is nested in the
  linking vault or holds it: that one is meant. Two clones of a repo holding a vault each reach their own, and a link
  from one isn't a backlink in the other.

This opens an existing Obsidian vault unchanged for the default "shortest path when possible" setting.

## `1.6` — tags

Obsidian's tags, so a vault's read the same in both. A note's tags are its frontmatter's `tags:` (a list or a string,
`#` optional) and the `#tags` in its text: letters, digits, `_`, `-` and `/`, not digits only, after a space or at a
line's start — so never `a#b`, `page#part` in a URL, `[[a#b]]`, a heading's `#` marker, or anything in code (a
micromark extension, as wikilinks are). `/` nests: `#dome/shutter` is under `#dome`, and a parent's notes include its
children's. `#Dome` and `#dome` are one tag, shown as first written (the first note by path, its frontmatter before
its text).

## `3.18` — footnotes, added and changed

A footnote stays GFM's, in the note: `[^label]` where it's cited, `[^label]: text` wherever it's defined. A new one
takes the next free number (one past the highest numeric label) and its definition goes at the note's end — in the
block of definitions that ends it, else after a blank line — never reordered: tidying them into reference order would
rewrite footnotes nobody touched. Its reference goes after the word the cursor is on; a rendered row knows its source
only by line, so the word is found in its paragraph's source by how many times it came before, and never lands
inside a link's or code's syntax. Edits, renames and deletes change the text they name and nothing else.

## `3.20` — the properties editor

A note's properties are its frontmatter's text, edited as text: in a floating window holding a view of a buffer that
isn't a file — the same editing keys, undo and highlighting as any — and written back into the note's frontmatter as
one edit, never parsed and re-serialised (as `7.6` has it). Closing writes back, as leaving the lens keeps its edits;
there's nothing to lose by accident, since the note's undo takes it back. Text that doesn't parse is written only if
you say so, and so is text written over a frontmatter that changed under it.

## `19.6` — trust

Language servers and linters run the project's code: rust-analyzer its build scripts, the ESLint server its
`eslint.config.js`, the project's own `node_modules/.bin` and `.venv/bin`. Decided 2026-10-01 with the user:
**everything is trusted**, as nvim and Helix trust it — no question per folder or repository, no list of trusted
places. Unchanged by it: a vault's committed config never names a program to run (`command`, `args`, `environment`,
`lint-command` are the user's config's only), so cloning a vault can't choose what runs; what the project's own
tools do is the project's.

## `20.x` — plain paths, virtual vaults

Decided 2026-10-02 with the user, revised the same day after a review; built (plan `20.1`–`20.23`, done 2026-10-03).
Being revised by `21.x` below (proposed and reviewed 2026-10-05, not built yet).
The model in full is `docs/idea.md`, "Plain paths, virtual vaults". It supersedes `17.2` and `17.18` (the home vault;
every root a `.slipbox/`), `1.4`'s resolution by name, `0.10`'s keys, `17.12`'s redirects as a way to resolve, the
LSP face (`11.x`), and `17.20` below. In short:

- **Links are plain paths** — relative (written so), `~/`, absolute (`/` is the filesystem's root), `file://`.
  Relative links within a repository are portable; the others depend on the machine's layout. In code and data files
  (`16.10`, `16.15`) a leading `/` keeps meaning the vault's root, as a repository's own paths do. A link resolves without
  the index, and a broken one stays broken until repaired. Wikilinks aren't read until a compatibility layer exists;
  a one-time converter rewrites them, and today's `/…` links, as relative paths, previewed.
- **Vaults are virtual:** a file's is its nearest boundary — `.slipbox/` or a git checkout, one vault when both share
  a folder; a plain folder opened is an unnamed instance. **Collections** (a `.slipbox/` id; a repository, recognised
  by its remote or first commit) are apart from **instances** (a clone, a worktree, a folder: a local id with personal
  state). Names are display: short, unique here, `.` for a collision, a worktree's branch shown with `@`; never in a
  file — `vault:path` is on screen, in completion and in the CLI. *Later:* `21.9` shows files by path, and `21.12`
  removes the form: an argument names another folder's file by its pointer.
- **The index is a cache, history is state.** On demand carries the load (folders opened, links followed, CLI paths);
  a background auto-index of the home folder fills in. Freshness is checked by each file's size and time; coverage is
  shown, and the CLI can refresh. Parsed content is shared by content hash, parser version and settings; links and
  backlinks are resolved per instance. Instances, their locations and confirmed moves are durable state.
- **Generated edits are plans,** tied to file hashes, refused when stale; the CLI plans and applies in two steps.
  Changes made elsewhere repair the index; file fixes are asked for. Before a merge, `git merge-tree`'s result is
  checked for broken links; after one, git's renames are evidence for fixes. Hooks are opt-in.
- **Search** ranks the current vault, then linked vaults, then everything on a key (`--scope vault|linked|all`).
- **Settings,** deeper over broader: the nearest `.slipbox/config.toml`, outer ones, the user's; programs from the
  user's own config only.
- **The LSP face goes** (gone: `20.23`, built first, 2026-10-02); the client for code stays.

## `21.x` — paths inside, conventions at the edges

*Proposed 2026-10-05 with the user, after a survey of how other tools handle links, and reviewed with the user the
same day; being built (plan `21.x`: `21.1`–`21.7` and `21.11` done; `21.9`, `21.10` in part). The model in full is
`docs/idea.md`, "Paths inside, conventions at the edges". It revises `20.x` above.*

- **Inside, a link is a path;** each written form — a relative path, `/…`, an extensionless path, a wikilink,
  `file://`, `~/`, a `slipbox://` pointer — has a reader and, but for `~/`, a writer. The index, backlinks, renames,
  repairs, the merge review and plans see only paths.
- **A leading `/` means the nearest root, then the filesystem's path.** Every tool surveyed gives `/` a root's meaning;
  none the filesystem's (`20.2`'s choice, reversed). A plain folder has no root: there `/` is the filesystem's alone.
- **A path without an extension** is the file as written, else its note (`plan` → `plan.md`), else a folder; **a
  link to a folder** resolves (decided 2026-10-06): followed, the folder is revealed in the explorer; a move of the
  folder rewrites it. Renames keep each form: `/…` from the root, no extension, a folder's trailing `/`.
- **A file's root is its nearest, however it's opened** (decided 2026-10-06): `--root` says where to start and where a
  note's name is looked for; a root nested in it stays one. (`17.20`'s "`--root DIR`: `DIR`, exactly" is superseded.)
- **Roots come from markers** — `.git`, `.slipbox/`, `.obsidian/`, `.zk/`, configurable in the user's config — and only
  answer what `/` starts from, a wikilink's scope, whose convention applies, what travels together, and what's named.
  The user never manages one.
- **Wikilinks are read again,** within their root: names, paths, aliases, attachments by name; ties ambiguous, never
  guessed; no root, no names. Previous names, `[[vault:note]]` and remembered moves aren't (`20.22`'s removals kept).
- **Each folder's convention is followed:** the user's setting, else its tool's, else what its notes do, else relative
  paths. Renames keep each link's form. The screen shows what the file says. Built (`21.4`, 2026-10-06), with what
  the tools' own settings showed: Obsidian's extension follows the style (a wikilink drops `.md`, a markdown link
  keeps it); zk writes a markdown link from the note and a wikilink from the notebook's top (its source, not its
  docs' `{{path}}`), a custom template saying nothing; the style is found first, and the path and extension within
  it — a tool's as it writes that style, the notes' among their links of that style. **A markdown link is never by
  name** (slipbox reads it as a path, `21.2`): Obsidian's default "shortest" says nothing of one, and the next source
  answers. Two-thirds exactly (6 of 9) is a majority.
- **Named folders, built** (`21.6`, 2026-10-06): a `.slipbox/` name wins over a repository's remote (someone chose
  it; the remote is kept as its qualified name); copies are one `.slipbox/` id, else one remote; a worktree's copy is
  its main checkout; a `.slipbox/` git's exclude file keeps out is private. The question about a second copy comes only
  when two copies are here — a copy gone (moved, unplugged) stays listed, unavailable, and lookups take another copy
  meanwhile, said so. Built beside the 20.x model (display names, instances, `vault:path`), which `21.12` removes.
- **Pointers, built** (`21.7`, 2026-10-06): a branch is written as it is (`@agent/sync-retry`, as the reference set
  writes one) and told from the path by the branches the repository has — the longest; `%2F` reads too. A rename keeps
  a pointer one, by its name as written (an old name stays until the relink); a whole named folder moved rewrites no
  pointer. Followed: an unknown name or a gone copy says why, never offering a note by that name; a name of different
  `.slipbox/` folders lists each, and renaming one (the parent folder's name prefixed, the config edit previewed); a
  pointer from a file of no root follows like a URL. A wikilink root writes a pointer as a markdown link.
- **Where a fragment lands** (2026-10-06, from trailscout's review): one matcher (`core/landing.ts`) for the follow,
  the hover, the link check and the CLI. Explicit ids first (`{#id}`, `<a id>`, `<a name>`); then a markdown link
  takes GitHub's slug, repeats numbered (`#setup-1`), and a wikilink the heading's text, as Obsidian reads it — of
  several, the first, and the link check says so (`ambiguous-heading`); a path of headings (`Install#Linux`) each
  inside the one before. Lines: `L42`, `L42-L50`, `L42C5-L45C10`. A `^id` in fenced code is code. Slugs keep marks
  (GitHub's), so a converted link to a Devanagari heading works on GitHub too. **Links in front matter**, as Obsidian's
  properties have them (`related: "[[Plan]]"`), are links: read where written (a comment's not), backlinked, renamed in
  place, drawn as links in the properties block, checked. **How every link landed** is said (`links.ts` `Landed`,
  `graph.ts` `certainty`): by its path, a path's end, a unique name, an alias, or a tie broken; a tie broken by where the
  link is (the deepest shared folder, the shortest path) is **fragile** — linted with the path that names its note for
  sure, offered as a code action — and a note coming or going that moves a link by name (a namesake, a name an alias
  had) is said, in the TUI and as the CLI's warning, not only a link that breaks or heals. **A link to the
  repository's own hosting** (`https://github.com/me/repo/blob/main/x.md`, GitLab's, Bitbucket's, its page, `#readme`)
  is the file in this copy — this checkout's remote, or a named folder's — a backlink, rewritten in place by a rename;
  another ref than the branch here is inferred and said (`core/hosting.ts`).
- **Links slipbox writes** (`21.5`, 2026-10-06): completion (`](` and `[[`), the link picker (`space l i`) and `slipbox
  link`, which prints one for an agent, all through `core/write-link.ts`. A wikilink is a name only where the name
  reaches the note from the linking file — else its path from the root, never a name that would land elsewhere; a
  relative wikilink starts `./` or `../`, so it's never read as a name. The scratch's captures are `path:line`
  references in code spans, as agents read them — not links, so the convention leaves them be. A rename keeps each
  link's form, a name falling back to a path when the new name would be ambiguous.
- **Between files that travel together** (one repository or submodule, one folder tree outside git), the convention;
  **into a named folder,** `slipbox://<name>/<path>` — a repository named by its remote (short, qualified on a clash), a
  folder by its `.slipbox/` name, never by a folder's own; **otherwise,** a relative path. Relinking a link between
  separate repositories to fit each machine's layout would fight itself across machines; a name doesn't.
- **A pointer names what travels:** a repository (this machine's default copy, asked once when a second appears), or a
  repository at a branch (`@refactor`); never a copy. Copies are told from different folders of one name by the
  remote, or by the `.slipbox/` id; a clash between different folders asks to rename one when it matters. Where each
  name lives is a durable lookup in the state folder.
- **Vaults stop being a concept:** collections and instances, display names, `vault:path`, the move question and
  `previous_names` on rename go. Personal state is kept in the state folder by root (else the folder opened),
  positions by file; a named folder moved by hand takes its state along when the evidence matches, else starts fresh.
  The `.slipbox/` id is written only by `slipbox init` and `slipbox name`, never on its own.
- **Words:** folders, not vaults; `slipbox folders` (and `folders default`), `slipbox name`, `--scope here|linked|all`;
  note arguments take `slipbox://` pointers.

## `17.20` — a folder is enough: scope, settings and identity apart

*Superseded the same day by `20.x` above, before any of it was built: links are paths and vaults virtual, rather than
a folder's scope deciding what a name means. Kept as a record of the step between.*

Decided 2026-10-02, revising `17.18` (every root has a `.slipbox/`) and `17.2` (loose files in the home vault). Not
built yet: plan `17.20`–`17.24`.

A vault bundled three things: **scope** — the files a `[[name]]` is looked up among, that search covers, the watcher
follows and a rename updates; **settings** — `.slipbox/config.toml`; **identity** — an id that keeps state across a
move, and a name `[[name:note]]` reaches. Reading, editing, links, backlinks and search need only the scope. What
makes links fast is the index — each file's names, headings and links, cached per scope — and it's the same however
the scope was found. So a folder is enough, and settings and identity are layers added on purpose.

**Which scope:**

| Opened as | Scope |
| --- | --- |
| `--root DIR` (the CLI, agents) | `DIR`, exactly: no marker needed |
| a folder (`slipbox ./notes`) | the nearest `.slipbox/` at or above it, else the folder itself |
| a file | the nearest `.slipbox/` above it, else its git checkout, else its folder |
| nothing | the current folder, by the folder's rule |
| an editor (the LSP face) | each workspace folder, by the folder's rule |

- `~` and `/` are never walked: a file directly in one is a scope of its folder one level deep, as loose files are now.
- A nested `.slipbox/` stays a boundary.
- One rule for the CLI, the TUI and the LSP face. A link means what its scope makes it mean, so the scope and why
  (`explicit`, `configured`, `git`, `folder`) shows in the TUI's file info and in `slipbox info --json`; an agent that
  needs a fixed answer passes `--root`.
- Which markdown server an editor attaches where (slipbox's or marksman) stays the editor's config: its root markers.

**Every scope works alike:** a recursive walk, the cached index, the search index, the watcher, move detection and
redirects, git — keyed by its real path (`vaultKey`), or by its id when it has one. Opening a folder writes nothing
into it.

**Settings and identity are explicit.** `slipbox init` writes `.slipbox/config.toml` with an id and a name: then
`[[name:note]]` reaches the folder, and its state follows it when it moves (its path-keyed state moved over once).
Discovery only reads — a `.slipbox/` without an id is keyed by its path until `init` gives it one — and the prompt to
make a repository a vault goes. The launcher's recent folders are a list of their own, apart from named vaults: two
folders called `docs` both open, and neither takes the name.

**Git:** a branch switch changes a scope's files, handled as now (`5.9`); each worktree is a scope of its own, with its
own index and state (`17.19`, its key unchanged); the worktree picker opens the matching folder in another worktree
whether it has a `.slipbox/` or not.

**Kept:** existing vaults — their ids and keys, names, aliases, previous names, `[[name:note]]`, renames across
vaults. **Moved:** the home vault's per-folder sessions and positions, into each folder's own key the first time it's
opened.

## `11.1` — the protocol library, both ways

*The server's half went with the LSP face (`20.23`, 2026-10-02): `vscode-languageserver` is a dev dependency now,
for the tests' fake server only. The client's half — `vscode-languageserver-protocol`, for code — stays.*

`vscode-languageserver` (10.1, the server's side) and `vscode-languageserver-protocol` (3.18, the client's: the
JSON-RPC connection and every message's type) run under Bun as they do under Node, and in the compiled binary —
checked 2026-10-01 with a server and client of a few lines, then the client against vtsls, pyright,
bash-language-server, lua-language-server and vscode-css-language-server. One library serves both directions;
`vscode-languageclient` is VS Code's own and needs its API. What the client learned:

- **npm servers run on slipbox's own Bun.** vtsls, pyright and bash-language-server run under Bun, and the compiled
  binary is Bun when `BUN_BE_BUN=1` is set: it installs a server (`add --ignore-scripts --exact`, into a folder of
  its own, in two seconds) and runs it. No Node, nothing global (`19.5`).
- **Diagnostics come both ways.** Older servers send them; newer ones — the CSS server, for one — wait to be asked
  (`textDocument/diagnostic`, LSP 3.17). The client does both.
- **A server needs its settings.** Asked for them and given none, the CSS server checks nothing, so each server
  slipbox knows comes with defaults, as nvim-lspconfig's do (`19.2`).
- **A server finds its helpers on `PATH`.** bash-language-server runs shellcheck only when it's there; Mason's `bin`,
  where it often is, goes on the servers' `PATH` when slipbox finds Mason (`19.4`).

## `1.11` — embeds

An Obsidian vault is full of `![[…]]`: every pasted picture, and — for anyone who writes long pieces from small notes,
or keeps notes that gather others' sections — notes and headings. A reader that draws them as references shows those
notes nearly empty, so slipbox draws an embedded note in place. Read-only: editing another note inside this one would
make every key ask which note it's in; `enter` on the header opens it instead. Its rows sit at the embed's line, so
everything that knows a note by its lines — anchors, the cursor, the lens, the outline — knows only the note shown,
and nothing about them changes. Its links are its own, resolved and followed from where it is, as Obsidian does.
Search, backlinks and the context bundle are untouched: an embed is a link already, and its text belongs to its note.

## `5.9` — a branch switch as one event

A checkout rewrites any number of files at once, and the watcher sees each on its own: reloads, moves detected by
content hash, a session's tabs on notes that may not exist here. So git's own lock decides when to look — the watcher's
news is held while `index.lock` exists and applied together after — and HEAD, read from `.git` each second and with
each batch, decides what it was:

- **Not moves.** A note only one branch has goes and comes back at each switch; taken for a move, it would leave
  redirects that make `[[name]]` find the other branch's note, never offering to make it. So the files of a switch
  aren't paired, nor, at the next open, those of an index written on another branch (it records its branch). A pull or
  a merge keeps the branch: a rename it brings is a real one.
- **Each branch its tabs**, kept in the one session: switching back to a branch is going back to what you had there.
  Never over an unsaved note — closing it would lose it.
- **Undo is the branch's**: each rename records the branch it was made on, and is offered only there; on another it's
  in the way of nothing, and the hash check would refuse it anyway.

## `5.11`–`5.14` — git, for reviewing

Worktrees are agents' tasks, so what slipbox shows of git is what a review needs: which files a branch changed, and
how. Changes are measured from the **merge base** with the base branch, as a pull request's diff is — against the base's
tip, what `main` did since would show up too, backwards. Uncommitted and untracked files count: an agent's work isn't
always committed. The explorer's marks come from `git status` asked in the background, a moment after anything
changed — never on the keystroke's path; what's on request (a diff, the changes, the worktrees) asks git there and
then. Staging and committing stay git's: slipbox shows, it doesn't commit.

## `17.19` — git worktrees

A linked worktree (`git worktree add`) is a separate vault of the same repository: the same id and name, its own
state and cache — worktrees are an agent's task, each its own context (scratch, positions, session, indexes) — and
which checkout it is comes from the files under `.git` (a worktree's `.git` is a file naming
`.git/worktrees/<name>`, whose `commondir` is the repository's), never a git process and never where the folder is:
`project/worktrees/x/feat` is a worktree of `project/x` as surely as `x/.worktrees/feat` would be.

- **Keys:** the main checkout's state is the id's, a worktree's `<id>-wt-<name>` — git's name for it, so moving the
  folder keeps it. Not "whichever was opened first": that would hand the main checkout's key to an agent's worktree.
- **Identity is never written from a worktree.** Each would write its own id (and a distinct name), and merging the
  branches would conflict over the vault's identity. A worktree whose config has none takes the main checkout's;
  with none there either, its path keys it until the main checkout has one, committed.
- **`[[x:note]]` from another vault means the main checkout**, the stable one — not the most recently opened, which
  an agent's CLI calls in a worktree would keep changing. Inside a worktree, its own name means itself: its branch.
- **Backlinks don't count a worktree's links**: its notes are copies of the main checkout's.
- **A relative path out of the repository is taken from the main checkout** in a worktree: `../y/plan.md` names the
  sibling repository beside the main one, wherever the worktree is kept; inside the repository, the worktree's own.
- **A worktree that's gone** (merged, removed) has its cache removed at once; its state — an agent's scratch — a month
  after it was last seen.

`.slipbox/` is committed, so a merge merges it; there's little in it — the identity, written once, and settings — and
nothing slipbox writes while it's used: state and caches are outside the repository, per checkout.

## `6.1` — search

Search is our own, in the core, so the CLI, the TUI and later the LSP share it: an SQLite FTS5 index in the vault's
cache, and a scan of the files with the same query and a BM25-like
score while there's none, so a search always answers. It's deliberately small — words, phrases, prefixes, exclusions,
`title:`, tags and folders, ranked by BM25 with the title weighing most — because a fuller engine (Scout: semantic
search, the graph) will sit behind the same API when it's there; slipbox's is the fallback.

- **SQLite is better-sqlite3** (since 2026-10-01; Bun's own `bun:sqlite` before). It bundles its own SQLite (3.53.4)
  rather than linking the host's, works the same under Node and Bun on macOS and Linux with no workaround (`bun:sqlite`
  needs `setCustomSQLite()` on macOS), and is what scout uses — a process holding both loads one SQLite. Measured
  with scout: Bun 1.3 panics on it (exit 133), so slipbox needs Bun 1.4.2 and says so at start. Every JS number binds
  as a double (`bun:sqlite` narrowed integral ones), so an integer the schema needs is bound `CAST(? AS INTEGER)` —
  audited: FTS5's rowid and `LIMIT` accept a double in 3.53.4, cast anyway, since vec0's key does not. It loads
  through its per-platform entry by a literal name (`core/sqlite.ts`): that one's binary `bun build --compile`
  embeds, where the default entry would look for the build machine's `node_modules` at run time.
- **A row per file, not per section.** A search's words are a note's, wherever in it; with a row per section, words
  in two sections of one note found nothing. The hit still opens at the section with most of the words.
- **Sections are scout's** (since 2026-10-01, scout's Stage 4; before, a data file was cut every 80 lines): a file's
  containment tree — a root (`§:file`: the frontmatter and what comes before the first heading), each heading owning
  what follows to the next as high, never cut in fenced code — cut to a size band on each node's **own** tokens
  (bytes / 4, its text without its sub-sections'): from 400 to 1500 kept; over, split at paragraphs into `§:part`
  pieces (a fenced block one unit, kept whole and marked oversized when it alone is over; a last piece under 400
  onto the one before); under, merged into its parent, bottom-up, the parent then tested carrying it. The root is
  always kept. A data file, with no headings, is one section or band-sized `§:chunk`s at blank lines. Names are
  scout's (`Auth/How auth works`, `§:part~2`; `%`, `~`, `/`, `#` encoded; a repeated name `~2` by `normKey`). So a
  hit carries the section it's in, name and line range, as scout would cite it: a scout result for the same file and
  range is the same hit. Two models agree that way, and tier 2 can append scout's results deduped on them.
- **Where a hit opens is found finer than the band**: among each heading's own text, uncut (a data file's, each
  paragraph). The band merges a short note — the commonest — into its root, and a hit found only in band sections
  opens at any of the words rather than where most are: measured on this suite, `alpha beta` opened at a line with
  only `alpha`. The matching itself is unchanged (a row per file).
- **Read by a quick pass over the lines**, not the markdown parser: frontmatter, headings outside code, tags, the text
  as written. The tokenizer skips the markup; the parser would make a first build of a big vault take a minute.
- **Kept current two ways.** Each catch-up compares every file's size and mtime with the index's — whoever changed
  it, git or an agent with nothing running. And whatever changes a file through slipbox, or is seen by its watcher,
  reaches the graph, which says so to its listeners (`onChange`): the TUI's index updates a file as it changes, and
  an outside engine will hear of the same changes — moves too, which a watcher sees only as a delete and a create.
- **`find` stays**: every match of a literal or a regex, for when the question is "where exactly", not "which notes".

## `15.1` — a big note on other threads

A big note's parse runs on workers because its chunks already parse the same apart as whole: each worker takes a run
of them and sends its nodes back as JSON (a string crosses faster than a structured clone of the trees), and they go
into the buffer's parse cache — so the main thread's parse, the one everything reads, stays the only parse there is,
and finds nothing left to do. Four workers: more gain little, since the nodes still cross back one at a time. While
it runs the view shows a line saying so rather than half a note: a partial layout would put the cursor, the reading
position and a click somewhere the real one doesn't have, so keys wait for the parse (a third of a second at 20,000
lines) and a click is dropped. Only a note with 128 KB left to parse goes to the threads; below that, starting them
costs more than it saves.

## `9.7` — the context bundle

The bundle is the scratch's other half: the scratch is hand-picked, the bundle is gathered from the link graph, and
both are written the same way: a reference, then the text fenced as it is on disk. So one writer serves both
(`docs/idea.md`, "Scratch capture"). It isn't the export assembler (`10.1`): an agent reads a note's `[[links]]`
as they are, and the bundle's own references tell it where each file is; rewriting links or resolving embeds would
only make the text differ from the file it'll edit. Gathering is deterministic — breadth first, links in the order
they're written, backlinks by path — so the same vault gives the same bundle. A limit on files, not characters,
keeps whole notes whole; what's past it is named, so the agent knows to ask. The TUI saves unsaved notes first
(`4.10`): the bundle is read from disk, like everything an agent reads.

## `7.4` — undoing a rename

A rename is undone by restoring, not by renaming back: renaming back would plan again from the vault as it is now, and
a name only one way round (a link that became a path to stay unambiguous, a previous name added) wouldn't come back as
it was written. So each rename logs, in the vault's state, every file it wrote with the span of text that was different
before, and the undo gives exactly that back — as a plan of its own, so it's previewed, guarded and followed by the
index and the open notes the way a rename is. It's refused when a file has changed since the rename wrote it: the
text around the span is no longer the rename's to take back. The log is a stack, the newest undone first; there's no
redo — a rename does it again.

## `3.21` — the lint surface

slipbox runs your linter rather than shipping one: rules of its own would fight the ones you've written. The default is
markdownlint-cli2 (through `npx` at first; since `19.21` found as a server is, else installed into slipbox's own folder,
pinned — `npx` fetched whatever was newest, each machine its own), with the vault's markdownlint config or else
`~/.markdownlint-cli2.jsonc`, and "auto"
lints only where such a config exists — without one, markdownlint's defaults would flag every note that was never
meant to follow them. A note is linted from its file, so only once it's saved, and its findings show only while its
text is the text they were found in: a stale line number is worse than none. The linter is a program, so which one
runs is the user's config's to say (`lint.command`, as `editor.command`), never a vault's.

## `3.5` — reload anchoring

A buffer stores **source lines, never rendered rows**. Rendered rows change with every resize.

The anchor is `{ heading, headingIndex, offset, line }`: the nearest heading above the top of the viewport (its slug
and occurrence index), the source-line offset from it, and the absolute source line as fallback. On reload the heading
is found again by slug and occurrence; if it is gone the absolute line is used, clamped. An agent inserting a
paragraph above your reading position therefore does not move you.

## `3.11` — mode taxonomy and dispatch order

Revised 2026-09-28 with editing (phase 3); the keys are in [keymap.md](keymap.md). The layers:

| Mode | Owns keys | Examples |
| --- | --- | --- |
| overlay | every key | switcher, palette, pickers, prompts, the conflict prompt |
| filter | typed text, and moving through the matches | `/` in the explorer or the history |
| insert | typed text, and the few keys that edit or move | `i`, `a`, `o` in source or the lens |
| a character | the next key, as a character | after `f`, `t`, `r` |
| operator | a count, a motion or a text object | after `d`, `c`, `y`, `>`, `<` |
| resize | its own keys; any other key leaves it, then runs | `ctrl+alt+w`, then `h j k l` |
| pending | the next key of a sequence | `space l …`, `ctrl+w …`, `g g` |
| pane | keys of the focused side pane | explorer, history, outline |
| visual | selection keys, and movement extends | `v`, `shift+v` |
| source | source mode's and the lens's own keys, before the reading ones | `x`, `d`, `p`, `.` |
| normal | everything else | cursor, links, tabs |

**Dispatch order:** overlay → filter → insert → a character → (in source or the lens: counts and
an operator's motion, around the rest) → resize → pending → pane → visual → source → normal (with
keys pending, `esc` and `backspace` act on the sequence first). Keys are handled one at a time, in
order. Only keymaps at or above the one
holding a binding can make a key a prefix. Every binding names a registry command (plan `0.8`),
and config remaps all of them.

**The conventions that settle collisions:**

- **Direct keys are for navigation,** plus a few universal ones (`?`, `:`, `/`, `ctrl+f`,
  `ctrl+p`, the `y …` copies, `v`, `ctrl+e`, `ctrl+o`, `ctrl+q`; see keymap.md); everything
  else is under the leader, `space`.
- **No emacs keys**, and no `g` keys except `g g`.
- **Every `ctrl+` chord has a non-`ctrl+` route,** because terminals, multiplexers and browsers
  can swallow them. Cursor movement is exempt (it has its own alternatives: page keys, arrows,
  `home`/`end`), and so is `ctrl+c`, whose route is `y y`.
- **Plain `q` never quits** (`ctrl+q` does), and **`ctrl+c` only copies** (in a list or prompt it
  cancels).
- **Editing keys are vim's, and only where the text is editable**: `d c y p x .` and the rest live
  in the source layer (source mode and the lens), so reading keeps its own `x` (tick a task). The
  keys that start an edit (`i a I A o O`) and undo (`u ctrl+r U`) are in the reading layer too:
  they switch the window to source first.

## Phase 3 — editing

Its order and design are in `docs/plan.md` ("Phase 3 decided 2026-09-28"); how it works is in
[tui.md](tui.md). Two decisions that shape the code:

- **Source mode is another layout of the note**, not another editor: every row records the source
  offset of each cell, so everything built on the layout — motions, find, selection, the mouse —
  works on the markdown unchanged, and editing is a thin layer that maps the cursor to an offset.
- **Live preview is the lens** (reversing `docs/idea.md`'s "not chosen"): whole blocks as their
  markdown between two rules, composed into the render rather than re-rendered, so a block is
  either source or rendered and a keystroke never re-parses the note.

## Moved deliberately

- **Phase 2 is read-only.** `4.1`–`4.2` (`$EDITOR` hand-off) stay in phase 3 with the rest of editing, even though
  the v1 cut in `docs/idea.md` lists the hand-off. Phase 2's TUI browses, renders, copies text, holds several notes
  and follows external changes; it never writes a note.
- **`1.5` backlinks and `9.5` graph queries land with the phase 2 CLI**, because the stable CLI subset promises "a
  couple of graph queries" from phase 1 and the map falls out of the same parse as link-following. The TUI backlinks
  panel stays in phase 4.
