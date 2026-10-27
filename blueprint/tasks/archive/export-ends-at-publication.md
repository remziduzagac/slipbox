---
status: done
assignee: claude-68
blocked_by: []
related: [T25]
tracker: [gh:#68]
created: "2026-10-24"
---

# T28: An export ends when its file is written, its cleanup after

A TUI export is over once its file is written: it says so then, and Cancel export from that moment finds none
running. Its staging is cleared after, and a warning from that cleanup comes last, not under the `exported … to …`
that followed it.

## Description

`Exporter.write` (`src/tui/exporter.ts`) keeps the export among its running jobs until `output.dispose()` has removed
its staging folder, after `publish` has put the file in place, and says `exported … to …` only after that. A cancel
during the cleanup (`note.export_cancel`) finds the job, aborts its controller and says nothing, and nothing reads the
signal after `publish`: the export goes on to say `exported … to …`, the cancel taken and ignored. A cleanup that fails
says `export cleanup: …`, then `exported … to …` at once over it: the newest message is the one the bottom line shows
on a narrow screen, and the first of the boxes on a wide one.

## Acceptance criteria

- A cancel while a published export's staging is cleared says `no export is running`, and the export says
  `exported … to …`: a unit test holds the cleanup back (`PreparedExport.prototype.dispose`), and fails without the fix.
- `exported … to …` is said while the cleanup is still held, and a cleanup that fails leaves `export cleanup: …` as the
  last message: unit tests, failing without the fix.
- The export is over as soon as a cancel can no longer stop it, its document's rename begun: a cancel from the last
  check before that rename says `no export is running` (a unit test cancels there; a test of `publish` pins when it
  says so).
- An export that fails or is cancelled while it's published says why and ends then too, its cleanup after: a cancel
  during its cleanup finds none running.
- The folder is still kept as where you exported last as soon as publication returns (T25's tests hold).
- Terminal checks drive the held cleanup: the export said while it's held, Cancel export saying none is running.
- design/export.md says when an export ends; the CHANGELOG has a line.

## Out of scope

- The CLI's export (`src/cli/`), which awaits its cleanup before it exits and has no cancel but a signal.
- An export that fails or is cancelled while it's prepared: `ExportJob.prepare` (`src/core/rendering/export/jobs.ts`)
  removes its staging before it settles, so the TUI says why only after that, and a removal that fails replaces the
  export's error. Core code the CLI shares, as on `dev`.

## References

- Delivers: design/export.md § Background jobs, § Asking for one.
- Rests on: (D190), step `10.14`; T25 (#39, #67), which keeps the folder as soon as `publish` returns.

## Log

- 2026-10-24: Read the cause as the issue gives it, and it holds: `Exporter.write` (`src/tui/exporter.ts`) deletes the
  job from `jobs` in its `finally`, after `await output.dispose()`, and says `exported … to …` after the `finally`.
  `cancel()` says `no export is running` only when `jobs` is empty; otherwise it aborts a signal that nothing reads once
  `publish` has returned. Two things the issue doesn't say. Messages are boxes, newest first, four at most, each for 4 s
  (`App.message`): on a screen 30 columns wide or more (and a content area 5 rows high), the cleanup's warning still
  shows, under `exported …`; only smaller, where the newest alone goes over the bottom line, is it replaced. And the
  same window is there for an export that fails in `publish`, or is cancelled during it: its `not written` or `export
  cancelled` is said in the `catch`, then the `finally` awaits the cleanup with the job still in `jobs`, so a cancel
  then says nothing too.
- 2026-10-24: Not a gap: the early `return` after `prepareExport` says nothing on an abort, but `PreparedExport.take`
  ends with `signal?.throwIfAborted()` and only microtasks follow, so no key can cancel there; it's the quit's way out.
- 2026-10-24: Reproduced on `dev`'s code with unit tests in `tests/export-jobs-tui.test.ts`, the cleanup held
  (`PreparedExport.prototype.dispose`): the export isn't said while its cleanup is held; a cleanup that throws leaves
  `export cleanup: …` second to last, `exported …` after it; a cancel during a failed export's cleanup leaves
  `not written` the last message. All three fail.
- 2026-10-24: Reproduced live, `dev`'s code on a scratch reference set (its own config, state and cache), the first
  export's cleanup held by `tests/terminal/export-hold.ts` preloaded: home.md as Word beside it; while held,
  `home.docx` there and the newest box `exporting to home.docx: writing… — Cancel export stops it`; Cancel export from
  the palette said nothing; let go, `exported home.md to home.docx (Word (.docx))`. Again with the cache's `exports/`
  folder made read-only during the hold: the real `rm -r` failed, `! export cleanup: EACCES: permission denied, rm …`
  in the box under `exported …`, said a moment after it. The staging left was removed at quit (the `exit` hook).
- 2026-10-24: Codex, the sidekick, waits at a rate-limit menu in its pane: a fresh Claude reviewer challenges the
  reading and the plan in its place (`tmp/issue/plan.md`).
- 2026-10-24: The fix, in `Exporter.write`: two `try`s, one inside the other. The inner one is the export (prepare,
  publish, `export.json`), its `catch` saying why it wasn't written, its `finally` taking the job out of `jobs`; then
  `exported … to …` is said; the outer `finally` clears the staging, its warning after all of that. `write`'s promise
  still settles once the staging is cleared, so whatever awaits it still finds it gone.
- 2026-10-24: Tests. Unit, `tests/export-jobs-tui.test.ts` (a `holdCleanup` helper, T25's held test now using it):
  "an export is over once its file is written: …" (said while held; a cancel says none is running; one `exported`, no
  `export cancelled`), "a cleanup that fails is said after the export, the newest message" (the last two messages,
  and `transient`), "an export that fails, or is cancelled, is over once that's said: …" (into a read-only folder;
  then a publication held till it's cancelled). Terminal checks in `outside-and-code`, `export-hold.ts` preloaded:
  "export: over once its file is written — …" (said while held; Cancel export, none running; the cache's `exports/`
  made read-only and the hold let go: the real `rm -r` fails, `export cleanup:` the top box), "export: one that can't
  be written is over once it says so — …". T25's check waited for `exported home.md` after letting the hold go; said
  before now, its box may be gone by then, so it waits for the hold's `let go`.
- 2026-10-24: Ran, with the fix: tests/export-jobs-tui.test.ts (8 pass); the terminal checks `export:`, `notes:
  exported`, `notes: an export cancelled` (14/14, `SLIPBOX_TERMINAL_JOBS=2`). Mutation-checked, each undone after:
  `dev`'s `exporter.ts` fails the three new unit tests and both new checks (T25's passes, as it should); the message
  said before the cleanup but the job kept through it fails the two cancel tests.
- 2026-10-24: Tried live with the fix, the same scratch set and hold: home.md as Word, `exported home.md to home.docx
  (Word (.docx))` while held; Cancel export, `no export is running`; `exports/` read-only and let go,
  `! export cleanup: EACCES: permission denied, rm …` the top box; then home.md as a web page in the same slipbox,
  unheld: `exported home.md to home.html`, its staging gone, the first's left (it couldn't be removed) and removed at
  quit. Restarted, into a read-only `ro/`: `✗ export: ro/home.docx not written — EACCES: …` while held; Cancel export,
  `no export is running`; let go, the staging gone.
- 2026-10-24: The reviewer, on the reading and the plan (and the fix, which was in by then): the reading right, and
  the code right on every path (both `return`s go through both `finally`s; `output` is set whenever there's staging
  to clear; a throw while the message is made still clears it; nothing else reads `jobs`; the queue's turn is given
  back when the worker ends, before publication; no test or check took `exported …` to mean the staging was gone).
  Verified, and taken:
  - `publish` itself (`src/core/rendering/export/spool.ts`) awaits `rm` of every temporary, already renamed, after the
    document's rename and its last check of the signal: a cancel there was taken and ignored, `exported …` after it, the
    window longer the more files beside the document. Reproduced: a unit test whose `publish` cancels as it returns,
    failing on the fix as it was. Fixed by telling the TUI as soon as the document is in place: `publish` takes a
    `published` callback, called after the last rename, before the temporaries are cleared, and the TUI's ends the job
    there. The CLI passes none. A terminal check too: `export-hold.ts` takes `EXPORT_HOLD_AT=publication`, the first
    publication held once it has returned, before the TUI goes on.
  - The design's sentence and this task's criterion said a failed or stopped export ends before its staging is
    cleared: true while it's published, not while it's prepared, where `ExportJob.prepare` removes the staging before
    it settles. Narrowed, and that path put out of scope above.
  - The check's `exports/` folder put back as slipbox makes it, `0o700`, not `0o755`.
- 2026-10-24: The reviewer's, not taken: skipping `publish`'s `rm` of temporaries already renamed (with the job ended at
  the last rename, the cancel no longer meets them; core code, and only time saved); the early `return` after
  prepare made `quitting` alone, so an abort there goes on to `publish`'s own check and says `export cancelled` (no key
  reaches it, see above); the order check in "export: over once its file is written — …" leaning on the `no export is
  running` box still showing (said under a second before the warning, which shows for 4 s; the unit test checks the
  order as `transient`); a failed prepare's cleanup turning its error into `export cancelled` when a cancel lands in
  it, and a failed removal replacing the error (on `dev` too, in core code: out of scope).
- 2026-10-24: Ran: tests/export-jobs-tui.test.ts and tests/export-streaming.test.ts (23 pass); the four checks that hold
  an export (4/4). Mutation-checked, each undone after: `publish` not calling `published` fails the new unit test;
  the TUI passing no callback fails the new check.
- 2026-10-24: The maintainer's choice: Codex isn't used from now on. Its part (the plan's challenge, the second review,
  a hard problem) goes to a fresh Claude reviewer, as it already did for this task's plan and its review round.
- 2026-10-24: Draft pull request #70. Review, round 1, on `bf04c6e` (the archive commit after it): `/code-review` and a
  fresh Claude reviewer, each on its own. The second found no bug: the code right on every path. Consolidated and
  verified against the code; taken:
  - A cancel during the document's rename: `publish` reads the signal for the last time before it, but told the TUI
    only after it, so such a cancel was still taken and ignored. Reproduced (a test whose target check cancels as it's
    made the last time, before the document's rename). The callback, now `committing`, is called right after that last
    read, before the document's last check and rename; the job ends there. Its tests pin where: in
    tests/export-jobs-tui.test.ts, "an export is over once a cancel can't stop it: …" (replacing the one that cancelled
    after `publish` returned, which a callback called too late would pass); in tests/export-streaming.test.ts,
    "publication says when a cancel can no longer stop it: …" (once, the picture beside it in place and the document
    not; never when stopped or refused before). Both fail with the callback after the rename. The terminal check holds
    as publication returns, which a preload can do without patching the filesystem: named so, "export: over once a
    cancel can't stop it — Cancel export as its publication returns finds none running".
  - The manual said a cleanup's warning comes after the export's message, and design/export.md § Asking for one said
    so of every cleanup: not of an export stopped or failed while it's prepared (`ExportJob.prepare` removes its
    staging itself). Both narrowed to an export whose file is written, or that reached publication.
  - Stale wording: `export-hold.ts`'s header ("the export not yet over"), the check file's `hold` and `HOLD` docs,
    `scripts/ci-scope.ts`'s comment and design/testing.md naming only the window's check and the cleanup's hold.
  - The order check in "export: over once its file is written — …" compared the warning with `no export is running`,
    always older, so it couldn't fail, and needed that box still showing: it now puts the warning above every other
    box still showing, the export's own first.
  - `existsSync(cancelled.docx)` after a stubbed publication that writes nothing: removed.
- 2026-10-24: Round 1, not taken:
  - A cancel during a failed publication's own cleanup (its temporaries' `rm`), or a failed prepare's, says `export
    cancelled` rather than the error, the message chosen by the signal: on `dev` too; the export isn't written either
    way, and the cancel did what it was asked.
  - An `rm` of a temporary already renamed that fails other than ENOENT makes `publish` reject after the document is
    in place: `not written` for a file that is. On `dev` too, and it needs the folder's search permission taken away
    between the rename and the `rm`; skipping those `rm`s (both reviewers' suggestion, for this and for the N+1 awaits)
    can't be tested without a hook in the filesystem, and with the job ended before the rename it no longer touches
    the cancel. A follow-up, if wanted.
  - Attachments left in place when a cancel lands between their renames: the design says so (§ Output streaming and
    publication).
  - The callback in core's API rather than `publish` returning straight after the last rename: returning sooner can't
    close the window of the rename itself; only the point where the signal is last read can.
  - `tests/terminal/checks/outside-and-code.ts` past 1,500 lines: 1,700 on `dev`; the rule and `check:size` are for
    `src/` (`tests/tui.test.ts` is past 21,000).
- 2026-10-24: Ran: tests/export-jobs-tui.test.ts and tests/export-streaming.test.ts (24 pass); the terminal checks
  `export:`, `notes: exported`, `notes: an export cancelled` (15/15, `SLIPBOX_TERMINAL_JOBS=2`); the typecheck, the
  lint, `check:docs`. The maintainer's call: one round, then handed over.
