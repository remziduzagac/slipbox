---
status: review
assignee: maintainer
blocked_by: []
created: "2026-10-25"
---

# HTML-T1: Document HTML compatibility (#90)

Implement HTML-D1–HTML-D5 in independently testable stages: shared adapter and source ranges; scoped inline/container
formatting; image dimensions, links and theme selection; disclosures and target reveal; exports and cross-surface
verification. Follow the acceptance matrix in requirements.md and issue #90. Add focused unit and terminal tests,
user documentation, changelog and affected screenshots. Root design consolidation requires separate approval.

## Development verification

- Tokenizer, scoped formatting and resets, entities/attributes, malformed and bounded fragments, mixed HTML/Markdown,
  picture alternatives, dimensions, source lines, cache variants and embed resolution: tests/html.test.ts.
- Disclosures by named command and Enter, target and outline reveal, remote ask/show/never, linked graphics by click
  and keyboard, Lens/Source edits: tests/html-tui.test.ts.
- Lossless block and inline HTML, omission, semantic HTML/EPUB/Word and remote badge fallback: tests/html-export.test.ts.
- Real plain/ANSI CLI and Markdown export worker: tests/html-cli.test.ts.
- Upgrade from generation 12 in both content and vault caches: tests/html-cache.test.ts.
- PDF text, heading destination, local linked graphic, Word hyperlink graphic, embedded HTML export:
  tests/export.test.ts, the two document-HTML tests.
- New terminal checks: tests/terminal/checks/html.ts; existing HTML reading, outline and kitchen-sink checks retained.
- User docs describe exact scope and page-format differences; reading-html screenshot captured and inspected.

Regression verification disables the render adapter, theme-attribute resets, PDF link retention and Word image
retention separately; the corresponding tests fail. The uncached-image fallback and stale-cache tests also failed
before their fixes. Root design remains pending consolidation; development ends at a draft pull request.
