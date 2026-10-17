# Decisions: terminal tests

## TT-D1: "Terminal tests", not e2e (2026-10-13)

**Decision:** The tests that drive slipbox in a terminal are the terminal tests: `bun run test:terminal`, in
`tests/terminal/`. "e2e" is retired, in the code, the docs and the blueprint.

**Why:** The user's: end to end should mean everything, and these check the terminal's side.

## TT-D2: Headless: Bun's pseudo-terminal and a headless xterm (2026-10-13)

> **Amended by D236 (2026-10-17):** the docs' screenshots are taken in the headless terminal too; herdr keeps the
> real-terminal set alone.

**Decision:** Each check runs slipbox in a pseudo-terminal of Bun's own (`Bun.Terminal`, Linux and macOS), its output
fed to `@xterm/headless` (MIT, no dependencies, the emulator VS Code uses), which keeps the screen — text, colours,
the cursor, the title — for the checks to read; keys go in as a terminal sends them, and the emulator's own replies to
slipbox's queries go back. herdr stays for the docs' screenshots and a small set that needs a real terminal (Kitty's
pictures and keyboard protocol, a real clipboard, a terminal's own width rules).

**Why:** The user asked for a headless terminal, as a headless browser is: no herdr, many at once, and CI on every
system GitHub has. A prototype drove slipbox so on 2026-10-13: the screen in about 300 ms, text and true colours
read back, keys typed, a clean quit (notes.md).

**Not chosen:** Microsoft's `tui-test` (0.1.0, and node-pty's native build, which the supply chain's gates forbid);
VHS (recordings, not checks); tmux's capture (colours hard to read back).

## TT-D3: One check per feature, tied to what it covers (2026-10-13)

**Decision:** A check covers one feature — small related ones grouped — and is named by it, under its area
(`links: follow, back and forward`). Each says which of the reference set's cases (`examples/home/CASES.md`) and which
commands it covers; a failure names one feature.

**Why:** The user's: today's scenarios check several features each, so a failure doesn't say which broke.

## TT-D4: Coverage, checked (2026-10-13)

**Decision:** A test fails when a command (`core/command-specs.ts`) no check runs, or an area of `CASES.md` no check
covers — unless it's listed as left out, with its reason (a command with nothing to see, an area the headless tests
cover). The terminal tests' report says what each check covered.

**Why:** The user asked that coverage be ensured, not hoped for.

## TT-D5: Content from the sample folders only (2026-10-13)

**Decision:** A terminal check opens the reference set (`examples/home`) or the demo vault (`examples/vault`), or a
set of `examples/` made for a purpose (the guides' `~/notes`); a case they lack is added there, with its `CASES.md`
entry, never written by the check. What git can't hold is made by `scripts/build-home.ts`. A unit test that checks one
rule may keep its few inline lines; realistic content comes from the sample folders.

**Why:** The user's: one document set per test or task is inconsistent and grows without anyone seeing it.

## TT-D6: In parallel, everywhere; test, then fix (2026-10-13)

> **Amended by D238 (2026-10-17):** CI's Mac is Apple silicon alone: Intel Macs aren't built for after 0.3.0, and
> `macos-15-intel` no longer runs the checks. Linux still runs them on x64 and arm64.

**Decision:** The checks run concurrently, as many as the machine has cores, each its own terminal, folders and
slipbox; CI runs them on Linux and macOS, x64 and arm64, on every pull request, inside the required `ci` check. A run
goes to its end and reports every failure; fixes are made together, then everything runs again.

**Why:** The user's: parallel as much as possible, and no test-fix-test loops.
