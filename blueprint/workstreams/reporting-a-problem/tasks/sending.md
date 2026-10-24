---
status: todo
assignee: claude-5
blocked_by: [RPT-T3, RPT-T4]
created: "2026-10-24"
---

# RPT-T5: Sending

The menu and each way of sending (RPT-D3, RPT-D4; design.md § Sending).

## Description

- In `tui/report.ts`: the menu, by what this machine can do; the browser opened, else the address copied; the copies,
  one at a time, each said as `App.copy` says it; `gh`'s yes-or-no and post, once at a time, the window closed while
  it posts, the draft dropped or kept.

## Acceptance criteria

- Unit tests and terminal checks (a fake `xdg-open` and `gh` on the check's `PATH`; the clipboard's file) for
  requirements.md's "The browser", "Copies" and "gh".
