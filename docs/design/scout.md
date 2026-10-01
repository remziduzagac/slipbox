# Scout: how slipbox will use it

Recorded 2026-10-01 from the design session on scout, a local retrieval engine slipbox will consume. **Scout does
not exist yet**: nothing in slipbox is written against it — no dependency, no types, no adapter, no stub — and
slipbox works fully without it, as it always will. This page is so that when scout ships, both sides already agree.
The authoritative design is scout's own: `~/Projects/dotfiles/docs/ideas/scout.md` on beaver — "How slipbox uses
scout" and "Stage 4". Where they differ, that document wins, except where slipbox's running code says otherwise
(the last section).

## What slipbox gains

**Not search.** slipbox already has its own (`6.x`, [decisions.md](decisions.md) `6.1`): SQLite FTS5 with
per-column BM25 weights, a query language (`-not`, `title:`, `#tag`, `path:`, phrases, prefixes), snippets with
their words marked, and a scan when there's no index. What scout adds is what slipbox hasn't: **vectors** (semantic
hits with no word in common), a **typed graph** (a neighbour that contains none of the query's words), and **typed
context** for the client.

## Three tiers, by latency

| Tier | When | Engine | Gives |
| --- | --- | --- | --- |
| 1 | every keystroke | slipbox's own index | everything, every operator |
| 2 | on a pause, or enter | `scout.query()`, its focus the open note | vectors, graph, context |
| 3 | an explicit affordance | `scout.about(note)` | "what should I know about this" |

Three tiers, not two engines to fuse.

- **Append, don't fuse.** Tier 1 shows at once; scout's results are added after, the ones not already there,
  deduped on **path and line range** — each hit carries the section it's in, as scout names and bounds it
  (`hit.section`, `{name, line, end}`), since slipbox cuts files into scout's sections (`6.1`). Each result is
  labelled with its source; one found by both is promoted to the top and marked as both. Scores are never
  reconciled: tier 1 is on screen at keystroke latency, and any fusion would reorder what's being read. Appending
  only decides presence, which needs no shared scale.
- **Operator queries stay tier 1.** Scout has no `-not`, `title:` or `path:`; a query using them is answered
  locally, and the UI says so. `SearchResult.engine` (`"index" | "scan"`) gains `"scout"` then, and shows, so "no
  semantic results" never looks like "no results".
- **Tier 3 is the one most worth having**: a query-less diffusion from the note being read — not a search box at
  all, and the most slipbox-shaped thing scout does.

## A library, never a CLI fallback

Scout is an optional peer dependency behind a dynamic `import()`: absence is caught at import, and slipbox says
"scout unavailable, using local search" — never silently slower. There is no fallback to scout's CLI: it reloads its
model (some 300 MB) per invocation, a different performance class, and a second path through one feature is a path
nobody tests. The CLI is the door for agents and shells.

**slipbox drives scout's freshness.** It calls scout's `index()` from the same gate its own index is kept at — the
graph's change feed (`Graph.onChange`, `6.7`), which every change reaches: a save here, the watcher, a rename, a
branch switch. Scout's deferred embedding runs in `index()` and nowhere else, so a long-lived slipbox must call it,
or scout's index never finishes embedding.

## Which way things flow

**Calls flow toward scout; data flows toward scout from slipbox's files.** Scout never calls slipbox: that would give
it two behaviours with the rarer one untested, and break its rule that an agent needn't have a notes app installed
to search a codebase. Whatever slipbox writes to disk, scout indexes as content and edges. So to make scout know a
slipbox concept, persist it in a file — never expose a method.

## Already done on slipbox's side

- **The SQLite binding**: better-sqlite3, scout's too, so a process holding both loads one SQLite (`6.1`).
- **The sections**: scout's containment tree and size band (`6.1`), so a scout result and a slipbox hit are the same
  section, cited in slipbox's own terms.

**Not yet**: `@slipbox/links`, the wikilink rules extracted into a package both use (`normKey`, the collision
ladder, `parseWikiTarget`, link forms, vault detection). Scout's design makes slipbox the owner and the extraction a
scout-blocking prerequisite; it isn't in slipbox's plan yet.

## Where scout's design and slipbox disagree

Found while making the changes above, reported rather than conformed to; slipbox is the one with running code.

- **slipbox's index is a row per file, not per section.** Scout's design assumes sections are slipbox's retrieval
  unit. They aren't: matching is per file, deliberately, since a row per section made a query whose words sit in two
  sections of a note find nothing (`6.1`). Sections now place and cite a hit, which is all tier 2's dedupe needs.
- **The 80-line cut was only for data files.** Notes were already cut at headings, and still are, finer than the
  band, for where a hit opens: placed in band sections alone, a short note — merged into its root — opens at the
  first line with any of the words (`alpha beta` opened at a line with only `alpha`). Retrieval got measurably worse
  that way, so locating stays fine-grained and only the citation is the band's.
- **Block references don't differ from Obsidian's.** Scout's dialect table gives slipbox `^block` against Obsidian's
  `#^id`; slipbox reads `[[note#^id]]` as Obsidian writes it, and `[[note^id]]` too.
- **Reading positions and history aren't in the vault's files.** Scout's design has it index "whatever slipbox
  writes to disk — reading positions, history". They're in slipbox's state folder (`$XDG_STATE_HOME`, decision
  `0.10`: nothing personal or derived in the vault), which scout's walk of a collection never reaches. Persisting them
  where scout reads would take a decision first: a documented file in the vault (against `0.10`), or scout reading
  slipbox's state folder (a second format it would depend on).
- **The split rule, as written, can leave a heading on its own.** A node whose heading is followed by one unit over
  the band (a long fenced block) packs the heading first and flushes it as a piece before that unit; only a small
  *last* piece goes onto the one before. slipbox follows the rule as written (`Auth/Fenced/§:part` is the heading
  alone); scout may want a first piece under the band carried forward too.
- **A root with no text of its own is still indexed** — a note starting at its first heading — as an empty
  section. Harmless in slipbox (it's never a hit); scout may want to skip it.
