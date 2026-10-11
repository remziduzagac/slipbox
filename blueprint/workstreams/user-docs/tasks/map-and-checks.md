---
status: todo
assignee:
blocked_by: [DOC-T1, DOC-T2, DOC-T3, DOC-T4, DOC-T5, DOC-T6, DOC-T7, DOC-T8, DOC-T9, DOC-T10]
created: "2026-10-11"
---

# DOC-T11: The map, the links and the checks

`docs/README.md`, the project README pointing into the docs, the old references gone, and checks that keep the docs
whole.

## Description

- `docs/README.md`: where to start, the guides, the manual's chapters, each in a line.
- The project README: what slipbox is, its status, installing in a line, the way into `docs/`; its Documents table and
  key summary point at the guides and the manual.
- The old references removed (`docs/keymap.md`, `docs/configuration.md`, `docs/cli.md`), and every link to them moved
  to the chapters: the code's comments, `VAULT_CONFIG_TEMPLATE`, CLAUDE.md, the blueprint's links (link targets only;
  no entry's words change).
- A test, beside the configuration chapter's: no roadmap or decision ID in `docs/`; every relative link and anchor in
  `docs/` resolves; every CLI command is in the CLI chapter; every default key is in the keys chapter.
- The chapters and guides read through together: overlaps and contradictions between them settled, each subject
  explained in one place and linked from the others.

## Acceptance criteria

- The test passes, and fails with an ID, a broken link, a command or a key left out (mutation-checked, in the Log).
- markdownlint is clean over `docs/`; `bun run check` passes.
- No link anywhere in the repository points at the old references.

## Out of scope

- Trying the guides live (DOC-T12).
- The root requirements' § Documentation, applied at consolidation.

## References

- Delivers: requirements.md § The documents (`docs/README.md`, the README), § Acceptance criteria.
- Rests on: DOC-D1, DOC-D2, DOC-D3.

## Log
