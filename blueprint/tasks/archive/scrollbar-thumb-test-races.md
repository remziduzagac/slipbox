---
status: done
assignee: claude-77
blocked_by: []
related: [T17]
tracker: [gh:#77]
created: "2026-10-24"
---

# T30: The git panel's scrollbar-thumb test holds on macOS

A test added with #14 (T17), "scrolled past the list's end for the pointer's row: the scrollbar's thumb stays in the
list", fails on macOS every time and passes on Linux. Find what differs, and fix the test or slipbox, whichever is
wrong, so that it passes on both.

## Description

The test fills a repository with forty untracked files, scrolls the git panel to its end by the wheel, rests the
pointer near the top of the rows, deletes the files after the pointer's row and asks git again: the list must be
scrolled past its end to keep that row on its line (D261), and the scrollbar's thumb must stay beside the list. On
`test (macos-15)` it fails at its first check, `Expected: > 49, Received: 23`: the list isn't past its end there.

## Acceptance criteria

- The test passes on Linux and on macOS (CI's `test (ubuntu-24.04)` and `test (macos-15)`), with no sleep and no
  quarantine: what it waits for is what it needs.
- It passes whichever way git's answers race (checked by letting every answer in early, at each step), and it still
  fails when the thumb's fix from T17 is undone.

## Out of scope

- How the panel's sections answer git in the background, and what they show meanwhile.
- The terminal check of the same case (`tests/terminal/checks/git-steady.ts`), which passes on macOS.

## References

- Delivers: the test of design/tui.md § Side panes (the git panel's rows held, the list scrolled past its end).
- Rests on: D261; GIT-D8 (This branch against its base); T17.

## Log

- 2026-10-24: Valid. On `dev` (42e879d) the test passes on Linux and has failed on `test (macos-15)` in every run that
  reached it (PR #72's run 40106884219: `Expected: > 49, Received: 23`, `tests/gitpanel.test.ts:2650`). No macOS
  here: the cause is read from the numbers and the code, and reproduced on Linux by putting git's answers in macOS's
  order.
- 2026-10-24: On Linux (ran, the rows printed): 47 rows before the wheel (Untracked's heading and its 40 files, This
  file's 4, Branches with "asking git…"); the wheel scrolls to the end, 23 (47 − 24); n23 under the pointer; n24–n39
  deleted, 31 rows, and 23 > 31 − 24. Neither This branch against main nor the branches have answered by the end.
- 2026-10-24: Cause: the test's setup races git. The repository is on `feature`, so the panel has a section This
  branch against main (GIT-D8), asked in the background (`merge-base`, then `diff`: `changedLater` in
  `core/gitbranches.ts`), listing c.md and every untracked file, below the files and so below the pointer's row. Its
  first ask starts with the panel's first frame; the test next waits on git at the status after the deletion. On Linux
  that status always comes back first, and the section never shows during the test. On macOS the section's answer
  always comes back first, and its rows fill the list below the pointer's row: the list isn't past its end, and any
  answer of the section's fails the test (a fresh one too: 58 rows, 58 − 24 = 34 > 23, ran by the reviewer). The
  exact 49: asked again on git's news, the section shows its last answer meanwhile (`GitPanel.aheadFiles`), so the
  frame after the deletion still lists n24–n39 there, 42 rows: 31 + 42 = 73, 73 − 24 = 49. Reproduced on Linux by
  waiting for that section after the wheel: the test fails the same way, `Expected: > 50, Received: 23` (50: there
  the branches had answered too, a row more). Why macOS's git is always that way round wasn't measured (no macOS
  here); its status of the 24 files left slower against `merge-base` and `diff` there is the likely reason, unverified.
- 2026-10-24: slipbox isn't wrong: the row under the pointer stays on its line and the scroll holds (D261); with rows
  below it, the list just isn't past its end, and the thumb is where it should be. The section's last answer shown
  while git is asked again is as built (`GitPanel.aheadFiles`; design/tui.md § Side panes: asked again whenever git
  has news), and isn't what fails the test. The terminal check of the case (`git-steady.ts`, "scrolled past its end to
  keep a resting pointer's row: the scrollbar's thumb stays in the list") passes on macOS. The test is wrong: it
  relied on This branch and the branches not having answered.
- 2026-10-24: Fixed in the test (tests/gitpanel.test.ts): the repository switched to `main`, which has nothing of its
  own against a base, so there's no This branch section (checked: `aheadFiles()` is null); and the branches waited for
  before the wheel, the last rows below the files to come (they keep their answer when asked again). Nothing arrives
  below the pointer's row after that. Not taken: waiting for This branch's answers instead (its rows list the same
  files, so the deletion would take rows above the pointer's row too, a different case); folding the section (its
  heading still arrives in its own time).
- 2026-10-24: Checked (ran): the fixed test passes; with a wait of 300 ms and a frame after the wheel, the pointer's
  move and the deletion (every answer in, macOS's order and later), it passes, 48 rows then 33, the scroll 24; with
  T17's thumb fix undone (`draw-git.ts`, the scrollbar's total `rows.length` again), it fails, `Expected: not "▐"`.
  No other test in the file scrolls to the list's end this way. The terminal check above passes
  (`SLIPBOX_TERMINAL_JOBS=2 bun run test:terminal`, 1/1); the typecheck, the lint and `check:docs` pass. No live try:
  nothing slipbox does changed, and the terminal check drives the case.
- 2026-10-24: Reviewed once, by two independent reviews (the maintainer's call: one round): a fresh Claude reviewer in
  Codex's place (the maintainer has Codex off), which worked out the cause on its own first and matched every number,
  and `/code-review`. Taken: the stale answer put forward as the cause in the test's comment and the commit (any
  answer of the section's fails the test; reworded); 24 files, not 40, in the race; the acceptance criterion's
  wording (answers let in, not held back); the last answer meanwhile is the code's and tui.md's, not GIT-D8's; a
  guard that `main` has no This branch section (`aheadFiles()` null), so a change to how a base is chosen fails
  plainly, not as the macOS-only failure again; this task done and archived. Not taken: waiting for the row count to
  hold across frames instead of for the branches (no more certain than waiting for what's needed; the guard and the
  test's own check of the end say what went wrong); the case narrowed to `main` (the thumb's total doesn't depend on
  which section the rows are from, and the test still fails with T17's fix undone). The pull request waits for
  `test (macos-15)` on its head before it's merged.
