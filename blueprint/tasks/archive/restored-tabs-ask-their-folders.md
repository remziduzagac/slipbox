---
status: done
assignee: claude-13
blocked_by: []
tracker: [gh:#13]
created: "2026-10-23"
---

# T16: Home's restored tabs have their folders walked at once

A tab of home's brought back by the session, in a folder home's walk hasn't reached, opens with its notes known, as a
file opened by name does: its folder is asked for (`Vaults.ask`, `Graph.askFolder`).

## Description

With `restore_session` on, `slipbox ~` brings back home's tabs (`Session.restore`). Only the folder or file named at
the start, or on a switch into home, is asked for; the tabs restored after it aren't. A tab whose note is in a folder
home's walk doesn't cover (never walked, or stopped at its cap) opens as a file the graph doesn't know (`App.buffer`
gives it no vault path): no backlinks, its links unresolved, until home's walk reaches it. Ask for each restored tab's
folder before its tabs open, as a file opened by name has its folder asked for, built once for all of them.

## Acceptance criteria

- A test: home never walked, its top's session holding a tab of `notes/inbox.md`; `slipbox ~` with `restore_session`
  brings it back as a note of home's graph, its link to `notes/ideas/coffee.md` resolved, a backlink there. It fails
  without the change.
- The same on a switch into home that restores its tabs (the way back, a note of home opened from a vault).
- The graph is built once for all the tabs' folders, and not at all for a tab in a folder already asked for or covered.
- design/roots.md § Home says the restored tabs are a way in.

## Out of scope

