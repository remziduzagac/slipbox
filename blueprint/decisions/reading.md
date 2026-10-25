# Decisions: reading

How slipbox draws what it opens: rendering, themes, modes and keys, files beyond markdown, pictures, code as a
notebook, document types and search.

## D88: One width function, in the layout stage (0.7, 2026-09-25)

> **Detailed by D215 (2026-10-06, recorded 2026-10-11):** a character's width is the terminal's.

**Decision:** Grapheme clustering and display width are decided once, in the layout stage, by one function, and
nothing else measures text. It works per grapheme cluster with `Intl.Segmenter`, built into Bun. The detail is
design/rendering.md § Wrapping and width.

**Why:** Emoji, CJK, combining marks and zero-width joiners govern every wrap point, every cursor position and every
column alignment in the app. Getting it wrong shows up as a cursor that drifts from where the character is drawn,
which is miserable to debug later.

## D89: slipbox lays tables out itself, from render-markdown's algorithm (2.3, 2026-09-25)

**Decision:** GFM tables are parsed by `remark-gfm` and laid out in a fixed width by slipbox's own allocator. It
starts from render-markdown's algorithm (each column's desired and minimum width against the budget) and fixes its
known flaw: there, `minimum` is checked only in aggregate, so a column can be allocated narrower than its longest word
and overflow. The allocator as built is design/rendering.md § The table allocator.

**Why:** Parsing tables is solved; laying them out in a fixed width is the real work, and the one intricate piece in a
build that is otherwise assembly of known solutions. render-markdown's `parser/table.lua` already holds the algorithm
(research/prior-art.md), about 150 lines in TypeScript.

## D90: Terminal escapes are stripped on the way into layout (2.9, 2026-09-25)

**Decision:** A constraint that lives inside every render path rather than a task: text is sanitised once, on its
way into the layout, from the first version. What is removed, and the backstops, are design/rendering.md § Escapes.

**Why:** slipbox renders markdown written by agents, pulled from repos, and generally not authored by the person
reading it. Raw escape sequences can move the cursor, recolour the screen, clear it, or with some terminals do
considerably worse: a real and well-known class of terminal bug. The fix is cheap in one place; retrofitting means
auditing every render path.

## D91: Themes are built in, shipped with the app (2.6, 2026-09-25)

> **Amended by D93 (2026-09-25):** syntax colours are roles of the theme itself, from its palette; no syntax theme
> files are converted.

**Decision:** Extensive built-in theme support, shipped with the app: not a plugin, not a download. Every common
theme is already there: Tokyo Night, Catppuccin's four flavours, Dracula, Solarized light and dark, Gruvbox, Nord,
Rosé Pine, Everforest, Kanagawa, One Dark, Monokai. Two surfaces are themed: the UI chrome (borders, sidebar, status
line, selection, link colours, table rules, heading levels) and syntax highlighting inside code blocks. Only the
chrome is designed; syntax themes were to be data, since these themes all publish TextMate or VS Code ones. The
themes as built are design/rendering.md § Themes.

**Why:** Terminal users choose tools partly on this, and a notes app is something you stare at all day.

## D92: Hand-tuned themes for the ones that matter, base16 for breadth (2.6, 2026-09-25)

**Decision:** A handful of hand-tuned first-class themes, plus a base16 / base24 (tinted-theming) loader. Which is
which is design/rendering.md § Themes.

**Why:** One loader over those schemes yields hundreds of named themes for free, including every one in D91.
base16's 16 slots are coarser than a hand-tuned theme, so a base16 Catppuccin is recognisably not Catppuccin: hence
both.

## D93: Semantic roles, bound by a theme through one palette (2.6, 2026-09-25)

**Decision:** Rendering code never holds a hex value: it names semantic roles, for the document, syntax and the
chrome, and a theme binds them. Every theme reduces to one palette, mapped to the roles by one function
(design/rendering.md § Themes). Syntax highlighting's colours are roles too, from the same palette, not the syntax
themes D91 planned.

**Why:** A theme is then data, and everything can be recoloured from one place; one mapping from palette to roles is
one mapping to get right.

**Not chosen:** workslate's role names (`@theme_base_bg`, `@theme_text_fg`, …), so a theme would port between the two
tools by copying values; syntax themes converted from VS Code or TextMate files (ideas.md § Themes).

## D94: Tokyo Night by default (2.6, 2026-09-25)

**Decision:** The default theme is Tokyo Night, with Catppuccin Mocha the other first-class choice
(design/rendering.md § Themes).

**Why:** Everything else in the user's stack is already themed, so slipbox arriving with its own look would be the
odd one out: herdr and nvim use Tokyo Night (`tokyo-night`, `tokyonight-night`); workslate, yazi, helix and lnav use
`catppuccin-mocha`.

## D95: Light themes, live switching, the terminal's colours, `NO_COLOR` (2.6, 2026-09-25)

**Decision:** Four requirements follow for themes:

- light themes genuinely work, not as an afterthought;
- a theme switches live, with a preview, and no restart;
- a follow-the-terminal mode uses ANSI indexed colours, beside the named themes in true colour;
- `NO_COLOR` is respected, degrading to something readable.

As built: the `terminal` and `mono` themes (design/rendering.md § Themes) and the theme picker
(design/tui.md § Overlays).

**Why:** Latte, Solarized Light and `tokyonight-day` are all in use or referenced in the user's setup. nvim already
has a live-preview colorscheme picker, so the same is expected, and it is cheap here: a theme is data and rendering is
one pass. Following the terminal lets herdr's or Ghostty's own theme flow through untouched; it is the cheapest option
and some people prefer it, but the named themes need true colour, so both.

## D96: Readability defaults carried over from nvim (2.7, 2026-09-25)

> **Amended by D254 (2026-10-18):** Tokyo Night uses upstream palette colours; typography and layout defaults remain.

