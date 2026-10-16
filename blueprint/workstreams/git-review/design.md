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

And (GIT-T2, GIT-T5, GIT-T6): `v` reviews the changes (the git panel's `review`, `git.review`), and a Review button
is there while a change isn't staged; `x` opens the merge screen on the conflicted file selected, else the first
(`resolve`, `git.merge_screen`), and a Resolve button is there while a file is in conflict; `shift+r` rebases onto the
base (`rebase`, `git.rebase`), or, while a merge or rebase is under way, offers continue, skip and abort — there the
panel has Continue, Skip (a rebase's) and Abort buttons (`continue`, `skip`, `abort`: `git.continue`, `git.skip`,
`git.abort`, with no key of their own). Their rows' footers say them: the checked-out branch's `shift+r` rebases. In the
Problems panel's All tab, `x` on a conflict opens the merge screen on its file.

### Reviewing a change, as built (GIT-T2)

The text for § Git, after "The diff":

**Reviewing a change** (GIT-D3; `core/gitreview.ts`, `tui/review.ts`): `v` in the git panel (`[keys.git]`'s `review`),
its Review button, `:review` or `git.review` walks the working tree's changes against what's staged — the gutter's hunks
(`gitChanges`), the files as they are on disk — across every file `git status` has changed and not staged, and every
untracked one, as wholly added, in path order (`localeCompare`, as the panel lists them). A folder (a submodule's), a
file gone or binary (a NUL in its first 8 KB) is left out; a deleted file is one hunk, all removed. Each hunk is shown
in the floating window, as wide as a diff's: a row with its file, its lines (a deletion's, the line before it) and its
place (`change 2 of 3 here, 5 of 9 in all`, a new or deleted file said, what was done with it), a row of its keys, then
its diff as every diff is drawn (`layoutDiff`): its lines as staged and as they are, with up to three of the file's
lines on each side (`hunkView`), each row at its line in the file. The window is a screen of parts (`layoutScreen`,
`layout/diff.ts`): text rows and diffs, a line of its text each, the review's own keys over the note's (`reviewKeys`,
`DEFAULT_REVIEW_KEYS`, as a peek has its own).

- `y` (`git.review_keep`) stages the hunk as the git panel's `s` stages a change (`stageChange`): found again among
  the file's changes now (`findChange`: the same lines as staged and now, the nearest to where it was), since the index
  or the file may have moved under it; a new or deleted file is staged whole.
- `x` (`git.review_revert`) puts the hunk's lines back as staged, in the file's buffer, as one edit — the part of the
  text that differs — so one undo step there, and saves it at once (`Saving.save`, so `App.writeBuffer`). A file with
  unsaved typing is never written over: the hunk is skipped, said, and the review goes on. A new file goes to the trash,
  asked first (`Files.deleteItem`); a deleted one comes back as staged (`discardFile`); a file outside the vault is
  refused, as slipbox writes only inside it.
- `c` (`git.review_note`) asks for a note, then adds an entry to the scratch without opening it (`Scratch.add`): the
  file and the hunk's lines (`path:from-to`), its diff fenced, and the note (`hunkEntry`).
- `n` and `p` (`git.review_next`, `git.review_prev`) move; `enter` (`git.review_go`) ends the review and opens the file
  at the line under the cursor, else the hunk's first; `esc` and `q` end it.

After `y`, `x` or `c`, the review goes on to the next hunk not yet dealt with, after it and then from the start; with
none left, it ends. Its end, however it comes, says what it did (`tallyText`): `review: 1 kept (staged), 1 reverted,
1 note for the agent in the scratch — space s y copies it; 2 left as they were` — `space s y` named when a note was
written. Nothing is committed.

### The merge screen, as built (GIT-T5)

The text for § Git, after "Reviewing a change":

**The merge screen** (GIT-D5; `core/conflicts.ts`, `tui/mergescreen.ts`): `x` on a file in conflict in the git panel
(its `resolve`, or its Resolve button), `x` on a conflict in the Problems panel's All tab, `:resolve [file]` or
`git.merge_screen` — the file named, else this note when it's in conflict, else the first that is — opens the file's
buffer (read again first when git changed it on disk and it isn't being typed in) and reads git's markers
(`parseConflicts`): `<<<<<<< label`, yours, `||||||| label` and the base where git wrote it (diff3, zdiff3), `=======`,
theirs, `>>>>>>> label`; a marker that doesn't close, or a `=======` outside a conflict (a setext heading's), is text.
The markers give the conflicts, so what was settled by hand stays settled. Each conflict's base where the markers don't
hold it comes from the index's stage 1 (`withStages`): yours is found in stage 2, and theirs in stage 3, where the
stretches before put it (else wherever it is), each mapped back onto stage 1 through that side's changes (`toBase`, a
boundary inside a change widened to the whole of it), the two ranges joined. Where neither has it (the stages gone),
there's no base. A file in conflict with no marker (one side deleted it) is said, with `s` in the git panel to mark it
resolved.

The screen, in the floating window as tall as a peek's, a conflict at a time: its number, its line in the result and
how it's settled; the keys; while a rebase is under way, that yours is what's rebased onto and theirs the commit
replayed; the base's lines; yours, then theirs, each under its marker's label as a diff against the base (with no base,
whole); then the file as it will be (`resultView`): each conflict settled (its lines `+`) or still marked, two lines
around it, under a head naming it and how it's settled, the stretches between folded. Its own keys (`mergeKeys`,
`DEFAULT_MERGE_KEYS`):

