---
status: done
assignee:
blocked_by: [ORF-T6]
created: "2026-10-31"
---

# ORF-T7: Separate update observation from handover

Issue item 1; ORG-T11 updates follow-up.

## Scope

Characterize quiet-input/answered-offer order, process ownership, restart refusal and child cleanup before separating
version observation from handover in src/tui/app/distribution/updates.ts. Preserve behavior and remove its exact cap at
or below 600 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Extraction manifest and ownership

Before editing, [the manifest](../manifests/t7-updates-extraction.json) recorded observation and its independent
environment contract. No tracked file is relocated or retired; no git mv is needed. Public Updates methods and its
UpdateEnv type export remain at their original entry.

UpdateObservation owns the daily check, polling interval/cadence, initial installer version, file-stamp cache and
concurrent probe guard. It uses live environment/quitting callbacks and delivers found/installed/offer callbacks.
UpdateEnv is independent of App and Updates. Updates retains quiet and answered-offer ordering, version suppression,
dialogs, detached upgrade ownership, result-file cleanup, unsaved/save refusal, restart note and quit. The terminal
runner still hands over after screen teardown; App owns buffers and the write gate. No worker, URL, asset, build entry,
deadline, dependency, persisted format, command or behavior changes.

Updates remains one cohesive interaction/handover controller within 600 lines; the 500-line aim remains applicable.
Its exact cap is removed rather than raised. The observer and environment modules are each below the aim.

## Characterization and checks

Three added public-entry characterizations cover tenth-tick polling/live environment/quit, serialized child probing
and stamp caching across environment replacement, and a detached upgrade finishing after quit (its answer removed,
no message/version claim, background work completed). Existing quiet/answered ordering, suppression, restart/save
refusal, restart-note/session, process-group/output drain and child cleanup scenarios remain unchanged.

The identical three-owner pre-extraction selection passes 75 tests / 357 assertions / zero failures in 13.63 seconds.
Four terminal scenarios pass before extraction: unsaved restart cancel/save, installer upgrade underneath with the
check off, quit while a detached upgrade runs, and hand-put binary replacement/restart. Four checks / seven commands,
two jobs, 19.9 seconds (release builds compiled separately before check timing).

The identical post-extraction selection passes 75 tests / 357 assertions / zero failures in 13.69 seconds. The same
four terminal scenarios pass: four checks / seven commands, two jobs, 19.8 seconds. Their three release scenarios
execute real compiled versions of this checkout, including file-version probing and detached-upgrade completion.

Independent exact-base audit preserves all 24 retained methods byte-for-byte, including quiet/answered ordering,
background process/result cleanup and restart refusal/note/quit. Five moved methods preserve their bodies after live
capability receiver changes; the copied live stateFile getter, both file helpers and UpdateEnv retain their semantics.
Observed-version guard order and synchronous queue admission remain under the same finally. Existing tests, terminal
checks, package entries and
lockfile bytes remain unchanged. T6 completion matches its saved record.

Sizes: updates.ts 667 → 556; update-observation.ts 145; update-env.ts 23. The updates cap leaves check-size.ts;
two handwritten source exceptions, one generated exception and nine test exceptions remain.

Structural capture after characterization and before/after extraction: 3030 → 3038 static edges and 2260 → 2264
runtime edges, zero unresolved references, twelve unchanged entries and all 4072 declarations retained. The exact
manifest deltas and runtime SCC memberships (2/5/8, unchanged) reconcile. An independent disposable exact-base capture
retains all 4069 original declarations and adds only the three characterizations. Unit scope retains all 264 prior
owners and adds only observation.test.ts (265), without whole-suite fallback; terminal selector stays conservatively
all, with only the four affected scenarios executed. No scope reduction or speedup is claimed.

Host package build passes with the original command, entries, root and autoload flags: 1467 modules, artifact SHA256
1a27a6bdaadc69233452e977f9fcfe58fa03ee91a3b31bb80350ed344f006159. No worker implementation, caller, URL or entry
changes; version observation uses the existing versionOf process path, exercised by the focused and release-terminal
checks. Standalone typecheck, boundary, size and docs prechecks pass. Initial Biome precheck flags the new test's
inline-only type import; corrected to import type, with its failing log retained.

