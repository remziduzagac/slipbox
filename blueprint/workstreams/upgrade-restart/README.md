---
status: active
created: "2026-10-24"
branch: feat/issue-23
---

# UPG: Upgrading and restarting from the TUI

When the TUI's daily check (`14.4`, D199) finds a newer slipbox, or `:upgrade` asks, it offers it in a pop-up of its
own controls instead of saying so in a message: upgrade and restart, upgrade now and restart later, or not now, with
skipping the version as a checkbox. A restart asks before saving notes unsaved, hands over to the upgrade with the
screen given back, and replaces itself with the new version in the same terminal, coming back where you were with its
tabs, windows and positions. A slipbox upgraded underneath a running one offers the restart alone. From issue #23.

- [requirements.md](requirements.md): its goals, what it builds on, its acceptance criteria, and its changes to the
  root's requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): what the maintainer agreed, UPG-D1 to UPG-D7.
- [ideas.md](ideas.md): the ways the hand-over could take the terminal, and the other alternatives weighed.
- [notes.md](notes.md): how it was discussed, and the maintainer's answers.
- [research.md](research.md): what was tried on this machine: a compiled Bun replacing itself by `execve`.
- [tasks/](tasks/README.md): its tasks, UPG-T1 to UPG-T8.
