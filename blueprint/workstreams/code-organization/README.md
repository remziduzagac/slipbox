---
status: complete
created: "2026-10-26"
---

# ORG: Code organization

For [issue #55](https://github.com/remziduzagac/slipbox/issues/55): organize source/tests by feature, split oversized
responsibilities, improve reuse and dependencies, and apply patterns where justified. The design was approved on
2026-10-27; all 44 implementation phases are complete. Roadmap `0.2`, `0.3`, `14.10`, D235 and D239
remain the baseline. Each task file records its current status and verification.

- [design.md](design.md): design, verified findings, coverage, phase order and a short linked task index.
- [requirements.md](requirements.md): the authoritative ORG-R1–ORG-R10 requirements.
- [tasks/](tasks/README.md): one authoritative file for each of the 44 task IDs, including its status and dependencies.
- [decisions.md](decisions.md): approved choices ORG-D1–ORG-D3.
- [research.md](research.md): supporting evidence and measurement limitations.

Gateway preparation and ENG compatibility review remain in scope by maintainer direction. The plan records the
ownership difference with the draft [execution engine](../execution-engine/README.md); ORG does not depend on its
implementation. Gateway execution, client routing, socket transport and functionality migration are the next stack.

[#56](https://github.com/remziduzagac/slipbox/issues/56) memory/loading work stays outside ORG. Timeout policy is an
early, separate behavior-neutral phase after T1; defaults and product deadlines stay unchanged. The approved-design
checkpoint is historical; implemented phase evidence lives in each task file.


The final ratchet and [reconciliation ledger](tasks/11-final-ratchet.md) record the implemented phases, exact remaining
exceptions and named follow-up task proposals. Completion does not claim all files meet the default ceiling, all
integration scope is narrow, or gateway execution exists. Root-blueprint consolidation and archiving remain separate;
the workstream stays here with its task evidence.
