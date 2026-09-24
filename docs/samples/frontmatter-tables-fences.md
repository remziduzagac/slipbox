---
name: markdown-style
description: "Write markdown files that pass this project's markdownlint-cli2 config on first save (no fix-up loop). Activate whenever creating or editing .md files. The linter is strict on line length (120 chars, applied to tables and code blocks too) and on link/heading/list structure. This skill teaches the enforced rules and the workarounds — especially for tables that would exceed 120 chars."
---

# markdown-style

Produces markdown that passes the project's `~/.markdownlint-cli2.jsonc` config on the first save.
The linter runs in editors (via nvim-lint) and in CI, so files that don't comply generate noise
until fixed.

## The one rule that surprises most: 120 chars, EVERYWHERE

Line length is capped at **120 characters** for paragraphs, code blocks, tables, AND headings. No
exceptions. Tables and code that would exceed 120 must be restructured, not left long.

### Long lines in paragraphs

Wrap at ~120 chars, ideally at a punctuation boundary:

```md
The system distinguishes idle from done based on whether the result has been
seen — see the state semantics section for the exact transitions.
```

### Long lines in code blocks

Wrap in the source language's natural way. Don't just let them flow long.

```bash
# ❌ 140 chars, will lint-error
curl -X POST https://api.example.com/v1/resources -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @body.json

# ✓ split across lines with backslash-continuation
curl -X POST https://api.example.com/v1/resources \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @body.json
```

### Long lines in tables — the important case

A pipe-table row is **one source line**. GFM has no continuation syntax, so a long row cannot be
broken — it can only be made shorter.

**Budget the width before writing the table, not after.** Borders and padding cost `3N + 1`
characters for `N` columns, leaving this much for content:

| Columns | Overhead | Content budget | Per column |
| --- | --- | --- | --- |
| 2 | 7 | 113 | ~56 |
| 3 | 10 | 110 | ~36 |
| 4 | 13 | 107 | ~26 |
| 5 | 16 | 104 | ~20 |
| 6 | 19 | 101 | ~16 |

Budget the **widest** cell in each column, not the average — prettier pads every cell in a column
out to its widest member, so the widest one sets the final row width.

Read that table as a design constraint: at 4+ columns you have room for a phrase, not a sentence.
If cells need sentences, the table gets 2 columns or it stops being a table. Choosing the column
count is choosing how much can go in a cell.

That also rules out one technique up front:

**`<br>` does NOT shorten a row.** It is a rendering control that adds four characters to the
source. Use it to shape how a cell displays, never to get under 120.

Three techniques that do work:

**Terse fragments instead of prose** — the real lever. Rewrite cell content as clipped phrases;
`<br>` then only controls where they break:

```md
| Command | Purpose |
| --- | --- |
| `pane split` | new pane<br>direction + ratio<br>honors `--no-focus` |
```

**Transpose into sections** — the only fix when the content genuinely is long prose. Each row
becomes a section, and the text wraps like any paragraph:

```md
### `pane split`

Creates a new pane. Direction and ratio are configurable, and it honors `--no-focus` so the
caller keeps focus where it was.
```

**Restructure into multiple sub-tables** — when a table has 3+ wide cells:

```md
### Basics
| Field | Value |
| --- | --- |
| id | opaque string |
| status | one of idle / working / done |

### Detail
| Field | Value |
| --- | --- |
| description | long-form explanation of what the field means and when it appears |
```

If a table needs `<br>` chains to survive, the content isn't tabular — transpose it. Tables are for
values you scan across; prose belongs in paragraphs.

**Why this rule earns its keep**, beyond silencing the linter: render-markdown wraps any table row
wider than the window into virtual lines that replace the source. The row under the cursor then
reverts to raw text, because virtual lines have no cell for a cursor to sit in — which makes wide
tables genuinely painful to edit. A table that respects 120 never wraps and never does this.

**Watch for prettier undoing this.** `conform` runs prettier on markdown, and prettier pads table
cells to align the pipes. That padding counts toward the 120 limit, so a table you wrote compact can
come back over the line after a format-on-save. Check the width after saving, not before.

### Long lines in headings

If a heading is longer than 120 chars, it's a paragraph pretending to be a heading. Rewrite it as a
shorter heading plus a leading paragraph.

## Enforced rules — write to these

### Headings

