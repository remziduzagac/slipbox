---
status: current
created: "2026-10-11"
---

# Research: improving search

Where slipbox's search falls short, and what would improve it, cheapest first: an analysis the user brought on
2026-10-11, to look at later. Nothing here is decided. What it says of slipbox's search now was checked against the
code (*read*); its claims about other tools, models and numbers come from the analysis and are not checked here
(*summary*). It touches settled decisions: the index of slipbox's own (D114), a row per file rather than per section
(D115), and embeddings deferred with an outside engine (D124); read them before reopening any.

## Where it stands

From `src/core/search.ts` and `src/core/search-index.ts` (*read*, 2026-10-11):

- One row per file in SQLite FTS5, ranked by BM25 over weighted fields: title 10, aliases 8, tags 5, path 3,
  headings 4, text 1 (`WEIGHTS`).
- The tokenizer is `unicode61 remove_diacritics 2`: case and accents folded, no stemming.
- Every word must match; a query falls back to any word only when no file has them all.
- The section is found after ranking: a hit opens at the section with the most query words.
- Exhaustive matches come from find; the index catches up by each file's size and mtime.

## Where it falls short

1. **Word forms.** "running" doesn't find "run" unless you type `run*`. Turkish suffers most: "kitaplarımızdan" never
   matches "kitap".
2. **Meaning.** "car" doesn't find a note about an "automobile", and a question asked in other words misses.
3. **All words or nothing.** If any file has every word, files missing just one are never shown, however good.
4. **Ranking by file.** A long note with the words scattered can outrank a short note that is all about them.
5. **Links ignored.** A note 30 others link to ranks the same as an orphan.
6. **No typo help.** A misspelled word returns nothing.
7. **Code and data files.** Names like `parseQuery` aren't split, so "parse query" misses them.

## Improvements, cheapest first

1. **Rank partial matches instead of switching** (fixes 3). Always query any word, and rank files with more of the
   words higher. A few lines.
2. **Use links** (fixes 5). slipbox already has the backlink graph; either change is a few dozen lines:
   - an in-link boost: a note's score times `1 + w·log(1 + in-links)`, with a small `w` to tune;
   - one-hop expansion: the notes linked to or from the top few hits added at a fraction of their score, which
     surfaces notes about the topic that lack the exact words.
3. **Word forms** (fixes 1). For English, FTS5's built-in porter tokenizer; for Turkish, a Snowball stemmer, or
   matching on a word's first five letters. Either kept in a second column or table beside the exact words, so exact
   matches still rank first.
4. **Did you mean** (fixes 6). For a word that matches nothing, the nearest indexed words, from FTS5's vocabulary
   table and letter trigrams.
5. **Split identifiers** (fixes 7) in code and data files: `parseQuery` indexed as `parse query`, in an extra column.
6. **Rank by section** (fixes 4). The sections slipbox already cuts indexed as rows of their own, a file scored by
   its best section plus a little of the rest. It changes how the index is built: medium-sized, and against D115.
7. **Vectors, for meaning** (fixes 2): the biggest gain on notes, and the biggest cost.
   - Units: the sections slipbox already cuts are ready-made chunks.
   - Model: a small local embedding model with a permissive licence, such as Arctic Embed M v2.0 (Apache-2.0), on
     ONNX Runtime (*summary*).
   - Storage: a vector per section as a blob in `search.db`, keyed by a hash of the section's text, so an unchanged
     section is never embedded again.
   - Search: at notes' scale no vector index is needed; a plain scan of tens of thousands of vectors in memory takes
     milliseconds.
   - Fusion: the BM25 and vector rankings merged by reciprocal rank fusion (RRF), then sections rolled up to files.
   - Evidence: on obsidian-hybrid-search's own test vault, hybrid scored 0.736 nDCG@5 against BM25's 0.626; indicative
     only, as the queries were labelled by the tool's author (*summary*).
   - Costs and risks:
     - The model loads on every CLI call: each `slipbox search`, which is how agents use it, would load the model to
       embed the query, probably a second or more. The TUI can keep it loaded; for the CLI, accept the delay or keep
       the model warm in a small background process.
     - One compiled binary: ONNX Runtime's native addon may not embed in a `bun build --compile` binary with install
       scripts off (D201); its WASM build would, but runs slower. To check first.
     - The download and the first pass: a few hundred MB at first use, verified by hash; the first indexing takes
       minutes on the CPU, keyword search answering meanwhile.
     - Off by default: opt-in, so slipbox stays light for people who don't want a model.

## Order, and knowing it helped

1. Before changing anything, 30 to 50 real queries against the user's own notes, each with the notes expected; the
   current search scored on them (for one, how often the right note is in the top 5).
2. Improvements 1 and 2 first: hours of work, and they fix the most visible misses.
3. Then 3 and 4, if Turkish notes and typos matter, and 5 if code and data files do.
4. Then 6, then 7, only if the scores show keyword search still misses what's needed.
5. Re-scored after each change, and kept only if the score rises.
