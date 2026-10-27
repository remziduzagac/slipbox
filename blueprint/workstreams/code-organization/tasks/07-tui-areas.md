---
status: review
assignee:
blocked_by: [ORG-T6]
created: "2026-10-26"
---

# ORG-T7: TUI composition paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move App/background/session/watch, vault and window coordination, terminal adapters, input and action registration into
their folders. Update boundary/tool paths atomically. Remaining feature controllers move in ORG-T16–ORG-T18 before test
relocation.

### Issue coverage and ownership

Destinations: tui/app/runtime, tui/workspace/session and vaults, tui/shell/terminal and input, and tui/actions. Move
current window arrangement to tui/windows/layout; preserve tabs containing views and current session data.

## Evidence required

TUI command parity, wiring, input/focus/save tests and checks for moved features. Compare snapshots and source/compiled
launch; verify only two adapters import OpenTUI.

## Implementation and ownership

The [T7 manifest](../manifests/t7.json) moves 17 modules: App/background/watch to app/runtime; session and vault
coordination to workspace; run/opentui/canvas to shell/terminal; input/key/mode/vim/mouse handling to shell/input;
registration to actions; current window/tab operations to windows/layout. Its ownership metadata records that the tab
strip remains in the mixed draw composer until T17/T36. No empty tabs folder, new Window model or session format is
introduced: the existing tabs containing views remain intact.

Only shell/terminal/run.ts and shell/terminal/opentui.ts import OpenTUI, confirmed by the actual import scan. Main's
lazy TUI entry, the picture-decoder worker URL and package entry follow the adapter move. Worker paths remain
core-relative. Generated boundary fixtures follow their new relative paths; command parity and startup refusal remain
covered. Installer-template and shipped skill bytes are unchanged; basename names are unchanged.

Baseline `e156dba`: `bun scripts/organization/migration.ts capture tmp/issue/t7-before.json` captured 1,954 edges and
2,614 literal test declarations. The mapped dependency/runtime graph, exact declaration multiset and build entries
agree. All 91 affected source bodies match after import/worker-path normalization; selectors are preserved for all 17
moves, including vaults' feature selection. No snapshots change.

Under the ORG-D2 dated note, App's cap moves to its new path and becomes 1,459 from 1,453 (+6 lines solely from normal
import formatting). Non-import code and the complete boundary comment are preserved, apart from updating its run path.
Keys keeps its exact 1,166-line cap. No other cap grows.

## Local checks and fixture condition

Baseline/current input/registry cases pass 18/18 and vault-switch cases pass 8/8. Boundary fixtures pass 3 cases;
command/registration-startup checks pass 4. All eleven actual worker clients plus nested export-to-diagram SVG complete
from source and compiled code, including the relocated OpenTUI picture decoder. The actual package binary outside the
repository opens explorer/outline, exits cleanly, serves info/commands JSON and rejects an unknown option with exit 2.
The source which-key terminal check passes. Typecheck, lint, boundary, size, docs and migration pass.

The 22-case interaction/session/focus/save selection initially passed baseline 22/22 and current 21/22. The named
failure is “space n notes, space d folders, space v vaults: which-key lists them; the explorer's selection, or this note
(18.13)” (`tests/tui.test.ts`): the expected no-parent-vault warning remained the previous restore message. A five-run
single-case comparison under the original temporary parent gave baseline 1/5 and current 5/5 passing; that is not
evidence of a move regression or a fix.

The initially observed `/tmp/.git` is sandbox-specific, not a host marker leak: the command sandbox exposes an empty
read-only tmpfs there (mode 0555, owned by the invoking UID), while a normal-permission check sees no such path. The
observed mount timestamps change with sandbox executions. Inspected test/probe Git initializations name their own fresh
fixture roots; no evidence points to a shared-temp-root leak. This corrects the earlier assumption about the execution
environment; it does not establish why the original warning check was intermittent.

An invalid .git sentinel also counts as a vault marker, so that earlier Git-cache isolation technique is unsuitable for
this test's no-parent-vault assumption. The complete selection under that unsuitable control failed the same case in all
five runs per revision. No host marker is altered. A separate private marker-free /var/tmp parent, with NO_COLOR unset
and FORCE_COLOR/COLORTERM/TERM otherwise unchanged, gives five complete 22-case runs passing per revision: 110/110 on
baseline and 110/110 on current. Retain these controls and the original failures; assertions, hooks, waits and product
behavior are unchanged, and the original intermittent cause remains unproven.


The later fixture audit found two path inputs missed by the original move: the selector fixture's terminal/run.ts
needs `../../../core/a`, and the header module loop needs shell/input/modes and shell/input/mouse. These fixture-only
repairs are included here so this task's branch is independently testable. Test titles and assertion/expectation text
are unchanged; the distribution graph checks and the header import-order case are rerun at this corrected tip.
