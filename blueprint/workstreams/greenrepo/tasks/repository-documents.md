---
status: todo
assignee: claude-cli
blocked_by: [GR-T4]
created: "2026-10-12"
---

# GR-T7: The repository's documents

What users, maintainers and security researchers look for (greenrepo DOC-01, DOC-04, DOC-09, DOC-11, DOC-12, COM-05,
COM-07, COM-13, COM-14, COM-15, REL-01, UPK-05, UPK-08, UPK-11).

## Description

- `CHANGELOG.md`, Keep a Changelog's shape, with an Unreleased section for the first release.
- `MAINTAINING.md`: releasing; merging (GR-D6); dependencies; settings; the upkeep duties and the calendar; who can
  recover what (access continuity); the governance paragraph, the maintainer and the time they have.
- The versioning policy in the user docs: what is public (the CLI's commands, `--json`, exit codes, the config's
  keys), what each part of a version means before and after 1.0, how long a deprecation lasts.
- A how-it-works page in `docs/`, written for users.
- `SECURITY.md`: the versions supported, private vulnerability reporting, what to include, times in digits (an answer
  within 14 days, disclosure within 90).
- `ACCESSIBILITY.md` for the TUI; `ARCHITECTURE.md`, a short map of the code for contributors.
- `.github/ISSUE_TEMPLATE/`: a bug form (version, platform, what happened, what was expected, steps), blank issues
  off, `config.yml`'s links to the docs and the security policy.
- The README's first screen: what it is, status, where to get help, who maintains it.

## Acceptance criteria

- `tests/docs.test.ts` passes, the new docs mapped; the Markdown lint passes.
