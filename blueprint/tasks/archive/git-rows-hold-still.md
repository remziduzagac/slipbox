---
status: done
assignee: claude-14
blocked_by: []
tracker: [gh:#14]
created: "2026-10-23"
---

# T17: The git panel's rows hold still under the pointer and the selection

The git panel's rows stop moving under the pointer and the selection as git answers, so a click or a key lands on the
row it was aimed at: its repositories aren't sorted under the pointer, and every row is known by what it is.

## Description

In a vault that isn't a repository (home, a folder of repositories), the git panel lists the repositories by what
needs attention (VV-D10), as far as git has said: each draw sorts them again by the states known so far. git answers
for each checkout in the background, so rows move as the answers come in, and a row can change under the pointer
between moving to it and clicking. The same holds for **Other repositories** and **More in home** under a
repository's own panel, and for the keys: the selection is an index, so a sort puts another repository under it.

## Acceptance criteria

- A test puts the pointer on a repository's row before git has answered, lets git answer, and finds the same
  repository under the pointer, and a click there opens that one; with the pointer off the list, the rows take their
  order by attention. It fails without the fix.
- A test selects a repository by keys before git answers and finds it selected once they're sorted, a checkout's and a
  file's row too; the panel's own pick (the first row, the filter's first match) stays first.
- Tests for rows arriving or going above: the selection stays on its row (a branch, a file, a change by its lines); the
  row under a resting pointer stays on its line; a click or a key between frames acts on the row drawn there, or on
  nothing when it's gone.
- design/tui.md § Side panes says, of the repositories in the view, when the order holds; D261 records the choice.
- The manual (`docs/manual/git.md` § The repositories around you) says it, and the CHANGELOG has a line.

## Out of scope

- How attention is scored (`attention`), and which repositories are asked about.
- The other side panes (the explorer, the history, the outline): their rows aren't git's answers.

## References

- Delivers: design/tui.md § Side panes: explorer (plan `3.7`), history, the git panel, Info, outline and footnotes
  (the repositories in the view).
- Rests on: VV-D10, GIT-D11; GIT-D8 (the panel by mouse); D261.

## Log

- 2026-10-23: Reproduced on `dev` (be3674a) with a test: three repositories, by name before git answers (alpha, beta,
  gamma); the pointer on alpha's row; once every checkout has answered, the next frame draws gamma, beta, alpha, so
  the row under the pointer is gamma's. Fails as `Expected "alpha,beta,gamma", Received "gamma,beta,alpha"`.
- 2026-10-23: Cause: `RepoView.ordered` (src/tui/gitreposview.ts) sorted by `attention` of the states known so far on
  every `rows()` call — every frame, every click, every key. Each checkout's state comes in on its own (`stateOf`, a
  render each), again on git's news and when the panel's shown again, and when scrolling draws rows not asked before,
  so "until all answers are in" never quite comes for a long list. The mouse's rows are by index (`git:row:<i>`), and
  a click takes `rows()[i]` at the click. `rows()` runs between frames too (keys, clicks, the footer), so the order to
  hold is the one a frame drew, not the last computed. The keyboard has the same bug: the selection is an index.
- 2026-10-23: Decided with the user (D261): the hold ends when the pointer leaves the rows, not on a key; the keyboard's
  selection is fixed here too, following its repository.
- 2026-10-23: Fixed (src/tui/gitreposview.ts, gitpanel.ts, draw-git.ts, mouse.ts, panels.ts): the repositories are
  sorted only for a frame drawn (`GitPanel.drawnRows`, `rows(true)`), and not while the pointer is on the panel's rows
  as the last frame drew them (`gitRows`, against `Mouse.at`, where the mouse last said it was), the mouse on. Every
  other `rows()` gets the order last drawn for the folder the repositories were found in. Every repository found is
  ranked, those the filter or a fold hides too. When a frame sorts them differently, the selection goes to the row it
  was on in the order drawn, if it's a repository's, a checkout's or a file's of one, and scrolls into view; where the
  panel put it (`place`: the first row when it's shown, the filter's first match, off a note), it stays in the place.
- 2026-10-23: Dead ends: remembering the selected row of the last frame by its index, to also follow rows shifted by
  an opened repository's files, overrode a selection made on purpose at the same index (the filter's first match);
  dropped. Holding by what's under the pointer (the hot id, `git:row:3`) missed a pointer resting below the last row
  when rows came under it, and a stale id held forever once the mouse was turned off; replaced by the pointer's
  position against the rows as drawn. Ranking only the repositories drawn put a filtered one first when the filter
  was cleared.
