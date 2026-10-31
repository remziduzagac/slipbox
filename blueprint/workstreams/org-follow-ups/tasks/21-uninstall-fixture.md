---
status: todo
assignee:
blocked_by: [ORF-T1]
created: "2026-10-31"
---

# ORF-T21: Isolate the uninstall fixture's home

Issue item 4, host assumptions; follows ORF-T1's PR #171 immediately, before ORF-T2. This is its own test-only PR.

## Scope

Give the uninstall fixture in `tests/cli/distribution/install.test.ts` its own temporary home so it discovers only
what the fixture installed. The listing-only assertion at line 15 currently discovers installed host skills instead
of an empty list, the assumption already recorded by
[ORG-T43](../../code-organization/tasks/43-measurement-and-build.md). Preserve the existing uninstall assertions and
cleanup; change no product behavior, dependency or timeout.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery). Add a regression using controlled foreign-home
skills outside the fixture's home, so the isolation test fails without the fix even on a clean host. Verify that the
fixture sees only its own installs and leaves the foreign skills untouched. Observe the regression fail with the fix
removed once, then restore it and run the affected tests.

Record the branch/PR, regression controls, checks and unresolved findings here. Build from the latest origin/dev
after #171, with product source unchanged. Mark done only after merge; review and merge remain separate stages.
