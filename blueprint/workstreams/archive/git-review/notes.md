# Notes

## How it came up

On 2026-10-14, after code blocks learned to scroll sideways (D233), the user looked at `space g d` and asked what
slipbox's git is missing, whether it has a diff screen and a merge screen, and whether the new way of drawing code
could show diffs in a new way and help merging. They then asked that the remote's commands be included if they aren't
complex, and asked for this draft.

Looking at the draft's own branch in slipbox, the user found the git panel empty: everything was committed, so it said
"nothing changed" beside a branch of 16 changed files. They noted that its staging and committing exist only as keys,
with no buttons, asked that it work by mouse as an editor's git panel does, and that it know worktrees as the common
editors' git tools now do (GIT-D8, GIT-D9).

## What slipbox's git does today

- **Marks:** the explorer's (`5.11`); changed lines in the gutter against what's staged, unsaved typing too (`26.1`);
  `] c` and `[ c`; one change previewed (`space g p`) or undone (`space g r`).
- **Source control** (`26.2`): conflicts, staged, changes and untracked in the left panel; stage, unstage, discard.
- **Commit and amend** (`26.3`), **blame and a file's history** (`26.4`, `22.1`), **branches** (`26.5`), **worktrees**
  (`5.14`).
- **Against the base** (`5.13`): what the branch changed (`space g c`), a note's diff (`space g d`).
- **Before a merge** (`20.21`): the links it would break (`space g m`); after one, git's renames as evidence of moves.
- **Conflicts:** a merge's unmerged files in Problems, each at its first marker (`5.12`); in code, git's markers are an
  error. Settled by editing the markers.
- **Changed on disk while edited** (`5.5`): load, keep, diff, or a real three-way merge (`src/core/merge.ts`).

## What's missing

