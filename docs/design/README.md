# Design documents

The design as built. `docs/idea.md` is the *what and why*, `docs/plan.md` the *what to do*; these
documents describe *how it is*, and they are kept true to the code. When the code changes
behaviour, the matching document changes in the same commit.

| Document | Covers |
| --- | --- |
| [decisions.md](decisions.md) | every decision the plan's items needed, by item ID (`0.10` … `21.x`); phase 3 |
| [architecture.md](architecture.md) | one core and two faces, the boundary, modules, storage, performance |
| [rendering.md](rendering.md) | phase 1: layout IR, blocks, tables, wrapping, themes, glyphs, escapes |
| [tui.md](tui.md) | phases 2–3: the TUI — reading, navigation, watching, editing, the lens, saving |
| [code-view.md](code-view.md) | `24.x`: code as a notebook — the rule, the shared categories, cells and their buttons |
| [keymap.md](keymap.md) | every key: the conventions, the direct keys, the leader groups, the `:` aliases |
| [keymap-comparison.md](keymap-comparison.md) | the keys beside vim's, VS Code's and Obsidian's, and where they differ |
| [cli.md](cli.md) | the agent surface: commands, JSON contract, exit codes, capture |
| [export.md](export.md) | `10.x`: notes as a document — the assembler, Word; no tool run, permissive licences only |
| [lsp.md](lsp.md) | phase 5: slipbox's client of the language servers of code (the LSP face is gone: `20.23`) |
| [configuration.md](configuration.md) | every config key and environment variable |
| [distribution.md](distribution.md) | `14.x`: folders per platform, the supply chain's gates, releases, their notices |
| [testing.md](testing.md) | test strategy and the fixture vault |
