---
status: todo
assignee: ""
blocked_by: [SD-T3, SD-T4, SD-T5]
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
- Each read the measurement finds made on a timer or at a vault gone into asked of a disk thread, what's kept here
  used meanwhile (SD-D3); one made before the screen is up stays (SD-D9): a vault gone into opens with its
  positions once they're read; the Vaults window lists what it last read, then what's on disk.
- Link completion's other vaults (`src/tui/documents/editing/completion/items.ts:50`–`:55`): the machine's list
  (`readRoots`), each vault's folder looked for and its `index.json` read on a disk thread, kept from the last read;
  a completion offers what's kept, and the rest once it answers.
- The upgrade check every ten seconds (`update-observation.ts:71` → `currentVersion`,
  `src/core/application/distribution/install.ts:25`) reads slipbox's data folder, not its state, cache or config: not
  this task's. It stays, said as a known limit in design/tui.md § Known limits (SD-D1's note of 2026-11-10).
- Writes stay (SD-D7, agreed: question 4 of README.md).
- The parse cache (`parsed.db`, `src/core/documents/markdown/parsecache.ts:44`) stays on the screen's thread, said as
  a known limit in design/tui.md § Known limits.

## Acceptance criteria

- The measurement before and after, in the log here.
- Held: slipbox's state folder under `held` — going into another vault, a key handled and drawn while its positions
  are read; let go, its notes open where they were left.
- Held: the same for the Vaults window, its list drawn from what was kept.
- Held: another vault's cache folder under `held` — a link's completion opens at once with this vault's notes, a key
  handled meanwhile; let go, the other vault's notes are offered too.
- Mutation: each read put back here, its test fails (checked once).
- `CHECKS_FOR` (`scripts/ci-scope.ts`) names the terminal checks this task's files reach; before its pull request
  merges, they run locally, listed for approval first, with its unit tests (SD-D14).

## Terminal check

`slow disk: home on a slow disk — slipbox's own state read while the keys answer; going into a vault, its notes back
where they were`.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D12):

- What the measurement finds beyond the list: moved in this task if it's made on a timer or at a vault gone into;
  left if it's made before the screen is up.
- The parse cache: a known limit, not a task here. It's in the cache folder, local by default, its SQLite calls are
  synchronous, and moving it moves the parse, which this workstream leaves out.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("slipbox's own folders").
- Rests on: SD-D3, SD-D7; D39 (config, cache and state apart); D61 (the parse cache).
