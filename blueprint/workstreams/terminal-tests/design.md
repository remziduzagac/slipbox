# Design changes

Each change names the root's design section it lands in at consolidation. A task writes the new text here as it does
the work; the root's files change only when TT is consolidated.

## MODIFIED design/testing.md § The terminal tests

Rewritten: headless (`Bun.Terminal` and `@xterm/headless`, TT-D2) — how a check starts slipbox, sends keys, reads the
screen and its colours, the title and the clipboard's OSC 52, and answers slipbox's queries; the checks, one per
feature (TT-D3), and the coverage test (TT-D4); the parallel runner and its report (TT-D6); CI's runs; herdr's
remainder (the screenshots, the real-terminal set). Previously: "a herdr pane … a developer's tool, not part of
`bun run check` or CI".

## MODIFIED design/testing.md § The reference set

Each case named by the checks that cover it; the sets of `examples/` made for a purpose (the guides' folder); no
check writes its own (TT-D5).

## MODIFIED design/testing.md § Strategy

The terminal tests among the layers, in CI; test, then fix (TT-D6).
