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
| `equipment/telescope-comparison.md` | the table allocator's hardest case: seven columns, cells of 250 characters |
| `equipment/instrument-inventory.md` | table rows of 500+ characters to wrap, never overflow; emoji in cells |
| `logs/observing-log-2026.md` | throughput: 30 tables and 216 rows in one note |
| `scratch/wrap-probe.md` | a small wide-table case with unbreakable tokens, for fast iteration |
| `handbook/writing-guide.md` | YAML frontmatter, tables and fences: the common mixture |
| `software/pipeline-cookbook.md` | fences in a dozen languages, mermaid, `$$` math, `~~~`, indented code, tabs |
| `handbook/operations-handbook.md` | 1,200+ lines, h1–h6, setext, callouts, a 4-deep checklist, a long heading |
| `handbook/writing-guide.md` (HTML) | inline HTML, a comment, `<details>`; lists from `0)`, `7.`, `998.` |
| `equipment/instrument-inventory.md` (photos) | broken images: missing file, empty alt text, a missing `![[embed]]` |
| `meetings/2026-09-14-weekly.md` | hard breaks (two spaces, backslash) and a struck-out decision |
| `people/kenji-mori.md` | frontmatter with a nested map, a block string and a long key |
| `scratch/broken-frontmatter.md` | frontmatter that is not valid YAML |
| `projects/variable-star-survey.md` | long prose with code, tables, quotes and a block id: the ordinary case |
| `people/partners-and-names.md` | every link form, broken links, footnotes; CJK, emoji, ZWJ, RTL widths |
| `home.md`, `people/`, `meetings/` | a linked graph: backlinks, tasks, heading references, an ambiguous link |
| `logs/observing-log-2026.md` (again) | repeated `### Weather` headings, an in-note `#anchor` link |

`scripts/sample-metrics.ts` measures what each note exercises (lines, longest line, tables and
rows, fences and their languages, headings, links, wide and right-to-left characters), so a change
to a note can be checked against what it has to keep covering.

## What isn't here

The vault cases — name collisions, CRLF, a BOM, Latin-1, no final newline, a hostile note full of
terminal escapes, symlinks, ignored folders, a nested vault — live in the test fixture vault,
`tests/fixtures/vault/`, since they don't belong in a demo. Still missing anywhere:

- **A pathological file.** No multi-megabyte note, and no `.md` file that is really a log.
- **Mermaid and LaTeX, rendered.** `software/pipeline-cookbook.md` now has a mermaid fence and a
  `$$` block, but slipbox shows both as code; drawing them is a deferred feature.
- **Aliases, and checked heading and block references.** `[[Kenji]]` and `[[森健二]]` in
  `people/partners-and-names.md` name the aliases `people/kenji-mori.md` declares, but slipbox
  doesn't read `aliases:` yet, so both are unresolved; and `[[home#No such heading]]` resolves to
  its note, since a reference's heading or block isn't checked yet. Both are phase 4 link work
  (plan `1.x`); these links are the test material for it.

Some links are unresolved on purpose, so the link index always has failures to report:

- `people/partners-and-names.md`: `[[visiting-rota]]`, `![[dome-diagram.png]]`,
  `<../scratch/wrap probe copy.md>`, and the aliases `[[Kenji]]` and `[[森健二]]` (until aliases are
  read). `[[home#No such heading]]` and `[[variable-star-survey^nope]]` will join them once a
  reference's heading and block are checked; for now they reach their notes.
- `handbook/writing-guide.md`: `../projects/dunmore-refurbishment.md`,
  `../incidents/2026-03-14-fw8-stuck.md`, `../reports/template.md` and `glossary.md` (twice).
- `equipment/instrument-inventory.md`: `images/lyra-slit.png`, `images/tern-frame.jpg` and
  `![[missing-flat-field.png]]`, placeholders for photos not yet taken.