- 2026-10-23: Tests (tests/gitpanel.test.ts, "the repositories hold still as git answers…"): the pointer's row held as
  git answers, on the screen too, a click opens it; held on a row's button and on the empty rows below, and through
  git's news; off the rows or the mouse off, sorted. Between frames nothing moves, a click at alpha's row opens alpha.
  The selection follows a repository's row, a checkout's and a file's through three sorts, and scrolls into view.
  The panel's own pick stays first on opening and after a filter; the filtered-out ones are in their places again;
  clicked, by either button, it's the user's and follows. Another view isn't held to the last's order. Five of the six
  fail with the fix undone (the sixth guards the fix's own view check); fifteen mutations (the hold, on a row only,
  the mouse off, sorting between frames, the view check, the old folder's list, ranking only those shown, a sort
  unnoticed, the follow, the place, the scroll, a key or a click keeping the place, a checkout's and a file's id) each
  fail at least one.
- 2026-10-23: Ran: tests/gitpanel.test.ts (40 pass), tests/tui-git.test.ts (73 pass), tui.test.ts's source control,
  commit, branches, remote, mouse and filter tests (67 pass); `test:terminal "git panel"`, the six git panel checks,
  pass; the typecheck, the lint, `check:boundary`, `check:size`, `check:docs` and `test:docs` pass.
- 2026-10-23: Live, this worktree's slipbox on a scratch home (`scripts/build-home.ts`), `~/work`'s three
  repositories in the git panel (infra ✎5, kestrel ✎4, product clean): product selected by keys; product changed and
  infra cleaned from outside, a note written so the watcher brought git's news: kestrel, product, infra, the selection
  moved with product to the second row, and enter opened product. Its file selected, infra changed: infra, kestrel,
  product, the file still selected (`enter diff` in the footer). The pointer's part was tried through the App's mouse
  events in the tests, as the terminal reports them: the terminal tests' harness has no mouse.
- 2026-10-23: Live again on the revised fix, the same scratch set: the first row selected as the panel opened
  (infra), infra cleaned from outside and git's news brought: kestrel, infra, product, the first row still selected,
  now kestrel. Product chosen by keys (`j j`), then changed: kestrel, product, infra, the selection moved with product
  to the second row, and enter opened product.
- 2026-10-23: Reviewed (Codex, then an independent review). Taken: the order a frame drew, not the last computed; the
  view check, then keyed to the folder the list was found in, since a view keeps showing the last one's list until
  its own is found; the manual and the CHANGELOG narrowed to the order; the pointer's position instead of its hot id,
  the mouse off releasing it; every repository ranked; the panel's own pick kept in its place; the selection scrolled
  into view; each repository's score worked out once per sort, and the row selected read again only when a sort moved
  something. Not taken: following the selection in the panel's other sections (out of scope, above); a selection
  read from the rows the last frame drew, which mistakes a selection made since against the rows as they are now; a
  root decision's number, given when it's merged.
- 2026-10-23: Codex on the revision: a click on the row the panel had picked left it marked as the panel's place (the
  index alone said so), so it didn't follow its repository; nor did `j` then `k` before a frame. Verified by tests
  that fail without the fix; fixed: any action of the panel's (its keys), a click and a right click make the
  selection the user's (`GitPanel.action`, `select`), as do the filter's up and down.
