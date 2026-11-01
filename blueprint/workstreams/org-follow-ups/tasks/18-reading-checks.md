---
status: review
assignee:
blocked_by: [ORF-T17]
created: "2026-10-31"
---

# ORF-T18: Split reading terminal checks

Issue item 2; ORG-T11 terminal ledger.

## Scope

Split tests/terminal/checks/reading.ts by feature, preserving check names, assertions, setup/cleanup and registration.
Remove its cap at or below 1,500 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Build

Branch: `refactor/issue-170-reading-checks`, from `origin/dev` at `8b0f1e09`. The
[manifest](../manifests/t18.json) records all fifteen feature owners, helper relocations, the left-out ledger and
registration entry point before the move. `git mv` relocates the original owner to `text-files.ts`; the other feature
arrays and shared helpers are extracted from it. Check-specific helpers stay with their checks.

## Characterization

The baseline reading selection passes 72/72 terminal checks with `TMPDIR=/var/tmp SLIPBOX_TERMINAL_JOBS=2`, including
all 57 checks from the original owner. The selector includes 69 reading-area checks and three whose names also match
reading. Size, coverage and runner unit owners pass 22 tests with 167 assertions. Logs:
`tmp/issue/ORF-T18-terminal-before.log` and `ORF-T18-unit-before.log`.

The baseline capture records all 57 sorted moved check names, 552 ordered registrations (name, area and coverage),
the left-out reasons and the focused test names. No snapshot is owned by this collection. Check assertions, options,
setup/cleanup, names, deadlines and rendered fixture data are preserved.

## Verification

The before/after sorted lists compare equal: 57 moved checks and 24 focused test/suite names, with no snapshots in
these owners. All 552 ordered registrations, areas and coverage declarations and every left-out reason compare equal.
All 42 source/sample selector expansions retain the same checks (`tmp/issue/ORF-T18-identities.log`).
The focused unit owners again pass 22 tests. The assertion count drops from 167 to 165 because
`tests/check-size.test.ts:147` performs two line-count assertions for each legacy test cap that still exists. Logs:
`tmp/issue/ORF-T18-unit-after.log` and
`ORF-T18-{check-names,registration,left-out,test-snapshot-names}-{before,after}.json`.

The original 1,737-line owner's final cap is removed. All fifteen owners are below 1,000 lines; the largest is
`text-files.ts` at 362, and shared `support/reading.ts` is 114. The size gate passes with zero handwritten source or
legacy test caps; the separate generated-lock cap is unchanged. `git diff HEAD -M15% --summary` recognizes the
relocation at 21% similarity after extraction. The stale-reference scan finds no live reference to the old check path;
original-scope task and historical inventory paths remain evidence. Logs: `tmp/issue/ORF-T18-size.log`,
`ORF-T18-move-{diff,summary}.log`, `ORF-T18-stale-references.log`.

The first typecheck and terminal run caught a missing `pos` import in the extracted code checks. The import is restored;
no check body, assertion or deadline changes. The corrected reading selection passes 72/72 with the same two-job
settings, including all 57 moved checks. Log: `tmp/issue/ORF-T18-terminal-corrected.log`; initial failure:
`ORF-T18-terminal-after.log`.

Typecheck, lint, boundary, size and docs gates pass. The required
`TMPDIR=/var/tmp gnutimeout -k 10 900 bun run check` passes, including 22 tests across the same three affected unit
owners. Log: `tmp/issue/ORF-T18-check.log`. Fresh review and merge are separate stages.

## Delivery

[Draft PR #197](https://github.com/remziduzagac/slipbox/pull/197) targets `dev` from
`refactor/issue-170-reading-checks`. Implementation and verification commit:
`ec9d38d47aa45204ded7302063971caaaa0b67bc`. The results above are local; final-head CI is pending.
