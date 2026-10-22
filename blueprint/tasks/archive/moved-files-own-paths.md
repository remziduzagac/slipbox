---
status: done
assignee: claude-moves
created: "2026-10-11"
---

# T8: A moved code or data file's own relative paths are rewritten

Moving a code or data file rewrites the relative paths it holds (in comments, in a data file's links), as a note's own
relative links are.

## Description

A move rewrites the files linking in, and a note's own relative links when its folder changes; a code file's comment
paths (`16.10`) and a data file's links (`16.15`) are left, and break. Use the index's link ranges for those files to
rewrite them in their own form, previewed with the rest of the move's plan.

## Acceptance criteria

- A test: `src/a.ts` with `// see ../docs/x.md` moved to `src/sub/a.ts` gets `../../docs/x.md`; a YAML file's `$ref`
  or path likewise. It fails without the change.
- design/links.md § Renames and moves says it.

## References

- Delivers: design/links.md § Renames and moves.
- Rests on: D63.

## Log

- 2026-10-11: Fixed (`src/core/rename.ts`, `ownFileLinks` and `relativeAs`, called from `planMove` for a file that
  isn't a note when its folder changes): the file's own links from the index (`fileLinksOf`), each rewritten from
  where it will be, as it was written. A comment's path is its text up to its first `:` (`util.ts:12:3` keeps its
  `:12:3`); it is rewritten only when it no longer lands on its file from the new place (beside the file first, then
  from the root, as `commentPath` reads it), so `docs/x.md` read from the root and `/config/app.toml` stay. A data
  file's value keeps `./`, its fragment (`#/definitions/User`) and an extension left off; neither is
  percent-encoded. A target moving too (a folder's move) is left to its own backlink, as for a note.
- 2026-10-11: Found: a comment's `../../docs/x.md` wasn't read as a link at all (16.10's `PATH_RE` took one `../`
  only), so the rewritten path would have stopped being a link. `PATH_RE` in `src/core/syntax.ts` now takes `../` as
  many times as it climbs; the reference set's kestrel already has such comments (`src/sync/queue.ts`,
  `api/kestrel_api/sync.py`), which now read as links. Test added to `link-like tokens in code (16.10)` in
  tests/core.test.ts.
- 2026-10-11: Test `a code or data file moved: its own relative paths follow it, …` in tests/vault.test.ts (16.10):
  `src/a.ts` with `// see ../docs/x.md` moved to `src/sub/a.ts` gets `../../docs/x.md`, `util.ts:1:2` gets
  `../util.ts:1:2`, a from-root `docs/x.md` and a URL stay; `api/spec.yaml`'s `$ref: ../schemas/user.yaml#/…` and a
  path value moved to `api/v2/` get `../../…`; every link reaches what it did after. Mutation-checked: without the
  call, without the "still lands" check, with the old `PATH_RE`, and reading the path up to the last `:` instead of
  the first, it fails each time; the tokens test fails with the old `PATH_RE`.
- 2026-10-11: Tried on the reference set (kestrel): `mv src/sync/queue.ts src/sync/client/queue.ts` rewrote its
  `../../api/…:81`, `./retry.ts:12` (→ `../retry.ts:12`), `../../docs/sync.md` and `@see ../../docs/runbooks/…`,
  left `/config/app.toml` and `src/App.tsx:22:9`; `links` after resolved each as before. `mv config/base.yaml
  config/env/base.yaml` rewrote `$schema: ./schema.json` (→ `../schema.json`) and `docs: ../docs/architecture.md`;
  its `schema: config/schema.json` was unresolved before and after. The first try wrote `src/App.tsx:22:9` as
  `../../App.tsx:9` (the path cut at the last `:`): fixed, and the test covers it.
- 2026-10-11: design/links.md § Renames and moves says it.
- 2026-10-11: accepted by the user; done.
