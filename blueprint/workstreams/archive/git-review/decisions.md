# Decisions: reviewing, diffing and merging

Proposed, each for the user to accept, change or drop before the work starts.

## GIT-D1: The parts, in order (2026-10-14)

**Decision:** The workstream builds, in order:

1. the diff's foundation: changed words found inside changed lines, and the source diff drawn with them (GIT-D2);
2. reviewing a change, a hunk at a time (GIT-D3);
3. the remote's commands and stash, `26.6` taken from the roadmap's Later list (GIT-D4);
4. the rendered diff, a note's (GIT-D2);
5. the merge screen (GIT-D5), then pulling where both sides moved and rebasing onto the base (GIT-D6);
6. a code file's diff side by side, and the code view's unchanged cells folded (GIT-D7).

The git panel's buttons and its branch section (GIT-D8), and the branches in it with their worktrees and bases
(GIT-D9, GIT-D10), come first of all, beside the diff's foundation: they show what slipbox already does; each later
part adds its own buttons. The panel follows the vault (GIT-D11, VV-D10).

Interactive rebase, cherry-pick, submodules, managing remotes, a commit graph and a forge's pull requests stay out.

**Why:** Reviewing what an agent wrote is what slipbox is for, and the review is the part no other tool here does; it
needs only the source diff. The remote's commands are small and were planned from the start (D156). The merge screen
reuses the three-way merge the conflict prompt has (`5.5`), and a pull or a rebase needs it the moment one conflicts.
Side by side has the most parts, and the unified diff serves until it comes. What stays out is a git client's range;
the agent runs `git` for it (D156).

**Not chosen:** the merge screen first: git's conflicts are rarer than an agent's uncommitted change.

## GIT-D2: One diff, drawn as slipbox draws notes (2026-10-14)

**Decision:** A diff is found once and drawn two ways.

- **Found:** hunks of lines, by `merge.ts`'s Myers diff, as now; inside a hunk, each removed line paired with the added
  line most like it, and the two diffed again by word, so a changed line shows its changed words. A pair too unlike
  (less than half its words kept) is a line removed and a line added.
- **Source:** a row a line, `-` or `+` in the gutter, the line highlighted by its file's language, the changed words
  tinted more strongly than their line (`diff_del_word`, `diff_add_word`). A long line scrolls sideways, as a code
  block does (D233), never cut with `…`. Each hunk under its `@@ line N`, as now.
