---
status: done
assignee: claude-export
blocked_by: []
created: "2026-10-11"
---

# DF-T3: Exports: pictures of the root only, never over a note, folders made, lookups clean

The Markdown export copies only pictures from inside the root; no export writes over a note of any root; `-o dir/`
makes the folder; an export's pictures don't answer lookups by name.

## Description

- **A2 (DF-D2):** the Markdown export's `.export.assets/` takes only files that are pictures (by content), from
  inside the note's root; anything else stays a link (`src/core/export/`).
- **A3 (DF-D3):** `slipbox export -o` refuses a note of any root (exit 5); an earlier Markdown export can still be
  replaced. Check the TUI's path refuses alike.
- **A5 (DF-D5):** `-o` ending in `/` makes the folder and writes `<note>.<ext>` in it, CLI and TUI.
- **C6 (DF-D18):** lookups by name (wikilinks, embeds) leave out `*.export.assets/` folders.

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D2, DF-D3, DF-D5, DF-D18; the root's design/export.md, design/links.md § Wikilinks.
- Docs: docs/manual/export.md, docs/guides/exporting.md, docs/manual/cli.md, docs/manual/links-and-roots.md.

## Log

- 2026-10-12: started; read DF-D2, DF-D3, DF-D5, DF-D18, design/export.md, design/links.md § Wikilinks.
- 2026-10-12, A2: `toMarkdown` copies a file into `.export.assets/` only when it is a picture by its bytes (a
  raster's header, or an SVG's start: `looksLikeSvg`) and, but for a web picture's cached copy, lands inside the root
  by its real path (`landsInside`, so a symlink out counts as out); `ExportDoc` carries `root` for it. Anything else
  a picture link names becomes a Markdown link to the file from the export's folder, `[alt](../notes.txt)` (its alt,
  else the file's name), not its words: DF-D2's "stays a link". Read so: a link from where the export is, since an
  embedded note's paths are from its own folder and `-o` may put the export elsewhere; the address as written would
  break there. A coordinator may prefer the address as written; one line to change (`linkTo`). The other formats are
  unchanged, as DF-D2 says Markdown only: their limit (a picture outside the root embedded) stays in Known limits.
  Requirements' "An export copies pictures of the root only" (DF requirements.md § Changes) reads wider than DF-D2.
- 2026-10-12, A2 test: export.test.ts "only pictures of the root copied…" (a text file, a fake `.png` by link and by
  `![[…]]`, a picture outside, a symlink out, exported into a subfolder). Mutation-checked: no root check, no content
  check, a root check by path rather than real path: each fails it.
- 2026-10-12, A3: `exportTarget` refuses a note of any root (`noteOfARoot`): this root's by its index, as before; any
  other existing file of a note's name inside a root (`findVaultRoot`, of the path as reached and of its real path, so
  a symlinked folder into a root counts) — a nested root's note included. The message names the path as slipbox shows
  it (`graph.shownPath`), `~/…` or absolute for another root's. The TUI goes through the same function: refused, the
  window kept. Tests: export.test.ts "never over a note of any root…" (another root's, a nested root's, through a
  symlinked folder; another root's non-note and a plain folder's `.md` replaced; another root's earlier export
  replaced); cli.test.ts "export: -o ending in / …" (exit 5, the note untouched); tui.test.ts "a name ending in / is a
  folder…" (warned, the window kept). Mutation-checked: this root only (all three fail), no real-path check, any
  file of a root rather than notes (the unit test fails).
- 2026-10-12, A5: `exportTarget` takes a path ending in `/` (`namesFolder`) as a folder, the note's name in it;
  `writeExport`'s `atomicWrite` makes it. The CLI no longer takes a format from a folder's name (`-o out.v2/` or an
  existing `exports.v1`: `.v2` was a usage error). The TUI: a name ending in `/` that isn't there is made and gone
  into, the note's name given back, as a folder named is gone into and as `ctrl+n` makes one; `enter` then exports
  there. Chosen over exporting at once, to keep one rule for a folder named in the window; the coordinator may say
  otherwise. Tests: export.test.ts "a path ending in / names a folder…", cli.test.ts (`-o made/v1.2/`), tui.test.ts
  (`made/v1/`). Mutation-checked: `namesFolder` false (unit and CLI fail), the CLI's format from a folder's name (CLI
  fails), the TUI's folder not made (TUI fails).
- 2026-10-12, C6: `Graph.byFileName` (both `resolveWiki` and the converter's `resolveLegacyWiki`) leaves out paths in
  a `*.export.assets/` folder, unless the target itself goes through one (`[[r.export.assets/dal.png]]`, which names
  it). Only the default name is recognised: `-o book.md` puts its pictures in `book.assets/`, which lookups still
  see (DF-D18 names `*.export.assets/`). Test: vault.test.ts "a Markdown export's pictures answer no lookup by name…".
  Mutation-checked: copies not left out, a path through the folder not taken, the converter's reader unfiltered.
- 2026-10-12, tried (D209) on the reference set in the scratch folder, its own XDG folders: in `hobbies/cooking` a note
  with `![[dal.png|300]]`, `![shelves](pantry.csv)` and `![harbour](../photography/images/harbour-01.jpg)` exported
  `--to md -o <scratch>/out/leak/`: only `dal.png` copied, the csv and the other root's photo links from the export;
  `-o <scratch>/out/made/v1.2/` made the folder and wrote `Leak test.docx`; `-o …/photography/index.md` exit 5, the
  note untouched, `-o Home.md` exit 5, the earlier `.export.md` replaced. C6: a card in `Recipes/Weeknight` exported
  beside itself, then `resolve '![[dal.png]]'` gives `attachments/dal.png` (the code before: the export's copy), a
  path through `Card.export.assets/` the copy, `links` "the shortest path of 2 named so". The TUI headlessly, as
  tui.test.ts drives it: `space n o`, Word, `made/v1/` made and gone into, another root's note refused with the
  window kept, `enter` wrote `made/v1/Leak test.docx`.
- 2026-10-12, docs: docs/manual/export.md (the Save As name, the CLI's `-o`, notes of any root, Markdown's pictures
  and their lookups, never-does, limits), docs/guides/exporting.md (the folder with `/`, Markdown's pictures; the
  "Markdown export inside the folder" caveat replaced by pictures from elsewhere), docs/manual/cli.md (`-o`, any
  root, the root's pictures), docs/manual/links-and-roots.md (lookups by name leave out `.export.assets`),
  skills/slipbox/SKILL.md (`-o out/`, Markdown's pictures, any root). Design text in DF's design.md.
- 2026-10-12, checks: the typecheck and the boundary pass; export.test.ts, vault.test.ts and docs.test.ts pass whole.
  cli.test.ts: all but `stat: which root a note is in`, which expects `root halden` and gets
  `halden@worktree-agent-…`: it fails in any git worktree, not from this change. tui.test.ts on a saturated machine:
  12 timeouts in search, lint, linters, pictures and comments; rerun alone, all pass but "the background index parses
  a big note on other threads" (a timing bound, 250 ms, met at 713 under load). A whole-suite run was stopped at the
  coordinator's word (seven agents' runs at once); its failures were timeouts and timings of the same kind, and
  render.test.ts's pipeline-cookbook snapshot (a Mermaid block "too wide to draw") and servers.test.ts's locks (a
  fake lock from another test file's run), neither in what this task touched.
- 2026-10-12: accepted on the coordinator's recommendation, the user having said to take them as answers until done; done.
