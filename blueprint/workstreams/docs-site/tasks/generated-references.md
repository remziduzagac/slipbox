---
status: todo
assignee: claude-cli
blocked_by: [DS-T1]
created: "2026-10-14"
---

# DS-T3: The reference chapters' lists, generated

The keys, configuration and command-line chapters' lists generated from the code between markers, by a script
(`bun run docs:generate`), with a test that fails when a list differs from what the script writes (DS-D5).

## Done when

- The keys from the default keymap and the commands' descriptions; the settings from the config's defaults, their
  allowed values and their doc comments; the commands from their specs.
- The chapters' prose kept around the lists; `tests/docs.test.ts`'s checks of keys, commands and defaults still pass.
