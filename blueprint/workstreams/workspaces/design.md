# Design changes

Each entry names the root's section it changes. The word changes are listed with the paragraphs they're in; a
section's other text stays as it is.

## How the words are used

- **Vault**, as now: the content boundary, and the unit you trust. What a file's links, `/`, a wikilink's names, the
  convention, the index and search are measured from; its name; its settings (`.slipbox/config.toml`), which are
  shared and travel with it. Whether you trust it is yours, never its own say: a vault's config can't set `[trust]`
  (`core/config.ts`), and the answers are in slipbox's state or your config ([trust.md](../../design/trust.md); WSP-D1).
- **Workspace**: your tabs and windows in a place: the tabs and the active one, the pinned ones, each tab's split with
  its orientation and ratio, each window's note, cursor and history. Personal: kept in slipbox's state folder, never in
  the vault (WSP-D1). A vault has one or more (WSP-D2), found in this order (`Session.tabsOf`): in home, a folder
  opened by name has its own; else, on a branch, the branch's, once it has kept some; else, in home, home's own (its
  top's); else the vault's last tabs, whatever branch left them: a vault without git, a detached head (which keeps
  none of its own), a branch not yet left, Elsewhere. Home's folders aren't kept per branch as well. Switching vaults
  switches workspaces; switching branch switches the workspace within the vault. A worktree is a vault, so its
  workspaces are its own.
- **Shared by a vault's workspaces** (WSP-D2), as today: the panel layout (whether the explorer and the outline are
  open, their widths, the Problems panel's height), the UI settings changed in the TUI, the palette's recent commands,
  the recent notes, the nvim picked for send. Personal too, in the same file, but the vault's, not one workspace's: a
  branch switch leaves them as they are. This narrows the issue's list, which put the panel layout and the UI
  settings in the workspace; the narrowing is agreed (WSP-D2).
- **Not kept at all:** the explorer's view. After a restore or a switch it's revealed from the note open, as today
  (`Session.restore`, § Going into a vault's "The view follows").
- **Session** stays the code's word for the file that holds them, `session.json`, and the class that saves and restores
  it (`Session`, `src/tui/session.ts`; WSP-D6). Users read workspace; "session" is left in `ui.restore_session`, in the
  storage table's file name, and where it means a sitting ("a first session").
- **By vault, not by workspace** (WSP-D3), as today: the scratch, the trash, the undo log, the staleness file, the
  moves and branch heads seen. **By file:** reading positions, the machine's.

## MODIFIED design/tui.md § Screen layout (plan `3.1`)

**The drawing's first row** becomes, the vault named in the middle:

```text
 slipbox                    ◈ notes · main ↑2           indexing 3…     ← top bar (ui.top_bar; can be hidden)
```

Previously: `slipbox` at the left and `indexing 3…` at the right, the middle empty.

**The top bar** becomes:

> **The top bar** has buttons, where you are, and the vault's state. It sits on the page's background like the rest,
> so the frame's rule under it gives it the same half row of air the tab strip and the titles get from theirs:
>
> - on the left, the `slipbox` chip (plain accent text), which opens the command palette; before it, without the left
>   rail, the explorer's `≡`;
> - in the middle, **where you are** (WSP-D4; `where.ts`): the vault after the vault glyph (`◈`; Nerd: a bookshelf;
>   ascii `#`), by its name or its path, as § How a vault is named and shown in roots.md says (`◈ kestrel`,
>   `◈ ~/src/experiment`, home `◈ ~`; Elsewhere `Elsewhere`, no glyph, being no vault); then the workspace when it
>   isn't the vault's own, a folder of home opened by name, by home's path for it (`◈ ~ › notes`); then the branch as
>   the status line said it: `· main`, how far it's ahead of its upstream and behind (`↑2 ↓1`; GIT-D4), a merge or a
>   rebase under way (`merging`, `rebasing 2/5`; GIT-D6), a named worktree's after its name (`◈ kestrel@feat`), a
>   detached head by its commit. The vault and the workspace are drawn in the bar's text, the branch and what follows
>   it dim (`status_dim`), a part under the mouse in `hover`; every name passes through `sanitize`, and every width is
>   `core/width.ts`'s. **Where it goes:** in the span between the left side's last item (the chip) and the right
>   end's first (`indexing…`, or the outline's button when the bar has it), 2 columns kept from each beyond its
>   padding; centred on the screen, then clamped into that span, so it moves right or left only as far as it must.
>   **Short of room,** cut in
>   this order, each step only while it still doesn't fit: a path is cut from the front (the vault's, then the
>   workspace's, to 12 columns each, `…/notes`); the branch's ahead and behind and its operation go; the branch is
>   cut from its end, to 8 columns, then goes; the workspace goes; the vault's name is cut, a name from its end and a
>   path from the front, to 6 columns. Narrower still, nothing is drawn, and the status line says where if it has the
>   room (below). **Clicked**, two targets, each a hot region only while its part is drawn: the vault's (the glyph, the
>   name, and the workspace after it, `◈ ~ › notes`) lists the named folders, seen last first, and `enter` goes into
>   one (`space v v`, § Going into a vault), from Elsewhere too; the branch's (from its `·` or a worktree's `@`
>   through the operation: `· main ↑2 merging`, `@feat`), in a repository, opens the branches' menu as the status
>   line's did (GIT-D8): Pull while there's an upstream not gone, Push, Fetch and the git panel, then the branches;
> - at the right end, the vault's state (`indexing N…`), dropped when fewer than 12 columns are left.
>
> Toggle buttons have no fill of their own: their glyph is dim (`topbar_button`) while the pane is closed and bright
> (`topbar_button_on`) while it is open. `ui.top_bar = false` removes the bar, as do `space u b` and "Top bar" in the
> UI settings (`space u u`, remembered like the other settings; the note gains its row, `:` still opens the palette,
> the indexing state isn't shown, and the status line says where you are); zen mode hides it too.

Previously: "**The top bar** has buttons and the vault's state. … at the right end, the vault's state (`indexing N…`),
dropped when fewer than 12 columns are left. The vault (by name or path; home `~`, Elsewhere `Elsewhere`) and its
branch are the status line's (`20.14`, `21.9`)." and "(… the note gains its row, `:` still opens the palette, and the
indexing state isn't shown); zen mode hides it too."

**The status line's second item** becomes:

> - where you are, and its branch, dimmed, **only while the top bar doesn't say it** (WSP-D5): the bar hidden
>   (`ui.top_bar = false`, `space u b`) or too narrow for even the vault (zen has neither bar). The same parts as the
>   top bar's, without the glyph (`20.14`, `21.9`; D65, D77; `whereOf` in `tui/where.ts`): the vault's name if it has
>   one, else its path — `research · main`, `~/src/experiment · main` (no remote), `notes` — home as `~`, a folder of
>   home opened by name after it (`~ › notes`), and Elsewhere as `Elsewhere` (VV-D2, VV-D3); then the branch checked
>   out now (a detached head: its commit), a named worktree as `research@refactor`; then, a branch with an upstream
>   not gone, how far it's ahead of it and behind it as of the last fetch, only what isn't zero (`research · main
>   ↑2 ↓1`; ascii `+2 -1`; GIT-D4); then a merge or a rebase under way (`kestrel · main merging`,
>   `kestrel@agent/sync-retry rebasing 2/5`, a rebase's branch named rather than its detached commit; GIT-D6).
>   Clicked, in a repository, the whole of it opens the branches' menu (§ Side panes), as before: unlike the top
>   bar's, it has no vault target. At most 40 columns, cut as the top bar's is; it's the first to go when the path
>   would be left fewer than 24 columns, so on a narrow screen neither bar may say where;

Previously: "where the file is, and its branch (`20.14`, `21.9`; D65, D77; `vaultStatus` in `tui/git.ts`), dimmed: the
vault's name if it has one, else its path — … — home as `~` and Elsewhere as `Elsewhere` (VV-D2, VV-D3); … At most 40
columns, a path cut from the front to fit; it's the first to go when the path would be left fewer than 24 columns;"

**Hover** adds the top bar's vault and branch to what's drawn in `hover` under the mouse.

**Pinned tabs:** "the session keeps them" becomes "the workspace keeps them".

## MODIFIED design/tui.md § Buffers, views, tabs, windows (plan `3.3`)

The tab's bullet ends: "… when one is focused: a split's ratio kept in the workspace, the widths and the height for
the vault, across its workspaces." Previously: "… when one is focused, and all of it is kept in the session."

## MODIFIED design/tui.md § Positions (plans `3.4`, `3.5`, `3.15`)

**Saved state** becomes:

> - **Reading position** per note, cursor included, in `positions.json` in the state dir: one file for the machine,
>   each note by its absolute path and the vault it was read from (D76; [roots.md](../../design/roots.md) § State by vault).
> - **Workspaces** (WSP-D1, WSP-D2): a workspace is the tabs and the active one, the pinned ones, splits with their
>   orientation and ratio, and each window's note, cursor and history (its last 50 places each way). A vault keeps its
>   workspaces in its `session.json` (the `Session`, `tui/session.ts`), found in this order: in home, one per folder
>   opened by name (below); else the branch's, once left; else, in home, home's own; else the vault's last tabs,
>   whatever branch left them (a vault without git, a detached head, which keeps none of its own, a branch not yet
>   left). Beside them, shared by them: the explorer's and the outline's visibility and widths, the Problems panel's
>   height, UI setting overrides, the palette's recent commands, the recent notes and the nvim picked for send. A
>   workspace is restored when slipbox starts with no note named, no path or a folder (`slipbox ~/notes`), if
>   `ui.restore_session` is on; a file named opens that file alone (DF-D11). UI setting overrides and recent commands on
>   every start.
> - **Each branch's workspace** (`5.9`; D153): in a git checkout each branch has the workspace it had when it was left
>   (the 30 left most recently). Started on a branch, slipbox opens its tabs; a switch to another branch while it runs
>   brings that branch's back — unless a note is unsaved, which stays open (said so). A branch it has none for keeps
>   what's open, which becomes its own.
> - **Each folder of home's workspace** (VV-D2): each folder of home opened by name (`slipbox ~/notes`, a folder
>   revealed; the 30 left most recently) has a workspace of its own beside home's own (its top's), so each brings back
>   its own tabs; one it has none for opens its own note ([roots.md](../../design/roots.md) § Home). The top bar names it
>   (`◈ ~ › notes`).