**Decision:** slipbox starts from the settings that made markdown readable in the user's nvim (render-markdown and
the Tokyo Night adjustments) rather than rediscovering them:

- an inset held back from the render width: a parameter, about 4 by default, and at least 1, the minimum that shows a
  border;
- wrapping at word boundaries, as a first-class mode, not a flag that quietly disables a feature;
- code fences full width, with no right padding; heading icons per level; rendered checkboxes;
- Tokyo Night on a darker ground (`#16161e`, `#0f0f17` for dark surfaces), with a softer foreground (`#aab3d4`,
  `#8c95b0` dimmed);
- inline code on its own background (`#c0caf5` on `#292e42`, italic), a semantic token of its own;
- bold with an explicitly lighter foreground (`#bcc5e6`); bold rather than italic for emphasis in syntax highlighting;
- borders with real contrast, their colour and weight themeable rather than fixed.

The defaults as built are design/rendering.md § Readability defaults.

**Why:** These were arrived at by trial rather than taste. render-markdown fits a wrapped table to exactly the window
width, so its right border has nowhere to go, and nvim needed a private API patched for the inset; slipbox owns its
allocator (D89), so the inset is just a parameter. Inline code's background is the single biggest readability win in
prose: `code` spans stop disappearing into the sentence. Bold alone doesn't read as bold in a terminal, and terminals
render italics unevenly. Stock Tokyo Night's low-contrast separators make adjacent splits blend into one pane, and
slipbox has the same problem between its sidebar, content and splits.

## D97: The line under the cursor stays rendered (2.7, 2026-09-25)

**Decision:** The rendered view never un-renders the row under the cursor to show its source (render-markdown's
`anti_conceal = false`). Editing what is rendered is the lens's job (D147).

**Why:** It was tried in nvim, specifically for wrapped tables, and rejected: the row jumping between rendered and
raw while reading is worse than not being able to edit in place.

**Not chosen:** un-rendering the cursor's line, as anti-conceal does (ideas.md § Reading).

## D98: Reload anchoring: source lines, by heading (3.5, 2026-09-25)

> **Amended by D213 (2026-10-11):** a gone occurrence falls back to the slug's first heading before the line.

**Decision:** A buffer stores source lines, never rendered rows. A view's anchor is
`{ heading, headingIndex, offset, line }`: the nearest heading above the top of the viewport (its slug and occurrence
index), the source-line offset from it, and the absolute source line as fallback. On reload the heading is found again
by slug and occurrence; if it is gone, the absolute line is used, clamped. The cursor and a selection's fixed end are
kept the same way (design/tui.md § Positions).

**Why:** Rendered rows change with every resize. Anchored to a heading, an agent inserting a paragraph above your
reading position does not move you.

**Not chosen:** anchoring by a node id or a content hash, the plan item's other candidates (ideas.md § Reading).

## D99: Keys go to modes in a fixed order; conventions settle collisions (3.11, 2026-09-25)

> **Amended by D105 (2026-09-28):** editing's layers join the order; editing keys live only where text is editable.
>
> **Amended by D106 (2026-09-29):** vim's keys first: `g` keys where vim has them, the desktop editors' `ctrl`
> keys next.
>
> **Amended by D128 (2026-10-08):** what macOS terminals send for a Mac's own keys is bound, emacs-shaped or not.

