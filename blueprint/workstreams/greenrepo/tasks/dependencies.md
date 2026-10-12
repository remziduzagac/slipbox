---
status: todo
assignee: claude-cli
blocked_by: [GR-T9]
created: "2026-10-12"
---

# GR-T10: Dependabot and the scanner

Dependencies kept current and watched (greenrepo DEP-01, DEP-02, DEP-04, UPK-01).

## Description

- `.github/dependabot.yml`: `bun` and `github-actions`, grouped, monthly, a cooldown of 7 days to match the
  supply chain's.
- A scanner (OSV-Scanner on `bun.lock`, or `bun audit`, whichever reads it) on a schedule and when `bun.lock`
  changes, never blocking unrelated pull requests; findings fixed or ignored in its config with a reason and a date.

## Acceptance criteria

- zizmor and actionlint clean; the scanner run once locally on `bun.lock`.