- 2026-10-23: Pull request #43, CI green. Review round 1, two reviews of its whole diff (Codex, and an independent
  one), twelve findings merged:
  - Verified, fixed (each with a test that fails without the fix): `esc`, the filter and the panel's own keys cleared
    the panel's first-row pick, which then followed a repository down; now only a key that moves the selection or
    acts on a repository's row, or a click, makes it the user's. A pointer last reported before the panel's rows
    showed (over the explorer, the panel then opened by keys) held them for good, and so did one from before the
    mouse was turned off and on again; now the pointer holds only once it's reported after the rows showed with the
    mouse on (`unmoved`). The scroll test didn't show the selection drawn: now an overflowing list, the followed
    repository's row drawn. The manual said the first row is selected whenever the panel opens; a selection to come
    back to is kept, and it says so.
  - Verified, changed: home's repositories were sorted while folded, on every `rows()`; a folded section isn't sorted
    now. The sort read the mouse and the last frame's geometry from the repositories' model; the panel decides
    (`drawnRows`) and passes `hold` or `sort` down. The decision, then `D?1`, was cited in nine places in the code; now
    in two.
  - Rejected: rows still found by index (hot ids, the selection), so rows that come or go above move the rest — the
    order is this fix's scope, said in the design, the manual and the decision; asked of the user. The panel's rows
    built twice when a sort moved something: only on such a frame, and the row selected needs the whole panel's rows.
    A design change through a task rather than a workstream: a small change is an issue and one pull request that
    changes the design file with the code (D223). The tests' "nothing answered yet" depending on timing: git answers
    from a child process, never between the frame that asks and the check after it, and the tests assert it.
  - Ran after the fixes: the #14 tests (8), seventeen mutations each caught; tests/gitpanel.test.ts (42),
    tests/tui-git.test.ts (73), tui.test.ts's git, mouse and filter tests (67); the six git panel terminal checks.
    Live: the panel opened, left by `esc`, a repository changed from outside: the first row still selected after the
    sort.
- 2026-10-23: Asked the user about round 1's scope finding (rows still found by their place, so rows arriving above
  move the rest); the user decided #14 covers it. Planned with Codex, whose critique was taken: keys scoped by kind,
  a change by its lines, several rows of one key none of them; a row gone since it was drawn does nothing; the view
  restored and the filter, the wheel, the scrollbar and a key's move not held off by the pointer; the footer resolved
  as the clicks are; the anchor's limits said.
- 2026-10-23: Built (`src/tui/gitsteady.ts`, `Steady`, as `GitPanel.steady`): every row's key (`rowKey`); the
  selection kept as a row — every writer of the panel's selection through `select` or `place` (the keys, clicks,
  right clicks, the filter's up and down, a file staged and followed, `collapse` of a file, a branch, a repository,
  a branch made), one that doesn't say taken as it is; the row under a resting pointer back on its line (`settle`),
  past the list's end if it must, the last row kept where it is when the pointer is below it, not across a scroll,
  a filter, a key's move or another repository; a click, a right click and the footer by the row the last frame drew
  at the index (`rowAt`, `hotNow`), a key by the row drawn selected, a row gone since doing nothing. What's under the
  pointer is worked out again after each frame (`Mouse.rehover`), the hover drawn from the frame's own rows.
  `RepoView`'s own row ids and its "moved" check went: the selection by key covers them. The follow's own check of
  "another repository" went too: its mutation changed nothing (a new repository's branches aren't there on the first
  frame), and a selection landing on a row of the same name is harmless; the anchor's stays, tested.
- 2026-10-23: Tests (tests/gitpanel.test.ts, "the panel's rows by what they are…"): the selection on a branch as new
  files arrive above; the pointer's row on its line, the wheel's scroll and the filter not held; the last row kept when
  the pointer rests below it; rows gone above a scrolled list's pointer row; a key's move shown though the pointer
  rests; a click or a key between frames on the row drawn there; a row gone since: a click or a key does nothing; the
  explorer and back; a change edited isn't taken for the one selected; two alike, the first stays the first; a
  selection set without the panel kept; another repository's row of the same name not scrolled to; the footer by the
  rows as they are; the hover after a frame. Seven of the first eight fail with the widening undone (the eighth guards
  it); 28 mutations each fail at least one.
- 2026-10-23: Ran: tests/gitpanel.test.ts (56 pass), tests/tui-git.test.ts (73), tui.test.ts's hover, mouse, click,
  pointer, wheel, scroll, filter and git tests (137), tests/regex-jobs.test.ts (17, it drives the mouse); the six git
  panel terminal checks; the typecheck, the lint, `check:size`, `check:docs`, `test:docs`.
- 2026-10-23: Live, the scratch set's kestrel: the branch `jo/release-notes-wording` selected by keys (`G`, `k`), two
  new files written from outside; Untracked went from 3 to 5 above it, and `enter` opened that branch.

