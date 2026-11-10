---
status: done
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

## Open

What the description left open, settled here for the maintainer to confirm; design.md's section it delivers says how.

- One request, `own` (`core/workspace/walk/own-jobs.ts`, `answerOwnJob`), reads what's asked of slipbox's own
  folders: a vault's session, the machine's vaults, the other vaults' notes for completion. Each is asked as a key's
  read (`key`), no key held for it.
- Going into a vault (`Session.enter`): its `session.json`, with the vault's positions kept before 21.8, is read there;
  the keys go on in the vault gone into meanwhile, its theme and keys your config's. Once it answers, the tabs open
  where they were left (`Session.entered`), unless one was opened meanwhile, which stays, as a restore with tabs open
  leaves them. The note the switch was for (a link followed, a file named) is opened and shown then all the same
  (`meanwhile`), unless you opened it yourself meanwhile: that's the one sign that you've gone elsewhere on purpose this
  code can tell from a key, and where you went since is left as it is. The recents of the moment come first, then the
  session's; a UI override set meanwhile wins over the session's. Until it's answered, the vault's session isn't saved
  (`unread`), so a quit or a switch meanwhile doesn't write over what's kept; one that fails or isn't answered in time
  is said in Messages, the note named or the vault's own opens, and the session stays unsaved for the visit: what's kept
  isn't known.
- The machine's positions (`positions.json`, one file) are carried over from the vault left (`PositionStore`'s
  `kept`), not read again: the same file, read at the start and merged with the disk's at each save. A vault moved by
  hand has them moved along here (`PositionStore.carry`) as `recordLocation` moves the file's, or the old paths would
  be found and saved back. The vault's own of before 21.8 come with the session and are taken in then (`takeIn`), the
  file removed, as before.
- Your config isn't read again going into a vault: what the TUI's look last read by its stamp (SD-T4) is used
  (`loadConfig`'s `kept`, `Settings.yoursKept`). The vault's own `.slipbox/config.toml` is the vault's disk, read as
  before. A test's App, whose look is here, reads both as before.
- The Vaults window lists the vaults last read (`VaultPrompts.known`), titled `Vaults — reading the list…` the first
  time, empty; once the list's read answers, it's drawn again, its filter and its pick kept. A read that fails is said
  while the window is open.
- Link completion: the other vaults' notes (the machine's list, each vault's `index.json`) are kept per App and the
  vault they were read from, each with its pointer worked out there (`pointerAt`). A completion offers this vault's
  notes and what's kept, and the answer replaces the other vaults' while the same completion's open, its filter and
  its pick kept (`moreLinks`), the items built only then. The read is a background request, no key's waiting behind
  it; one out at a time, a completion opened meanwhile taking its answer, then, still open, one more read — however
  many opened — so a vault indexed since the first was asked is offered (20.13). Not a time a read is taken as fresh:
  a list made after a vault was indexed offers it (the links check "each target its own completion"). With nothing of
  this vault's to offer, the completion stays open, showing nothing, until they come (`narrow` keeps a link's list
  open while nothing matches).
- `links.json`, the answers kept for links followed, is statted by the TUI's look with its batch each second and read
  there when its mtime moved (a `links` look job), taken only if no answer was written here, nor the file read again,
  since the look took its stamp (`tookLinks`, by `written`, a count of the writes here: a write's stamp isn't known);
  `kept()` no longer stats it as asked. A write (`setLinkAnswer`, `forgetLinkAnswer`, `moveLink`) stats it and reads
  it first if it moved, as before (SD-D7), so another slipbox's answer isn't written over, and keeps what it wrote.
- `readJson` (`fsutil.ts`) reads through the seam, so a test's hold reaches each of slipbox's own files read with it.
- What stays (SD-D7, SD-D9): the start's reads; each write of slipbox's own state, and the read it makes first to
  merge with another slipbox's (the positions' and the session's save, `recordLocation`'s machine lists, the
  background index's place, the dirty marks). The largest left at a switch, measured: the vault's search index
  (`search.db`, `src/tui/workspace/search/search.ts:58`), 111 ops, SQLite's synchronous calls as the parse cache's;
  said as a known limit in design.md with the parse cache's reason (in the cache folder, local by default), for the
  maintainer to confirm. A theme's file looked for in your config's `themes` folder as the theme's applied (three
  ops): not moved. The graph's index and walk are SD-T8's; what drawing reads of the machine's lists, SD-T11's.
