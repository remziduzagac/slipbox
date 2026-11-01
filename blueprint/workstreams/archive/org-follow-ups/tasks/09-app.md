---
status: done
assignee:
blocked_by: [ORF-T8]
created: "2026-10-31"
---

# ORF-T9: Separate App opening and layout policy

Issue item 1; ORG-T11 App follow-up; follows ORF-T3 through ORF-T8.

## Scope

Characterize TUI buffer ownership, initialization/disposal order, view anchors and App.writeBuffer authority before
extracting opening/layout rules through focused capabilities from src/tui/app/runtime/app.ts. Keep App composition and
shared state; introduce no App-shaped service bag. Remove its exact cap at or below 600 lines. If needed, record
numbered child PR tasks before their work starts.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Build record

- Branch: `refactor/issue-170-app`, from dev `ea7415fafb4cd7419a9f212e6bb4541a942b2e24` (#184). Its automatic
  dev push 41271073138 succeeds on attempt 1, including all three terminal platforms. T8 completion carried unchanged.
- Before-edit [manifest](../manifests/t9-app-extraction.json) records independent records/UI defaults, buffer admission,
  note opening, view policy and frame title/failure state. Added message and initial-window policy before their edits.
  App retains shared buffers/state, explicit controller wiring, public forwarding entries and its sole note-write gate.
- Four pre-extraction characterizations cover one shared buffer with independent anchors, saving through App, pinned
  tabs/floating refusal, source cursor placement/invalidation and startup/disposal order/idempotent quit. Identical
  before/after eight-owner selections pass 34 tests / 165 assertions, 2.83 / 2.95 seconds.
- The same four terminal checks pass before/after: splits, resize anchoring, session restoration and unsaved quit;
  27 commands / two jobs / 4.6 and 4.5 seconds. Message/frame-specific before/after coverage also passes; original
  App bytes restored only for that additional baseline and current bytes restored exactly in finally.
- Three focused buffer-admission cases exercise live graph claims after reload, path identity, binary refusal and
  virtual/foreign exclusion without constructing App. Initial focused run passes 3 tests / 17 assertions; subsequent
  typecheck corrects the new test's virtual-buffer setup from booleans to the actual object/null contract.
- App 1325 → 599 lines; its exact cap is removed. No handwritten source cap remains. The retained App responsibility
  is shared state, composition, ordered startup/disposal and public forwarding; 500 remains the design aim. New owners
  range from 26 to 265 lines. No source relocation, retired path, worker/asset URL or build-entry change.
- Body audit preserves 31 moved / 14 retained methods, all 251 original comments, original shared field
  initializers and the complete expanded constructor token/comment sequence. Callback receivers, defaults, public
  forwarding and the original WeakSet scope remain. The audit's initial interface/field matching errors were corrected
  without a source change. Initial typecheck also caught the omitted Region forwarding export, corrected before checks.
- Logs and executable audits are retained in `tmp/issue/ORF-T9-*`; dependency/build/scoped evidence and draft follow.
  No behavior, deadline, dependency or CI-policy change; user documentation and changelog need no behavior correction.

## Structural and compiled verification

- Static edges 3058 → 3131; runtime edges 2275 → 2290; zero unresolved references and twelve unchanged build entries.
  All 4076 base declaration identities remain; four integration and three focused cases are added (4083). Runtime
  SCC memberships remain identical (2/5/8). Exact edge/declaration deltas are in the manifest. No retired path.
- Scope retains all 265 prior owners and adds the two new test owners plus the existing toast owner (its ownership
  comment changes): 268, no fallback. Terminal selector remains conservatively all; four affected checks ran. The
  focused buffer-test import closure excludes App. Public runtime exports remain the same six names.
- Host package build passes with the unchanged command, flags and entries: 1476 modules, SHA256
  `41b51a92b0d8856cabd3cf6e79d7c87bcb0cb5c638d559f9c3bbeee0e2e24f30`. Source and copied-package CLI probes
  each pass info/read/folders from an isolated vault away from source. The copied binary also passes the same four
  terminal scenarios. No worker implementation/client/URL/entry moved; no separate worker behavior change is claimed.
- Message/frame comparisons each pass 6 tests / 54 assertions, 0.48 / 0.40 seconds. Typecheck, Biome, boundary and
  source/test size gates pass. The initial docs precheck caught a new evidence line over 120 columns, fixed before
  the scoped check; its log is retained. The required bounded scoped check follows.

## Size-fixture adaptation

- Initial required scoped check passes all static/docs gates, then finds the exact-cap scenario still reading the
  removed App cap at `tests/check-size.test.ts:119`. The test's copied script now receives a synthetic legacy cap;
  its title and original assertions remain. No repository cap is restored. This is extraction-related fixture work.
- Interrupted only this check's exact timeout process with SIGINT (exit 130); its partial log is retained in
  `tmp/issue/ORF-T9-check.log`. The tail also records CLI JSON EOF during interruption; no independent cause or
  additional product defect is inferred from it. No passing aggregate claim.
- Undoing only the fixture adaptation once reproduces the exact scenario failure (expected exit 1, received 0).
  Restored fixed bytes exactly; the size owner passes 8 tests / 48 assertions / zero failures. A whole-file reversal
  reconstructs the base test exactly. Logs: `ORF-T9-cap-fixture-{negative,fixed,control}.log` in `tmp/issue/`.
- The corrected bounded scoped check follows; source bytes, build/probes, before/after terminal checks and structural
  evidence remain applicable. No extra focused product test or compiled probe is repeated beyond the corrected
  required scoped check.

## Build delivery

- Corrected `gnutimeout -k 10 900 bun run check` passes every static/docs gate, then 1818 tests / two existing
  walk-thread skips / zero failures / 17248 assertions across 268 unique owners, 325.64 seconds. Executed owners
  equal the exact scoped selection; no overflow warning or whole-suite fallback. Initial interrupted result retained.
- Static/docs result: 577 source files, zero handwritten / one generated cap, nine test caps; 1174 linted files;
  480 Markdown / 1771 spelt files, zero link errors. Public contracts and six runtime exports remain; all 66 retained
  shared/controller field initializers keep their order and values, including the clipboard.
- Source and artifact bytes remain those characterized and probed above. No extra product run for delivery records.
  Draft publication follows; fresh review and merge remain separate. Keep the task in review until merge.

- Draft PR [#185](https://github.com/remziduzagac/slipbox/pull/185) is open into dev on
  `refactor/issue-170-app`. Implementation/evidence commit `9a3677631c5504f87637a38b6d335aae53c519cc` is pushed;
  a documentation-only delivery record follows. Final-head CI is pending, not claimed green.
- Build-record docs and Biome pass: 480 Markdown / 1771 spelt files / zero link errors; 1174 linted files.
  Fresh review remains pending. No ready marking, merge, next-task work, full-suite/all-terminal invocation,
  deadline/dependency/CI-policy change or unrelated-failure retry. Stop after this build stage.

## Review and merge

- Fresh review at `bf2979ad778dd96282570b7b743d77c8d92b4cd4` finds no actionable findings. Independent body,
  constructor, ownership, contract and initializer audits preserve behavior; all 68 retained single-line field
  initializers agree in value/order, with multiline and moved private initializers checked separately.
- Fresh verification passes 51 focused tests / 284 assertions, four affected terminal checks / 27 commands,
  and all static/docs gates. The completed 268-owner scoped check, package build and source/compiled probes remain
  applicable. No completed aggregate, build/probe, negative control or unrelated failed selection is repeated.
- Required [CI 41274098730](https://github.com/remziduzagac/slipbox/actions/runs/41274098730) and
  [CodeQL 41274094583](https://github.com/remziduzagac/slipbox/actions/runs/41274094583) pass at the exact reviewed
  head on attempt 1. The preceding #184 dev push 41271073138 also passes on attempt 1, including all terminal platforms.
- Marked ready and squash-merged [#185](https://github.com/remziduzagac/slipbox/pull/185) with the exact reviewed
  head guard. Merge: `fab06fa8facd960b37680deec05f73dfb8b0ba07`, 2026-11-01 04:54:39 UTC. Its entire tree equals
  the reviewed head, and its sole parent is the preceding green base. Local branch remains refactor/issue-170-app.

## Dev verification: unrelated terminal fixture failure

- Automatic [dev push 41274875052](https://github.com/remziduzagac/slipbox/actions/runs/41274875052) completes at
  the exact squash on attempt 1 with a failure. Both unit platforms, lint/site/changes and both Linux terminal
  platforms pass. macOS terminal and aggregate CI fail; status is skipped. No run or job is retried.
- Linux x64 and ARM each pass 548/548 terminal checks with four existing skips; macOS passes 546/547 with five
  existing skips. Every platform exercises 329 commands. All four affected opening/layout scenarios pass on each.
  Exact results and completed logs are retained in `tmp/issue/ORF-T9-merge-dev-*`.
- The sole failure is the D261 Git-panel check at `tests/terminal/checks/git-steady.ts:384`, timing out after
  32553 ms waiting for the last row shown. Its predicate at line 402 accepts only Merged or older or ridge-notes.
  The captured branch list instead ends with ridge-notes above dawn-start; no folded older group is present.
- The fixture at `git-steady.ts:69` commits dawn-start and then ridge-notes without controlled dates. The unchanged
  Git reader uses second-resolution committer dates; `orderBranches` at
  `src/core/workspace/git/branches/gitbranches.ts:270` sorts newest first, then alphabetically on equal dates.
  Equal dates put ridge-notes last; distinct dates can put dawn-start last. The capture agrees with the latter.
  This identifies an existing fixture assumption; no causal reproduction or new product defect is claimed.
- The check, its helpers, Git reading/sorting/panel navigation, key handling and panel drawing are unchanged from base.
  App's expanded constructor and moved/retained bodies have the preserved review audit. The same check passes on
  both Linux platforms at this squash and on macOS in the preceding dev run. This differs from #73, #74 and #75.
- Recommend a separate test-only fixture fix with controlled commit dates and coverage of the date-order condition,
  preserving existing assertions, title and limits, before ORF-T10. Task completion waits for disposition of this
  red dev run. No fixture implementation, issue filing, next-task build or failed-check rerun is included here.

## Corrective fixture verification and completion

- [ORF-T26](26-git-branch-dates.md) fixes the date-dependent fixture in separate test-only
  [PR #186](https://github.com/remziduzagac/slipbox/pull/186), squash e0b013aaf1d1690a73162898b2f2ea255f5bac1c.
  Both author and committer dates are controlled a minute apart; existing titles/assertions/limits are unchanged.
  Its equal-second regression and fixture-only negative control establish the correction; no product change.
- Corrective [dev push 41297049491](https://github.com/remziduzagac/slipbox/actions/runs/41297049491) succeeds at
  that exact squash on attempt 1. Both unit platforms, lint/site/changes, all three terminal platforms and aggregate
  CI pass. Linux x64/ARM pass 548/548 and macOS 547/547 terminal checks, with four/four/five existing skips.
- The repaired D261 check and all four T9 opening/layout scenarios pass on every platform. Each exercises
  329 commands. The original red run remains recorded; it was not retried. Completed logs/metadata and exact
  line evidence are retained in `tmp/issue/ORF-T26-dev-*`. ORF-T9 is done; ORF-T10 may proceed.
