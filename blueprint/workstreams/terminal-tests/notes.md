# Notes: terminal tests

## Proposed (2026-10-13)

- While upgrading OpenTUI (Dependabot's #12), the user asked: rename "e2e" — end to end should mean everything; one
  check per feature, small related ones grouped; no new document set per test or task, the sample folders extended
  instead. Then: test, then fix, never test-fix-test; parallel as much as possible; and research a headless terminal,
  as a headless browser is, to run the tests in CI on every system. Agreed to each, with one limit taken from the
  coordinator: a unit test checking one rule may keep its few inline lines. Then "migrate current test to bun terminal
  while migrating also apply my suggestions about granularity and also ensure coverage, draft the testing workstream".

## The headless terminal (2026-10-13)

- **`Bun.Terminal`** (read: bun.com's reference; Bun 1.3.5's notes): a pseudo-terminal in the runtime, POSIX only;
  `new Bun.Terminal({ cols, rows, data(term, data) })`, `Bun.spawn(argv, { terminal })`, `write`, `resize`,
  `setRawMode`, `close`.
- **`@xterm/headless`** 6.0.0 (ran: npm, MIT, no dependencies, published 2025-12-22): xterm.js without rendering; the
  buffer's lines and cells (characters, colours as RGB, attributes), the cursor; it answers a terminal's queries
  through `onData`.
- **Prototype** (ran, the session's scratch, 2026-10-13): slipbox on the demo vault in a 120×34 `Bun.Terminal`, its
  output written to the headless xterm: the screen drawn in about 300 ms; the top bar and the explorer read as text; a
  cell's foreground read as RGB; `ctrl+p` and typing filtered the switcher to `telescope-comparison`; `ctrl+q` quit,
  exit 0. Two lessons: isolate `XDG_*` as the runner does (the first try read real state), and wire the emulator's
  replies back.
- **Not chosen** (read: npm, the projects' pages): Microsoft's `tui-test` 0.1.0 (xterm.js and node-pty; a native
  module our gates forbid; its own runner on Node); VHS (scripted recordings); tmux (`capture-pane`, colours by escape
  codes).

## Today's terminal tests, run on OpenTUI 0.5.14 and 0.5.12 (2026-10-13)

- 135 scenarios in five herdr panes: 129 pass on both versions; the same six fail on both, their checks waiting for
  screens that later work changed (or something broke): "pinned tabs, save all, the change list, moving lines, the
  word count" (alpha never moved below bravo); "lint: a stand-in linter's finding…" (the gutter's pattern); "world/
  content: code in every grammar…" (no `SOURCE` on the status line); "links: next / previous, follow…"; "lens: a link
  followed from it…"; "world/content: a 4,000-line TypeScript file…". To settle in their areas' tasks.

## Old to new (TT-T3 to TT-T7)

Today's 135 scenarios (`tests/e2e/`), each under the area whose task carries it over. Each task writes after a
scenario the checks it became (`→ links: follow, back and forward; links: the lists`), or the check its checks were
folded into; none is dropped without saying why.

### Reading (TT-T3)

- start: home renders; ctrl+q quits cleanly →
- render: wide tables fit, code blocks, names in their own scripts →
- hostile names: a bidi override, C1 and an OSC in a file name never reach the terminal →
- render: a big note parses on other threads, then is drawn; its end, its width changed (15.1) →
- render: embeds drawn in place — a whole note, a heading's section — their links followed from where they are →
- footnotes: the right panel's second view — space n f, its superscript button under ▤; unfold, jump to a reference →
- trust: a Go file, language servers on — asked once whether you trust the root; y kept across a start; :untrust (23.x)
  →
- data files: TOML renders, a value's link followed, the lens edits a key, source mode →
- data files: CSV and YAML as tables; a JSON file that doesn't parse opens in source mode →
- code: tree-sitter's outline and breadcrumb, a comment's path:line followed, syntax errors →
- info: the Info view (the file's), vault info (its own window), reindex, config reload, messages, help →
- world/content: code in every grammar — Go, Rust, Lua, shell, JavaScript, TSX: outlines, breadcrumbs, a syntax error →
- world/content: a 4,000-line TypeScript file opens, G reaches its end, keys answer at once →
- world/content: data beyond halden's — .properties, a jsonc tsconfig, .env, multi-document YAML, big JSON, a file that
  doesn't parse →
- world/content: hostile text in note bodies, a log, data values never reaches the terminal: no title set, no screen
  cleared →
- world/content: wide characters line up — CJK, fullwidth, emoji, flags, combining, Thai, Devanagari, Arabic: tables'
  borders in one column; l steps a character →
- world/content: big content stays responsive — a 2 MB note, the cap's skipped file never searched, a table torture
  note, a training log →
- world/content: odd files never hang it — /dev/zero by symlink, an unreadable note; a symlinked note saved through; one
  out of the root never read →
- world/content: line endings and a BOM — drawn without stray cells, kept by a save: BOM, CRLF, lone CR →
- world/content: Japanese edited in source mode — w b e a character each, ciw the run, typed and saved →
- world/code: the code view — enter on a path in a comment's prose; slipbox's own syntax error on its cell, no server;
  Obsidian's ==highlight== and %%comment%% (DF-T7) →
- privacy: a root's .slipbox/config.toml sets render.images_remote = show and update.check — each warned of and ignored;
  its web picture not fetched, asked about (DF-D1, DF-D23) →

### Editing (TT-T4)

- motions: j k h l, words, row ends, top and bottom, headings, paragraphs, pages →
- motions: f t ; , on the line →
- visual: v and V select, o swaps ends, y copies, esc leaves →
- copy: yy the row, yp the path, yr a reference, yl a link →
- pinned tabs, save all, the change list, moving lines, the word count →
- vim's keys and the desktop's: H M L, zz zt zb, ctrl+g and :42, vault search, q and :q, ctrl+z ctrl+y →
- create: ctrl+n a note, typed and saved; the explorer's N a folder and n a note in it →
- source mode: i a I A o O type; esc; u, ctrl+r, U; ctrl+s writes →
- normal mode: x d c y > < D C s S r J p P ~ . and visual d c > < →
- vim grammar: counts, F, text objects (iW, vi(), *, cgn and ., insert's ctrl+w and ctrl+u →
- repeat: . after an o begun in the render opens the same line again; . after a terminal's paste in normal mode puts it
  again, not the x before →
- task: ctrl+l ticks a checkbox in the render and writes it →
- lens: space n l edits in place; esc esc closes it →
- lens: a link followed from it opens the lens on the new note — its text drawn, typing lands there; ctrl+o back to the
  first →
- conflict: an agent writes while you have changes; the prompt; :w! and :e! →
- save and quit: :wq writes and exits →
- scratch: add, open, copy, clear; a note's context copied for an agent →
- hand-off: space n e runs the editor and comes back; send to a remote editor →
- typing: as in a desktop editor — shift+arrows select, typing replaces, ctrl+z and ctrl+y while typing, pagedown;
  shift+right then d in normal mode (DF-D15) →
- reload: space n r on a note with unsaved changes, the file as it was — asks to discard; n keeps them, autosave still
  on; y reloads, u brings them back (DF-D6) →

### Navigating and the terminal (TT-T5)

- windows: split, turn, focus, move, swap, resize, resize mode, close, only → "windows: split side by side and stacked,
  focus, move to each edge, swap, close, only"; "windows: resize — ctrl+w + - > < a step each, = evens them; resize
  mode's keys until esc"
- tabs: new, list, next and previous, go to, move, close → "tabs: new, the list, next and previous, go to, move, close";
  "tabs: close the others and close all, a pinned tab kept; a new tab from a split takes its window"; "history: back and
  forward; the list — this window's places, and recent here from another tab"
- tags: space f t lists them with counts, a tag its notes; a #tag in the text followed → "tags: space f t lists them
  with counts, a tag its notes; a #tag in the text followed"
- panes: the explorer, reveal, the outline, the heading picker, the path dropdown → "explorer: space e opens, focuses
  and hides it; space shift+e reveals the note"; "outline: space o opens and focuses it; the heading picker jumps; shown
  and hidden from the palette"; "breadcrumb: space f b opens the heading path as a list; typing filters it, enter jumps
  to one"
- find: / n N * #, :noh; the find row → "find: / n N \* #, :noh and esc clear the highlights; the find row"
- replace: ctrl+h, tab, enter one, alt+a all, alt+h, :%s with c → "replace: ctrl+h, tab to the replacement, enter one,
  alt+a all, alt+h hides the row"; "replace: :%s with c asks at each match — y replaces, n skips, q stops"
- search: space f s ranks the vault's notes as you type, the words marked; enter opens at the match → "search: space f s
  ranks the vault's notes as you type; enter opens at the match; :search takes words"
- palette: : runs commands and aliases; :e opens a note → "palette: : and space f p list the commands; :e opens a note"
- settings: space u u, every toggle, themes and glyph sets → "settings: space u u lists every setting with its value;
  enter changes the one picked"; "settings: readable width, wrapping, line numbers, link URLs and zen — each changes the
  note, and back"; "settings: the top bar and the breadcrumb hidden and shown again"; "settings: the cursor row's band
  and the mouse; the problems bar and marks said and listed"; "settings: themes and glyph sets — picked with a live
  preview, set from the palette"
- world/terminal: start forms — a folder in a repository opens at its top; `open` spelled out; --root over the folder it
  starts in; --theme draws its colours → "start: a folder in a repository opens the repository's top; the explorer at
  the folder"; "start: `open` spelled out; --root over the folder it starts in"; "colours: --theme draws its colours
  from the start; NO_COLOR draws none" (the reference set's kestrel for the scenario's own repository)
- world/terminal: a start that can't open — a path that isn't there, a --root that isn't a root: a line and exit 3,
  never a stack trace → "start: a path that isn't there, a --root that isn't a root, a path outside it — a line and exit
  3"
- world/terminal: the session — tabs, a split, the explorer hidden and each note's place back after a quit; with
  restore_session off, the places only → "session: tabs, a split, the explorer hidden and each note's place back after a
  quit"; "session: with restore_session off, the default note alone — each note's place still kept"
- world/terminal: signals — SIGTERM and SIGHUP save the place and quit cleanly; the shell answers after → "signals:
  SIGTERM and SIGHUP save the place and quit cleanly, the terminal as it was" (no shell around slipbox to answer: the
  terminal's modes read instead — the main screen, no mouse reports, the keyboard's flags popped)
- world/terminal: a resize — zoomed to the whole tab and back, the frame follows the pane's width; the cursor stays on
  its line → "resize: the frame follows the terminal's width, wider and back; the cursor stays on its line" (a real
  resize, and narrower too)
- world/terminal: the terminal's title follows the file on screen, else the vault; a name's control characters never in
  it → "title: the file on screen, else the folder; a name's escape sequence never in it" (the reference set's
  `Downloads/esc\u001b[31mred.md` (`.build/extras.toml`) for the scenario's own BEL)
- world/terminal: pastes as terminals send them — a list's filter takes the first line, sanitized; typing, it goes in as
  it is; in normal mode it's put → "paste: a list's filter takes the first line, sanitized; nothing opened by its line
  break"; "paste: typing, it goes in as it is; in normal mode it's put after the cursor, one undo" (kenji-mori's list
  item for the scenario's own note)
- world/terminal: keys as terminals send them — ctrl+j in a list, shift and shift+ctrl arrows select, home and end,
  ctrl+enter into a new tab, ctrl+shift+f → "keys: ctrl+j moves a list's selection; ctrl+enter follows a link into a new
  tab"; "keys: shift and shift+ctrl arrows select from the cursor, shift+end to the row's end; home and end move";
  "keys: ctrl+shift+f finds in every note, an unsaved one as it is" (telescope-comparison's one-line paragraph for the
  scenario's own note)
- world/terminal: insert mode's keys — backspace joins lines, tab and shift+tab indent, home, end and the arrows move →
  "keys: insert mode's backspace joins lines, tab and shift+tab indent, home, end and the arrows move" (three lines of
  instrument-inventory's history for the scenario's own note)
- world/terminal: find's toggles while typing — alt+r a regex, alt+w whole words → "find: alt+r makes it a regex, alt+w
  whole words, while typing"
- world/terminal: colours — the theme's roles as the terminal draws them; :theme switches; [colors] overrides, per theme
  too; NO_COLOR draws none → "colours: the theme's roles as drawn; :theme switches; [colors] overrides, per theme too";
  "colours: --theme draws its colours from the start; NO_COLOR draws none"
- world/terminal: glyphs from the environment — SLIPBOX_GLYPHS=ascii, and a locale that isn't UTF-8, draw the frame in
  ASCII → "glyphs: SLIPBOX_GLYPHS=ascii, and a locale that isn't UTF-8, draw the frame in ASCII"
- world/terminal: which-key — the leader's groups at once, a prefix's entries after its delay; backspace goes up, esc
  closes → "which-key: the leader's groups at once, a prefix's entries after its delay; backspace goes up, esc closes"
- world/terminal: quitting — with a change unsaved, ctrl+q and :q are refused, naming the note; :x writes and quits; :q!
  quits without → "quit: a change unsaved refuses ctrl+q and :q, naming the note; :x writes and quits; :q! quits
  without"
- world/terminal: quitting with the properties editor open — ctrl+q writes its edits first; :x with text that doesn't
  parse asks, still running → "quit: the properties editor open — ctrl+q writes its edits first; :x with text that
  doesn't parse asks" (public-nights' properties for the scenario's own note)
- which-key: z, [ and ] list every key under them — the fold and spelling keys under z; ] s, ] t, ] c (A16); each says
  what it holds in its title (F12) → "which-key: z, [ and ] list every key under them, each titled with what it holds"

New, for what no scenario checked (TT-T5): "windows: :q closes a window, then the tab, and on the very last one quits";
"settings: code cells in boxes, or on bands"; "settings: spelling on marks the misspelt — ] s goes to one; off,
nothing to go to"; "keys: a legacy terminal's — escape before the next key, alt as escape and a key, ctrl+j a line
feed, ctrl+shift+f"; "lists: moves wrap around the ends, pagedown and ctrl+d by ten; ctrl+w and backspace edit the
filter"; "switcher: words in any order; # lists the note's headings to jump to"; "questions: enter answers nothing, n
says no, esc cancels, y says yes"; "mouse: a click follows a link, ‹ goes back, a tab clicked, the wheel scrolls; ≡
hides the explorer"; "help: ? lists every key by group; typing filters, the groups kept; enter runs the command";
"config: mistakes are warnings in the messages, the rest applies; space v c reloads; a typo keeps the last good";
"index: a note saved here is indexed again — its new link in the target's backlinks, its new word found"; "find:
replace in every note — ctrl+shift+h previews each change, enter makes them; space v shift+u undoes". Nothing of the
area is left out: what the old scenarios wrote for themselves is the sample folders' own content, each check's
expectation read from the file it changes.

### Links, roots, files and git (TT-T6)

- convert-links: every note's links made plain paths after a preview, an ambiguous one picked; embeds still drawn, a
  block followed, undone →
- links: next / previous, follow, back and forward, the lists, a split →
- explorer files: r renames, m moves, d deletes and u restores, y p copies — links fixed →
- git: a branch switch while it runs — the vault and its branch in the status line, said once, each branch's tabs back →
- git: the explorer's marks; space g c what changed, a file's diff; space g d this note's →
- git: space g m — a merge's broken links before it, each fix said; after it, git's rename says where a file went
  (20.21) →
- roots: a path into another root switches into it and back; a broken one; :folders; a nested root →
- nested roots: the demo's outreach — in by path, back, backlinks, the explorer, two deep →
- vaults: v makes a folder a vault after a preview, paths across untouched; V makes it a plain folder again →
- files: space n the note, space d its folder, space v the vault — move, copy, cut, paste, delete, restore, vaults →
- files: a folder with an unsaved note open in it isn't renamed — said, the edit kept; saved, it is, the note open from
  its new place →
- rename: space n m previews every change, enter renames; each link follows, nothing else written into the note →
- vaults: a git repository is a vault by itself — opened from its top, nothing asked or written; its links followed →
- roots: a named folder moved by hand brings its reading places along, nothing asked (21.8) →
- roots: opened on a plain folder, the named folders first; its tree, by its path, and .. to go up (20.22) →
- world/git: $HOME opened — the known roots first, the folder a level at a time, never walked; into notes, across into a
  repository, and back →
- world/git: roots from markers — an Obsidian vault and a zk notebook are roots, nothing written into them; root_markers
  in your config decides →
- world/git: a worktree — name@branch, space g w lists both checkouts, enter opens the note in the other →
- world/git: a merge's conflict — Problems at its first marker, the explorer's !, gone with --abort; git mv marked R →
- world/git: a detached HEAD in the status line; a switch bringing a rename isn't a move; a rebase lands as one change →
- world/git: :pin-root keeps a vault among the explorer's roots after leaving it; again, no longer →
- world/git: a named folder moved by hand brings its places along, nothing asked (21.8) →
- world/git: the background auto-index finds $HOME's roots while nobody works →
- world/git: the index across a quit — an outside edit's backlink at the next start; a damaged cache rebuilt →
- world/links: zk's links without an extension followed; a rename keeps them so (21.2) →
- world/links: / from the nearest root — a repository's, a folder nested in it; a folder link revealed; --root starts
  there (21.2) →
- world/links: an Obsidian vault's wikilinks, read within it — names, aliases, headings, blocks, ties; no root, no names
  (21.3) →
- world/links: each root's convention and what said it — Obsidian's, zk's, a folder's own; yours, saved while running
  (21.4) →
- world/links: links written as each root writes them — the picker, [[ completed, slipbox link for an agent (21.5) →
- world/links: named folders — a second copy of notes asks once which links open; a repository named by its remote
  (21.6) →
- world/links: named folders — space v shift+v picks which copy a folder's links open, :folders-default again; info says
  which (21.6) →
- world/links: slipbox:// pointers — another named folder's note, once it's on this machine; an agent's branch, its
  worktree (21.7) →
- world/links: where a file is — a root by its name, an unnamed one by its path; :folders goes into one; a loose file's
  folder beside (21.9, 21.10) →
- world/links: naming a folder — :name gives the cooking vault a name its pointer finds; the vault words are gone
  (21.10, 21.12) →
- links: a picture followed, linked or embedded — its path copied, said so, no later phase promised (A17) →
- trash: two notes deleted, space v t lists them and ends with Empty the trash…; enter, y, gone for good — then space n
  m into a folder, named or ending in / (DF-D14, DF-D4) →
- world/links: a clone named its own way — the qualified pointer and the hosting URL open ~/work/kestrel; linked search
  leaves the worktree out; a missing heading or block opens the note at its top, the hover says so (DF-T5, DF-D26) →

### The outside, code and export (TT-T7)

- problems: space v p — the bottom panel's All tab lists the vault's broken links by note; enter goes onto one →
- lint: a stand-in linter's finding on the status line and in Problems; enter goes to its line →
- problems panel: space n q — this file's problems with their lines, spaced; j shows the next, enter goes there; /
  filters; ctrl+w + resizes; tab to All, q closes; ⚠ 0 with none →
- language servers: a TypeScript file's errors from TypeScript's own server, in the bar and the status line →
- language servers: g y goes to the type's definition, g shift+i lists the implementations to pick from — TypeScript's
  own server (19.13) →
- watching: an agent's edit to a clean note shows at once →
- agent: the CLI ticks a task, replaces text and appends while you read →
- world/outside: a clean note changed outside reloads, marked ↻; u brings its text back, ctrl+r theirs again →
- world/outside: links turn live and broken as notes come and go; the open note deleted is marked; a new deep folder is
  watched →
- world/outside: an agent's prepend keeps your place; the lens keeps its size; the explorer keeps its selection →
- world/outside: a note moved by hand — mv, then cp and rm the other way round — the relink offered at once; declined,
  its links say where, space l r relinks →
- world/outside: an embedded note changed on disk — the note embedding it draws the new text →
- world/outside: not watching — an outside write waits for space n r, which reloads it →
- world/outside: the CLI beside it — history lists its tabs, capture shows in the open scratch, rm marks the open note
  gone →
- world/outside: an agent's replay against the open note — append, prepend, rename, delete, recreate, an atomic rewrite,
  a burst →
- world/outside: the conflict prompt — l loads theirs (u brings yours), k keeps yours (:w asks, d diffs), m merges;
  letters typed never pick →
- world/outside: your config rewritten while it runs — a theme, an alias, a key at once; a typo keeps the last good;
  space v c reloads what the poll can't see →
- world/outside: a vault's config can't name your editor — warned, never run; yours runs →
- world/outside: the set's kitchen-sink config — every key once: no warnings, its leader, its layout →
- world/outside: autosave writes an idle note — never mid-insert, never while git holds its index lock →
- world/outside: an editor that changes the note — your unsaved edit saved first, its change shown after, nothing
  unsaved →
- world/outside: lint as it flows — a finding after a save, hidden while unsaved, gone once fixed and saved →
- world/outside: TypeScript's server killed — said, started again, a new problem found by it →
- export: space n o, Word, enter — the Save As window beside the note, its name filled in; written →
- export: PDF, a web page, an e-book, Markdown through the window; Markdown's picture copied beside it →
- export: the window's keys — a place, into a folder and up, typing jumps, ~ home, ctrl+n a folder exported into →
- export: a file there replaced only on y — n brings the window back, the file as it was →
- export: a note named as the file — refused, said, the window kept; the note untouched →
- export: space n shift+o — two notes picked in order, this one first; Markdown, both chapters in that order →
- export: :export pdf at the command line — the window at once, no format list →
- export: the Save As window — a name ending in / that isn't there makes that folder and goes into it, the note's name
  given back; enter exports there (DF-D5) →
