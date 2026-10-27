---
status: done
assignee: claude-69
blocked_by: []
related: [T13, T23]
tracker: [gh:#69]
created: "2026-10-24"
---

# T29: The peek check of a vault a widened search opened first waits for the switcher to list its note

The terminal check "peek backlinks: a vault a widened search opened first, then reached by a name a note of it declares
…" (#10) times out on CI now and then, on changes that don't reach the peek. Find why, and make it wait for what it
needs rather than for a time a loaded runner can outlast.

## Description

The check writes `~/notes/by-name.md` from outside, waits for the explorer to show it, then opens it with the quick
switcher (`open` in `tests/terminal/check.ts`) and waits for the status line to name it. On three CI runs (the pull
requests #61, #38 and #60, 2026-10-24) it timed out there, `index.md` still open. Find what the check takes for a sign
that the note can be opened, whether that sign holds, and fix the check (or slipbox, if it's slipbox's race) at the
cause.

## Acceptance criteria

- The cause named with evidence: the screens of the failing runs, the code that draws the explorer's row and the code
  that fills the switcher's list.
- The race forced and shown failing before the fix, passing after (a regression check that fails without it, checked
  by undoing the fix once).
- The check run many times in a row under load, locally, without a failure.
- Every other check that writes a note and opens it at once looked at, and fixed where it has the same race.
- `blueprint/design/testing.md` still true of the checks.

## Out of scope

- Making the explorer's rows and the switcher's list agree sooner: the explorer lists what's on disk that the walk
  hasn't given (VV-D8) by design, and the switcher lists the graph's notes, which the watcher's batch brings.

## References

- Delivers: `blueprint/design/testing.md` § Strategy ("A test waits for a condition, never a fixed time").
- Rests on: VV-D8 (the explorer's rows from the disk); T13 (the check, #10); T23 (flaky tests fixed at their cause).
- Tests: the terminal checks "peek backlinks: a vault a widened search opened first, …"
  (`tests/terminal/checks/peek-backlinks.ts`) and "watching: a note an agent writes at the vault's top …"
  (`outside-and-code.ts`); `tests/terminal-harness.test.ts`: "inSwitcher waits for the switcher's own row of a note,
  never the explorer's or a message's", "inSwitcher waits past 5 s, as any wait does".

## Log

- 2026-10-24: Read, the three failing jobs' logs (120880098097, 120880849326, 120881298049; kept in `tmp/issue/ci/`):
  each timed out in `open` (`check.ts:107`) called at `peek-backlinks.ts:805`, the last commands run `search.open,
  switcher.open`, the screen `index.md` still open, `by-name.md` in the explorer, the switcher closed. The switcher had
  been opened, `by-name` typed, enter pressed, and nothing opened.
- 2026-10-24: Read, the cause: the explorer and the switcher answer from different places. The explorer's tree lists
  what the disk has that the walk didn't give (`fromDisk`, `src/tui/workspace/explorer/explorer-disk.ts`; VV-D8: "a
  folder or file come since"), read again whenever the tree is remade for any reason. The switcher lists the graph's
  notes (`switcher.open`, `src/tui/actions/documents/actions-find.ts`: `a.graph.notes`), which a new file joins only
  when the watcher's debounced batch is applied (`VaultFeed.receive` → `applyToGraph` → `Graph.updateFile`). So
  `s.see("by-name.md")` says the disk has it, not that the graph does; on a loaded runner the batch lands after the
  switcher opened, the query matches nothing, and enter opens nothing. Whatever remakes the tree after the write (the
  search's answers, `git.ts`'s status, `listings.ts`, `peek.ts`) races the watcher's 120 ms debounce. `inSwitcher`
  (`check.ts`) was meant for this: it reopens the switcher until the list has the path.
- 2026-10-24: Read, the other checks: a scan of every run body for a note written and then opened by the switcher
  (`open(s, …)` or `ctrl+p` and the name typed; scripts in `tmp/issue/scan/`) finds this check alone. The rest that open
  a note they just wrote use `inSwitcher` (`vaults.ts`, `outside-and-code.ts`) or `:e` by its path.
- 2026-10-24: Ran, the check as it is on `dev` (dcf13c4), load 1–2 on 10 cores: failed 4 of 11 runs, each the CI screen
  (`tmp/issue/run-baseline.log`, `run-orig-x10.log`). So not only a loaded runner's: the window is the debounce.
- 2026-10-24: Ran, the race forced: `[watch] debounce_ms = 1500` in the check's config. As on `dev`, it failed 5 of 5
  (`run-orig-forced-x5.log`). With `open` replaced by `inSwitcher`, it failed 5 of 5 too (`run-fixed-forced-x5.log`), 19
  keys handled each time: one ctrl+p. `inSwitcher` asked `s.rowOf(path)` of the whole screen, and the explorer's own
  `by-name.md` row answered it. A note at the vault's top is the explorer's row by the same text; the other checks name
  paths in folders, which the explorer never shows whole. `vaults.ts`'s `far-link.md` is the one at the top: its tab and
  status line show `1 far-link.md ×` and `‹ far-link.md ›`, which the list's row form doesn't match.
- 2026-10-24: Codex couldn't take the challenge of the cause and the plan (its usage limit), so a fresh Claude reviewer
  did it. It agreed with the cause, ruled out home's walk (`~/notes` has `.slipbox/`, a vault), the feed held by git (no
  checkout there), the filter (another match would have opened another note) and lantern's catch-up (after the open);
  and found the same `rowOf` false match from the forced log. Taken: `Math.max(5000, WAIT)` as `until` has it. Not
  taken: it judged a unit test unneeded beside the forced check; each case here has both a unit test and a terminal
  check. Dropped on its advice: a scan of the checks for a note written and opened through `open`, brittle.
- 2026-10-24: The fix (`tests/terminal/check.ts`): `inSwitcher` matches the list's own row (its border, a space, the
  path: `│ by-name.md  By name`), never the explorer's; it waits 5 s or `WAIT`, whichever is longer (CI's terminal job
  sets 30 s); `open`'s comment says it's for notes the vault has. The check opens `by-name.md` through `inSwitcher`,
  enter and `opened`, with `debounce_ms = 1500` kept in its config as the regression: a revert to `open`, or to the
  whole screen's `rowOf`, fails it every time. `blueprint/design/testing.md` § The terminal tests: what a check waits
  for is what its next key needs.
