---
status: done
assignee: ""
blocked_by: [SD-T1, SD-T2]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T4: The TUI's look every second, what's drawn of git, and the activity file

SD-D3, SD-D5, SD-D6. Beside SD-T3: the second timer that stops the screen on a slow disk, every second.

## Description

- `Watch.startPolling` (`src/tui/app/runtime/watch.ts:204`) asks one `stat` batch a second, never two out: the open
  files no watcher sees (`Watch.poll`, `:232`; every open file after a build, `poll(true)`), your config's and the
  vault's `.slipbox/config.toml` (`Settings.changedOnDisk`, `src/tui/app/settings/settings.ts:188`), git's `HEAD`,
  `index.lock`, `rebase-merge` and `rebase-apply`, and the CLI's activity file. A changed `HEAD` is read there
  (`read` of `HEAD` and the branch's ref or `packed-refs`) before `VaultFeed.checkHead` (`vault-feed.ts:199`) decides.
- `VaultFeed.gitLocked` and `rebasing` take the answer's stamps; `receive`'s check and `waitForGit`'s every 100 ms
  (`vault-feed.ts:144`) ask a `stat` of the lock there, a batch held until it answers.
- `GraphRefresh.nobodyWorking` (`graph-refresh.ts:172`) reads the activity file's last stamp, not a `stat` every
  quarter second.
- Each open file's way checked there for a link not followed (`following.blocked` → `unfollowedLink`, `watch.ts:244`,
  `src/core/workspace/vaults/symlinks.ts:297`), with its stamp.
- Your config and the vault's read and parsed there when their stamps moved (`Settings.reload`, `settings.ts:198` →
  `loadConfig`), and Obsidian's or zk's settings with them (`toolSays`, `src/core/workspace/links/convention.ts:112`),
  kept for the Info panel and completion.
- What's drawn of git is kept (SD-D13): the branch (`headOf`, `src/core/workspace/git/git.ts:85`) and the operation
  under way (`operationOf`, `src/core/workspace/git/branches/gitrebase.ts:82`) are read with the look's `HEAD` and
  rebase folders, and the top bar (`src/tui/shell/screen/topbar/where.ts:22`, `:23`: `Git.branch`,
  `operationStatus` → `operationNow`) and the git panel (`views/panel/draw-git.ts:73`, `:132`) draw what's kept,
  never reading as they're drawn.
- A changed open file is read by SD-T5's and SD-T6's `read`; until they land, read here as now.

## Acceptance criteria

- Held: the scratch (outside the vault) under `held`, a key handled and drawn while its stat is out; let go, a change
  an agent made to it is reloaded.
- Held: the vault's `.git` under `held`: a key handled and its frame drawn, the top bar showing the branch kept,
  while `HEAD` is asked; let go, a branch switched by the test meanwhile is seen (`switched to branch …`) and drawn. A
  rebase started meanwhile is drawn once the look answers (`rebasing 1/2`).
- Held: an open file whose way goes through a folder under `held` — a key handled meanwhile; let go, a link not
  followed on its way is still refused.
- Held: the config folder under `held`: a key handled; let go, a setting changed meanwhile is applied.
- Races: an answer for a vault left meanwhile is dropped; one for a buffer closed meanwhile too.
- Mutation: each read put back here, its test fails (checked once); `headOf` read in the draw again, the `.git` test
  fails.
- `CHECKS_FOR` (`scripts/ci-scope.ts`) names the terminal checks this task's files reach; before its pull request
  merges, they run locally, listed for approval first, with its unit tests (SD-D14).

## Terminal check

`slow disk: home's config and the vault's git on a slow disk — the look every second holds up no key; a branch
switched meanwhile is seen`.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D12):

- Git's lock while git writes: asked on its own every 100 ms, one stat out at a time, not folded into the look each
  second, which would hold autosave and the watcher's news up to a second more after every commit (`5.10`).

## Open

What the description left open, settled here for the maintainer to confirm, each the recommended option taken by
the maintainer's standing instruction; design.md's sections it delivers say how.

- One batch a second, one request (`src/tui/app/runtime/look.ts`, `Look`, which `Watch` owns), so a look holds one
  disk thread: as `LookAsk.jobs`, a `git` job and a `way` job, then a `stat` of the open files outside the vault, the
  config files, the activity file and the tool's files (their folders stamped by whether they're there, Obsidian
  rewriting what's in `.obsidian/` while it runs). The config and the tool's settings are read in a second batch only
  when their stamps moved. The new jobs live in `src/core/workspace/walk/look-jobs.ts` (`answerLookJob`, a path's
  stat `io/stamps.ts`'s `statOf`); `disk-jobs.ts` answers the `look` request, its jobs first and then its stats, as a
  `stat` request's (judged when the watcher asks), and `walk-thread.ts`'s `look()` sends a batch's jobs with its stats
  as one request, in the background when asked (`LookAsk.background`).
- Git's state taken in the order it was asked: each question numbered as it's asked (`askGit`), the feed's (`saw`) and
  the operation kept (`keepOperation`) take an answer only when no later question's has come first; a key's own read
  of the operation (`operationAgain`) counts as one asked then. A key that ran git awaits `Git.checkHead()`, settled
  once the look it asks has answered and a switch is done.
- Git's state read whole each look (`gitSeenAt`, `vault-feed.ts`): the checkout, `HEAD` and its commit, the lock,
  the rebase folders and the operation, by the code the screen's thread used (`checkoutAt`, `headOf`, `headCommit`,
  `operationOf`), not a stat of `HEAD` and then a read when it moved: a few small files, one round trip, and the same
  answer whatever moved. The operation's reads moved to `git/branches/operation.ts`, which `gitrebase.ts` re-exports.
