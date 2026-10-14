---
status: review
assignee: claude-cli
blocked_by: []
created: "2026-10-14"
---

# DS-T1: The site, and its front door

The Starlight site under `site/`, gathered from `docs/`, built in CI and deployed by `pages.yml` (DS-D1, DS-D2); the
home with its paths and agent prompt, the quick start, the concepts page and the agent guide, the map in its new
groups (DS-D3).

## Done when

- `bun run site` builds every page of `docs/` and the home, every link within the site landing; CI's `site` job runs
  it inside `ci`; `pages.yml` puts it at `docs/`, and the Pages index sends a visitor there.
- `site/`'s packages exact and gated (`bun run check:deps`), updated by Dependabot.
- `docs/guides/quick-start.md`, `docs/manual/concepts.md` and `docs/agent-guide.md` written to DS-D4's rules, linked
  from the map; `tests/docs.test.ts` checks the agent guide too.
- DOC-06's deviation removed; the README links the site.
