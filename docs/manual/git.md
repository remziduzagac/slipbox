# Git

This chapter covers what slipbox does when the folder you open is a git repository, or holds some. The command line's
git commands come at the end.

slipbox shows what git knows about the repository:

- which files changed
- which lines of the file on screen changed
- who last changed a line
- what a file looked like before
- what each branch changed, and where its worktree is

You can stage, commit, make and switch branches, and make worktrees for agents without leaving slipbox, by keys or by
mouse. You can fetch, pull, push and stash. You can review an agent's change one piece at a time, keeping, reverting or
sending back each. You can also review a branch before you merge it, including the links a merge would break, merge
it, and settle a merge's conflicts on a merge screen.

slipbox runs the `git` on your `PATH`. Without it, none of this shows.

slipbox fetches, pulls and pushes only when you ask, never on its own. It merges or rebases only when you ask too: a
branch merged from the git panel, a pull where both sides moved, or the branch rebased onto the base. For the rest of
what git does, such as an interactive rebase or a cherry-pick, you run git yourself, and slipbox follows what it did.
[Privacy](privacy.md) has the few cases where git itself reaches a remote.

## Git in slipbox

A git repository is a vault by itself. Open any file in it, and slipbox opens the repository from its top folder.
[Links and vaults](links-and-vaults.md) explains vaults.

The status line shows the vault and the branch checked out. For example, it shows `app · main` for a repository named
`app` by its remote. A worktree of a named folder shows as its name and branch, as in `app@fix/retry`. Click them, and
slipbox lists the branches, with pull, push and fetch first.

When the branch has an upstream, the status line also shows how far the branch is ahead of it and behind it, as of the
last fetch: `app · main ↑2 ↓1` has two commits to push and one to pull. Nothing shows when they're in step.

While a merge or a rebase is under way, the status line says so after the branch: `app · main merging`, or
`app · fix/retry rebasing 2/5` at the second of five commits.

The examples in this chapter use that repository, `~/code/app`, as [Code](code.md) does.

The explorer marks each changed file at the end of its row:

| Mark | The file is |
| --- | --- |
| `M` | modified |
| `+` | new: untracked, or added |
| `R` | renamed |
| `!` | in conflict, during a merge |

