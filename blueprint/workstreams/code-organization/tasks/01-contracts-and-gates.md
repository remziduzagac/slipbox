---
status: todo
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
