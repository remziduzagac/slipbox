# Testing

`bun run test` runs the headless tests (`bun test --timeout 30000`), and `bun run check` adds the typecheck, the
boundary, the supply chain's gates, Biome, the workflows' and the docs' checks ([repository.md](repository.md) § The
check). CI runs them all on Linux and macOS (`.github/workflows/ci.yml`; [repository.md](repository.md) § CI).
`bun run test:terminal` drives slipbox headless through a terminal, in parallel and in CI (TT-D2–TT-D6; below). A run's
temporary
files — the tests' vaults, the CLI's — go in one folder of its own, removed when it ends (`tests/setup.ts`, preloaded by
`bunfig.toml`);
one that stopped short (`--bail`, a crash) is removed by the next run, its process gone.

## Strategy (`0.4`)

The terminal tests form a layer beside the headless unit tests: `bun run test` drives the model,
`bun run test:terminal` drives slipbox through a terminal (TT-D6). Both run in CI, scoped to the change (D239).

The layout stage is pure, so the renderer is snapshot-tested on its output. The TUI model draws
through a `Canvas`, so it is driven headlessly: keys in, a character grid out. Only one test goes
through OpenTUI itself, to prove the adapter and real key parsing.

| File | Covers |
| --- | --- |
| `tests/core/` | width, sanitize, wikilinks, link resolution, capture, config, themes, keymap, glyph sets |
| `tests/core/rendering/layout/markdown/layout.test.ts` | Markdown snapshots, blocks, inlines and source mapping |
| `tests/core/rendering/layout/markdown/samples.test.ts` | Demo/reference layout widths and scrolling code |
| `tests/core/rendering/layout/markdown/table.test.ts` | Generated allocator budget and height properties |
| `tests/core/rendering/layout/markdown/cache.test.ts` | Highlighting bounds and render caches |
| `tests/core/rendering/layout/wrapping.test.ts` | Measured wrapping and drawn-row properties |
| `tests/core/rendering/layout/ansi-colors.test.ts` | ANSI output and terminal color conversion |
| `tests/core/rendering/layout/diff/layout.test.ts` | Block, note, split-code and screen diff layouts |
| `tests/core/rendering/media/drawings.test.ts` | Mermaid, math and picture layout |
| `tests/core/workspace/`, `tests/cli/` | vaults, walk, links/graph, mutations, search/Git and CLI parity |
| `tests/cli/` | command-area process scenarios, focused handlers and launcher/argument/error coverage |

