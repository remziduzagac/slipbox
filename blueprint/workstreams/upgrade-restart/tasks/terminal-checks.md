---
status: review
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

- 2026-10-24: tried live first, in a pane of my own: a 0.5.1 release build in the installer's layout, its releases
  a folder offering 0.5.2. The offer came, Upgrade and restart printed the hand-over's two lines, 0.5.2 came back in
  the same terminal saying it restarted, `current` named 0.5.2 with 0.5.1 kept, and `:qa` exited 0 to the same shell.
  Found the dialog drawn off a narrow screen (UPG-T3's log).
- 2026-10-24: `tests/terminal/releases.ts` (the two builds, 8 s here; the copy of the sources links `node_modules`,
  `grammars` and `skills`, which `src/` imports); the runner builds them when a chosen check says `releases`; the
  session's `bin`, `{releases}` and `extraEnv`; `tests/terminal/checks/updates.ts`, nine checks; `CHECKS_FOR` sends
  changes to `core/update.ts`, `core/restart.ts`, `tui/updates.ts`, `tui/dialog.ts` to them. First run: three passed;
  the six failures were the checks' own (a note's name in the wrong case, messages wrapped in their 56-column box —
  read whole from the messages list now — the lens's two `i`s, `until` refusing once slipbox exited).
- 2026-10-24: `SLIPBOX_TERMINAL_JOBS=2 bun run test:terminal updates`: 9/9; `--repeat 2`: 18/18 in 77 s.
  `tests/terminal-coverage.test.ts` 9 pass (`app.restart`, `app.upgrade` run now). The first check's
  `/proc/<pid>/exe` assertion fails with `execve` turned off (the fallback leaves the old file running), checked.
