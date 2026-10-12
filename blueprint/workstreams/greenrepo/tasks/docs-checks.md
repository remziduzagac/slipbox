---
status: todo
assignee: claude-cli
blocked_by: [GR-T4]
created: "2026-10-12"
---

# GR-T6: The docs checked: lint, spelling, links

Markdown is checked on every change (greenrepo DOC-05, the Markdown profile).

## Description

- markdownlint-cli2 as an exact dev dependency, with a project config holding the rules of the user's
  `~/.markdownlint-cli2.jsonc` (120 columns everywhere); typos with a project word list; lychee `--offline` for the
  links between files. `bun run check` runs all three. The fixtures and examples that are wrong on purpose are left
  out, each exclusion with its reason.
- What they find in the repository's Markdown and code, fixed.
- The blueprint's README § Conventions says the config is the project's now.

## Acceptance criteria

- `bun run check` passes; a misspelling, a broken link and a long line each fail it.