Previously: "**Session:** tabs and the active tab, splits with their orientation and ratio, cursors, each window's
history (its last 50 places each way), the explorer's and the outline's visibility and widths, UI setting overrides,
the palette's recent commands and the recent notes, in `session.json`. …"; "**Each branch's tabs** (`5.9`; D153): in
a git checkout the session keeps the tabs each branch had when it was left …"; "**Each folder of home's tabs**
(VV-D2): home's session keeps the tabs of each folder of it opened by name … beside its top's, …".

## MODIFIED design/tui.md § History (plan `3.6`)

"kept in the session (50 each way)" becomes "kept in the workspace (50 each way)". "the notes read lately in other
tabs and sessions" stays: a sitting.

## MODIFIED design/tui.md § Going into a vault (plans `17.10`, `17.14`, `21.10`)

- "one place for the machine (VV-D1–VV-D3); each its session, its own (`21.8`; D76)" becomes "… each with its
  workspaces, its own (`21.8`; D76, WSP-D1)". "The current vault is the one whose tabs are shown" stays.
- "its watcher, its reading positions and its session, whose tabs come back" becomes "its watcher, its reading
  positions and your workspace there, whose tabs come back".
- **A named folder moved by hand:** "its session, scratch, trash and reading positions come along" becomes "its
  workspaces, scratch, trash and reading positions come along", the message too ("`<name>` moved here from `<path>`:
  its workspaces, scratch, trash and reading positions came along").

