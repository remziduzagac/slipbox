# Rendering

Phase 1: mdast to a laid-out, themed page. The goal is leaf parity; the bar is "replaces leaf for
reading `docs/`". Code: `src/core/layout/`, `src/core/theme/`, `src/core/glyphs.ts`,
`src/core/width.ts`, `src/core/sanitize.ts`.

## The layout IR (plan `2.1`)

Pure data, framework-agnostic, defined in `layout/ir.ts`:

```ts
Layout { lines: Line[]; links: LayoutLink[]; headings: LayoutHeading[]; width }
Line   { spans: Span[]; src; fill?; heading? }
Span   { text; role; attrs; bg?; link?; src? }
```

- **`role`** is a semantic theme role (`h2`, `code_inline`, `wikilink`, `syn_keyword`…). The IR
  never holds a colour.
- **`attrs`** adds bold, italic, underline, strike or dim on top of the role's own style.
- **`fill`** extends a role's background to the full layout width. Headings and code blocks
  use it.
- **`src`** is the 1-based source line of the row's first text. Reading positions and reload
  anchoring store source lines, never rows (decision `3.5`). Blank separator rows carry the
  line of the row above, so anchoring to a block lands on the block, not the gap before it.
- **`links`** records every link with its kind, target, resolution status and first drawn
  position (row, column). The TUI cycles and follows links from this list.

Both faces draw the same IR: `tui/draw.ts` paints it through a `Canvas`, and `layout/ansi.ts`
turns it into a string for `slipbox render`.

## Blocks and inlines (plan `2.2`)

`layout/render.ts` handles every mdast node remark-gfm produces, plus wikilinks. Containers lay
their children out at reduced width and prefix every row, so nesting composes.

| Node | Rendering |
| --- | --- |
| heading | level icon plus text in `h1`–`h6`; a background band across the width |
| paragraph | wrapped; soft breaks become spaces, hard breaks and `<br>` split rows |
| list | bullets per depth, numbers right-aligned, hanging indent |
| task item | checkbox glyph; a checked item's text is dimmed |
| blockquote | `▎` bar per row, italic dim text |
| callout | `> [!note] Title` (Obsidian and GitHub): icon, title, bar in the kind's colour |
| code | full width, background fill, language label at top right, highlighted, hard-wrapped |
| table | the allocator below |
| thematic break | a rule across the width |
| frontmatter | a "properties" block: aligned key and value rows; raw text plus error if broken |
| html block | shown dim, verbatim; comments hidden; a lone `<br>` is a blank row |
| footnote | `[1]` reference; the definition as `1.` with a hanging indent |
| definition | hidden; reference links resolve through it |

**Inline:** `**strong**` gets the `strong` role, which has an explicitly lighter foreground,
because bold alone does not read as bold in a terminal (plan `2.7`). Also: `*emphasis*`,
`~~strike~~`, and `` `code` `` in the `code_inline` role with its own background. Links render
as their text; the URL follows as `<url>` when colour is off or `render.show_urls` asks.
Images render as `▣ alt`: phase 6 adds pixels, and alt text plus path stay the floor. Inline
tags such as `<kbd>` and `<sup>` are dropped and their text kept.

**Wikilinks** render as their alias, or as `target › heading`. Colour shows status: `wikilink`
resolved, `link_unresolved` red, `link_ambiguous` orange. Embeds (`![[x]]`) render as a
reference, `⧉ x`. Transclusion is phase 4.

## The wikilink tokenizer

`core/wikilink.ts` is a micromark extension, not a regex. That is why `[[links]]` inside code
spans and fenced blocks are never links, and why `\[[escaped]]` stays literal. Every node also
carries its source position. It parses `![[embeds]]`, which `remark-wiki-link` does not, and
treats `\|` as an alias divider, since that is how an alias is written inside a table cell.

## The table allocator (plan `2.3`)

`layout/table.ts`. Tables are re-allocated at every width, so this decides how a table survives
a resize. It starts from render-markdown's algorithm, fixes its known flaw, and changes where
spare width goes.

```text
desired[i] = max over rows of (content width + 2 * padding)
minimum[i] = max over rows of (longest soft segment + 2 * padding)
budget     = width - (ncols + 1)

sum(desired) <= budget   -> desired: nothing wraps
sum(minimum) <= budget   -> each column at its own minimum, surplus placed by cost (below)
fair share >= 6 columns  -> words must break: columns floored at a fair share, same rule
otherwise                -> no grid: one record per row
```

**The flaw fixed.** render-markdown checks `minimum` only in aggregate, so a column could end up
narrower than its longest word and overflow. Here no column starts below its own minimum.

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
building spans, using the same packing rule `wrapSpans` draws with. So the allocator's
prediction is exactly what is drawn.

**Cost.** A re-layout on resize, tables included, measured on 2026-09-25:

