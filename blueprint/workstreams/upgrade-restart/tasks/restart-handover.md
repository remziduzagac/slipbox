---
status: review
assignee: claude-23
blocked_by: []
created: "2026-10-24"
---

# UPG-T2: The restart's note and the hand-over (`core/restart.ts`)

What a restart writes for the slipbox it starts, and how the process becomes the new version: design.md § Restarting.

## Acceptance criteria

- The note, `$XDG_STATE_HOME/slipbox/restart/<pid>.json`: written atomically and read back; taken (read and removed)
  by pid, else parent pid; one older than two minutes ignored.
- Which binary: the installer's `<data>/current/slipbox` (after a failed upgrade, the running file, else `current`);
  Homebrew's `<prefix>/opt/slipbox/bin/slipbox`; one put by hand, the path it was started by; from source, Bun and the
  script. The arguments `argv.slice(2)` compiled, `slice(1)` from source.
- `execve` through `bun:ffi` and libc (D221's way of finding libc), descriptors above 2 marked close-on-exec by
  `close_range` where Linux's libc has it, none closed; where it can't be reached or fails, the new one started with
  the terminal and waited for, its exit code passed on; nothing to start, said, exit 1.
- The upgrade in the hand-over, with `ctrl+c` cancelling it before its commit (UPG-T1's signal), and what it says.
- Unit tests: the note's round trip and its age; the binary chosen for each install; a small program exec'd by the
  FFI call, its pid the same and its exit code seen (runs on CI's macOS too).

## References

- Delivers: ../design.md § ADDED design/distribution.md § Restarting.
- Rests on: UPG-D2, UPG-D4; ../research.md.

## Log

- 2026-10-24: `src/core/restart.ts`: `RestartNote`, `writeNote` (atomic, read back), `takeNote` (this pid, else the
  parent's; stale or unreadable removed; others' older than a day cleared), `startedPath`, `nextLaunch`, `execInto`
  (`execve` by FFI; `close_range` marking descriptors above 2 close-on-exec on Linux; errno said on failure),
  `startAndWait` (the terminal's signals ignored while it waits; 128 + a signal's number), `handOver`. The note's
  place and session are opaque to core: the TUI's own types stay in `src/tui/` (`check:boundary` ok). The cancel's
  source is an option, `ctrl+c`'s SIGINT by default: a test can't emit SIGINT without ending Bun's test runner.
- 2026-10-24: `tests/upgrade-restart.test.ts`, 13 pass (101 expects), the `execve` one in a child Bun from source: the
  same pid before and after, exit 7 the shell's, no `/dev/urandom` carried on Linux (seen carried with the marking
  off). Mutations, each alone (no close-on-exec; the parent's note not taken; a stale note taken; `current` after a
  failed upgrade; Homebrew's keg, not `opt`; the path started by ignored; the note not written in the hand-over; no
  start-and-wait fallback): all eight caught. macOS's `execve` runs on CI's macOS runner (the same test).
