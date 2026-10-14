# Requirements

## Goals

- An agent's change reviewed in slipbox, a piece at a time: each kept, reverted, or sent back with a note (GIT-D3).
- A diff read as easily as a note: a note's before and after, its changed words marked; code's highlighted, its long
  lines scrolling sideways, side by side where the window is wide (GIT-D2, GIT-D7).
- git's conflicts settled in slipbox, each one's sides readable, without editing conflict markers by hand (GIT-D5).
- The git panel worked by mouse as by keys, its keys shown; what the branch changed against its base in it; the branches
  in it, a worktree marked on its branch, each with what it holds, opened, made and removed there; each branch measured
  against its own base; the panel following the vault (GIT-D8–GIT-D11, VV-D10).
- The remote reached from slipbox: fetch, pull, push and stash, asked for and never automatic; a pull where both sides
  moved, and a branch rebased onto the base, through the same merge screen (GIT-D4, GIT-D6).

## Non-goals

- A git client's whole range: interactive rebase, cherry-pick, submodules, managing remotes, a commit graph, pull
  requests on a forge. The agent, or the person, runs `git` for those (D156).
- Anything on a timer: no background fetch, no automatic pull or push.
- The CLI: the working tree's git stays the TUI's alone (D156). The review commands the CLI has (`changed`, `diff`,
  `worktrees`, `merge-review`) stay as they are.
- Credentials: slipbox never asks for a password or a passphrase; git's own helpers, or git in a terminal, do.

## Builds on

- The line diff and three-way merge of `src/core/merge.ts` (`5.5`), the conflict prompt's.
- The working tree's changes in the gutter (`26.1`, `core/gitsigns.ts`), source control (`26.2`), commit (`26.3`),
  branches (`26.5`), and the review against the base (`5.13`, `20.21`).
- Code blocks that scroll sideways (D233) and the code view's cells (`24.x`).
- The scratch, which collects what goes to the agent (`space s y`).
- The trust guards: git runs nothing of a repository's own where its vault isn't trusted (D172, D175).

## Acceptance criteria

- **The panel** (GIT-T9): stage, unstage, discard, commit and amend each done by a click as by its key, the key shown on
  the pointer; with nothing uncommitted and a branch ahead of the base, the panel lists the branch's files, a click
  showing a file's diff. A terminal check drives it with mouse events.
- **Branches** (GIT-T10): the panel lists the example set's branches, its worktrees marked, ordered and folded as GIT-D9
  says; one opened up in place; one gone into; a new branch made from `dev` in a new worktree, measured against `dev`; a
  merged worktree removed after asking, one with changes refused.
- **Review** (GIT-T2): with an agent's uncommitted changes in three files, the review walks every hunk across them; `y`
  stages one, `x` reverts one, `c` writes a note for the agent into the scratch with its file and lines; the end says
  what was kept, reverted and noted. A terminal check covers it.
- **The diff** (GIT-T1, GIT-T4): the panel's diffs, a file's diff from the changes list, a history entry's diff to now
  and the conflict prompt's (D)iff all draw one way: changed words marked inside a changed line; a note's as
  before-and-after blocks, the removed and added words marked, the source a key away; code highlighted, its long lines
  scrolling sideways, never cut with `…`.
- **The remote** (GIT-T3): fetch, pull (fast-forward), push and stash each run from source control and `space g`, and
  say git's result; a remote that needs a password fails at once with git's words and a hint, never hanging; the status
  line shows the branch ahead of and behind its upstream; a push runs the pre-push hook only in a trusted vault.
- **The merge screen** (GIT-T5): a file with conflicts opens one card a conflict, base, yours and theirs drawn as diffs
  against the base; yours, theirs, both, or edited by hand in the lens; the result shown as it's settled; saved, then
  staged on request. A conflict can go to the agent through the scratch.
- **Pull and rebase** (GIT-T6): a pull that can't fast-forward asks merge or rebase; rebasing onto the base is one
  command; each conflict on the way opens the merge screen; continue, skip and abort are offered while it's under way,
  and the status line says so.
- **Side by side** (GIT-T7): a code file's diff side by side where two columns of 80 fit, its two sides scrolling
  sideways together; in the code view, unchanged cells folded to their header.
- Every bug found gets a regression test; every part a terminal check; `bun run check` passes; the docs say it all
  without the blueprint's IDs.

## Changes

### MODIFIED requirements.md § Git

The second bullet becomes: in the editor, the TUI's alone: changed lines in the gutter, source control, commit, blame
and a file's history, branches; a change reviewed a hunk at a time, each kept, reverted or noted for the agent (GIT-D3);
fetch, pull, push and stash, asked for (GIT-D4); git's conflicts settled in a merge screen, a pull where both sides
moved and a rebase onto the base through it (GIT-D5, GIT-D6); the git panel by mouse as by keys, what the branch changed
and the branches with their worktrees in it, each against its own base (GIT-D8–GIT-D11). Adds a bullet: diffs drawn as
slipbox draws notes — changed words marked, a note's before and after, code highlighted and scrolling sideways, side by
side where there's room (GIT-D2, GIT-D7).

Previously: "Stash and the remote's commands are deferred (D156, D158)."

### MODIFIED requirements.md § Non-goals

Adds: a git client's whole range — interactive rebase, cherry-pick, submodules, remotes, a commit graph, a forge's pull
requests (GIT-D1).
