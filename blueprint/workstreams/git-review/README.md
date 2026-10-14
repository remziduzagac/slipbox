---
status: active
created: "2026-10-14"
---

# GIT: Reviewing, diffing and merging what an agent changed

slipbox's git, from reading a change to settling it. The git panel worked by mouse as by keys, with what the branch
changed and the repository's worktrees in it. The working tree's changes walked one at a time, each kept, reverted or
sent back to the agent with a note; the remote's commands and stash, planned from the start and deferred (D156, D158);
diffs drawn as slipbox draws notes, a note's rendered with its changed words marked, code's highlighted and scrolling
sideways rather than cut; a merge screen for git's conflicts, with pulling where both sides moved and rebasing onto the
base; a code file's diff side by side where there's room. Proposed on 2026-10-14, when the user asked what slipbox's git
is missing and whether its new code rendering could show diffs and help merging; drafted on their request, to be
accepted before any of it is built.

- [requirements.md](requirements.md): its goals, acceptance criteria and its changes to the root's requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): what is proposed, and why.
- [notes.md](notes.md): what slipbox's git does today, what's missing, and the questions left for the user.
- [tasks/](tasks/README.md): the work, a task per file.

Accepted by the user on 2026-10-14 and 2026-10-15, as talked through; rebased on VV (`../vaults-and-view/`), whose
vaults it follows: GIT-D11.
