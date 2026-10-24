---
status: active
created: "2026-10-24"
branch: feat/issue-5
---

# RPT: Reporting a problem from inside slipbox

A key, `:report` or help's entry opens a report in the floating window: what happened and what was expected, to type,
with what slipbox knows already filled in — its version, how it was installed and its channel, the system, the
terminal, its size, any multiplexer and SSH. The screen as text, or the note and the cursor's line, is in it only when
you add it. You send it: the bug form opened in your browser, filled in, or the report copied, or posted with `gh`
after a yes; slipbox itself sends nothing. `slipbox report` prints the same facts for an agent. From issue #5.

- [requirements.md](requirements.md): its goals, what it builds on, its acceptance criteria and its changes to the
  root's requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): what was agreed, and why.
- [notes.md](notes.md): how it was discussed.
- [tasks/](tasks/README.md): its work.
- [ideas.md](ideas.md): the alternatives weighed.
- [research.md](research.md): what the bug form's address can carry, and what slipbox knows of itself.
