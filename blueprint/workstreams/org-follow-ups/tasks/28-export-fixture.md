---
status: review
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
Typecheck/lint/size/docs and affected terminal/scoped validation follow before publication.

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
new controlled negative and all baseline results remain preserved. Fresh review and merge are pending separately.

## Draft publication

Draft [PR #191](https://github.com/remziduzagac/slipbox/pull/191) is open into `dev` on
`fix/issue-170-export-fixture`. Implementation/evidence commit: `fcb2b5bd`. Required scoped and affected terminal
checks pass as recorded above; the controlled negative and original T13 failure are retained. No product or test
change follows that passing verification.

Fresh review and merge are pending. Keep the PR draft; its final-head CI result is not yet claimed green. The T13
split remains local at `5035ecb1`; after this prerequisite's review/merge and green dev push, resume that build with
the helper and new subprocess reader accounted for in its manifest. No full-suite/all-terminal run, deadline change,
branch promotion or release is included.
