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

### The diff, as built (GIT-T1)

The text for tui.md § Git, after "The working tree's changes"; a note's before and after, and `tab`, come with
GIT-T4.

**The diff** (GIT-D2; `core/merge.ts` `diffView`, `core/layout/diff.ts`, `tui/diffview.ts`): `space g d`, a file's diff
from `space g c`'s list, a history entry's diff to now and the conflict prompt's (D)iff draw one way, in the floating
window, as wide as the screen less its margins.

- **Found:** hunks of lines by the Myers diff, as before. Inside a hunk, the removed lines are paired with the added
  ones, in order: the pairs that make the hunk most alike, none less than half alike. How alike two lines are is twice
  the words kept over the words of both; punctuation is diffed but not counted, and two lines of punctuation alone are
  alike. A hunk past 2,500 removed lines times added ones pairs in place, the first with the first. A pair is diffed
  again by word: a word is letters, marks, digits and `_` (a Chinese or Japanese character on its own), and white space
  and every other character are tokens of their own. A changed run loses the white space at its ends, unless that's all
  it is, and runs with only white space between them are one.
- **Drawn** (`layoutDiff`): a row a line, its sign and a space before it (`-` in `diff_del`, `+` in `diff_add`), its
  text highlighted as source mode highlights it — a note's Markdown over the whole text, so a fence's or the front
  matter's lines read as theirs; code a line at a time, only the lines shown. A changed row is on its sign's tint (the
  row's `fill`, each span's `bg`), its changed words on `diff_del_word` or `diff_add_word`; an unchanged row isn't
  tinted. Each group is under `@@ line N` (`diff_head`), with up to three unchanged lines around it. The unchanged
  stretches between groups, before the first and after the last fold to `▸ N unchanged lines` (`dim`); a stretch of
  one line is shown instead. `enter` on a fold opens it, the cursor staying on its row.
- **Long lines** scroll sideways as a code block does (D233). With wrapping on and `[render] code_wrap = "scroll"`,
  the rows are one block, their text from the gutter's end; the heads and folds stay put (`part: "top"`), and a last
  row holds the scrollbar. The cursor, a sideways wheel and `shift` with the wheel scroll it. `code_wrap = "wrap"`
  wraps a long line, `↪` in the gutter of its rows after the first; wrapping off, the rows are whole and the window
  scrolls.
- **The window:** a read-only buffer with a layout of its own (`NoteBuffer.drawn`), its text a line a row. It has no
  gutter, line numbers on or not, and no source mode or lens: switching says "a diff is drawn one way". `enter` on a
  line closes it and opens the file there; the conflict prompt's goes back to the prompt. `esc`, `q` and `:q` go back
  to what opened it: the changes' list, the prompt. Two texts the same are said ("no differences from main"), and go
  back. The wheel over the floating window scrolls it, never the window or the side pane under it.

### The remote and stash, as built (GIT-T3)

The text for § Git, after "Branches":

