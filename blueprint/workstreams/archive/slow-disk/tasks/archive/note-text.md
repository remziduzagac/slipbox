---
status: done
assignee: ""
blocked_by: [SD-T3, SD-T4, SD-T5]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T6: A changed note's text, and the background parse's, read on the disk threads

SD-D3, SD-D5, SD-D6.

## Description

- The watcher's batch (`applyToGraph`, `src/core/workspace/vaults/vault-feed.ts:29`): each changed note's `stat` and
  text asked of a disk thread; `Graph.updateFile` (`feed.ts:73`) takes the text and parses it here (`extractText`)
  when it comes. The batch is applied once all its texts are in, so a batch's changes still land as one (D153).
- An open note changed on disk (`Watch.reloadBuffer`, `src/tui/app/runtime/watch.ts:409` → `NoteBuffer.load`) is
  reloaded from a `read`; typed into meanwhile, the answer is dropped and the conflict prompt asks, as now. Before it,
  the batch's check of an open note against what it holds (`asRead`, `watch.ts:457`, from `:386`: a `stat` and its
  whole text; the `existsSync` at `:383`) is made with the same `read`, its answer compared here.
- The background parse (`parseInSlices`, `graph-refresh.ts:44`; `Graph.parseSome`, `refresh.ts:356`) reads a slice's
  texts ahead on the disk threads and parses those that came; a big note's text is read there before and after its
  parse on the parse threads.
- Notes not parsed yet, asked for (`Graph.entry`; `ensureAll`, `refresh.ts:369`, for the tags, the problems, the link
  forms and a note's backlinks, `graph.ts:469`, `:483`, `:492`, `:515`): a key that needs them — those lists, a
  rename's or a move's plan — waits for their texts, read on the disk threads, as an open does (SD-D4: `reading
  notes…`, `esc` giving it up), and nothing is planned from notes not read. What a hover or completion asks is shown
  without it, and again once it's parsed.
- What's drawn of every note never waits (SD-D12's note): the Problems tab's count (`draw-problems.ts:31` →
  `Problems.count`, `problems.ts:320` → `graph.problems`), the Info panel's backlinks (`info.ts:180`) and convention
  (`info.ts:190` → `conventionOf` → `linkForms`, `convention.ts:180`) count what's parsed so far, marked as partial
  while notes are unread, the rest asked of the background parse; they're drawn again when it's done.

## Acceptance criteria

- Held: a note under `held` rewritten by an agent — the watcher's batch waits for its text, a key handled and drawn
  meanwhile; let go, its new links and backlinks are in the graph.
- Held: an open note under `held` rewritten — `↻ … reloaded` once let go; typed into before it came, the conflict
  prompt asks instead.
- Held: a vault of a hundred notes, ten under `held`, opened — the background parse goes on with the others, a key
  handled meanwhile, and indexes all of them once let go.
- Held: the tags asked for with notes under `held` not parsed yet — `reading notes…`, a frame drawn, `esc` gives it
  up; let go, the list has their tags. A rename with a note under `held` not parsed yet waits, then repairs its link.
- Held: notes under `held` not parsed yet — the Problems tab and the Info panel drawn at once, their counts marked
  partial, a key handled meanwhile; let go, the counts whole and the mark gone.
- Held: an open note under `held` the watcher says came, its text unchanged — a key handled meanwhile; let go, it's
  neither reloaded nor asked about.
- Races: a note changed twice while its first text was out ends as its second; a vault left meanwhile drops it.
- Mutation: each read put back here, its test fails (checked once).
- `CHECKS_FOR` (`scripts/ci-scope.ts`) names the terminal checks this task's files reach; before its pull request
  merges, they run locally, listed for approval first, with its unit tests (SD-D14).

## Terminal check

`slow disk: an agent's change to a note on a slow disk — the keys answer while it's read; its links and backlinks
there once read`.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D12):

- How far ahead: the next slice's notes, asked while this one is parsed; two slices' texts in memory at most, no new
  setting.
- Notes not parsed yet: a key that needs them waits for their texts, nothing planned from notes not read; a hover or
  completion shown without them, then again (above). A list or a rename made from part of the vault would be wrong
  without saying so.

## Open

What the description left open, settled here for the maintainer to confirm (SD-D16); design.md's section it delivers
says how.

- The texts travel as the look's jobs (`notes`, `texts`; `core/workspace/walk/look-jobs.ts`), read by
  `core/workspace/walk/io/notes.ts`, which holds no parser: the disk threads stay light. `DiskThreads` has no new
  method (`walk-thread.ts` is at its ceiling).
- `Texts` (`tui/app/runtime/texts.ts`, `app.watch.texts`) asks them: a batch's (`VaultFeed`'s `read`), an open file's
  the look each second found changed, a slice's and a big note's. The graph takes what's given (`NoteTexts`,
  `core/workspace/graph/texts.ts`, `Graph.texts`): `parseSome` parses only the notes whose texts came while they're
  read elsewhere; the CLI and a test's App read here, as before.
- Drawn, and asked by a completion or the Problems and Info panels, the notes are taken `partially`: a note not parsed
  yet stays its stub and `ensureAll` returns at once. Every note's lists are of what's parsed so far; a heading link
  into a note not parsed yet isn't checked yet (`NoteTexts.waits`).
- The keys that need every note wait for the parse (`KeyReads.notes`): `Renaming.preview` (renames, moves, relinks,
  conversions), the relink offered after moves made elsewhere, `tag.list` and a tag's notes, `backlinks.open`.
- A rescan's own reload of each open file isn't made when the build is made on a disk thread: its answer looks at every
  open file (`rebuilt` → `poll(true)`).
- `watch.ts` reads only through the seam now (`disk.exists`), so it moved to `SEAM_READERS`.

Still read on the screen's thread, for a later task or as kept:

- A note not parsed yet that a key asks for alone: a heading link followed (`landingLine`), a hover's text, a note's
  links listed, writing a link in the folder's convention (`Linking`, `conventionOf`), and a note typed into before
  it's parsed (its overlay's entry).
- The open note's own problems read its file (`noteProblems` → `textOf`) while the graph has no editor overlay for it.
- What a rename's plan and apply read of the files they rewrite (kept, SD-D7), and the reads of the vault built again
  taken in over it (`takeAgain`, SD-T8's).
- Another vault's graph parsed here (`parseHere`), and a file reached (`reachFile`, 20.8).
- A batch's note read whole when an open file has its path (at most one per open file); a note over
  `walk.max_file_size` isn't parsed, as before.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("A note's text").
- Rests on: SD-D3, SD-D5, SD-D6; D120; D137; D153; `5.1`, `5.3`.
