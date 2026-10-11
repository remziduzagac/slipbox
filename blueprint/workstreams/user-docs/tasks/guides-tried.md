---
status: todo
assignee:
blocked_by: [DOC-T9, DOC-T10, DOC-T11]
created: "2026-10-11"
---

# DOC-T12: The guides tried as written

Every guide's steps, followed as written on the reference set: the CLI's in a shell, the TUI's in a herdr tab of the
coordinator's own (D209).

## Description

Build the reference set (`scripts/build-home.ts`) and follow each guide as a newcomer would. A step that doesn't work
as written is fixed in the guide; where the code is wrong, it becomes a task, and the guide waits for the fix.

## Acceptance criteria

- Each guide followed to its end, what was tried noted in the Log, per guide.
- Every step works as written, or its fix is noted.

## Out of scope

- The manual's chapters, beyond their examples a guide repeats.

## References

- Delivers: requirements.md § Acceptance criteria (the guides tried).
- Rests on: DOC-D2, D209.

## Log
