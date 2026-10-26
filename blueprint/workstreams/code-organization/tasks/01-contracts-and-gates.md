---
status: review
assignee:
blocked_by: []
created: "2026-10-26"
---

# ORG-T1: Contracts and migration gates

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Extract independent CommandSpec contracts and add regression fixtures for command catalog direction. Capture migration
manifests/test identities. Introduce the 1,000-line source ratchet with measured exceptions. Other reverse-edge
extractions belong to their owner PRs.

### Issue coverage and ownership

Capture a finding ledger from the coverage ledger: every issue item, clone candidate and oversized module has an owner.
Record the verified window/tab and tools-context gaps separately from ORG; refresh baseline test identities and tool
settings. Preserve the current command registry while extracting contracts.

## Evidence required

Command registration, mutation/export dependency cycles, drawing primitives and boundary/size tests. Repeat runtime
graph; preserve startup and error outcomes.

Establish the manifest-driven relocation checks in the design's move-mechanics section: resolved imports and dynamic
path references, source/compiled worker entries and allowlisted intentional old-path fixtures. T44 can run alongside
moves; no gateway/ENG runtime is a prerequisite for these independent checks.

## Implementation and baseline (2026-10-27)

The baseline is `fe3693d`, with the approved design and unchanged application code. T1 extracts the `CommandSpec`
interface from `src/core/command-specs.ts` into `src/core/commands/contracts.ts`; the six area catalogs and their
composer import that independent contract. No complete file moves or compatibility re-exports are needed here.
`scripts/check-boundary.ts` rejects an area's import of its composer, including type-only imports, and imports from
the independent contract. Command metadata, order and startup registration remain unchanged: all 331 entries compare
identically before and after.

`scripts/check-size.ts` enforces the first 1,000-line source ceiling. Its eight handwritten exceptions have exact
measured caps, all below 1,500; a one-line shrink requires lowering the cap, and growth fails. Generated server locks
have their own measured cap and generator reference. The later 750/600 steps remain T10/T11's work (ORG-D2).

The [finding ledger](../design.md#issue-coverage-and-finding-owners) is authoritative for the seven issue items, six
clone pairs, pattern/type/error candidates and 55 oversized modules. The [verified hierarchy
findings](../design.md#focused-verification) remain separate behavior changes; this contract
extraction changes neither windows/tabs nor the active-document tools. No new duplicate finding ledger is introduced.

### Relocation checker for subsequent move PRs

Run `scripts/organization/migration.ts` from the checkout root, before and after a mechanical move:

```sh
bun scripts/organization/migration.ts capture /tmp/org-before.json
# Apply the PR's reviewed move manifest and its single scripted import rewrite.
bun scripts/organization/migration.ts check /tmp/org-before.json /tmp/org-moves.json
```

The manifest has `moves` (old full repository path to new full path) and `retained` (exact old-path occurrences kept
with a reason). For example:

```json
{
  "moves": { "src/core/example.ts": "src/core/foundation/example.ts" },
  "retained": [
    { "file": "history.md", "text": "src/core/example", "reason": "Historical measurement" }
  ]
}
```

The capture records resolved source imports, type imports, literal dynamic imports, literal worker/URL references,
runtime import edges, build entry points and the multiset of literal test/suite declarations. Worker paths resolve
from the imported `workerUrl` helper, including callers in nested folders. The comparison maps both ends of each edge
and build entry through the manifest, fails on unresolved paths or lost/added dependencies and tests, and searches
tracked files for old full paths, including extensionless forms. Snapshot overwrite is refused so the before evidence
is retained. Keep the manifest and both snapshots with the PR's measurement artifacts.

This gate is deliberately for mechanical relocations: a responsibility extraction such as T1 has intentional graph
changes to review. It does not parse arbitrary computed paths or establish test nesting/hook equivalence. Split string
paths, computed test cases, fixtures, selector mappings and dynamically constructed URLs still need the design's
explicit old-path search and review. Typechecking, focused tests, worker-entry tests and the copied compiled binary
checks remain required; matching graph counts alone are insufficient.

### Verification record

- The new scanner reports 1,585 runtime import edges, identical before and after. Its Bun-based import interpretation
  differs from research's Madge count; it is not a claim of four new dependencies. Full SCC membership matches research:
  mutation (3), export dispatch (3) and TUI composition (64). Their extractions retain their assigned owners.
- The only source graph changes are six removed area-to-composer type edges and seven new imports of the contract.
  The build entry list is unchanged. Test declarations retain the baseline except the old size-slack assertion,
  replaced by the stricter one-line-shrink assertion; new check fixtures are added.
- Focused pre/post checks: registry/keymap (5), drawing primitives (4), boundary/import syntax and worker URLs/build
  entries (6), all passing. The new contract/migration fixtures and size checks pass (13 tests). Negative fixtures
  cover skipped tests, missing build entries and a moved worker whose URL/build entry did not follow.
- Source terminal checks: both checks matching `which-key: the leader` pass. The package build succeeds. A copied
  compiled binary, run away from the repository with isolated XDG directories, passes the panel/which-key check and
  exits cleanly; `info --json` and `commands --json` succeed, and an unknown option exits 2 with its expected error.
- The existing autosave/index-lock finding remains the documented ancestor-checkout/fixture interaction. T1 does not
  change its fixture, checkout caching or timeout. T12 remains next; T44 may proceed alongside the move sequence.
- `bun run check` passed typechecking, boundary/size, dependency, lint, workflow and documentation gates, then failed
  in its broad selected test run. Socket permission, shell output and two asynchronous clipboard failures reproduce
  on the unchanged `fe3693d` baseline. The broad run was stopped after cascading fixture/environment failures and
  invalid-timer warnings; its remaining failures are not individually diagnosed. This is not a green aggregate run.
  Focused T1 evidence above stands separately; CI and maintainer review are still required before completion.

Tool settings: Bun 1.4.2, TypeScript 7.0.2, repository compiler/Biome configuration; no dependency changes. The source
inventory is now 329 files, with the added contract below the size ceiling. No user-visible behavior change requires a
manual or changelog entry.
