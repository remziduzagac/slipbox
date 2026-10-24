# Notes: workspaces, and where you are

## The draft (2026-10-24)

From issue #25 and the code, before any discussion with the user.

### What the code does today

- **Kept per branch and per folder, the tabs only.** `session.json` holds one record per vault (its key); inside it,
  `branches` and `folders` hold each branch's and each folder of home's `TabSet`: the tabs, the active one, when it
  was left (`src/core/position.ts:313-337`). Everything else in it is the vault's, whatever the branch: the panel
  layout (`sidebar`, `outline`, their widths, `problems_height`), the UI overrides (`ui`), `recent_commands`,
  `recent_notes`, `remote_server`. A branch switch swaps the tabs alone (`headMoved`, `src/tui/git.ts:575-590`);
  restoring at start takes the tabs from `tabsOf` and the layout from the record (`src/tui/session.ts:99-123`).
- So the issue's list for a workspace (tabs, windows, splits, cursors, history, the explorer's view, the panel layout,
  the UI settings) is wider than what's keyed per branch: the layout and the UI settings are the vault's. The
  explorer's view isn't kept at all: it's revealed from the note open after a restore (`session.ts:108`).
- **Where you are** is drawn on the status line (`src/tui/draw-status.ts:113-129`, from `vaultStatus`,
  `src/tui/git.ts:621-637`), its click the branches' menu (`branchMenu`, `src/tui/gitmouse.ts:175`, through
  `status:branch` in `src/tui/mouse.ts:712`). The top bar draws the chip and the right end's items and leaves the
  middle empty (`drawTopBar`, `src/tui/draw.ts:410-454`); it's drawn before the status line in the same frame
  (`draw.ts:278`, `:291`), so the status line can know whether the bar said where.
- The glyphs exist: `vault` (`◈`, Nerd a bookshelf, ascii `#`) and `branch` (`⎇`), `src/core/glyphs.ts:213`, `:248`.
- **The words that clash.** The requirements list "workspaces (restoring a session is not this)" among the non-goals
  (`blueprint/requirements.md:33`); VV-D1 turned down "workspace" for the folders; D33 calls slipbox "a shared
  workspace for humans and agents", and the README ("make the workspace yours") and the introduction ("a terminal
  workspace") call slipbox itself one.
- **What users read that says session:** the docs' pages the issue names, `configuration.md` § Settings changed in the
  TUI, `troubleshooting.md`, the storage tables, the message when a named folder moved by hand
  (`src/tui/vaults.ts:555`) and the purge's list (`src/core/install.ts:141`). The leader group `space q`, "session:
  quit", is the sitting, and stays.
- **Tests that read the vault off the status line:** 12 assertions in the unit tests and 69 `s.status(…)` calls in the
  terminal checks (`links-and-files`, `vaults`, `source-control`, …). With the status line dropping it, they read the
  top bar instead: a helper beside `Session.status` (`tests/terminal/session.ts:514`) that waits for the top row.

### Proposed decisions

Recorded in `decisions.md` once the user agrees; the design cites them by these IDs.

