---
status: done
assignee: claude-11
blocked_by: []
tracker: [gh:#11]
created: "2026-10-23"
---

# T14: Renaming a followed link's own symlink is allowed

Renaming or moving a symlink that leads out of the vault, named by its own path inside the vault, moves the link
entry, not its target, and is no longer refused as `… resolves outside the vault`. The link stays followed, and a
relative one still leads where it did (D?1). What is reached through the link stays where it is: a move out of it or
into it is still refused. Found on the way, and fixed here at the maintainer's word: a plan's file reached through a
file link is written through the link, never over it.

## Description

A move's source is checked by its real path (`checkSource` in `src/core/rename.ts`, called by `planNoteRename`,
`planFolderMove` and `planVaultFolderMove`; `outside` in `src/core/rename-apply.ts`, when a plan is carried out):
`landsInside` resolves the path named to its target. For a followed link out of the vault (`outdir → /mnt/disk/data`,
or a file `ext.md → /elsewhere/ext.md`), named itself, that target is outside the vault, so renaming the link is
refused, though the rename only changes the link's entry in its folder. The check should look at the link entry
(`lstat`) when the path named is the link itself, and keep resolving every folder on its way. Moved, the link keeps
the answer kept for it (`links.json`, by the link's path), and a relative one moved to another folder is written again
to lead where it did (D?1).

## Acceptance criteria

- A test: a followed folder link, a followed file link and a relative followed link out of the vault, renamed in
  place or moved to another folder of the vault by the plan (`planFolderMove`, `planNoteRename`) and by `slipbox mv`:
  each link moves, its target is untouched, the links to it are rewritten, it's still followed (read through, its
  answer kept for its new path), and the relative one leads where it did, the plan saying so. An undo moves each back,
  as written, its answer with it. It fails without the fix.
- Still refused, by the same tests: a note or folder reached through the link moved out of it, a move into it, and a
  link inside the link's target.
- A test: in home, a rename's relinking and a move of a followed file link itself write through the link; the link
  stays a link.
- A terminal check: the explorer's `r` on a followed link, `m` on a relative one, then undone.
- design/roots.md § Links followed only when you say so and design/links.md § Renames and moves say it; the manual
  (`docs/manual/vaults.md`); two CHANGELOG lines.

## Out of scope

- What can be written through a followed link (D220, VV-D6): unchanged.
- A link inside a real folder that's moved: its answer, and a relative one's target, are left as the folder's move
  leaves them.
- Copying or deleting a link that leads out: refused, as before.

## References

- Delivers: design/roots.md § Links followed only when you say so; design/links.md § Renames and moves.
- Rests on: VV-D6, D220, D?1.

## Log

