---
status: current
created: "2026-10-24"
---

# Research: a slipbox replacing itself

Whether a running slipbox can hand its terminal to a new version without leaving a process behind: what a compiled Bun
binary sees of its own path and arguments, and whether it can `execve` itself through `bun:ffi`. Tried on this machine
(Linux 7.2.9 on aarch64, OrbStack; Bun 1.4.2) with a probe compiled as slipbox is (`bun build --compile`), on
2026-10-24; what can't be tried here is marked.

## Summary

- **`execve` through `bun:ffi` works from a compiled Bun, threads and all** (*ran*): the process keeps its pid and its
  parent (the shell), the new program's exit code reaches the shell, the environment passed is the one it gets, and a
  worker thread running at the time is no obstacle. So the restart can be one process from the shell's view: no
  launcher, no parent left waiting (ideas.md § How the hand-over takes the terminal).
- **The signal mask and ignored signals after `execve` are a fresh start's** (*ran*): `SigBlk` 0, `SigIgn` and `SigCgt`
  the same as the binary started by the shell.
- **One descriptor leaks per `execve`** (*ran*): Bun opens `/dev/urandom` without close-on-exec, so each restart would
  carry one more. Marking every descriptor above 2 close-on-exec first ends it; closing them would not do, since a
  failed `execve` must leave the runtime whole for its fallback (notes.md § Codex's critique, 1).
- **`process.execPath` is the file, links resolved** (*ran*): started through `~/.local/bin/x` → `<data>/current/x` →
  `versions/1/x`, it's `…/versions/1/x`. A restart into a new version must name `<data>/current/slipbox`, not it.
- **A compiled binary's `process.argv` is `["bun", "/$bunfs/root/<name>", …args]`** (*ran*); from source it's
  `[<bun>, <script>, …args]`. The arguments to start again with are `argv.slice(2)`, or `argv.slice(1)` from source.
- **A release build of this checkout compiles in seconds, 155 MB** (*ran*), with `--define SLIPBOX_RELEASE=…` as
  `scripts/release.ts` builds one: the terminal checks can drive a real release build in an installer's layout.

## execve from a compiled Bun

The probe (`tmp/issue/probe/exec-probe.ts` on the branch's machine, not committed) prints its pid, parent, `execPath`
and `argv`, starts a worker, then calls libc's `execve` (`dlopen("libc.so.6")`, the arguments and environment as
null-terminated arrays of C strings) on its own `execPath` with an environment variable added; the second stage prints
the same and exits 7.

- Compiled, `./exec-probe one two`: both stages `pid 3117940 ppid 3102231`; the second saw `PROBE_NOTE=carried` and its
  stdin still a terminal; the shell saw `exit=7` (*ran*).
- From source, `bun exec-probe.ts a`: the same, `execve` on `bun` with the script's path (*ran*).
- Through a chain of links, run by its name on `PATH`: `execPath` was the resolved file, `argv0` the name typed
  (`probe`) (*ran*).
- `/proc/self/status` after `execve` and after a fresh start: `SigBlk 0000000000000000`, `SigIgn 0000000001001000`,
  `SigCgt 00000001200044fa`, the same (*ran*).
- `/proc/self/fd` after `execve`: `5 → /dev/urandom`, `6 → /dev/urandom`, where a fresh start has one (*ran*).

What `execve` keeps is POSIX's: the pid, the process group, the session and its controlling terminal; signals handled
are reset to their default, ignored ones stay ignored, and the other threads end (*memory*). So the shell's job is the
same job throughout, and its job control stays right.

## Where a new version is

- The installer's install: `<data>/current` names the version in use (`core/install.ts`; design/distribution.md §
  Installing); `upgrade` moves it in one step (*read*).
- Homebrew's: the running file is `<prefix>/Cellar/slipbox/<version>/bin/slipbox` (`installedBy`'s test, *read*);
  `<prefix>/opt/slipbox` is Homebrew's link to the version it has now, and `brew upgrade` removes the older kegs as it
  cleans up, unless `HOMEBREW_NO_INSTALL_CLEANUP` is set (*memory*). So a restart names `<prefix>/opt/slipbox/bin/
  slipbox`, which outlives the version running.
- One put somewhere by hand: only its own path (*ours*).

## Gaps

- **macOS isn't tried here.** `execve` from a threaded process is POSIX's and macOS's libSystem has it (*memory*); a
  unit test that execs a small program runs on CI's macOS runner and settles it.
- **Native Windows** has no `execve` that keeps the process: its C runtime's `_exec` starts a new process and ends the
  old one, so the shell that started slipbox would take the terminal back while the new one runs (*memory*). There the
  hand-over starts the new one and waits for it (design.md § Restarting); native Windows is staged as `14.14`–`14.17`,
  and WSL is Linux.
- Whether OpenTUI's `destroy` leaves the terminal fully restored before `execve` (raw mode off, the main screen back,
  mouse reporting off) is to be seen live when it's built; quitting relies on the same today.

## Sources

- The probe, run in the workspace's shell pane, 2026-10-24.
- `src/core/install.ts`, `src/core/update.ts`, `src/tui/run.ts`, `src/core/crash-reports.ts` (FFI to libc, D221).
