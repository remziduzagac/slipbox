# Markdown wrap + table render test

Test fixture for `pipe_table.wrap` in render-markdown v8.14.0+. Lines here are deliberately long and WILL fail markdownlint — that is the point, ignore the diagnostics.

Toggle wrap with `<leader>tw` and compare each section in both states.

## 1. Long prose — wrap should help here

This paragraph is one very long single line with no hard breaks in it at all, which is exactly the case where soft wrapping earns its keep, because without wrap you have to scroll horizontally to read a sentence that would otherwise fit comfortably in the window if only the editor were allowed to break it at a word boundary for you. With `wrap` off this runs off the right edge. With `wrap` on it should break cleanly at word boundaries, and with `linebreak` also on it should avoid breaking mid-word.

Short control paragraph. Nothing interesting should happen to this one.

## 2. Wide table, long cells — the main event

This is the case that forced `nowrap`. Each cell holds a full sentence.

| Option | What it does | When it bites you |
| --- | --- | --- |
| `pipe_table.wrap` | Fits wide tables to the current window by wrapping individual cells, replacing the source lines with virtual lines on Neovim 0.11 and later. | Only available from v8.14.0 onward, so an older pin silently gives you the old horizontal-scroll behaviour with no warning at all. |
| `anti_conceal.enabled` | Controls whether the line under the cursor stays rendered or reverts to raw source text while you are sitting on it. | Set to false for kickstart parity, which means the cursor line keeps its rendering and you never see the raw pipes while editing a row. |
| `cell` | Determines how individual cells are rendered — `overlay`, `raw`, `padded`, or `trimmed` — which changes how width is computed for each column. | `padded` and `trimmed` compute different widths, so switching between them can change whether a given table fits the window at all. |

## 3. Many columns, short cells — control case

| ID | Host | Scope | CPU | RAM | Disk | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | beaver | dev | 4 | 8G | 60G | up |
| 2 | otter | build | 8 | 16G | 120G | up |
| 3 | owl | test | 2 | 4G | 40G | down |
| 4 | hawk | infra | 4 | 8G | 80G | up |

## 4. Mixed width — one long column, rest short

| Host | Notes | Up |
| --- | --- | --- |
| beaver | Primary development box, runs the language servers and the bulk of the day-to-day editing workload, so it gets the most memory. | yes |
| otter | Build and CI runner, kept deliberately clean so that build failures are reproducible without local state leaking into them. | yes |
| owl | Currently down for maintenance. | no |

## 5. Table inside a list — known edge case

Third-party wrappers explicitly do not support this. Worth checking whether the native one does.

- First item, with a table nested underneath it:

  | Key | Value |
  | --- | --- |
  | Some fairly long key name here | An even longer value that should need wrapping when the window is narrow enough to force it |

- Second item, plain text.

## 6. Long code block — should NOT wrap

```bash
for vm in beaver otter owl hawk; do ssh "$vm" "PATH=\$HOME/.local/bin:\$PATH herdr update && echo done on $vm"; done
```

## 7. Long list items

- A list item long enough to need wrapping, which should break at a word boundary and stay visually indented under the bullet rather than returning to column zero on the continuation line.
- Short one.
  - Nested item that is also quite long, to check that continuation lines respect the deeper indent level and do not collapse back to the parent bullet's indentation.

## What to check

1. Prose wraps at word boundaries (section 1)
2. Table cells wrap inside their columns, borders stay aligned (sections 2 and 4)
3. Narrow the window — tables should re-fit rather than scroll
4. Cursor `j`/`k` through a wrapped table row moves one row, not one screen line
5. Code block does not wrap (section 6)
6. Nested table in section 5 renders at all
