---
status: done
assignee:
blocked_by: [ORG-T14]
created: "2026-10-26"
---

# ORG-T15: Diagnostics and git paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move diagnostics, servers, git and distribution families without extraction. Keep worker-local imports and optional tool
integration intact.

### Issue coverage and ownership

Destinations: core/documents/diagnostics and servers, core/workspace/git and core/application/distribution. Media moves
in T6. Preserve generated server locks and verify their generator rather than splitting data by hand.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Implementation and structural evidence

The [T15 manifest](../manifests/t15.json) maps 42 source files into documents/diagnostics, documents/servers,
workspace/git (branches, history, review, merge and staging) and application/distribution. No implementation is
extracted here. The embedded skill still resolves to the same shipped text. Spell worker URLs, sorted package
entries, selector patterns, generated-cap path and generator output path move atomically. Generated lock data and its
1,239-line cap are unchanged; offline generation/pin verification passes without network access.

Baseline ORG-T14: `bun scripts/organization/migration.ts capture tmp/issue/t15-before.json` captured 1,954 edges and
2,614 literal test declarations. Mapped dependency/runtime edges, test identities and build entries agree after the
move, preserving mapped SCCs. All 111 affected source bodies match after import/worker-path normalization; all 42
moved-file selectors are preserved. The 37 historical blueprint references and one shipped installer comment are
retained explicitly. No source compatibility barrel, transport, gateway execution or optional-tool policy change is
introduced.

## Local validation and limitations

Each owner/gate file was run in its own process. Results:

| Focus | Result |
| --- | --- |
| Diagnostics/spelling/git core selection | 68 pass |
| Git branches | 25 pass |
| Git panel | 131 pass with NO_COLOR unset; environment control described below |
| Server clients/integration | 71 pass |
| Skill lifecycle | 13 pass |
| Upgrade/restart | 23 pass |
| Distribution and range selectors | 81 + 16 pass |
| Generated locks | 3 pass |
| Compiled SQLite/workers and embedded skill CLI | 2 pass |

All eleven actual worker clients complete from source and a host-compiled probe outside the repository, including
spelling and nested export-to-diagram SVG. The actual package binary opens explorer/outline and exits cleanly,
serves info/commands JSON and rejects an unknown option with exit 2. Spelling, Git branch-refusal and an external
upgrade/restart terminal journey pass (3 total). About's update check is skipped by its existing #100 quarantine;
no quarantined check is claimed passing. Typecheck, lint, boundary, size, docs, migration and offline lock checks pass.

The Git-panel case “This branch's files marked as the explorer marks them: its letter, in its colour” is
environment-dependent. The original local environment has `NO_COLOR=1`, `FORCE_COLOR` unset, `COLORTERM=truecolor` and
`TERM=xterm-ghostty`: the case fails with drawn foreground `default` versus an undefined role foreground on baseline
and current. Removing only `NO_COLOR`, keeping all other variables unchanged, makes it pass. It also passes with
`NO_COLOR`/`FORCE_COLOR` unset, `COLORTERM=truecolor`, `TERM=xterm-256color`. This is not evidence of a move regression;
no assertion or product color behavior is changed.

The initial combined-file runs also hit local socket restrictions, temporary-fixture ENOENT errors and two transient
Git failures (the loose-folder base warning and the worktree-refusal dialog). Re-running files separately with normal
local-socket permissions passes the gate files and Git branches; both transient Git cases pass isolated on baseline
and current. Their first-run causes remain unproven. The local color-environment condition and its passing control are
recorded above.


## Shipped installer bytes

The installer-template hunk is reverted: `scripts/install.template.sh` is byte-identical to baseline ORG-T14. Its
historical `core/release.ts` comment is explicitly retained. Inspection found no raw-template hash assertion;
`scripts/release.ts` renders that template into the published installer and `channelFiles` hashes downloaded
`install.sh` bytes for the site channel files. Those rendered-artifact hashes matter, so this phase preserves the
template bytes. The existing distribution tests exercise rendering and installer/channel digest checks.


With only `NO_COLOR` unset, a complete Git-panel run passed the color case but timed out at 5 seconds in
“in a vault that isn't a repository, they're the panel: by what needs attention, opened up in place, gone into”.
Repeating the complete file on baseline and current under that same environment passes 131/131 on each revision.
That timeout's cause remains unknown; the passing controls are not used to erase it from the record.
