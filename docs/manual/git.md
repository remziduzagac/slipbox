# Git

This chapter covers what slipbox does when the folder you open is a git repository. The command line's git commands
come at the end.

slipbox shows what git knows about the repository:

- which files changed
- which lines of the file on screen changed
- who last changed a line
- what a file looked like before

You can stage, commit, switch branches and move between worktrees without leaving slipbox. You can also review a branch
before you merge it, including the links a merge would break.

slipbox runs the `git` on your `PATH`. Without it, none of this shows.

slipbox never fetches, pulls, pushes, merges, rebases or stashes. You run git yourself for those, and slipbox follows
what it did. [Privacy](privacy.md) has the few cases where git itself reaches a remote.

## Git in slipbox

A git repository is a vault by itself. Open any file in it, and slipbox opens the repository from its top folder.
[Links and vaults](links-and-vaults.md) explains vaults.

The status line shows the vault and the branch checked out. For example, it shows `app · main` for a repository named
`app` by its remote. A worktree of a named folder shows as its name and branch, as in `app@fix/retry`.

The examples in this chapter use that repository, `~/code/app`, as [Code](code.md) does.

The explorer marks each changed file at the end of its row:

| Mark | The file is |
| --- | --- |
| `M` | modified |
| `+` | new: untracked, or added |
| `R` | renamed |
| `!` | in conflict, during a merge |

A folder with a changed file somewhere inside it shows `•`.

slipbox asks git in the background, a moment after anything changes. That can be a save, a file an agent wrote, or a
branch switch.

Everything else is under `space g`:

| Keys | What it does |
| --- | --- |
| `space g s` | Opens source control: the changed files, to stage, discard and commit |
| `] c` / `[ c` | Goes to the next / previous changed line in this file |
| `space g p` | Shows the change on the cursor's line, as a diff |
| `space g r` | Undoes the change on the cursor's line |
| `space g b` | Shows who last changed the cursor's line |
| `space g h` | Shows this file's history |
| `space g o` | Lists the branches, to switch to one or make one |
| `space g w` | Lists the worktrees, to open this note in another |
| `space g c` | Shows what this branch changed against the base branch (`:changes`) |
| `space g d` | Shows this file's diff against the base branch (`:diff`) |
| `space g m` | Shows the links a merge would break (`:merge-review`) |

[Keys](keys.md) has every key. You can change these like any other.

## What slipbox runs

slipbox reads status, diffs, blame and history from git. It runs git to stage, unstage, discard, commit and switch
branches.

