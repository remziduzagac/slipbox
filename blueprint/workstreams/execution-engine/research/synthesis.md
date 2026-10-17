# Research synthesis and engine adjustments

Fresh, Kakoune and TTT are the primary comparisons. Larger editors remain narrow references. This consolidates
research into the ENG proposal; it does not consolidate ENG into the parent blueprint or authorize implementation.
Source provenance and inspection limits live in [Fresh](fresh.md), [Kakoune](kakoune.md) and [TTT](write-up.md).

## Keep the product boundary

Slipbox remains a human-and-agent workspace for reading, reviewing and editing plain files. Preserve its current
navigation, rendered views, lens and review workflows. Engine extraction should make those workflows easier to
maintain and expose, without requiring a new interaction model. Visual preference is not an externally verified
ranking; compatibility is checked against Slipbox's own behavior and reference scenarios.

The agreed research-based choices are recorded as [ENG-D7 through ENG-D11](../decisions.md#eng-d7-preserve-slipboxs-interaction-model-2026-10-16).

## What changes in the draft

| Evidence | Adjustment | Home |
| --- | --- | --- |
| Fresh reuses plugin access | Typed operations and build-matched discovery | Contracts, interfaces |
| Fresh routes async outcomes by owner | Receipt ownership independent of adapter delivery | Runtime |
| Fresh active targets can change after await | Resolve targets once, reject closed identities | Contracts |
| Fresh distinguishes unreachable endpoints | Explicit probe states, conservative cleanup | Interfaces |
| Fresh retains a buffered control reader | One bounded decoder throughout each connection | Interfaces, testing |
| Kakoune separates commands from display/input | Separate application calls and session control | Interfaces |
| Kakoune draft context preserves selections | Direct document edits avoid stealing the human's focus | Interfaces |
| Kakoune command path lacks typed outcomes | Preserve handled/task/frame distinctions | Runtime |

## Lean scope

These findings strengthen the existing architecture; they do not call for another layer. Keep one catalog/executor,
focused application services, optional session handlers and thin adapters. No mandatory daemon, scripting language,
remote display frontend, private agent editing context or plugin runtime is added. Shared model work follows
ENG-D4 and scheduling/lifetime work follows ENG-D1 through ENG-D6.

The migration still starts with a narrow vertical slice and preserves the existing TUI. Each moved responsibility
has an old path to delete and a behavior check. The full architecture remains draft; accepted principles remain in
[decisions.md](../decisions.md). Parent requirements and design change only through eventual approved consolidation.