- **WSP-D1: Vault and workspace.** A vault is the content boundary and the unit you trust: links, the index and
  search, its name, its settings (`.slipbox/config.toml`), in its folder, shared, travelling with it. Whether you trust
  it stays yours, on your machine: a vault's config can't set `[trust]` (`src/core/config.ts:668-674`;
  `blueprint/design/trust.md`). A workspace is your working state in a place, its tabs and windows; personal, in
  slipbox's state folder, never in the vault. The rule for settings: a vault's settings stay with the vault; the UI
  settings you change in the TUI are yours, kept in slipbox's state. The docs, the glossary, the help, the messages
  and the design say so; "session" stays in `ui.restore_session`, in `session.json` and for a sitting. Why: the
  issue's; one word for two things (the docs' "the vault's session") hid that the working state is per place and
  personal. Not chosen: "session" (a sitting, too), "layout" (Obsidian's sense, narrower).
- **WSP-D2: A workspace is the tabs and windows; a vault's workspaces share the rest.** This narrows the issue's list,
  which put the panel layout, the explorer's view and the UI settings in the workspace. As the code keys them: in
  home, one per folder opened by name and home's own; else one per branch once left; else the vault's last tabs (a
  detached head keeps none of its own). The panel layout, the UI settings changed, the recent lists and the nvim
  picked are the vault's, shared by its workspaces; the explorer's view isn't kept, revealed from the note open. Why:
  that's what the code does, and a branch switch that changed the panes or the theme would surprise. Not chosen: the
  layout per workspace (worth it with named workspaces), everything per workspace.
- **WSP-D3: The scratch stays the vault's.** Why: the CLI writes it without knowing a workspace; a branch switch would
  hide what an agent captured; a worktree already gives a task its own. Not chosen: per workspace (ideas.md).
- **WSP-D4: Where you are is on the top bar.** Its middle: `◈` and the vault by name or path, home `◈ ~`, Elsewhere
  without the glyph; then home's folder opened by name (`◈ ~ › notes`); then the branch as the status line wrote it
  (`· main ↑2 ↓1`, `merging`, a worktree's `@feat`). Centred, then clamped into the span between the chip and the
  right end's first item, 2 columns from each. Cut, a step at a time: paths from the front, the branch's track and
  operation, the branch, the workspace, the vault's name; with too little room, not drawn. Two click targets: the
  vault (with the workspace) lists the named folders (`space v v`); the branch (from its `·` or `@`) opens the
  branches' menu. Why: the issue's; the top bar's middle was empty while the status line was the most crowded row.
- **WSP-D5: The status line says where only while the top bar doesn't.** Hidden (`ui.top_bar = false`, `space u b`), or
  too narrow for even the vault; zen has neither bar. The vault and the branch both go, giving the path the room; when
  shown it says what the top bar would, home's folder included (`~ › notes`), its click still the branches' menu. On a
  screen too narrow for either, neither says it. Why: D65's "a file shows once", kept; the top bar's room first.
- **WSP-D6: The code keeps its names.** `Session`, `session.json`, `TabSet` and `ui.restore_session` stay, their
  comments saying workspace. Why: the file holds the workspaces and what they share; `slipbox history` reads it; a
  rename asks a migration for no one's benefit (`docs/manual/versions.md` allows one, so it stays possible).

### Codex's critique (2026-10-24)

Codex read the draft against the code (`tmp/issue/codex-design-review.md` asked what to look at). Each finding was
checked against the file it named; all eight held, and all were taken:

1. **Trust.** The draft said a vault's settings decide trust; a vault can't trust itself (`src/core/config.ts:668`,
   `blueprint/design/trust.md:78-84`). WSP-D1 and design.md now say the vault is what you trust, the answer yours.
2. **WSP-D2 narrows the issue.** Said so in WSP-D2 and design.md, and that the explorer's view isn't kept at all.
3. **A detached head keeps no workspace of its own,** and home's folder comes before the branch (`session.ts:115-123`,
   `:196`; `git.ts:577`). design.md says the order the code finds one in, and the fallback to the last tabs.
4. **The narrow-width contract** was incomplete: a span between the actual controls, clamped both ways, widths by
   `core/width.ts`, the workspace's own step in the cutting; and "always on screen" couldn't hold, the status line
   dropping it too when short (`draw-status.ts:115`). Taken in design.md, WSP-D4, WSP-D5 and the goals.
5. **Click boundaries:** which target owns `·`, `@` and the operation, hot regions only for parts drawn, the status
   line's fallback click still the branches' alone, and Pull only with an upstream (`gitmouse.ts:181`). Taken.
6. **The test matrix:** a terminal check for every case, not four scenarios; a helper of its own for the top bar,
   `status()` left as it is, and assertions that read the vault with the path split (`tests/terminal/checks/vaults.ts:151`).
   Taken in the acceptance criteria and the plan below.
7. **The sweep missed:** the Quit and Fetch commands' descriptions (`src/core/commands/files.ts:329`,
   `src/core/commands/git.ts:54`), `docs/README.md:41`, `docs/agent-guide.md:85`, `docs/manual/customization.md:188`,
   `docs/guides/making-it-yours.md:83`, `docs/manual/cli.md:1797`, and in the design the peek (`tui.md:594`), the branch
   click (`:959`), tracking (`:2250`), a rebase's state (`:2290`) and the purge (`distribution.md:414`). Added.
8. **History:** the notes planned under D65, D77, D153, VV-D1 and VV-D2 are listed (design.md, last section), and
   named workspaces are left to the user rather than scheduled.

**Its second look** (2026-10-24): six settled; three slips, all fixed: home's top comes after a saved branch, not
before (`src/tui/session.ts:118-122`: a folder of home, then the branch's, then home's top, then the last tabs); a
clause still had a vault's settings deciding trust (design.md § State by vault); the planned note under D77 named only
a hidden bar, not one too narrow. Nothing new beyond them.

### Open questions for the user

Answered on 2026-10-24: each as proposed; the fifth, which had no proposal, as drafted (a non-goal, its line
reworded), the roadmap being the maintainer's. Recorded as WSP-D1 to WSP-D6 in [decisions.md](decisions.md).

