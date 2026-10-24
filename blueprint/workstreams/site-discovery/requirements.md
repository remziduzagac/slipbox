# Requirements

## Goals

- A search result for any page of the docs says what slipbox is without being opened: its title names slipbox and
  says you read, review and edit what your coding agent writes with it, in your terminal, and the docs home's
  description says what it does (issue #66).
- The words lead with the person: slipbox is made for the person working beside a coding agent; an agent can use it
  too, but that comes second (SEO-D1).
- A link to the site's root or to any page, shared in a chat or a forum, shows slipbox's picture, its size and alt
  text given (SEO-D4).
- `/slipbox/` says what slipbox is to a search engine and a link preview, not only redirects (SEO-D3).
- An agent reading the docs finds `llms.txt` at the docs' root, a line per page, and the docs' full text beside it in
  `llms-full.txt`, both rebuilt with the site (SEO-D5).
- The site's build fails when the picture, `llms.txt`, the full text or the root's description goes missing
  (SEO-D6).

## Non-goals

- The maintainer's own steps: the repository's description and website field, Google Search Console and Bing
  Webmaster Tools, announcing the site, a domain of its own (and with it a `robots.txt` at the domain's root).
- A new package for the site: the gathering already holds what `llms.txt` needs.
- A Markdown copy of every page beside its HTML (ideas.md § Agents).
- Changing what the docs say, the site's look or its navigation, but for a sentence on `llms.txt` in the home's
  agent section and in the docs map, and SEO-D1's line where it puts it.
- Any change to slipbox itself, but its one-line description where SEO-D1 puts it (`slipbox help`).

## Builds on

- design/distribution.md § The documentation site: the site, its gathering from `docs/`, its build and link check
  (DS-D1–DS-D3). DOCS changes that section's text too; SEO adds a section beside it instead.
- design/distribution.md § Previews, "The Pages site": what `pages.yml` deploys, `release.ts site` among it.
- requirements.md § Documentation: `docs/` the one source, the site built from it (DOCS changes it).
- D226: how slipbox describes itself, which SEO-D1 amends.
- design/testing.md § The terminal tests: the screenshots, of which the card reuses one.

## Acceptance criteria

- Every page's `<title>` is `<its title> | slipbox: <the line>`, the 404's included, and the home's `slipbox: <the
  line>`; the header still reads "slipbox". The home's description is the site's, and says what slipbox is, in SEO-D1's
  words.
- Every page's head has `og:image` (an absolute address), `og:image:type`, `og:image:width`, `og:image:height` and
  `og:image:alt`, `twitter:image:alt`, and a `describedby` link to `llms.txt`; the picture is served at that address,
  1,200 by 630 and at most 1 MB, its size as the tags say; the root's head has the same.
- `/slipbox/docs/llms.txt`: an H1, the summary as a blockquote, a short paragraph naming the full text and its size,
  the agent guide and `slipbox skill`, then a section per group of the docs map, a line per page with its address and
  its description, the Reference group under `## Optional`. `/slipbox/docs/llms-full.txt`: every page of the map, in
  its order, each its title, its address and its text, every link in it an absolute address, a page's own anchors
  included.
- `/slipbox/` (the Pages site's `index.html`): a title and description in SEO-D1's words, a canonical link to the docs
  home, the Open Graph tags and the card, a `describedby` link to `docs/llms.txt`, the instant redirect to `docs/`,
  and a line linking the docs, the install guide and the repository; its values escaped.
- `bun run site` fails, saying what's missing, when a page's head lacks its title, description, `describedby` link or
  the card's tags, the card's file or its size is wrong, `llms.txt` or `llms-full.txt` is missing or leaves out a page
  of the map, or the root's page lacks its title, description, canonical link or the card's tags; `pages.yml` runs the
  same check over the Pages site it deploys.
- The card is made by one command from the logo, a screenshot and the line; a test fails when the committed card was
  made from another logo, screenshot or line, saying which.
- Unit tests for each case (`tests/site.test.ts`, `tests/release.test.ts`); the site built and served locally, its
  heads, the root and both files read, and the card looked at; `bun run check`'s typecheck, lint and `check:docs`
  pass; the user docs, the CHANGELOG and the design say it.

## Changes

### ADDED requirements.md § The site found and shared

After § Documentation.

- The docs site says what slipbox is wherever it's met without being opened: every page's title names slipbox and
  says you read, review and edit what your coding agent writes with it, in your terminal, and the docs home's
  description says what it does, in the words slipbox describes itself with (SEO-D1, SEO-D2).
- A link to the site's root or any page shows slipbox's picture when it's shared (SEO-D4); the root says what
  slipbox is to a search engine, and sends a visitor on to the docs (SEO-D3).
- Agents find the docs as `llms.txt` at the docs' root, a line per page, and their full text in `llms-full.txt`,
  rebuilt with the site (SEO-D5).
- The site's build fails when any of these goes missing (SEO-D6).

How: design/distribution.md § What the site tells search engines and agents.

### MODIFIED requirements.md (the opening paragraph)

slipbox is for a developer working beside coding agents in a terminal, often over SSH on the machine that holds the
repository, where nothing beyond the terminal can be assumed: they read, review and edit what their agent writes in it
(D3, D226, SEO-D1). It lets them read markdown and any other text file well in that terminal, review what an agent
changed, follow and search the links between them, edit them, and hand their notes to agents, while agents read and
change the same files through a CLI (D33).

Previously: "slipbox is the terminal companion for coding agents, for a developer working with them in a terminal,
often over SSH on the machine that holds the repository, where nothing beyond the terminal can be assumed (D3, D226).
It lets them read markdown and any other text file well in that terminal, review what an agent changed, follow and
search the links between them, edit them, and hand their notes to agents, while agents read and change the same files
through a CLI (D33)."