- ATX style: `## Foo`, never Setext (`Foo\n===`)
- **Never skip levels**: `##` → `###` → `####`, not `##` → `####`
- One `# H1` per file (but the file doesn't need to start with one)
- Blank line before AND after every heading

### Lists

- Blank line before AND after every list
- Consistent bullet within a doc — use `-` throughout, OR `*` throughout, don't mix
- Ordered lists: use `1. 2. 3.` OR all `1.` (both accepted; don't mix in one list)
- Consistent indent width within a list

### Code blocks

- **Always specify a language** on fences: ` ```bash `, ` ```json `, ` ```python `, ` ```text ` if none
- Blank line before AND after every fence
- Fenced style (```) — not indented-4-spaces code

### Tables

- Blank line before AND after every table
- Every row has the same column count (missing cells → add empty ones)
- Cell content over ~90 chars → shorten it or transpose the table (see above); `<br>` won't help

### Links

- **No bare URLs.** Always wrap: `[https://example.com](https://example.com)` even when the text IS
  the URL. `<https://example.com>` (autolink) is also acceptable.
- No spaces inside link text: `[foo](url)`, not `[ foo ](url)`
- No empty links: `[text]()` is invalid
- Valid link fragments: `[section](#the-section)` — anchor must exist in the file

### Images

- Every image needs alt text: `![Description here](url)` — never `![](url)`

### Emphasis

- No spaces inside markers: `**bold**`, `*italic*`, `` `code` `` — never `** bold **`, `* italic *`, `` ` code ` ``

### File hygiene

- End every file with exactly one `\n`
- Indent with spaces, no hard tabs
- No trailing whitespace on lines — unless it's exactly 2 spaces (intentional `<br>`)
- At most 2 consecutive blank lines

## Rules the project explicitly disables — don't worry about these

These are turned off in `~/.markdownlint-cli2.jsonc` for stylistic freedom:

| Rule | What it would complain about |
| --- | --- |
| MD004 | `-` vs `*` for unordered list bullets |
| MD007 | Unordered list indent depth |
| MD014 | `$` shown before shell commands (or not) |
| MD026 | Trailing punctuation in a heading (`.`, `!`, `?`) |
| MD028 | Blank line inside a blockquote |
| MD033 | Inline HTML (`<details>`, `<br>`, `<sub>`, etc. — OK to use) |
| MD035 | Horizontal rule style (`---` vs `***`) |
| MD036 | Bold used where a heading might fit better |
| MD041 | File must start with an H1 |
| MD043 | Required heading structure (template-based projects only) |
| MD044 | Proper-name capitalization |
| MD046 | Code block style (fenced vs indented) |
| MD048 | Code fence character (``` vs ~~~) |
| MD049 | Emphasis marker (`*` vs `_`) |
| MD050 | Strong marker (`**` vs `__`) |
| MD054 | Link/image style |
| MD055 | Table pipe style (leading/trailing `|`) |
| MD059 | Whether link text is "descriptive" enough |
| MD060 | Table column style |

Use whichever variant reads best.

## Verify before finishing

For any non-trivial markdown file, run:

```bash
markdownlint-cli2 <file>
```

Fix issues before declaring done. Common exit paths:

- **0 exit + no output** → file is clean, ship it
- **1 exit + `MD013/line-length` errors on tables** → shorten the cells or transpose, per above
- **1 exit + `MD040/fenced-code-language`** → add ` ```language ` to bare fences
- **1 exit + `MD034/no-bare-urls`** → wrap the URLs in `[](url)` or `<>` autolinks

## Common gotchas — quick reference

1. **Long table rows** — the #1 gotcha; a row is one line and can only be shortened, never broken
2. **Bare URL** in prose — always wrap it
3. **Code block right after a paragraph** — need a blank line in between
4. **Table right after prose** — same, need a blank line
5. **Heading followed immediately by another heading** — put a blank line between
6. **Missing language on ` ``` ` fences** — always add one, use `text` for plain output
7. **File ends without a newline** — always terminate with `\n`
8. **Skipping heading levels** — from `##` jump only to `###`, never `####`

## When NOT to use this skill

- Reading markdown (only creating/editing)
- Markdown files outside the project where linting doesn't apply
- Rendered content on GitHub (renderer is more forgiving than the linter — but still aim for
  lint-clean, since editor + CI both check)
