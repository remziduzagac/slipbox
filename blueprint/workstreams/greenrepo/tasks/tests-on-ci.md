---
status: todo
assignee: claude-cli
blocked_by: [GR-T4]
created: "2026-10-12"
---

# GR-T8: Tests fit for CI: the flaky-test policy

The suite passes on CI runners, every time (greenrepo QA-09).

## Description

- The flaky-test policy in design/testing.md's entry: no retries; a test that fails at random is fixed, or moved to a
  named quarantine with an issue, never its assertion deleted.
- The two known ones: the background index's timing under load, and the pipeline-cookbook Mermaid snapshot when
  `export.test.ts` runs first. Fixed where the cause can be found.

## Acceptance criteria

- Each fix with a test that showed the failure (run order, or a slowed machine) before it; the suite passes three times
  running.
