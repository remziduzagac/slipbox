---
status: todo
assignee: claude
blocked_by: [SEO-T1]
tracker: [gh:#66]
created: "2026-10-24"
---

# SEO-T3: llms.txt and the full text

Serve the docs to agents at the docs' root.

## Description

`site/scripts/llms.ts`: `llmsTxt` and `llmsFull` from the docs map's groups and the gathered pages; `gather.ts` writes
both into `site/public/` (ignored). Reference under `## Optional`; the agent guide linked as Markdown; every link in the
full text absolute, a page's own anchors included; compatibility anchors left out.

## Acceptance criteria

- Unit tests from a small map: sections, lines, Optional, the full text's order, sources, absolute links.
- The built site serves both at `/slipbox/docs/`.

## References

- Delivers: design.md § ADDED … search engines and agents (For agents).
- Rests on: (SEO-D5).

## Log