- `o`, `t`, `b`, `shift+b` (`git.merge_ours`, `_theirs`, `_both`, `_both_theirs`) settle the conflict — yours, theirs,
  both with yours first or theirs first — and go on to the next one not settled.
- `e` (`git.merge_edit`) puts the result in the file's buffer as one edit — the conflicts not settled still marked,
  `markers` set so autosave doesn't write them — and opens the file at the conflict, in the lens (source for code).
  `x` reads what's left of it onto the screen again.
- `a` (`git.merge_agent`) asks for a note and adds the conflict to the scratch (`conflictExcerpt`): its lines in the
  file, three lines around it, the base between the sides as diff3 writes it.
- `n`, `p` (`git.merge_next`, `_prev`) move between conflicts.
- `w` (`git.merge_save`; `ctrl+s` and `:w` too) once every conflict is settled: the result into the buffer as one edit,
  saved through `App.writeBuffer`; refused, said, while one isn't, or when the buffer changed since the screen read it.
- `s` (`git.merge_stage`) once saved: `git add` the file, which marks it resolved; the next file in conflict opens,
  else what comes next is said (`shift+r` continues the rebase, or concludes the merge).
- `esc` closes it; what's settled is kept for the file while its text is the same, and opening it again brings it back.

The conflict prompt's (M)erge (`5.5`), where its three-way merge leaves a conflict, opens the same screen on the note's
text as loaded (the base), as typed (yours) and on disk (theirs) (`fromMerge`, from `mergeChunks`, which `merge3` is now
built on): `w` puts the result in the note, measured against the text on disk from then on (`rebase`), and saves it;
`esc` goes back to the prompt; `s` is git's alone. A merge with no conflict is applied as before, unsaved.

### Pull and rebase, as built (GIT-T6)

The text for § Git, after "The remote and stash":

