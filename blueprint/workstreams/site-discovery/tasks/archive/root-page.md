---
status: done
assignee: claude
blocked_by: [SEO-T1]
tracker: [gh:#66]
created: "2026-10-24"
---

# SEO-T4: The root's page

Make `/slipbox/` say what slipbox is while it still redirects.

## Description

`site/scripts/root.ts`' `rootPage(base)`, importing only `about.ts`, every value escaped; `release.ts`' `writeSite`
writes it with the repository's Pages site.

## Acceptance criteria

- `tests/release.test.ts`: `writeSite`'s `index.html` is `rootPage`'s; its head and body as the design says; escaping;
  `root.ts` and `about.ts` import only `node:` modules and each other.

## References

- Delivers: design.md § ADDED … search engines and agents (The root); § MODIFIED design/distribution.md § Previews.
- Rests on: (SEO-D3).

## Log

- 2026-10-24: `rootPage(site, repository)`, not `rootPage(base)`: the repository's address was needed too. The
  import rule's test is in `tests/site.test.ts`, which reads `site/` (D230's guard put it there). Mutations: values
  unescaped, `writeSite` not using it, both caught.
