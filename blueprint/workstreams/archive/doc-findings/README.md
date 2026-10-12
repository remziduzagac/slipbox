---
status: consolidated
created: "2026-10-11"
---

# DF: What writing the docs found

> Consolidated into its parent on 2026-10-12.

The fixes and changes that writing the user documentation (DOC) turned up, as the user settled them item by item on
2026-10-11: bugs where the design is right, places where the code and the design disagreed, gaps, and screenshots in
the docs. Accepted with the answers themselves; the npx package for the skill is not here, but a workstream of its
own, to scope (ideas.md § Agent surface).

- [requirements.md](requirements.md): its goals, acceptance criteria and its changes to the root's requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): what was decided, and why.
- [notes.md](notes.md): how it was settled.
- [tasks/](tasks/README.md): the work, a task per file.

## Outcome

Shipped as the user settled it: the bugs fixed (A1 to A19), the code and the design brought together (B1 to B6), the
gaps closed (C1, C2, C4 to C6), the examples' stale text corrected (D), screenshots in the guides and the screen
chapter (E), and the follow-ups (F1 to F12, DF-D20 to DF-D31). C3, the skill as an npx package, went to the root's
ideas as a workstream of its own. Each fix has a regression test, mutation-checked; 41 terminal scenarios cover the
fixed parts, nine of them new; the full suite passes. Choices made on the coordinator's recommendation, as the user
asked, are listed in [notes.md](notes.md). Nothing forced.

