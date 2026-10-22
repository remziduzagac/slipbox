# Ideas and alternatives

The alternatives and choices below remain proposals for ENG, dated 2026-10-16. Accepted research-based choices
are recorded once in [decisions.md](../decisions.md); they do not settle the broader architecture choices here.

## Alternatives and limits

| Alternative | Reason to prefer the proposal |
| --- | --- |
| Continue splitting App only | Useful groundwork; application ownership and duplicate orchestration remain |
| Put a socket over App | Couples automation to UI state and leaves headless CLI behavior separate |
| Require a daemon for every command | Adds discovery/lifecycle failures to the existing standalone CLI |
| Auto-attach whenever possible | Makes identical commands depend on invisible running-instance state |
| Generate every interface from one action list | UI workflows and application operations have different contracts |
| Move all core functions into the engine | Pure algorithms remain simpler to test and reuse directly |
| Add a generic workflow/transaction platform | More machinery than the existing operations require |

Costs: an additional application layer, explicit revisions and provenance, an adapter compatibility period, and
local protocol maintenance. Two embedded engines still coordinate through disk, so this design does not eliminate
every external-write race. Sharing handlers also does not make all features cheap to expose remotely; authority
and lifetime remain part of each contract.

## Decisions to settle before implementation

The following broader choices remain draft; accepted sub-rules in ENG-D1–ENG-D15 still apply. For example, explicit
targets and typed discovery are agreed, while initial exposure, exact syntax and delivery scope need review.

1. **Content and routing:** keep ordinary CLI saved-only, with explicit attachment and distinct live operations.
   Changing the default would amend D17 more broadly and affect scripts.
2. **Authority:** start the socket read-only; grant live editing and session control explicitly per instance/profile.
   Keep trust changes human-only. Decide host-effect grants and the initial operation subset before protocol freeze.
3. **Undo:** one shared document history, with connected edits as separate steps; no per-agent selective undo.
4. **Exposure:** preserve D156's ordinary CLI exclusions initially. Connected session control proposes access to the
   TUI's git workflows under the same host-effect policy; record that amendment explicitly before implementation.
5. **Lifetime:** first host is the existing TUI; no required daemon. Decide whether an explicit headless resident host
   is needed in the first deliverable or can follow after socket parity is proven.
6. **Migration order:** retain the D235 split and begin with a read, a task toggle, document edit/save and a checked
   plan. Prove a socket client on these before migrating every feature. Coordinate pending VV/GIT work by ownership.
7. **Compatibility and limits:** choose initial protocol version, conservative message/task/event limits and measured
   responsiveness budgets during the first slice. Do not add new dependencies before checking D3 and D192.
