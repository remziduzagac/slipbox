---
status: review
assignee:
blocked_by: [ORG-T7]
created: "2026-10-26"
---

# ORG-T16: TUI editor and navigation paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move editor, navigation, search and scratch controllers plus their actions and helpers. Keep buffer ownership and save
gate intact.

### Issue coverage and ownership

Destinations: tui/documents/buffers, editing, views, navigation, saving and search; tui/workspace/search;
tui/app/scratch. Move mixed search modules intact before tested responsibility extraction.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.


## Implementation and verification (2026-10-27)

Control baseline before fixture backport: ORG-T7 before the fixture backport; corrected parent: ORG-T7 after the fixture
backport. The [move manifest](../manifests/t16.json) records 23 intact controller/action moves and 34 exact historical
retained references, all in blueprint documents. Buffers and undo remain TUI-owned, and `App.writeBuffer` remains the
note-save gate. Mixed search stays intact under workspace/search until ORG-T34 separates responsibilities. No source cap
changes, worker URLs, build entries, asset literals or shipped artifacts were needed.

- Captured `bun scripts/organization/migration.ts capture tmp/issue/t16-before.json` at the baseline. The subsequent
  manifest check preserves 1,954 import edges, runtime worker edges, build entries and the 2,614 test-declaration
  multiset. All 23 complete terminal-selector sets match the baseline. A normalized body audit of all 56 affected source
  modules finds no executable differences. Full paths, qualified bare names and split path segments were checked;
  unchanged basenames need no rename allowlist.
- Before/after controls ran in fresh marker-free `/var/tmp` fixtures with `NO_COLOR` unset, one owner file per Bun
  process: the editing/source/lens/scratch/find/handoff selection in `tests/tui.test.ts` passes 54/54 on both revisions
  (473 assertions each); `tests/regex-jobs.test.ts` passes 17/17 on both (77 assertions), and `tests/html-cache.test.ts`
  passes 2/2 on both (4 assertions). No intermittent failure appeared in these controls.
- Source and relocated compiled probes pass all eleven real worker clients plus nested SVG diagram export. The actual
  package build succeeds; its copied binary passes which-key, explorer, outline, clean exit, info/command JSON and
  unknown-option exit 2. These probes also check that the unchanged worker/build paths still resolve.
- The two affected terminal checks pass:
  `bun run test:terminal --jobs 1 'lens: space n l edits' 'scratch: add, shown floating'` (2/2). Typecheck, boundary,
  size and `check:docs` pass; changed-file Biome lint and direct Markdown lint pass. No whole-suite or all-terminal run
  was made.

Private command logs are in the local T16 review record; the commands and comparable results above are the reviewable
record. Test titles, assertions, hooks, snapshot names and timeout budgets are unchanged.

Additional focused owner files pass: `peek-backlinks` 96/96, `export-jobs-tui` 10/10 and `tui-parse-threads` 8/8.
`window-header` exposed a generated-import fixture using bare module names: T16's lens/actions paths were stale,
alongside the inherited T7 modes/mouse inputs. Only its path inputs were corrected; titles and assertions are unchanged.
The unmodified baseline fails at modes (43 pass/1 fail); the initial current run fails at lens (43 pass/1 fail). After
path repair the whole file passes 44/44. The T7-only fixes have since been backported into the T7 commit (ORG-T7 after
the fixture backport), so this task now changes only its own lens/actions path inputs and preserves the corrected T7
paths. This is fixture maintenance for relocated modules, not a product behavior change.

Windows/layout remains the existing state owner. These controllers keep per-view state, shared TUI buffers and the
current tabs-containing-views model. The mixed tab strip stays in draw.ts until T17's intact relocation and T36's
ownership review; the manifest records this explicitly.

The final path-input negative control temporarily substituted a nonexistent lens module: the unchanged test failed with
exit 1 and `Cannot find module`, then passed after restoration. A repeat read-only review found no actionable issues.
The template/join scan also checked core worker discovery and literal source joins in scripts and tests; their mapped
paths resolve. No other stale variable-built source import was found.
