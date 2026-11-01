---
status: done
assignee:
blocked_by: [ORF-T8]
created: "2026-11-01"
---

# ORF-T26: Control Git fixture commit dates

Issue item 4; separate test-only prerequisite after ORF-T9's merge and before ORF-T10.

## Scope

Control both author and committer dates in the git-steady branches fixture, a minute apart, so dawn-start precedes
ridge-notes under the existing newest-first branch order. Keep dates recent rather than folding the branches as old.
Preserve existing check titles, assertions and time limits. Add real-Git coverage for equal-second branch dates and
for the fixture's explicit order, observing the regression fail once with only the fixture correction absent.

Audit other multi-branch and multi-commit fixtures for date-order assumptions. Pin any that rely on those dates;
retain ancestry/category/identity-based expectations with their reasons. Product source, dependencies, CI policy,
user behavior, documentation and changelog are unchanged.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery). Run focused regression tests, all git-steady
terminal checks, affected checks of any other corrected fixtures and the bounded scoped check. Review the test-only
diff, merge when exact-head CI is green, then verify the automatic dev push on all three terminal platforms before
marking ORF-T9 complete and proceeding to ORF-T10. The prior red run remains recorded and is not retried.

## Build record

- Branch: refactor/issue-170-git-branch-dates from dev fab06fa8facd960b37680deec05f73dfb8b0ba07 (#185).
  Carried the existing ORF-T9 merge/failure record unchanged. No other open PR at branch creation.
- Failure: dev run 41274875052, attempt 1, macOS terminal. Its last-row predicate accepts ridge-notes, while the
  capture ends with dawn-start. Both Linux terminals and all four opening/layout scenarios pass on every platform.
- The fixture commits dawn-start then ridge-notes without dates. Git orders whole-second committer dates newest
  first, with alphabetical ties. The correction assigns the expected relative dates explicitly; no sort change.
- Focused regression, fixture audit and verification evidence follow.

## Fixture audit and regression

- `git-steady.ts` now gives dawn-start the captured current second and ridge-notes sixty seconds earlier. The
  test-only `commitAt` helper uses the existing isolated Git environment and explicitly supplies both dates.
  Source-control remains below its 1,500-line test ceiling (1483); no cap changes or source changes.
- Both real-Git regressions pass: 2 tests / 10 assertions. One checks the actual terminal fixture's date gap,
  author/committer agreement, recent unfolded branches and expected panel order. The other creates branches in
  reverse alphabetical order at the same second and verifies the Git reader's alphabetical tie behavior.
- Removed only the fixture correction once: its regression fails with a zero-second gap instead of sixty; the
  equal-second case still passes. Restored the complete fixed file byte-for-byte in finally. Logs:
  `tmp/issue/ORF-T26-negative.log` and `ORF-T26-negative-result.json`; no failed CI job is rerun.
- All 28 git-steady terminal checks pass, two jobs, nine commands, 38.0 seconds. Existing check names, run bodies,
  assertions and time limits remain unchanged. `tmp/issue/ORF-T26-terminal.log` and result JSON retain the command.

Repository-wide Git/date searches identified 62 test/helper candidates; reviewed the order-sensitive paths:

- `source-control.ts:393`: branch order compares current/worktree/rest/merged categories, one branch per category.
  `git-branches.ts` finds branches by identity; its multi-branch hook fixtures assert selected names, not date order.
- `tests/tui/workspace/git/panel/branches.test.ts:80`: the same category order, one ordinary branch per category.
  `panel/stable-rows.test.ts:616` creates omega/zeta but follows main by identity, independent of their relative order.
- The branch pickers in `git/branches.test.ts` and `git/panel/opening.test.ts` use `branchesOf`, whose Git branch
  names are sorted alphabetically; their expected item order does not consume commit dates.
- `tests/gitbranches.test.ts:398` supplies explicit date values to orderBranches already. The new real-Git
  equal-second regression complements that policy coverage rather than changing the product's tie behavior.
- Core/UI history fixtures and source-control rebase/log checks expect a linear ancestor sequence, including after
  rebasing. They do not compare independent branch tips by date. Other Git fixtures assert identity, ancestry,
  merge status, changed paths or worktree/category membership, not a timestamp-based relative order.
- `scripts/build-home.ts:77` already supplies explicit author/committer dates from the reference recipes or its
  fixed default; `tests/release.test.ts:165` also controls those dates. Screenshot Git journeys use that reference
  history or ancestry-based merges. No additional uncontrolled date-order fixture was found; no other fixture pinned.

Search inventories and the detailed disposition ledger remain in `tmp/issue/ORF-T26-*`. Product behavior, user
documentation and changelog are unchanged. The required scoped check and publication follow.

## Build verification

- Required `gnutimeout -k 10 900 bun run check` passes every static/docs gate and 14 tests / 35 assertions /
  zero failures across three reached owners, 447 ms of tests, 9.84 seconds for the complete command. The exact
  selection is terminal-coverage, terminal-git-fixtures and terminal-runner; no whole-suite fallback.
- Typecheck, boundary, size, dependencies, Biome, workflow and documentation gates pass. Docs: 481 Markdown /
  1773 spelt files, zero link errors. Source caps remain zero handwritten / one generated; nine test caps remain.
  No cap or existing test/product/terminal/CI deadline changed.
- Terminal selection is git-steady/source-control; the actual new helper is used only by git-steady and its two
  regressions. All 28 affected terminal checks passed locally above. No unrelated failed check/job is retried.
- Build evidence: `tmp/issue/ORF-T26-check.log` and result JSON. Fresh diff review, PR CI, merge and automatic
  dev verification follow. Keep ORF-T9 completion pending until the corrective dev push passes on all platforms.

## Review, merge and completion

- Review at 929475f485487f374bbcf20d6157fd9a7c733e25 finds no actionable findings. Whole-file reversals preserve
  the existing check array and helper bodies; real Git dates/order, isolated environment and cleanup agree.
  `tmp/issue/review-ORF-T26.md` and `ORF-T26-review-audit.json` retain the complete review.
- [PR #186](https://github.com/remziduzagac/slipbox/pull/186), `test(git): pin branch fixture commit dates`, passes
  required CI 41296785089 and CodeQL 41296782929 at the reviewed head on attempt 1. Marked ready and squash-merged
  with the exact head guard: e0b013aaf1d1690a73162898b2f2ea255f5bac1c, 2026-11-01 10:20:18 UTC.
- Corrective [dev push 41297049491](https://github.com/remziduzagac/slipbox/actions/runs/41297049491) succeeds at
  the exact squash on attempt 1: both unit platforms, lint/site/changes, all three terminal platforms and aggregate
  CI pass. Linux x64/ARM each pass 548/548 terminal checks, macOS 547/547, with unchanged four/four/five skips.
- Every platform passes the repaired last-row check and all four T9 scenarios, exercising 329 commands. Logs,
  metadata and exact line evidence: `tmp/issue/ORF-T26-dev-*`. No failed run or job was retried. The merged tree
  equals the reviewed head; no local branch deletion, promotion or release. ORF-T26 and ORF-T9 are done.
- Carry these two post-merge completion records onto the fresh ORF-T10 branch from latest dev. No further fixture
  adjustment or additional date-order assumption was found during review or the passing cross-platform run.