- 2026-10-23: Terminal checks for every case (`tests/terminal/checks/git-steady.ts`, fourteen, the pointer as a
  terminal reports it, SGR's mouse reports; git's answers brought from outside: a file changed, a note written so the
  watcher brings git's news). Writing them found three things, each fixed with a unit test that fails without it:
  - After a sort, the row under a still pointer was another but its hover id the same string (`git:row:3`), so the
    frame wasn't drawn again and the old row kept the hover: now the frame asks to be drawn again when the row under
    the pointer isn't the one it drew by (`gitHover`).
  - A file's changes vanish for a frame or two while git's answer is read again: the selection on one, and the row
    under a resting pointer, went to whatever came to their place and stayed there. Now a row gone a moment is still
    the one (`lost`, `anchorLost`), found again when it's back; meanwhile a key acts on the row drawn selected.
  - Once the wheel had scrolled the panel, a key that moved the selection never showed it (`pinned`, as on dev): a
    key's or a click's pick now lets go of the wheel's scroll.
  The checks also showed the anchor working as meant: headings arriving above the pointer's row go out of sight at
  the top. Eleven of the fourteen fail on dev's code; the three that pass there (the filter's places, two alike
  changes, another view: dev holds nothing, so sorts them right) guard the fix's own workings, each failing with its
  part of the fix undone.
  Left to the unit tests, a terminal unable to put a key or a click between two frames: a click or a key between
  frames, a row gone since it was drawn, a change edited between frames, a selection set without the panel between
  frames; and the pointer's row not taken into another repository, which needs one repository inside another's view.
- 2026-10-24: Ran again, the machine's load under 10: tests/gitpanel.test.ts (58 pass; the one that had run out of
  bun's five seconds at a load of 25 passes), tests/tui-git.test.ts (73), tui.test.ts's hover, mouse, click, wheel,
  scroll, filter and git tests (136; a pictures test, Mermaid's rasterising, no mouse in it, failed once at a load of
  18 and passes alone), tests/regex-jobs.test.ts and tests/terminal-coverage.test.ts (26); all 32 mutations caught;
  `test:terminal "git panel"`, 20 of 20.
