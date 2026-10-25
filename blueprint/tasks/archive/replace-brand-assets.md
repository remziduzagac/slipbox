---
status: done
assignee: Codex
blocked_by: []
created: "2026-10-25"
---

# T32: Replace slipbox's public logo assets

Use the supplied outlined SVG family across the README and documentation site's branding, preserving surrounding
copy and existing example-project fixtures.

## Acceptance criteria

- The centered README uses the full logo, dark ink on light backgrounds and light ink on dark backgrounds, with
  `slipbox` as its alt text and no duplicate handwritten heading.
- Starlight uses its theme-aware wordmarks; small favicon slots use logomarks. Every served asset path resolves.
- The share card is regenerated from its existing SVG source with the full light-ink logo and inspected.
- The six source assets are committed unchanged; the obsolete slipbox logo is removed when no longer consumed.
- Focused branding tests, docs tests, typecheck, lint, docs checks and the site build pass. Unrelated work is excluded.

## References

- README.md; site/astro.config.mjs; site/scripts/gather.ts; site/scripts/about.ts; site/scripts/root.ts.
- scripts/share-card.ts; tests/site.test.ts.

## Log

- 2026-10-25: identified slipbox's README, header, favicons and generated share card as the consumers. The logo paths
  in the fictional Kestrel reference set belong to that test project and remain unchanged.
- 2026-10-25: used the full stacked logo in the README/card, the wordmark in the compact header and logomarks for
  favicons. The site's selected theme controls its header; favicons follow the browser's background preference.
- 2026-10-25: inspected rendered light/dark logo previews and the regenerated share card. The site's built header
  uses the two wordmarks and an accessible title; both favicon links have mutually exclusive background media.
- 2026-10-25: 62 docs/site tests pass (386 assertions), including supplied-file copies, README selection, SVG
  embedding, card freshness and favicon metadata. Branding and favicon tests were checked to fail without fixes.
- 2026-10-25: typecheck, boundary, size, dependency, lint, workflow and documentation gates pass. The site builds
  38 pages with valid links and metadata. The changed-test selector's full-suite fallback was stopped; focused
  tests are used locally. A browser-based README preview was unavailable; both logo backgrounds were rasterised
  and inspected. Merge into dev is authorized once CI passes.
