# ORG requirements changes

## ADDED — blueprint/requirements.md: Maintainability

ORG-R1: Organize core, TUI and tests by feature or area, keeping the face boundaries of roadmap `0.2` and `0.3`. Folders
must express ownership; splitting a module must not create another large flat directory.

ORG-R2: Aim for about 500 lines per handwritten source module, with responsibility determining the seam. Lower the size
ceiling incrementally, with explicit non-growing exceptions, preserving D235's prohibition on an all-purpose class.
ORG-D2 permits a measured, documented cap reset solely for formatting longer import paths during moves.

ORG-R3: Split broad tests by the behavior exercised and narrow avoidable imports, preserving integration coverage and
D239's conservative selection. Measure selected scopes and completed runs; claim no speedup from incomplete runs.

ORG-R4: Each implementation PR preserves application behavior, public commands, persisted formats, error contracts,
loading boundaries and worker ownership. #56 and ENG implementation are outside this workstream.

ORG-R5: Define test timeout defaults and named slow budgets in a separate phase. Product deadlines, terminal observation
waits, process-kill policy and CI job ceilings do not change as a side effect.

ORG-R6: Remove repetition where mechanisms and policies agree. Record the disposition of measured clone candidates,
including justified retained differences; compare source and test reports with consistent tool settings.

ORG-R7: Correct identified internal dependency direction and keep reusable contracts independent of composition. Enforce
the extracted boundaries with focused fixtures, preserving type-only and worker/loading distinctions.

ORG-R8: Review naming, unused declarations, types and error handling with entry-aware evidence. Narrow or remove only
proven unused surfaces; retain public commands, external integrations and existing failure/cleanup contracts.

ORG-R9: Evaluate worker lifecycle, export formats and TUI composition against actual problems. Implement a pattern only
when it improves a demonstrated seam; record retain decisions and test the relevant ownership/lifecycle paths.

ORG-R10: Design the future gateway operation contracts and prepare their module boundaries within #55. Extract reusable
application responsibilities from client interaction while preserving existing callers and runtime behavior. Gateway
execution, routing clients through it and migrating functionality are a separate implementation workstream.

Approved on 2026-10-27 under [ORG-D1–ORG-D3](decisions.md). These requirements amend the parent only at approved
consolidation; implementation is tracked by the task files.