## MODIFIED design/tui.md, the rest that said session for what's kept

- The code table's row for `settings.ts`, `session.ts`: "the session kept and restored" becomes "the workspaces kept
  and restored".
- § The peek: "the session's tabs bringing it back so" becomes "the workspace's tabs bringing it back so".
- § Side panes: "a session's tabs restored" becomes "a workspace's tabs restored".
- § Overlays: the switcher's recent notes and the palette's recent commands are "kept for the vault", not "in the
  session".
- § UI settings, **Persistence:** "remembered in the session with the config value each one overrode" becomes
  "remembered for the vault, across its workspaces, with the config value each one overrode: yours, in slipbox's
  state, never in the vault's settings or your config (WSP-D1)". § Code blocks that scroll: "It isn't saved in the
  workspace."
- § Configuration reload: "replacing session overrides of the changed values" becomes "replacing the UI overrides kept
  of the changed values".
- § Writing notes: the nvim picked before for this vault is "kept for the vault".
- § The Problems panel: its height is "kept for the vault".
- § The peek: "The status line keeps the current vault, the path being the peek's" becomes "The top bar keeps the
  current vault (the status line, while the bar is hidden), the status line's path being the peek's".
- § Side panes: "**The status line's branch** (`status:branch`, in a repository)" becomes "**The branches' menu**, from
  the top bar's branch (`top:branch`) or the status line's (`status:branch`), in a repository", the rest as it is.
