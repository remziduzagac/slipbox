---
status: done
assignee:
blocked_by: [ORG-T16]
created: "2026-10-26"
---

# ORG-T17: TUI explorer, panels and overlays paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move explorer, panels, overlays and screen regions, preserving focus and drawing order. No helper deduplication in this
move.

### Issue coverage and ownership

Destinations: tui/workspace/explorer and history; tui/documents/tools; tui/shell/panels, overlays and screen. Keep one
shared right-tools host and its existing active-view/floating-editor behavior.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.


## Implementation and verification (2026-10-27)

Control baseline before fixture backport: ORG-T16 before the fixture backport; corrected parent: ORG-T16 after the
fixture backport. The [manifest](../manifests/t17.json) records 27 intact moves and 48 exact historical references, all
under blueprint. Explorer file operations/history are workspace-owned; info, properties, outline and footnotes are
document tools. Mixed Panels remains the single shared host, including its existing active-view/floating-editor context.
Panel/overlay drawing follows the corresponding shell host; document content/header drawing follows views. Top-bar and
status-bar composition have their own screen subfolders. The mixed tab strip moves with draw.ts into shell/screen;
windows/layout keeps the existing model and T36 reviews a cohesive tab-strip extraction. No focus, draw order, per-tab
persistence or helper responsibility changes are introduced.

- Captured the baseline with `bun scripts/organization/migration.ts capture tmp/issue/t17-before.json`; its manifest
  check preserves all 1,954 import edges, runtime workers, package build entries and the 2,614 test-declaration
  multiset. All 27 complete selector sets match, and all 48 affected source bodies normalize identically. No worker URL,
  asset literal or shipped artifact changed. Full/qualified bare paths, split literals and template-built imports were
  inspected, including the header fixture's explicit module-path map.
- ORG-D2's dated import-formatting exception applies: explorer.ts is 1,268 → 1,275 lines (+7), entirely normal
  formatting of the longer vault import. Its non-import body is unchanged. The exact cap follows its new path; App stays
  1,459 and keys.ts 1,166. No comments or spacing were trimmed to avoid a cap increase.
- Baseline/current controls use fresh marker-free `/var/tmp` fixtures, `NO_COLOR` unset, and one owner file per Bun
  process. The panel/resize/breadcrumb/outline/footnote/property/hidden-file selection passes 43/43 on both revisions
  (319 assertions each); `tests/window-header.test.ts` passes 44/44 on both (252 assertions each).
- The scope fixture in `tests/distribution.test.ts` still used `../core/a` inside its T7-relocated terminal/run.ts. This
  deterministically fails the existing import-edge assertion on both revisions. Its fixture import alone now uses
  `../../../core/a`; the complete distribution file passes 81/81 (1,521 assertions), preserving all titles and
  assertions. No product or selector behavior changed.
- `bun run test:terminal --jobs 1 'explorer: the checks' 'outline: outlineOpen'` passes 2/2 on both revisions. Source
  and relocated compiled probes pass all eleven real worker clients and nested SVG diagram export. The actual package
  build succeeds; its copied binary passes which-key, explorer, outline, clean exit, info/commands JSON and invalid
  option exit 2. Typecheck, docs, boundary and size checks pass. Local logs hold the complete command output.

Additional baseline/current controls pass identically: explorer file operations 16/16 (187 assertions), marks 20/20 (231
assertions), and grouped location/worker controls 7/7 (70 assertions). Changed-file Biome and direct Markdown lint pass.
No whole-suite or all-terminal run was made. Test identities, snapshot names, hooks and timeout budgets remain
unchanged.


### Local stack fixture audit

The two distribution graph cases (`bun test tests/distribution.test.ts -t 'the import graph:|what a change reaches'`)
pass 2/2 at every audited commit, each in a clean source archive with isolated temporary fixtures:

| Stage | Graph cases |
| --- | --- |
| T1 squash | 2/2 |
| T12 | 2/2 |
| T2 | 2/2 |
| T3 | 2/2 |
| T4 | 2/2 |
| T5 | 2/2 |
| T13 | 2/2 |
| Import-formatting policy | 2/2 |
| T14 | 2/2 |
| T15 | 2/2 |
| Migration metadata repair | 2/2 |
| T44 | 2/2 |
| T6 | 2/2 |
| Corrected T7 | 2/2 |
| Rebased T16 | 2/2 |

Migration and size checks pass on both rewritten tips, as does the header import-order case (seven module imports). The
first archive migration invocation lacked a Git index and stopped at `git ls-files`; repeating in indexed clean archives
passes. T17's migration and size checks also pass after restoring its work. Earlier task tips are unchanged.


The inherited fixture fixes precede T16/T17 in local history. Durable task identifiers name the baseline stages here;
temporary local commit identities remain in the local verification log.