- 2026-10-23: Reproduced. A test (`a followed link out of the vault, named itself, is renamed and moved as a link: …`
  in tests/vault.test.ts, VV-D6's block) fails at `planFolderMove(g, "outdir", "outlink")` with `outdir resolves
  outside the vault`. Live, the installed release (0.4.1-preview.202610221359), in a scratch home with a followed
  folder link `outdir` and a followed file link `ext.md`: `slipbox mv outdir outlink` and `slipbox mv ext.md box/`
  both exit 5, `… resolves outside the vault`.
- 2026-10-23: The cause: `checkSource` (`src/core/rename.ts`) asks `landsInside`, whose `realTarget` is the path's
  `realpathSync`: for a link named itself, the link's own last step is resolved too, to its target. A rename moves
  only the link's entry in its folder. `outside` (`src/core/rename-apply.ts`) does the same for `plan.move.from` when
  a plan is carried out, and an undo's `move.from` is the link at its new name, so both need the fix.
- 2026-10-23: Prototyped (an `lstat`: a link named itself checked by its folder's real path), tried live with this
  worktree's CLI: both moves go ahead and `b.md`'s links follow. Two neighbours found:
  - the answer stays with the old path (`slipbox symlinks`: `~/vault/outdir → … followed (gone)`): the link at its new
    name isn't followed, so `slipbox render outlink/s.md` exits 5 (`… reached through a link that isn't followed`),
    and the links the move just rewrote lead through a link not followed;
  - a relative link (`relout → ../../out2`) moved to `box/` keeps its text and leads nowhere now; the plan said
    `0 changes`.
- 2026-10-23: Not a neighbour: a link with two names to one target is walked once (`twice`), so the second isn't in
  the index and `mv` says `no folder relout`, as for a link not followed.
- 2026-10-23: The cause and the plan reviewed: the cause holds (no other step resolves the source: the CLI's
  `folderArg` and the TUI's `movePlan` pass the path as named). Taken: an answer is moved only once the move has
  succeeded, and replaces whatever the new path had (an undo carries the answer there is then, never an old one);
  a relative link re-pointed from its `readlink` text, not its real path (a link to a link stays one); the watcher
  checked live after the move. Left out: links inside a moved real folder (their answers, their relative targets): a
  wider change than #11, and one with traps of its own (a relative link inside may lead elsewhere after the move).
- 2026-10-23: Found, not #11's: in home, a rename's relinking replaces a followed file link with a copy. Live, the
  release: `~/ext.md → out/s.md` (followed) links `[a](a.md)`; `slipbox mv a.md z.md` leaves `ext.md` a plain file
  saying `[a](z.md)`, and `out/s.md` as it was. `applyPlan` writes each file with `atomicWrite` at its path as
  reached, and the rename over it replaces the link. With this fix, moving such a link itself in home, when its own
  links need rewriting, would do the same: it has to write through the link.
- 2026-10-23: The maintainer chose: the answer moves with the link (only for a link moved itself); a relative link is
  written again to lead where it did; the home bug is fixed here; copy and delete of a link stay refused. Recorded as
  D?1 (decisions/roots-and-links.md), with a note under VV-D6.
- 2026-10-23: Fixed. `entryInside` (`src/core/fsutil.ts`): a symlink named itself checked by its folder's real path,
  anything else as before; used by `checkSource` and by `outside` for `move.from`. `moveLink` (`src/core/symlinks.ts`),
  called by `applyPlan` when what moves is a link: renamed, or, relative and changing folder, made anew from
  `movedLinkText` (its text with the way back to its old folder in front, each leading `..` taking back a folder of
  that way: a link to a link stays one, a `lnk/..` in the text kept) and the old one taken away (the new one taken back
  if that fails); then the answer re-keyed to the new path, replacing whatever was kept there, a failure leaving it to
  ask again. The plan says it (a warning: `rel is a relative link: written again at box/rel to lead where it did
  (../../far)`). `applyPlan` writes every file of a plan at `realTarget` of where it is, and a moved file link's own
  text through it.
- 2026-10-23: Tests (tests/vault.test.ts): `a followed link out of the vault, named itself, …` (the folder, file and
  relative links; plan and CLI; answers; undo; still-refused cases, a link inside the target among them), `in home, a
  file reached through a followed link is written through it, never over it: …`, and `a link moved as a link: …` (the
  text rules, the answer replacing a stale one, nothing changed when the link can't be made). Mutation-checked: each of
  checkSource and outside by the real path, entryInside letting a link inside the target through, the answer not
  moved, a stale answer kept, no re-pointing, no way back in the text, the text resolved lexically, a link to a link
  flattened, a plan's file written over a link, a moved link's own text written over it, a link moved as a file: each
  fails a test.
- 2026-10-23: Live, this worktree's TUI on the scratch vault: `r` on `outdir` previews `outdir/ → outlink/: 1 change in
  1 file`; applied, `outlink` is followed and indexed (`●`), unfolds without asking, `:e outlink/s.md` opens, and an
  edit to its target from outside reloads it (`↻ outlink/s.md changed on disk — reloaded`): the watcher follows. `m`
  on `relout` into `box` says `! relout is a relative link: written again at box/relout to lead where it did
  (../../../out2)`; applied, `box/relout → ../../../out2`, its answer moved. `m` on `ext.md` into `box`: a link still,
  `b.md` following. `:undo-rename` twice: each back, `relout → ../../out2` as it was, the answers at their old paths.
  `:mv` of `outdir/s.md`: `! outdir/s.md resolves outside the vault`, nothing moved. Live in home, the release showed
  the bug, as above; the test covers it fixed.
- 2026-10-23: Terminal check added (tests/terminal/checks/vaults.ts, `links: a followed link renamed with r, a
  relative one moved with m — …`): passes; fails with checkSource by the real path, and with a link moved as a file.
  Run beside it, passing: the explorer's file operations, `rename:` (four), `files: space d`, `files: a folder with an
  unsaved note`, `nested roots: the explorer's row`, and the two followed-link checks (11/11). Unit tests reached
  (`renam|move|undo|plans|VV-D6|replace|convert|symlink|relink` in vault, cli and tui tests): 285 pass.
- 2026-10-23: The diff reviewed. Taken: (1) `applyPlan` checked a plan's file where it was (`mayRewrite` on
  `f.abs`) but wrote at `realTarget` of where it is after the move, so a relative file link inside a moved folder could
  lead the write somewhere new, out of the vault even (`a/docs/kept.md → ../../.shelved/kept.md`, `a/docs` moved up
  to `docs`, leads to the vault's parent): each file's real target is found before anything moves now, what's inside
  the moved folder itself mapped to where the folder goes; (2) a link's text was split on `\` on POSIX too, where it
  is a name's character: split on `/` only, but on Windows; (3) an answer that couldn't be written was swallowed, a
  stale one where it went left in force: `moveLink` says it, `Applied.warnings` carries it, the CLI's warnings and the
  TUI's messages show it; (6) the terminal check now changes the renamed link's target from outside and sees it read
  again. Not taken: (4) numbering `D?1`: a root decision is numbered when it's merged. Tests: `a folder moved with a
  relative file link in it: …` (tests/vault.test.ts), and in `a link moved as a link: …` a `\` in a name and the state
  folder made unwritable. Mutation-checked: writing where the moved link leads, a moved folder's
  files written at their old place, `\` split on POSIX, the lost answer not said: each fails a test. Reached unit
  tests: 286 pass; the 11 terminal checks: pass.
- 2026-10-23: Found, trying a nested vault reached through a link: a followed link to another vault is a nested vault
  of the one it's in, and with the fix `slipbox mv ov ov2` moved it, and the machine's list then said the other vault
  was at `vault/ov2`, the link's path, not its real one (a scratch script; `recordLocation(rootAt(to))` after the move).
  Before the fix every link was refused. A link leading to a vault, or to a folder holding one, stays refused now:
  `checkSource`'s `vaults` (from `planVaultFolderMove`, and `planFolderMove` when vaults are nested under it), and
  `outside` when a plan carries vaults. Test: `a followed link to a vault, or to a folder holding one, isn't moved by
  its name: …`; mutation-checked, each of the three.
- 2026-10-23: The diff reviewed again. Taken: (1) with plans written through links, a rename's relinking wrote into a
  hidden folder through a link inside the place (`n.md → .hidden/n.md`, `~/rc.md → ~/.bashrc`), which a write named
  there is refused: `landsHidden` in `mayRewrite` leaves such a file, its row saying `a link leads it into a folder the
  walk doesn't list: not rewritten` — only a link's doing: a path named there (a vault's own `.slipbox/config.toml`, a
  note reached there) is written as before; (2) a file link moved after the plan's other files were written, and a
  link leading nowhere where it went (which `existsSync` doesn't see) failed it half done: it moves first now, as a
  folder does, a destination is taken as there by `lstat` (`entryAt`) when planned and carried out, and a failed
  move says `… can't be moved (EACCES); nothing changed`; (3) a link whose target another indexed name reaches had
  its own links rewritten for its new folder, breaking them for the other: left, and said; (5) an undo judged any
  link by its entry, so a link a pull put where a folder went was moved back: the plan says `move.link`, and the undo
  moves back as a link only what moved as one; (6) an undo re-pointing a relative link says so; (7) a failed
  rollback in `moveLink` no longer hides why the move failed; (8) the CHANGELOG says vaults too; (9, 10) the link
  rule is one flag, `move.link`, and `links.json` written in one place (`keep`); (11) this Log names no session.
  Not taken: (4) a real folder holding a followed link to a vault, moved, records that vault at the link's path: it
  did before this change too (nothing here allows it), so it's a follow-up of its own. Tests (tests/vault.test.ts):
  `a rename's relinking never writes through a link into a folder the walk doesn't list, …`, `a file link moved where
  a link leading nowhere is: …`, `undo moves back only what moved as it moved: …`, the undo's warning in `a followed
  link out of the vault, named itself, …`; the earlier `a folder moved with a relative file link in it` now reaches
  its note through `walk.exclude`, a hidden one being never written. Mutation-checked, each of the ten: fails a test.
- 2026-10-23: Done, in a draft pull request into `dev`; its merge is the maintainer's acceptance.
- 2026-10-23: The pull request reviewed twice, independently (round 1): fifteen findings, fourteen once the one both
  found is merged, each tried against the code. Taken, each reproduced by a test that fails without its fix
  (mutation-checked): (1) a link renamed onto what it leads to, or onto another link to it (`alias.png → img.png`,
  `slipbox mv alias.png img.png`), was put in its place: `sameFile` follows the link, so the destination's check took it
  for a case-only rename, and `img.png` became a link to itself, the file lost. On `dev` too, for an asset; this change
  reached it with any link. A destination is one entry now (`sameEntry`, by `lstat`), at every check: refused, `img.png
  exists; not overwriting it`; a folder link onto another goes into it, so out of the vault, refused; (2) the undo's log
  kept a file by its moved name, not where it was written: a relative link moved with its folder leads elsewhere then,
  so the undo read another file and was refused (`a/docs/kept.md has changed since`): the log, and `written`, keep where
  it was written when the moved name doesn't lead there; (3) a file two links reach from two folders (`e1.md →
  shelf/s.md`, `sub/e2.md → ../shelf/s.md`), edited by each its own way: the last write won, the other's edit was lost
  and the undo refused. A file reached through a link and by another name from another folder isn't written now, said
  (`what it leads to is sub/e2.md too, from another folder: not rewritten`); two names in one folder editing it alike,
  written once; otherwise, neither. A note's own name and a link to it can't both be in the index (the walk skips the
  link, `already in the vault`); (4) a moved link whose other name moved with it, both in the folder moved, had its own
  links left: a name the plan moves along isn't another; (5) `landsHidden` let any dotted name through, so a reached
  `.notes/n.md → ../.private/p.md` was written in `.private/`, which `checkWritable` refuses: only a path no link leads
  elsewhere is its own now; (6) a file written through a link into a nested vault left that vault's index as it was:
  other vaults are found by where files were written too; (7) a file link moved before its target was written, so a
  target in a folder that can't be written left it half done, links rewritten and no undo: every file's folder is
  checked writable before anything moves (`… can't be written where it is (EACCES); nothing changed`), and, the same
  claim needing it, a plain note's move checks the folders it leaves and goes into, a folder's move refused as a link's
  is; (8) a link that couldn't be moved left the folders made for it: taken away again, for a folder's move too; (9)
  `outside` took `vaults` but didn't read it: a link planned with vaults moving is refused there too; (10) the
  other-name lookup resolved the whole index once for each moved link: once a plan now (`Collector.otherNames`); (11)
  `landsHidden` walked up for every file: one no link leads elsewhere in the vault is answered from the vault's real
  path; (12) `entryInside`'s two `lstat`s are one, and the refusal's words come from one place (`whereItLeads`). Not
  taken: the tests' `chmod` run as root (the file's other `chmod` tests aren't guarded either: the suite runs as a
  user); `moveLink`'s taking back failing too, leaving both links, which needs the folder made unwritable between two
  calls; keying the Collector by real path (in part: (2) and (3) give one change per file, its name kept for what's
  shown, indexed and moved); `checkWritable` calling `landsHidden` (one measures a path named, the other a file found,
  and they agree now). Tests (tests/vault.test.ts, VV-D6's block): `a link moved onto what it leads to, …`, `a file
  reached by two links from two folders …`, `a reached note in a hidden folder that is a link into another hidden folder
  …`, `a file written through a link into a vault nested in this one: …`, `a move that can't be finished changes
  nothing: …`, the undo in `a folder moved with a relative file link in it: …`, and a link planned with vaults in `a
  followed link to a vault, …`.
- 2026-10-23: Round 1's fixes tried live, in a scratch home, the release and then this worktree's CLI: `slipbox mv
  alias.png img.png` left the release's `img.png` a link to itself, the image gone, and is refused here (`img.png
  exists; not overwriting it`); a folder moved with a relative file link in it, then undone, gives its note back where
  it was written, the outside one untouched; a rename reaching `.notes/n.md → ../.private/p.md` made the release's link
  a plain copy, and here leaves it, said; `slipbox mv d.md ro/` into a folder that can't be written left the release
  half done (`e.md` saying `ro/d.md`, `d.md` where it was), and here changes nothing (`d.md can't be moved (EACCES);
  nothing changed`). In the TUI, in a headless terminal: `r` on one of two links to a note, onto the other, says `!
  zl2.md exists; not overwriting it`, both links as they were; `m` of a note into a folder that can't be written
  previews, then says `✗ zd.md can't be moved (EACCES); nothing changed`, the note linking to it as it was. Reached unit
  tests (`renam|move|undo|plans|VV-D6|replace|convert|symlink|relink` in vault, cli and tui tests): 295 pass; the 14
  terminal checks of the explorer's files, renames and links: pass.
- 2026-10-23: Reviewed twice again, independently (round 2): fifteen findings, none found by both, each tried against
  the code. Taken, each reproduced by a test that fails without its fix: (1) a plan's folder was checked for writing but
  not for search, so a saved plan applied after `chmod 600` on its note's folder stopped half done: `W_OK | X_OK`; (2)
  round 1's quicker `landsHidden` took the vault open for where a path is named, so naming a vault reached through a
  followed link (`~/work → /proj`, `shift+r`) was refused, its own `config.toml` taken for a hidden folder: the vault
  holding it by its path is asked, after a quick look at whether any link is on the way; (3) a file two names in one
  folder edit alike, written once, left the second name's index entry as it was, so the renamed note's backlinks missed
  it: the change keeps its other names (`also`), indexed again with it, its undo's too; (4) a link moved without its
  answer (the state folder unwritable), moved back by an undo, lost the answer left at its old place: a link without an
  answer leaves one where it goes that leads where it does — an answer being a place and where it leads, as a link made
  there by hand would find it; one for elsewhere goes. This turns round 0's choice that a moved link carries only its
  own answer, for an answer that is this link's; (5) that link was read through at its new name into the index, its
  folders listed there: the index is walked again then, the link a row of its own, not followed; (6) the CLI's JSON gave
  that warning in its envelope only: its data's `warnings` too; (7) `outside` and `applyPlan` decided moving as a link
  each their own way: one rule, `movesAsLink`; (8, 9) one test for a path landing where it's named (`asNamed`), the
  root's real path read once a plan, one real path a file in `applyPlan`, one `lstat` in `checkSource`. Not taken:
  recording a file's written place in the root's form (only a file the moved name no longer leads to is recorded by its
  real path, and such a file is reached by that link alone: no index entry or open note has it by another name, and the
  undo reads it back); one predicate for `checkWritable`, `mayRewrite` and the TUI's save (they measure a path named, a
  file found and an edit you made, and agree where they meet; the save is out of this change); the other-name lookup
  limited to names through links (the walk's knowledge of its links isn't in the index: once a plan, only when a link is
  met); keying the Collector by real path (as round 1); `entryAt` merged with `install.ts`'s and `review.ts`'s own
  (theirs, before this change); citing `D?1` (a root decision is numbered when it's merged).
- 2026-10-23: At the maintainer's word, every case has a terminal check too: tests/terminal/checks/moving-links.ts,
  thirteen, beside the one in vaults.ts (its undo now sees the relative link said). Each fix was undone in turn and its
  check found failing (thirty-two). Three cases have none, each said in the pull request: a link inside a followed
  target (the walk never lists one: a link to a file it lists already is skipped, and `probeFollowed` asks only about
  links inside the vault's own real path, so one inside a followed folder outside it waits — noticed, not this
  change's), two names in one folder editing a file otherwise (no plan makes it from the index), and a plan both moving
  a link and carrying vaults (no plan slipbox makes). Found writing them: a moved file link's own note out of the vault
  is never written, said, as D220 has it; a link to a note the walk lists is no row of the explorer, so an image link
  onto its image is tried with the CLI.
- 2026-10-23: Round 2's fixes tried live, this worktree's CLI in a scratch home: two links in one folder to one note
  (`box/e3.md`, `box/e4.md`), `slipbox mv a.md z.md` writes it once, and `slipbox backlinks z.md` lists both; `slipbox
  mv lnk lnk2 --json` with the state folder unwritable says in `data.warnings` that the answer couldn't be kept,
  `slipbox symlinks` keeps `~/vault/lnk … followed (gone)`, and `slipbox undo` brings it back followed; a plan saved
  with `--plan`, its note's folder then `chmod 600`, `slipbox apply` says `src/s.md can't be moved (EACCES); nothing
  changed`, its other file as it was. The TUI's cases are the terminal checks'. Reached unit tests: all but two pass —
  cli.test's `stat` (a linked worktree's name, by design) and render.test's `Mermaid … drawn while its library loads`,
  which fails alone too, the library loading before the first frame asks (a timing test; nothing here draws).
