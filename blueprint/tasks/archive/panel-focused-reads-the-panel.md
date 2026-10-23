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
- Every case fixed, the reviews' included, has a terminal check driving slipbox through it too
  (`tests/terminal/checks/panels.ts`).

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
- 2026-10-23: The cause and the one-press fix, challenged, held; the challenge added: match the mode chip at the
  status line's start, not a substring (a file name can hold `FILES`); `explorerClosed` returns at once when already
  closed (opening it would `reveal()` and move the selection); closed means a mode on the chip, not merely "not FILES"
  (a prompt, an empty line); titles vanish in panes under eight rows; test each helper from every start, the presses
  counted, the fake's popup turning the chip to `␣`. All taken.
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
- 2026-10-23: First review of the diff, one finding, verified: the fake's readiness wait (the status line holding
  `home.md`) could pass on a half-drawn first frame, its first row also saying `home.md`; from the focused start
  `explorerOpen` would then press and close it. Fixed: the fake marks its frames as slipbox does (synchronized
  output), and the fixture waits for the mode chip, drawn last. 8 pass; the mutation check fails the same 3.
- 2026-10-23: A second, independent review of the diff, eight findings, each checked against the code:
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
- 2026-10-23: The pull request's own review, round 1: two independent reviews of `git diff origin/dev...`, eleven
  findings, none the same; each checked against the code:
  - Taken: `EXPLORER` matched any row where "Explorer" was followed by words and a border: a tab (`1 Explorer
    guide.md ×`) or a note's line with a panel beside it, which would keep `explorerClosed` waiting. Now two spaces or
    more after the title, then the buttons (a glyph or two each): `/Explorer {2,}(?:\S{1,2} +)*[│┃|]/`; `OUTLINE`
    likewise, `/[│┃|] Outline(?: {2,}|$)/`, so a note's line starting "Outline" isn't it. The titles' test has those
    rows; the patterns before fail it.
  - Taken: the fixture's setup, failing (slipbox's stand-in not starting), left its session, its process and folder:
    the tests' `finally` is in a `try` it never reached. It cleans up and rethrows.
  - Taken: the git panel's `toPanel` was the helper `panelFocused` now is, with the status line read as a substring:
    it is `panelFocused(s, "g", "GIT", TITLE)`.
  - Taken: this Log named the agents that challenged and reviewed the work; it says what was found, not who said it.
  - Rejected: "the old helper pressed again when nothing changed, the new one never retries a dropped press" — the old
    one didn't either: its wait threw at `WAIT` when neither the mode nor the title came.
  - Rejected: ASCII's `|` taken by the titles but not by the readers' border search (`explorerRow`, `explorer`,
    `crumbs`, `paneRows`), which look for `│` or `┃` alone. That was so before this change, and no check runs them in
    ASCII; with the title and border logic written five times over (those, and the git panel's `panelPart`), a helper
    of its own in check.ts is a follow-up, not this fix.
  - Rejected: herdr's widths check finds the explorer's title by `/Explorer/`. It runs only in a real terminal (not
    here), reading once after the start with nothing pending.
  - Rejected: `s.see("Explorer")` after `explorerOpen` and `s.see("Outline")` after the outline's are redundant now,
    but can't pass falsely: the popup can't be up once the helper saw the mode chip.
  - Rejected, as before: `Session.keys` and the stale screen, a follow-up.
  - Rejected: the six fixture tests take about 6 s, the lag their margin to catch the old helpers on a slow machine;
    run concurrently, two of Bun's pseudo-terminals in one process can cross their output.
- 2026-10-23: After round 1: the tests of what the checks share, 8 pass; the 59 terminal checks that use the helpers,
  the readers or `toPanel` (the git panel's 34 with them), `SLIPBOX_TERMINAL_JOBS=2` under `nice`, pass, 120 s.
- 2026-10-23: Round 2, two independent reviews of the new diff: one found nothing; the other ten findings, checked:
  - Taken: `mode()` took any chip of capitals for a mode, but ASCII draws the pending leader as ` SPC ` (`keyText`) and
    `F` waiting for its character as ` F `, against what its comment said. It reads the chip against the thirteen
    modes `drawStatus` names (`modeOf`, tested; the pattern before fails it on `SPC`).
  - Rejected: a source-mode table cell `| Explorer   |` or a rendered one `│ Outline   │` would match the titles. A
    check's content comes from the sample folders alone (TT-D5), and none has such a cell.
  - Rejected: an outline narrower than its title and two spaces: `ui.outline_width` is 32 unless set, and the one
    check that sets it gives 60.
  - Rejected: `explorerClosed` takes a left panel showing another view (git) for the explorer closed. It is: the
    helper's job is the explorer, as the old one's `notSee(/Explorer/)` was.
  - Rejected: the git panel's `TITLE` takes no ASCII `|` while the explorer's and the outline's do; with the readers'
    border search (round 1), ASCII through the panels' helpers is the follow-up's.
  - Rejected: the regression tests catch the old helpers only while they read the screen within the 400 ms lag, which
    a runner loaded enough may not; the fixed helpers pass either way, and the lag was the margin chosen (round 1).
  - Rejected: T21 after T10, its numbers between unused: the IDs were handed out to the branches working at once, T21
    to this one.
  - Rejected, as before: `Session.keys` and the stale screen; the title and border logic written five times.
- 2026-10-23: After round 2: the tests of what the checks share, 9 pass; the 59 terminal checks pass, 165 s.
- 2026-10-23: Round 3, two independent reviews of the new diff: one found nothing; the other nine findings, checked:
  - Taken: `explorerClosed` wanted a mode on the chip to call the explorer closed, so with no status line (zen) it
    opened a closed explorer, then waited for FILES forever. The mode adds nothing against the popup — under it the
    explorer's title still shows — so closed is the title gone and the status line off FILES.
  - Taken: `modeOf` wanted a space after the chip; a status line of the chip alone, nothing drawn after it, is a mode
    too.
  - Rejected, as in round 1: "the old helper pressed again when nothing changed" — it didn't.
  - Rejected: `leader()` waiting for the chip to come back after every press: a leader sequence that opens a prompt
    keeps the chip away, and every check's leader keys would change.
  - Rejected: the fake's `sleep 0.4`, fractional, not POSIX: the `sleep` of every system the tests run on (Linux's,
    macOS's) takes it.
  - Rejected, as before: a left panel on git taken for the explorer closed; herdr's check; the title and border logic
    written five times; `Session.keys` and the stale screen; the six cases' time. The second reading of the screen in
    `closed()` went with the first fix.
- 2026-10-23: A check failed outside this change: `links: in Elsewhere every link asks` found slipbox started in
  `/tmp` as its root, with a note there that isn't the repository's (`/tmp/blueprint-framework-example.md`), on its
  first wait, before any helper ran. Alone, under `nice`, at a load under 10: passed.
- 2026-10-23: Every case with a terminal check too, as the maintainer asked: `tests/terminal/checks/panels.ts`, seven
  checks driving slipbox through the helpers, each press of a panel's key counted from the trace (`explorer.cycle`,
  `outline.cycle`, `git.view`):
  - the leader's popup names the explorer and the outline (`Explorer: open, focus, close`), the titles' patterns find
    the explorer's own row and no outline, and the chip is ` ␣ `, no mode (the first live try's case);
  - `explorerOpen` and `explorerClosed` from every start — open, focused, closed, open again — 1, 0, 1, 0, 1 and 2
    presses;
  - the outline by `panelFocused`, one press, with no right rail, its title then blank to the screen's edge;
  - a tab, a heading, the explorer's own row and a note's line saying "Explorer" or "Outline" in passing
    (`notes/reading/Explorer of the North.md`, added to the reference set with its `CASES.md` entry, TT-D5), never
    the titles: the explorer closed in two presses, then none; the note's line `│ Outline of the book` drawn past the
    explorer's border with line numbers off, not the outline's title;
  - ASCII: the title's border `|`, the leader pending as ` SPC `, no mode; the helpers one press a step;
  - zen: no status line, `explorerClosed` presses nothing;
  - the git panel's `toPanel`: one press, none once focused.
  All seven pass. With the code each review changed put back: round 0's titles fail the in-passing check (a tab taken
  for the explorer's title; the note's line for the outline's), round 1's `mode()` fails ASCII's, round 2's `closed()`
  fails zen's.