- A file of home opened from its explorer or by `:e` within home, in a folder not walked (another way in, not this
  issue's).
- What home's walk, its cap or its skip list do.

## References

- Delivers: design/roots.md § Home.
- Rests on: VV-D2, D248.

## Log

- 2026-10-23: Read: at the start, `App`'s constructor asks for `opts.folder` or `opts.open`'s folder
  (`Vaults.ask`, `src/tui/app.ts`), then `Session.restore` opens the tabs kept (`openTabs`, `src/tui/session.ts`)
  with nothing asked for them; `switchVault` (`src/tui/vaults.ts`) does the same on a switch into home. `App.buffer`
  gives a file the graph doesn't know no vault path (`rel` null), so the tab is no note of home's: no backlinks, its
  links unresolved. The comment in the test of folders' own tabs already said so ("one of a folder home's walk hasn't
  reached is no note of its graph yet").
- 2026-10-23: Reproduced on `dev` (`be3674a`): the test `home's tabs brought back, in folders its walk hasn't
  reached: …` in tests/tui.test.ts fails, the two restored tabs `notes/inbox.md` and `other/p.md` with `rel` null
  (`tmp/issue/test-red.log`, not kept).
- 2026-10-23: The plan reviewed: the cause holds. Taken from the review: the hook in `Session.openTabs`, so a
  branch's tabs (`Git.headMoved`, home being a repository) are covered too; search following a build made after
  `followGraph` started it (`IndexJob` takes the graph's notes when it's made); a file gone walking nothing.
- 2026-10-23: Fixed. `Graph.askFolders` asks for several folders and builds once for all those home's walk doesn't
  cover; `askFolder` is it for one. A folder inside one just walked whole (`home.asked.folders`) counts as covered, so
  `slipbox ~/notes` bringing back a tab of `notes/ideas` builds no second time. `Vaults.askTabs`, called first in
  `Session.openTabs`, asks for the folder of every window of every tab (a split's other one too), files gone left out;
  a build made, `Watch.rebuilt` (taken out of `homeIndexed`) brings the watcher, the background parse, search and the
  layouts along. Dead end: keeping the panes' selections there too (`rememberSelections`) throws at the start, before
  the theme is set; `homeIndexed` keeps them around its own build, as before.
- 2026-10-23: Tests in tests/tui.test.ts (`#13` in their names): the tabs back at the start; one build for all their
  folders (a spy on `Graph.prototype.build`), a split's other window, a file gone and one in `Downloads` walking
  nothing; `slipbox ~/notes` with a tab in `notes/ideas` building once; into home from a vault (`intoOther`); home a
  repository, a branch's tabs back as it's checked out; search finding the walked folder's notes. Mutation-checked
  (`tmp/issue/mut/run.py`): without `askTabs`, without the covered-by-an-asked-folder rule, without the gone-file
  filter, building per folder, without `Watch.rebuilt`, and asking the active windows only, at least one fails each
  time. Terminal check `home: its tabs brought back — …` (tests/terminal/checks/vaults.ts) passes, and fails without
  `askTabs` (2025-policy.md never listed). The tests near it pass: 54 in tests/tui.test.ts
  (`VV-D2|home|session|branch`), 63 in tests/vault.test.ts and tests/home.test.ts; the `home:`, `session:`, Elsewhere
  and branch terminal checks, 20.
- 2026-10-23: Tried live, on a home built from the reference set (`tmp/issue/home/home`, its own
  state and cache, `[index] background = false`). The release (0.4.1-preview): `:e household/bike-insurance.md` in
  `~`, quit, start again: the tab is back, but the switcher holds home's 3 top notes and finds no "bike", and `space l
  b` on `todo.md` says "no notes link to todo.md". This branch: the switcher holds 4 and finds it, and `todo.md`'s
  backlinks list `household/bike-insurance.md`. Into home from the `notes` vault (`:e …/todo.md`): home's tab back
  beside it, the backlink there too.
- 2026-10-23: Found on the way, left alone: `:e` of a file in a folder of home not walked indexes that file alone
  (20.8's index on demand), not its folder; and a buffer made while its note wasn't known keeps no vault path
  (`NoteBuffer.rel` is readonly) after the graph learns it, until it's made again. Neither is this issue's path.
- 2026-10-23: design/roots.md § Home says it; the manual (docs/manual/vaults.md § Home) and the CHANGELOG too.
- 2026-10-23: The diff reviewed. Taken: a folder in one walked whole counted as covered without the build having listed
  it, so a folder made since (a branch's, say) wasn't walked; now it's covered only when listed too (`this.dirs`), with
  a test (`a tab brought back in a folder made since …`). A test of a kept walk stopped at its cap (`home.asked` says
  `notes` was walked whole). The terminal check also writes a note into the restored tab's folder and finds it in the
  switcher, the folder watched; `inSwitcher` moved to tests/terminal/check.ts for it. Mutation-checked again: with the
  folder taken as covered unlisted, or the cap ignored, a test fails. Not taken: a buffer made before its note was
  known, reused when a branch's tabs come back. `:e` and the explorer index what they open (`reachFile`, 20.8), and
  the start's tabs now ask first, so nothing in home makes such a buffer for a note its walk can reach; one its cap left
  out is the one case left, and making buffers again is the general fix (above).
- 2026-10-23: An independent review of the diff (the code-review skill). design/roots.md § Home had this very gap under
  "Not done" ("Tabs of home's top restored in a folder its walk hasn't reached open as files the graph doesn't know"):
  the fix brings the code to what the design meant, so it's a task, and the line is gone. Taken: a tab behind a link
  not followed (VV-D6) is skipped before anything is looked at (`following.blocked`, as `App.buffer` does), so a link
  to a mount that doesn't answer holds nothing up; `Watch.rebuilt` starts no background parse in an app that isn't
  live, as the start doesn't; `askFolder` and `askFolders` share one `askHome`, home's path made once. Tests for the
  first two (`home's tab behind a link out of home not followed: …`, `indexing` 0 in the one-build test), each failing
  without its change. Not taken: (1) each restored tab's folder walked whole at every start, however big, and counted
  against the cap: what the issue asks ("as a folder opened by name is"), and what `slipbox ~/x/note.md` does already
  (D248); a trade-off for the maintainer if it should be lighter. (2) a buffer made before its note was known keeps no
  vault path, so a branch's tab reusing one, or a note reached from a pane's history, opens unknown: the general fix is
  making such buffers again once the graph knows them, a change of its own. (3) the panes' selections kept across a
  branch's rebuild: `rememberSelections` can't run at the start, before the theme, and the case is home being a
  repository; the highlight moves, nothing else. (4) one build for the start's ask and the tabs': the tabs aren't known
  before the session and the branch are, and a build happens only when their folders aren't covered. (5) the cap said
  after the tabs' build: as for a folder opened by name at the start, home's walk says it. (6) folders home leaves out
  kept as asked: as a file opened by name in `~/Downloads` keeps `Downloads`. (7) the branch test returning when git
  can't make a repository: as the file's other git tests do.
- 2026-10-23: Every acceptance criterion checked (the tests above, design/roots.md § Home); done, moved to `archive/`.
  The pull request's merge is the maintainer's acceptance.
- 2026-10-23: Review loop, round 1: the code-review skill and Codex, each on `git diff origin/dev...` alone; their
  findings merged, then each checked.
  - Verified, not this change's: a branch's tab of a note new on that branch comes back unknown, restored
    (`VaultFeed.flush`: `checkHead`, then the batch) before the graph has the note. A throwaway test on a plain
    vault, home not involved, gives the tab `rel` null (`tmp/issue/dbg/branch-plain-vault.test.ts.txt`), so it's on
    `dev` already. Its cause is the next one's.
  - Verified, not this change's: a buffer made before its note was known keeps no vault path (`NoteBuffer.rel`
    readonly): a branch's tab reusing one, a place in a pane's back history in a folder not walked. Fixing it, or the
    design saying it, waits on the maintainer: in this pull request or an issue of its own.
  - Verified, the maintainer's to decide: each restored tab's folder walked whole, past the cap, at each start the
    walk doesn't cover it (D248's rule, as the issue asks), and the cost of the build that brings: on a home of
    10,000 notes in 2,000 folders, one build took 1.2–1.9 s here; a capped home covers no folder, so each start with a
    tab in a folder pays one build more than before (`slipbox ~/notes` already paid one). And the cap's message names
    those folders "the folders you opened" (`describeCap`; the code-review's probe): the wording of what users see.
  - Rejected: the panes' selections moving under a branch's rebuild. The explorer lists folders from the disk: a
    throwaway test shows its rows the same before and after `askTabs` built (notes, notes/ideas unfolded); the outline
    is the note's own, which the build doesn't change.
  - Rejected: `askHome`'s covered rule restating `homeWalk`'s. They answer different questions: `homeWalk`'s is the
    kept walk before the folders asked for are merged; `askHome`'s is the graph as built, those merged.
  - Rejected: `askTabs` not refusing what `App.buffer` refuses (a binary file, one that's unreadable). A session keeps
    only panes that opened; one changed on disk since asks for its folder, a folder that was open, and doesn't open.
  - Taken: `askTabs` leaves home's top to `askFolders` and makes each folder once; the branch test checks each git
    step's exit and signs nothing (`commit.gpgsign=false`); the terminal check lists `app.quit` in what it covers.
    Tests pass; every mutation still fails a test.
- 2026-10-23: The maintainer's decisions on round 1: fix the buffers opened before the graph knew their file here, in
  every vault; keep the whole walk but build once at the start; the cap's message says "the folders open".
  - Buffers: `NoteBuffer.rel` can be set; `App.adoptKnown` gives each buffer its vault path once the graph knows its
    file (with each watcher batch, each `Watch.rebuilt`, a graph made anew in `followGraph`, a reindex, and a buffer
    asked for again in `App.buffer`), its window, unsaved text and undo kept. The 36 places that read a buffer's
    `rel` read it as they're used; none keeps it.
  - One build: the screen builds its graph (`run.ts` hands it over not built; a switch makes one not built), in
    `Vaults.ask`, with the folder named and, restoring, the folders of the tabs the session brings back
    (`Session.toRestore`, read once HEAD is known: the constructor makes the feed first, then asks, then starts
    search). `Graph.askFolders` builds a graph not built yet whatever is asked, with the index kept;
    `Graph.askFolder` is gone, `homePath` public. `askTabs` builds only for a branch's tabs now.
  - Tests: a branch's tab of a note only it has (a plain vault), the vault's note once the watcher's batch has it; a
    buffer reused by `:e` reaching its file (20.8), by a reindex, by a `[walk]` setting; one in home, reused by a
    branch's tab and by home's walk reaching it; the start (`prepare`, then the screen) building once in home and in a
    vault; a switch into home building once. The tests of the covered rule, `Watch.rebuilt` and the live guard now
    run on a branch's tabs, the path that uses them since the start asks all at once. 19 mutations, each fails a test.
  - Ran: all of tests/tui.test.ts once (749 of 751; the two that failed, Mermaid drawn as a picture, pass alone and
    as their group of 26, run with a load near 15 from the other issues' work), tests/tui-git.test.ts (its start test
    now asks the screen for the notes, not `prepare`), tests/gitpanel.test.ts, tests/marks.test.ts,
    tests/home.test.ts, tests/regressions.test.ts, tests/vault.test.ts's home tests; the `home:`, `session:`,
    `watching:`, Elsewhere and branch terminal checks (17); the typecheck, the lint, the docs' checks and tests.
  - Live: a scratch repository vault (`tmp/issue/live/brvault`): `c.md` only on feat, open there, quit; on main,
    slipbox open, `git checkout feat` from another shell: "switched to branch feat: its tabs are back", `c.md`'s link
    to `a.md` resolved and `a.md`'s backlinks list it. The release, the same steps: the link `unknown`. Both mark the
    tab `↻ reloaded` (the checkout's batch), the release too, so not this change's. Home started on the reference set,
    a tab of `household`: the switcher finds it, `todo.md`'s backlink there.
- 2026-10-23: Review loop, round 2 (the code-review skill and Codex, each on the new diff alone), each finding checked:
  - Verified, fixed: a buffer adopted while its file had changed on disk since it was read kept the old text, the
    poll no longer looking (a test, red first). Adoption now never reads a file: a buffer changed on disk stays
    polled, and the poll reads it again, then adopts it (`Watch.poll`, taken out of `startPolling`).
  - Verified, fixed: a buffer is given its path inside a lookup (`App.buffer`), so a reload could land mid-edit. The
    lookup adopts no more; adoption follows the graph: its builds (`Graph.onBuild`, new) and its changes, from
    `Watch.followGraph`, so every build adopts (a rename's, a vault made or unmade), not only those hand-picked.
  - Verified, fixed: the poll skipped every buffer with a vault path, one reached in a hidden folder too (20.8), which
    no watcher sees: now it skips only those whose folder the graph lists (a terminal check, red without it).
  - Verified, fixed: a switch followed the new graph before dropping the old vault's buffers, adopting them against
    it. Followed after they're dropped (no test: with adoption reading nothing, it shows nowhere).
  - Verified, fixed: a buffer read through a link just looked at (VV-D6) could be adopted and stay read-only with its
    old reason. Adopted only once the graph knows it, which is through a link followed: its read-only lifted then,
    unless the file itself is (a test and a terminal check, each red without it).
  - Verified, fixed: `vault.reindex` neither synced the watcher nor caught search up; it calls `Watch.rebuilt` (a test
    and a terminal check, red without it).
  - Verified, changed: every graph was built after the screen was taken (`run.ts`), a long build on a blank screen. A
    vault's is built before it again; home's by the screen, as `slipbox ~/notes` already was.
  - Taken: one "the graph knows it" (`Graph.known`) in `App.buffer`; the session read at the start only in home; the
    design's `Graph.askFolder` named `askFolders`.
  - Rejected: folders asked for stay asked when their tabs close (D248, design/roots.md § Home: walked at each build
    until home's walk covers them); dropping one would take its notes out of the index while you work.
  - Rejected: the harness's graph built before the screen hides the first build: the start is tested as slipbox
    starts (`prepare`, then the screen), in home with tabs, with none, and in a vault, each red without its part.
- 2026-10-23: The maintainer asked for a terminal check of every case besides its test. Added, each run and passing
  (44 related checks in all): `home: its tabs brought back — …` (with search), `… a split's other window's folder
  walked too; a file gone, or one in Downloads, walks nothing`, `home: gone into from another vault, its tabs brought
  back — …`, `home a repository: a branch's tabs brought back as it's checked out — …`, `home: a tab behind a link out
  of home not followed …`, `home: a note gone forward to in a folder not walked — …`, `links: a note just looked at
  through a link, the link followed later — …`, `git: a branch's tab of a note only it has, …`, `watching: a note
  reached in a hidden folder, changed by an agent, reloads — …`, `settings: a [walk] setting that takes in a note open
  but left out — …`, `index: space v r with the watcher off — …`. Unit tests alone: how many builds a start or a switch
  makes, and the cap's wording (a terminal check sees neither: the cap is 10,000 notes).
- 2026-10-24: Review loop, round 3 (the code-review skill and Codex, each on the new diff alone), each finding checked:
  - Verified, fixed (Codex): the poll read a note through a link once the link was forgotten; it skips any buffer
    behind a link not followed now, before looking at the disk. A batch heard before the link was forgotten doesn't
    read it either, and adoption doesn't make such a window writable while the link isn't followed.
  - Verified, fixed (Codex): a link followed, forgotten, followed again left its window read-only: adoption lifts a
    link's read-only on a buffer that already has its path, once the graph knows it again; a buffer read again is
    adopted at once (`reloadBuffer`), so a note edited while the link was forgotten is read and writable.
  - Verified, fixed (Codex): a reached note reloaded by the poll left the graph and search with its old text: the poll
    tells the graph, as the watcher would, through the feed (held while git writes), once for each change — a buffer
    with unsaved changes isn't told again every second — and only of a file the graph still knows: one a `[walk]`
    setting left out since is read again, never indexed again.
  - Verified, fixed: an adoption in the middle of a render drew nothing new until something else did; it asks for a
    redraw. A build listener that throws no longer escapes `Graph.build` (isolated, as change listeners are).
  - Taken: the folders listed held as a set until a build lists them anew (not made each second); `parentOf` from
    core/watch.ts; the read-only reason made in one place (`lockedSaid`); design/tui.md and the CHANGELOG say what the
    poll does now. The poll's own adoption dropped: `reloadBuffer` adopts.
  - Rejected: home's graph built by the screen, after it's taken: `slipbox ~/notes` already built there, and the tabs
    to ask for are the screen's to read (the branch, home's folder); a vault's is built before it.
  - Rejected: `rel` worked out as it's read, not kept: 36 places read it mid-operation (a save's root, the watcher's
    choices), and the hold for a file changed on disk would still be kept; adoption now follows the graph's own events.
  - Rejected again: folders asked for stay asked (D248, as in round 2).
  - Rejected: the folders of the tabs worked out twice at the start, `built` kept beside `walkedAt`, the session read
    in `toRestore` and `restore`: a few stats and a small file, for keeping `openTabs` the one place tabs are asked.
  - Tests: 7 unit tests, each red without its fix (`tmp/issue/mut/run6.py`, `run7.py`); terminal checks `links: a link
    followed, its note open, forgotten — …`, `settings: a note open, then left out by the vault's [walk], …` (red
    without its fix) and the hidden-folder check now finding the agent's link in home.md's backlinks. Unit tests alone,
    a terminal can't make them happen when wanted: git's lock held mid-poll, a buffer told once while unsaved, a
    batch heard before a link was forgotten, a redraw asked mid-render, a listener's own bug. Ran: all of
    tests/tui.test.ts (762), tui-git, gitpanel, marks, regressions, home (175), vault's home tests (53); 46 terminal
    checks; the typecheck, the lint, the docs' checks and tests.
- 2026-10-24: Review loop, round 4 (the code-review skill; Codex's part skipped, its pane waiting on a question of the
  maintainer's), each finding checked. The maintainer chose to keep reached notes reloading in this pull request and
  fix its gaps:
  - Verified, fixed: the poll took "the graph lists its folder" for "a watcher sees it", so a hidden or ignored note
    in a watched folder (`.draft.md` at the top) was never read again; and its own set of folders went stale when a
    folder was added in place. The watcher says what it sees itself (`VaultWatcher.sees`: its folder watched or
    polled, its name one its filter takes, every open file when degraded); without one, the graph's folders and filter.
  - Verified, fixed: a change the poll told the graph, the watcher's sweep told again (a note reached in an earlier
    session, known to it): a second reload, or a conflict for nothing. The poll tells the watcher it heard it
    (`VaultWatcher.heard`); a terminal check counts the reload said once (twice without it).
  - Verified, fixed: a window read-only through a link, looked at or forgotten, stayed so once the link was followed
    wherever the graph didn't take the file (Elsewhere; a file past the size cap). Following the link lifts it
    (`Following.lift`), the graph aside; the claim no longer handles links at all.
  - Verified, fixed: a buffer whose conflict was settled with the disk's text (`buf.load()`, not `reloadBuffer`) was
    never made the vault's. The poll claims an unchanged buffer the graph knows.
  - Taken: a change to one file claims that file's buffer, not every buffer; `App.adopt` renamed `App.claim` (core's
    `Graph.adopt` reads a file into nothing); `lockedSaid` beside `fileUnwritable`, each with its own doc; one
    `parentOf`, home.ts importing core/watch.ts's; a claim asks for the redraw itself.
  - Rejected again: folders asked for stay asked (D248); home's graph built by the screen; the panes' selections
    across a branch's build (the explorer lists from the disk: rows the same before and after, round 1).
  - Rejected: the session read twice and the tabs' folders worked out twice at the start (as in round 3).
  - Tests: 8 unit tests and a core test of `sees` and `heard`, each red without its change (`tmp/issue/mut/run8.py`);
    terminal checks: the hidden-folder check now restarts and counts its reload, and reads a hidden note at the top;
    `Elsewhere: a note just looked at through a link, …`; `home: a note typed in before its folder is walked, …`. Each
    red without its change (`tmp/issue/mut/term4.py`). Ran: all of tests/tui.test.ts (767), the five other files
    (175), vault's home and watcher tests (66), 49 terminal checks, the typecheck, the lint, the docs' checks and tests.
- 2026-10-24: Review loop, round 5 (the code-review skill; Codex's part skipped, its pane still waiting on the
  maintainer's question), each finding checked:
  - Verified (its probe), fixed: a build the watcher is synced to (`Watch.rebuilt`: a reindex, a branch's tabs) took
    the new stamps as known without reading again an open note changed meanwhile, so it never was. `rebuilt` reads
    each changed one again, never through a link not followed (a test and a terminal check, red without it).
  - Verified (its probe), fixed: `heard` kept a file that's no note by its stamp, which only notes are, so the sweep
    said it at every pass. It keeps notes alone, as `noteOwnWrite` does (the core test).
  - Verified, fixed: a link forgotten left its open note the vault's (`rel` set): the degraded watcher's poll and news
    heard late indexed it through the link. Forgetting takes its vault path; a late batch for a window read only
    through a link not followed is dropped before the graph (a test, red without each).
  - Verified, fixed: a window lifted after its link was followed, the vault not taking the file (past
    `walk.max_file_size`), had no vault path, so a save was rooted at its own folder and would land outside the vault
    (VV-D6: a vault never writes out of itself). In a vault the lift waits for the vault to take the note; the claim
    does both (`claimThroughLink`) (a test and a terminal check, red without it).
  - Verified, fixed: the poll told a change as the buffer's kind when it opened, not as the graph has the file (a
    `walk.extensions` change since); and a polled folder's watch looks at notes alone, so `sees` says so (tests).
  - Verified, fixed: a tab's folder home's walk never goes into (`~/Downloads`, the scratch's) was asked for, kept
    and carried for nothing: only folders home walks are asked (a test).
  - Taken: one predicate for what a watch takes (`watchTakes`), the watcher's and the poll's fallback; the per-change
    guard for a forgotten link dropped, the batch filter making it dead.
  - Rejected again, as in rounds 2 to 4: home's graph built by the screen; folders asked for kept (and the cap's
    message naming them); the panes' selections; the session read twice; a few stats a second in the poll.
  - Kept, though its mutation survives: the tabs' check of a link not followed before `existsSync`; the walk's own
    filter drops the same folder after it, so only a hung mount behind the link would show what it prevents.
  - Ran: all of tests/tui.test.ts (770), the five other files (175), vault's home and watcher tests (67); 50 terminal
    checks; every mutation set (`tmp/issue/mut/run*.py`, `term*.py`), each change failing a test; the typecheck, the
    lint, the docs' checks and tests.
- 2026-10-24: Rebased on `dev` twice. First on T12 (#47: home's walk on the walk's thread): its build counter
  (`Graph.builds`) replaces this branch's own, so "never built" is `builds === 0`; its `refreshHome` sends the folders
  asked for (the tabs' among them) to the walk's thread and drops an answer once the graph is built or asked again since,
  so a tab's folder asked for meanwhile is never lost; `homeBuilt` ends with `Watch.rebuilt` (the watcher, the open
  notes changed, search). The start's build and a branch's tabs' stay on the screen's thread, as T12 leaves the walk at
  the start and the open vault's builds. A test stepped home's job in a loop that never let the thread answer, and hung:
  it waits as T12's do (`stepToEnd`, `homeRefreshed`). Then on T19 (#42: the watcher leaves home to its walk): a tab's
  folder is asked for by name, so `waitsForHomeWalk` leaves it to the watcher, its folders taken in as they come (the
  manual and design/tui.md say so); a folder listed for the walk (`listForWalk`) never counts as covered for a tab, home
  not walked; its tests ask as the graph does now (`askFolders`, one folder each, a build each as before). `parentOf`
  is home's alone now (the watcher imports it, as it does `under`), no import cycle. Considered,
  left: `sees` true for a note T19 follows into a folder left to the walk (the watcher looks at it every tick). The poll
  looks at it too, but `heard` keeps the watcher from saying a change twice; it would save a stat, nothing seen.
- 2026-10-24: Review loop, round 6: the code-review skill, and a fresh Claude reviewer in Codex's place (Codex's part
  skipped: its pane still waits), each on the rebased diff alone. Verified and fixed, each with a unit test red without
  it: a build the watcher is synced to read changed open notes outside the feed, so mid-write while git held its lock
  (`rebuilt` polls them through the feed); following a link left a window changed meanwhile writable with its old text
  (`lift` reads it first); forgetting a link with unsaved text let a save, an autosave or a task toggle write through
  it, in a vault out of it (`writeBuffer` refuses a window read through a link not followed, and writes a vault's file
  as the vault's: also dev's hole for a note too big to index, and for a task toggled while just looking); the poll's
  stat threw on a folder unreadable or made a file, quitting slipbox (`stamp`); a reached note gone and back was never
  indexed again (reached again); a branch's tabs in folders already covered made #47 drop home's walk for good
  (`refreshHome` asks again). Terminal checks for each, red without its fix, but two: following in Elsewhere (the poll
  reads it during the target's probe: driven, the unit test pins it) and #47's dropped walk (needs it in flight).
  Rejected: the start's build on the main thread, the poll's design and cost, `tabFolders`' filter (dev's `askFolders`
  keeps a folder opened by name asked), the check file's length (`check:size` is for `src/`), comment links resolved at
  parse (dev's rule). Ran: tests/tui.test.ts's `#13` and VV-D6 tests (56), vault's and the walk thread's `#13` and
  `#16` (27), the docs' and coverage tests (34), 29 terminal checks, every fix undone once (`tmp/issue/mut/run-r6*.py`,
  `term-r6*.py`), the typecheck, the lint, `check:docs`.
