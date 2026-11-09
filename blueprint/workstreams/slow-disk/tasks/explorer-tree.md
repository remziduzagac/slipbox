---
status: todo
assignee: ""
blocked_by: [SD-T3, SD-T4, SD-T5]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T7: The explorer's own tree of the vault open, listed and marked off the screen's thread

SD-D3, SD-D4, SD-D5.

## Description

- `fromDisk` (`src/tui/workspace/explorer/explorer-disk.ts:42`) takes the view's folder and each unfolded under it
  from `Listings` (`src/tui/workspace/explorer/listings.ts`), as `outsideRows` takes the folders outside the vault:
  kept, read again once a second old, an answer drawn only when its digest changed, `listing…` after 150 ms.
- A folder of the vault open is listed with the walk's filter (its `FilterSettings`, as the walk's thread is given
  them): each entry's verdict (`exclusion`: busy folder, `.gitignore`, `walk.exclude`, hidden, a nested vault) made
  there, `holdsNotes` and the `.gitignore`s read there.
- `Marks.factsOf` (`src/tui/workspace/explorer/marks.ts:290`) uses `listedFacts` for every row a listing gave; the
  listing carries what the marks read today: a note's size for `over walk.max_file_size`, whether a vault's index is
  in the cache folder, its branch, a broken link.
- `Navigation.keepToWhatsThere` (`navigation.ts:214`) asks a `stat` of the view and the trail as the tree is built,
  one out at a time; the view gives way when the answer says its folder's gone, and only while the view is the one
  asked about.
- The nested vaults' names (`rows/tree.ts:177` → `rootRows` → `Paths.rootName` → `vaultName`,
  `src/core/workspace/walk/listing.ts:83`) come with the listing that found them; in Elsewhere, its top is listed by
  `Listings` too (`tree.ts:49`).
- Whether a row is left out (`Paths.leftOut`, `src/tui/workspace/explorer/rows/paths.ts:55`: a `stat`, `:69`, and the
  filter's verdict on each folder on its way) comes from the listings the tree is built of, for each row's path
  (`rowPath`, `:38`) and the tree's top (`leftOutAt`, `tree.ts:27`).
- A zoom (`zoomTo`, `navigation.ts:88`), `l` on a folder (`actions/items.ts:279`) and slipbox opened on a folder
  (`startup.ts:69`) ask `access` as a key's own read (SD-D4): `can't read …` said as now, once it answers.

## Acceptance criteria

- Held: a folder of the vault under `held` unfolded — `listing…` after a moment, a key handled and drawn meanwhile;
  let go, its rows, with what the walk leaves out listed by its path and its reason, as on the screen's thread.
- The rows and their marks from a listing equal those `fromDisk` and `factsOf` give here, for every case
  `tests/tui/workspace/explorer/walk-thread.test.ts`'s "the rows and their marks are the ones the listing here gives"
  covers, and for the vault's own: a busy folder with and without a note, an ignored file, `walk.exclude`, a note too
  big, a nested vault's index and branch.
- Held: a nested vault under `held` with a name of its own — its row drawn by its folder's name, a key handled
  meanwhile; let go, by its name. A row under `held` that the walk leaves out is placed once its listing answers.
- Held: the view's folder deleted while its stat is out — the view stays until the answer, then gives way, said.
- Held: `z` on a folder under `held` — the key waits, a frame drawn; `esc` gives it up and the view stays.
- Mutation: `fromDisk` reading here again, the first test fails (checked once).
- `CHECKS_FOR` (`scripts/ci-scope.ts`) names the terminal checks this task's files reach; before its pull request
  merges, they run locally, listed for approval first, with its unit tests (SD-D14).

## Terminal check

`slow disk: a folder of the vault open listed slowly — listing… under it, every key answered meanwhile, then its rows
and their marks`.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D12):

- The vault's own folders kept in the same `Listings` as those outside it, 256 at most between them, the folder shown
  longest ago let go of first, whichever side it's on: one cache, one limit.

## References

- Delivers: design.md § MODIFIED design/tui.md § Side panes.
- Rests on: SD-D3, SD-D4, SD-D5; VV-D5, VV-D8, VV-D9; T12's listings.
