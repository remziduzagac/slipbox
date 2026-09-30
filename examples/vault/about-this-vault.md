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
| `projects/dome-refit.md` | TOML frontmatter, every callout kind (GitHub's capitals, nested), numbered tasks |
| `projects/dome-refit.md` (again) | `*` and `+` bullets, a `www.` autolink, an image that exists (`attachments/`) |
| `people/partners-and-names.md` | every link form, broken links, footnotes; CJK, emoji, ZWJ, RTL widths |
| `home.md`, `people/`, `meetings/` | a linked graph: backlinks, tasks, heading references, an ambiguous link |
| `logs/observing-log-2026.md` (again) | repeated `### Weather` headings, an in-note `#anchor` link |
| `software/halley/halley.toml` | a data file: sections, comments, `[[telescope]]` records, path links |
| `software/halley/targets.yaml`, `.schema.json` | YAML records as a table, nested maps; JSON with `$schema`, `$ref` |
| `software/nightjar/openapi.json` | deep JSON as a tree: `$ref` pointers followed, records in the tree |
| `software/nightjar/deploy.yaml` | a YAML tree: uneven lists of objects, anchors and aliases, a block string |
| `software/nightjar/environments.yaml`, `package.json` | several YAML documents (`---`); a flat manifest |
| `software/halley/logging.ini`, `archive.properties` | INI: `;`, `#` comments, a comment after a value; dotted keys |
| `equipment/mount-aster.cfg`, `nightjar/nightjar.env` | `.cfg` with dotted sections; `.env` with `export`, quotes |
| `equipment/eyepieces.tsv` | TSV: tabs, a quoted field, cells that wrap |
| `logs/photometry-2026.csv` | 2,600 rows: past the 2,000-row render cap, quoted fields, empty cells |
| `equipment/filters.csv` | CSV: quoted fields with commas and `""`, empty cells |
| `software/halley/reduce.py`, `night.sh` | tree-sitter: docstrings, heredocs, an outline, links in comments |
| `nightjar/src/server.ts`, `public/app.js` | TypeScript, JavaScript: enums, interfaces, classes, template strings |
| `uploader/main.go`, `stacker/src/main.rs` | Go and Rust: types, methods, traits, `impl`, raw strings, doc comments |
| `software/halley/dome.lua` | Lua: `local function`, `function t.m`, long strings and comments |
| `scratch/half-written.py`, `broken-config.json` | a syntax error in code; a data file that doesn't parse |
| `logs/dome-log.org`, `handbook/safety-card.adoc` | formats slipbox doesn't read as notes: text files, source mode |
| `outreach/`, `outreach/school-visits/` | vaults nested in this one: links across vaults, by name and by path (below) |

## Nested vaults

This vault is named `halden` (`.slipbox/config.toml`, `[vault]`), and holds two more, each with a
`.slipbox/` of its own — boundaries, not folders of this one:

- `outreach/`, the vault `outreach` (alias `public`): the public programme;
- `outreach/school-visits/`, the vault `outreach-school-visits`, nested in that.

Their notes link across all three, every way slipbox knows: by the vault's name
(`[[halden:home]]`, `[[outreach:index]]`), with a heading and text, by an alias of the vault
(`[[public:…]]`) and of a note (`[[outreach:open nights]]`), by a path into a nested vault
(`[…](school-visits/index.md)`) and out of one (`../handbook/operations-handbook.md`,
`../../handbook/safety-card.adoc`), and to a vault this machine doesn't have
(`[[archive:2019-season]]`). To try them: open this vault, and

- the explorer shows `outreach` with a vault's icon; `enter` goes into it;
- `[[outreach:index]]` at the end of [[home]] goes there too, and `ctrl+o` comes back;
- `space l b` on `home.md` lists the backlinks from `outreach` and `school-visits`;
- `space v v` lists the vaults; `space n m` renames a note and fixes the links in all three.

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
- **Checked heading and block references.** `[[home#No such heading]]` resolves to its note,
  since a reference's heading or block isn't checked yet: phase 4 link work (plan `1.x`), and this
  link is the test material for it. (`[[Kenji]]` and `[[森健二]]` in
  `people/partners-and-names.md` reach `people/kenji-mori.md` through the aliases it declares.)

Some links are unresolved on purpose, so the link index always has failures to report:

- `people/partners-and-names.md`: `[[visiting-rota]]`, `![[dome-diagram.png]]` and
  `<../scratch/wrap probe copy.md>`. `[[home#No such heading]]` and
  `[[variable-star-survey^nope]]` will join them once a reference's heading and block are checked;
  for now they reach their notes.
- `handbook/writing-guide.md`: `../projects/dunmore-refurbishment.md`,
  `../incidents/2026-03-14-fw8-stuck.md`, `../reports/template.md` and `glossary.md` (twice).
- `equipment/instrument-inventory.md`: `images/lyra-slit.png`, `images/tern-frame.jpg` and
  `![[missing-flat-field.png]]`, placeholders for photos not yet taken.
- `outreach/index.md`: `[[archive:2019-season]]`, in a vault no machine has.
