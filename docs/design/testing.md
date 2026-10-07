# Testing

`bun test` runs the headless tests, and `bun run check` adds the typecheck and the boundary check.
CI runs all three (`.github/workflows/ci.yml`). `bun run e2e` runs the terminal tests, slipbox itself
in a herdr pane (below). A run's temporary files — the tests' vaults, the CLI's — go in one folder of its own,
removed when it ends (`tests/setup.ts`, preloaded by `bunfig.toml`); one that stopped short (`--bail`, a crash) is
removed by the next run, its process gone.

## Strategy (plan `0.4`)

The layout stage is pure, so the renderer is snapshot-tested on its output. The TUI model draws
through a `Canvas`, so it is driven headlessly: keys in, a character grid out. Only one test goes
through OpenTUI itself, to prove the adapter and real key parsing.

| File | Covers |
| --- | --- |
| `tests/core.test.ts` | width, sanitize, wikilinks, link resolution, capture, config, themes, keymap, glyph sets |
| `tests/render.test.ts` | snapshots, the no-overflow property, allocator properties, blocks, ANSI output |
| `tests/vault.test.ts` | discovery, the walk against the fixture vault, the graph, the CLI and parity |
| `tests/cli.test.ts` | the CLI as an agent meets it: the real process on a copy of the demo vault; every command |
| `tests/tui.test.ts` | the TUI model, the real watcher, state, keymap, OpenTUI end to end |
| `tests/servers.test.ts` | slipbox as a client of language servers, against a fake one (`tests/fixtures/fake-lsp.ts`) |
| `tests/regressions.test.ts` | one test per bug found in review (later: "review round/cycle N" blocks) |
| `tests/home.test.ts` | the reference set's build (`scripts/build-home.ts`): histories, extras, the checks |

Later reviews keep their regression tests in `describe("review round N …")` or `describe("review cycle
N …")` blocks in the file for the area: `tui.test.ts`, `core.test.ts`, `vault.test.ts`,
`render.test.ts` and `cli.test.ts`.

**Properties, not just examples:**

- Every note in the demo vault (`examples/vault/`) is rendered at widths 24, 37, 60, 80, 101 and
  140, in the Unicode and ASCII glyph sets. No row may exceed the layout width.
- The table allocator gets 5,000 generated inputs. The allocation must never exceed the budget,
  never drop a column below its minimum when the minimums fit, and use the desired widths when
  they fit. This is the render-markdown bug and its siblings (`docs/idea.md`, Testing).

**Generated inputs use a sound generator.** The seeded generators step with `Math.imul` and draw
from the high bits: a plain `seed * 1103515245` passes 2^53, loses its low bits, and the "5,000
inputs" were a few hundred distinct ones (the allocator's floor bug hid behind that).

**Slow is not stuck.** The TUI and CLI test files set a 30 s default timeout: a harness copies and
indexes a vault, a CLI test starts processes, and a loaded machine makes either take seconds.

**Watcher tests wait for a condition, not a fixed time.** Events arrive asynchronously and more
slowly under a loaded test run, so fixed sleeps made them flaky.

**Isolation.** Every test file points `XDG_STATE_HOME`, `XDG_CACHE_HOME`, `XDG_CONFIG_HOME` and
`XDG_DATA_HOME` (tools installed) at its own temp directory and drops `SLIPBOX_CONFIG` (which would
win over them), so a developer's config, editor, themes, session or list of roots never leak into
a run; copies go to a file, never the clipboard (`SLIPBOX_CLIPBOARD=file`). TUI tests work on a
temp copy of the fixture vault, so they can write, rename and delete notes.

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

## The demo vault

`examples/vault/` is slipbox's demo and the material the render tests snapshot: the invented
notes of a fictional observatory, written to keep what real notes contain (tables too wide for any
screen, unbreakable tokens, lines over the limit, every link form, CJK, emoji and RTL). Its
`about-this-vault.md` says what each note exercises; `scripts/sample-metrics.ts` measures it, so a
change to a note can be checked against what it has to keep covering. The TUI tests copy its notes
into a temporary fixture vault as `samples/` (without its marker, which would make it a nested
root). The demo vault is named `halden` and holds two nested roots, `outreach/` and
`outreach/school-visits/`, linked every way across (its `about-this-vault.md`, "Nested vaults"): the
material for trying nested roots by hand, and the e2e scenario "nested roots".

## The reference set: `examples/home/`

`examples/home/` is a developer's home folder — Sam Rivera's notes, work repositories and hobbies — written so that
every feature is there in realistic use, each case in several variations and combinations. Its `README.md` sets the
person, the cast, the timeline, the roots and the writing rules; `CASES.md` lists every case (from the commands, the
tests, the design docs and the plan) and the files that cover it. Halden is its sibling (`../vault`), linked from it.

**Built, not used in place.** A `.git` folder can't be committed inside this repository, so the mock repositories
(`work/kestrel`, `work/product`, `work/infra`) are committed as plain folders, their histories described in
`.build/<repo>.toml` — commits, branches, merges, a worktree, a remote. `bun scripts/build-home.ts <dir>` copies the
set to `<dir>/home` and halden to `<dir>/vault`, replays each history with git (its `main` checked to end at the
folder as committed), and makes from `.build/extras.toml` the files that can't be committed: hostile names, symlinks,
a file over the size cap, an unreadable one. The e2e scenarios of `world-*.ts` build a fresh copy and use it as `$HOME`
(`home`), and the tests check it: the build (`tests/home.test.ts`), that the set stays complete, that every data file
parses or fails as it means to, that every note renders inside its width at four widths (`tests/render.test.ts`),
and that no open in place gave its folders this machine's identity.

## The terminal tests (`bun run e2e`)

