# slipbox

A terminal markdown notes app: Obsidian's model without the GUI, with agent integration as the
distinguishing feature. It reads a vault of markdown notes, renders them properly (tables that
fit, highlighted code, themes), follows `[[wikilinks]]`, and reloads the instant an agent rewrites
a note. Every state change is also reachable from a CLI that agents drive.

Status: **phases 0–2** — rendering (leaf parity) and a read-only TUI with an agent-drivable CLI.
Editing arrives in phase 3. See [docs/plan.md](docs/plan.md).

## Try it

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
bun src/main.ts docs/samples/links-and-unicode.md   # the TUI
bun src/main.ts render docs/samples/wide-tables.md  # render to stdout
scripts/install-local.sh                            # a `slipbox` launcher in ~/.local/bin
```

A vault is any directory with a `.slipbox/` marker (`slipbox init`). Without one, slipbox runs in
single-file mode.

## In the TUI

A reading cursor moves with vim keys or the usual editor keys, and `space` opens a which-key
popup listing everything else, so nothing needs memorising:

- **Moving:** `h` `j` `k` `l` or the arrows; `w`/`b` or `alt+arrows` by word; `[ [` / `] ]` by
  heading.
- **Links:** `enter` follows the link under the cursor; `shift+h` / `shift+l` go back and
  forward.
- **Finding and copying:** `ctrl+p` switches notes, `ctrl+f` finds, `:` opens the command
  palette, and `v` selects then `y` copies.
- **Panes:** `ctrl+e` explorer, `ctrl+o` outline, `ctrl+w v` split, `ctrl+t o` new tab.
- **Quitting:** `ctrl+q`, and slipbox remembers where you were.

Every key is in [docs/design/keymap.md](docs/design/keymap.md), and all of them are configurable.
The configuration reloads itself when you save it.

## For agents

```bash
slipbox resolve '[[note#heading]]' --from index.md --json
slipbox backlinks note --json
slipbox capture --ref src/file.ts:42-50 --snippet
slipbox render note --plain
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
```
