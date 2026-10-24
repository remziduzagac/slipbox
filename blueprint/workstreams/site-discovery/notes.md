# Notes: the site found, shared and read by agents

## The draft (2026-10-24)

- **Read:** issue #66; design/distribution.md § The documentation site, § Previews; requirements.md § Documentation;
  D226; DOCS's changes to the same sections; `site/astro.config.mjs`, `site/scripts/gather.ts`,
  `site/scripts/check-links.ts`, `site/src/content/docs/index.mdx`, `scripts/release.ts` (`writeSite`),
  `.github/workflows/pages.yml` and `ci.yml`'s `site` job; Starlight 0.42.6's head (research.md).
- **The maintainer's terms** for this issue: the "Not this issue" list stays theirs (the repository's description and
  website field, Search Console, Bing, announcing it, a domain), and no repository setting is touched; the words lead
  with the person working beside the agent; a new package for the site only through `check:deps`' gates, a step in
  `site/scripts/` preferred where it does the same; the card looked at before it's committed; one review round, then
  the hand-over.
- **Found:** D226 has slipbox describe itself everywhere as "the terminal companion for coding agents", the line the
  issue says reads as a tool agents use; changing the site's words alone splits the descriptions in two, which D226
  was made to end, so the words are a root decision (SEO-D1). DOCS modifies § The documentation site and § Documentation
  too, so SEO adds sections beside them rather than rewriting them.
- **Research:** research.md.
- **Drafted:** requirements.md, design.md, ideas.md.

## The design's critique (2026-10-24)

- Codex was at its usage limit (until 17:53), so its critique was skipped; a fresh Claude reviewer read the draft
  against the code instead, from the same request (`tmp/issue/codex-request-1.md`). Twelve findings, all taken:
  1. The gathering's front matter can't reach the home (`index.mdx` isn't gathered), so the line would be typed twice:
     taken — a route middleware sets every title, the home's and the 404's too, from a pure `fullTitle`; the home's
     own description goes, so it gets the site's.
  2. The home's title was given two ways: taken — `slipbox: <the line>`.
  3. `rootPage(repo)` would need `pagesBase` from `src/core/`, and `pages.yml` runs `release.ts` before any package is
     installed: taken — `rootPage(base)`, `about.ts` and `root.ts` importing nothing but each other and `node:`, a test
     holding them to it; the card's tags made once (`cardTags`).
  4. The new files in `site/public/` would show as untracked: taken — `site/.gitignore`.
  5. `toPng` loads only the mono fonts: taken — a choice of fonts and family, not a second rasteriser.
  6. The card's staleness check: taken, trimmed — the line and each input's hash, so the test says which changed; the
     script left out, so a reformat doesn't force a new card; no `bun run shots` coupling; a byte limit.
  7. A page's own anchors would be ambiguous in one file of all pages: taken — made absolute too.
  8. 650 KB is more than many agents' fetchers read: taken — the Reference group under `## Optional`, the full text's
     size said, the agent guide linked as Markdown, and a word that the docs follow the newest release.
  9. The root lacked `lang`, a viewport and a `describedby` link, and its values would go unescaped: taken.
  10. Checking the root through `rootPage` in the build never sees what `pages.yml` deploys: taken — `writeSite`'s
      `index.html` tested against `rootPage`, and `pages.yml` running the check over `_site`; the build keeps its own
      check of `rootPage`'s, so CI's `site` job covers the root on every change, as the issue asks. The home's
      description and every page's `describedby` link checked too.
  11. D226's "documentation's index" (`docs/README.md`), "What is slipbox?"'s first sentence and the skill's line were
      left out of SEO-D1's reach, and the docs home's new sentence on `llms.txt` contradicted a non-goal: taken.
  12. SEO-D1's test belongs with the docs' tests, reading files as text: taken.
- **The reviewer's questions for the maintainer:** SEO-D1's words and reach; the titles' length; the root; the card's look
  once made. They're below, but the card's look, which the maintainer sees in the pull request.

## Open questions

1. **Where the new line goes** (SEO-D1, amending D226): everywhere D226 put the old one, and where the reviewer found
   more (design.md § Where slipbox describes itself), or the site alone for now. Proposed: everywhere, so the
   descriptions stay one; it grows the pull request by eight one-line changes and a test.
2. **The line's words, and the titles' length.** Proposed: "the terminal companion you run beside your coding agent",
   on every page's title as the issue asks (`Quick start | slipbox, the terminal companion you run beside your coding
   agent`). Google shows about 60 characters, so a result shows `Quick start | slipbox, the terminal companion you
   run…`.
3. **The root** (SEO-D3): the redirect kept, its head saying what slipbox is, or a short page of its own. Proposed:
   the redirect.

## The maintainer's answers (2026-10-24)

- 1, where the line goes: everywhere, as proposed (SEO-D1).
- 2, the words: "read, review and edit what your coding agent writes, in your terminal", the third offered, over "the
  terminal companion you run beside your coding agent" (SEO-D1). In a title it follows a colon, not the comma the
  preview showed: "slipbox, read, review…" reads as a list (SEO-D2).
- 3, the root: the redirect with a full head, as proposed (SEO-D3).
- The design approved; the decisions recorded as SEO-D1 to SEO-D6. The words were drafted as a root decision (`D?1`);
  the decisions' README puts a decision made inside a workstream under its key, the note under D226 coming with the
  consolidation, so it's SEO-D1.
