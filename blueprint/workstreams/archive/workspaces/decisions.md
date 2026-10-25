# Decisions: workspaces, and where you are

Proposed in notes.md from the issue and the code, critiqued by Codex, and agreed by the user on 2026-10-24, each open
question settled as proposed; named workspaces, left open, stay a non-goal (WSP-D2).

## WSP-D1: Vault and workspace (2026-10-24)

**Decision:** A **vault** is the content boundary and the unit you trust: what links, the index and search are
measured from; its name; its settings (`.slipbox/config.toml`), in its folder, shared, travelling with it. Whether you
trust it stays yours, on your machine: a vault's config can't set `[trust]`. A **workspace** is your working state in
a place, its tabs and windows: personal, in slipbox's state folder, never in the vault. The rule for settings: a
vault's settings stay with the vault; the UI settings you change in the TUI are yours, kept in slipbox's state. The
docs, the glossary, the help, the messages and the design say so; "session" stays in `ui.restore_session`, in
`session.json`, and for a sitting. slipbox itself is no longer called a workspace where users read it (the README, the
introduction); D33's "shared workspace" stays in the blueprint, terms.md saying the two apart.

**Why:** The issue's: one word for two things (the docs' "the vault's session") hid that the working state is per
place and personal, and that the vault is shared.

**Not chosen:** "session", which is a sitting too; "layout", Obsidian's sense, narrower.

## WSP-D2: A workspace is the tabs and windows; a vault's workspaces share the rest (2026-10-24)

**Decision:** A workspace is the tabs and the active one, the pinned ones, each tab's split with its orientation and
ratio, and each window's note, cursor and history. As the code keys them: in home, one per folder opened by name and
home's own; else one per branch once left; else the vault's last tabs (a detached head keeps none of its own). The
panel layout, the UI settings changed, the recent lists and the nvim picked are the vault's, shared by its
workspaces; the explorer's view isn't kept, revealed from the note open. Named workspaces of your own (`review`,
`writing`), picked from a list, stay a non-goal, the requirements' line reworded to name them.

**Why:** That's what the code keeps, and a branch switch that changed the panes or the theme would surprise. It
narrows the issue's list, which put the panel layout, the explorer's view and the UI settings in the workspace.

**Not chosen:** the panel layout per workspace (worth it with named workspaces, chosen on purpose); everything per
workspace, the UI settings included.

## WSP-D3: The scratch stays the vault's (2026-10-24)

**Decision:** The scratch, like the trash and the undo log, is kept by vault, shared by its workspaces.

**Why:** The CLI writes it (`slipbox capture`) without knowing a workspace; a branch switch would hide what an agent
captured; a worktree already gives a task its own.

**Not chosen:** a scratch per workspace (ideas.md).

## WSP-D4: Where you are is on the top bar (2026-10-24)

> **Amended by VB-D3, VB-D6 and VB-D7 (2026-10-26):** the permanent top bar separates zoom, workspace and
> git; a git workspace is labelled by its vault. Work count and running version are always present.

> **Refined (2026-10-24), taken as recommended in the pull request's review, for the maintainer to confirm or
> reverse:** a merge or a rebase under way is no longer given up with ahead and behind, but after the branch: a review
> found that on a narrow bar it went first, and with the status line yielding to the bar, nothing on screen said a
> rebase was under way. The order now: ahead and behind, the branch (cut, then gone), the operation, the workspace, the
> vault's name.

**Decision:** The top bar's middle says where you are: `◈` and the vault by name or path, home `◈ ~`, Elsewhere
`Elsewhere` without the glyph; then home's folder opened by name (`◈ ~ › notes`); then the branch as the status line
wrote it (`· main ↑2 ↓1`, `merging`, `rebasing 2/5`, a worktree's `@feat`, a detached head's commit). Centred on the
screen, then clamped into the span between the chip and the right end's first item, 2 columns from each. Short of
room, cut a step at a time: paths from the front, the branch's track and operation, the branch, the workspace, the
vault's name; with too little room, not drawn. Two click targets: the vault (with the workspace) lists the named
folders, as `space v v`; the branch (from its `·` or `@`) opens the branches' menu.

**Why:** The issue's: the top bar's middle was empty while the status line was the most crowded row.

**Not chosen:** left-aligned after the chip (it crowds the chip, the bar lopsided); the branch as `⎇ main` (a second
way to write what the docs show one way).

## WSP-D5: The status line says where only while the top bar doesn't (2026-10-24)

> **Superseded by VB-D3 (2026-10-26):** the top bar is permanent, including zen; the status line has no
> location fallback. The retired `ui.top_bar` setting produces one notice.

**Decision:** The status line names the vault and its branch only while the top bar doesn't: hidden
(`ui.top_bar = false`, `space u b`), or too narrow for even the vault; zen has neither bar. The vault and the branch
go together, giving the path the room; when shown it says what the top bar would, home's folder included
(`~ › notes`), its click still the branches' menu. On a screen too narrow for either, neither says it.

**Why:** D65's "a file shows once", kept; the top bar's room first.

## WSP-D6: The code keeps its names (2026-10-24)

**Decision:** `Session`, `session.json`, `TabSet` and `ui.restore_session` stay, their comments saying workspace.

**Why:** The file holds the workspaces and what they share; `slipbox history` reads it; a rename asks a migration for
no one's benefit (`docs/manual/versions.md` allows one, so it stays possible).

**Not chosen:** `Session` renamed `Workspaces`, `session.json` renamed (ideas.md).
