---
status: todo
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
