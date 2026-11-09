---
status: todo
assignee: ""
blocked_by: [SD-T1, SD-T2]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T6: A changed note's text, and the background parse's, read on the disk threads

SD-D3, SD-D5, SD-D6.

## Description

- The watcher's batch (`applyToGraph`, `src/core/workspace/vaults/vault-feed.ts:29`): each changed note's `stat` and
  text asked of a disk thread; `Graph.updateFile` (`feed.ts:73`) takes the text and parses it here (`extractText`)
  when it comes. The batch is applied once all its texts are in, so a batch's changes still land as one (D153).
- An open note changed on disk (`Watch.reloadBuffer`, `src/tui/app/runtime/watch.ts:403` → `NoteBuffer.load`) is
  reloaded from a `read`; typed into meanwhile, the answer is dropped and the conflict prompt asks, as now.
- The background parse (`parseInSlices`, `graph-refresh.ts:44`; `Graph.parseSome`, `refresh.ts:356`) reads a slice's
  texts ahead on the disk threads and parses those that came; a big note's text is read there before and after its
  parse on the parse threads.
- Notes not parsed yet, asked for (`Graph.entry`; `ensureAll`, `refresh.ts:369`, for the tags, the problems, the link
  forms and a note's backlinks, `graph.ts:469`, `:483`, `:492`, `:515`): a key that needs them — those lists, a
  rename's or a move's plan — waits for their texts, read on the disk threads, as an open does (SD-D4: `reading
  notes…`, `esc` giving it up), and nothing is planned from notes not read. What a hover or completion asks is shown
  without it, and again once it's parsed.

## Acceptance criteria

- Held: a note under `held` rewritten by an agent — the watcher's batch waits for its text, a key handled and drawn
  meanwhile; let go, its new links and backlinks are in the graph.
- Held: an open note under `held` rewritten — `↻ … reloaded` once let go; typed into before it came, the conflict
  prompt asks instead.
- Held: a vault of a hundred notes, ten under `held`, opened — the background parse goes on with the others, a key
  handled meanwhile, and indexes all of them once let go.
- Held: the tags asked for with notes under `held` not parsed yet — `reading notes…`, a frame drawn, `esc` gives it
  up; let go, the list has their tags. A rename with a note under `held` not parsed yet waits, then repairs its link.
- Races: a note changed twice while its first text was out ends as its second; a vault left meanwhile drops it.
- Mutation: each read put back here, its test fails (checked once).

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

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("A note's text").
- Rests on: SD-D3, SD-D5, SD-D6; D120; D137; D153; `5.1`, `5.3`.
