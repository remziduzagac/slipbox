# slipbox — agent conventions

Read `docs/handoff.md` first, then `docs/design/README.md`. The plan's item IDs (`2.3`, `9.1`) are stable; cite them.

## Rules

- **`src/core/` never imports `src/tui/` or `@opentui/*`**, and `src/cli/` never imports `src/tui/`.
  `bun run check:boundary` enforces it. Only `src/tui/opentui.ts` and `src/tui/run.ts` touch OpenTUI.
- **Every user action is a named command.** Add it to `src/core/command-specs.ts` with its CLI
  equivalent (or `null` for a pure interaction), then implement it in `src/tui/actions.ts`
  (`registerActions`). Registration fails at startup, and a test fails, if the two disagree.
- **Design docs stay true to the code.** A behaviour change updates the matching file in
  `docs/design/` in the same change.
- **Nothing measures text except `src/core/width.ts`**, and every string entering the layout
  passes through `sanitize`.
- Phase 2 is read-only: the TUI never writes a note. The scratch is the one file it writes.
- Markdown is wrapped at 120 columns, tables and code included.

## Commands

- `bun run check` — typecheck, boundary, tests. Run before declaring done.
- `bun test -u` updates snapshots; read the diff before accepting it.
- `bun src/main.ts <path>` runs the TUI; `bun src/main.ts help` lists CLI commands.
- Tooling lives on a login-shell PATH (mise): use `zsh -lc '…'` in non-interactive shells.
