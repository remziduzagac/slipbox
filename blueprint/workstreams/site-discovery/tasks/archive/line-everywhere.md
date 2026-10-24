---
status: done
assignee: claude
blocked_by: [SEO-T1]
tracker: [gh:#66]
created: "2026-10-24"
---

# SEO-T6: The line everywhere, the docs and the changelog

Put slipbox's new line wherever it describes itself, and tell users.

## Description

The README's first line (and the paragraph after it), `package.json`, `slipbox help`, the Homebrew formula, the docs
map, "What is slipbox?", the skill. The docs home's agent section and the docs map name `llms.txt` and
`llms-full.txt`. A CHANGELOG line.

## Acceptance criteria

- `tests/docs.test.ts` holds each file to `about.ts`' line, read as text; the CLI's help tests pass.
- `check:docs` passes; the README's screenshot and the docs' shots unchanged (no picture shows the line).

## References

- Delivers: design.md § Where slipbox describes itself, § The user docs.
- Rests on: (SEO-D1).

## Log

- 2026-10-24: the README's paragraph after the line no longer repeats it; "What is slipbox?" leads with the line, then
  your own Markdown and code, and puts "beside a coding agent" before "on your own". The skill's line is the agent's
  view: where the user reads, reviews and edits what you write. Mutation: the README's old line back, caught.
