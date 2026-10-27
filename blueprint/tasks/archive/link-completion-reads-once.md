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

A link's completion (20.13) lists this vault's files and, for a markdown link, the other vaults' notes, read from each
vault's saved index (`linkItems` in `src/tui/documents/editing/completion.ts`). When what's typed matches nothing, the
completion closes, and the next key builds it again: `readRoots()`, every other vault's `index.json`, and each of their
notes' pointer, once per key. With hundreds of vaults known, each key takes hundreds of milliseconds. Keep the list for
the link being typed, matched or not, so the keys that match nothing cost the same however many vaults are known.

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

- 2026-10-23: The cause, in `src/tui/documents/editing/completion.ts`: `narrow` drops the state
  (`app.completion = null`) when nothing is shown, so the next key in the same link target finds no state and builds the
  list again with `linkItems`, which reads the registry (`readRoots()`) and, for a markdown link, every other vault's
  `index.json`, and works out each entry's link (`linkEnds`). Once per key while nothing matches. Wikilinks (`[[`,
  `![[`) rebuild the same way, from this vault's files alone; no other path rebuilds per key within one target.
- 2026-10-23: Reproduced in a test (`tests/tui.test.ts`, "a link's target that matches nothing keeps its list while
  typed"): with `fs.readFileSync` spied, `[x](tod` then `qqqq` read the other vault's index 4 times, once expected.
- 2026-10-23: Measured in the test harness, 454 other vaults of 4 notes each, all named and indexed (a benchmark not
  committed): opening the link (`](`) 839 ms; each key that matches nothing 807 ms (median); each key that matches
  8 ms. Of the build, reading the registry and the 454 indexes is 5 ms; `pointerAt`
  (`core/workspace/links/write-link.ts`, through
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
    never drawn, a capital whose lowercase is longer) holds the property: a query typed on from one matches only
    where that one did.
  - A key that still matched ranked every item of the list: at 10,000 other notes, about 110 ms a key. Taken into
    this change's scope, on the same property: each key ranks only what the last one matched (`typed`, `matched`),
    kept in the list's order, so that ties fall as ranking the whole list would; what's shown is the best 500
    (`RANKED` in `match.ts`), what's kept to narrow from is every match. Past a non-match that's nothing, so the
    shortcut above is this case. Tests: typing `t`, `o`, `d` ranks 3, then 3, then 1 items, each the last key's
    matches; past the match, `qQqq` ranks 1, then none; at each key a wikilink's list shows what ranking the whole
    list shows; with 600 notes matching `t`, `target.md`, not among the 500 shown, is found by `ta`. At 10,000 other
    notes (250 vaults of 40, the load 6 to 10), median per key, before this round and after: matching 109 ms and
    5.5 ms (the first keys after `](` still rank most of the list: 72 and 49 ms); matching nothing 88 ms and 2.5 ms.
  - The Log named its agreements and reviews as conversations; it says what was decided and found.
  Mutation-checked, each alone: ranking the whole list per key, narrowing from the shown rather than every match,
  kept across lines, kept only at the same start, the old `narrow`, no memo, a stack cut at 8: each fails a test.
  Ran the completion and matcher tests and the two terminal checks; tried live: `[x](READ` shows README, `zZ` past
  it nothing, two backspaces bring it back; up from another line's target into `[x](REA` shows that target's
  matches; `[x](in` shows a long list, `inbox` only `inbox.md`, three backspaces the list `in` showed. Rejected:
  - Raised again, as logged: the list dropped by accepting, `ctrl+e` or `ctrl+n` (one build per action; with no word
    found, `ctrl+n` drops the hidden list too: one build); a note made meanwhile not offered; `findVaultRoot` per
    note.
  - `inOrder` copies the array it sorts: an array of references, beside the sort and the build, not measurable.
  - A pointer item keeps its style in its data, beside the list's `links`: both set from one build, they can't
    differ, and accepting worked that way before.
- 2026-10-23: Reviewed again, the whole diff and the narrowing. Verified and fixed:
  - Two targets on one line shared a list: from `[a](zz` a jump (`end`, `ctrl+right`) straight into `[b](to` on the
    same line kept the first's. A target is kept now where its start is unchanged, or moved along its line with what
    follows it unchanged (an indent); a jump to another target changes what follows. Test: `end` from `[[zz` into
    `[[to` on its line builds a list of its own.
  - A backspace ranked the whole list again: only the last word's matches were kept. Each word typed is kept with its
    matches now, and a key ranks only those of the longest one it types on from; a backspace's is a word typed
    before. Test: four backspaces from `todqQqq` rank 0, 0, 0, then 1 items.
  Mutation-checked, each alone: only the last word kept, kept by line alone, kept by style alone, kept only at the same
  start, narrowed from the shown, ranking the whole list, the old `narrow`, no memo, a stack cut at 8: each fails a
  unit test. Rejected:
  - A language server's late answer can replace a link's list after `[` (a markdown server whose trigger characters
    hold it): the link list never cancelled a server's ask, before this change either; and it needs such a server.
  - Server lists narrowed the same way: a server's list can be partial and asked again; a change of its own.
  - Raised again, as logged: a note made meanwhile not offered; `findVaultRoot` per note; the memo's place and its
    root check; the named folders' 7 reads pinned; the extra passes of a ranking kept in order (the `Set` and the
    filter are O(n) beside the matching itself); the read count's spy keyed by `linkItems` (renamed, it fails, it
    doesn't pass).
