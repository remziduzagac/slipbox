---
status: todo
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