- 2026-10-23: The outline check found round 1's premise wrong: the screen's rows aren't read with their trailing spaces
  gone where slipbox draws blanks, and a panel's are drawn; the outline's title with no rail is followed by its blank
  to the edge, which `OUTLINE`'s spaces take. Its "nothing after it" branch stays, for a row nothing is drawn past.
  Comments corrected.
- 2026-10-23: After round 3: the unit tests of what the checks share and the coverage's, 33 pass; `home.test.ts` and
  the new note's rendering pass; the 59 terminal checks that use the helpers pass (one, the `/tmp` failure above, run
  again alone); the seven of `panels.ts` pass, 23 s.
- 2026-10-23: Round 4, two independent reviews of the diff with the terminal checks; nine findings, checked:
  - Taken: the helpers' first look (focused already? closed already?) read the screen as it was, without `until`'s
    rule that a frame is read whole: a repaint begun, the screen cleared, showed neither title nor mode, and they
    pressed. They decide between frames now (`betweenFrames`). Tested on the fake, which repaints once with its frame
    held half drawn: `explorerOpen` from focused presses nothing, `explorerClosed` from open twice; with the direct
    read, both fail. No terminal check: slipbox can't be made to hold a frame half drawn at that moment; every check
    goes through the guarded look.
  - Taken: `MODES`, a copy of `drawStatus`'s chips, is held to them by a test reading draw-status.ts.
  - Taken: the Log and the pull request said every case had a terminal check, but ` F ` and ` dT ` waiting had none,
    and two cases had none to have: a new check drives ` F ` and ` dT ` in source mode (the pattern before fails it).
    "The chip alone, nothing after it" (round 3) and "the outline's title, nothing after it" (round 1) aren't drawn by
    slipbox: at 12 to 30 columns the status line shows more after the chip, and a panel's blank is drawn to the edge.
    Both branches are gone, with their unit rows.
  - Rejected: a table cell `| Explorer   |`, a line that is only "Outline": no sample has either (TT-D5).
  - Rejected: zen with the explorer shown as an overlay: `explorerClosed` can't close it, its focus having no mode to
    show; no check does it, and the helper's comment says so.
  - Rejected: in zen a note's last row read as a chip: zen draws the note past a two-column margin, and a chip is one
    space from the edge.
  - Rejected, as before: panes under eight rows; the git panel's title in ASCII.
