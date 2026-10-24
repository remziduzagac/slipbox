# Design changes

## ADDED design/distribution.md § What the site tells search engines and agents

After § The documentation site.

**The words** are kept once, in `site/scripts/about.ts`, which imports nothing: slipbox's line, "read, review and
edit what your coding agent writes, in your terminal" (SEO-D1); a description of at most 160 characters for search
results ("slipbox is a terminal app to read, review and edit what your coding agent writes: Markdown and code
rendered, and edited where you read them."); the card's file, size and alt text; and what's made from them:
`fullTitle(page, home)`, a page's title, and `headTags(docs)`, the card's head tags and the link to `llms.txt` for
docs at `docs`. The site's
config, its route middleware, the gathering, the root's page, the card's script and the build's check all take them
from there. Where slipbox describes itself outside the site (SEO-D1, § Where slipbox describes itself),
`tests/docs.test.ts` reads each file as text and holds it to the same line.

**Titles** (SEO-D2). Starlight's `title` stays `slipbox`: it's the header's text and `og:site_name`. A route
middleware (`site/src/route-data.ts`, Starlight's `routeMiddleware`) sets every page's `<title>` to `<the page's
title> | slipbox: <the line>`, the 404's included, and the home's to `slipbox: <the line>`. The home's front matter
loses its own description, so Starlight gives it the site's (`description` in the config, from `about.ts`); its
visible heading and text don't change. `og:title` stays the page's own title, and a page's description its first
paragraph, as now.

**The card** (SEO-D4), `assets/share-card.png`, 1,200 by 630 and at most 1 MB: the logo and the name at the top left,
the line beneath, and the README's screenshot (`docs/images/readme-hero.png`) below them, cut off by the card's right
and bottom edges, on the logo's dark blue. `scripts/share-card.ts` (`bun run share-card`) draws it as an SVG and
rasterises it with `scripts/screenshot.ts`' `toPng`, which gains a choice of fonts and default family (DejaVu Sans and
its bold here; the screenshots keep DejaVu Sans Mono), and embeds the screenshot as `toSvg` embeds a picture. It writes
into the PNG, as `tEXt` chunks, the line and the SHA-256 of the logo and of the screenshot. `tests/site.test.ts` fails
when one differs from what's committed now, naming which and saying to run `bun run share-card` and look at the card;
it also holds the card to its size and its byte limit. The gathering copies the card into the site, as it does the
logo (`public/share-card.png`). Every page's head gets, from the config's `head` (`headTags`): `og:image` (an absolute
address, the site's and the base's: `https://remziduzagac.github.io/slipbox/docs/share-card.png`), `og:image:type`,
`og:image:width`, `og:image:height`, `og:image:alt` and `twitter:image:alt`; Starlight already asks for the large card
(`twitter:card`).

**For agents** (SEO-D5): the gathering writes `llms.txt` and `llms-full.txt` into `public/`, so they're served at
the docs' root (`site/scripts/llms.ts`, which `gather.ts` calls). Every page's head points to `llms.txt` with `<link
rel="describedby">`, as llmstxt.org proposes.

- `llms.txt`: `# slipbox`; the description as a blockquote; a paragraph saying slipbox is for the person beside the
  agent and that an agent can use it too, that these docs follow the newest release while `slipbox skill` prints the
  skill of the version installed, and that the full text is in `llms-full.txt`, with its size; then an H2 per group of
  the docs map, in its order, a line per page, `- [<title>](<absolute address>): <its description>`, the agent guide's
  line linking its Markdown (`agent-guide.md`). The Reference group goes under `## Optional`, the proposal's section
  for what an agent may skip. The compatibility pages aren't listed.
- `llms-full.txt`: the same H1 and blockquote, then every page of the map in its order, each `# <title>`, a
  `Source: <absolute address>` line and its Markdown as gathered, every link and picture made absolute: the site's
  `/slipbox/docs/…` addresses prefixed by its origin, and a page's own anchors (`#…`) by its address. The compatibility
  anchors (`<a id="…"></a>` lines) are left out. About 650 KB.

**The root** (SEO-D3), `/slipbox/`, is still an instant redirect to `docs/`, which Google takes as permanent, so the
docs home is what it indexes. `site/scripts/root.ts`' `rootPage(site, repository)`, which imports only `about.ts`,
writes it; `release.ts site`'s `writeSite` calls it with the repository's Pages site (`pagesBase`) and its address on
GitHub. Every value in it
is escaped for HTML. Its head: `<html lang="en">`, a viewport, the docs home's title and description, a canonical link
to `docs/`, `og:type` `website`, `og:title`, `og:description`, `og:url` (the docs home), `og:site_name`, the card's
tags, `twitter:card`, `<link rel="describedby">` to `docs/llms.txt`, and the logo as its icon. Its body: one line saying
what slipbox is, linking the docs, the install guide and the repository, for a reader whose browser doesn't follow the
refresh. A test holds `root.ts` and `about.ts` to importing only `node:` modules and each other: `pages.yml` runs
`release.ts` before any package is installed.

**The check** (SEO-D6), `site/scripts/check-meta.ts`, the site's build's last step, after `check-links.ts`, reads the
built docs and fails, listing each problem, when:

- a page lacks its full title, its description, its `describedby` link or any of the card's tags, or a tag's value
  differs from `about.ts`'; the home's description isn't the site's;
- the card isn't in the built site, or its size (read from its PNG header) isn't what the tags say;
- `llms.txt` or `llms-full.txt` is missing, or leaves out a page of the docs map;
- the root's page lacks its title, description, canonical link, refresh, `describedby` link or the card's tags.

In the site's build there's no root yet, so it checks `rootPage`'s for the site's own base, and CI's `site` job runs it
on every change, inside the required check. `pages.yml` runs it again over the Pages site it's about to deploy
(`--pages _site`): the root `release.ts` wrote, and the docs beside it.

Previously: none; the section is new.

## MODIFIED design/distribution.md § Previews

In "The Pages site" paragraph, the sentence on the site's index, whole:

The site also holds the docs, at `docs/` (§ The documentation site), and its `index.html` (`site/scripts/root.ts`)
sends a visitor there at once, its head saying what slipbox is to a search engine and a link preview (§ What the site
tells search engines and agents). `pages.yml` checks both before it deploys.

Previously: "The site also holds the docs, at `docs/` (§ The documentation site), and its `index.html` sends a visitor
there, with a link to the repository."

## Where slipbox describes itself (SEO-D1)

Not a design section, but the code and documents the line reaches:

- the README's bold first line, "Read, review and edit what your coding agent writes, in your terminal.", the
  paragraph after it no longer opening with the same words;
- `package.json`'s description: the line, then the rest of D226's sentence ("…, with Markdown and code rendered
  cleanly, an editor that's necessary and sufficient, and agent integration built in.");
- `slipbox help`'s first line (`src/cli/cli.ts`): `slipbox <version> — read, review and edit what your coding agent
  writes, in your terminal`;
- the Homebrew formula's `desc` (`scripts/homebrew.template.rb`): "Read, review and edit what your coding agent
  writes, in your terminal", 69 characters, within brew's 80;
- the docs map's first sentence (`docs/README.md`), which D226 calls the documentation's index;
- "What is slipbox?"'s first sentence (`docs/manual/introduction.md`), its page's description in search results;
- the skill's own line (`skills/slipbox/SKILL.md`), for the agent: slipbox is where the user reads, reviews and edits
  what you write, in their terminal;
- the site: its description, every title, `llms.txt`, the root and the card.

The blueprint's README and requirements say it too; they change at consolidation (requirements.md § Changes), with a
note under D226.

## The user docs

The docs home's "Help from your agent" section gains a sentence: an agent can read the docs as `llms.txt` and in full
as `llms-full.txt`. The docs map (`docs/README.md`) says the same beside the site's address. The CHANGELOG says what
users and sharers will notice.

## Tests

- `tests/site.test.ts`: `fullTitle`, the home's and a page's; `headTags`; `llms.txt`'s sections, lines and Optional
  group from a small map; `llms-full.txt`'s pages, order, sources and absolute links (anchors included), compatibility
  anchors left out; the card's size, byte limit, line and inputs' hashes; the home's front matter without a
  description; `root.ts` and `about.ts` importing only `node:` modules and each other; `check-meta`'s findings, a part
  missing at a time, on a small built site.
- `tests/release.test.ts`: `writeSite`'s `index.html` is `rootPage`'s for the repository's Pages site; `rootPage`'s
  head and body; it escapes its values.
- `tests/docs.test.ts`: the line where SEO-D1 puts it, each file read as text.
- `check-meta.ts`, checked by running it over a built site with each part removed once, to see it fail.
- No terminal check: nothing in the TUI changes. `slipbox help`'s first line, if it changes, is the CLI's tests'.
