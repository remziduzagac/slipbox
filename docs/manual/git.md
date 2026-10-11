# Git

When the folder you open is a git repository, slipbox shows what git knows about it: which files changed, which lines
of the file on screen changed, who last changed a line and what a file looked like before. You can stage, commit,
switch branches and move between worktrees without leaving it, and review a branch before you merge it, including the
links a merge would break. This chapter covers all of that, and the command line's git commands at the end.

slipbox runs the `git` on your `PATH`; without it, none of this shows. It never fetches, pulls, pushes, merges, rebases
or stashes: you run git yourself for those, and slipbox follows what it did ([Privacy](privacy.md) has the few cases
where git itself reaches a remote).

## Git in slipbox

A git repository is a root by itself: open any file in it and slipbox opens the repository from its top folder
([Links and roots](links-and-roots.md) explains roots). The status line shows the root and the branch checked out,
as in `app · main` for a repository named `app` by its remote; a worktree of a named folder shows as its name and
branch, as in `app@fix/retry`. The examples in this chapter use that repository, `~/code/app`, as
[Code](code.md) does.

The explorer marks each changed file at the end of its row:

| Mark | The file is |
| --- | --- |
| `M` | modified |
| `+` | new: untracked, or added |
| `R` | renamed |
| `!` | in conflict, during a merge |

A folder with a changed file somewhere inside it shows `•`. git is asked in the background, a moment after anything
changes: a save, a file an agent wrote, a branch switch.

Everything else is under `space g`:

| Keys | What it does |
| --- | --- |
| `space g s` | source control: the changed files, to stage, discard and commit |
| `] c` / `[ c` | the next / previous changed line in this file |
| `space g p` | the change on the cursor's line, as a diff |
| `space g r` | undo the change on the cursor's line |
| `space g b` | who last changed the cursor's line |
| `space g h` | this file's history |
| `space g o` | the branches: switch to one, or make one |
| `space g w` | the worktrees: open this note in another |
| `space g c` | what this branch changed against the base branch (`:changes`) |
| `space g d` | this file's diff against the base branch (`:diff`) |
| `space g m` | the links a merge would break (`:merge-review`) |

[Keys](keys.md) has every key; these can be changed like any other.

## What slipbox runs

