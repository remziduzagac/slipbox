# Sample markdown

Test fixtures for rendering, parsing and layout. This is the raw material for plan item `0.5`
(the fixture vault) — not the fixture vault itself, which needs a `.slipbox/` marker and a
directory shape these files do not yet have.

**Most of these are real documents**, copied from the dotfiles repo on 2026-09-25 rather than
written to be convenient. That is the point: they contain the awkward things real notes contain,
including markdownlint violations the originals never fixed.

## What each file is for

| File | Exercises | Shape |
| --- | --- | --- |
| `wide-tables.md` | The allocator's hardest case — the problem that started the project | 71 lines, longest 503 |
| `overlong-table-rows.md` | Rows at 371 characters, to be wrapped or refused, never overflowed | 150 lines, 34 rows |
| `dense-tables.md` | 232 table rows in one document, most near the 120 limit. Throughput, not width | 323 lines |
| `wrap-probe.md` | A small wide-table case, for fast iteration | 15 lines |
| `frontmatter-tables-fences.md` | YAML frontmatter, 38 table rows, 6 fenced blocks — the common mixture | 232 lines |
| `code-heavy.md` | 22 fenced blocks in several languages; highlighting and fence width | 198 lines |
| `large-document.md` | 1,180 lines, 69 rows, deep nesting. Scroll, viewport rendering, reparse | 56 KB |
| `long-form-mixed.md` | Long prose with embedded code, tables and quotes — the ordinary case at length | 472 lines |
| `links-and-unicode.md` | **Wikilinks and display width.** Synthetic — see below | 90 lines |

## Provenance

Every file except `links-and-unicode.md` is a copy. Originals, in `~/Projects/dotfiles`:

| Sample | Copied from |
| --- | --- |
| `wide-tables.md` | `tmp/markdown-wrap-test.md` |
| `wrap-probe.md` | `tmp/wrap-probe.md` |
| `frontmatter-tables-fences.md` | `shared/claude/skills/markdown-style/SKILL.md` |
| `code-heavy.md` | `shared/claude/skills/nvim-remote/SKILL.md` |
| `overlong-table-rows.md` | `docs/workslate-overview.md` |
| `large-document.md` | `docs/decisions.md` |
| `dense-tables.md` | `docs/cheatsheets/nvim.md` |
| `long-form-mixed.md` | `docs/plans/nvim-agent-integration.md` |

They are snapshots. The originals keep changing; do not expect these to track them.

## The one synthetic file, and why it had to be written

`links-and-unicode.md` is not a copy. **Nothing in the source repository contained a single
wikilink** — measured, not assumed — so the feature slipbox exists for had no test material at
all. Nor was there meaningful CJK, emoji or RTL text.

It covers, deliberately: plain and piped wikilinks, an unresolved link, a heading reference, a
block reference, an embed, wikilinks inside a fenced block and inside inline code that must
**not** resolve, an escaped literal, and the three ordinary markdown link forms. Then display
width — CJK at two columns per character, emoji, a ZWJ family sequence that is one grapheme
across several code points, combining marks, and an RTL run. Then a table whose rows have equal
character counts and unequal display widths, which is exactly what breaks column alignment.

It also contains a malformed heading-then-table with no blank line, on purpose.

## Still missing

Known gaps, so nobody mistakes this folder for complete coverage. The vault cases (name
collisions, CRLF, a BOM, Latin-1, no trailing newline, a local image, a `.slipbox/` marker,
nested directories and links that cross them) are covered by the test vault,
`tests/fixtures/vault/`, rather than here. Still missing anywhere:

- **A pathological file.** No multi-megabyte document, and no `.md` file that is really a log.
- **A broken image path.** The test vault has a local image, but none that fails to load.
- **Mermaid and LaTeX.** Deferred features, but fixtures cost nothing to add now.
