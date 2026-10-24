---
status: done
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

- 2026-10-24: `src/tui/updates.ts` (`app.updates`): `found` (the line to the messages list alone, `App.listMessage`),
  `quiet` (`Input.busy` added), `tryOffer` (your config and `DO_NOT_TRACK` read again), `offer` by install,
  `upgradeBeside` (`slipbox upgrade --json`, `detached`, unreferenced, its stdout a file in the state folder),
  `check` (`:upgrade`), `installedNewer` (the installer's `current`; UPG-T6 adds the others). `core/update.ts`:
  `dailyUpdateCheck` returns what it `Found`, `askNewest` asks for `:upgrade` too, `skipVersion`/`skippedVersion`
  keep `skipped` beside `checked` (each write keeps the rest). `app.upgrade` (CLI `slipbox upgrade`) and `app.restart`
  specs, `:upgrade` and `:restart` aliases, their actions (not awaited: the keys go on). `tui/run.ts` gives
  `app.updates` its `env` and starts it, in place of the daily check's call.
- 2026-10-24: `tests/tui-updates.test.ts`, the offer's 7 (quiet: inserting, a selection, a sequence pending, two
  seconds; dropped with the check turned off; Homebrew's and a hand-put's copies; Skip kept and honoured; the
  background upgrade's answer, installed or failed; `:upgrade`'s cases; the restart offered when installed already).
  `tests/distribution.test.ts -t 'updates|Homebrew|channel'` 27 pass (three updated for `Found`). Mutations: see
  UPG-T5's log, run together.