**Decision:** With the reading keymap of 2026-09-25, keys are dispatched through layers in a fixed order. Phase 2 had
five: overlay (every key) → pending (the next key of a sequence) → pane (the focused side pane's keys) → visual
(selection keys; movement extends) → normal (everything else). Only keymaps at or above the one holding a binding can
make a key a prefix. Every binding names a registry command (D11), and config remaps all of them. The conventions
that settle collisions:

- direct keys are for navigation, plus a few universal ones (help, the palette, find, the switcher, the copies);
  everything else is under the leader, `space`;
- no emacs keys, and no `g` keys except `g g`;
- every `ctrl+` chord has a non-`ctrl+` route; cursor movement is exempt, having its own (page keys, arrows,
  `home` / `end`);
- plain `q` never quits (`ctrl+q` does), and `ctrl+c` only copies (in a list or prompt it cancels).

The order as built is design/tui.md § Modes and dispatch; the conventions as they stand are
docs/manual/keys.md § Conventions.

**Why:** Terminals, multiplexers and browsers can swallow `ctrl+` chords (zellij takes `ctrl+t`, `ctrl+p`, `ctrl+o`
and `ctrl+q`); nothing takes `space`.

## D100: Images: ask the terminal, never `$TERM`; an override (12.1, 12.2, 2026-09-25)

> **Amended by D126 (2026-10-08):** the probe is OpenTUI's, which asks the terminal; the override is
> `[render] images = auto | never`.

**Decision:** Images are drawn inline where the terminal can, and degrade cleanly where it can't. OpenTUI already
ships an `Image` component, so this is capability detection and a fallback ladder (D101), not a graphics
implementation. Support is found by querying the terminal and honouring the answer, and the user can always override
it: `images = auto | always | never`. Whether a multiplexer in between passes images on is never assumed, either
way.

**Why:** `TERM` and `TERM_PROGRAM` describe the outer terminal, not whether graphics escapes survive a multiplexer in
between; escapes emitted into a pane that swallows them usually look like garbage, not like nothing
(research/terminal-images.md). Detection will be wrong sometimes, and the user knows what they are looking at.
Detect, degrade, never require: the standalone constraint (D3).

## D101: A fallback ladder; alt text and path are the floor (12.4, 12.5, 2026-09-25)

> **Amended by D126 (2026-10-08):** no half-block rung: where a terminal draws no images, `▣ alt` and its link.

**Decision:** An image falls back in three steps: the native protocol, real pixels, where the effective channel
supports it; Unicode half-block or quadrant blocks in true colour (`chafa` the reference); and alt text plus the path,
always readable. The last is a constraint (12.5), kept inside every item it constrains: a note never becomes
unreadable because an image couldn't render.

**Why:** Support is uneven and version-dependent (research/terminal-images.md); the floor keeps every note readable
whatever the answer.

## D102: Pictures sized from the cell, sent once, scrolled as text (12.6–12.9, 2026-09-25)

> **Amended by PIC-D1–PIC-D6 (2026-10-26):** pictures fit their window above a size floor; their own size is
> bounded by the existing decoding budget. Size toggling and sideways scrolling belong to the window. Kitty sends
> once per size after resize rest; sixel draws only the visible source rectangle.

**Decision:** Designed in from the start:

- sizing from the cell's pixel geometry; a picture reserves its rows, and text does not wrap around it;
- transmit once, place many: the kitty protocol's image ids and separate placement;
- scrolling through the kitty protocol's Unicode placeholders, which make an image behave like text;
- decoding and scaling once per path and size, keyed by mtime.

As built: design/rendering.md § Blocks and inlines.

**Why:** Without cell pixel geometry, pixels can't become rows and images come out the wrong size. Re-sending image
data on every redraw is the usual cause of "images make the TUI feel slow". A placed image floats over the screen
rather than scrolling with the text, so without placeholders every scroll needs an explicit reposition or hide:
scrolling is where image support gets buggy, so it is designed for first rather than discovered in a long note
(research/terminal-images.md).

## D103: Both image syntaxes go through one resolver (12.13, 2026-09-25)

**Decision:** Images come from standard markdown `![alt](path)` and from Obsidian-style embeds `![[image.png]]`, both
through one resolver. As built: design/rendering.md § Blocks and inlines.

**Why:** Embeds are already in scope. Pasted screenshots are the common real case in an agent workflow: a screenshot
dropped into a note, then discussed.

## D104: Mermaid and LaTeX become pictures where images work (12.10, 12.11, 2026-09-25)

> **Superseded by D127 (2026-10-08):** the terminal's own drawing first, the default even where images work;
> pictures by choice.

**Decision:** Diagrams and maths start as approximations (`mermaid-ascii`, `unicodeit`). Where images work, the better
rendering is used: Mermaid through `mermaid-cli` to a real PNG, LaTeX typeset properly, on the same fallback ladder,
so the text path is the floor rather than the ceiling.

**Why:** The good version needs no different architecture, only a different renderer behind the same capability
check, which makes postponing Mermaid and LaTeX cheaper than it looked.

## D105: Editing's modes and keys (3.11, 2026-09-28)

**Decision:** D99's five layers, revised with editing (phase 3, D144). The layers, in dispatch order:
overlay (the conflict prompt among them) → filter → insert → a character (the next key after `f`, `t`, `r`) → in source
mode and the lens, counts and an operator's motion around the rest → resize → pending → pane → visual → source (source
mode's and the lens's own keys) → normal. With keys pending, `esc` and `backspace` act on the sequence first; keys are
handled one at a time, in order. Editing keys are vim's, and only where the text is editable: `d c y p x .` and the rest
live in the source layer and do nothing in the render, where a task is ticked with `ctrl+l`, `space n t` or a click. The
keys that start an edit (`i a I A o O`) and undo (`u ctrl+r U`) are in the reading layer too: they switch the window to
source first. `ctrl+x`'s routes are `d` and `x`, `ctrl+v`'s is `p`. The layers' table is
design/tui.md § Modes and dispatch.

**Why:** Editing (source mode and the lens) brought typed text, a key awaited as a character, and operators with
their motions, each needing a layer that owns its keys before the reading ones; only source mode and the lens hold
editable text.

## D106: Vim's keys first, the desktop editors' `ctrl` keys next, the leader for the rest (3.11, 2026-09-29)

**Decision:** A key keeps its vim meaning where slipbox has the action (`H` `M` `L`, `zz`, `ctrl+o`, `gt`, `gf`,
`:q`), `?` aside, which is help. The `ctrl` keys VS Code and Obsidian share come next (`ctrl+f`, `ctrl+p`, `ctrl+s`,
`ctrl+z` / `ctrl+y`, `ctrl+←/→` by word, `ctrl+shift+f`, `ctrl+tab`); `ctrl+w` and `ctrl+t` stay the prefixes for
windows and tabs; everything else is under `space`. This replaces D99's "no `g` keys except `g g`". The keys are
docs/manual/keys.md.

