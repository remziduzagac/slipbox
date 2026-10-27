---
status: done
assignee: claude-12
tracker: [gh:#12]
created: "2026-10-23"
---

# T15: A folder of home whose time was set back is listed again

Home's walk kept lists a folder again whenever its time or its ctime differs from the one the walk saw, not only when
it's newer than the walk, so notes that come into a folder whose time is then set back are found.

## Description

Home's graph is built from its walk kept (`keptWalk` in `src/core/workspace/vaults/home.ts`), each folder statted and
listed again when
it changed since the walk. "Changed" was `mtime >= walked - SETTLE_MS`: newer than the walk. Tools that restore a
folder's time (`cp -a`, `rsync -a`, `tar x`), or a disk whose clock is behind this machine's by more than the settle
time, leave a folder that changed looking unchanged, and the notes that came into it wait for home's next full walk
(by the background index) or `slipbox index --refresh ~`. The watcher already keeps each folder's time and lists
it again on any difference (`stamps` in `src/core/workspace/graph/watch.ts`); home's walk kept should do the same.

## Acceptance criteria

- A note comes into a folder of home that the walk kept lists, and the folder's time is set back to before the walk:
  the next build from the walk kept has the note. A test shows it, and fails without the fix.
- The same for a folder whose clock is behind (its time moved, but to before the walk), and for a folder made a vault
  whose time is then set back (it leaves home).
- A folder listed within two seconds of its change is listed again at the next build: a change its time can't tell
  apart (a coarse clock) is found.
- A folder whose time is put back to exactly the walk's stamp after a note came is listed again: its ctime moved
  (the maintainer's choice, in review).
- A walk kept by an earlier version, without the folders' times, still opens and is brought up to now as before; the
  command line walks home again once for it, so every folder gets a stamp (the maintainer's choice, in review).
- A folder unchanged since the walk isn't listed again, and the walk isn't kept again for a folder's time that only
  moved on (kept again for one listed again for its stamp alone, so it isn't listed again at every build).
- A folder that can't be read is listed again at each build till it can, the walk not written again each time.
- A folder that can't be read when home is walked is tried again at each build; made readable, its notes are found
  (the maintainer's choice, in review).
- Where a folder's ctime is in whole seconds (a coarse clock), one listed within two seconds of it is listed again.
- Each case has a unit test and a terminal check that drives slipbox through it, or says why it can't (the
  maintainer's, in review).
- The test that pinned the old behaviour (tests/tui.test.ts, a folder of home opened by name) says what holds now.
- design/roots.md § Home (its index; what freshness is by) and docs/manual/vaults.md say what holds now; a CHANGELOG
  line.

## Out of scope

- The watcher's own freshness (`src/core/workspace/graph/watch.ts`), which already compares each folder's time (not its
  ctime).
- A vault's build, which walks the vault whole.

## References

- Delivers: design/roots.md § Home (its index, in slices).
- Rests on: (VV-D2), (D39), (D40).

## Log

- 2026-10-23: Read the cause in `keptWalk` (`src/core/workspace/vaults/home.ts`): `changed = mtime >= walked -
  SETTLE_MS`, `walked`
  the time the walk kept began. `walk.json` keeps no folder's time, so a time set back to before the walk can't be
  told from no change. The watcher (`src/core/workspace/graph/watch.ts`) keeps a stamp per folder (`settled`: its mtime,
  or -1 when
  read within `SETTLE_MS` of a change) and lists one again when its mtime differs. design/roots.md § Home and
  docs/manual/vaults.md state today's limit ("a folder whose time is set back after its notes changed … isn't listed
  again"); no decision pins it. VV-D2 says nothing of freshness; `keptWalk`'s comment and design/roots.md § Home
  promise it "checked, not assumed".
- 2026-10-23: The background index makes home's walk again each pass, the next starting a day after one finishes
  (`REPASS_MS` in `src/core/workspace/graph/autoindex.ts`) and done in slices while nobody works: such notes wait until
  home's next
  full walk, not a fixed day.
- 2026-10-23: Reproduced. A test (tests/vault.test.ts, "its walk kept lists again a folder whose time differs from
  the walk's …") fails on dev: `keep/new.md` missing after `keep`'s time is set two hours back. Live, on a scratch
  `$HOME` (`tmp/` script, not committed), with the installed release and with this branch before the fix: home walked
  by `slipbox ls`, then `cp -a backup/notes/. ~/notes/` and `tar x` of an archive over `~/journal`, both leaving the
  folder's time an hour back: the next `slipbox ls` lacked the two notes.
- 2026-10-23: A second reviewer challenged the reading and the plan. Agreed: the cause is the one rule; the same rule
  gates "a folder become a vault" (`isVaultRoot` only for a changed folder), so a marker added and the time set back
  left a vault in home — tested too. A walk kept by an earlier version has no stamps: falling back to "newer than the
  walk" keeps the bug for its folders until they're listed or home is walked again, and stamping them on a rewrite
  caused by another folder would take their listing as seen — so they stay unknown (null) until listed. Not taken:
  `ctime` (stamp `max(mtime, ctime)`), which would catch a time put back to exactly the stamp, but a future mtime masks
  it, and on some file systems (FAT on Windows) ctime may not move; the watcher compares mtime alone. Found, out of
  scope: the watcher stamps its folders from their time when it starts (`watchDir`,
  `src/core/workspace/graph/watch.ts`), not the
  walk's, so a note brought in and its folder's time set back between the build's listing and the watcher's start is
  missed for that session; the next build lists it (the stamp kept differs). A follow-up, if wanted.
- 2026-10-23: Fixed. `SlicedWalk` (`src/core/workspace/walk/walk.ts`, home's walks) stamps each folder before it reads
  it
  (`settled`: its time, or -1 when within `SETTLE_MS` of its change), as `WalkResult.times`; `keepHomeWalk` keeps them
  as `times`, beside `dirs` (`version` stays 1: an earlier version ignores the field and writes the walk without it).
  `keptWalk` lists a folder again when its time isn't its stamp; without one (an earlier version's walk), when newer
  than the walk, as before. Kept again, a folder listed again takes its new stamp, one unchanged keeps its own, one
  unknown stays unknown. Still kept again only when the listing says something else. `SETTLE_MS` and `settled` moved
  from `src/core/workspace/graph/watch.ts` to `src/core/workspace/walk/walk.ts`, shared.
- 2026-10-23: Tests (tests/vault.test.ts): set back two hours (`cp -a`, `rsync -a`), a clock 30 s behind, a time set
  back with nothing changed (listed again, not kept again), a folder made a vault and its time set back; a folder
  walked within two seconds of its change, a note brought in and its time put back exactly (found: stamped -1); an
  earlier version's walk (no `times`): opens, a time set back not seen as before, another folder's change keeps it
  again with the unseen folder's stamp null, times that don't match its folders ignored, home walked again stamps every
  folder. tests/tui.test.ts's folder-of-home test pinned the old behaviour: the note come since is found now, "never
  walked whole a second time" shown by `home.asked` undefined. Two link tests (VV-D6) set home's time back after the
  walk to mean "unchanged": moved before the walk, which keeps their premise (only the link's verdict lists it again).
- 2026-10-23: Mutation-checked, each undone alone: the old rule alone fails the new test and the TUI test; a raw
  stamp (no `settled`) fails the two-seconds test; an unknown folder stamped on a rewrite, and no length check on
  `times`, fail the earlier-version test.
- 2026-10-23: Ran: tests/vault.test.ts whole (368 pass); the home, walk and watch tests of tui, core and cli (41
  pass); terminal checks `home` (12/12) and `marks:`, `busy`, `links: a followed link pointed elsewhere` (6/6),
  `SLIPBOX_TERMINAL_JOBS=2`.
- 2026-10-23: Live, this branch fixed: the scratch-home script again, both notes found at the next `ls`. The TUI in
  that home: the switcher lists them; quit, a second backup copied in with `cp -a` (time an hour back), started again:
  listed. While it runs, a third copied in: the watcher takes it in; `space v r` (reindex, from the walk kept) keeps
  it. On the reference set (`scripts/build-home.ts`): the release walks home (walk.json without `times`), this branch
  reads it and brings it up to now; `tar x` over `~/household` with its times, not seen (an earlier version's walk, as
  before); `slipbox index --refresh ~` stamps every folder, the note there; a second archive over it, time set back
  again: found at the next command.
- 2026-10-23: The second reviewer reviewed the diff: no fault in the code. Taken: the CHANGELOG says a home walked by an
  earlier version gets the fix once walked again, or at once with `slipbox index --refresh ~` (the manual describes this
  version, so not there); the "not kept again" check compares walk.json's bytes, not its time, which two writes in the
  same millisecond share; a test that a folder whose time is still its stamp isn't listed again, with walk.json's
  folders and stamps rotated (each stamp stays with its folder; mutation-checked: zipping them after sorting the folders
  fails it). Seven other tests in tests/vault.test.ts (a disk mounted and taken away, `[walk]` settings, the caps and
  folders asked for) set folders' times back after the walk to mean "unchanged", which a stamp now reads as a change:
  they passed, some by another path (every folder listed again). Their times are set before the walk now; "a folder
  asked for that home's walk covers stays whole …" puts home's time back to exactly its stamp after `b` comes, and
  checks the walk kept isn't capped, so `a` is covered by it. The mount test so exercises "a disk taken away, its folder
  listed again" again (mutation-checked: without that relist it fails).
- 2026-10-23: A first reviewer (an independent review, 9 findings, no correctness regression found). Taken: a
  folder listed again for another reason than its time (a disk under it taken away, a link in it answering now) kept
  its stamp, so if it couldn't be read then, the walk was kept as if it had been seen: every folder listed again is
  now stamped -1 until listed (test: a disk under `p` taken away while `p` is unreadable; mutation-checked); the
  two-seconds test depends less on the run being quick (its folder changed 100 ms before the walk, one check of
  the stamp left); `startWalk`'s flags are an options object; the manual says "when slipbox last listed it". Not
  taken: keeping the walk again when a stamp alone changed (a folder stamped -1, or set back with nothing in it
  changed, is listed again at each build until the walk is next kept — as one changed within two seconds of the walk
  was before; "not kept again for a time alone" is the design's, for `~` and a shell's history); recording ctime
  beside mtime, compared on its own (it would catch a time put back to exactly the stamp, and a folder unreadable for
  a while then made readable, a chmod not moving its mtime — before this fix too; a follow-up if wanted); this as a
  workstream rather than a task (a small change to the design goes as an issue and one pull request, D223); the extra
  stat per folder of home's walk (beside the stat of each note, small); the top folder's stamp unknown when every
  folder kept is dropped (only when home itself can't be statted); the upgrade in the manual (the CHANGELOG says it).
- 2026-10-23: Landing: the typecheck, the lint, `check:size`, `check:boundary` and `check:docs` pass; the terminal
  checks `home` again (12/12). Done, moved to `archive/`; a draft pull request into `dev` closes #12, its merge the
  maintainer's acceptance.
- 2026-10-23: Review loop, round 1, on the pull request: the first reviewer (11 findings) and the second (3) each
  reviewed `git diff origin/dev...` without the other's; merged, 11. Verified and taken:
  1. A folder whose time was set back with nothing in it changed was listed again at every build, its new stamp never
     kept until something else was. New with this fix (before it, such a folder wasn't listed again at all), unlike
     one stamped -1 or whose time moved on, listed again so before it too. The walk is kept again when a folder's time
     went back past its stamp: seldom (`cp -a`, `rsync -a`), unlike `~`'s time moving on, which still isn't kept for.
     Test: `w` set back, its new stamp kept, then a note come and its time put back to that stamp isn't seen
     (mutation-checked). The design said "what changed is kept" without this rule; it says both now.
  2. The manual's "the time it had when slipbox last listed it": the stamp compared is the one kept, not the last
     listing's (a listing not kept doesn't change it). Both reviews asked for the upgrade there too, declined before: a
     sentence says a walk an earlier version kept catches only a time moved forward, until home is walked again.
  3. The two-seconds test still depended on the run's speed (stamped -1 only if the walk came within 1.9 s of the
     folder's time): the clock is held still for the walk (`setSystemTime`).
  4. The TUI test's folder was walked within two seconds of being made, so stamped -1, and found by that path: its
     time is set two hours back before the walk, so it's found by its stamp (mutation-checked: the old rule fails it).
  5. `listDir`'s stat repeated the watcher's `dirMtime`: moved beside `settled` in `src/core/workspace/walk/walk.ts`,
     shared.
  6. The extra stat per folder in a walk never kept (folders opened by name, walked whole at each build):
     `SlicedWalk` takes `stamped: false`, which `homeWalk` passes. Measured on `/usr/share`: a stat per folder costs
     about 15% of a bare listing of the same folders. Relisted folders statted twice in `keptWalk` (a few): left.
  Rejected:
  7. A folder found while listing another (or a vault home's again) that can't be read then isn't in `dirs`, its
     parent stamped as seen: not tried again until home's next walk, a chmod not moving the parent's time. As before
     this fix: the old rule didn't list the parent again either, the walk kept at `now`. A follow-up, with ctime.
  8. The two seconds are by this machine's clock: on a disk whose clock is behind and whose times are coarse, a second
     change within one tick is missed. The watcher's too, and before this fix every change on such a disk was missed
     (its time older than the walk). The design's limits say it now.
  9. The watcher stamps home's folders from its start, not from the walk's stamps (a folder changed since the saved
     walk listed again on its first tick; the start-up gap logged above): as before this fix; a follow-up.
  10. Stamps as an object by path, not a list beside `dirs`: every path twice in walk.json. The list is read before
      anything sorts it, its length checked, and a test rotates both.
  11. `homeWalk`'s result, merged with folders opened by name, has no stamps: nothing keeps it, and that walk is
      unstamped now (6).
  Ran: tests/vault.test.ts (370; one pointer test failed once at load ~40, passed alone and in a rerun), the TUI's
  home tests (23), tests/regressions.test.ts and tests/marks.test.ts, the core and CLI home, walk and watch tests (a
  CLI test timed out at load ~40 and passed at load 10), terminal checks `home` (12/12, `SLIPBOX_TERMINAL_JOBS=2`);
  mutations: the old rule, a raw stamp, a time set back not kept, home's walks unstamped, each fails a test. Live, on
  a scratch home: `cp -a` of a backup over `~/notes`, the same note in it and its folder an hour older: the walk kept
  again with `notes`' new stamp, and at the next command `notes` not listed again (a note come, its time put back to
  that stamp, not seen; walk.json unchanged).
- 2026-10-23: Review loop, round 2, on `f7b4b86`: the first reviewer (9 findings, no regression in the main logic)
  and the second (3). Verified and taken:
  1. The walk kept again only for a time gone back past its stamp: a folder set back to after its stamp but before
     the walk (`cp -a` from a backup made since) was listed again at every build, as in round 1's case, where "newer
     than the walk" never listed it. Kept again now when a folder's time was set back before its stamp or before the
     walk (test: `w` set back half an hour, its stamp an hour back; mutation-checked).
  2. The "not kept again" check of an older test (a folder's time moved on) compared walk.json's time, which two
     writes close together can share: by its bytes now (mutation-checked: keeping the walk again for a time moved on
     fails it). The criterion above said "not kept again for a folder's time alone": "moved on" now.
  3. The earlier version's walk test required `proj`'s stamp to be -1, true only if it was listed within two seconds
     of `q.md`: it requires a stamp, `keep` still unknown.
  4. The test with `chmod 000` had no guard for root, who reads everything: it returns at once for root, as
     tests/regressions.test.ts does.
  5. `listDir` read the clock for every folder of every walk: only for a walk that stamps.
  Rejected: the watcher's start-up stamps (round 1, 9); the extra stat per folder on the TUI's thread (a slice is
  bounded by time, `step(ms)`: more work per folder makes more slices, not a longer stall); a relisted folder statted
  twice (a few per build; the loop's stat handed to the walk would tie the two); `stamped` true by default in
  `SlicedWalk`, false in `startWalk` (a walk kept without stamps brings the bug back silently, a walk stamped for
  nothing costs a stat per folder: the default guards the first). Asked the maintainer: the command line never walks
  home again on its own, so a walk an earlier version kept keeps the old rule for every folder not changed since,
  without end, for an agent's use; and a time put back to exactly its stamp (a cron `rsync -a` from a source unchanged
  since, a tree of fixed times) is still missed, which ctime would catch.
- 2026-10-23: The maintainer's answers: the command line walks home again, once, for a walk kept without stamps; and
  ctime goes in this pull request. Done:
  1. A stamp is a folder's mtime (`settled`) and its ctime (`Stamp`, `dirStamp` in `src/core/workspace/walk/walk.ts`),
     kept as pairs
     in `times`; a folder is changed when either differs. The ctime isn't settled: for a change to leave it as it was,
     a time set, the listing, a note and the same time set again would all fall in one tick of its clock, and settling
     it would stamp to list again every folder listed within two seconds of a `cp -a`. Where a file system keeps no
     ctime of its own, it stays as it was and the mtime decides, as before.
  2. The walk is kept again for a folder listed again for its stamp alone, its time before the walk (set back, put
     back, or a chmod), which takes in round 2's 1; one whose time moved on still isn't.
  3. `homeWalkKept` under a config is false for a walk without stamps: the command line (`src/cli/common.ts`,
     `src/core/workspace/links/reach.ts`) walks home again, once, as the first time. The TUI goes on with that walk
     until its
     background index's next pass.
  4. `dirMtime` is back in `src/core/workspace/graph/watch.ts`, the walk using `dirStamp`. The watcher still compares a
     folder's mtime
     alone (out of scope): a folder it polls, put back so while the TUI is open, waits for the next build, which the
     design says.
  Tests: in the `w` folder, a note come and its time put back to exactly its stamp is found (mutation-checked:
  comparing the mtime alone fails it). "Not listed again" is shown by a note taken out of the walk kept staying out
  (the rotated stamps test, and `w` once kept again), since a note with its time put back is seen now. Four tests that
  put a folder's time back after the walk to mean "unchanged" (home's top in "brought up to now", `p` after its chmod,
  home after `b` in "a folder asked for", `notes` after its link is pointed elsewhere) set the walk kept's stamp to the
  folder as it is (`restamp`) instead. The earlier version's walk test's mismatched times are pairs now, so the length
  check is what it tests (mutation-checked). New: the command line walks a walk without stamps again
  (mutation-checked). Mutations: 11, each fails a test. Ran: tests/vault.test.ts (371), the TUI's home, watch and walk
  tests (34), the core, CLI, regressions and marks tests of home, walk and watch (62), terminal checks `home` (12/12),
  the typecheck, the lint, `check:size`, `check:boundary`, `check:docs`. Live, on a scratch home: the installed slipbox
  (0.4.1-preview) kept a walk without stamps, then missed a note whose folder's time was set back; this build's next
  command walked home again and found it, every folder stamped; a note brought into `notes`, its time put back to the
  nanosecond, was found.
- 2026-10-23: Review loop, round 3, on `cd7f0d9`: the second reviewer (4 findings) and the first (8). Verified and
  taken:
  1. Both: the TUI keeping again a walk an earlier version kept writes `times` with null for the folders it didn't
     list, and the command line then took it as stamped, so never walked home again (reproduced by the review on
     `cd7f0d9`). `homeWalkKept` asks for a stamp for every folder (test: the command line test goes through such a
     walk first; mutation-checked).
  2. Both: the ctime taken as is misses a same-second change on a file system whose times are whole seconds (HFS+,
     ext3, ext4's small inodes, many network shares): a time put back, the listing, a note and the same time put back
     again within one second. A ctime in whole seconds is settled as the mtime is (`stampOf`): within two seconds of
     it, the folder is to list again. Fine-grained ctimes (ext4, APFS, NTFS) are left as they are, so a `cp -a` and a
     command straight after don't list everything again. Test: `stampOf` on whole and fractional ctimes
     (mutation-checked). No terminal check: a check can't make a file system with whole-second times.
  3. The first reviewer: a folder that can't be read stays to list again (-1), and `byStamp` (its time before the
     walk) rewrote walk.json at every build while it stayed unreadable (reproduced: four builds, four writes).
     `byStamp` is decided after the listing now: the walk is kept again for a folder listed again for its stamp alone
     only once the listing stamps it. Test: `p` made unreadable, listed again, the walk unchanged at the next build
     (mutation-checked).
  4. The first reviewer: `byStamp` compared a folder's time with the walk's start, not its stamp, so a folder
     stamped after a walk made in slices began, then set back to a time still after that start, was listed again at
     every build (round 2's `mtime < stamp` caught it; round 2's final rule dropped it). A folder is listed again for
     its stamp alone unless its time moved on past both its stamp and the walk's start. Test: `walked` three hours
     back, `v` set back to between (mutation-checked); and `w` moved on, not kept again (mutation-checked).
  5. The first reviewer: the test helper `restamp` silently did nothing for a folder not in the walk: it throws.
  Rejected: ctime-only changes to many folders (`chmod -R`, `chown -R`, xattrs, a backup restoring times) list them all
  again in one build, synchronously — the trade-off of ctime, which the maintainer chose knowing it; one build after
  such a change, then the walk is kept again with their stamps, as a `git checkout` of many folders costs today. An
  older slipbox still running rewrites walk.json without stamps, and the next command walks home again: only while the
  old one runs, and a new `version` would make the old one walk home at every start instead. The stamps make walk.json
  bigger (about 70 bytes a folder, pretty-printed): a few hundred KB at 5,000 folders, parsed in milliseconds, written
  only when the walk is kept again; the double stat of a folder listed again (round 2).
- 2026-10-23: Terminal checks for every case, as the maintainer asked (`tests/terminal/checks/vaults.ts`, "home: …"):
  a folder whose time was set back is listed again (`cp -a`, `tar x`, a clock behind, a time put back exactly, a
  folder made a vault, a time ahead stamped to list again, at the next start of a folder of home and at the next
  command); set back with nothing new in it,
  the walk kept again with its new time — before its stamp, after it but before the walk, after a sliced walk's start
  — and the next start doesn't list it again; a walk an earlier version kept, the TUI going by it, the command line
  walking home again once, through a walk kept again from it; a folder that can't be read for a while. Each
  mutation-checked: the old rule, ctime not compared, not kept again for a stamp alone, kept again while still to
  list, only a time before the walk's start kept, no walk again for an earlier version's walk, a partly stamped walk
  taken as stamped, each fails one of them. Not as terminal checks: a disk taken away (a check's slipbox reads the
  machine's mount table, which a test can't change: the unit test fakes it), a ctime in whole seconds (no such file
  system in a check). The two-second rule is driven with a folder's time ahead of the clock, which the same rule
  stamps to list again (a check can't hold slipbox's clock; the unit test holds it for a time just past).
  Ran: tests/vault.test.ts (374), the TUI, core, CLI, regressions and marks tests of home, walk and watch (51),
  terminal checks `home` (16/16, `SLIPBOX_TERMINAL_JOBS=2`), the typecheck, the lint, `check:size`,
  `check:boundary`, `check:docs`; 15 mutations against the unit tests and 8 against the terminal checks, each failing
  one. Live, on a scratch home: a folder made unreadable, walk.json written once (its notes out), the same over three
  commands, its notes back once readable.
- 2026-10-24: Review loop, round 4, on `4acdb54`: the first reviewer (10 findings, none in the main fix). The second
  review ended partway; the maintainer was asked. Verified and taken:
  1. `homeWalkKept` asking for every folder's stamp reached `openVault` (`src/core/workspace/links/reach.ts`), which the
     TUI uses too
     (making a vault part of home, a rename or move across it): after an upgrade, such an action walked all of home in
     one blocking pass, where the design says the TUI goes by its walk until the background index's next pass. The
     stamps are asked for by the command line's graph alone (`homeWalkKept(…, stamped)`, `src/cli/common.ts`); a plan
     across home goes by the walk kept as it is (test: `openVault` over an earlier version's walk leaves it unwalked;
     terminal check: notes previewed as part of home from the TUI, home not walked; both mutation-checked).
  Rejected: ctime-only changes to many folders listed again in one build (round 3's: the maintainer's trade-off); a
  cache that can't be written holding an earlier version's walk, walked again at every command (as a home whose cache
  can't be written is today, with no walk kept); a folder that can't be read when home is walked, never in the walk, so
  never tried again until home's next walk, a chmod moving only its own ctime (as before this fix: asked the maintainer
  whether to take it in); a fine ctime moving once a kernel tick (Linux before 6.13): a time put back, the listing and
  the same time put back with a note all within those few milliseconds — the design's limits say it, and settling every
  recent ctime would list again every folder a command meets within two seconds of a `cp -a`; a folder set back to a
  time after both its stamp and the walk's start counted as moved on, so listed again at every build till something else
  is kept, as "newer than the walk" listed it before; the two-second test's note found by its ctime too (its -1 stamp is
  what's checked, and mutation-checked); the double stat, the parse in `homeWalkKept` (it parsed walk.json before), and
  the watcher's own rule (rounds 1–3). Added for every case's terminal check: in "set back with nothing new in it", a
  time that only moved on, the walk not written again (mutation-checked). Ran: the home, walk, rename, move and deinit
  tests of `tests/vault.test.ts`, `tests/cli.test.ts` and `tests/core.test.ts` (192), terminal checks `home` and "space
  v m gives" (18/18).
- 2026-10-24: The maintainer's answers: the second reviewer's part ends here (rounds 1 to 3, and part of
  round 4); the first reviewer alone for the rest. And the gap found in round 4 is fixed here: a folder
  that can't be read when it's listed isn't in the walk, so nothing the walk keeps moved when it became readable (a
  chmod moves only its own ctime). `listDir` stamps the folder holding it to list again (`RELIST`), in a walk that
  stamps (home's): each build lists that folder again and tries this one, the walk not written again while it stays
  unreadable (`byStamp` waits for a stamp). The walk's folders, which the watcher subscribes to, stay those read. A
  folder that stays unreadable costs its parent's listing at each build. Test: `p` unreadable as home is walked, home's
  top stamped to list again, the walk unchanged at the next build, `p`'s note found once it's readable
  (mutation-checked); terminal check: "home: a folder that can't be read when home is walked …" (mutation-checked).
  Live, on a scratch home: `~/locked` unreadable as home is walked, walk.json the same at the next command, its note
  found once readable, home's time unchanged. The design, the manual and a CHANGELOG line say it.
  Ran: tests/vault.test.ts (376), the TUI, core, CLI, regressions and marks tests of home, walk and watch (51),
  terminal checks `home` and "space v m gives" (19/19), the typecheck, the lint, `check:size`, `check:boundary`,
  `check:docs`.
- 2026-10-24: Review loop, round 5, on `7ffe090` (the first reviewer alone, as the maintainer chose): 12 findings, none
  high. Verified and taken:
  1. A vault home's again (its marker gone) is listed straight from the folders to list, its parent not listed then,
     so if it couldn't be read nothing was stamped to list again and it left the walk for good. `keptWalk` stamps the
     folder holding it to list again (test and terminal check: `proj`/`plot` made a vault, its marker removed and the
     folder made unreadable, then readable; both mutation-checked).
  2. A walk that couldn't read home's top holds no folder, so no stamp was missing and the command line took it as
     stamped. `homeWalkKept(…, stamped)` asks for home's top's stamp too (test and terminal check: home's top
     unreadable as it's walked, the next command walks it again; both mutation-checked).
  3. A folder listed again that can't be read stamped its parent to list again when the parent was listed again too,
     though it's to list again itself. Only a folder the walk didn't have stamps its parent (the stamping moved from
     `listDir` to `SlicedWalk`, which knows the walk's folders) (test: `a` and `a/b` both listed again, `a/b`
     unreadable, `a` keeps its stamp; terminal check: home's top and `garden` both listed again; both
     mutation-checked).
  4. The terminal check made `garden` unreadable in its setup, outside the run's `finally`: it walks home in the run
     now, inside it.
  5. Three copies of `parentOf`: one, in `src/core/workspace/walk/walk.ts`.
  Rejected: the errors of a folder that can't be listed aren't reported (`keptWalk`'s `errors: []`, as before; said at
  every command, a folder that stays unreadable would warn at each one); a folder stamped to list again by the walk
  (listed within two seconds of its change) is listed again at every build till something else is kept, as before the
  stamps, and keeping the walk for it would write walk.json a second time after most notes an agent writes; a folder
  that stays unreadable (macOS's protected folders, a root-owned volume) keeps its parent listed again at each build, a
  few milliseconds, the cost the maintainer took with the fix; the TUI going by an earlier version's walk till its
  background index's pass (the maintainer's choice); `restamp` writing a stamp as `stampOf` wouldn't, just after a
  change (deliberate: it stands for a walk that saw the folder long enough after); the double stat and walk.json's size
  (rounds 2 to 4). Ran: tests/vault.test.ts (379), the TUI, core, CLI, regressions and marks tests of home, walk and
  watch (51), terminal checks `home` and "space v m gives" (21/21), the typecheck, the lint, `check:size`,
  `check:boundary`, `check:docs`; 4 mutations (each failing a unit test and a terminal check).
- 2026-10-24: Review loop, round 6, on `6aeb419` (the first reviewer alone): 11 findings, none high. Verified and taken:
  1. A folder kept whose stat failed for something other than its being gone (a permission on the folder holding it,
     a policy, a disk's error) was dropped with all it held, its parent keeping its stamp: never tried again. Such a
     folder, and a vault home's again that can't be looked at, now stamp the folder holding them to list again, in one
     place in `keptWalk` (test and terminal check: a folder made readable but not searchable, the walk kept as if it
     had seen it so, the folder in it lost and its parent to list again; both mutation-checked).
  2. A walk that couldn't read home's top holds none of it, and a plan across home (`openVault`) still took it: a
     rename across home would have missed the links in its notes. `homeWalkKept` under a config asks for home's top,
     for the command line and a plan alike (test: `openVault` over such a walk walks home again; terminal check: notes
     previewed as part of home from the TUI over such a walk; both mutation-checked).
  3. The terminal checks' `stampOf` said null both for a folder not in the walk and one without a stamp; it says
     undefined for the first now, and the time-put-back step asks that home's top have a stamp of its time.
  4. The CHANGELOG's line for a folder that couldn't be read says what a home an earlier version walked gets.
  5. Session details had come into this Log (reviewers by name, a usage limit): they were taken out; "the maintainer"
     for what was asked. (Since, the maintainer asked that a skipped Codex part be noted as such: see below.)
  Also: tests that a walk isn't kept again compared walk.json's bytes, which two builds in the same millisecond write
  alike, so a mutation keeping it again could pass; they mark the walk kept and check the mark is still there
  (`markKept`, `unwritten`).
  Rejected: ctime-only changes listed again in one build, an older slipbox rewriting the walk, the double stat and
  parse (rounds 3 to 5); stamping the parents of folders the walk couldn't read in one place for the walk and
  `keptWalk` alike (two places with two roles: a walk's own folders, and what `keptWalk` loses without listing).
  Ran: tests/vault.test.ts (381), the TUI, core, CLI, regressions and marks tests of home, walk, watch, rename, move
  and deinit (156), terminal checks `home` and "space v m gives" (23/23), the typecheck, the lint, `check:size`,
  `check:boundary`, `check:docs`; the 21 mutations against the unit tests, each failing at least one, twice over for
  those a rewrite shows.
- 2026-10-24: Rebased on `origin/dev` (#34, #44 merged since): the CHANGELOG's lines and two imports, both sides kept.
- 2026-10-24: Review loop, round 7, on `21b5cbd`: 9 findings, one reproduced. Verified and taken:
  1. Reproduced by the review: a walk that couldn't read home's top was no walk of home's to the command line and a
     plan across home, but the TUI built from it an empty home, its top never listed again, till the background
     index's next pass. Such a walk is no walk of home's at all now (`fits`), as one under other settings isn't: the
     TUI shows home's top, its walk made again (test: `homeWalk` from such a walk gives home's top, not walked;
     terminal check: the TUI over such a walk lists `todo.md`; both mutation-checked).
  2. A vault home's again through a link the walk follows: `back` statted through the link, the check for one lost
     didn't (`lstatSync`), so one whose target can't be looked at was dropped unseen. One `statSync` decides both
     (test and terminal check: `~/lnk` to `shed/proj`, `shed` not searched any more, home's top to list again; both
     mutation-checked).
  3. The design still said a plan across home always goes by the walk kept; the command line's comment left the
     walk without home's top out. Both say it now.
  Rejected: a ctime-only change keeps the walk again, once per change (the ctime trade-off); `keptWalk`'s errors not
  reported, the double stat, the command line alone walking an earlier version's walk (rounds 3 to 6); the errno
  check's other copies (`src/core/skill.ts`, `src/tui/explorer.ts`: outside this fix).
  Ran: tests/vault.test.ts (384), the TUI, core, CLI, regressions and marks tests of home, walk, watch, rename, move
  and deinit (156), terminal checks `home` and "space v m gives" (24/24), the typecheck, the lint, `check:size`,
  `check:boundary`, `check:docs`.
- 2026-10-24: Review loop, round 8, on `efb615a`: 10 findings, one reproduced. Verified and taken:
  1. Reproduced by the review: a build that couldn't stat home's top (a folder above it not searched, a disk's error)
     dropped everything and kept the walk as `dirs: [""]` without a stamp, which the rule of round 7 took as a walk of
     home's: home stayed empty once its top could be read. Such a build keeps no walk; the one kept stays as it was
     (test: home's top unstattable for a build, the walk unwritten and whole after; mutation-checked). No terminal
     check: a check's own config, state and cache sit beside its home, so the folder above home can't be made
     unsearchable without them.
  2. A vault home's again through a link whose target is gone for now (a disk taken away): the stat said ENOENT,
     taken as gone, though the link is there. A link's entry is tried again from the folder holding it (test and
     terminal check: the target moved away, home's top to list again; both mutation-checked).
  3. A vault home's again that the walk's cap left unreached was taken as unreadable, its parent then listed again at
     every build. One left in the walk's queue isn't (test: a cap of five notes reached before it, home's top keeping
     its stamp; mutation-checked). No terminal check: home's caps can't be set from outside it.
  4. `homeWalkKept` without a config took a walk without home's top (tests use that form): it asks for the top too
     (mutation-checked).
  5. Two doc comments stacked on `fits`: one.
  Rejected: an older slipbox still running, `keptWalk`'s errors not reported, a folder that stays unreadable keeping
  its parent listed again, the stamping of parents in three places, the errno check's copies, the double parse
  (rounds 3 to 7).
  Ran: tests/vault.test.ts (387), the TUI, core, CLI, regressions and marks tests of home, walk, watch, rename, move
  and deinit (156), terminal checks `home` and "space v m gives" (24/24), the typecheck, the lint, `check:size`,
  `check:boundary`, `check:docs`; the 26 mutations against the unit tests, each failing at least one.
- 2026-10-24: Rebased on `origin/dev` after #47 (home's walk on its own thread in the TUI), the branch squashed to one
  commit first, its rounds being in this Log. `keptWalk` takes #47's `persist`: a build on the walk's thread hands its
  walk back unkept, and the TUI keeps it, the stamps crossing in it (a `Map`, which the worker's messages clone). The
  design keeps #47's lines and this task's. Ran: tests/vault.test.ts and tests/walk-thread.test.ts (427), the TUI,
  core, CLI, regressions, marks and distribution tests of home, walk, watch, rename, move, deinit and the graph (183),
  terminal checks `home`, "space v m gives" and `slow-disk` (36/36), the typecheck, the lint, `check:size`,
  `check:boundary`, `check:docs`. The terminal checks that read a stamp after the TUI kept the walk show the stamps
  crossed.
- 2026-10-24: Codex's part of the review loop (the second reviewer's) was skipped from round 4 on: it reached its usage
  limit partway through round 4 and stopped, so rounds 4 to 8 had the first reviewer alone. As the maintainer asked
  since, its part is done instead by a fresh, independent reviewer, on the pull request as it stands (`2ea7ef3`).
  The independent review, for Codex's skipped part (on `2ea7ef3`): no correctness regression found in the stamps; the
  stamps cross the walk's thread whole. Verified and taken:
  1. A note whose stat failed for something other than its being gone (a permission, a policy, a disk's error) was
     dropped, its folder keeping its stamp: never tried again (so before this fix too). Such a note has its folder
     stamped to list again, in `keptWalk` and in a walk's own listing (`addFile`), so it's tried again at each build
     (test: a folder's notes not statted, the folder to list again, and still after it's listed again; terminal check:
     `garden` so; both mutation-checked).
  2. #47's test comparing the walk kept on either thread compared the stamps, which say "to list again" by when each
     walk listed a folder: which folders are stamped is compared now (this change's own). CI's failure of that test on
     `2ea7ef3` (`test (ubuntu-24.04)`, "+4 lines received") was not this change: the 4 lines are `result.opened`, an
     index's `opened` in its last answer only when one slice opened and ended it — the flake PR #54 fixes (in
     `takeAnswer`). A workaround for it in the test was taken out again, so as not to cross #54; until #54 is merged,
     that job can fail so and is rerun.
  3. The two-second test's comment said more than its last check shows (its ctime finds the note too): the -1 stamp is
     what holds the rule, and it says so.
  Rejected: an older slipbox still running (rounds 3 to 8); a busy-named folder with no note at its top left out
  without a trace, so a note made in it later waits for a full walk (so before this fix, and another rule: a task of
  its own if wanted).
  Ran: tests/vault.test.ts and tests/walk-thread.test.ts (428), the related TUI, core, CLI, regressions, marks and
  distribution tests (183), terminal checks `home`, "space v m gives" and `slow-disk` (36/36), the typecheck, the lint,
  `check:size`, `check:boundary`, `check:docs`; mutations M29 and M30 (the two new rules), each failing a unit test and
  the terminal check.
- 2026-10-24: Rebased on `origin/dev` after #42 (home's watcher leaving home to its walk) and #40: `watch.ts` takes
  `SETTLE_MS`, `settled` and `parentOf` from `walk.ts` beside #42's imports from `home.ts`; `under` exported as #42
  has it; the manual keeps #42's sentence; the terminal checks' switcher helper renamed (`switcherShows`) beside
  #42's. Ran this change's own tests (the #12 and home walk tests of tests/vault.test.ts, 27; the walk-thread
  comparison; the TUI's folder-of-home test), its terminal checks (12/12, `SLIPBOX_TERMINAL_JOBS=2`), the typecheck,
  the lint and `check:docs`; the rest left to CI.
- 2026-10-24: Rebased on `origin/dev` after #49, #59 (dev's hang since #42 fixed) and #54 (an index's end the same
  however its work was sliced), cleanly. Ran this change's own tests (27; the walk-thread comparisons, #54's
  included; the TUI's folder-of-home test), its terminal checks (12/12), the typecheck, the lint and `check:docs`.
- 2026-10-24: Review loop, round 9, on `96e11f0`, by Codex and the code-review skill. Codex: no correctness finding;
  two gaps in the tests. The code-review skill: 10 findings, two reproduced. Verified and taken:
  1. Reproduced: a vault home's again through a link whose target is gone was tried again for one build only — the
     next build listed the folder holding the link again, filed the link as "broken symlink", and stamped the folder
     as seen. And more broadly, a folder listed again while a followed link in it can't reach its target lost that
     link for good (so before this fix too, but the stamps list folders again more often). A link whose target can't
     be looked at now has its folder stamped to list again, in a walk's listing (`handleSymlink`) and for a note link
     in `keptWalk`, so it's looked at again at each build till its target is back (tests: a vault through a followed
     link to another disk taken away and back, its marker gone meanwhile; a folder through a followed link, the disk
     not searched while home's top is listed again; a note through a followed link away and back; terminal check: the
     first two through the command line and the TUI; each mutation-checked).
  2. The two link tests of rounds 7 and 8 recorded a link inside home as a vault of its own, which no walk does (a link
     to a folder within home is a second name), and checked only the first build: replaced by the tests in 1, which
     follow a link to another disk and find the notes once it's back.
  3. Codex: the terminal check named for "stamps stay with their folders wherever walk.json has them" didn't reorder
     them: it rotates the walk kept's folders and stamps now (mutation-checked: matching stamps to the folders sorted
     fails it).
  4. Codex: the walk-thread test compared which folders are stamped, never the values: a test that the walk's thread
     hands back a folder's stamp as made (its mtime and ctime, against the folder's), and a terminal check that the
     walk the TUI kept has `garden`'s whole (mutation-checked: a ctime taken as the mtime fails both).
  5. `homeWalkKept` without a config re-did part of `fits`: `fits` takes its filter as optional, one definition.
  Rejected: `homeWalk`'s result with folders asked for has no stamps (nothing keeps it; #47 keeps `keptWalk`'s own
  walk); a folder that stays unreadable keeps its parent listed again, the extra stat, the double parse (the
  maintainer's trade-off, rounds 2–8); this as a workstream rather than a task (a small change to the design goes as
  an issue and one pull request, D223, as said in round 1).
  The maintainer's rule since: the round in hand is the last; smaller findings after it go to this Log or a follow-up
  issue, not into the pull request. Round 9 is the last.
  Ran: this change's own tests (the #12 and home walk tests of tests/vault.test.ts, 27; the walk-thread comparisons and
  the stamps' values, 3; the TUI's folder-of-home test), its terminal checks (12/12), the typecheck, the lint,
  `check:size`, `check:docs`; mutations M5, M31, M32, M33, each failing a unit test, and those of M5, M31 and M33 a
  terminal check too.
