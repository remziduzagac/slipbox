# Parent design changes

Integration inventory, not directly applicable replacement text. The full proposed addition is mapped by
[README.md](README.md). Replacement text for
existing sections must be reconciled with the parent and pending VV/GIT changes before consolidation. At ENG-T1,
prepare full replacements and exact Previous baselines by stable section; refresh them after parent changes.
Consolidation is blocked until every inventory entry has those complete deltas and its accepted decision. Before
applying, remove draft-stage qualifications from replacement text only when the referenced exposure choices
are actually accepted, recording those choices and their IDs. Never
replace a parent section with this summary or discard its unchanged commitments.

**MODIFIED design/how-it-works.md § One core, two faces and § Module map.** Previously: App holds the application
model and CLI commands orchestrate core independently. Introduce engine ownership, adapter boundaries and the module
responsibilities in [how-it-works.md](how-it-works.md). Preserve the OpenTUI boundary and extend import checks.

**MODIFIED design/how-it-works.md § The CLI and the TUI: disk is the contract.** Previously: all CLI access is saved
files only. Preserve that default and add the explicit attached live contract, provenance and concurrency limits.

**MODIFIED design/tui.md § Buffers, views, tabs, windows, § Writing notes, § External changes and § Parity with the
CLI.** Previously: NoteBuffer and App own text, save coordination and application callbacks. Separate engine
documents from presentation views and named actions; keep interaction and conflict prompts in the TUI.

**MODIFIED design/search.md and design/lsp.md.** State service ownership, saved/live capabilities, revision-tagged
results and lazy lifecycle. Add explicit query/refresh scheduling and owner-lifetime checks before result delivery
(ENG-D1–ENG-D3). Preserve algorithms, server protocol behavior and guarded tool discovery.

**MODIFIED design/trust.md.** Add engine-enforced client access distinct from vault tool trust; preserve human-only
trust management, write containment and VV link permissions. Describe local endpoint limits without claiming a
same-user security sandbox.

**MODIFIED design/testing.md.** Add operation contract, deterministic concurrency, failure injection, adapter parity
and socket lifecycle tests, plus composed TUI tests using real handlers and frame barriers. Retain parser/layout
tests and TT's terminal checks for actual interface behavior. Add owned-resource disposal, scheduling-progress,
shared-model and seeded stateful invariant/replay checks (ENG-D1–ENG-D6). Include reusable scenarios, interaction
coverage, structural enforcement and check cadence under ENG-D15; preserve existing UI and product behavior.

**ADDED design/execution/.** The reviewed architecture lives in this new parent design part: its README maps
`how-it-works.md`, `contracts.md`, `runtime.md`, `interfaces.md`, `testing.md` and `maintenance.md`. These files hold
the full proposed text here. Record agreed amendments to D8/D11/D13/D14/D17/D156; retain the old entries with amendment
notes.


**MODIFIED requirements.md § Non-goals, § Agents and the CLI, § Editing and § Quality goals.** Complete proposed
section replacements and exact local baselines are in [requirements.md](../requirements.md). Reconcile their parent
text and resolve the still-open D13/D156 exposure choices before applying. Preserve compatibility, plans, skill,
editing capabilities and unrelated quality goals; do not treat draft amendment wording as an accepted decision.

**MODIFIED design/distribution.md and design/repository.md.** Integrate only the accepted ENG-D13/ENG-D14 artifact,
loading and installed-tool evidence obligations, using full section deltas before consolidation. Keep S1/S5 upkeep
follow-ups separate. Changes to release/audit workflows need their own reviewed implementation checks.

**D235 clarification required.** App retains presentation records and wiring; engine documents own text/history/save
state. Preserve D235's size discipline and useful controller split. Record the clarification by a new parent decision
and a dated note under D235, alongside the D8/D11/D13/D14/D17/D156 amendments; do not rewrite old decisions.