**Pulling where both sides moved** (GIT-D6; `core/gitremote.ts` `pullLater`, `tui/rebase.ts`): a pull that can't
fast-forward (git's "Not possible to fast-forward") asks: `(m)` merge the upstream into the branch (`git pull
--no-rebase --ff --no-edit`: git's own message, never an editor; `--ff` over a `pull.ff = only`), `(r)` rebase the branch
onto it (`git pull --rebase`), `(n)` nothing. Selected is what git's config says (`pullDefault`): a rebase where
`branch.<name>.rebase`, else `pull.rebase`, is true or a kind of rebase, else a merge.

**Rebasing onto the base** (`git.rebase`, `:rebase`, `shift+r` in the git panel — its `rebase`): the branch rebased onto
the base's tip — the branch's own (GIT-D10, `baseOf`), else `[git] base`, main or master (`baseBranch`) — after asking,
with how many commits each side has (`aheadBehind`); unsaved notes saved or kept first, as before a pull. On the base,
detached, or with nothing new on the base: said, nothing run.

**A merge or a rebase under way** (`core/gitrebase.ts` `operationOf`): read from git's own files, no git run —
`rebase-merge/` (`msgnum`, `end`, `head-name`), `rebase-apply/` (`next`, `last`; `applying`, a `git am`, is none of
slipbox's), `MERGE_HEAD` and its `MERGE_MSG` — again when git has news or half a second on (`operationNow`). The status
line says it after the branch, a rebase's branch named rather than its detached commit: `kestrel · main merging`,
`kestrel@agent/sync-retry rebasing 2/5`. `shift+r` then offers, as a question with keys: `(x)` the merge screen on a
file still in conflict, `(c)` continue (`git.continue`, `:continue`: `git rebase --continue`, or `git commit --no-edit`
for a merge; refused, said which, while a file is in conflict), `(s)` skip (`git.skip`, `:skip`: `git rebase --skip`, a
rebase's alone), `(a)` abort (`git.abort`, `:abort`: `git rebase --abort`, `git merge --abort`). The git panel has the
three as buttons meanwhile: Continue, Skip (a rebase's) and Abort.

Each runs in the background, one git command at a time with the remote's (`runInBackground`), without a terminal or an
editor (`GIT_TERMINAL_PROMPT=0`, `GIT_EDITOR=true`, `GIT_SEQUENCE_EDITOR=true`: a commit settled on the way keeps its
message). After it, HEAD is seen and git asked again; a stop at a conflict says where (`the rebase stopped at commit 1
of 2: 1 file in conflict (src/sync/retry.ts)`) and opens the merge screen on its first file; a stop for another reason
is said in git's words, with `shift+r`'s choices named; the end is said (`rebased: the rebase is done`), a merge screen
of git's still open closed. In a vault not trusted, `gitArgs`'s guards hold — no hook runs (a rebase's `pre-rebase`, a
merge's `pre-merge-commit`), no merge driver — and nothing is signed (`commit.gpgSign=false`); said.

## MODIFIED design/trust.md § What slipbox runs

The git bullet adds, after the commit (GIT-T3): a push runs no hook — its pre-push neither — and isn't signed
(`push.gpgSign=false`); a fetch, pull or push reaches no submodule (`--no-recurse-submodules`); and one whose
repository's own config (`local` or `worktree` scope, `git config --show-scope`) names a program git would run to reach
the remote — `core.sshCommand`, `core.gitProxy`, `core.askPass`, a credential helper, a remote's `uploadpack` or
`receivepack`, a transport allowed (`protocol.*.allow`: `ext::` runs a command) — is refused before it starts, said
which, and `:trust` lets it run. A git too old to say whose config it is (before 2.26) refuses all three there.

And (GIT-T10): a merge from the git panel (Merge…) runs no hook and isn't signed (`commit.gpgSign=false`), a branch or
a worktree made and a worktree removed run none either (`gitArgs`); a worktree made is checked out with no filter its
attributes name, as every git command there (`--attr-source`).

And (GIT-T6): a merge or a rebase — a pull's, a rebase onto the base, continuing, skipping or aborting one — runs no
hook and isn't signed (`commit.gpgSign=false`) there either, and opens no editor anywhere (`GIT_EDITOR=true`): the
repository's own `core.editor` names a program too.

## MODIFIED design/tui.md § Side panes ("Source control")

Adds (GIT-D8, GIT-D9): the message box, the buttons and their keys, the sections' and the rows' actions, the right
click's menu, the changes' stage and revert, the branch's section against its base, the Branches section with its
worktrees marked, ordered and folded, opened up in place, new, remove; each branch's base (GIT-D10); the other
repositories in the view (GIT-D11, VV-D10). The status line's branch, clicked. Previously: keys only; "nothing changed"
with nothing uncommitted; worktrees only in `space g w`'s list.

### The git panel, as built (GIT-T9, GIT-T10)

The text for § Side panes, in place of "Source control"'s bullet (`tui/gitpanel.ts`, the panel's state, rows, keys and
footer, `app.gitPanel`; `tui/gitview.ts`, the working tree's sections; `tui/gitbranchview.ts`, the branches;
`tui/gitreposview.ts`, the repositories; `tui/draw-git.ts`; `tui/gitmouse.ts`):

- **Source control (left, `±`): the git panel**, by mouse as by keys, its keys shown (GIT-D8). `space g` (`git.view`)
  opens it and focuses it, again closes it, as `space e` the explorer; the status line's mode chip says `GIT` while it
  has the keys. Shown again (opened, or its view picked on the rail), git is asked again about all it shows
  (`GitPanel.shown`). **Its top**, from a pane 10 rows tall: the repository (`Git.repoName`: the vault's name, else the
  main checkout's folder's) and its branch, a click (`git:head`) the status line's branches; under it, from 12 rows,
  where the branch stands — `↑5 ↓2 on main`, its own base's figures (GIT-D10), then its upstream's: `↑1 origin/main`,
  `in step with origin/main`, `not pushed` (no upstream), `origin/x is gone`. From 16 rows, **the message box**: a
  frame titled Message, its text wrapped, its last three rows shown, `ctrl+enter commits` in it while empty; a click
  (`git:box`) or `i` (`message`) types in it (`GitPanel.typing`, keys to `messageKey`: typed, `backspace`, `ctrl+w`,
  `ctrl+u`; a paste, every line), `ctrl+enter` commits what's staged with it in the background (`commitLater`, the box
  emptied when it's in), `enter` takes it to the floating editor, `esc` leaves it, as a click anywhere else does.
  **The buttons**, flowing over as many rows as they take: Commit (and the count staged), Amend, Pull (the count
  behind, once there's an upstream), Push (the count ahead; Publish with no upstream), Fetch, Stash (`buttons()`), each
  running its key's action — Commit with the box empty opens the editor, Amend starts from the box's text when it has
  one. Then the filter's row (`/`), the rows, and at the foot, under a rule, the keys of the row selected
  (`footer(row)`), or, under the pointer, a button's or a row's button's key and what it does (`pointedAt`), or, typing
  in the box, its keys.
- **Its rows** (`rows()`), each section under a heading that `enter`, a click, `l` and `h` fold (`GitPanel.folded`;
  the merged and older branches, the other repositories and home's folded to begin with): **Conflicts**, **Staged**,
  **Changes**, **Untracked** as before (26.2), a line saying `nothing uncommitted` when they're empty; **This branch
  against main** — what the branch changed against its own base, committed or not, its untracked files and conflicts
  (`changedLater`: the merge base, `git diff --name-status -M` against the working tree, the status's new files), asked
  again whenever git has news, none on the base itself; **This file: name** — Its diff against main (`git.diff`), Its
  history (`git.history`), Who changed this line (`git.blame`), for the note on screen in this checkout, not while
  filtering; **Branches**; **Other repositories** (VV-D10). Headings are rows: the selection moves through them, and
  on one, `s`, `u` and `d` act on its files (`sectionAction`): Changes' and Untracked's staged file by file, Staged's
  all unstaged, Changes' discarded after asking (`Discard every change that isn't staged, in 2 files? …`; untracked
  files stay; refused while one is unsaved). A heading's buttons are always drawn at its end: `−` on Staged, `+ ↺` on
  Changes, `+` on Untracked, `+ New` on Branches.
