# Maintaining and extending the backend

ENG improves backend ownership, execution and verification while preserving existing product functionality and UI
(ENG-D15). Shared invocation, attachment and test-host facilities are infrastructure described by this workstream;
they do not require new editing, rendering, git, export or navigation features. Future product features follow their
own workstreams. This design supports continued growth without a feature-cutting or 1.0 milestone.

## Feature ownership and integration

Each feature has a focused owner, narrow service ports and explicit dependencies. Application handlers coordinate
that owner through the shared execution contract; adapters translate intent and present results. Add definitions
and handlers through explicit composition, with duplicate/missing registrations checked. Do not add an App method,
engine-wide switch branch or shared mutable context for each new behavior.

A feature's domain rules are tested at its owner. Application orchestration calls domain computations directly;
internal function calls need neither RPC envelopes nor catalog entries. Reuse existing capabilities before adding
another abstraction. Dependencies shared by several owners remain focused services rather than an expanding
universal service interface.

The practical review check is locality: a normal feature change should concentrate in its owner, operation
bindings and necessary adapter integration. Changes spanning unrelated owners need an explained shared contract,
not an arbitrary numerical file-count limit. Boundary changes remain deliberate and recorded in the blueprint.

## Feature completion checklist

Use this short checklist for each migrated owner and later backend feature; references can point to existing
contracts rather than repeating them. It is review guidance, not a generated framework or mandatory class template.

- **Ownership:** state, dependencies, resources, lifetime and disposal have a named home.
- **Execution:** operation definitions, explicit targets, access/effects, preconditions and outcomes agree.
- **Failure:** cancellation, stale results, limits, partial effects and cleanup have defined behavior where applicable.
- **Verification:** owner rules, adapter integration and relevant interactions have focused checks.
- **Compatibility:** existing product behavior, UI and public CLI contracts are preserved or separately agreed.
- **Records:** design and user documentation reflect the change where applicable; superseded paths are removed.

## Migration without duplicate ownership

Every slice records the old orchestrator/writer/registry path, its replacement and the condition for deleting it.
Temporary delegates forward to one authoritative implementation and have an explicit removal slice; they do not
keep independent policy or state. Move behavior tests with the owner and retain adapter assertions that still prove
a distinct boundary. Never bless changed UI snapshots merely to finish an extraction.

Preserve the current UI/controller split, supported features and unfinished workstream boundaries. A defect or
product improvement found during extraction becomes separately scoped work; the migration does not quietly change
the workflow. Fixes require the project's regression tests and an explicit change record.

## External dependency ports

Put libraries and tool execution behind the feature's smallest useful port. Most orchestration tests inject a
controlled implementation of that port; integration tests exercise the real library/tool and its formats. Avoid
mocking every internal function or building one universal external-dependency interface. Feature-specific adapters
own library API differences, while shared storage/tool guards continue to enforce common policy.

Service budgets, execution-host guarantees and dependency checks remain in [runtime.md](runtime.md),
[testing.md](testing.md) and ENG-D12 through ENG-D14. A narrow port aids replacement and tests but is not a sandbox.
