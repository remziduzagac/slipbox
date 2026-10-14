# Design changes

Each change names the root's design section it lands in at consolidation. A task writes the new text here as it does
the work; the root's files change only when GIT is consolidated.

## MODIFIED design/tui.md § Git

Adds, after "The working tree's changes":

- **The diff** (GIT-D2): how a diff is found (lines, then words inside paired lines) and drawn, as source or before and
  after; the folded unchanged stretches; `tab` between the two; which windows use it (the panel's, the changes' list, a
  history entry, the conflict prompt's (D)iff, the review, the merge screen).
- **Reviewing a change** (GIT-D3): `v` in the git panel, its hunks across files, its keys, the notes to the scratch,
  what it says at the end.
- **The remote and stash** (GIT-D4): the commands and their keys, git without a terminal, the pre-push hook's trust,
  ahead and behind on the status line.
- **The merge screen** (GIT-D5): its cards, the three versions and where they come from, its keys, the result, saving
  and staging; the conflict prompt's (M)erge on it.
- **Pull and rebase** (GIT-D6): the question a diverged pull asks, rebasing onto the base, an operation under way on the
  status line, continue, skip and abort.
- **Side by side** (GIT-D7): when it's chosen, the shared sideways offset, the code view's folded cells.

Previously: `space g d` "removed lines red, added green", a row a line, long lines cut; stash and the remote's commands
deferred (`26.6`).

## MODIFIED design/tui.md § Side panes ("Source control")

Adds (GIT-D8, GIT-D9): the message box, the buttons and their keys, the sections' and the rows' actions, the right
click's menu, the changes' stage and revert, the branch's section against its base, the Branches section with its
worktrees marked, ordered and folded, opened up in place, new, remove; each branch's base (GIT-D10); the other
repositories in the view (GIT-D11, VV-D10). The status line's branch, clicked. Previously: keys only; "nothing changed"
with nothing uncommitted; worktrees only in `space g w`'s list.

## MODIFIED design/rendering.md

Adds the before-and-after diff (GIT-D2): a changed block laid out twice, lightly formatted (headings, emphasis, links, a
table's cells), in a `before` and an `after` frame, the removed words marked in the first and the added in the second; a
block added or removed whole laid out once, marked; unchanged stretches folded. The layout's other users never see the
marks.

## MODIFIED design/tui.md § Git: its roles and settings

Adds the roles `diff_add_word` and `diff_del_word`, a changed word inside a changed line, stronger than `diff_add` and
`diff_del`, which the before-and-after blocks' marked words use too; and the settings `[git] diff = "blocks" | "source"`
(a note's diff, GIT-D2), `[git] worktrees` (where a new worktree goes, GIT-D13) and `[git] diff_layout = "auto" |
"unified" | "split"` (a code file's, GIT-D7). The manual's configuration chapter lists them with the rest.

## MODIFIED design/tui.md § Keys

`space g` opens and focuses the git panel (GIT-D12), as `space e` the explorer; the panel's single keys act on its
selection; `space g`'s keys of their own (`c`, `d`, `h`, `b`, `w`, `m`, `p`, `r`) go, their commands staying in the
palette and the panel's "This file" section; a click on a change's sign in the gutter shows it with Revert and Stage.
