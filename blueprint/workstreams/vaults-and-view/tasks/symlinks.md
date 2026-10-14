---
status: proposed
assignee: null
blocked_by: [VV-T2]
created: "2026-10-15"
---

# VV-T6: Links followed only when the user says so

The trust prompt, its store, and the walk's, the watcher's, the writes' and the CLI's rules (VV-D6).

## Description

- The prompt on first opening a link out of a vault or home: follow, just look, no; the agents' warning for a hidden
  target or one outside home.
- The answers kept by link and target in the state folder; asked again when the target changes.
- The walk and the watcher following a trusted link (a slow target in the background, given up on); writes through a
  link out of a vault refused even trusted; home's trusted links written through; the CLI refusing untrusted links.
- The two refinements, if the user confirms them: only links leading out ask; no-vault doesn't ask.

## Acceptance criteria

- A regression test for each rule, mutation-checked; a terminal check of the prompt, each answer and a changed target
  asked again.
