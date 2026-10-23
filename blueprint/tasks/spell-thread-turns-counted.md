---
status: doing
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

- The quarantined test is back (no `quarantined:` comment; skipped only where it can't run, Windows having no
  `mkfifo`), measuring a count, not comparing two durations, and passes on a machine slowed to one CPU
  (`taskset -c 0`) as well as unloaded.
- It fails when the main thread is held for the build (checked once by holding it on purpose).
- design/testing.md still holds; it says what changed if the test's way of measuring is described there.

## Out of scope

- The spell checker's thread itself (D232): unchanged unless the reproduction shows the main thread really is held.
- The other quarantined or timed tests.

## References

- Delivers: design/testing.md § Strategy (flaky tests fixed, or quarantined by name; never retried).
- Rests on: D232; design/tui.md (spelling on its thread).

## Log

- 2026-10-23: Valid, in this form: on `dev` the timed assertion no longer fails a run, as it's quarantined
  (`tests/tui.test.ts`, `test.skip` under `// quarantined: #126`, "back once its turns are counted, not timed"); its
  other half, the dictionaries the main thread built counted (`dictionariesBuilt`), is a test of its own and passes.
  So the fix is to bring the quarantined test back, counting.
- 2026-10-23: Tried to reproduce it, un-skipped locally with its gaps logged (10 CPUs). The test alone: longest gap
  20–28 ms of a 500–690 ms load. On one CPU (`taskset -c 0`): 40–137 ms of 450–920 ms. On one CPU shared with three
  busy loops: 220–372 ms of 2.2–3.3 s; the whole spelling block that way, 63–248 ms of 1.2–1.5 s. Always passes.
- 2026-10-23: Codex challenged "a main-thread stall, the machine's": the timing records nothing on the thread's side,
  and it named the App's lazy listener (`src/tui/app.ts`, `onLoaded`), removed only on quit, which a test's App never
  does, so hundreds pile up late in a test file. Measured with N harnesses created just before the timed window (the
  build asked directly or by `space u s`): 0, no gap; 300, 76 ms; 1000, 140–214 ms, at the window's start. Not the
  listeners: one event in the window (the dictionary), about 8 ms for 1000 Apps. Not a collection of the main thread's
  heap: JSC's GC log (`BUN_JSC_logGC=true`) shows 18 ms and 4 ms ones in the window (800 MB heap). Mostly not the main
  thread's own work: its CPU time over the load rose by about 30 ms for a 180 ms gap. Not the build: with the thread
  held at a named pipe before Hunspell's call, the gap came while it was held (66 ms), none during the build. And not
  the request: with the other spelling tests run between the 1000 harnesses and the window, on one CPU, no gap (9 ms
  of a 200 ms load). So it follows the harnesses' creation; what it is wasn't found. Which held CI's main thread can't
  be told from here (the timing records nothing that would say); what's shown is that the test process alone can hold
  the main thread through much of a load the thread builds.
- 2026-10-23: A count that no busy machine can fail: the dictionary's `.dic` a named pipe, so the thread, building it,
  waits for its text; the main thread takes its turns there (timer ticks, keys typed and answered, frames drawn, the
  dictionary still not there) and only then writes the text; the marks follow. Prototyped: the thread opened the pipe
  34 ms after `space u s`, the main thread typed eight keys meanwhile, the text fed at 97 ms, the dictionary built by
  399 ms.
- 2026-10-23: Planned with Codex. It preferred the pipe to a heartbeat counted while the dictionary loads (as
  `tests/syntax-worker-tui.test.ts` does): ticks before a build on the main thread would pass that, and a hold
  covering the whole load would fail it. Its changes, taken: the gate described as "the thread inside the dictionary's
  opening, waiting for its words", not "building" (the read comes before Hunspell's call); no FIFO open on the main
  thread, where an open left pending (its reader gone) could hang the run; a way out for a held main thread that ends
  in a failed assertion, not a hang; the turns counted from the moment the thread is in; marks checked after the feed.
  So the pipe's writer is a child process (`bash`): it opens the pipe, which waits for the thread, says "open", and
  writes the words when told, or after 10 s untold; killed in `finally`. 10 s is under the thread's 20 s request
  deadline and the test's 30 s timeout, and a passing run is told within milliseconds of "open".
- 2026-10-23: Live, this worktree's slipbox on a scratch copy of the reference set (`okuma-notlari.md`,
  `lang: [tr, en]`), its Turkish dictionary pointed at a named pipe (`SLIPBOX_CONFIG`): spelling on, keys moved the
  cursor, no marks, `] s` said "spelling: its dictionaries are loading"; the pipe fed from the shell, and only `kitpa`
  was marked (not in the code span). The first try held the pipe over 20 s: the thread's deadline ended the load,
  "spelling: tr's dictionary didn't load (worker request deadline exceeded)" was said, and the note was checked in
  English alone, its Turkish words marked: as designed (`src/core/worker-requests.ts`, D232), now covered by a test.
  The saved spelling setting was put back off afterwards.
- 2026-10-23: Done in `tests/tui.test.ts`: the quarantined test replaced by "while the thread builds a dictionary,
  the main thread keeps its turns: counted, the thread held at a pipe (#40)" (`turkish(true)` makes the pipe; skipped
  on Windows); and "a dictionary the thread can't build is said once; the note's other languages still check it" (its
  `.dic` a folder), for what the live try found. design/testing.md § Strategy says how such a test counts.
- 2026-10-23: Mutation-checked, each alone, the file restored (`tmp/issue/mutate.py`): the dictionary built on the
  main thread (`openDictionary` calling `openSpeller`): the counter test and the new one fail (`misspelt()` was `[]`
  when it should still have been loading, after the writer's 10 s). The main thread held 12 s while the thread builds
  (`Bun.sleepSync` in `openDictionary`): the counter test passes, the new one fails ("no misspelt words here" where
  "its dictionaries are loading" was due): the case the timed test was for. A failed load said at every frame, or said
  otherwise: the said-once test fails.
- 2026-10-23: Robust: alone, 588 ms; the three spelling tests five times on one CPU shared with three busy loops,
  all pass (about 1.1 s); after 1000 harnesses on one CPU, three runs, pass. The old timed assertion, run beside it in
  those last runs, passed too (longest 44–108 ms of 234–426), so it wasn't seen failing here: CI's two failures are
  its evidence.
