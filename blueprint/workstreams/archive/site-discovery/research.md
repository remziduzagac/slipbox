---
status: current
created: "2026-10-24"
---

# Research: what search engines, shared links and agents read

What the docs site needs to say what slipbox is to a search engine, a link preview and an agent: what the formats ask
for, what the installed Starlight already writes, and what the site serves today. Sources read on 2026-10-24; the
installed packages are the site's own (`site/bun.lock`), installed with `bun install --cwd site --frozen-lockfile`.

## Summary

- **Starlight writes most of a page's head already, but no picture** (*read*): a title, a canonical link, a
  description, `og:title`, `og:type`, `og:url`, `og:description`, `og:site_name` and `twitter:card`
  `summary_large_image`; no `og:image`. A page's front matter `head` replaces any default of the same tag, a `<title>`
  included, so the gathering can set each page's full title (design.md § ADDED … search engines and agents).
- **A page's title is `<page> | <site title>`, and the site title is also the header's text** (*read*): making it
  longer makes the header longer, so the full title is set per page instead of in `title`.
- **An instant meta refresh is a permanent redirect to Google, its target the canonical** (*read*): the root's
  redirect hands search to the docs home; what the root itself says matters to link previews and to engines that read
  it before following.
- **`og:image` is required Open Graph metadata; its width, height, type and alt are structured properties** (*read*).
- **`llms.txt` may sit at a subpath and covers everything under it** (*read*): `/slipbox/docs/llms.txt` covers the
  docs. Only its H1 is required; then a blockquote summary, prose, and H2 sections of `[name](url): notes` lines.
  `llms-full.txt` isn't in the proposal; it's a convention of the tools that write it.
- **`starlight-llms-txt` would bring a dozen packages** (*read*): the issue's alternative, a step in `site/scripts/`,
  needs none, and the gathering already holds every page's title, description and text.

## Starlight 0.42.6's head

- `dist/utils/head.js`, `getHead`: the defaults listed above; the title is
  `` `${data.title} ${config.titleDelimiter} ${siteTitle}` ``; a sitemap link when `site` is set (*read*).
- `createHead(defaults, config.head, data.head)`: the config's `head`, then the page's front matter `head`, each
  replacing a default with the same `<title>`, the same `<meta>` name or property, or a canonical or sitemap link
  (`mergeHead`, `hasTag`) (*read*).
- The header's text is the route's `siteTitle`, the config's `title` (`dist/components/SiteTitle.astro`) (*read*).

## The formats

- **Open Graph** (ogp.me): `og:title`, `og:type`, `og:image` and `og:url` are the required basic metadata;
  `og:image:type`, `og:image:width`, `og:image:height` and `og:image:alt` ("a description of what is in the image
  (not a caption)") describe the picture (*read*).
- **X's large card**: a 2:1 picture, at least 300 by 157, under 5 MB; X falls back to the Open Graph tags when its own
  are missing (*memory*: X's page answered 402). 1,200 by 630 is the size Facebook and LinkedIn recommend
  (*memory*), and fits X's crop.
- **llms.txt** (llmstxt.org): at `/llms.txt` or a subpath, the most specific one used; an H1, the only required part;
  a blockquote summary; prose without headings; H2 sections of file lists, `[name](url)`, optionally `: notes`; an
  "Optional" section for what an agent may skip. Pages may offer a clean Markdown version at the same URL with `.md`
  (`index.md` for an address ending in `/`). A page can point to the file covering it with `rel="describedby"`, and to
  its Markdown with `rel="alternate" type="text/markdown"` (*read*).
- **Google's meta refresh**: "Google Search interprets instant `meta refresh` redirects as permanent redirects", and
  uses a permanent redirect "as a signal that the redirect target should be canonical" (*read*).

## The site today

- `site/astro.config.mjs`: `title: "slipbox"`; `description: "The terminal companion for coding agents: read, review
  and edit what your agent writes."` (*read*).
- `site/src/content/docs/index.mdx`: the home's title "slipbox documentation", its description "Read, review and edit
  notes and code in your terminal. …" (*read*).
- `site/scripts/gather.ts`, `splitPage`: a page's description is its first paragraph, cut at 220 characters
  (*read*).
- `scripts/release.ts`, `writeSite`: the root's `index.html` is a title, a meta refresh to `docs/` and one line of
  links (*read*).
- The docs' Markdown is 670,970 bytes (*ran*: `wc -c` over `docs/guides`, `docs/manual` and the agent guide): the
  full text is about that size.

## starlight-llms-txt

- 0.12.0, MIT, published with provenance; peers `astro ^7.0.0`, `@astrojs/starlight >=0.41.0`; twelve dependencies,
  `@astrojs/mdx`, `unified`, `rehype-parse`, `rehype-remark`, `remark-gfm`, `remark-stringify`, `micromatch`,
  `github-slugger`, `hast-util-select`, `unist-util-remove` and two type packages (*read*: the npm registry's
  `latest`).

## Gaps

- Not tried: how each link preview (Slack, Discord, X, Hacker News) renders the card; that needs the site deployed.
- Whether Bing or DuckDuckGo read `llms.txt`: none says so.

## Sources

- <https://llmstxt.org/> and <https://llmstxt.org/index.md> (2026-10-24).
- <https://ogp.me/> (2026-10-24).
- <https://developers.google.com/search/docs/crawling-indexing/301-redirects> (2026-10-24).
- <https://registry.npmjs.org/starlight-llms-txt/latest> (2026-10-24).
- `site/node_modules/@astrojs/starlight/dist/utils/head.js`, `dist/components/SiteTitle.astro` (0.42.6).
