---
status: done
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

- 2026-10-24: a name clash — `gather.ts`' own `SITE` (the site's folder) shadowed `about.ts`' — made the first
  addresses file paths; imported as `ORIGIN`. The full text's `Source:` is each page's address, the agent guide's too,
  while `llms.txt` links the guide's Markdown (the build's check found the two disagreeing). 35 pages, about 706 KB.
  Mutations: anchors left relative, the reference not under Optional, both caught.
- 2026-10-24, review: the served agent guide was a raw copy, its links relative to `docs/` and broken on the site
  (on `dev` before this work, but `llms.txt` now sends agents there): `servedGuide` writes it with absolute links, as
  the full text has them. `llms.txt`'s paragraph names the agent guide, as the acceptance asks; a map with no
  Reference group stops the gathering, since the paragraph promises the Optional section. `pageAddress` is the one
  place a page's address is made. Mutations: each undone, caught.
- 2026-10-24, CI on the review's fixes: a clean checkout has no `site/public/`, and writing the guide there came
  before anything made it; the gathering makes it first, and a test runs it in a copy with none. A fresh clone's
  `bun run site` passes. CodeQL flagged the `pages.yml` test's pattern, a repetition that could backtrack: the
  test splits the commands into words instead.
