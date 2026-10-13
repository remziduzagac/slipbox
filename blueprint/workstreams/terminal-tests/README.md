---
status: active
created: "2026-10-13"
---

# TT: Terminal tests, headless and by feature

The terminal tests — slipbox itself driven by keys and read off the screen — rebuilt: run headless in a pseudo-terminal
of Bun's own with a headless terminal emulator, so they need no herdr, run in parallel, and run in CI on Linux and
macOS on every change; one check per feature, tied to the cases they cover, so a failure names the feature and the
uncovered show; and their content only from the sample folders. Proposed by the user on 2026-10-13, who agreed to each
part, asked for the draft, and accepted it the same day ("yes merge 25 and start TT after the fix").

- [requirements.md](requirements.md): its goals, acceptance criteria and its changes to the root's requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): what was decided, and why.
- [notes.md](notes.md): how it was settled, and the research behind the headless terminal.
- [tasks/](tasks/README.md): the work, a task per file.