A folder with a changed file somewhere inside it shows `•` (`o` with ASCII icons). git's mark is in the column before
the one that says what's indexed ([A row's marks](files.md#a-rows-marks)).

slipbox asks git in the background, a moment after anything changes. That can be a save, a file an agent wrote, or a
branch switch.

Everything else is in the git panel:

| Keys | What it does |
| --- | --- |
| `space g` | Opens the git panel, focuses it, and closes it, in turn |
| `] c` / `[ c` | Goes to the next / previous changed line in this file |

The rest are the panel's own keys, its buttons, and commands in the palette (`:`): `:changes`, `:diff`, `:worktrees`,
`:merge-review`, `:fetch`, `:pull`, `:push`, `:stash`, `:review`, `:resolve`, `:rebase`, and Branches, Who changed this
line, This file's history, Preview the change and Undo the change, by their titles.

[Keys](keys.md) has every key. You can change these like any other.

## What slipbox runs

slipbox reads status, diffs, blame and history from git. It runs git to stage, unstage, discard, commit and switch
branches. When you ask, it runs git to fetch, pull, push and stash, to make a branch or a worktree, to remove a
worktree, to merge or rebase, and to continue, skip or abort a merge or a rebase under way.

What else git runs depends on whether you trust the vault. A repository you cloned can name programs for git to run.
slipbox lets them run only in a vault you trust. [Code](code.md#trust) explains trust.

In a vault you don't trust, git runs nothing of the repository's own:

- No hooks. A commit, a push, a merge or a rebase runs none, not even the `pre-push` hook. None of them is signed,
  since the repository's config could name the program that signs.
- No program the repository's own config names for reaching a remote, such as an ssh command or a credential helper. A
  fetch, pull or push with one stops before it starts, and says which. `:trust` lets it run.
- No `core.fsmonitor` command.
- No filter, diff driver or merge driver named in its attributes. This needs git 2.42 or later. With an older git, a
  repository's filters can still run, and `slipbox doctor` warns of it.
- No text conversion or external diff program in a diff.
- Reading the status writes nothing to the index.

Blame always reads the last commit, never the files as they are now. Blaming those could run a filter.

In a vault you trust, git runs as the repository has it, with its hooks, its signing and its filters.

A repository that keeps large files with Git LFS can show those files as changed until you trust it. That's because
their filter doesn't run.

### Which git

Most of this works with git 2.25 or later. These need a newer one:

| Feature | Needs git |
| --- | --- |
| Staging, unstaging and discarding a file, or a section at once | 2.26 |
| A branch's base, checked before git uses it | 2.30 |
| A worktree whose folder's name holds a line break, listed whole | 2.36 |
| Reviewing a merge ([Reviewing a merge](#reviewing-a-merge)) | 2.38 |
| No filter, diff driver or merge driver of a vault you don't trust | 2.42 |

With a git before 2.36, a worktree whose folder's name holds a line break is listed by the name's first line. Everything
else about worktrees works as usual.

## Changed lines in the gutter

As you read or edit a file, the gutter marks the lines that differ from what's staged. By default the signs sit in the
gutter's last column, just before the text. The comparison uses the text as it is now, unsaved typing included.

| Sign | Colour, in most themes | Means |
| --- | --- | --- |
| `▎` | a soft green | lines added |
| `▎` | a soft yellow | lines changed |
| `▁` | a soft red | lines deleted below this line |
| `▔` | a soft red | lines deleted above the first line |

The colours are muted, halfway from the explorer's to the page's. So the signs stay out of the way of the text.
`[colors]` sets them, with `git_sign_add`, `git_sign_change` and `git_sign_delete` ([Configuration](configuration.md)).

With ASCII glyphs, the signs are `+`, `~`, `_` and `-`. [Reading](reading.md) covers glyph sets.

A file git doesn't track yet has every line added. A file git ignores has no signs.

Line endings don't count. So a checkout that turns LF into CRLF changes nothing.

In the rendered view, a row drawn from several lines shows the strongest of their signs.

### Where the signs sit

`git.signs_at` says where the signs sit:

- `"gutter_right"`, the default: the gutter's last column, against the text.
- `"gutter_left"`: the gutter's first column, before the problems bar and the line numbers, away from the text.
  Without a gutter, the signs take the window's margin there, and the text doesn't move.
- `"window_right"`: the window's right edge, by the scrollbar. A file that has had a change keeps that column while
  open. So the text wraps one column short of it.

Sometimes the signs sit against the text with no gutter: line numbers are off, and there's no problems bar. Then a file
that has had a change gets a column of its own, and keeps it while open. So the text doesn't move as changes come and
go.

### The keys for a change

| Keys | What it does |
| --- | --- |
| `] c` / `[ c` | Goes to the next / previous change, going round at the file's ends |
| a click on a change's sign | Shows the change, with Revert and Stage |

The click shows the change's lines as staged, then as they are now, in a menu at the sign:

- **Revert it** (`r`) puts the lines back as staged. It's one undo step, so `u` brings your lines back, and it leaves
  the file unsaved.
- **Stage it** (`s`) stages that change alone, as `git add -p` does. Save the file first: git stages what's on disk.

The palette has the same for the cursor's line: Preview the change, and Undo the change.

`git.signs = false` turns the signs off ([Configuration](configuration.md)).

## The git panel

Press `space g`, or click `±` on the left rail. The git panel, source control, opens in the left panel with the keys:
the status line says `GIT`. `space g` again closes it. It works by mouse as by keys, and says its keys as it goes.

At its top:

- the repository and its branch, clicked as the status line's are: the branches, pull, push and fetch
- where the branch stands: how far it's ahead of its base and behind it (`↑5 on main`), and against its upstream
  (`↑1 origin/main`), or that it has none yet (`not pushed`)
- the message box, for a commit's message ([Committing](#committing)). Going into another vault empties it, so a
  message is never committed in the wrong repository
- the buttons: Commit (with how many files are staged), Amend, Pull (once there's an upstream), Push (Publish without
  one), Fetch and Stash; Review while a change isn't staged, Resolve while a file is in conflict, and Continue, Skip
  and Abort while a merge or a rebase is under way. Each does what its key does; under the pointer, the panel's foot
  says the key.

Under them are its sections, each under a heading that `enter` or a click folds and unfolds:

- **Conflicts**: files a merge left unmerged.
- **Staged**: what the next commit takes.
- **Changes**: changed, not staged yet.
- **Untracked**: new files git doesn't track yet.
- **This branch against main**: what the branch changed against its base, committed or not
  ([Reviewing a branch](#reviewing-a-branch)). On the base itself there's none. With nothing uncommitted, it's what
  the panel shows, so an agent's committed work is never "nothing changed".
- **This file**: the note on screen's diff against the base, its history, and who changed the cursor's line.
- **Branches**: the repository's branches, their worktrees marked ([Branches](#branches)).
- **Other repositories**: the others in the explorer's view, folded
  ([The repositories around you](#the-repositories-around-you)).

Each changed file shows its state letter, coloured. After its name comes its folder, dimmed. The letters are:

| Letter | The file is |
| --- | --- |
| `M` | modified |
| `A` | added |
| `D` | deleted |
| `R` | renamed, its old name before its new one: `R draft.md → idea.md` |
| `U` | in conflict |
| `?` | untracked |

A file can be in Staged and in Changes at once, when part of it is staged. A renamed file's diff in Staged is against
its old name in the last commit, so it shows what changed, not the whole file as new. Its edits not staged show in
Changes, against what's staged, as any file's do.

The panel's foot says the keys of the row selected. Its keys:

| Key | What it does |
| --- | --- |
| `j` / `k` | Moves through the rows, the sections' headings among them |
| `enter` | Shows a file's diff, or a change's ([How a diff is drawn](#how-a-diff-is-drawn)). On a heading, folds it |
| `o` | Opens the file at the change. On a branch's row, goes into its worktree |
| `l` / `h` | Opens a file up into its changes, or a branch, in place / folds it again |
| `s` | Stages the file, or just the change selected. On a conflict, it marks the file resolved |
| `u` | Unstages the file, or just the change selected |
| `d` | Discards what isn't staged: the file's changes, or the one change. It asks first |
| `a` / `shift+u` | Stages everything, untracked files too / unstages everything |
| `i` | Types in the message box |
| `c` / `shift+c` | Commits what's staged / amends the last commit ([Committing](#committing)) |
| `v` | Reviews the changes, one at a time ([Reviewing a change](#reviewing-a-change)) |
| `f` / `p` / `shift+p` | Fetches / pulls / pushes ([Fetching, pulling and pushing](#fetching-pulling-and-pushing)) |
| `z` | Lists the stashes ([Stashes](#stashes)) |
| `n` / `m` | A new branch / merges the branch selected ([Branches](#branches)) |
| `x` | Opens the merge screen on a file in conflict ([The merge screen](#the-merge-screen)) |
| `shift+r` | Rebases onto the base, or continues, skips or aborts one under way ([Rebasing](#rebasing-onto-the-base)) |
| `.` | The row's menu |
| `/` | Filters the files, branches and repositories by name. `enter` keeps the filter; `esc` clears it |
| `q` / `esc` | Closes the git panel / goes back to the note, leaving it open |

On a section's heading, `s`, `u` and `d` act on every file under it: Changes' and Untracked's staged, Staged's
unstaged, Changes' discarded (after asking; untracked files stay). Unstaging everything during a merge keeps the merge:
a file in conflict stays in conflict. Unstaging a renamed file unstages the rename: the old name comes back, and the new
one is untracked.

By mouse:

- A click on a file shows its diff; a double-click opens it. A click on a heading folds or unfolds it.
- Under the pointer, a row shows its buttons: `+` stages, `−` unstages, `↺` discards, `⧉` shows the diff. A heading has
  its own, always shown: `+` and `↺` on Changes, `+` on Untracked, `−` on Staged. The foot says what each does, and
  its key.
- A right click opens a row's menu: what its keys do, and Show it in the explorer, Copy its path, and A note for the
  agent, which adds the file to the scratch for you to write about.

A staged file opens up into its changes against the last commit. A changed one opens up into its changes against
what's staged, as the file is on disk.

Staging one change works as `git add -p` does. The index gets that change and nothing else. Other changes in the file,
staged or not, stay as they were.

Discarding asks first. Then:

- A file goes back to what's staged.
- A single change has its lines put back as staged, and the file is saved.
- An untracked file goes to slipbox's trash, where you can get it back. [Files](files.md) has the trash.

slipbox doesn't discard a file with unsaved changes in slipbox, since git works on the file on disk. Save it first.

When git refuses something, slipbox says why in git's own words.

## Committing

1. Type the message in the panel's message box: click it, or press `i`. `esc` leaves it, keeping what's typed.
2. Press `ctrl+enter`, or click Commit. The commit runs in the background, as a hook can take a while. When it's done,
   a message says its short hash and subject, and the box is empty again. The message is what you typed: a line
   starting with `#`, such as `#12 fix the link`, is part of it.

For a longer message, press `c`, or `enter` in the box, or Commit with the box empty. A floating editor opens for the
message, with the box's text, and you type on. Lines starting with `#` say what's staged. They're left out of the
message. When the message you start from has a line starting with `#`, those lines start with `;` instead, and your
`#` lines are kept. `ctrl+s` (or `:w`) commits. `esc` or `q` leaves the editor and commits nothing.

If the message is empty, or a hook refuses, slipbox says so in git's words. The editor stays open.

`shift+c`, or Amend, amends the last commit with what's staged. The last commit's message is there to start from, or
the box's, when it has one.

"Commit" and "Amend the last commit" are in the palette (`:`) too, for when the git panel isn't open. With nothing
staged, a commit says so.

In a vault you don't trust, the commit's hooks don't run, and it isn't signed. The editor's first lines and a message
say so.

## Reviewing a change

When an agent has changed files, you can go through what it did one change at a time. You keep each change, revert it,
or send it back to the agent with a note. [Code and git](../guides/code-and-git.md#review-an-agents-change) walks
through one review, from the git panel to the merge.

Press `v` in the git panel, or click Review, or run `:review`. The review walks every change in the working tree that
isn't staged yet, file by file, in the order of their paths, untracked files among them. A file git doesn't track yet
counts as one change, all of it added. Each change shows in a floating window as a diff, with a few of the file's
lines around it. It's drawn as every diff is ([How a diff is drawn](#how-a-diff-is-drawn)): a note's change as its
paragraphs before and after, the words that changed marked; a code file's as its lines, side by side when the window is
wide. Above the diff are the file, where the change is (`line 12 · change 2 of 3 here, 5 of 9 in all`), and the keys:

| Key | What it does |
| --- | --- |
| `y` | Keeps the change: stages it, as `s` stages one change in the git panel |
| `x` | Reverts the change: its lines go back to what's staged, and the file is saved at once |
| `c` | Asks for a note, and adds the change to the scratch for the agent: the file, its lines, the diff and your note |
| `n` / `p` | Goes to the next / previous change |
| `tab` | Draws a note's change as its lines, or as its blocks again |
| `enter` | Ends the review, and opens the file at the change |
| `esc` | Ends the review |

After `y`, `x` or `c`, the review moves on to the next change you haven't dealt with. When none is left, or when you
press `esc`, a message says what you kept, reverted and noted. When you noted something, it names `space s y`, which
copies the scratch for the agent ([The scratch](editing.md#the-scratch)).

A revert is one step of the file's undo: open the file and press `u` to bring the change back. slipbox doesn't revert a
file with unsaved typing, since that would write over it. It says so, skips the change, and goes on. A file git doesn't
track goes to slipbox's trash when you revert it, after asking. A deleted file comes back as staged.

A file can change while the review is open, when an agent is still at work. `y` and `x` act only on what the review
showed you. A change no longer where the review found it, a deleted file written again, or a new file changed since is
left as it is, and a message says so. Press `v` again to review the files as they are now.

The review commits nothing. Staging is how it marks what you kept, so a commit afterwards (`c` in the git panel)
takes exactly what you reviewed.

## Fetching, pulling and pushing

slipbox reaches a remote only when you ask. Nothing runs on a timer.

| In the git panel | Command | What it does |
| --- | --- | --- |
| `f` | `:fetch` | Fetches the branch's remote, or `origin` when the branch has no upstream |
| `p` | `:pull` | Pulls: brings the upstream's new commits into the branch, and asks first when both sides moved |
| `shift+p` | `:push` | Pushes the branch to its upstream |

The palette (`:`) has them too, as Fetch, Pull and Push.

Each runs in the background, so slipbox never waits on the network. A message says how it went, in git's words when it
failed. Those words are git's English, whatever your language settings: slipbox reads them to know what happened, such
as a pull that can't fast-forward. A remote whose name starts with `-` is refused before git runs, and said.

- **Fetch** gets the remote's new commits without touching your files. The status line then shows how far the branch is
  behind its upstream, as in `main ↓3`.
- **Pull** brings those commits into the branch. When the branch has no commits of its own that the upstream lacks, it
  fast-forwards. When both sides have new commits, slipbox asks how to bring them together
  ([Pulling where both sides moved](#pulling-where-both-sides-moved)).
- **Push** sends the branch to its upstream. A branch without one gets a question first: push it to `origin` under the
  same name, and track it there? A remote that refuses the push, because it has commits the branch lacks, is said so.
  Fetch and pull first.

Before a pull, unsaved notes are handled as for a branch switch: save them, keep them unsaved, or cancel. A pull that
moves the branch on is no switch, and your tabs stay as they were.

### Logging in

slipbox never asks for a password or a passphrase, and git never waits for one. git runs without a terminal to ask in:

- Your credential helper still answers, as it does in a terminal.
- ssh runs in batch mode, so a key it would ask the passphrase of isn't used. A key without a passphrase, or one your
  ssh agent holds, works. If you set your own ssh command (`core.sshCommand` or `GIT_SSH_COMMAND`), slipbox uses yours
  as it is.

A remote that needs a login git can't make that way fails at once, in git's words. For example: `could not read
Username for 'https://…': terminal prompts disabled`. Run the same command in a terminal, where git can ask. Once your
credential helper or your ssh agent has the login, slipbox can use it too.

### In a vault you don't trust

A push runs none of the repository's hooks, not even its `pre-push` hook, and it isn't signed. A fetch, pull or push
whose repository names its own program for reaching the remote stops before it starts, and says which.
[What slipbox runs](#what-slipbox-runs) has the rest.

## Stashes

`z` in the git panel, or `:stash`, lists the stashes, newest first, under two ways to make one:

- **Stash the changes…** asks for a message, then sets your uncommitted changes aside, staged or not. The files go back
  to the last commit. Untracked files stay.
- **Stash the changes, untracked files too…** sets those aside as well.

Without a message, git names the stash, as in `WIP on main: …`.

`enter` on a stash offers three things:

- **Pop it**: its changes put back in the files, and the stash dropped.
- **Apply it**: its changes put back, and the stash kept.
- **Drop it…**: the stash thrown away, after asking.

Before a stash, or a stash brought back, changes the files, unsaved notes are handled as for a pull. A stash that
conflicts with your changes is said in git's words, and kept.

A stash made somewhere else in the meantime, by an agent or in a terminal, renumbers the others. slipbox then refuses
the one you picked, rather than act on another, and `z` lists them again.

## Merge conflicts

While a merge or a rebase has conflicts, the files git couldn't merge show in several places:

- The explorer marks them `!`.
- The git panel lists them under Conflicts.
- The Problems panel's All tab (`space v p`) lists them under Conflicts, each at its first `<<<<<<<` line.
- In a note, each conflict is an error among the note's problems: "a merge conflict: both sides are still here".

[Code](code.md#problems) covers the Problems panel.

To settle a file's conflicts by hand instead, edit its markers away and save it. Then press `s` on it in the git
panel: it's marked resolved.

### The merge screen

Press `x` on a file in conflict, in the git panel or in the Problems panel's All tab, click Resolve, or run `:resolve`
on a note in conflict. The merge screen opens in a floating window, one conflict at a time. For each conflict, it shows:

- **Base**: the version both sides started from.
- **Yours**: your side, as a diff against the base. In a merge, it's the branch you're on.
- **Theirs**: the other side, as a diff against the base. In a merge, it's the branch coming in.

Each side's diff is drawn as every diff is ([How a diff is drawn](#how-a-diff-is-drawn)): in a note, its paragraphs as
the base had them and as the side has them, the words that changed marked; in a code file, the base's lines beside the
side's when the window is wide.

Below the conflict is the file as it will be. Each conflict shows there as you settled it, or still marked if you
haven't.

| Key | What it does |
| --- | --- |
| `o` | Takes yours |
| `t` | Takes theirs |
| `b` | Takes both, yours first |
| `shift+b` | Takes both, theirs first |
| `e` | Puts the result in the file, and opens it in the lens at this conflict, to settle by hand |
| `a` | Asks for a note, and adds the conflict to the scratch for the agent, with its base and the lines around it |
| `n` / `p` | Goes to the next / previous conflict |
| `tab` | Draws a note's sides as their lines, or as their blocks again |
| `w` | Saves the file, once every conflict is settled. `ctrl+s` and `:w` do the same |
| `s` | Stages the saved file, which tells git it's resolved |
| `esc` | Closes the screen. What you settled stays, as long as the file doesn't change |

After you settle a conflict, the screen moves on to the next one you haven't. Once you've staged a file, the next file
in conflict opens.

The file can change while the screen is open, when an agent writes it. Then `w` doesn't write over it: the screen says
so, and `x` reads the file again. `s` reads the file before staging it, and doesn't stage one that changed since you
saved it, or that still has conflict markers.

The base comes from git. Where git wrote the conflict with its base (`merge.conflictStyle` set to `diff3` or `zdiff3`),
it's that. Otherwise it's the version git keeps of the file while the merge is under way. Where git doesn't have it,
each side shows whole.

A side can hold a line of seven `=` signs of its own, such as a heading's underline. Its conflict then has more than
one `=======` line, and either could be where yours ends. slipbox asks git which, from its own copies of each side.
When git can't say, the screen shows the conflict as marked, and says it's ambiguous. Taking a side is refused there,
since it could keep the wrong lines: press `e` to settle it by hand.

Markers inside a fenced code block, such as a note's example of a conflict, are text, not a conflict. Markers that git
wrote into a code block are still a conflict: slipbox tells them apart by git's copies of each side.

`e` writes the result into the file without saving it. The conflicts you haven't settled stay marked there, and
autosave stays off until you save the file yourself. Edit them away, then save. Or press `x` again: the merge screen
reads the conflicts that are left.

In a rebase, the sides are the other way round. Yours is the branch you're rebasing onto, and theirs is your commit
being replayed. The screen says so.

The conflict prompt's (M)erge uses the same screen, for a note that changed on disk while you typed in it, when its
merge leaves a conflict. There, yours is what you typed, and theirs is the file on disk. `w` saves the result, and `esc`
goes back to the prompt ([Editing](editing.md)).

## Pulling where both sides moved

When the branch and its upstream both have new commits, a pull can't fast-forward. slipbox asks what to do:

- **Merge** the upstream into the branch, with a merge commit.
- **Rebase** the branch onto the upstream: its own commits are replayed after the upstream's.
- **Nothing**: both stay as they are.

The one git's `pull.rebase` names is selected; without it, merge. A conflict on the way opens the merge screen. A rebase
over uncommitted changes asks first whether to stash them ([below](#a-rebase-over-uncommitted-changes)).

## Rebasing onto the base

`shift+r` in the git panel, or `:rebase`, rebases the branch onto its base: its own commits are replayed after the
base's new ones. That brings an agent's branch up to date. The base is the branch's own, as the git panel measures it
against ([The base of each branch](#the-base-of-each-branch)). slipbox asks first, and says how many commits each side
has. Unsaved notes are handled as for a pull.

When a commit doesn't replay cleanly, the rebase stops there, and the merge screen opens on its conflict. Settle it,
save it and stage it, then continue.

Git runs in the background, so you may be typing, or answering another question, when it stops. Then the merge screen
doesn't open over what you're doing, since your keys would settle conflicts there. A message says where the rebase
stopped instead: press `x` in the git panel, or run `:resolve`, when you're ready. The same goes for a pull's question
about bringing both sides together: `p` asks it again.

### A rebase over uncommitted changes

Git won't start a rebase while tracked files have changes, staged or not. So when they do, slipbox asks first, before
`shift+r`'s rebase or a pull's: `Stash your changes, rebase fix/retry onto main, put them back?`, with how many files
are changed. For `shift+r`, that's its one question, which also says how many commits each side has.

Yes stashes the changes, rebases, and puts them back. Changes you had staged come back not staged, though a new file
stays staged. No does nothing. If the rebase stops at a conflict, your changes stay stashed until it's continued to
the end or aborted.

Untracked files are left where they are, as git leaves them. They don't stop a rebase unless the other side has a file
of the same name: then git refuses, and slipbox says so in git's words.

If putting your changes back conflicts with what the rebase brought in, git keeps them in the stash, and marks the
files in conflict. The message says so, names the stash, as in `stash@{0} ("autostash")`, and lists the files. Settle
them on the merge screen (`x` in the git panel, or `:resolve`), then drop the stash: `z`, the stash named
`autostash`, and Drop it.

## A merge or a rebase under way

While a merge or a rebase is under way, the status line says so, and the git panel has Continue, Skip (for a rebase)
and Abort buttons. A cherry-pick or a revert you started in a terminal (`git cherry-pick`, `git revert`) counts too,
when it stops at a conflict, or between the commits of a series: the status line says `cherry-picking` or
`reverting`, and the same buttons are there. `shift+r` in the git panel, or `:rebase`, offers the same:

| Key | Command | What it does |
| --- | --- | --- |
| `c` | `:continue` | Continues: commits what's settled, and goes on to the next commit; a merge makes its commit |
| `s` | `:skip` | Leaves the current commit of a rebase, a cherry-pick or a revert out, and goes on |
| `a` | `:abort` | Gives it up, after asking: the branch goes back to where it was |
| `x` | | Opens the merge screen on a file still in conflict |

A continue waits until no file is in conflict. When it stops at the next commit's conflict, the merge screen opens on
it. Each runs in the background, and a message says how it went, in git's words when it failed. A commit made on the
way keeps its message: git doesn't open an editor for it.

In a vault you don't trust, none of them runs the repository's hooks, and its commits aren't signed.

## Who changed a line

Who changed this line, in the git panel's This file or the palette, shows who last changed the cursor's line, in a
floating window. The window shows the commit's:

- short hash
- author
- day
- whole message

It reads the last commit. So a line you've changed since says it isn't committed yet. A file that isn't in the last
commit has no one to name.

`esc` or `q` closes the window.

## A file's history

Its history, in the git panel's This file, or This file's history in the palette, lists the commits that changed
the file on screen, newest first. Each has its author and day.

The list follows the file back through renames. A commit from before a rename says the path the file had then.

`enter` on a commit offers two things:

- **Read it as it was**: the file at that commit, read-only, in a floating window. A note is rendered.
- **Its diff to the text now**: each line removed or added since, drawn as [a diff](#how-a-diff-is-drawn). `enter`
  on a line goes there.

## Branches

The git panel's Branches section lists the local branches, in this order:

1. the branch checked out here, marked `●` and `here`
2. those checked out in a worktree, marked `⎇`, the newest first ([Worktrees](#worktrees))
3. those touched in the last month, the newest first

Then, folded under **Merged or older**, the branches merged into their base and those untouched for a month. `/`
filters them all by name.

At its end, each says what it holds, as git last said: how far it's ahead of its base and behind it, with the base's
name (`↑3 ↓1 on dev`); a worktree's uncommitted files (`✎2`); `◆` when a worktree has work to review, uncommitted or
not merged; `✓` when it's merged. Short of room, the base's name goes first.

`enter`, or a click, opens a branch up in place, without going anywhere:

- its worktree's folder, or that the folder is gone
- its buttons: Open, for a branch in a worktree; Check out here and Open in a worktree, for one checked out nowhere;
  then Merge…; and Remove… for a worktree
- a worktree's uncommitted files, and the files the branch changed against its base, each showing its diff on a click
  or `enter`

`.`, or a right click, opens a branch's menu: what its buttons do, Compare against…, a new branch from it, and Copy
its name.

- **Open**, or `o`, goes into the worktree, a vault of its own. You land at the same note when it's there, else at its
  top folder. `ctrl+o` comes back.
- **Check out here** checks the branch out in this checkout.
- **Open in a worktree** makes a worktree for the branch, in the folder `git.worktrees` names, and goes into it.
- **Merge…**, or `m`, merges the branch into its base. It offers the links the merge would break first
  ([Reviewing a merge](#reviewing-a-merge)), then the merge itself, run where the base is checked out: here, or in its
  worktree. Into another branch… picks another. A merge that conflicts stops, git's words said, its files under
  Conflicts; `git merge --abort` undoes it. In a vault you don't trust, it runs no hook and isn't signed.

### A new branch

`n` in the git panel, or `+ New` on the Branches heading, asks three things:

1. Its name. If git won't take it, slipbox says so.
2. Where it starts: this branch, the bases (`git.bases`), any other branch, or a commit you type.
3. Where it goes: **In a new worktree** (the default), in the folder `git.worktrees` names; **In a new worktree, in
   another folder…**, typed; **Check it out here**; or **Just make it**.

If git can't make the worktree, say because its folder is taken, the branch isn't made either.

slipbox keeps the branch it was made from as its base ([The base of each branch](#the-base-of-each-branch)).

A worktree suits giving an agent a branch of its own to work on. Made beside the repository by default, it shows under
Branches at once, `⎇` and its folder; the agent's commits show there against its base.

### Switching branches

The status line's branch, clicked, lists the local branches, with pull, push and fetch first. So does the palette's
Branches. The one checked out is marked `here`.

- `enter` on another branch checks it out.
- The last entry, "A new branch from here…", asks for a name. It makes the branch where you are, then switches to it.
  If git won't take the name, slipbox says so.

If a note has unsaved changes, slipbox asks first. You can:

- Save them, then switch.
- Switch and keep them unsaved. A file the switch changes then becomes a conflict to settle when you save.
  [Editing](editing.md) covers a file changed on disk while you edit it.
- Cancel.

If git refuses the switch because it would overwrite a change of yours, slipbox says why in git's words.

However a branch is switched, here or in a terminal, slipbox takes it as one change. It doesn't take it as a storm of
files coming and going. It says `switched to branch …`.

Notes that only one branch has come and go. They aren't taken for moves.

Each branch keeps its own tabs. The ones you had open on a branch come back when you switch to it, as long as:

- `ui.restore_session` is on ([Configuration](configuration.md))
- nothing is unsaved

Unsaved notes stay open, and a message says so.

## Worktrees

A worktree, made with `git worktree add` or from the git panel, is a vault of its own. It has its own tabs, positions
and scratch. [Links and vaults](links-and-vaults.md#worktrees) has the rest.

The git panel shows each worktree on its branch, in Branches ([Branches](#branches)).

`git.worktrees` says where a worktree slipbox makes goes. It's a path with three blanks to fill:

| Blank | Filled with |
| --- | --- |
| `{parent}` | the folder holding the repository's main checkout |
| `{repo}` | the main checkout's folder's name |
| `{branch}` | the branch's name, made safe for a folder's: `agent/sync-retry` is `agent-sync-retry` |

It's `"{parent}/{repo}-{branch}"` as it comes: beside the repository, as `~/code/app-fix-retry`. Yours could be
`"~/Projects/worktrees/{repo}/{branch}"`, one folder for all of them. A path not starting with `/` or `~` is from
`{parent}`. Only your own configuration sets it ([Configuration](configuration.md)).

**Remove…**, on a worktree's branch, removes the worktree, after asking, when two things hold:

- its branch is merged into its base, so nothing of its own would be left only there
- it has no uncommitted files

Otherwise it's refused, and slipbox says why. Asked, you can keep the branch, or remove it too. Removing a worktree
deletes the files git ignores there too, as git does. The question names them first, notes before other files, such as
`also deletes 2 ignored notes: local/draft.md, local/b.md`. What tools build, such as `node_modules` or `dist`, isn't
listed. You can't remove the worktree you're in, even when you opened it through a link to its folder. A worktree whose
folder is gone, deleted by hand, says so on its branch, with **Prune**, which has git forget it.

Checking a branch out, and making or removing a worktree, run in the background, so a big checkout doesn't hold
slipbox up. If git takes more than ten minutes, slipbox stops it and says what it may have left, such as a worktree
half checked out.

`:worktrees` lists the repository's checkouts by branch:

- The main one comes first.
- The one you're in is marked `●`.
- A detached one shows by its short commit.

`enter` switches to that checkout. You land at the same note when it's there, else at its top folder.

## The repositories around you

The git panel follows the vault you're in. In a repository, it's that repository's, and under it, folded, are the other
repositories in the explorer's view: **Other repositories**.

In a vault that isn't a repository, those repositories are the panel. That's home, a vault without git, or a folder
outside every vault. It says how many the view holds (`~/code holds 3 repositories`), and lists them by what needs
attention:

1. a worktree with uncommitted files: an agent's work to review
2. uncommitted files
3. commits to push or to pull
4. clean

A worktree is listed under its repository, as one. In a folder of home, the repositories elsewhere in home are folded
and counted under **More in home**.

Each says its state at its end: its uncommitted files (`✎3`), ahead of its upstream and behind it, or `clean`. git is
asked only about the rows on screen, in the background, and again when you open the panel.

- `enter`, or a click, opens a repository up in place: its checkouts, the main one `●` and each worktree `⎇` by its
  branch, and their uncommitted files. A file shows its diff against its last commit.
- `o` goes into a repository, or into the checkout selected, a vault of its own. `ctrl+o` comes back.

slipbox looks for repositories three folders down from the view, not in hidden folders, nor in busy ones such as
`node_modules`.

## Reviewing a branch

To see what a branch did, before a merge or a pull request, measure it against its base. slipbox compares from where
the branch left the base (the merge base), as a pull request's diff does. So what happened on the base since doesn't
show.

### The base of each branch

Each branch has a base of its own, so a branch made from `dev` isn't measured against `main`, every commit of `dev`'s
looking like its own. A branch's base is:

1. the branch slipbox made it from ([A new branch](#a-new-branch)), or the one you picked with Compare against…, kept
   in slipbox's state
2. else the nearest of `git.bases`: the one that leaves the branch fewest commits of its own. `git.base` is among them
   when you've set it. A branch listed there is measured only against those listed before it: with `["main", "dev"]`,
   `dev` against `main`, and `main`, the first, against none
3. else `main`, else `master`

`git.bases` is `["main"]` as it comes ([Configuration](configuration.md)). A vault's own configuration may set its
bases too. Each must be a branch's name, a tag's or a commit's. Any other value is left out, and slipbox says so.
The git panel shows each branch's base at
its row's end, as in `↑3 on dev`, and the panel's top shows this branch's. Compare against…, in a branch's menu (`.`
or a right click on it), picks another base, kept; or goes back to the one guessed.

The panel's diffs, This branch against main, `:changes`, `:diff` and Merge… all use it.

### The files a branch changed

The git panel's **This branch against main** lists the files this branch changed against its base, committed or not,
and the new ones. `enter`, or a click, shows one's diff; `esc` comes back. `:changes` lists the same in a window:

| Mark | The file is |
| --- | --- |
| `M` | modified |
| `+` | new |
| `D` | deleted |
| `R` | renamed, its old path after it |
| `!` | in conflict |

`enter` on one shows its diff. `esc` there comes back to the list.

On the base branch itself, the list is what you haven't committed yet.

In a repository where the vault is a folder inside it, files outside that folder are left out.

Another branch's files, opened up in Branches, are what its commits changed against its base; a worktree's uncommitted
ones are listed apart.

### A file's diff

`:diff`, or Its diff against main in the git panel's This file, shows the diff of the file on screen against the base.
It uses the file as it is now, unsaved changes included.

It's drawn as the next section says.

### How a diff is drawn

Every diff slipbox shows is drawn the same way: `:diff`, a file's diff from the git panel or `:changes`, a commit's
diff to now from a file's history, and the differences the conflict prompt shows ([Editing](editing.md)). It opens in
a floating window as wide as the screen allows. A note's diff opens as its blocks before and after. A code file's
opens as its lines, side by side when the window is wide enough.

Line endings and a byte order mark are not compared, as git doesn't compare them in a checkout that turns LF into CRLF
(`eol=crlf` in `.gitattributes`, or `core.autocrlf`): a file's diff shows the lines that changed, not every line. When
only the line endings, the byte order mark or the final line break changed, slipbox says which instead of opening the
diff: `only the line endings (CRLF → LF) changed: no line to show`.

A big file reformatted or rewritten whole opens at once too. Past a certain cost slipbox stops looking for the smallest
diff and shows a coarser one, still correct, as git does.

#### A note's diff: before and after

An agent often rewrites prose a sentence at a time. Shown as lines, a changed paragraph is all removed and all added.
So a note's diff shows each changed block twice, as it was and as it is now:

```text
@@ ## Retry  (line 17)
┌ before ───────────────────────────────────────┐
│ …up to a minute. Until the retry budget of    │
│ ADR 4 is on, an op is retried forever.        │
└───────────────────────────────────────────────┘
┌ after ────────────────────────────────────────┐
│ …up to a minute. Each op has a retry budget   │
│ of five attempts; the sixth failure parks it. │
└───────────────────────────────────────────────┘
▸ 14 unchanged lines
```

- A block is a paragraph, a heading, a list item, a table's row, a quote, a code block or the frontmatter.
- The `before` frame marks the words that went, on a red tint. The `after` frame marks the words that came, on a
  green one. A paragraph whose line breaks moved is not changed by that: only its words are compared.
- The blocks are lightly formatted. A heading is in its colour, emphasis and links read as they do in a note, a list
  item has its bullet, a table's row shows its cells between `│`. A code block and the frontmatter are as written.
- What the formatting hides still shows as changed. A link whose target changed is marked whole, and so is text made
  bold.
- A block added or removed whole has one frame, `added` or `removed`, its text on the tint.
- Each group of changes is under `@@`, with the heading it's under and its line. The unchanged lines between groups
  fold to one row that says how many there are. `enter` on it shows them.
- A changed block less than half like any other is shown removed, then added, with no words marked. A note rewritten
  whole shows its blocks removed and added; slipbox compares by word only the blocks whose words could make them alike.

`tab` switches to the diff's lines, drawn as the next section says, and back. It does in a review's changes and on the
merge screen too. `git.diff = "source"` opens a note's diff as its lines ([Configuration](configuration.md)).

#### A diff's lines

- Each line is a row, `-` before a removed line and `+` before an added one. Its text is highlighted as in source
  mode: a note's Markdown, or code by its file's language.
- A removed or added line sits on a tint of red or green.
- A changed line keeps its unchanged words plain and marks the words that changed on a stronger tint. slipbox pairs
  each removed line with the added line most like it and compares the two word by word. A line less than half like
  any other is only removed, or only added, with no words marked.
- Each group of changes is under `@@ line N`, with up to three unchanged lines around it.
- The unchanged lines between groups, and before and after them, fold to one row that says how many there are:
  `▸ 12 unchanged lines`. `enter` on it opens it.
- A line too long for the window is never cut. The rows scroll sideways, as a [code block](reading.md#code-blocks)
  too wide does: move the cursor along the line (`$`, `0`, `w`), or use a sideways wheel or the wheel with `shift`
  held. A `‹` or `›` at an edge says the line goes on that way. With `render.code_wrap = "wrap"` the long lines wrap
  instead, and with wrapping off the whole window scrolls sideways.

#### Side by side

A code file's diff shows its two versions side by side when the window gives each side at least 80 columns: about 170
columns of terminal. The version before is on the left and the one now on the right.

- Each line sits beside the line it became. A changed line is beside the line most like it, its changed words marked
  on both sides. A line removed or added sits beside a blank.
- The unchanged lines are on both sides, and fold as they do in one column.
- Both sides scroll sideways together, by the cursor, the wheel or the scrollbar. Each shows its own `‹` and `›`. With
  `render.code_wrap = "wrap"` each side wraps in its own column.

`git.diff_layout` chooses: `auto` (side by side where it fits), `unified` (always one column) or `split` (always side
by side). A note's diff is never side by side.

#### Going to a line

`enter` on a line goes to it in the file. On a block before a change, it goes to where the block is now. `esc` or `q`
closes the diff, and goes back to the panel, the list or the question it came from. The conflict prompt's diff goes
back to the prompt on `enter` too.

In the terminal's theme and without colour, the changed words are bold and underlined instead of tinted.
`[colors]` sets the tints: `diff_add` and `diff_del` for the lines, `diff_add_word` and `diff_del_word` for the words
([Configuration](configuration.md)).

### Another base

`git.base` takes any branch or commit, so you can measure changes since a commit too. On the command line, `--base`
does the same for one command; the command line uses `git.base`, else `main` or `master`, for every branch.

## Reviewing a merge

git cleanly merges two branches that change different files. It does so even when one branch moves a note and the
other adds a link to it. The merge leaves that link broken, and git can't see it.

The merge review can. It asks git for the merge's result, without touching your files or your branch. Then it checks
every link in that result.

1. In the git panel, choose Merge… on a branch, and The links it would break: that branch into its base. Or run
   `:merge-review`, which asks which merge you mean: this branch into its base, or another branch into this one. A
   branch's base is the one the git panel measures it against ([The base of each branch](#the-base-of-each-branch)).
2. The review lists each link the merge would break, by note and line. Each shows what broke it and, where there is
   one, the fix. Each link is yellow when there's a fix, and red when there isn't.
3. Press `enter` to go to a link. A note only the other branch has is said to come with it.

`esc` goes back to the choice of merges. Merge…'s Merge it then merges, where the base is checked out
([Branches](#branches)).

When nothing would break, a message says so. Either way, the files git couldn't merge are counted.

Each broken link has a cause:

| Cause | What happened |
| --- | --- |
| **moved** | A branch moved the file it points to. The fix is the new path, written as the link writes paths |
| **deleted** | A branch deleted the file, or moved it out of the vault |
| **note-moved** | The note itself moved, and its relative link no longer reaches from where it is now |
| **missing** | Neither branch has the file. The link was already broken on the branch being merged |

Links already broken on the branch you merge into aren't listed.

The review checks:

- Markdown links' paths
- wikilinks, by name or path
- links to this repository's own hosting
- pointers to this folder

[Links and vaults](links-and-vaults.md) explains each. A link to another repository or another folder isn't the merge's
to check.

Only committed work is reviewed, since what isn't committed is in neither branch.

The review needs git 2.38 or later. It refuses two branches with no commit in common, as git refuses to merge them.

For example, a branch `fix/retry` moves `docs/plan.md` into `docs/design/`. Meanwhile, `main` added a link to it in
`README.md`. The review of merging `fix/retry` into `main` says:

```text
merging fix/retry into main: 1 link would break
  README.md:12:3  docs/plan.md — fix/retry moves docs/plan.md to docs/design/plan.md — the fix: docs/design/plan.md
```

## After a merge or a pull

When the branch you're on moves on, through a merge, a pull or a commit, your tabs stay as they were. It isn't a switch.

If git moved files between the old commit and the new one, slipbox takes those moves as evidence. It says so:

`branch main moved on: git moved 2 files`

Each link broken by one of those moves then says where its file went. It says so in the Problems panel (`space v p`),
and when you follow the link.

- `space l r` rewrites a note's broken links to where their files are now.
- `slipbox relink` does it for every note.

[Links and vaults](links-and-vaults.md#repairs) covers relinking.

Two things it can't repair:

- A file moved and much rewritten in one commit. git pairs a move by how similar the file is before and after, so it
  may not pair this one. Its links are just broken, and the target is yours to pick.
- A note that moved without its own relative links. Those are broken too. The merge review is where they show, before
  you merge.

A branch is only ever compared with itself. Switching branches is no evidence of anything moving.

## From the command line

The review of a branch and a merge has command-line equivalents, for agents and scripts. Each takes `--json`.
[The command line](cli.md) has their output in full. `slipbox merge-review` merges into `--into`, or the branch
checked out, not into a branch's own base as `:merge-review` does.

```bash
slipbox changed                     # what this branch changed against the base, committed or not
slipbox changed --base HEAD~3       # …since a commit, or against another branch
slipbox diff README.md              # a note's diff against the base, with three lines of context
slipbox worktrees                   # the checkouts: the main one first, then each worktree by branch
slipbox merge-review fix/retry      # the links merging fix/retry into this branch would break
slipbox merge-review fix/retry --into main
slipbox problems                    # the vault's link problems; during a merge, its conflicts too
```

`slipbox changed` prints one line for each file, as `:changes` lists them:

```text
M README.md
+ src/retry.ts
R docs/design/plan.md  (from docs/plan.md)
```

These commands exit with code 3:

- outside a git repository
- with no base branch
- with a branch or commit that isn't there

The rest has no command: the gutter, source control, commits, blame, history, branches, the remote and stashes, the
review, the merge screen, merging and rebasing. An agent runs git itself for those.
