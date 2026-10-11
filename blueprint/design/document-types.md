# Document types (plans `22.2`, `22.3`)

Notes of a kind, known by where they are — an agent skill's `SKILL.md`, an architecture decision record in an `adr/`
folder — and what that brings: rules their frontmatter must keep, said in Problems (`22.2`), and their conventions
read — a number from the file's name for their order, a status, what supersedes one — to list them and move between
them (`22.3`). Like Obsidian's Bases, driven by conventions instead of a database: nothing is written or kept (D133).
The code is `core/doctypes.ts`.

## Types

| Type | Its notes | What it brings |
| --- | --- | --- |
| `skill` | `**/SKILL.md` | `name` and `description` required, each a string |
| `adr` | `**/adr/*.md`, `**/adrs/*.md`, `**/decisions/*.md`, `**/decision-records/*.md` | a number, a status |

Your own, or a folder's for its notes, are `[types.<name>]` in a config
([configuration.md](../../docs/manual/configuration.md)): `paths` (globs from the root — `**` any folders, `*` any
name), `required` (keys each note must have; dotted for a key in a table, `metadata.type`), `keys` (a key's kind when
it's there: string, number, boolean, date, list, table), `values` (its allowed values), `number` (a pattern on the
file's name whose first group is its number) and `status` (the frontmatter key of its status). One named as a built-in
changes only the fields it gives; `paths = []` turns a type off. A folder's config may add types: they only read (D133).
A field of the wrong kind is dropped and said, as any.

## Rules (`22.2`)

A note of a type with rules has its frontmatter (YAML's `---` or TOML's `+++`) checked (D133): a required key missing or
empty, a key of another kind (a date is `2026-10-10`, a time after it allowed, or a TOML date), a value not among the
allowed. Each is a warning at the key's line — at the first line for one missing — from `slipbox`, code
`frontmatter`. A note with none at all needs it; frontmatter that doesn't parse is said once, its rules unchecked.
They're a note's own problems (`core/diagnostics.ts`, `noteProblems`; D167), so they're in the bar and the marks, the
panel's This file tab and `slipbox diagnostics`; and the root's are a Frontmatter section of the panel's All tab and
`slipbox problems`' `frontmatter[]`, kept until a note changes.

## Order and status (`22.3`)

A type's notes are in their number's order (from the file's name), then by path (D133). A status is the type's
frontmatter key, else a `Status: …` line (bold or not, a list item or not), else a `## Status` section's first line. A
status saying "Superseded by …" names the note that supersedes it: by a link (from where the note is), a wikilink, or a
number in the type's naming (`ADR-0007`, `D7`, `0007`).

`slipbox types` lists the types with how many notes each has and how many break its rules; `slipbox types adr` lists
a type's notes in order, each its title, status and what supersedes it. In the TUI, `space f d` (`:types`) lists the
types, then a type's notes (`:type adr`), and `] t` / `[ t` open the next or previous note of the open one's type,
saying where it is (`adr 2 of 5 — Superseded by …`).
