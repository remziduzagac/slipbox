# Wrap probe

Table A — ordinary prose, no long tokens. Should wrap and fit.

| Option | What it does | When it bites |
| --- | --- | --- |
| first | Fits wide tables to the current window by wrapping individual cells into several visual lines. | Only from v8.14.0 onward, so an older pin silently keeps the old behaviour. |
| second | Controls whether the line under the cursor stays rendered or reverts to raw source text. | Disabling it means you never see raw pipes while editing a row of the table. |

Table B — one very long unbreakable token. Suspected overflow case.

| Option | Value | Note |
| --- | --- | --- |
| path | `/Users/remzi/Projects/dotfiles/shared/config/nvim/lua/plugins/render-markdown.lua` | A single token that cannot be broken at any word boundary at all. |
| url | <https://github.com/MeanderingProgrammer/render-markdown.nvim/blob/main/lua/render-markdown/parser/table.lua> | Same again, even longer, also unbreakable. |
