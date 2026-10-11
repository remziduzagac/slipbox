# Decisions: what writing the docs found

## DF-D1: What reaches the network is yours alone to allow (2026-10-11)

**Decision:** `render.images_remote` and `lsp.auto_install` are read from your own config only, as `update.check` is;
a folder's `.slipbox/config.toml` that sets them is ignored, with a warning, as for the programs only you may name
(D166).

**Why:** A folder you clone could turn on fetching its notes' web pictures, which tells their servers who read what,
or installs from npm, against your own settings. The user's answer (A1).

**Not chosen:** a folder may make them stricter, never looser: a second rule to explain.

## DF-D2: The Markdown export copies pictures of the root only (2026-10-11)

**Decision:** The Markdown export copies into its `.export.assets/` only files that are pictures (by their content),
from inside the note's root; any other target stays a link, as the other formats show it as its text.

**Why:** A picture link naming `../private/secret.txt` copied the file into the export, for anyone it was sent to. The
user's answer (A2).

**Not chosen:** pictures from anywhere on disk.

## DF-D3: No export over a note, of any root (2026-10-11)

**Decision:** `slipbox export -o` never writes over a note, of this root or another (exit 5); an earlier Markdown
export can still be replaced. The TUI's Save As keeps asking before replacing any other file.

**Why:** It refused only this root's notes, and replaced another root's silently. The user's answer (A3).

## DF-D4: A move into a folder (2026-10-11)

**Decision:** A new path that is an existing folder, or ends in `/`, means into it: `slipbox mv note.md ideas/` makes
`ideas/note.md`, as the shell's `mv` does; the TUI's move likewise.

**Why:** It renamed the note to `ideas.md` beside the folder. The user's answer (A4).

**Not chosen:** refusing, and asking for the whole path.

## DF-D5: An export to a folder makes it (2026-10-11)

**Decision:** `-o` ending in `/` names a folder: made if missing, the export written in it under the note's name.

**Why:** It wrote a file named after the folder. The user's answer (A5).

## DF-D6: Reloading an unsaved note asks to discard (2026-10-11)

**Decision:** `space n r` on a note with unsaved changes whose file hasn't changed asks "discard your changes to
<note>?": `y` reloads it from disk, `n` or `esc` keeps your text; autosave is left as it was. The conflict prompt stays
for a file that did change.

**Why:** It opened the conflict prompt, which said the file had changed, and `esc` there turned autosave off. The
user's answer (A6).

## DF-D7: The launcher replaces a link, never writes through it (2026-10-11)

**Decision:** `scripts/install-local.sh` removes a link at its launcher's path and writes a file of its own, saying it
replaced a release's link; a release's own files are never written.

**Why:** Over a release install it overwrote the release's binary with the launcher. The user's answer (A11).

**Not chosen:** refusing while a release is installed.

## DF-D8: Formatting takes the file's own indentation (2026-10-11)

**Decision:** A language server is asked to format with the indentation slipbox works out for the file (its
`.editorconfig`, else its own lines, else its language), never a fixed 2.

**Why:** A 4-space file would be re-indented to 2 by servers that follow the request. The user's answer (A12).

## DF-D9: "root" in the CLI's words, and one spelling (2026-10-11)

**Decision:** The CLI's messages and JSON say root where they said vault (`mode: "root"`, the change kinds `root`,
`make-root`, `unmake-root`), and `built-in` everywhere; the JSON's `schema` stays 1, with the skill and the CLI chapter
changed with it.

**Why:** Vaults stopped being a concept (D79); no release has shipped, so no agent outside depends on the old words,
and it is cheapest now. The user's answer (A19).

**Not chosen:** the messages only, the JSON kept; leaving both.

## DF-D10: slipbox's syntax errors in the code view too (2026-10-11)

**Decision:** The syntax errors slipbox finds itself, when no server answers, show in the code view as a server's
problems do: the marks, the line's colour, a cell header's count. Source mode keeps them as it has.

**Why:** The servers' problems already showed there, and the design said both ways. The user's answer (B3).

## DF-D11: A folder named restores the session (2026-10-11)

**Decision:** The session's tabs and windows come back whenever slipbox starts with no note named (no path, or a
folder), with `ui.restore_session` on; a file named opens that file alone. As the code does.

**Why:** `slipbox ~/notes` bringing your tabs back is what the getting-started guide promises, and what one expects.
The user's answer (B4).

## DF-D12: `SLIPBOX_GLYPHS` fills in for `auto` (2026-10-11)

**Decision:** `SLIPBOX_GLYPHS` chooses the glyph set only where `render.glyphs` is `auto`; a set named in the config
stands. As the code does, and the old configuration doc said.

**Why:** The user's answer (B5).

## DF-D13: The language servers as the code has them (2026-10-11)

**Decision:** lsp.md's table follows the code: SCSS and Less without biome, `.jsonc` a language of its own, Ruby's
`Gemfile` and `Rakefile`, no built-in server for Java or Kotlin (one is added in your config).

**Why:** The table had drifted; the manual already follows the code. The user's answer (B6).

## DF-D14: The trash is emptied (2026-10-11)

**Decision:** `slipbox trash empty`, and the same from the TUI's trash list, empties slipbox's trash after a preview;
and an item older than 30 days is removed by itself.

**Why:** Nothing emptied it: a note deleted for being private stayed, and the trash only grew. The user's answer (C1).

**Not chosen:** the command alone; leaving it.

## DF-D15: Desktop keys while typing (2026-10-11)

**Decision:** While typing, `ctrl+z` and `ctrl+y` undo and redo, `shift`+arrows select, the page keys scroll, and
typing, `backspace` or `delete` replace a selection, as in a desktop editor; vim's keys stay as they are.

**Why:** Someone who doesn't use vim had to press `esc` first for each. The user's answer (C2).

**Not chosen:** undo and redo only; leaving vim's way alone.

## DF-D16: An empty note from the CLI (2026-10-11)

**Decision:** `slipbox write <note> --create --allow-empty` with no text makes an empty note; without
`--allow-empty`, no text is refused, as now.

**Why:** Agents and scripts make notes to fill later; the TUI could, the CLI couldn't. The user's answer (C4).

## DF-D17: Obsidian's highlights and comments (2026-10-11)

**Decision:** `==text==` is drawn highlighted, and `%%comment%%` hidden while reading, shown in source mode and the
lens; exports alike.

**Why:** They showed as typed; everything else Obsidian writes was drawn. The user's answer (C5).

**Not chosen:** highlights only, nothing hidden.

## DF-D18: An export's pictures are left out of lookups by name (2026-10-11)

**Decision:** A wikilink's or embed's lookup by name leaves out `*.export.assets/` folders; they stay in the explorer
and in search.

**Why:** An export's copies made `![[dal.png]]` ambiguous in the folder exported into. The user's answer (C6).

## DF-D19: Screenshots in the guides and the screen chapter (2026-10-11)

**Decision:** The docs get screenshots where words can't show it: the guides' key moments and the screen chapter,
about 10 to 15. They're made by `scripts/screenshot.ts` from slipbox in a herdr pane (the screen read with its
colours, drawn to PNG with DejaVu Sans Mono), on the reference set, so they're retaken in one go when the UI changes.

**Why:** The user suggested them, then chose where (E). Amends DOC-D1: still Markdown, nothing built, the pictures
made by a script.

**Not chosen:** throughout the manual; none.
