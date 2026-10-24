---
status: todo
assignee: claude
blocked_by: []
tracker: [gh:#66]
created: "2026-10-24"
---

# SEO-T1: The words, and every page's title

Keep the site's words once and give every page a title that says what slipbox is.

## Description

`site/scripts/about.ts` (imports nothing): the line, the description, the card's file, size and alt text,
`fullTitle(page, home)` and `cardTags(base)`. A route middleware (`site/src/route-data.ts`) sets each page's `<title>`
from `fullTitle`. `astro.config.mjs` takes its description and the card's head tags (with the `describedby` link to
`llms.txt`) from `about.ts`. The home's front matter loses its description. Biome's includes gain the middleware.

## Acceptance criteria

- A built page's title is `<title> | slipbox: <the line>`, the 404's too; the home's `slipbox: <the line>`; the header
  reads "slipbox".
- Every built page has the card's tags and the `describedby` link; the home's description is the site's.
- Unit tests for `fullTitle` and `cardTags`, and for the home without its own description.

## References

- Delivers: design.md § ADDED … search engines and agents (The words, Titles).
- Rests on: (SEO-D1), (SEO-D2).

## Log
