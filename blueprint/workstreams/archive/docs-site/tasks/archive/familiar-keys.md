---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-14"
---

# DS-T5: The keys a newcomer knows, first

The front door gives the familiar key before vim's, and a guide lists the familiar keys on one page (DS-D6).

## Done when

- The README, the quick start, getting started, the docs' home and reading's table of moves give the arrows, `home`,
  `end`, the page keys and the `ctrl` shortcuts first, vim's keys beside them.
- `docs/guides/keys-you-know.md` lists the familiar keys, the four new ones and where slipbox differs; the docs map,
  the quick start, the keys chapter and the agent guide link it.
- `tests/docs.test.ts` fails when the newcomers' pages name a key slipbox hasn't (mutation-checked).
