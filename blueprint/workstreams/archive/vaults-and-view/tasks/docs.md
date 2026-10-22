---
status: proposed
assignee: null
blocked_by: [VV-T3, VV-T5, VV-T6, VV-T7, VV-T8]
created: "2026-10-15"
---

# VV-T9: The docs, the screenshots, and consolidation

What users see, in the docs; the workstream folded into the root.

## Description

- The manual's vaults and links chapter, the explorer, the peek, the configuration (home's skip list); the guides'
  words; the CHANGELOG.
- Screenshots of the explorer and the peek retaken, rendered from the headless terminal (`bun run shots`, D236).
- A guide that explains vaults clearly and comprehensively, since slipbox's are unlike other tools' (the user's,
  2026-10-15, for once everything is built): what a vault is and how slipbox finds one; home and Elsewhere; every file
  in exactly one vault; going into a vault and its tabs; the view, the breadcrumb and zooming; links into other vaults
  and the peek; symlinks and the trust they ask for; worked examples with drawings and screenshots — a folder of
  repositories, an agent's worktree kept elsewhere, a notes vault inside a repository, a file in `/etc`. Linked from the
  front door and the concepts page.
- The lens explained the same way (the user's, 2026-10-15): what it is, when to use it rather than source mode, how it
  opens and grows, typing in it, its keys, with screenshots and examples of each. Its own guide, or a section of the
  editing guide, whichever reads better.
- The design and requirements changes moved into the root; the decisions superseded marked; the workstream archived.

## Acceptance criteria

- `bun run check` passes; the docs say it without the blueprint's IDs.
- The vault guide and the lens's explanation each have worked examples and at least one screenshot, rendered from the
  headless terminal.