- 2026-10-23: After round 4: the unit tests of what the checks share, 13 pass; the eight checks of `panels.ts` pass;
  the 65 terminal checks using the helpers pass, before the last two branches went and after (266 s).
- 2026-10-23: CI on the round-3 push: macOS's terminal run failed one check this change doesn't reach, `git: source
  control — a file staged, committed, the commit amended`: its amend editor still open after its own `escape,
  ctrl+s`, with no helper of this change in it; it passed on macOS for the pushes before.
- 2026-10-24: Round 5, one review (the other reviewer out of its quota until 01:41; its review follows in round 6):
  nine findings, checked:
  - Taken: the repaint test could hang: its repaint came 0.3 s after the fake's first frame, and a runner that missed
    that window waited for a frame begun that never came. The test begins the repaint itself (`r`), holds its frame
    open as long as it likes, and ends it (`R`); with the direct read both cases fail at once.
  - Taken: `navigating.ts`, already past the size limit, grew a line (`OUTLINE`'s import): `outlineOpen` joins
    `explorerOpen` in check.ts, and the file is back to its size on `dev`.
  - Taken: `betweenFrames` said what it does plainly: `until` with nothing to wait for, which looks only between
    frames, then the look.
  - Taken: the test holding `MODES` to draw-status.ts sliced the source by two names; it fails if either is gone or
    out of order, rather than reading the wrong stretch.
  - Taken: a step of the explorer's check had no name for its failures.
  - Taken, the words: the sample's line goes on past "Outline", and `CASES.md` and `OUTLINE`'s comment say so.
  - Rejected: a table cell, a line that is only "Outline", a folder named "Explorer": no sample has one (TT-D5).
  - Rejected: other checks' bare `see`/`notSee("Explorer")`: none decides a press on it, a wait for it gone can't
    pass early, and they run in the demo vault, not beside the new note (the full run on the round-3 push passed).
  - Rejected, as before: the first look on a screen not caught up (the stale screen, the follow-up's); panes under
    eight rows.
- 2026-10-24: After round 5: the unit tests of what the checks share, 14 pass, and `home.test.ts`'s; the eight checks
  of `panels.ts` and the outline's pass.
- 2026-10-24: Round 6, the first review: ten findings, none new, each one rejected before for the reason it was:
  the titles against a line that is only "Explorer" or "Outline", a table cell or a folder so named (no sample has
  one; a heading reading only "Explorer" is in the user docs, which no check opens); the old helper's second press
  (never a retry); the first look on a whole frame not caught up (the stale screen, the follow-up's); ASCII in the
  readers and the git panel's title; panes under eight rows and zen; herdr's check and the title logic written five
  times; the modes' test reading draw-status.ts (it fails out loud when the source moves, which is the point; the app
  isn't changed for it).
- 2026-10-24: Round 6's second review not run: its reviewer was out of quota, and the maintainer no longer needed it.
  CI on round 5's push (15ce861): green on every platform, macOS's terminal run included.
- 2026-10-24: The typecheck, the lint and `check:docs` pass. Done; the pull request's merge is the acceptance.
