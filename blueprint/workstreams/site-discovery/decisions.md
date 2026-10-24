# Decisions: the site found, shared and read by agents

## SEO-D1: slipbox describes itself as reading, reviewing and editing what your coding agent writes (2026-10-24)

**Decision:** Wherever slipbox describes itself, its line is "Read, review and edit what your coding agent writes, in
your terminal", amending D226's "the terminal companion for coding agents". It's the README's bold first line, the
start of `package.json`'s description (then D226's sentence), `slipbox help`'s first line, the Homebrew formula's
`desc`, the docs map's first sentence, "What is slipbox?"'s first sentence, the skill's own line (for the agent:
"where the user reads, reviews and edits what you write"), the site's description and the end of every page's title.
The words are kept once for the site (`site/scripts/about.ts`); a test holds the other files to them. The repository's
description on GitHub is the maintainer's to match.

**Why:** The maintainer's call, from issue #66: "for coding agents" reads as a tool agents use, while slipbox is made
for the person working beside the agent; an agent can use it too, but the words lead with the person. Changing the
site's words alone would split the descriptions in two, which D226 was made to end. Of the three wordings offered,
this one says what you do with slipbox, which is what a search result has to say.

**Not chosen:** "the terminal companion you run beside your coding agent", which kept D226's "companion"; "a terminal
companion for working beside your coding agent"; the site's words alone for now (ideas.md § The words).

## SEO-D2: Every page's title ends with slipbox's line (2026-10-24)

**Decision:** Every page's `<title>` is `<the page's title> | slipbox: <the line>`, the 404's included, and the docs
home's `slipbox: <the line>`, set by a Starlight route middleware from `about.ts`' `fullTitle`. Starlight's `title`
stays `slipbox`, the header's text and `og:site_name`; `og:title` stays the page's own title. The home's description is
the site's.

**Why:** The issue asks for the site's title, appended to every page's, to say what slipbox is, so a result says it
without being opened. The middleware reaches the home and the 404, which the gathering doesn't, so the line is written
once.

**Cost:** Titles longer than Google shows: a result is cut after about 60 characters, so most pages show the line's
start.

**Not chosen:** the site's `title` made the line (the header would say it); the full title in each gathered page's
front matter (the home typed by hand); a short suffix (ideas.md § Titles).

## SEO-D3: The root stays a redirect, with a head that says what slipbox is (2026-10-24)

**Decision:** `/slipbox/` stays an instant redirect to `docs/`. Its head carries the docs home's title and
description, a canonical link to `docs/`, the Open Graph tags and the card, a `describedby` link to `docs/llms.txt` and
the logo; its body one line linking the docs, the install guide and the repository. `site/scripts/root.ts` writes it,
for `release.ts site`.

**Why:** The maintainer's call. Google takes an instant refresh as a permanent redirect and indexes the docs home,
whose title and description now say what slipbox is; link previews and agents read the root's own head. Nothing new to
keep beside the docs home.

**Not chosen:** a short page of its own, a second home outside the site's styles (ideas.md § The root).

## SEO-D4: A share card made from the logo, a screenshot and the line (2026-10-24)

**Decision:** `assets/share-card.png`, 1,200 by 630 and at most 1 MB: the logo, the name and the line over the README's
screenshot, made by `bun run share-card` with the screenshots' renderer and committed. It records the line and its
inputs' hashes in itself, and a test fails when they differ from what's committed, saying which. Every page and the
root carry it as `og:image`, with its type, size and alt text.

**Why:** The issue: a link shared shows no picture today, though the pages ask for a large card. The fonts it needs
aren't sure to be on every machine that builds the site, so it's made once and kept; the test keeps it from going
stale when the line or the screenshot changes.

**Not chosen:** made by the site's build; a shot in `bun run shots`; made again by `bun run shots` without being looked
at (ideas.md § The card).

## SEO-D5: llms.txt and the full text, written by the gathering (2026-10-24)

**Decision:** The gathering writes `llms.txt` (an H2 per group of the docs map, a line per page, the Reference group
under `## Optional`) and `llms-full.txt` (every page, every link absolute) into the site, at the docs' root, and every
page points to `llms.txt` with `rel="describedby"`. No new package.

**Why:** The issue, and the maintainer's preference for a step in `site/scripts/` over a package where it can do the
same: the gathering already holds every page's title, description and text. Reference is optional because the full
text is about 650 KB, more than many agents' fetchers read.

**Not chosen:** `starlight-llms-txt`, a dozen packages through the gates; a Markdown copy of each page beside its
HTML (ideas.md § Agents).

## SEO-D6: The site's build checks what it tells search engines and agents (2026-10-24)

**Decision:** `site/scripts/check-meta.ts`, the build's last step, fails when a page's title, description,
`describedby` link or card tags, the card, either llms file, or the root's title, description, canonical link or card
tags is missing or wrong. In the build it checks `rootPage`'s output; `pages.yml` runs it again over the Pages site it
deploys.

**Why:** The issue asks for the build in CI to fail if the picture, `llms.txt` or the root's description goes missing.
CI's `site` job builds on every change; the root is only written when `pages.yml` deploys, so both are checked.
