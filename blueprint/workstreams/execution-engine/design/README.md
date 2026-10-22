# Design changes

The engine architecture, split by responsibility. The overall design remains draft; accepted principles are in
[decisions.md](../decisions.md). At consolidation, the
architecture becomes a new `design/execution/` part in the parent blueprint; existing parent sections are reconciled
through [changes.md](changes.md). Requirements are in [requirements.md](../requirements.md), and unsettled choices
remain in [ideas.md](../ideas.md).

1. [how-it-works.md](how-it-works.md): the whole system, dependency direction, module ownership and feature services.
2. [contracts.md](contracts.md): operation definitions, named actions, content sources, snapshots and events.
3. [runtime.md](runtime.md): concurrency, edits, saves, conflicts, plans, tasks and completion semantics.
4. [interfaces.md](interfaces.md): TUI, session control, CLI, socket and future extension boundaries, with example
flows.
5. [testing.md](testing.md): verification by layer, composed UI hosts, failure injection and terminal coverage.
6. [changes.md](changes.md): integration points in the parent's current design, held here until consolidation.
7. [maintenance.md](maintenance.md): feature ownership, completion checklist, dependency ports and migration cleanup.