- 2026-10-24: Pull request #43 pushed, CI green. Review round 2: the independent review's thirteen findings (Codex at
  its usage limit, its half of the round to follow):
  - Verified, fixed, each with a unit test failing without it and a terminal check: rows alike (two changes alike in
    a file) were none of them, so a key or a click on either did nothing, and a pointer resting on one had the
    frames ask for one another without end; now rows alike are told apart by their order (`keysOf`). A selection
    following its row let go of the wheel's scroll, so rows arriving above it jumped the view back; now the wheel's
    scroll is kept, a key shows the selection. The panel's top growing over the pointer's line (the buttons wrapped
    by Review) scrolled its first rows out of sight; now a line no longer the list's isn't kept. A row gone for good
    was kept to for ever, and a row like it coming back pulled the selection there; now a second, then the row in
    its place. The filter's up and down stepped from the index, not the row drawn selected. A key on a row gone in
    a folder of repositories said "not in a git repository"; now nothing. Into another repository with the
    selection at the same index, it was pulled to that repository's row of the same name; now what was selected
    or pointed at isn't looked for in another repository, note or view. The panel's own keys missing from the hand
    list (Resolve, a new branch) made its pick the user's; the list went: a key acting on the row is the user's, a
    repository's row by its own actions (`REPO_ACTIONS`).
  - Verified, changed: the footer worked the panel's rows out again on every frame; it takes the frame's hover. Keys
    worked out once per list of rows; a change's lines hashed. The hot id's parser is one (`hotRow`).
  - Rejected: the selection's row may go out of sight while the pointer rests (its line wins), said in the design and
    the decision; the panel's rows found by their index under a translation, not rebuilt on keys: contained, tested,
    and a rebuild of the panel's every section's hot ids; the decision's number (then `D?1`), given at merge: D261.
  - The terminal checks for these: the alike check extended (a click on the second, `s` stages it, the frames
    settling with the pointer on one), new ones for the wheel's scroll, the panel's top growing, a row gone for good
    and the pick acted on by a key, `n` in the first-row check. On the code before round 2, the wheel's, the alike
    and the `n` checks fail; the top-growing check passes there too (the terminal didn't bring the old code's slip
    about: the unit test does), and the gone-for-good check, written wrong at first (Staged's huts.md looked at),
    fails there once it looks at Changes'.
  - Ran: tests/gitpanel.test.ts (67), tests/tui-git.test.ts (73), tui.test.ts's hover, mouse, click, wheel, scroll,
    filter and git tests (137), tests/regex-jobs.test.ts and tests/terminal-coverage.test.ts (26); 37 mutations, each
    caught; `test:terminal "git panel"`, 23 of 23; the lint, `check:size`, `check:boundary`.
  - Live: two changes alike in the scratch set's product (`twice.md`), opened up by `l`, the second chosen by `j j`,
    `s`: line 14's staged, line 3's not.
- 2026-10-24: CI on round 2's push: the spelling check found the three letters a terminal check types in the filter on
  purpose (now marked for typos); one push later, a terminal check failed on Ubuntu x86 only: it took the panel's own
  pick for the Changes heading, but when git has answered as the panel opens, the pick is the first file. The check now
  takes whichever it is; the new checks ran three times over, 51 of 51. A macOS failure the push before, `:Commit`
  waiting for its message (links-and-files), passed locally and on the next run.
- 2026-10-24: CI on the next push: the spelling check again, on this log quoting those letters (reworded); a macOS
  unit test of `:!cmd` (tui.test.ts, 25.7), its shell's stderr line landing before its stdout's, no git panel in it,
  passes locally.

- 2026-10-24: Round 2's second review (a fresh Claude reviewer, the user's choice with Codex at its usage limit), the
  whole diff, five defects and the docs' overclaims:
  - Verified, fixed, each with a unit test failing without the fix and a terminal check: a click on a row's `+` (and
    the follow of a file staged to where it went) let go of the wheel's scroll, so staging by a click jumped the
    view to the top (a regression of round 1's fix); now only a key that moves the selection does. The panel's own
    pick was found by its index between frames, so `u` with Staged arrived since unstaged everything; now by the row
    drawn there, as the user's picks (or the row set since). The explorer, revealing a note (`o` on a file, any
    note opened) while the git panel was shown, wrote its own index into the panel's selection (as on dev); now it
    sets the left panel's selection, scroll and pin only while it's the view shown. Closing or switching the note
    forgot the selection's row (the note was part of what the rows are of), so This file's rows going put it on
    another branch; This file's rows are known by what they do, the note left out. Scrolled past the list's end for
    the pointer's row, the scrollbar's thumb was drawn under the list, on the footer and the pane's border; now the
    blank counts.
  - A dead end, tried and taken back: a row gone from under a resting pointer (a file staged by its `+`) gave its
    line to the next, so repeated clicks staged file after file. Kept in place, the rows arriving above (the Staged
    the file went to) went out of sight, and the existing check that stages by `+` then unstages by `−` in Staged
    failed: rows move as they come for a row gone, as on dev.
  - Docs: the design's "nothing comes under the pointer" said of rows above the last; the manual's stray line break;
    the alike terminal check now checks the second change selected and line 14's change staged, not line 3's.
  - Not taken: the cost of the keys (`keysOf`): proportional to the rows the panel already works out each frame.
  - Ran: tests/gitpanel.test.ts (72), tests/tui-git.test.ts (73), tui.test.ts's hover, mouse, click, wheel, scroll,
    filter, git, explorer, reveal, zoom, view, rename, trash and folder tests (379), tests/regex-jobs.test.ts and
    tests/terminal-coverage.test.ts (26); 43 mutations, each caught; `test:terminal "git panel"`, 26 of 26 (the new
    ones also failing on the code before these fixes); the lint, `check:size`, `check:boundary`, `check:docs`,
    `test:docs`.
  - Live, the scratch set's product: a file selected by keys and opened by `o`, back to the panel: that file still
    selected; `main` selected, every tab closed (This file's rows gone): `enter` opened `main`.
- 2026-10-24: Codex's part of the review loop skipped from round 2's second half on (its usage limit, then a menu in
  its pane): a fresh Claude reviewer did it in round 2, and round 3's two reviews are the independent code review and
  another fresh Claude reviewer.
- 2026-10-24: Round 3 (the independent code review, eleven findings; a fresh Claude reviewer, five low ones, four of
  them overlapping or a test missing), merged and each checked against the code:
  - Verified, fixed, each with a unit test failing without the fix: a row gone for good could be found again after
    an idle stretch with no frame drawn (the derived `lost` flag gone with it); a key of the panel's own wrote the
    index up front, so its pick became the user's; the panel's follow of a file staged, answered while the explorer
    was shown, wrote the explorer's selection (now the place the git panel comes back to); between a switch into
    another repository and its first frame, a key or a click acted on its row of the same name; resolve and a new
    branch acted when their row was gone; the filter's `enter` checked the index drawn, not the row; the pointer
    resting on the scrollbar's column held the rows, so a thumb held was scrolled back; scrolled past the list's end
    for the pointer's row, the wheel down moved the rows down. Four of the explorer's guards (round 2) had no test of
    their own; the panel's click, right click and footer each parsed the hot ids again (`hotRow` now).
  - Terminal checks for the three a terminal drives: the pointer on the scrollbar, the wheel past the end, the
    explorer's view zoomed out to a note opened and its folder deleted while the wheel had scrolled the panel. The
    rest happen between two frames, on git's answer landing as the view switches, or after a second with no frame.
  - Docs: D261's cost says rows alike are told apart only by their order, and the wheel past the end; the design and
    the manual say the scrollbar holds nothing.
  - Partly taken: the rows passed where they're in hand (the filter's pick and place); the rest is proportional to the
    rows the panel works out each frame.
  - Not taken: carrying a row's key in its hot id, the same redesign as round 2's; the translation is contained and
    tested.
  - Ran: tests/gitpanel.test.ts (82), tests/tui-git.test.ts, tests/regex-jobs.test.ts and
    tests/terminal-coverage.test.ts (181 in all), tui.test.ts's hover, mouse, click, wheel, scroll, filter, git,
    explorer, reveal, zoom, view, rename, trash, folder and info tests (371); 59 mutations, each caught (three caught
    only once tests were added for them: the row in a gone row's place, a click into another repository, the
    explorer's `select`); `test:terminal "git panel"`, 30 of 30, the three new ones each failing with its fix undone
    (the explorer's three guards each undone too: the Info shown reads the explorer's rows while it's hidden); the
    typecheck, the lint, `check:size`, `check:boundary`, `check:docs`, `test:docs`.
  - Live, the scratch set's product: filtered by `d`, `d5.md` selected, then `d1.md` and `d2.md` moved out: `d5.md`
    selected still, and `enter` opened its diff.
  - Rebased on dev (#40, #42): the same unit tests and `test:terminal "git panel"` again, 30 of 30; tui.test.ts's
    subset without dev's two new "home never walked" tests (368), which spin at full CPU on this machine, on dev's
    own code too.
- 2026-10-24: Round 4, on round 3's fixes: asked for by the user ("fix them once the second review is in", read as a
  fourth round, taken as recommended while the maintainer was away). Codex (two findings) and the independent code
  review (thirteen), each without the other's, merged and checked against the code:
  - Verified, fixed, each with a unit test failing without the fix:
    - A new pick kept the last row's moment (`lostAt`), so a row picked after a row gone a while was let go of at
      once (both reviews).
    - In a checkout, the explorer's view was part of what the rows are of, so its zooming out to hold a note opened
      dropped the selection's row as This file's rows came above it; now the checkout alone.
    - The panel's follow of a file staged, answered with the explorer shown, read the explorer's filter: now the
      panel's own (`GitPanel.filter`).
    - The pointer row's moment (`anchorLost`) outlived its anchor, so a later row gone a moment in its first frame
      wasn't held.
    - Between a switch into another repository and its first frame, the panel's own pick there was ignored too: a pick
      made in that repository since is looked for.
    - Round 3's early return for `resolve` caught the panel-wide `[Resolve]` button: only a new branch does nothing
      now.
    - Older than this branch, on the line it edits: outside a repository, **More in home** couldn't be unfolded (a
      heading's keys stopped at "not in a git repository").
    - Older too, and kept here (taken as recommended while the maintainer was away, with the home heading): the
      explorer's rows changed while it wasn't shown (a note revealed, a zoom, its folder gone, a path selected), it
      came back at its old index, another row's; it now notes where its selection goes (`later`) and puts it there when
      shown again (`shownAgain`, from `switchLeftView`).
    - `gitsteady.ts` wasn't in `ci-scope.ts`'s git list; `openLeftView` built the rows twice; `BranchSubRow.of` is
      `against`, as `BranchFileRow`'s.
  - Terminal checks for those a terminal drives: More in home by `enter` and a click; the view zoomed in, every tab
    closed, then a note opened outside it; a file staged as git is slow to answer (a `git` that waits on `status`
    while a flag is there), the explorer shown meanwhile, then filtered (Codex's missing case); the explorer shown
    again after its view zoomed out. Each fails with its fix undone.
  - Not taken: a cache of a change's key on its object (the objects are made again on each `rows()`, the file diffed
    again, so it would never hit; the hash costs what the diff already does); a row's key in its hot id (the redesign
    rounds 2 and 3 didn't take); the reset in `place` (a placed selection never follows its row, so it couldn't be
    seen).
  - dev's two new "home never walked" tests (#42) hang: CI's `test` jobs here, and dev's own since #42, cancelled at 45
    minutes; locally too, on a plain copy of dev. Left to #42's own fix, not this pull request (taken as recommended
    while the maintainer was away).
  - Ran: tests/gitpanel.test.ts, tests/tui-git.test.ts, tests/regex-jobs.test.ts and tests/terminal-coverage.test.ts
    (191 in all); tui.test.ts's subset (375, dev's hanging test left out); 72 mutations, each caught; `test:terminal`
    for the git panel, the explorer, the view and home, 74 of 74, round 4's four new ones each failing with its fix
    undone; the typecheck, the lint, `check:size`, `check:boundary`, `check:docs`, `test:docs`.
