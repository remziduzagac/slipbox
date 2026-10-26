---
status: done
assignee: claude-15
blocked_by: []
tracker: [gh:#15]
created: "2026-10-23"
---

# T18: The spell checker's thread test counts the main thread's turns, not their gaps

The test that the main thread keeps its turns while the spell checker's thread builds a dictionary compares two
durations, and fails on a loaded machine; it comes back from quarantine counting instead.

## Description

`tests/tui.test.ts` has the spelling tests (`25.6`). One of them, "while the thread builds a dictionary, the main thread
keeps its turns (#40)", ticks the main thread every 2 ms while a 9 MB Turkish dictionary loads and asserts that the
longest gap between ticks is under half the loading time. On a loaded machine it fails: the 0.4.0 release build's
Linux tests had a 605.5 ms gap against 315.8 ms. It is quarantined on `dev` (`test.skip`, `// quarantined: #126`) until
its turns are counted, not timed. design/testing.md § Strategy forbids loosening the assertion, so it needs a measure
that a busy machine can't fail and that still fails if the main thread is held while the dictionary builds.

## Acceptance criteria

- The quarantined test is back (no `test.skip`, no `quarantined:` comment), measuring a count, not comparing two
  durations, and passes on a machine slowed to one CPU (`taskset -c 0`) as well as unloaded.
- It fails when the main thread is held for the build (checked once by holding it on purpose).
- design/testing.md still holds; it says what changed if the test's way of measuring is described there.

## Out of scope

- What the spell checker's thread does (D232): unchanged. It gains only a hold a test can ask for (`holdBuild`), which
  nothing but a test sends.
- The other quarantined or timed tests.

## References

- Delivers: design/testing.md § Strategy (flaky tests fixed, or quarantined by name; never retried).
- Rests on: D232; D262 (a test holds the spell checker's thread); design/tui.md (spelling on its thread); D223 (a small
  design change: an issue and one pull request).

## Log

- 2026-10-23: Valid, in this form: on `dev` the timed assertion no longer fails a run, as it's quarantined
  (`tests/tui.test.ts`, `test.skip` under `// quarantined: #126`, "back once its turns are counted, not timed"); its
  other half, the dictionaries the main thread built counted (`dictionariesBuilt`), is a test of its own and passes.
  So the fix is to bring the quarantined test back, counting.
- 2026-10-23: Tried to reproduce it, un-skipped locally with its gaps logged (10 CPUs). The test alone: longest gap
  20–28 ms of a 500–690 ms load. On one CPU (`taskset -c 0`): 40–137 ms of 450–920 ms. On one CPU shared with three
  busy loops: 220–372 ms of 2.2–3.3 s; the whole spelling block that way, 63–248 ms of 1.2–1.5 s. Always passes.
- 2026-10-23: Is it the machine, or the process? The timing records nothing on the thread's side. A suspect: the App's
  lazy listener (`src/tui/app.ts`, `onLoaded`), removed only on quit, which a test's App never does, so hundreds pile
  up late in a test file. Measured with N harnesses created just before the timed window (the
  build asked directly or by `space u s`): 0, no gap; 300, 76 ms; 1000, 140–214 ms, at the window's start. Not the
  listeners: one event in the window (the dictionary), about 8 ms for 1000 Apps. Not a collection of the main thread's
  heap: JSC's GC log (`BUN_JSC_logGC=true`) shows 18 ms and 4 ms ones in the window (800 MB heap). Mostly not the main
  thread's own work: its CPU time over the load rose by about 30 ms for a 180 ms gap. Not the build: with the thread
  held at a named pipe before Hunspell's call, the gap came while it was held (66 ms), none during the build. And not
  the request: with the other spelling tests run between the 1000 harnesses and the window, on one CPU, no gap (9 ms
  of a 200 ms load). So it follows the harnesses' creation; what it is wasn't found. Which held CI's main thread can't
  be told from here (the timing records nothing that would say); what's shown is that the test process alone can hold
  the main thread through much of a load the thread builds.
- 2026-10-23: A count, bounded by nothing but the test's timeout and the thread's own deadline: the dictionary's `.dic`
  a named pipe, so the thread, loading it, waits for its words; the main thread takes its turns there (timer ticks,
  keys typed and answered, frames drawn, the dictionary still not there) and only then writes them; the marks follow.
  Prototyped: the thread opened the pipe 34 ms after `space u s`, the main thread typed eight keys meanwhile, the words
  fed at 97 ms, the dictionary built by 399 ms.
- 2026-10-23: The pipe, over a heartbeat counted while the dictionary loads (as `tests/syntax-worker-tui.test.ts`
  does): ticks before a build on the main thread would pass that, and a hold covering the whole load would fail it.
  The gate is "the thread inside the dictionary's opening, waiting for its words", not "building": the read comes
  before Hunspell's call. No FIFO open on the main thread, where an open left pending (its reader gone) could hang the
  run; the turns counted from the moment the thread is in; the marks checked after the feed. So the pipe's writer is
  a child process (`bash`): it opens the pipe, which waits for the thread, says "open", and writes the words when
  told; killed and waited for in `finally`, and the spell thread stopped there if the words were never written (it
  may sit at the pipe, or reach it later with no writer, and hold the next tests' requests).
- 2026-10-23: Live, this worktree's slipbox on a scratch copy of the reference set (`okuma-notlari.md`,
  `lang: [tr, en]`), its Turkish dictionary pointed at a named pipe (`SLIPBOX_CONFIG`): spelling on, keys moved the
  cursor, no marks, `] s` said "spelling: its dictionaries are loading"; the pipe fed from the shell, and only `kitpa`
  was marked (not in the code span). The first try held the pipe over 20 s: the thread's deadline ended the load,
  "spelling: tr's dictionary didn't load (worker request deadline exceeded)" was said, and the note was checked in
  English alone, its Turkish words marked: as designed (`src/core/foundation/workers/worker-requests.ts`, D232). A load
  that fails is
  now covered by a test (said once, the other languages still checking), by a read the thread fails on; the deadline
  itself and the thread started afresh are `tests/worker-requests.test.ts`'s. The saved spelling setting was put back
  off afterwards.
- 2026-10-23: Done in `tests/tui.test.ts`: the quarantined test replaced by "while the thread loads a dictionary,
  the main thread keeps its turns: counted, the thread held at a pipe (#40)" (`turkish(true)` makes the pipe; skipped
  on Windows); and "a dictionary the thread can't build is said once; the note's other languages still check it" (its
  `.dic` a folder), for what the live try found. design/testing.md § Strategy says how such a test counts.
- 2026-10-23: The writer's bounds, settled after review. A backstop under the test's timeout (10 s at first) would fail
  a passing run whose main thread was merely starved that long; one past it (40 s, with the default 30 s) lets the
  timed-out test's body resume later, during another test, and stop the spell thread under it. And Bun's own timer
  can't end a writer if the main thread is held. So: the test's timeout is 60 s; the writer writes the words untold
  after 40 s (`read -t`, its own clock, for a held main thread); Bun kills it after 50 s (`timeout`, for a thread that
  never opened the pipe). Every way out lands inside the test, and none before a passing run would have failed anyway.
  When the words were never written, `finally` also lets go of a reader stuck at the pipe (a writer opened non-blocking
  and closed: it reads no words), as stopping the thread can't interrupt its read.
- 2026-10-23: Mutation-checked, each alone, the file restored (a script outside the repository). The dictionary built
  on the main thread (`openDictionary` calling `openSpeller`): the counter test fails, and the new one at 40 s, on its
  assertion (`misspelt()` was `[]` when it should still have been loading). The main thread held until the thread has
  built (`Bun.sleepSync(45_000)` in `openDictionary`, past the 40 s): the new one fails at 45 s, on its assertion ("no
  misspelt words here" where "its dictionaries are loading" was due), the counter test only at its timeout: the case
  the timed test was for. With a 10 s backstop, a 12 s hold had shown the same split; with 40 s it passes, as it
  should: it ends while the thread still waits, and the main thread then takes its turns. The thread never opening the
  pipe (the load never started): the new test fails at 50 s, on "open". A failed load said at every frame, or said
  otherwise: the said-once test fails. Failing before the thread reached the pipe: the next spelling test took 127 ms;
  without the cleanup, 20 s (behind the stuck request's deadline). No writer left running after any of them.
- 2026-10-23: Robust: alone, 588 ms; the three spelling tests five times on one CPU shared with three busy loops, all
  pass (about 1.1 s); after 1000 harnesses on one CPU, three runs, pass; the whole spelling block, 7 pass. The old
  timed assertion, run beside it after the 1000 harnesses, passed too (longest 44–108 ms of 234–426), so it wasn't seen
  failing here: CI's two failures are its evidence.
- 2026-10-23: Review, not taken: (1) restore a check that no finite main-thread stall happens during the load, and
  count turns during Hunspell's call itself. A clock is what can't tell slipbox's stall from the runner's, and a count
  during the call depends on scheduling the same way; the two tests hold what D232 decided (the build is the thread's,
  and the main thread doesn't wait for it), and a main thread touching the dictionary's words at all waits at the pipe
  and fails. (2) Quit every harness at a test's end, the stall's suspect: the hold's cause isn't established, and it's
  a change to the whole test file's lifecycle, beyond this task. (3) Drop the timer ticks, since reaching the checks
  proves the event loop ran: kept, as they show timer turns whatever `h.keys` resolves through.
- 2026-10-23: CI on the pull request, the whole of `tests/tui.test.ts` (late in the file, where the timed test failed):
  the new test passed on macOS (654 ms) and Linux (481 ms), the pipe and `bash`'s `read -t` working on both.
- 2026-10-23: The pull request's diff reviewed again, each finding checked:
  - Verified, fixed: nothing checked that the thread was held until "go". The writer's `;` wrote the words on a
    timeout, or on its input closing early, and the "still loading" checks could pass anyway while the build ran. The
    writer now says "told" or "untold" before writing, and the test asserts "told": with its input closed early, the
    test fails ("untold"). Writing "go" to a writer already gone threw EPIPE and hid that; it's caught, and the line
    read says why.
  - Verified, fixed: `bash` could print before "open": `BASH_ENV`, and `~/.bashrc` when its input is a socket (Bun's
    pipes are) and `SHLVL` is unset. With both echoing (`HOME` a scratch folder, `SHLVL` unset) the first line was
    "hello-from-bashrc" and the test failed; with `--norc --noprofile` and `BASH_ENV` left out of its environment, it
    passes.
  - Verified, fixed: design/testing.md gave the held thread as the rule, where most turn-counting tests count a
    timer's turns while work is pending (`tests/syntax-worker-tui.test.ts`, `tests/diagrams.test.ts`,
    `tests/regex-jobs.test.ts`, a slow `git`'s history in `tests/tui.test.ts`). It now says both.
  - Verified, fixed: a passing run left this test's 9 MB dictionary built in the shared thread for the rest of the
    process. The thread is stopped in `finally` whatever the outcome; the reader at the pipe is let go only when the
    words weren't written.
  - Rejected: a reader reaching the pipe after the cleanup's one attempt to let it go. Bun's `terminate` takes effect
    between two blocking reads: a worker terminated while blocked reading one pipe stopped after it and never opened
    the next; without `terminate` it did, a reader there (a standalone try). What's left is the instant inside the
    open call itself, after the test has already failed.
  - Rejected again (as above): a finite stall of the main thread during the load passes (3 s here, as 12 s before).
    Only a clock sees one, and the clock is what failed.
  - Then: the spelling block, 7 pass, under `nice` at a load of 38; the spelling terminal checks, 2 of 2. No product
    code changed, so the app's live try stands; the writer's changes were tried with the rc files above.
- 2026-10-23: The gate moved into the spell checker's thread: asked to (`holdBuild` in `core/spell-thread.ts`, the op
  `hold` in `core/spell-worker.ts`), the thread waits with `Atomics.wait`, once it has the request for the test's
  dictionary and before Hunspell builds it, until the test lets it go; the wait's state is in shared memory (set,
  waiting, let go, ran out). Its wait runs out after 40 s on the thread's own clock, so a main thread held until the
  dictionary is there is let go and fails, inside the test's 60 s. No child process, no named pipe, no blocking read
  to strand a thread, and it runs on Windows too: the `bash` writer, its environment, its output's reader and the
  pipe's cleanup are gone with it. The test asserts the thread was waiting, then "let go", not "ran out"; `finally`
  stops the thread before letting it go, so it doesn't build the dictionary on its way out.
- 2026-10-23: The pull request's diff, the pipe version, reviewed again; checked against the hold:
  - Gone with the pipe: the writer's environment (exported functions), its output's reader left open, killing the
    writer before stopping the thread (the thread building from an empty pipe).
  - Verified, fixed: the bounds' comment left out the request's 20 s deadline, which ends a hold first when the main
    thread is merely starved: it says so now. The ticks run only while the thread waits, not through the build.
  - Verified, fixed: the thread stopped first, then let go (the pipe's had the same order to fix).
  - Rejected: the task ought to be a workstream, the design file changing. A small design change goes as an issue and
    one pull request that changes the design file with the code (D223); this is that, recorded as a task.
  - Rejected: the test name's "(#40)" read as this repository's #40. Numbers in code are the repository's before it
    was restarted (the issue's own note), and the sibling test's name cites #40 the same way.
  - Rejected again: no count during Hunspell's call, nor of work the main thread might do after the answer comes (a
    big answer decoded there); and the harnesses' lifecycle, and the ticks, as above. A count during the call, or of
    the main thread's work afterwards, is a clock again.

- 2026-10-23: The hold, mutation-checked, each alone, the files restored. The dictionary built on the main thread:
  the hold still "set" when the dictionary is there, the new test fails at once; the counter test fails too. The main
  thread held until the thread has built (`openDictionary` yields once, then `Bun.sleepSync(45_000)`): the new test
  fails, its timer's turns not taken while the thread waits. Held at the moment it asks, with no yield: it fails on
  "ran out" (run alone; run after the counter test, which the same mutation holds 45 s first and fails, it passed once).
  The load never starting, the worker ignoring the hold, the test never letting go: each fails the new test. The
  said-once pair fails the said-once test. Failing early: the next spelling test took 255 ms; without `finally`'s stop
  and letting go, 21 s, behind the held request's deadline.
- 2026-10-23: Then, under `nice` on a machine at a load of 10 to 25: the spelling block, 7 pass; `core.test.ts`'s
  spelling, 10 pass; the spelling terminal checks, 2 of 2. Live, this worktree's slipbox on a scratch copy of the
  reference set: spelling on in `okuma-notlari.md` marked only `kitpa`, `] s` went to it, and `slipbox spell` printed
  `reading/okuma-notlari.md:8:14: kitpa`; the saved spelling setting put back off.
- 2026-10-23: The hold version's diff reviewed; each finding checked:
  - Verified, fixed: the said-once test passed in file order without the guard. English was already built, so the
    checker was made on the first frame after zz failed, and zz was asked about once whatever the guard did. Now
    English is a copy under the test's own path, held before it's built, and frames are drawn while it waits: with
    the guard removed, the test fails in file order (37 said, not 1).
  - Verified, fixed: one hold slot, matched by the words alone. A second hold replaced the first. Holds are now kept
    per dictionary, and a unit test holds two at once.
  - Verified, fixed: the states were numbers in the worker and a list's order on the main thread, tied by nothing.
    Both now read `HOLD_STATES` in `core/spell.ts`.
  - Verified, fixed: letting go after stopping the thread did nothing. Terminated while waiting, a worker doesn't
    resume (a standalone try: still "waiting" after the wait's limit, and after letting go). `finally` only stops it
    now, and `holdBuild` says that stopping the thread ends a wait, the dictionary unbuilt.
  - Verified, fixed: the counter test left its 9 MB dictionary built in the shared thread. It stops the thread when
    it ends, as the held test does.
  - Verified, fixed: the task's Out of scope said the thread was unchanged. It now says what the thread gains.
  - Taken in a lighter form: the 2 ms interval. One timer's turn, taken while the thread waits, shows the main thread
    keeps its timers: the hold is checked still waiting, and the dictionary still not there, after it.
  - Rejected: a stall of a few hundred milliseconds a frame while the dictionary loads passes (`Bun.sleepSync(300)` in
    the checker's wait). The old assertion's deletion goes against testing.md's "never deleted or loosened". As
    before: only a clock sees a finite stall, timings are the benchmark's (§ Timings) and not asserted, and the issue
    asked for a count.
  - Rejected: the hold could be a stand-in `Worker` on the main thread. Its clock would be the main thread's, so a
    main thread held until the dictionary is there would hang the run, where the worker's own clock lets it go.
  - Rejected: link the Turkish files rather than copy them. The test now runs on Windows, where a symlink needs a
    privilege and a hard link the same volume.
- 2026-10-23: Tests for every case (the maintainer's rule): a unit test and a terminal check each.
  - Keys answered while a dictionary loads, `] s` saying so, then marks: `tests/tui.test.ts` "while the thread loads a
    dictionary, the main thread keeps its turns…"; the terminal check "spelling: while a dictionary loads, keys are
    answered and ] s says so; let go, ] s goes to the misspelt" (`tests/terminal/checks/editing.ts`). In slipbox's own
    process, it holds the thread with a preloaded script, `tests/terminal/spell-hold.ts` (`BUN_OPTIONS=--preload`,
    `holdBuild`, a file to let go). This was the first live try.
  - A dictionary that won't load is said once, the other languages still checking: `tests/tui.test.ts` "a dictionary
    the thread can't build is said once…"; the terminal check "spelling: a dictionary that won't load is said once;
    the note's other languages still check it" (its `.dic` a folder, the messages list counted). This was the second
    live try's message.
  - The hold itself: `tests/core.test.ts` "a test's hold on the spell checker's thread…". It covers letting go, two
    holds at once, one already built never waiting, a wait running out (`limit`, 100 ms there), and stopping the
    thread ending a wait unbuilt.
  - The built dictionary's marks, `] s` and the CLI (the third live try): the existing checks "spelling: ] s and [ s
    go to a misspelt word…" and "settings: spelling on marks the misspelt…", and the counter test.
  - The case list: `examples/home/CASES.md` § ui names both new spelling cases. design/testing.md § The terminal
    tests says how a check holds slipbox with a preloaded script.
- 2026-10-23: The terminal checks, mutation-checked, each alone, the files restored. The dictionary built on the main
  thread, or the worker ignoring the hold: the held check fails, the thread never waiting. The said-once guard
  removed, or the failed load said otherwise: the other check fails.
- 2026-10-23: The diff with the tests for every case, reviewed; each finding checked:
  - Verified, fixed: the hold's unit test left its first open's promise unhandled until awaited, so an early failure
    would surface as an unhandled rejection in a later test. It's handled at once now, as the third open's is.
  - Verified, fixed: the said-once unit test and the hold's unit test used the hold's 40 s with the 30 s default
    timeout, so a held main thread would end the test before its wait ran out, and its `finally` would stop the
    thread under a later test. Both have the 60 s the held test has.
  - Verified, fixed: the terminal said-once check let English load unheld, so its frames asked about zz only if
    zz's failure and English's arrival fell in different frames. English is now held through the preload while it
    draws them, as the unit test does.
  - Verified, fixed: `HOLD_STATES` had been put between `DictionaryFiles` and its doc comment. Moved above it.
  - Verified, fixed: `BUN_OPTIONS` took the preload by its absolute path, which a space in the checkout's path splits
    (Bun: "Module not found"; a standalone try). Now a path from the repository, where the check starts slipbox.
  - Verified, fixed: a hold set on a dictionary already built was never spent, and would make a later build of the
    same words wait. It's spent by the next request for those words, built or not. The unit test builds the same
    words with another affix file afterwards, and it doesn't wait.
  - Verified, fixed: "stopping the thread ends a wait" was asserted only right after the stop. The unit test now
    holds with a 300 ms limit, stops, and still reads "waiting" past it: a thread still blocked would have run out.
  - Verified, fixed: `tests/terminal/spell-hold.ts`, named by a check, counted as the checks' harness, so a change to
    it would run every terminal check. `scripts/ci-scope.ts` sends it to the spelling checks, and the scope test says
    so.
  - Rejected: the held terminal check's waits could add past slipbox's 20 s request deadline on a slow runner. That
    deadline is the thread's own and bounds every spelling check. The held phase is two keys, answered in
    milliseconds, and a runner that took 20 s over them would fail the kitchen-sink check's 3 s first.
  - Rejected again: a finite stall isn't caught (as above); the hook ships in the product (the maintainer's choice);
    the copied dictionaries could share a helper across the unit and terminal tests (each copies the files it needs,
    in its own harness).
- 2026-10-23: Round 4's fixes, mutation-checked, each alone, the files restored. The said-once guard removed: the
  terminal check fails, English now held while it draws its frames. A hold not spent when its dictionary is built:
  the hold's unit test fails, the other affix file's build kept waiting until the request's deadline. The thread
  "stopped" without being terminated: the unit test fails, as the old thread ran out and built the dictionary. The
  scope's entry for the preloaded script removed: the scope test fails. Then: `core.test.ts`'s spelling, 11 pass;
  the spelling block, 7 pass; the four spelling terminal checks, 4 of 4.
- 2026-10-24: The diff after round 4, reviewed; each finding checked:
  - Verified, fixed: the said-once terminal check kept English held while its warning's floating box faded (4 s)
    and through the messages list, eating into the request's 20 s deadline. It's let go right after its frames
    now; the messages are counted after.
  - Verified, fixed: a spent hold read "set", the same as one not yet reached. It reads "spent" now (`HOLD_STATES`),
    and the checks' wait for the hold ends on any state past "set", then says which it found.
  - Verified, fixed: the preload's relative path in `BUN_OPTIONS` reached every bun process the check starts from
    elsewhere: the CLI run from the vault, a language server. A quoted absolute path isn't read either: quoted, it's
    silently not preloaded (a standalone try). A session option, `preload`, now puts `--preload <path>` before
    slipbox's `main.ts`, for slipbox's own process alone. A harness test shows it loaded there once, and not in the
    CLI's.
  - Verified, fixed: the preload's watcher polled for as long as slipbox ran once a hold was spent, or its thread
    stopped mid-wait. It stops past "set" and "waiting", and two seconds after it lets go.
  - Verified, fixed: with the preload in `BUN_OPTIONS`, the scope comment's reason was wrong (nothing named the
    script). With `preload` it's named by a check's path again, and counts as the harness without its entry ("every
    check"). With it, the spelling checks (a standalone try of `scope`).
  - Verified, fixed: a second hold on the same words silently replaced the first. It's refused now, and the unit test
    says so.
  - Verified, fixed: design/testing.md said one check preloads the script. Both spelling checks do.
  - Rejected again: a finite stall isn't caught; the hook ships in the product; the copied dictionaries' helpers.
- 2026-10-24: Round 5's fixes, mutation-checked, each alone, the files restored. `preload` ignored, or passed
  through the environment: the harness test fails (no load, or the CLI's too). No "spent" written, or a second hold
  accepted: the hold's unit test fails. Then: `core.test.ts`'s spelling, 11 pass; the spelling block, 7 pass; the
  scope test passes; the preload's harness test passes; the four spelling terminal checks, 4 of 4.
- 2026-10-24: Round 6, two independent reviews, consolidated, each finding checked:
  - Verified, fixed: the hold's unit test stopped the thread while it waited with a 300 ms limit, so a main thread
    pausing longer than that before the stop let the wait run out first ("ran out" with a 350 ms pause, a standalone
    try). The limit is 5 s now, the state read past it.
  - Verified, fixed: the preload stopped watching 2 s after letting go, so a thread slow to wake would never be seen
    let go. It watches until the state changes, which only an Atomics read a tick costs.
  - Verified, fixed: a hold dropped with its thread (stopped, or started afresh after a deadline) read "set" or
    "waiting" for ever. `holdBuild` counts the threads started and stopped, and such a hold reads "dropped". The unit
    test checks one dropped while waiting, past its limit (so never run out either), and one dropped before it's
    reached.
  - Verified, fixed: `preload` was handed to Bun as given, so a path from the repository broke a check that starts
    slipbox elsewhere, and a restart found the last run's files. `{dir}` is replaced, a relative path is taken from
    the repository (the harness test names it so and starts slipbox deeper than the repository), and the preload
    clears its files when it starts.
  - Verified, fixed: the hook in the product had no decision. D262 records it (`decisions/process.md`), with a note
    under D232.
  - Verified, fixed: the harness test that starts slipbox had the 30 s default timeout; 60 s now. A check failing
    because a request's deadline stopped the held thread says so, not "its wait run out".
  - Rejected again: a finite stall (as above). Rejected: `terminate` ending a wait is Bun's, and the test leans on it.
    The test checks what the doc says, and a Bun that changed it would leave a thread building for nothing, so the
    test should fail then. Rejected: work out the checks' harness without following check files, rather than an entry
    for the preload. That's a change to the scope's rules for every check; the entry's check name is held to a real
    check by `tests/terminal-coverage.test.ts`. The copy helpers, as before.
  - Mutation-checked, each alone, the files restored: "dropped" never computed, or a stop not counted, fails the
    hold's unit test; the preload not resolved from the repository fails the harness test ("preload not found").
    Then: `core.test.ts`'s spelling, 11 pass; the spelling block, 7 pass; the harness and scope tests pass; the four
    spelling terminal checks, 4 of 4.
- 2026-10-24: Round 7, two independent reviews, consolidated, each finding checked:
  - Verified, fixed (both reviews; one ran it): a hold whose thread ended at a request's deadline, or in a crash,
    with no request after, still read "waiting": only a thread started or stopped was counted. The thread is now
    counted when it starts and when it ends, at its `terminate`, which every end goes through. The count is made
    once the worker exists, so a worker that can't be made counts nothing.
  - Verified, fixed (both): the check could read the hold's state file half written. Bun's `writeFileSync` doesn't
    truncate first, and a reader saw "let gog" in about 17% of reads (a standalone try). The preload writes beside
    the file and renames it over, and `letGoSpell` waits past an empty state too.
  - Verified, fixed: the decision's placeholder number. It's D262.
  - Verified, fixed: `holdBuild` matches the dictionary's words by the exact path `dictionaryFiles` gives (`~`
    expanded, the name ending `.dic`). Its doc says so.
  - Verified, fixed: the hold's unit test slept 5.5 s past a limit to show a stopped thread never ran out. It now
    lets the dropped hold go after the stop: a thread still waiting would wake and say "let go". That takes 0.4 s.
  - Verified, fixed: the worker took any limit. It's a minute at most, and with no hold set the worker does no map
    work.
  - Verified, fixed: an entry of this Log described how the session ran. Taken out.
  - Rejected again: a stall during Hunspell's call itself isn't caught (as above). Rejected: the preload starts the
    spell thread before slipbox does, so the held checks never see the thread start on the first request. The hold
    has to be set before that request; the other two spelling checks and the unit tests start it on first use.

  - Mutation-checked, each alone, the files restored: a thread's end not counted at its `terminate`, or the thread
    stopped without being terminated, fails the hold's unit test. Then: `core.test.ts`'s spelling, 11 pass; the
    spelling block, 7 pass; the harness and scope tests pass; the four spelling terminal checks, 4 of 4.
