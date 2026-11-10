---
status: active
created: "2026-11-10"
---

# SIS: Markdown's inline styles in SOURCE view

Issue #103. SOURCE view showed a note's Markdown as typed, which is right, but styled little of it: `**xyz**` was plain
text, its markers to be parsed by eye. This workstream shows each inline style as the render draws it, its markers
kept in a dimmer colour of their own: only colours change, so nothing is hidden or moved.

**Built on 2026-11-10 (SIS-T1).** Its decisions were taken with the answer recommended in each, by the maintainer's
instruction to take the recommended answer; the pull request lists them for review. Consolidating it into the root's
requirements and design (SIS-T2) waits for the maintainer's approval.

- [requirements.md](requirements.md): its goals, what it builds on, its acceptance criteria, its change to the root's
  requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): SIS-D1 to SIS-D7.
- [tasks/](tasks/README.md): SIS-T1, built; SIS-T2, the consolidation, `todo`.
- [notes.md](notes.md): how it was drafted, what was measured, and its known limits.
- The research: [../../research/source-inline-styles.md](../../research/source-inline-styles.md), how seven editors
  show these styles, with provenance.

## Goal

What READ draws bold, SOURCE view draws bold, with its `**` kept and dimmed — italic, strikethrough, a highlight, a
link's text apart from its address, wiki links, footnote marks, tags, maths, inline HTML, escapes and a table's pipes
too — by the render's own parse, so the two never disagree; the lens's rows and a note's diff the same; with a switch
to turn it off.

## Scope

In: SOURCE view of a Markdown note, the lens's rows, a note's diff (its window, the review and the merge screen); the
new `markup` role in every theme; `render.source_styles`.

Out:

- Hiding the markers anywhere (that's READ's and the lens's frame's).
- A code file's or a data file's highlighting, a fence's code: as they were.
- A note's before-and-after diff (`blockdiff.ts`), already formatted lightly as it reads.
- Setext headings' colour, which the line-by-line highlighting never had.