| Sample | Worst re-layout |
| --- | --- |
| `dense-tables.md` (232 table rows) | 20 ms |
| `large-document.md` | 19 ms |
| `overlong-table-rows.md` | 6 ms |

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

`core/width.ts` is the only thing that measures text. It works per grapheme cluster
(`Intl.Segmenter`):

- ASCII is 1 column, CJK and East Asian Wide are 2, RGI emoji are 2.
- A ZWJ family is one grapheme of width 2.
- Combining marks and zero-width characters are 0.

`layout/wrap.ts` breaks at spaces, and between CJK characters. A token longer than the row starts
a fresh row and packs its soft segments (split after `/ - _ . ? & = , : ; |`), so paths, URLs and
identifiers break at a readable point. Only a segment wider than the whole row breaks at the
grapheme that overflows.
Nothing ever overflows the layout width: `tests/render.test.ts` renders every sample at six
widths in two glyph sets and asserts that.

## Readability defaults (plan `2.7`)

Carried over from the nvim configuration, where they were arrived at by trial:

- **Inset.** `render.inset` (default 4) columns are held back from the pane width, so a table's
  right border never sits on the edge. It is capped at 5% of narrow panes and is never below 1.
- **Inline code** has its own background: `#c0caf5` on `#292e42`, italic, in Tokyo Night.
- **Bold** has an explicit lighter foreground: `#bcc5e6` in Tokyo Night.
- **Borders** are thick (`┃`, `━`), in the one `border` colour whatever has focus; focus shows
  as brightness in titles and tabs ([tui.md](tui.md)).
- **Code fences** are full width, with no right padding.

## Themes (plan `2.6`)

`core/theme/theme.ts` defines about 100 semantic roles covering the document, syntax and chrome.
Every theme reduces to an 18-colour `Palette`, and `themeFromPalette` maps it to roles, so there is
one mapping to get right. Heading bands are the heading colour blended into the background, 14%
in dark themes and 16% in light ones. Single roles can be overridden from config, for every theme or one
(`[colors]`, [configuration.md](configuration.md)).

| Kind | Themes |
| --- | --- |
| hand-tuned | `tokyo-night` (default, with the nvim adjustments), `tokyo-night-day` |
| hand-tuned | `catppuccin-mocha`, `catppuccin-latte` |
| base16 data | `catppuccin-frappe`, `catppuccin-macchiato`, `dracula`, `gruvbox-dark` |
| base16 data | `gruvbox-light`, `nord`, `solarized-dark`, `solarized-light`, `rose-pine` |
| base16 data | `everforest`, `kanagawa`, `one-dark`, `monokai` |
| special | `terminal` (ANSI indexed colours: the terminal's own theme flows through) |
| special | `mono` (no colour, attributes only; always used when `NO_COLOR` is set) |

In the TUI, `NO_COLOR` wins over any theme setting, session or picker choice. Without colour the
scrollbar's track is blank so the thumb shows, and the current note or section is bold.

**User themes:** any base16 or base24 scheme file (`*.yaml`, either the current `palette:` format
or the legacy flat one) in `~/.config/slipbox/themes/` is a theme under its file name. An unknown
or broken theme falls back to `tokyo-night` with a warning.

## Glyphs (plan `2.8`)

Fonts cannot be probed through the terminal, so `render.glyphs = "auto"` is a heuristic with an
override:

1. ASCII when the locale is not UTF-8 or `TERM=linux`.
2. Nerd glyphs when the terminal bundles the Nerd Font symbols (Ghostty, kitty, WezTerm).
3. Plain Unicode otherwise.

`SLIPBOX_GLYPHS` or the config value forces a set, and in the TUI `space u g` picks one with a live
preview (`:glyphs <set>` sets it directly). The chrome has ASCII fallbacks too: `≡`→`=`, `▤`→`#`,
`×`→`x`, `›`→`>`, `§`→`#`, tree lines `|` `` ` `` `-`, box joints `+`.
The Nerd set uses the same heading icons as the render-markdown configuration it replaces.

## Escapes (constraint `2.9`)

`core/sanitize.ts` removes CSI, OSC, DCS/APC and two-byte escape sequences, bare C0 and C1
controls, and bidi override and isolate characters, which are used for display spoofing. Every
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

## The ANSI writer

`layout/ansi.ts` writes the IR as text for `slipbox render`. Colour depth comes from `NO_COLOR`,
whether stdout is a TTY, `COLORTERM` and `TERM`: truecolor, 256, 16, or none. The 256- and 16-colour
paths approximate the theme's colours. With `--plain`, `--color never`, or when stdout is piped, the
output contains no escape sequences at all. A 256-colour palette entry (from `[colors]`, say)
becomes the nearest of the 16 on a 16-colour terminal.
