---
status: done
assignee:
blocked_by: [ORG-T40]
created: "2026-10-26"
---

# ORG-T41: Naming and unused-code cleanup

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Review owner-local role names and configure Knip discovery for all real source, worker, fixture, test, script and build
entries. Triage research's unused file/export/type candidates, unlisted references and dependency/tool flags. Record
used/false-positive/narrow-export/remove/defer outcomes with references. Narrow exported visibility or remove proven
unused declarations only after checking non-TypeScript consumers and documented invocations. No dependency changes,
public command renames or persisted-key changes are bundled here.

## Evidence required

Repeat entry-aware discovery and repository references before/after each removal. Run typecheck and affected tests, plus
worker/build probes for touched entries. Preserve optional tool integration, generated assets and docs scripts. Names
improve ownership clarity without requiring symbol churn across every moved file. Keep each cleanup batch reviewable;
the candidate ledger must account for exclusions and deferred findings.


## Discovery and dispositions

`knip.config.ts:1` uses `scripts/organization/knip-entries.ts:8` to follow every source entry in the build command,
including workers. It also names test/preload/fixture/headless-terminal/shot entries, documented scripts, the site
workspace and the deliberately retained T36 drawing facade. Rendered example projects are data, not application
workspaces. No phantom LSP executable is added: the current clients are reached through the application entries.

Repeat discovery with `bunx --bun knip@6.43.0 --reporter json --no-progress`. Knip remains diagnostic: retained and
explicitly deferred candidates mean its exit status is nonzero. It is not installed as a dependency or made a
zero-findings CI gate. The [candidate ledger](../manifests/t41-unused-dispositions.json) accounts for every original
research candidate and every configured symbol, plus the current package/tool findings and exact visibility edits.
An entry classification means the tool knows the process boundary; it does not prove every exported declaration runs.

| Report | Files | Exports | Types | Unlisted | Binaries | Dev dependencies | Duplicate aliases |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Research | 58 | 186 | 54 | 6 | 5 | 2 | 0 |
| Current, default discovery | 60 | 330 | 88 | 6 | 5 | 2 | 1 |
| Current, configured entries | 0 | 315 | 84 | 6 | 0 | 0 | 1 |
| After visibility cleanup | 0 | 197 | 84 | 6 | 0 | 0 | 0 |

The 118 narrowed module export sites comprise 117 removed export modifiers and one unused forwarding export, across
50 files. Of these, 114 declarations were private before the organization extractions. The additional cases are the
local migration resolver, `htmlEntities`, and both `HEADING_ID` export sites. All implementations remain, including the
heading-ID matcher. Repository import/re-export/namespace references and non-TypeScript consumers were checked before
narrowing; the parser's dynamic namespace callers use other exports. Typecheck and runtime namespace checks confirm
there is no remaining consumer of the narrowed names. No files, dependencies, commands, persisted keys or fixtures are
removed or renamed. Normal formatter changes accompany four formerly exported function signatures.

All 84 reported types and the other 197 runtime exports remain explicit deferred API/contract candidates; lack of a
current import is insufficient evidence to remove an existing contract. This includes aliases and the minimal types
introduced by extraction. The six unlisted references are type-only `hast`/`unist` imports supplied transitively;
dependency ownership is deferred for separate assessment, without a package change here. `markdownlint-cli2` is
resolved through the docs executable path, and `vscode-languageserver` is reached from the fake-LSP fixture.
`zizmor`/`actionlint` are toolchain executables; `herdr`, `nvim` and `pkill` are host integrations or fixture cleanup,
not missing JavaScript dependencies. Their integration and invocation text remain unchanged.

Names are assessed within their owners: `folderReader` stays the public reader role while `readdirTyped` becomes a
private implementation binding. `App`, `Graph` and feature-controller names retain their established role; area folders
supply context. No global prefix stripping or speculative rename is needed.

## Verification record

The baseline is the preceding ORG-T40 commit. Implementation-token comparison across all 50 changed files preserves
bodies, comments and literals, allowing only the listed export edits and formatter-equivalent signature punctuation.
Runtime namespace comparison confirms precisely 118 removed exports and 177 retained exports; retained function names,
arities, constructors and prototype descriptors match. The full import graph remains 2,981 edges and the runtime graph
2,231 edges. All three runtime SCC memberships remain identical (sizes 2, 5 and 8); all twelve build entries are
unchanged. Literal declarations increase from 4,011 to 4,013 solely through the two discovery regression tests.
The manifest lists the exact graph, runtime, entry and test deltas; no dependency-closure reduction is claimed.

The same focused selection passes 148 tests with 7,282 assertions across 26 baseline files, and 150 tests with
7,289 assertions across 27 current files; the only additions are the two discovery tests and seven assertions.
It covers organization guards,
configuration, document/data readers and parsing, HTML, walk/search/home policies, Markdown layout, source editing,
contexts, drawing, Git and explorer mechanisms. The discovery fixture proves new worker/TSX entries are followed,
flags and duplicates excluded, and missing/opaque build commands refused. A negative control replacing discovery with
only `src/main.ts` fails the worker-entry assertion before restoration.

Typecheck, Biome, size and boundary gates pass. Compiling all twelve entries succeeds (1,458 bundled modules); the new
binary reports version 0.5.1 and serves CLI help. The ceiling remains 750, with two handwritten and one generated cap.
Two affected live screen checks (theme picker and settings/glyph preview) pass, exercising seven named commands.
No screen, worker URL, asset path, timeout policy or shipped fixture bytes change.
