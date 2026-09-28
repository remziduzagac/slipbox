# About this vault

slipbox's demo vault, and the material its tests render. Everything in it is invented: the Halden
Ridge Observatory, its town, its people and its instruments do not exist. Open it with
`bun src/main.ts examples/vault`, or start at [[home]].

The notes read like a real team's working notes on purpose. Real notes contain awkward things —
tables too wide for any screen, unbreakable paths, lines over the length limit, a malformed
heading — and a renderer is only as good as its worst input. So these notes keep those things, and
some deliberately break the house style that [[writing-guide]] describes.

## What each note is for

| Note | Exercises |
| --- | --- |
| `equipment/telescope-comparison.md` | the table allocator's hardest case: seven columns, cells of 500 characters |
| `equipment/instrument-inventory.md` | table rows of 500+ characters to wrap, never overflow; emoji in cells |
| `logs/observing-log-2026.md` | throughput: 30 tables and 216 rows in one note |
| `scratch/wrap-probe.md` | a small wide-table case with unbreakable tokens, for fast iteration |
| `handbook/writing-guide.md` | YAML frontmatter, tables and fences: the common mixture |
| `software/pipeline-cookbook.md` | 24 fenced blocks in ten languages; highlighting and fence width |
| `handbook/operations-handbook.md` | 1,180 lines and 93 headings: scrolling, the outline, reparsing |
| `projects/variable-star-survey.md` | long prose with code, tables, quotes and a block id: the ordinary case |
| `people/partners-and-names.md` | every link form, and display width: CJK, emoji, ZWJ, combining marks, RTL |
| `home.md`, `people/`, `meetings/` | a small linked graph: backlinks, tasks, aliases, heading references |

`scripts/sample-metrics.ts` measures what each note exercises (lines, longest line, tables and
rows, fences and their languages, headings, links, wide and right-to-left characters), so a change
to a note can be checked against what it has to keep covering.

## What isn't here

The vault cases — name collisions, CRLF, a BOM, Latin-1, no final newline, a hostile note full of
terminal escapes, symlinks, ignored folders, a nested vault — live in the test fixture vault,
`tests/fixtures/vault/`, since they don't belong in a demo. Still missing anywhere:

- **A pathological file.** No multi-megabyte note, and no `.md` file that is really a log.
- **A broken image.** The fixture vault has a local image, but none that fails to load.
- **Mermaid and LaTeX.** Deferred features, but fixtures cost nothing to add now.
