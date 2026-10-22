# Notes: engine design

## Prior-art research (2026-10-16)

- Fresh, Kakoune and TTT are the primary comparisons; larger editors are narrow references rather than templates.
- Research and adjustment of the engine proposal are authorized; implementation remains outside this work.
- Preserve Slipbox's existing UI and ease of use as the design baseline.
- Source findings are recorded in [research/](research/README.md); their adaptations are consolidated in the
  [synthesis](research/synthesis.md) and the draft design. ENG is not consolidated into its parent blueprint.
- Open: review the complete architecture and exposure policies before activating implementation work.

## Recording the research-based choices (2026-10-16)

- Accepted choices applied during research refinement are recorded as ENG-D7 through ENG-D11: preserve the UI;
  typed build-matched discovery; explicit targets; engine-owned outcomes; conservative endpoint handling.
- These supplement ENG-D1 through ENG-D6. The full workstream and implementation plan remain draft.


## Dependency-backed services (2026-10-16)

- Agreed to apply focused service boundaries, input/resource limits and a shipped-artifact audit to ENG (ENG-D12).
- Process isolation and optional packaging are assessed with evidence; neither is assumed necessary for every service.
- Dependency vulnerability exposure and repository-selected code execution are distinct risks. Trust alone does not
  address malformed-input handling. The current single-binary distribution remains the starting point.


## Dependency plan refinement (2026-10-16)

- Accepted S2 and feature-boundary S3 as automated artifact/loading checks (ENG-D13).
- Accepted S4 and D172 enforcement checks for installed tools and migrated effects (ENG-D14); D172 remains in force.
- S1's package-set ratchet and S5's site audit/licence coverage are repository-upkeep follow-ups, recorded in ideas.
- S7 remains optional measurement; closure counts overlap and do not authorize replacements or feature removal.
- Implementation remains outside the current design work.

## Backend maintainability and testing (2026-10-16)

- Agreed to strengthen ownership, shared execution, reusable scenarios, controlled asynchronous/dependency ports,
  interaction coverage, layered checks and deletion of superseded migration paths (ENG-D15).
- ENG is backend improvement with existing product functionality and UI preserved. Its attachment and automation
  infrastructure remains in scope; additional product features belong to their own work.
- Continued feature growth is supported; feature cuts and a 1.0 milestone are not goals of this workstream.

## Thorough workstream review (2026-10-17)

- Independent runtime, architecture and blueprint reviews were consolidated and verified; confirmed draft errors
  were fixed only within ENG. Findings, evidence, corrections and remaining gates are in
  [research/review.md](research/review.md).
- Corrected shared reservations/admission ordering, claim/cancellation, authenticated retry identity/expiry,
  session observation/context, T2/T3 staging, autosave wording, parent deltas and acceptance coverage.
- ENG-D1 through ENG-D15 remain the accepted choices; this review clarifies their draft operational contracts.
  Broader unresolved exposure/authority choices stay open. No code, parent blueprint or other workstream was changed.

## Second thorough review cycle (2026-10-17)

- Three fresh independent reviews examined the corrected draft; verified findings were consolidated in
  [research/review.md § Second cycle](research/review.md#second-cycle-2026-10-17).
- Corrected host-policy authority, task/receipt retention, timeout semantics, mixed-origin continuations, all-channel
  observation access, mixed live/disk language edits and saved/live plan ownership. Clarified canonical text batches
  and version-bound range reads. Follow-up reviewers confirmed their findings resolved.
- Only ENG changed. No implementation, parent consolidation or new accepted architecture decisions occurred.

## Third review cycle: different angles (2026-10-17)

- Compatibility, failure/resource liveness and implementation-practicality reviews were consolidated and verified in
  [research/review.md § Third cycle](research/review.md#third-cycle-different-angles-2026-10-17).
- Corrected apply-once plan claims/recovery, revision-aware handoff scopes, recovery-storage admission/failure,
  preflight versus irreversible shutdown, bounded draining, and finite readiness versus resident server ownership.
- Follow-up reviewers confirmed original findings resolved; the plan-claim release/inspection clarification was
  also applied. Existing accepted decisions and deliberate open choices remain unchanged. Only ENG was edited.

## Overall architecture proposal (2026-10-18)

- Authorized drafting a top-down backend architecture proposal in ideas before applying it to the detailed design.
  The reviewed execution-engine design remains its foundation and retains its contracts and accepted decisions.
- Proposed fitting ports/adapters, application services, command/query separation, single-owner state, a functional
  core, small state machines, dependency inversion, resource scopes and incremental replacement. Their concrete
  roles, costs and adoption questions are in [ideas/architecture.md](ideas/architecture.md).
- Organized existing alternatives and dependency/upkeep proposals under [ideas/](ideas/README.md), preserving them
  as proposals and updating their links. No new decision, implementation or parent consolidation was made.
- Next: review the overall proposal, record agreed choices, then reconcile them into the existing design pieces.


## Architecture proposal explanation (2026-10-18)

- Expanded [ideas/architecture.md](ideas/architecture.md) into a top-down reading path: system shape, running
  instances, state ownership, dependency direction, patterns, workflows, testing and adoption.
- Added diagrams for call flow, separate/attached instances, documents/views, source dependencies, background
  delivery, saving with newer edits, incremental replacement, the shared save path and checked rename.
- Explained patterns through concrete responsibilities and save/rename/language-edit examples. The detailed ENG
  contracts remain authoritative; the proposal is still awaiting review and has not been applied to them.

## Architecture diagram responsiveness (2026-10-18)

- The ownership diagram passed SVG rendering but triggered excessive allocation in an isolated text-rendering probe.
  Changed its arrows to an equivalent acyclic form. All nine diagrams now complete through the actual text-renderer
  wrapper across 108 width/glyph/scroll cases; evidence and limitations are in
  [research/diagram-rendering.md](research/diagram-rendering.md).
- This is a document workaround, not a dependency/runtime fix. Diagram execution bounds and a retained-reproducer
  regression belong in follow-up implementation. No application source or running instance was changed.
