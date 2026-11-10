---
status: done
assignee: ""
blocked_by: [SD-T6, SD-T7, SD-T8, SD-T9, SD-T10]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T11: What drawing reads: a note's links and pictures, the scratch's places, the Problems panel's notes

SD-D3, SD-D5. Found while drafting, not in #46; in this workstream as its last code task, measured first (question 6
of README.md, answered 2026-11-09).

## Description

- Measured first: how often a layout reads the disk, on which notes (the demo vault, the reference set), and how long
  each read holds the screen on a slow disk.
- What a layout asks: a `/…` link's first folder (`existsSync`, `src/core/workspace/graph/graph-resolve.ts:298`); a
  link into a nested vault (`statSync`, `graph-lookup.ts:249`); a name's case on a disk that folds it (`onDisk`,
  `src/core/workspace/links/links.ts:264`, macOS); a picture's file (`src/tui/documents/media/images.ts:93`, `:101`).
  Each answered from what's kept — the walk's folders and files, a picture's bytes — and, when it isn't, drawn as
  resolved and asked of a disk thread; the layout drawn again when it answers (SD-D13).
- The scratch's places (`problems.ts:154` → `Scratch.places`, `src/tui/app/scratch/scratch.ts:35`: each place's file
  statted and read, `:42`, `:51`): kept, asked of a disk thread, the scratch drawn again when they answer.
- The Problems panel (`src/tui/documents/diagnostics/problems.ts:83`): each file the vault's lint names read on a
  disk thread, its findings shown unfiltered until its parse is in.

## Acceptance criteria

- The measurement, in the log here.
- Held: a note with a picture under `held` opened — the note drawn with the picture's place said, a key handled
  meanwhile; let go, the picture drawn.
- Held: a `/…` link into `held` — drawn as resolved at once; a missing one drawn broken once its answer comes.
- Held: the scratch with an `At:` place in a file under `held` — the scratch drawn at once, a key handled meanwhile;
  let go, a place whose line moved is said.
- A layout drawn twice for one answer never moves the cursor or the reading position (D98).
- `CHECKS_FOR` (`scripts/ci-scope.ts`) names the terminal checks this task's files reach; before its pull request
  merges, they run locally, listed for approval first, with its unit tests (SD-D14).

## Terminal check

`slow disk: a note whose picture is on a slow disk — drawn at once with its place said, the picture once read`.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D12):

- A link not checked yet: drawn as resolved until said otherwise; most resolve, so the drawing changes only for the
  few that don't.
- Pictures: here, the same kind of read, measured with the rest under one rule for what drawing asks.

## Open

What the description left open, settled as it was built (SD-D17); design.md's section it delivers says how.

- One kind of request, `draw` (`core/workspace/walk/draw-jobs.ts`): what's at some paths, the names some folders
  hold, some files' texts and the machine's named folders, asked as one batch in the background with a look's
  minute, one batch out at a time (`tui/app/runtime/drawn.ts`, `app.drawn`). A link's questions go through
  `core/workspace/links/path-probe.ts`: the seam at once — the CLI's, a key's — unless the drawing answers for the
  layout it makes (`Drawn.during`).
- Kept answers are asked again once drawn two seconds after they were read, as the scratch's places were (D229); a
  file the watcher sees change is asked again as it's next drawn, however lately read (`Drawn.stale`). What the walk
  gave — a note, a file, a folder of the vault open — is answered from it; a picture's file is always asked, so a
  picture changed on disk is drawn anew. A path it didn't give, in a folder it listed, is drawn as not there till the
  disk answers, and asked all the same (the walk leaves out what its filter does): a link to a note not written yet is
  drawn broken at once, as it was.
- An embedded note's text is read the same way, and the Problems panel's own problems of a note (`noteProblems`)
  checked from the buffer's text as saved, with its links' questions answered as the layout's are.
- The named folders, before their first answer: none — a pointer drawn as not found and a hosting link as a web link,
  a moment on a disk that answers.
- A place in the scratch whose file isn't read yet is said nothing of; a picture's place is said until its file is.
- The host's picture size takes the file's mtime from the drawing (`Host.images.size`'s `at`) and keeps it for the
  picture it draws, so a frame stats nothing; an SVG's rasterised PNG, in the cache folder, is still statted there.
- Found building it: an embedded note changed on disk just after it was read was drawn as it was until the next frame
  two seconds on, the watcher's word not reaching the drawing; `Drawn.stale` fixes it, with its regression test.
- Found by CI after the rebase onto SD-T6: a link to a note not written yet was drawn as found until the disk
  answered, where the walk already said it wasn't there (SD-T10's `start-read.test.ts`); fixed as above, with its own
  test in `drawing.test.ts`. And a key's follow resolves its link on the screen's thread, as before (only drawing
  answers from what's kept), now through the seam, so `opening-read.test.ts`'s hold saw it: the stat of the link's
  file and, on macOS, the folders on its way listed for its name's case (`onDisk`). Its three tests of a link not
  followed hold all but that resolution here (`resolvingHere`, by what asked), their drawing on a disk thread as the
  TUI's.
- `CHECKS_FOR`: `drawn.ts` and `draw-jobs.ts` name the slow disk's checks and those of pictures, embeds, links, the
  scratch, the Problems panel and named folders. `path-probe.ts` has none: every link resolved asks it. The change
  reaches every check (`app.ts`, `views.ts`, `links.ts`), so the slow-disk checks and those of the features it
  touches ran before the pull request.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("Drawing a note").
- Rests on: SD-D3, SD-D5; D98; `1.4`, `12.x`, `1.7`.

## Log

- 2026-11-10: Measured with the reads through the seam counted on the screen's thread, each with what asked for it:
  each of 167 notes, the demo vault's (`examples/vault`) and the reference set's (`bun scripts/build-home.ts`), opened
  in a test's App, its layout made, its own problems and the vault's lint checked, and a frame drawn. The same code
  both ways, the drawing reading at once (before) or asked of a disk thread (after):

  | What's measured                   | Before                 | After                        |
  | --------------------------------- | ---------------------- | ---------------------------- |
  | reads on the screen's thread      | 4,120                  | 336                          |
  | notes that read at all, of 167    | 102                    | 39                           |
  | a note's reads, median and 90th   | 9 and 57               | 2 and 19                     |
  | the most, one note                | 1,980 (`bookmarks.md`) | 68 (`daily/2026-09-30.md`)   |
  | that note at 100 ms an op (SD-T9) | about 3 minutes        | about 7 s, none of this task |

  Before, most were the named folders read for each link (`readFolders`, about a third), a link's path statted
  (`byFilesystemPath`, `resolvePath`), the notes the Problems panel checks read whole (`overlayText`), an embedded
  note's parse (`parsedAt`) and a picture's stat. What's left after (by what asked, from a run of 343) is none of this
  task's: git's checkout looked for, for a hosting link and a peek (`git.ts`'s `isDir` and `read`: 151); a folder's
  `.gitignore`, for what the explorer leaves out (`gitignoreFor`: 51); a vault's identity and remote, and the named
  folders, for a pointer's name (`folders.ts`: 43); the status line's word on a link (`following.ts`'s `describe`: 32);
  git's operation under way (`operationOf`: 21; the TUI's look keeps it, SD-T4); another note's text for a block's line
  (`overlayText`: 18); the machine's list (`recordLocation`: 8). SD-T12 says them in the known limits, or gives them a
  task of their own.
