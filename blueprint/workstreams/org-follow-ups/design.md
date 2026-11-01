# ORF design and delivery

The existing [ORG design](../code-organization/design.md) and
[ORG-D1–ORG-D3](../code-organization/decisions.md) remain authoritative. These tasks implement its retained seams;
they do not reopen ENG, introduce a gateway or change behavior during extractions.

## Implementation seams

The task index gives one reviewable PR per timer/deadline investigation, source owner, capped test/check owner and
unused-code/focused-test batch. Sequence: timer, uninstall fixture isolation (item 4's host assumptions), deadlines,
source splits (resolver, CLI, vaults, watch, updates, graph, App), four unit owners, five terminal collections,
unused-code proof, focused scenarios and scope measurement. ORF-T21 is a separate test-only PR immediately after
ORF-T1's PR #171; existing task IDs stay unchanged.
The [T11 ledger](../code-organization/manifests/t11-final-ratchet.json) supplies the split responsibilities and
invariants. Tasks characterize them before extracting; App is last among source owners and may need child PRs.

ORF-T27 is a separate test-only prerequisite before ORF-T12: a cold diagram child explicitly receives the rendering
owner's runtime environment rather than Bun's startup environment. Controlled warm-cache coverage preserves the
original pending/code/drawn assertions and all deadlines; product cache policy is unchanged.

## Requirements and design changes

The timer investigation records the actual cause and any product behavior correction in ORF-T1, with the matching
current design, user documentation and Fixed changelog entry. A demonstrated deadline defect follows the same rule
in ORF-T2. All other PRs preserve behavior. Each extraction updates the matching blueprint/design module ownership
or location in the same PR. Root-blueprint consolidation and ORG archive are separate work.

## Verification and delivery

- Before a move, record exact old/new paths and entry points. Use git mv for tracked relocations, review git diff -M
  and --summary, and check stale static/type/dynamic imports, workers, build entries, fixture paths, selectors and docs.
  Keep rendered path strings, snapshots, test/check names, hooks and assertion bodies unchanged.
- Follow ORG's move gates for resolved dependencies, compiled binary, relocated entry points and real worker requests
  from source and compiled modes. Characterize responsibilities before extraction; record retained lifecycle/state owners.
- Run only affected tests: focused batches have a 300-second external bound; the complete bun run check has a
  900-second external bound. Both use a 10-second kill grace. These wrappers do not change test deadlines. Run affected
  terminal checks with SLIPBOX_TERMINAL_JOBS=2. Before the PR run typecheck, lint, boundary, check:size and check:docs
  plus applicable scoped checks. Never run the whole suite or every terminal check. Raise no product, test, terminal
  or CI deadline.
- Verify each bug regression once with the fix undone, then restore it. Record the commands, observed failure and
  passing checks in its task. A failure unrelated to the change stays visible with evidence and a recommended next step;
  it is not rerun away.
- Open each PR into dev with a Conventional Commit title, Refs #170 and its ORF task in the body. Only the final PR
  closes #170. Build, one fresh review, and merge are separate stages; stop after the stage requested. Task status moves
  todo → doing → review → done, with done only after merge. Check the previous merge's dev push run before the next merge.

## MODIFIED — blueprint/design/tui.md: Screen layout, messages

Previously: each message shows four seconds (eight for errors) from its first drawn frame. The scheduler subtracts
App's current wall clock from that timestamp plus its lifetime, without handling a clock corrected backwards.

A drawn timestamp later than the current clock restarts at the corrected time. This preserves the normal message
lifetime and bounds the next timer by four/eight seconds; clamping the timer alone would leave the message dated
far into the future. Undrawn messages keep their full lifetime for their first frame. Message-history timestamps,
dismissal, deduplication and the ten-millisecond scheduling floor are unchanged. ORF-T1 records the regression.
