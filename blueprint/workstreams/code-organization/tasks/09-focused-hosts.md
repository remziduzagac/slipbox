---
status: review
assignee:
blocked_by: [ORG-T22]
created: "2026-10-26"
---

# ORG-T9: Pure TUI test boundaries

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Extract editable and drawing primitives below composition; remove topbar imports from generic model support and isolate
pure location/geometry tests. Keep App integration journeys. CLI and controller seams have separate PRs.

### Issue coverage and ownership

Place pure helpers under their document or shell owner. Add forbidden reverse-edge fixtures and retain full-App
journeys; no new window/tab behavior. Report actual dependency reductions rather than only file counts.

## Evidence required

Focused unit tests plus retained App and launcher journeys for each seam. Repeat mapped where/export-stream/regex scope
measurements; report failures and incomplete runs honestly.

## Implementation and dependency evidence

Baseline is ORG-T22. The [ownership manifest](../manifests/t9.json) names the extracted declarations, relocated App
journey and exact runtime component memberships; the [extraction delta](../manifests/t9-extraction.json) is the explicit
expected difference, checked against the immutable pre-extraction capture. This is an extraction rather than a
whole-file move: no old filename is retired, no basename changes and no retained-path exemptions are needed.

`documents/editing/editable.ts` takes only source/live presentation flags. Its eleven editing clients keep genuine App
types but no longer load App for this predicate. Drawing geometry, styling and controls live under `shell/screen/`;
controls accept only their leader/glyph or theme/hover capabilities. Breadcrumb and mode-button layout live under
`documents/views/header-layout.ts`; `shell/input/modes.ts` uses the presentation flags without importing App. Pure
location fitting is separate from the App-backed `locationItems` selector. The generic model harness imports that
selector directly, rather than top-bar composition. No compatibility exports remain in the source composers.

File-owned sandbox setup, including the unchanged XDG/clipboard configuration, timeout and captured-directory cleanup,
is in `tests/support/tui/sandbox.ts`. The existing harness re-exports its entry point for integration owners. Registry
filtering is in `tests/support/vault-roots.ts`; peek reading stays in the UI-only `peek-reading.ts`, leaving the shared
peek filesystem/worker fixture independent of App. Existing fixture hooks remain per file. The timeout guard follows
the moved call into the sandbox module; no timeout value changes.

The former atomic-files owner contained one real App journey: “a temporary file of the index left by a thread let go
of mid-write is swept once it's old (#10)”. It moves intact to the peek `index-cleanup.test.ts` owner with its original
counter/fixture helper. The pure location fitter and two header-layout cases move intact to dedicated owners. Their
parent suite title is preserved, adding one wrapper declaration. All original leaf callbacks remain identical after
import/path normalization; the only changed existing guard callback updates the timeout-site path. All 24 extracted
declarations and remaining source executable bodies match the baseline after import/export normalization. File-owned
sandbox, registry filtering, peek reading and the relocated counter helper preserve their implementations.

The graph has 1,955 → 2,010 static edges and 1,614 → 1,637 runtime edges: static removals/additions are 5/60; runtime
removals/additions are 21/44. More small modules add explicit edges while removing reverse composition dependencies.
The test declaration multiset is 3,730 → 3,742: eleven characterization/guard tests and one duplicate parent suite,
none removed. Build entries and worker URLs are unchanged; imports and build entries all resolve. App shrinks from
1,459 to 1,454 lines and its exact cap follows; no cap increases are needed.

The 64-module TUI runtime component becomes six components of 8, 8, 5, 3, 2 and 2 members; the unrelated three-module
core export component is unchanged. The manifest lists every member. Remaining App defaults/session constants and
action-registration coupling belong to T24; region composition belongs to T36, editing/snippet coupling to T38,
search/overlay coupling to T34 and remote/rebase coupling to T24's focused collaborator assessment. T9 does not claim
these cycles are removed. The export component belongs to T39.

The atomic-files and graph write-stamps test closures shrink from 315 graph nodes each to 61; reach-policy shrinks from
315 to 62. These owners no longer reach App, the model harness or screen composition. Pure header-layout and location
fitting have four- and three-module closures. Counts use scripts/ci-scope.ts importGraph() and reach(), starting from
each named test owner, including the entry test, transitive test-support modules, source modules and any other named
graph nodes; they are not a count of src-only runtime modules. A transitive guard fixture checks these boundaries
alongside the new editing/drawing owners. Explicit reverse-import fixtures reject type, re-export, dynamic and value
forms; a separate guard allows real App types while rejecting App runtime imports in the eleven editing clients. Nine
drawing clients likewise retain genuine Geometry types while rejecting runtime imports of the screen composer; the exact
cohort is listed in the extraction manifest. Header composition retains its recorded dependency and is outside that
cohort. Its CLI fixture rejects a value import and accepts a type import; removing this guard makes the new assertion
fail. Removing the new checker temporarily makes its CLI regression fail; restoring it passes.

