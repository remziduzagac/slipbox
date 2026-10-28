---
status: review
assignee:
blocked_by: [ORG-T10]
created: "2026-10-26"
---

# ORG-T25: Graph responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate graph cache/build, move reconciliation, overlays and query helpers with one authoritative state owner. Keep
graph contracts light and avoid copying mutable maps.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Implementation and ownership

The complete extraction is [`t25-extraction.json`](../manifests/t25-extraction.json). No source files were moved or
retired, no worker/build entry or deadline changed, and no stale-path exemption is required.

- Graph remains the authoritative owner of notes/index/assets/reached/unparsed/overlay maps, cache flags, generations,
  build/change/retarget listeners and error outcomes. Helpers receive those original map references and live capability
  contracts; no map facade or replacement Graph is constructed.
- `graph/index/schema.ts` holds version 13 and the existing index format without loading parsing or composition.
  `graph-extract.ts` and Graph preserve the version export. GraphStats moves to the existing graph model contracts and
  remains type-exported by Graph. Extraction/parsing bodies and the public Graph entry points remain intact.
- `graph/index/storage.ts` reuses entries in the original maps, collects serialization inputs and persists the index.
  Graph retains cache policy and flags. Input collection remains outside its IO catch; cache errors remain recorded as
  before. Persisted entries use disk underlays, omit pending/unreadable notes, and keep branch/reached metadata.
- `graph/moves/reconcile.ts` is one Graph-owned collaborator holding only the original private went/came/pause
  bookkeeping. Redirect ownership and event listeners stay with Graph. The content uniqueness test, 60-second window,
  cancellation by return, nested pause/finally, branch identity gate and retained-head limit stay unchanged.
- `graph/overlays/editor.ts` updates the same overlay and note maps and reads visible text. Graph retains invalidation,
  generation and file-event policy. Disk underlays keep their identity; unsaved text is never serialized as disk text.
- `graph/queries/indexes.ts` materializes tags, problems, backlinks, name-retarget watches and argument lookups. Graph
  retains parsing-before-query, cache identity/invalidation and listener dispatch. Generation is read after problem
  materialization, local backlinks precede inbound callbacks, and sort/name/path precedence is preserved.
- `graph/queries/file-links.ts` reads data/comment links into Graph's existing stamp cache. Its 256 KiB limit, missing
  file/error behavior, explicit references, grammar availability and syntax-tree cleanup stay unchanged.
- `graph/reach/files.ts` owns file admission/read/discovery policy; Graph.reachFile remains the mutation gate. Root,
  exclusion, symlink, size, decoding and outside-path rules and callback order are retained.

The seven helper modules reject direct Graph/LinkResolver composition imports even for types; the index schema also
rejects an extraction import that would create a schema/parser cycle. Genuine model types remain type imports.

## Size and cohesion assessment

| Owner | Before → after | Assessment |
| --- | ---: | --- |
| `graph/graph.ts` | 1,441 → 998 | State and mutation/build/feed coordinator; its exact legacy cap is removed |
| `graph/graph-resolve.ts` | 605 → 605 | One resolver's path/name/alias/pointer/hosting policy and caches |
| `links/reach.ts` | 517 → 517 | Graph pool, discovery/recording and inbound-index freshness lifecycle |

The extracted modules are 17–189 lines each. LinkResolver's export-mark/name/remote caches and Reach's read-only,
owned-root, nested-index and opened-once rules are related policies with one owner apiece; no equivalent mechanism was
identified that justifies a generic resolver or graph pool. They are assessed cohesive owners, not skipped inventory
rows. Graph is now below the current 1,000-line ceiling; none of these assessments claims the final 600-line gate is
complete. T11 reconciles final exceptions and the 500-line aim. Any further split must have a coherent responsibility
and its own characterization, not trim comments or scatter mutable ownership to satisfy a count.

## Verification

Baseline is the preceding ORG-T10 task tree, captured in a clean archive. Existing test titles/assertions and fixture
DATA are untouched except for additional assertions in the existing organization boundary fixture. No snapshots were
renamed. The following bounded owner commands were run before and after, with Bun 1.4.2 on Linux aarch64, a temporary
HOME and `TMPDIR=/var/tmp`; NO_COLOR/FORCE_COLOR unset, TERM=xterm-ghostty and COLORTERM=truecolor:

```sh
bun run test tests/core/workspace/graph tests/core/workspace/links tests/core/workspace/mutations \
  tests/core/workspace/vaults/home/reached.test.ts tests/core/workspace/vaults/home/moves.test.ts \
  tests/core/workspace/vaults/home/indexing.test.ts
bun run test:terminal --jobs 3 'links: the lists' 'rename: space n m previews' \
  'rename: a link written later' 'git: :merge-review' 'git: a detached HEAD on the top bar'
```

- Owner baseline: 205 pass, 0 fail, 1,224 assertions across 41 files (8.96 s). Candidate: 217 pass, 0 fail, 1,282
  assertions across 47 files (10.48 s), including twelve focused characterization tests. All original declarations are
  retained. Organization guards plus focused graph owners pass 46 tests, 786 assertions across 15 files; this set also
  reaches the existing reached-index owner through the runner's path matching.
- Five identical terminal checks pass before/after, each full run 6.9 s. A reused fixed-root matrix gives 60 identical
  frames, geometry records and layout source maps across wide/narrow/zen screens and three right tools.
- Independent source/AST comparison verifies 18 extracted policy bodies, 59 other Graph method bodies, all 40 original
  field initializers and all ten graph-extract functions. Reuse, serialization-input and IO bodies match separately;
  the IO catch stays in Graph with input collection outside it. Only the recorded dispatch/context qualifications and
  result plumbing differ.
- Static edges: 2,026 → 2,063 (4 removed, 41 added). Runtime edges: 1,646 → 1,671 (4 removed, 29 added). Declaration
  multiset: 3,835 → 3,847 (12 added, none removed), measured with the corrected scanner on both sides. Build entries are
  unchanged; every captured source/script import resolves. All seven runtime SCC memberships remain identical:
  2, 2, 3, 3, 5, 8, 8. This phase improves ownership and focused use; no cycle or timing improvement is claimed.
- Focused helper closures contain no Graph composer. Counting all importGraph/reach nodes from each exact test entry
  as in T9: storage 7 files/5 src; moves 22/20; overlays 23/21; queries 9/8; file links 28/21; admission 25/23.
  These tests use small capability objects, original map identities and real filesystem/parse helpers where relevant.

Assertion totals and wall times are host observations; preservation is judged from bodies, declaration multisets and
invariants. No whole-suite or all-terminal run was used.

### Host-dependent baseline case

The initial unchanged baseline run under default `/tmp` gave 204 pass/1 fail in
`tests/core/workspace/links/pointers.test.ts`, “written across folders that don't travel together: a pointer; together
(one repository, nested outside git), a relative path”: its CLI result used a relative path where a pointer was
expected. The shared `/tmp` contains an empty read-only `.git` directory (uid 501); `/var/tmp` has none. No shared
marker or user setting was changed.

A clean baseline probe in a private temporary root passes without a marker, fails with an empty `.git` (the initial
travelTogether assertion), then passes again when that private marker is removed. This confirms the fixture depends
on ancestor Git discovery; it does not establish why the shared marker was created. With the isolated TMPDIR, the named
case passes 5/5 baseline and 5/5 candidate repeats, and the complete owner groups pass as above. The original assertion
and product behavior are retained; no baseline product defect or extraction regression is claimed.

The host binary built with the unchanged package build command passes the rename-preview and merge-review terminal
checks. Sixty-three reverse-import forms (nine per helper) and the schema/parser cycle probe are rejected; allowed
lower-level imports remain accepted. Removing the storage helper guard makes the existing boundary fixture fail;
restoring it passes. The frozen manifest is verified independently, including exact deltas and full SCC memberships.

The final independent audit preserves every pre-existing selected test for Graph, graph-extract and graph-types, with
unchanged terminal discovery; each new helper selects its focused owner. The schema guard uses its explicit module
path rather than cohort ordering. Its committed parser-cycle fixture fails when that specific rule is removed and
passes when restored (boundary set: 4 tests, including the additional schema assertion). All runtime Graph bodies,
initializer mappings, exact deltas and SCC memberships remain unchanged after this guard-only strengthening.
