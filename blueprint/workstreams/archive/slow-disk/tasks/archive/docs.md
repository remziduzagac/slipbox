---
status: done
assignee: ""
blocked_by: [SD-T1, SD-T2, SD-T3, SD-T4, SD-T5, SD-T6, SD-T7, SD-T8, SD-T9, SD-T10, SD-T11]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T12: The user docs, the design consolidated, the workstream closed

## Description

- The user docs: what you'll see on a slow disk — `reading <note>…`, `reading the vault…`, `⚠ disk not answering`,
  `esc` giving a read up, a save still waiting for its write — in `docs/manual/files.md` beside the listings' passage
  and wherever the watcher is said; no blueprint IDs (`tests/docs.test.ts`). A CHANGELOG line per task that changed
  what you see, gathered.
- The design consolidated, with the maintainer's approval: design.md's changes applied to the root, requirements.md's
  quality goal added, the "Previously:" texts reconciled — design/roots.md's "Not done" paragraph among them, which the
  workstream leaves as it is until then; the decisions agreed recorded with their dates; the roadmap item ticked; the
  folder archived.
- Every slow-disk terminal check run (listed for approval first, D207) on Linux and macOS, and live once on a FUSE
  mount that answers slowly, the screen's longest stall recorded.

## Acceptance criteria

- `bun run check:docs` and `bun run test:docs` pass.
- Issue #46 closed by the last pull request.

## Open

What the description left open, settled as it was done, each with the option recommended, by the maintainer's
instruction to take it.

- **Where the user docs gather it:** a section of its own, How slipbox works § On a slow disk
  (`docs/manual/how-it-works.md`), not the explorer's page: a slow disk reaches a note opened, the watcher, the config,
  git, the vault read again and what's drawn, which the explorer's page doesn't hold. It says what you see while
  slipbox waits, that nothing is read while you wait instead, and what still holds the screen. Beside the explorer's
  listings (`docs/manual/files.md`) a paragraph says a file operation waits for its write and then for the vault, and
  points to it; beside the save (`docs/manual/editing.md`), that a save waits for its write; "Where it stops" names it.
  The passages each task wrote where its feature is (reading, editing, the screen, configuration, vaults) stay.
- **The CHANGELOG:** each task that changed what you see wrote its own line (SD-T3 to SD-T11), each saying what changed
  for its feature; they stay as they are, not merged into one, since each says something the others don't. One line
  added under Added for the new section, which says what still holds the screen, which no line did.
- **The known limits:** what the tasks' Open and Log sections left on the screen's thread, gathered into
  design/tui.md § Known limits as one list: kept by a decision (the writes and their reads, SD-D7; the start before the
  screen, SD-D9; the parse and its cache; the search index; another vault's graph; registering a watch; the upgrade
  check), and not moved, each a small read a key or a draw makes (SD-T5's, SD-T6's, SD-T7's, SD-T8's and SD-T11's
  measurement of what drawing still asks). No task is opened for them here: none freezes the screen on a timer, and
  each is a read a key or a frame makes once; the list is where a later task starts.
- **Root decisions:** none changed. SD's decisions build on D40, D120, D137, D220 and D262 without changing what they
  say, so no note goes under a root entry; SD's stay in this folder's decisions.md.
- **`AppOptions.listOffThread`** keeps its name. SD-D10's note renamed it for what it covers, and SD-T3 left the name
  to consolidation; renaming it is a change to the code and its tests, not this documentation's, so the design says
  what it covers instead.
- **The terminal checks and the live run:** not run here. This pull request changes the docs and the blueprint and a
  comment in `scripts/disk-inventory.ts`, no step a check reads; each task ran the slow-disk checks it reached before it
  merged (SD-D14), and `dev`'s full run runs every check on Linux and macOS. The last live run on a FUSE mount is
  SD-T9's log (home's folders answering in 100 ms an op), and SD-T11's counted what drawing reads; no further one was
  made for the close, so the screen's longest stall with every task in isn't recorded here.

## References

- Delivers: the workstream's consolidation.
- Rests on: every SD task.

## Log

- 2026-11-10: Consolidated. design.md's ADDED and MODIFIED changes applied to design/tui.md (§ A slow disk, after
  § Asynchronous git reads; § Side panes; § Overlays; § External changes; § Bun's watcher; § Known limits),
  design/roots.md (§ The index), design/testing.md (§ The terminal tests) and design/how-it-works.md (§ The parts,
  § Module map); requirements.md's quality goal added. Each "Previously:" text was found in the root as quoted, and
  replaced. The roadmap's item ticked, the workstreams' index and the links into this folder (ideas.md, notes.md,
  `scripts/disk-inventory.ts`'s comment) moved to `workstreams/archive/slow-disk/`.