## Local verification record

The 19 baseline owner files pass 161 tests with 1,056 assertions. Current owners plus the relocated pure/App cases and
startup registration coverage pass 164 tests with 1,065 assertions: the three added cases are the new CLI boundary
regression and two existing startup-refusal tests. Primitive, boundary, migration and timeout guards pass 27 tests with
441 assertions across eight files. Existing titles, assertions, hooks, snapshots and fixture data are preserved.

Source and compiled probes pass for eleven worker clients plus export's nested diagram request. The main compiled
binary passes which-key/explorer/outline interaction, clean shutdown, JSON info/commands and unknown-option exit 2.
Three selected terminal checks pass: source-editor gutter, status-line mode chip and reading status. These checks use
the existing terminal runner and budgets; no whole-terminal run is made.

### Mapped scope measurements

Selection still follows every App, worker and dynamic-import dependency; no selector rules change. Before/after unit
file counts are where 226/225, export-stream 282/281 and regex 278/277. Terminal selection remains all/export/all,
respectively. These are selection measurements only: the broad selected closures were not executed. Pure owner
isolation reduces genuine dependencies without claiming the full App-linked scopes are narrow.

Focused passing runs use Bun 1.4.2 on Linux, a clean ORG-T22 archive and the current tree, existing dependency/cache
contents, a fresh marker-free temporary directory per command, and a 120-second outer bound. NO_COLOR is removed before
Bun starts; COLORTERM=truecolor and TERM=xterm-ghostty remain; FORCE_COLOR, CLICOLOR and CLICOLOR_FORCE are unset. No cold
cache or percentage speedup is claimed. Wall times include process startup; unit and terminal results are separate.

| Focused unit case | Tests/assertions, both revisions | Baseline seconds | Current seconds |
| --- | --- | --- | --- |
| Location, including the extracted fitter | 7/70 | 0.793 | 0.691 |
| Export streaming | 15/56 | 4.038 | 4.063 |
| Regex jobs | 17/77 | 6.195 | 6.156 |
| Launcher, compiled-binary and startup/error selection | 6/31 | 2.484 | 2.725 |

The last row uses `bun test tests/cli.test.ts tests/organization/startup.test.ts` with the title filter
`the launcher|the compiled binary|startup refuses|errors: usage` and a 45-second outer bound. The corresponding
location, export-streaming and regex-jobs owner files run without title filters. These passing focused runs do not
replace the recorded broad-run failures below. Terminal wall time is 2.4 seconds for three selected checks.

### Existing launcher fixture failures

A broader run of `tests/cli.test.ts` plus startup coverage completes in 101.659 seconds on the clean archive (119 pass,
1 fail) and 102.164 seconds in the linked current checkout (118 pass, 2 fail). The failures are:

- “uninstall without --yes only lists (14.8): nothing of the installer's here; slipbox's folders kept, or with --purge
  listed”: the inherited environment discovers three installed user skills, contradicting the fixture's empty removal
  list. Five isolated baseline and five isolated current runs each fail the same assertion. All invocations are
  listing-only; no host skill is uninstalled or changed. Existing skill discovery reads HOME, CLAUDE_CONFIG_DIR and
  CODEX_HOME; no host configuration variables are redirected. T23 owns isolating this CLI fixture.
- “stat: which root a note is in, and its properties — the frontmatter, as the Info view shows it (3.19, 21.10)”:
  a linked worktree intentionally displays the root as `halden@<branch>`, while the fixture requires `halden` alone.
  The clean archive and a regular checkout pass; a disposable linked baseline worktree and the current linked checkout
  each fail five isolated runs at that assertion. This is a checkout-dependent fixture assumption, consistent with
  `rootLabel` in `core/workspace/vaults/names.ts`, rather than a T9 product change. T23 owns fixture isolation.

Color variables match the passing focused runs. The stat control uses private linked-worktree metadata; no repository
history is rewritten for it. Both causes are separated from the passing launcher selection and carried to T23/T43;
the broad launcher run is not claimed green.