slipbox reads status, diffs, blame and history from git, and runs it to stage, unstage, discard, commit and switch
branches. What else git runs depends on whether you trust the root, as [Code](code.md#trust) explains: a repository
you cloned can name programs for git to run, and slipbox lets them run only in a root you trust.

In a root you don't trust, git runs nothing of the repository's own:

- no hooks: a commit runs none, and isn't signed (the repository's config could name the program that signs);
- no `core.fsmonitor` command;
- no filter, diff driver or merge driver named in its attributes (with git 2.42 or later; with an older git a
  repository's filters can still run, and `slipbox doctor` warns of it);
- no text conversion or external diff program in a diff;
- reading the status writes nothing to the index.

Blame always reads the last commit, never the files as they are now: blaming those could run a filter.

In a root you trust, git runs as the repository has it: its hooks, its signing, its filters. A repository that keeps
large files with Git LFS can show those files as changed until you trust it, since their filter doesn't run.

## Changed lines in the gutter

As you read or edit a file, the lines that differ from what's staged are marked in the gutter's last column, just
before the text. The comparison uses the text as it is now, unsaved typing included:

| Sign | Colour, in most themes | Means |
| --- | --- | --- |
| `▎` | green | lines added |
| `▎` | yellow | lines changed |
| `▁` | red | lines deleted below this line |
| `▔` | red | lines deleted above the first line |

With ASCII glyphs the signs are `+`, `~`, `_` and `-` ([Reading](reading.md) covers glyph sets). A file git doesn't
track yet has every line added; a file git ignores has no signs. Line endings don't count, so a checkout that turns LF
into CRLF changes nothing. In the rendered view a row drawn from several lines shows the strongest of their signs.

When there's no gutter (line numbers off, and no problems bar), a file that has had a change gets a column of its
own and keeps it while open, so the text doesn't move as changes come and go.

- `] c` and `[ c` go to the next and previous change, going round at the file's ends.
- `space g p` shows the change on the cursor's line as a diff in a floating window: its lines as staged, then as
  they are now.
- `space g r` undoes it: the lines as staged are put back. It's one undo step (`u` brings your lines back) and leaves
  the file unsaved.

`git.signs = false` turns the signs off ([Configuration](configuration.md)).

## Source control

`space g s`, or a click on `±` on the left rail, opens source control in the left panel: the checkout's changed files
under their sections.

- **Conflicts**: files a merge left unmerged.
- **Staged**: what the next commit takes.
- **Changes**: changed, not staged yet.
- **Untracked**: new files git doesn't track yet.

Each file has its state letter, coloured (`M` modified, `A` added, `D` deleted, `R` renamed, `U` in conflict, `?`
untracked), and its folder dimmed after its name. A file can be in Staged and in Changes at once, when part of it is
staged.

Source control takes the explorer's keys, read its own way:

| Key | What it does |
| --- | --- |
| `j` / `k` | move through the files and changes |
| `l` / `h` | open a file up into its changes / fold it again |
| `s` | stage the file, or just the change selected; on a conflict, mark it resolved |
| `u` | unstage the file, or just the change selected |
| `d` | discard what isn't staged: the file's changes, or the one change (asks first) |
| `a` | stage everything, untracked files too |
| `shift+u` | unstage everything |
| `.` | the file's diff, or the change's, in a floating window |
| `enter` | open the file at the change |
| `c` / `shift+c` | commit what's staged / amend the last commit |
| `/` | filter the files by path |
| `q` / `esc` | close source control / go back to the note, leaving it open |

A staged file opens up into its changes against the last commit; a changed one, into its changes against what's
staged, as the file is on disk.

Staging one change works as `git add -p` does: the index gets that change and nothing else, so other changes in the
file, staged or not, stay as they were. Discarding asks first: a file goes back to what's staged; a single change has
its lines put back as staged, and the file is saved; an untracked file goes to slipbox's trash, where you can get it
back ([Files](files.md) has the trash). A file with unsaved changes in slipbox isn't discarded, since git works
on the file on disk: save it first.

When git refuses something, slipbox says why in git's own words.

## Committing

`c` in source control opens a floating editor for the commit message, typing on its first line. Lines starting with
`#` say what's staged and are left out of the message. `ctrl+s` (or `:w`) commits; `esc` or `q` leaves the editor and
commits nothing. The commit runs in the background, as a hook can take a while, and a message says its short hash and
subject when it's done. An empty message, or a hook that refuses, is said in git's words and the editor stays open.

`shift+c` amends the last commit with what's staged, its message there to start from.

"Commit" and "Amend the last commit" are in the palette (`:`) too, for when source control isn't open. With nothing
staged, a commit says so.

In a root you don't trust, the commit's hooks don't run and it isn't signed; the editor's first lines and a message
say so.

## Merge conflicts

While a merge has conflicts, the files git couldn't merge show in several places:

- the explorer marks them `!`;
- source control lists them under Conflicts;
- the Problems panel's All tab (`space v p`) lists them under Conflicts, each at its first `<<<<<<<` line;
- in a note, each conflict is an error among the note's problems: "a merge conflict: both sides are still here".

Resolve a conflict in the file, save it, then `s` on it in source control marks it resolved. [Code](code.md#problems)
covers the Problems panel.

## Who changed a line

`space g b` shows who last changed the cursor's line, in a floating window: the commit's short hash, its author, its
day and its whole message. It reads the last commit, so a line you've changed since says it isn't committed yet, and a
file that isn't in the last commit has no one to name. `esc` or `q` closes the window.

## A file's history

`space g h` lists the commits that changed the file on screen, newest first, each with its author and day. It follows
the file back through renames: a commit from before one says the path the file had then.

`enter` on a commit offers two things:

- **Read it as it was**: the file at that commit, read-only, in a floating window; a note is rendered.
- **Its diff to the text now**: each line removed or added since, as a list; `enter` on a line goes there.

## Branches

`space g o` lists the local branches, the one checked out marked `here`. `enter` on another checks it out. The last
entry, "A new branch from here…", asks for a name and makes the branch where you are, then switches to it; a name git
won't take is said.

If a note has unsaved changes, slipbox asks first:

- save them, then switch;
- switch and keep them unsaved: a file the switch changes then becomes a conflict to settle when you save
  ([Editing](editing.md) covers a file changed on disk while you edit it);
- cancel.

If git refuses the switch, because it would overwrite a change of yours, slipbox says why in git's words.

However a branch is switched, here or in a terminal, slipbox takes it as one change rather than a storm of files
coming and going, and says `switched to branch …`. Notes only one branch has come and go; they aren't taken for moves.
Each branch keeps its own tabs: the ones you had open on a branch come back when you switch to it, as long as
`ui.restore_session` is on ([Configuration](configuration.md)) and nothing is unsaved (unsaved notes stay open, and a
message says so).

## Worktrees

A worktree, made with `git worktree add`, is a root of its own, with its own tabs, positions and scratch
([Links and roots](links-and-roots.md#worktrees) has the rest). Worktrees suit giving an agent a branch of its own to
work on.

`space g w` lists the repository's checkouts by branch: the main one first, the one you're in marked `●`, a detached
one by its short commit. `enter` switches to that checkout, at the same note when it's there, else at its root.

## Reviewing a branch

To see what a branch did, before a merge or a pull request, measure it against the base branch: `git.base` when you've
set it ([Configuration](configuration.md)), else `main`, else `master`. slipbox compares from where the branch left
the base (the merge base), as a pull request's diff does, so what happened on the base since doesn't show.

`space g c` (`:changes`) lists the files this branch changed, committed or not, and the new ones:

| Mark | The file is |
| --- | --- |
| `M` | modified |
| `+` | new |
| `D` | deleted |
| `R` | renamed, its old path after it |
| `!` | in conflict |

`enter` on one shows its diff; `esc` there comes back to the list. On the base branch itself, the list is what you
haven't committed yet. In a repository where the root is a folder inside it, files outside that folder are left out.

`space g d` (`:diff`) shows the diff of the file on screen against the base, as it is now, unsaved changes included:
each group of changes under `@@ line N`, removed lines red, added green. `enter` on a line goes to it in the file.

`git.base` takes any branch or commit, so you can measure changes since a commit too; on the command line, `--base`
does the same for one command.

## Reviewing a merge

git merges cleanly two branches that change different files, even when one branch moves a note and the other adds a
link to it. The merge leaves that link broken, and git can't see it. The merge review can: it asks git for the merge's
result without touching your files or your branch, and checks every link in it.

`space g m` (`:merge-review`) asks which merge you mean: this branch into the base, or another branch into this one.
Then it lists each link the merge would break, by note and line, with what broke it and, where there is one, the fix:
yellow when there's a fix, red when there isn't. `enter` goes to the link; a note only the other branch has is said to
come with it. `esc` goes back to the choice of merges. When nothing would break, a message says so. Either way, the
files git couldn't merge are counted.

Each broken link has a cause:

- **moved**: a branch moved the file it points to; the fix is the new path, written as the link writes paths.
- **deleted**: a branch deleted the file, or moved it out of the root.
- **note-moved**: the note itself moved, and its relative link no longer reaches from where it is now.
- **missing**: neither branch has the file: the link was already broken on the branch being merged.

Links already broken on the branch you merge into aren't listed. The review checks Markdown links' paths, wikilinks by
name or path, links to this repository's own hosting, and pointers to this folder ([Links and
roots](links-and-roots.md) explains each); a link to another repository or another folder isn't the merge's to check.

Only committed work is reviewed, since what isn't committed is in neither branch. The review needs git 2.38 or later,
and refuses two branches with no commit in common, as git refuses to merge them.

For example, if a branch `fix/retry` moves `docs/plan.md` into `docs/design/`, while `main` added a link to it in
`README.md`, the review of merging `fix/retry` into `main` says:

```text
merging fix/retry into main: 1 link would break
  README.md:12:3  docs/plan.md — fix/retry moves docs/plan.md to docs/design/plan.md — the fix: docs/design/plan.md
```

## After a merge or a pull

When the branch you're on moves on (a merge, a pull, a commit), your tabs stay as they were: it isn't a switch. If git
moved files between the old commit and the new one, slipbox takes those moves as evidence and says so: `branch main
moved on: git moved 2 files`. Each link broken by one of those moves then says where its file went, in the Problems
panel (`space v p`) and when you follow it, and `space l r` rewrites a note's broken links to where their files are
now; `slipbox relink` does it for every note ([Links and roots](links-and-roots.md#repairs) covers relinking).

Two things it can't repair:

- git pairs a move by how similar the file is before and after, so a file moved and much rewritten in one commit may
  not be paired; its links are just broken, and the target is yours to pick;
- a note that moved without its own relative links: those are broken too, and the merge review is where they show,
  before you merge.

A branch is only ever compared with itself: switching branches is no evidence of anything moving.

## From the command line

The review of a branch and a merge has command-line equivalents, for agents and scripts. Each takes `--json`, and
[The command line](cli.md) has their output in full.

```bash
slipbox changed                     # what this branch changed against the base, committed or not
slipbox changed --base HEAD~3       # …since a commit, or against another branch
slipbox diff README.md              # a note's diff against the base, with three lines of context
slipbox worktrees                   # the checkouts: the main one first, then each worktree by branch
slipbox merge-review fix/retry      # the links merging fix/retry into this branch would break
slipbox merge-review fix/retry --into main
slipbox problems                    # the root's link problems; during a merge, its conflicts too
```

`slipbox changed` prints a line a file, as `space g c` lists them:

```text
M README.md
+ src/retry.ts
R docs/design/plan.md  (from docs/plan.md)
```

Outside a git repository, with no base branch, or with a branch or commit that isn't there, these exit with code 3.

The rest (the gutter, source control, commits, blame, history, branches) has no command: an agent runs git itself.
