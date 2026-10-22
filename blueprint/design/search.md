# Search

How slipbox ranks a vault's notes and data files by words (plans `6.1`–`6.12`): in the core, so the CLI and the TUI
share it (D114). The query and the results as the user meets them are [cli.md](../../docs/manual/cli.md) § `search`; the
TUI's list is [tui.md](tui.md) § Overlays; which vaults a search covers is [roots.md](roots.md) § Search scope (D64,
D79). Code: `core/search.ts` (the query, a file read for it, the index kept, the index or a scan, hits located),
`core/search-index.ts` (the index), `core/sqlite.ts`, `core/scope.ts` (search by vault).

## The index and the scan

An SQLite FTS5 index in the vault's cache (`search.db`, [how-it-works.md](how-it-works.md) § Storage), ranked by BM25
with the title weighing most (D114). Its columns are a file's title, aliases, tags, path, headings and text, weighted
10, 8, 5, 3, 4 and 1; its tokenizer is `unicode61` with diacritics removed, so case and accents don't count. While
there's none, a scan of the files answers the same query over the same fields with a BM25-like score (each word's
rarity across the files, times its count in each field, weighted alike), so a search always answers (D114). When no
file has every word, the files with some of them answer, and the result says it was relaxed.

The query is deliberately small: words, phrases, prefixes, exclusions, `title:`, tags and folders (D114). None of it
reaches FTS5 as syntax: every term is quoted. `[search] engine` chooses: `auto`, the index once it has been built
whole, else the scan; `index`, the index, built first when there's none; `scan`, never an index. Home keeps one as
any vault does, over what its index holds (VV-D2). Elsewhere has no index and no search: the TUI says so
(`Elsewhere has no index to search — …`), and `slipbox search` exits 5 (`Elsewhere has no index, so no search across
it: …`; `needsIndex` in `cli/common.ts`) (VV-D3).

The index is a cache (D39): one of another version, or one SQLite can't read, is deleted and made again, and one that
can't be made (a read-only cache) leaves the scan. It asks of SQLite only FTS5 with `unicode61`, `bm25`, WAL and a
busy timeout. That SQLite is the runtime's own, `node:sqlite` (D196); which it is on each platform, and the few calls
`core/sqlite.ts` makes of it, are [distribution.md](distribution.md) § SQLite.

## A row per file

The index holds a row per file, not per section: a search's words are a note's, wherever in it (D115).

## Reading a file

A file is read for the index by a quick pass over its lines, not by the markdown parser (D117): its frontmatter (its
`title`, `aliases` and `tags`; YAML's `---` or TOML's `+++`, not past 64 KB), its headings outside fenced code (ATX,
and setext under a paragraph's line), the `#tags` in its text, and the text as written. A note's title is its
frontmatter's `title`, else its first top-level heading, else its file's name. The tokenizer skips the markup. A data
file is its text alone, titled by its file's name.

## Sections

Sections are scout's (D116). A file's containment tree has a root (`§:file`: the frontmatter and what comes before
the first heading), and each heading owns what follows it to the next heading as high, never cut in fenced code. The
tree is cut to a size band on each node's own tokens (bytes / 4, its text without its sub-sections'):

- from 400 to 1,500, a node is kept;
- over, it is split at paragraphs into `§:part` pieces: a fenced block is one unit, never cut, and a piece over the
  band on its own is kept whole and marked oversized; a last piece under 400 goes onto the one before;
- under, it is merged into its parent, bottom-up, the parent then tested carrying it.

The root is always kept, split into parts only when it is over. A data file, with no headings, is one section or
band-sized `§:chunk`s at blank lines. Names are scout's (`Auth/How auth works`, `§:part~2`; `%`, `~`, `/`, `#`
encoded; a repeated name `~2` by `normKey`). So a hit carries the section it's in, its name and line range, as scout
would cite it.

## Where a hit opens

A hit opens at the section with most of the words, found finer than the band: among each heading's own text, uncut
(a data file's, each paragraph) (D115). It opens on the first line there with one of the words, and that line is its
snippet, cut to about 120 characters around its first match, the words marked; it counts the file's other such texts
with some of the words. A file matched by filters alone (tags, folders) opens at its top. The matching itself is a row
per file.

## Kept current

Two ways (D118). Each catch-up compares every file's size and mtime with the index's, whoever changed it: the CLI
catches up before each search, the TUI as the vault opens ([tui.md](tui.md) § Overlays). And whatever changes a file
through slipbox, or is seen by its watcher, reaches the graph, which says so to its listeners (`onChange`): the TUI's
index updates a file as it changes, and an outside engine will hear of the same changes, moves included.

## Another engine

A fuller engine (semantic search, the graph) would sit behind the same API, slipbox's own the fallback (D114). It is
trailscout's SDK, once that exists; until then slipbox's search is the only engine (D124).

## Find

`find` is the other tool: every match of a literal or a regex, unranked (D119).