| `tests/tui/documents/`, `tests/tui/shell/input/` | editor, source/lens, edit/save and keyboard/mouse behavior |
| `tests/tui/app/`, `tests/tui/shell/` | retained App state/watch/windows, settings, screen, overlays and terminal |
| `tests/tui/workspace/git/` | source control: worktrees, panel, marks, diff, review, merge, pull, rebase |
| `tests/core/documents/servers/client.test.ts` | Language-client protocol, diagnostics and request limits |
| `tests/core/documents/servers/discovery.test.ts` | Language tables, finding/installing servers, locks and doctor |
| `tests/core/documents/servers/manager.test.ts` | Server lifecycle, open files and restarts against a fake server |
| `tests/core/documents/servers/linters.test.ts` | Linter formats, findings, roots, execution and trust |
| `tests/regressions.test.ts` | one test per bug found in review (later: "review round/cycle N" blocks) |
| `tests/home.test.ts` | the reference set's build (`scripts/build-home.ts`): histories, extras, the checks |
| `tests/export.test.ts` | export (`10.x`): the assembler; each format read back (zips unzipped, PDF pages' text) |
| `tests/distribution/supply-chain.test.ts` | supply-chain gates, notices, SBOMs, workflow scope and advisories |
| `tests/distribution/release.test.ts` | release planning and the real host package built, installed and exercised |
| `tests/distribution/installation.test.ts` | install identity and uninstall planning/refusal |
| `tests/distribution/updates.test.ts` | release discovery, update checks and publication/refusal |
| `tests/distribution/channels.test.ts` | Pages bootstrap, channel selection and channel release discovery |
| `tests/release.test.ts` | previews and the Pages site: versions, tags, notes, the channel files, the workflows |
| `tests/health.test.ts` | the health check (`scripts/health.ts`): the upkeep files, signals, the issue, its workflow |
| `tests/check-docs.test.ts` | the docs' check on a repository of its own: a misspelling, a broken link, a long line |
| `tests/docs.test.ts` | the user docs and agent guide: links, anchors, commands, flags, keys; no ID; vault, not root |
| `tests/site.test.ts` | the docs' site: pages gathered from the docs map, links rewritten, the home's cards (DS) |

CLI process scenarios use `tests/support/cli-process.ts`: each owner gets a fresh demo copy, child environment and
cleanup hooks. `tests/cli/launcher/` retains dispatch, argument/error, terminal refusal, installer and compiled-entry
coverage. The catalog guard parses the area suites and checks that every command has an executable process call,
ignoring comments and fixture strings. Reading-handler tests call the real handler with a Session, without loading
main, the dispatcher or the TUI. Export outcomes have individual tests; overwrite/force and Markdown replacement
sequences stay together. The unit default and each process deadline are unchanged.

The core split also places boundary fixtures under `tests/organization/` and pure switcher matching under
`tests/tui/shell/overlays/`. Every owner file retains its timeout and equivalent file-owned core sandbox; the support
module does not import App.

The server owners each call `tests/support/server-sandbox.ts` for their own XDG setup, cleanup and trust reset.
Local package/lock fixtures close over that sandbox. Client and manager suites share the event/wait helpers and
unchanged fake-server path in `tests/support/server-process.ts`; protocol and process assertions stay with their owners.

The rendering owners each call `tests/support/render-sandbox.ts` for their own original XDG setup, cleanup and
Mermaid preload. `tests/support/render-layout.ts` keeps the shared sample discovery and layout helpers. Both
snapshot-bearing suites live in `tests/core/rendering/layout/markdown/layout.test.ts`; its snapshot retains the same
keys and bytes beside that owner. The scope selector maps a sibling `__snapshots__` directory back to its test at
any depth under `tests/`. The cold-cache regression invokes the Mermaid case in
`tests/core/rendering/media/drawings.test.ts` twice with a controlled warm startup cache.

`tests/distribution/release.test.ts` builds a release for this machine and drives it as a user would: the packed binary
printing the skill, the release's notes, installed by the release's installer and through the Pages bootstrap,
`slipbox channel`, upgraded on either channel, removed; the bootstrap and the channel files are tested apart too, with
fake `uname` and `ldd`, on any machine. `tests/check-docs.test.ts` holds the docs' check (`scripts/check-docs.ts`) to
failing on a misspelling, a broken link or heading and a long line, and to reading only what git tracks.
`tests/docs.test.ts` holds the user docs, the README, the skill and the messages slipbox prints (a string with a space
in it) to vault for a vault, never root, plain folder or loose file, outside code and links' targets, past the names
that keep the word ([roots.md](roots.md)); root's other meanings pass: the filesystem's root, running as root, a root
cause, square roots (VV-D1).

A test file stays under 1 MiB, the most Biome checks: past it, `bun run lint` fails on it. Model collections are split
by feature under `tests/tui/`: workspace explorer/vault/search/Git, document navigation/tools/diagnostics/media, and
shell tools. Screen, settings and retained App journeys follow their feature owners, with no broad root model collection
remaining. The model owners share `tests/tui-harness.ts` (a vault copied, the TUI driven, its rows read). `bun test`
evaluates a module once a run, however many files import it, and an `afterAll` at its top would be the first file's
alone: so each file calls `makeSandbox()` at its own top, for a sandbox of its own, removed when that file ends.
Git-panel fixtures retain their separate saved-environment restoration; peek fixtures retain file-local counters and
mock restoration. These policies are shared only within their original collection, preserving each file's cleanup
lifetime.

Regression tests follow their feature owner. Existing review-round/cycle parent titles are preserved while mixed
collections split scenario by scenario; core cases now live in tests/core and the focused organization/TUI owners, while
remaining collections migrate in their assigned phases.

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
small runner (a shared CI runner) makes either take seconds. A preload's `setDefaultTimeout` reaches the first test file
alone, so the bound is the runner's flag, and a test holds the script to it; most files set the same bound
themselves, for a run of one file by `bun test`. A test that needs longer says so itself (every command the skill
shows, run: 3 minutes).

**A test waits for a condition, never a fixed time, and counts work rather than timing it.** A CI runner, or a machine
busy with other work, is slower by a different amount each run. A test waits until what it needs has happened (a
watcher's event, `app.watch.whenIndexed`, `app.views.whenParsed`, `app.search.whenIndexed`), bounded only by its
timeout, which is a backstop for a stuck test and not a measure. Where a test guards against work done in the wrong
place, it counts that work: the background index's test (`15.1`) checks that the main thread parsed none of a big
note's chunks, not how long its slices took. Where it guards that the main thread keeps its turns while other work goes
on, it counts the turns taken meanwhile, never the gaps between them: a gap, against how long the work took, measures
the runner and the test process as much as slipbox. Most count a timer's turns while the work is pending (the syntax
pass on its thread, a slow `git`). The spell checker's thread is held at a point the test controls instead: asked to
(`holdBuild` in `core/documents/diagnostics/spell-thread.ts`, D262), it waits before building the test's dictionary
until the test lets it go,
once the main thread has answered its keys. Its wait runs out on its own clock, inside the test's timeout and past any
passing run, so that a main thread held until the dictionary is there fails rather than hangs. A test about a time
itself, a timeout that must stop something, bounds it with a wide margin (stopped at 0.2 s, checked under 3 s).
Timings are the benchmark's (§ Timings), read and not asserted.

**Nothing a test file leaves behind changes another's results.** `bun test` runs every file in one process, so what
loads lazily (`16.6`), Mermaid or MathJax, is loaded by whichever file asked first. A file whose output depends on one
loads it before it renders: the rendering owners preload Mermaid through `tests/support/render-sandbox.ts`, so the
samples' snapshots show their diagrams as the TUI draws them once it's in, whichever file ran before. What's drawn while
a library loads is tested in a process of its own. That child receives the owner's runtime environment explicitly: Bun's
default child environment can retain the startup cache path after the test sets a private XDG cache. A warm
inherited-cache regression exercises the cold-load case twice against the same foreign cache. Nor does a test lean on
the tests before it in its file: it makes the state it needs (a vault opened first, a state folder), so it passes alone,
filtered or in order. The vaults a file's tests open stay on the machine's list, hundreds by its end: a test whose work
reads them all (a link's target offered from every vault) runs with only its own listed (`onlyRootsUnder` in
`tests/tui-harness.ts`), or it slows with each test added before it.

**Flaky tests are fixed, or quarantined by name; never retried.** No test is retried, by the runner or by itself: one
that fails at random has a cause, in the code or in the test. It is fixed, the failure shown before the fix (in the bad
order, or on a slowed machine: `taskset -c 0` puts the process and its parse workers on one CPU) and gone after. While
it can't be, it is quarantined: a test by `test.skip`, with a `// quarantined: <issue>` comment saying how it fails,
its assertions as they were; a headless terminal check (`tests/terminal/checks/`) the same way, by its `quarantined`
field set to its issue (`"#73"`), a comment saying how it fails, its run as it was: the runner never starts it, and
reports it skipped with its issue (`tests/terminal/run.ts`). `bun test` and the runner count them as skipped, and
`grep -rn "quarantined:" tests/` lists them all; each comes back with its fix, which removes its quarantine. An
assertion is never deleted or loosened to make a test pass.

**CI runs the suite on Linux and macOS** (GR-D9): for a pull request, the tests and the terminal checks its files
reach (D239), the docs' tests only for one of the docs alone (D230), and a push to `dev` or `test` the same for what
changed since the last passing run, less what a pull
request's run passed on the same tree: nothing for `dev` moved to `test`
([repository.md](repository.md) § What a push tests); every test and check in the full run, `ci` run by hand on `test`
(`full`), which a commit needs before `main`
takes it and a release builds it (D251). The scripts `bun run check` runs, split into jobs
([repository.md](repository.md)
§ CI). While working: your change's own tests and its feature's terminal check (`bun run test:terminal <its name>`),
then `bun run test:changed` for what else it reaches — never the whole suite. A failure the full run finds is fixed
by a pull request of its own, into `dev`.

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
| `node_modules/`, `ignored/`, `*.skip.md` | a busy folder (no note at its top) and `.gitignore`d paths |
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
material for trying nested vaults by hand, and the terminal checks of nested vaults.

## The reference set: `examples/home/`

`examples/home/` is a developer's home folder — Sam Rivera's notes, work repositories and hobbies — written so that
every feature is there in realistic use, each case in several variations and combinations. Its `README.md` sets the
person, the cast, the timeline, the vaults and the writing rules; `CASES.md` lists every case (from the commands, the
tests, the design docs and the roadmap) and the files that cover it. Halden is its sibling (`../vault`), linked from it.

**Built, not used in place.** A `.git` folder can't be committed inside this repository, so the mock repositories
(`work/kestrel`, `work/product`, `work/infra`) are committed as plain folders, their histories described in
`.build/<repo>.toml` — commits, branches, merges, a worktree, a remote. `bun scripts/build-home.ts <dir>` copies the set
to `<dir>/home` and halden to `<dir>/vault`, replays each history with git (its `main` checked to end at the folder as
committed), and makes from `.build/extras.toml` the files that can't be committed: hostile names, symlinks, a file over
the size cap, an unreadable one. The terminal checks build a fresh copy and use it as `$HOME` (`home`), and the tests
check it: the build (`tests/home.test.ts`), that the set stays complete, that every data file parses or fails as it
means to, that every note renders inside its width at four widths
(`tests/core/rendering/layout/markdown/samples.test.ts`), and that no open in place gave its folders this machine's
identity.

Each reference-set area is covered by a terminal check or explicitly left out with its reason (TT-D4).
Checks take their content from `examples/`, extending the samples when a case is missing (TT-D5).

**Git state a check makes.** A terminal check takes its notes and files from the samples, but the git state it needs
it makes itself, with git, in its own home (D241): a repository's history and branches, a worktree, a bare repository
as its remote, a conflict from a real merge or rebase, a rebase stopped. The source-control checks
(`tests/terminal/checks/source-control.ts`, and `git-diff.ts` beside it) do so; the histories the set has for itself
stay in `.build/`.

## The terminal tests (`bun run test:terminal`)

**The headless terminal** (`tests/terminal/terminal.ts`). A check's slipbox runs in a pseudo-terminal of Bun's own
(`Bun.Terminal`), its output fed to a headless xterm (`@xterm/headless`), which keeps the screen: each row's text,
each cell's colours (true colour as `#rrggbb`, the palette as its SGR code) and boldness, the cursor. It answers what
slipbox asks a terminal at start as a modern one does: the cursor's place and the device's attributes (xterm's own
answers), its colours (OSC 10 and 11, a dark scheme), and the Kitty keyboard protocol, whose flags slipbox pushes (5:
disambiguate, alternate keys). It keeps the title (OSC 0 and 2) and every OSC 52 copy, and everything slipbox wrote,
for checks of what's sent (pictures, by their protocol's bytes). Each read of the output is decoded as it comes, a
character cut at its end kept for the next, and xterm is given the text, never the bytes: xterm 6.0.0 drops a
character a read cuts after a 0x80 byte (an em dash read as `E2 80`, then `94`; xterm.js#6003, fixed after 6.0.0),
which puts the rest of its row a cell to the left, under cells slipbox then leaves as they are (T22). A byte that is no
character shows as U+FFFD, as in a terminal. A check can read the output a set number of bytes at a time
(`readSize`); one at a time cuts every character. Its widths are a terminal's that keeps grapheme clusters
whole (kitty, libghostty, WezTerm: a ZWJ family, a flag, an emoji and its selector are one cluster, measured by Bun),
not xterm's own Unicode 6 table, where most emoji are one cell and what slipbox drew past them would drift. A resize
changes both sizes and sends slipbox SIGWINCH itself: Bun's child has the pseudo-terminal as its files but not as its
controlling terminal (Bun 1.4.2), so the kernel tells it nothing — nor sends a hangup when the terminal closes, which
a check sends with `signal`. Rows are read up to the width: narrowed, xterm keeps cells past it.

**Keys** (`tests/terminal/keys.ts`) go in by name (`j`, `ctrl+q`, `alt+shift+down`, `escape`) as a terminal encodes
them: Kitty's way once slipbox has pushed its flags — `escape` is `CSI 27 u`, never the start of `alt+…`, so no key
waits on a clock — or a legacy terminal's (control characters, an escape before alt, xterm's modifyOtherKeys for what
legacy can't say). A check about the legacy path asks for that keyboard; there an escape is seen taking effect before
the next key goes.

**A session** (`tests/terminal/session.ts`) is one check's slipbox: a fresh copy of the demo vault, or the reference
set built (`home`); its own config, state, cache, data, home and temporary folders (`XDG_*`, `HOME`, `TMPDIR`), with
lint, language servers and the background index off unless the check's config turns them on; slipbox started by
Bun's own path in a terminal of 236×85 unless the check asks for another size, with nothing of the environment but
`PATH`. It drives (`keys`, `type`, `paste`, `ex`, `send`, `resize`, `signal`, `restart`, `quit`) and reads (`screen`,
`statusLine`, `runs`, `styleOf`, `title`, `osc52`, `after`: what slipbox printed on its way out). A restart keeps what
the session was made with — its folders, config and terminal (asked to change them, it refuses) — and cuts off the
slipbox before once what it wrote is drawn, stopped if it still runs and its terminal closed, so nothing it or a child
writes later shows. Every check waits for the screen to agree (`until`, `see`, `status`), never a fixed time; a wait
gets at least ten seconds whatever the check asked (`SLIPBOX_TERMINAL_WAIT`), since a machine with a check on every core
is slower than the one a check was written on, and a wait that passes returns at once. What lands only once slipbox is
ready (spelling's dictionaries, loading in the background) is tried again until it does (`retry`): a key pressed early
does nothing.

**In step with slipbox.** On a loaded machine slipbox reads a key late and draws late: a check that reads the screen
right after sending keys can read the frame before them, and act on it (the link under the cursor, the line it's on). So
with `SLIPBOX_TRACE` set, slipbox writes, beside each command run, a `key` line once it has handled a key or a paste and
a `frame` line for each frame it paints (src/tui/shell/terminal/run.ts); `keys`, `type` and `paste` return once every
key sent is handled and a frame painted after the last (a named key is one key, typed text one per code point, a paste
one), then once nothing more is written for 40 ms. A check timed against the clock (an answer within two seconds while
it indexes) says `alone` and runs by itself after the others, where it times slipbox, not the machine.

A check that must hold slipbox mid-work has Bun preload a script of the tests' into slipbox's own process, not the CLI's
(`preload`): the spelling checks of a dictionary still loading and of one that won't load preload
`tests/terminal/spell-hold.ts`, which holds the spell checker's thread (`holdBuild`) until the check writes a file,
and writes the hold's state to another; the export checks that act while an export's staging is cleared (the window
opened then, Cancel export, a cleanup that fails) preload `tests/terminal/export-hold.ts`, which holds the first
export's cleanup (`PreparedExport.dispose`) the same way, or, with `EXPORT_HOLD_AT=publication`, its publication
once its document is in place.

**A slow disk, stood in for** (T12): `SLIPBOX_SLOW_DISK=<folder name>:<ms>[:<deadline ms>]` makes a folder of that
name take so long to list, on whichever thread lists it (`slowDisk` in `core/workspace/walk/walk.ts`), and shortens the
walk's and
the listings' threads' deadlines to the third: the disk a check can't mount. `tests/terminal/checks/slow-disk.ts`
drives the TUI with it; the unit tests hold a folder up on a thread of their own (`setFolderReader`, a worker of
their own: `tests/fixtures/walk/`). What such a check says comes at once is timed by the check itself, against a
bound short of the slow folder's time: `Session.until` waits at least `SLIPBOX_TERMINAL_WAIT`, whatever it's asked.


**The runner** (`tests/terminal/run.ts`, `bun run test:terminal [--jobs N] [--repeat N] [--keep] [--list] [area or
name…]`) runs the chosen checks concurrently, as many as the machine has cores, each in a worker process of its own
(`worker.ts`): two of Bun's pseudo-terminals in one process can cross their output (Bun 1.4.2), and a check that
crashes takes only itself down. A check has two minutes. The run goes to its end, then reports every failure with
its screen, a summary by area, and how many commands the checks ran; a check that declares a command it never ran
fails. `--repeat` runs each check that many times in the same pool, to show a flaky one. A check quarantined (§
Strategy, flaky tests) is never started: it's reported skipped, with its issue (T31).

**The checks** (`tests/terminal/checks/<area>.ts`) are one feature each, small related ones grouped, named by it under
one of five areas (reading, editing, navigating, links and files, the outside and code), each declaring the reference
set's areas it covers (`CASES.md`'s headings) and the commands it runs for their effect (TT-D3). Source control's —
the git panel, its branches and worktrees, the diff window, the review, the merge screen, rebasing, the remote — are
the outside and code's, in files of their own (`source-control.ts`; the diff window's later edges in `git-diff.ts`,
the first file being near its size limit): each makes its repository with git in its own folder (commits, branches,
a worktree, a bare repository as the remote, a conflict from a real merge or rebase).

**Coverage** (`tests/terminal/coverage.ts`, tests/terminal-coverage.test.ts in `bun run test`): every command and every
area of `CASES.md` (its "By area" part) is covered by a check, or left out, with its reason, in its area's file; the
command line's own areas are left out together (tests/cli/ covers them). Each command group and each area has
an owner, the area whose task covers it, and the report groups what's uncovered by owner; a name a check or a list
gives that doesn't exist, and a left-out entry a check covers, are said too (TT-D4).

The check file `updates` (`tests/terminal/checks/updates.ts`), of the offer, `:upgrade`, and the restart with its
question about notes unsaved, driving real release builds (`tests/terminal/release-builds.ts`; where they are, which
every check's session reads, `releases.ts`): two of the checkout, built for this machine (no `--target`, which would
download Bun's runtime) with `SLIPBOX_RELEASE` defined, once a run before the workers start, when a chosen check says
`releases` — the runner tells its workers where (`SLIPBOX_TERMINAL_RELEASES`) — the second from a copy of the sources
whose `version.ts` says the next patch version, so the slipbox that comes back is the new one. A check installs the
first in its own data folder as the installer lays it out (linked, not copied), as Homebrew does (a keg and `opt`), or
put by hand, and starts it: the harness's `bin` starts a given binary in place of `bun src/main.ts`. The second is a
release served from a folder (`SLIPBOX_RELEASES_URL=file://{releases}`, its pack and `SHA256SUMS`), or from a local
server holding the pack back three seconds, for quitting during a background upgrade (its address in the session's
`extraEnv`, which a check's `setup` fills): the shell's prompt back at once, the version installed after. On Linux,
`/proc/<pid>/exe` shows the process runs the new file itself, not waiting on a child. `:restart`'s question about notes
unsaved is checked from source.

**What needs a real terminal** (`tests/terminal/herdr/`) runs in a herdr pane, as the terminal tests once all did:
two checks of the emulator's word against a real terminal's (`bun run test:herdr --pane <id>`): the keys a real one
sends (escape then a key, ctrl, alt, a bracketed paste), and the widths a real one draws (names in their own scripts,
every row the pane's width, the explorer's border in one column down every page). Pictures drawn by the terminal
(Kitty's graphics) aren't checked anywhere: the headless checks see what slipbox sends. The docs' screenshots are
taken in the headless terminal (D236; `bun run shots`, the root's design/testing.md § The terminal tests).

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
what grows with a note: opening it, moving, typing in SOURCE view and the lens, leaving the lens, a reload, a width
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
