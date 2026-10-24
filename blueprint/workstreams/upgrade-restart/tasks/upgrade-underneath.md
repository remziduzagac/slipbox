---
status: review
assignee: claude-23
blocked_by: [UPG-T4, UPG-T5]
created: "2026-10-24"
---

# UPG-T6: An upgrade underneath, noticed

A newer version installed under a running slipbox, offered as a restart: design.md § An upgrade underneath.

## Acceptance criteria

- Every ten seconds, a release build looks at `current`'s version, Homebrew's `opt` link (then the binary's
  `--version`), or the path it was started by (its link, size, time and inode, then `--version`); a version asked in a
  child, ten seconds at most.
- A newer one offered once, when quiet: Restart now, Not now; after Not now, `:restart starts it` said; this window's
  own background upgrade not offered again. Whatever `[update] check` and `DO_NOT_TRACK` say (UPG-D5).
- Unit tests of each install's watch and of offering once.

## References

- Delivers: ../design.md § ADDED design/distribution.md § An upgrade underneath.
- Rests on: UPG-D5; ../notes.md § Codex's critique, 10.

## Log

- 2026-10-24: `Updates.lookUnderneath` every tenth tick (ten seconds), release builds only: the installer's `current`;
  Homebrew's `opt/slipbox/bin/slipbox` and a hand-put one's `startedBy` (added to `UpdateEnv`, from `tui/run.ts`),
  each by a stamp — where its links lead, size, time, inode — and `versionOf` (ten seconds) once it changed; seeded
  at start with this binary, so it's never run to ask. A newer one waits for quiet as the restart alone, once
  (`offeredUnderneath`), never this window's own (`mine`, or the background upgrade running). `installedNewer` reads
  what was seen for Homebrew's and a hand-put one, for `:upgrade`.
- 2026-10-24: `tests/tui-updates.test.ts`, 27 pass (139 expects), the five of T6: the installer's (once; whatever the
  check and DO_NOT_TRACK say), this window's own, Homebrew's keg with a revision, a hand-put file copied over or its
  link moved (never run while unchanged, asked once when changed), from source. The tests' daily check now refuses
  the network by default (`withEnv`'s fetcher): `start()` would have asked github.com. Mutations, each alone (offered
  more than once; its own offered; looked at from source; not seeded; asked every time; Homebrew's keg watched, not
  `opt`; the restart offer held by the check): all seven caught.
