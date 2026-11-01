---
status: review
assignee:
blocked_by: [ORF-T4]
created: "2026-10-31"
---

# ORF-T5: Separate vault prompts from switching

Issue item 1; ORG-T11 vault follow-up.

## Scope

Characterize cancellation/reset/restore order, unsaved-buffer refusal, location identity and focus before separating
catalog/prompts from the switch transaction in src/tui/workspace/vaults/vaults.ts. Preserve behavior and remove its
exact cap at or below 600 lines.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Build record

- Branch: `refactor/issue-170-vaults`, from `origin/dev` at
  `4a14ff8d7afbc51eb0b9534b4aabe0f6fb359004`; previous task completion carried unchanged.
- Preceding dev push [41256614355](https://github.com/remziduzagac/slipbox/actions/runs/41256614355)
  succeeds at that exact base, attempt 1. Health #106 last ran 2026-10-26, within eight days.
- Characterize switch lifecycle, pending cancellation and live prompt context before extracting. Keep `Vaults` as
  the transaction, trail, visit and pending-choice owner; catalog and mutation prompts move to `VaultPrompts`.
- No tracked file relocation, retired path, worker, build entry or asset change. Existing controller entry points
  remain available; the extraction manifest records exact member destinations and retained ownership.

## Extraction and characterization

- Manifest: [exact members and dependencies](../manifests/t5-vaults-extraction.json), recorded before source edits.
  No relocation or retired path; no `git mv` needed. Twelve interaction methods move behind existing entry methods.
- `vaults.ts`: 636 → 437 lines; `vault-prompts.ts`: 275. Removed only the vaults cap; four handwritten source caps
  remain. Shared workspace state and all note writes keep their original owners.
- Body audit: all twelve extracted bodies and their documentation match; `renameItem` changes only its prompt
  type assertion to a non-null assertion. Ten retained methods, including the entire switch transaction, and the
  `carried` function remain byte-identical. Live capabilities retain no location, graph or view snapshot.
- Three new characterizations cover lifecycle order, pending cancellation and live prompt context/focus. The same
  four-owner before/after selections pass 15 tests / 127 assertions, 1.91 / 2.04 seconds. Existing cases unchanged.
- Initial new prompt assertion expected the wrong fixture name; corrected against unchanged source and strengthened
  with a distinct destination name. Initial 14-pass/one-failure log retained. Initial typecheck's test-only region
  narrowing corrected; final typecheck and Biome pass. Neither finding identifies a product defect.
- The same three terminal scenarios pass before and after: switch choices, explorer make/unmake and leader-key
  make/unmake. Three checks, 17 commands, two jobs; 4.6 / 5.1 seconds. No existing deadline changed.
- Structural capture preserves all 4,061 original declarations and adds only the three characterizations. All twelve
  entries resolve; static edges 3,011 → 3,021, runtime 2,253 → 2,256, zero unresolved/stale paths. Runtime SCC
  memberships unchanged (2/5/8). Scoped unit owners 263 → 264, adding only the new owner, no whole-suite fallback;
  conservative terminal selection remains all. Only the three affected scenarios run.
- Host package build passes with all original entries/flags, 1,465 modules. Artifact SHA256:
  `32c5320ec2b3a2526f34f0e2f4f249ff179afbf6e4d31a8c82ed34e4e381c452`.
- Logs and audits: `ORF-T5-before-unit-corrected.log`, `ORF-T5-after-unit.log`, `ORF-T5-body-audit.log`,
  `ORF-T5-before-terminal.log`, `ORF-T5-after-terminal.log`, `ORF-T5-structure.log` and `ORF-T5-build.log` in
  `tmp/issue/`. The carried ORF-T4 completion record matches its saved file byte-for-byte.

Three isolated CLI probes per mode pass from source and the copied package binary. The same three terminal checks
also pass against that binary, started outside the source tree with the harness's isolated home/XDG directories and
unchanged check bodies, command traces and deadlines (`tmp/issue/ORF-T5-probes.log`). No worker moved or changed.

## Required verification

`gnutimeout -k 10 900 bun run check` passes every static/docs gate and the 264-owner selection: 1,804 pass,
two existing walk-thread skips, zero failures, 17,161 assertions, 329.06 seconds. No timeout-overflow warnings or
whole-suite fallback. Docs cover 480 Markdown / 1,749 spelt files, zero link errors; four handwritten source caps,
one generated cap and nine test caps remain. Log: `tmp/issue/ORF-T5-check.log`.

Draft publication follows; fresh review and merge remain separate stages. No behavior change, discovered product
bug, user-documentation/changelog change, dependency/CI change or full-suite/all-terminal run is included.
