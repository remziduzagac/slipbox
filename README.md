# slipbox

A terminal markdown notes app: Obsidian's model without the GUI, with agent integration as the
distinguishing feature. It reads a vault of markdown notes, renders them properly (tables that
fit, highlighted code, themes), follows `[[wikilinks]]`, and reloads the instant an agent rewrites
a note. Every state change is also reachable from a CLI that agents drive.

Status: **phases 0–3** — rendering (leaf parity), a TUI that reads and edits (source mode, vim-shaped
editing, the lens, autosave and a conflict prompt), and an agent-drivable CLI. See
[docs/plan.md](docs/plan.md).

## Try it

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
bun src/main.ts examples/vault                      # the TUI, on the demo vault
bun src/main.ts render examples/vault/equipment/telescope-comparison.md  # render to stdout
scripts/install-local.sh                            # a `slipbox` launcher in ~/.local/bin
```

A vault is any directory with a `.slipbox/` marker (`slipbox init`). Without one, slipbox runs in
single-file mode.

## In the TUI

A reading cursor moves with vim keys or the usual editor keys. `space` opens a which-key popup
listing everything else, and `?` lists every key, so nothing needs memorising:

- **Moving:** `h` `j` `k` `l` or the arrows; `w`/`b` or `alt+left`/`alt+right` by word; `[ [` /
  `] ]` or `alt+up`/`alt+down` by heading.
- **Links:** `enter` follows the link under the cursor; `shift+h` / `shift+l` go back and
  forward.
- **Finding and copying:** `ctrl+p` switches notes, `ctrl+f` finds, `ctrl+h` finds and replaces
  (or vim's `:%s/old/new/g`), `:` opens the command palette, and `v` selects then `y` copies.
- **Panes:** `ctrl+e` explorer and `ctrl+o` outline (each opens, then focuses, then closes;
  `esc` returns to the note), `ctrl+w v` split, `ctrl+t o` new tab. Everything is clickable too.
- **Editing:** `i`, `a` or `o` start typing — in the lens (rendered, with the markdown around the
  cursor between two rules) or in source mode (`space n v`); `esc` twice closes the lens. The vim
  commands work (`dw`, `ciw`, `p`, `u`, `.`); `ctrl+s` saves, and autosave does after a pause. `x`
  ticks a task; `space n e` hands the note to your editor, `space n s` to a running nvim.
- **Quitting:** `ctrl+q`, and slipbox remembers where you were.

Every key is in [docs/design/keymap.md](docs/design/keymap.md), and all of them are configurable.
The configuration reloads itself when you save it.

## For agents

On the demo vault (`cd examples/vault`; `bun ../../src/main.ts` if `slipbox` isn't installed):

```bash
slipbox resolve '[[telescope-comparison#Summary]]' --from home.md --json
slipbox backlinks telescope-comparison --json
slipbox find 'Aster' --json                  # a note's text, or the whole vault's
slipbox read home --json                     # the raw text and its sha
slipbox write home --stdin --if-unchanged <sha> < new.md
slipbox replace home Aster Astra --dry-run --json
slipbox task 2026-09-14-weekly 17 --check
slipbox write observing-log-2026 --append -- '- 22:10 seeing 2"'
slipbox stat home --json                     # size, dates, title, link counts
slipbox links --all --json                   # every link in the vault, and whether it resolves
slipbox capture --ref ../../src/main.ts:1-3 --snippet
slipbox render home --plain
```

One JSON object per call with `--json`; stable exit codes. The skill in
[skills/slipbox/SKILL.md](skills/slipbox/SKILL.md) teaches the surface.

## Documents

| Document | What |
| --- | --- |
| [docs/handoff.md](docs/handoff.md) | orientation and traps |
| [docs/idea.md](docs/idea.md) | what and why |
| [docs/plan.md](docs/plan.md) | work items and phases |
| [docs/design/](docs/design/README.md) | how it is built — kept true to the code |

## Development

```bash
bun run check        # typecheck + the core-never-imports-tui boundary + tests
bun run e2e --tab    # the terminal tests: slipbox itself in a herdr pane (needs herdr)
```

The test strategy, the demo vault (`examples/vault`) and the terminal tests are in
[docs/design/testing.md](docs/design/testing.md).