- § Git: "The status line shows a branch with an upstream ahead of it and behind it" and "The status line says it
  after the branch" (a rebase, a merge under way) become "Where you are shows …" (§ Screen layout: the top bar, else
  the status line).
- The commands' descriptions: Quit "Saves positions and the session, then quits" becomes "Saves positions and the
  workspace, then quits" (`core/commands/files.ts`); Fetch's "the status line's ↓" becomes "the branch's ↓"
  (`core/commands/git.ts`).
- The lens's and insert mode's "session" (§ The lens, § Editing) is a stretch of typing, and stays; so do a process
  group's (lsp.md), a picture's downloads (rendering.md) and the sittings in testing.md and repository.md.

## MODIFIED design/distribution.md § Uninstalling

"state — sessions, the scratch, the trash, undo, reading positions, named folders" becomes "state — workspaces, the
scratch, …", and so does the purge's list in `core/install.ts`.

## MODIFIED design/roots.md § State by vault

Its opening becomes: "Personal state is kept in the state folder, never in the folder it is about (D39, D76; where each
file lives: [how-it-works.md](../../design/how-it-works.md) § Storage). The vault's folder holds what is shared: its
notes and its settings (`.slipbox/config.toml`), which travel with it; whether you trust it, your workspaces there and
what they share, are yours (WSP-D1):"

The first bullet becomes: "**By vault:** its workspaces and what they share (`session.json`; [tui.md](../../design/tui.md)
§ Positions), the scratch, trash, undo log, staleness, moves seen and branch heads seen are kept under the vault's key
(§ Storage keys): home's by its path, as any vault's; Elsewhere's under its one key, `elsewhere`, wherever it was
opened (VV-D3). Opening `project/` or `project/docs/` brings back the same workspaces, since both are in the vault
`project/`; a worktree, another path, has its own. In home, each folder of it opened by name is a workspace of its own
(§ Home)."

The named folder moved by hand: "Its cache, session, scratch, trash, undo log and positions move" becomes "Its cache,
workspaces, scratch, trash, undo log and positions move".

Previously: "Personal state is kept in the state folder, never in the folder it is about (D39, D76; …):" and "**By
vault:** the session, scratch, trash, … Opening `project/` or `project/docs/` brings back the same session, … In home's
one session, each folder of it opened by name keeps its own tabs (§ Home)."; "Its cache, session, scratch, …".

## MODIFIED design/roots.md § Home, § Elsewhere, § Worktrees, § Vaults and markers

- § Vaults and markers: "which session and state are the file's" becomes "which workspaces and state are the file's".
- § Home: "its session carried over" becomes "its workspaces carried over". **What's shown:** "Each folder of home
  opened by name has its own tabs, kept in home's session beside its top's" becomes "Each folder of home opened by name
  is a workspace of its own, kept beside home's own (its top's), the top bar naming it (`◈ ~ › notes`)"; "A vault's
  folder opens the vault's, its one session (VV-D5: a vault is one project)" becomes "A vault's folder opens the
  vault's workspace (VV-D5: a vault is one project)". "The status line names home `~`" becomes "The top bar names home
  `◈ ~`, the status line `~` while the bar is hidden".