- 2026-10-24: Ran, with the fix and the force: the check 5 of 5 (`run-fix2-forced-x5.log`); 20 of 20 under load
  (`run-fixed-under-load-x20.log`), the peek's checks run four at a time beside it six times over (144 of 144,
  `run-load-peek.log`), the load average 6 to 17.6 on 10 cores (`load-samples.log`). The other checks that use
  `inSwitcher`: 6 of 6 (`run-inswitcher-users.log`).
- 2026-10-24: Tried live, this worktree's slipbox on a scratch reference set (`tmp/issue/live/`, `debounce_ms = 3000`):
  a note written into `notes/`, the switcher opened at once: `no matches`, 91 notes; 3 s later, 92, the row `│
  live-two.md  Live two`. With the tree remade first (the explorer focused, hidden files shown and hidden): the explorer
  lists `live-four.md` while the switcher says `no matches`; enter there leaves `index.md` open, the CI screen; after
  the batch, the row is listed and enter opens it.
- 2026-10-24: The tests. A unit test (`tests/terminal-harness.test.ts`, "inSwitcher waits for the switcher's own row of
  a note, not the explorer's, and past 5 s"): a fake switcher beside an explorer row of `by-name.md` that lists the note
  only 5.5 s on. A terminal check of the live try (`outside-and-code.ts`, "watching: a note an agent writes at the
  vault's top …"): written, the tree remade by `:hidden` twice, opened through the switcher once it lists it; 5 of 5.
  Undone once (`tmp/issue/mutate/`): the whole screen's `rowOf` fails the unit test (returned before the note was
  listed) and both checks, 3 of 3 each; the 5 s deadline fails the unit test (`the switcher to list by-name.md`).
- 2026-10-24: Review, round 1, of the pull request (#71): `/code-review`, and a fresh Claude reviewer for the second
  independent review, by the maintainer's choice that Codex isn't used from now on.
- 2026-10-24: Round 1's findings, each checked against the code:
  - taken: the race not certain in the two checks: on a loaded runner the steps before the switcher (the watching
    check's two `:hidden`) could outlast 1.5 s, the batch first, and a regressed `inSwitcher` pass; `debounce_ms` is
    3000 in both now (both reviews);
  - taken: the row match still read the whole screen, so a message's box (its border and a space before its wrapped
    text) or a table cell could answer it; `switcherListed` (`check.ts`) reads only the rows between the switcher's
    title and its bottom border (`└─… 1/2 ┘`), and `vaults.ts`'s `switcherLists`, which read the whole screen with
    `rowOf(path)`, asks it too (both reviews);
  - taken: the unit test leaned on `SLIPBOX_TERMINAL_WAIT` (5.5 s listed against a deadline of `Math.max(5000, WAIT)`,
    500 ms of margin, a 30 s bound of its own): split in two, the row's listed at 300 ms, a message's row beside the
    explorer's; the deadline's listed at 6.5 s, run only where `WAIT` is 8 s or more, bounded by `WAIT` and 10 s;
  - taken: this Log's session details trimmed; the peek check's wait for the explorer's row says why it stays (the false
    sign on screen, which the regression needs);
  - not taken, not real for the callers: enter opens the selected row, not `path`'s, so `inSwitcher` returning on any
    row of it could open another; each query matches only its note, and another note opened fails `opened`, never passes
    it. `inSwitcher`'s comment says a query must match only `path`;
  - not taken: the design file changed under a task (D223: a small change goes through an issue and one pull request
    that changes the design file with the code); a `literal` exported for the other copies of the escape (out of scope);
  - not taken, a question for the maintainer: the explorer lists a note the switcher can't open yet, for the watcher's
    debounce (120 ms) and longer on a loaded machine. The explorer's disk rows are VV-D8's; making the switcher read the
    disk too is a change to what users see, a follow-up issue if wanted.
- 2026-10-24: Ran, after round 1's fixes: the unit tests 2 of 2, and undone once (`tmp/issue/mutate/unit2.log`): `dev`'s
  `rowOf(path)` and round 1's whole-screen pattern each fail both, the 5 s deadline fails the second; the two checks 5
  of 5 each; every check using `inSwitcher` or `switcherLists`, 9 of 9.
- 2026-10-24: CI on cfba6ca: `terminal (ubuntu-24.04-arm)` failed one check, "links: a note too big to index, through
  a link followed, typed into and saved …" (`vaults.ts`), which uses nothing changed here but `opened`, its pattern the
  same: after `escape`, `:w` went as other keys (the commands `palette.open, note.save, help.report`, still in INSERT),
  an escape read late. It passed on `ubuntu-24.04` and `macos-15`. Not filed before; not this task's.
