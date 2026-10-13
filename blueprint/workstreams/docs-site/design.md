# Design changes

Each change names the root's design section it lands in at consolidation. A task writes the new text here as it does
the work; the root's files change only when DS is consolidated.

## ADDED design/distribution.md § The documentation site

The text, as DS-T1 built it:

**The site** (`site/`, DS-D1) is an Astro Starlight project of its own: its packages in `site/package.json`, exact,
under the root's install gates in `site/bunfig.toml` (no install script, a week's age), checked by
`bun run check:deps` (`siteProblems`), updated by Dependabot with the rest. It's served at
`https://<owner>.github.io/<name>/docs/` (`base: /slipbox/docs`), with Starlight's search (Pagefind, built with the
site), its sidebar, light and dark themes, and an edit link on each page. Pictures pass through as they are (no image
processing). sharp, Astro's optional package for it, is overridden by a placeholder (`site/stubs/sharp`), so neither it
nor its libvips (LGPL-3.0) is installed.

**Its pages are gathered from `docs/`** (`site/scripts/gather.ts`, before each build; DS-D2): the docs map's
(`docs/README.md`) `##` sections are the sidebar's groups and their lists its pages, in order; a page's H1 is its
title and its first paragraph its description; the links between the docs become the site's addresses
(`../manual/keys.md#leader` → `/slipbox/docs/manual/keys/#leader`), a link to a repository file outside `docs/` goes to
it on GitHub, code is left as it is; each page's edit link opens its file in `docs/`. The screenshots are copied in, and
the agent guide is also served as its Markdown (`/slipbox/docs/agent-guide.md`), for an agent to read. What's
gathered isn't committed. The home (`site/src/content/docs/index.mdx`) is the site's own: the paths, the buttons, the
agent prompt, the cards (DS-D3).

**Built** by `bun run site` (the site's install, then `gather`, `astro build` under Bun, and
`site/scripts/check-links.ts`, which fails on a link within the site to a page or heading that isn't there, or to a
path on the domain outside it but the installer's files). CI's `site` job runs it on every change, inside the
required `ci` check; `pages.yml` runs it and puts the site at `_site/docs/`.

## MODIFIED design/distribution.md § The Pages site

The site also holds the docs, at `docs/` (§ The documentation site), and its `index.html` sends a visitor there, with a
link to the repository. It's deployed also when `docs/` or `site/` change on `main`.

Previously: "An `index.html` sends a visitor to the repository. It's deployed when a release is published …, when the
bootstrap or the workflow changes on `main`, and by hand."

## MODIFIED design/repository.md § CI

The workflows table: `pages.yml` also on `docs/` and `site/` changed on `main`; `ci.yml` gains the `site` job, in the
required check's needs.

## MODIFIED design/repository.md § The upkeep files

`deviations.toml` no longer holds DOC-06: the docs are on GitHub Pages, built and deployed by Actions.

Previously: "DOC-06, a docs site, until after the first release (GR-D8)".

## MODIFIED design/testing.md § Strategy

`tests/docs.test.ts` covers the agent guide too; the site's build and its link check run in CI's `site` job.
