---
status: done
assignee: claude-39
tracker: [gh:#39]
created: "2026-10-24"
---

# T25: The last export is remembered as soon as its file is written

The Save As window opens where you exported last. That folder is remembered as soon as the export's file is written,
not after its staging is cleared, so the window opened again at any moment after opens there. The test that reopened
it once the file was there, and so failed now and then on CI, waits for the export to end.

## Description

`tests/tui.test.ts` › "the window's places: beside the note, the last export, …; it opens at the last (10.14)" failed
once on CI (ubuntu) and passed when rerun with the code unchanged: the window opened again beside the note, not at the
last export. The test waits only for the exported file, then opens the window again. `Exporter.write`
(`src/tui/exporter.ts`) publishes the file, awaits `output.dispose()` (the staging folder removed) in its `finally`, and
only then writes `export.json`, where the folder is remembered; the window reads it when it opens (`lastDir`). When
the cleanup is slow, the window opened in between falls back to beside the note.

## Acceptance criteria

- The folder is remembered as soon as `publish` returns, before the staging is cleared: a test holds the cleanup back,
  opens the window again meanwhile and expects the last export's folder. It fails without the fix.
- The places test waits for the export to end ("exported … to"), not for the file, as the other export tests do.
- A terminal check holds the cleanup the same way (a script of the tests' preloaded into slipbox) and opens the window
  meanwhile.
- A failed or cancelled export still remembers nothing: unit tests, and terminal checks that drive both.
- The terminal check that reopens the window after an export waits for the export to end, as the places test does.
- design/export.md § Asking for one says when the folder is remembered.

## Out of scope

- The order of the "exported … to" message and the cleanup's warning.
- The other tests that fail now and then on CI (#6).

## References

- Delivers: design/export.md § Asking for one (where an export goes).
- Rests on: (D190), step `10.14`.

## Log

- 2026-10-24: Read the cause as the issue gives it: `Exporter.write` (`src/tui/exporter.ts`) remembers the folder in
  `export.json` after `await output.dispose()` in its `finally`, the staging folder's `rm -r`; `browser` reads it
  through `lastDir` when the window opens. A second, smaller gap: `PreparedExport.publish`
  (`src/core/rendering/export/spool.ts`) renames the document last, then its own `finally` awaits an `rm` of every
  temporary (already renamed), so the file is there a moment before `publish` returns. A test that waits for the file
  alone can race even once the folder is remembered right after `publish`.
- 2026-10-24: Reproduced on `dev`: the places test as it is, `PreparedExport.prototype.dispose` spied to sleep 300 ms
  first (a temporary edit, undone), fails as on CI: `Expected: "…/home-…/Downloads"`, `Received: "…/vault-…"`.
- 2026-10-24: Codex, the sidekick, is at its usage limit: a fresh Claude reviewer challenges the reading and the plan
  in its place.
- 2026-10-24: The reviewer, reading the code before the plan, found the same cause and nothing else: only
  `exporter.ts` reads or writes `export.json` (the CLI's export never does); the app and its graph share one state
  folder; `dispose`'s `rm -r` retries (`maxRetries: 5`) widen the gap on a loaded machine. A `dispose` patched on
  `PreparedExport`'s prototype catches the one call that matters: the instance is made on the main thread
  (`PreparedExport.take`), and the job's own failure path removes its folder with the static `remove`. Taken: the
  regression test in `tests/export-jobs-tui.test.ts`, where `write`'s lifecycle is tested with patched prototypes; the
  cleanup released and the prototype restored in `finally`; the premise checked (the file there, the export not yet
  ended); the terminal check waiting for the export to end rather than the file, as the places test now does. Not
  taken: remembering the folder in `publish`'s `revalidate` before the last rename, which would close the second gap
  too: it runs before every copy, chmod and rename, so a folder would be remembered for an export that then fails, and
  it is core code the CLI shares. Nor skipping `publish`'s `rm` of temporaries already renamed (it shrinks the second
  gap but can't close it, and only a test polling for the file can meet it). The "exported … to" message stays after
  the cleanup: it says the export is over, the job gone from `jobs`.
- 2026-10-24: Found while trying it: on `dev` the "exported … to" message and `export.json` came in the same tick, so
  someone reading the screen never saw them disagree. The window opened while it said `writing…` opened at the
  previous folder, and it still does until the file is in place. The fix helps a slow cleanup (the file there, the
  folder not yet kept) and slipbox killed during the cleanup (the folder kept now); a quit waited for the cleanup on
  `dev` too (nothing in the TUI calls `process.exit`). Too small to notice: no CHANGELOG line.
- 2026-10-24: Fixed. `Exporter.write` keeps the folder in `export.json` as soon as `publish` returns, in the `try` and
  in its own `try {} catch {}`, before the `finally` disposes of the staging; the message stays where it was. The
  places test waits for "exported … to", as the other export tests in its block do.
- 2026-10-24: Tests. `tests/export-jobs-tui.test.ts`, "the folder exported to is remembered once the file is written:
  the window opened while its staging is cleared opens there": `dispose` held back; the file there, the export not
  ended; `space n o enter` opens at `out/`, "Last export" among the places. A failed export (tests/tui.test.ts, "an
  export that can't be written says why …") and a cancelled one (export-jobs-tui, "Cancel export stops every export
  …") leave `lastDir()` null. A terminal check, "export: where you exported last — the last export written; one that
  can't be written, or is cancelled, leaves it as it was", drives the three through slipbox; "export: the window's
  keys …" waits for "exported home.md" before reopening.
- 2026-10-24: Mutation-checked, each undone after: `dev`'s `exporter.ts` fails the held-cleanup test (`Expected:
  "…/out"`, `Received: "…/vault-…"`); the folder kept before the export starts fails the failed and cancelled unit
  checks and the new terminal check (the window not at `out/`).
- 2026-10-24: Ran: `tests/export-jobs-tui.test.ts` (4 pass); tui.test.ts's places test and "an export that can't be
  written" (2 pass); the terminal checks `export:`, `notes: exported`, `notes: an export cancelled` (11/11) and the new
  one (with the window's keys, 2/2), `SLIPBOX_TERMINAL_JOBS=2`.
- 2026-10-24: Live, this branch on a scratch copy of the reference set (`HOME` and the XDG folders in `tmp/issue/`),
  halden open: `space n o`, Word, Downloads, `enter`, and `space n o enter` in the same keys: the window opened while
  the export was `writing…`, beside the note (no export yet), as before. Escaped and opened again: `~/Downloads/`,
  "Last export" marked. Into `~/ro` (mode 555): `not written — EACCES`, `export.json` still Downloads, the window
  there. A 24,000-paragraph note as a PDF into `~/work`, cancelled from the palette while `writing…`: no file,
  `export.json` still Downloads. The same PDF left to finish, a loop in the shell sending `space n o enter` the
  moment `~/work/long.pdf` appeared: the window at `~/work/`, "Last export" marked. A cleanup held back long enough to
  be met live needs it held from inside slipbox's process.
- 2026-10-24: The maintainer's choice: no test hook in slipbox to slow the cleanup for a terminal check. (Asked on a
  wrong premise, corrected below: a check can hold it with a script of the tests' preloaded, no code in slipbox.)
- 2026-10-24: Typecheck, lint and `check:docs` clean. The scratch home in `tmp/issue/home` held the reference set's
  broken TypeScript (`work/kestrel`), which `tsc` read; deleted, rebuilt elsewhere if needed.
- 2026-10-24: Draft pull request #67 opened. Its body first said the review found nothing: that was taken from
  summaries that came in before the two reviews had finished; corrected on the pull request once their reports came.
- 2026-10-24: Review, round 1: a fresh Claude reviewer (Codex's part, Codex at its usage limit) and `/code-review`, each
  on its own, on `d98bc1d` and `57898e9`. Both found the fix itself right on every path: success; a failure or a cancel
  in `prepare` or `publish`; a quit or cancel between them; a cleanup that throws (warned, folder kept, as on `dev`);
  the root changed meanwhile (`graph.loc`); two exports at once (the last published wins; on `dev`, the last cleaned
  up). Verified, and fixed:
  - A terminal check of the held cleanup needs no code in slipbox: the harness preloads a script of the tests' into
    slipbox's process (`preload`), as `tests/terminal/spell-hold.ts` does. Asked again with that premise; the
    maintainer chose the check. `tests/terminal/export-hold.ts` holds the first export's `dispose` until the check
    writes a file, its state in another; the check "export: where you exported last — kept once the file is written,
    so the window opened while its staging is cleared opens there; one that can't be written leaves it as it was" opens
    the window during the hold (at `out/`, "Last export"), then exports into a folder it can't write. Listed in
    `scripts/ci-scope.ts`'s `SAMPLES_FOR` (and `tests/distribution.test.ts`), named in design/testing.md.
  - "export: the window's keys …" looked for `~/work/q3/` anywhere on the screen, which the "exported … to
    ~/work/q3/home.docx" message satisfies, and waiting for that message made it certain to be there: it now looks for
    the window's folder at its top (`/[│┃] ~\/work\/q3\/ +[│┃]/`).
  - The failed export's `lastDir()` check in tests/tui.test.ts ran as soon as the error showed, before the cleanup
    ended, so a folder kept after the cleanup would pass it: moved to tests/export-jobs-tui.test.ts, "an export that
    can't be written isn't kept as where you exported last", the `write` awaited.
  - The held-cleanup test awaits its export in `finally`, so nothing of it runs into the next test when it fails.
  - The cancel's case was a copy of "notes: an export cancelled"'s note and steps: that check now cancels an export
    into `later/` and finds the window beside the note, no "Last export"; the new check has no cancel of its own.
  - The quit claim (above, corrected): `dev` kept the folder on a quit too.
  - design/export.md said the folder is kept "once the files are in place", but `publish`'s own `finally` clears its
    temporaries after the last rename, and said a cancelled export leaves it, though a cancel during the cleanup
    doesn't: it now says "as soon as publication returns" and "cancelled before it's written".
- 2026-10-24: Round 1, not taken: `/code-review`'s "a quit during the cleanup keeps the folder now, untested" (not new:
  see above); "the held test's 25 s poll outlasts bun's 5 s timeout" (the harness sets 30 s, `tests/tui-harness.ts`);
  "the cancel check races a fast runner" (the same timing as the cancel check on `dev`, kept in one place now);
  `outside-and-code.ts` over 1,500 lines (1,539 on `dev`, 1,517 now; `check:size` reads `src/`); skipping `publish`'s
  `rm` of temporaries already renamed (core code the CLI shares, and only a test polling for the file meets that gap).
  `/code-review`'s "end the export when `publish` returns" (the job dropped, the message shown then, so a cancel during
  the cleanup isn't silently taken, and a cleanup warning isn't replaced at once): on `dev` too; the maintainer chose a
  follow-up issue, #68.
- 2026-10-24: Round 1's fixes mutation-checked, each undone after: `dev`'s `exporter.ts` fails the held-cleanup unit
  test and the new terminal check; the folder kept before the export starts fails the awaited failed-export test, the
  cancel unit test, the new check (at the failed export) and the cancel check; kept after the cleanup, always, fails
  all of those. Ran: tests/export-jobs-tui.test.ts (5 pass); distribution's "a pull request runs the tests …"; the
  places test and "an export that can't be written" in tests/tui.test.ts; the terminal checks `export:`, `notes:
  exported`, `notes: an export cancelled` (12/12, `SLIPBOX_TERMINAL_JOBS=2`); the typecheck, the lint, `check:docs`.
- 2026-10-24: The maintainer's call: no further review rounds, the scope being the issue's; handed over after round 1.