- 2026-10-24: Round 5, on round 4's fixes (`b41beda`): Codex's part skipped, at its usage limit again (until 6:43);
  a fresh Claude reviewer does it, beside the independent code review.
  - The fresh reviewer (three findings) and the independent code review (twelve), merged and checked against the code.
    Verified, fixed, each with a unit test failing without the fix:
    - The explorer, filtered when it was left, lost its match on coming back: the place noted while it was hidden was
      looked for under its filter, whose rows are every note matching it, the same whatever the view. Noted places
      are dropped under a filter now (round 4's own regression).
    - `Explorer.select` while it was hidden looked for the path under the git panel's filter: now in its tree.
    - A noted place was kept across a vault switch, and taken in the next vault for its row of the same name: now
      noted with its vault's root.
    - Outside a repository, the context was the view asked for, though the rows drawn are the last view's until the
      new one's repositories are found: the first frame took the old list for the new one, and the row under a
      resting pointer was then held in the new list, scrolled. Now the folder of the list drawn
      (`RepoView.listedDir`).
    - A context change dropped a pick made in the new context before its first frame: kept, and followed.
    - `n` on any row gone did nothing: only on a branch gone, as round 3 meant (`Steady.sought`).
    - The moment a row gone is kept for belonged to no row (`lostAt`): another row picked through `place` or a writer
      that didn't say inherited it. It's the row's now (`lost`: its key, and since when), round 4's reset in `select`
      folded into it; a place cleared across the moment's end isn't reachable in a test without contriving frames,
      so it's covered by the same mechanism's tests.
    - The More in home test restored `HOME` as the string "undefined" when it had been unset.
    - Cleanups: `GitPanel.selectWhere` for the five rows-found-selected sites (one passed -1 through); `settle`'s
      dead `Math.min`; the design says `Mouse.rehover` works for every region under a still pointer, not the git
      panel's alone, and which file `resolve` opens (this note when it's in conflict).
  - A terminal check for the one a terminal drives: the explorer filtered, left by its rail for the git panel, a note
    opened there, then back: its match selected. The rest happen between frames, across a vault switch, or need a
    frame drawn before a folder's repositories are found.
  - Not taken: each left view's state an object of its own instead of the shared `app.sidebar` (the guards it would
    remove are few and tested; a refactor of every left view, beyond this pull request); a row's key in its hot id
    (the third time); the change key's hash (as in round 4: the change objects are made again with each `rows()`).
  - The vault switch's own test needed a vault where no note opens, in a hidden folder (the view moves to it, noting
    nothing): elsewhere the switch's zoom, or the new vault's note revealed, notes the new vault's place first.
  - Ran: tests/gitpanel.test.ts, tests/tui-git.test.ts, tests/regex-jobs.test.ts and tests/terminal-coverage.test.ts
    (197 in all); 78 mutations, each caught; `test:terminal` for the git panel, the explorer, the view and home, 75 of
    75, the new one failing with its fix undone; the typecheck, the lint, `check:size`, `check:boundary`,
    `check:docs`, `test:docs`.
