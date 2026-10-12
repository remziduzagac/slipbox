---
status: done
assignee: claude-exports2
blocked_by: []
created: "2026-10-12"
---

# DF-T11: Copies into a folder; every export's pictures the root's; a folder's update check warned of

The follow-ups F1, F2, F4, F5, F6.

## Description

- **F1, F2 (DF-D20, DF-D21):** `slipbox cp` (and the TUI's copy where a path is typed) into an existing folder or
  one ending in `/`, made if missing, as `mv` now does (`moveTarget` in `src/core/rename.ts`).
- **F5 (DF-D24):** Word, PDF, the web page and the e-book embed only pictures from inside the note's root (realpath,
  as the Markdown export's check in `src/core/export/markdown.ts`); one from outside shows as its caption.
- **F6 (DF-D25):** lookups by name leave out the pictures folder of any Markdown export, the folder beside a file
  slipbox marked as its export (`byFileName` in `src/core/graph.ts` skips `*.export.assets/` today).
- **F4 (DF-D23):** a folder's `update.check` warned of as `render.images_remote` is (`USER_ONLY`,
  `src/core/config.ts`).

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task, without IDs; `tests/docs.test.ts` passes.
- The new design text under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; never the whole suite (the coordinator runs it once, after merging).

## References

- Delivers: DF-D20, DF-D21, DF-D23, DF-D24, DF-D25.
- Docs: docs/manual/files.md, cli.md, export.md, privacy.md, configuration.md, links-and-roots.md,
  docs/guides/exporting.md.

## Log

- 2026-10-12, claude-exports2: started; read DF-D20, DF-D21, DF-D23–DF-D25, DF-D1, DF-D2, DF-D4, DF-D18, DF-T4's and
  DF-T5's Logs.
- 2026-10-12, F1, F2, found: on the reference set `slipbox cp inbox.md projects/` made `projects.md`, and `cp inbox.md
  newdir/` made `newdir.md`: `cp` passed its path to `copyPath` as typed, a trailing `/` stripped. `slipbox mv weekly
  archive/` already went into `archive/weekly` (`moveTarget` takes a path ending in `/` as a folder for a folder too):
  DF-D21 holds for `mv`, pinned now by vault.test's "a move typed as a path…" (`drafts` to `archive/`).
- 2026-10-12, F1, F2, fixed: `slipbox cp` reads its path as `mv` does (`destArg(…, true)`: `.` and `..` from the
  current folder, the root a place) and puts it through `moveTarget`, so a folder there or a path ending in `/` is
  into it, made if missing. A file where a folder would be (`cp a.md b.md/`) is refused in `copyPath` as `mv` refuses
  it (`fileInTheWay`, exported from `core/rename.ts`); it threw `EEXIST` from `mkdir` (exit 1) once `/` meant a folder.
  The TUI has no copy to a typed path: `space n shift+y` copies beside the note, a paste goes into the folder
  selected, so nothing changes there.
- 2026-10-12, F1, chosen: a copy into its own folder (`cp ideas/coffee.md ideas/`, or `.` there) makes
  `coffee-copy.md` beside it, as `p` on its own folder does in the explorer, rather than refusing it as `mv` refuses
  "already there" (recommendation): the explorer's paste is the TUI's copy into a folder, and refusing helps no one.
  `cp a.md a.md`, the whole path its own, is still refused.
- 2026-10-12, F1, F2, test: cli.test "cp into a folder, as mv…" (a folder there, `ideas` and `ideas/`, `later/` made,
  a folder copied to `archive/`, `.` from a subfolder, into its own folder as name-copy, a whole path, a file in the
  way). Mutation-checked with a runner that restores each file: `moveTarget` not called, `destArg` without `into`,
  the own-folder rule taken out, `copyPath`'s file-in-the-way check taken out: each fails it.
