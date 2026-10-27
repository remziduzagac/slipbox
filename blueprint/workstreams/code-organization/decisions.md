# ORG decisions

The maintainer approved the design choices and phase confirmations on 2026-10-27. These decisions govern this
workstream; parent blueprint consolidation and each implementation PR retain their existing review gates.

## ORG-D1: Functional groups, ownership and reusable boundaries (2026-10-27)

**Decision:** Use core groups foundation, application, workspace, documents and rendering, with feature subfolders.
Use the TUI ownership scopes in [design.md](design.md), explicit relative file imports, named light feature entries,
independent contracts and focused capabilities. Preserve App wiring, TUI buffer/undo ownership and the common write
gate during ORG. Share equivalent mechanisms and retain existing worker/export/controller patterns where they fit.

**Why:** Functional groups make the large feature inventory navigable; explicit ownership and contracts improve
reuse and focused testing without imposing a new runtime or generic abstraction on every feature.

**Alternatives:** Different group names such as system/output, light index facades, or moves alone with later
extraction review. The approved design uses application/rendering and includes demonstrated responsibility extractions.

**Verify:** Review complete move manifests, enforce dependency direction, retain integration journeys and compare
focused tests before/after each extraction. No gateway execution or window/tab behavior change follows from the names.

## ORG-D2: Staged source and test size limits (2026-10-27)

**Decision:** Aim for 500 handwritten source lines; lower the ceiling through 1,000, 750 and 600. Carry exact
non-growing legacy caps, never above the existing 1,500 ceiling, and remove exceptions as files shrink. Assess all
55 baseline modules over 500. Tests aim for 1,000 lines with a 1,500 ceiling for new/split files. Generated server
locks retain a separate measured cap and generator verification.

**Why:** Responsibility determines useful extraction boundaries. A staged ratchet allows reviewable changes while
preventing growth in legacy exceptions. The 600 ceiling does not replace the 500-line design aim.

**Alternative:** A strict final 500-line ceiling. The approved progression allows cohesive modules with explicitly
reviewed exceptions and follow-up work rather than arbitrary splits.

**Verify:** Run size checks after each phase; record cohesion, caps and follow-ups for every inventory row. No blanket
App exemption or manual splitting of generated lockfile strings.

**2026-10-27 note:** The maintainer permits resetting an exact source cap to measured growth caused solely by
formatting longer import paths during moves. Record the old/new cap and import-only delta in the task; preserve
non-import code and comments, and verify mapped dependencies and executable bodies. Keep normal import formatting;
do not trim comments or blank separators to offset path growth. The 1,500 ceiling and ordinary non-growing ratchet
still apply. This exception does not permit implementation growth.
The same applies when import formatting alone moves a file from at or below the ceiling to above it; the file gets an
exact cap equal to its measured size, recorded in the task and removed by its extraction task.

## ORG-D3: Early timeout policy and independent gateway preparation (2026-10-27)

**Decision:** T12 follows T1 and centralizes unchanged defaults and named existing budgets. T23 handles compound CLI
scenario splitting. T44 designs gateway contracts alongside mechanical moves after T1 and gates T24's relevant
extractions. The 44-task plan includes gateway preparation and ENG compatibility review; gateway execution, client
routing, socket transport and functionality migration belong to the next stack. #56 remains outside ORG.

**Why:** Independent timeout-policy work addresses the current testing concern early. Contract design informs
reusable boundaries without making every move depend on a future gateway or ENG implementation.

**Alternatives:** Put timeout policy last or make gateway design a predecessor of every move. Both add unnecessary
serial dependencies. Increasing limits globally would lack the required evidence and could hide excess work.

**Verify:** Maintain the task dependency graph, preserve application behavior and current deadlines, measure scoped
runs, and keep the known fixture/checkout-cache baseline distinct from timeout failures. Task status lives only in
its file; design approval does not mark any implementation task complete.