**Why:** `?` is the key most apps give help. The desktop editors' `ctrl` keys take the places where vim's use of them
is marginal in a notes app (research/keymap-comparison.md, which sets the keys beside vim's, VS Code's and
Obsidian's).

## D107: slipbox opens any text file, in three groups (16.1, 16.3–16.5, 2026-09-29)

> **Amended by D161 (2026-10-01):** slipbox is a client of the code's language servers; their problems join
> tree-sitter's.
>
> **Amended by D112 (2026-09-30):** markdown is the only note format; `.org` and `.adoc` open as text.

**Decision:** slipbox opens any text file and renders the ones worth rendering, in three groups: notes (markdown; Org
and AsciiDoc off by default, enabled by configuration), rendered; data and config (JSON, YAML, TOML, INI, CSV/TSV),
rendered, source mode a key away; text and source (code, logs, `.txt`), in source mode only. Notes are the link graph,
and rendering is a separate property: only a note has tasks, tags, a title and lookup by name; a data file has an
outline, sections to link to and links of its own kind; a source file is a link target by path and links out only
from its comments. Binary files stay link targets and don't open. The explorer shows notes and renderable files by
default, a key shows every text file, and `ctrl+p` and find follow it; the CLI's `read`, `write`, `replace` and
`find` take all three groups. Diffs are left to a separate discussion. Built as phase 3b, before the vault
(D31). As built: design/tui.md § Files beyond notes.

**Why:** With coding agents, the human mostly designs documents, reviews what an agent produced (notes, configs,
source files) and makes minor edits in place; reviewing means opening whatever the agent touched. Lookup by name
stays with notes because `[[config]]` quietly meaning `config.toml` would surprise; wikilinks are markdown's
convention, so data files and code comments don't get them.

## D108: Data files render as documents and are edited as text (16.11–16.15, 2026-09-29)

> **Amended by D212 (2026-09-29, recorded 2026-10-11):** nested YAML and JSON are a tree of rows, not headings;
> TOML and INI keep theirs.

**Decision:** A config renders like a note: TOML tables and INI sections become headings, as do nested YAML and JSON
objects down to a depth, then indented key–value rows; scalars are aligned key–value rows, like frontmatter's
properties; arrays of records become tables through the table allocator; comments show dimmed beside or above their
key. CSV/TSV is one table, its header row detected, laid out lazily when large. Edits are always on the text: no value
is ever re-serialised, and the lens edits a block's source lines as it edits a markdown paragraph. Validity is checked
when insert mode ends, never per keystroke; a file that no longer parses switches to source mode with the error
shown. As built: design/rendering.md § Data files.

**Why:** Rendered like a note, a config gets the outline, the breadcrumb, find and links to a section
(`[[config.toml#section]]`) for free. Never re-serialising keeps its comments, key order and formatting. Typing
through an open quote is normal, so validity can't be checked per keystroke.

**Not chosen:** writing an edited value back by re-serialising the file (ideas.md § Files beyond markdown).

## D109: Source files go through tree-sitter, loaded lazily (16.6–16.10, 2026-09-29)

> **Amended by D161 (2026-10-01):** slipbox runs language servers too, for what syntax
> can't say.

**Decision:** Source files are parsed with `web-tree-sitter`, one grammar per language, each loaded the first time a
file of that language opens; the first set is TypeScript, Python, shell, Lua, Go and Rust. It gives highlighting in
source mode (highlight.js the fallback), an outline and breadcrumb of functions, classes and methods from a small
query per language, links in real comment nodes only (never in strings or code), and syntax errors, marked when
insert mode ends. Lazy loading is a mechanism, not a special case: grammars, and later Mermaid and images, all load
on first use. As built: design/tui.md § Files beyond notes.

**Why:** highlight.js only colours tokens; an outline, links in comments and syntax errors need structure.
`web-tree-sitter` is already installed, as OpenTUI's peer dependency, and a grammar is a few hundred KB of
WebAssembly. Syntax errors only: type errors and unresolved imports need a language server, which was then not
slipbox's job.

## D110: A reader per note format (16.2, 2026-09-29)

> **Amended by D112 (2026-09-30):** markdown's is the only reader; the seam stays.

**Decision:** Markdown becomes one reader among several. A reader produces what the rest of slipbox needs: blocks
with source line ranges (for the lens and incremental work), headings, links, tasks, tags, a title, and a tree the
renderer lays out; the graph, outline, backlinks and CLI stay format-agnostic. Org was a full note format through
`uniorg` (`16.16`), its checkboxes the tasks. AsciiDoc was planned as a line scanner to index and asciidoctor.js to
render; as built (`16.17`), one line reader did both. As built: design/tui.md § Files beyond notes.

**Why:** `uniorg` is unified-based, like remark, and fits the same way. AsciiDoc's structure is its lines, a reader
into the shared tree is what Org has too, and asciidoctor.js (Ruby compiled to JavaScript, a few MB) would still have
needed its document mapped onto that tree.

**Not chosen:** asciidoctor.js, loaded lazily, to render AsciiDoc (ideas.md § Files beyond markdown).

## D111: Pathological nesting is capped (15.2, 2026-09-29)

**Decision:** Hostile notes are handled by a cap: containers nested deeper than 60 render as their plain text, and
inputs the markdown parser takes quadratic time over are tamed before parsing, without moving an offset. As built:
design/rendering.md § Wrapping and width ("Hostile notes").

**Why:** Found in the phase 2 review. With the cap, a note 5,000 levels deep neither overflows the stack nor hides
everything, and the taming touches only what an ordinary note never has.

**Not chosen:** parsing such notes off the main thread, the plan item's other option (ideas.md § Performance).

## D112: Markdown is the only note format (16.16, 16.17, 2026-09-30)

**Decision:** Reversed: the Org and AsciiDoc readers, both built, are removed, and the notes of D107 are markdown
alone. `.org` and `.adoc` files still open, as text files in source mode, and the reader seam (`16.2`, D110) stays, so
a format could come back without touching the rest.

**Why:** Every note feature ahead (rename with link fixing, tasks, tags, templates for new notes) would have to be
built three times, for Org's `[[file:…]]` links and `[X]` marks and AsciiDoc's `xref:`, for formats whose users
mostly live elsewhere: Org's in Emacs (org-roam, org-agenda), AsciiDoc's in documentation and books rather than a
linked vault of notes. The notes world standardised on markdown (Obsidian, Zettlr, Foam).

**Not chosen:** Org and AsciiDoc as note formats (ideas.md § Files beyond markdown).

## D113: Embedded notes are drawn in place, read-only (1.11, 2026-10-01)

**Decision:** An embed of a note (`![[note]]`, a heading, a block) draws that note in place, read-only; `enter` on its
header opens it. Its rows sit at the embed's line. Its links are its own, resolved and followed from where it is, as
Obsidian does. Search, backlinks and the context bundle are untouched. As built:
design/rendering.md § Blocks and inlines ("Embeds").

**Why:** An Obsidian vault is full of `![[…]]`: every pasted picture, and, for anyone who writes long pieces from
small notes or keeps notes that gather others' sections, notes and headings. A reader that draws them as references
shows those notes nearly empty. Editing another note inside this one would make every key ask which note it's in.
With its rows at the embed's line, everything that knows a note by its lines (anchors, the cursor, the lens, the
outline) knows only the note shown, and nothing about them changes. An embed is a link already, and its text belongs
to its note.

