---
status: proposed
created: "2026-10-14"
---

# VV: Vaults and the explorer's view

What slipbox calls the folders it works in, and what the explorer shows of them. Today a "root", a "plain folder" and
a "loose file" are three ideas, other roots appear in the explorer in three places, and opening a folder inside a root
shows the root instead. The user found the explorer's roots confusing while looking at the git panel (GIT, paused for
this), and worked the model out in conversation on 2026-10-14: vaults, home among them, a no-vault for the rest of the
file system, and the explorer as one view of the whole tree, zoomed.

Settled in conversation, to be accepted as a whole before the work starts; GIT (`../git-review/`) is rebased on it
once it is.

- [requirements.md](requirements.md): its goals, acceptance criteria and its changes to the root's requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): what was settled, and why.
- [notes.md](notes.md): how it was talked through, the drawings, and what's left for the user to confirm.
- [tasks/](tasks/README.md): the work, a task per file.
