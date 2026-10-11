---
status: doing
assignee: claude
blocked_by: [DF-T6, DF-T7]
created: "2026-10-11"
---

# DF-T9: Screenshots in the guides and the screen chapter

About 10 to 15 screenshots, made by `scripts/screenshot.ts` from slipbox in a herdr pane of the coordinator's own.

## Description

- `scripts/screenshot.ts`, tried and committed; a script that takes them all from the reference set in one go.
- The places: the writers' proposals (DOC's tasks), the guides' key moments and the screen chapter only (DF-D19).
- Stored in `docs/images/`, linked with alt text that says what each shows.

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D19; requirements.md § Documentation (DF's change).

## Log

- 2026-10-12: `scripts/screenshot.ts`: a pane's screen (`herdr pane read --format ansi`) parsed into cells, drawn as
  an SVG cell by cell (box and block characters as shapes, so borders join), rasterised by resvg (a dependency
  already) with DejaVu Sans Mono, DejaVu Sans as the fallback for symbols it lacks (`ℹ`); resvg's WebAssembly loaded
  once. Tried on a capture first (*ran*).
- 2026-10-12: `tests/e2e/shots.ts`: fourteen screenshots, each a Session as the terminal tests start one (folders of
  its own, the Unicode glyph set), waited for the background index, then captured: the getting-started guide's own
  `~/notes` for its three and the conflict prompt; the reference set for the rest. A pane of a tab of my own, sized
  120×34 by `herdr terminal session control --takeover`; it grew to the window once, when the tab was viewed, and
  was sized again and every picture retaken (*ran*). 2.1 MB in all.
- 2026-10-12: placed with alt text: the guides (getting-started three, making-it-yours two, agents one, code-and-git
  three, from-obsidian-or-zk one, exporting one) and the screen chapter (the map, replacing its text drawing; the
  which-key popup; the Problems panel). `tests/docs.test.ts` checks each image link lands. An emoji file name in the
  reference set (`🚲 ride.md`) draws as a box: no emoji font here.
- Waiting: the which-key picture retaken once DF-T12 gives the popup its title (DF-D31).

