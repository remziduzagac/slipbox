---
status: draft
created: "2026-10-16"
---

# ENG: A shared execution engine

Backend maintainability and testability, preserving existing product functionality and UI. A shared application
engine and execution contract for the TUI, CLI and local socket clients, with connected
control of the running TUI through its real actions and input paths. This workstream contains the proposal,
evidence, alternatives and eventual implementation work. **Architecture draft; no implementation.** The research-based
choices ENG-D1 through ENG-D15 in [decisions.md](decisions.md) are accepted; the complete workstream remains under
review.

## Where to start

1. [requirements.md](requirements.md): proposed outcomes, constraints, acceptance criteria and parent dependencies.
2. [design/](design/README.md): the architecture as a whole, its parts and the changes proposed to the parent.
3. [ideas.md](ideas.md): alternatives, costs and choices still to settle.

## Review status

The [three 2026-10-17 review cycles](research/review.md) consolidate verified findings and their fixes.
Accepted principles remain
ENG-D1 through ENG-D15; unresolved choices stay in ideas. Complete parent design deltas and exposure amendments are
required before consolidation. Review completion does not activate implementation.

## Evidence and proposed work

- [research/](research/README.md): Slipbox baseline, primary-project findings and their design synthesis.
- [notes.md](notes.md): research scope, discussion record and remaining review.
- [decisions.md](decisions.md): accepted lifecycle, scheduling, delivery, model-sharing, testing and cleanup principles.
- [roadmap.md](roadmap.md): proposed migration order and exit conditions; implementation tasks follow acceptance.

ENG proposes amendments to D8, D11, D13, D14, D17 and D156, clarifying document ownership under D235. D36 and D37 remain
in force;
providing an extension boundary does not introduce a plugin runtime. No parent requirements, design, roadmap or
accepted parent decisions are changed by this draft. Remaining decisions and task files are created when their
content is ready and agreed; this folder remains the home of the work until approved consolidation.
