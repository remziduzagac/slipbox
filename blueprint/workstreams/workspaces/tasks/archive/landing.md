---
status: done
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

## Done (2026-10-24)

The docs and guides, the mouse table and help, the CHANGELOG under Changed, the 29 screenshots retaken and looked at,
`check:docs` and the typecheck green; reviewed by Codex, then `/code-review` (notes.md, Log). The workstream complete:
consolidation (the root requirements' changes, the notes under D65, D77, D153, VV-D1, VV-D2 and D33) is the
maintainer's.
