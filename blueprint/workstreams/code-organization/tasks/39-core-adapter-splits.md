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
2. Language-client protocol: separate capability/setting adapters and contracts from the client lifecycle.
3. Theme roles: separate semantic role vocabulary/contracts from palette construction and terminal fallback.
4. Update releases: separate release/channel metadata discovery from installation, replacement and upgrade locking.

Each is an independent extraction PR with its own exact manifest, characterizations, reverse-edge fixture and narrow
owner checks. The child evidence below records encoding, protocol, theme and release discovery separately. Public entry
bindings, client deadlines, protocol lifecycle, theme tokens, persisted update data and process/publication stay stable.
Unused-code removal remains T41's responsibility; discovering an export is not evidence that it can be deleted.

## Core size ledger assessment

Paths below are relative to `src/core/`; counts are measured before the encoding child. This covers every T39 row from
the original inventory. Modules within 500–600 lines retain cohesive responsibilities rather than being split by length.

| Owner | Lines | Disposition and responsibility |
| --- | ---: | --- |
| `documents/servers/locks.ts` | 1,239 | Generated pins; retain separate cap and offline generator check |
| `documents/servers/client.ts` | 677 | Protocol child: contracts/adapters below the unchanged 574-line client |
| `rendering/theme/theme.ts` | 615 | Role child: vocabulary below unchanged 412-line palette construction |
| `application/distribution/update.ts` | 605 | Discovery child: metadata below unchanged 500-line upgrade coordination |
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


## Language-client protocol child evidence

The baseline is the preceding encoding child. Its exact deltas and unchanged SCC memberships are in
[t39-protocol-extraction.json](../manifests/t39-protocol-extraction.json).

- `documents/servers/client.ts` shrinks from 677 to 574 lines. Two owners in `client/` separate the three configuration,
  state and callback records from capability declaration/dotted-settings lookup. The lifecycle remains cohesive in
  `LanguageClient`: all 44 original members and five retained top-level declarations have unchanged tokens. Client
  transport, request admission, staleness, deadlines, hooks, process start/stop and restart behavior are unchanged.
- All five moved declarations preserve their tokens. The same capability object is allocated once in the protocol
  owner; the public client re-exports it and the original lookup function directly. All five public runtime exports
  retain names, arities and prototype descriptors. No object is cloned or frozen, and no wrapper changes call timing.
- Three characterizations pass original exports through an export-only adapter and the extracted owner (thirteen
  assertions): whole-settings identity, dotted sections with falsy/missing/primitive parents, UTF-16 positions, snippet
  support, versioned diagnostics and workspace-edit capabilities. No existing test or fixture text changes.
- The focused core/TUI server and organization baseline passes 118 tests with 1,735 assertions across ten files. The
  extraction passes 122 tests with 1,751 assertions across eleven files; three characterizations and one reverse-edge
  fixture add four declarations, none removed. Assertion totals are host measurements.
- Four affected source-terminal journeys pass before/after: TypeScript diagnostics, rename/actions/formatting,
  completion/signature help and server crash/restart. A fresh production binary passes diagnostics, cursor queries
  and completion/signature help. No preload-dependent check is used for the compiled probe.
- Static edges change from 2,975 to 2,977 (two added), runtime edges from 2,227 to 2,228 (one added). All three runtime
  SCC memberships stay identical (2, 5, 8). Build entries, worker URLs and assets are unchanged; relative imports resolve.
- All 313 test files originally reached by the client remain selected; the runtime adapter adds only the new focused
  test. Existing language-server/lint/problems terminal selectors are preserved. Type-only contracts retain their
  existing harness-based selection (nine test files and the updates checks); that is measured separately from runtime
  reach. `importGraph`/`reach` counts all graph nodes: each lower owner reaches one, the new test two, with no process owner.
- Reverse-edge fixtures keep both helpers below client/manager/transport, including type imports. Independent probes
  reject sixty forbidden import shapes and allow twenty protocol-package forms. Removing the checker invocation
  makes the fixture fail. The active 750-line ceiling and two legacy/one generated caps are unchanged.

Types, boundary, size, Biome, every touched Markdown file and `check:docs` are required before publishing. Theme roles
and release discovery have independent child evidence below; no lifecycle policy is shared here.


## Theme role child evidence

The baseline is the preceding language-client protocol child. Exact deltas and SCC membership are recorded in
[t39-theme-extraction.json](../manifests/t39-theme-extraction.json).

- `rendering/theme/theme.ts` shrinks from 615 to 412 lines. `roles.ts` owns the original role vocabulary, compatibility
  alias object and six type records in 216 lines. Eight moved declarations and all nine retained construction/color
  declarations preserve their tokens. Palette, terminal and monochrome construction, overrides and fallback behavior
  are unchanged; this is a responsibility split, without a new theme strategy or token vocabulary.
- The nine public runtime exports preserve names, arities, prototypes and value shapes. `ROLES` and `OLD_ROLES` retain
  direct lower-owner binding identity; each original object is allocated once. No cloning, freezing or token renaming
  changes persisted configuration or callers that retain a reference.
