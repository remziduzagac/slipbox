# Code and git

slipbox opens a repository the way it opens a folder of notes, and reads its code like a document: each function and
class a cell, its documentation drawn as prose. Language servers find what's wrong, git's changes show beside the
lines, and before you merge a branch (yours or an agent's), slipbox tells you which links the merge would break.

This guide opens a repository, reads and checks its code, commits a change, and reviews a branch before merging it.

## Open the repository

```bash
slipbox ~/code/app
```

A git repository is a root of its own: slipbox opens it from its top folder, whichever file or subfolder inside it you
name, and writes nothing into it. The explorer (`space e`) lists every text file in it, code included (in a repository
holding a `.slipbox/` folder, its notes and data files: `a` there shows the rest). The status line shows the
repository's name, from its remote (else its path), and the branch: `app · main`.

## Read a code file

Open a code file from the explorer (`enter`) or the switcher (`ctrl+p`). It opens in the code view: each function,
class, method or type is a cell, its header saying what it is and its name (`function: resolve`), its doc comment
drawn as prose above its code. The code itself is exactly as written; comments between definitions read as prose, and
the imports are folded into one row (`enter` on it unfolds them).

![A TypeScript file in the code view: its doc comment as prose, the imports folded, each definition a cell](../images/code-and-git-code-view.png)

- `z a` folds the cell at the cursor to its header, and opens it again.
- `space o` lists the file's definitions in the outline.
- `space n v` (or `ctrl+k`) shows the file as written, highlighted; press it again for the cells.
- A cell header's buttons are keys too: `space k y` copies the cell, `space k r` lists where its definition is used,
  `space k s` adds it to the scratch for an agent ([Working with agents](agents.md)).

The code view covers TypeScript, TSX, JavaScript, Python, Go, Rust, Swift, PHP, Ruby, C, C++, Lua and Bash; other
files open as written. `render.code = "source"` opens every code file as written
([Configuration](../manual/configuration.md)).

## Trust the folder, or not

A repository's own tools can run code it holds: its own copy of TypeScript, an ESLint config that is a program, git
hooks and filters. slipbox runs none of them until you say you trust the folder. The first time it matters, when a
file's language servers would otherwise leave something out, it asks:

```text
Trust ~/code/app? Its own tools would run code it holds — eslint not run (its config is code). Only a folder
you know (y trusts it; n keeps it safe)
```

- `y` trusts it: its servers start again and run as they would anywhere, and git runs as the repository has it.
- `n` (or `esc`) keeps it safe: servers run in their safe modes, and git runs no hooks or filters of the repository's.

slipbox remembers the answer, in its own state, never in the folder. `:trust` and `:untrust` change it later, and
`trust.roots` in your config trusts folders ahead of time (`~/code/*`). The command line never asks and can't trust a
folder, so an agent can't be talked into it. [Code](../manual/code.md) says what each answer allows.

## Language servers and `slipbox doctor`

Open a code file and slipbox starts its language servers: TypeScript's, pyright for Python, rust-analyzer, gopls and
the rest. One it can get from npm, it installs into its own folder the first time it's needed; a native one, such as
rust-analyzer, you install yourself. To see what's there:

```bash
cd ~/code/app
slipbox doctor                   # each language: its servers and linters, where each was found, or how to get it
slipbox doctor src/shelf.ts      # one file: the servers that would serve it here, and what trust leaves out
```

Each line names a server and where it was found (on your `PATH`, in the project, in your install folders), or
`not found: slipbox installs typescript@… when it's first needed`, or how to install it. `lsp.auto_install = false`
stops the installs. [Troubleshooting](../manual/troubleshooting.md) covers a server that isn't found.

## See the problems

What the servers, the linters and slipbox's own checks find shows where it is: a line's number takes the colour of its
worst problem, and the status line counts them.

- `space n q` opens the Problems panel on this file, a row per problem with its line. `j` and `k` move, the file
  following; `enter` goes there; `q` closes it.
- `space v p` opens its All tab: the whole root's broken links, lint and conflicts.
- `shift+k` shows what's under the cursor (its type, its documentation), `g d` goes to its definition, and `g r` lists
  where it's used.

An agent gets the same list with `slipbox diagnostics src/shelf.ts`.

## Your changes in the gutter

The lines you've changed since the last commit (against what's staged, unsaved typing included) are marked beside the
text: `▎` for lines added or changed, each in its colour, `▁` where lines were deleted.

- `] c` and `[ c` go to the next and previous change.
- `space g p` shows the change at the cursor as a diff, in a floating window.
- `space g r` undoes it: its lines put back as they were, one undo step, not yet saved.

## Commit

1. Press `space g s`. Source control opens in the left panel: the changed files under Conflicts, Staged, Changes and
   Untracked, each with its letter (`M`, `A`, `D`, `R`, `?`).
2. Move with `j` and `k`. `.` shows a file's diff; `l` opens it into its changes, each of which you can stage alone.
3. `s` stages the file or the change, `u` unstages it, and `a` stages everything. `d` discards what isn't staged,
   after asking.
4. `c` opens the commit message in a floating editor, what's staged listed in `#` lines (left out of the message).
   Write the message, then press `ctrl+s`: a message says `committed` with the commit's hash and subject.

![Source control in the left panel: a changed file opened into its change](../images/code-and-git-source-control.png)

`shift+c` amends the last commit instead. In a folder you haven't trusted, the commit runs no hooks and isn't signed,
and the editor says so. `space g o` lists the branches, to check one out or start a new one. slipbox doesn't push:
push with git.

## Review a branch before you merge it

The usual case: an agent works on a branch of its own, in a git worktree beside your checkout
(`git worktree add ../app-fix fix/retry`). Before you merge it:

![The merge review: the links a branch would break, each with its note, line and cause](../images/code-and-git-merge-review.png)

1. Press `space g w`. The repository's checkouts are listed by branch, yours marked `●`. Pick the agent's and press
   `enter`: slipbox goes into that checkout, at the note you were on if the branch has it.
2. Press `space g c`. You see the files the branch changed against `main`, committed or not: `M` modified, `+` new,
   `D` deleted, `R` renamed. `enter` on one shows its diff; `esc` comes back to the list.
3. Press `ctrl+o` to go back to your own checkout.
4. Press `space g m` and pick `fix/retry → main`. slipbox asks git what the merge would give, without touching your
   files, and lists each link it would break, by note and line, with the cause and the fix when there is one:
   `fix/retry moves docs/plan.md to docs/design/plan.md — the fix: design/plan.md`. `enter` goes to the link. When
   nothing breaks, a message says `merging fix/retry into main breaks no link`.

Then merge with git, as you always do. If git's renames broke links anyway, after a merge or a pull, each says where
its file went, in the Problems panel (`space v p`) and when you follow it; `space l r` rewrites a note's links to match.

The base is `main`, else `master`; `git.base` names another. The same review from the command line, for you or the
agent:

```bash
slipbox changed                   # in the branch's checkout: what it changed against main
slipbox diff docs/plan.md         # one file's changes on the branch
slipbox merge-review fix/retry    # in yours: the links merging it would break
```

## Where next

- [Code](../manual/code.md): the code view, every language server feature, linters, problems and trust.
- [Git](../manual/git.md): source control, blame, a file's history, branches, worktrees and the merge review.
- [Working with agents](agents.md): the scratch and the context bundle, for handing code to an agent.
