---
status: review
assignee:
blocked_by: [ORG-T3]
created: "2026-10-26"
---

# ORG-T4: Graph and links paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move graph and links families only, preserving authoritative graph maps and all resolution contracts. Mutation paths
move separately in ORG-T13.

### Issue coverage and ownership

Destinations: core/workspace/graph and links. Keep graph state authoritative and existing resolution behavior.

## Evidence required

Graph/link/rename/plan tests and corresponding file/rename terminal checks. Preserve refusal, undo and watcher
contracts; compare runtime SCCs.

## Implementation and local evidence

The [T4 manifest](../manifests/t4.json) maps 19 files into workspace/graph and workspace/links, with no compatibility
barrels. Backlinks worker URLs, package entries, selector rules and the graph's exact size cap move atomically.
Mapped dependency/runtime edges, literal test declarations and build entries are unchanged, so runtime SCC membership
is unchanged under the path mapping. All 66 affected source modules have matching executable bodies after import and
worker-path normalization. All moved-file selector filters are preserved; retained paths are historical blueprint text.

All eleven actual worker clients complete from source and from a host-compiled probe outside the repository, including
backlinks and nested export-to-diagram SVG. The actual package binary opens explorer/outline, exits cleanly, serves
info/commands JSON and rejects an unknown option with exit 2. The focused rename terminal check passes. Backlinks tests:
96 pass. Typecheck, lint, boundary, size, docs and the migration gate pass.

The first 92-test selection passed 90 tests and failed the two named below: A received no changed-note notification;
B kept the old link target instead of relinking it. The identical selection on the predecessor and a current rerun both
pass 92/92. Isolated repetitions (each test in a fresh process, five runs per revision) give the following evidence;
the cause of the first-run failures remains unknown.

- A: `tests/vault.test.ts`, “degraded (the watch limit hit): open notes are polled, their changes still reported”.
- B: `tests/vault.test.ts`, “in home, a file reached through a followed link is written through it, never over it:
  by a rename's relinking, and moving the link itself”.

| Test | Baseline ORG-T3 | Current tree |
| --- | --- | --- |
| A: degraded watcher | 5 pass, 0 fail | 5 pass, 0 fail |
| B: home-link relinking | 5 pass, 0 fail | 5 pass, 0 fail |

These repetitions found no increased failure rate; they do not establish why the first run failed. Logs remain local,
but the test identities, observed failures and repeat counts above are the reviewable record.

Baseline: ORG-T3; `bun scripts/organization/migration.ts capture tmp/issue/t4-before.json` captured 1,949 edges and
2,612 literal test declarations. Compare with `bun scripts/organization/migration.ts check` using that snapshot and the
linked manifest.
