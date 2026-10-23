---
status: done
assignee: claude-18
blocked_by: []
tracker: [gh:#18]
created: "2026-10-23"
---

# T21: The checks' panelFocused waits for the panel itself, never the which-key popup

The terminal checks' shared helper `panelFocused` (`tests/terminal/check.ts`) opens and focuses a panel by its leader
key. It reads the screen to decide whether to press again, and a screen still showing the leader's which-key popup,
whose line for the key names the panel, passes for the panel opened: it presses again, and the second press closes
it.

## Description

`panelFocused(s, key, mode, title)` presses `space <key>` up to twice: after a press it takes the status line's mode,
or the panel's title on screen when it was closed before, for the press having taken effect, and presses again while
the mode isn't on the status line. Its callers pass the bare title (`/Explorer/` from `explorerOpen`, `/Outline/` from
the outline's check), which the which-key popup's line for that key also holds (`Explorer: open, focus, close`). A
screen that hasn't caught up with the press (slipbox painting late on a loaded runner) can still show the popup: the
helper reads it as the panel opened, presses again on a screen that then catches up, and the cycle (open and focus,
then close) closes the panel it was asked to open.

Make it wait as the git panel's `toPanel` (`tests/terminal/checks/source-control.ts`) does: pressed once, unless the
panel is already open and focused; then the panel's own title (anchored at its border, which the popup's line isn't)
and the status line's mode waited for together. Never pressed again on a screen that hasn't caught up.

## Acceptance criteria

- A test in `tests/terminal-harness.test.ts` (§ what the checks share) drives `panelFocused` against a scripted screen
  that still shows the popup after the press: it presses once and returns with the panel open and its mode on the
  status line. It fails with the old helper (checked by undoing the fix once).
- The checks that use it (`explorerOpen`'s, the outline's) pass: `SLIPBOX_TERMINAL_JOBS=2 bun run test:terminal …`.
- `explorerClosed`, beside it, read for the same mistake.

## Out of scope

- The app's leader keys and the which-key popup: nothing changes in slipbox.
- Other checks' own helpers, unless they make the same mistake (then noted here, or fixed with it if they share the
  helper).

## References

- Delivers: workstreams/terminal-tests/design.md § MODIFIED design/testing.md § The terminal tests (every check waits
  for the screen to agree; in step with slipbox).
- Rests on: (TT-D2), (TT-D3); the git panel's `toPanel`, fixed the same way before the repository restarted.

## Log

- 2026-10-23: Live, this worktree's slipbox on a scratch reference set (`build-home.ts`, its own XDG folders, default
  config): after `space`, the which-key popup lists `e → Explorer: open, focus, close` and `o → Outline: open, focus,
  close` (and `Source control in the left panel: …`), so `/Explorer/` and `/Outline/` match it; and while the leader
  is pending the status line's chip is ` ␣ `: with the explorer focused, `space` turns ` FILES ` into ` ␣ `.
- 2026-10-23: The cycle (`openLeftView`/`openRightView`, `src/tui/panels.ts`): closed → shown and focused in one
  press; open, unfocused → focused; open and focused → closed. One press always gets "open and focused" but from the
  last, so the helper's second press had no case of its own: it fired only when the title was read without the mode,
  which is the popup.
- 2026-10-23: How the screen lags: `Session.keys` returns once the trace has the keys and a `frame` after them, then
  40 ms of quiet; but `frame` is written as slipbox paints, before its bytes reach the headless terminal, and `taken`
  gives up silently after `WAIT`. On a loaded runner the screen read next can still be the popup.
- 2026-10-23: Two mistakes, not one. `panelFocused` from a closed panel (the outline's check; `explorerOpen` where the
  explorer is hidden) takes the popup's line for the panel opened (`!open && rowOf(title)`), presses again, and the
  panel closes; from an open one it's safe (only the mode counts). `explorerClosed` (the session check, from open and
  unfocused) takes the popup's ` ␣ ` for FILES gone and its line for the explorer still there: it presses a third time
  and reopens it.
- 2026-10-23: Codex agreed with the cause and the one-press fix, and added: match the mode chip at the status line's
  start, not a substring (a file name can hold `FILES`); `explorerClosed` returns at once when already closed (opening
  it would `reveal()` and move the selection); closed means a mode on the chip, not merely "not FILES" (a prompt, an
  empty line); titles vanish in panes under eight rows; test each helper from every start, the presses counted, the
  fake's popup turning the chip to `␣`. All taken.
