# Design changes

Each change names the root's design section it lands in at consolidation. A task writes the new text here as it does
the work; the root's files change only when TT is consolidated.

## MODIFIED design/testing.md § The terminal tests

Rewritten: headless (`Bun.Terminal` and `@xterm/headless`, TT-D2) — how a check starts slipbox, sends keys, reads the
screen and its colours, the title and the clipboard's OSC 52, and answers slipbox's queries; the checks, one per
feature (TT-D3), and the coverage test (TT-D4); the parallel runner and its report (TT-D6); CI's runs; herdr's
remainder (the screenshots, the real-terminal set). Previously: "a herdr pane … a developer's tool, not part of
`bun run check` or CI".

The text, as TT-T1 and TT-T2 built it (the rest follows with TT-T8 and TT-T9):

**The headless terminal** (`tests/terminal/terminal.ts`). A check's slipbox runs in a pseudo-terminal of Bun's own
(`Bun.Terminal`), its output fed to a headless xterm (`@xterm/headless`), which keeps the screen: each row's text,
each cell's colours (true colour as `#rrggbb`, the palette as its SGR code) and boldness, the cursor. It answers what
slipbox asks a terminal at start as a modern one does: the cursor's place and the device's attributes (xterm's own
answers), its colours (OSC 10 and 11, a dark scheme), and the Kitty keyboard protocol, whose flags slipbox pushes (5:
disambiguate, alternate keys). It keeps the title (OSC 0 and 2) and every OSC 52 copy, and everything slipbox wrote,
for checks of what's sent (pictures, by their protocol's bytes). Each chunk of output is copied before xterm parses
it: the pseudo-terminal reads into the same buffer again.

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
waits for the screen to agree (`until`, `see`, `status`), never a fixed time. `settle` waits until slipbox has written
nothing for 40 ms and all of it is drawn.

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
