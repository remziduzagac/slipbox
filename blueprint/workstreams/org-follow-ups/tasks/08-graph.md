---
status: review
assignee:
blocked_by: [ORF-T7]
created: "2026-10-31"
---

# ORF-T8: Separate graph refresh from index state

Issue item 1; ORG-T11 graph follow-up.

## Scope

Characterize the single mutable graph, generation order and overlay/cache invalidation before extracting refresh/feed
coordination from src/core/workspace/graph/graph.ts. Introduce no generic graph container. Preserve behavior and remove
its exact cap at or below 600 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Build record

Branch: `refactor/issue-170-graph`, from origin/dev `5e11e56447e9591b2cb2fb859fce86ba6dd56d0d`.
Preceding PR #183's dev run 41266709241 passes at that exact base on attempt 1. T7's completion record is carried
unchanged. Characterization and extraction evidence follow before publication.

### Characterization and extraction

The before-edit [manifest](../manifests/t8-graph-extraction.json) records every moved responsibility. Graph retains
its notes, link index, assets, reached paths, editor overlays and pending map, generation and derived caches. The
refresh collaborator owns only refresh flags, asked folders, stamps and explicit-read cache; the feed owns listeners
and ordered file/asset/retarget delivery. Both read live capabilities. Graph's existing API, build return identity,
defaults, write flags, errors and initialization remain. No file, worker, entry, URL or asset is relocated.

Four added tests exercise authoritative map identity and asset/build ordering, rebuild generation and overlay/disk
persistence, invalidation before file/retarget delivery, and lazy parsing of newly reached notes with skipped work.
The same before/after selection passes 61 tests / 326 assertions / zero failures across 20 owners, 3.29 / 3.43 seconds.
It covers graph queries, watcher/index freshness and home indexing/persistence/reach/mechanisms. The same three terminal
scenarios pass seven commands / two jobs / 4.5 seconds each: across-quit index recovery and reindexing, links becoming
live/broken, and a hidden reached note deleted and recreated. Existing titles, assertions, limits and check bodies
remain unchanged; the fixture adaptation below changes setup only.

Graph is 998 → 596 lines; GraphRefresh is 445 and GraphFeed is 187. Only the graph cap is removed: one handwritten
source exception remains. The cohesive index/query facade remains above the 500-line aim, below the 600 ceiling.
The exact body audit preserves 39 moved methods and 36 retained methods after live receiver/callback substitution,
the complete build-listener tail, invalidation order and every original comment line. The removed private move
forwarder now calls the same reconciler through its callback. T7's carried completion remains byte-identical.

Structural capture before extraction includes the four new characterizations. Static edges are 3038 → 3058;
runtime edges 2264 → 2275, zero unresolved paths, twelve unchanged build entries and all 4072 original declarations
plus the four new tests. Runtime SCC memberships remain identical (sizes 2/5/8). Scope retains all 358 original
owners and adds only the new owner (359), without whole-suite fallback. Terminal selection conservatively remains
all; only the three affected checks above were run. No stale or retired path is introduced.

### Build and verification

Typecheck, boundary, size, Biome and staged-path docs prechecks pass. The host package build uses the original command,
twelve entries, root and autoload flags; 1469 modules, SHA256
`385e3702d5941b293b4e20ec038bd7f92ba3c9ae3cb15672e80e33d9b20ac105`.
Isolated source/copied-package CLI probes verify index refresh, info identity, note content, backlinks and folders,
five commands per mode away from source. Real source/compiled worker probes each start one parse, walk, backlinks and
export worker, adopt worker chunks without fallback, complete a walk-thread index, return 3500 backlinks and export
Markdown through the real clients. Diagnostic compilation retains all eleven worker entries and original flags;
its temporary source and binary are removed.

Preserved intermediate diagnostics: the initial characterization referenced a nonexistent LinkIndex property; the
assertion now uses its real resolver. Initial extraction checks found a malformed import and missing local/type
bindings, corrected before verification. The private body audit needed bare receiver normalization and the manifest's
askedFolders entry. The initial CLI probe expected an array where backlinks returns a containing object; corrected
its field and finished only the remaining source probes plus compiled mode. These are fixture/audit assumptions,
not demonstrated product defects. No unrelated failed selection, worker request or CI job was retried.

Evidence in tmp/issue: ORF-T8-before/after-unit.log, before/after-terminal.log, body-audit.log/.json and its executable,
structure.log and scope/snapshots, build.log and artifact.sha256, probes-initial.log/probes.log, worker-probes.log and
source/build/compiled logs. Required bounded scoped check and final publication evidence follow.

### Walk-thread fixture adaptation

The first required scoped check passes every static gate, then completes 2391 passes / two existing skips / one
failure / 21861 assertions across 359 owners in 358.23 seconds, with zero overflow warnings. The failure is directly
related to extraction: walk-thread.test.ts:708 casts Graph to its old private asked field, now owned by refresh.
The fixture-reader scan initially missed that private-state dependency; the failing aggregate remains preserved.

Change only that setup expression to `(h.app.graph.askedFolders as string[])`, the existing accessor returning the
same live array. Reversing this single expression reconstructs the exact base file, preserving every title, assertion,
wait and limit. Its corrected walk-thread group passes 20 tests / two existing skips / 97 assertions, 12.01 seconds.
With only this adaptation undone once, the original scenario fails at the removed private field; fixed bytes are
restored exactly. Logs: ORF-T8-walk-fixture.log, walk-fixture-negative.log and walk-fixture-audit.log in tmp/issue.
No product behavior changes. The corrected required check follows; the initial failure is retained separately.

### Corrected scoped result and delivery

The final `gnutimeout -k 10 900 bun run check` passes every static/docs gate and its 359 unique selected owners:
2392 passes / two existing walk-thread skips / zero failures / 21864 assertions in 352.69 seconds. No overflow warning
or whole-suite fallback. This completed run supersedes the initial fixture failure for acceptance; that failure and
its undo control remain recorded. Source, build and worker/terminal evidence are unchanged by the one setup adaptation.
An intervening static-only attempt stopped on a new task-evidence line wrap before tests; its log is also retained,
and corrected docs pass (480 Markdown / 1760 spelt files / zero link errors).

Final structural reconciliation after fixture adaptation retains the exact edge/declaration/entry/SCC/scope results
above. Public export text and all 68 public method/getter names agree; 37 original single-line field declarations
and the problem-cache definition retain their initializers, with only cacheDirty's visibility adjusted for the dirty
callback on its new owner. Source entry probes are cleaned up. T7 completion remains byte-identical.

Final evidence: tmp/issue/ORF-T8-check-corrected.log and check-result.json, check.log (initial failure),
check-doc-wrap.log (static-only), structure-final.log, public-api-audit.json and field-audit.json.
No user-visible behavior, persistence format, dependency, product/test/terminal deadline or CI policy changes.
Fresh review and merge remain separate stages; draft publication follows, with review pending.

### Draft published

[Draft PR #184](https://github.com/remziduzagac/slipbox/pull/184) is open into dev on refactor/issue-170-graph.
Implementation/evidence commit `b0b73507bf60562de828d0903dc67bd016b34f14` is pushed without force. A documentation-only
record adds this draft link; final head is recorded in the build handoff. Final evidence docs/Biome pass at
480 Markdown / 1760 spelt files / zero link errors and 1164 linted files. Product tests and compiled probes are
not repeated for this delivery record. Fresh review is pending; no ready marking or merge in this build stage.
