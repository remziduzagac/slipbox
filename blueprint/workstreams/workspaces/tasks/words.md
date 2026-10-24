---
status: active
assignee: claude-cli
blocked_by: []
created: "2026-10-24"
---

# WSP-T1: Vault and workspace, in everything users read and in the design

The words of WSP-D1 and WSP-D2.

## Description

- The docs say workspace for the working state, and what a workspace holds and what its vault's workspaces share:
  `docs/manual/vaults.md` (§ Home, § Switching vaults, § Worktrees), `concepts.md` (a Workspace entry, unlike VS
  Code's and Obsidian's), `how-it-works.md`, `screen.md`, `environment-and-storage.md`, `configuration.md`,
  `customization.md`, `troubleshooting.md`, `cli.md`'s purge, `docs/README.md`, `agent-guide.md`, and the guides that
  say session for it. Nothing says a vault's settings decide its trust.
- The README's "make the workspace yours" and the introduction's "a terminal workspace" reworded.
- The commands' descriptions (Quit, Fetch), the message when a named folder moved by hand (`src/tui/vaults.ts`), the
  purge's list (`src/core/install.ts`), the comments in `src/tui/session.ts` and `src/core/position.ts`.
- The design's words, as design.md lists them: `tui.md`, `roots.md`, `terms.md`, `how-it-works.md`,
  `distribution.md`; the requirements' changes.

## Acceptance criteria

- "session" is left in the docs only where it means a sitting, a process's or a picture's, and in
  `ui.restore_session` and `session.json`; `tests/docs.test.ts` holds the docs to it.
- `check:docs` passes.
