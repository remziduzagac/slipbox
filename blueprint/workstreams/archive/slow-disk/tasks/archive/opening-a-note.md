---
status: done
assignee: ""
blocked_by: [SD-T1, SD-T2]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T5: A note opened reads on a disk thread

SD-D4, SD-D5, SD-D6.

## Description

- `Opening.buffer` (`src/tui/documents/buffers/opening.ts:106`) asks one `read` of the file, with what else it reads
  there: its writability (`lockedSaid`), its vault (`vaultOf`'s markers on the way up), its way checked for a link not
  followed (`following.blocked`, `lookedAt`: `opening.ts:124`, `:150` → `unfollowedLink`). Its callers await it: a tab
  opened, a link followed, a list's pick, the session's tabs brought back, `:e`.
- While it's out, the window it will be in says `reading <note>…`; the key waits, and the keys after it wait their
  turn (`Input.handleKey`), as for a big note's parse (`views.parses`, `input.ts:165`).
- `esc` is taken at once, out of turn, while a read waits: it gives the read up, the window back as it was. A click
  meanwhile is dropped, as during a big note's parse (`src/tui/shell/input/mouse.ts:73`).
- The session's tabs brought back: the tab shown first, then the rest in order, one at a time.
- `:e!` (`src/tui/actions/documents/actions-edit.ts:259`) and a reload by hand (`saving.ts:140`) read the same way.
- A list's preview (`src/tui/shell/overlays/preview.ts:115`) and a peek (`peek/opening.ts:69`) read on a disk thread
  without holding the keys: `reading…` in the preview or the peek until it comes; a newer selection drops it.
- Git's keys ask what they read the same way, as a key's own read: `beginGitRead`'s stats (git's index, `HEAD`, the
  note's: `src/tui/workspace/git/gitquery.ts:15`, `:22`, `:27`) before the git read starts, and a file looked for
  before it's opened from the git panel, a merge or the log (`existsSync`: `src/tui/workspace/git/git.ts:254`, `:371`,
  `:439`; `views/panel/gitview.ts:307`, `:317`; `views/log/log.ts:162`).
- Answers checked (SD-D5): the window closed, the vault left, the tab replaced — dropped. The file changed after it
  was read: the watcher's next batch reloads it, as now.

## Acceptance criteria

- Held: a note under `held` opened from the switcher — `reading held/a.md…` drawn, `j` and `x` typed meanwhile wait,
  a frame drawn while `held.waiting` ≥ 1; let go, the note shows and `x` deleted its first character after `j` moved
  down. With the read put back here, the test fails (checked once).
- Held: `esc` while it reads leaves the window on the note before, and the answer, when it comes, opens nothing.
- Held: a preview's row under `held` — the selection moves on, the preview says `reading…`, then shows the row
  selected now.
- Past a shortened deadline: `held/a.md didn't answer: not opened`, nothing opened.
- Held: a click on a link while a read waits does nothing; the session's tabs, two under `held`, read the shown one
  first and leave a disk thread free for a `stat` asked meanwhile.
- Held: a file opened from the git panel with the vault's folder under `held` — the key waits, a frame drawn; let go,
  it opens; `esc` gives it up. A git key with `.git` under `held` starts its read once the stats answer.
- A binary file, a file you may not write, another vault's file and one through a link not followed open as before.
- `CHECKS_FOR` (`scripts/ci-scope.ts`) names the terminal checks this task's files reach; before its pull request
  merges, they run locally, listed for approval first, with its unit tests (SD-D14).

## Terminal check

`slow disk: a note opened on a slow disk says it's being read; the keys typed meanwhile act on it once it's there, and
esc gives it up`.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D12):

- A click while a read waits: dropped, as during a big note's parse; it would land on a screen about to change.
- The session's tabs: the one shown first, then the rest in order, one at a time; a thread stays free for the
  watcher's first look and a key's read.

## Open

What the description left open, settled here for the maintainer to confirm; design.md's section it delivers says how.

- A key's open is one request, `open` (`core/workspace/walk/key-jobs.ts`, `answerOpen`): the way checked from the
  place it's opened in (`blockingLink`, the code SD-T4's `way` job runs), then the text and its stamp, then whether
  you may write it and, outside the vault, its vault. One request, not SD-T4's `way` and a `read`, so nothing comes
  between the check and the read. A test's App answers it here, at once (SD-D10). Built on SD-T4's branch, for its
  `blockingLink` read through the seam.
- A link not followed, off the screen's thread: `Following.gate` isn't asked before the read. The answer says what
  keeps the file (`blocked`), the question is asked then, and the open is made again once answered (`prepare`). A
  buffer open already has its way checked again there before a key shows it (`wayOnly`), as `gate` checked it: a
  link followed may lead elsewhere since — but not the open made again right after its own read, whose way was
  checked with it (`wayPassed`): one request an open. Said (`reading <note>…`) only for one open through a link
  (`throughLink`); another's, shown at once on a quick disk, would flash it.
