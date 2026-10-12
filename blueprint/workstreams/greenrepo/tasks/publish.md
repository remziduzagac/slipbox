---
status: todo
assignee: claude-cli
blocked_by: [GR-T1, GR-T2, GR-T3, GR-T4, GR-T5, GR-T6, GR-T7, GR-T8, GR-T9, GR-T10, GR-T11, GR-T12]
created: "2026-10-12"
---

# GR-T13: The repository on GitHub

slipbox public on GitHub, set as greenrepo has it (GR-D2, GR-D5, GR-D6).

## Description

- Shown to the user first, then done: the repository created (description, topics), the first push, and every
  setting: merge methods, features off, security switches (secret scanning and push protection, Dependabot alerts
  and updates, private vulnerability reporting, CodeQL's default setup with `actions`), Actions' default token and
  SHA pinning, immutable releases, pull requests from collaborators only, the rulesets (`main`: no deletion or force
  push, a pull request and the `ci` check; `v*` tags: admins only), the `release` environment, the labels.
- CI green on both systems; the first health run; the expected settings matching the live ones.
- design/repository.md and requirements.md § The repository, written under their entries.

## Acceptance criteria

- Every setting as the expected-settings file says; the user approved each before it was applied.
