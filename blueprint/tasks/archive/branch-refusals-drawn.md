---
status: done
assignee: claude-17
blocked_by: []
tracker: [gh:#17]
created: "2026-10-23"
---

# T20: What git answers is drawn as it comes, and the branch view keeps up with it

A message is drawn as it's said, wherever from (D263); in the git panel's Branches section, what git did before it
refused is shown, a branch made is selected, and an answer that comes late changes nothing where you've gone since.

## Description

`app.message` asked for no frame of its own: said from a key, the key's frame drew it; said in a `.then` once git had
answered, nothing did, and it showed only when something else redrew (another git answer, the next key). #17 named
three such paths in the branch view: git refusing to make a new worktree (`newWhere`'s In a new worktree), to check a
branch out in one (`worktreeFor`, Open in a worktree), and to remove one (`remove`, once asked); a fourth, the switch
after Check it out here, was found looking for them. The pull request's reviews found the same in the status line's
switch (`git.ts`, `checkedOut`) and a branch file's diff (`fileDiff`), and older bugs in the closures it touched.

The maintainer decided (2026-10-23): fix every finding here, and have `App.message` ask for a frame itself (D263).
So:

- `App.message` asks for a frame, except while a frame is drawn; `BranchView.answered` goes, and the two lists opened
  in the background (Remove…'s question, Merge…'s menu) ask for theirs, as Compare against… does.
- Refused, a removal, Open in a worktree, a new worktree and a new branch's switch list the branches again: git may
  have done some of it. A branch git still has after refusing its worktree keeps its base and is shown; one whose
  switch was refused is shown as a made one is.
- A branch made is opened up and selected once git lists it (`listed`), its section unfolded to it.
- An answer that comes once another vault is gone into says itself and does nothing else there; Remove…'s question
  and Merge…'s menu never open over another question.
- `fileDiff` says nothing for a read overtaken by another.

## Acceptance criteria

- Tests in `tests/gitpanel.test.ts` and `tests/tui.test.ts`, one for each, each failing without its fix (undone once
  to check): a message's frame, and none while drawing; the refusals drawn as they land, the status line's switch
  too; the panel after a refused removal or switch, and after a hook's refusal; the new branch selected; the late
  question not over a prompt; the late worktree not gone into; the overtaken diff silent.
- Tried live in this worktree's slipbox on a scratch copy of the reference set.
- D263 in decisions/reading.md; the design (design/tui.md: the messages, § Side panes' Branches) and the manual
  (docs/manual/git.md: A new branch, Switching branches, Worktrees) say it; CHANGELOG lines.

## Out of scope

- What the refusals say: their text stays git's.
- Telling apart a late question from a newer one asked and dismissed meanwhile: a question you asked for, opening
  once nothing else is open, is still yours.

## References

- Delivers: requirements.md § Git (the branches with their worktrees in the git panel); design/tui.md § Screen
  layout (the messages) and § Side panes (the Branches section, A new branch, Remove…, Merge…).
- Rests on: D263, GIT-D8, GIT-D9; `answered` came with the fix of #117 in the repository before it was restarted.

## Log

- 2026-10-23: read the code on `dev` (`be3674a`). `App.message` (`src/tui/app.ts:778`) pushes the message and its
  toast and schedules the toasts' expiry, which asks for a frame only once a toast was drawn: a message said with no
  frame asked for waits. A key's frame comes after its command is done (`Input.processKey`, `src/tui/input.ts:165`);
  a mouse click asks for one at once (`src/tui/run.ts`, `view.onMouse`), not when what it started is answered.
- 2026-10-23: the paths in `src/tui/gitbranchview.ts` that say something after an await, with no frame asked for:
  - `remove`'s accept, `removeWorktreeLater`'s refusal (line 577) — #17's;
  - `worktreeFor`, `addWorktreeLater`'s refusal (line 609) — #17's;
  - `newWhere`'s `inWorktree`, `newWorktreeLater`'s refusal (line 714) — #17's;
  - `newWhere`'s Check it out here, the branch made and `switchLater` refused (`… made, but git: …`, line 733) — not
    named by #17, the same pattern;
  - `fileDiff`, an uncommitted file `readForDiff` won't read (past 8 MB, not a regular file; line 445): by a key it's
    drawn, the key waiting for the read; by a click, not.
  The checkout button (line 388) and the merge (`runMerge`) say theirs, then ask for a frame once `refreshNow` is in:
  drawn a moment late, never left. `compare`, `compareTyped`, `statsOf`, `filesOf` and `branches` ask for theirs.
- 2026-10-23: the cause reviewed against the code: the four git refusals are it, the switch's among them (same cause,
  same controller, same remedy). Two qualifications. A toast already drawn can, when its time is up, draw a refusal
  said meanwhile: "no frame asked for by the answer", not always "until the next key". And `fileDiff`'s message is
  said before `query.current()` is checked (line 453), so a read overtaken by a newer one can still say it; its fix
  belongs with that, so it's a follow-up, not this task's. The test can't reuse the existing regression test's single
  latch: a progress message, or a question opened, before the refusal could satisfy it.
- 2026-10-23: reproduced: a test in `tests/gitpanel.test.ts` ("git refusing Open in a worktree, a new worktree, a
  removal asked for, a switch to a branch just made: each drawn as it comes (regression)") failed on `dev`'s
  code at its first case: git's refusal was said, and no frame was asked for in its turn. Each message is marked by
  its own text in the turn it's said, so only the refusal's own turn counts. git is made to refuse: a folder
  `[git] worktrees` names already there, with a file in it (Open in a worktree, and a new branch In a new worktree,
  which leaves no branch); a worktree locked (`git worktree lock`), then removed, keeping its branch; a tracked file
  changed that the new branch, made from main, doesn't have (Check it out here: the branch stays, HEAD doesn't
  move).
- 2026-10-23: fixed: the four `.then`s in `gitbranchview.ts` (`remove`'s accept, `worktreeFor`, `newWhere`'s
  `inWorktree` and its Check it out here) say what they say through `answered`. On success that's a frame asked for
  as git answers, before `refreshNow`'s.
  Mutation-checked: with `answered` undone at one site at a time, the test fails at that site's case: lines 575 (Open
  in a worktree), 581 (a new worktree), 587 (the removal), 596 (the switch).
- 2026-10-23: `tests/gitpanel.test.ts` whole: 35 pass. Terminal checks `git branches` (4, two at a time): all pass.
- 2026-10-23: tried live: this worktree's slipbox in a herdsman pane, on a scratch reference set (`bun
  scripts/build-home.ts tmp/issue/home`, its own `HOME` and XDG folders), in `work/kestrel`'s git panel, no key
  pressed after each answer:
  - Remove… on a merged worktree, locked: `git: cannot remove a locked working tree; …` shows;
  - Open it in a worktree… on `docs/glossary-move`, its folder taken: `git: '…/kestrel-docs-glossary-move' already
    exists` shows;
  - a new branch `agent/taken` In a new worktree, its folder taken: the same; no `agent/taken` left behind;
  - a new branch `agent/here` from `cleanup/remove-legacy`, Check it out here, with `CHANGELOG.md` changed (that
    branch deletes it): `agent/here made, but git: Your local changes to the following files would be overwritten by
    checkout: CHANGELOG.md` shows; HEAD stays on main.
  And their successes, the code they go through changed too: the worktree unlocked and removed (`removed the worktree
  …; agent/done kept`, the list refreshed); `refactor/docs-layout` opened in a worktree, made and gone into; a new
  branch in a new worktree (`made agent/fresh from main, in a new worktree at ~/work/kestrel-agent-fresh — o goes
  into it`, opened up — though not selected, as the screen showed then and the follow-up below says); one checked
  out here (`made agent/sw from agent/done, and checked it out`).
- 2026-10-23: timed live, the removal's refusal, the screen read every 0.2 s from the `enter` that accepts it: with
  the fix undone (that site only), first seen at 4.2 s, as the `removing the worktree …` message before it goes — its
  time up, it asks for a frame — though git answered at once; with the fix, at the first reading after the immediate
  one (0.2 s). So without the fix a refusal waited for the next key, the message before it going, or the watcher's
  news — whichever came first.
- 2026-10-23: a test for the successes going through the changed code that had none: "a new branch checked out here:
  made, switched to, said; Open in a worktree: made where [git] worktrees says, said, gone into". Removal's and the
  new worktree's had theirs.
- 2026-10-23: design/tui.md § Side panes, A new branch: a worktree made or removed, a new branch's switch, Remove…'s
  question and Merge…'s menu are drawn as git's answer lands (`answered`), named one by one: the checkout button and
  the merge say theirs after `refreshNow`, and `fileDiff`'s stays the follow-up below. CHANGELOG: a Fixed line, no
  bound on the wait claimed (it's the next draw, whatever that is). docs/manual/git.md § Worktrees: git's refusal
  shows once it answers, with no key to press.
- 2026-10-23: the diff reviewed. Taken: the design's claim named operation by operation, the CHANGELOG's wording, the
  user docs, the scope line above (git refusals, `fileDiff` left out), the task's own record kept to findings. Not
  taken: comparing the removal question's title by the worktree's real path — the two tests before it compare it the
  same way, `Remove the worktree ${done}?`, and CI runs this file on macOS too (`ci.yml`'s matrix).
- 2026-10-23: an independent review of the diff, 13 findings. Taken: the manual's sentence narrowed to worktrees
  (the status line's switch still says its refusal with no frame, below); the test's record cleared before each
  action and read from the newest matching message, so an earlier refusal of the same words can't pass for a later
  one; the four copies of the test file's branch lookup and its three of a list's title, one each at the describe's
  scope (`branchOf`, `listTitle`); this task done and archived. Then: `tests/gitpanel.test.ts` 36 pass; mutation
  checked again, each site failing at its own case (lines 574, 584, 594, 607).
- 2026-10-23: not taken, a choice for the maintainer: `App.message` asking for a frame itself would close the whole
  class — every path said in the background now has to remember `answered` or a frame of its own. It touches every
  message and the tests that count frames, and #17 asked for `answered`.
- 2026-10-23: not taken: `answered` with a `try`/`finally`. A callback that throws was an unhandled rejection before
  this change and still is; a frame after it would draw nothing new.
- Follow-ups, older than this change and not #17's, each checked by a test run against this branch's code:
  - after In a new worktree, Just make it or Check it out here, `newWhere`'s `done` looks the new branch up before
    `branches()` has git's new list, so it isn't selected, and `o` acts on the row selected before (the selection
    stayed on the heading);
  - Remove it and the branch, the worktree removed and `git branch -d` refused (`… the branch kept: …`): the early
    return skips `refreshNow`, so the panel lists the worktree after its folder is gone (still `gone: false` 1.5 s
    later);
  - Check it out here, the switch refused: the branch made isn't listed until git's next news (not there 1.5 s later);
  - read, not run: a new worktree stopped partway keeps its branch, but not its base (`keepBase` skipped);
    `worktreeFor`'s success, up to ten minutes later, goes into the worktree even after a move to another vault;
    Remove…'s question and Merge…'s menu open over a list or prompt opened meanwhile (`compare` checks
    `app.overlay`, they don't);
  - a message with no frame asked for, outside what #17 named: the status line's and the palette's switch refused
    (`src/tui/git.ts`, `checkedOut`), and `fileDiff`'s message for an uncommitted file it won't read (past 8 MB, not a
    regular file), when the diff was asked for by a click; that one is also said before the read is checked for being
    overtaken (`query.current()`).
- 2026-10-23: round 1 of the pull request's own review: the code-review skill and a second reviewer, each on
  `git diff origin/dev...` without the other's findings; consolidated, each checked against the code.
  - Rejected: the removal question's title compared with the fixture's path could miss git's spelling of it through a
    link (macOS's `/var`). It can't: `tests/setup.ts` makes every test's temporary folder its real path (line 35) and
    points `TMPDIR` at it. Run with `TMPDIR` through a link, the tests pass.
  - Real, fixed: this Log said the new branch was "opened up and selected" when it wasn't (amended above). The
    regression test's wait could be satisfied by an earlier message of the same words; it now looks only at what
    lands after the action. The two regression tests had two instrumentations of their own; one helper at the
    describe's scope serves both (`drawnAsItLands`, messages and lists numbered as they land), and `branchOf` reads
    `branchRow`'s row. The manual's § A new branch says the switch's refusal too, as the CHANGELOG does. The checks
    before the pull request weren't recorded here: the typecheck (tmp/ left out: the scratch reference set's broken
    TypeScript is there), the lint, `check:size`, `check:boundary`, `check:docs` and `test:docs` all passed, and CI
    passed on the pull request.
  - Then: `tests/gitpanel.test.ts` 36 pass; mutation-checked, the six `answered` sites one at a time, each failing its
    own case: the four of this change (lines 563, 573, 583, 596) and the two the older test guards, Remove…'s first
    answer (525) and Merge…'s menu (538). No product code changed in this round, so no new live try.
  - Real, older than this change, the scope's to decide: the follow-ups above, found again — the switch refused and
    the removal's branch refused leave the panel stale; the new branch isn't selected; `checkedOut` and `fileDiff`
    say theirs with no frame; a late answer acts on whatever checkout is open by then; a new worktree stopped partway
    loses its base. Reproduced too: Remove…'s question, opened as git answers, replaces a prompt opened meanwhile, text
    typed in it lost. And the checkout button's refusal waits for `refreshNow`, never drawn if that rejects (it
    doesn't catch `statusLater`'s rejection). The design's "a new branch's switch" names the switch after Check it
    out here, not that button.
- 2026-10-23: the maintainer decided: fix every finding here, and have `App.message` ask for a frame itself (D263,
  decisions/reading.md). The plan was reviewed first. Taken from that review: `listed` waits only for a settled
  answer for the repository as it is now, and gives up if the vault is left or git can't list them; each late step
  checks it's still in the same vault, `opened.add` and `goInto` included; a branch git keeps after refusing its
  worktree keeps its base and is shown, with git's warning and no word of it made; the drawing flag is reset in a
  `finally`; `fileDiff` checks `query.current()` right after its await; the test's observer marks a message before
  calling the original, which now asks for its frame. Not taken: telling a late question from a newer one asked and
  dismissed meanwhile (out of scope above).
- 2026-10-23: checked before building it: OpenTUI's `CliRenderer.requestRender` (`@opentui/core`) coalesces the
  requests made before a frame into one, but one made while it renders sets `immediateRerenderRequested`, a frame
  right after: a message said on every frame would keep drawing, hence no frame asked for while drawing. `App.message`
  is called before `host` is set (`vaults.ask`, at start), hence `host?.`. A `post-checkout` hook that exits 1 makes
  `git worktree add` refuse with the branch and worktree made, and `branch -D` can't delete it (tried in a scratch
  repository); hooks run only in a trusted vault, so the test trusts its own.
- 2026-10-23: built: `App.message` asks for a frame unless a frame is being drawn; `BranchView.answered` gone; the
  removal, Open in a worktree, the new worktree and the switch list the branches again when refused (`relisted`);
  `shown` for a branch made, refused or not; `listed`; `still`, the late-answer guard; Remove…'s question and Merge…'s
  menu not opened over another question, and asking for their frame; `fileDiff`'s overtaken read silent.
- 2026-10-23: tests, each mutation-checked (the fix undone once, the test failing): `tests/tui.test.ts` "a message
  asks for its frame as it's said, wherever from; one said while a frame is drawn asks for none, the next one does"
  (fails without the frame, without the drawing guard, and without the `finally`); `tests/gitpanel.test.ts` "the
  status line's switch, refused: drawn as git's answer lands", "Remove it and the branch, the worktree removed but the
  branch refused: listed again at once, its worktree gone", "a new branch git won't switch to: made all the same,
  listed, opened up and selected", "a new worktree git refuses once it's checked out (a hook, the vault trusted): the
  branch it leaves keeps its base, shown", "a new branch made, in a new worktree or just made: opened up and selected
  once git lists it, unfolded to" (fails without `listed`, and without the unfolding), "Remove…'s question and
  Merge…'s menu, git answering while a prompt is open: nothing pops up over it, its text kept" (each guard), "Open in
  a worktree, another vault gone into before git answers: said, and you stay where you went", "an uncommitted file too
  big for a diff, clicked: said as it lands; overtaken by another diff, not said". The two regression tests before
  them fail without the message's frame, and the older one without Remove…'s and Merge…'s own frames: 14 mutations,
  each failing what it should.
- 2026-10-23: then: `tests/gitpanel.test.ts` 44 pass; the tests that count frames (`clipboard-async`, `regex-jobs`,
  `syntax-worker-tui`) and `marks` 47 pass; `tui.test.ts`'s toasts, the message's frame, pictures' frame and the real
  renderer's tests pass. Terminal checks: `git branches`, `git panel`, `git: branches`, `git: a branch switch`, `git:
  a worktree`, the info window's messages — 14 of 14.
- 2026-10-23: tried live, a fresh scratch reference set, `work/kestrel`, in a herdsman tab of its own (the right pane
  was 40 columns wide, too narrow for the panel): `agent/x`, a worktree with a commit, compared against `integration`
  at its tip, then Remove it and the branch: the folder gone, the branch kept, and listed at once under Merged or
  older, no worktree; the status line's switch (the palette's Branches) to `cleanup/remove-legacy` with
  `CHANGELOG.md` changed: git's refusal on screen at the first reading, 0.1 s after `enter`, HEAD still main; a new
  branch made In a new worktree: opened up and selected, and `o` went into it (`kestrel@agent/here2`); `agent/here3`
  from `cleanup/remove-legacy`, Check it out here, refused: said, listed under Merged or older unfolded, opened up and
  selected, HEAD still main; Remove… on `agent/here2` with the new-branch prompt opened in the same burst of keys,
  before git answered: the prompt stayed, no question over it, the worktree kept.
- 2026-10-23: round 2 of the review, on the widened diff, the two reviews again apart; consolidated, each checked.
  - Rejected: the root decision numbered then — it's numbered when it's merged (it's D263); T20's was given with the
    task.
    Telling a late question from a newer one asked and dismissed meanwhile (out of scope above).
  - Real, fixed, each with its test:
    - a new branch by the name of one there already, In a new worktree: git refused, and the branch's own base was
      replaced (the branch found there afterwards taken for one just made) — `newWorktreeLater` now says whether a
      branch it made is left (`left`), never one there before, and the sync `branchesOf` on the refusal's path goes;
    - `shown` selected the new branch's row in whatever view was on the left, and over a selection moved meanwhile —
      now only with the git panel showing and its selection where it was when the branch was asked for;
    - Merge…'s menu guard came before its "no base" message, so that was never said with a question open — the
      message said wherever you are, the menu alone guarded;
    - `listed` gave up after four rounds of news, so a busy repository (an agent writing) never had the branch
      selected — it waits for as long as news keeps coming, each round on git's answer;
    - a switch a hook refuses once it's switched leaves HEAD moved: `checkHead` either way;
    - the tests of a late answer waited a fixed time, which a slow machine passes without the guard ever weighed —
      they wait for the guard (`still`) to have been asked, or for `listed` to have settled;
    - the other-vault guards of `shown`, Remove…'s question and Merge…'s menu, and Open in a worktree's list asked
      again when refused, had no test — each has one now;
    - `still` relied on `Git.checkout`'s memo, read lazily, as a vault's identity — now a count of the vaults gone
      into (`Vaults.visits`);
    - a message said while the host paints, outside `App.draw` (widths, pictures), still asked for a frame —
      `App.whileDrawing` wraps the host's whole paint;
    - `shown` unfolded the sections when it was the filter that hid the branch — the filter is checked first, and
      only the folds that hide it opened;
    - each list opened once git answers repeated "not over another question, then a frame" — one
      `Overlays.openListLater`; `still` and a branch row's lookup (`rowOf`) used where the checks were spelt out;
      `compareTyped`'s frame after its message, redundant now, gone;
    - the manual and the CHANGELOG promised `o` into a worktree for a branch without one; the design's wording on
      messages said while drawing; this task's "#17 named four" (it named three).
- 2026-10-23: tests: `tests/gitbranches.test.ts` "a name there is already: refused, that branch left as it was; a
  hook refusing once it's checked out: the branch it made left"; `tests/gitpanel.test.ts` "a new branch by the name of
  one there already: git refuses, and that branch keeps its own base", "a new branch made while you've moved on —
  another view on the left, the selection moved, another vault: left as you put it", "a new branch made while git has
  news after every answer: selected once the news stops", "a new branch made, the panel's filter not matching it:
  nothing unfolded, nothing selected", "Open in a worktree a hook refuses once it's checked out (the vault trusted):
  listed again, the worktree on its branch", "a new branch's switch a hook refuses once it's switched (the vault
  trusted): HEAD seen where it went at once", "Remove…'s question and Merge…'s menu, another vault gone into before
  git answers: nothing opens there", "Merge… on a branch with no base, a prompt open as git answers: said all the same,
  the prompt kept"; the late-answer tests rewritten to wait on signals; `tests/tui.test.ts`'s message test, a message
  said in `whileDrawing`. Mutation-checked: 17 mutations of round 2's fixes, each failing what it should. Two passed
  at first, the selection's guard and the filter's: the tests asserted before `shown` had finished. They now wait
  for `listed` to settle, and fail without either guard (the left view's, the selection's, and the filter's, apart).
  Then: the reached unit tests, 123 and 4, pass.
- 2026-10-23: terminal checks, as the maintainer asked, for every case — `tests/terminal/checks/git-branches.ts`
  (`bun run test:terminal git-branches`), 12, all passing: the refusals said as they come (the message said as git
  was asked still on screen with git's answer — without its own frame the answer is drawn only as that message goes),
  and slipbox idle after (no frame painted once the messages are gone); Check it out here refused; the status line's
  switch refused; Remove it and the branch, the branch kept; a hook refusing in a trusted vault (a new worktree's
  branch kept with its base, Open in a worktree listed again, HEAD seen moved); a new branch selected, unfolded to,
  `o` into it; the selection moved or the filter not matching meanwhile; Remove…'s question and Merge…'s menu with a
  prompt opened before git answers, and Merge… with no base said; Open in a worktree with another checkout gone into
  before git answers (3,000 files on the branch, so its checkout outlasts the keys); a file too big for a diff, and
  one clicked past; a name there already keeping its base; an agent writing while a branch is made. First runs: six
  failed for the checks' own reasons (the status line's form in a worktree, a row's name matching the panel's title,
  the filter cleared by esc, not `/`; a click closing the row `shown` opened; git's reason for a hook's refusal, below).
  Not given a terminal check: a message said while a frame is painted asks for none — nothing from outside makes
  slipbox say one while it paints; the unit test drives it, and the idle check stands for its effect.
- 2026-10-23: a thirteenth terminal check: Remove…'s question and Merge…'s menu, another checkout gone into (by
  `:worktrees`, in the same keys) before git answers — a vault trusted, with a file-system monitor that takes a second
  (`core.fsmonitor`), so each `git status` the answer needs outlasts the keys. Then 27 terminal checks, the new ones
  and `git branches`, `git panel`, `git: branches`, `git: a branch switch`, `git: a worktree` and the info window's
  messages: all pass.
- 2026-10-23: the terminal checks mutation-checked where a terminal can tell: without the removal's list asked again,
  "Remove it and the branch, git keeping the branch" fails; without `listed`, "Check it out here refused" and "a new
  branch made is selected" fail; without Remove…'s or Merge…'s vault guard, the fsmonitor check fails; without the
  message's frame, "the status line's branch switch, refused" fails. The other two of its checks ("git's refusals said
  as they come", "too big for a diff") pass without it: in a live terminal something else draws the refusal while the
  message before it is still up — the watcher seeing git touch `.git`, the panel's own questions to git answering —
  which is why the bug showed only now and then. There the unit tests, which nothing else draws for, are what fails
  without the fix; the terminal checks drive the cases end to end.
- 2026-10-23: round 3 of the review: the code-review skill's; the second reviewer's waits (its usage limit), done
  with the next round's diff. Each finding checked:
  - Rejected: a per-visit cancellation in place of `still` at each site — what git says is meant to be said wherever
    you are; only what acts on the vault is guarded, at the step that acts.
  - Real, fixed, each with its test: `stoppedPartway` never matched what `checkoutLater` returns (its hint after it),
    so a worktree stopped partway lost its branch — older than this change; a late question opened while you typed in
    a note or the commit's message, where Enter would answer it (Remove it, keep…) — `Overlays.busy`: a question, the
    diff window, typing in a note, the message box or a filter, and a list declined then says so, to ask again; Open
    in a worktree went into it (`switchVault`, dropping what you had open) over a question opened meanwhile — not now,
    `o` does; `listed` waited for ever if git's news always came faster than it lists the branches — an answer
    overtaken by a newer question is shown meanwhile (`BranchList.answered`), and `listed` takes any asked since; with
    nothing asked it returns rather than spin; "the selection moved" was read by the row's number, which the panel
    itself moves (rows coming and going) — now by what you did in the panel since (`GitPanel.touched`, a key or a
    click); the folds were opened when the panel only said "asking git…"; the status line's switch, refused, didn't
    read HEAD again (a hook refusing once it's switched); the hook tests depended on no global `core.hooksPath` —
    each sets the repository's own; the idle check failed on any late frame — a loop paints dozens a second, so fewer
    than five; frames asked for after a message, redundant now (`beginGitRead`, a code file past its parsing budget),
    gone; `shown` built the panel's rows three times, now once or twice.
  - Tried first and dropped, both found by the tests: the selection judged by the row's identity — rows come and go
    above the row you're on, so it looked moved when it wasn't; a test of `listed` racing git's answers — they arrive
    out of order, so the old code was rescued by luck as often as not. The test kept asks a slower question second
    (thirty bases to check), so the first lands overtaken, every time: it fails without the fix three runs in three.
  - Tests: `tests/gitbranches.test.ts` "git stopped partway, as checkoutLater says it…"; `tests/gitpanel.test.ts`
    "Remove…'s question, git answering while you type in a note or the commit's message…", "Open in a worktree, a
    question opened before git answers…", "a list of the branches overtaken by a newer question before git answers…",
    "a new branch made, the selection moved by the panel itself meanwhile…", "a new branch made while the panel can
    only say it's asking git…", "the status line's new branch from here, a hook refusing…". Terminal checks: typing in
    the commit's message while Remove… waits (in the fsmonitor check: the worktrees trusted too, since git asked there
    runs no monitor otherwise), Open in a worktree with a question opened before git answers, the status line's new
    branch refused by a hook, the idle check's bound. Mutation-checked: each of round 3's fixes undone, its test fails
    (the fsmonitor check: without either vault guard, and without `busy`'s typing). Then: 130 and 4 unit tests, 28
    terminal checks, pass.
- 2026-10-24: round 4 of the review: the code-review skill's, on round 3's commit; the second reviewer's on the next.
  - Rejected again: the per-visit cancellation. The late answers it names besides (the checkout button's, the
    merge's, the status line's switch) read HEAD and the files again, in the vault you're in: nothing acts on the one
    left.
  - Real, fixed, each with its test: `Overlays.busy` missed the outline's filter and Problems'; `GitPanel.touched`
    missed the selection moved by the panel's filter (`filterKey`, `sidebarRefiltered`); a new list of the branches
    carried the last repository's answer into the next vault, which could drop that vault's first answer (latent:
    `git.entries` cleared on a switch kept the panel from asking that early) — carried within a repository only;
    `shown` touched the folds and the selection of a hidden panel; an overtaken answer that was a failure wiped the
    branches listed — `shownOn`, a pure function, decides where an answer lands, and never a failure; `stoppedPartway`
    matched a path git quoted — anchored to `failureOf`'s own words; the first hook test had no `core.hooksPath` of
    its own. The test of an overtaken answer depended on which git process finished first: it is `shownOn`'s own
    test now, deterministic. `BranchList` kept its key besides the root and generation it's made of; `relisted` and
    `rowOf` used where the same lines were spelt out; the rows built once, or twice when unfolding.
  - Terminal checks: the outline's filter typed in while Remove… waits (in the fsmonitor check), the filter's keys and
    the panel closed while a branch is made (in the moved-on check: the Branches folded first, so a closed panel
    unfolded shows). Mutation-checked: each of round 4's fixes undone, its unit test fails; of the terminal parts, the
    outline's filter and the closed panel fail without their fix — the filter's keys can't be told apart there, the
    `/` that starts the filter being a panel key itself (its unit test sets the filter going without it).
  - Then: `tests/gitpanel.test.ts` and `gitbranches.test.ts` 85 pass; 28 terminal checks pass.
- 2026-10-24: round 5 of the review, the code-review skill's on round 4's commit:
  - Rejected: the selection judged by the row selected when the branch was asked for (tried in round 3: rows above
    it come and go as git answers, so it looked moved when it wasn't); one refresh-and-draw for the dozen copies of it
    across slipbox (older than this change, beyond it); the rows built twice when unfolding (once per branch made).
  - Real, fixed, each with its test: `busy` read the typing flags whatever had your keys, so a filter left on refused
    Merge…'s menu clicked after it, every time — `Overlays.keysGo` says where your keys go as `Input.dispatchKey`
    sends them, and a list is refused only if they've gone somewhere else since it was asked (`busy(since)`, the
    asking's `keysGo` kept by each); a key sequence begun (`app.pending`) wasn't counted; the wheel over the panel
    didn't count as using it, and a branch selected while the panel was pinned stayed out of sight — the wheel counts,
    and a selection made unpins; the last list's own failure still replaced what was listed — `shownOn` never shows
    a failure; "stopped partway" was read off the message's words — `checkedOutLater` says it as git's run ended
    (killed, or too much printed), and `newWorktreeLater` takes it from there; `keepBase` written twice, once now.
  - Terminal checks: the filter on and Merge… clicked (its menu opens), a key sequence begun while Remove… waits (in
    the fsmonitor check), the wheel while a branch is made (in the moved-on check). Mutation-checked: every unit test
    fails without its fix but one — reading the keys by region rather than any note in insert mode: with where they
    went kept as it's asked, the two can't be told apart from outside (a note's insert mode doesn't change while the
    keys are elsewhere); kept, to say what `dispatchKey` does. Of the terminal parts, the filter's and the
    sequence's fail without their fix; the wheel's doesn't (the scroll is counted another way there too).
  - Then: `tests/gitpanel.test.ts` and `gitbranches.test.ts` 88 pass, with the tests that count frames and `marks`
    135; 28 terminal checks pass. The decision numbered: D263.
- 2026-10-24: round 5's second half, the second reviewer back, on the squashed head: four findings.
  - Real, fixed: a removal done once another vault was gone into folded a branch of that name opened up there — now
    only in the vault it was asked in; the test of git's news during a branch's making overrode `key()`, which the
    list doesn't use since round 4 — it makes real news (the generation moved before each list is asked) and checks
    the lists asked; the manual and the design said `git branch -d` asks for the branch to be merged here — merged into
    its upstream, or, with none, here; the moved-on terminal check waited a fixed time before asserting nothing was
    selected — it waits for the branch's row, drawn in the frame that shows the decision.
  - Taken in part: a dropped answer, the vault left, shows nothing on screen, so the terminal checks of it still wait
    a while (the fsmonitor's second per `git status`, three over); there the unit tests, which wait on the guard being
    asked, are what fails without the fix.
  - Then: the reached unit tests and 36 terminal checks pass.
- 2026-10-24: round 5's first half had ended with the code-review skill's: the second reviewer, past its usage limit,
  was left out then, as the maintainer decided; it came back for the second half. Rebased on `dev` (#44, #34), the
  branch squashed to one commit first (the CHANGELOG's lines kept, `dev`'s first); then the tests this reaches, 162 unit
  and 36 terminal checks (#44's panels among them), pass. Five rounds of review in all, each finding fixed or said why
  not, here.
- 2026-10-24: CI on the head failed on macOS alone, in #34's test (`tests/tui.test.ts`, "a link's target that matches
  nothing keeps its list while typed…", the line after `[[zz` is typed on a new line: nothing should show). Not this
  change's doing: the items shown matched "zz" on their `filterText`, which holds each file's whole path, and that
  run's random temporary folder was `two-dG0Zz7`. Run here under `nice`, the test passes as it is (three of three);
  with `TMPDIR` under a folder named `run-Zz`, it fails at that line, on this branch and on `dev`'s own code alike (an
  export of `origin/dev`, no D263 in it; there it passes as it is, six of seven, the seventh the same flake). No
  frame's timing is involved: what fails is which items match. The test, #34's, depends on the random name of the
  temporary folder having no two z's; a follow-up for it, not this change's.
- 2026-10-24: CI on the rebased head again: two other changes' flaky tests, re-run green — `walk-thread.test.ts`'s
  thread-against-here test (`opened` in one answer only; fixed in `dev` by #54) and, in #34's test, the `tod` step on a
  temporary path holding "to" (fixed in `dev` by #49 and #54). Rebased on `dev` as it moved (#42, #49, then #59 and
  #54; #42's own test hung every pull request's run until #59): CHANGELOG.md's lines merged, `dev`'s first; the tests
  this reaches pass.
- 2026-10-24: round 6 of the review, the last: the maintainer now asks for three rounds at most, and a round past the
  third only to end the one in hand. The code-review skill's, a fresh reviewer's in the second reviewer's place (Codex
  stopped at a menu asking to run `gh pr view`, not answered for it), and Codex's own once its menu was answered.
  - Real, fixed, each with its test: `Overlays.keysGo` missed where `dispatchKey` sends a key that something is
    waiting for — a command of the note's (an operator, a count, `f`'s character), visual mode, resizing panes — so
    Remove…'s question could open over them, the next key answering it (both reviewers); a unit test makes each by its
    keys, and the terminal check of Remove… adds `f` in the note and resize mode. The test of git's news while a branch
    is made passed for the wrong reason: nothing drew while `listed` waited, so no news came then — the news now comes
    after every answer once it waits, and the test asks it settled before the news stopped. `whileDrawing`'s `finally`
    had no test failing without it (`drawFrame` catches its own errors): a paint that throws, then a message that must
    ask for its frame. "git was stopped" was told twice — `stopOf` in `gitremote.ts`, which `failureOf` and
    `checkedOutLater` share. The design said a message never waits for the next key, which one said while a frame is
    painted can (a spell checker's missing dictionary); the manual and CHANGELOG said a new branch isn't selected if
    you've moved the selection, where any use of the panel, or the panel not showing, counts.
  - Rejected: the row selected when the branch was asked for in place of `touched`, one refresh-and-draw for the
    copies across slipbox, and the rows built once (each rejected in an earlier round, for the same reasons); `busy`'s
    `since` "dead" (Merge… with the panel's filter on passes it) and open to another thing of the same kind (a click
    ends a key sequence, `mouse.ts`; a list's accept closes it first; the filters, the message box and the note are one
    each); `listed` on a list kept when the checkout goes away (nothing is selected without the Branches heading); the
    list's promise unhandled if git's reads threw (as on `dev`, and they return null instead); Remove…'s relisting once
    you've gone into another vault (that vault is often another checkout of the same repository, whose Branches it
    updates); one token for every late answer's checks (each answer checks what it would change — a question your keys,
    a selection the panel's use, going into a worktree both).
  - From Codex: two cases with a unit test and no terminal check. A removal done once another checkout is gone into
    now has one (the removal held by a file-system monitor in its checkout alone; the branch, opened up there, stays
    so). A new worktree git is stopped making has one and a unit test of `newWorktreeLater` (a trusted hook printing
    more than slipbox reads: said stopped, kept with its base, listed and selected).
  - Mutation-checked: each fix undone (six of `keysGo`'s, the news test's against a `listed` waiting for the newest
    list, `whileDrawing` without `finally`), its unit test fails; the terminal check fails without `keysGo`'s command or
    resize line; the removal's check fails without `still(removing)`; with a stop not known as one, the unit test and
    the check fail. Not caught: `newWorktreeLater`'s early `left` on a stop — stopped in the hook, the worktree already
    holds the branch and `git branch -D` refuses it anyway; a stop before that is a window no test opens. Then the
    reached unit tests, the terminal checks and `check:docs` pass.
- Follow-up, found by the terminal checks, older than this change: a hook's refusal is said as git's first line, not
  the hook's — `git: Preparing worktree (new branch 'agent/x')`, `… made, but git: Switched to branch 'agent/x'` —
  since `gitReason` (`src/core/workspace/git/branches/gitremote.ts`) falls back to the first line when there's no
  `fatal:` or `error:` one.
