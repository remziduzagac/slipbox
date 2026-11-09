---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-11-08"
---

# EG-T4: `space g` as a group, a branch's commits, a line's web link

EG-D15, EG-D4, EG-D18.

## Description

- `space g` a which-key group, `space g g` the panel; `s`, `u` and `d` on the cursor's change or the note's file,
  by the panel's letters; the note's own on `enter`, `l`, `y`, `w`. Commit, push and the
  rest stay the panel's.
- This branch's commits in the panel and `:log`, and a branch's commits when it's opened up in Branches: a commit's
  files, a file's change in the diff window, read in the background as the panel's reads are.
- The web link: the forge from the remote (GitHub, GitLab), the commit checked out, a range for
  a selection; copied, or opened with RPT-D3's opener, never over SSH.
- A note under GIT-D12 at consolidation.

## Acceptance criteria

- A terminal check: `space g g` opens the panel; from a note, `space g s` stages the change at the cursor and
  `space g d` reverts one after asking; the panel lists a branch's three commits since `dev`, a commit's files and a
  file's change; `:log` the same.
- Unit tests for the web link of each forge's remote forms.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- A line not committed, or a commit not pushed, in a web link. Settled: the lines are the commit's, mapped through the
  changes since as blame maps a line; one not committed has no link, said, and a selection keeps its committed lines.
  A commit no branch of the remote's holds (as of the last fetch) is linked all the same and said; `space g w` copies
  it rather than opening a page not there yet (design.md § Git).