- The diff is plain: a row a line, `-` and `+`, no changed words, no highlighting, a note shown as source, long lines
  cut with `…` (seen on the example set's `kestrel-agent-sync-retry`, `docs/sync.md`).
- No merge screen for git's conflicts; the three-way merge serves only the changed-on-disk prompt.
- No review of an agent's change a piece at a time: keep, revert or send back.
- Fetch, pull, push and stash: planned (D156), deferred (D158).

## The remote's commands, weighed

| Command | Size | What makes it harder |
| --- | --- | --- |
| Fetch | small | git must never wait for a password; a failed login said, not a hang |
| Push | small | a remote that refuses ("pull first"); the pre-push hook, the folder's code, only where trusted |
| Pull, fast-forward only | small | unsaved notes saved or kept first, as a branch switch does |
| Stash | small | a list; save, apply, pop, drop |
| Pull where both sides moved | medium | merge or rebase asked; their conflicts need the merge screen |
| Rebase onto the base | medium | it stops at each conflict: the merge screen, with continue, skip and abort |
| Interactive rebase | large | left out: a git client's job |

## The user's answers (2026-10-15)

1. A note's diff: not the note's reading view, which would be confused with the note, but a diff render of its own,
   before-and-after blocks (GIT-D2).
2. The review's revert: saved at once, with undo.
3. Keys: `space g` becomes the git panel itself, its single keys acting there (GIT-D12).
4. `↑↓` on the status line: once the branch has an upstream, as of the last fetch.
5. A new worktree's folder: beside the repository by default, configurable as herdsman's `[worktrees] directory` is
   (GIT-D13); the user's own is `~/Projects/worktrees`. A first-run setup screen choosing such options: an idea for
   later.
6. A conflict handed to the agent: into the scratch.

## Questions for the user (as first asked)

1. A note's diff rendered by default, the source a key away (GIT-D2)? Proposed: yes.
2. The review's revert saved at once, with undo (GIT-D3), unlike `space g r`, which leaves it unsaved? Proposed: saved.
3. The keys: `space g v` review, `space g f` fetch, `space g l` pull, `space g shift+p` push, `space g z` stash,
   `space g x` the merge screen, `space g shift+r` rebase onto the base?
4. The status line's `↑2 ↓1`: always, once the branch has an upstream, or only after a fetch from slipbox?
5. A new worktree's folder: beside the repository as `<repo>-<branch>` (proposed), or under a folder you name once?
6. A conflict handed to the agent (`a` on the merge screen): into the scratch, as proposed, or straight to the agent's
   pane in herdr (ideas.md § Agent surface), once that exists?

## After the draft: the git panel's shape (2026-10-14)

Settled in talking it through with the user, and written into the decisions since: GIT-D9, GIT-D10 and GIT-D11.

### Branches, with worktrees marked

The panel lists **branches**, not worktrees (the user's choice, over a Worktrees section): people think in branches,
and a worktree is where a branch is checked out. Kept short by order and folding:

```text
 ▾ Branches (39)                 [+ New]
   ● main                           here
   ⎇ agent/sync-retry    ↑5 on main  ✎2 ◆
   ⎇ agent/route-cache   ↑3 on dev      ◆
     dev                ↑12 on main
     feature/sharing     ↑2 on main
   ▸ Merged or older (34)
```

- Order: this branch; those checked out in a worktree (`⎇`, where agents work); those touched lately.
- Folded: merged branches, and those untouched for a month. `/` filters.
- `↑` ahead of its base, `✎` uncommitted files, `◆` something to review, `✓` merged.
- Opened up, a branch shows its changes without switching; what it offers depends on whether it has a worktree:

```text
   ▾ ⎇ agent/sync-retry   ↑5 on main ✎2 ◆
       ~/work/kestrel-agent-sync-retry
       Uncommitted (2) · Against main (5)
       [Open] [Review] [Merge…]
   ▾ feature/sharing      ↑2 on main
       Against main (4 files)
       [Check out here] [Open in a worktree] [Merge…]
```

### Each branch's own base

A worktree's branch can start from `dev`, `test` or any branch, so "against main" becomes against the branch's own
base: the one chosen when slipbox made it (the New form's "From"), else the nearest of `[git] bases` (default
`["main"]`), else `[git] base`; "Compare against…" corrects it. `space g c`, `space g d`, the review and the merge
review use it; a merge goes into it by default.

```text
┌ New branch ───────────────────────┐
│ Branch  agent/route-cache         │
│ From    dev                    ▾  │
│ [x] in a new worktree             │
│ Folder  ~/worktree/kestrel/route… │
│            [Create]   [Cancel]    │
└───────────────────────────────────┘
```

### The panel in every case

In a repository, mid-work (a message typed; staged, changed, untracked; the branch against its base):

```text
 ± Source control                ⋯
 kestrel · agent/sync-retry
 ↑5 on main · not pushed
 ┌ Message ──────────────────────┐
 │ Park an op after five tries▏  │
 └───────────────────────────────┘
 [✓ Commit 1] [Amend] [↑ Publish]
 ▾ Staged (1)                    −
   M docs/sync.md
 ▾ Changes (1)                 + ↺
   M src/sync/retry.ts     + ↺ ⧉     ← the pointer on it
 ▾ Untracked (1)                 +
   ? notes/todo.md
 ▾ This branch against main (5)
   + docs/runbooks/retry-budget.md
   …
 ▸ Branches (5)
 ─────────────────────────────────
 s stage  d discard  . diff  c commit
```

A merge with conflicts, a rebase stopped, the remote and stashes:

```text
 ⚠ Merging agent/sync-retry           ⚠ Rebasing onto main: 2 of 5
   3 conflicts left in 2 files           "Retry budget: a ceiling per op"
 [Resolve…]  [Abort merge]            [Resolve…] [Continue] [Skip] [Abort]
 ▾ Conflicts (2)
   U docs/sync.md           2 left    kestrel · main      ↑1 ↓3 origin
   U src/sync/retry.ts      1 left    [↓ Pull 3]  [↑ Push 1]  [⟳ Fetch]
 ▾ Merged cleanly (3)                 ▾ Stashes (2)
   …                                    wip: route cache        ↥  ✕
```

In a folder holding repositories (the root a plain folder, its repositories boundaries): each repository, its
worktrees under it, since they're one repository however many folders they're in:

```text
 ± Source control
 ~/projects holds 3 repositories
 ▾ kestrel                  ↓2 origin
     ● main                 ~/projects/kestrel
     ⎇ agent/sync-retry    ↑5 on main ✎2 ◆
         ~/worktree/kestrel/sync-retry
 ▸ product                  ✎1
 ▸ infra                    clean
```

Worktrees inside a repository's own folder (Claude Code's `.claude/worktrees/`) are roots of their own, boundaries,
shown as `⎇` rows with their branch, and branches with `⎇` in the panel.

### What looking at it showed

- A branch whose work is all committed shows "nothing changed" in the panel: GIT-D8's branch section.
- The panel works by keys only, none of them shown: GIT-D8's buttons and key hints.
- With the user's layout (`~/projects/<project>`, worktrees in `~/worktree/<project>/<worktree>`), started in
  `~/projects` and switched into a worktree, the explorer shows the worktree, and under it the folder started in as
  another root, by its full path cut short, nothing saying it's where you started. Started in a folder holding the
  worktree, that folder isn't listed (roots never overlap); `..` goes up instead. The user found the explorer's roots
  confusing, and asked that they be worked on before this workstream goes on.
