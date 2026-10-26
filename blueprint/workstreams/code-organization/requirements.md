# ORG requirements changes (draft)

## ADDED — blueprint/requirements.md: Maintainability

ORG-R1: Organize core, TUI and tests by feature or area, keeping the face boundaries of roadmap `0.2` and `0.3`.
Folders must express ownership; splitting a module must not create another large flat directory.

ORG-R2: Aim for about 500 lines per handwritten source module, with responsibility determining the seam. Lower the
size ceiling incrementally, with explicit non-growing exceptions, preserving D235's prohibition on an all-purpose class.

ORG-R3: Split broad tests by the behavior exercised and narrow avoidable imports, preserving integration coverage and
D239's conservative selection. Measure selected scopes and completed runs; claim no speedup from incomplete runs.

ORG-R4: Each implementation PR preserves application behavior, public commands, persisted formats, error contracts,
loading boundaries and worker ownership. #56 and ENG implementation are outside this workstream.

ORG-R5: Define test timeout defaults and named slow budgets in a separate phase. Product deadlines, terminal observation
waits, process-kill policy and CI job ceilings do not change as a side effect.

These proposed requirements do not amend the parent until approved consolidation. No decisions are recorded yet.
