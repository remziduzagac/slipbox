---
status: done
assignee: claude-5
blocked_by: [RPT-T1]
created: "2026-10-24"
---

# RPT-T2: The report's text, read back, and the address

The report as text, read back by one rule, and the bug form's address with its plan (RPT-D1, RPT-D2, RPT-D3;
design.md § Reading it back, § Sending's address and plan).

## Description

- `core/report.ts`: the report's first text (the guide, the title line, the form's headings, the facts); reading it
  back (headings outside fences only; a label renamed, deleted, doubled, reordered; text before the first label; the
  guide as generated or edited); what's sent as written (the copy, `gh`'s title and body); an attachment fenced past
  its own fences and placed at the end of What slipbox sees, refused while a fence is open; the address by field id,
  at most 5,000 characters encoded, by its plan, saying what it leaves out.

## Acceptance criteria

- Unit tests for each case in requirements.md's "Reading back", "Adding" (the text's side), "Sent as written" and
  "The address".
