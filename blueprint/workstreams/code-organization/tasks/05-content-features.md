---
status: todo
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
