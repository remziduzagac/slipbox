---
status: done
assignee:
blocked_by: [ORG-T4]
created: "2026-10-26"
---

# ORG-T13: Mutation paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move files, rename, plans, capture and replace-files into mutations. Extract shared marker operations below
orchestration, preserving refusal/undo behavior.

### Issue coverage and ownership

Destination: core/workspace/mutations. Add a forbidden reverse-edge fixture for shared marker operations.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Implementation and dependency evidence

The [T13 move manifest](../manifests/t13.json) relocates 11 files into mutations and its rename subfolder. Before
extraction, the mapped graph/runtime edges, test identities and build entries agree with baseline ORG-T5:
`bun scripts/organization/migration.ts capture tmp/issue/t13-before.json`, then the migration check with that snapshot
and manifest. The mechanical stage captured 1,949 edges and 2,612 literal test declarations; all 35 affected source
modules matched after import normalization. The moved-file selector comparison has no mismatches.

Shared storage, retention, cross-filesystem movement and vault-marker trashing are extracted into `mutations/trash.ts`.
File operations and rename execution call it directly; CLI/TUI trash consumers import it directly. The original
implementations match after removing imports/export modifiers and renaming the moved movement helper. File-operation
orchestration is otherwise unchanged. No compatibility re-export or gateway runtime is introduced.

The [extraction delta](../manifests/t13-extraction.json) records the intentional differences after the mechanical gate:
rename-apply no longer imports files; files, rename-apply and both clients import trash. Trash imports only foundation
filesystem/storage helpers; files retains its storage key as a type-only import. Two new boundary test declarations
are added, none removed; build entries are unchanged. Runtime SCC sizes change from 3/3/64 to 3/64: the files → rename
→ rename-apply → files cycle is removed. The other SCCs are unchanged under the path mapping. Final imports resolve and
old-path scanning passes. The original mechanical snapshot is not claimed identical after this intentional extraction.

## Local verification record

The focused mutation/refusal/marker/trash selection passes 16/16 before extraction and on baseline/current repeat runs;
rename-across-vault and undo tests pass 12/12. Both boundary tests pass, and the reverse-import fixture fails when the
new guard is temporarily removed. The TUI trash case and three terminal journeys (rename, marker make/unmake and trash
emptying) pass; actual compiled TUI/CLI checks pass. Typecheck, lint, boundary, size and docs pass; all existing exact
caps are unchanged.

The first post-extraction owner run passed 14/16 and failed two `tests/vault.test.ts` cases:

- “made a vault: path links across it are left, and reach the same; made a folder again: it all reaches the same”:
  a deinit refusal returned exit 0 instead of 5.
- “deinit rewrites the pointers by its name, which goes with its .slipbox/: from apart, the parent's pointer, else a
  path (D74, D75)”: preview edits used relative paths instead of the expected named-parent pointers.

Both pass five isolated fresh-process runs on baseline ORG-T5 and five on the current tree: each is 5 pass/0 fail on
each revision (20/20 repetitions total). The identical 16-test selection also passes on both revisions. The cause of the
first-run failures remains unknown; these repetitions do not establish a product defect or its absence.

The complete 16-test selection was also repeated five times per revision, each in a fresh process:

| Selection | Baseline ORG-T5 | Current tree |
| --- | --- | --- |
| Five batches of all 16 owner tests | 5/5 runs, 80/80 tests pass | 5/5 runs, 80/80 tests pass |

State inspection: `tests/vault.test.ts` sets one XDG sandbox for the file, and these CLI helpers call `runCli` in the
same process. The two cases use separate fixture directories but share that sandbox, root registry and module state
with earlier selected cases (including the named-folder trash migration). This permits state interaction; the
repetitions did not reproduce it or establish a causal link. No product behavior or assertion is changed to mask it.