**The remote and stash** (`26.6`; GIT-D4; `core/gitremote.ts`, `tui/gitremote.ts`): source control's keys and the
palette's commands — no `space g` keys of their own, as `space g` becomes the git panel (GIT-D12, GIT-T9). `f`
(`:fetch`, `git.fetch`) fetches — the branch's remote, else origin, git's own choice; `p` (`:pull`, `git.pull`; `l`
opens a file up there) pulls, fast-forward only (`git pull --ff-only --no-rebase`); `shift+p` (`:push`, `git.push`)
pushes the branch to its upstream (`git push <remote> refs/heads/<branch>:<its ref>`, the remote and ref as
`%(upstream:remotename)` and `%(upstream:remoteref)` name them). A branch with no upstream is asked "Push it to
origin/<branch>, and track it there?" (`-u`): origin, else the only remote; with none, or several and no origin, said
how to set one. Each is asked for, none on a timer; each runs in the background, one at a time ("git is
still fetching" to another), a message saying it's under way and how it went: "fetched: main is 3 commits behind
origin/main — p pulls (:pull)", "pulled: main fast-forwarded to 1a2b3c4", "pushed main to origin/main". Before a pull,
unsaved notes are saved or kept, as before a branch switch (`beforeCheckout`); HEAD moving on is then the feed's
(`5.9`, `checkHead`): no switch, the tabs stay. A failure is git's own words (`gitReason`): a remote's refusal
(`[rejected] main -> main (fetch first)`, with "fetch them (f) and pull (p) first"), else its `fatal:` or `error:`
line and the files it names, else a conflict; a pull that can't fast-forward adds that git merge or git rebase, in a
terminal, brings the two together (GIT-T6 asks merge or rebase instead).

git runs without a terminal: `GIT_TERMINAL_PROMPT=0`, so a login git can't make with what it has fails at once ("could
not read Username for '…': terminal prompts disabled") rather than wait at a prompt; and ssh in batch mode
(`GIT_SSH_COMMAND="ssh -o BatchMode=yes"`), which asks no password or passphrase, unless you set your own
(`GIT_SSH_COMMAND`, `GIT_SSH`, or `core.sshCommand` in any of git's config). Credential helpers still answer. A failure
that's a login (`needsLogin`: prompts disabled, permission denied, a host's key) adds "git in a terminal can log in
(git fetch), then try here again".

`z` (`:stash`, `git.stash`) lists the stashes, newest first (`git stash list`), under "Stash the changes…" and
"Stash the changes, untracked files too…" (`--include-untracked`), each asking a message (none: git's own, `WIP on
main: …`); `enter` on a stash offers Pop it, Apply it, and Drop it… after asking. A stash is acted on by its name as
listed and only while that name still holds its commit: one saved meanwhile (an agent, a terminal) renumbers them, and
the pick is refused, said why. Saving and bringing one back change the files: unsaved notes are saved or kept first.
git's "No local changes to save" is said as nothing to stash; a conflict, in git's words, the stash kept.

The status line (§ Screen layout): a branch with an upstream, after the branch's name, how far it's ahead of it and
behind it, only what isn't zero (`research · main ↑2 ↓1`; ASCII glyphs `+2 -1`; `gitAhead`, `gitBehind`), as of the
last fetch: read from `git status --branch`'s first line, asked with the status in the background whenever git has news
(`statusLater`), so after a fetch, a pull, a push, or HEAD moving.

### The source control view's keys, as built (GIT-T3)

The text for § Side panes ("Source control"), after **Commit**: `f` fetches, `p` (the explorer's paste) pulls,
`shift+p` pushes and `z` lists the stashes (explorer actions `fetch`, `paste`, `push`, `stash`, each running its named
command, so the palette's are the same; in the explorer and the history they do nothing).

## MODIFIED design/trust.md § What slipbox runs

The git bullet adds, after the commit (GIT-T3): a push runs no hook — its pre-push neither — and isn't signed
(`push.gpgSign=false`); a fetch, pull or push reaches no submodule (`--no-recurse-submodules`); and one whose
repository's own config (`local` or `worktree` scope, `git config --show-scope`) names a program git would run to reach
the remote — `core.sshCommand`, `core.gitProxy`, `core.askPass`, a credential helper, a remote's `uploadpack` or
`receivepack`, a transport allowed (`protocol.*.allow`: `ext::` runs a command) — is refused before it starts, said
which, and `:trust` lets it run. A git too old to say whose config it is (before 2.26) refuses all three there.

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

Built (GIT-T1): `diff_add` and `diff_del` gain a `bg`, the line's tint: their colour 12% of the way from the page in a
dark theme, 14% in a light one. `diff_add_word` and `diff_del_word` are the same colours 32% and 34% of the way. The
terminal's theme can't mix its sixteen colours with the page: a diff's lines have their sign's colour alone, and the
changed words are bold and underlined, as without colour (`NO_COLOR`). A span's background role (`Span.bg`) gives its
bold and underline as well as its colour (`layout/style.ts`), so the words are marked where there's no tint to give.

## MODIFIED design/tui.md § Keys

`space g` opens and focuses the git panel (GIT-D12), as `space e` the explorer; the panel's single keys act on its
selection; `space g`'s keys of their own (`c`, `d`, `h`, `b`, `w`, `m`, `p`, `r`) go, their commands staying in the
palette and the panel's "This file" section; a click on a change's sign in the gutter shows it with Revert and Stage.
