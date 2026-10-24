# Ideas

## The words

- One line everywhere slipbox describes itself, leading with the person: "the terminal companion you run beside your
  coding agent". (2026-10-24) Everywhere chosen, other words (SEO-D1).
- The site's words alone, the README and the rest left on D226's line until later. (2026-10-24) Not chosen (SEO-D1).
- "A terminal companion for working beside your coding agent". (2026-10-24) Not chosen (SEO-D1).
- "Read, review and edit what your coding agent writes, in your terminal". (2026-10-24) Chosen (SEO-D1).

## Titles

- The site's `title` made the long line: every page's title says it, but so does the header, beside the logo.
  (2026-10-24) Not chosen (SEO-D2).
- A route middleware (`routeMiddleware`) rewriting each page's `<title>`: one place, the home and the 404 included,
  the title itself a pure function the tests read. (2026-10-24) Chosen (SEO-D2).
- The full title in each page's front matter, written by the gathering: it can't reach the home, which isn't
  gathered, so the line would be typed twice. (2026-10-24) Not chosen (SEO-D2).
- A short suffix (`| slipbox`) on every page, the full line only in the home's title and the descriptions: titles
  stay short, but a page's result doesn't say what slipbox is. (2026-10-24) Not chosen (SEO-D2).

## The root

- A short page of its own: what slipbox is, the install command, links to the docs and the repository. A second home
  to keep beside the docs home, outside the site's styles. (2026-10-24) Not chosen (SEO-D3).
- The redirect kept, its head saying what slipbox is, with a canonical link to the docs. (2026-10-24) Chosen
  (SEO-D3).
- The root's page built by the site's own build rather than `release.ts`. Moves a file `pages.yml` deploys and
  `release.ts`' tests read, for little. (2026-10-24) Not chosen (SEO-D3).

## The card

- Made by a script from the logo, a screenshot and the line, committed. (2026-10-24) Chosen (SEO-D4).
- Made by the site's build: the fonts it needs aren't sure to be on every machine that builds the site. (2026-10-24)
  Not chosen (SEO-D4).
- A shot of its own in `bun run shots`, a terminal 1,200 by 630: the logo isn't in a terminal. (2026-10-24) Not chosen
  (SEO-D4).
- Made again by `bun run shots` after `readme-hero`: it would replace the committed card with one nobody has looked
  at; the stale-card test says what to run instead. (2026-10-24) Not chosen (SEO-D4).

## Agents

- `starlight-llms-txt`, the Starlight plugin: twelve more packages through the gates, for what the gathering already
  holds. (2026-10-24) Not chosen (SEO-D5).
- A Markdown copy of each page beside its HTML (`…/guides/install/index.md`), as llmstxt.org suggests, with
  `rel="alternate" type="text/markdown"`, and `llms.txt` linking those. (2026-10-24) Not now (SEO-D5): an idea
  for later.
- `llms.txt` at `/slipbox/` too: covers nothing more than the docs' one. (2026-10-24)
