---
status: review
assignee:
blocked_by: [ORF-T23]
created: "2026-11-01"
---

# ORF-T24: Isolate the theme preview environment

Issue item 4, fixture isolation; a separate test-only prerequisite to resuming ORF-T3.

## Scope

Isolate the empty-theme-list preview scenario in `tests/regressions.test.ts` from inherited NO_COLOR.
Preserve its title, assertions and existing time limits. Add controlled coverage for a nonempty, empty
and absent environment setting, including restoration after the scenario.

The retained ORF-T23 diagnostic fails at the original `tokyo-night` assertion with `mono` under inherited
NO_COLOR (`tmp/issue/ORF-T23-marker-selection-traced.log`). App and its settings deliberately honor that
preference; product behavior, shared helpers, dependencies, deadlines, CI and source caps stay unchanged.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery). Observe the controlled regression fail
with the isolation fix removed once, restore it exactly, then run the affected owner, static/docs checks
and applicable terminal checks. Preserve the failed diagnostic without retrying it.

Branch: `refactor/issue-170-theme-fixture`, from origin/dev at
`e8662a7c59bac84b65dbf4fa42f218cffff4f5b1`. Carry ORF-T23's completion record unchanged.
Build, fresh review and merge remain separate stages. Confirm this prerequisite's automatic dev push
before resuming the saved ORF-T3 extraction and its scoped verification/publication.

## Implementation and controlled regression

The original scenario body moves byte-for-byte to the test-local `emptyThemePreview` function; its original
named test calls that function. NO_COLOR is saved, cleared for the whole interaction, and restored in `finally`.
One added regression invokes the same journey with `"1"`, `""` and an absent setting, checking exact restoration.
Reversing just the documented helper, registration and added case reconstructs the entire base file byte-for-byte;
all 33 original suite/leaf declarations remain and one is added. ORF-T23's completion record is carried unchanged.

Removing only the helper's NO_COLOR deletion once makes the controlled regression fail at the original theme
assertion: expected `tokyo-night`, received `mono` (two assertions, one expected failure). The fixed file is restored
byte-for-byte. Under inherited NO_COLOR=1, the original named test and added regression then pass: two tests,
15 assertions, zero failures (169 milliseconds). No unrelated failed diagnostic is rerun.

Evidence: `tmp/issue/ORF-T24-negative.log`, `ORF-T24-fixed.log` and `ORF-T24-body-audit.txt`.

## Scoped verification

`NO_COLOR=1 gnutimeout -k 10 300 bun run check` passes typecheck, boundary, size, dependency/workflow gates,
Biome and documentation checks, then the single reached test owner: 30 tests, 292 assertions, zero failures
(1.098 seconds). Documentation includes 479 Markdown and 1,738 spelt files, with zero link errors.
The seven handwritten source caps, one generated cap and nine legacy test caps remain unchanged.

The scoped terminal selector reaches no checks. Explicitly running the theme-picker scenario passes:
one check, five commands, two jobs (2.7 seconds). No source/build entry or worker moves, user behavior,
shared harness, dependency, deadline or CI changes; no user documentation or changelog change is needed.

Logs: `tmp/issue/ORF-T24-check.log`, `ORF-T24-terminal-scope.log` and `ORF-T24-terminal.log`.
The preceding dev push at the exact base succeeds on attempt 1 (`ORF-T24-previous-dev.json`).
Fresh review, merge and this prerequisite's dev push remain pending. ORF-T3 stays saved separately.