- A characterization passes against the original public exports through an export-only adapter and the extracted
  owner (four assertions): shared public arrays/aliases, the `sidebar_vault` compatibility spelling and resolvable alias
  targets. Existing theme/glyph fixtures, names, assertions and color data are untouched.
- The focused theme/glyph/organization baseline passes 54 tests with 4,437 assertions across eleven files. The extraction
  passes 56 tests with 4,448 assertions across twelve files. One characterization and one reverse-edge fixture add two
  declarations; none disappear. Assertion totals are host measurements.
- Four source-terminal journeys pass before/after: theme picker preview/commit/revert, global/per-theme color overrides,
  settings theme/glyph previews and startup theme/NO_COLOR behavior. A fresh production binary passes the theme picker,
  color overrides and startup theme/NO_COLOR checks.
- Static edges change from 2,977 to 2,978 (one added), runtime edges from 2,228 to 2,229 (one added). All three SCC
  memberships remain identical (2, 5, 8). Build/worker entries, assets and relative imports remain valid and unchanged.
- All 320 originally reached test files remain selected; mapped owners add only the new characterization. The existing
  all-terminal fallback remains. `importGraph`/`reach` counts all graph nodes: the vocabulary reaches one, the public-binding
  test three (it deliberately imports the public constructor entry), with no theme loader or TUI composition.
- The reverse-edge fixture keeps vocabulary below theme construction, loaders, builtins and glyph selection, including
  types. Independent probes reject sixty forbidden shapes and permit ten unrelated import forms; removing the checker
  invocation makes the fixture fail. The active 750 ceiling and two legacy/one generated caps are unchanged.

Typecheck, boundary, sizes, Biome, all changed Markdown and `check:docs` are required before publishing. Release
metadata is recorded below; generated locks and the other core size-ledger dispositions remain as assessed above.


## Release discovery child evidence

The baseline is the preceding theme child. Exact edge, runtime and test deltas are recorded in
[t39-releases-extraction.json](../manifests/t39-releases-extraction.json).

- `application/distribution/update.ts` shrinks from 605 to 500 lines. `updates/discovery.ts` holds release/channel URL,
  version/manifest parsing and candidate lookup in 132 lines. All fourteen moved declarations retain their tokens
  after export normalization for the shared private `Fetcher` type and `SEMVER` expression; `limited` stays private.
  All 24 retained declarations are unchanged, including privacy/check state, installation, download, locks, process
  probes and replacement. Deadlines, caller cancellation, failure-to-null behavior and channel ordering remain identical.
- The same version expression is shared with upgrade admission, not copied. All 25 public runtime exports retain names,
  arities, prototype descriptors and value shapes; nine discovery values re-export the exact lower-owner bindings.
  Private shared declarations do not leak through the public updater. No asynchronous wrapper changes request timing.
- Three characterizations pass original exports through an export-only adapter and the lower owner (ten assertions):
  mirror URL trimming, target suffixes, preview/stable ordering and release tags, forwarded fetch options, nullable
  transport failures and caller cancellation. Existing unit scenarios, assertions and fixture data remain unchanged;
  the existing distribution selector fixture gains one assertion for the new discovery path.
- Comparable focused baselines pass 167 tests with 2,009 assertions across eleven files; the extraction passes 171
  tests with 2,023 assertions across twelve files. These combine the same distribution filter (including its two graph
  cases) with release/update/organization owners. Three characterizations and one boundary fixture add four declarations,
  none removed; the selector assertion explains the remaining assertion delta. Counts are host measurements.
- Four affected terminal journeys pass on each revision: the source unsaved-note restart question, a failed compiled
  upgrade, Not now/Skip, and compiled installation followed by a later restart. The existing harness builds real 0.5.1
  and 0.5.2 executables for these checks. About and the immediate-upgrade offer remain quarantined under #100 and are
  excluded from passing evidence; no quarantine or terminal timing is changed.
- Static edges change from 2,978 to 2,981 (three added), runtime edges from 2,229 to 2,231 (two added). All three SCC
  memberships stay identical (2, 5, 8). Test declarations change from 4,007 to 4,011; worker/build entries, assets and
  relative imports remain valid. The public updater's source-relative installation probe stays in its original file.
- All 314 originally selected test files remain, with only the characterization added by mapped owners. The updates-only
  terminal selector extends to `updates/discovery.ts`, with an assertion in the existing distribution fixture. Other
  selector paths are unchanged. `importGraph`/`reach` counts all nodes: discovery reaches two and the new test three,
  without upgrade/restart composition.
- Reverse-edge fixtures reject update/restart/skill-lifecycle composition, including types; independent probes reject
  thirty forbidden forms and allow ten release-record import forms. Removing the checker invocation fails its fixture.
  Generated locks pass `bun scripts/lock-servers.ts --check` offline, without refresh or byte changes.

The T39 handwritten candidates now meet the final 600 ceiling (client 574, theme construction 412, updater 500).
Cohesive 500–600-line owners retain their assessed responsibilities above; the 1,239-line generated lock cap remains
separate. Unused-code triage remains T41, and T11 reconciles other owners' final exceptions. Typecheck, boundary, size,
Biome, every changed Markdown file and `check:docs` are required before publishing.
