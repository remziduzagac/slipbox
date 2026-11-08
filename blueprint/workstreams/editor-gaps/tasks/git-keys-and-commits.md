---
status: todo
assignee: ""
blocked_by: []
created: "2026-11-08"
---

# EG-T4: `space g` as a group, a branch's commits, a line's web link

EG-D15, EG-D4, EG-D18.

## Description

- `space g` a which-key group, `space g g` the panel; the panel's actions run from the note on the cursor's change
  or file, by the panel's own letters; the note's own on `enter`, `h`, `l`, `shift+b`, `shift+d`, `y`, `w`.
- This branch's commits in the panel and `:log`, and a branch's commits when it's opened up in Branches: a commit's
  files, a file's change in the diff window, read in the background as the panel's reads are.
- The web link: the forge from the remote (GitHub, GitLab, Codeberg, Bitbucket), the commit checked out, a range for
  a selection; copied, or opened with RPT-D3's opener, never over SSH.
- A note under GIT-D12 at consolidation.

## Acceptance criteria

- A terminal check: `space g g` opens the panel; from a note, `space g s` stages the change at the cursor and
  `space g d` reverts one after asking; the panel lists a branch's three commits since `dev`, a commit's files and a
  file's change; `:log` the same.
- Unit tests for the web link of each forge's remote forms.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- A line not committed, or a commit not pushed, in a web link.
