---
status: done
assignee:
blocked_by: [ORF-T18]
created: "2026-10-31"
---

# ORF-T19: Prove unused-code dispositions

Issue item 5; ORG-T41 candidate ledger and ORG-T43 refresh.

## Scope

Reconcile all 84 type and 197 runtime-export candidates from the T41 ledger with current entry-aware discovery (T43
retained 194 runtime exports after new tests consumed three). For each, record remove or keep with evidence covering
imports/re-exports, dynamic consumers, workers, build entries, tests, scripts and documented/non-TypeScript uses.
Remove only proven unused declarations; add no dependency and change no public command or persisted key. Use child
tasks for independent cleanup batches if necessary.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery) and approved ORG ownership and move rules.
Record the branch/PR, characterization, exact changes, checks and unresolved findings here. Mark done only after merge;
implementation and review evidence do not by themselves close the task.

## Candidate proof and implementation

The [disposition ledger](../manifests/t19-unused-code.json) covers all 197 runtime-export and 84 type candidates
from ORG-T41, plus four report sites introduced by ORF-T4/T9's output/opening extractions. The union is 285 sites:
eleven removed and 274 kept. Every keep names a live compiler-resolved use or a compatibility alias of a live lower
owner under ORG-D1. Owner-local implementations and structural types remain because those references require them;
unused forwarding surfaces retain the established entry contract rather than dropping live implementations.

Entry-aware Knip **6.43.0** uses the unchanged build/worker, source, test, process-fixture, terminal/shot, script and
site discovery. The current baseline has 198 runtime-export and 84 type findings: three T41 tokenizer callbacks
acquired direct tests in ORG-T42, while four output/opening aliases added report sites. The ledger accounts for both
deltas. Self-recursion alone is not a caller: HAST's `plain` helper has only its own recursive reference.
Compiler-resolved references cover imports, re-exports and accesses through dynamic/namespace imports. Every
retained candidate has a reference path to a use outside the candidate declarations; no isolated recursive group
is retained as evidence of its own use.
Repository text searches separately check scripts, fixture strings, documented invocations and non-TypeScript uses.

These candidate declarations have no caller; all eleven are removed with their attached comments:

| Owner | Declaration |
| --- | --- |
| `core/application/commands/catalog.ts` | `commandSpec` |
| `core/documents/diagnostics/spell.ts` | `BUNDLED_LANGUAGES` |
| `core/documents/editing/snippet.ts` | `snippetText` |
| `core/documents/markdown/obsidian.ts` | `isComment` |
| `core/foundation/text/width.ts` | `widthMethod` |
| `core/rendering/export/assets/fonts.ts` | `faceName` |
| `core/rendering/export/formats/hast.ts` | `plain` |
| `core/rendering/layout/ir.ts` | `spanWidthText` |
| `core/workspace/links/write-link.ts` | `pointerTo` |
| `tui/documents/editing/cursor.ts` | `samePos` |
| `tui/workspace/git/views/branches/gitbranchview.ts` | `vaultPath` |

Paths above are relative to `src/`. The now-unused `basename`, `inVault` and `PhrasingContent` import specifiers leave their
respective owners too. Name collisions are recorded individually: OpenTUI's `widthMethod` property, capture's `snippetText`,
completion's `pointerTo`, the mutation-local `vaultPath` and a registry parameter named `commandSpec` stay. The links
design now cites the live `pointerAt` implementation instead of its unused wrapper. No module moves, worker/build
entries, public commands, persisted keys, dependencies, fixtures or user-visible behavior change.

Repeat discovery has **187 runtime-export and 84 type findings**, exactly the eleven intended removals and no new
candidate. All 84 types have named uses in their owner or its structural contracts. Six existing type-only
`hast`/`unist` package-ownership findings remain outside this dependency-free cleanup; unused-file, dependency,
dev-dependency, binary, duplicate-alias and unresolved-entry findings remain zero. Knip's nonzero diagnostic status
is expected for these retained findings.

## Verification

The bounded focused run passes **70 tests**, **568 assertions**, across ten affected owners: command catalog,
spelling, snippets, Markdown rendering, widths, PDF fonts, layout mechanisms, pointers, cursor editing and Git
branches. Existing tests exercise the retained behavior; this cleanup adds no behavior or bug fix.
Logs: `tmp/issue/ORF-T19-focused.log`, `ORF-T19-knip-{before,after}.{json,err}` and `ORF-T19-analysis{,-after}.json`.

Eight affected terminal checks pass with `SLIPBOX_TERMINAL_JOBS=2`: wide-character layout, spelling, palette,
PDF/other exports, pointers, branch listing, language-server completion and source-mode selection/editing.
They exercise 33 named commands. Typecheck, lint, boundary, size and documentation gates pass; source and test
legacy caps remain zero. Logs: `tmp/issue/ORF-T19-{terminal,typecheck,lint,boundary,size,docs}.log`.

After the final HAST removal, its HTML and EPUB owners pass **9 tests**, **136 assertions** across two files
(`tmp/issue/ORF-T19-hast.log`). The earlier export terminal scenario covers the same unchanged rendering paths.

The required `TMPDIR=/var/tmp gnutimeout -k 10 900 bun run check` passes: **3,226 tests**, **two skips**, **39
snapshots**, **91,066 assertions**, across **427 selected files** in 497.66 seconds. All preceding static/docs gates
pass in that run. Log: `tmp/issue/ORF-T19-check.log`. Branch: `refactor/issue-170-unused-code`, based on
`6ca74642fa5de706405db8176c18dae25cbb5110`. The preceding dev push 41336398508 passes on all three terminal platforms.

## Delivery

[PR #198](https://github.com/remziduzagac/slipbox/pull/198) targets `dev` from
`refactor/issue-170-unused-code`. Implementation and verification commit:
`eea8a09e54ee83b258abdf3cc27fc61c4093cbb4`. Final reviewed and merged head:
`aaf984955a0ad82b0675b4560bfe0c7c08a5a172`.

## Review and merge

The fresh review found no actionable issues. All 285 candidate sites reconcile: eleven removals and 274 retained
sites with 397 compiler-resolved cited uses. Fresh affected tests pass 79/79 with 704 assertions; typecheck, size,
boundary and diff checks pass. Review: `tmp/issue/review-ORF-T19.md` and `ORF-T19-review-*.log`.

CI and CodeQL pass at the exact reviewed head. Before merge, the preceding dev push
[41336398508](https://github.com/remziduzagac/slipbox/actions/runs/41336398508) passed, including all three terminal
platforms. PR #198 was marked ready and squash-merged on 2026-11-01 with the reviewed-head guard; squash:
`703b60e950218591b8801b9096200158a72618b9`.

The automatic dev push [41339227065](https://github.com/remziduzagac/slipbox/actions/runs/41339227065) is running.
Merge evidence: `tmp/issue/ORF-T19-merge-*.json`.
