# Testing

`bun test` runs everything, and `bun run check` adds the typecheck and the boundary check. CI runs
all three (`.github/workflows/ci.yml`).

## Strategy (plan `0.4`)

The layout stage is pure, so the renderer is snapshot-tested on its output. The TUI model draws
through a `Canvas`, so it is driven headlessly: keys in, a character grid out. Only one test goes
through OpenTUI itself, to prove the adapter and real key parsing.

| File | Covers |
| --- | --- |
| `tests/core.test.ts` | width, sanitize, wikilinks, link resolution, capture, config, themes, keymap, glyph sets |
| `tests/render.test.ts` | snapshots, the no-overflow property, allocator properties, blocks, ANSI output |
| `tests/vault.test.ts` | discovery, the walk against the fixture vault, the graph, the CLI and parity |
| `tests/tui.test.ts` | the TUI model, the real watcher, state, keymap, OpenTUI end to end |
| `tests/regressions.test.ts` | one test per bug found in review (later rounds: `tui.test.ts`, "review round N") |

**Properties, not just examples:**

- Every sample in `docs/samples/` is rendered at widths 24, 37, 60, 80, 101 and 140, in the
  Unicode and ASCII glyph sets. No row may exceed the layout width.
- The table allocator gets 5,000 generated inputs. The allocation must never exceed the budget,
  never drop a column below its minimum when the minimums fit, and use the desired widths when
  they fit. This is the render-markdown bug and its siblings (`docs/idea.md`, Testing).

**Watcher tests wait for a condition, not a fixed time.** Events arrive asynchronously and more
slowly under a loaded test run, so fixed sleeps made them flaky.

**Isolation.** Every test file points `XDG_STATE_HOME`, `XDG_CACHE_HOME` and `XDG_CONFIG_HOME` at
its own temp directory, so a developer's config, themes or session never leak into a run. TUI
tests work on a temp copy of the fixture vault, so they can write, rename and delete notes.

## The fixture vault (plan `0.5`)

`tests/fixtures/vault/` has a `.slipbox/` marker and the cases the samples lack:

| Path | Exercises |
| --- | --- |
| `index.md`, `projects/index.md` | name collisions; `[[index]]` resolves per directory |
| `notes/Readme.md` + `[[README]]` | the case policy, the same on every OS |
| `notes/alpha.md`, `notes/beta.md` | headings, backlinks, aliases, relative `[[../index]]` |
| `crlf.md`, `bom.md`, `no-newline.md`, `latin1.md` | line endings, BOM, no final newline, invalid UTF-8 |
| `escapes.md` | a hostile note full of terminal escape sequences (`2.9`) |
| `cjk/日本語.md` | a Unicode file name linking out |
| `attachments/diagram.png` | `![[diagram.png]]` resolved by name from anywhere |
| `node_modules/`, `ignored/`, `*.skip.md` | always-skipped and `.gitignore`d paths |
| `.hidden/`, `drafts/` | dot directories; `walk.exclude` from the vault config |
| `nested-vault/` | a nested `.slipbox/` is a boundary, not part of this vault |
| `alias-link.md`, `outside-link.md`, `symlinked-dir` | symlinks: a duplicate (skipped), outside, directory |

`tests/fixtures/.gitattributes` sets `-text` so CRLF and BOM bytes survive checkout.
`node_modules/` and `ignored/` in the fixture are committed deliberately: the walk has to see
them in order to skip them.

The samples in `docs/samples/` are real documents copied from the dotfiles repo (see their
README), plus the synthetic `links-and-unicode.md`.

## Manual checks that stay manual

Some things are only real in a terminal: glyph rendering in the actual font, OSC 52 reaching the
Mac clipboard over SSH, mouse selection feel. These are checked by running the TUI in a herdr pane
or a bare terminal. The model behind each is covered by the headless tests.