- 2026-10-12, F5, found: the Markdown export checked the root in `markdown.ts` (`landsInside(doc.root, …)`); the
  other writers read any file the assembler found. Fixed: the assembler (`picture` in `export/assemble.ts`) marks a
  picture whose file lands outside the root by its real path (`landsInside`, so a link inside leading out counts as
  out) `outside`, a web picture's cached copy never so; `pictureData` (HTML, EPUB, and Word and PDF through
  `rasterOf`) never reads one, so it is its words as an unreadable picture is (the docs' "its description");
  `convertPictures` doesn't read it either; Markdown links it by the same mark, its own check gone, and with it
  `ExportDoc.root`, which only that check used. The root is the exported notes' root, as DF-D2's check had it: a
  picture of a note embedded from another root counts as outside.
- 2026-10-12, F5, test: export.test "a picture from outside the root, or a link in it leading out, held by no format"
  (a PNG by a path out, a link inside to it, a BMP out; the assembler's marks, `convertPictures` reading none; Word's
  media, the web page's `<img>`, the e-book's images and the PDF's each the root's picture alone, the others their
  words). Mutation-checked: no mark (it and Markdown's fail), the mark by path rather than real path (both fail),
  `pictureData` reading a marked one, `convertPictures` reading one (it fails), Markdown not linking one (Markdown's
  fails).
- 2026-10-12, F6, fixed: `Graph.byFileName` (both `resolveWiki` and the converter's `resolveLegacyWiki`) leaves out a
  file inside an export's pictures folder (`exportPicturesFolder`): a segment `<name>.assets` that is
  `*.export.assets` by its name, as before, or sits beside a note `<name>.md` or `<name>.markdown` that carries the
  export's mark (`generator: slipbox` in its front matter), read once for each time the note's file changes
  (`marked`, by its entry's time). A name that goes through the folder (`[[book.assets/dal.png]]`) still reaches the
  copy: counted by segments now, where the name starts against where the folder is. `isExport` and `EXPORT_MARK` moved
  to `core/export/mark.ts` (re-exported by `export/index.ts`), so the graph reads the mark without the writers.
- 2026-10-12, F6, chosen: `*.export.assets/` stays left out by its name alone, its export beside it or not, and a
  folder of another name only beside a marked `.md` or `.markdown` note (recommendation): DF-D25 adds the marked
  file's folder to DF-D18's rule rather than replacing it, and an export written under another extension
  (`-o book.txt --to md`) is no note, so no lookup reads it.
- 2026-10-12, F6, test: vault.test "any Markdown export's pictures, whatever its name…" (a `book.assets/` beside a
  marked `book.md`, a `deep.assets/` beside a marked `deep.markdown`, a `mine.assets/` beside an unmarked `mine.md`
  answering, a name through `book.assets/`, the converter's reading; the mark taken out, the folder answers again).
  Mutation-checked: only `*.export.assets` left out, `.markdown` not looked for, any `.assets` beside a note left
  out, the mark cached for good, a name through the folder not taken: each fails it (the last the DF-D18 test too).
- 2026-10-12, F4, fixed: `update.check` joins `USER_ONLY` (`core/config.ts`), "what reaches the network is yours to
  allow", so a folder's file that sets it, either way, has it dropped before the merge, with the warning DF-D1's keys
  get. The update check itself still reads your own config alone (`tui/run.ts`), as before. The reference set's
  kestrel turns it off in its `.slipbox/config.toml` (warned), and CASES.md says so.
- 2026-10-12, F4, test: core.test "what reaches the network is yours alone…" now sets `update.check` in the folder's
  file too, against yours: yours stands, three warnings, the one for `update.check` as said. Mutation-checked: the
  entry taken out of `USER_ONLY`, it fails.
- 2026-10-12, tried (D209) on a fresh copy of the reference set in my scratch folder, its own XDG folders, the CLI:
  in `notes/`, `cp inbox.md projects/` made `projects/inbox.md` (before the fix, `projects.md`), `cp inbox.md
  projects` again refused as there (exit 5), `cp weekly archive/` made `archive/weekly`, `cp inbox.md .` made
  `inbox-copy.md`, `cp inbox.md index.md/` refused (exit 5, before: `EEXIST`, exit 1); from `projects/`, `cp
  kyoto-trip.md ..` to the top, `./` beside it as `kyoto-trip-copy.md`. In `work/kestrel`, `slipbox info` warns
  `… sets update.check, which only your own config may set (what reaches the network is yours to allow); ignored`
  beside the other two. In `hobbies/cooking`, a note with `![[dal.png|200]]`, a photo of the photography root by path
  and a link in `attachments/` leading to another: exported to my scratch folder as HTML, Word, PDF, e-book and
  Markdown, each held the dal alone (one `<img>`, one Word medium, one e-book image, one PDF image), the other two
  their words in italics; `book.md` linked them. `-o Recipes/Weeknight/book.md` inside the root, then `resolve
  '![[dal.png]]' --from Recipes/Weeknight/Dal.md` gave `attachments/dal.png`, `![[book.assets/dal.png]]` the copy;
  with the mark taken out of `book.md`, the nearer copy answered again.
- 2026-10-12, docs: cli.md (`cp`'s path read as `mv`'s, with an example; Word, PDF, the web page and the e-book the
  root's pictures only), files.md (the command table's `cp`, `cp` beside `mv`'s paragraph, `mv drafts archive/`),
  export.md (the pictures that go in; Markdown's pictures folder, whatever its name, out of lookups; "never takes in a
  file from outside the root" among what an export never does; the limit gone), guides/exporting.md (pictures from
  elsewhere), links-and-roots.md (lookups by name), configuration.md and privacy.md (`update.check` among what only
  your own file sets, warned of), guides/making-it-yours.md (the update check among them), the skill (`cp`; the root's
  pictures). The CLI's help says `cp` goes into a folder too. The design text in DF's design.md, under the three
  entries: export.md's module table, § The assembler, § Markdown, § Known limits and links.md § Wikilinks (DF-D24,
  DF-D25); links.md § Renames and moves (DF-D20, DF-D21); trust.md § What runs and distribution.md § Updates
  (DF-D23), each heading naming what it changes.
- 2026-10-12, checks: the typecheck, the boundary and the dependency gates pass; docs.test, export.test, core.test,
  vault.test and home.test pass whole; cli.test all but "stat: which root a note is in…", which fails in any git
  worktree (the demo's root named `halden@<branch>`), as DF-T4's and DF-T5's Logs say. No whole suite, as asked.
- 2026-10-12, terminal tests: none covers these. world-export.ts's Markdown scenario checks a root's picture copied
  beside the export, which still holds; no scenario exports a picture from outside the root, copies with `slipbox
  cp` into a folder, looks up a picture beside a `-o book.md` export, or loads a folder's `update.check`
  (world-fixes.ts's privacy scenario sets `render.images_remote` alone).
- 2026-10-12: accepted on the coordinator's recommendation, the user having said to take them as answers until done; done.