- 2026-10-23: Terminal checks for every case, in `tests/terminal/checks/links-and-files.ts`, each run with
  `SLIPBOX_TERMINAL_JOBS=2`:
  - "links: a target's completion kept while it's typed": past a match nothing shows, tab indents, a backspace back
    to a match shows the list again after the indent; a wikilink's the same, and `]` closes it.
  - "links: a target's completion narrowed key by key": `in`, `inbox`, back to `in`; `SKILL`, `zZ`, back; with 600
    notes matching `t`, `[[tq` finds `tquokka`, ranked after the 500 shown.
  - "links: each target its own completion": photography indexed while a list is kept, up into another line's
    target offers its new note, `end` into another target on the same line likewise, and the next link too.
  - "links: another vault's note completed as its pointer": photography's pointer written; a name two folders share
    asked, then written; a private name said; `slipbox link` the same.
  Mutation-checked: narrowing from the shown, kept by line alone, kept by style alone: each fails its check.
- 2026-10-24: Reviewed again, the whole diff and the terminal checks. Verified and fixed:
  - A paste could keep another target's list: a paste doesn't run the completion's key step, and the next key there
    (`left`) found the same line and the same distance to its end, as `[a](foo` pasted with `x) [b](bar` has. A
    target is now known by its line's start and what's before it on the line, the indent aside: an indent changes
    only the indent, a paste or a jump what's before. Test: `[[zz`, `]] [[to` pasted, `left`: a list of its own. The
    line's start comes from `editing.ts`'s `lineStart`, not worked out again.
  - The CHANGELOG said a deleted key looks only among what matched too: only after a word typed in this list's life.
    The manual said other vaults' notes are as of their last indexing: as of when the link started. The design said
    the best 500 are shown: once a word is typed. Each reworded.
  - The terminal checks wrote notes of their own (walrus, seal, otter, a second handbook, a diary), where checks take
    their notes from the samples (design/testing.md): now the set's own vaults are indexed while a list is kept
    (cooking, cycling, the product's design and handbook), a shared name and a private one are given by `slipbox
    init` (and `git init`) to the set's cooking and cycling folders. The 600 notes matching `t` stay, the one
    exception: the reference set holds fewer files than a list shows.
  Mutation-checked, each alone: kept by line alone (same-line targets, a paste), indent not set aside, and the
  earlier eight: each fails a unit test; kept by line alone and kept by style alone each fail the terminal check of
  each target's own list (an indent rebuilding shows the same rows on screen: that case is the unit test's). Rejected:
  - Raised again, as logged: `findVaultRoot` per note; the ranking's extra passes; a list kept apart from the popup;
    `Reach`'s caches. New of the kind: `linkEnds` works out the note's own path per item, once per build: the build's
    cost, not a key's.
  - The link list's four fields grouped in one: cosmetic; `line` renamed `lineStart`, which it is.
- 2026-10-24: Reviewed again, the whole diff. Verified and fixed:
  - A list was kept wherever a target started at the same offset, its line and what's before it unchecked: after a
    reload (`:e!`, a conflict's reload) while a list is kept, another target at that offset reused it. Typing into a
    target never changes what's before it, so a target is known by its line's start and what's before it alone. Test:
    `a [[zz` with the `a` changed where it stands, then a key: a list of its own.
  - The manual and the design said other vaults' notes are as of when the list was made: this vault's are too, said.
  - The line's start came from `editing.ts`'s `lineStart`, which walks every line start per key, and its import
    shadowed `snippetContext`'s own: worked out as `snippetContext` and `linkTargetStart` do (a line's start is the
    same under CRLF).
  - The vault test pinned the named folders' 7 reads without a memo: now more than one, the point it makes.
  Mutation-checked, each alone: the same start kept whatever is before it, and the earlier ten: each fails a unit
  test; the three of the terminal checks still fail them. Ran the completion and matcher tests (29 pass), the pointer
  tests (23 pass), and the links terminal checks (5 pass). Rejected:
  - A language server's late answer after `[` (raised before): it predates this change, and a test of it needs a
    markdown server the terminal checks don't have; a follow-up of its own.
  - The list stale within one link, a note deleted meanwhile still offered: kept so, as logged; a deleted note was
    offered as long as anything matched before this change too.
  - A key that leaves the word as it was (an indent, a forward delete) ranks the last word's matches again: what a
    typed key costs; `Intl.Collator` for the sort once per list; the matches kept per word for the target's life
    (bounded by the word's length times the list); `findVaultRoot` per note; the ranking's passes; the list kept apart
    from the popup; the narrowing moved to `match.ts` (the property it counts on is tested beside the matcher's
    tests); the style twice: as logged.
- 2026-10-24: Reviewed again, the whole diff. Verified and fixed:
  - A paste while a list showed left the list as it was (a paste never ran the completion's key step), and the next
    `tab` or `enter` wrote the chosen item over what was pasted: `[[to`, `]] [[x` pasted, `tab` gave `[[./todo.md`;
    `[x](to`, `) and more` pasted, `tab` gave `[x](todo.md`. Older than this change, on its path; taken into its
    scope. A paste runs the key step now (`input.ts`): a link's list made for where it left the cursor, a word's or
    a server's closed. Tests: both pastes keep their text; the terminal check of the list kept
    while typed pastes `) and more` with `inbox` showing, and tab indents the line, the paste kept. Tried live: the
    list gone with the paste, `[x](inb) and more` kept, tab indented it.
  - The manual said a note made while typing is offered from the next link: it's offered by the next list, which
    `ctrl+e` or accepting also brings; now it says a note made after the list isn't in it. The CHANGELOG says so too,
    and has a line for the paste. The design says a paste closes the completion, and moves a link's on.
  - The ranking's spy counted every ranking in the app: only those under `narrow` now, as the reads only under
    `linkItems`, one helper reading the whole stack for both.
  - The kept list's `lineStart` and `before` were written again where they'd just been found equal: only `from` is.
  Mutation-checked, each alone: no key step after a paste, and the earlier eleven: each fails a unit test; no key step
  after a paste fails the terminal check too. Ran the completion, matcher and paste tests (38 pass), the other tests
  that paste (9 pass), and the terminal checks of links and pastes (8 pass). Rejected:
  - A language server's late answer after `[`: older than this change, untestable here; issue #48.
  - The design changed by a task, not a workstream: a fix's behaviour updates its design file in the same change; the
    narrowing and the pointer names were taken into this fix's scope.
  - Raised again, as logged: `findVaultRoot` per note; the matches kept per word; the list kept apart from the popup;
    the memo's place; `Reach`'s caches. A helper for a line's start, now written four times in the file: one
    expression, as the file has it.
- 2026-10-24: Reviewed again, the whole diff. Verified and fixed:
  - The paste's key step opened a list: pasted into a target whose list was closed (`ctrl+e`) or not showing, `enter`
    then took the best match over the paste, the new line lost (`[x](`, `ctrl+e`, `diagram` pasted, `enter`:
    `[x](attachments/diagram.png`). And `.` after a link completed and a line more replayed the accept's paste, which
    narrowed the list again, so the recorded `enter` accepted once more (the line lost; worse before this change, the
    whole list's first item). A paste now closes the completion and drops a pending ask, as a word ended does
    (`afterPaste`); the next key typed in a target makes its list again. That also keeps a paste from leaving a
    server's pending ask to answer over a link's list. Tests: `diagram` pasted into a closed target, `enter` a new
    line; `.` after `[[to`, `tab`, `enter`, `x` repeats it whole; the terminal check of the list kept while typed does
    both (`inbo` pasted, `[[inb`, `tab`, `enter`, `x`, `.`) and saves the note to read them.
  Mutation-checked, each alone: a paste leaving the popup as it was (as before this change), a paste running the key
  step (the last round's), and the earlier eleven: each fails a unit test; both pastes fail the terminal check too.
  Ran the completion, matcher and paste tests (41 pass), the pointer tests (23 pass), the terminal checks of links and
  pastes (8 pass). Tried live: `inbo` pasted into `[x](` after `ctrl+e` stays as pasted and `enter` is a new line;
  `[[inb`, `tab`, `enter`, `x`, `.` writes `[[inbox` and `x` twice. Rejected:
  - A paste doesn't run the snippet's key step either: older than this change, and a paste closing the completion
    claims nothing for snippets.
  - Raised again, as logged: the list kept apart from the popup; the ranking's passes; a key leaving the word as it was
    ranked again; `findVaultRoot` per note; the narrowing beside the matcher; the memo's root check.
