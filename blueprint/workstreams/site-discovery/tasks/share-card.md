---
status: todo
assignee: claude
blocked_by: [SEO-T1]
tracker: [gh:#66]
created: "2026-10-24"
---

# SEO-T2: The share card

Make the picture a shared link shows, and keep it from going stale.

## Description

`scripts/screenshot.ts`' `toPng` takes a choice of fonts and default family. `scripts/share-card.ts`
(`bun run share-card`) draws the card (logo, name, line, the README's screenshot) as an SVG, rasterises it to
`assets/share-card.png`, 1,200 by 630, and writes the line and the logo's and screenshot's SHA-256 into it as `tEXt`
chunks. The gathering copies it to `site/public/share-card.png` (ignored).

## Acceptance criteria

- The card looked at, and shown to the maintainer, before it's committed.
- A test: its size, at most 1 MB, and its recorded line and hashes equal to the line, logo and screenshot now, naming
  the one that differs.

## References

- Delivers: design.md § ADDED … search engines and agents (The card).
- Rests on: (SEO-D4).

## Log
