---
status: proposed
assignee: claude-cli
blocked_by: [WSP-T1, WSP-T2]
created: "2026-10-24"
---

# WSP-T3: The docs, the screenshots, the CHANGELOG, and the workstream complete

## Description

- `screen.md` (the map, the top bar, the status line), `git.md`, `vaults.md` and the guides `vaults.md` and
  `code-and-git.md`: where you are on the top bar.
- The screenshots retaken (`bun run shots`), each looked at.
- The CHANGELOG, a line under Changed.
- Reviewed (Codex, then `/code-review`); the workstream's tasks done, the workstream complete, for the maintainer to
  consolidate (the notes under earlier decisions are listed in design.md).

## Acceptance criteria

- `bun run typecheck`, the lint and `check:docs` pass; the docs say it without the blueprint's IDs.
