---
status: todo
assignee: claude-cli
blocked_by: [GR-T9]
created: "2026-10-12"
---

# GR-T11: The weekly health check and the upkeep files

The repository kept green by a calendar (greenrepo UPK-02 to UPK-05, UPK-15, UPK-16, CI-13).

## Description

- The three upkeep files: the expected settings (rulesets as GitHub exports them, and the rest by GitHub's API field
  names), the renewals (every token and deploy key, with its date), the accepted deviations (each with its reason
  and review date: DOC-06 until after the first release, the Scorecard checks a solo project can't pass).
- `health.yml`: on a schedule and by hand only; read-only jobs collect the signals its token reads (Dependabot alerts,
  code scanning alerts, open pull requests, workflows switched off, rulesets against the expected ones, renewals
  due, the weekly link check); one job writes the labelled health issue, only when its text changed; a job that
  always runs re-enables the workflow.
- The collecting and rendering in a script with tests (Bun, no dependency), so it can be read and tested.

## Acceptance criteria

- The script's tests; zizmor and actionlint clean; the first run waits for GR-T13.
