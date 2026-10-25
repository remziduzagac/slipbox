---
status: done
assignee: Claude
blocked_by: []
created: "2026-10-19"
---

# DOCS-T2: Capture the screenshots for the new guides

Replace the placeholders DOCS-T1 left (DOCS-D3) with screenshots taken from their recipes, against the settled text.

## Acceptance criteria

- Every placeholder in the docs, the README and the site home is a screenshot under its capture name, with alt text
  saying what the picture shows.
- Each picture shows what its guide describes: the tour's own vault and notes, the Coffee note in the lens guide,
  Tokyo Night Moon in the theme picker.
- The five captures with no recipe get one: `quick-start-reading`, `introduction-overview`, `reading-editing-views`,
  `reading-editing-source`, `documentation-home`.
- `bun run shots` takes all of them; each PNG is looked at. The docs and site tests pass.

## References

- Delivers: ../../decisions.md § DOCS-D3; ../../design.md § Implementation boundaries.
- Rests on: DOCS-T1; DF-D19, D236 (screenshots made by a script, retaken by anyone).

## Log

- 2026-10-19: `examples/guide/` became the tour's vault, `slipbox-tour/` with `.slipbox/` as `slipbox init .` makes it;
  the quick start's `~/notes` is the same two notes without it (`NOTES` in `tests/terminal/shot.ts`).
- 2026-10-19: recipes moved to the tour (getting started, agents), the lens shots to the Coffee note, the theme shot to
  Moon, the settings shot to a changed value; `vaults-links` now shows the vault you went into, as its section asks.
  New recipes for the five captures above; the site home's goes in its hero again.
- 2026-10-19: messages that pass were waited out so they're not in the picture: the lens's and source mode's first-use
  hints, kestrel's config warnings, and git's "Reading … versions…" (new since the async git work). The overview and
  site-home shots zoom the explorer into `projects/`, past the reference set's odd names.
- 2026-10-19: `bun run shots`: 29/29 taken, each PNG looked at; ten came out byte-identical to the last capture. The
  docs and site tests pass (36, 238 assertions); the docs test now finds the site home's picture too.
- 2026-10-19: Codex reviewed all 29 PNG files against their alt text and recipes, including the entered-vault state in
  `vaults-links` and the restored site hero. PR #207 merged into the documentation branch as 2356861. Capture work
  accepted and done; final review of the complete documentation remains in DOCS-T1 / PR #205.
