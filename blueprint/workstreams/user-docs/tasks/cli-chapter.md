---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DOC-T3: The CLI chapter, and the skill checked

`docs/manual/cli.md`: every command, from today's `docs/cli.md`; the agent skill checked against it.

## Description

Rewrite `docs/cli.md` as the manual's CLI chapter, for people and for whoever writes an agent's or a script's use of
it: disk as the contract, the output contract and exit codes, what is stable, how notes are named, every command with
its flags and its `--json` data, installing for agents. Code paths (`core/stale.ts`), IDs, plan references and
history ("a launcher written before 2026-10-07") go.

Check it against `src/cli/`: `slipbox help` and each command's own help, the flags each parses. Then check
`skills/slipbox/SKILL.md` against the chapter and the code: where the skill is wrong, or misses a command an agent
needs, fix the skill (it stays the agents' guide, DOC-D4) and say so in the Log.

## Acceptance criteria

- Every command `slipbox help` lists is in the chapter, with every flag it takes.
- The chapter's examples run as written on the reference set (`scripts/build-home.ts`), noted in the Log.
- The skill names no command, flag or behaviour the chapter contradicts.
- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).
- Removing the old reference, and the links to it (DOC-T11).

## References

- Delivers: requirements.md § The documents (`manual/cli.md`), § Acceptance criteria (the skill).
- Rests on: DOC-D2, DOC-D3, DOC-D4.
- Sources: `docs/cli.md`, `src/cli/`, `skills/slipbox/SKILL.md`, `blueprint/design/how-it-works.md`.

## Log
