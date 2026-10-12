---
status: todo
assignee: claude-cli
blocked_by: []
created: "2026-10-12"
---

# GR-T2: The history searched before the push

Nothing secret or private reaches GitHub (GR-D4).

## Description

- gitleaks over every commit, and the working tree.
- A search of the history for private text: home paths, addresses, hostnames, tokens' shapes, the user's other
  projects' private names, anything a stranger shouldn't read.
- What was found, reported to the user, with a recommendation for each; nothing rewritten without them.

## Acceptance criteria

- The report in notes.md, and the user's answer.