- A test's pitfall: a hold's `only` that reads through the seam itself (`rootAt`) holds its own read; the held folder
  is worked out before `holding`.
- `CHECKS_FOR`: `own-jobs.ts` reaches slow disk, the vaults' checks, roots, where and links; completion's items slow
  disk and links; `vaults.ts`, `vault-prompts.ts` and `symlinks.ts` slow disk too.
- The terminal check runs with `SLIPBOX_SLOW_DISK=slowdisk:1::1000` and the state folder under `slowdisk`: going into
  a vault answers its key in under a second while the session is read, and the tab comes back at its line after.
  Checked once with the session's read put back: it fails.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("slipbox's own folders").
- Rests on: SD-D3, SD-D7; D39 (config, cache and state apart); D61 (the parse cache).

## Log

- 2026-11-10: Measured on Linux, slipbox in a headless terminal, its state, cache and config folders on a FUSE
  loopback mount (go-fuse) answering every lookup, stat, open and listing in 100 ms, the vaults and home on the local
  disk. The mount logged each op with the thread that asked; a preloaded timer on the screen's thread every 5 ms logged
  each gap over 40 ms. Steps: the start in a vault, idle, going into a second vault and back three times, the Vaults
  window twice, a link's completion offering the other vault's notes, idle, quit. Before is this branch's base on
  `dev`, after is this branch:

  | Step                     | The screen's thread's ops | Its longest stall |
  | ------------------------ | ------------------------- | ----------------- |
  | the start                | 516 → 513                 | 16.1 s → 16.0 s   |
  | idle                     | 39 → 39                   | 4.0 s → 4.0 s     |
  | into the second vault    | 479 → 506                 | 33.2 s → 29.8 s   |
  | into the first again     | 647 → 490                 | 29.9 s → 24.6 s   |
  | into the second again    | 503 → 428                 | 28.5 s → 23.5 s   |
  | into the first once more | 371 → 283                 | 28.8 s → 23.6 s   |
  | the Vaults window        | 81 → 69                   | 7.1 s → 7.0 s     |
  | the Vaults window again  | 12 → 0                    | 4.0 s → none      |
  | a link's completion      | 121 → 108                 | 7.0 s → 7.1 s     |
  | quit                     | 95 → 95                   | 7.5 s → 7.6 s     |

  By file, going into the first once more (a folder's lookups counted with the file they led to):

  | File                                           | Before | After | What it is                                  |
  | ---------------------------------------------- | ------ | ----- | ------------------------------------------- |
  | `config/slipbox/config.toml`                   | 15     | 0     | your config, read again                     |
  | `state/slipbox/links.json`                     | 6      | 0     | the answers kept for links, statted         |
  | `state/slipbox/<vault>/positions.json`         | 4      | 0     | the positions of before 21.8, looked for    |
  | `state/slipbox/<vault>/session.json`           | 61     | 20    | read to restore; the rest, save's merge     |
  | `state/slipbox/<vault>/session.json` (write)   | 32     | 16    | the vault left's saved                      |
  | `state/slipbox/positions.json`                 | 48     | 42    | save's merge                                |
  | `state/slipbox/positions.json` (write)         | 24     | 24    | saved                                       |
  | `state/slipbox/roots.json`, `folders.json`     | 27     | 27    | `recordLocation`'s merge                    |
  | `state/slipbox/<vault>/dirty`                  | 8      | 8     | the dirty marks' folder, written            |
  | `cache/slipbox/<vault>/search.db` and its logs | 111    | 111   | the search index (known limit)              |
  | `cache/slipbox/<vault>/index.json`             | 32     | 32    | the graph's index (SD-T8)                   |
  | `config/slipbox/themes`                        | 3      | 3     | a theme's file looked for                   |

  The start's reads stay (SD-D9); its 3 ops fewer are `links.json`, read once. The stalls left at a switch are its
  writes with their merges (SD-D7), the search index and SD-T8's index. The Vaults window's first step still holds
  for the session's and the positions' saves made in it (`publishState`); its list is no longer read here. A
  completion's stall is the dirty marks and the saves typing makes; the other vault's `index.json` (7 ops) is read
  there. The background index's place (`autoindex.json`) was written in a different step in each run: the totals of
  the first switch differ by it.
