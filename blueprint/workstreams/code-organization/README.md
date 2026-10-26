---
status: draft
created: "2026-10-26"
---

# ORG: Code organization

Research for [issue #55](https://github.com/remziduzagac/slipbox/issues/55): organize the source and tests by area or
feature, reduce modules by responsibility, and remove repetition where its policies agree. No implementation is
approved by this draft. Roadmap `0.2`, `0.3` and `14.10`, D235 and D239 remain the baseline.

[research.md](research.md) records the measured baseline and the limits of the tools used. The target structure,
conventions and phased tasks follow in the design stage, for approval. No decisions are recorded here yet.

ORG proceeds independently of the draft [execution engine](../execution-engine/README.md); their shared boundaries
are identified in the research. Source and test files stay in place during research and design.

The research includes the boundary with [#56](https://github.com/remziduzagac/slipbox/issues/56), which follows the
moves and keeps memory/loading behavior outside ORG. The design will propose test timeout policy as a separate
phase; this analysis records existing limits and measured failures without changing them.