- § Elsewhere: "one session, one set of tabs, one scratch and trash" becomes "one workspace, one scratch and trash".
  **What's shown:** "The status line names it `Elsewhere`" becomes "The top bar names it `Elsewhere` (the status line,
  while the bar is hidden)".
- § Worktrees: "its own state and cache, its own session, scratch, positions and indexes" becomes "its own state and
  cache, its own workspaces, scratch, positions and indexes". "The status line, the explorer's row and the git panel
  show a worktree's branch" becomes "The top bar, the explorer's row and the git panel show …".
- § Links followed only when you say so: "(a session's tab, `:e`)" becomes "(a workspace's tab, `:e`)".
- § How a vault is named and shown: "The status line, the explorer's vault rows, …" becomes "The top bar (the status
  line while it's hidden), the explorer's vault rows, …".

## MODIFIED design/terms.md

- ADDED **Workspace**: "your tabs and windows in a place — the splits, each window's note, cursor and history: one per
  branch of a git checkout, one per folder of home opened by name and home's own, else the vault's own; personal, in
  slipbox's state, never in the vault (WSP-D1, WSP-D2). Not VS Code's workspace, the folders a window opened (a vault,
  here); Obsidian's workspaces, saved layouts, are nearer, though slipbox keeps one per place by itself. Nor D33's
  "shared workspace", slipbox as a whole. [tui.md](../../design/tui.md) § Positions."
- ADDED **Where you are**: "the vault, its branch and a workspace other than the vault's own, on the top bar, else on
  the status line (WSP-D4, WSP-D5). [tui.md](../../design/tui.md) § Screen layout."
- MODIFIED **Session**: "the file a vault's workspaces are kept in, with what they share (`session.json`, the
  `Session`); users read workspace (WSP-D6). [tui.md](../../design/tui.md) § Positions." Previously: "a vault's tabs, splits,
  cursors and pane widths, restored when slipbox starts there."
- MODIFIED **The current vault**: "the vault whose workspace is shown". Previously: "the vault whose tabs are shown".
- MODIFIED **Retired** adds: "**session**, for what slipbox restores: a workspace (WSP-D1); the word stays in
  `ui.restore_session` and `session.json`."

## MODIFIED design/how-it-works.md § Storage

- The table's row `session` becomes `workspaces (WSP-D1)`, its path the same, `$XDG_STATE_HOME/slipbox/<key>/session.json`.
- "Shutdown saves positions and the session" becomes "Shutdown saves positions and the workspace".
- The module table's row for `core/position.ts`: "anchors, reading positions, the session file (the workspaces)".

## ADDED src/tui/where.ts, in design/tui.md's code table

A row: "`where.ts` | where you are, for the top bar and the status line: the vault, the workspace, the branch, and
their cutting to fit (WSP-D4)". `whereOf(app)` gathers the parts; `fitWhere(parts, width)` cuts them, a pure function
the unit tests call at each width; the top bar draws them as hot regions `top:vault` and `top:branch`, and the status
line joins them without the glyph, replacing `vaultStatus` in `tui/git.ts`, its texts unchanged but for home's folder.

## Notes under earlier decisions, at consolidation

Dated notes, the entries themselves left as they are:

- **D65** (the status line names the vault and its branch): "Amended by WSP-D4, WSP-D5: the top bar names them, the
  status line only while the bar doesn't; still shown once (its Why)."
- **D77** (the screen shows what the file says): "Amended by WSP-D4: where the file is, as it describes, is on the top
  bar, the status line's only while the bar doesn't show it (hidden, or too narrow); its forms (`research · main`,
  `research@refactor`) unchanged."
- **D153** (a branch switch is one event): "Clarified by WSP-D1: each branch's tabs are its workspace; nothing changed
  in what's kept."
- **VV-D1** ("vault" for every folder with a marker): "Clarified by WSP-D1: "workspace" now names the working state
  slipbox keeps in a place, not the folders; its Not chosen still holds for the content boundary."
- **VV-D2** (home is a vault): "Clarified by WSP-D1: each folder of home opened by name keeps a workspace of its own."
- **D33** (a shared workspace for humans and agents): "Clarified by WSP-D1: users read workspace for the working state
  kept in a place; slipbox as a whole is no longer called one in the README and the introduction, and terms.md says
  the two apart."