**Not chosen:** editing an embedded note in place (ideas.md § Embeds).

## D114: Search is our own, small, in the core (6.1, 2026-10-01)

> **Clarified by D214 (2026-10-11):** search ranks notes and data files; `auto` scans until the index is whole.
>
> **Amended by D67 (2026-10-02):** the LSP face is removed; the CLI and the TUI share search.
>
> **Amended by D124 (2026-10-07):** Scout is postponed; the fuller engine is trailscout's SDK, once it exists.

**Decision:** Search is slipbox's own, in the core, so the CLI, the TUI and later the LSP share it: an SQLite FTS5
index in the vault's cache (SQLite: D196), and, while there's none, a scan of the files with the same query and a
BM25-like score, so a search always answers. It is deliberately small: words, phrases, prefixes, exclusions,
`title:`, tags and folders, ranked by BM25 with the title weighing most. The design is design/search.md.

**Why:** A fuller engine (Scout: semantic search, the graph) will sit behind the same API when it's there; slipbox's
is the fallback.

## D115: A row per file; a hit opens where most of its words are (6.6, 6.12, 2026-10-01)

**Decision:** The index has a row per file, not per section. A hit opens at the section with most of the words, and
where it opens is found finer than the search's sections (D116): among each heading's own text, uncut. The matching
itself stays a row per file. The design is design/search.md.

**Why:** A search's words are a note's, wherever in it: with a row per section, words in two sections of one note
found nothing. The size band merges a short note, the commonest, into its root, so a hit found only in band sections
opens at any of the words rather than where most are: measured on this suite, `alpha beta` opened at a line with only
`alpha`.

**Not chosen:** a row per section (ideas.md § Search).

## D116: Search's sections are scout's (6.12, 2026-10-01)

**Decision:** A file is cut into sections as scout cuts it: its containment tree, cut to a size band of 400 to 1,500
tokens on each node's own text, named as scout names them. A hit carries the section it's in, its name and line range,
as scout would cite it. Before, a data file was cut every 80 lines. The algorithm is design/search.md § Sections.

**Why:** A scout result for the same file and range is then the same hit: the two models agree, and tier 2 can append
scout's results, deduped on them.

## D117: The index reads a file by a quick pass over its lines (6.6, 2026-10-01)

**Decision:** A file is read for the index by a quick pass over its lines, not by the markdown parser: frontmatter,
headings outside code, tags, the text as written. The tokenizer skips the markup (design/search.md § Reading a file).

**Why:** The parser would make a first build of a big vault take a minute.

**Not chosen:** reading files for the index with the markdown parser (ideas.md § Search).

## D118: The index is kept current two ways (6.6, 6.7, 2026-10-01)

**Decision:** Each catch-up compares every file's size and mtime with the index's. And whatever changes a file
through slipbox, or is seen by its watcher, reaches the graph, which says so to its listeners (`onChange`, the change
feed): the TUI's index updates a file as it changes (design/search.md § Kept current).

**Why:** Size and mtime catch a change whoever made it: git, or an agent with nothing of slipbox running. Through the
feed, an outside engine will hear of the same changes, moves too, which a watcher sees only as a delete and a create.

## D119: `find` stays beside search (6.2, 6.3, 2026-10-01)

**Decision:** `find` stays: every match of a literal or a regex, unranked (docs/manual/cli.md § `search`).

**Why:** It answers "where exactly", not "which notes".

## D120: A big note costs what changes; its first parse runs on threads (15.1, 2026-10-01)

> **Detailed by D232 (2026-10-14):** the workers' scripts are entry points of the build. Until then the compiled binary
> had none, so a released slipbox parsed big notes on the main thread.

**Decision:** Edits, reloads and leaving the lens cost what they change: the parse by chunk, the render by block,
source mode by line. A note with 128 KB or more left to parse is parsed on four workers, each taking a run of chunks
and sending its nodes back as JSON into the buffer's parse cache, so the main thread's parse stays the only parse
there is and finds nothing left to do. While it runs, the view shows a line saying so rather than half a note; keys
wait for the parse, and a click is dropped. As built: design/how-it-works.md § Performance, measured ("Big notes");
design/tui.md § Known limits.

**Why:** A note's chunks already parse the same apart as whole. A string crosses faster than a structured clone of
the trees, and more workers gain little, since the nodes still cross back one at a time. A partial layout would put
the cursor, the reading position and a click somewhere the real one doesn't have them, and the wait is a third of a
second at 20,000 lines. Below 128 KB, starting the threads costs more than it saves. Laying out only what's in view
would take the rest; no ordinary note needs it.

## D121: Grammars npm has no WebAssembly for are built from source (16.18–16.22, 2026-10-07)

**Decision:** Decided while building `16.18`–`16.22`: the grammars npm ships no WebAssembly for (Swift, SCSS, Vue,
Astro, Dockerfile) are built from source at pinned commits by `scripts/build-grammars.ts` into `grammars/`, committed
with their licences. tree-sitter-cli 0.27 builds them with wasi-sdk, and what it builds loads in web-tree-sitter 0.25.
As built: design/how-it-works.md § Dependencies.

**Why:** No emscripten or Docker is needed, and a bundle of prebuilt grammars (`tree-sitter-wasms`) has an older
Swift.

**Not chosen:** a bundle of prebuilt grammars, `tree-sitter-wasms` (ideas.md § Files beyond markdown).

## D122: A file in several languages is parsed part by part (16.22, 2026-10-07)

