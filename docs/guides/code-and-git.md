# Code and git

slipbox opens a repository the way it opens a folder of notes. It reads the code like a document: each function and
class is a cell, with its documentation drawn as prose.

- Language servers find what's wrong.
- Beside the lines, you see git's changes.
- Before you merge a branch (yours or an agent's), slipbox tells you which links the merge would break.

This guide opens a repository, reads and checks its code, commits a change, and reviews a branch before merging it.

## Open the repository

```bash
slipbox ~/code/app
```

A git repository is a vault of its own. slipbox opens it from its top folder, whichever file or subfolder inside it you
name. It writes nothing into it.

The explorer (`space e`) lists every text file in it, code included. In a repository holding a `.slipbox/` folder, it
lists its notes and data files, and `a` there shows the rest.

The status line shows the repository's name and the branch: `app · main`. The name comes from its remote, or else from
its path.

## Read a code file

Open a code file from the explorer (`enter`) or the switcher (`ctrl+p`). It opens in the code view:

- Each function, class, method or type is a cell.
- A cell's header says what it is and its name (`function: resolve`).
- Its doc comment is drawn as prose above its code.
- The code itself is exactly as written.
- Comments between definitions read as prose.
- The imports are folded into one row. `enter` on it unfolds them.

![A TypeScript file in the code view: its doc comment as prose, the imports folded, each definition a cell](../images/code-and-git-code-view.png)

| Press | To |
| --- | --- |
| `z a` | Fold the cell at the cursor to its header, and open it again |
| `space o` | List the file's definitions in the outline |
| `space n v` (or `ctrl+k`) | Show the file as written, highlighted. Press it again for the cells |

A cell header's buttons are keys too:

| Press | To |
| --- | --- |
| `space k y` | Copy the cell |
| `space k r` | List where its definition is used |
| `space k s` | Add it to the scratch for an agent ([Working with agents](agents.md)) |

The code view covers TypeScript, TSX, JavaScript, Python, Go, Rust, Swift, PHP, Ruby, C, C++, Lua and Bash. Other
files open as written. `render.code = "source"` opens every code file as written
([Configuration](../manual/configuration.md)).

## Trust the folder, or not

A repository's own tools can run code it holds:

- its own copy of TypeScript
- an ESLint config that is a program
- git hooks and filters

slipbox runs none of them until you say you trust the folder. It asks the first time it matters, when a file's language
servers would otherwise leave something out:

```text
Trust ~/code/app? Its own tools would run code it holds — eslint not run (its config is code). Only a folder
you know (y trusts it; n keeps it safe)
```

- `y` trusts it. Its servers start again and run as they would anywhere, and git runs as the repository has it.
- `n` (or `esc`) keeps it safe. Servers run in their safe modes, and git runs none of the repository's hooks or
  filters.

slipbox remembers the answer in its own state, never in the folder. `:trust` and `:untrust` change it later.
`trust.roots` in your config trusts folders ahead of time, such as `~/code/*`.

The command line never asks, and it can't trust a folder. So an agent can't be talked into it.
[Code](../manual/code.md) says what each answer allows.

## Language servers and `slipbox doctor`

When you open a code file, slipbox starts its language servers: TypeScript's, pyright for Python, rust-analyzer, gopls
and the rest.

- slipbox installs a server it can get from npm into its own folder, the first time it's needed.
- You install a native one, such as rust-analyzer, yourself.

To see what's there:

```bash
cd ~/code/app
slipbox doctor                   # each language: its servers and linters, where each was found, or how to get it
slipbox doctor src/shelf.ts      # one file: the servers that would serve it here, and what trust leaves out
```

Each line names a server and one of these:

- where it was found: on your `PATH`, in the project, or in your install folders
- `not found: slipbox installs typescript@… when it's first needed`
- how to install it

`lsp.auto_install = false` stops the installs. [Troubleshooting](../manual/troubleshooting.md) covers a server that
isn't found.

## See the problems

What the servers, the linters and slipbox's own checks find shows where it is. A line's number takes the colour of its
worst problem, and the status line counts them.

| Press | To |
| --- | --- |
| `space n q` | Open the Problems panel on this file, a row per problem with its line |
| `space v p` | Open the panel's All tab: the whole vault's broken links, lint and conflicts |
| `shift+k` | Show what's under the cursor: its type, its documentation |
| `g d` | Go to its definition |
| `g r` | List where it's used |

In the Problems panel, `j` and `k` move, and the file follows. `enter` goes to the problem, and `q` closes the panel.

An agent gets the same list with `slipbox diagnostics src/shelf.ts`.

## Your changes in the gutter

The lines you've changed since the last commit are marked beside the text. They're compared against what's staged,
with unsaved typing included.

- `▎` marks lines added or changed, each in a soft colour of its own.
- `▁` marks where lines were deleted.

If you'd rather have them away from the text, `git.signs_at` puts them before the line numbers or at the window's right
edge ([Git](../manual/git.md)).

| Press | To |
| --- | --- |
| `] c` and `[ c` | Go to the next and previous change |
| a click on a change's sign | See the change, with Revert (its lines put back, unsaved) and Stage |

## Commit

1. Press `space g`, or click `±` on the left rail. The git panel, source control, opens in the left panel. It lists
   the changed files under Conflicts, Staged, Changes and Untracked, each with its letter (`M`, `A`, `D`, `R`, `?`).
2. Move with `j` and `k`, or point at a file. Press `enter`, or click the file, to see its diff. Press `l` to open the
   file into its changes, each of which you can stage alone.
3. Press `s`, or click its `+`, to stage the file or the change. `u` (`−`) unstages it, and `a` stages everything.
   `d` (`↺`) discards what isn't staged, after asking.
4. Type the message in the panel's message box (click it, or press `i`), then press `ctrl+enter`. A message says
   `committed`, with the commit's hash and subject. For a longer message, `c` opens it in a floating editor, where
   `ctrl+s` commits.

![Source control in the left panel: a changed file opened into its change](../images/code-and-git-source-control.png)

`shift+c` amends the last commit instead. In a folder you haven't trusted, the commit runs no hooks and isn't signed,
and the editor says so. The panel's buttons do the same, and say their keys when you point at them: commit, amend,
pull, push, fetch and stash.

## Review a branch before you merge it

Usually, an agent works on a branch of its own, in a git worktree beside your checkout. The git panel lists the
branches under Branches: yours first, then the ones checked out in a worktree, marked `⎇`, then the rest. Each says how
far it is ahead of its base, and `◆` marks a worktree with work to review. To make one for an agent, press `n` in the
panel: name it, pick where it starts, and keep "In a new worktree".

Before you merge it:

1. Click the agent's branch, or press `enter` on it. It opens up in place: its folder, its files against its base, and
   its buttons.
2. Click a file to see its diff. A note's diff shows each changed paragraph as it was and as it is, the words that
   changed marked; `tab` shows its lines instead. A code file's is side by side when the window is wide. Press `esc` to
   come back.
3. Click `[Open]` to go into its worktree, at the note you were on if the branch has it. `ctrl+o` comes back.
4. Click `[Merge…]` on the branch, and pick "The links it would break". slipbox asks git what the merge would give,
   without touching your files. It lists each link the merge would break, by note and line, with the cause and the fix
   when there is one: `fix/retry moves docs/plan.md to docs/design/plan.md — the fix: design/plan.md`.

   ![The merge review: the links a branch would break, each with its note, line and cause](../images/code-and-git-merge-review.png)

5. Press `enter` to go to a link.

When nothing breaks, a message says `merging fix/retry into main breaks no link`.

Then merge, from `[Merge…]` again ("Merge it", where the base is checked out), or with git, as you always do. A
merged branch's worktree goes with `[Remove…]`.

After a merge or a pull, git's renames may still break links. If they do, each broken link says where its file went.
You see this in the Problems panel (`space v p`), and when you follow the link. `space l r` rewrites a note's links to
match.

Each branch is measured against its own base: the branch slipbox made it from, else the nearest of `git.bases` (`main`
as it comes), else `main` or `master`. Compare against…, in a branch's menu, picks another.

You or the agent can do the same review from the command line:

```bash
slipbox changed                   # in the branch's checkout: what it changed against main
slipbox diff docs/plan.md         # one file's changes on the branch
slipbox merge-review fix/retry    # in yours: the links merging it would break
```

## Where next

- [Code](../manual/code.md): the code view, every language server feature, linters, problems and trust.
- [Git](../manual/git.md): source control, blame, a file's history, branches, worktrees and the merge review.
- [Working with agents](agents.md): the scratch and the context bundle, for handing code to an agent.
