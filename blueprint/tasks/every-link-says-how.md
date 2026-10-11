---
status: review
assignee: claude-links
created: "2026-10-11"
---

# T9: Every link says how it landed

Every resolved link carries how it landed, not wikilinks only: a markdown link by its path, a pointer by its name, a
hosting link by its URL.

## Description

D86: how every link landed is said (`links.ts` `Landed`). Today only wikilinks carry `how`; every link gets a
certainty. Give the other kinds their `how`, and show it where wikilinks' is shown (`slipbox resolve --json`, the
hover, the link check).

## Acceptance criteria

- Tests: `resolve --json` gives `how` for a markdown link, a pointer and a hosting link. They fail without the change.
- design/links.md § How a link landed lists every kind.

## References

- Delivers: design/links.md § How a link landed.
- Rests on: D86.

## Log

- 2026-10-11: `Landed` gains `pointer` and `hosting`. Every resolution reaching a file or folder now carries `how`: a
  markdown link's path in any form (`resolvePath`, `byFilesystemPath`, `intoNested`) `path`, which also covers a
  wikilink's `../` path and a path into a nested root (they had none); a pointer `pointer` (an old name or another
  copy still said by `via`); a hosting URL `hosting`. Unresolved links, anchors and URLs elsewhere have none.
  `certainty` counts `pointer` and `hosting` as exact (a hosting URL at another ref stays inferred, by its `hosted`).
- 2026-10-11: Where it shows: `resolve --json` and `links --json` give `how` as before (the via when there is one,
  else how). A hosting URL already gave `how: "hosting"` there, through its via; the core's `how` is new. The hover,
  `links`' words and the link check say a landing only when it isn't by the link's own path, name, pointer or URL at
  this branch (`describeLanding`); the new kinds are all of those, so nothing new shows there, as for a wikilink by
  its path or unique name.
- 2026-10-11: Test "every link says how it landed, not wikilinks only" in `tests/vault.test.ts` (how every link
  landed): `resolve --json` of a markdown link, a pointer and a hosting URL, and the graph's `how`, certainty and
  `describeLanding` of each, a folder link and a broken one. The existing tests' markdown link now says `path`.
  Mutation-checked once per kind: without `path` on a markdown link, `pointer` on a pointer, `hosting` on a hosting
  URL, the test fails (the hosting one in the graph's `how`, the CLI's being the via); restored, it passes.
- 2026-10-11: Tried on the reference set: `resolve --json` in `work/kestrel` of `[s](docs/sync.md)` (`path`), of its
  hosting URL at `main` (`hosting`, exact), at `refactor/docs-layout` (unresolved, its reason said); in `notes`, of
  `slipbox://kestrel/docs/sync.md` (`pointer`); `links index.md --json` in `notes` gives `path` or `pointer` for every
  link reaching something, `null` for the pointers to folders this machine doesn't know.
- 2026-10-11: design/links.md § How a link landed lists every kind, and where each is shown. docs/cli.md § How a link
  landed lists the old values (no `pointer` or `hosting`; a markdown link's `null`): not edited here, as the task
  names no user docs.
