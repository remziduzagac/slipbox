---
status: done
assignee:
blocked_by: [ORF-T12]
created: "2026-11-01"
---

# ORF-T28: Isolate export fixture root discovery

Issue item 4; separate test-only prerequisite before ORF-T13 under the standing host-fixture isolation rule.

## Scope

The export fixture creates `.slipbox` roots and loose files below a temporary folder. Its loose-file overwrite cases
assume no ancestor checkout: `noteOfARoot` discovers an ancestor `.git` and correctly refuses the file as a note.
Control the fixture's root markers explicitly, preserving the original scenario titles, assertions and deadlines.
Restore the previous marker list after the owner; product root discovery remains unchanged.

## Evidence and acceptance

Branch: `fix/issue-170-export-fixture`, from green `origin/dev` at `aae897b4`. T12's completion record is carried
unchanged. ORF-T13 remains checkpointed locally at `5035ecb1`; no split is part of this prerequisite.

The T13 baseline passes 62 tests / 712 assertions; its relocated selection has 60 passes / two failures. Both failures
classify loose Markdown files as notes. A controlled non-test ancestor-marker comparison reproduces that result.
The actual ancestor during the failed run was not captured: a later unrestricted check sees none under `/tmp`,
while the sandbox sees a read-only `/tmp/.git`. Do not infer the historical namespace from that later observation.
The failed selection remains preserved without a retry or passing comparison claim.

Extract only the original environment setup into `tests/support/export-sandbox.ts`, select the `.slipbox` markers
already created by the fixture, and restore prior markers afterAll. A new regression first proves its controlled
ancestor is discoverable, then runs both unchanged original overwrite cases beneath it. Observe that regression
fail with only marker isolation undone once, restore fixed bytes, and run affected tests, terminal scenarios and
the bounded scoped check. Lower the original owner's exact cap to its measured size; no cap or deadline increase.

No product source, worker, package, build, dependency, CI or user-visible behavior change; no user-doc/changelog
change applies. Build, fresh review and merge remain separate stages. Mark done only after merge/dev verification.

## Focused verification

The [extraction manifest](../manifests/t28-export-fixture.json) records the exact setup boundary. Reversing the setup
call/import and original tmpdir import reconstructs the entire original owner byte-for-byte; the PNG beforeAll and
all original titles/assertions remain. The original owner shrinks from 1,624 to 1,619 lines; its exact cap is lowered.
T12's carried completion is byte-identical to the saved record.

Removing only `setRootMarkers([".slipbox"])` once makes the controlled ancestor regression fail: the discovery
control succeeds, then the nested original-owner selection exits 1 instead of 0. The helper is restored byte-for-byte
in finally. The fixed original owner, regression and timeout inventory pass 63 tests / 717 assertions / zero failures
in 8.93 seconds. Preserved logs: `tmp/issue/ORF-T28-negative.log`, `ORF-T28-unit.log`; body audit: `ORF-T28-body-audit.json`.
Completed typecheck/lint/size/docs and affected terminal/scoped validation are recorded below.

## Scoped and terminal verification

`gnutimeout -k 10 900 bun run check` passes every static/docs gate and exactly three reached owners: original export,
the new ancestor regression and the size guard. Result: 69 passes / zero failures / 754 assertions / 8.48 seconds unit
time. Log: `tmp/issue/ORF-T28-check.log:111`. Docs: 483 Markdown / 1,802 spelt files / zero link errors; Biome: 1,198
files. Sizes: 577 source / 591 test and fixture files, zero handwritten source exceptions and six test caps; only the
export cap lowers by five lines. No whole-suite fallback or overflow warning.

The same three export terminal scenarios pass before and after: all five formats, prior-export recognition and
note-overwrite refusal. Three checks / four commands / two jobs, 3.6 seconds before and 3.7 after. Command:
`SLIPBOX_TERMINAL_JOBS=2 gnutimeout -k 10 300 bun run test:terminal 'export: PDF, a web page' 'export: an earlier PDF'
'export: a note named as the file'`. Log: `tmp/issue/ORF-T28-terminal.log`. The changed-file selector reaches no terminal
checks; these are explicit affected checks.

Structural capture retains 3,131 static / 2,290 runtime source edges, twelve entries and zero unresolved references.
All 4,086 original declarations remain; only the new regression is added. The ten export-source selections and their
terminal selectors stay identical; the actual PR selects exactly the three executed owners. Whole-file reversal,
raw executed identity comparison and T12 carry checks pass. Evidence: `tmp/issue/ORF-T28-structure.json`,
`ORF-T28-verification-summary.json` and `ORF-T28-body-audit.json`.

No product/worker/build/asset/terminal implementation moves, so compiled-product probes from the preceding source
work remain applicable; no repeated build is needed for this test-only setup change. Historical T13 failures, the
new controlled negative and all baseline results remain preserved.

## Publication and review

[PR #191](https://github.com/remziduzagac/slipbox/pull/191) was published into `dev` on
`fix/issue-170-export-fixture`. Implementation/evidence commit: `fcb2b5bd`; reviewed head:
`cab986de0c5f7ca2122e1bcdda991bc17c6a876e`. Required scoped and affected terminal checks pass as recorded above;
the controlled negative and original T13 failure are retained. No product or test change follows that verification.

Fresh review found no actionable findings across all eleven paths. Independent whole-file reversal, preserved
identities/source graphs/build entries and unchanged T12 completion carry pass. Fresh bounded scoped verification
passes every gate and 69 tests / zero failures / 754 assertions across three owners, 8.38 seconds unit time.
The same three affected terminal scenarios pass four commands / two jobs, 3.7 seconds. Review and logs:
`tmp/issue/review-ORF-T28.md`, `ORF-T28-review-check.log:111` and `ORF-T28-review-terminal.log:2`.

PR [CI](https://github.com/remziduzagac/slipbox/actions/runs/41309488478) and
[CodeQL](https://github.com/remziduzagac/slipbox/actions/runs/41309485208) pass at the exact reviewed head on
attempt 1. Both unit platforms, lint/site/changes and aggregate CI pass; terminal/status are skipped by PR policy.

## Merge and dev verification

The preceding [dev push](https://github.com/remziduzagac/slipbox/actions/runs/41307899497) passes at exact base
`aae897b4dc8c92b39112e1b055967896335e1481` on attempt 1. PR #191 was marked ready and squash-merged with
`--match-head-commit cab986de0c5f7ca2122e1bcdda991bc17c6a876e` on 2026-11-01 at 13:16:32 UTC. Squash:
`9f975f5977018c16edb91ddd2bb616ed3ce5de77`. The entire merged tree equals the reviewed head byte-for-byte;
its sole parent is the preceding green base.

The automatic [dev push](https://github.com/remziduzagac/slipbox/actions/runs/41310467440) passes at that exact
squash on attempt 1. Both reached-unit platforms, lint/site/changes and aggregate CI pass. Terminal/status jobs
are skipped for test-only scope; no terminal execution is claimed for this push. Final metadata and tree audit:
`tmp/issue/ORF-T28-merge-dev-result.json` and `ORF-T28-merge-tree-audit.json`.

No test, failed selection/job, probe or control was repeated during merge. The T13 split remains local at
`5035ecb1`; resume that build from latest `dev`, carrying this completion record and accounting for the helper and
new subprocess reader in its manifest. No full-suite/all-terminal run, deadline change, branch promotion or release
is included.
