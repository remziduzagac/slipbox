# Execution architecture research

Source findings and their implications for the ENG proposal. Fresh, Kakoune and TTT are the primary comparisons;
Neovim, Helix and VS Code remain references for specific contracts. Source inspection is evidence of implementation,
not a runtime evaluation. Proposed adaptations remain draft unless recorded as accepted decisions.

- [write-up.md](write-up.md): Slipbox baseline, TTT source findings and the initial comparison screening.
- [fresh.md](fresh.md): shared plugin access, asynchronous outcomes, targeting and endpoint discovery.
- [kakoune.md](kakoune.md): session commands, explicit client context and the separate display/input protocol.
- [synthesis.md](synthesis.md): consolidated findings, design adjustments and deliberate scope limits.
- [dependency-boundaries.md](dependency-boundaries.md): service exposure, resource controls and artifact-review gaps.

- [review.md](review.md): consolidated 2026-10-17 review findings, fixes and remaining decision gates.
- [diagram-rendering.md](diagram-rendering.md): reproduced text-rendering memory growth and the diagram workaround.
