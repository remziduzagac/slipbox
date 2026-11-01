---
status: review
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
