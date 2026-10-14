---
status: proposed
assignee: null
blocked_by: [GIT-T1]
created: "2026-10-14"
---

# GIT-T7: A code file's diff side by side, and its cells folded

Side by side where two columns of 80 fit; the code view's unchanged cells folded (GIT-D7).

## Description

- The split layout: lines aligned by hunk, the two sides' one sideways offset, `[git] diff_layout`.
- In the code view, a diff folding each unchanged cell to its header.

## Acceptance criteria

- A terminal check at 200 columns: a code file's diff side by side, scrolled sideways together; at 120, unified.
- `bun run check` passes.
