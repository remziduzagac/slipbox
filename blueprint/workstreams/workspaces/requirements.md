# Requirements

## Goals

- Two words, each for one thing: **vault** for the content and trust boundary, **workspace** for the working state
  slipbox keeps for you in a place; the docs, the glossary, the help, the messages and the design say them so,
  consistently (WSP-D1).
- What a workspace holds, and what a vault's workspaces share, said plainly (WSP-D2); the rule for settings kept: a
  vault's settings are the vault's, the UI settings you change are yours (WSP-D1).
- Where you are on screen, shown once, while there's room: the vault, its branch, and the workspace when it isn't the
  vault's own, on the top bar's empty middle; a click on the vault goes to another, on the branch lists the branches
  (WSP-D4). The status line names the vault only while the top bar doesn't (WSP-D5).

## Non-goals

- Re-keying the working state: a workspace is kept per branch, per folder of home opened by name, and per vault, as
  the session is today (`src/tui/session.ts`). Nothing moves between `session.json`'s parts.
- Named workspaces of your own (`review`, `writing`) in one vault, with a picker: not built here. Whether they stay a
  non-goal or go to the roadmap's Later is the user's (notes.md, open question 5; ideas.md).
- The scratch per workspace: it stays the vault's (WSP-D3; ideas.md).
- Renaming `session.json`, the `Session` class or `ui.restore_session` (WSP-D6).
- The CLI: nothing it prints names a workspace; `slipbox info` and `history` are unchanged.

## Builds on

- How a vault is named and shown: by its name, else its path; home `~`; Elsewhere; a named worktree `name@branch`
  (design/roots.md § How a vault is named and shown; D77, VV-D2, VV-D3).
- Each branch's tabs and each folder of home's tabs (design/tui.md § Positions; D153, VV-D2), and the vault's state by
  its key (design/roots.md § State by vault).
- The named folders' list, `space v v`, going into the one picked (design/tui.md § Going into a vault; D74).
- The branches' menu: Pull, Push and Fetch, then the branches (design/tui.md § Git; GIT-D8), and the status line's
  where, ahead and behind, a merge or a rebase under way (GIT-D4, GIT-D6).
- The top bar and its hiding (`ui.top_bar`, `space u b`, zen; design/tui.md § Screen layout).

## Acceptance criteria

- **Terms:** the docs (`docs/manual/vaults.md` § Home, § Switching vaults, § Worktrees; `concepts.md`, with a
  Workspace entry saying how it differs from VS Code's and Obsidian's; `how-it-works.md`; `screen.md`;
  `environment-and-storage.md`; `configuration.md`; `customization.md`; `troubleshooting.md`; `cli.md`'s purge;
  `docs/README.md`; `agent-guide.md`; the guides that name the session, `making-it-yours.md` among them), the
  commands' descriptions, the help and the messages say vault for the content boundary and workspace for the working
  state; "session" is left only where it means a sitting, a process's or a picture's, and in `ui.restore_session` and
  `session.json`. Nothing says a vault's settings decide its trust: trust is yours. The design
  (`blueprint/design/tui.md`, `roots.md`, `terms.md`, `how-it-works.md`, `distribution.md`) says the same. WSP-D1
  records the terms and the boundary.
- **The top bar:** it shows the vault (a named vault, a vault by its path, home, Elsewhere, a worktree), its branch
  with ahead and behind and a merge or rebase under way, and home's folder opened by name; centred, never over the
  chip, the outline's button or `indexing…`; short of room, the path cut first, then the branch. A click on the vault
  lists the named folders and `enter` goes into one; on the branch, the branches' menu.
- **The status line:** it names the vault and its branch only while the top bar doesn't: `ui.top_bar = false`,
  `space u b`, or a bar too narrow for even the vault.
- **Tests**, each case a unit test and a terminal check that drives slipbox through it (notes.md lists which covers
  which): what the top bar shows for a named vault, a vault by path, a vault without git, home, home's folder,
  Elsewhere, a named worktree, a detached head, a branch ahead and behind, a merge and a rebase under way, a name of
  wide characters; its cutting at each width, clear of the chip, `indexing…` and the outline's button; the two click
  targets, a worktree's `@` included; a branch switch and going into another vault changing it; the status line's
  rule (the bar shown, hidden, zen, too narrow). The existing checks that read the vault off the status line read it
  with a helper of its own; an assertion that read the vault and the path together is split in two.
- **Docs:** `screen.md` (the map, the top bar, the status line, where you were), the mouse table in `keys.md`, the
  mouse help (`src/tui/mouse-help.ts`), and every page that says the status line names the vault or shows the branch
  (`git.md`, `vaults.md`, the guides `vaults.md` and `code-and-git.md`).
- **Screenshots** retaken (`bun run shots`), each looked at.
- **CHANGELOG:** a line under Changed.
- `bun run typecheck`, the lint and `check:docs` pass; the docs say it without the blueprint's IDs.

## Changes

### MODIFIED requirements.md § Non-goals

The second bullet's "workspaces (restoring a session is not this)" becomes "named workspaces, Obsidian's, picked from a
list (slipbox keeps one per place by itself: WSP-D1)": the word now names what slipbox restores. If the user moves
named workspaces to Later (open question 5), the words go from this bullet instead, and Later gets them at
consolidation.

Previously: "Obsidian's life-management features: daily notes, random note, the unique note creator
(timestamp-titled notes: descriptive file names and renames that fix links instead), the audio recorder, workspaces
(restoring a session is not this), the web viewer. …"

### MODIFIED requirements.md § Vaults and links

The first bullet's end becomes: "choosing a file of another vault goes into it, and into your workspace there
(D58, D69, D80, VV-D1–VV-D4, WSP-D1)". The third: "Opening a folder writes nothing into it: nothing derived or
personal lives in the user's folders. Reading positions, workspaces, the scratch and the trash stay on the machine,
kept by path (D39, D58, D76, WSP-D1)."

Previously: "… choosing a file of another vault goes into it, its tabs its own (D58, D69, D80, VV-D1–VV-D4)." and
"Reading positions, sessions, the scratch and the trash stay on the machine, kept by path (D39, D58, D76)."

### MODIFIED requirements.md § Navigating and search

Adds, after the explorer's bullet: "Where you are is on screen, once, while there's room: the vault, its branch, and
the workspace when it isn't the vault's own, on the top bar, else on the status line; a click goes to another vault
or another branch (WSP-D4, WSP-D5)." Its "How" line adds design/tui.md § Screen layout.

Previously: no bullet on where you are; the status line's vault was design only (design/tui.md § Screen layout).
