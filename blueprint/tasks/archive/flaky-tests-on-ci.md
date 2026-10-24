---
status: done
assignee: claude-6
blocked_by: []
related: [T21, T22]
tracker: [gh:#6]
created: "2026-10-24"
---

# T23: The tests that fail at random on CI's runners, each fixed at its cause

Issue #6 lists tests that failed on CI's runners (mostly macOS) and passed when their job was run again. Find which of
them still fail on `dev`, which new ones CI has seen since, and fix each at its cause: a race in slipbox, or a test
that asks more than slipbox promises.

## Description

The issue's list is from the repository before it was restarted (2026-10-22), and several of its tests were fixed since
(in the old repository, and by #44 and #45). CI's runs since the restart are the evidence of what still fails: every
attempt of a run that failed or was run again, its failing tests, and whether the change under test reached them. For
each test still failing: the cause named with evidence, the failure forced (a bad order, a name, a slowed machine) and
shown before the fix, and gone after.

## Acceptance criteria

- Every test the issue names, and every one CI has seen fail since the restart on a change that didn't reach it,
  accounted for in this Log: fixed before, gone with its runner, another issue's, or fixed here.
- Each fixed here: its cause named; a test that fails without the fix (checked by undoing it once); the fix at the
  cause (slipbox, when it's slipbox's race), with a terminal check where slipbox changed.
- `blueprint/design/testing.md` still true of the tests; the design, the docs and the changelog where slipbox changed.

## Out of scope

- Tests other changes own: #39 (the export window's places); the link list's (`a link's target that matches nothing
  …`), fixed by #49 (`zz`) and #54 (`to`, open).
- Speeding up the search index of a big note (the kitchen-sink check's 3 s, seen only on `macos-15-intel`, a runner CI
  no longer has).

## References

- Delivers: `blueprint/design/testing.md` § Strategy ("A test waits for a condition, never a fixed time"; "Flaky tests
  are fixed, or quarantined by name; never retried"); `blueprint/design/tui.md` § Commands run by your shell (D?1).
- Rests on: D239 (a pull request runs what its change reaches); D155 (25.7, commands run by your shell); T21, T22 (the
  checks' `panelFocused`, the checks' screen keeping a character cut across reads).
- Tests: `tests/tui.test.ts` ("a file's linters: findings beside their lines as it opens …", ":%!, :.!, :N,M!, and !
  on a selection …"); `tests/core.test.ts` ("merged (a window's, D?1): …"); `tests/clipboard-async.test.ts`
  ("clipboard timeout falls back …"); `tests/tool-process.test.ts` ("a helper in a session of its own …"); the terminal
  check "shell: :!cmd's window lists what a command writes to its errors among its output, where it wrote it (D?1)".

## Log

- 2026-10-24: The issue's runs before 2026-10-22 are the old repository's, gone (as T22 found). The evidence here is
  CI's 100 `ci` runs since the restart (`gh run list --workflow ci`): every attempt of the 19 that failed or were run
  again, its logs (`gh api …/runs/<id>/attempts/<n>/logs`), every `(fail)` and `✗` line. Kept in `tmp/issue/ci/`.
- 2026-10-24: Read, the issue's list against the code on `dev` (390000c):
  - fixed before the restart, in the code now: signature help; the breadcrumb's anchor; the merge's relink; the
    config checks; `a long paragraph wraps in linear time` (`tests/render.test.ts`, counts the spans read, no clock);
    the headless terminal's `run` (`tests/terminal-harness.test.ts`, waits for an end marker, not a quiet); the
    servers' crash test (`tests/servers.test.ts`, `when` waits on what the server says, a 120 s backstop);
  - fixed by #45 (T22): `git: source control … nothing staged`;
  - seen only on `macos-15-intel`, a runner CI no longer has (`.github/workflows/ci.yml`: ubuntu-24.04,
    ubuntu-24.04-arm, macos-15), and not seen since the restart: kitchen-sink's keys within 3 s, `links: next and
    previous … alt+arrows`, `editing: motions`, `reading: samples: the agent replay`. Not shown fixed: their runner
    is gone. Kitchen-sink's cause, the search index of a 6 MB note in one step on the main thread (#6's comment), is
    still in the code (`IndexJob.step`, `src/core/search.ts`: its budget checked between batches of 100 files).
  - not seen since the restart, unexplained: `the change list: … g i` (macos-15 twice, before). `g g` is no prefix
    (`src/tui/keys.ts`), so no timer can run it late (`dispatchMapped`, `src/tui/input.ts`: one only for a sequence
    both bound and a prefix), and the check still sends `g g g i` (`tests/terminal/checks/editing.ts`).
- 2026-10-24: Ran, the failures since the restart (`tmp/issue/ci/failures.txt`), each against the change it ran on:
  - the change's own check or test, failing while it was written: `peek backlinks` (#10), `home: before its first
    walk` (#16), `git panel: a file gone for good` (#14), the rename checks and test (#11), the coverage test (#13);
    the opentui bump's hand-off checks (#1, a real break, on every runner);
  - before #45 merged, a character lost from the screen as T22 found: `roots: where a file is` on `dev` (1a41c98,
    run 40034729256: the peek's title `Elsewhere  /private/…`, its `›` gone), `links: a symlink out of the vault`
    (a11a658: the status line `‹ shelf/far.md    ⚠`, its `›` gone); `git: source control` (#14's, #18's branches).
    Each ran on a commit without 8e2188f (`git merge-base --is-ancestor`);
  - `Elsewhere: a note just looked at …` (1778b4b), waiting for `— not editing`: a check #13's commit adds, not on
    `dev` (`git log -S`), so #13's own;
  - #39's: `the window's places …` (ubuntu, twice);
  - still failing on a change that didn't reach it, after #45:
    - `a link's target that matches nothing keeps its list while typed` (`tests/tui.test.ts`; macos-15, two
      branches, #17's and #16's): `[[zz` expected to match nothing, but each item's `filterText` holds its
      absolute path, and both runs' temp folders had `zz` in their random names (`two-dG0Zz7`, `two-ZaqzzC`). The
      test's, not slipbox's.
    - `clipboard timeout falls back …` (`tests/clipboard-async.test.ts`; macos-15, #10's branch): 2617 ms against a
      2500 ms bound, for a helper stopped at 1 s (`src/core/clipboard.ts`, the timer starts after the spawn).
    - `linters without a server (19.19) > a file's linters …` (`tests/tui.test.ts`; macos-15, #11's branch): waits for
      two linters' findings, then expects the third's "not found" at once. Each linter's result lands on its own
      (`ensureLinters`, `src/tui/languages.ts`), and a missing one is known only when its shell exits 127
      (`runLinter`, `src/core/servers/linters.ts`): it can come last.
    - `commands run by your shell (25.7) > :!cmd …` (`tests/tui.test.ts`; macos-15, #14's branch): `err` listed after
      `c1.md`. Standard output and error are two pipes (`runShell`, `src/core/shell.ts`), and the command writes `err`
      then `c1.md` with no pause between: which comes first is which pipe slipbox reads first.
    - `a tool's process group > a helper in a session of its own …` (`tests/tool-process.test.ts`; macos-15,
      0.5.1-next, #6's last comment): 4434 ms against 2500, for a run stopped at 420 ms (deadline, grace, cutoff).
    - `pictures (12.x) > … the oldest of more than 48 let go` (`tests/tui.test.ts`; ubuntu-24.04, #16's branch,
      once): no picture let go. The test took 647 ms, so no 3 s paint deadline; cause not found yet.
- 2026-10-24: The unit tests among them don't depend on #45 (it changed the terminal checks' harness alone), so when
  each ran against `dev` doesn't matter to them.
- 2026-10-24: Codex challenged the reading above. Taken: the Intel runner's failures are "not seen since, their runner
  gone", not fixed; the change list's is unexplained, not ruled out; the Elsewhere one needed more than a missing
  message (it turned out to be #13's own check). Its other points: the link list's match on the folders above the
  vault is a question of what slipbox should match, not only of the test; the shell's order can't be had from two
  pipes; the bounds need a reason, not just a bigger number; the picture test could be two pictures sharing an id.
- 2026-10-24: Ran, the link list's test with `TMPDIR` under a folder named `jazz`: fails every time, `[[zz` showing
  `todo.md` by its path. Reproduced.
- 2026-10-24: Ran, the picture test 150 times, each its own process, on one CPU (`taskset -c 0`): 150 passed. And
  two of 49 pictures sharing an id, simulated with the test's names (`pictureId`, `src/tui/placeholders.ts`, 24 bits):
  19 runs in 200,000, about 1 in 10,000. Possible, unlikely; left unexplained, the test unchanged.
- 2026-10-24: Ran, the change list's check 20 times, 2 at a time: 20 passed.
- 2026-10-24: The maintainer decided, asked: the link list's test fixed in the test, slipbox's matching unchanged (it
  narrows by the full path, design/tui.md § What's under the cursor); `:!cmd` through one pipe in slipbox (D?1); the two
  time bounds by the state they guard, with a wide margin; a diagnostic on CI's runners (draft #51).
- 2026-10-24: Codex's critique of the plan, taken: the linters' missing one held until the test has seen the others'
  findings and checked its message isn't there yet (released when the other two return, all three could still land
  before the test looks); no sleep to force two pipes' wrong order — the errors' place in standard output is the
  deterministic check; the merged run tried with a shell whose path has a space, `$SHELL` unset, an exit, a signal, a
  stop, and a filter's lines kept free of its errors; the clipboard's helper seen killed through its pid, not only
  absent.
- 2026-10-24: Fixed, linters 19.19: the test waits for the missing linter's message too. Its run is held (`spyOn` on
  `runLinter`) until the other two are shown and its message checked absent, so the order CI met is the order tested
  every run. Ran: passes; undone (the message expected at once, as before): `Expected: 1, Received: 0`, CI's failure,
  every run.
- 2026-10-24: Fixed, the two bounds (testing.md: "a timeout that must stop something, bounds it with a wide margin"):
  - clipboard: the helper lives 20 s and writes its pid; the copy falls back under 10 s (half the helper's life, ten
    times the 1 s stop), the helper's group seen gone, its `finished` never written, the group killed in `finally` if a
    failure left it. Undone (the copy's stop at 30 s): 20013 ms against 10000, failed.
  - process group: under 10 s, halfway between the 0.42 s stop and the helper's 20 s; `alive(helper)` already says the
    run didn't wait for it. Undone (the cutoff at 100 s), with `--timeout 30000` as `bun run test` runs: 20028 ms
    against 10000, failed on the bound, not on the runner's timeout.
- 2026-10-24: Fixed, `:!cmd` (D?1): `runShell` takes `merged`, which `shellRun` passes and the filter doesn't. Ran: the
  core test (errors in standard output where written, 50 lines by turns, a shell with a space in its path, `$SHELL`
  unset, exit 3, SIGTERM, a stop), the TUI's shell tests (the filter's lines without its error added): pass. Undone
  (`merged` ignored): the core test fails on the errors' place; the new terminal check fails 10 of 10, its window's
  rows `8, 12, 9, 13, 10, 14, 11, 15` — every output line first, then every error, the bug as users see it on Linux.
  With the fix the shell checks passed 20 of 20, five times each, 2 at a time.
- 2026-10-24: Tried live, on a scratch home (`bun scripts/build-home.ts tmp/issue/home`, its own `HOME` and XDG
  folders), `:!for i in 1 2 3 4; do echo out$i; echo err$i >&2; done`: the release (0.4.1-preview) listed `out1`–`out4`
  then `err1`–`err4`; this branch, `out1 err1 out2 err2 …`. Its neighbours on this branch: `:!echo a; ls nosuchfile;
  echo b` lists the error between `a` and `b`; `:7!echo warn >&2; tr a-z A-Z` makes the heading `# SAM'S NOTES`, no
  `warn` in the note, `u` undoes it; a command stopped from the palette ends `stopped (SIGTERM)`, its `started` and
  `oops` in order, nothing of it left running.
- 2026-10-24: The link list's test: #49 (merged while this was worked) made its `zz` a `z~`. The test still failed when
  `to` was in a temporary folder's random name (its "then fewer" step), seen here once in four runs; reproduced with
  `TMPDIR` under a folder named `to-tod`. A fix was written (the expectations as ranking the whole list gives them,
  `~` past a match, the vaults under `jazz-…`), then dropped: #54, open, fixes the same case its own way (`todo.m`,
  keeping "then fewer"), on the same lines. Not taken, so the two don't clash.
- 2026-10-24: Ran, #51 on `dev` (390000c, before #49), each about 100 times, three at once (run 40046293128):
  pictures, linters and `:!cmd` 100 of 100 on macos-15 and ubuntu-24.04; the change list's check 100 of 100 on both;
  the link list 1 failure on macos-15 and 3 on ubuntu-24.04, every one at "then fewer" (`to`, #54's case). Alone, the
  linters and `:!cmd` don't fail: what made them fail on CI was the load of the whole suite beside them. The run after
  the fixes was skipped: those two are deterministic now, shown by undoing them; the pictures and the change list
  unchanged. #51 closed, its branch deleted.
- 2026-10-24: The pictures' test and the change list's check stay as they are, unexplained: no failure in 250 and 220
  runs here and on CI, one failure each seen (the pictures', once in the whole suite on ubuntu; the change list's, twice
  before the restart). Not quarantined: testing.md's quarantine is for a test known to fail at random, and neither has
  been seen to since. Their next failure is noted on #6 with its run and log. One mechanism found for the pictures': two
  pictures sharing an id (24 bits, about 1 run in 10,000 for its 49), which would also draw the wrong picture in use;
  left as a follow-up, as it can't be shown to be the cause. Taken as recommended while the maintainer was away.
- 2026-10-24: Review, round 1, of the branch's first commit: `/code-review`, and in Codex's place a fresh Claude
  reviewer — Codex's part skipped, its usage limit reached (a menu in its pane at the prompt).
- 2026-10-24: Round 1's findings, the two reviews consolidated, each verified:
  - Real, the docs and D?1 claiming the window shows a command's lines "as a terminal shows them" (both): ran,
    Python's `print("out")` then `print("err", file=sys.stderr)` comes back `err`, `out` through one pipe, its output
    held back while it isn't writing to a terminal. Reworded: in the order the lines reach the pipe; a terminal of
    its own for each command added to D?1's Not chosen.
  - Real, a character cut across two reads decoded as two replacement characters (code-review): ran, an em dash
    printed in two writes came back `��`, merged or not, on either stream — older than this change, and a filter
    puts it in the note. Fixed: each stream decoded as a stream (`setEncoding`). Taken in, so the scope grew.
  - Real, a failed filter's window lists its output and errors as read (both): by construction, its two pipes.
    Said so in the design and D?1; a filter's lines must stay its standard output alone.
  - Real, merged, every chunk kept twice, in `output` (2 MB) and `stdout` (32 MB), the second read by nothing
    (code-review). Fixed: merged, `stdout` is `output`.
  - Real, the clipboard test's `finished` could never be written within it, and its pid check was skipped when no
    pid came in a second (code-review). Fixed: the helper's own command line, in `ps`, seen gone.
  - Real, a pid the tool didn't print reads as 0, and `reap(0)` signals the test runner's own process group
    (`tests/tool-process.test.ts`, the second reviewer): by reading, `process.kill(0, …)` is the caller's group.
    Fixed: `reap` never signals a pid that isn't positive, and the tests ask for the pid first.
  - Real, a slow linter keeps the others' findings off the screen until it has answered (the second reviewer): the
    layout reset and the frame asked for came after `Promise.all`. Fixed: each linter's answer drawn as it lands;
    a unit test and a terminal check.
  - Real, the core test's stop could pass before the shell had started its sleeps, and only the terminal check
    showed `shellRun` passing `merged` (the second reviewer). Fixed: the stop once both sleeps run, both seen gone;
    a TUI test of 20 lines by turns through `shellRun`.
  - Taken from the second reviewer over code-review's: `/bin/sh` by its path, not `sh` from `PATH`, as the shell's
    own fallback is; and on macOS a `DYLD_*` variable doesn't reach the command through `/bin/sh`, in D?1's Cost.
  - Not taken: `merged` derived from `input` (code-review) — a window's run and a filter's are what D?1 tells apart,
    said where they're started; the `D?1` placeholder (code-review) — numbered when merged, as the brief says; the
    bounds "patching the symptom" (code-review) — testing.md's wide margin for a timeout's test, and neither test is
    about latency (why the timers ran late on CI's macOS, the whole suite in one process, is not known); a
    successful filter's errors not shown (code-review) — as before this change, the design's choice; `SHLVL` one
    higher under `/bin/sh` (both) — nothing reads it.
- 2026-10-24: Round 1's fixes, each undone once: stream decoding off, the cut em dash fails; the redraw only after
  all, the linters test fails on the layout and the frame not asked for; the clipboard's kill off, its helper is seen
  still running; `shellRun` without `merged`, the 20 lines by turns fail; the stop signalling the shell alone, the
  sleeps are seen left. The new terminal checks pass (the shell's 5, the linters' 1); the linters' check passes with
  its fix undone too — opening the file, other work draws the screen within a second — so the unit test is the one
  that fails without it, and the check covers the case.
- 2026-10-24: Review, round 2, of the branch after round 1: `/code-review`, and a fresh Claude reviewer in Codex's
  place (Codex still at its usage limit's menu). Consolidated, each verified:
  - Real, the clipboard test found the helper's shell by its path but not the sleep it started, so a kill of the
    shell alone passed (both): by reading, the sleep's command line holds no path. Fixed: a sleep of a length this run
    alone has, found too; `ps -ww` so macOS's never cuts the line. Undone (the shell killed, not its group): fails.
  - Real, the core test's sleeps counted across the machine, where other worktrees run the same test (the second
    reviewer). Fixed: a length this run alone has. Undone (the stop signalling the shell alone): fails.
  - Real, a linter its project no longer asks for: its findings dropped, no redraw asked (both). Fixed: every path
    through a linter's run ends in the same redraw (`finally`); the linters test, undone, fails.
  - Real, older than this change: a filter's output stopped at the window's 2 MB, not its 32 MB — one flag, set by
    either, and a filter refusing on it — and a last piece past the window's limit cut it silently (the second
    reviewer). Ran: `:3!head -c 2200000 … | fold -w 100` was refused, "its output cut short". Fixed: each limit its
    own flag (`truncated`, `stdoutTruncated`), set by the length kept. Tests: the core test (a filter's 3 MB whole; a
    last piece past 2 MB said cut), the TUI's filter test (2.2 MB put in), the terminal check "shell: a filter puts in
    more than a window shows …"; each fails with its fix undone. Taken in: the scope grew again.
  - Real, the linters test's stand-in `requestRender` left in place by a failure, and the linters check's comment
    reading as if it were the regression test (both). Fixed.
  - Taken: `program` and `args` as plain constants, no `!` (code-review).
  - Not taken: `D?1` numbered now (code-review) — at the merge; one helper for the "lay out this buffer's views again
    and ask for a frame" loop that about fifteen places repeat (code-review) — a refactor beyond this change, left as a
    follow-up.
- 2026-10-24: Added, from the main session: `links-and-files: view: a worktree kept outside the view chosen …` failed
  on `macos-15` (run 40083598491, b0a508d), as after #34, passing on reruns: `docs/ under each of the two` asked the
  moment kestrel's row was listed, but kestrel's own folders come a read later on the listing threads
  (`src/tui/listings.ts`), and macOS's screen had kestrel with none. Fixed in the check: it waits for them, as it
  waits for kestrel. Ran: 20 of 20 passed here before (not reproduced), 10 of 10 after.
- 2026-10-24: Review, round 3, the last (the maintainer's cap), of the branch after round 2: `/code-review` and a fresh
  Claude reviewer (Codex still at its limit). The Claude reviewer found nothing real. Consolidated, each verified:
  - Taken, robustness: a linter run that threw would have left the file's run "running" for good, so it was never
    linted again (code-review): `Promise.all`'s rejection skipped the cleanup. No way for a run to throw is known; the
    run now waits for every linter to settle (`Promise.allSettled`), and the last redraw, made already by each
    linter's own, is gone. Test: "a linter whose run throws ends that run all the same: …" (a run made to throw);
    with `Promise.all` back, it fails. No terminal check: an exception inside a run can't be made from outside.
  - Taken: the clipboard test's `ps` lines matched by their end, not anywhere in them (the Claude reviewer): another
    run's sleep whose length starts with this run's digits would have matched.
  - Not taken: `/bin/sh` needed even with `$SHELL` set (code-review) — slipbox's platforms (Linux, macOS, WSL) have
    it, as the shell's own fallback already assumed; the linters check's 15 s bound "never failing" (code-review) —
    on CI every wait is at least 30 s (`tests/terminal/session.ts`), where the bound is what fails; a cut window's
    last character possibly half a surrogate pair (code-review) — cosmetic, in a window already said cut short; the
    2 MB and 32 MB limits counted in UTF-16 units, not bytes (code-review) — as before this change, left as a
    follow-up to say or change; `D?1` (code-review) — numbered at the merge.
- 2026-10-24: Follow-ups, not in this pull request: the limits' unit (bytes or characters, said in the design and the
  docs); one helper for laying a buffer's views out again and asking for a frame (about fifteen copies); the
  pictures' ids able to collide (24 bits); a successful filter's errors shown nowhere.
- 2026-10-24: Done, after three rounds of review: every acceptance criterion met (each test accounted for above; each
  fix with a test that fails without it; the design, docs and changelog where slipbox changed). Moved to `archive/`;
  the merge is the maintainer's acceptance.
