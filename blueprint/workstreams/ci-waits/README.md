---
status: active
created: "2026-10-24"
branch: ci/issue-65
---

# CIW: A pull request's checks wait less

CI's runs wait mostly on macOS runners, not on the tests, and a merge tests again what its pull request just tested.
This workstream takes issue #65's first two items, the ones wanted before the next preview: a push to `dev` or `test`
tests what changed since the last commit whose run passed, however many runs were cancelled or failed between, and
skips what a pull request's run already tested on the same tree; and moving `dev` to `test` tests nothing `dev`
passed. The issue's other items (the Linux jobs sharded, `CHECKS_FOR` mapping more of the app, macOS kept for what
needs it, macOS after Linux, the slowest tests watched) are tasks for later, not done here.

- [requirements.md](requirements.md): its goals, what it builds on, its acceptance criteria, and its changes to the
  root's requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): what the maintainer agreed, CIW-D1 to CIW-D4.
- [tasks/](tasks/README.md): its tasks; the issue's other items are tasks for later.
- [notes.md](notes.md): how it was discussed.
- [research.md](research.md): what GitHub's API says of a run, a pull request's run and an artifact.
- [ideas.md](ideas.md): the alternatives weighed.
