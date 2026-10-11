# slipbox

A terminal markdown notes app: a shared workspace for humans and agents over plain files. It reads a folder of
markdown notes — a repository, an Obsidian vault, a zk notebook, or any folder — renders them properly (tables that
fit, highlighted code, themes), follows links in the folder's own conventions, and reloads the instant an agent
rewrites a note. Every state change is also reachable from a CLI that agents drive.

Status: **phases 0–5c** — rendering (leaf parity), a TUI that reads and edits (source mode, vim-shaped
editing, the lens, autosave and a conflict prompt), and an agent-drivable CLI; then files beyond markdown, search and
its index, roots, named folders and pointers, git and merge review, language servers, linters and diagnostics. See
the [roadmap](blueprint/roadmap.md).

## Try it

Requires [Bun](https://bun.sh) 1.4.2 or later (older ones lack what slipbox uses: `node:sqlite` for search, the
compile flags).

```bash
bun install
bun src/main.ts examples/vault                      # the TUI, on the demo folder
bun src/main.ts render examples/vault/equipment/telescope-comparison.md  # render to stdout
scripts/install-local.sh                            # a `slipbox` launcher in ~/.local/bin
```

Releases — a binary per platform, macOS and Linux (Alpine's musl too), with no Bun needed — are built and installed by
`scripts/release.ts` and its `install.sh` (`curl -fsSL …/releases/latest/download/install.sh | sh`), or Homebrew's
formula, through a tap; none is published yet. On Windows, slipbox runs in WSL — the Linux release, with Windows'
clipboard and fonts; native Windows is to come. How, and what keeps it safe:
[blueprint/design/distribution.md](blueprint/design/distribution.md).

A file's **root** is the nearest folder above it holding `.git`, `.slipbox/`, `.obsidian/` or `.zk/`: what `/` in a
link starts from, where a wikilink's names are looked for, whose link convention is followed. A folder without one
works too, as the folder opened. `slipbox init --name notes` gives a folder `.slipbox/` and a name that other folders
link to it by — `slipbox://notes/inbox.md` — wherever it is on each machine; a repository is named by its remote.

## In the TUI

A reading cursor moves with vim keys or the usual editor keys. `space` opens a which-key popup
listing everything else, and `?` lists every key, so nothing needs memorising:

- **Moving:** `h` `j` `k` `l` or the arrows; `w`/`b` or `ctrl+right`/`ctrl+left` by word; `[ [` /
  `] ]` or `alt+up`/`alt+down` by heading.
- **Links:** `enter` follows the link under the cursor; `ctrl+o` or `alt+left` goes back, `alt+right`
  forward.
- **Finding and copying:** `ctrl+p` switches notes, `ctrl+f` finds, `ctrl+h` finds and replaces
  (or vim's `:%s/old/new/g`), `ctrl+shift+h` in every note, `:` opens the command palette, and `v` selects then `y`
  copies.
- **Panes:** `space e` explorer and `space o` outline (each opens, then focuses, then closes;
  `esc` returns to the note), `ctrl+w v` split, `ctrl+t c` new tab. Everything is clickable too.
- **Editing:** `i`, `a` or `o` start typing — in the lens (rendered, with the markdown around the
  cursor between two rules) or in source mode (`space n v` or `ctrl+e`); `esc` twice closes the lens. The
  vim commands work (`dw`, `ciw`, `p`, `u`, `.`); `ctrl+s` saves, and autosave does after a pause.
  `ctrl+l` (or `space n t`, or a click) ticks a task; `space n e` hands the note to your editor, `space n s` to a
  running nvim.
- **Quitting:** `ctrl+q`, and slipbox remembers where you were.

Every key is in [docs/keymap.md](docs/keymap.md), and all of them are configurable.
The configuration reloads itself when you save it.

## For agents

On the demo folder (`cd examples/vault`; `bun ../../src/main.ts` if `slipbox` isn't installed):

```bash
slipbox resolve 'equipment/telescope-comparison.md#Summary' --from home.md --json
slipbox backlinks telescope-comparison --json
slipbox find 'Aster' --json                  # a note's text, or every note's
slipbox read home --json                     # the raw text and its sha
slipbox write home --stdin --if-unchanged <sha> < new.md
slipbox replace home Aster Astra --dry-run --json
slipbox task 2026-09-14-weekly 17 --check
slipbox write observing-log-2026 --append -- '- 22:10 seeing 2"'
slipbox stat home --json                     # size, dates, title, link counts
slipbox links --all --json                   # every link, and whether it resolves and how
slipbox link telescope-comparison --from home --json   # a link to write, in this folder's convention
slipbox resolve slipbox://halden/home.md --json        # a named folder's file, wherever it is here
slipbox capture --ref ../../src/main.ts:1-3 --snippet
slipbox render home --plain
```

One JSON object per call with `--json`; stable exit codes. The skill in
[skills/slipbox/SKILL.md](skills/slipbox/SKILL.md) teaches the surface.

## Documents

| Document | What |
| --- | --- |
| [docs/keymap.md](docs/keymap.md) | every key |
| [docs/configuration.md](docs/configuration.md) | every config key and environment variable |
| [docs/cli.md](docs/cli.md) | the CLI: commands, the JSON contract, exit codes |
| [blueprint/](blueprint/README.md) | the design: requirements, how it works, the decisions behind it, the roadmap |

## Development

```bash
bun run check        # typecheck + the core-never-imports-tui boundary + tests
bun run e2e --tab    # the terminal tests: slipbox itself in a herdr pane (needs herdr)
```

The test strategy, the demo folder (`examples/vault`) and the terminal tests are in
[blueprint/design/testing.md](blueprint/design/testing.md).
