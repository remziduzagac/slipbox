---
status: done
assignee:
blocked_by: [ORG-T4]
created: "2026-10-26"
---

# ORG-T5: Content feature paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move documents, markdown and syntax only, preserving parser/grammar assets and worker boundaries. Search, editing,
diagnostics and git have separate move PRs.

### Issue coverage and ownership

Destinations: core/documents/model, markdown and syntax, including existing data readers.

## Evidence required

Focused parser/syntax/search/regex/spell/git tests and affected terminal checks; source and compiled worker probes. No
loading optimization.

## Implementation and local evidence

The [T5 manifest](../manifests/t5.json) moves 22 files into documents/model, documents/markdown and documents/syntax.
Grammar assets keep their original targets through rebased file imports; parse/syntax worker arguments and sorted
package entries move together. The data-file terminal selector follows its model module. No parser, cache, deadline,
loading policy, assertions or snapshots change. All 82 affected source bodies match after import/worker normalization;
mapped dependencies/runtime edges, test identities and build entries agree with the baseline, preserving mapped SCCs.

Baseline ORG-T4: `bun scripts/organization/migration.ts capture tmp/issue/t5-before.json` captured 1,949 edges and 2,612
literal test declarations. The migration check against that snapshot and the linked manifest passes.

Local checks: 46 parser/syntax tests, 14 TUI parse/syntax worker tests and 2 selector/import-graph fixtures pass. All
eleven actual worker clients complete from source and a host-compiled probe outside the repository, including parse,
syntax and nested export-to-diagram SVG generation. The actual package binary opens explorer/outline and exits cleanly,
serves info/commands JSON and rejects an unknown option with exit 2. Two code terminal checks pass: syntax errors while
typing and the responsive 4,000-line TypeScript view. Typecheck, lint, boundary, docs and size pass. Under the approved
ORG-D2 dated note, normal type/value import grouping and final import separators are restored. Exact caps increase
solely for longer formatted import paths:

| File | Before | After | Import-only growth |
| --- | --- | --- | --- |
| layout/code.ts | 1,417 | 1,424 | +7 |
| workspace/graph/graph.ts | 1,433 | 1,441 | +8 |

Non-import code/comments and normalized executable bodies are unchanged; mapped edges still agree.

The final comment wrap from T4 is included in config's JSDoc; no runtime change accompanies it.
