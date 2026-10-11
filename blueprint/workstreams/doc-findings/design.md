# Design changes

Each change names the root's design section it lands in at consolidation. A task writes the new text here as it does
the work; the root's files change only when DF is consolidated.

## MODIFIED design/trust.md § What runs (DF-D1)

`render.images_remote` and `lsp.auto_install` join `update.check` among the settings only your own config sets.

## MODIFIED design/export.md § Markdown, § Asking for one (DF-D2, DF-D3, DF-D5)

Pictures of the root only into `.export.assets/`; no export over a note of any root; `-o dir/` makes the folder.

## MODIFIED design/links.md § Renames and moves; design/tui.md § Files in the explorer (DF-D4)

A new path that is a folder, or ends in `/`, means into it.

## MODIFIED design/tui.md § External changes (DF-D6)

`space n r` on an unsaved note whose file hasn't changed asks to discard.

## MODIFIED design/distribution.md § Installing (DF-D7)

The source launcher replaces a link at its path, never writes through it.

## MODIFIED design/lsp.md, design/tui.md § What's under the cursor (DF-D8, DF-D13)

Formatting with the file's own indentation (DF-T7 writes it).

The servers' table (DF-D13), its rows as `LANGUAGES` in `src/core/servers/languages.ts` has them:

| Languages | Servers, the main first (npm: installed when missing) |
| --- | --- |
| TypeScript, JavaScript, TSX, JSX | TypeScript 7's own (npm), vtsls for an older TypeScript (npm); eslint, biome |
| Python | pyright (npm); ruff |
| Rust, Go, Lua | rust-analyzer, gopls, lua-language-server |
| bash | bash-language-server (npm) |
| JSON, JSON with comments (`.jsonc`) | vscode-json-language-server (npm), biome |
| YAML, TOML | yaml-language-server (npm), the linter yamllint; taplo |
| CSS | vscode-css-language-server (npm), stylelint, biome |
| SCSS, Less | vscode-css-language-server (npm), stylelint |
| HTML | vscode-html-language-server (npm) |
| Dockerfile, PHP | docker-langserver (npm), the linter hadolint; intelephense (npm) |
| Swift, C, C++, Ruby (`.rb`, `Gemfile`, `Rakefile`) | sourcekit-lsp; clangd; ruby-lsp |

Other languages, Java and Kotlin among them, have no server built in: one is added in your config's
`[language-server.<name>]` and `[[language]]`.

Previously: one row for JSON, YAML and TOML, and one for CSS, SCSS, Less and HTML with biome for all three styles; no
`.jsonc`; Ruby by `.rb` alone.

## MODIFIED design/how-it-works.md, design/roots.md, the CLI's words (DF-D9)

"root" in the CLI's JSON and messages; `built-in`.

## MODIFIED design/code-view.md § How it behaves; design/tui.md § Problems where they are (DF-D10)

slipbox's syntax errors in the code view too.

## MODIFIED design/tui.md § Positions (DF-D11)

In the Session item: "The tabs and windows are restored when slipbox starts with no note named, no path or a folder
(`slipbox ~/notes`), if `ui.restore_session` is on; a file named opens that file alone. UI setting overrides and recent
commands on every start."

Previously: "The tabs and windows are restored when slipbox starts with no path, if `ui.restore_session` is on; UI
setting overrides and recent commands on every start."

## MODIFIED design/rendering.md § Glyphs (DF-D12)

"A set named in the config (`render.glyphs`) forces it; where the config says `auto`, `SLIPBOX_GLYPHS` chooses one
before the detection above; and in the TUI `space u g` picks one with a live preview (`:glyphs <set>` sets it
directly)."

Previously: "`SLIPBOX_GLYPHS` or the config value forces a set, and in the TUI `space u g` picks one with a live
preview (`:glyphs <set>` sets it directly)."

## MODIFIED design/tui.md § Files in the explorer; design/how-it-works.md § Storage (DF-D14)

The trash emptied by command, and after 30 days.

## MODIFIED design/tui.md § Editing (DF-D15)

Desktop keys while typing.

## MODIFIED design/rendering.md § Blocks and inlines (DF-D17)

Obsidian's `==highlight==` and `%%comment%%`.

## MODIFIED design/links.md § Wikilinks (DF-D18)

An export's pictures left out of lookups by name.

## MODIFIED design/roots.md § Search scope, design/links.md § Where a link lands, design/roots.md § Named folders

Not changes: the code brought in line with them (B1, B2, A8).
