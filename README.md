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

`?` lists every key. The essentials: `j`/`k` scroll, `Tab` then `Enter` follows a link, `H`/`L`
back and forward, `Ctrl-P` switches notes, `o` outlines, `/` finds, `Ctrl-W v` splits, `t` opens a
tab, `space e` toggles the explorer, drag to select and copy, `c c` captures a reference to the
scratch, `q` quits and remembers where you were.

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
