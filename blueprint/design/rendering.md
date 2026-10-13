# Rendering

mdast to a laid-out, themed page: remark's tree, laid out by slipbox's own code (D7). Code: `src/core/layout/`,
`src/core/theme/`, `src/core/glyphs.ts`, `src/core/width.ts`, `src/core/sanitize.ts`.

## The layout IR (plan `2.1`)

Pure data, framework-agnostic, defined in `layout/ir.ts` (D6, D8):

```ts
Layout { lines: Line[]; links: LayoutLink[]; headings: LayoutHeading[]; width; clipped?; embedded? }
Line   { spans: Span[]; src; fill?; heading?; srcMap?; decor?; lens?; footnoteDef? }
Span   { text; role; attrs; bg?; link?; src?; task? }
```

- **`role`** is a semantic theme role (`h2`, `code_inline`, `wikilink`, `syn_keyword`…). The IR
  never holds a colour.
- **`attrs`** adds bold, italic, underline, strike or dim on top of the role's own style.
- **`fill`** extends a role's background to the full layout width. Headings and code blocks
  use it.
- **`src`** is the 1-based source line of the row's first text. Reading positions and reload
  anchoring store source lines, never rows (D98). Blank separator rows carry the
  line of the row above, so anchoring to a block lands on the block, not the gap before it.
- **`links`** records every link with its kind, target, resolution status and first drawn
  position (row, column). The TUI cycles and follows links from this list.
- **`embedded`** lists the notes drawn in place (`1.11`, D113), nested ones too, so a change to one lays
  this note out again.

Both faces draw the same IR: `tui/draw.ts` paints it through a `Canvas`, and `layout/ansi.ts`
turns it into a string for `slipbox render`.

## Blocks and inlines (plan `2.2`)

`layout/render.ts` handles every mdast node remark-gfm produces, plus `#tags` and Obsidian's highlights and comments.
Containers lay their children out at reduced width and prefix every row, so nesting composes.

| Node | Rendering |
| --- | --- |
| heading | level icon plus text in `h1`–`h6`; a background band across the width |
| paragraph | wrapped; soft breaks become spaces (none between Han or kana), hard breaks and `<br>` split rows |
| list | bullets per depth, numbers right-aligned, hanging indent |
| task item | checkbox glyph (after the number in an ordered list); a checked item's text is dimmed |
| blockquote | `▎` bar per row, italic dim text |
| callout | `> [!note] Title` (Obsidian and GitHub): icon, title, bar in the kind's colour; `> \[!note]` stays a quote |
| code | full width, background fill, language label at top right, highlighted, hard-wrapped |
| table | the allocator below |
| thematic break | a rule across the width |
| frontmatter | a "properties" block: aligned rows, a long key cut with `…`; a value's `[[link]]` a link; raw: broken |
| html block | shown dim, verbatim; comments (each `<!-- -->` on its own) hidden; a lone `<br>` is a blank row |
| footnote | `[1]` reference; the definition as `1.` with a hanging indent, its paragraphs apart |
| tag | `#name` in the `tag` role, followable: Obsidian's tags (`1.6`, D53; [links.md](links.md) § Tags) |
| highlight | `==text==` (Obsidian): its text in the `highlight` role, a marker's yellow behind it, what's inside too |
| comment | `%%text%%` (Obsidian): hidden — in a line, the white space where it was made one; alone, no row |
| definition | hidden; reference links resolve through it, the first of a label winning (CommonMark) |

**Headings** are linked to by their text (inline code included; footnote marks and images left out, the spaces around
them kept, so `## Setup [^1] notes` is `setup--notes` as on GitHub; trimmed at the ends) — one text for the render, the
graph and source mode's scan, which the outline and breadcrumb draw on one row, white space folded — and slugged
GitHub's way — letters, marks, numbers, `_` and `-` kept, so a Devanagari heading keeps its vowel signs — with repeats
numbered as GitHub numbers them (`#setup-1` is the second "Setup"). A trailing `{#id …}` (Pandoc, MkDocs, Docusaurus) is
the heading's explicit id, not drawn; `<a id="x">` and `<a name="x">` are anchors too. Where a fragment lands is
`core/landing.ts`'s one matcher (D84; [links.md](links.md) § Where a link lands; [tui.md](tui.md) § Following links). A
no-break space (U+00A0, U+2007, U+202F) is never a place to wrap.