- The way checked whole on the thread: `blockingLink` with the links being looked at given by their keys, and the
  answers kept read there (`links.json`, read again when it changes); the file statted only when its way is clear,
  never through a link not followed (VV-D6). An answer to a link given or forgotten meanwhile (`Following.changes`)
  drops the ways' answers. `unfollowedLink`'s reads go through the seam. It isn't split into what's read and what's
  decided, as first planned: the `way` job is what SD-T5 can reuse.
- The config read and parsed there (`loadConfig`), each file stamped before it's read and each one's last good
  contents carried both ways; `Settings.reload` takes what was read, and drops it when a reload came meanwhile
  (`Settings.loads`). Obsidian's or zk's settings read there with it (`toolRead`, plain data, `toolSaid` here), kept
  (`Settings.keepTool`), and given to `conventionOf` by the Info panel, completion and link insertion; before the
  look's first answer, and in a test's App, they're read where they're asked for, as before.
- The feed asks too (`VaultFeed`'s `asker`): a batch the watcher brings asks git's state there and is applied once it
  answers, one question out at a time; git's lock waited out by its stat alone every 100 ms, one out at a time (the
  decision of 2026-11-09); given up on, the batches are applied with the state last seen, never held for good.
- The look, its second batch, the feed's question and the lock's stat are the disk threads' background requests, as
  the watcher's look is (SD-T3): one at a time among them all, so a key's read always finds the other thread.
- What's drawn: the branch is `Look.head()`, the feed's last answer (its start's `HEAD` before the first); the
  operation is kept for the App (`keepOperation`), nothing for a vault gone into until the look answers. A key that
  acts on a rebase reads it at once (`operationAgain`) and keeps what it read. The checkout is the look's
  (`GitReads.took`), no longer looked for again each second on the screen's thread while there's none.
- Which App looks off the screen's thread: the one whose explorer's listings are read there, `AppOptions.listOffThread`,
  the TUI's; no new option. A test's App looks here, at once, as before, unless the test says (`look.offThread`).
- Given up on, a minute on (SD-D6): said once in Messages, `disk not answering: the look at your config, git and the
  open files gave up; it looks again in a minute`, worded beside the watcher's (SD-T3), and the watcher's status line
  indicator, `⚠ disk not answering`, covers both (`Watch.notAnswering`) until each has answered; asked again a minute
  later (`LOOK_AGAIN_MS`), and said again only after one has answered. Nothing is asked meanwhile, however it's asked
  for: a look wanted (git ran, a build's look of every file, one wanted while the last was out) is kept for the
  minute's end; the feed's question isn't asked, its batches applied as git was last seen. The activity file's stamp is
  unknown till a look answers again, and unknown isn't quiet: the background index waits. Stopped (quitting) says
  nothing.
- Left on the screen's thread, for other tasks: the start's reads (the feed's `HEAD`, the operation until the first
  answer, the config: SD-T9, SD-T10); a vault gone into (SD-T9); autosave's check of git's lock before a save
  (`Git.indexLocked`, SD-D7); a changed open file's text, read here as before (SD-T5, SD-T6). The held tests met two
  more, and keep clear of them: the explorer's marks of a link's row (`Following.describe` → `linkKey`, SD-T7), and
  the switcher's preview (`preview.ts` → `rootAt`, SD-T5). `linkKey`'s and `linkTarget`'s real paths go through the
  seam now, so a hold sees them.
- A hold on the test's own thread (`holdNow`) holds every read of a `held` path made there, whoever's. On macOS's
  runner one such read, not made on Linux, held the thread test's thread three times ten seconds, past its timeout.
  So a test of the disk threads alone holds them alone (`held.again()`), and the hold names each read given up on the
  test's thread with what asked for it (`Hold.gaveUpHere`), which the tests check is empty.
- On macOS's runner again, the activity file's test, its first look held, said the look never reached `held` thirty
  seconds in, its wait allowing ten: the test's thread was busy twenty seconds and more before it could look at the
  clock. That test's first disk thread starts as its look is asked, after the wait's clock began; a start made slow on
  either thread fails it the same way, here. So nothing a test awaits counts against a clock of its own: a thread
  waiting in `held` is awaited while what asked for it is out, and failed once that has answered instead; a test that
  holds one thread while a key's read takes the other starts both first; the look given up on is the disk threads'
  error, not a 300 ms deadline that counted a thread's restarts. The activity file's test holds the disk threads alone.
  A wait that never ends is the test's timeout, which names what it awaited and the reads given up on.
- `CHECKS_FOR`: `look.ts` and `look-jobs.ts` name the slow disk's checks and the look's (`LOOK_CHECKS`: watching,
  configuration, git, source control, symlinks, links); `walk-thread.ts` and `disk-jobs.ts` add the look's;
  `operation.ts` joins git's. The other files this task changes (`watch.ts`, `settings.ts`, `app.ts`, `vault-feed.ts`,
  `buffer.ts`) are shared and run every check.
- What the jobs bring to a disk thread's start (`loadConfig`, `convention.ts`, `vault-feed.ts`'s git reads): about
  8 ms on this machine (five runs, a busy one), after the 30–45 ms the modules it loaded before take; under the 150 ms
  before `listing…` shows.
- The terminal check can't see a read left on the screen's thread by its time alone (the stand-in slows only the disk
  threads' stats and reads): it asks that the top bar keeps the branch it had for two seconds and more after a switch
  while the slow disk is read, every key answered within a second meanwhile. Looked at on the screen's thread, the next
  second's look sees the switch.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("The TUI's look each second").
- Rests on: SD-D3, SD-D5, SD-D6; D153 (what git does lands as one change); `5.9`, `5.10`.