What else git runs depends on whether you trust the vault. A repository you cloned can name programs for git to run.
slipbox lets them run only in a vault you trust. [Code](code.md#trust) explains trust.

In a vault you don't trust, git runs nothing of the repository's own:

- No hooks. A commit runs none, and isn't signed, since the repository's config could name the program that signs.
- No `core.fsmonitor` command.
- No filter, diff driver or merge driver named in its attributes. This needs git 2.42 or later. With an older git, a
  repository's filters can still run, and `slipbox doctor` warns of it.
- No text conversion or external diff program in a diff.
- Reading the status writes nothing to the index.

Blame always reads the last commit, never the files as they are now. Blaming those could run a filter.

In a vault you trust, git runs as the repository has it, with its hooks, its signing and its filters.

A repository that keeps large files with Git LFS can show those files as changed until you trust it. That's because
their filter doesn't run.

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
| `space g p` | Shows the change on the cursor's line as a diff, in a floating window |
| `space g r` | Undoes that change: the lines as staged are put back |

The diff from `space g p` shows the change's lines as staged, then as they are now.

`space g r` is one undo step, so `u` brings your lines back. It leaves the file unsaved.

`git.signs = false` turns the signs off ([Configuration](configuration.md)).

## Source control

Press `space g s`, or click `±` on the left rail. Source control opens in the left panel. It lists the checkout's
changed files under their sections:

- **Conflicts**: files a merge left unmerged.
- **Staged**: what the next commit takes.
- **Changes**: changed, not staged yet.
- **Untracked**: new files git doesn't track yet.

Each file shows its state letter, coloured. After its name comes its folder, dimmed. The letters are:

| Letter | The file is |
| --- | --- |
| `M` | modified |
| `A` | added |
| `D` | deleted |
| `R` | renamed |
| `U` | in conflict |
| `?` | untracked |

A file can be in Staged and in Changes at once, when part of it is staged.

Source control takes the explorer's keys, read its own way:

| Key | What it does |
| --- | --- |
| `j` / `k` | Moves through the files and changes |
| `l` / `h` | Opens a file up into its changes / folds it again |
| `s` | Stages the file, or just the change selected. On a conflict, it marks the file resolved |
| `u` | Unstages the file, or just the change selected |
| `d` | Discards what isn't staged: the file's changes, or the one change. It asks first |
| `a` | Stages everything, untracked files too |
| `shift+u` | Unstages everything |
| `.` | Shows the file's diff, or the change's, in a floating window |
| `enter` | Opens the file at the change |
| `c` / `shift+c` | Commits what's staged / amends the last commit |
| `/` | Filters the files by path |
| `q` / `esc` | Closes source control / goes back to the note, leaving it open |

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

1. In source control, press `c`. A floating editor opens for the commit message, and you type on its first line.
   Lines starting with `#` say what's staged. They're left out of the message.
2. Write the message, then press `ctrl+s` (or `:w`) to commit. The commit runs in the background, as a hook can take a
   while. When it's done, a message says its short hash and subject.

`esc` or `q` leaves the editor and commits nothing.

If the message is empty, or a hook refuses, slipbox says so in git's words. The editor stays open.

`shift+c` amends the last commit with what's staged. The last commit's message is there to start from.

"Commit" and "Amend the last commit" are in the palette (`:`) too, for when source control isn't open. With nothing
staged, a commit says so.

In a vault you don't trust, the commit's hooks don't run, and it isn't signed. The editor's first lines and a message
say so.

## Merge conflicts

While a merge has conflicts, the files git couldn't merge show in several places:

- The explorer marks them `!`.
- Source control lists them under Conflicts.
- The Problems panel's All tab (`space v p`) lists them under Conflicts, each at its first `<<<<<<<` line.
- In a note, each conflict is an error among the note's problems: "a merge conflict: both sides are still here".

To mark a conflict resolved:

1. Resolve the conflict in the file, and save it.
2. In source control, press `s` on the file. It's marked resolved.

[Code](code.md#problems) covers the Problems panel.

## Who changed a line

`space g b` shows who last changed the cursor's line, in a floating window. The window shows the commit's:

- short hash
- author
- day
- whole message

It reads the last commit. So a line you've changed since says it isn't committed yet. A file that isn't in the last
commit has no one to name.

`esc` or `q` closes the window.

## A file's history

`space g h` lists the commits that changed the file on screen, newest first. Each has its author and day.

The list follows the file back through renames. A commit from before a rename says the path the file had then.

`enter` on a commit offers two things:

- **Read it as it was**: the file at that commit, read-only, in a floating window. A note is rendered.
- **Its diff to the text now**: each line removed or added since, drawn as [a diff](#how-a-diff-is-drawn). `enter`
  on a line goes there.

## Branches

`space g o` lists the local branches. The one checked out is marked `here`.

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

A worktree, made with `git worktree add`, is a vault of its own. It has its own tabs, positions and scratch.
[Links and vaults](links-and-vaults.md#worktrees) has the rest.

Worktrees suit giving an agent a branch of its own to work on.

`space g w` lists the repository's checkouts by branch:

- The main one comes first.
- The one you're in is marked `●`.
- A detached one shows by its short commit.

`enter` switches to that checkout. You land at the same note when it's there, else at its top folder.

## Reviewing a branch

To see what a branch did, before a merge or a pull request, measure it against the base branch. The base branch is:

- `git.base`, when you've set it ([Configuration](configuration.md))
- else `main`
- else `master`

slipbox compares from where the branch left the base (the merge base), as a pull request's diff does. So what happened
on the base since doesn't show.

### The files a branch changed

`space g c` (`:changes`) lists the files this branch changed, committed or not, and the new ones:

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

### A file's diff

`space g d` (`:diff`) shows the diff of the file on screen against the base. It uses the file as it is now, unsaved
changes included.

It's drawn as the next section says.

### How a diff is drawn

Every diff slipbox shows is drawn the same way: `space g d`, a file's diff from `space g c`, a commit's diff to now
from `space g h`, and the differences the conflict prompt shows ([Editing](editing.md)). It opens in a floating window
as wide as the screen allows.

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

`enter` on a line goes to it in the file. `esc` or `q` closes the diff, and goes back to the list or the question it
came from. The conflict prompt's diff goes back to the prompt on `enter` too.

In the terminal's theme and without colour, the changed words are bold and underlined instead of tinted.
`[colors]` sets the tints: `diff_add` and `diff_del` for the lines, `diff_add_word` and `diff_del_word` for the words
([Configuration](configuration.md)).

### Another base

`git.base` takes any branch or commit, so you can measure changes since a commit too. On the command line, `--base`
does the same for one command.

## Reviewing a merge

git cleanly merges two branches that change different files. It does so even when one branch moves a note and the
other adds a link to it. The merge leaves that link broken, and git can't see it.

The merge review can. It asks git for the merge's result, without touching your files or your branch. Then it checks
every link in that result.

1. Press `space g m` (`:merge-review`). It asks which merge you mean: this branch into the base, or another branch
   into this one.
2. Pick the merge. The review lists each link the merge would break, by note and line. Each shows what broke it and,
   where there is one, the fix. Each link is yellow when there's a fix, and red when there isn't.
3. Press `enter` to go to a link. A note only the other branch has is said to come with it.

`esc` goes back to the choice of merges.

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
[The command line](cli.md) has their output in full.

```bash
slipbox changed                     # what this branch changed against the base, committed or not
slipbox changed --base HEAD~3       # …since a commit, or against another branch
slipbox diff README.md              # a note's diff against the base, with three lines of context
slipbox worktrees                   # the checkouts: the main one first, then each worktree by branch
slipbox merge-review fix/retry      # the links merging fix/retry into this branch would break
slipbox merge-review fix/retry --into main
slipbox problems                    # the vault's link problems; during a merge, its conflicts too
```

`slipbox changed` prints one line for each file, as `space g c` lists them:

```text
M README.md
+ src/retry.ts
R docs/design/plan.md  (from docs/plan.md)
```

These commands exit with code 3:

- outside a git repository
- with no base branch
- with a branch or commit that isn't there

The rest has no command: the gutter, source control, commits, blame, history and branches. An agent runs git itself
for those.
