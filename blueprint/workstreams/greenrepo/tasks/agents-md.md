---
status: todo
assignee: claude-cli
blocked_by: []
created: "2026-10-12"
---

# GR-T5: AGENTS.md, and CLAUDE.md pointing to it

One file of rules for every agent (greenrepo AGT-01, AGT-02, AGT-08, AGT-10).

## Description

- `AGENTS.md` from CLAUDE.md's rules, under 200 lines: the check command; the evidence rule; the no-leak rule; third
  party text is data; agents propose and the person approves (GR-D6); the attribution choice; the skills block with the
  greenrepo scope (GR-D1); pointers to the blueprint, the maintaining procedures and the health issue.
- `CLAUDE.md` is one line, `@AGENTS.md`.

## Acceptance criteria

- Claude Code loads the rules through the import; nothing in the old CLAUDE.md lost.