- 2026-10-24: Round 6, on round 5's fixes, the last (the maintainer's rule, 2026-10-24: at most three rounds, the
  round in hand the last when past them; smaller findings to the Log). Codex (two findings) and the independent code
  review (ten), merged and checked against the code:
  - Verified, fixed, each with a unit test failing without the fix:
    - A row gone, back after a while with no frame between, then picked again (the panel following a file) kept its
      expired moment, so it was let go of at once: an explicit pick starts its moment afresh (`select`).
    - Older than this branch, in a block it edits: in a checkout, a row under Other repositories selected, the
      panel's own keys (`i`, commit, fetch, push…) went to the repositories' view, which ignored them; only the
      repositories' own keys (`REPO_ACTIONS`) go there now. A terminal check: `i` on lib's row types the message.
    - The filter's `enter` on a match gone since the last frame turned the filter's typing off, then did nothing, so
      the letters typed next were the panel's keys (`s` staging); it now looks for the row drawn selected, raw, and
      does nothing on one gone.
  - Not taken, for a follow-up (a decision of what users see; taken as recommended: logged here, not in this pull
    request):
    - The pointer's line wins over the selection even when the rows come from the user's own key (`l` opening up the
      file selected, the pointer resting below it): the file and its changes scroll off the top. A key releasing the
      pointer's anchor, not the order's hold (which the user chose to end by the pointer only), would answer it.
    - A pointer resting on the blank below a short list keeps the last row where it is (round 2's choice, so nothing
      comes under the pointer): rows arriving above scroll the top, the headings and the selection, out of sight,
      the pane mostly blank.
    - Scrolled past the list's end for the pointer's row, a wheel up lands the list at its end at once, a jump of
      many rows rather than three.
    - `textsOf` drops an opened file's texts on every git answer, so its changes blink out until read again; keeping
      the last generation's until the new one's are in (as `aheadFiles` and `RepoView.found` do) would remove the
      need for the moments (`A_MOMENT`), which a slow read outlasts.
  - Not taken, cleanups: `n`'s guard reads `rowKey`'s encoding (`branch\0`) rather than a kind Steady could give; the
    footer's `pointedAt` builds the rows again rather than take the frame's; the change key's hash (as in rounds 4
    and 5); each left view's state its own (as in round 5).
  - Not taken from Codex: a terminal check for `n` on a file gone since the last frame (between two frames, which a
    terminal can't place).
  - Ran: 82 mutations, 81 caught; the one left is the moment's key in `follow` (round 5's), which since `select`
    starts a pick afresh guards only the panel's own pick and a selection set without saying, after a row's moment
    ran out, a path no test reaches (it needs the repositories' sort to change between that selection and the next
    frame): kept as a guard. The round-2 test "scrolled past the list's end for the pointer's row" failed once on
    macOS in CI, the deleted files still in the rows when it looked: it now waits for them to go.
