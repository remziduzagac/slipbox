---
status: review
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

## Implementation and verification

Branch: `refactor/issue-170-uninstall`, from `origin/dev` at
`3a83e20eda58486b3cf5bf59b06e3eba0c69cc80` (#171's squash). Build is complete; fresh review and merge are pending.

`tests/cli/distribution/install.test.ts:13` wraps this owner's CLI calls with a home inside its existing sandbox,
clearing the inherited Claude/Codex directory overrides and their Homebrew-prefixed fallbacks. The shared CLI helper
and its other owners are unchanged. The sandbox's existing cleanup removes the private home too; the original
uninstall, upgrade and channel titles and assertion bodies are retained.

The three regression cases at `tests/cli/distribution/install.test.ts:42` use controlled default, explicit and
Homebrew directory settings outside that home. A read-only control proves the foreign settings discover three/two/two
skills. The isolated fixture discovers none, then lists only the three skills it installs in its own home. Listing
preserves them; `--yes` removes them, keeps the config and leaves every foreign skill byte-identical.

Removing only the five home/directory overrides once makes all three cases fail at the empty-removal assertion:
three/two/two foreign skills appear instead. Command:
`gnutimeout -k 10 300 bun test tests/cli/distribution/install.test.ts -t 'uninstall fixture discovers only'`.
The fix was restored byte-for-byte before verification. The failed control is retained, not retried away.

`gnutimeout -k 10 300 bun run check` passes typecheck, boundary, source/test sizes, dependency/workflow gates, Biome
and documentation checks, then both reached unit owners: 16 tests, 285 assertions, zero failures (7.59 seconds).
`scripts/ci-scope.ts` selects this fixture and `tests/cli/launcher/dispatch.test.ts`, with no terminal checks reached.
No product source, deadline, dependency, screenshot or user-visible behavior changes, so no user-doc/changelog change
is needed. The carried ORF-T1 completion record is the only other task edited.

The preceding [dev push](https://github.com/remziduzagac/slipbox/actions/runs/41237804189) at the base is still running,
with no completed failure observed during this build. Its successful completion remains a prerequisite for the next
merge; this build does not mark it green.