- 2026-10-23: Fixed (`tests/terminal/check.ts`): `mode(s)`, the status line's chip; `EXPLORER` and `OUTLINE`, the
  panels' own titles (the explorer's up to its border past its buttons, the outline's after the right panel's border),
  which the popup's `Explorer: …`/`Outline: …` lines don't match; `panelFocused` as `toPanel`: pressed once unless
  focused, then title and mode waited for together; `explorerClosed`: back at once if closed, else `explorerOpen`, one
  press, the title gone and a mode other than FILES waited for. `explorerRow` finds the title by `EXPLORER`; the
  outline's check passes `OUTLINE`.
- 2026-10-23: Tests (`tests/terminal-harness.test.ts` § what the checks share): an `sh` fake of the explorer's cycle
  in the Session's headless terminal, writing `key`/`frame` to the trace at once and drawing the press's effect 400 ms
  later, its popup line the command's own title (`COMMAND_SPECS`); `explorerOpen` from closed, open, focused (1, 1, 0
  presses) and `explorerClosed` from open, focused, closed (2, 1, 0), each ending in the right state; and the titles
  against the popup's lines and the rows slipbox draws. 8 pass. Mutation-checked: with the old helpers, 3 fail
  (`explorerOpen` from closed and `explorerClosed` from open time out; from focused, 3 presses).
- 2026-10-23: Terminal checks, `SLIPBOX_TERMINAL_JOBS=2`: the 25 whose run uses these helpers (found by their source)
  pass, 47 s; the explorer's, the outline's and the session's, `--repeat 5`, 15/15. The docs' shot that uses
  `explorerOpen` (`vaults-explorer`), taken into a scratch folder: as before.
- 2026-10-23: No user docs or CHANGELOG line: the terminal tests' helpers, nothing users see. No design change: the
  design says every check waits for the screen to agree; the helper now does.
- 2026-10-23: Codex's review of the diff, one finding, verified: the fake's readiness wait (the status line holding
  `home.md`) could pass on a half-drawn first frame, its first row also saying `home.md`; from the focused start
  `explorerOpen` would then press and close it. Fixed: the fake marks its frames as slipbox does (synchronized
  output), and the fixture waits for the mode chip, drawn last. 8 pass; the mutation check fails the same 3.
- 2026-10-23: The code-review skill's review of the diff (medium), eight findings, each checked against the code:
  - Taken: `OUTLINE` wanted a character after the title, but the screen's rows are read with their trailing spaces
    gone (`translateToString(true)`), so with no right rail beside the outline (zen, `ui.right_rail` off, no tabs:
    `rightRailWidth`) its title ends the row: now `/[│┃|] Outline(?: |$)/`.
  - Taken: in ASCII the borders are `|` (`glyphs.ts`, `vbar`); both titles take it. No check uses these helpers in
    ASCII today.
  - Taken: the checks' own explorer readers (`explorer`, `crumbs`, `clickCrumb` in links-and-files.ts, `paneRows` in
    vaults.ts) found its title by the bare `/Explorer/`: they use `EXPLORER` now, one definition of the title. None
    reads with the popup up today, so no failure was seen; the same notion, kept in one place.
  - Taken: the titles' test now has the popup's lines in Unicode and ASCII, and the rows of an ASCII explorer, an
    explorer too narrow for its buttons, and an outline with no rail beside it. Mutation-checked: the first round's
    patterns fail it.
  - Not taken, stated instead: in a pane under eight rows slipbox draws no title (`paneTitle`), so `panelFocused`
    never sees one and `explorerClosed` takes an open explorer for closed. No check calls them in a pane that short,
    and the old `explorerClosed` had the same limit; `EXPLORER`'s comment says the helpers need the title.
  - Not taken, stated instead: `explorerClosed` with a prompt, an operator or keys pending at its start finds no mode
    and opens the explorer first. That's a caller taking the keys, which the helpers exclude, as `panelFocused` says;
    a message goes over the status line only on a screen under 30 columns or 5 rows (`draw.ts`).
  - Not taken, a follow-up for the maintainer: the stale screen itself, `Session.keys` returning once the trace has a
    `frame` before its bytes reach the headless terminal, could be closed once for every check (a marker slipbox
    writes in each frame, the terminal waited for). That changes the terminal tests' design (§ In step with slipbox),
    beyond this task; the helpers no longer act on a stale screen, and other checks wait for what they expect.
- 2026-10-23: Terminal checks again after these, `SLIPBOX_TERMINAL_JOBS=2`: the 25 that use the helpers or the
  readers, 24 passed; the 25th (`links: a symlink within the vault never asks`) timed out with slipbox never started,
  a blank screen, while the machine's load was 50 on 10 cores (the run took 426 s, against 47). Run again alone under
  `nice` at a load of 8.5: passed, 1.9 s.
- 2026-10-23: The typecheck, the lint and `check:docs` pass. Done; the pull request's merge is the acceptance.
