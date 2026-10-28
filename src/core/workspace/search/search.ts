// Searching the vault (6.x): ranked by words — the index when it's there and current (SQLite FTS5,
// `search-index.ts`), else a scan of the files with the same query and a BM25-like score, so a
// search always answers. (`find` stays the other tool: every match of a literal or a regex.)
//
// A search's words are a note's: every word somewhere in it (else, said so, some of them). The
// hit opens at the section with most of them — its first line with one — and shows that line.
// A note is read for search by a quick pass over its lines, not the markdown parser: frontmatter,
// headings outside code, tags and its text as written — the tokenizer skips the markup, and a
// vault of thousands of notes indexes in seconds.

export type { DocLine, DocSection, Doc, QueryTerm, SearchQuery, SearchHit, SearchResult } from "./model/contracts.ts";
export { BAND_MIN, BAND_MAX } from "./model/sections.ts";
export { indexDoc } from "./model/document.ts";
export { searchable, indexFile, IndexJob, catchUp } from "./indexing/files.ts";
export { parseQuery, ftsMatch } from "./query/parsing.ts";
export { search } from "./execution/search.ts";
export { SearchIndex } from "./search-index.ts";
