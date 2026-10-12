---
status: done
assignee: claude
blocked_by: []
created: "2026-10-11"
---

# DF-T8: The design where the code was right; the examples' stale text

The design says what the code does where the user found the code right; the examples stop describing what's gone.

## Description

- **B4 (DF-D11), B5 (DF-D12), B6 (DF-D13):** their text in DF's design.md, for the root's design/tui.md § Positions,
  design/rendering.md § Glyphs, design/lsp.md's table.
- **D:** `examples/vault/about-this-vault.md`, `examples/home/CASES.md` and the reference set's
  `notes/research/link-styles.md`: Mermaid and maths are drawn, and wikilinks are links in `notes/`.

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D11, DF-D12, DF-D13.

## Log

- 2026-10-11: B4, B5, B6 written in DF's design.md, each read against the code: `restoreSession` runs unless a file was
  named (`open: loc.file ?? null`, src/tui/run.ts); `detectGlyphMode` reads `SLIPBOX_GLYPHS` first and is used for
  `auto` only (src/core/glyphs.ts); the table from `LANGUAGES` (src/core/servers/languages.ts) (*read*).
- 2026-10-11: the examples' stale text waits for DF-T7, which adds Obsidian cases to the reference set and its
  `CASES.md`, so the two don't collide.
- 2026-10-11: D, after DF-T7 merged: `link-styles.md` says wikilinks are followed in `notes/` (checked:
  `slipbox links` there lists `[[kestrel-v2-3]]` resolved by its name, *ran*), its fenced line too;
  `about-this-vault.md` drops Mermaid and LaTeX from what's missing; `CASES.md` says maths and Mermaid are drawn; the
  manifest's two wikilink case titles likewise. `tests/home.test.ts` and `tests/docs.test.ts` pass (*ran*).

- 2026-10-12: accepted on the coordinator's recommendation, the user having said to take them as answers until done; done.
