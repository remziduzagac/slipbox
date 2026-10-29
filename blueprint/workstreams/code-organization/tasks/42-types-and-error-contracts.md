---
status: done
assignee:
blocked_by: [ORG-T41]
created: "2026-10-26"
---

# ORG-T42: Types and error contracts

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Review repeated custom AST casts and library adapters, completing remaining work after T28/T29. Extract guards only for
identical contracts and keep validation at external inputs. State which owner refuses, cleans up, retries and presents
failures. Preserve WriteRefused, CliError, WorkerRequestError, user messages, exit codes, cancellation and intentional
cleanup suppression; no global error/result framework or broad compiler-setting change.

## Evidence required

Characterize malformed inputs, refusal, cancellation, adapter failure and cleanup before extraction and run the same
cases after it. Verify narrowing is real rather than casts hiding incompatible states. Record retained casts/adapters
with their rationale and coordinate any dependency/type-package follow-up separately.


## Contract and cast assessment

`src/core/documents/markdown/tokenization/contracts.ts:1` owns the identical `Code`, recursive `State`, enter/exit/
consume effects and compiler enter/exit signatures previously repeated in wikilinks, tags and Obsidian. The effects
contract keeps its result parameter: wikilinks and tags observe `unknown`; Obsidian needs its concrete local `Token`.
`LiteralCompileContext` adds source serialization only for the two literal extensions; wikilinks still own their stack
projection. Obsidian's position, event and resolver model remains local. This is type-only sharing: the new owner emits
no JavaScript and all three clients emit byte-identical JavaScript. No callback, parser acceptance or failure behavior
is moved into a new runtime framework.

The [extraction ledger](../manifests/t42-types-and-errors-extraction.json) records the shared declarations, exact
static/ runtime/test/build deltas and the retained-cast assessment. It inventories 84 matching cast sites across
Markdown, syntax and export owners, preserving each local assumption with a reason. Each retained site records both
baseline and current line numbers. The scan targets custom object, node, unknown, record and child-union projections;
it is not a claim to inventory every TypeScript assertion in the repository.

No universal AST guard is introduced. Parser-origin positions/symbols, HTML child unions, assembler anchor/picture/code
metadata, and PDFKit metrics describe different contracts. Replacing them with one assertion would hide the distinction;
a new guard rejecting previously accepted trees would change behavior. Existing validation of external parser/library
input stays at its current boundary. The shared callback types are library adapter contracts, not runtime validators.
T28/T29 already isolated layout and PDF font/line/page adapters; their specialized casts remain with those owners.
The WASM initializer assertion also stays specific to its package's initialization API.

The six type-only `hast`/`unist` dependency references from T41 stay explicit follow-ups for direct dependency ownership.
No dependency is added, removed or hidden by a local substitute type, and compiler flags remain unchanged.

## Failure ownership

| Contract | Refusal and presentation owner | Cleanup and retry | Focused evidence |
| --- | --- | --- | --- |
| `WriteRefused` | `fsutil.ts:133` refuses escape; CLI exit 5; App refusal text | Filesystem owner | `writes`, `tasks` |
| `CliError` | `common.ts:49` keeps code/data; `cli.ts:373` selects exit | Existing handler | `reading/handler` |
| `WorkerRequestError` | Mailbox owns kind/message; feature presents it | Mailbox cleanup/restart | `worker-requests` |
| Export worker | Job manager keeps its current failure/cancel message | Job termination/queue | `export-jobs` |
| Markdown compiler | Extension propagates the exact callback error | Compiler caller | `tokenization-contracts` |

The ledger gives full source/test paths. No class, message, exit code, cancellation policy, retry or suppression is
changed. Filesystem atomic-write cleanup remains local; CLI maps the typed refusal instead of exposing a new global
result type. Mailbox cancellation/deadline/crash/initialization/result/stopped paths retain their existing categories;
feature-specific worker readiness, cache and retry policies remain the T40 dispositions. Export's fresh-worker
termination is separate from mailbox restart. Empty cleanup catches remain intentional local best-effort cleanup,
not a blanket swallowing policy added by this task.

## Characterization

Three added cases exercise actual extension compiler hooks and the real parser: source slice, enter/exit order and
token object identity; exact callback-refusal identity without an exit callback; malformed markers and code fences
remaining outside extension tokenization. The same cases pass against the preceding ORG-T41 implementation and the
extracted implementation, with twelve assertions. Typecheck verifies the concrete Obsidian token result remains
available through the shared effects signature. The extraction shares no implementation body and changes no runtime
import edge, worker URL, asset, fixture data or timeout policy.


## Verification record

The identical focused selection passes 114 tests and 7,126 assertions across 24 separate processes on each revision,
including the three added characterizations copied unchanged onto the baseline. This covers organization, Markdown,
filesystem writes/tasks, CLI refusal, mailbox failure/cancellation, export-job cleanup and PDF adapters. An initial
combined current process was killed with exit 137 before completion, without an assertion failure; its baseline passed.
The completed per-file comparison is the evidence, rather than that partial combined run.

Static edges increase from 2,981 to 2,984 solely through the three type-only contract imports. Runtime edges remain
2,231; SCC memberships remain identical (sizes 2, 5 and 8). All twelve build entries and all original literal test
identities remain; the three added tests take declarations from 4,013 to 4,016. The shared contract has no imports and
no emitted runtime code, so no runtime dependency-closure reduction is claimed. The manifest gives exact deltas.


Typecheck, Biome, boundary, size, explicit Markdown lint and docs checks pass. The affected live Obsidian-wikilink
terminal scenario passes, exercising six commands. The 750-line ceiling and two handwritten/one generated caps are
unchanged. No new runtime/compiled path exists: the contracts erase completely and the existing twelve entries stay.