1. **What a workspace holds** (WSP-D2): the tabs and windows, the rest shared by the vault's workspaces as today
   (proposed); or the panel layout per workspace too; or everything, as the issue listed.
2. **The scratch** (WSP-D3): stays the vault's (proposed).
3. **The top bar's look** (WSP-D4): `◈ kestrel · main ↑2`, `◈ ~ › notes`, `Elsewhere`, centred (proposed); or the
   branch as `⎇ main`; or left-aligned after the chip.
4. **slipbox called a workspace:** reword the README's "make the workspace yours" and the introduction's "a terminal
   workspace", so the word means one thing to users (proposed); D33's "shared workspace" stays in the blueprint, the
   glossary of terms saying it's slipbox as a whole.
5. **Named workspaces:** they stay a non-goal, its line reworded (as drafted), or go to the roadmap's Later at
   consolidation, as the issue's "later" suggests.
6. **The status line** (WSP-D5): drops the branch with the vault, and says home's folder when it shows where
   (proposed).

### Plan, as agreed

The tasks are in [tasks/](tasks/README.md).

- **WSP-T1, the words:** the docs and the glossary, the design's words as design.md lists them, the commands'
  descriptions, the two messages, the comments in `session.ts` and `position.ts`, the README's and the introduction's
  (if 4 is agreed).
