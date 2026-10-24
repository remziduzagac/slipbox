---
status: todo
assignee: claude-52
blocked_by: []
related: [PIC-T4]
tracker: [gh:#52]
created: "2026-10-24"
---

# PIC-T6: What users read

The user docs and the changelog say what users see.

## Description

- `docs/manual/reading.md` § Pictures: fitted to the window, the floor, a click to its own size, scrolling it, how
  long it stays; `docs/manual/keys.md`: `z p`, `z h`, `z l`, the click and the wheel over a picture; `CHANGELOG.md`.
- No blueprint IDs in the docs (`tests/docs.test.ts`).

## Acceptance criteria

- `bun run test:docs` and `bun run check:docs` pass; the keys' and commands' completeness tests pass.

## References

- Delivers: requirements.md § Acceptance criteria (the docs).

## Log
