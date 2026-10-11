---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DOC-T1: The keys chapter

`docs/manual/keys.md`: every key slipbox has, for looking up, from today's `docs/keymap.md`.

## Description

Rewrite `docs/keymap.md` as the manual's keys chapter: the notation, the conventions (the leader and which-key, the
other route for every `ctrl` chord, plain `q`, `ctrl+c`), the cursor, every group of keys, the keys in lists and
prompts, the mouse, the platform notes. Take out what is history or the design's: the opening on the phase 2 keymap,
"decided 2026-09-29", the IDs in tables and prose. The comparison with vim, VS Code and Obsidian stays only where it
tells someone coming from one of them what to expect. Keep the sections in the order help and the palette list their
commands (`COMMAND_GROUPS` in `src/core/command-specs.ts` follows them). The area chapters explain behaviour and link
here for the full lists, so a row stays a row: what the key does, briefly.

Check every table against `src/tui/keys.ts` (`DEFAULT_KEYS` and each mode's own table) and the command specs: a key
in the code but not the doc, or the reverse, is fixed in the chapter and noted in the Log.

## Acceptance criteria

- Every default key, in every mode, is in the chapter, and none that the code lacks.
- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).
- Removing the old reference, and the links to it (DOC-T11).

## References

- Delivers: requirements.md § The documents (`manual/keys.md`).
- Rests on: DOC-D2, DOC-D3.
- Sources: `docs/keymap.md`, `src/tui/keys.ts`, `src/core/command-specs.ts`, `blueprint/design/tui.md`.

## Log
