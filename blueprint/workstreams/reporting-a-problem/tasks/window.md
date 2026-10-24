---
status: doing
assignee: claude-5
blocked_by: [RPT-T1, RPT-T2]
created: "2026-10-24"
---

# RPT-T4: The report's window

The window, and what it keeps (RPT-D1, RPT-D2, RPT-D6; design.md § The window, § What you saw, § Commands).

## Description

- `tui/report.ts`, the `Reporter` (`app.report`): the floating window of kind `report`, a virtual Markdown buffer
  outside the buffers, in source mode, opening typing on the title's line, its own footer; kept while closed; the
  frame after the command kept as text (teed in `App.draw`, that frame only); where you were; adding either.
- The commands `help.report` (`space r`, `:report`, `screen|where`) and `help.report_send` (`ctrl+s`, `:w` in the
  window), the palette's arguments, unknown ones refused; `help.report_send` in `VAULT_FORBIDDEN_COMMANDS`.
- The host's `terminal()` (`tui/run.ts`): OpenTUI's answer as a plain copy.

## Acceptance criteria

- Unit tests and a terminal check for "The window" and "Adding" (requirements.md's cases), and "Config".
