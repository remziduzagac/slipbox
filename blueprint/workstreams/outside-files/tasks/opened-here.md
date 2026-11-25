---
status: todo
assignee: ""
blocked_by: []
created: "2026-11-25"
---

# OUT-T1: A file outside the vault opened here, its tab, a relative `:e` path

OUT-D1, OUT-D3, OUT-D5, OUT-D7, OUT-D8.

## Description

- `:e` with a path or a pointer (`file.open` in `src/tui/actions/workspace/actions-files.ts`), the switcher's typed
  path (`file.open_path`; `src/tui/actions/documents/actions-find.ts`) and the explorer's `enter` and `o` on a file
  outside the vault open's own tree open the file as a tab here: the path-keyed buffer a peek's `t` makes
  (`markElsewhere` in `src/tui/documents/buffers/opening.ts`), no question, no `intoOther`. A vault chosen still
  switches, asked; the git panel's Open on a repository, a checkout or a worktree among them, unchanged.
- Started with a file and a `--root` naming a vault that doesn't hold it, home among them (`openingPath` in
  `src/tui/shell/terminal/open-path.ts`, `locateVault` in `src/core/workspace/vaults/vault.ts`): that vault opens, as
  `--root` alone opens it, and the file is a tab of it, as `:e` opens it, where it was refused. A file that isn't
  there, outside `--root`, still refused before the screen is taken; without `--root`, the file's own vault, as now.
  The CLI's commands keep `locateVault`'s refusal.
- The tab marked with its vault's name; its links read there, opening peeks; the line said once on opening, as
  design.md § A file from outside the vault gives it (its key comes with OUT-T3; until then the line names the
  palette's command).
- A relative `:e` path read from the vault's top; `:e ../x.md` opened as any path outside the vault.
- Left out of this vault's search, backlinks, index, task list, rename plans and git panel, and no git marks in its
  gutter: checked, with a test for each, since a peek's kept tab is left out of most already.
- Read-only until OUT-T2 lands, as a peek's kept tab is, said so.
- The design kept true as it's built: design.md § A file from outside the vault and its changes to design/tui.md
  (§ Going into a vault, § The peek, § Side panes, § Overlays), design/roots.md (§ Vaults and markers, § Elsewhere)
  and design/terms.md, which those files take at consolidation (OUT-T5).

## Acceptance criteria

- Unit tests: each route opens the file here and switches nothing (`tests/tui/workspace/vaults/elsewhere.test.ts`,
  `switch-question.test.ts`, `explorer.test.ts`); `:e ../x.md` from the vault's top; a vault's row still asks, and the
  git panel's Open still asks (`tests/tui/workspace/git/panel/branches.test.ts`, kept passing); the vault's search,
  backlinks and task list without the file, its gutter without git marks; the start with `--root` and a file it
  doesn't hold opening that vault with the file as a tab, a missing file outside it still refused
  (`tests/tui/workspace/vaults/new-file.test.ts`), and a CLI command given the same still refused.
- A terminal check, new: `tests/terminal/checks/outside-files.ts`, on the reference set: from `notes`, `:e` with
  kestrel's `docs/architecture.md`, with a `~/` path, with a pointer and with `../`; the switcher's path; the
  explorer's `enter`; started with `--root` naming notes and kestrel's note — each a tab here, no question, the tabs
  as they were, the tab naming its vault; a link in it peeks. A case for it in `examples/home/CASES.md` if none covers
  it. The checks whose routes change, updated: `elsewhere`, `vaults`, `open-by-path`, `peek`, and in
  `tests/terminal/checks/terminal-state.ts` the start's refusals (a file outside `--root` opens now; one that isn't
  there still exits 3). `git-branches` run as it is, the git panel's Open unchanged.
- Every bug found gets a regression test; `bun run check` passes; the user docs (`docs/guides/vaults.md`,
  `docs/manual/vaults.md` § Switching vaults and § Read another vault without leaving, `docs/manual/files.md`,
  `docs/manual/cli.md` § Opening the screen and § Where a command works) and a CHANGELOG line come with it, released
  with OUT-T2.
