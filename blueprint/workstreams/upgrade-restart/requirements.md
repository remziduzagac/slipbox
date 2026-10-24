# Requirements

## Goals

- When the daily check finds a newer slipbox, the TUI asks in a pop-up whose choices are its own controls — a select
  of what to do, checkboxes for the options — rather than a message to act on later (issue #23).
- Upgrade and restart is one step: slipbox quits as it does, upgrades as `slipbox upgrade` does, and starts the new
  version in the same terminal, with its tabs, windows and positions as they were.
- Upgrading can wait for a restart you choose: the upgrade done beside the TUI, a named command restarting into it.
- A newer version installed underneath a running slipbox (another terminal, another window, Homebrew, a file copied
  over) is noticed, and the restart offered.
- Not now, skip this version, and keep checking daily are answered in the pop-up itself.

## Non-goals

- Installing anything without a yes, or asking the network more than the daily check does today.
- Upgrading Homebrew's slipbox, or one put somewhere by hand: they're told how, and offered the restart once it's done.
- A check from the CLI: agents call it, and it never asks (D199).
- Native Windows' restart beyond starting the new version and waiting for it: `14.14`–`14.17`.
- Going back to an older version from the TUI (`ln -sfn versions/<old> <data>/current` stays the way).

## Builds on

- requirements.md § Quality goals, "Nothing identifying leaves the machine" (D199, GR-D15): the check's requests are
  unchanged.
- requirements.md § Constraints, § Safety, "The network" (DF-D1, DF-D23): your own config alone turns the check on or
  off.
- design/distribution.md § Installing, § Channels, § Homebrew: the installer's layout, `current`, the channel,
  `installedBy`.
- design/tui.md § Positions, § Buffers, views, tabs, windows; tui/session.ts: what a session keeps and restores.
- design/tui.md § Writing notes: notes written only through `writeBuffer`; `:wqa`'s saving.
- D221: libc reached through `bun:ffi`.

## Acceptance criteria

- With a newer release found, the pop-up opens once the TUI is quiet, never over another window, and a key typed as it
  opens doesn't answer it.
- Upgrade and restart, from a release build in the installer's layout: unsaved notes saved; the screen given back;
  the new version installed as `slipbox upgrade` installs it (its sum checked, its binary run, `current` moved); the
  new version running in the same terminal, the same process to the shell, its arguments the same; the tabs, windows
  and cursor positions as they were; the message saying it restarted.
- A failed upgrade (a wrong sum, a download refused) starts the version that was running, which says why; `current`
  and the versions are as they were.
- A note that can't be saved stops the restart, saying which; nothing quits.
- Upgrade, restart later: the TUI usable throughout; the message saying when it's installed, or why not; `:restart`
  then starts it.
- Two windows on one vault: the one restarted comes back with its own tabs, whatever the other saved meanwhile; an
  old window's upgrade never moves `current` back.
- Not now asks again at the next check; Skip this version asks again only for a newer one; unticking Keep checking
  daily writes `[update] check = false` into your own config, the rest of the file unchanged (a link to it kept a
  link), and the check stops.
- Homebrew's and a hand-put binary's pop-ups offer the command or the address to copy, and the restart once their
  binary is newer.
- `current` moved by another terminal's `slipbox upgrade` is noticed, and the restart offered, once.
- `DO_NOT_TRACK` or `[update] check = false`: no request, and no pop-up but the restart's (which sends nothing).
- Every case has a unit test and a terminal check (tests/terminal/checks/); `bun run check` passes; the user docs and
  the CHANGELOG say it.

## Changes

### MODIFIED requirements.md § Distribution

The fourth point, whole:

- `slipbox upgrade` installs the newest its channel offers; the TUI checks for it once a day, on by default (D199,
  GR-D15), and offers it in a pop-up: upgrade and restart, upgrade now and restart later, or not now, skipping the
  version or turning the check off there; nothing installed without a yes. A restart saves what's unsaved, quits as
  quitting does and starts the new version in the same terminal, where you were; a newer version installed underneath
  a running slipbox is offered as a restart. Homebrew gets a formula with each release, never a preview, into a tap
  once there is one, and an install brew made is left to brew (D204, GR-D18).

Previously: "`slipbox upgrade` installs the newest its channel offers; the TUI checks for it once a day, on by default
(D199, GR-D15). Homebrew gets a formula with each release, never a preview, into a tap once there is one, and an
install brew made is left to brew (D204, GR-D18)."
