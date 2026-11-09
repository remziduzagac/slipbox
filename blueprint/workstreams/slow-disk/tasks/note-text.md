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
- `Graph.entry` asked for a note not parsed yet (a backlink, a hover, completion): **Open** — parsed when its text
  comes, its place said not parsed yet meanwhile, or read here as now (rare once the background parse is done).

## Acceptance criteria

- Held: a note under `held` rewritten by an agent — the watcher's batch waits for its text, a key handled and drawn
  meanwhile; let go, its new links and backlinks are in the graph.
- Held: an open note under `held` rewritten — `↻ … reloaded` once let go; typed into before it came, the conflict
  prompt asks instead.
- Held: a vault of a hundred notes, ten under `held`, opened — the background parse goes on with the others, a key
  handled meanwhile, and indexes all of them once let go.
- Races: a note changed twice while its first text was out ends as its second; a vault left meanwhile drops it.
- Mutation: each read put back here, its test fails (checked once).

## Terminal check

`slow disk: an agent's change to a note on a slow disk — the keys answer while it's read; its links and backlinks
there once read`.

## Open

- How far ahead the background parse reads (a slice's notes, or a byte budget).
- `Graph.entry` on demand (above).

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("A note's text").
- Rests on: SD-D3, SD-D5, SD-D6; D120; D137; D153; `5.1`, `5.3`.
