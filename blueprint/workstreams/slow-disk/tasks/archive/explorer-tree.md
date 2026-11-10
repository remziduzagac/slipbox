---
status: done
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

## Open

What the description left open, settled here for the maintainer to confirm; design.md's section it delivers says how.

- One cache, kept once for each side: a folder listed on both (a nested vault's, unfolded in the vault open, and a path
  in it asked, which lists it as outside) is kept under two keys. Judged by the walk's filter on one side and not on
  the other, a single entry would have its settings differ at each ask and be read again every frame. The 256 count
  both.
- A folder of the vault open is listed with the walk's filter as the watcher judges a path (`list`'s `own`: the
  filter's settings and its epoch, the filter made once an epoch on each thread). Its settings changed — `files.hidden`,
  the walk's, `.gitignore`s after the watcher's batch — the answer's settings differ and it's read again, as an outside
  listing is when `files.hidden` changes.
- A folder not listed yet keeps the rows the walk gave (its notes and folders, which the graph has), not nothing as an
  outside folder does; `listing…` comes first under it, as the task says. A folder whose thread gave no answer keeps
  them too, `can't read: no answer in time` under it, read again a minute later.
- A row of the vault's own tree whose folder's listing hasn't come is unmarked until it comes: nothing read here for
  it, its marks drawn once the tree is built again from the listing. A nested vault's row is drawn by its folder's
  name meanwhile, as the acceptance criteria ask.
- A folder a link the walk followed leads to is listed for its rows' marks alone: what the walk gave there stays what's
  shown (VV-D6), nothing found in it by the listing.
- Whether a path is left out, while its folder's listing is read, is judged by its name alone (git's and slipbox's
  own folders, a hidden name, `walk.exclude`): a busy or ignored folder is taken as the vault's own until its listing
  answers, which places its row (the acceptance criteria's "placed once its listing answers").
- The view's and the trail's stat: of them and of every folder above them, in one request, one out at a time; an
  answer of a view or trail moved since, or after quitting, is dropped and the next build asks again. No answer (its
  deadline): the view stays, asked again at the next build.
- `l` on a folder whose listing has come takes its listing's word (`unreadable`), no read; on a note, none. Otherwise
  it asks `access` as a key's own read, as a zoom does. `shift+h` hiding the view's hidden folder waits for its zoom.
- The start asks its folder through the same read (`KeyReads.folder`), here at once until SD-T10 moves the start off
  the screen's thread (`reads.here`). The zoom it then makes doesn't ask again (`zoomTo`'s `checked`).
- Elsewhere's top: it was listed by `Listings` already (`outsideRows`); the branch of `rootTree` that read it here
  (`readdirSync`) was never reached and is gone. The vault open's own row above the view, outside it, takes its
  listed entry and its name from that listing.
- Left on the screen's thread, not in the description: the status line's words for a busy folder selected
  (`Marks.leftOutWords` → `filter.busyWhy`, a folder's note looked for), the same words for a row outside the vault
  inside a busy folder, and the breadcrumb's `isVaultRoot`, remembered per folder. The filter's rows (`/`) carry no
  listing, so a row there isn't marked until SD-T11's look at what's drawn. A test's App reads them here, as before.
- `marks.ts`'s vault index check reads `indexKept` (`listing.ts`), the listing's own: one place says where an index
  is kept.
- `walk-thread.test.ts`'s equality test builds the tree with its folders listed on the disk threads and here, and
  compares the rows and their marks; on the here side, each row's marks from its listing equal those `factsOf` reads
  from the disk for the same row with no listing. Off the thread, a row with no listing reads nothing, so that half is
  asked here alone.

## References

- Delivers: design.md § MODIFIED design/tui.md § Side panes.
- Rests on: SD-D3, SD-D4, SD-D5; VV-D5, VV-D8, VV-D9; T12's listings.
