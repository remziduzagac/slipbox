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
- A failed or cancelled export still remembers nothing: unit tests, and a terminal check that drives both after an
  export that was written.
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
  through `lastDir` when the window opens. A second, smaller gap: `PreparedExport.publish` (`src/core/export/spool.ts`)
  renames the document last, then its own `finally` awaits an `rm` of every temporary (already renamed), so the file
  is there a moment before `publish` returns. A test that waits for the file alone can race even once the folder is
  remembered right after `publish`.
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
  folder not yet kept) and a quit during the cleanup (the folder now kept). Too small to notice: no CHANGELOG line.
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
  be met live needs a hook in slipbox; the unit test holds it back instead.
- 2026-10-24: The maintainer's choice: no test hook in slipbox to slow the cleanup for a terminal check. The held
  cleanup is the unit test's; the terminal checks drive the export, the reopen, and the failed and cancelled exports.
- 2026-10-24: Typecheck, lint and `check:docs` clean. The scratch home in `tmp/issue/home` held the reference set's
  broken TypeScript (`work/kestrel`), which `tsc` read; deleted, rebuilt elsewhere if needed.
- 2026-10-24: Reviewed before the pull request, twice and independently: a fresh Claude reviewer (Codex's part, Codex
  at its usage limit) and `/code-review`. Neither found a fault. Checked and holding: a cleanup that throws still
  leaves the folder kept and the message shown, as on `dev`; two exports at once, the last published wins (on `dev`,
  the last cleaned up); a quit after `publish` keeps the folder now. The new terminal check's last `see` reads the
  window opened again (the format list hides the one before). Not taken: awaiting `pending` when an assertion fails
  in the held-cleanup test, which the file's other tests don't either. For the pull request: the row the terminal
  checks can't force (the held cleanup) said, and the failed and cancelled exports named as cases its live tries
  added, tests only.
