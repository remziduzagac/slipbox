---
status: todo
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

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("The TUI's look each second").
- Rests on: SD-D3, SD-D5, SD-D6; D153 (what git does lands as one change); `5.9`, `5.10`.
