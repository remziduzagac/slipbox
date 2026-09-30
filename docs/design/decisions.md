# slipbox — decisions taken during phases 0–3

Decided 2026-09-25 while building phases 0–2, and 2026-09-28 for phase 3. Each entry answers a
**decide** item in `docs/plan.md`; the item ID is the heading. The plan's "Still open" table points
here.

## `0.10` — storage layout

Four kinds of data, four places. Nothing derived ever lives in the vault. Revised 2026-09-30 by the vault design
(`docs/idea.md`, "Vaults — decided 2026-09-30"; plan `17.3`).

| Kind | Location | Holds | Safe to delete |
| --- | --- | --- | --- |
| config | `$XDG_CONFIG_HOME/slipbox/config.toml`, then the vault's | user and vault settings | no |
| cache | `$XDG_CACHE_HOME/slipbox/<key>/` | the persisted link index | yes, rebuilt on demand |
| state | `$XDG_STATE_HOME/slipbox/<key>/` | positions, session, scratch, staleness, redirects | loses your place |
| state, the machine's | `$XDG_STATE_HOME/slipbox/vaults.json` | the vaults this machine has seen | re-added on open |
| data | `$XDG_DATA_HOME/slipbox/home/` | the home vault's `.slipbox/`: its config | a new id: loses state |

XDG defaults apply when the variables are unset (`~/.config`, `~/.cache`, `~/.local/state`, `~/.local/share`) on
macOS too — the terminal stack here is XDG-shaped on both machines.

**The key** is the vault's `id` when it has one — `[vault] id` in `.slipbox/config.toml`, random, made by
`slipbox init` and never changed — so its cache and state survive moving the folder. A repository without
`.slipbox/`, or a vault whose config declares no id yet, keys by path: `<basename>-<hash>`, the hash the first 12 hex
characters of SHA-256 over the root's **real path**, the basename only there so a human can find the directory. When
a vault gets its id, the state under its path's key moves over once. Loose files (the home vault) key by the home
vault's id.

Consequences, accepted deliberately:

- State does not travel between the Mac and the VMs. Reading position is machine-local anyway.
- **A copy of a vault carries its id** (`cp -r`, a second clone, a worktree). The copy that isn't where
  `vaults.json` last saw the vault keys by `<id>-<hash>` of its path, so two live copies never share a session; when
  the original is gone (the folder was moved), the copy is the vault and takes the id's key.
- The home vault holds every loose folder: its positions are keyed by absolute path, and each folder has its own
  session (`sessions/<basename>-<hash>.json`).

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
- **Nested vaults are boundaries.** A subdirectory holding its own `.slipbox/` is a different vault and is not
  walked. One vault per repo is the norm; this keeps a fixture vault inside a repo from leaking into it. **A
  repository root** (no `.slipbox/`, plan `17.1`) also stops at a nested repository (a `.git` in a subdirectory: a
  submodule, a clone): the nearest root holds each file. A vault walks into a repository inside it — the nearest
  `.slipbox/` wins.
- **Symlinks:** a symlinked *file* is included when its real path is inside the vault root, unless that target is
  already walked, since the same note twice would double every backlink. A symlinked *directory* is never followed:
  no cycles, no escaping the root. Anything pointing outside the root is skipped and reported (`7.5` constraint),
  and so is one pointing at something that isn't a file (a FIFO or a device, which a read would hang on).
- **Files a vault controls are read with care.** A cloned or unpacked vault can hold a symlink to `/dev/zero` or a
  FIFO where a note, `.gitignore`, `.slipbox/config.toml` or `.slipbox/version` should be. Every such read
  (`readRegular` in `core/fsutil.ts`) opens without blocking and refuses anything but a regular file, and the small
  files have a size cap (1 MB), so a hostile vault gets a warning, never a hang.
- **A loose folder** (the home vault, `17.2`) applies the same filter and size cap to its one directory, not below
  it.
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

One policy everywhere, never the filesystem's:

- **Case-insensitive**, after Unicode NFC. `[[Readme]]` resolves to `readme.md` on the Mac and on beaver alike.
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
  says so under the same id — a new vault that took an old name can't take its links.
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

This opens an existing Obsidian vault unchanged for the default "shortest path when possible" setting.

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
