---
status: doing
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
- 2026-10-23: Codex challenged the cause and the plan: the cause holds (no other step resolves the source: the CLI's
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
- 2026-10-23: Asked the maintainer: the answer moves with the link (only for a link moved itself); a relative link is
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
  fails a test (tmp logs `t14-mutate*.log`).
- 2026-10-23: Live, this worktree's TUI on the scratch vault: `r` on `outdir` previews `outdir/ → outlink/: 1 change in
  1 file`; applied, `outlink` is followed and indexed (`●`), unfolds without asking, `:e outlink/s.md` opens, and an
  edit to its target from outside reloads it (`↻ outlink/s.md changed on disk — reloaded`): the watcher follows. `m`
  on `relout` into `box` says `! relout is a relative link: written again at box/relout to lead where it did
  (../../../out2)`; applied, `box/relout → ../../../out2`, its answer moved. `m` on `ext.md` into `box`: a link still,
  `b.md` following. `:undo-rename` twice: each back, `relout → ../../out2` as it was, the answers at their old paths.
  `:mv` of `outdir/s.md`: `! outdir/s.md resolves outside the vault`, nothing moved. Live in home, the release:
  tmp/issue/live-home1.log (the bug); the test above covers it fixed.
- 2026-10-23: Terminal check added (tests/terminal/checks/vaults.ts, `links: a followed link renamed with r, a
  relative one moved with m — …`): passes; fails with checkSource by the real path, and with a link moved as a file.
  Run beside it, passing: the explorer's file operations, `rename:` (four), `files: space d`, `files: a folder with an
  unsaved note`, `nested roots: the explorer's row`, and the two followed-link checks (11/11). Unit tests reached
  (`renam|move|undo|plans|VV-D6|replace|convert|symlink|relink` in vault, cli and tui tests): 285 pass.
- 2026-10-23: Codex reviewed the diff. Taken: (1) `applyPlan` checked a plan's file where it was (`mayRewrite` on
  `f.abs`) but wrote at `realTarget` of where it is after the move, so a relative file link inside a moved folder could
  lead the write somewhere new, out of the vault even (`a/docs/kept.md → ../../.shelved/kept.md`, `a/docs` moved up
  to `docs`, leads to the vault's parent): each file's real target is found before anything moves now, what's inside
  the moved folder itself mapped to where the folder goes; (2) a link's text was split on `\` on POSIX too, where it
  is a name's character: split on `/` only, but on Windows; (3) an answer that couldn't be written was swallowed, a
  stale one where it went left in force: `moveLink` says it, `Applied.warnings` carries it, the CLI's warnings and the
  TUI's messages show it; (6) the terminal check now changes the renamed link's target from outside and sees it read
  again. Not taken: (4) numbering `D?1`: a root decision is numbered when it's merged. Tests: `a folder moved with a
  relative file link in it: …` (tests/vault.test.ts), and in `a link moved as a link: …` a `\` in a name and the state
  folder made unwritable. Mutation-checked (`t14-mutate3.log`): writing where the moved link leads, a moved folder's
  files written at their old place, `\` split on POSIX, the lost answer not said: each fails a test. Reached unit
  tests: 286 pass; the 11 terminal checks: pass.
