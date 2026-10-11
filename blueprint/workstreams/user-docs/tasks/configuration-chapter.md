---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DOC-T2: The configuration chapter

`docs/manual/configuration.md`: every setting and environment variable, from today's `docs/configuration.md`.

## Description

Rewrite `docs/configuration.md` as the manual's configuration chapter: the files and the order they apply in, what
a folder's settings may not do and why (a folder you clone can't choose what runs), how mistakes in a file are
handled, every key with its default, the links' convention, colours, `.editorconfig`, the dictionaries, reloading,
the environment. Code paths (`USER_ONLY` in `core/config.ts`), IDs and history go. Where slipbox keeps things, the
storage folders and what each holds, is written out here (from `blueprint/design/how-it-works.md` § Storage, read
against the code), since the docs never link into the blueprint.

The `## Every key` section keeps its single TOML listing, which a test reads: the test "what configuration.md
promises" in `tests/core.test.ts` reads `docs/manual/configuration.md` instead, its name updated to match.

## Acceptance criteria

- Every key of `DEFAULT_CONFIG` is listed with its default: the test passes reading the new chapter, and fails with a
  default changed in the chapter (mutation-checked, in the Log).
- Every environment variable the code reads is in § Environment, or left out as internal to the tests, said in the
  Log.
- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).
- Removing the old reference, and the links to it (DOC-T11).
- `VAULT_CONFIG_TEMPLATE`'s pointer to the docs (DOC-T11).

## References

- Delivers: requirements.md § The documents (`manual/configuration.md`), § Acceptance criteria (the test).
- Rests on: DOC-D2, DOC-D3.
- Sources: `docs/configuration.md`, `src/core/config.ts`, `blueprint/design/how-it-works.md` § Storage,
  `blueprint/design/roots.md` § Settings.

## Log