- **Before and after**, a note's (the user's, 2026-10-15, over the note's reading view, which would confuse a diff
  with the note): each changed block shown twice, a `before` block and an `after` block, lightly formatted (headings,
  emphasis, links, a table's cells), the removed words marked in the first and the added in the second; a block added
  or removed whole shown once, marked; unchanged stretches folded to a line saying how many lines they hold.

  ```text
    @@ ## Retry  (line 17)
    ┌ before ───────────────────────────┐
    │ …up to a minute. Until the retry  │
    │ budget of ADR 4 is on, an op is   │
    │ ░retried forever░.                │
    └───────────────────────────────────┘
    ┌ after ────────────────────────────┐
    │ …up to a minute. Each op has a    │
    │ ▓retry budget of five attempts▓;  │
    │ the sixth failure ▓parks it▓.     │
    └───────────────────────────────────┘
    ⋯ 14 unchanged lines
  ```

A note's diff opens before and after, a code file's as source (`[git] diff = "blocks" | "source"`, for notes); `tab`
switches. The same drawing serves the panel's diffs, a history entry's diff to now, the conflict prompt's (D)iff, the
review (GIT-D3) and the merge screen (GIT-D5).

**Why:** An agent rewrites prose a sentence at a time, and a line diff of a paragraph shows all of it removed and all of
it added, the one changed word nowhere marked. Before and after, a paragraph's change reads as prose, its words marked,
without being mistaken for the note itself; read as source, a line's change is its words, and a long line isn't cut
where the change might be.

**Not chosen:** the note drawn as reading lays it out, its changes marked in place (the first draft): the user found it
would be confused with the note. OpenTUI's `Diff` component (ideas.md § Git): slipbox draws its own rows (`draw.ts`). A
character-level diff: words read better in prose, and characters mark noise in code's identifiers.

## GIT-D3: Reviewing a change, a hunk at a time (2026-10-14)

**Decision:** `v` in the git panel opens a review of the working tree's changes against what's staged — the gutter's own
hunks (`26.1`) — across every changed file, untracked ones as wholly added: a hunk at a time, drawn as GIT-D2 draws it,
in the window, with the file, the hunk's place among all of them and the keys above it.

- `y` keeps it: stages it, as source control's `s` stages a change.
- `x` reverts it: its lines put back as staged, in the file, saved, one undo step. A file with unsaved typing is said
  so and skipped, never overwritten.
- `c` writes a note for the agent: the scratch gets an entry with the file, the hunk's lines and the note typed.
- `n` and `p` go to the next and previous hunk; `enter` goes to the hunk in its note; `esc` ends the review.

The end, or `esc`, says what was kept, reverted and noted, and that `space s y` copies the notes. Nothing is committed.

**Why:** The loop slipbox sits in: an agent changed files, and the person keeps what's right and sends back what isn't,
a change at a time, without opening each file. Staging is the mark git already has for "kept", so a commit afterwards
takes exactly what was reviewed.

**Not chosen:** annotations kept outside the file, as plannotator-tui has (ideas.md § Agent surface): the scratch
already collects what goes to the agent, and sending it is one key. Reverting left unsaved, as `space g r` leaves it:
a review crosses files, and unsaved reverts in each would be easy to lose.

## GIT-D4: The remote's commands and stash, asked for (2026-10-14)

**Decision:** `26.6`, as D156 planned it, from the git panel (GIT-D12):

- **fetch** (`f` in the git panel), **pull** (`p`), fast-forward only (GIT-D6 for the rest), **push** (`shift+p`),
  to the branch's upstream; a branch with none is asked to set it to `origin/<branch>`;
- **stash** (`z`): the stashes listed; one saved with a message, or applied, popped or dropped, dropping after
  asking.

None runs unasked; nothing is on a timer. git runs without a terminal: `GIT_TERMINAL_PROMPT=0`, and ssh in batch mode
unless the user has set their own ssh command, so nothing waits for a password; git's credential helpers still work. A
failure is said in git's words, with a hint that git in a terminal can log in. A push runs the repository's pre-push
hook only where the vault is trusted, as a commit's hooks (D172, D175). The status line shows the branch ahead of and
behind its upstream (`↑2 ↓1`), as of the last fetch. Before a pull, unsaved notes are saved or kept, as before a branch
switch (`26.5`); HEAD moving is the watcher's as now (`5.9`).

**Why:** Planned from the start and deferred only for order (D156, D158). Each is one git command once its failure
modes are covered: a password prompt that would hang, a hook that is the folder's code, a remote that refuses.

**Not chosen:** a background fetch: nothing in slipbox reaches the network unasked.

## GIT-D5: A merge screen, a card a conflict (2026-10-14)

**Decision:** A file with git's conflicts — listed in Problems (`5.12`) and in source control — opens, on `enter` or `x`
in the git panel, in a merge screen: each conflict a card with its three versions, the common base, yours and theirs
(git's index stages 1, 2 and 3; the file's markers where the stages are gone), yours and theirs each drawn as a diff
against the base (GIT-D2), rendered for a note, as source for code.

- `o` takes yours, `t` theirs, `b` both, yours first, `shift+b` both, theirs first;
- `e` puts the result in the lens, to settle by hand;
- `a` puts the conflict, with its surroundings, in the scratch for the agent;
- `n` and `p` go between conflicts.

Below the cards, the file as it will be, updating as each is settled. When none is left, `w` saves it (through
`App.writeBuffer`) and `s` stages it, which tells git it's resolved. The conflict prompt's (M)erge (`5.5`), where its
three-way merge leaves a conflict, settles it on the same screen.

**Why:** Agents working in parallel meet in conflicts, and markers in a note's source are hard to read: each side's
change shown against the base says what each meant. The three-way merge exists (`merge.ts`); the screen is what's new.

**Not chosen:** a three-pane screen (base, yours, theirs side by side above the result): too narrow in a terminal
beside an agent; the cards hold the same, a conflict at a time.

## GIT-D6: Pulling where both sides moved, and rebasing onto the base (2026-10-14)

> **Amended by D243 (2026-10-17):** a rebase over tracked files changed, `shift+r`'s or a pull's, asks to stash them
> and put them back after (`--autostash`) instead of saying git's refusal; where they conflict going back, git keeps
> them in the stash, and slipbox names the entry.

**Decision:** A pull that can't fast-forward asks: merge, rebase, or nothing; the default is git's `pull.rebase`.
"Rebase onto the base" (`shift+r` in the git panel) rebases this branch onto the base's tip, an agent's branch brought
up to date. A conflict on the way opens the merge screen (GIT-D5). While a merge or a rebase is under way, the status
line says so ("rebasing 2/5"), and the git panel offers continue, skip and abort; a rebase's hooks run only in a trusted
vault.

**Why:** An agent's branch falls behind the base while it works, and bringing it up to date is where conflicts come
from; with the merge screen, slipbox can see that through rather than leave the repository mid-rebase.

**Not chosen:** interactive rebase (reordering, squashing): a git client's job (GIT-D1).

## GIT-D7: A code file's diff side by side, and its cells folded (2026-10-14)

**Decision:** Where the window holds two columns of at least 80, a code file's diff shows its two versions side by
side, changed lines aligned, the changed words tinted; the two sides scroll sideways together, one offset as a code
block has one (D233); narrower, it's unified (GIT-D2). `[git] diff_layout = "auto" | "unified" | "split"`. In the code
view (`24.x`), a file's unchanged cells fold to their header line, so its diff reads as which functions changed.

**Why:** Code is read in its structure: two versions side by side show a moved or rewritten block whole, and folding
the cells that didn't change leaves the ones that did.

**Not chosen:** side by side for notes: the rendered diff (GIT-D2) shows a note's change where it is, in one column.

## GIT-D8: The git panel by mouse as by keys, and what the branch changed (2026-10-14)

**Decision:** Source control (the left panel, `±`) does everything it does by keys with the mouse too, and shows its
keys as it does:

- **A message box** at its top: clicked and typed in; `ctrl+enter` commits what's staged; a long message opens the
  floating editor, as `c` does now.
- **A row of buttons:** commit and amend, then pull, push, fetch and stash as GIT-D4 brings them; a button's key shown
  when the pointer is on it.
- **Each section's actions** on its header: stage all, unstage all, discard all (after asking).
- **Each file's actions** on its row while the pointer is on it: stage or unstage, discard, the diff. A right click
  opens a menu: open it, show it in the explorer, copy its path, a note for the agent (GIT-D3).
- **Each change** in a file opened up (`l`): stage and revert on its header.
- **What the branch changed:** under the working tree's sections, "This branch against main", the files `space g c`
  lists, `enter` or a click showing a file's diff. With nothing uncommitted, it's what the panel shows, never just
  "nothing changed".
- **The status line's branch**, `main ↑2 ↓1`, clicked: the branches, and pull and push.

**Why:** Staging, discarding, committing and amending exist, but only as keys the panel never shows, so to a newcomer
the panel looks like a list with nothing to do; an editor's git panel is used by mouse first. And an agent that
commits its work leaves the panel saying "nothing changed" just when there is most to review.

**Not chosen:** buttons alone, without the keys said: the keys stay the fast way, and a button naming its key teaches
it.

## GIT-D9: Branches in the git panel, worktrees marked on them (2026-10-14)

**Decision:** Source control has a Branches section: the repository's branches, a branch checked out in a worktree
marked `⎇` with its folder, each with what it holds — uncommitted changes, commits ahead of and behind its base, `◆`
something to review, `✓` merged — asked of git in the background as the panel's other sections are. Ordered: this
branch; those checked out in a worktree; those touched lately; then, folded, the merged and those untouched for a
month (`▸ Merged or older (34)`); `/` filters.

- **Opened up in place**, a branch shows its changes without going anywhere; with a worktree, its folder, its
  uncommitted changes and its changes against its base, `[Open] [Review] [Merge…]`; without one, its changes against
  its base, `[Check out here] [Open in a worktree] [Merge…]`. A file's diff opens in a peek (VV-D7).
- **Open** goes into the worktree's vault (VV-D4), at the same note when it has it, as `space g w` does now.
- **New branch** (`[+ New]`): a name, where it starts (`From`: main, dev, any branch, a commit), and, ticked, a new
  worktree for it, in a folder asked for (beside the repository by default, `<repo>-<branch>`); for an agent to work in.
- **Remove** a worktree whose branch is merged into its base, after asking; one with uncommitted changes refused, said
  why; the branch kept unless asked. A worktree whose folder is gone is marked, with Prune.

**Why:** The user's: people think in branches, and a worktree is where a branch is checked out; one list, the
worktrees' branches first, is more natural than a Worktrees section beside a branch picker. Each agent works in a
worktree, and the person watches over them: which has something to review, which is done, which is behind.

**Not chosen:** a Worktrees section of its own, the other branches in the picker only: two lists to learn.

## GIT-D10: Each branch's own base (2026-10-14)

**Decision:** What a branch changed is measured against its own base, not one base for the repository: the branch it
was made from when slipbox made it (the New form's `From`, kept in slipbox's state); else the nearest, by merge base,
of `[git] bases` (default `["main"]`); else `[git] base`, as now. "Compare against…" on a branch changes it. The
panel's diffs, the review, the merge review and the panel's "This branch against …" use it; a merge goes into it
unless another is picked. The panel shows it: `↑3 on dev`.

**Why:** A worktree's branch can start from `dev` or `test`; measured against `main`, every commit `dev` has would
look like the agent's.

## GIT-D11: The panel follows the vault (2026-10-15)

**Decision:** As VV-D10 has it: Source control shows the current vault's repository, with this workstream's panel, and
under it, folded, the other repositories in the view; in a vault that isn't a repository — home, a vault without git,
Elsewhere — those repositories are the panel. A worktree is a vault of its own (VV-D4): opening one goes into it.

**Why:** VV settled what the explorer shows and what a vault is; the panel follows it rather than keeping a model of
its own.

## GIT-D12: `space g` is the git panel; its keys act there (2026-10-15)

**Decision:** `space g` opens the git panel and focuses it, as `space e` does the explorer (open, focus, close, in
turn), rather than a menu of keys that open floating windows. In the panel, single keys act on what's selected, shown
in its footer and on its buttons (GIT-D8): `s` stage, `u` unstage, `d` discard, `a` and `shift+u` all; `c` commit,
`shift+c` amend; `f` fetch, `p` pull, `shift+p` push, `z` stash; `v` review; `x` the merge screen on a conflicted file;
`m` merge; `shift+r` rebase onto the base; `enter` a diff in a peek; `o` into a worktree or repository; `/` filter.
What's about the cursor's line stays out of the panel: `] c` and `[ c`; a click on a change's sign in the gutter shows
it with Revert and Stage. The note's diff, its file's history and blame are in the panel's "This file" section, and,
as every command, in the palette.

**Why:** The user's: most of what `space g` does is the panel's work, and its floating windows are what left the panel
looking empty. The panel's buttons and footer show the keys `space g`'s list used to.

**Supersedes:** `space g c`, `space g d`, `space g h`, `space g b`, `space g w`, `space g m`, `space g p`, `space g r`
as keys of their own (their commands stay).

## GIT-D13: Where a new worktree goes (2026-10-15)

**Decision:** `[git] worktrees` is a path template for a worktree slipbox makes: by default beside the repository,
`"{parent}/{repo}-{branch}"`; the user's own, for instance `"~/Projects/worktrees/{repo}/{branch}"`, as herdsman's
`[worktrees] directory` sets one folder for all. `{branch}` is made safe for a folder's name.

**Why:** The user keeps worktrees in one folder of their own; others keep them beside the repository, or inside it.