**Inline:** `**strong**` gets the `strong` role, which has an explicitly lighter foreground, because bold alone does not
read as bold in a terminal (plan `2.7`). Also: `*emphasis*`, `~~strike~~`, Obsidian's `==highlight==` in the `highlight`
role, on its background — a link or code inside it too —, and `` `code` `` in the `code_inline` role with its own
background. Obsidian's `%%comments%%` are hidden while reading, shown as typed in source mode and the lens, which draw
the file's text (DF-D17): `a %%note%% b` reads `a b`, `oil %%note%%.` reads `oil.`, a paragraph of nothing but comments
leaves no row, and a comment over blank lines (§ Obsidian's highlights and comments) no rows. Rows keep their source
lines. Links render as their text; the URL follows as `<url>` when colour is off or `render.show_urls` asks. Images
render as `▣ alt`, and alt text plus path stay the floor (12.x, D101): a picture alone in its paragraph, a local image
file (PNG, JPEG, WebP, GIF), is drawn under its `▣ alt` line where the terminal draws images — Kitty graphics or sixel,
as OpenTUI finds it asking, never blocks of colour (D126) — sized to the text width, its proportions kept, at most 12
rows, from where its `▣ alt` text starts (past a list's bullet, a quote's bar); scrolled half out of sight, the part
that shows. One embedded by name, `![[dal.png]]` (12.13, D103), is drawn the same, found as its link is (anywhere in the
root, the nearest of two; two tied, neither): Obsidian's `|300` its width in pixels, `|240x180` the box it fits in, its
proportions kept. An SVG (12.15, D127) — by its name, or a picture fetched told by how it starts — is rasterised by
resvg (WebAssembly) at the size it's drawn, from its own size, into the cache, and drawn as a PNG is; it fetches nothing
it links to. One in an embedded note (12.14) is found from where that note is — its path from its folder, its name from
its place in its root — and drawn inside its frame. Beside text, or where the terminal draws none (`[render] images =
"never"` too): `▣ alt` alone. Where the terminal speaks Kitty graphics, a picture is sent to it once (12.7, D102) —
compressed, at the pixels it's drawn in, with a virtual placement of its cells — and drawn as Kitty's Unicode
placeholders: each cell U+10EEEE in the picture's id's colour, its row and column as combining marks. They're text, so
scrolling moves them and the terminal the picture with them: nothing is sent again, nothing waits. The last 48 are kept
in the terminal; quitting lets them go. With sixel (OpenTUI's own picture path, which numbers pictures by the order
they're drawn in and sends them again as that changes), a step of scrolling draws a view's pictures, but quick steps
after it (a key held: within 120 ms of the last) don't, nor a wheel's from its first tick — their rows stay — and
they're drawn once it rests. A picture on the internet (12.12) is fetched only as `[render] images_remote` says, in your
own config (DF-D1): `ask` (the default) — its link, until `enter` on it asks to fetch it, this once or from its site
without asking (until slipbox quits); `show` — fetched as the note's laid out; `never` — neither fetched nor drawn,
`enter` copying its address. Fetched (into the cache, a file per address: an image's content type, at most 20 MB, within
15 s), it's drawn as a local one, without asking again; a fetch that fails says why and isn't tried again until `enter`.
Inline tags such as `<kbd>` and `<sup>` are dropped and their text kept.

**Mermaid** (12.10, D127): a ` ```mermaid ` block is drawn in the terminal's own characters — box drawing, arrows, its
words in the text's colour and its lines in the table's border colour; in ASCII where the glyphs are — by
`beautiful-mermaid`, no browser (flowcharts, state, sequence, class and ER diagrams, XY charts). Too wide at its own
spacing, it's drawn closer together; still too wide, a kind it doesn't draw (`pie`, `gantt`), or one it can't read:
its code, the label saying why (`mermaid — too wide to draw`, `mermaid — not drawn: pie`). Every row is at the
block's line, so the lens opens on its source. The library loads the first time a note holds a diagram; until it's in
(a moment), the block is its code, then drawn — and `slipbox render` waits for it. Where pictures are drawn,
`[render] mermaid = "picture"` (12.16) draws it as one instead: `beautiful-mermaid`'s SVG in the theme's colours (its
text, the table's border, a link's accent, `dim`; `ansi:N` as xterm has it), the terminal's background showing
through, its words in a sans font found on the machine (DejaVu, Liberation, Noto, Arial, Helvetica) — as big as the
terminal's own, at most the text's width and 60 rows, centred: its first row the indent before it, where the cursor
stops. No font found, a kind it doesn't draw, or pictures not drawn: in characters, as above.

**Maths** (12.11, D127): `$…$` in text and `$$` blocks, read as Obsidian reads them — not maths where the `$`s hold a
space just inside them, or a digit follows the closing one (`costs $5 and $10` is money; `$$…$$` in text is maths).
Drawn as Unicode text in the `math` role: commands as the characters Unicode has (`unicodeit`'s table: `\alpha` α, `\in`
∈, `\mathbb{R}` ℝ), sub- and superscripts whole where Unicode has each character (`x^2` x², `\sum_{i=1}^n` ∑ᵢ₌₁ⁿ), else
bracketed (`e^{i\pi}` e^(iπ)); fractions `a/b` (`(a+b)/c`, `½`), roots `√x` `∛x`, accents over each letter, `\text`'s
words, functions as their names (`\log`), spacing and sizing done first — a command is given to the table only by its
exact name. A display's rows are centred together: `aligned` rows lined up at their `&`, `cases` braced (`⎧ ⎩`),
matrices bracketed (`⎛ ⎝`), what's written around one on its middle row. A formula with a command none of this knows is
as written — in text `$…$`, a display its LaTeX, highlighted (`math — as written`; one wider than the text,
`math — too wide to draw`). Where pictures are drawn, `[render] math = "picture"` (12.17) typesets a display as one, by
MathJax, in the `math` role's colour, as big as the words beside it, centred; one it can't read, or wider than the text,
is text as above. Inline maths is always text. What's read from a note as text — a heading's (so its slug), a task's, a
link's, a footnote's — keeps its maths as written.

**Wikilinks are links** (`21.3`, D71): `[[name]]` shows its name, `[[name|text]]` its text,
`[[name#Heading]]` `name › Heading`, `[[name#^id]]` `name ^id` — never inside code, nor after a `\`. A picture
embedded by name, `![[dal.png]]`, is `▣ dal.png`, as a picture by its path is: Obsidian's size, `|300` or
`|240x180`, is never its text. A link's colour shows its status: resolved, `link_unresolved` red, or
`link_ambiguous` when two of a name tie.

**What the file says** (`21.9`, D77): a link without text of its own — `[](docs/plan.md)`,
or text that is just its target — shows its target as written; no form is made up for the screen. Where a file is
named in a list — backlinks, search results, pickers, hovers, rename previews — it's by its path: from this root (or
the folder opened), else from home (`~/…`), else absolute (`graph.shownPath`).

**Embeds** (`1.11`, D113): a paragraph of nothing but embeds — each a note by name, `![[note]]` (`21.3`), or by its
path, `![text](note.md)`, as the converter writes them (`20.1`) and Obsidian does without wikilinks — draws each
embedded note in place (beside other text, or with no note there, it's a reference, `⧉ text`, as a picture's is
`▣ alt`): a header with its name (`⧉ inner`, `⧉ note › Heading`, `⧉ note ^id`; a link to it), then its text behind a bar
(role `embed`). `![x](note.md)` is the whole note but its frontmatter; `![x](note.md#heading)` the heading (by its text
or slug) and what follows, to the next heading as high; `![x](note.md#^id)` the block whose id that is — a paragraph's
or a list item's, at the end of its text, or the table, quote or list on the line before a lone `^id`. Read-only:

- **Where it is.** Its rows are all at the embed's line: the note shown has the cursor, anchors and the lens; the
  embedded note's headings stay out of its outline. Its links are its own: their status, and where they lead, are
  as from the embedded note (`[sibling](sibling.md)` beside it, `[x](#heading)` its own heading); its pictures too.
- **Loops and depth.** An embed of a note already being drawn says `embeds itself: not drawn again`; embeds inside
  embeds go three deep, then `embedded deeper still: enter opens it`. A heading or block that isn't there says so.
- **Current.** It's read from its file (re-read when that changes); a block holding one is never kept in the render
  cache, and the note showing it lays out again when the graph hears the embedded note change.
- **References still.** A picture (`![x](pic.png)`, `![[pic.png]]`) is a picture's `▣ alt` — drawn under it where
  pictures are (12.x), never framed; any other file, an embed that reaches nothing, and an embed with text around it
  render as a reference.
- **Untouched elsewhere.** Search, backlinks and the context bundle are unchanged by an embed: it is a link, and
  its text belongs to its note (D113).

## Data files (plans `16.11`–`16.14`)

A data file is read into the same tree a note is (`core/data.ts`; D108), so the renderer, the outline,
the breadcrumb, `[x](file.toml#section)`, find and the lens work unchanged:

- **TOML and INI sections become headings**: a `[table]` or `[section]`, deeper by its dots — the
  file itself is flat sections, so headings say what it says.
- **YAML and JSON are a tree** (`16.12`): every key a row, nested ones inside guides (`├─ └─ │`, the
  explorer's, ASCII too) at every depth, drawn alike. An object — or a list that isn't plain — is a
  branch row with its rows under it; list items are rows `1`, `2`…, and when one object item has
  depth, all object items open, so siblings read alike. What stays on one line: scalars, lists of
  scalars, and a small plain map (`{connect: 5, idle: 300}`, up to 40 columns) — unless it holds a
  reference key, whose value is a link. Branch rows are the outline and the breadcrumb
  (`containers › 1 › health`), and a `#/a/b` JSON pointer (a `$ref`'s) goes to the row it names.
  Several documents (`---`) are rows `document 1`, `document 2`…; a comment block before a
  document's content is its opening row.
- **Each key is a `dataField`** on its own source lines (a comment above it included), drawn like
  frontmatter's properties: the key column shared by a section's keys (28 columns at most, cut with
  `…`), the value coloured by its kind (numbers and dates, booleans and null, strings), a comment
  dimmed after it. Keys follow each other with no blank row between. A string shows unquoted; a list
  or an inline table as written, its whitespace folded.
- **Records become tables** through the allocator: a YAML or JSON list of two or more objects with
  plain values (in the tree, under its key), TOML `[[name]]` entries likewise; a row per record,
  on its own source line. A value in a record that is a link (below) is a link in its cell, read
  under its column's key, and the graph counts it at its record's line.
- **Comment lines** on their own are dimmed rows. One comment line right above a key is that key's
  comment, drawn after its value; several lines, or the file's opening ones, are a block of their
  own (prose about more than one key).
- **Values that are links** (`16.15`) draw as links, followed with `enter`: a URL; a reference
  key's value (`$ref`, `$schema`, `schema`, `include(s)`, `extends`, `import(s)`, `file`, `path`),
  shown broken when it doesn't resolve; and any path-like value (`schemas/user.json`,
  `../base.toml`) that resolves to a file of the root — relative to the file's folder, as a markdown
  link is. A link is a single value, not a list or a number: `includes: [base.json]`, `schema: 2`
  and `path: null` are no links. The graph reads the same links (files over 256 KB aside), so a
  data file shows among the backlinks of what it points at, and `slipbox links` lists them. No
  wikilinks: data files have no such convention.
- **CSV and TSV** are one table: quoted fields (with `""` and newlines inside), the first row the
  header, rows padded to the widest; past 2,000 rows the rest are counted, and source mode shows
  them.

TOML, INI and `.env` are read line by line (their structure is lines), TOML validated by
`smol-toml`; INI's comments start with `#`, `;` or `!` (Java's `.properties`), whose values go on
after a backslash when the next line is indented. YAML and JSON come from `yaml`'s document tree,
which keeps positions and comments; JSON is validated by `JSON.parse`, read as editors read
`tsconfig.json` (jsonc): `//` and `/* */` comments and trailing commas allowed. `.json5` is read
the same way, as JSONC: JSON5's own syntax (unquoted keys, single quotes, hex numbers) is reported
as a parse error and the file opens in source mode. **Nothing is ever re-serialized**: edits are
always on the text, so comments, order and formatting survive. A file that doesn't parse has no
render (`16.14`): its error is shown and source mode opens.

## The wikilink tokenizer

`core/wikilink.ts` is a micromark extension, not a regex: the reader's (`21.3`, D71), and the converter's (`20.1`,
D57), which reads through `parseLegacy`. That is why `[[links]]` inside code spans and fenced
blocks are never read or converted, and why `\[[escaped]]` stays literal. Every node also carries its source
position. It parses `![[embeds]]`, which `remark-wiki-link` does not, and treats `\|` as an alias divider, since that
is how an alias is written inside a table cell.

## Obsidian's highlights and comments

`core/obsidian.ts` is a micromark extension too (DF-D17), so neither is read inside code, `\==` and `\%%` stay text, and
each node has its position. A highlight pairs as GFM's `~~strike~~` does: exactly two `=`, flanking as emphasis does,
so `a == b` and `===` are text, and what's inside is read as any text (`==**bold**==`, a link). A comment pairs any two
`%%` of a paragraph, spaces or not, across its lines; what's inside is read too, so a link, a tag or a task in a
comment is still the note's — counted, renamed with its note — only not drawn (DF-D27). A comment over blank lines —
from a paragraph that starts with a `%%` pairing with nothing to the next block at its level that ends with one (a list
or a quote whose last line does: a `%%` right after a list is its last item's lazy line) — becomes a block of its own
(`commentBlock`) after the parse, once its chunks are one; its blocks are read as any are. One never closed is text.

## The table allocator (plan `2.3`)

`layout/table.ts` (D89). Tables are re-allocated at every width, so this decides how a table survives
a resize. It starts from render-markdown's algorithm, fixes its known flaw, and changes where
spare width goes.

```text
desired[i] = max over rows of (content width + 2 * padding)
minimum[i] = max over rows of (longest soft segment + 2 * padding)
budget     = width - (ncols + 1)

sum(desired) <= budget   -> desired: nothing wraps
budget < ncols * 5       -> no grid: one record per row (a column under 3 content columns is unreadable)
sum(minimum) <= budget   -> each column at its own minimum, surplus placed by cost (below)
fair share >= 6 columns  -> words must break: columns floored at a fair share, same rule
otherwise                -> no grid: one record per row
```

**The flaw fixed.** render-markdown checks `minimum` only in aggregate, so a column could end up
narrower than its longest word and overflow. Here no column starts below its own minimum. The
room left then first lifts any column below 3 content columns (a column of one-letter cells) to
that floor, before any column grows past it: whole words come first, the floor second.

**Soft segments.** A column's minimum is its longest *soft segment*, not its longest token.
Tokens split after `/ - _ . ? & = , : ; |`, so `anti_conceal.enabled` counts as `anti_conceal.`
plus `enabled`, and a path counts by its components. The wrapper breaks long tokens at exactly
those points, so a column of identifiers no longer pins the table wide.

**Where the surplus goes.** Handing every column an equal share ignores how much text each one
holds, and a sentence column ends up as narrow as a one-word column. Instead the allocator
minimises a cost: the table's rendered height (the sum over rows of the tallest cell) plus one
per word split across lines. So a broken file name costs as much as an extra row, and names
stay whole whenever that is affordable. Greedily, each step widens the column that removes the
most cost per column spent. Greedy search can stall on a plateau, where a row is tall in two
columns and shrinks only when both widen. So three candidates are scored and the cheapest wins:
greedy then water-fill, water-fill alone, and surplus shared in proportion to each column's
unmet width.

**Measured once, counted many times.** Each cell is measured once into word, space and segment
widths. `countLines` and `fit` in `layout/wrap.ts` answer "how many rows at width w" without
building spans, using the same packing rule `wrapSpans` draws with — grapheme by grapheme when a
segment is longer than a row, since a wide character is never split and can leave a row a column
short, and with no row counted after a final hard break. So the allocator's prediction is exactly
what is drawn; `tests/render.test.ts` checks it on 39,000 random mixes of ASCII, CJK, kinsoku
punctuation, emoji, ZWJ sequences and breaks.

**Cost.** A re-layout on resize, tables included, measured on 2026-09-29 (widths 40 to 200):

| Demo note | Worst re-layout |
| --- | --- |
| `logs/observing-log-2026.md` (216 table rows) | 14 ms |
| `handbook/operations-handbook.md` (1,231 lines) | 23 ms |
| `equipment/instrument-inventory.md` (rows of 500+ characters) | 7 ms |

**Records.** Below a useful width, one record per row: labels in an aligned column (at most a third
of the width), values wrapped beside them. A table with a header row only shows its column names,
one per row, rather than nothing.

**Verified by properties.** `tests/render.test.ts` runs 5,000 generated allocations checking
the budget and minimums. It also runs 400 generated tables where the chosen allocation must
never cost more than water-filling. A resize sweep from 150 down to 40 columns and back in the
live TUI showed every table row closing inside the width at every step, with the reading
position kept.

Cells wrap with the same wrapper as paragraphs. Separators between body rows appear only when
some row wraps. The header separator is doubled (`╞═╪═╡`).

## Wrapping and width (plans `0.7`, `2.4`)

`core/width.ts` is the only thing that measures text (D88). It works per grapheme cluster
(`Intl.Segmenter`):

- ASCII is 1 column, CJK and East Asian Wide are 2, RGI emoji are 2.
- A ZWJ family is one grapheme of width 2.
- Combining marks and zero-width characters are 0.
- **How wide any other cluster is follows the terminal** (decided 2026-10-06), as OpenTUI found it asking
  (`setWidthMethod`; the TUI lays everything out again if the answer comes after the first frame): `unicode`, the
  default — terminals that cluster graphemes (libghostty, kitty, WezTerm) — counts a cluster its own width, Bun's
  measure and OpenTUI's (`हिन्दी` is 3); `wcwidth` — terminals that don't — as wide as its first code point (`हिन्दी` 2,
  a flag 1). OpenTUI's third method, `unicode-wide`, is counted as `unicode`. A test holds slipbox to OpenTUI's own
  cells on every grapheme the reference set and halden hold, and every glyph slipbox draws of its own; OpenTUI's table
  has the heart and exclamation ornaments wide (❠ to ❧: ❤, the unicode set's ❢), which slipbox follows, and Bengali's
  reph 1, which it doesn't. A terminal may still count differently from OpenTUI: libghostty gives an Indic spacing
  mark a column of its own.

`layout/wrap.ts` breaks at spaces, and between CJK characters — except that closing punctuation
(`、` `。` `）` `」` `…`, and an ASCII `,` or `.` right after a CJK character) never starts a row, and
opening punctuation (`（` `「`) never ends one (kinsoku). A token longer than the row starts
a fresh row and packs its soft segments (split after `/ - _ . ? & = , : ; |`), so paths, URLs and
identifiers break at a readable point. Only a segment wider than the whole row breaks at the
grapheme that overflows.
**Hostile notes** (`15.2`, D111). Containers deeper than 60 (quotes, lists) render as their plain text, so a note
5,000 levels deep neither overflows the stack nor hides everything. Below 8 columns for its child, a
container stops indenting (a quote, a callout or an embed drops its bar, a list item's marker takes a
row of its own), and a data file's tree drops its outer guides, so nothing is cut in a narrow split.
Inputs the markdown parser takes quadratic time over are tamed before parsing without moving an
offset (`tame` in `core/parse.ts`), and only where an ordinary note never has them: frontmatter,
fenced code and lines made only of rule characters (`***`, a setext `===`) are left alone. A run of
64 or more `*` `_` `[` `]` in a line with other text becomes look-alikes; 20 or more container
markers, or 96 columns of indentation before a list marker, get one no-break space at the cap, which
ends the nesting there.
Frontmatter over 64 KB shows as text; YAML is parsed without the (quadratic) duplicate-key check.

Nothing ever overflows the layout width. As a last defence the renderer cuts any row still too wide
(`enforceRow`) and counts it in `Layout.clipped`, since a cut row is a block's bug and lost text:
`tests/render.test.ts` renders every demo note at six widths in two glyph sets and asserts that no
row was cut (a width check alone could never fail, with the cut in place).

## Readability defaults (plan `2.7`)

Carried over from the nvim configuration, where they were arrived at by trial (D96, D97):

- **Inset.** `render.inset` (default 4) columns are held back from the pane width, so a table's
  right border never sits on the edge. It is capped at 5% of narrow panes and is never below 1.
- **Inline code** has its own background: `#c0caf5` on `#292e42`, italic, in Tokyo Night.
- **Bold** has an explicit lighter foreground: `#bcc5e6` in Tokyo Night.
- **Borders** are light (`│`, `─`) by default, heavy (`┃`, `━`) with `ui.lines = "heavy"`, in the
  one `border` colour whatever has focus; focus shows as brightness in titles and tabs
  ([tui.md](tui.md) § Side panes). Where two lines meet a rule at one column, the joint is one glyph from all
  their arms (`╋`, not whichever was drawn last).
- **Code fences** are full width, with no right padding.

## Themes (plan `2.6`)

`core/theme/theme.ts` defines about 100 semantic roles covering the document, syntax and chrome (D93).
Every theme reduces to an 18-colour `Palette`, and `themeFromPalette` maps it to roles, so there is
one mapping to get right. Heading bands are the heading colour blended into the background, 14%
in dark themes and 16% in light ones. A highlight's band (the `highlight` role, Obsidian's `==text==`; DF-D17) is the
palette's yellow blended into the background, 30% in dark themes and 40% in light ones, under the strong foreground;
`terminal` puts the terminal's yellow behind black, and `mono` reverses it, `inverse` carried to a span's style and the
ANSI writer. Single roles can be overridden from config, for every theme or one (`[colors]`,
[configuration.md](../../docs/manual/configuration.md) § Colours).

| Kind | Themes |
| --- | --- |
| hand-tuned | `tokyo-night` (default, D94, with the nvim adjustments), `tokyo-night-day` |
| hand-tuned | `catppuccin-mocha`, `catppuccin-latte` |
| base16 data | `catppuccin-frappe`, `catppuccin-macchiato`, `dracula`, `gruvbox-dark` |
| base16 data | `gruvbox-light`, `nord`, `solarized-dark`, `solarized-light`, `rose-pine` |
| base16 data | `everforest`, `kanagawa`, `one-dark`, `monokai` |
| special | `terminal` (ANSI indexed colours: the terminal's own theme flows through) |
| special | `mono` (attributes only: links underlined, unresolved dim too, code bold; used under `NO_COLOR`) |

Themes are built in (D91), hand-tuned or from base16 data (D92). In the TUI, `NO_COLOR` wins over any theme setting,
session or picker choice (D95). Without colour the
scrollbar's track is blank so the thumb shows, and the current note or section is bold.

**User themes:** any base16 or base24 scheme file (`*.yaml`, either the current `palette:` format
or the legacy flat one) in `~/.config/slipbox/themes/` is a theme under its file name. An unknown
or broken theme falls back to `tokyo-night` with a warning.

## Glyphs (plan `2.8`)

Fonts cannot be probed through the terminal, so `render.glyphs = "auto"` is a heuristic with an
override:

1. ASCII when a locale is set (`LC_ALL`, `LC_CTYPE` or `LANG`) and isn't UTF-8, or `TERM=linux`.
2. Nerd glyphs when the terminal bundles the Nerd Font symbols (Ghostty, kitty, WezTerm).
3. Plain Unicode otherwise.

A set named in the config (`render.glyphs`) forces it; where the config says `auto`, `SLIPBOX_GLYPHS` chooses one before
the detection above (DF-D12); and in the TUI `space u g` picks one with a live preview (`:glyphs <set>` sets it
directly). The chrome has ASCII fallbacks too: `≡`→`=`, `▤`→`#`, `×`→`x`, `›`→`>`, `§`→`#`, tree lines `|` `` ` `` `-`,
box joints `+`. And what such a console can't draw goes as an ASCII look-alike, one column for one, in the chrome and
the note alike: the marks (`•` unsaved `*`, `⚠` `!`, `↻` `~`, `●` watching `*`), `…` `~`, dashes and curly quotes; the
leader key shows as `SPC`. The Nerd set uses the same heading icons as the render-markdown configuration it replaces.

## Escapes (constraint `2.9`)

`core/sanitize.ts` (D90) removes CSI, OSC, DCS/APC and two-byte escape sequences, bare C0 and C1
controls, bidi override and isolate characters and the bidi marks (U+200E, U+200F, U+061C), which
are used for display spoofing, and turns the line and paragraph separators (U+2028, U+2029) into
spaces. An OSC or DCS string left unterminated (a truncated capture) is removed to the end of its
line, never past it, so a code block keeps its lines and their source lines. The TUI's chrome
draws names (files, folders, headings, config labels) through the same function, and each canvas
passes every cell through it again (`safeCell`). Every
string entering the IR passes through it: text, code, HTML, frontmatter, link targets and
language labels. As a backstop, the layout's final pass sanitizes every span again, whichever
path built it (footnote labels and nested frontmatter keys were found that way). The fixture
`tests/fixtures/vault/escapes.md` holds a hostile note, and the tests check that neither face
ever emits an escape from it. Tabs expand to stops of 4 display columns in code blocks, HTML
and frontmatter, and of 2 in inline code (a CJK character counts two).

## Code-fence highlighting (plan `2.5`)

highlight.js with about 25 common languages (`bash`, `typescript`, `lua`, `python`, `rust`,
`go`, `json`, `yaml`, `toml` via `ini`, `diff`…). Only named languages are highlighted, since
auto-detection is slow and often wrong. Scopes map to the `syn_*` roles. It lives in the core, so
`slipbox render` and the TUI highlight identically.

Source files in source mode use it too, a line at a time, with tree-sitter (`core/syntax.ts`,
`16.7`, D109) painting over it the parts of lines inside a string or comment that spans lines — which a
line alone can't know — and, in a file of several languages (`16.22`: a component's script and style), saying which
language each line is in (`languageAt`; D122). See [tui.md](tui.md) § Files beyond notes.

## The ANSI writer

`layout/ansi.ts` writes the IR as text for `slipbox render`. Colour depth comes from `NO_COLOR`,
whether stdout is a TTY, `COLORTERM` and `TERM`: truecolor, 256, 16, or none. The 256- and 16-colour
paths approximate the theme's colours. With `--plain`, `--color never`, or when stdout is piped, the
output contains no escape sequences at all. A 256-colour palette entry (from `[colors]`, say)
becomes the nearest of the 16 on a 16-colour terminal.
