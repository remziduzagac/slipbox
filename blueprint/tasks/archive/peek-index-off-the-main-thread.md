---
status: done
assignee: claude-10
blocked_by: []
tracker: [gh:#10]
created: "2026-10-23"
---

# T13: The peek's backlinks are worked out off the main thread, and kept fresh

A peek into another vault shows the note at once and its backlinks when they're ready, worked out on a thread of their
own, and a later peek shows them as that vault is now.

## Description

The first peek into another vault holds the keys while that vault is read: `vaultGraph` (`tui/peek.ts`) opens its
graph through `Reach.graphAt` on the main thread, and `withBacklinks` asks it for the note's backlinks there, which
parses every note changed since its index, resolves every link in it, and reads the other vaults' indexes. The graph is
`thorough`, so a layout of the peeked note with a link by a name it doesn't find parses the whole vault too. Then the
graph is kept (`Reach.graphs`) and its backlinks worked out once, so a later peek shows them as they were, whatever
changed in that vault since.

## Acceptance criteria

- A peek into a vault whose index is out of date shows the note without parsing that vault's notes on the main thread;
  its backlinks follow, worked out on a worker thread, and are drawn when they come (a test).
- A later peek, after a note of that vault changed to link the peeked one, lists that backlink (a test that fails
  without the fix).
- A vault with no index here gets one built for the peek, on the thread, and the backlinks shown when it's done (D259).
- A layout of a peeked note never parses its vault's notes on the main thread.
- The worker is an entry point of the build (D232), and the terminal checks of the peek pass.
- design/tui.md § The peek says how backlinks come, and its "Not done" loses what's done; the user docs and the
  CHANGELOG where users see it.

## Out of scope

- Watching another vault while a peek shows it (the maintainer's choice: fresh at each peek).
- Home with no index here: the peek still says so and builds none; home's is the background index's (VV-D2).
- Opening the vault's graph on the main thread, for the peek's links (its walk and its index read): it stays there.

## References

- Delivers: design/tui.md § The peek (Backlinks; Not done).
- Rests on: VV-D7; D232 (each worker an entry point of the build); 17.11 (other vaults' links as backlinks).

## Log

- 2026-10-23: Measured with a probe (`tmp/issue/probe/measure.ts`, not committed): vault B of 5,000 notes, 40 links
  each, a third of them changed since its index. On the main thread, `graphAt` took 140 ms (walk 20 ms, reading its
  65 MB index 141 ms) and the first `backlinks` 2.8 s (parsing the 1,667 changed notes, then resolving every link);
  with the index fresh, 160 ms and 200 ms. A structured clone of the index's entries took 259 ms, more than reading it
  from disk: sending a vault's whole graph between threads saves nothing.
- 2026-10-23: `tests/peek-backlinks.test.ts` fails on dev: a second peek at app's `design.md`, after `plan.md` came to
  link it and `links.md` stopped, still lists `links.md:1` and not `plan.md`. The graph is kept in `Reach.graphs` and
  its `backlinkCache` built once; nothing watches that vault.
- 2026-10-23: Codex challenged the cause and the plan (its answer kept in the worktree's `tmp/issue/`). The cause holds;
  it added: `Reach.discover` (reached through `inbound`) indexes a nested vault with none, and records roots in the
  registry, a read-modify-write a worker mustn't race the main thread on; `atomicWrite` names its temporary file by
  process and millisecond, which two threads writing one file can share; an index's mtime misses a change to a vault's
  files that writes no index (an attachment added) or an index that couldn't be written; a fresh worker has no
  grammars loaded, so code comments' backlinks need `loadGrammars` first; `thorough` is better a policy of the TUI's
  `Reach` than a flag flipped on one shared graph; cancelling a running request terminates the worker and loses its
  parse, so requests are coalesced instead. All taken into the plan.
- 2026-10-23: The maintainer agreed: the lazy open stays on the main thread (still under "Not done"); fresh at each
  peek, no watching; and a vault with no index here gets one built by the peek, on the thread (D259). Home is left out
  of that: its index is built in slices while nobody works (VV-D2), so a peek into home without one still says so.
- 2026-10-23: Built. `core/backlinks-jobs.ts` and `core/backlinks-worker.ts` (an entry point of the build, D232): the
  vault opened afresh on the thread, caught up or built, its index written, grammars loaded, a note's backlinks as
  rows, and a signature of its walk (notes with mtimes and sizes, other files, folders, nested vaults). One request
  runs at a time, never cancelled; a peek's newest waits, an older one answered null; a kept tab's refreshes wait
  apart, so they never displace a peek's. `Reach` takes `{ thorough, record }`: the TUI's are not thorough; the
  thread's records nothing, but knows the roots it discovers. The peek's graph records its nested and enclosing roots
  on the main thread (`discover(g, { index: false })`). An answer whose signature differs from the main thread's graph,
  or a graph with notes not parsed, rebuilds it in place from the fresh index, its roots discovered again, and lays out
  every view reading through it again; if the index couldn't be written, its notes are parsed on the main thread a
  slice at a time. `atomicWrite`'s temporary file is named by thread and a counter too.
- 2026-10-23: Codex's second review: a tab's refresh displacing a peek's request (already apart, now tested); a failed
  index write leaving the rebuilt graph's notes unparsed (the slice parse); discovery not redone after a rebuild
  (`reachFrom` again). All taken.
- 2026-10-23: A test caught a bug of mine: an answer the client refused threw inside its fulfilment handler, so the
  caller's promise never settled. Fixed by checking the answer in a `then` of its own.
- 2026-10-23: `tests/peek-backlinks.test.ts`, 13 tests. Mutation-checked (`tmp/issue/mut/run.py`), each part undone
  alone, each caught: answers kept per note (3 fail), backlinks on the main thread (9), the TUI's Reach thorough (1),
  no walk signature (3), no grammars on the thread (1), no peek identity (1), no index built (1), the temporary name by
  process and millisecond (1), `graphAt` recording anyway (1), found roots unknown (1), no slice parse (1), a tab's
  request displacing a peek's (1), no discovery after a rebuild (1). The peek tests in `tests/tui.test.ts` (18) wait
  for the answer and pass.
- 2026-10-23: Terminal checks of the peek (`bun run test:terminal peek "nested roots" "roots: a path into another
  root" "roots: where a file is"`, two at a time): 9 pass. One needed changing for D259: kestrel, with no index here,
  had said so; its peek now builds kestrel's index and lists 31 backlinks, notes' among them. Both of its steps press
  `G`, wait for the list, and press `G` again: pressed before the list came, `G` lands at the end of the line saying
  it's coming, which the list then follows.
- 2026-10-23: Tried live, this worktree's slipbox on a scratch copy of the reference set (`tmp/issue/home`, its own
  state) with a vault of 5,000 notes added in home (`big`, 40 links each). No index: the peek showed the note at once
  and `~/big has no index here yet — building it; they're shown when it's done.`; `k` and `z` answered within 0.4 s
  while it built; 38 backlinks came after about 8 s. A third of its notes then changed to link `n0.md`: the next peek
  said `reading ~/big's index…`, keys answered, and 1,704 backlinks came. With the index fresh, a peek's backlinks
  came 646 ms after the key with the thread running, 655 ms after it had stopped for idleness. On the thread, for
  `big`: the open 187 ms, the backlinks 225 ms. Quitting while it built (the parse cache cleared, so the build was
  long): slipbox exited 75 ms after `:q`, no index written. The CLI's `slipbox backlinks` in kestrel and in `big`
  answers as before.
- 2026-10-23: Codex reviewed the diff (8d624cc): a tab of a vault without an index, back with the session, never had
  its notes parsed now that the TUI's reached graphs aren't thorough, so a link by an alias in it stayed unresolved;
  and the parse here when the index can't be written parsed a big note whole on the main thread (`parseSome` checks
  its budget only between notes). Both fixed: every tab of another vault's file asks the thread to catch its vault
  up, its index built if it has none; the parse here is the vault's own background index's, `parseInSlices`, taken
  out of `Watch.indexInBackground` (a big note's chunks on the parse threads). Tests for both, mutation-checked: the
  old parse here (a big note parsed whole, 1 fails), tabs caught up only when indexed (1 fails). The parse-thread
  tests (8) and the TUI's indexing tests (43) pass with the loop taken out.
- 2026-10-23: Tried live: kestrel's peek kept as a tab (`t`), slipbox quit, kestrel's index deleted, slipbox started
  again on notes: the tab came back with the session (`tab 2/2`, `kestrel: docs/architecture.md`), and kestrel's index
  was built again on the thread within the first seconds. (Started with a file named, slipbox opens that file alone
  and saves that session: the tab came back only once started on the folder.)
- 2026-10-23: The code-review skill's agents reviewed 1a797a4: 15 findings. Taken, each with a test, mutation-checked
  (each fails with its part undone): the thread probes the links its vault follows before its walk, as the CLI does
  (`probeFollowed`), and the main thread too before opening the graph again — without it the thread's walk left out
  the folders behind them and wrote the index without them, and the two threads' walks never agreed; the answer
  brings the settings' signature, and a graph read with other settings is opened anew (`Reach.forget`), not rebuilt
  with its old ones forever; `ctrl+o` back to a row of the list puts the cursor there once the list has come, unless a
  key moved it; a rebuild that fails keeps the rows; a link in another vault's index without a line is left out on the
  thread, its text defaulted, rather than the whole answer refused; a tab's catch-up gives way to a peek's request (its
  thread let go, run again after, its parses kept in the parse cache); a new environment starts a new thread (a test's
  sandbox); a tab asks for its catch-up only once its buffer is kept; going into another vault stops the thread, and
  `noteIndexed` no longer waits on the vault not having changed; the temporary file's name drops the millisecond, so
  it's no longer than it was (a note named near the 255-byte limit); the answer's unused `built` is gone.
- 2026-10-23: Not taken: numbering the decision before merge (it's numbered then); a tab of home's file, home without an
  index, stays with home's names until home is indexed and peeked (design/tui.md § The peek, Not done: parsing home
  whole here is what the background index is for, VV-D2); each peek's thread reads every other vault's index again (a
  cache across peeks, Not done: on the reference set's machine list, 14 ms); the export worker's `Reach` recording
  roots from its own thread is older than this change, for its own issue.
- 2026-10-23: `tsc` reports no type errors once any file it reads has syntax errors, and the scratch reference set in
  `tmp/issue/home` has some on purpose: typechecks after it was built (20:08) were checked again with `tmp/` left out
  (`tmp/issue/tsconfig.check.json`): one error, an import, fixed.
- 2026-10-23: After the review round: `tests/peek-backlinks.test.ts` 23 pass, 26 mutations each caught
  (`tmp/issue/mut/run.py`); the parse-thread tests 8, the TUI's peek, vault, index and rename tests 124, the vault
  tests 229 and the build list's 2 pass; the peek's terminal checks 9 of 9. The typecheck (with `tmp/` left out), the
  lint, the boundary, the sizes and `check:docs` pass. Done; the pull request into `dev` is a draft, its merge the
  maintainer's acceptance.
- 2026-10-23: The maintainer asked for a second review with Codex of what it hadn't seen (1a797a4, c010ade). Its
  findings: two catch-ups of one vault could overlap across the probe's await, each opening anew the same old graph, the
  second leaving the buffers on a graph `Reach` no longer held (real); a graph let go of went on being parsed here, and
  could write its old snapshot over the new index (possible). Fixed: a vault's catch-ups run one after another
  (`catching`), each against the graph there by then; a graph opened anew is retired, its parse here stopped. Nothing
  found in the client's queue, the settings' signature, `parseInSlices` or the temporary names. Tests for both (a probe
  held back, `peekProbe`), mutation-checked: catch-ups at once (1 fails), a catch-up reading the graph it was asked for
  (1), a retired graph's parse going on (1).
- 2026-10-23: The maintainer's review loop, round 1, at 21b3063: the code-review skill's agents and Codex, apart.
  Codex found nothing new; the agents, 15. Consolidated (none shared) and checked against the code, each:
  1. `atomicWrite`'s temporary file: verified — opened with `w`, it would write through anything already at its name,
     and its name was easy to know. Now made exclusively (`wx`), another name taken when one is, a random part in it,
     as the export's spool names its own; no longer than it was. Test: a file at the first name, untouched.
  2. A rename that gives this TUI a new reach (a vault made or unmade): verified — kept tabs stayed on the old reach's
     graphs, caught up no more, and a peek open meanwhile stayed `reading…` (its rows dropped for the reach). Now
     `reachedAgain` gives every buffer the new reach's graph, and rows show for the same peek whatever the reach.
  3. A catch-up for any buffer of another vault's file: verified (a language server's edit reads one). Now asked when
     one is shown in a view (`makeView`), not when it's read.
  4. Duplicate catch-ups of one vault: verified. Now a catch-up asked while one of that vault runs or waits, or a
     peek's request of it does, is answered at once with nothing; a peek's request drops a waiting one of its vault,
     and takes back a running one for good. Its test found another: a request answered was still `running` until its
     `finally`, so a peek coming in that moment took it back and ran it again — fixed, cleared as it settles.
  5. The mailbox's 16 MB answer cap: verified (a note with tens of thousands of backlinks). Now none.
  6. An answer with no rows for a note's request: verified — `null` reached `withBacklinks`, which threw, unheard.
     Now refused as no answer, said `not worked out`; `readBacklinks` never rejects.
  7. The roots found again at every rebuild: verified (each recorded, the list read and written). Now only when the
     vaults nested in it changed.
  8. The TUI's reached graphs, no longer thorough, never caught up: verified for `[[name:note]]`, a pointer's
     suggestion, embeds — a name only a note changed since its index declares wasn't found. Now `tuiReach`'s `opened`
     asks a catch-up for a graph it opens whose index lacks some notes; every view is laid out again after.
  9. The cursor put back by `lastInputAt`: verified (a key typed ahead, or in the same millisecond, would be undone).
     Replaced: a place keeps the list it showed, shown again at once when it's back, so no cursor is put back.
  10. The index unwritable, each answer rebuilding the graph and its slice parse starting again: verified. Now no
     rebuild while it's parsed here.
  11. Rows waiting on the main thread's catch-up (its probe, its rebuild): verified. Now the rows show first.
  12. `wrote` by the index's mtime: verified (a coarse clock; another's write). Now the graph's own `writtenAt`.
  13. The walk's signature worked out at every answer: verified, a cost. Now kept by the graph's generation.
  14. A tab's catch-up never discovering nested vaults, the comments saying it did: verified. The comments fixed (only
     a note's backlinks discover them).
  15. The environment compared at every request: rejected. The mailbox is disposed only when nothing is in it (a new
     request takes its channel only once the one before has left it), so no request is answered null by it; and a
     `JSON.stringify` of the environment per request costs nothing next to the request. Kept: the thread must read
     where the cache is now, as the export's does.
  Tests for 1–12 (`tests/peek-backlinks.test.ts`, 35), each mutation-checked: 16 mutations, each caught.
- 2026-10-23: Round 1's fixes tested: `tests/peek-backlinks.test.ts` 35, the TUI's peek, vault, index, rename and tab
  tests 181, the vault tests 229, the core's write tests 13, the parse threads' 8, the build list's 2; the peek's
  terminal checks 9 of 9 (all niced, the machine loaded). Live on the scratch set: kestrel's architecture note peeked,
  a row of its list followed into `mkdocs.yml`, `ctrl+o` — the list there at once, 0.1 s after the key, the cursor on
  its row (L91); 26 backlinks, as the CLI's `backlinks` lists (notes' links don't count there: the scratch set is in a
  linked git worktree, so notes reads as a worktree's copy, 17.19). A note written by the CLI and one saved in the TUI,
  each through the new temporary file, none left behind.
- 2026-10-23: Review loop, round 2, at 193572a: Codex 1 finding, the code-review skill's agents 13; none shared.
  - Codex: after a rename's new reach, its graph's catch-up was answered null for a request of the old reach still
    running, whose answer `catchUp` then dropped (another reach): verified. Now a catch-up applies to the graph held
    for that vault now (`Reach.held`, never opening one), whatever reach asked; `reachedAgain` asks each its catch-up.
  - 1, a tab's catch-up dropped for a peek's request of its vault that a newer peek then answered null: verified.
    Now it rides on the request of its vault that runs or starts, answered with its answer, waiting again if that one
    is taken back. Its test found the dedupe resolving a request after a stop as moved on: a stop is told apart now.
  - 2, a link by name into a vault with no index here, never resolved since the reach isn't thorough: verified; the
    maintainer chose to build its index on the thread (D259 extended), a third vault a peeked vault reaches too, not one
    taken from the machine's list.
  - 3, moves the thread found unknown to the graph here, whose cached redirects would later overwrite them: verified
    (`Redirects.add` writes its copy). The redirects read again at a rebuild (`forgetRedirects`).
  - 4, a thread let go of mid-write leaving the index's temporary file: verified. Swept before the thread writes the
    index, once older than five minutes; `o` throwing away a build is kept (the parse cache keeps its parses).
  - 5, home with an index of another version built here whole: verified. An index that gave nothing counts as none.
  - 6, a reopen that fails leaving buffers without a graph: rejected as unreachable — `graphAt` gives a graph for a
    vault whose marker, folder or both are gone, or now a file (a probe); `Reach.reopen` keeps the old one all the same.
  - 7, a peek's request never taken back, a closed peek's long build holding later peeks: verified. Now taken back for
    a newer peek's of another vault, its vault's catch-up asked again.
  - 8, a first peek starting a thread twice (the `opened` hook's catch-up, then the peek's taking it back): verified.
    The hook asks once what opened it is done, riding on the peek's request.
  - 9, a catch-up at every view: verified. Once, with a buffer's first view.
  - 10, the whole config signed, a theme reopening every graph: verified. The walk's alone, what the graph reads.
  - 11, every view laid out again after a catch-up: real, kept (catch-ups are rare; a name may resolve in any note);
    the app's `relayoutAll` used, not a copy of it.
  - 12, the nested vaults' filter written three times: `Graph.nestedRoots` used.
  - 13, the decision's number a placeholder: rejected — it's numbered at merge.
  Unit tests for each verified one, mutation-checked: 15 more mutations (M45–M61), each caught; 49 tests in the file.
- 2026-10-24: The maintainer asked for a terminal check of every case beside its unit test, the live tries' among them:
  `tests/terminal/checks/peek-backlinks.ts`, 16 checks on the reference set (the list, a code comment's and a data
  file's backlinks, a note and a nested vault come since; `ctrl+o` back to a row, a key after it kept; kestrel's walk
  changed in its settings; home without an index, and with another version's; a kept tab back with the session, its
  index built again; a name kestrel declares, found once kestrel is built — the old form's suggestion naming its note
  (`[[kestrel:Far Name]]` is no link, 21.11); kestrel's index unwritable; a move the thread found, said on the old link;
  a file come since; a followed link's folder; another slipbox's index with a link without a line; a stale temporary
  file swept; a big vault built while keys answer, quit at once mid-build; a closed peek's build not holding the next;
  a peek kept as a tab before its list; a kept tab's catch-up at start giving way to a peek). 16 of 16 pass, with the
  existing peek, vault-link and saving checks: 30 of 30. Three needed fixing as checks: a row of notes' own followed
  (it opens here, rightly: a row of kestrel's taken instead); a message's text wraps in its box (a short needle); the
  list's rows show before the graph here is caught up (the move's hint retried until it has).
- 2026-10-24: The harness's own tests (`tests/terminal-harness.test.ts`) failed 7 of 15 under the machine's load, and
  once more at load 3; on an export of `origin/dev` they passed, and so they did here, run again: 15 of 15, 24 of 24
  with the coverage test. Transient (dangling terminals from the runs before), not this change. The coverage test found
  one real thing: the move's check claimed the `relink` case area, left out on purpose, which it doesn't run.
- 2026-10-24: Review loop, round 3, at 9d5c6d8: Codex out of its credit (until 01:41) — the maintainer chose to skip it
  this round; the code-review skill's agents, 14 findings. Checked against the code:
  - 1, catch-ups merged by vault, a second graph's (a third vault held by a peeked vault's reach) answered null:
    verified. Every catch-up of a vault now waits with the others and is answered by its one run.
  - 2, a write that fails (a full disk) leaving its temporary file: verified, older than this branch; fixed here, in
    the function it changed.
  - 3, a third vault's catch-ups and slice parse going on once its peeked vault's graph is let go of: verified. Held
    only while that graph is held itself.
  - 4, a vault with a note slipbox can't read: pending at every open, so the slice parse here finished by writing its
    whole index on the main thread: verified. The TUI's reached graphs never write their indexes (`writesIndex`); the
    thread still rewrites such an index at each peek (off the keys; kept).
  - 5, a peek's request taken back after its answer came, before its handlers ran: rejected — the answer settles in
    microtasks right after the worker's message, so no key's request comes between.
  - 6, the temporary files of a nested vault's index, the redirects and the heads not swept: verified. Swept at each
    write of them (`sweepTemps`, now in `fsutil.ts`), and by the thread before it opens a vault.
  - 7, home's index of this version, every note changed since, taken for none: verified. Judged by its version read
    (`Graph.indexRead`), not by what it reused.
  - 8, a vault unmade with a peek into it open, its file caught up as that vault still: verified. `reachedAgain` reads
    where each file is now; none other than this vault's, no graph, nothing asked.
  - 9, rows carried to a place whose answer has none: verified. Kept only when the answer is a list.
  - 10, a catch-up riding on a peek's request stamping its index a second time: verified. A rider's answer says no
    write; the request's own caller says it.
  - 11, a vault nested in this one with no index parsed whole on the main thread when this vault's backlinks are
    worked out: verified, older than this branch, the freeze it stops. Opened and built on the thread
    (`indexNested: false`) — and its terminal check found the backlinks then cached without it: `othersChanged` reads
    other vaults' links again once the thread has written an index.
  - 12, the design saying a peek's request is never taken back: fixed. 13, a doc comment on the wrong method: moved. 14,
    the set of every buffer written three times: `everyBuffer`.
  Unit tests for each fixed one, mutation-checked (M62–M73, each caught); terminal checks for those a terminal shows
  (home's index of this version caught up, a nested vault's links listed, the redirects' temporary file swept), the
  home one and the nested one mutation-checked too. 57 unit tests, 28 of 28 peek terminal checks.
- 2026-10-24: Review loop, round 4, at f5beb48: the code-review skill's agents, 13 findings; Codex's part skipped
  (out of its credit). Checked against the code:
  - 1, nothing falling back when the thread fails (it can't start, crashes, runs out of time): verified. The reached
    graphs, not `thorough` here any more, kept their notes unparsed, a name only those notes declare unresolved for the
    session. A failed request now says so to every one riding on it, and each one's graph has the notes it lacks
    parsed here in slices (`parseHere`), as when the index can't be written.
  - 2, the thread's `Reach` opening the vaults a peeked note's links reach with the defaults: verified. A
    `[[here:note]]` in the peeked vault opened this TUI's own vault on the thread, which caught up its git (its heads
    and redirects written behind the main thread's back, the graph here holding its redirects in memory) and could
    write its index. The thread's third vaults are now read alone (`readOnly`: no index, no redirects, no heads;
    `Graph.writesState`), a nested vault's first index excepted. And the main thread no longer asks the thread to catch
    this TUI's own vault up when a peeked vault's reach opens it: its index is its own graph's.
  - 3, writes the answer didn't say: verified, both. A run taken back mid-run may have written its vault's index (the
    next answer for that vault now says so, `cut`); a nested vault's index built on the thread wasn't said at all
    (`others`, from `Reach.wrote`). Either way this vault's backlinks from other vaults stayed as they were.
  - 4, a vault whose notes were only deleted since its index: verified. Its graph here, not writing, had nothing to
    parse, so nothing asked the thread, and the index other vaults read listed the notes gone. Asked when its index is
    behind its walk (`Graph.indexBehind`: a graph that doesn't write keeps its index marked dirty).
  - 5, a peek's request of a vault held behind one of the same vault that's stuck: rejected. Stuck there is a walk of
    that vault blocked on a disk, which the next request of it would block on too; the request's deadline is the net.
  - 6, `othersChanged` without a new generation or a layout: verified. The Info view's count, kept by generation,
    stayed; an answer that changed nothing of the graph there laid nothing out. It now bumps the generation, reads the
    machine's list again (a nested vault found was just recorded by another reach), and every view is laid out again.
  - 7, `atomicWrite`'s close failing after a write that failed: verified. The close's error replaced the write's, and
    the temporary file stayed; a close failing after a good write left it too. Both fixed.
  - 8, a peek's request taking back a running catch-up of its own vault: verified, the work thrown away and done
    again in a new thread. It waits for it now, reading the index it writes.
  - 9, a rename that makes or unmakes a vault reopening every other vault's graph a buffer holds: accepted. Rare, and
    each reopen is a walk and an index read; telling which graphs a boundary moved touched is for later.
  - 10, the peeked note parsed again when its list comes (`loadText`): accepted. A list appended changes the text, so
    it's parsed again; a big note's parse is on the parse threads.
  - 11, an answer that changes nothing giving a graph a link opened its reach, recording the roots around it:
    verified. Given one only by an answer that changes it.
  - 12, the sweep of temporary files by hand before each write instead of in `atomicWrite`: rejected. In
    `atomicWrite` it would read a folder at every note saved; the writes left behind by a thread let go of are the
    three swept.
  - 13, `discover`'s three-valued `index`: one option, `nested: "index" | "open" | "none"`.
  Unit tests for each fixed one, mutation-checked (M74–M97, each caught); terminal checks for those a terminal shows
  (a deleted note's link dropped from the Info view's count once a link by name reaches its vault, no key pressed; a
  nested vault's link counted once a peek built its index), which catch M82, M83, M85, M87 and M88 too. The two a
  terminal can't tell apart (the machine's list read again: its cache has gone stale by then; the layout: another
  render comes) have their own unit tests. 67 unit tests; 29 of 29 peek terminal checks, 5 of 5 saving ones.
- 2026-10-24: CI at 91939dd (round 4 pushed): the first peek check counted kestrel's backlinks 26, then 33, not 28.
  The five more were this vault's own links, read from its index, which its background index had written only by the
  second peek. The thread used to write it, opening this vault for a link: the race round 4 took away. The check
  waits for this vault's index first. The macOS runner's clipboard test went over its time (2.9 s for 2.5 s), in code
  this branch doesn't touch; it passes here.
- 2026-10-24: Review loop, round 5, at 91939dd: Codex, 1 finding; the code-review skill's agents, 11, Codex's among
  them. Checked against the code:
  - 1, this TUI's own vault, nested in a peeked one and without an index yet (its first start), built on the thread
    while the main thread builds it: verified. The request names this TUI's vault (`own`), never indexed there.
  - 2, the thread's third vaults `thorough`: verified. A name into one whose index is behind parsed it whole at each
    peek, never written, for nothing: where a link into another vault lands is no backlink of the peeked note. Not
    `thorough` now.
  - 3 (both), `othersChanged` leaving `Reach`'s inbound cache, kept by the indexes' mtimes: verified — a rewrite in
    the same tick of a coarse clock read as none. Dropped with it.
  - 4, a nested vault built on the thread never stamped indexed in the machine's list: verified. `others` is the keys
    of the indexes written; each is stamped.
  - 5, the explorer's rows kept after the thread wrote an index: verified, a vault's row saying it has none. Made
    again. Its terminal check found start's own remakes of the tree (git's status, the probes) hiding it, so it waits
    for them first.
  - 6, home's notes parsed here when the thread fails: verified, against VV-D2. Never home's.
  - 7, the mark of a run taken back dropped by an answer that couldn't read the index: verified. Kept until one reads
    it.
  - 8, the TUI's reached graphs still writing their vaults' redirects and heads, and running `git diff` here: verified.
    `Redirects` writes back whole what it read when first asked, so two writers drop each other's moves. The TUI's
    reached graphs are `readOnly` now; each answer has their redirects read again.
  - 9, a graph's reach made before the probe, and again for the graph opened anew: verified. Once, after the rebuild.
  - 10, every nested vault without an index built before the note's rows: rejected — older than this branch (17.17,
    on the main thread before), now off the keys; each built is written as it's done, so a run taken back keeps them.
  - 11, a blank line making the CHANGELOG's Fixed list a loose one: fixed.
  Unit tests for each fixed one, mutation-checked (M98–M110, each caught); a terminal check for the one a terminal
  shows (a nested vault's explorer row, no index then indexed), mutation-checked. 77 unit tests; 30 of 30 peek
  terminal checks.
- 2026-10-24: Rebased on dev's walk threads (#47, T12): the branch squashed into one commit first, its thirteen
  replaying through the same files; the files only this branch changes checked identical after. `atomicWrite`'s
  temporary name, changed by both, keeps this branch's (the process, the thread, a random part, opened exclusively).
  T12's `walkContext` showed what the backlinks' thread lacked: the root markers your config names, kept per thread
  (`setRootMarkers`), so its `findVaultRoot` and `rootAt` went by the defaults. Each request now carries the context,
  as the walk's do. Its unit test catches the fix undone (M111); its terminal check (a vault nested in kestrel by a
  marker only the config names) passes either way — the thread's walk reads the markers from your config itself — but
  drives the case end to end. 78 unit tests; 31 of 31 peek terminal checks; dev's slow-disk and the saving ones, 15
  of 15.
- 2026-10-24: Review loop, round 6, at e62754f: Codex, no fault in the code; two in the hand-over — the pull request's
  body out of date (it was: brought up to date with this round), and the same-mtime case (round 5's 3) without a
  terminal check (a terminal can't hold an index's mtime between the thread's write and this thread's read: listed as
  unit-only, why said). The code-review skill's agents, 14 findings. Checked against the code:
  - 1, a vault the widened search opened first (`known`) never caught up when a link later reaches it: verified — the
    TUI's reach isn't `thorough`, so a name only a note changed since declares stayed unfound. `opened` is told when a
    link first reaches a root the machine's list opened.
  - 2, the thread keeping home's walk (`walk.json`): verified — T12's walks on other threads hand it back. Neither the
    thread's graphs nor the TUI's reached ones keep it (`Graph.keepsWalk`); the background index does.
  - 3, a nested vault new since the last peek stamped indexed before it's recorded, so never: verified. Stamped after
    the rebuild has recorded it.
  - 4, stale temporary files judged by this machine's clock alone, a share's minutes behind: verified, narrow. An hour
    old now, not five minutes.
  - 5, going into a peeked vault stopping the thread's build of it: rejected — that vault's index is the main
    thread's from then on, so the thread mustn't write it; what it parsed is in the parse cache.
  - 6, a kept tab asking a catch-up though its index isn't behind: rejected — the thread's walk asks the links the
    vault follows first (VV-D6), and finds folders through them that this thread's walk leaves out until they answer.
    Tried, and the tests that rest on it said so; the reason is in `makeView`'s comment now.
  - 7, every view laid out again after an index written: accepted — a lens row's counts are backlinks, and it's only
    when an index was written.
  - 8, the thread walking each vault the note's vault names, for nothing: accepted, in the design's Not done with the
    other vaults' indexes read again.
  - 9, a rename plan's parse of other vaults never written: accepted — rare, kept in the parse cache, and caught up at
    their next peek.
  - 10, the sweep in `atomicWrite`: rejected, as in round 4.
  - 11, a graph opened anew for its settings asking its catch-up again: verified. `Reach.reopen` tells nobody.
  - 12, the thread started anew when the environment changes, though the context carries it: rejected — that covers
    what a module reads once, when it starts.
  - 13, a realpath at each slice of a parse here: rejected — a syscall beside a slice of parsing, on the path where the
    thread failed.
  - 14, the design's Not done saying the open catches up with git, and `vaultGraph`'s comment: fixed.
  Unit tests for each fixed one, mutation-checked (M112–M119, each caught); a terminal check for the one a terminal
  shows (a widened search, then a name: the old form's suggestion found), mutation-checked. 83 unit tests; 32 of 32
  peek terminal checks.
