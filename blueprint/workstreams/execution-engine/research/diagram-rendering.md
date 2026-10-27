---
status: current
created: "2026-10-18"
---

# Research: text-diagram rendering responsiveness

## Finding

A small ownership diagram from the architecture proposal rendered successfully as SVG but caused excessive memory
allocation in the terminal-text rendering path. This is a reproduced performance failure, not proof that all cyclic
diagrams fail or that the renderer never terminates. SVG validation alone did not establish TUI responsiveness.

## Evidence

*Read:* `src/core/rendering/layout/markdown/render.ts:390` calls `drawMermaid` during layout.
`src/core/rendering/media/diagrams/diagrams.ts:82` calls the library's synchronous text renderer and can try three
spacings. Rendering therefore occupies the caller until it returns; a same-loop timer cannot interrupt it. The installed
`beautiful-mermaid` version is 1.1.3.

*Ran:* Separate local probe processes rendered each of the nine proposal diagrams, with an external four-second
watchdog and 256 MiB RSS cutoff. The original third diagram hit the memory cutoff; the other eight completed.
Its original source and probe artifacts remain only in temporary diagnostic output, not in this document's Mermaid
blocks, so opening the report does not rerun the problematic input.

*Ran:* Reversing the ownership diagram's snapshot/reference arrows removed its feedback cycle while preserving the
meaning in the surrounding explanation. The revised third diagram rendered in about 14 ms in the direct-library
probe. All nine revised diagrams then completed through the actual `drawMermaid` wrapper at widths 40, 80 and 120,
with both glyph modes and both scrolling choices: 108 cases. Each per-diagram batch stayed below 100 MiB sampled RSS.
These local observations are not portable performance budgets or an automated regression gate.

## Implication for ENG

The diagram change is an input workaround; it does not fix the dependency's worst-case behavior. Existing ENG-D12
service budgets and background execution should include the diagram path when the proposal is refined. A robust
implementation needs a bounded execution host, source fallback and a regression using the retained reproducer.
An arbitrary small-input limit alone would not catch this case. A synchronous timer or catch block is insufficient
for work that does not yield or throw. Exact renderer remediation remains follow-up implementation work.
