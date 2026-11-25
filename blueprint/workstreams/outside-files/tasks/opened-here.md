---
status: todo
assignee: ""
blocked_by: []
created: "2026-11-25"
---

# OUT-T1: A file outside the vault opened here, its tab, a relative `:e` path

OUT-D1, OUT-D3, OUT-D5, OUT-D7, OUT-D8, OUT-D9.

## Description

- `:e` with a path or a pointer (`file.open` in `src/tui/actions/workspace/actions-files.ts`), the switcher's typed
  path (`file.open_path`; `src/tui/actions/documents/actions-find.ts`) and the explorer's `enter` and `o` on a file
  outside the vault open's own tree open the file as a tab here: the path-keyed buffer a peek's `t` makes
  (`markElsewhere` in `src/tui/documents/buffers/opening.ts`), no question.
- Those routes open through a way of their own (`openChosen`, a proposal) that skips `intoOther` and marks the buffer
  chosen. The shared ways of opening (`Opening.open`, `openInNewTab`, `openOrSwitchTab` in
  `src/tui/documents/navigation/opening.ts`) keep `intoOther` and never mark a buffer chosen, so a link, a backlink, a
  search hit or any other caller still peeks or switches as today. `ctrl+click` (`link.go`) still goes into the file's
  vault, asked (OUT-D9). A vault chosen still switches, asked; the git panel's Open on a repository, a checkout or a
  worktree among them, unchanged.
- The file's way checked in its own place's terms before anything is read through it: the opening asks for that
  place's links on the way, as a peek's read does (`peekAsk` in `src/tui/documents/navigation/peek/paths.ts`), and a
  link not followed there is asked about through `Following.gate`'s `there`
  (`src/tui/documents/navigation/following.ts`).
- A file of home's opened from a vault asks for its folder in home's graph as this vault reaches it
  (`elsewhere.graph`, `Graph.askFolders`), as every way into a folder of home does (design/roots.md § Home).
- Started with a file outside the folder of the vault `--root` names, home among them (`openingPath` in
  `src/tui/shell/terminal/open-path.ts`, `locateVault` in `src/core/workspace/vaults/vault.ts`): that vault opens, as
  `--root` alone opens it, and the file is a tab of it, as `:e` opens it, where it was refused. A file inside that
  folder whose own vault is nested there opens in its own vault, as now; a file that isn't there, outside `--root`,
  still refused before the screen is taken; without `--root`, the file's own vault, as now. The CLI's commands keep
  `locateVault`'s refusal.
- The tab label: every buffer of another place marked `<its vault>: <file name>`, Elsewhere's too (`Elsewhere:
  hosts`), whatever its vault's index holds; today the mark needs `elsewhere.rel` (`src/tui/windows/drawing/tabs.ts`).
  A tab kept from a peek takes the same label.
- Its links read in its vault, opening peeks; the line said once on opening, as design.md § A file from outside the
  vault gives it (its key comes with OUT-T3; until then the line names the palette's command).
- A relative `:e` path read from the vault's top; `:e ../x.md` opened as any path outside the vault.
- Left out of this vault's search, backlinks, index, task list, rename plans and git panel, and no git marks in its
  gutter: checked, with a test for each, since a peek's kept tab is left out of most already.
- Read-only until OUT-T2 lands, as a peek's kept tab is, said so.
- The design kept true as it's built: design.md § A file from outside the vault and its changes to design/tui.md
  (§ Going into a vault, § The peek, § Side panes, § Overlays), design/roots.md (§ Vaults and markers, § Home,
  § Elsewhere) and design/terms.md, which those files take at consolidation (OUT-T5).

## Acceptance criteria

- Unit tests:
  - each route opens the file here and switches nothing (`tests/tui/workspace/vaults/elsewhere.test.ts`,
    `switch-question.test.ts`, `explorer.test.ts`); `:e ../x.md` from the vault's top;
  - a link, a backlink and a search hit to the same file still peek, and none marks it chosen
    (`tests/tui/documents/navigation/peek.test.ts`); `ctrl+click` still asks to go into its vault
    (`tests/tui/workspace/vaults/switch-after.test.ts`);
  - a vault's row still asks, and the git panel's Open still asks (`tests/tui/workspace/git/panel/branches.test.ts`,
    kept passing);
  - a link not followed on the file's way asked about before it's read; a file of home's opened from a vault asks
    for its folder in home's graph;
  - the tab label, a kept tab's too, for another vault's file with and without its index, and for Elsewhere's;
  - the vault's search, backlinks and task list without the file, its gutter without git marks;
  - the start with `--root` and a file outside its folder opening that vault with the file as a tab, a nested vault's
    file opening its own vault, a missing file outside `--root` still refused
    (`tests/tui/workspace/vaults/new-file.test.ts`), and a CLI command given the same still refused.
- A terminal check, new: `tests/terminal/checks/outside-files.ts`, on the reference set: from `notes`, `:e` with
  kestrel's `docs/architecture.md`, with a `~/` path, with a file of Elsewhere's, with a pointer and with `../`; the
  switcher's path; the explorer's `enter`; started with `--root` naming notes and kestrel's note — each a tab here,
  no question, the tabs as they were, the tab naming its vault; a link in it peeks;
  `ctrl+click` on a link to it asks. A case for it in `examples/home/CASES.md` if none covers it. The checks whose
  routes change, updated: `elsewhere`, `vaults`, `open-by-path`, `peek`, and in
  `tests/terminal/checks/terminal-state.ts` the start's refusals (a file outside `--root` opens now; one that isn't
  there still exits 3). `git-branches` run as it is, the git panel's Open unchanged.
- Every bug found gets a regression test; `bun run check` passes; the user docs (`docs/guides/vaults.md`,
  `docs/manual/vaults.md` § Switching vaults and § Read another vault without leaving, `docs/manual/files.md`,
  `docs/manual/cli.md` § Opening the screen and § Where a command works) and a CHANGELOG line come with it, released
  with OUT-T2.
