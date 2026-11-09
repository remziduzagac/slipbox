---
status: todo
assignee: ""
blocked_by: [SD-T1, SD-T2, SD-T3, SD-T4, SD-T5, SD-T6, SD-T7, SD-T8, SD-T9, SD-T10, SD-T11]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T12: The user docs, the design consolidated, the workstream closed

## Description

- The user docs: what you'll see on a slow disk — `reading <note>…`, `reading the vault…`, `⚠ disk not answering`,
  `esc` giving a read up, a save still waiting for its write — in `docs/manual/files.md` beside the listings' passage
  and wherever the watcher is said; no blueprint IDs (`tests/docs.test.ts`). A CHANGELOG line per task that changed
  what you see, gathered.
- The design consolidated, with the maintainer's approval: design.md's changes applied to the root, requirements.md's
  quality goal added, the "Previously:" texts reconciled; the decisions agreed recorded with their dates; the roadmap
  item ticked; the folder archived.
- Every slow-disk terminal check run (listed for approval first, D207) on Linux and macOS, and live once on a FUSE
  mount that answers slowly, the screen's longest stall recorded.

## Acceptance criteria

- `bun run check:docs` and `bun run test:docs` pass.
- Issue #46 closed by the last pull request.

## References

- Delivers: the workstream's consolidation.
- Rests on: every SD task.
