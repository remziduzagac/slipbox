---
status: todo
assignee: ""
blocked_by: [SD-T2, SD-T4]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T9: slipbox's own state, cache and config folders read off the screen's thread

SD-D3, SD-D7. What's left of § 6 of the inventory after SD-T4 (the config's stamps, the activity file) and SD-T8 (the
index, home's walk kept).

## Description

- Measured first, on a home that answers slowly (a FUSE mount on Linux as T12's): which reads of slipbox's own
  folders the screen's thread still makes, how often, and how long each holds it. Expected, from the code: the
  positions and the session at a vault gone into (`PositionStore`, `Session`), the machine's lists as the Vaults
  window opens and as the background index records what it found (`registry.ts`, `folders.ts`), the background
  index's place (`autoindex.json`), the answers kept for links followed (`links.json`, read again when its mtime
  moved).
- Each read asked of a disk thread, what's kept here used meanwhile (SD-D3): a vault gone into opens with its
  positions once they're read; the Vaults window lists what it last read, then what's on disk.
- Writes stay (SD-D7, question 4 of README.md).

## Acceptance criteria

- The measurement before and after, in the log here.
- Held: slipbox's state folder under `held` — going into another vault, a key handled and drawn while its positions
  are read; let go, its notes open where they were left.
- Held: the same for the Vaults window, its list drawn from what was kept.
- Mutation: each read put back here, its test fails (checked once).

## Terminal check

`slow disk: home on a slow disk — slipbox's own state read while the keys answer; going into a vault, its notes back
where they were`.

## Open

- What the measurement finds beyond the list above.
- The parse cache (`parsed.db`, SQLite in the cache folder), asked as each note is parsed: a limit said, or a task of
  its own (out of this workstream's scope as drafted).

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("slipbox's own folders").
- Rests on: SD-D3, SD-D7; D39 (config, cache and state apart); D61 (the parse cache).
