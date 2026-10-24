# Decisions: upgrading and restarting from the TUI

## UPG-D1: No "Keep checking daily" checkbox; the TUI still never writes your config (2026-10-24)

**Decision:** The update offer's one checkbox is Skip this version. Turning the daily check off stays where it is today:
`[update] check = false` in your own config, or `DO_NOT_TRACK`. The TUI never writes your config (design/tui.md § UI
settings), with no exception.

**Why:** The maintainer's: the checkbox isn't needed. Not now puts the offer off to the next check, Skip this version
until a newer one, and your config turns it off for good. It would have been the one place the TUI writes your config,
with an editor of its own to keep the file's comments, its order and a link to it as they were (notes.md § The
maintainer's answers, 1).

**Not chosen:** the checkbox writing `check = false`, the issue's (an exception to the root's design, `D?1`); its
answer kept in slipbox's state (two places turning the check off, and the config saying it's on while nothing checks:
DF-D23); a line in the pop-up naming the config's key (ideas.md § Keep checking daily).

## UPG-D2: slipbox upgrades in the foreground, then replaces itself (2026-10-24)

**Decision:** Upgrade and restart's update is no script file. slipbox, its screen given back, upgrades in the same
process with `slipbox upgrade`'s own code, then replaces itself with the new version by `execve` (libc through
`bun:ffi`, D221): one process to the shell throughout. Only where `execve` can't be reached (native Windows, libc not
found, the call failing) is the new version started and waited for. No launcher.

**Why:** Agreed by the maintainer (notes.md § The maintainer's answers, 2). The shell's job stays the same job, so
`ctrl+z`, `fg` and the exit code are right; nothing is written to run, nothing is left waiting, and the installer's
layout is unchanged. A compiled Bun replacing itself so keeps its pid, its parent and its exit code, a worker thread
running and all (research.md).

**Not chosen:** a script file slipbox execs into (a file to write and remove, the arguments quoted for `sh`, no `sh` on
native Windows); the new version started and waited for everywhere (the old one in memory behind it, one more for each
restart); a launcher run on every start (a process more each time, and the installer's and Homebrew's layouts changed)
(ideas.md § How the hand-over takes the terminal). This settles what the issue left open: how the update takes the
terminal and gives it back.

## UPG-D3: A restart with unsaved notes asks first (2026-10-24)

**Decision:** A restart (Upgrade and restart, Restart now, `:restart`) with notes unsaved asks, in the dialog: **Save
and restart** or **Cancel**, naming them. Save and restart saves them as `:wqa` does; one that can't be saved stops the
restart, saying which, and nothing quits. With nothing unsaved, it doesn't ask.

**Why:** The maintainer's choice (notes.md § The maintainer's answers, 3): a restart loses nothing, as the issue asks,
and writes nothing you haven't said yes to.

**Not chosen:** saving without asking, as `:wqa`; refusing, as `:q`; the unsaved text carried across in the restart's
note, unsaved (ideas.md § Unsaved notes on a restart).

## UPG-D4: A restart comes back where you were (2026-10-24)

**Decision:** A restart comes back in the vault, home's folder or Elsewhere's folder you're in, with this window's
tabs, windows and positions, from the restart's note: whatever `ui.restore_session` and a note named in the arguments
say. The arguments' path and `--root` give way to it; `--base` isn't applied again.

**Why:** Agreed by the maintainer (notes.md § The maintainer's answers, 4): a restart carries on; it doesn't start
over.

**Not chosen:** strictly the start's arguments; where you were, with the tabs only when `ui.restore_session` is on
(ideas.md § Where a restart comes back).

## UPG-D5: An upgrade underneath is offered whatever the check says (2026-10-24)

**Decision:** A newer version installed underneath a running slipbox is offered as a restart whatever `[update] check`
and `DO_NOT_TRACK` say.

**Why:** Agreed by the maintainer (notes.md § The maintainer's answers, 5): it looks only at this machine's files and
sends nothing, and it's offered only after someone has upgraded.

**Not chosen:** off with `[update] check = false` (read as "don't bother me about versions"); off with either (ideas.md
§ The restart offer with the check off).

## UPG-D6: `:upgrade` checks now (2026-10-24)

**Decision:** `app.upgrade` (`:upgrade`) asks for the newest version now, as the daily check asks, and opens the offer
for what it finds, a version you skipped included. It's asked for, so it asks whatever `[update] check` and
`DO_NOT_TRACK` say, as `slipbox upgrade` does. Nothing newer: it says so. From source, it says what `slipbox upgrade`
says, and asks nothing.

**Why:** The maintainer's choice (notes.md § The maintainer's answers, 6): the offer again after Not now, sooner than a
day, without leaving the TUI.

**Not chosen:** no `:upgrade` (`slipbox upgrade` in a shell, then the restart offered); `:upgrade` reopening only the
offer this session put off, asking nothing (ideas.md § Asking again).

## UPG-D7: Upgrade, restart later's upgrade outlives the TUI (2026-10-24)

**Decision:** The upgrade Upgrade, restart later starts, a process of its own, finishes after the TUI quits, its answer
written to a file; the next start runs what it installed.

**Why:** Agreed by the maintainer (notes.md § The maintainer's answers, 7): it's what was asked for, and `current`
moves only at its end, so nothing is left half done.

**Not chosen:** stopped with the TUI, as shell jobs are; asked on quitting (ideas.md § Quitting during an upgrade).