**Decision:** A file in several languages (a page's scripts and styles, a Vue, Svelte or Astro component) is parsed
part by part: a part's text with its own grammar, its results placed back in the file. As built:
design/tui.md § Files beyond notes.

**Why:** A part's grammar is a different language, and its queries are its own.

**Not chosen:** tree-sitter's included ranges on one parser (ideas.md § Files beyond markdown).

## D123: Ruby and C/C++ get grammars, as the rest do (16.23, 2026-10-07)

**Decision:** Ruby, C and C++ get grammars, highlighting and outlines: Ruby's modules, classes, methods and `self.`
methods; C's functions, prototypes, structs, unions, enums and typedefs; C++'s namespaces, classes and the methods
declared in them, `A::go` where one is defined. A `.h` is C's. As built: design/tui.md § Files beyond notes.

**Why:** Their official npm packages (`tree-sitter-ruby`, `tree-sitter-c`, `tree-sitter-cpp`) ship WebAssembly for
this runtime, so each costs a few hundred KB, loaded only when a file of it opens. Prototypes are in C's outline
because a header's outline is mostly those.

## D124: Scout is postponed, and `@slipbox/links` dropped (6.10, 6.13, 2026-10-07)

**Decision:** The outside engine (`6.10`) is postponed, and `@slipbox/links` for scout (`6.13`) is dropped. slipbox
uses trailscout's SDK when that exists; until then its own search (D114) is the only engine.

**Why:** Scout became trailscout, its own project.

## D125: Code reads as a document, its tokens verbatim (24.1, 2026-10-07)

> **Amended by D130 (2026-10-09):** the shared categories are read from each grammar's own queries, not mapped per
> language.

**Decision:** Decided with the user: code renders too, as a notebook, not to look like markdown nor to run it
(D172), but to read like a document, alike whatever language wrote it. Every token of code is drawn as written:
nothing replaced, hidden for good or reordered. The view owns only whitespace and decoration. Comments are
documentation: their markers go and their text is prose, but for comments meant for tools and code put aside; a
docstring is drawn above its code. Languages share categories (definitions, parameter lists, blocks, imports,
documentation), each language mapping its own syntax onto them. The view is design/code-view.md.

**Why:** Notes render and data files render; code had only its source. A comment's markers are syntax, not its
text. A docstring drawn above its code, where every other language puts its documentation, lets a page read the same
in every language.

**Not chosen:** drawing code's tokens otherwise, such as `->` as `→` (ideas.md § Code view).

## D126: Pictures through OpenTUI: Kitty graphics and sixel, no blocks (12.1–12.4, 2026-10-08)

**Decision:** D100's probe and override, and D101's ladder, as built. The capability probe is OpenTUI's, which asks
the terminal, never `$TERM`. Pictures are emitted through OpenTUI as Kitty graphics (herdr draws them too) or sixel.
There is no half-block rung (`12.4` dropped): where a terminal draws no images, a picture is its `▣ alt` and its link.
The override is `[render] images = auto | never`. As built: design/rendering.md § Blocks and inlines.

**Why:** OpenTUI already ships most of the image capability layer: the probe, multiplexer detection included, and
the Kitty and sixel paths; it has no iTerm2 path (research/stack.md). The floor (12.5, D101) keeps a note readable
wherever nothing is drawn.

**Not chosen:** a half-block or quadrant approximation; iTerm2's inline images; an `always` override
(ideas.md § Images).

## D127: The terminal's own first; pictures by choice, in the theme's colours (12.10, 12.11, 12.15–12.17, 2026-10-08)

**Decision:** Decided with the user: the terminal's own first. Unicode drawing and text are the default, where images
work too: Mermaid drawn in box drawing by `beautiful-mermaid`, no browser (`12.10`); maths read and drawn as Unicode
text (`12.11`). Then pictures, by choice: SVG rasterised (`12.15`), Mermaid as a picture (`12.16`), a display's maths
typeset by MathJax (`12.17`). Every picture slipbox makes is in the theme's colours. Maths is in. A Mermaid kind
`beautiful-mermaid` doesn't draw, or a diagram that doesn't parse, stays its code block; a formula, its source. This
replaces D104. As built: design/rendering.md § Blocks and inlines.

**Why:** Drawn in the terminal's characters, a diagram or a formula reads in any terminal, where a picture needs one
that draws images (D126). The way to pictures D104 planned, `mermaid-cli`, runs a headless Chromium per diagram;
`mermaid-ascii` breaks labelled nodes (research/stack.md).

**Not chosen:** `mermaid-cli`; `mermaid-ascii` (ideas.md § Images).

## D128: What macOS terminals send for a Mac's own keys is bound (3.11, 2026-10-08)

**Decision:** D99's "no emacs keys" holds, but for what macOS terminals send for a Mac's own keys: `alt+b` /
`alt+f` for option+← / option+→, by words; `ctrl+a` / `ctrl+e` for cmd+← / cmd+→, a line's start and end. The source
switch they displaced from `ctrl+e` keeps `space n v`. The keys are docs/manual/keys.md.

**Why:** A Mac user's keys do what they do in any Mac app.

## D129: A cell folds whole (24.18, 2026-10-08)

**Decision:** Folding inside a cell of the code view (an `if`'s body, a loop's) is dropped: a cell folds whole, as
`24.8` folds a definition (design/code-view.md § Next).

## D130: The code view is generic, on each grammar's own queries (24.9, 2026-10-09)

**Decision:** Decided with the user: the code view is built on the queries tree-sitter already gives every grammar
slipbox parses for its outline and its comments' links: definitions with their names and ranges, and comments. It
covers the 13 grammars with definitions (TypeScript, TSX, JavaScript, Python, Go, Rust, Swift, PHP, Ruby, C, C++,
Lua, Bash); markup and config (HTML, Vue, Svelte, Astro, CSS, SCSS, Dockerfile) keep source mode. A definition's kind
is read from its node's type name, its documentation is the comment lines right above it, and imports are a run of
top-level nodes named so. What a language does its own way is an exception (Python's docstrings), not a mapping: so
D125's categories are read, not mapped, and this replaces mapping Rust and Go next. Every file keeps its source
mode (`space n v`; `[render] code = "source"`). A cell's header says what it is in its language's word
(`struct: Frame`, `method: add`; the user's, 2026-10-09). As built:
design/code-view.md § One vocabulary, many languages.

**Why:** The queries are already there for every grammar, so no language is mapped by hand. `24.11`–`24.16`'s
TypeScript and Python become the generic view and its exceptions, their tests the proof nothing was lost.

**Not chosen:** a mapping written per language (ideas.md § Code view).

## D131: Code is edited in the lens, not typed into in place (24.17, 2026-10-09)

**Decision:** Typing in a row of the code view in place, without the lens, is dropped (design/code-view.md § Next).

**Why:** The lens is where notes and code are edited (D147).

## D132: Tabular code in columns is deferred (24.20, 2026-10-09)

**Decision:** Columns where the code is tabular (consecutive assignments, enum members, an object's keys) are
deferred (design/code-view.md § Next).

**Why:** Spaces inside a row would need a column map for every interaction.

## D133: Document types, known by where they are (22.2, 22.3, 2026-10-10)

**Decision:** Notes of a kind are known by where they are (an agent skill's `SKILL.md`, an ADR in an `adr/` folder).
A type brings rules its frontmatter must keep, said in Problems (`22.2`), and its conventions read (a number from the
file's name for order, a status, what supersedes one) to list its notes and move between them (`22.3`). Driven by
conventions, not a database: nothing is written or kept. `skill` and `adr` are built in; your own, or a folder's,
come from config, and a folder's only read. The design is design/document-types.md.

**Why:** These documents have conventional shapes: ADRs numbered and "superseded by D23", skills with required
frontmatter. Knowing a type allows type-aware navigation (list all ADRs, show which are superseded), and a schema
flagging missing or malformed frontmatter catches real errors (`SKILL.md` requires `name` and `description`).

**Not chosen:** a database, as Obsidian's Bases keeps (ideas.md § Document types).

## D212: YAML and JSON drawn as a tree, every key a row (16.12, 2026-09-29)

**Decision:** Nested YAML and JSON are drawn as a tree rather than as headings: every key a row, guides at every depth
from the glyph set; branches (objects, lists that aren't plain) with their rows under them, list items numbered and
opened alike, small plain maps and scalar lists inline, records as tables inside the guides. Branch rows are the
outline and the breadcrumb; a `$ref`'s JSON pointer goes to the row it names. TOML and INI keep their sections as
headings. As built: design/rendering.md § Data files. Recorded on 2026-10-11 from the commit that made it (7176c0d).

**Why:** Drawn as headings, a nested object had no end: a parent's later keys read as the child's (features under
database, top-level ports under staging), and below three levels everything folded into one-line blobs.

**Not chosen:** D108's headings down to a depth (ideas.md § Files beyond markdown).

## D213: Reload anchoring falls back to the slug's first heading (3.5, 2026-10-11)

**Decision:** On reload, a view's heading is found again by its slug and occurrence; when that occurrence is gone, the
first heading with the slug stands in, and the absolute line, clamped, only when no heading has the slug
(`core/position.ts`; design/tui.md § Positions). Recorded on 2026-10-11 from the code.

**Why:** Not recorded; the fallback came with the anchoring of repeated headings in the review of 2026-09-29
(49c957f).

## D214: What search covers, and its widest scope (6.1, 20.16, 2026-10-11)

**Decision:** Search ranks notes and data files; text and code are found by `find`, not ranked (design/search.md).
With `[search] engine = "auto"`, the index answers once it is built whole, and a scan of the files until then. The
widest scope, `all`, is every root the machine knows, each opened and caught up on demand, ranked with the linked
roots by score (design/roots.md § Search scope). Recorded on 2026-10-11 from the code.

**Why:** Not recorded where it was built; the reasons are ours, on recording it: a ranked hit cites a section, which
notes and data files have and code doesn't, and a half-built index would rank only what it had reached.

## D215: A character's width is the terminal's (0.7, 2026-10-06)

**Decision:** How wide a grapheme cluster is follows the terminal, as OpenTUI finds it, rather than a table of
slipbox's own; the one width function (D88) asks for it. As built: design/rendering.md § Wrapping and width. Recorded
on 2026-10-11: the design held it, dated, with no decision.

**Why:** slipbox counted widths its own way and OpenTUI the terminal's, and the two parted inside one frame
(`हिन्दी`: 2 columns to slipbox, 3 to OpenTUI in herdr), shifting rows and borders (f9e3ebb).

## D233: Code blocks scroll sideways rather than wrap (2.2, 2.4, 2026-10-14)

**Decision:** In the TUI's rendered view, with wrapping on, a code block whose lines are too long for its room keeps
each line whole on one row, and the block scrolls sideways on its own; the window and the rest of the note stay. A
`▄` bar on the block's last row and `‹` `›` at its edges show it; the cursor drives it, kept 4 columns from either
edge as the window keeps it with wrapping off; a sideways wheel or `shift` with the wheel, its bar, a click and find
work on it. Each block's offset is the window's while it shows the note. `[render] code_wrap = "wrap"` keeps the lines
wrapped, marked `↪`. Unchanged: source mode and the lens (`ui.wrap`), wrapping off (the window scrolls and a block
follows it), and `slipbox render`, which wraps. A Mermaid diagram too wide is drawn, closest together, and scrolls as
a block does. As built: design/tui.md § Code blocks that scroll, design/rendering.md § Blocks and inlines.

**Why:** A code block's columns carry its meaning: a directory tree, an ASCII or box-drawing diagram, aligned log
output, a table typed as text. Wrapping at the edge broke each of them, and a copy of a wrapped line took the `↪` and
the break with it. GitHub's and VS Code's previews scroll a block on its own.

**Cost:** A long command line is no longer seen whole at a glance: its end is a scroll away, which the `›` says. The
cursor, find and a copy still reach all of it.

**Not chosen:** wrapping, as before (kept as the setting); the whole window scrolling sideways for a wide block, which
wrapping off does: the paragraphs around it would move too, and the block would scroll twice (ideas.md § Reading).

## D252: A code file's structure up to 4 MiB, on a thread of its own (16.7, 2026-10-18)

**Decision:** A code file's syntax pass (its grammar loaded, its tree parsed, and its spans, outline, syntax errors,
comment links, embedded languages and code model taken from it) runs on one background thread for the process, and
only for a source of at most 4 MiB of UTF-8 (`SYNTAX_SOURCE_LIMIT`). A bigger one keeps its text, as any text file
shows, without that structure, and says once why. A pass has twenty seconds on the thread. As built: design/tui.md §
Files beyond notes, Source code through tree-sitter (#187).

**Why:** A pass is one source's, whole: tree-sitter parses a file at once, and it can't be cut into batches as a big
note's parse is (15.1). A 3.7 MiB minified bundle took 4.3 s on a fast machine, idle, and missed a five-second deadline
with its cores busy; one many times bigger would hold the thread past any deadline worth having on a slow machine,
and every other code file's pass waits behind it. A file that big is nearly always made by a tool (a bundle, a dump, a
generated table): read or searched, rarely navigated by its outline. Before, any size was parsed on the main thread,
which held the keys for as long as it took (#177).

**Cost:** A source over 4 MiB written by hand has no outline, syntax errors or comment links in slipbox.

**Not chosen:** parsing any size on the thread with a deadline that grows with the source, as a big note's parse
batch's does: one 40 MB file would hold the thread, and the files behind it, for minutes; parsing big ones on the main
thread, as before, which froze the screen.

## D253: Drawn diagrams remembered on disk, a diagram too slow to draw as well (12.10, 2026-10-18)

**Decision:** A Mermaid diagram's finished drawing, as text or as SVG, is kept in one SQLite cache for the machine,
`diagrams.db` in slipbox's cache folder beside the parse cache, and the screen, `slipbox render` and export all read and
write it. Its key is everything that decides the drawing: the source, the width and glyphs or the colours and font,
slipbox's version, the drawing library's version and an epoch of slipbox's own. It keeps at most 2,048 drawings and
32 MiB, the least recently used going first. A failure the inputs decide is kept too, a timeout among them, under a key
that also names the deadline it had: a timeout on the screen never stops `slipbox render` or export trying with their
longer one. A worker that couldn't start or didn't start in time isn't kept. `SLIPBOX_DIAGRAM_CACHE=off` goes without
it. As built: design/rendering.md § Blocks and inlines (#180).

**Why:** Since diagrams are drawn in a background worker (#164), they were kept in memory for a session. A note opened
in a new session drew each one again: its source first, then the drawing a moment later, so the page jumped, and a slow
diagram took its whole time again. A drawing depends on its source and options, not on the vault it's in, so one store
for the machine serves every vault, as the parse cache does; render and export, drawing whole documents, gain the most.

**Cost:** A diagram that timed out on a busy machine stays as its source on the screen, labelled, until slipbox or the
library is upgraded, without being tried again; render and export still try it. The drawings, made from notes'
diagrams, are kept outside the vault in the cache folder, as parsed notes are.

**Not chosen:** a cache in each vault's cache folder (the same diagram in two vaults would be drawn twice); keeping
drawings alone (a diagram known to be too slow would cost the worker a second at every opening, on the screen's two
tries); keying on the library's version alone (a change to slipbox's own handling of a drawing would show stale ones
after an upgrade).

## D254: All four Tokyo Night variants use upstream colours (2.6, 2.7, 2026-10-18)

**Decision:** Ship `tokyo-night` (Night, still the default), `tokyo-night-storm`, `tokyo-night-moon` and
`tokyo-night-day`, with base colours from the official folke/tokyonight.nvim palettes. This amends D96's darker
backgrounds, softer text and custom syntax accents. Strong text uses the upstream foreground with bold; inline code
retains its own background and italics; syntax keywords and functions retain bold, with upstream magenta and blue.
All variants use the same semantic-role mapping and the existing heading-band blends. Provenance and the mapping
are in [the palette research](../research/tokyo-night-palettes.md).

**Why:** A named variant should match its upstream colours, and switching among the four should provide their
intended backgrounds and accents consistently. Keeping role styling separate preserves slipbox's readable layout
without silently substituting a different base palette.

**Cost:** The default Night background and foreground change visibly; existing user colour overrides still apply.

**Not chosen:** keeping the customized palette under the upstream Night name, or applying Night's custom accent
colours to Moon and Storm.

## D263: A message asks for its own frame (2026-10-23)

**Decision:** `App.message` asks the host for a frame each time something is said, so a message is drawn as it's said
wherever it comes from: a key's command, or an answer in the background (git, a helper, a thread). One said while a
frame is painted (`App.whileDrawing`, around the host's whole paint) asks for none, and shows on the next. Agreed with
the maintainer while fixing #17.

**Why:** A message said in the background, once git had answered, asked for no frame, so it showed only when something
else drew: the next key, another answer, or the message before it going away. #17 named three such paths in the branch
view, a fourth was found beside them, its reviews two more (the status line's switch, a branch file's diff), and each
one fixed by hand left the next one to be found. Asking in one place closes them all. OpenTUI draws one frame for any
number of requests made before it, so a key that says three things still draws once.

**Cost:** Every message asks for a frame, even one a key's own frame would have drawn; one more request, coalesced.
A list opened in the background still asks for its own (Remove…'s question, Merge…'s menu, Compare against…).

**Not chosen:** a frame asked for at each place that says something in the background (`BranchView.answered`, as the
issue proposed), which leaves every new path to remember it; a frame after a message said inside a frame, which could
keep drawing if something were said on every frame.
