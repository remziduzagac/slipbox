---
status: todo
assignee: claude-23
blocked_by: [UPG-T1, UPG-T3]
created: "2026-10-24"
---

# UPG-T4: The update offer and `:upgrade` (`tui/updates.ts`)

The daily check's newer version offered in the dialog, by how slipbox was installed; `app.upgrade`: design.md § The
update offer, § MODIFIED § Updates (the daily check).

## Acceptance criteria

- The daily check hands what it found to `app.updates` (the messages list keeps the line it said before); the offer
  waits for quiet (the one test over the input's state) and reads `[update] check` and `DO_NOT_TRACK` again first.
- The installer's: Upgrade and restart, Upgrade restart later, Not now; Homebrew's: Copy `brew upgrade slipbox`, Not
  now; one by hand: Copy the releases' address, Not now. Skip this version kept in `update.json` (`skipped`) and
  honoured by the check.
- Upgrade, restart later: `slipbox upgrade --json` in its own process group, unreferenced, its answer in
  `$XDG_STATE_HOME/slipbox/upgrade-<pid>.json`, read and removed when it exits; `upgrading…`, then installed or failed,
  said; it outlives the TUI (UPG-D7).
- `app.upgrade` (`:upgrade`, CLI `slipbox upgrade`) asks now, whatever the check and `DO_NOT_TRACK` say, keeps the time
  in `update.json`, offers what it finds (a skipped one too), or the restart when it's installed already, or says
  nothing's newer; from source, asks nothing and says why.
- Unit tests of the quiet test, the skip, the choices by install, the background upgrade's answer file, `:upgrade`'s
  cases; the command registered with its spec.

## References

- Delivers: ../design.md § ADDED design/distribution.md § The update offer.
- Rests on: UPG-D1, UPG-D6, UPG-D7.

## Log