- **Its keys** (`[keys.git]`, `DEFAULT_GIT_KEYS`, actions `GIT_ACTIONS`): `j`/`k`, `g g`/`shift+g` move; `enter`
  (`open`) a file's or a change's diff in the diff window (GIT-D2, `showWorkDiff`: a staged one's against the last
  commit, a changed one's against what's staged, an untracked file's all added; `esc` back to the panel), folds a
  heading, opens up a branch or a repository; `o` (`go`) opens the file at its change, goes into a branch's worktree
  or a repository; `l`/`h` open up and fold; `s`, `u`, `d` stage, unstage, discard (a worktree removed, a gone one
  pruned, on a branch); `a`/`shift+u` everything; `c`/`shift+c` commit and amend; `f`, `p`, `shift+p`, `z` the remote's
  and the stashes (GIT-T3's, now the panel's own); `n` a new branch, `m` Merge… on the branch selected; `.` the row's
  menu; `/` filters files, branches and repositories by name — `enter` keeps the filter and acts on the row, `esc`
  clears it before it leaves; `q` closes, `esc` leaves. `v` (the review), `x` (the merge screen) and `shift+r` (rebase
  onto the base) are left for GIT-T2, GIT-T5 and GIT-T6: their place is marked in `DEFAULT_GIT_KEYS` and the buttons.
  The explorer's keymap loses `c`, `shift+c`, `f`, `shift+p` and their actions.
- **By mouse** (`gitmouse.ts`; each row a hot region `git:row:<i>`, its buttons `git:act:<i>:<action>` before it): a
  click selects a row and does what `enter` does, a double-click what `o` does (a heading, a branch, a repository only
  toggle); the pointer on a row (and the row selected) shows its buttons at its end — a working file's `+` or `−`, `↺`
  but on Staged and Conflicts, `⧉` its diff; a change's `+`/`−`, `↺`; a branch's file's and a repository's file's `⧉`; a
  repository's `›`, going in. A right click (button 2) opens the row's menu at the pointer (`GitPanel.menu`): for a
  file, its keys' actions with their keys, then Show it in the explorer, A note for the agent… (the scratch's capture
  of the file at the change, `formatEntry`, typing after its note), Copy its path; a branch's, a repository's, their
  own. The glyphs are `Glyphs.git`'s (`+ − ↺ ⧉ ✓ ⟳ ● ⎇ ✎ ◆`; ascii `+ - x d` and letters).
