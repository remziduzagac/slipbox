---
status: done
assignee: claude-8
blocked_by: []
tracker: [gh:#8]
created: "2026-10-23"
---

# T11: A link's completion builds its list once per link

While a link's target is typed, its completion keeps the files it could reach, even while nothing matches, rather
than building the list again, and reading every known vault's index, on each key.

## Description

A link's completion (20.13) lists this vault's files and, for a markdown link, the other vaults' notes, read from
each vault's saved index (`linkItems` in `src/tui/completion.ts`). When what's typed matches nothing, the completion
closes, and the next key builds it again: `readRoots()`, every other vault's `index.json`, and each of their notes'
pointer, once per key. With hundreds of vaults known, each key takes hundreds of milliseconds. Keep the list for the
link being typed, matched or not, so the keys that match nothing cost the same however many vaults are known.

## Acceptance criteria

- A test: typing a link's target that matches no note reads the other vaults' indexes once, not once per key; it
  fails without the fix.
- The popup still shows again when a backspace brings back a match, and still closes when the link's target ends.
- The link completion's terminal check passes.

## Out of scope

- Keeping the other vaults' notes from one link to the next (a cache across completions).
- The other paths that read the named folders once per link (a rename's links, a pointer resolved).

## References

- Delivers: design/tui.md § What's under the cursor (a link's target, `20.13`).
- Rests on: `20.13`, `21.9`; requirements.md § Quality goals (fast at 5,000 notes).

## Log

- 2026-10-23: The cause, in `src/tui/completion.ts`: `narrow` drops the state (`app.completion = null`) when nothing
  is shown, so the next key in the same link target finds no state and builds the list again with `linkItems`, which
  reads the registry (`readRoots()`) and, for a markdown link, every other vault's `index.json`, and works out each
  entry's link (`linkEnds`). Once per key while nothing matches. Wikilinks (`[[`, `![[`) rebuild the same way, from
  this vault's files alone; no other path rebuilds per key within one target.
- 2026-10-23: Reproduced in a test (`tests/tui.test.ts`, "a link's target that matches nothing keeps its list while
  typed"): with `fs.readFileSync` spied, `[x](tod` then `qqqq` read the other vault's index 4 times, once expected.
- 2026-10-23: Measured in the test harness, 454 other vaults of 4 notes each, all named and indexed (a benchmark not
  committed): opening the link (`](`) 839 ms; each key that matches nothing 807 ms (median); each key that matches
  8 ms. Of the build, reading the registry and the 454 indexes is 5 ms; `pointerAt` (`core/write-link.ts`, through
  `linkEnds`) for the 1,816 other vaults' notes is 757 ms: per note it walks up to the vault's root, reads its
  identity, and `pointerNaming` reads the whole folders registry (`readFolders()`) again. So the cost per key is the
  build's, of which the indexes are a small part.
- 2026-10-23: Fixed: `narrow` keeps a link's list (`links`) with nothing shown rather than dropping it; a server's
  and the open files' words close as before. An empty list kept is safe: drawing (`draw.ts`) and the popup's keys
  (`completionKey`) need an item shown, so with none, tab, enter and the arrows act as with no popup; escape still
  ends it through `stopInsert`; ctrl+n replaces it with words. Keeping one list for one target is what already
  happened while something matched. The test extended: tab with nothing shown indents, as with no popup; a backspace
  back to a match shows it again with no read; the next link reads the indexes again and offers a note indexed since;
  a wikilink's list is the same state through no match and back, and ends with `]`. Mutation-checked: with the old
  line, 4 reads; restored, it passes. After the fix, at 454 vaults: a key that matches nothing 6 ms; opening the link
  still 914 ms (the build, once per link).
- 2026-10-23: The build made cheap too: `pointerAt` takes an optional `PointerMemo`, and `linkEnds` passes it on. Each
  folder's pointer name (whether it travels with the root, its identity, its clash with the machine's named folders) is
  worked out once per list, and the named folders read once; the pointer itself still per file. Test in
  `tests/vault.test.ts` ("pointers to many files from one root, with a memo"): the same pointers, names and warnings as
  one by one, for plain names, a name two folders share, a private name and a repository's qualified name; one folder's
  files share their naming, another folder has its own; the named folders read 7 times one by one, once with the memo.
  The TUI test also checks the named folders are read once for the list. Mutation-checked: without the folders kept, the
  unit test reads them twice; without the naming map's reuse, its files' namings differ; without the memo passed in
  `linkItems`, the TUI test reads them twice. At 454 vaults, `pointerAt` for the 1,816 notes: 748 ms one by one, 54 ms
  with the memo; opening the link (`](`) 914 ms → 85 ms; a key matching nothing 6 ms.
- 2026-10-23: Tried live: a scratch build of the reference home with 300 more vaults of four notes, its own config,
  state and cache. A first build inside this repository's checkout failed as a setup: `checkoutOf` walks up to `/`,
  so every vault there sat in the repository, travelled together and got relative paths, not pointers; rebuilt in a
  folder outside any repository. On `notes/index.md`, in source, per key until the screen showed it (the terminal
  driver's polling makes about 100 ms the floor): the release (0.4.1-preview) opened the link in 941 ms and took
  about 520 ms per key once nothing matched; this branch opened it in 417 ms and took 106–112 ms per key that matched
  nothing, the floor. Neighbours: past a match nothing shows; two backspaces back to `notes-on` and the popup is back;
  tab wrote `[x](slipbox://many0/notes-on-things.md`. `[[inb` showed inbox; `zzz` hid it; three backspaces brought
  it back; `]` closed it. The CLI's `slipbox link` (no memo) wrote `slipbox://many3/notes-on-things.md` and
  `slipbox://kestrel/README.md`, as before.
- 2026-10-23: Ran: the completion tests in `tests/tui.test.ts` (named for completion or completed, 25 pass), the
  pointer and link tests in `tests/vault.test.ts` (170 pass) and `tests/cli.test.ts` (`-t link`, 24 pass); the
  terminal check "links: written as each root writes them" passes.
- 2026-10-23: First review of the diff: no correctness bug. Taken: the memo's test didn't protect the per-folder
  reuse (dropping the naming map left it green), now covered as above; the manual's paragraph on completion
  (`docs/manual/links-and-vaults.md` § Writing links) says the list is made when the link starts and hides while
  nothing matches; the CHANGELOG says what got faster.
- 2026-10-23: Second review. Taken: a memo is bound to its root (`PointerMemo.root`), and `pointerAt` leaves another
  root's alone, since whether a folder travels with the root is that root's (tested: the folder nested in this root
  gets a pointer from another). The TUI test counts only the reads made while the list is built (`linkItems` on the
  stack): a frame's own (the backlinks' cache of the roots and named folders lasts a second, a pointer resolved) would
  make exact counts depend on the machine's speed. The CHANGELOG no longer says typing stops slowing down: opening a
  link still grows with the vaults (85 ms at 454 in the harness; 417 ms live at 300). Not taken:
  - The list can go stale within one link: a note made while the target is typed is offered from the next link. The
    issue asks to keep the list while typing; before, the list was kept while anything matched and built again only
    while nothing did, so its freshness was by accident. The design and the manual say when the list is made.
  - Accepting an item, ctrl+e or ctrl+n drops the list, and a key typed after in the same target (`#` after an
    accepted path) builds it again: one build for such a key, not one per key. A list kept apart from the popup would
    have to be dropped everywhere the popup is.
  - `app.completion` can now be set with nothing shown: what draws it or takes its keys checks for an item shown, and
    `:e!` and a discard run from normal mode, after `stopInsert` cleared it.
  - `findVaultRoot` per note: 8 ms of the 56 ms build at 454 vaults; the rest is each folder's naming, once.
  - The sort on each key: 0.2 ms for 1,816 items.
  - Reach's own caches of the roots and named folders: the list's memo lives for one list; sharing them is a change
    of its own.
  - The other loops that read the named folders once per link: out of scope, above.
- 2026-10-23: Done, in a pull request into `dev`; its merge is the maintainer's acceptance.
- 2026-10-23: A last review of the pull request: no correctness bug. Taken: the design said the list is kept until
  the target ends, but closing it (`ctrl+e`), accepting or `ctrl+n` drops it, and the next key in the target builds it
  again; `design/tui.md` says so now.
- 2026-10-23: The whole diff reviewed again, each point checked against the code. Verified and fixed:
  - Past a non-match, each key still copied and sorted the whole list and ranked every item: no read, but a cost
    that grows with the notes of every vault, where the issue asks for typing to cost the same however many vaults.
    Now a link's list is put in order once, when built; and a word typed on from one that matched nothing isn't
    ranked again: each word of a query matches whole (`match.ts`), so a longer one can't match where its start
    didn't. A word with a capital (matched as typed) is ranked as before. Test: over `qqqq` the ranking runs once
    (four times without). At 10,000 other notes (250 vaults of 40, the machine's load 10 to 14, so high), median
    per key: matching nothing 178 ms before, 9.5 ms after (the first such key still ranks once); matching, 190 ms
    before, 145 ms after. A key that matches still ranks every item, the matcher folding each item's text per key,
    as every filter does: that cost was there before this change, and making the matcher cheaper is a change of its
    own.
  - An edit before the target, an indent (tab while nothing shows), moved its start, and the list, kept by its
    start, was built again: the test's reads went from 1 to 2. The list is the note's and the style's alone, so it's
    kept by those now (`links` holds the style), its start moved along. Test: no read after the tab.
  - The test's stack check: Bun keeps 10 frames (`Error.stackTraceLimit`), and the named folders' read found
    `linkItems` at the ninth; a helper or two more between them would have lost the count, and the test failed with
    no regression. The spy takes the whole stack (checked: cut at 8 frames, the count is lost).
  - The CHANGELOG and the manual said the list is built once, when the link starts; accepting, `ctrl+e` or `ctrl+n`
    drops it and the next key in the target builds it again. Reworded: kept while you type.
  Mutation-checked, each alone: the old `narrow`, no memo, ranking past a non-match, kept only at the same start, a
  stack cut at 8: each fails the test. Ran: the completion tests (25 pass), the terminal checks of links written and
  of a server's completion. Tried live on the scratch home: past a match nothing shows, tab indents with nothing
  shown, two backspaces show the list again. Rejected:
  - A note made while the target is typed isn't offered until the next link: kept so, as logged above.
  - A build after accepting, `ctrl+e` or `ctrl+n`, at the next key in the target (`#` doesn't end a markdown
    target): one build per such action, not per key, as logged; a list kept apart from the popup is a larger change.
  - The named folders cached in `folders.ts` for every caller, or `Reach`'s caches used: the other loops are out of
    scope, and a cache across lists needs its own invalidation; the memo lives for one list.
  - `app.completion` set with nothing shown: every reader checks for an item shown, or clears it (as logged).
  - The vault test's 7 reads without a memo pin the slow path: they're what shows the memo matters; a cache of the
    named folders later would rightly change that test.
  - `findVaultRoot` per note and `checkoutOf` per folder: 8 ms of the 56 ms build at 454 vaults, as logged.
  - The memo's root checked when used, not bound by a factory: the same results; a memo of another root is ignored,
    giving the right pointers, only slower.
- 2026-10-23: Reviewed again, the whole diff and this round's change. Verified and fixed:
  - Kept by the note and the style alone, the list went with the cursor from one link's target straight into
    another's (an arrow up or down onto another line's), the first link's list offered for the second. Now kept by
    its line too: an indent doesn't move the line's start, another line's target gets its own list. Test: up from
    a wikilink's target onto another's builds a list of its own.
  - The shortcut past a non-match skipped words with a capital, needlessly: a capital only makes a word match as
    typed, stricter, so a word typed on from one that matched nothing can't match either way. A target like
    `](Meetings/zz` ranked every item per key. Dropped; a test of the matcher (capitals, more words, characters
    never drawn, a capital whose lowercase is longer) holds the property the shortcut counts on, and the completion's
    test types `qQqq` past the match: the ranking runs once.
  - The Log named its agreements and reviews as conversations; it says what was decided and found.
  Mutation-checked, each alone: the capital guard back, kept across lines, and the earlier five, each failing the
  test. Ran the completion and matcher tests (26 pass) and the two terminal checks; tried live: `[x](READ` shows
  README, `zZ` past it nothing, two backspaces bring it back; up from another line's target into `[x](REA` shows
  that target's matches. Rejected:
  - A key that still matches ranks every item; narrowing from the last key's matches would rank fewer. That cost was
    there before this change and is the matcher's, the same for every filter: a change of its own.
  - Raised again, as logged: the list dropped by accepting, `ctrl+e` or `ctrl+n` (one build per action; with no word
    found, `ctrl+n` drops the hidden list too: one build); a note made meanwhile not offered; `findVaultRoot` per
    note.
  - `inOrder` copies the array it sorts: an array of references, beside the sort and the build, not measurable.
  - A pointer item keeps its style in its data, beside the list's `links`: both set from one build, they can't
    differ, and accepting worked that way before.