- 2026-10-24: CI on round 6's push (`dd15264`): green but for the arm runner's terminal job, where the check "view: a
  worktree kept outside the view chosen…" (`links-and-files.ts`, VV-D5) found kestrel folded, `indexing` still going;
  outside this change (the explorer shown, which the branch leaves as it was), and passing three times of three here.
  For a follow-up: the check looks for `docs/` under each of the two once `kestrel` is listed, not once its folders
  are. GitHub then said the pull request conflicted with `dev` (#57's window header, #35): rebased on `e8a421c`, the
  CHANGELOG's and the terminal checks' index's conflicts keeping both sides' lines; the git panel's unit tests and
  terminal checks (60) passed again on the rebased head.
- 2026-10-24: CI on the rebased head (`2d13bc1`): two of #57's window header checks failed on Linux, here too, and
  passed on `dev`. They took a mode button drawn bold for the selected one, and the hovered one is bold too: with
  `Mouse.rehover`, a click's place counts as the pointer's, so after clicking Lens and pressing `esc` the pointer still
  on Lens lights it (as a real terminal shows on `dev`, the pointer having moved there to click; the checks' clicks
  come without a move). The checks now read the selected one as bold on the header's own background, as their hover
  check reads lit; the design's § Hover says a click counts. The test job's one failure, "home's walk, stepped while
  nobody works…", is `dev`'s flake.
