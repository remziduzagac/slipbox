---
status: done
assignee: claude-writes
created: "2026-10-11"
---

# T1: Turn off Bun's own crash reports

At start, slipbox sets `BUN_ENABLE_CRASH_REPORTING=0` in its own C environment, unless the user set it or
`BUN_CRASH_REPORT_URL` themselves.

## Description

Bun's crash handler reads `BUN_ENABLE_CRASH_REPORTING` when it crashes, from the C environment; `process.env` doesn't
reach it. Call libc's `setenv` through `bun:ffi` early in `src/main.ts`'s start, for the TUI and the CLI alike, on
Linux (glibc and musl) and macOS. Leave it alone when either variable is already set. A failure to load libc is
silent: reporting stays as Bun has it.

## Acceptance criteria

- A test reads the variable back through libc's `getenv` after the call: `0` when unset before, unchanged when set.
- The test fails with the call removed.
- The compiled binary, crashed on purpose with reporting otherwise on, sends nothing: checked by hand, curl's
  connection watched through a local proxy, and noted in the Log (the mechanism was checked so on 2026-10-11: D221).
- design/distribution.md § Updates and docs/configuration.md § Environment say it.

## Out of scope

- Native Windows (`14.16`): `setenv` there is another call.

## References

- Delivers: D221; design/distribution.md § Updates.
- Rests on: D199.

## Log

- 2026-10-11: `core/crash-reports.ts`, `crashReportsOff()`, called at the top of `src/main.ts`, before `main()`: libc
  opened by `bun:ffi` (`libc.so.6`, then `/lib/ld-musl-<arch>.so.1`, then `libc.so`; macOS `libSystem.B.dylib`), its
  `getenv` asked for either switch (an empty one counts as unset), its `setenv` writing `0`. Any failure is silent.
  It costs about half a millisecond (*ran*).
- 2026-10-11: test in tests/distribution.test.ts, "updates (14.4)": a process of its own, its environment as given,
  libc's `getenv` read back: `0` after the call, unset without it; `1` kept; `BUN_CRASH_REPORT_URL` set, nothing
  written; and `src/main.ts` itself, run as `--version`, leaves `0`. Mutation-checked: without the `setenv`, without
  the check of either switch, and without the call in `src/main.ts`, it fails.
- 2026-10-11: compiled (`bun run build`, then a probe compiled with the same flags that runs `src/main.ts` as
  `--version` and reads `getenv` back): `0` with nothing set, `1` kept when set (*ran*, Linux arm64, glibc). The crash
  itself, by hand: a compiled probe that segfaults on purpose (an FFI call to address 8), with
  `BUN_ENABLE_CRASH_REPORTING=1` and a `curl` of its own first on `PATH` that logs what it's asked: with reporting on,
  Bun ran `curl -fsSL https://bun.report/1.4.2/…/ack`; with `setenv` writing `0` at start, overriding the `1`, it ran
  nothing, and still printed the link (*ran*). On Linux Bun reports only when told to, so the case the call changes,
  nothing set, sends nothing here either way: that case is macOS's, checked 2026-10-11 for D221. Not run on musl or
  macOS here.
- 2026-10-11: design/distribution.md § Updates and docs/configuration.md § Environment say it. Still to change, outside
  this task's sections: blueprint/README.md lists "Bun's own crash reports (D199)" as open.
- 2026-10-11: accepted by the user; done.