- **The Branches section** (GIT-D9; `gitbranchview.ts`, `core/gitbranches.ts`): the local branches
  (`branchesLater`: `for-each-ref` with each tip and its date, `worktree list --porcelain` for where each is checked
  out, a folder gone marked `prunable`), ordered by `orderBranches`: the branch here (`●`, `here`), those checked out in
  a worktree (`⎇`), those touched in 30 days (`OLD_MS`), the newest first; then folded under **Merged or older (n)**
  those merged into their base and the older — never one here or in a worktree. Merged is asked once a base
  (`for-each-ref --merged=<base>`: a branch merged into its kept base, else into any of its candidates). Each row's
  figures, asked for the rows drawn (`statsOf`, again when git has news): `↑ahead ↓behind on base`
  (`rev-list --left-right --count base...branch`, against each candidate, the nearest kept), a worktree's
  uncommitted files `✎n` (`status --porcelain` there; here, the panel's own), `◆` for a worktree's work to review
  (uncommitted, or ahead and not merged), `✓` merged, `folder gone`; short of room, the base's name goes first, then
  the behind, the name kept to 28 columns. **Opened up in place** (`opened`): its worktree's folder (or `its folder is
  gone`), its buttons — Open (into the worktree, VV-D4, at the note open here when it has it), or Check out here
  (`beforeCheckout`, `git switch`) and Open in a worktree (one made in `[git] worktrees`'s folder, or one typed, then
  gone into); Merge…; Remove… for a worktree; Prune for a gone one — always in the same places, so a click never lands
  on one moved under the pointer; then its worktree's uncommitted files (`Uncommitted (n)`) and its commits' files
  against its base (`Against main (n)`, `git diff base...branch`), each a diff in the diff window (against the merge
  base, or, uncommitted, the worktree's last commit). Its menu (`.`, a right click): its buttons' and Compare against…,
  A new branch from it…, Copy its name.
- **A new branch** (`n`, `+ New`; `newBranch`): its name (`check-ref-format --branch`, said when git won't take it),
  where it starts (this branch, the bases listed there are, every other branch, or a commit typed), and where it goes:
  In a new worktree (the default, `worktreeFolder`), In a new worktree, in another folder…, Check it out here (unsaved
  notes first), Just make it. `git branch --no-track <name> <from>`, then `git worktree add -- <folder> <name>` (no hook
  in a vault not trusted, `gitArgs`); its base kept (`keepBase`); it's opened up and selected.
- **Remove…** (`remove`): refused, said why, for a worktree with uncommitted files (`not removed: ~/x has 2
  uncommitted files — commit or discard them there first`) and for a branch not merged into its base (`… isn't merged
  into dev — 1 commit of its own; merge it first`); else asked — Remove it, keep the branch; Remove it and the branch
  (`git worktree remove`, no `--force`; `git branch -d`). The worktree you're in, and the main checkout, aren't
  removed from here. **Prune** forgets the worktrees whose folders are gone (`git worktree prune`).
- **Merge…** (`mergeMenu`): The links it would break (`showMergeReview`, 20.21), Merge it — run where the base is checked
  out, here (unsaved notes first) or in its worktree (`git merge --no-edit`, in the background; in a vault not trusted
  no hook, `commit.gpgSign=false`); a conflict said, `git merge --abort` named — or, checked out nowhere, said so; Into
  another branch… among those checked out here or in a worktree.
- **The status line's branch** (`status:branch`, in a repository): the branches list (`openBranches`) with Pull
  (behind its upstream), Push (or Push, and track it on origin), Fetch and The git panel before the branches.
- **A change's sign in the gutter**, clicked (`gsign:<line>`, GIT-D12): a menu at the sign — `line 12, against what's
  staged`, Revert it (`r`, `revertChange`: as `git.change_undo`, unsaved, one undo step), Stage it (`s`, `stageSign`:
  the index given the change's lines as they are now, refused while the file is unsaved), then the change's lines,
  `-` and `+`, eight at most.

## MODIFIED design/tui.md § Git: each branch's own base, as built (GIT-T10)

`core/gitbase.ts`: a branch's base (`chooseBase`, `baseFor`) is the one kept for it in `bases.json` (slipbox's state,
by repository: its shared git folder's real path, `repoKey`) — by a new branch's From, or Compare against… — when it's
still there; else the nearest of its candidates (`candidates`): `[git] bases`, with `[git] base` when set, a base
listed there measured only against those before it (`["main", "dev"]`: dev against main, main against none), the
nearest the one that leaves the branch fewest commits of its own (`git rev-list --count c..branch`; a tie, the first);
else `[git] base`, main or master. Null for the trunk itself. `Git.baseOf` asks it once each time git has news; the
panel, `:changes` (`openChanges`), `:diff` and `showDiff`, This branch against main and Merge… use it. The CLI's
`changed`, `diff` and `merge-review` keep `[git] base`.

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

Built (GIT-T10): `[git] bases` (default `["main"]`, each branch's own base guessed among them, GIT-D10) and `[git]
worktrees` (default `"{parent}/{repo}-{branch}"`, `worktreeFolder`: `{parent}` the folder holding the main checkout,
`{repo}` its folder's name, `{branch}` the branch's made safe for a folder's — `/`, `\`, `:` and the like a `-`, no dot
or dash at its ends, `branch` when nothing's left — `~` home, a relative path from `{parent}`). `git.worktrees` is
your own config's alone (`USER_ONLY`: it says where slipbox makes folders, outside the vault). `[keys.git]`, the git
panel's keymap, is a key table as `[keys.explorer]` is (GIT-T9).

## MODIFIED design/tui.md § Keys

`space g` opens and focuses the git panel (GIT-D12), as `space e` the explorer; the panel's single keys act on its
selection; `space g`'s keys of their own (`c`, `d`, `h`, `b`, `w`, `m`, `p`, `r`) go, their commands staying in the
palette and the panel's "This file" section; a click on a change's sign in the gutter shows it with Revert and Stage.

Done in GIT-T9: `leader g` is `git.view` (open, focus, close), the `leader g` group gone; `space g c`, `d`, `w` and
`m` are `:changes`, `:diff`, `:worktrees` and `:merge-review`; Branches, Who changed this line, This file's history,
Preview the change and Undo the change are the palette's (and the first three the panel's). The panel's keys are a
keymap of their own, `[keys.git]` (§ Side panes); help lists them under "Inside the git panel", which-key from
`GIT_ACTION_INFO`.
