---
status: review
assignee: maintainer
blocked_by: []
created: 2026-10-25
---

# ASI-T1: install, refresh and remove the bundled skill

Implement ASI-D1–ASI-D3 for #50, with focused lifecycle and integration tests, matching user documentation,
a changelog entry and a draft pull request into dev. Review in two fresh sessions after development.

Implemented automatic detection and safe installation, new-binary upgrade refresh and recognized-skill removal.
User documentation and the distribution design describe the behavior. Focused lifecycle tests cover install,
refresh, skip, foreign and linked files, uninstall revalidation and failures after a binary upgrade. The terminal
upgrade/restart check verifies refresh using a real new release binary. Homebrew execution remains for platform
validation: the template and its filtered environment inputs are covered here, not a live Homebrew sandbox.