Isolated source and copied-package CLI probes pass three commands per mode: info identity, note read and folders.
The copied binary also passes the unchanged unsaved-note cancel/save/restart terminal scenario away from the source
tree. Corrected Biome and documentation prechecks pass.

The required gnutimeout -k 10 900 bun run check passes every static/docs gate and its 265-owner selection: 1807 pass,
two existing walk-thread skips, zero failures, 17172 assertions, 320.85 seconds. No overflow warning or whole-suite
fallback. Docs: 480 Markdown files / 1756 spelt files, zero link errors. Test-bearing runs are sequential outside the
sandbox, preserving the existing temporary-directory constraint and all per-test/terminal/product deadlines.

No product defect or behavior change is introduced; no bug-fix undo control, user-doc/changelog change, dependency
change, CI change or screenshot refresh is needed. No unrelated failure/job is retried; no whole suite or all-terminal
run. Review, ready marking and merge are separate stages.

## Build delivery

Branch: refactor/issue-170-updates, from origin/dev 01e414690c127a16f1c691fc151fb726e4dcd89b. The preceding #182 dev
push 41263235711 passes at that exact base on attempt 1, including all three terminal platforms. Health #106 last
ran 2026-10-26, within eight days. T6's completion record is carried unchanged.

Draft PR: [#183](https://github.com/remziduzagac/slipbox/pull/183), open into dev. Implementation/evidence commit
dcfa0bf1b9e96ce1cc1c2690c4872280b39f787e is pushed; this delivery record follows it. Final build-record docs and
Biome checks pass (480 Markdown / 1756 spelt files; 1161 linted files). Initial inline-type lint finding is retained
separately and corrected; no unrelated failure is hidden or retried.

Final pushed head: ee7837444d838b71cbcd7ef3c642aac00ca035dd. All local build gates above pass.

## Review and merge

Fresh review completed at the exact delivery head with no actionable findings or corrections. Independent audits
preserve all original methods, forwarding semantics, moved fields/helpers/comments, ordered admission under the same
finally, independent environment contract, dependency deltas, declarations, entries and runtime SCC membership.
The carried T6 completion is byte-identical. Fresh verification passes 75 tests across three owners, zero failures
and 357 assertions, 13.50 seconds. All four affected terminal scenarios pass seven commands, and all static/docs
gates pass. Review and audits: `tmp/issue/review-ORF-T7.md`, `ORF-T7-review-body-audit.json`,
`ORF-T7-review-structure.json` and `ORF-T7-review-static-results.json`.

[PR CI](https://github.com/remziduzagac/slipbox/actions/runs/41265828790) and
[CodeQL](https://github.com/remziduzagac/slipbox/actions/runs/41265825326) pass at the exact reviewed head on
attempt 1. Both unit platforms, lint/site and aggregate CI pass; terminal/status are skipped by PR policy.
The preceding #182 dev push remains green at the exact base, including all three terminal platforms.

Marked ready and squash-merged as `5e11e56447e9591b2cb2fb859fce86ba6dd56d0d` on 2026-11-01 at 02:49:01 UTC,
with the reviewed head pinned. The merged tree equals the reviewed tree byte-for-byte. Automatic
[dev push 41266709241](https://github.com/remziduzagac/slipbox/actions/runs/41266709241)
succeeds at that exact merge on attempt 1. Both unit platforms, lint/site, all three terminal platforms and
aggregate CI pass; only status is skipped. Terminal totals: Linux x64 and ARM 548/548, macOS 547/547, with
four/four/five existing skips; 329 commands per platform. All four affected update scenarios pass on each platform.
Final metadata and terminal job logs: `tmp/issue/ORF-T7-merge-dev-result.json`,
`ORF-T7-merge-dev-terminal-evidence.json` and `ORF-T7-merge-dev-{arm,linux,macos}.log`.
No failed job, test, build/probe or negative control was repeated; no manual full-suite/all-terminal run or
next-task implementation was performed.
