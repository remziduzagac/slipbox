---
status: done
assignee: claude-23
blocked_by: [UPG-T2, UPG-T3]
created: "2026-10-24"
---

# UPG-T5: `:restart`, the quit into the hand-over, and coming back

`app.restart`, wired from the TUI to `core/restart.ts` and back: design.md § Restarting.

## Acceptance criteria

- `app.restart` (`:restart`, no key, CLI `null`) and Upgrade and restart: notes unsaved asked about first (Save and
  restart, Cancel, naming them); saved as `:wqa` saves; one that can't be saved stops it, said, nothing quit. Nothing
  unsaved: no question. While a background upgrade runs, it waits, saying so.
- The note written with the place and this window's session, read back; then the quit as quitting does; the hand-over
  only after OpenTUI's `destroy` event and a turn of the event loop (`tui/run.ts`).
- Coming back: the note taken; the place over the arguments' path and `--root`, `--base` not applied again; the
  note's session restored whatever `ui.restore_session` and a named note say; `restarted: slipbox X (was Y)`, or the
  failure, said.
- Unit tests of the place's precedence and the session restored from a note; a regression test that a second window's
  `session.json` doesn't replace the restarted window's tabs.

## References

- Delivers: ../design.md § ADDED design/distribution.md § Restarting; § MODIFIED how-it-works.md (run.ts's row).
- Rests on: UPG-D2, UPG-D3, UPG-D4.

## Log

- 2026-10-24: `Updates.restart` (waits for a background upgrade, saying so; asks about notes unsaved; `saveAll`
  stops at the first that can't be saved, as `:wqa` does), `leave` (the note: `Session.snapshot`, split out of
  `save`; `place()`), then `App.quit`. `tui/run.ts`: the note taken before `prepare`; `prepare(argv, back)` takes the
  place (`placed`: still a vault, home or a folder, else the arguments), drops `--base`, the session only with the
  place; `runTui` hands over after OpenTUI's `destroy` event and a turn (`handOver`, `nextLaunch`, the upgrade with a
  signal). `App`: `restarted` restores with `Session.restoreFrom` whatever `restore_session` says, and says how it
  went (`cameBack`). The harness takes `now` and `restarted`.
- 2026-10-24: `tests/tui-updates.test.ts`, 22 pass (119 expects) with the dialog's and the offer's; the restart's 7:
  the note's place and session; asked first (Cancel, Save and restart); a failed save stopping there with a second
  note left unsaved; Upgrade and restart's note; waiting for a background upgrade; coming back over the arguments
  (`--base` not applied, `session.json` written by another window meanwhile not taken); a failed upgrade said, a
  place gone falling back with no session. `tests/tui.test.ts -t 'opened shows|prepare|session'` 13 pass. Mutations
  for T4 and T5, each alone: 15, all caught — `--base` applied again was missed outside git (`baseAtOpen` only warns
  there) until the test checked for its warning.
- 2026-10-24: `tests/terminal-coverage.test.ts` fails until UPG-T7: no check runs `app.restart`, `app.upgrade` yet.
