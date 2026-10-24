---
status: done
assignee: claude
blocked_by: [SEO-T2, SEO-T3, SEO-T4]
tracker: [gh:#66]
created: "2026-10-24"
---

# SEO-T5: The build's check

Fail the site's build when what it tells search engines and agents goes missing.

## Description

`site/scripts/check-meta.ts`, after `check-links.ts` in the site's build; `--pages <dir>` checks a whole Pages site,
which `pages.yml` runs over `_site` before it deploys.

## Acceptance criteria

- Run over a built site with each part removed once (a page's tag, the card, each llms file, the root's description),
  it fails naming it; whole, it passes.
- Its pure parts unit-tested.

## References

- Delivers: design.md § ADDED … search engines and agents (The check).
- Rests on: (SEO-D6).

## Log

- 2026-10-24: run over a copy of the Pages site (`site/dist` as `docs/`, the root from `writeSite`), whole it passes;
  with a page's `og:image`, a page's `describedby`, a page's full title, the card, `llms.txt`, `llms-full.txt` or the
  root's description removed, one at a time, it fails naming that one. `pages.yml` runs it with `--pages _site`.
