# slipbox — agent conventions

## Blueprint

This project's design lives in `blueprint/`: what it must do, how it works, the decisions behind it, and the work in
progress. Before planning or changing anything, read its README and roadmap. A change that alters what the blueprint
describes updates it in the same piece of work. The roadmap's step IDs (`2.3`, `9.1`) and the decisions' (`D39`) are
stable; cite them. User documentation is `docs/` (guides and a manual, mapped by `docs/README.md`) and the README:
a change users will see updates it in the same piece of work, without the blueprint's IDs (`tests/docs.test.ts`).

## Rules

- **`src/core/` never imports `src/tui/` or `@opentui/*`**, and `src/cli/` never imports `src/tui/`.
  `bun run check:boundary` enforces it. Only `src/tui/opentui.ts` and `src/tui/run.ts` touch OpenTUI.
- **Every user action is a named command.** Add it to `src/core/command-specs.ts` with its CLI
  equivalent (or `null` for a pure interaction), then implement it in `src/tui/actions.ts`
  (`registerActions`). Registration fails at startup, and a test fails, if the two disagree.
- **The design stays true to the code.** A behaviour change updates the matching file in
  `blueprint/design/` in the same change; since the initial design was settled (D210), a planned change to
  requirements or design goes through a workstream.
- **Nothing measures text except `src/core/width.ts`**, and every string entering the layout
  passes through `sanitize`.
- Phase 3 (editing) has begun: the TUI writes notes only through `App.writeBuffer` (atomic, inside
  the vault, the watcher told) — never with its own `writeFile`. Besides notes, it writes its own
  state and cache, the scratch, and an export where you said (`writeExport`: never over a note, but an
  earlier Markdown export).
- Markdown is wrapped at 120 columns, tables and code included.

## Commands

- `bun run check` — typecheck, boundary, the supply chain's gates (`check:deps`), tests. Run before declaring done.
- `bun run e2e --tab` — the terminal tests: slipbox driven in a herdr pane (`blueprint/design/testing.md`).
- `bun test -u` updates snapshots; read the diff before accepting it.
- `bun src/main.ts <path>` runs the TUI; `bun src/main.ts help` lists CLI commands.
- Tooling lives on a login-shell PATH (mise): use `zsh -lc '…'` in non-interactive shells.
