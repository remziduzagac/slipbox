# Testing

`bun run test` runs the headless tests (`bun test --timeout 30000`), and `bun run check` adds the typecheck, the
boundary, the supply chain's gates, Biome, the workflows' and the docs' checks ([repository.md](repository.md) § The
check). CI runs them all on Linux and macOS (`.github/workflows/ci.yml`; [repository.md](repository.md) § CI).
`bun run e2e` runs the terminal tests, slipbox itself in a herdr pane (below). A run's temporary files — the tests'
vaults, the CLI's — go in one folder of its own, removed when it ends (`tests/setup.ts`, preloaded by `bunfig.toml`);
one that stopped short (`--bail`, a crash) is removed by the next run, its process gone.

## Strategy (`0.4`)

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
| `tests/export.test.ts` | export (`10.x`): the assembler; each format read back (zips unzipped, PDF pages' text) |
| `tests/distribution.test.ts` | distribution (`14.x`): gates, notices, SBOMs, the scanner; a release built, installed |
| `tests/release.test.ts` | previews and the Pages site: versions, tags, notes, the channel files, the workflows |
| `tests/health.test.ts` | the health check (`scripts/health.ts`): the upkeep files, signals, the issue, its workflow |
| `tests/check-docs.test.ts` | the docs' check on a repository of its own: a misspelling, a broken link, a long line |
| `tests/docs.test.ts` | the user docs and agent guide: links, anchors, commands, flags, keys; no ID; vault, not root |
| `tests/site.test.ts` | the docs' site: pages gathered from the docs map, links rewritten, the home's cards (DS) |

`tests/distribution.test.ts` builds a release for this machine and drives it as a user would: the packed binary
printing the skill, the release's notes, installed by the release's installer and through the Pages bootstrap,
`slipbox channel`, upgraded on either channel, removed; the bootstrap and the channel files are tested apart too, with
fake `uname` and `ldd`, on any machine. `tests/check-docs.test.ts` holds the docs' check (`scripts/check-docs.ts`) to
failing on a misspelling, a broken link or heading and a long line, and to reading only what git tracks.
`tests/docs.test.ts` holds the user docs, the README, the skill and the messages slipbox prints (a string with a space
in it) to vault for a vault, never root, plain folder or loose file, outside code and links' targets, past the names
that keep the word ([roots.md](roots.md)); root's other meanings pass: the filesystem's root, running as root, a root
cause, square roots (VV-D1).

Later reviews keep their regression tests in `describe("review round N …")` or `describe("review cycle
N …")` blocks in the file for the area: `tui.test.ts`, `core.test.ts`, `vault.test.ts`,
`render.test.ts` and `cli.test.ts`.

**Properties, not just examples:**

- Every note in the demo vault (`examples/vault/`) is rendered at widths 24, 37, 60, 80, 101 and
  140, in the Unicode and ASCII glyph sets. No row may exceed the layout width.
- The table allocator gets 5,000 generated inputs. The allocation must never exceed the budget,
  never drop a column below its minimum when the minimums fit, and use the desired widths when
  they fit. This is the render-markdown bug and its siblings
  ([prior-art.md](../research/prior-art.md) § render-markdown.nvim's table allocator; D89).

**Generated inputs use a sound generator.** The seeded generators step with `Math.imul` and draw
from the high bits: a plain `seed * 1103515245` passes 2^53, loses its low bits, and the "5,000
inputs" were a few hundred distinct ones (the allocator's floor bug hid behind that).

**Slow is not stuck.** Every test is bounded at 30 s by `bun run test`'s `--timeout 30000`, which the check, CI and
the release's build run: a harness copies and indexes a vault, a CLI test starts processes, and a loaded machine or a
small runner (CI's Intel Mac) makes either take seconds. A preload's `setDefaultTimeout` reaches the first test file
alone, so the bound is the runner's flag, and a test holds the script to it; most files set the same bound
themselves, for a run of one file by `bun test`. A test that needs longer says so itself (every command the skill
shows, run: 3 minutes).

**A test waits for a condition, never a fixed time, and counts work rather than timing it.** A CI runner, or a machine
busy with other work, is slower by a different amount each run. A test waits until what it needs has happened (a
watcher's event, `app.watch.whenIndexed`, `app.views.whenParsed`, `app.search.whenIndexed`), bounded only by its
timeout, which is a backstop for a stuck test and not a measure. Where a test guards against work done in the wrong
place, it counts that work: the background index's test (`15.1`) checks that the main thread parsed none of a big
note's chunks, not how long its slices took. A test about a time itself, a timeout that must stop something, bounds it
with a wide margin (stopped at 0.2 s, checked under 3 s). Timings are the benchmark's (§ Timings), read and not
asserted.

**Nothing a test file leaves behind changes another's results.** `bun test` runs every file in one process, so what
loads lazily (`16.6`), Mermaid or MathJax, is loaded by whichever file asked first. A file whose output depends on one
loads it before it renders: `tests/render.test.ts` loads Mermaid first, so the samples' snapshots show their diagrams
as the TUI draws them once it's in, whichever file ran before. What's drawn while a library loads is tested in a
process of its own.

**Flaky tests are fixed, or quarantined by name; never retried.** No test is retried, by the runner or by itself: one
that fails at random has a cause, in the code or in the test. It is fixed, the failure shown before the fix (in the bad
order, or on a slowed machine: `taskset -c 0` puts the process and its parse workers on one CPU) and gone after. While
it can't be, it is quarantined: `test.skip`, with a `// quarantined: <issue>` comment saying how it fails, its
assertions as they were. `bun test` counts it as skipped, and `grep -rn "quarantined:" tests/` lists them; it comes
back with its fix. An assertion is never deleted or loosened to make a test pass.

**CI runs the suite on Linux and macOS** (GR-D9), on every change but a pull request of the docs alone, which runs
the docs' tests only (D230): the scripts `bun run check` runs, split into jobs
([repository.md](repository.md) § CI). A release runs it again on every platform it builds, the Intel Mac and ARM
Linux among them, before anything is built ([distribution.md](distribution.md) § Releases).

**Biome formats and lints the code** (`biome.jsonc`: 120 columns, the recommended rules but the code's idioms, each
turned off with its reason); `bun run lint` fails on a warning, `bun run format` writes (GR-D7).

**Isolation.** Every test file points `XDG_STATE_HOME`, `XDG_CACHE_HOME`, `XDG_CONFIG_HOME` and
`XDG_DATA_HOME` (tools installed) at its own temp directory and drops `SLIPBOX_CONFIG` (which would
win over them), so a developer's config, editor, themes, session or list of vaults never leak into
a run; copies go to a file, never the clipboard (`SLIPBOX_CLIPBOARD=file`). TUI tests work on a
temp copy of the fixture vault, so they can write, rename and delete notes. A test that finds a tool on `PATH` sets its
own (`/usr/bin:/bin`): `bun run` puts the repository's `node_modules/.bin` first, markdownlint-cli2 among them, which
slipbox would find before its own.

**The docs are checked too** (`bun run check:docs`, `scripts/check-docs.ts`; greenrepo DOC-05). Over the text files
git tracks, less what is wrong on purpose (the reference set, the demo vault and the tests' fixtures, `LEFT_OUT`, each
with its reason): markdownlint-cli2 lints the Markdown by `.markdownlint-cli2.jsonc`, 120 columns everywhere and the
rules that are only style off; typos spells the code and the docs by `_typos.toml`, its list the project's own words,
each saying where it's from, the licence texts and snapshots left out; lychee follows the links between files and into
their headings, offline: the web's links are the weekly health check's ([repository.md](repository.md) § The weekly
health check). A test's misspelling on purpose sits between `// typos: off` and `// typos: on`, or ends its line with
`// typos: ignore-line`. Each file is given to the tools as a path, never a glob: markdownlint-cli2 and lychee both
read `plan (v2).md` or `plan [x].md` as a pattern matching nothing, and passed, silently.

## The fixture vault (`0.5`)

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
| `.hidden/`, `drafts/` | dot directories; `walk.exclude` from the vault's config |
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
vault). The demo vault is named `halden` and holds two nested vaults, `outreach/` and
`outreach/school-visits/`, linked every way across (its `about-this-vault.md`, "Nested vaults"): the
material for trying nested vaults by hand, and the e2e scenario "nested roots".

## The reference set: `examples/home/`

`examples/home/` is a developer's home folder — Sam Rivera's notes, work repositories and hobbies — written so that
every feature is there in realistic use, each case in several variations and combinations. Its `README.md` sets the
person, the cast, the timeline, the vaults and the writing rules; `CASES.md` lists every case (from the commands, the
tests, the design docs and the roadmap) and the files that cover it. Halden is its sibling (`../vault`), linked from it.

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
  list of vaults). Nothing in the repo or in your own setup is touched, and a given pane that is
  running slipbox is refused rather than typed into. A scenario can put files beside the vault
  (`beside`: another vault, a folder outside every vault), run the CLI before slipbox starts (`setup`: `init`
  that vault), and start slipbox another way: elsewhere (`startAt`), with no path (`startAt: null`), from
  a folder (`cwd`), with flags (`args`) or environment (`env`), or expecting it to fail (`noWait`).
- **Waits, never sleeps.** Every check waits (up to a timeout) for the screen to agree: a row that
  contains something, the status line's mode, a message's floating box, a file on disk. Only a check
  that something *doesn't* happen — no autosave mid-insert, no popup before its delay — waits out a
  stated while. A wait, and the quiet after a key, hold only between frames: slipbox marks each frame
  with synchronized output (mode 2026), and a screen read before a frame ends is part the last one,
  part the next (#73). A frame not ended within a second is read as it is.
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
| `tests/e2e/world-git.ts` | the reference set's vaults and real git: `$HOME`, markers, a worktree, a conflict |
| `tests/e2e/world-content.ts` | the set's content: every grammar, data, hostile text, wide characters, big files |
| `tests/e2e/world-terminal.ts` | slipbox as a process: start-up forms, signals, restore, keys, pastes, colours |
| `tests/e2e/world-outside.ts` | the world changing under it: the watcher, the CLI beside it, config, autosave |
| `tests/e2e/world-links.ts` | links as `21.x` reads them: `/` from a vault's top, no extension, folders, wikilinks |
| `tests/e2e/world-export.ts` | the export window: formats, the window's keys, replacing, notes in order, `:export` |
| `tests/e2e/world-fixes.ts` | what writing the docs found, fixed (below) |
| `tests/terminal/shots.ts` | the docs' screenshots (DF-D19, D236): slipbox headless at 120×34, its screens drawn |
| `scripts/screenshot.ts` | a screen read with its colours, drawn as a PNG into `docs/images/` |

`world-fixes.ts` covers what writing the docs found, fixed: typing without vim, reload, the trash, moves, clones, the
code view's links and errors, Obsidian's highlights and comments, a folder's network settings, the Save As window's
folders.

**The docs' screenshots** (DF-D19, D236): `bun run shots` (`tests/terminal/shots.ts`) drives slipbox in the
headless terminal (`tests/terminal/terminal.ts`) sized 120×34, as the terminal tests do, on the reference set or the
getting-started guide's own folder (`examples/guide/`), and `scripts/screenshot.ts` draws each screen, read cell by cell
with its colours, into `docs/images/<name>.png`: DejaVu Sans Mono, DejaVu Sans for the symbols it lacks, the two
neither has (`⧉`, `⚿`) drawn as shapes, as box-drawing and block characters are; the Unicode glyph set; the default
theme. No multiplexer and no real terminal: anyone retakes them in one run when the UI changes, a name filter retaking
only those, `--out <dir>` writing them elsewhere to compare. A run says a character no font draws. The shots are a
file per doc, `tests/terminal/shots/<doc>.ts`, each exporting its `SHOTS` (`tests/terminal/shot.ts` says what a shot
is, and gathers them), so two docs' shots are added apart; `tests/docs.test.ts` holds the pictures in `docs/images/`
and the shots to each other, each shown in a doc. The terminal answers Kitty's graphics query as kitty does
(`graphics`), so a picture is on the screen only as Kitty's placeholder cells: a shot names the pictures on its screen,
and each is drawn over its cells as the terminal draws it, fitted to its box and clipped to the rows shown;
placeholders with no picture named are left blank.

## Timings (`bun scripts/bench.ts`)

`scripts/bench.ts` generates notes of 1,000 and 20,000 lines (and one of 20,000 tasks) in a temporary vault and times
what grows with a note: opening it, moving, typing in source mode and the lens, leaving the lens, a reload, a width
change, the CLI's `task`, `read`, `render`, `find` and `backlinks`, and the background index's longest slice on the
main thread. `bun scripts/bench.ts lens k20` runs only the cases whose names contain any of those words, and skips the
work of the cases it leaves out. It isn't part of `bun run check`: timings depend on the machine. The incremental
paths it measures are held to their from-scratch results by the tests ("the incremental source layout", "the chunked
parse", "the render cache", "parseAround").

**The background index** (`15.1`, `bun scripts/bench.ts "background index"`): a note of 20,000 lines with words of its
own, parsed on other threads, three passes; the longest main-thread slice of each, the parse slices and the note's
chunks put together. The test counts that work instead of timing it (§ Strategy). Measured 2026-10-12 on the VM, the
machine shared: 37 ms median (36 to 41).

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
