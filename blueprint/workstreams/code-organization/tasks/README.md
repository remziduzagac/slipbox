# ORG draft tasks

Execution order (IDs are stable, not chronological): ORG-T1–T5 → T13–T15 → T6–T7 → T16–T18 → T8 →
T19–T22 → T9 → T23–T24 → T10 → T25–T39 → T11 → T12. This is 39 proposed PRs: mechanical area moves,
scenario relocations and responsibility extractions are deliberately separate. A future consolidation of adjacent
mechanical PRs needs a reviewable manifest and approval; it must not mix path moves with policy changes.

All tasks are `todo`, blocked on design approval as well as their listed predecessors. Each task is one proposed PR
into `dev`; these tasks authorize no implementation. Recheck open PRs before each task. Where a manifest spans too many
independent areas for one sitting, propose numbered child PRs with the same invariants before starting it; do not hide
an unreviewable mass move inside one task. Task IDs remain stable.

For every PR: save an exhaustive move/extraction manifest; run the affected tests before and after, the affected
terminal checks, boundary and size checks. Before proposing it run typecheck, lint, check:docs and the scoped check
required by AGENTS.md. Never run the whole suite or every terminal check. Pure relocations preserve assertions and
snapshot content. Extraction adds characterization coverage where missing; a discovered bug goes in a separate fix
with a regression test verified to fail without it. Explain known baseline failures instead of silently accepting them.
Update affected design/documentation paths and applicable conventions in the same PR. Root consolidation still needs
approval. No #56 loading/memory work, ENG implementation, dependency additions, ready marking or merging.

- [ORG-T1: Contracts and migration gates](01-contracts-and-gates.md).
- [ORG-T2: Core foundations](02-core-foundations.md).
- [ORG-T3: Vaults and walking](03-vaults-walk.md).
- [ORG-T4: Graph and links paths](04-graph-links-mutations.md).
- [ORG-T5: Content feature paths](05-content-features.md).
- [ORG-T6: Rendering and export paths](06-render-export.md).
- [ORG-T7: TUI composition paths](07-tui-areas.md).
- [ORG-T8: Core test split](08-test-areas.md).
- [ORG-T9: Pure TUI test boundaries](09-focused-hosts.md).
- [ORG-T10: App services and shared pane helpers](10-responsibility-splits.md).
- [ORG-T11: Final size ratchet and reconciliation](11-final-ratchet.md).
- [ORG-T12: Test timeout policy](12-timeout-policy.md).
- [ORG-T13: Mutation paths](13-mutation-paths.md).
- [ORG-T14: Search and editing paths](14-search-editing-paths.md).
- [ORG-T15: Diagnostics and git paths](15-diagnostics-git-paths.md).
- [ORG-T16: TUI editor and navigation paths](16-tui-editor-paths.md).
- [ORG-T17: TUI explorer, panels and overlays paths](17-tui-panel-paths.md).
- [ORG-T18: TUI git and service paths](18-tui-feature-paths.md).
- [ORG-T19: Vault test split](19-vault-test-split.md).
- [ORG-T20: TUI editor test split](20-tui-editor-test-split.md).
- [ORG-T21: TUI feature test split](21-tui-feature-test-split.md).
- [ORG-T22: TUI screen and journey test split](22-tui-screen-test-split.md).
- [ORG-T23: CLI test boundaries](23-cli-test-boundaries.md).
- [ORG-T24: Focused controller capabilities](24-controller-capabilities.md).
- [ORG-T25: Graph responsibility splits](25-graph-splits.md).
- [ORG-T26: Code layout responsibility splits](26-code-layout-splits.md).
- [ORG-T27: Syntax responsibility splits](27-syntax-splits.md).
- [ORG-T28: Markdown layout responsibility splits](28-markdown-layout-splits.md).
- [ORG-T29: PDF responsibility splits](29-pdf-splits.md).
- [ORG-T30: Explorer responsibility splits](30-explorer-splits.md).
- [ORG-T31: Input responsibility splits](31-input-splits.md).
- [ORG-T32: Configuration and parsing splits](32-config-splits.md).
- [ORG-T33: Walk and watch splits](33-walk-splits.md).
- [ORG-T34: Search splits](34-search-splits.md).
- [ORG-T35: Rename splits](35-rename-splits.md).
- [ORG-T36: TUI drawing splits](36-tui-render-splits.md).
- [ORG-T37: TUI diagnostics splits](37-tui-service-splits.md).
- [ORG-T38: TUI buffer and editing splits](38-tui-buffer-splits.md).
- [ORG-T39: Core adapter and export cleanup](39-core-adapter-splits.md).
