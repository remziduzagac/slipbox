---
status: todo
assignee: claude-23
blocked_by: [UPG-T4, UPG-T5, UPG-T6]
created: "2026-10-24"
---

# UPG-T7: The `updates` terminal check

Each case of the acceptance criteria driven in a terminal: design.md § MODIFIED design/testing.md § The terminal
tests.

## Acceptance criteria

- The harness starts a given binary as well as `bun src/main.ts`.
- Two release builds of the checkout, built once a run, the second's `version.ts` newer; the first installed in the
  check's data folder as the installer lays it out; the second served from a folder (`SLIPBOX_RELEASES_URL=file://…`).
- Checked: the offer and its quiet; Upgrade and restart, coming back newer with the tabs; the unsaved question, Save
  and Cancel; a failed upgrade (a wrong sum); Not now and Skip; Upgrade, restart later then `:restart`; quitting during
  it (a slow local server); `:upgrade`; an upgrade underneath; Homebrew's and a hand-put install's choices; `:restart`
  from source.
- Each passes with `SLIPBOX_TERMINAL_JOBS=2 bun run test:terminal updates`; the coverage test finds `app.restart` and
  `app.upgrade` run.

## References

- Delivers: ../requirements.md § Acceptance criteria; ../design.md § MODIFIED design/testing.md.
- Rests on: ../notes.md § Codex's critique, 11.

## Log
