---
status: review
assignee: claude-23
blocked_by: []
created: "2026-10-24"
---

# UPG-T1: `upgrade` one at a time, never back, cancellable before its commit

`core/update.ts`'s `upgrade`, made safe for more than one slipbox and for a cancel: design.md § MODIFIED § Updates.

## Acceptance criteria

- A second upgrade of the same install, while one runs, says `another upgrade is running (pid <n>)` and changes
  nothing; a lock left by a process that's gone is taken over, and `versions/.upgrade-*` left by it removed.
- Against `current`, not the running version: a newest not newer than what `current` names installs nothing and says
  so; `current` never moves back.
- The channel's newest already in `versions/` is taken without a download, once its binary says its version.
- Kept: the new version, the one `current` named before, the one running; any other removed.
- `tar` and the new binary's `--version` are awaited children; an `AbortSignal` cancels it up to `current` moving,
  leaving `current` and the versions as they were (a complete folder in `versions/` may stay).
- Unit tests in `tests/distribution.test.ts` for each, with `fakePack`; `slipbox upgrade`'s CLI unchanged otherwise.

## References

- Delivers: ../design.md § MODIFIED design/distribution.md § Updates; ../requirements.md § Acceptance criteria (two
  windows on one vault, a failed upgrade).
- Rests on: UPG-D2, UPG-D7; ../notes.md § Codex's critique, 3 and 4.

## Log

- 2026-10-24: `upgrade` holds `<data>/upgrade.lock` (`lockUpgrades`), compares with what `current` names (status
  `installed`), takes the channel's newest from `versions/`, keeps the new, the replaced and the running versions,
  and takes an `AbortSignal` (`UpgradeCancelled`); `tar` and `--version` awaited children (`versionOf`, exported for
  UPG-T6). What it says moved to `upgradeSaid` and `FROM_SOURCE`, for the CLI and the hand-over. Found while testing: a
  child killed on a cancel can leave what it started holding its output open, so `versionOf` waits for the exit, not
  the output's end (a cancel took 20 s before). A lock older than fifteen minutes is taken over too, and a running
  version whose file another window removed is still the installer's (design.md § Updates, added).
- 2026-10-24: `tests/upgrade-restart.test.ts`, 8 pass (62 expects); `tests/distribution.test.ts -t 'updates|Homebrew'`
  12 pass; `tests/cli.test.ts -t 'upgrade from source'` passes; typecheck and lint clean. Mutations, each alone (no
  lock; no comparison with current; no reuse; current's version not kept; no path fallback; the output awaited before
  the exit; no last look before `current` moves): all seven caught.
