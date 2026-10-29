---
status: doing
assignee:
blocked_by: [ORG-T38]
created: "2026-10-26"
---

# ORG-T39: Core adapter and export cleanup

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Assess remaining server client/parse/export modules above the aim; extract only measured cohesive adapters. Triage
unused exports against build/worker entry points; no behavior deletion.

### Issue coverage and ownership

Extract UTF-8 encoding below export dispatch and enforce the reverse-edge rule. Record the lazy-format pattern
assessment. Own remaining core size-ledger assessments; unused-code triage is completed separately in ORG-T41.

## Evidence required

Run focused owner tests and affected terminal checks pre/post; retain failure/cancellation and snapshot contracts.
Verify measured size exceptions and light/heavy import boundaries.


## Bounded child sequence

1. Encoding: extract bounded UTF-8 output below dispatch; preserve all lazy format registrations and output contracts.
2. Language-client protocol: separate immutable capability/setting adapters and contracts from the client lifecycle.
3. Theme roles: separate semantic role vocabulary/contracts from palette construction and terminal fallback.
4. Update releases: separate release/channel metadata discovery from installation, replacement and upgrade locking.

Each is an independent extraction PR with its own exact manifest, characterizations, reverse-edge fixture and narrow
owner checks. The latter three are measured candidates, not completed by the encoding child. Public entry bindings,
client deadlines, protocol lifecycle, theme tokens, persisted update data and process/publication behavior stay stable.
Unused-code removal remains T41's responsibility; discovering an export is not evidence that it can be deleted.

## Core size ledger assessment

Paths below are relative to `src/core/`; counts are measured before the encoding child. This covers every T39 row from
the original inventory. Modules within 500–600 lines retain cohesive responsibilities rather than being split by length.

| Owner | Lines | Disposition and responsibility |
| --- | ---: | --- |
| `documents/servers/locks.ts` | 1,239 | Generated pins; retain separate cap and offline generator check |
| `documents/servers/client.ts` | 677 | Protocol child separates contracts/capabilities from the live client |
| `rendering/theme/theme.ts` | 615 | Role-vocabulary child separates records from palette construction |
| `application/distribution/update.ts` | 605 | Release child separates discovery from installation/locking |
| `documents/servers/languages.ts` | 584 | Retain language/extension registrations and their configuration vocabulary |
| `workspace/vaults/vault.ts` | 584 | Retain root discovery/admission and marker interpretation |
| `application/distribution/report.ts` | 583 | Retain bounded diagnostics collection and its privacy rules |
| `workspace/git/merge/merge.ts` | 549 | Retain merge-review projection and conflict/save coordination |
| `documents/servers/manager.ts` | 534 | Retain process ownership, trust/admission and restart lifecycle |
| `rendering/theme/glyphs.ts` | 531 | Retain glyph vocabulary and terminal-capability selection |
| `workspace/vaults/folders.ts` | 515 | Retain folder discovery, validation and preference persistence |

The source root has no remaining parse/export implementation above 500 except the previously extracted code-page
composer (533 lines, T26). The other remaining core rows belong to T25: Graph 998, graph resolution 605 and reach 517;
T11 reconciles their named final dispositions. Generated locks are not a handwritten responsibility to divide.

## Encoding child evidence

The baseline is the preceding T38 lens/completion child. The exact static/runtime/test deltas and SCC memberships are
in [t39-encoding-extraction.json](../manifests/t39-encoding-extraction.json).

- `rendering/export/encoding.ts:6` owns the unchanged bounded UTF-8 function body. Every call still allocates its encoder
  and reusable chunk buffer once; sink exceptions escape unchanged. HTML and Markdown import it directly, while
  `stream.ts` re-exports the identical public function binding. The dispatch body and both format bodies are unchanged.
- All five dispatch imports remain dynamic and point at the original format owners. Format registration, unknown-format
  failure, worker entry/URL, staging, cancellation, publication and cleanup are unchanged. No new strategy class is
  justified: the existing explicit lazy strategy already isolates format libraries until their formats are requested.
- Three characterizations pass original bodies through an export-only adapter and the lower owner (six assertions):
  empty output, surrogate pairs/lone surrogates at encoding-window boundaries, bounded chunks and immediate sink refusal.
  The existing large Unicode streaming test retains its title and assertions, importing the lower owner directly.
- The narrow export/PDF/organization baseline passes 65 tests with 904 assertions across thirteen files; the extraction
  passes 69 tests with 917 assertions across fourteen files. All original test identities remain; three characterizations
  and one reverse-edge fixture add four declarations. Assertion counts are measured on this host.
- Four source-terminal journeys pass before/after: all formats and attachments, marked export replacement, publication
  cancellation and failed-output cleanup. A fresh compiled binary passes Word, all-format output and marked replacement.
  The publication-hold probe is source-only: `tests/terminal/session.ts:221` chooses the binary without Bun's preload,
  so it cannot install `export-hold.ts` and times out awaiting the hold. It is excluded from compiled-compatible checks.
- Static edges change from 2,973 to 2,975 (two removed, four added), runtime edges from 2,226 to 2,227 (three removed,
  four added). The HTML/Markdown/stream three-module cycle disappears; the other memberships remain identical (2, 5, 8).
  Build entries are unchanged and all relative imports resolve. Fixture text and shipped artifacts are untouched.
- All 318 originally reached export test files remain selected, with only the new characterization file added by mapped
  owners; the export terminal selector is unchanged. `importGraph`/`reach` counts all nodes: encoding reaches five and its
  focused test six, without dispatch or formats. The dispatcher closure changes from 111 to 112 through the added owner.
- The reverse-edge fixture rejects dispatch, orchestration and format imports, including types. Independent probes
  reject 100 forbidden shapes and permit ten sink import forms; removing the checker invocation fails the fixture.
  Typecheck, boundary, sizes, Biome, changed Markdown and `check:docs` are required before publishing.
