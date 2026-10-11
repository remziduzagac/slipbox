---
status: todo
assignee:
created: "2026-10-11"
---

# T9: Every link says how it landed

Every resolved link carries how it landed, not wikilinks only: a markdown link by its path, a pointer by its name, a
hosting link by its URL.

## Description

D86: how every link landed is said (`links.ts` `Landed`). Today only wikilinks carry `how`; every link gets a
certainty. Give the other kinds their `how`, and show it where wikilinks' is shown (`slipbox resolve --json`, the
hover, the link check).

## Acceptance criteria

- Tests: `resolve --json` gives `how` for a markdown link, a pointer and a hosting link. They fail without the change.
- design/links.md § How a link landed lists every kind.

## References

- Delivers: design/links.md § How a link landed.
- Rests on: D86.

## Log
