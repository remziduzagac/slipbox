---
status: todo
assignee: ""
blocked_by: [SD-T1, SD-T2]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T4: The TUI's look every second, and the activity file

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
- A changed open file is read by SD-T5's and SD-T6's `read`; until they land, read here as now.

## Acceptance criteria

- Held: the scratch (outside the vault) under `held`, a key handled and drawn while its stat is out; let go, a change
  an agent made to it is reloaded.
- Held: the vault's `.git` under `held`: a key handled while `HEAD` is asked; let go, a branch switched by the test
  meanwhile is seen (`switched to branch …`).
- Held: the config folder under `held`: a key handled; let go, a setting changed meanwhile is applied.
- Races: an answer for a vault left meanwhile is dropped; one for a buffer closed meanwhile too.
- Mutation: each of the three reads put back here, its test fails (checked once).

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
