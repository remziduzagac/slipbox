---
status: review
assignee:
blocked_by: [ORF-T15]
created: "2026-10-31"
---

# ORF-T16: Split external-change and code terminal checks

Issue item 2; ORG-T11 terminal ledger.

## Scope

Split tests/terminal/checks/outside-and-code.ts by feature, preserving check names, assertions, setup/cleanup and
registration. Remove its cap at or below 1,500 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Build plan and move manifest

Branch: `refactor/issue-170-outside-code-checks`, from `origin/dev` at
`9bee02b88a87fe427811216691728aa99a4efbf2`. The saved ORF-T15 completion record is carried with this PR.

The [move manifest](../manifests/t16.json) records paths and entry points before extraction. Use `git mv` to move
the collection to `checks/export.ts`, retaining its export window and publication checks. Extract the preceding
groups to `export-entry.ts`, `problems-and-lint.ts`, `language-servers.ts`, `watching.ts`, `agents.ts`,
`save-conflicts.ts`, `configuration.ts`, `saving.ts` and `shell-and-context.ts`. Register them directly in their
original order. Shared editing/navigation helpers live in `support/outside-and-code.ts`, diagnostic styles in
`support/diagnostics.ts`, and export fixtures in `support/export.ts`; feature-local helpers stay with their checks.
Remove the old exact 1,900-line cap. All split owners aim below 1,000 lines, with the 1,500 ceiling unchanged.

Preserve names, areas, coverage, assertions, setup/cleanup, fixture strings and deadlines. Compare sorted names and
the ordered registry, then run the original collection before and after with `SLIPBOX_TERMINAL_JOBS=2` and
`TMPDIR=/var/tmp` outside the sandbox. Compare the terminal coverage owner's names and pass count too. Record rename
review, stale-reference check, cap removal and testing ownership; run the required scoped gates before opening the
draft PR (ORG-D1, ORG-D2; ORG-T11; ORF-R3).

## Extraction and verification

All 67 sorted check names and all 552 ordered registry entries retain their names, areas and coverage. This includes
the six generated lint-visibility checks in the editing area. Before and after runs both pass all 67 checks and
exercise 59 commands, using two jobs outside the sandbox with `TMPDIR=/var/tmp`. The terminal coverage owner retains
its test names and passes 12 tests / 127 assertions on each side.
Logs: `tmp/issue/ORF-T16-identities.log`, `ORF-T16-terminal-before.log`, `ORF-T16-terminal-after.log`,
`ORF-T16-unit-before.log` and `ORF-T16-unit-after.log`.

| Owner under tests/terminal/ | Lines |
| --- | ---: |
| `checks/export-entry.ts` | 47 |
| `checks/problems-and-lint.ts` | 259 |
| `checks/language-servers.ts` | 184 |
| `checks/watching.ts` | 332 |
| `checks/agents.ts` | 127 |
| `checks/save-conflicts.ts` | 95 |
| `checks/configuration.ts` | 172 |
| `checks/saving.ts` | 91 |
| `checks/shell-and-context.ts` | 144 |
| `checks/export.ts` | 404 |
| `support/outside-and-code.ts` | 33 |
| `support/diagnostics.ts` | 19 |
| `support/export.ts` | 30 |

The exact outside-and-code cap is removed; size passes with two remaining legacy test caps. `git mv` was used
before extracting the children. Default rename review shows the old path deleted and the children added;
`git diff -M20% --summary HEAD` recognizes the export owner as a 20% rename. The manifest accounts for each child.
The stale-reference scan finds the valid new support path and empty coverage declaration, plus historical task and
manifest records. No executable reference to the removed check file remains. Existing source selectors use unchanged
name pieces and areas. Testing ownership is updated in `blueprint/design/testing.md`.
Logs: `ORF-T16-move.diff`, `ORF-T16-rename.diff`, `ORF-T16-move-summary.log` and `ORF-T16-stale-references.log`.

Typecheck, lint, boundary, size and docs pass individually. The required bounded scoped gate,
`TMPDIR=/var/tmp gnutimeout -k 10 900 bun run check`, passes all gates and 22 tests / 169 assertions across three
reached owners. Its conservative terminal selection is all; the local terminal comparison explicitly runs the
original 67 checks. Log: `tmp/issue/ORF-T16-check.log`.

## Build delivery

[PR #195](https://github.com/remziduzagac/slipbox/pull/195) is a draft into `dev`, on
`refactor/issue-170-outside-code-checks`. Implementation/evidence commit:
`11153ddd2f385dc0d12c8a25565a4bb328fe5e6c`. The passing results above are local; final-head CI is pending.
Fresh review and merge remain separate stages; this task stays in review until both are complete.