- **WSP-T2, where you are:** `src/tui/where.ts` (the parts, and their cutting, a pure function), the top bar's middle,
  its two targets and hover, the status line's rule, `vaultStatus` replaced; the mouse help and `keys.md`. Unit tests:
  each case of the acceptance criteria's list, each cutting step at its width, the span with the left rail off, the
  outline's button and `indexing…`, the targets and their clicks, the status line's rule. Terminal checks (by case):
  the clicks (a named vault: the folders' list, `enter` into another, the bar naming it; the branch: the menu; a
  worktree's `@feat` and its vault part), home's folder (`slipbox ~/notes`, then `~`), Elsewhere, a vault without
  git and one by path, a detached head, a branch switched while slipbox runs, a merge and a rebase under way (moved
  from the source-control checks that already set them up), a narrow terminal (the cutting order, clear of both
  sides), the bar hidden (`space u b`: the status line says it) and zen, a wide-character name. A `where()` helper
  beside `status()` in `tests/terminal/session.ts`; the 69 assertions moved, the ones that read the path too split.
- **WSP-T3, landing:** `screen.md`, `git.md`, `vaults.md` and the guides; the screenshots retaken and looked at; the
  CHANGELOG; the notes under earlier decisions planned; the workstream complete.

## Log

- 2026-10-24: the design agreed; the decisions recorded, the workstream active, its tasks WSP-T1 to WSP-T3.
- 2026-10-24: WSP-T2 built: `src/tui/where.ts` (the parts and their cutting), the top bar's middle and its two targets,
  the status line's rule; `vaultStatus` gone. Unit tests in `tests/tui-where.test.ts` (each cutting step, each place,
  the span, hover, the clicks, the status line's rule), the old ones moved to the top bar; terminal checks in
  `tests/terminal/checks/where.ts` (the two clicks, a worktree's, a detached head, a narrow screen, the bar hidden and
  zen, a wide-character name), and 40 existing checks reading the vault with `Session.where`, a merge under way added
  to the merge screen's. Undoing the status line's rule fails two unit tests.
- 2026-10-24, tried live on a scratch home (`bun scripts/build-home.ts tmp/issue/home`, its state apart): notes'
  vault clicked, its list, `enter` into kestrel, the bar `kestrel · main`; the branch clicked, the menu, a branch
  picked, checked out, the bar following; switched back from a terminal, followed, its tabs back; `space u b`, the
  status line saying `kestrel · jo/release-notes-wording`; zen, neither; `~/household` by name, `~ › household`; a file
  outside home, `Elsewhere`. The scratch home sits inside this worktree, so notes (no repository of its own) showed
  this branch, as any folder inside a repository does. One slip: the CLI's `ls`, run from the worktree rather than
  from kestrel, named this repository, whose list then led into the main checkout; slipbox only read it (its git
  reads take no optional locks, its state was the try's own) and was quit at once, the try's state removed.
- 2026-10-24, Codex's review of the diff (`git diff origin/dev...`): no product-code regression found; three points on
  the tests, taken: the gap before `indexing…` was the 2 columns alone, its padding among them, where the chip's and
  the outline's button's were their padding and 2 (now the same for all three, `edge` at the item's padding, the unit
  test's 2 spaces made 3); the checks' `where()` parsed the bar loosely (now `whereOnBar`, the right end's items left
  out, an empty middle beside the outline's button read as empty, with tests of its own in
  `tests/terminal-harness.test.ts`); a check with the outline's button on the bar (no breadcrumb, no right rail) and a
  unit test of the targets with Nerd glyphs. Not taken: a terminal check with `indexing…` showing (when it shows is the
  index's timing; the unit test sets it), and one of the status line saying where while the bar shows but can't (not
  reachable: `indexing…` is drawn only while it leaves the chip 12 columns, so the bar's span is at least 8, enough for
  the vault cut to 6; and a screen with room on the status line has far more on the bar). Codex's pane then showed its
  usage limit's menu: its later parts (a second look) are skipped, a fresh reviewer taking them.
- 2026-10-24, `/code-review` (a fresh reviewer, in Codex's place for the second look): twelve findings. Taken: three
  tests still read where you are off the status line (`gitpanel.test.ts`'s click of `status:branch`, the `:name
  cooking` and `--root` checks), now the top bar's; `tests/docs.test.ts` formatted (the lint, now run over every file
  changed, was green only on the others); `fitWhere` was greedy, a path left cut after a later step freed room: now it
  gives up a part at a time, each stage cutting from the whole text (its test's widths say so); the docs' path example
  folder-aligned where the code cuts by columns (`…earch/notes` now), and the order said fully; `ui.top_bar`'s
  description and its config comment naming where you are; two lines of CASES.md; an empty branch (a rebase's
  `refs/heads/`) drawing a dangling `·`, now nothing, with a test; three home checks that accepted any folder of home,
  now `~` exactly (a note opened is home's own workspace: `how.folder` is set only for a folder revealed); the new
  check file's git and click helpers, now source-control.ts's. Not taken: deriving the status line's rule from the
  frame's draw order (`geo.whereOnTop`, set by the top bar): the order is fixed in `draw.ts`, the bar drawn after the
  windows (it needs to know whether one drew the outline's button) and before the status line, the field's comment
  says so, and computing the span twice would duplicate the bar's layout.
- 2026-10-24, the pull request (#60) up; its review loop, round 1: `/code-review` and a fresh Claude reviewer, each
  without the other's findings (Codex not used, at the user's word). Merged and checked against the code:
  - **Verified, fixed:** a merge or rebase under way was given up with ahead and behind, before the branch was even
    cut, so on a narrow bar nothing said it (both reviews): now it outlasts the branch, refining WSP-D4's order (a note
    under it, taken as recommended, for the maintainer to confirm); unit tests and a terminal check (a rebase begun in
    a terminal, the bar at 40 columns), undoing it fails them. With the bar hidden and no note open, the status line
    returned before where you are: now it says it (a unit test and a check, `~/Downloads`), undoing it fails the test.
    The checks' `whereOnBar` read row 0 with no bar there and missed ASCII's `indexing 3~` (both reviews): now empty
    without the chip, with tests. `/^kestrel\b/` and the like also matched `kestrel@…`: the checks now want a `·` or
    the end. Track and operation now pass `sanitize`; the requirements' CLI non-goal said nothing the CLI prints
    names a workspace, though two of its messages now do; the last stage's arithmetic simplified; `columnOf` reused;
    the design's branch target named from the space before `·`, and its fallback for a bar too narrow called a guard
    (it leaves the status line no room either); `editing.md`'s mode chip no longer "says where you are". A test that
    rewrote HEAD twice dates the writes apart (`headOf` rereads on the mtime alone).
  - **Rejected:** the status line's rule read from a flag the top bar sets (as before: the order is fixed, the
    field says so); the status line showing what the bar dropped (it would say the vault twice, against WSP-D5's
    "once"); the branches' menu as a named command (it's the status line's click of GIT-D8, moved, not new);
    measuring the parts once (a few short strings a frame); `whereOf` reading HEAD each frame (the status line's
    `vaultStatus` did the same); ASCII's `#` shared by the vault, the outline's button and the breadcrumb (the set's
    own, its place tells them apart).
  - CI on the first push: the terminal checks failed on two checks still reading `handbook` and `outreach` off the
    status line (moved now), and macOS's unit tests on the export window's places, a known flake (#39), not this
    branch's. Tried live on a scratch home in the scratchpad: a rebase begun in a terminal on the top bar, and on the
    status line with the bar hidden; `~/Downloads` with no note open, the bar hidden, the status line saying `~ ›
    Downloads`.
