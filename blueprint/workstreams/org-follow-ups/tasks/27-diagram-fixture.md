---
status: done
assignee:
blocked_by: [ORF-T11]
created: "2026-11-01"
---

# ORF-T27: Isolate the cold diagram fixture

Issue item 4; test-only prerequisite found during ORF-T12's original baseline.

## Scope

Pass the rendering owner's runtime environment explicitly to its cold Mermaid child. Bun's default child environment
can retain the startup cache path after the test sets a private XDG cache; a warm persisted drawing then bypasses the
pending state the case asserts. Keep the existing title, script, assertions, hooks and deadlines unchanged.

A regression owns a controlled foreign cache, warms both diagrams through their real caller, proves the cached state,
and runs the original cold-load case twice with that cache inherited at startup. Remove only the explicit environment
once to observe the regression fail, then restore it. Product cache policy, dependencies and CI remain unchanged.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery). Preserve the original failed baseline; do not retry
it. Verify the corrected fixture, regression, affected diagram terminal scenario and bounded scoped check. Build,
fresh review and merge remain separate stages. ORF-T12 resumes after this prerequisite lands.

## Build record

- Branch: fix/issue-170-mermaid-fixture from dev 01173b89c9482456829ff0cd3b5c21ac91b9db84.
  The ORF-T11 completion record is carried unchanged; ORF-T12's move is checkpointed without test relocation.
- Original baseline: 523 pass, one cold-load failure, 39 snapshots, 60,294 assertions, 21.02 seconds. The failure
  returns code false and no pending drawings. This is the cache-dependent fixture retained by ORG-T6 and ORG-T43.
- The environment-only probe observes a private XDG_CACHE_HOME in the parent and no such value in the default child.
  DiagramJobs reads completed disk results synchronously before enqueueing. No product correction is required.
- Focused regression and timeout inventory pass: 3 tests, 17 assertions, 908 ms. The controlled cache is cold on
  its first seed and warm on the second; the unchanged original case then passes twice with that startup cache.
- Removed only env: process.env once. The new regression fails at its first original-case subprocess with exit 1
  instead of 0; restored the fixed file byte-for-byte. No failed historical selection was repeated.
  Evidence: tmp/issue/ORF-T27-unit.log, ORF-T27-negative.log and ORF-T27-negative-result.json.
- The original rendering owner stays at its exact 1,990-line cap; titles, script, assertions and hooks are unchanged.
  The new owner is 49 lines. Its default uses the existing UNIT_TIMEOUT_MS; the inventory records that site.
- The affected background-diagram terminal scenario passes: one check, six commands, two jobs, 1.8 seconds.
  Log: tmp/issue/ORF-T27-terminal.log. No terminal harness or check changes.
- Required gnutimeout -k 10 900 bun run check passes all gates and exactly three reached owners: 527 tests,
  zero failures, 39 snapshots and 60,311 assertions in 22.64 seconds of unit time. All 524 original executed case
  identities are retained, plus the new regression and two unchanged timeout-policy tests. No overflow warnings.
  Log: tmp/issue/ORF-T27-check-complete.log; identity audit: ORF-T27-evidence.json.
- The first static check stopped at the new regression's format; the second at documentation wrapping. Both
  corrected before the completed check, with no product test executed in either interrupted static run.
- Structural audit: source edges 3,131 static and 2,290 runtime, twelve entries unchanged; literal declarations
  4,085 to 4,086 solely for the regression. Zero unresolved references; original source and snapshot bytes unchanged.
  The complete original owner is identical after reversing only the explicit env edit. ORF-T11 carry is unchanged.
  Evidence: tmp/issue/ORF-T27-audit.json. No product entry or worker path moved, so no new compiled probe is needed.
- Size gate: 577 source and 580 test/fixture files; seven test caps unchanged. Docs: 482 Markdown, 1,788 spelt files;
  lint: 1,187 files. User behavior is unchanged; no user-doc/changelog update applies to this test-only fix.
- Draft PR: [#189](https://github.com/remziduzagac/slipbox/pull/189), open into dev. Implementation/evidence
  commit: 21364bd148b2f01a55daccfc92ef50993e7d1a77. Fresh review and merge are pending separate stages.
  ORF-T12 remains todo until this prerequisite lands; its planned relocation and original baseline are preserved.

## Review and merge

- Fresh review at 9b312ff034e729852f2e8421c1827f3075cc1218 finds no actionable issue. Exact-base reversal
  preserves the complete original owner, timeout inventory, snapshot bytes and carried T11 completion.
  Source graphs remain 3131 static / 2290 runtime edges, twelve entries and zero unresolved references.
- Fresh bounded scoped check passes all gates and 527 tests / zero failures / 39 snapshots / 60311 assertions /
  three owners / 22.17 seconds unit time. The affected diagram terminal scenario passes one check / six commands /
  two jobs / 1.8 seconds. Preserved negative control inspected without repeating it.
  Review: tmp/issue/review-ORF-T27.md; logs: ORF-T27-review-check.log and ORF-T27-review-terminal.log.
- [CI 41305707399](https://github.com/remziduzagac/slipbox/actions/runs/41305707399) and
  [CodeQL 41305704045](https://github.com/remziduzagac/slipbox/actions/runs/41305704045) succeed at that head
  on attempt 1. Previous dev 41304394407 succeeds at unchanged base 01173b89 on attempt 1.
- Marked [PR #189](https://github.com/remziduzagac/slipbox/pull/189) ready and squash-merged with the exact-head
  guard. Squash: 7e697b80bc8e8a348f91a8c4cd80250c51f5d586, 2026-11-01 12:20:22 UTC. The entire merged
  tree equals the reviewed head; sole parent is the preceding green base.
- Automatic [dev push 41306016020](https://github.com/remziduzagac/slipbox/actions/runs/41306016020) succeeds
  at that squash on attempt 1, including both reached-unit platforms, lint/site/changes and aggregate CI.
  Terminal/status jobs are skipped for test-only scope; no terminal execution claimed for the push.
- Carry this completion record onto the resumed ORF-T12 branch from latest dev. Original baseline failure remains
  recorded; no failed selection or job retried, no product behavior or deadline changed.
