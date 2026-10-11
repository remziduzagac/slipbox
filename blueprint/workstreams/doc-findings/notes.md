# Notes: what writing the docs found

## Item by item (2026-10-11)

- The findings came from DOC's writers (DOC's notes § What writing the docs found in the code). The user asked for
  explanations, then to go through them one by one with a suggestion each; every item was answered as suggested but
  one, C3, where the user asked for more: "we should have a skill/plugin package installable via npx for common
  harnesses".
- **A, bugs:** A1 privacy settings yours only (DF-D1); A2 the Markdown export copies pictures of the root only
  (DF-D2); A3 no export over any root's note (DF-D3); A4 a move into a folder (DF-D4); A5 `-o dir/` makes the folder
  (DF-D5); A6 reloading an unsaved note asks to discard (DF-D6); A7 `links` keeps the address whole; A8 clones open
  the default copy, as roots.md says; A9 `init --dry-run` refuses as the run would; A10 no false warning after `undo`;
  A11 `install-local.sh` replaces a link, never writes through it (DF-D7); A12 formatting with the file's indentation
  (DF-D8); A13 a comment's path followed in the code view; A14 the rail's `±` opens source control; A15 help's mouse
  list; A16 which-key's `[`, `]`, `z`; A17 "path copied"; A18 no roadmap numbers in messages; A19 "root" in the CLI's
  messages and JSON, `built-in` (DF-D9).
- **B, the code and the design:** B1 search leaves worktrees out, the design right; B2 a missing heading or block
  opens the note at its top and says so, the design right; B3 slipbox's syntax errors in the code view too (DF-D10);
  B4 a folder named restores the session, the code right (DF-D11); B5 `SLIPBOX_GLYPHS` fills in for `auto`, the code
  right (DF-D12); B6 lsp.md's table as the code has it (DF-D13).
- **C, gaps:** C1 the trash emptied, by command and after 30 days (DF-D14); C2 desktop keys while typing (DF-D15); C3
  the skill as an npx package for common harnesses: a workstream of its own, to scope; C4 an empty note by
  `--allow-empty` (DF-D16); C5 Obsidian's highlights and comments (DF-D17); C6 an export's pictures out of lookups by
  name (DF-D18).
- **D, stale text** in the examples: fixed with the rest, no decision.
- **E, screenshots:** in the guides and the screen chapter (DF-D19).

## Follow-ups (2026-10-12)

- The fixers' reports raised questions the decisions didn't answer; the user settled each as suggested: F1 `cp` into
  a folder (DF-D20); F2 a trailing `/` always a folder (DF-D21); F3 your config says root too (DF-D22); F4 a folder's
  `update.check` warned of (DF-D23); F5 every export embeds the root's pictures only (DF-D24); F6 any Markdown export's
  pictures out of lookups (DF-D25); F7 the hover on a missing heading (DF-D26); F8 a comment's contents still count
  (DF-D27); F9 a shift selection outside typing is visual (DF-D28); F10 the Save As window goes in first (DF-D29); F11
  a named clone a copy (DF-D30); F12, found by the terminal tests, the `z`, `[`, `]` popups' titles (DF-D31).
- The user said the agents were saturating the CPU: a finished agent's search had run for hours, and several whole
  suites at once; the fixers then ran only the files they touched, the coordinator the suite once after merging.

