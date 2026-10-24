---
status: complete
created: "2026-10-24"
branch: feat/issue-25
---

# WSP: Workspaces, and where you are on the top bar

Two words set apart, and one place on screen that says where you are (issue #25). A **vault** stays the content boundary
and the unit you trust: what a file's links, index and search are measured from, its name and its settings, kept in its
folder and shared; whether you trust it stays yours. A **workspace** is the working state slipbox keeps for you in a
place, its tabs and windows: personal, in slipbox's state, never in the vault. slipbox already kept one per branch, one
per folder of home opened by name, and one in each other place; the docs called it the vault's "session". And the
top bar, whose middle was empty, shows the vault, its branch and the workspace when it isn't the vault's own, a click
going to another vault or branch; the status line drops them while the bar says them.

Drafted on 2026-10-24 from the issue and the code, critiqued by Codex, and agreed by the user the same day, each
open question settled as proposed; built the same day (WSP-T1 to WSP-T3, done). Complete: the design files say it
already; consolidation is left, the root requirements' changes (requirements.md § Changes) and the notes under earlier
decisions (design.md, last section).

- [requirements.md](requirements.md): its goals, what it builds on, its acceptance criteria and its changes to the
  root's requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): what was decided, and why (WSP-D1 to WSP-D6).
- [notes.md](notes.md): how it was worked out, what the code does today, the decisions proposed and the questions
  open.
- [ideas.md](ideas.md): the alternatives weighed, and what waits for later.
- [tasks/](tasks/README.md): the work, a task per file.
