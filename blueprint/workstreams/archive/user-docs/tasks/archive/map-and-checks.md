---
status: done
assignee: claude
blocked_by: [DOC-T1, DOC-T2, DOC-T3, DOC-T4, DOC-T5, DOC-T6, DOC-T7, DOC-T8, DOC-T9, DOC-T10]
created: "2026-10-11"
---

# DOC-T11: The map, the links and the checks

`docs/README.md`, the project README pointing into the docs, the old references gone, and checks that keep the docs
whole.

## Description

- `docs/README.md`: where to start, the guides, the manual's chapters, each in a line.
- The project README: what slipbox is, its status, installing in a line, the way into `docs/`; its Documents table and
  key summary point at the guides and the manual.
- The old references removed (`docs/keymap.md`, `docs/configuration.md`, `docs/cli.md`), and every link to them moved
  to the chapters: the code's comments, `VAULT_CONFIG_TEMPLATE`, CLAUDE.md, the blueprint's links (link targets only;
  no entry's words change).
- A test, beside the configuration chapter's: no roadmap or decision ID in `docs/`; every relative link and anchor in
  `docs/` resolves; every CLI command is in the CLI chapter; every default key is in the keys chapter.
- The chapters and guides read through together: overlaps and contradictions between them settled, each subject
  explained in one place and linked from the others.

## Acceptance criteria

- The test passes, and fails with an ID, a broken link, a command or a key left out (mutation-checked, in the Log).
- markdownlint is clean over `docs/`; `bun run check` passes.
- No link anywhere in the repository points at the old references.

## Out of scope

- Trying the guides live (DOC-T12).
- The root requirements' § Documentation, applied at consolidation.

## References

- Delivers: requirements.md § The documents (`docs/README.md`, the README), § Acceptance criteria.
- Rests on: DOC-D1, DOC-D2, DOC-D3.

## Log

- 2026-10-11: `docs/README.md`, the map, written. `tests/docs.test.ts`: every document in the map; every relative link
  and anchor lands (slipbox's own parser and GitHub's slugs); no roadmap or decision ID outside code blocks; no link
  into the blueprint; every CLI command and flag in the CLI chapter; every default key, every mode's, in the keys
  chapter (as `canonSeq` writes them, the leader as `space`). Mutation-checked: an ID, a missing file, a missing
  anchor, a flag, a key, a chapter left out of the map and a link into the blueprint each fail it (*ran*).
- 2026-10-11: the old references removed; every pointer to them moved to the chapters, section names with them
  (`§ Renames` became `§ Moving, copying and deleting`, and so on): the code's comments, `VAULT_CONFIG_TEMPLATE`, the
  repository's own `.slipbox/config.toml` and the examples', CLAUDE.md, the README, and the blueprint's design,
  requirements, research and decisions (link targets and section names only; no entry's words changed). The session
  notes and the archived tasks keep the paths they had then. The lines this pushed past 120 columns rewrapped.
- 2026-10-11: the README rewritten as the front page: status, installing from source, the root in brief, the keys
  (two were wrong: `ctrl+e` is not source mode, `ctrl+k` is; `alt+left` is a word back, not back, `ctrl+o` is), and
  the way into `docs/`. CLAUDE.md and the blueprint README's convention say where the user docs are now.
- 2026-10-11: `bun run check`: 1748 pass, 1 fail, the timing test "the background index parses a big note on other
  threads" (load average 12, ten agents and the user's others); it fails the same at 8de5949, before this workstream,
  under the same load (*ran*).
- 2026-10-11: the chapters and guides read together (claude-review): each shared subject given one owner and linked
  from the rest (the which-key popup, selecting and copying, the storage folders, the links' convention, indentation
  and spelling, footnotes, the search syntax, the conflict prompt, the skill); one example project (`~/code/app`);
  export's overwrite rule said as the code has it. Contradictions settled by the code: the rail's `±` click (does
  nothing: a bug, below), `esc` on the conflict prompt keeps yours, `ui.restore_session` whenever no note is named,
  UI settings remembered per folder. markdownlint and the docs test clean.
- 2026-10-11: what the writers found in the code, for the user: bugs, places where the code and the design disagree,
  and gaps, listed in the workstream's notes.
- 2026-10-11: accepted by the user; done.
