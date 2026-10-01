# Design documents

The design as built. `docs/idea.md` is the *what and why*, `docs/plan.md` the *what to do*; these
documents describe *how it is*, and they are kept true to the code. When the code changes
behaviour, the matching document changes in the same commit.

| Document | Covers |
| --- | --- |
| [decisions.md](decisions.md) | answers to the plan's **decide** items: `0.10` `0.11` `9.1` `1.4` `3.5` `3.11`; phase 3 |
| [architecture.md](architecture.md) | one core and three faces, the boundary, modules, storage, performance |
| [rendering.md](rendering.md) | phase 1: layout IR, blocks, tables, wrapping, themes, glyphs, escapes |
| [tui.md](tui.md) | phases 2–3: the TUI — reading, navigation, watching, editing, the lens, saving |
| [keymap.md](keymap.md) | every key: the conventions, the direct keys, the leader groups, the `:` aliases |
| [keymap-comparison.md](keymap-comparison.md) | the keys beside vim's, VS Code's and Obsidian's, and where they differ |
| [cli.md](cli.md) | the agent surface: commands, JSON contract, exit codes, capture |
| [scout.md](scout.md) | scout, when it exists: three tiers, appended; a library, never a CLI; what disagrees |
| [lsp.md](lsp.md) | phase 5: `slipbox lsp` serving vaults to editors; later, slipbox's client for code |
| [configuration.md](configuration.md) | every config key and environment variable |
| [testing.md](testing.md) | test strategy and the fixture vault |
