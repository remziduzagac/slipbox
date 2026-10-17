---
status: consolidated
created: "2026-10-14"
---

# GIT: Reviewing, diffing and merging what an agent changed

> Consolidated into its parent on 2026-10-17; its docs task is still open.

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

## Outcome

Built as settled, in pull requests merged 2026-10-15 to 2026-10-17: changed words in every diff (GIT-T1, #82), the
remote's commands and stash (GIT-T3, #83), a note's diff before and after and a code file's side by side (GIT-T4,
GIT-T7, #94), the review, the merge screen, pulling and rebasing (GIT-T2, GIT-T5, GIT-T6, #96), and the git panel by
mouse as by keys with its branches and worktrees, following the vault (GIT-T9, GIT-T10, #97). Consolidated on
2026-10-17: the root's requirements (§ Git, § Non-goals), design/tui.md § Git and § Side panes, rendering.md § Diffs,
trust.md's git, how-it-works.md's modules; notes under D139, D154, D156 and D158, which GIT-D4 supersedes. Where the code
came out otherwise than the design here, the root says what the code does: the git panel's files diff in the diff
window, not a peek; a branch opened up offers Open, Merge… and Remove…, no Review; `:merge-review` keeps `[git] base`;
`ctrl+s` and `:w` don't save the merge screen (a gap, noted). GIT-T8's docs and screenshots are written apart, after
this; its task stays open until they land.
