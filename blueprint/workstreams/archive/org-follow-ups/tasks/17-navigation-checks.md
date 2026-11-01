---
status: done
assignee:
blocked_by: [ORF-T16]
created: "2026-10-31"
---

# ORF-T17: Split navigation terminal checks

Issue item 2; ORG-T11 terminal ledger.

## Scope

Split tests/terminal/checks/navigating.ts by feature, preserving check names, assertions, setup/cleanup and
registration. Remove its cap at or below 1,500 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Characterization and move plan

Branch: `refactor/issue-170-navigation-checks`, from `origin/dev` at
`bfae98acae27298202428268887f3dad167faa86`. The preceding task's completion record accompanies this PR.

`tests/terminal/checks/navigating.ts:91` holds 56 checks in one ordered array. Its helpers read the screen, move the
cursor, enter source mode, inspect theme styles and find the session's config. Every check owns its session through
the existing runner; the collection has no shared mutable fixture lifecycle. The unchanged empty left-out ledger
moves to `checks/index.ts`.

The [move manifest](../manifests/t17.json) records the feature owners and shared helpers before extraction. Registration
stays direct in `checks/index.ts`, preserving global check order, areas, coverage, options and run bodies. Source
selectors continue to use the same check-name pieces and areas. No fixture, snapshot, worker or build entry moves.

Baseline: `TMPDIR=/var/tmp SLIPBOX_TERMINAL_JOBS=2 bun run test:terminal navigating` passes 90 checks, with one existing
quarantine (#100); all 56 checks from this owner pass. Log: `tmp/issue/ORF-T17-terminal-before.log`.

## Extraction and verification

The 56 checks now belong to thirteen directly registered feature collections. The largest is `windows-and-tabs.ts`
at 264 lines; the others range from 20 to 231 lines. Shared helpers are in `support/navigation.ts` (39 lines) and
`support/appearance.ts` (29 lines). The original 1,824-line test cap is removed; only the reading collection's legacy
test cap remains. `blueprint/design/testing.md` records the new ownership.

The sorted moved-check name lists compare equal, and all 552 registered check names, areas and their global order
remain identical. The empty left-out ledger is unchanged. The focused size/coverage tests retain all 20 names and
pass before and after. No snapshots belong to the moved checks. Identity records:
`tmp/issue/ORF-T17-{before,after}.json`, `ORF-T17-check-names-{before,after}.json` and
`ORF-T17-unit-names-{before,after}.txt`.

The terminal command above passes all 56 moved checks after extraction too: 90 navigation-area passes, zero failures
and the same quarantine. Log: `tmp/issue/ORF-T17-terminal-after.log`. Focused unit logs:
`tmp/issue/ORF-T17-unit-{before,after}.log`.

The manifest-driven extraction used `git mv` first. Rename review with `git diff -M --summary` and `git diff -M10%`
shows the removed owner and feature extractions; Git infers the latter's rename to `ui-settings.ts` at 14% similarity,
independently of the initial move to `windows-and-tabs.ts`. The stale-reference scan finds only the preserved empty
ledger and historical task/manifest records; no executable import, selector, fixture, asset or build entry names the
removed path. Logs: `tmp/issue/ORF-T17-move-{diff,summary}.log`, `ORF-T17-stale-references.log`.

Typecheck, lint, boundary, size and docs checks pass. An initial typecheck included the saved baseline copy under
`tmp/issue/` as source; renaming that scratch copy to `.ts.txt` resolves it without a code change. The required
`TMPDIR=/var/tmp gnutimeout -k 10 900 bun run check` passes, including 22 tests across the three affected unit files.
Log: `tmp/issue/ORF-T17-check.log`. Review and merge evidence follows.

## Delivery

[PR #196](https://github.com/remziduzagac/slipbox/pull/196) targets `dev` from
`refactor/issue-170-navigation-checks`. Implementation and verification commit:
`ba55c48799d4c5675cdeab47bedb223576ee72dc`. Final reviewed and merged head:
`ee0fc51ded2cb8371065e95668e0d6b2454a8241`.

## Review and merge

The fresh review found no actionable issues. Names, registration order, the left-out ledger, move rules and stale
references were checked. Review verification passes 22 focused unit tests, the size gate and all 90 navigation-area
terminal checks, including the 56 moved checks, with the same existing #100 quarantine. Report and logs:
`tmp/issue/review-ORF-T17.md` and `ORF-T17-review-{unit,size,terminal,identities}.log`.

CI and CodeQL pass at the exact reviewed head. Before merge, the preceding dev push
[41330961580](https://github.com/remziduzagac/slipbox/actions/runs/41330961580) passes, including all three terminal
platforms. PR #196 was marked ready and squash-merged on 2026-11-01 with the reviewed-head guard; squash:
`8b0f1e092605c1f7ea9e2f45a2ed73b6f632b8bb`.

The automatic dev push [41334509168](https://github.com/remziduzagac/slipbox/actions/runs/41334509168) is in progress
at this handoff; verify its result before the next merge. Merge evidence: `tmp/issue/ORF-T17-merge-*.json`.