The headless tests drive the model; these drive slipbox itself in a real terminal, a herdr pane,
by the keys a keyboard would send, and check what the screen shows. They catch what the model
can't: how keys are encoded (`ctrl+h` versus backspace, an escape read as alt), timing, and what
is really drawn. They need herdr, so they are a developer's tool, not part of `bun run check` or
CI; slipbox itself never needs herdr.

```sh
bun run e2e                  # a pane split off this one; closed at the end
bun run e2e --tab            # a tab of its own, as big as the window
bun run e2e --pane w1:p2     # that pane (also SLIPBOX_E2E_PANE); it must be at a shell prompt
bun run e2e find replace     # only the scenarios whose names contain these
```

- **Isolated.** Each scenario gets a fresh copy of the demo vault — or the reference set built, its
  home folder as `$HOME` (`home`) — and its own config, state, cache and data directories (its own
  list of roots). Nothing in the repo or in your own setup is touched, and a given pane that is
  running slipbox is refused rather than typed into. A scenario can put files beside the vault
  (`beside`: another vault, a plain folder), run the CLI before slipbox starts (`setup`: `init` that
  vault), and start slipbox another way: elsewhere (`startAt`), with no path (`startAt: null`), from
  a folder (`cwd`), with flags (`args`) or environment (`env`), or expecting it to fail (`noWait`).
- **Waits, never sleeps.** Every check waits (up to a timeout) for the screen to agree: a row that
  contains something, the status line's mode, a message's floating box, a file on disk. Only a check
  that something *doesn't* happen — no autosave mid-insert, no popup before its delay — waits out a
  stated while.
- **The terminal itself.** A scenario reads what the terminal draws with its colours (`styleOf`,
  `runs`), its title, the pid of slipbox in it (`signal` sends it SIGTERM or SIGHUP), pastes as a
  terminal does (bracketed), quits and starts again on the same state (`restart`), and resizes the
  pane for real (`zoom`, which needs the pane sized by its tab's layout: a client attached).
- **Coverage is measured.** slipbox appends each command it runs to `SLIPBOX_TRACE`; the runner
  lists the commands no scenario ran (a run split over panes adds them to `SLIPBOX_E2E_RAN`, read
  together after), and every command is run today. That says a command was
  reached, not that its effect was checked: each scenario checks its effects itself (the exact text
  a sequence of edits leaves, what a copy put on the clipboard file, a count on the find row), and a
  check that would pass with the feature broken is a bug in the scenario.
- **Size.** herdr owns the pane's size, which the runner asks the shell for and never sets.
  Scenarios that need room (docked panes, splits) say so and are skipped, named, in a smaller pane;
  one whose need shows only as it runs throws `Skipped` with the reason — never a silent pass.
- **Keys.** Single characters are typed as themselves; keys herdr has no name for (the page keys,
  `ctrl+end`) are sent as the escape sequences a terminal sends. An escape with keys after it waits to be seen taking
  effect (the screen changing, a second at most): read together with the next key — a loaded machine reads late, a
  pause or not — it would be alt+key. A start waits for the screen to settle before the first key.
- **Not the mouse.** herdr passes no mouse events through, so clicks, the wheel and drags stay
  covered by the headless tests only.

| File | Covers |
| --- | --- |
| `tests/e2e/run.ts` | the runner: the pane, the loop, the report |
| `tests/e2e/herdr.ts` | a herdr pane, driven: keys and text in, the screen out |
| `tests/e2e/session.ts` | one scenario's slipbox, and the checks |
| `tests/e2e/helpers.ts` | what scenarios share: the cursor's place, opening a note, leader keys |
| `tests/e2e/scenarios.ts` | the app's own scenarios, by area, on halden |
| `tests/e2e/world-git.ts` | the reference set's roots and real git: `$HOME`, markers, a worktree, a conflict |
| `tests/e2e/world-content.ts` | the set's content: every grammar, data, hostile text, wide characters, big files |
| `tests/e2e/world-terminal.ts` | slipbox as a process: start-up forms, signals, restore, keys, pastes, colours |
| `tests/e2e/world-outside.ts` | the world changing under it: the watcher, the CLI beside it, config, autosave |
| `tests/e2e/world-links.ts` | links as `21.x` reads them: `/` from a root, no extension, folders, wikilinks |

## Timings (`bun scripts/bench.ts`)

`scripts/bench.ts` generates notes of 1,000 and 20,000 lines (and one of 20,000 tasks) in a temporary
vault and times what grows with a note: opening it, moving, typing in source mode and the lens,
leaving the lens, a reload, a width change, and the CLI's `task`, `read`, `render`, `find` and
`backlinks`. `bun scripts/bench.ts lens k20` runs only the cases whose names contain those words.
It isn't part of `bun run check`: timings depend on the machine. The incremental paths it measures
are held to their from-scratch results by the tests ("the incremental source layout", "the chunked
parse", "the render cache", "parseAround").

**The parse cache by content** (`20.11`, `bun scripts/bench.ts "2,000 notes"`): 2,000 notes of 120 lines each, the
first copy parsed and the cache filled, then a second copy (a worktree, a clone) read with it and without it.
Measured 2026-10-03 on the VM:

| Case | Median |
| --- | --- |
| the first copy: parsed, the cache filled | 6,162 ms |
| a second copy: parsed again, no cache | 5,998 ms |
| a second copy: from the cache | 40 ms |

Filling it costs about 3% of a first parse; a second copy is read about 150 times faster.

## Manual checks that stay manual

Some things are only real in a terminal and a pair of eyes: glyph rendering in the actual font,
OSC 52 reaching the Mac clipboard over SSH, mouse selection feel. The model behind each is covered
by the headless tests.
