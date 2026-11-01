---
status: done
assignee:
blocked_by: [ORF-T2]
created: "2026-11-01"
---

# ORF-T22: Isolate the stat metadata fixture

Issue item 4, host assumptions; a separate test-only prerequisite to publishing ORF-T3.

## Scope

Run the stat scenario in `tests/cli/reading/metadata.test.ts` against its existing sandbox copy of the demo vault.
Keep its title, properties assertions and `/vault\s+halden\n/` expectation; the checkout's location must not decide
the expected label. The known linked-worktree assumption is recorded by
[ORG-T43](../../code-organization/tasks/43-measurement-and-build.md), and blocks ORF-T3's scoped check.

Existing root-label tests cover only locations without a worktree. Add a controlled main checkout and linked
worktree case that exercises stat's plain versus branch-qualified human label and its unchanged JSON identity.
Do not change product source, shared helpers, user behavior, docs/changelog, dependencies, deadlines or CI.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery). Remove the fixture change once in this linked
worktree to observe the original assertion fail, restore it byte-for-byte, and run the affected tests. Preserve the
controlled worktree coverage independently of the isolation change. No failed unrelated selection is retried.

Branch: `refactor/issue-170-stat-fixture`, from latest `origin/dev` at
`19be598d2cbc783455e728484dc2fe7a8d72bbe8`. The preceding ORF-T2 dev push succeeds on attempt 1. ORF-T3 remains
saved on its own local branch; its resolver extraction is not included here.

Record checks and PR delivery here. Build, fresh review and merge remain separate stages; mark done after merge
and confirm the dev push before resuming ORF-T3's rebase, remaining probes, scoped check and publication.

## Implementation and verification

`tests/cli/reading/metadata.test.ts:60` uses the fixture's existing sandbox copy for both stat calls and the expected
root. The original title, JSON name/properties assertions and `/vault\s+halden\n/` expectation remain. Shared CLI
helpers and product source are unchanged. The existing sandbox cleanup owns every new fixture directory.

The case at line 67 initializes a controlled repository, commits its named vault and note, and adds a linked
worktree. Its folder is `linked` and its branch is `feature/stat-label`, so the assertion proves the human label
uses the checked-out branch. The main checkout retains its plain label; the linked checkout's JSON keeps the
unqualified vault identity and its own root path. Git setup and each CLI command must succeed.

Removing only the three sandbox-root substitutions once in this linked worktree makes the original stat assertion
fail: the output has `halden@refactor/issue-170-stat-fixture`, not `halden`. The new controlled-worktree case passes
in that same run. Command: `gnutimeout -k 10 300 bun test tests/cli/reading/metadata.test.ts -t stat`. This pattern
also selects the existing footnote usage case through its surrounding `empty states` suite. Negative result:
two pass, one expected failure, 26 assertions. The fixed file was restored byte-for-byte.

The restored focused selection passes all three cases with 26 assertions (2.46 seconds). Required
`gnutimeout -k 10 300 bun run check` passes typecheck, boundary, source/test sizes, dependency/workflow gates,
Biome and documentation checks, then both reached owners: CLI dispatch and metadata, 18 tests, 243 assertions,
zero failures (8.89 seconds). No failure was retried unchanged; no whole-suite run was used.

`SLIPBOX_TERMINAL_JOBS=2 gnutimeout -k 10 300 bun run test:terminal:changed` succeeds with no checks reached.
No TUI/product module, worker,
entry point, snapshot, fixture path, dependency, cap or deadline moves. The only code change is this test owner,
so no compiled build, terminal-feature execution, screenshot, user-doc or changelog update is required.

Local logs: `tmp/issue/ORF-T22-negative.log`, `ORF-T22-stat-fixed.log`, `ORF-T22-check.log` and
`ORF-T22-terminal-scope.log`.

## Draft delivery

Draft [PR #175](https://github.com/remziduzagac/slipbox/pull/175) was opened into dev. Implementation commit:
`bf94870491db624f658691810cf6c64b1546c12f`; final delivery head:
`2a99075c0800108453b22374f06153c350543e13`.
Final documentation verification includes the new task: 477 Markdown files and 1,736 spelt files. No product tests
are repeated for the delivery-record update. ORF-T3's local checkpoint remains separate and unpushed.

## Review and merge

Fresh review at the final delivery head found no actionable findings. Its independent scoped check passes every
static/docs gate and both reached unit owners: 18 tests, 243 assertions, zero failures (8.69 seconds). Terminal
selection succeeds with no checks reached. PR CI and CodeQL pass at that exact head on their first attempts;
the preserved negative control was inspected without repeating it.

The preceding [dev push](https://github.com/remziduzagac/slipbox/actions/runs/41240966128) at the base passes on
its first attempt. Lint/site and aggregate CI pass; unit and terminal jobs are skipped for that documentation-only
scope. Its successful completion and the unchanged remote base were verified before this merge.

PR #175 was marked ready and squash-merged with the reviewed head matched exactly, on 2026-10-31 at 21:22:29 UTC,
as `5254a04494a9f57176795353c3b170c1ea89626d`. The merged tree is byte-identical to the reviewed head.
The automatic [dev push](https://github.com/remziduzagac/slipbox/actions/runs/41243296407) at that merge passes on
its first attempt: both reached-unit platforms, lint/site, changes and aggregate CI. Terminal/status jobs are
skipped for this test-only scope; no terminal-feature execution is claimed.

ORF-T3 build is next: rebase its saved extraction onto latest dev, then finish its remaining probes, scoped check
and publication. ORF-T3 is not complete; no failed job or selection was rerun.
