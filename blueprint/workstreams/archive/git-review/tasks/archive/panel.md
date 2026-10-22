---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-14"
---

# GIT-T9: The git panel by mouse as by keys, and what the branch changed

Source control's buttons, its keys shown, and the branch's changes against the base in it (GIT-D8).

## Description

- The message box at the panel's top; `ctrl+enter` commits; a long message to the floating editor.
- The buttons: commit and amend now; pull, push, fetch and stash added by GIT-T3. A button's key shown on the pointer.
- The sections' header actions; a row's actions on the pointer; the right click's menu; a change's stage and revert.
- The section "This branch against main": the branch's changed files, a click or `enter` showing the diff.
- `space g` opens and focuses the panel (GIT-D12); its single keys act on the selection; `space g`'s keys of their own
  go, their commands in the palette and the panel's "This file" section; a click on a gutter's change sign shows it with
  Revert and Stage.
- The status line's branch clicked: the branches; pull and push once GIT-T3 brings them.

## Acceptance criteria

- A terminal check by mouse events: a file staged, unstaged and discarded by clicks; a commit typed in the box and made
  with `ctrl+enter`; on a clean branch ahead of the base, its files listed and one's diff opened by a click.
- `bun run check` passes; the manual's git chapter and the mouse table say it.
