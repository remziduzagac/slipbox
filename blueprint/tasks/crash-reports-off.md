---
status: todo
assignee:
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
