---
status: done
assignee: claude-19
blocked_by: []
tracker: [gh:#19]
created: "2026-10-23"
---

# T22: The git source-control check stops timing out on "nothing staged"

The terminal check `links-and-files: git: source control — a file staged, committed, the commit amended; trusted, then
no longer` now and then timed out on `macos-15` waiting for `nothing staged — s stages a file in the git panel`. Found
at its cause: neither the check's waits nor slipbox's keys, but the checks' own terminal, which lost a character cut
across two reads of slipbox's output; fixed there.

## Description

The check writes a line into `docs/sync.md` in the reference set's kestrel, waits for the status line's `reloaded`,
then runs `: Commit` with nothing staged and waits for the message saying how to stage. On `macos-15` that message
sometimes never matched. Make it fail first (the check alone, many runs, under load), find the cause, fix it there,
and show the failure counts before and after.

## Acceptance criteria

- The failure reproduced, its cause named with evidence in this Log.
- The fix at the cause, with tests that fail without it (checked by undoing it once): a unit test and a terminal check
  that drives slipbox through the case.
- The counts before and after, under the same conditions, in this Log.
- The check itself and the harness's tests still pass.

## Out of scope

- The other flaky checks listed in #6.
- Upgrading `@xterm/headless` past 6.0.0: the fix upstream is only in its 6.1.0 betas.

## References

- Delivers: TT's design (`workstreams/archive/terminal-tests/design.md` § The terminal tests: the headless terminal), for
  design/testing.md at TT's consolidation.
- Rests on: D223 (one issue and one pull request, the design file with the code); D239; TT-D2 (the headless
  terminal); xtermjs/xterm.js#6003 and its fix, #6004.
- Tests: tests/terminal-harness.test.ts ("a character cut across reads after a 0x80 byte kept whole", "read a byte at
  a time (readSize)", "spawned again, the program before is stopped and cut off", "a restart can't change what the
  session was made with"); the terminal check "git: what slipbox writes read a byte at a time — the commit's message
  over the reload's, every character whole".

## Log

- 2026-10-23: The runs the issue names (39032663393, 39045129115) are from the repository before it was restarted:
  `gh run view` answers 404, so their screens are gone; the issue's text is what's left of them.
- 2026-10-23: Read: the wait that times out (`tests/terminal/checks/links-and-files.ts`, `: Commit`, then
  `s.message("nothing staged — …")`) comes before the check opens the git panel (`leader(s, "g")` is the next step),
  so the explorer on the screen at the timeout is expected: the panel hadn't been asked for yet. The question is why
  `openCommitEditor` (`src/tui/git.ts`) didn't say "nothing staged", or why its message wasn't on the screen.
- 2026-10-23: Read, the app's side: `: Commit` is deterministic. Keys are handled one at a time (`Input.handleKey`),
  the palette filters synchronously (`refilter`), `git.commit` runs `openCommitEditor` synchronously, and with nothing
  staged it says the message before the key's turn ends; the next frame draws it. It says nothing only with a floating
  window that won't close, and something else ("not a git checkout") only with no checkout; neither fits.
- 2026-10-23: Read, the check's side: `s.message` is `s.see` — the message must be on the screen as a toast when the
  harness looks. A toast lives 4 s from the frame that first draws it, four at most (`TOAST_LIMIT`), and CI's waits
  are 30 s (`SLIPBOX_TERMINAL_WAIT` in `ci.yml`): a toast gone before the harness reads it can never be found. kestrel's
  folder config says 13 warnings at start, so the stack is full from the first frame.
- 2026-10-23: Ran, locally (Linux, a machine shared with other work): 30/30 passed pinned to one core, 2 at a time;
  48/48 on two cores, 6 at a time; 40 at 4 at a time on one core with waits lowered to 3 s: 12 passed, 11 timed out
  at the start, 16 at "reloaded", 1 at "nothing staged" (trace: `palette.open`, `git.commit`; its message not on
  screen, an older toast still there). With waits that short the harness's own key waits (`taken`) give up, so that
  one isn't a clean reproduction. Runs in parallel (6 at once on two cores) loaded a machine other work shared too
  much; from then on, one process under `nice -n 19` at a time.
- 2026-10-23: A probe (a script of its own, not kept: the check's first steps, the toasts on screen every 20 ms, then
  the messages list): the frames after the commit's enter are 6 KB; the toast shows from 2–60 ms after the enter for
  4 s, with or without a CPU hog in the harness (200 ms busy in every 220 ms); only one reload is said.
- 2026-10-23: Read, a macOS difference: OpenTUI renders on a native thread on macOS and never on Linux
  (`node_modules/@opentui/core`, `useThread` forced false on Linux). A native render skipped while the thread still
  writes is retried a frame later, but slipbox's paint has already run: the toast's 4 s start, and the trace's `frame`
  line is written, before the bytes go out. Tried on Linux with the thread forced on (a temporary line, reverted): the
  toast still shows for 4 s; the frames are too small to back the thread up for seconds.
- 2026-10-23: No clean reproduction on Linux, so a diagnostic on CI's runners, agreed with the maintainer (draft #45,
  a temporary commit never to be merged): the check's first steps 24 times beside links-and-files' 81 checks, a
  failure saying whether slipbox's output ever held the message, the toasts after the enter, the trace and the
  messages list.
- 2026-10-23: Ran on `macos-15` (#45): 24/24 passed; 24/24 again with 1, 2 or 4 busy loops per copy; then 192
  copies, half under 2 busy loops: 191 passed, 1 failed (no busy loop) — reproduced. Its report: `git.commit` ran, the
  message is in the messages list, slipbox wrote "nothing staged" after the enter, and the toast stood on the screen
  for 4 s — but its row read "… in the git pd", not "git pa…": one cell stale, so the needle never matched.
- 2026-10-23: Read, what the stale cell means: OpenTUI draws a frame as a diff against the frame it believes is on
  screen. The toast's bytes (a local passing run) write "… in the git p", then skip columns 229 and 231, which it
  believes already hold "a" and "e" in the same colours — left there by the toast before, "↻ … reloaded". On macOS the
  terminal had "d" at 229: the terminal and OpenTUI's picture of it disagreed on that row by a column.
- 2026-10-23: Read, OpenTUI 0.5.14's native output (`packages/native/src/renderer-output.zig` at v0.5.14): a failed
  stdout write drops the rest of a frame silently (`StdoutOutput.writeBytes`: `writeAll … catch` sets `failed`, read
  nowhere) while the diff's picture advances. Ran on Linux: slipbox's stdin and stdout are blocking under the
  harness's terminal (`/proc/<pid>/fdinfo`), so not there. The render thread and `writeOut` take turns under one
  mutex; OpenTUI's own writes all go through it. A run of 384 copies keeping every byte slipbox wrote is going.
- 2026-10-23: Ran on `macos-15` again, 384 copies keeping the screen's corner and every byte: 379 passed, 5 failed.
  In each, the corner once reloaded already read `│ ↻ docs/sync.md changed on disk  reloaded  │`: the em dash gone
  and the rest of the run a column to the left, on the harness's screen. After the enter the new toast's row read
  "… in the git pdndl": slipbox wrote "… in the git p", then only "n" and "l", trusting the cells under "a" and "e" to
  hold "reloaded"'s letters — which the terminal had a cell to the left.
- 2026-10-23: Ran, locally: those bytes replayed into the harness's terminal (a script, not kept) in two writes, cut at
  each byte near the em dash: only a cut after `E2 80` drops it, giving that row. Plain `@xterm/headless` 6.0.0 does the
  same with `a—b` cut after `E2 80`: "ab". Read, its `Utf8ToUtf32.decode` counts the bytes kept from the last read with
  `while ((tmp = this.interim[++pos] & 0x3F) && pos < 4)`, so a 0x80 continuation byte ends the count and the character
  is thrown away: xtermjs/xterm.js#6003, fixed by #6004 (2026-06-06), only in 6.1.0 betas; the latest release is 6.0.0.
  Any character with 0x80 as a continuation byte (— – … •, CJK punctuation such as 、 and 「, U+10000; not €, `E2 82 AC`)
  is lost when a read ends there; on macOS's runners a frame comes in reads that end there now and then, on Linux's
  rarely. So it's the harness, not slipbox and not the check's waits.
- 2026-10-23: Fixed (`tests/terminal/terminal.ts`): each read is decoded by the harness, streaming (a character cut
  at a read's end kept for the next, as `output` already was), and xterm is given the text, never the bytes. A
  `readSize` option (the terminal and `Session`) reads slipbox's output a few bytes at a time, so a check can cut
  every character. Not chosen: a 6.1.0 beta of xterm (a pre-release, past the supply chain's gates), patching
  xterm's package (to keep in step by hand).
- 2026-10-23: Tests, each failing with the fix undone (xterm given the bytes again), passing with it:
  - "a character cut across reads after a 0x80 byte kept whole: an em dash, a four-byte one (#19)"
    (tests/terminal-harness.test.ts): a script prints `a` and `E2 80`, then `94`, then U+10000 cut after three bytes,
    each part only once the harness has read the last. Undone: "ab d".
  - "read a byte at a time (readSize), the screen is as one read draws it; a size that isn't one is refused": — … • €,
    an emoji and its selector, a ZWJ family, a letter and its mark, U+10000. Undone: "ab   € ☄️👩🔬é".
  - the terminal check "git: what slipbox writes read a byte at a time — the reload's message and the commit's, every
    character whole" (links-and-files): the check's case with every character cut; 6.8 s. Undone: timed out waiting
    for the reload's message, the toasts' corner garbled.
- 2026-10-23: Also found on the way: `taken()` (tests/terminal/session.ts) gives up silently at its deadline, so a
  wait lowered below slipbox's pace moves on before the keys are handled — why the 3 s runs above don't count. Kept
  in the fix: the reads are cut before decoding (a `readSize` cut after decoding would cut no character), and
  `lastOutput` moves on a read that decodes to nothing yet.
- 2026-10-24: Ran on `macos-15` with the fix, the same 384 copies (and, the harness changed, every check): 384/384
  passed, 697/697 checks in all; before it, 5/384 failed. Counts on `macos-15`, the diagnostic's copies: before,
  0/24, 0/24 under busy loops, 1/192, 5/384 failed; after, 0/384. Locally, the reload's bytes cut at each byte near the
  em dash and fed through the harness's own read: every cut reads the row whole (before: the cut after `E2 80` broke
  it). The diagnostic is dropped from the branch; its logs are the PR's runs.
- 2026-10-24: Review, round 1 (15 findings), each checked against the code:
  - Real, fixed: the new check's last look at the reload's toast was a single look at a 4-s toast after three driven
    steps — the race this task is about; dropped, the check ends on the commit's message. `restart` spawns again
    without closing the pseudo-terminal before, and the decoder had become a field shared across spawns: a late read
    of the old program would end a character of the new one's; the decoder is per spawn again, as before this change.
    A `readSize` that isn't a whole number at least 1 is refused when the terminal is made, not at the first spawn.
    Kitty's graphics queries are looked for once per read from the terminal, not once per `readSize` piece (with
    both, the scan grew with the square of the output). The design text said the bug's history; it says what holds
    now, and that a byte that is no character shows as U+FFFD (TextDecoder's), as in a terminal — xterm's byte path
    dropped it; slipbox writes no such byte. The log named session history and scripts outside the repository;
    reworded. Simplified: the check runs `s.ex("Commit")`; the `readSize` test uses the file's `run`, disposes its
    terminal in a `finally`, and makes no terminal for the refused sizes; one loop reads with or without `readSize`.
  - Not taken: `restart({ readSize })` not reaching the terminal — as for `keyboard`, `graphics` and `frameMax`, the
    terminal is made once per session and `restart` never remakes it; no check restarts with them. The check's commit
    step "adds no regression signal" — it is the issue's case driven through slipbox with every character cut, the
    end-to-end check asked for; without the fix the check fails before it. The task writing into TT's design — the
    headless terminal is described only there (TT complete, its design waiting to be consolidated into
    design/testing.md, whose terminal-tests section is still the herdr one); one issue and one pull request changing
    that text with the code (D223).
  - Tests after the fixes: the harness's 17 tests and the two git checks pass; with the fix undone, both new unit
    tests and the check fail again.
- 2026-10-24: Review, round 2 (10 findings):
  - Real, fixed: spawning again left the terminal before open, its late output still reaching `output` and the screen
    (older than this change, in a function it touched): `spawn` closes it — test "spawned again, the program before
    is cut off", failing without the close ("…late" read). `restart` took the terminal's own options and ignored them
    (the new `readSize` among them); it refuses `size`, `keyboard`, `graphics`, `frameMax` and `readSize` — no check
    passes them — test "a restart can't change what the terminal was made with", failing without the refusal. The
    checked `readSize` is kept in a field of its own, not read again from the options each read. The design said a
    few bytes at a time cut every character (only one at a time does), and its credit line didn't name T22: both
    corrected; it says what a restart keeps and cuts off.
  - Not taken: the decoder not flushed at the program's end — a character cut by the program's last byte shows
    nothing, as in a terminal, which waits for the rest. The `readSize` test's terminal not disposed when its own wait
    fails — the file's `run` works that way for every test; a failed test's process ends. The terminal check only
    re-testing the decoding — the case asked for is driven through slipbox; it costs about 1–7 s. A write per piece
    with `readSize` — kept: a cluster's characters (a letter and its mark, a ZWJ family) then come in separate writes,
    as from a real pseudo-terminal, and are checked whole. Kitty's graphics queries rescanned from the last one found,
    the cost growing with the square of the output when graphics are on — older than this change and unrelated to it:
    a follow-up, not this pull request. A task writing TT's design — as in round 1.
  - Tests after the fixes: the harness's 19 tests; the git check, the new check and two checks that restart
    ("tables: kestrel's torture note…", "width: wide characters line up…") pass.
- 2026-10-24: Review, round 3 (9 findings):
  - Real, fixed: a spawn closed the terminal before it but left its program running when one still did; it stops it
    too — the spawn test now also expects the first program killed, and fails without the kill (its wait for the exit
    times out) as without the close ("…late" read). That test's first program could loop for ever if the test failed
    early; its waiting child now gives up after ten seconds. `close()` said the program gets a hangup; Bun sends none,
    and it says so. `restart` refused only the terminal's options while the session's folders (`home`) and `config`
    are made once too: one list, `MADE_ONCE`, refuses them all, an option given as `undefined` passing — the restart
    test refuses `home` and `config` too, and fails without them. The session makes its terminal first, so an option
    it refuses leaves no folder behind. The new check no longer waits for the reload's toast: it ends on the commit's
    message, whose em dash is cut as well — one wait on a toast, as in the git check. The references list every test;
    the log names no tool and no shared machine's other work.
  - Not taken: the decoder dropping a byte-order mark at a program's start — xterm 6.0.0's decoders drop U+FEFF
    anywhere (its `Utf8ToUtf32` and `StringToUtf32`), so the screen is the same. A task writing TT's design — D223:
    a fix is one issue and one pull request changing the code, its tests and the design file it touches; the headless
    terminal is described only in TT's design. Commit messages naming review rounds — the branch is squashed into one
    commit, the pull request's title, before it's handed over.
  - Tests after the fixes: the harness's 19 tests; the git check, the new check and the two that restart pass.
- 2026-10-24: Review, round 4 (9 findings):
  - Real, fixed: a session spawning again while xterm still had the slipbox before's output to parse would have had
    that output's query answers and keyboard flags taken as the new one's; `Session.start` waits until what was read
    is drawn before it spawns (no test: that order can't be forced from outside without a fixed wait). The spawn
    test's "no late output" could pass with the close undone if the late read hadn't come yet; it gives it 200 ms
    first (still failing undone). `restart`'s type leaves out what the session is made with, so the compiler refuses
    it too; the test passes them past the types to check the refusal. The new check's name promised the reload's
    message whole, which it no longer waits for: renamed "… the commit's message over the reload's, every character
    whole". This log listed € among the characters xterm loses: it isn't (`E2 82 AC`); CJK punctuation is (、 is
    `E3 80 81`), and the `readSize` test reads 京都、 now. A design line was 121 columns: wrapped.
  - Not taken: `taken()` giving up silently at its deadline — older than this change, found on the way: a follow-up,
    not this pull request. The new check sharing its first steps with the git check — four lines, each check reading
    as its own scenario, as the others do. Commit messages naming review rounds — squashed away before hand-over.
  - Tests after the fixes: the harness's 19 tests; the git check, the new check and the two that restart pass.