- What a key does once its note is open waits for the open (`andThen`): the line or section a list's pick, a link's
  fragment, a problem, a server's location or `:!`'s output names; a new note typed into; the scratch's capture; a
  merge's conflict edited by hand. A data file's section named by a link into another vault is gone to once its peek's
  text is there (`peekAt`'s `shown`), no key waiting for it.
- A click while a git read asks its stats is dropped too, as decided above. The check of a file picked past another
  in the git panel (`git-branches.ts`) picks the second by its keys, which wait their turn, not by a click.
- A preview's and a peek's way are checked with their read (`peekAsk`, `textOnly`), as `unfollowed` checked them. A
  peek kept out by a link of the vault's asks its question once the answer says so, as `gate` asked first, and is read
  again in its place, not pushed on its history. `t` in a peek (`peekKeep`) and a claim through a link
  (`claimThroughLink`) still check on the screen's thread: not in the description.
- The keys typed while a read waits are dropped when it's given up (`esc`), fails, or opens nothing (a link's
  question asked instead): they were typed for a note that isn't there.
- `esc` aborts the request: one a thread is reading starts that thread afresh, as past a deadline. A preview's or a
  peek's read moved past isn't aborted once sent: it finishes, its answer dropped (the newest one's taken), so no
  thread is started afresh for a selection moved on; one still waiting for a thread is withdrawn (`open`'s
  `withdraw`). They're background requests, on one thread at most: a key's read finds the other free.
- The session's tabs: the shown tab's read is a key's (`reading <note>…`, the keys waiting for it alone); the rest are
  read in the background, no key waiting, each placed in order once it answers, asked of the pool as `background`
  requests (on one thread at most). A vault gone into with a file named shows the tab with it first, and opens the
  file once that tab is in. None of the tabs readable, the vault's own note opens (`Session.openDefault`), as when
  none was kept; a branch switched to whose tabs are all gone brings back the last ones, and failing those, that
  note.
- `AppOptions.listOffThread` keeps its name and sets the key reads off the thread too; a test's App reads here unless
  it sets `app.reads.offThread`.
- The scratch and slipbox's own files don't look for a vault, as before.
- `:e!` and the reload by hand (`saving.ts`'s `l`) read through `KeyReads.reload`: the answer is dropped when the
  buffer's version moved meanwhile; an error marks it deleted, as `load` did.
- `:e`, a link's `ref` and a folder's file ask their stat as a key's read (`KeyReads.statted`, `whenThere`), as git's
  looks before opening a file do (`git.ts`, `gitview.ts`, `log.ts`). `git.ts`'s `indexLocked` stays, SD-T4's look's;
  `gitview.ts`'s `readForDiff` isn't in the description and stays (its inventory entry says so).
- `beginGitRead` asks its stats as a key's read (`git's files`), and `current()` asks them again in the background,
  no key waiting, once an operation has read all it reads, before it's shown. Between its steps, `live()` checks what
  it's read for here (the view, the vault, a newer read), not git's files: a review isn't a round trip a file.
- A peek's or a preview's read that fails after `reading…`: the peek shows why in its place; the preview says
  `can't be read`, or `didn't answer` past its deadline. A step by `ctrl+o` or forward says nothing meanwhile and stays
  where it is until the place is read, as it did: a place gone since is said and let go of from the history, the peek
  where it was. A place stepped back to shows its backlinks list with its text, none when it isn't read (a link not
  followed since).
- A test's App reads a preview after a timer, not at once, so the keys taken meanwhile go first, as on a disk thread.
- `defaultNote` is a function of the graph's notes (`navigation/opening.ts`), so `app.ts` stays at its ceiling.
- The held tests hold the screen's thread's reads under `held` too (`tests/support/tui/held-keys.ts`): a read put back
  there holds the key past the hold's deadline and fails the test. The git panel's test holds this thread on the
  opened file's path alone: once it's open, the reads its drawing makes are later tasks'. The test of a peek through
  a link of the vault's holds this thread on the link only while the key is taken: the other vault's graph the peek
  shows is built here once it's open, through the link, as design.md's "What stays on the screen's thread" has it
  (SD-D7).
- `CHECKS_FOR`: `walk-thread.ts` and `disk-jobs.ts` leave the listings' entry, as SD-T2 said they would once every
  note opened is read on them; with `key-jobs.ts`, a change to them runs every check.
- The terminal check runs with `SLIPBOX_SLOW_DISK=slowdisk:1::3000`: the stand-in slows a disk thread's reads only
  with its fourth part.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("A key's own read").
- Rests on: SD-D4, SD-D5, SD-D6; D120; design/tui.md § Asynchronous git reads; VV-D5, VV-D6, VV-D7.
