---
status: todo
assignee: claude-cli
blocked_by: [DS-T1]
created: "2026-10-14"
---

# DS-T2: Plain sentences

Every page rewritten to DS-D4's rules, in two pull requests: the README and the guides, then the manual's chapters.
What each page says stays as it is, checked against the code where it's restated; the keys and commands
`tests/docs.test.ts` looks for stay in their chapters.

## Done when

- Every page follows requirements.md § How they are written.
- The guides' steps tried as written, on the reference set, where a step changed.
- `bun run check` passes.
