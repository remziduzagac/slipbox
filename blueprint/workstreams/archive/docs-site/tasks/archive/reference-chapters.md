---
status: done
assignee: claude-cli
blocked_by: [DS-T1]
created: "2026-10-14"
---

# DS-T3: The reference chapters, in plain sentences

The keys, configuration and command-line chapters stay written by hand (DS-D5): their prose rewritten to DS-D4's
rules, their tables and the configuration's TOML listing kept as they are.

## Done when

- The three chapters' prose follows requirements.md § How they are written; no row, key, setting default, command or
  flag lost (the docs tests, and a check of every code span, link, heading, code block and number against the old).
- The configuration's "Every key" listing is unchanged (`tests/core.test.ts` reads it).
