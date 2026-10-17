---
status: current
created: "2026-10-16"
---

# Research: maintenance and accessibility follow-ups

## Summary and scope

Six proposals were checked against local source at `9b3854c` on 2026-10-16. Provenance below is *read*, except line
counts, obtained with *ran* `wc -l`. No benchmark, screen reader, recovery drill, live account audit or screenshot
capture was run. Findings describe this checkout, not an assurance about current GitHub main or the pending D235
split branch. Recheck the implementation baseline before planning changes.

The gaps merit later evaluation outside ENG. This report verifies existing mechanisms and missing coverage; it
does not accept a new feature, access grant, test limit or timing budget. Review order and IDs live in
[roadmap.md § Deferred maintenance review](../roadmap.md#deferred-maintenance-review-27x).

## Performance regression guard

**Supported, with qualification.** `scripts/bench.ts:48` generates 20,000-line notes; lines 110, 167 and 177 time
opening, lens typing and leaving insert. The script prints timings and has no stored threshold/baseline verdict.
No bench invocation was found in `.github/workflows/`. `blueprint/design/testing.md:239` explicitly describes timings
as machine-dependent and outside `bun run check`.

Structural performance checks already exist: `tests/tui.test.ts:6955` checks that background indexing parses big
note chunks off the main thread. Therefore regressions are not wholly invisible, but slower implementations that
retain the same work structure lack a timing guard. No claim that this is the largest gap is established here.

**Evaluate:** a small isolated benchmark subset, stable fixture/toolchain metadata, repeated samples and a generous
ceiling, or a scheduled trend report with retained comparable runs. Measure runner variation before choosing gates;
terminal wait allowances are not benchmark calibration. Preserve structural checks alongside timing evidence.

## Accessible CLI follow workflow

**Supported gap; benefit and cost unverified.** `ACCESSIBILITY.md` § Screen readers acknowledges that the TUI is
untested with screen readers and difficult to follow, recommending plain CLI output. No `--follow` binding was found
in `src/cli/` or `docs/manual/cli.md`. Existing one-shot output does not provide a continuous reading workflow.

**Evaluate:** saved-file follow for read/plain render, with an explicit initial snapshot and changed-content output.
Design update boundaries, replacement/deletion/rename handling, atomic saves, coalescing, backpressure and clean
interrupts. Reprinting entire notes can overwhelm speech output; changed lines lose context unless identified.
ANSI-free output alone does not prove accessibility. Validate with screen-reader users or a named reader/terminal
setup before claiming an accessibility improvement. Saved follow and attached live-buffer observation are distinct
choices; no attachment or content-source default should change implicitly. A new command/flag needs its own design.

## Test-file size discipline

**Supported.** `scripts/check-size.ts:63` walks `src/` only. Line counts in this checkout are 18,825 for
`tests/tui.test.ts` and 10,157 for `tests/vault.test.ts`. The quoted App cap is not current even in this checkout:
`CAPPED` lists 13,000, not 11,650. D235 split work may further change the baseline.

**Evaluate:** a ratchet for existing large tests and a measured limit for new files, splitting by owner/behavior and
extracting reusable fixtures. A 3,000-line limit is an option, not an agreed value. Preserve isolation, hook/setup
semantics, test discovery and focused execution; moving lines alone does not improve test design.

## Local diagnostics bundle

**Supported gap, with existing overlap.** `src/cli/cli.ts:2197` implements doctor, whose no-file form already exists;
its focus is server/linter discovery. The help at lines 394–395 also lists file diagnostics. No consolidated local
support-bundle operation was found in the CLI handlers reviewed. `docs/manual/privacy.md` describes local-first
privacy and explicit network activity.

**Evaluate:** a separate command or deliberate doctor extension, with version/platform, capabilities, warnings and
bounded health summaries. A fresh CLI cannot know a crashed TUI's recent in-memory messages without prior retention;
identify which fields are available locally versus only through an attached live instance. Exclude note text,
secrets, raw configuration/environment and unredacted paths/messages by default. Preview what is collected, write
only to an explicit local destination and send nothing. Do not install/start tools or perform network probes as an
incidental collection effect. Scope and redaction need design before implementation.

## Access continuity

**Documentation supports concentration; live state not verified.** `MAINTAINING.md:27` describes one owner for the
repository, tap and Pages; line 44 states nobody else has admin access. This is documentary evidence, not a fresh
permission audit. No dedicated continuity report was found in `scripts/health.ts`. Calling it the largest risk is
a value judgment; the project's personal-first purpose affects its priority.

**Existing recovery coverage:** `tests/distribution.test.ts:782` and other fixtures use `SLIPBOX_RELEASES_URL` with
local release mirrors. These tests cover parts of mirror routing, not a complete organizational takeover or a
published alternate release/update/channel path.

**Evaluate:** a non-destructive recovery exercise using isolated install/state and synthetic releases, and an upkeep
reminder that reports documented recovery readiness. Assess preview-channel routing separately. A second trusted
administrator is an owner choice with broad authority, not an automatic remedy or authorized settings change.
Do not simulate account loss or change collaborators/production endpoints as part of a dry run.

## Screenshot drift

**Supported freshness gap, with existing tooling tests.** `tests/terminal/herdr/shots.ts:1` describes capture through
a real herdr pane and line 12 selects `docs/images`. AGENTS.md requires retaking screenshots after UI changes.
No shots/images reminder was found in `.github/workflows/`, `MAINTAINING.md` or `scripts/health.ts`.
`tests/docs.test.ts:418` tests screenshot conversion; it does not compare current UI output with published images.

**Evaluate:** a non-blocking reminder when relevant rendering/workflow changes lack image changes. Define affected
paths and allow an explained no-visual-change result. Such a reminder detects possible drift, not proven staleness;
changed images can also be stale. Prefer an actionable PR/check annotation; a weekly summary can retain unresolved
items. Real captures remain under the existing terminal workflow rather than a second renderer.
