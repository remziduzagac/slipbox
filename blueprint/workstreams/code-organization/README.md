---
status: draft
created: "2026-10-26"
---

# ORG: Code organization

Research for [issue #55](https://github.com/remziduzagac/slipbox/issues/55): organize the source and tests by area or
feature, reduce modules by responsibility, and remove repetition where its policies agree. No implementation is
approved by this draft. Roadmap `0.2`, `0.3` and `14.10`, D235 and D239 remain the baseline.

[research.md](research.md) records the measured baseline and the limits of the tools used.
[requirements.md](requirements.md), [design.md](design.md) and [tasks/](tasks/README.md) propose the area map,
conventions and PR sequence for approval. The design ends with recommendation-first choices. No decisions are
recorded here yet; every task remains todo and blocked on approval.

ORG proceeds independently of the draft [execution engine](../execution-engine/README.md); their shared boundaries
are identified in the research. Source and test files stay in place during research and design.

The research includes the boundary with [#56](https://github.com/remziduzagac/slipbox/issues/56), which follows the
moves and keeps memory/loading behavior outside ORG. The design proposes timeout policy as its own
application-behavior-neutral phase, with no default increase. Existing limits remain unchanged.
