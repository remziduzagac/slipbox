# Design changes

Each change names the root's design section it lands in at consolidation. A task writes the new text here as it does
the work; the root's files change only when TT is consolidated.

## MODIFIED design/testing.md § The terminal tests

Rewritten: headless (`Bun.Terminal` and `@xterm/headless`, TT-D2) — how a check starts slipbox, sends keys, reads the
screen and its colours, the title and the clipboard's OSC 52, and answers slipbox's queries; the checks, one per
feature (TT-D3), and the coverage test (TT-D4); the parallel runner and its report (TT-D6); CI's runs; herdr's
remainder (the real-terminal set; the screenshots are taken headless too since D236). Previously: "a herdr pane … a
developer's tool, not part of `bun run check` or CI".

The text, as TT-T1 to TT-T10 built it:

**The headless terminal** (`tests/terminal/terminal.ts`). A check's slipbox runs in a pseudo-terminal of Bun's own
(`Bun.Terminal`), its output fed to a headless xterm (`@xterm/headless`), which keeps the screen: each row's text,
each cell's colours (true colour as `#rrggbb`, the palette as its SGR code) and boldness, the cursor. It answers what
slipbox asks a terminal at start as a modern one does: the cursor's place and the device's attributes (xterm's own
answers), its colours (OSC 10 and 11, a dark scheme), and the Kitty keyboard protocol, whose flags slipbox pushes (5:
disambiguate, alternate keys). It keeps the title (OSC 0 and 2) and every OSC 52 copy, and everything slipbox wrote,
for checks of what's sent (pictures, by their protocol's bytes). Each chunk of output is copied before xterm parses
it: the pseudo-terminal reads into the same buffer again. Its widths are a terminal's that keeps grapheme clusters
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
`statusLine`, `runs`, `styleOf`, `title`, `osc52`, `after`: what slipbox printed on its way out), and every check
waits for the screen to agree (`until`, `see`, `status`), never a fixed time; a wait gets at least ten seconds
whatever the check asked (`SLIPBOX_TERMINAL_WAIT`), since a machine with a check on every core is slower than the one
a check was written on, and a wait that passes returns at once. What lands only once slipbox is ready (spelling's
dictionaries, loading in the background) is tried again until it does (`retry`): a key pressed early does nothing.

**In step with slipbox.** On a loaded machine slipbox reads a key late and draws late: a check that reads the screen
right after sending keys can read the frame before them, and act on it (the link under the cursor, the line it's
on). So with `SLIPBOX_TRACE` set, slipbox writes, beside each command run, a `key` line once it has handled a key or
a paste and a `frame` line for each frame it paints (src/tui/run.ts); `keys`, `type` and `paste` return once every
key sent is handled and a frame painted after the last (a named key is one key, typed text one per code point, a
paste one), then once nothing more is written for 40 ms. A check timed against the clock (an answer within two
seconds while it indexes) says `alone` and runs by itself after the others, where it times slipbox, not the machine.

**The runner** (`tests/terminal/run.ts`, `bun run test:terminal [--jobs N] [--repeat N] [--keep] [--list] [area or
name…]`) runs the chosen checks concurrently, as many as the machine has cores, each in a worker process of its own
(`worker.ts`): two of Bun's pseudo-terminals in one process can cross their output (Bun 1.4.2), and a check that
crashes takes only itself down. A check has two minutes. The run goes to its end, then reports every failure with
its screen, a summary by area, and how many commands the checks ran; a check that declares a command it never ran
fails. `--repeat` runs each check that many times in the same pool, to show a flaky one.

**The checks** (`tests/terminal/checks/<area>.ts`) are one feature each, small related ones grouped, named by it under
one of five areas (reading, editing, navigating, links and files, the outside and code), each declaring the reference
set's areas it covers (`CASES.md`'s headings) and the commands it runs for their effect (TT-D3).

**Coverage** (`tests/terminal/coverage.ts`, tests/terminal-coverage.test.ts in `bun run test`): every command and every
area of `CASES.md` (its "By area" part) is covered by a check, or left out, with its reason, in its area's file; the
command line's own areas are left out together (tests/cli.test.ts covers them). Each command group and each area has
an owner, the area whose task covers it, and the report groups what's uncovered by owner; a name a check or a list
gives that doesn't exist, and a left-out entry a check covers, are said too (TT-D4).

## MODIFIED design/testing.md § The reference set

Each case named by the checks that cover it; the sets of `examples/` made for a purpose (the guides' folder); no
check writes its own (TT-D5).

## MODIFIED design/testing.md § Strategy

The terminal tests among the layers, in CI; test, then fix (TT-D6).

**In CI** (`.github/workflows/ci.yml`, job `terminal`): on Ubuntu (x64 and arm64) and macOS (Apple silicon and
Intel), each runner running a check per core, inside the required `ci` check; a failing check's screen is in the job's
log. A release's build runs them too, on each platform's runner, before it builds (`build.yml`).

**What needs a real terminal** (`tests/terminal/herdr/`) runs in a herdr pane, as the terminal tests once all did:
two checks of the emulator's word against a real terminal's (`bun run test:herdr --pane <id>`): the keys a real one
sends (escape then a key, ctrl, alt, a bracketed paste), and the widths a real one draws (names in their own scripts,
every row the pane's width, the explorer's border in one column down every page). Pictures drawn by the terminal
(Kitty's graphics) aren't checked anywhere: the headless checks see what slipbox sends. The docs' screenshots are
taken in the headless terminal (D236; `bun run shots`, the root's design/testing.md § The terminal tests).

## MODIFIED design/testing.md § Strategy (written)

The terminal tests are a layer of their own beside the headless unit tests: `bun run test` drives the model, `bun run
test:terminal` drives slipbox through a terminal, both in CI. A run of either goes to its end; the failures are fixed
together, then everything runs again (TT-D6).

