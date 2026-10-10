# Cases

Every case the reference set covers, by area: the case, the files that carry it, and where the case comes from (the
design docs, the plan's item ids, the tests). Paths are relative to this folder; `.build/…` files are made by the
build (`scripts/build-home.ts`), not kept as they are. Each file's purpose and the cases it carries in detail are in
`.build/manifest.json`.

## By area

### headings

- All six ATX levels each with its icon and background band — `notes/meetings/all-hands-archive.md`,
  `work/kestrel/docs/qa/render-torture.md` (rendering.md Blocks table; plan 2.2)
- Setext h1 and h2 (=== and ---) — `notes/meetings/all-hands-archive.md`, `work/product/roadmap/q4.md`
  (operations-handbook coverage; render.ts heading)
- Repeated heading text keeps the plain slug (no -1), #anchor finds the first —
  `hobbies/cycling/rides/202609131900-300k-brevet.md`, `notes/meetings/standup-log.md`,
  `notes/projects/kestrel-v2-3.md`, `notes/weekly/2026-W34.md` (rendering.md Headings; render.test review cycle 4)
- Heading with a footnote mark: link text and slug leave the mark out, as the outline does — `notes/reading/maps-and-territories.md`,
  `work/kestrel/docs/adr/0001-offline-first-sync.md` (rendering.md; render.test review cycle 4)
- Heading with inline code, emphasis, link, image and tag — `notes/projects/sync-rewrite.md`,
  `work/kestrel/docs/qa/theme-showcase.md` (render.ts heading; outline slug)
- Slug rules: punctuation, accents, CJK, emoji, leading digits, trailing spaces, only symbols —
  `hobbies/photography/trips/京都/2026-08-24-伏見稲荷.md`, `notes/research/unicode-in-route-names.md` (GitHub slugging,
  rendering.md)
- Very long heading wrapping across several rows with band fill on each — `notes/meetings/all-hands-archive.md`,
  `work/product/prd/offline-sync.md` (operations-handbook long heading)
- Malformed headings: no space after #, 7 hashes, escaped \\#, indented 4 spaces, closing hashes —
  `Downloads/stray-note.md`, `work/kestrel/docs/qa/render-torture.md` (operations-handbook malformed heading;
  CommonMark)
- Heading inside blockquote, list item and callout — `notes/daily/2026-09-23.md`,
  `notes/meetings/2026-08-26-route-sharing-design-review.md` (nesting rule)
- Outline depth skips (h1 to h4, h3 first) — `notes/reading/maps-and-territories.md`,
  `notes/research/route-cost-models.md` (outline, breadcrumb)

### paragraphs

- Soft breaks become spaces; none between Han or kana — `notes/daily/2026-08-17.md`, `notes/daily/2026-08-24.md`
  (rendering.md; render.test review cycle 2)
- Hard breaks: two trailing spaces, backslash, \<br\>, \<br/\>, \<BR /\> — `notes/daily/2026-08-19.md`,
  `work/product/research/synthesis-2026-09.md` (render.test links/hard breaks; weekly meeting note)
- Lone \<br\> block shows as a blank row — `hobbies/cooking/Recipes/Family/مقلوبة.md`, `notes/daily/2026-08-19.md`
  (rendering.md html block)
- Many blank lines, leading/trailing blank lines, whitespace-only note, empty file — `notes/daily/2026-09-19.md`,
  `notes/daily/2026-09-20.md`, `notes/daily/2026-09-21.md`, `notes/templates/daily.md` (edge cases)
- Line-start characters that look like markup: escaped \\\*, \\#, \\\>, 1\\. , backslash escapes of every punctuation —
  `notes/research/tile-formats.md`, `work/kestrel/docs/qa/render-torture.md` (CommonMark)
- Very long paragraph (20 KB, single line, no newline) — `Downloads/transcript-2026-09-24-incident-review.md`,
  `notes/daily/2026-09-13.md` (wrap performance; 15.x)

### inline

- Strong, emphasis, strike, strong-emphasis, underscore forms and nesting — `notes/meetings/2026-10-01-priya-1on1.md`,
  `notes/weekly/2026-W39.md`, `work/product/okrs/2026-q4.md`, `work/product/research/synthesis-2026-09.md`
  (rendering.md Inline)
- Inline code: simple, with backticks inside (double fence), padded spaces, tabs (2-stop), wider than the row —
  `notes/daily/2026-09-22.md`, `work/kestrel/docs/runbooks/deploy.md` (rendering.md Inline, tabs; regressions tabs)
- Links: inline, with title, angle-bracket target with spaces, relative path, #anchor, external URL, mailto, empty
  target — `notes/reading/list.md`, `work/kestrel/docs/qa/links.md` (rendering.md Links; links.test)
- What the file says: \[\](path.md) and \[path.md\](path.md) show the path as written; another root's file too, never
  a name:path form — `hobbies/cooking/Home.md`, `notes/index.md`, `notes/research/link-styles.md` (rendering.md 21.9)
- Reference links \[text\]\[label\], \[label\]\[\], \[label\] and definitions (case-insensitive, duplicate labels first
  wins, unused, undefined) — `notes/reading/list.md`, `work/kestrel/CHANGELOG.md` (rendering.md definition; render.test
  review cycle 4)
- Autolinks: \<https://…\>, bare `www` bare https URL, email, GFM literal autolink with trailing punctuation —
  `notes/meetings/2026-09-05-feedback-synthesis.md`, `notes/research/tile-formats.md`, `work/kestrel/docs/qa/links.md`
  (dome-refit `www` autolink; GFM)
- Show URLs on: URL follows as \<url\>, not repeated when the text is the URL — `notes/research/link-styles.md`,
  `work/kestrel/docs/qa/links.md` (rendering.md; render.test review cycle 2)
- Images: with alt, empty alt, missing file, existing file, data URI, external URL, with title, image reference —
  `hobbies/photography/images/harbour-01.jpg`, `hobbies/photography/walks/2026-09-07-harbour.md`,
  `notes/meetings/2026-08-26-route-sharing-design-review.md`, `work/kestrel/README.md`,
  `work/product/releases/2.3-notes.md` (rendering.md Images; instrument-inventory photos)
- Inline HTML tags dropped, text kept: \<kbd\>, \<sup\>, \<sub\>, \<mark\>, \<span style\>, \<b\>, \<i\>, \<u\> —
  `work/kestrel/docs/qa/theme-showcase.md`, `work/product/releases/2.3-notes.md` (rendering.md Inline)
- Inline HTML comment in a paragraph and across lines — `notes/daily/2026-08-31.md`,
  `work/kestrel/docs/qa/theme-showcase.md` (render.test review cycle 4 (text between comments))
- Tags: #tag, nested #a/b/c, with digits/dashes/underscores, at line start, after punctuation, in headings, in lists,
  in tables; not tags: #1, URL fragment, code, heading hash, 'C#' — `notes/daily/2026-08-21.md`,
  `notes/meetings/2026-09-05-feedback-synthesis.md` (rendering.md tag; decision 1.6; projects tags)
- Wikilinks drawn as links: \[\[note\]\], \[\[note\|alias\]\], !\[\[embed\]\], a picture's size; text when
  \\\[\[escaped\]\] or inside code — `hobbies/cooking/Mise en place.md`, `notes/research/link-styles.md` (rendering.md
  Wikilinks are links (21.3); wikilink tokenizer)
- Block id ^id at the end of paragraph, list item, and on a lone line after a table/quote/list —
  `hobbies/cooking/Recipes/Weeknight/Dal.md`, `notes/projects/kestrel-v2-3.md`,
  `work/kestrel/docs/adr/0003-sharing-links.md` (rendering.md Embeds block)
- Math and mermaid shown as code/text: \$x\$, \$\$ block, \`\`\`mermaid — `notes/research/route-cost-models.md`,
  `work/kestrel/docs/architecture.md` (pipeline-cookbook; About: not rendered)

### lists

- Bullets per depth: -, \*, + markers, nesting 6 deep cycling the bullet glyphs — `notes/daily/2026-08-31.md`,
  `notes/daily/2026-09-01.md` (rendering.md list; dome-refit)
- Ordered lists: start at 0, 1, 7, 998, 1000+, ) delimiter, numbers right-aligned across 9-\>10 and 99-\>100 —
  `notes/meetings/2026-09-10-q4-okr-planning.md`, `work/kestrel/docs/runbooks/deploy.md` (writing-guide lists;
  rendering.md numbers right-aligned)
- Hanging indent of a multi-paragraph item, item with code block, item with table, item with quote, item with image —
  `notes/daily/2026-08-31.md`, `notes/daily/2026-09-01.md` (rendering.md; nesting)
- Task items: \[ \], \[x\], \[X\], nested 4 deep, ordered tasks keep number, checked item dimmed with children, mixed
  task and plain items — `hobbies/cycling/gear/202609011200-lights.md`, `notes/daily/2026-08-17.md`,
  `notes/daily/2026-08-21.md`, `notes/daily/2026-09-08.md`, `notes/daily/2026-09-12.md`, `notes/daily/2026-09-29.md`,
  `notes/meetings/2026-08-20-priya-1on1.md`, `notes/projects/brevet-300.md`, `work/product/releases/2.3-plan.md`
  (operations-handbook 4-deep checklist; dome-refit numbered tasks; render.test review cycle 4)
- List interrupted by paragraph, code block, heading and comment; two adjacent lists of different marker —
  `notes/daily/2026-08-31.md`, `work/kestrel/docs/runbooks/deploy.md` (CommonMark; render.ts nothing-drawn gap rule)
- Empty list items and a list of one empty item — `notes/templates/daily.md`, `notes/templates/meeting.md` (edge)
- List too narrow to hang: marker on its own row below 8 columns for child — `notes/daily/2026-09-01.md`,
  `work/kestrel/docs/qa/render-torture.md`, `work/kestrel/src/web/markdown/__fixtures__/nesting.md` (rendering.md
  Hostile notes MIN\_NESTED; render.test deep nesting)

### quotes

- Blockquote basics: multiple paragraphs, lazy continuation, empty quote line, nested \> \> \> —
  `notes/daily/2026-09-23.md`, `notes/meetings/2026-08-20-priya-1on1.md`,
  `notes/meetings/2026-09-05-feedback-synthesis.md`, `notes/research/user-interviews-2026-08.md`,
  `notes/weekly/2026-W35.md`, `work/kestrel/docs/qa/render-torture.md`, `work/product/research/synthesis-2026-09.md`
  (rendering.md blockquote)
- Quote containing list, code, table, heading, image, footnote ref and an embed paragraph —
  `notes/meetings/2026-09-24-sync-queue-incident-review.md`, `work/product/research/synthesis-2026-09.md` (nesting
  rules)

### callouts

- Each callout role family: note, tip, important, warning, caution in Obsidian lowercase and GitHub capitals —
  `notes/daily/2026-09-23.md`, `work/product/prd/route-sharing.md` (render.test review cycle 5; dome-refit)
- All aliases mapping to roles: tip/hint/success/check/done; important/abstract/summary/tldr;
  warning/attention/question/help/faq; caution/danger/error/failure/fail/bug; unknown kinds (info, todo, example,
  quote, cite) fall to note — `work/kestrel/docs/qa/theme-showcase.md`, `work/kestrel/docs/runbooks/sync-queue.md`
  (render.ts calloutRole)
- Foldable callouts \[!note\]+ and \[!note\]- Obsidian forms — `work/kestrel/docs/qa/theme-showcase.md`,
  `work/product/prd/route-sharing.md` (Obsidian compatibility)
- Callout containing list, code, table, nested callout, task list, link, embed — `notes/daily/2026-09-23.md`,
  `notes/meetings/2026-08-26-route-sharing-design-review.md`, `work/kestrel/docs/runbooks/sync-queue.md` (dome-refit
  nested; nesting)
- Callout lookalikes stay quotes: '\> \[!note' unclosed, '\> text \[!note\]' mid-line, '\[!note\]' not first line —
  `notes/daily/2026-09-23.md`, `work/product/prd/route-sharing.md` (edge)

### code

- Fenced code with \`\`\` and \~\~\~, language labelled and highlighted — `notes/projects/sync-rewrite.md`,
  `notes/research/route-cost-models.md`, `work/kestrel/docs/qa/theme-showcase.md` (rendering.md Code-fence
  highlighting; pipeline-cookbook)
- Fence with unknown language, no language, 'text', 'plaintext' (no highlight, label rules) —
  `notes/research/route-cost-models.md`, `work/kestrel/docs/qa/theme-showcase.md` (rendering.md only named languages)
- Fence longer than the row hard-wraps; very long unbroken line; code line wider than 500 columns —
  `Downloads/transcript-2026-09-24-incident-review.md`, `work/kestrel/docs/qa/render-torture.md` (render.test code
  blocks; rendering.md)
- Fence edge: 4-backtick fence containing \`\`\`, unclosed fence to end of file, fence closed by longer fence, empty
  fence, fence with only blank lines — `notes/inbox.md`, `work/kestrel/docs/qa/render-torture.md` (CommonMark)
- Indented code block (4 spaces and tab) reports its own source lines — `notes/research/route-cost-models.md`,
  `work/kestrel/docs/runbooks/deploy.md` (render.test review cycle 4; pipeline-cookbook)
- Tabs in code, HTML and frontmatter expand to stops of 4; escape before a tab does not move the stop; inline code
  stops of 2 — `notes/people/malik-haddad.md`, `work/kestrel/docs/qa/render-torture.md` (rendering.md Escapes;
  render.test review cycle 5; regressions tabs)
- Code in list, in quote, in callout, in table-adjacent position — `notes/daily/2026-08-31.md`,
  `notes/daily/2026-09-23.md`, `work/kestrel/docs/runbooks/sync-queue.md` (nesting)
- Diff fence with +/- lines, shell session with \$ prompts, JSON with unicode and long strings, SQL with comments —
  `notes/daily/2026-09-22.md`, `notes/projects/sync-rewrite.md`, `work/kestrel/docs/runbooks/deploy.md` (syn\_\* roles)
- Language label placed top right; label wider than short code; very long language token —
  `notes/research/route-cost-models.md`, `work/kestrel/docs/qa/render-torture.md` (rendering.md code)

### rules

- Thematic breaks: ---, \*\*\*, \_\_\_, with spaces, long runs; --- after a paragraph making setext; in quote and in
  list — `notes/daily/2026-09-11.md`, `work/kestrel/docs/qa/render-torture.md`,
  `work/kestrel/src/web/markdown/__fixtures__/quadratic.md` (rendering.md)

### tables

- Table fits: sum(desired) within budget, nothing wraps, no body separators —
  `hobbies/cycling/gear/202609011200-lights.md`, `notes/daily/2026-09-08.md`,
  `notes/research/route-engine-spike/src/notes.md`, `notes/templates/meeting.md` (rendering.md allocator rule 1)
- Table needs wrapping at each width: minimum fits, surplus placed by cost (sentence column wider than one-word column)
  — `notes/meetings/2026-09-10-q4-okr-planning.md`, `notes/projects/hiring-backend.md`, `notes/weekly/2026-W36.md`,
  `work/product/prd/offline-sync.md` (allocator rule 2)
- Seven-column table with 250-char cells (hardest case) — `hobbies/photography/gear/bodies.md`,
  `hobbies/photography/gear/lenses.md`, `notes/research/offline-sync-options.md` (about-this-vault; plan 2.3)
- Fair-share words break: minimums exceed budget but fair share \>= 6 — `hobbies/photography/gear/lenses.md`,
  `notes/research/offline-sync-options.md` (allocator rule 3)
- Too many columns: fair share \< 6 collapses to records, one per row, labels column \<= a third of width —
  `hobbies/photography/gear/bodies.md`, `work/product/roadmap/q4.md` (allocator rule 4; render.test 'cannot fit';
  Records)
- Soft segments: columns of dotted identifiers, paths, URLs, snake\_case, query strings —
  `notes/projects/sync-rewrite.md`, `notes/research/tile-formats.md` (rendering.md Soft segments)
- Column of one-letter cells lifted to the 3-column floor before others grow —
  `notes/meetings/2026-09-09-hiring-debrief.md`, `notes/weekly/2026-W37.md` (rendering.md flaw fixed)
- Alignment: :---, ---:, :---:, mixed, default — `hobbies/cycling/gear/202609011200-lights.md`,
  `hobbies/photography/trips/京都/itinerary.md`, `notes/daily/2026-09-30.md`,
  `notes/meetings/2026-09-10-q4-okr-planning.md`, `notes/projects/hiring-backend.md`, `notes/projects/q4-okrs.md`,
  `work/product/okrs/2026-q4.md`, `work/product/prd/offline-sync.md` (GFM; render.ts table)
- Inline markup in cells: code, links (resolved, unresolved), bold, italic, strike, images, tags, footnote refs, hard
  break — `notes/meetings/2026-08-26-route-sharing-design-review.md`, `work/product/okrs/2026-q4.md` (render.test links
  placed; table cells)
- Escaped pipes \\\| in plain text, in code spans and in wikilink aliases — `hobbies/cooking/Meal plan.md`,
  `work/product/roadmap/q4.md` (wikilink tokenizer; GFM)
- Empty cells, empty header cells, all-empty column, row with fewer cells (padded) and more cells (truncated) —
  `notes/meetings/2026-09-09-hiring-debrief.md`, `work/kestrel/docs/qa/render-torture.md` (GFM; allocator)
- Overlong rows: cells of 500+ characters, a row of 5000 characters, a row with 100 cells —
  `hobbies/photography/gear/lenses.md`, `work/kestrel/docs/qa/render-torture.md` (instrument-inventory; 'rows of 500+
  characters')
- Dense table: 200 rows by 6 columns; 30 tables in one note (throughput) —
  `hobbies/cycling/202601010900-training-log-2026.md`, `notes/reading/bookmarks.md` (about-this-vault; Cost table;
  15\.x)
- Body row separators appear only when some row wraps; header separator doubled — `notes/weekly/2026-W34.md`,
  `notes/weekly/2026-W36.md`, `notes/weekly/2026-W37.md` (rendering.md)
- CJK cells: widths 2, wrapping between characters, kinsoku punctuation, mixed Latin/CJK —
  `hobbies/cycling/rides/202608301800-kyoto-river-loop.md`, `hobbies/photography/trips/京都/itinerary.md`,
  `notes/projects/kyoto-trip.md`, `work/kestrel/docs/glossary.md` (partners-and-names; wrap.ts kinsoku)
- RTL cells: Arabic and Hebrew text, mixed with Latin and digits, bidi marks —
  `hobbies/cooking/Recipes/Family/مقلوبة.md`, `notes/meetings/2026-08-26-route-sharing-design-review.md`
  (partners-and-names RTL; sanitize)
- Emoji cells: RGI emoji width 2, ZWJ family, flags, skin tones, keycaps, text-presentation symbols (heart without
  VS16), variation selectors — `Downloads/survey-responses.csv`, `notes/daily/2026-09-30.md`,
  `notes/research/unicode-in-route-names.md` (width.ts; rendering.md Wrapping)
- Combining marks, zero-width chars (ZWSP, ZWNJ, WJ), Devanagari/Thai clusters, fullwidth Latin, ambiguous-width in
  cells — `Downloads/survey-responses.csv`, `notes/research/unicode-in-route-names.md` (width.ts MARK\_ONLY,
  ZERO\_WIDTH)
- Table without leading/trailing pipes, with extra spaces, with a header-only delimiter mismatch (invalid table stays
  paragraph) — `work/kestrel/docs/qa/render-torture.md`, `work/product/drafts/notes-from-offsite.md` (GFM)
- Table followed by a lone ^id block id; table referenced by embed !\[x\](note.md#^id) — `notes/daily/2026-09-22.md`,
  `notes/meetings/2026-09-24-sync-queue-incident-review.md` (rendering.md Embeds)
- Cell with \<br\> and hard breaks to make multi-row cells; cell with a lone ' ' ; cell with HTML tag —
  `work/kestrel/docs/qa/render-torture.md`, `work/product/roadmap/q4.md` (render.test hard breaks)
- Source line anchoring: each table row is on its own source line — `notes/meetings/2026-09-10-q4-okr-planning.md`,
  `work/kestrel/docs/runbooks/deploy.md` (rendering.md src; 3.5)

### wrapping

- No-break spaces (U+00A0, U+2007, U+202F) never wrap, even at the row boundary —
  `hobbies/cycling/gear/202608201000-bike-fit.md`, `hobbies/cycling/ideas/202410021000-winter-layers.md`,
  `notes/daily/2026-09-13.md`, `notes/projects/home-office.md` (rendering.md Headings; render.test review cycle 4)
- Han/kana soft breaks between any characters, with kinsoku — `hobbies/photography/trips/京都/index.md`,
  `notes/daily/2026-08-24.md` (wrap.ts kinsoku; render.test)
- Hangul wraps at spaces only; emoji do not join without space — `notes/daily/2026-09-30.md`,
  `work/product/research/synthesis-2026-09.md` (render.test soft breaks)
- Long words: token longer than the row starts a new row, packed by soft segments; segment longer than the row breaks
  at a grapheme — `notes/research/offline-sync-options.md`, `work/kestrel/docs/qa/render-torture.md` (rendering.md
  Wrapping; wrap-probe)
- Spaces: runs of multiple spaces, leading spaces on a line, trailing spaces, tab characters in prose —
  `Downloads/transcript-2026-09-24-incident-review.md`, `notes/daily/2026-08-19.md` (wrap.ts; regressions tabs)
- Exact-fit rows: a line whose width equals the layout width, width+1, width-1 — `notes/daily/2026-09-13.md`,
  `work/kestrel/docs/qa/render-torture.md` (countLines/fit; off-by-one)
- Narrow panes: 8, 10, 16, 20, 24, 40 columns, and inset cap of 5% — `Downloads/forum-thread.md`,
  `work/kestrel/docs/qa/render-torture.md` (rendering.md Hostile notes, Readability inset; render.test six widths)
- Punctuation soft breaks: after / - \_ . ? \& = , : ; \| — `notes/research/tile-formats.md`,
  `work/kestrel/docs/adr/0002-route-engine-in-rust.md` (rendering.md)

### width

- Width classes in prose: ASCII, CJK, fullwidth, RGI emoji, ZWJ family, flags, skin tone, keycap, combining marks,
  zero-width, text-presentation symbols — `notes/daily/2026-08-24.md`, `notes/people/aiko-tanaka.md`,
  `notes/research/unicode-in-route-names.md` (width.ts; partners-and-names)
- Right-to-left text in prose, lists and headings, mixed with LTR and numbers —
  `hobbies/cooking/Recipes/Family/مقلوبة.md`, `notes/people/malik-haddad.md`,
  `notes/research/unicode-in-route-names.md`, `notes/weekly/2026-W35.md` (partners-and-names RTL; sanitize bidi marks)
- Ambiguous-width and symbol characters: box drawing, arrows, ✓ ✗ ★ ● ·, mathematical operators, Nerd Font private-use
  glyphs — `notes/research/unicode-in-route-names.md`, `work/kestrel/docs/qa/glyphs.md` (width.ts; glyph sets)
- Wide characters in code blocks, headings, list markers and link text keep alignment —
  `hobbies/photography/trips/京都/2026-08-24-伏見稲荷.md`, `notes/research/unicode-in-route-names.md` (width.ts)
- Data file at narrow (40 col) and very wide (240 col) terminals — `work/infra/helm/kestrel/values.yaml`,
  `work/infra/terraform/backend.toml` (rendering.md table allocator; tui.md width)

### frontmatter

- YAML frontmatter: scalars, lists, nested map, block string, dates, booleans, null, quoted strings, long key cut with
  ellipsis — `notes/people/aiko-tanaka.md`, `notes/people/jo-becker.md`, `notes/people/lena-okafor.md`,
  `notes/people/malik-haddad.md`, `notes/people/priya-nair.md`, `notes/people/tomas-ruiz.md` (rendering.md frontmatter;
  kenji-mori)
- TOML frontmatter (+++ fences) as a properties block — `notes/projects/dome-night-volunteering.md`,
  `work/kestrel/CHANGELOG.md` (render.test review cycle 5; dome-refit)
- Broken frontmatter: invalid YAML shows raw text and the wrapped error — `Downloads/stray-note.md`,
  `notes/daily/2026-09-09.md` (broken-frontmatter; render.test)
- Frontmatter edge: empty (---\\n---), whitespace only, comments only, not at line 1 (renders as rule + paragraph), BOM
  before ---, CRLF line endings — `Downloads/notion-export.md`, `notes/daily/2026-09-10.md`,
  `notes/daily/2026-09-11.md`, `notes/daily/2026-09-15.md`, `notes/daily/2026-09-16.md` (parse.ts; render)
- Frontmatter containing hostile text: escape sequences, bidi overrides, tabs, huge number, very long string —
  `notes/research/terminal-escapes-in-logs.md`, `work/kestrel/src/web/markdown/__fixtures__/escapes.md` (rendering.md
  Escapes; sanitize backstop)
- Frontmatter tab expansion and value rows source-mapped (srcMap) — `notes/people/malik-haddad.md`,
  `notes/research/terminal-escapes-in-logs.md` (rendering.md Escapes)

### html

- HTML block verbatim and dim: \<div\>, \<details\>\<summary\>, \<table\>, \<p align\>, \<img\>, \<pre\> —
  `work/kestrel/docs/qa/theme-showcase.md`, `work/product/README.md` (writing-guide HTML)
- HTML comments hidden: each \<!-- --\> on its own; multi-line comment; comment between paragraphs; comment between
  list items; comment before frontmatter-like text — `notes/daily/2026-08-31.md`,
  `work/kestrel/docs/qa/theme-showcase.md` (render.test review cycle 4)
- HTML with escapes and entities: \<script\>, \<style\>, CDATA, processing instruction \<?php ?\>, \<!DOCTYPE\> —
  `work/kestrel/docs/qa/render-torture.md`, `work/kestrel/docs/qa/theme-showcase.md` (CommonMark HTML block kinds 1-7)

### footnotes

- Footnote reference and definition basics: \[^1\] numbered by identifier, definition '1.' hanging indent —
  `notes/daily/2026-10-01.md`, `notes/reading/the-quiet-queue.md`, `notes/weekly/2026-W39.md` (rendering.md footnote;
  render.test review cycle 4)
- Multi-paragraph footnote with code and list inside, paragraphs apart — `hobbies/photography/trips/京都/index.md`,
  `notes/reading/the-quiet-queue.md` (render.test footnote definitions)
- Unused definition (no reference), missing definition (reference to undefined), duplicate definitions —
  `notes/meetings/2026-09-17-priya-1on1.md`, `notes/reading/the-long-ride.md` (3.17 footnotes panel)
- Footnote refs in heading, table cell, list item, quote, callout, link text, emphasis; an inline ^\[text\] stays
  text (GFM has none) — `hobbies/cooking/Recipes/Family/Grandma's flan.md`, `notes/daily/2026-10-01.md`,
  `notes/reading/maps-and-territories.md` (rendering.md Headings; render.test)
- Footnote definition in the middle of a document and at very end without trailing newline —
  `notes/reading/many-footnotes.md`, `notes/reading/the-long-ride.md` (edge)
- footnote view ordering: referenced in order, unreferenced, referenced with no definition, multiple references (2×),
  labels with capitals — `notes/reading/many-footnotes.md`, `notes/reading/the-long-ride.md`,
  `notes/reading/the-quiet-queue.md` (Footnotes 3.17)
- footnote add: after word under cursor (render and source), end placement rules — `notes/daily/2026-09-17.md`,
  `notes/reading/the-quiet-queue.md` (footnote.add 3.18)
- footnote edit, rename label everywhere, delete both with confirmation — `notes/reading/the-long-ride.md`,
  `notes/reading/the-quiet-queue.md` (footnotes view a/e/r/d)
- followed footnote \[1\] jumps to definition; \[Title\](#title) with footnote mark finds heading —
  `notes/reading/maps-and-territories.md`, `notes/reading/the-quiet-queue.md` (table; test 'a footnote with capitals is
  followed')
- footnotes lists each label, text, definition line and references — `notes/reading/the-long-ride.md`,
  `notes/reading/the-quiet-queue.md` (cli.md footnotes; cli.test 'footnotes: each one's label')
- footnotes add \<line\[:col\]\> \<text\> inserts \[^N\] and a definition at the end — `notes/daily/2026-10-06.md`,
  `notes/reading/the-quiet-queue.md` (cli.md footnotes add; SKILL)
- footnotes edit \<label\> \<text\>, rm \<label\>, rename \<label\> \<new\> — `notes/reading/the-long-ride.md`,
  `notes/reading/the-quiet-queue.md` (cli.md; cli.test 'footnotes add, edit, rename, rm')

### embeds

- Whole-note embed !\[x\](note.md): header '⧉ inner', link to it, text behind a bar, frontmatter skipped —
  `notes/meetings/2026-09-24-sync-queue-incident-review.md`, `notes/projects/route-sharing.md` (rendering.md Embeds
  (1.11))
- Heading embed !\[x\](note.md#heading) by text and by slug, ends at next heading of same or higher level —
  `notes/meetings/2026-09-24-sync-queue-incident-review.md`, `notes/projects/route-sharing.md`,
  `work/kestrel/docs/runbooks/sync-queue.md`, `work/product/prd/route-sharing.md` (rendering.md Embeds)
- Block embed !\[x\](note.md#^id) for paragraph, list item, table, quote, list via lone ^id —
  `notes/daily/2026-09-22.md`, `notes/meetings/2026-09-24-sync-queue-incident-review.md`,
  `notes/projects/route-sharing.md`, `work/kestrel/docs/adr/0003-sharing-links.md` (rendering.md Embeds block)
- Embed loops: note embeds itself, A embeds B embeds A, three-note cycle — `notes/meetings/2026-10-01-priya-1on1.md`,
  `notes/people/priya-nair.md`, `notes/projects/kestrel-v2-3.md`, `notes/projects/route-sharing.md`,
  `notes/templates/meeting.md` (rendering.md 'embeds itself: not drawn again')
- Embed depth: chain of 5 notes each embedding the next, third level shows 'embedded deeper still: enter opens it' —
  `notes/projects/route-sharing.md`, `notes/weekly/2026-W34.md`, `notes/weekly/2026-W36.md`,
  `notes/weekly/2026-W37.md`, `notes/weekly/2026-W38.md`, `notes/weekly/2026-W39.md`, `notes/weekly/2026-W40.md`,
  `notes/weekly/2026-W41.md` (rendering.md depth three)
- Missing and unresolvable embeds render as references: missing note, picture, other file (pdf, csv), web URL, with
  text around — `hobbies/cooking/Pantry.md`, `hobbies/photography/walks/2026-09-07-harbour.md`,
  `notes/meetings/2026-09-24-sync-queue-incident-review.md`, `notes/projects/route-sharing.md` (rendering.md References
  still)
- Embed paragraph containing only embeds on separate lines (several in one paragraph) draws each; embed in same
  paragraph as text draws reference — `notes/meetings/2026-09-24-sync-queue-incident-review.md`,
  `notes/projects/route-sharing.md` (rendering.md Embeds)
- Embedded note's links: status and target resolve from the embedded note's folder; \[x\](#heading) is its own heading;
  sibling link — `notes/meetings/2026-09-24-sync-queue-incident-review.md`, `notes/projects/route-sharing.md`
  (rendering.md Where it is)
- Embedded content current: changing the embedded file re-renders host; render cache never keeps an embed block —
  `notes/projects/kestrel-v2-3.md`, `notes/projects/route-sharing.md` (rendering.md Current; render cache 15.1)
- Embedded headings stay out of the host's outline; cursor/anchors/lens at the embed line —
  `notes/meetings/2026-09-24-sync-queue-incident-review.md`, `notes/projects/route-sharing.md` (rendering.md Where it
  is)
- embedded notes drawn in place; embedded note changes on disk or saved here and the embedding note updates; header
  opens it — `notes/meetings/2026-09-24-sync-queue-incident-review.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/projects/route-sharing.md` (tests 'drawn in place', 'the embedded note changed')

### data

- TOML sections as headings, dotted tables deeper, \[\[array\]\] records as table —
  `work/infra/terraform/backend.toml`, `work/kestrel/kestrel.toml` (rendering.md Data files 16.11)
- YAML as a tree: nested maps, lists of scalars, lists of objects, small plain map on one line (\<=40 cols), reference
  keys, multiple documents, comments, anchors — `work/infra/helm/kestrel/values.yaml`, `work/infra/k8s/api.yaml`,
  `work/infra/k8s/tiles.yaml` (rendering.md Data files 16.12)
- JSON tree: objects, arrays, \$ref pointer jumps, \$schema; .jsonc with comments; invalid JSON —
  `work/kestrel/api/schemas/route.json`, `work/kestrel/config/schema.json` (rendering.md; openapi.json)
- CSV/TSV as one table: quoted fields with "" and embedded newlines, header row, ragged rows padded, past 2000 rows
  counted, empty cells — `hobbies/cycling/rides.csv`, `hobbies/photography/exports/exif-2026-08.csv`,
  `hobbies/photography/exports/kyoto-selects.tsv`, `work/kestrel/data/segments.csv` (rendering.md CSV;
  photometry-2026.csv)
- INI/.cfg/.properties/.env: sections, ; and # comments, comment after a value, export prefix, quotes, dotted keys —
  `work/infra/config/archive.properties`, `work/kestrel/config/logging.ini` (rendering.md; logging.ini; nightjar.env)
- Data values as links: URL, \$ref, extends/include/import/file/path, path-like value resolved relative to file's
  folder, broken — `work/kestrel/config/app.toml`, `work/kestrel/config/base.yaml`, `work/kestrel/kestrel.toml`
  (rendering.md 16.15)
- Data field comments: one line above a key is the key's comment after its value; several lines or opening lines form a
  block — `work/infra/helm/kestrel/values.yaml`, `work/infra/k8s/api.yaml`, `work/kestrel/kestrel.toml` (rendering.md
  Data files)
- Data file that doesn't parse: no render, error shown, source mode opens — `work/infra/config/broken.ini`,
  `work/infra/config/broken/duplicate-key.toml`, `work/infra/k8s/broken-ingress.yaml`,
  `work/kestrel/config/broken-flags.json`, `work/kestrel/data/import-2026-09.csv` (rendering.md 16.14; regressions)
- Source-mode highlighted code files: python, ts, js, go, rust, lua, sh; with syntax errors; org/adoc plain text —
  `work/kestrel/api/kestrel_api/half_written.py`, `work/kestrel/src/legacy/app.js`,
  `work/kestrel/tools/uploader/main.go` (rendering.md code-fence highlighting; 16.7)

### encoding

- BOM at start of a note (UTF-8 BOM), with and without frontmatter — `notes/daily/2026-09-16.md` (fixtures bom.md;
  width ZERO\_WIDTH)
- CRLF line endings throughout; mixed LF/CRLF; lone CR; CRLF in frontmatter, code fence, table and task list —
  `.build/extras.toml`, `notes/daily/2026-09-15.md` (fixtures crlf.md)
- Invalid UTF-8 and Latin-1 bytes: replacement characters, still rendered; truncated multibyte at EOF —
  `.build/extras.toml`, `notes/daily/2026-09-18.md` (fixtures latin1.md; 'invalid UTF-8')
- No trailing newline; trailing whitespace only; single line with no newline — `notes/daily/2026-08-19.md`,
  `notes/daily/2026-09-17.md` (fixtures no-newline.md)
- Control characters and escapes stripped: CSI, OSC 8 hyperlinks, OSC 52, DCS, APC, bare ESC, C1 controls, BEL,
  backspace, U+2028/2029 to spaces, bidi overrides — `notes/research/terminal-escapes-in-logs.md`,
  `work/kestrel/docs/runbooks/support-escalation.md`, `work/kestrel/src/web/markdown/__fixtures__/escapes.md`
  (rendering.md Escapes 2.9; fixtures escapes.md; render.test)
- Hostile Unicode: homoglyphs, zero-width joiner chains, 10000 combining marks on one base, extremely long grapheme,
  private-use — `notes/research/unicode-in-route-names.md`, `work/kestrel/docs/qa/render-torture.md` (width.ts;
  Intl.Segmenter)

### hostile

- Deeply nested containers: 60+ levels of quote and list render as plain text; 5000 levels deep —
  `Downloads/forum-thread.md`, `Downloads/mailing-list-digest.md`,
  `work/kestrel/src/web/markdown/__fixtures__/nesting.md` (rendering.md Hostile notes; render.test deep nesting)
- Parser-quadratic inputs tamed: 64+ of \* \_ \[ \] in a line with other text; lines made only of rule characters left
  alone — `Downloads/chat-export.md`, `work/kestrel/src/web/markdown/__fixtures__/quadratic.md` (rendering.md; parse.ts
  tame)
- Frontmatter over 64 KB shows as text; YAML duplicate keys not checked — `Downloads/notion-export.md`,
  `notes/people/jo-becker.md` (rendering.md Hostile notes)
- Rows never exceed the layout width (clipped stays 0) on a gauntlet note — `notes/research/unicode-in-route-names.md`,
  `work/kestrel/docs/qa/render-torture.md` (rendering.md; regressions 'no row exceeds width at 10 columns')
- A .md file that is really a log: 100 MB-ish lines, or 20 MB single note; note of thousands of lines —
  `Downloads/chat-export.md`, `Downloads/sync-worker-2026-09-22.log.md` (about-this-vault 'what isn't here'; 15.x)

### big

- Long handbook note 1200+ lines with h1-h6, setext, callouts, deep checklist, long heading —
  `notes/meetings/all-hands-archive.md`, `notes/meetings/standup-log.md` (about-this-vault; Cost table)
- Many links note: 2000 links, resolved and unresolved mixed, repeated targets, link cycling —
  `notes/daily/2026-09-17.md`, `notes/reading/bookmarks.md` (links list in IR; TUI link cycling)
- Large note re-layout on resize and render cache across edits — `notes/meetings/all-hands-archive.md`,
  `work/kestrel/docs/qa/render-torture.md` (render.test cache 15.1; render cache)

### theme

- A showcase note for theme roles: every syn\_\* scope, every callout role, link statuses, tag, task, strike,
  code\_inline, strong, quote, footnote, embed, error — `work/infra/dotfiles/slipbox/themes/kestrel-dark.yaml`,
  `work/kestrel/docs/qa/theme-showcase.md` (rendering.md Themes 2.6)
- Inline code and bold contrast, heading bands light vs dark themes — `notes/projects/sync-rewrite.md`,
  `work/kestrel/docs/qa/theme-showcase.md` (2.7)

### glyphs

- Glyph sets: unicode, nerd, ascii for bullets, checkboxes, quote bar, heading icons, embed header, image glyph, rules,
  table borders — `notes/daily/2026-08-17.md`, `work/kestrel/docs/qa/glyphs.md` (rendering.md Glyphs 2.8)

### links

- Link roles by status: resolved note, resolved heading, resolved ^block, missing note, missing heading, missing block,
  attachment, external, other-vault, nested-vault, folder, file outside root — `notes/research/link-styles.md`,
  `work/kestrel/docs/qa/links.md` (partners-and-names; links index; 20.2)
- Same link repeated in a paragraph and across wraps: first drawn position recorded; link spanning two rows —
  `notes/daily/2026-09-13.md`, `work/kestrel/docs/sync.md` (ir.ts LayoutLink; render.test links placed)
- Links to data files with fragments: file.toml#section, file.json#/a/b, file.yaml#key; and to code files #L10 —
  `notes/daily/2026-09-22.md`, `work/kestrel/api/kestrel_api/sync.py` (rendering.md Data files)
- every link kind and its follow behaviour — `notes/projects/kestrel-v2-3.md`, `notes/research/link-styles.md` (tui.md
  Following links table)
- next/prev link (tab, shift+tab, \] l) and follow on row with several links, on row with none —
  `notes/projects/kestrel-v2-3.md`, `notes/reading/bookmarks.md` (link.next/prev/follow)
- click on blank space past row end or below note follows nothing; click on link follows — `notes/daily/2026-08-17.md`,
  `work/product/README.md` (tui.md Following links; test 'a click on blank space never follows a link')
- link follow in source mode and lens reads link from raw text — `hobbies/cooking/Home.md`,
  `notes/projects/kestrel-v2-3.md` (tui.md Following links para 3; test 'enter follows a link in source mode and in the
  lens')
- links list (space l l) with status resolved/unresolved/ambiguous/external/attachment — `notes/reading/bookmarks.md`,
  `notes/research/link-styles.md` (links.open; test 'unresolved, external and attachment links')
- backlinks list incl. from another vault shown as 'name: path' — `notes/projects/kestrel-v2-3.md`,
  `work/kestrel/docs/architecture.md` (backlinks.open; tests 'backlinks from another vault are listed in its vault
  form')
- link to a note that moved: following says where it went and offers relink, never new-note prompt —
  `notes/daily/2026-09-22.md`, `notes/projects/q4-okrs.md` (tui.md table row 'broken link whose file moved'; test 'a
  link to a note seen to move is broken')
- link to missing note opens new-note prompt with name filled — `notes/projects/kestrel-v2-3.md`,
  `work/kestrel/docs/qa/links.md` (test 'following a link to a note that doesn't exist asks to create it')
- fragment landing: #heading slug vs text, #L42, #^id, embed header, line inside wrapped paragraph lands on that line —
  `notes/reading/maps-and-territories.md`, `work/kestrel/docs/runbooks/sync-queue.md` (tui.md Following links; test
  'following a path link's fragment')
- lsp.hover / shift+k on link in note and g d / g r — `notes/research/link-styles.md`,
  `work/kestrel/src/routes/share.ts` (lsp.hover/definition/references; test 'in a note slipbox answers itself')
- link target completion after \]( with this root's paths, another root's by its path (a pointer written into a named
  folder), encoding — `notes/index.md`, `work/kestrel/docs/architecture.md` (tui.md A link's target (20.13, 21.5))
- ctrl+n / ctrl+p in insert mode: a word from the open files' words, this file's nearest first, narrowed as typed —
  `notes/index.md`, `work/kestrel/src/sync/queue.ts` (tui.md A word from the open files (25.5); tests 'word
  completion without a server')
- relink and convert-links (preview, ambiguous pick, unsaved refused, undone) — `notes/daily/2026-09-22.md`,
  `notes/projects/kestrel-v2-3.md` (link.relink, link.convert; tests 'the converter from the TUI')
- links lists outgoing links with kind, target, heading, text, line, column, end, status —
  `notes/projects/kestrel-v2-3.md`, `work/kestrel/docs/architecture.md` (cli.md Link status words; cli.test 'links and
  backlinks')
- links --all lists every link in the vault each with `from` — `notes/projects/kestrel-v2-3.md`,
  `work/kestrel/docs/architecture.md` (cli.md links --all; cli.test)
- Links in data and code files — `work/kestrel/api/kestrel_api/sync.py`, `work/kestrel/api/openapi.yaml` (cli.md Naming
  notes 5 (16.10, 16.15))

### notes

- Two notes of one name in different folders, case variants of a file name, name with spaces, unicode and emoji names —
  `notes/people/contacts.md`, `notes/research/contacts.md` (home.md graph; regressions case-variant names)
- Mixed-content ordinary note (the 'ordinary case': prose, code, tables, quotes, a block id) —
  `notes/projects/kestrel-v2-3.md`, `work/product/prd/offline-sync.md` (about-this-vault)
- Realistic document types as notes: PRD, ADR, runbook, changelog, release notes, 1:1, brevet log, recipe, reading
  list, travel itinerary — `hobbies/cooking/Recipes/Weeknight/Dal.md`,
  `hobbies/cycling/rides/202609131900-300k-brevet.md`, `notes/meetings/2026-08-20-priya-1on1.md`,
  `notes/meetings/2026-09-17-priya-1on1.md`, `notes/meetings/2026-09-24-sync-queue-incident-review.md`,
  `notes/meetings/2026-10-01-priya-1on1.md`, `notes/templates/daily.md`, `notes/templates/meeting.md`,
  `work/kestrel/CHANGELOG.md`, `work/kestrel/README.md`, `work/kestrel/docs/adr/0001-offline-first-sync.md`,
  `work/kestrel/docs/adr/0002-route-engine-in-rust.md`, `work/kestrel/docs/release-notes/2.3.md`,
  `work/kestrel/docs/runbooks/sync-queue.md`, `work/product/prd/offline-sync.md`, `work/product/prd/route-sharing.md`,
  `work/product/releases/2.3-notes.md`, `work/product/releases/2.3-plan.md` (examples/home README)
- Obsidian and zk conventions render as plain: \[\[wikilinks\]\], #tags, callouts, !\[\[embed\]\], block ids, aliases
  frontmatter — `hobbies/cooking/Home.md`, `hobbies/cooking/Kitchen.canvas`, `hobbies/cooking/Pantry.md`,
  `hobbies/cooking/Recipes/Family/Grandma's flan.md` (the first 21.x samples, absorbed here; 20.x)
- Plain text formats not read as notes: .txt, .org, .adoc, .rst, no extension, shown as source — `Downloads/README.MD`,
  `Downloads/meeting.org`, `Downloads/notes.mdown` (dome-log.org, safety-card.adoc)
- Source mode of each construct: the raw markdown as a layout, long lines wrapping, tabs, CRLF, invalid bytes —
  `notes/daily/2026-09-15.md`, `work/kestrel/docs/qa/render-torture.md` (plan 4.13; layout/source.ts)

### cli

- slipbox render output of every note: plain, colour never/always, --width bounds, piped, NO\_COLOR, COLORTERM
  truecolor/256/16 — `notes/research/unicode-in-route-names.md`, `work/kestrel/docs/qa/render-torture.md` (rendering.md
  ANSI writer; regressions --width)
- Render of a data file and a csv via slipbox render, source line numbers preserved —
  `work/kestrel/docs/qa/render-torture.md`, `work/kestrel/kestrel.toml` (rendering.md Data files)
- ls --files lists data and code files; links, find and replace work across groups; writers refuse binary (exit 5) —
  `Downloads/photo.PNG`, `work/kestrel/kestrel.toml` (test 'files beyond notes (16.4): read, replace, write and find
  them; ls --files; binary refused')
- slipbox render of data files at widths 40, 80, 120 and --json (a code file is refused, exit 2) — `work/kestrel/config/regions.yaml`,
  `work/kestrel/kestrel.toml` (test 'render draws a note at a width, plain or as JSON lines')
- slipbox export to Word, PDF, HTML, EPUB and Markdown: a diagram and display maths drawn, embeds drawn in, links into
  the document; two notes, two chapters — `notes/research/route-cost-models.md`, `notes/projects/sync-rewrite.md`
  (export.md; test 'export')

### classify

- Each data extension is classified as data with the right format — `hobbies/cooking/.obsidian/app.json`,
  `work/kestrel/.hadolint.yaml`, `work/kestrel/api/settings.json5`, `work/kestrel/config/settings.conf`,
  `work/kestrel/docker-compose.yml`, `work/kestrel/package.json`, `work/kestrel/tsconfig.web.jsonc`
  (src/core/filetypes.ts DATA\_FORMATS)
- Dotfile .env and a file named exactly .env render as INI data — `.build/extras.toml`, `work/infra/config/prod.env`;
  `work/kestrel/.env.example` is text, its extension `example` (filetypes.ts NAMED, tests 'INI and .env')
- Whole-name languages open as text with their language: Makefile, Dockerfile, .zshrc, .bashrc, .profile —
  `work/infra/dotfiles/.bashrc`, `work/infra/dotfiles/.profile`, `work/infra/dotfiles/.zshrc`,
  `work/kestrel/Dockerfile`, `work/kestrel/Makefile` (filetypes.ts NAMED, plan 16.21)
- A text file with an unknown extension and none opens as plain text in source mode — `Downloads/app-2026-09-22.log`,
  `hobbies/cooking/Kitchen.canvas`, `hobbies/cycling/routes/300k-lakes-loop.geojson`, `work/kestrel/.editorconfig`,
  `work/kestrel/.gitignore`, `work/kestrel/.gitmodules`, `work/kestrel/LICENSE`, `work/kestrel/api/pyproject.toml`,
  `work/product/prd/plan` (filetypes.ts classify, idea.md 'Reversed 2026-09-30')
- Binary files by extension never open: png, pdf, zip, wasm, sqlite, woff2, mp3 as link targets —
  `Downloads/offline.sqlite`, `Downloads/photo.PNG`, `Downloads/receipt-desk-2026-08.pdf`,
  `Downloads/route-export.zip`, `hobbies/cooking/attachments/maqluba-flip.jpg`,
  `hobbies/photography/images/harbour-01.jpg`, `hobbies/photography/images/inari-01.jpg`,
  `notes/attachments/Scan 2026-09-02.PDF`, `notes/attachments/whiteboard-2026-08-26.png`,
  `notes/projects/home-office.md`, `work/kestrel/assets/demo-ride.mp4`, `work/product/assets/share-sheet.png`
  (filetypes.ts BINARY, tui.md 'Files beyond notes')
- A text-named file that holds a NUL in its first 8 KB is refused as binary on open — `Downloads/data.txt`,
  `Downloads/utf16-notes.txt` (filetypes.ts looksBinary, test 'a data file opens from a link … a binary file doesn't')
- Misleading extensions: a JSON-looking file named .txt, a TOML named .conf (parsed as ini), YAML named .yaml.example —
  `Downloads/looks-like-json.txt`, `work/infra/config/nginx.conf`, `work/kestrel/config/settings.conf` (filetypes.ts
  DATA\_FORMATS (conf maps to ini))
- Language extensions beyond the grammars: rb, java, c, h, cpp, css, scss, html, xml, svg, sql, vim, diff, patch open
  as source with highlight.js only, no outline — `hobbies/cycling/routes/300k-lakes-loop.gpx`,
  `work/kestrel/db/schema.sql`, `work/kestrel/legacy/GpxParser.java`, `work/kestrel/legacy/haversine.c`,
  `work/kestrel/legacy/route_import.rb`, `work/kestrel/patches/tiles-fix.patch`, `work/kestrel/public/index.html`,
  `work/kestrel/public/logo.svg`, `work/kestrel/src/styles/app.css` (filetypes.ts LANGUAGES, tui.md 'Source code
  through tree-sitter')
- Notes extensions: .md and .markdown are notes; .org/.adoc are text — `Downloads/invoice-template.markdown`,
  `Downloads/meeting.org`, `Downloads/safety-card.adoc` (filetypes.ts NOTE\_FORMATS, 16.16/16.17 dropped)

### explorer

- Explorer default shows notes and data files, hides plain code; 'a' toggles to all text files —
  `notes/.slipbox/config.toml`, `work/kestrel/README.md` (tui.md 'What lists them' files.show)
- Hidden, git-ignored and node\_modules files: reached by :e or link but not listed — `.build/extras.toml`,
  `work/kestrel/.gitignore`, `work/kestrel/docs/generated/api.md` (tui.md 'Opening' (20.8))
- Names with spaces, unicode and long names for data and code files — `Downloads/Q3 budget (final).csv`,
  `Downloads/données.json5`, `Downloads/résumé-template.py` (tui.md explorer; rendering sanitize/width)
- tree with deep folders (6+ levels), many files (500), folders-first order, tree lines —
  `hobbies/cooking/Recipes/Baking/Sourdough/Starter/Feeding log.md`, `work/kestrel/README.md` (Explorer; tests 'tree
  lines', 'the wheel scrolls the explorer')
- files beyond notes: default data files shown, 'a' toggles all text, binaries never — `notes/.slipbox/config.toml`,
  `work/kestrel/README.md` (tui.md Files beyond notes; test 'the explorer lists data files by default')
- hidden and git-ignored files and folders, node\_modules, walk.exclude — `.build/extras.toml`,
  `work/kestrel/.gitignore` (tui.md Opening 20.8; test ':e of a git-ignored or hidden file opens it')
- git marks M + R ! and folder bullet — `.build/extras.toml` (M: local edits), `.build/kestrel.toml` (R and ! from
  test steps: `git mv`, merging `jo/release-notes-wording`), `work/kestrel/README.md` (tui.md Git's marks 5.11)
- explorer filter: words in any order, letters together, smart case, highlight — `notes/index.md`,
  `work/kestrel/README.md` (Filtering 3.16)
- file ops: n, N, r, m (tree picker), d, u, y/x/p, v/V, . menu — `notes/templates/daily.md`, `work/kestrel/README.md`
  (Files in the explorer 18.x; tests 'r renames in place...' etc.)
- roots: opened vault, pinned vaults, vault followed into, nested vault row, ‘..’ in plain folder, \~ and / listing —
  `Downloads/stray-note.md`, `notes/index.md` (tui.md Explorer roots 20.15; tests on roots)
- explorer selection stays on note/heading when an agent adds or removes notes — `Downloads/plan.md`,
  `work/kestrel/scripts/dev/agent-replay.sh` (test 'the explorer and outline keep their selection')
- narrow terminal overlays explorer/outline, closing after pick; tiny terminals — `notes/meetings/standup-log.md`,
  `work/kestrel/docs/qa/render-torture.md` (Narrow terminals 3.14)

### toml

- Tables become headings, deeper by dots — `work/infra/terraform/backend.toml`, `work/kestrel/kestrel.toml` (data.ts
  readToml heading depth, rendering.md)
- Top-level keys before any table, then tables, aligned key column per section — `work/infra/terraform/backend.toml`,
  `work/kestrel/kestrel.toml` (data.ts alignKeys KEY\_MAX)
- Value kinds colour differently: integer, float, hex, inf/nan, bool, local date, offset datetime, string, array,
  inline table — `work/infra/terraform/backend.toml`, `work/kestrel/config/app.toml` (data.ts kindOf, tomlDisplay)
- Strings: basic with escapes, literal, multi-line basic, multi-line literal — `work/infra/terraform/backend.toml`,
  `work/kestrel/kestrel.toml` (data.ts scanValue, tomlDisplay)
- Multi-line arrays and inline tables span several source lines but are one key row —
  `work/infra/terraform/backend.toml`, `work/kestrel/kestrel.toml` (data.ts scanValue depth)
- Comment above a key is that key's comment; trailing comment after the value is drawn dimmed —
  `work/infra/terraform/backend.toml`, `work/kestrel/kestrel.toml` (data.ts readToml standsAlone)
- Several comment lines above a key, and the file's opening comment, are blocks of their own —
  `work/infra/terraform/backend.toml`, `work/kestrel/kestrel.toml` (data.ts standsAlone)
- \[\[array\]\] of tables with plain values renders as a table: row per entry on its header line —
  `work/kestrel/Cargo.lock`, `work/kestrel/kestrel.toml` (data.ts tomlRecords, rendering.md Records)
- Dotted keys, quoted keys and keys with spaces — `work/infra/terraform/backend.toml`, `work/kestrel/kestrel.toml`
  (data.ts keyEnd)
- Cargo.toml, pyproject.toml and a stylua.toml style real-world files — `work/kestrel/Cargo.toml`,
  `work/kestrel/api/pyproject.toml`, `work/kestrel/crates/route-engine/Cargo.toml`,
  `work/kestrel/scripts/dev/stylua.toml` (languages.ts roots/requires, data.ts)
- TOML that does not parse: duplicate key, unclosed string, bad date, key without value —
  `work/infra/config/broken/bad-date.toml`, `work/infra/config/broken/duplicate-key.toml`,
  `work/infra/config/broken/unclosed-string.toml`, `work/infra/config/local/empty.toml` (data.ts readToml error, tui.md
  'A data file that doesn't parse')
- TOML sections linked by fragment: \[x\](app.toml#server-tls) lands on the heading — `work/kestrel/config/app.toml`,
  `work/kestrel/kestrel.toml` (rendering.md, test 'a link to a section of a data file lands there')

### ini

- Sections as headings, key = value and key: value forms, quoted values, bare keys — `work/infra/config/haproxy.cfg`,
  `work/kestrel/config/logging.ini` (data.ts readIni)
- Comments: # and ; styles, trailing ' ; comment' after values, comment inside a quoted value kept —
  `work/infra/config/haproxy.cfg`, `work/kestrel/config/logging.ini` (data.ts readIni)
- A line that is not a section, key or comment is an error with its line number — `work/infra/config/broken.ini`,
  `work/infra/config/nginx.conf` (data.ts readIni error)
- Java .properties and .cfg through the INI reader — `work/infra/config/archive.properties`,
  `work/infra/config/haproxy.cfg` (filetypes.ts properties/cfg); `work/infra/config/legacy-archive.properties` has
  '!' comments and backslash continuations on indented lines (data.ts readIni)
- .env with export prefix, quotes, comments, empty values, secrets-like placeholders, URLs — `.build/extras.toml`,
  `work/infra/config/prod.env`, `work/kestrel/.env.example` (data.ts readIni export prefix, tests 'INI and .env')
- Section-less ini: all keys at the root, one aligned run — `work/infra/config/prod.env`,
  `work/infra/config/sysctl.ini`, `work/infra/config/local/overrides.ini` (comments only) (data.ts alignKeys)

### yaml

- Plain nested mappings render as a tree with guides at every depth — `work/infra/helm/kestrel/values.yaml`,
  `work/kestrel/docker-compose.yml` (rendering.md YAML tree, test 'guides at every depth')
- Scalars one per line: string, int, float, bool (true/false/yes/no/on), null (\~, null, empty), date, timestamp —
  `notes/people/aiko-tanaka.yaml`, `work/infra/helm/kestrel/Chart.yaml` (data.ts scalarKind)
- Lists of scalars sit inline; a small plain map stays one line up to 40 columns — `notes/people/aiko-tanaka.yaml`,
  `work/kestrel/mkdocs.yml` (data.ts leaf INLINE\_MAP)
- List items are rows 1, 2, 3; when one object item has depth, all object items open — `work/infra/k8s/api.yaml`,
  `work/kestrel/docker-compose.yml` (data.ts walkYaml openMaps, rendering.md)
- A list of 2+ plain objects is a table under its key — `work/infra/helm/kestrel/Chart.yaml`,
  `work/kestrel/.github/workflows/ci.yml`, `work/kestrel/config/regions.yaml`, `work/kestrel/docker-compose.yml`
  (data.ts records, recordTable)
- Branch rows are the outline and breadcrumb (containers › 1 › health) — `work/infra/k8s/api.yaml`,
  `work/kestrel/docker-compose.yml` (rendering.md, data.ts dataOutline)
- Multi-document YAML with --- separators: rows document 1, document 2, ... — `work/infra/k8s/api.yaml`,
  `work/infra/k8s/tiles.yaml`, `work/infra/k8s/workers/sync-worker.yaml` (data.ts readYaml docStart, rendering.md)
- Comment block before a document's content is its opening row — `work/infra/k8s/api.yaml`,
  `work/kestrel/config/base.yaml` (data.ts readYaml opening)
- Comment above a key is that key's comment; several lines or above a branch are a block of their own; trailing comment
  after value — `work/infra/k8s/api.yaml`, `work/kestrel/config/base.yaml` (data.ts walkYaml before/comment)
- Multi-line scalars: literal \| and folded \> blocks, quoted multi-line strings —
  `work/infra/helm/kestrel/values.yaml`, `work/kestrel/.github/workflows/ci.yml` (data.ts walkYaml end line, inline)
- Anchors, aliases and merge keys — `work/infra/helm/kestrel/values.yaml`, `work/kestrel/docker-compose.yml` (data.ts
  inline of alias nodes)
- Duplicate keys do not fail the parse (uniqueKeys false) — `work/infra/helm/kestrel/values.yaml`,
  `work/infra/k8s/api.yaml` (data.ts parseAllDocuments uniqueKeys:false)
- Complex and non-string keys: numeric keys, a quoted key with a colon, a ? complex key, an empty key —
  `work/infra/helm/kestrel/values.yaml`, `work/kestrel/.github/workflows/ci.yml` (data.ts inline(key))
- Real-world YAMLs: GitHub Actions workflow, docker-compose, OpenAPI, Helm values, mkdocs.yml —
  `work/infra/helm/kestrel/values.yaml`, `work/infra/k8s/api.yaml`, `work/kestrel/.github/workflows/ci.yml`,
  `work/kestrel/api/openapi.yaml`, `work/kestrel/docker-compose.yml`, `work/kestrel/mkdocs.yml` (data.ts, rendering.md)
- YAML that does not parse: bad indentation, tab indent, unclosed quote, duplicate anchor, flow collection unclosed (an
  empty file parses: `work/infra/config/local/empty.yaml`) — `work/infra/k8s/broken-ingress.yaml`,
  `work/infra/k8s/tabs.yaml` (data.ts readYaml error 'line N:')
- A top-level scalar or top-level list document renders as a 'value' row or rows 1..n —
  `work/infra/k8s/allowed-ips.yaml`, `work/infra/k8s/motd.yaml`, `work/infra/k8s/tiles.yaml` (data.ts walkYaml
  top-level non-map)
- yamllint finding on a file when .yamllint exists in the project — `work/infra/k8s/workers/sync-worker.yaml`,
  `work/kestrel/.yamllint`, `work/kestrel/docker-compose.yml` (lsp.md Linters without a server (19.19), languages.ts)
- yaml-language-server schema comment and diagnostics, e.g. # yaml-language-server: \$schema=./schema.json —
  `work/infra/k8s/workers/sync-worker.yaml`, `work/kestrel/api/openapi.yaml`, `work/kestrel/config/schema.json`,
  `work/kestrel/docker-compose.yml` (lsp.md servers table (yaml-language-server))

### json

- Objects as a tree; arrays of scalars inline; arrays of objects as tables —
  `hobbies/photography/exports/exif-2026-08.json`, `work/kestrel/config/feature-flags.json`,
  `work/kestrel/config/maintenance.json`, `work/kestrel/package-lock.json`, `work/kestrel/package.json` (data.ts
  readYaml json:true, rendering.md)
- JSON scalar kinds: numbers, exponents, true/false, null, strings that look like dates —
  `work/kestrel/config/feature-flags.json`, `work/kestrel/config/maintenance.json` (data.ts scalarKind)
- JSON pointers: #/definitions/user in a \$ref goes to the row it names — `work/kestrel/api/openapi.yaml`,
  `work/kestrel/api/schemas/common.json`, `work/kestrel/api/schemas/route.json`, `work/kestrel/config/schema.json`
  (rendering.md '#/a/b JSON pointer', test 'a \$ref')
- \$ref to another file by relative path, resolving and broken — `work/kestrel/api/schemas/common.json`,
  `work/kestrel/api/schemas/route.json` (data.ts fieldLink REFERENCE\_KEYS, rendering.md 16.15)
- JSONC: // and /\* \*/ comments, trailing commas (tsconfig/.vscode/settings.json style) —
  `work/kestrel/.vscode/settings.json`, `work/kestrel/tsconfig.json`, `work/kestrel/tsconfig.web.jsonc` (data.ts
  stripJsonComments, filetypes jsonc)
- .json5 opens as JSON data (and fails on unquoted keys) — `Downloads/données.json5`, `work/kestrel/api/settings.json5`
  (filetypes.ts json5)
- JSON that does not parse: trailing comma, single quotes, unclosed brace, empty file, NaN —
  `work/infra/config/local/empty.json`, `work/kestrel/config/broken-flags.json`,
  `work/kestrel/config/legacy-flags.json` (data.ts readYaml JSON.parse error; test 'broken-config.json')
- Top-level array of records and top-level scalar JSON — `hobbies/photography/exports/exif-2026-08.json`,
  `work/kestrel/config/maintenance.json` (data.ts walkYaml)
- Large JSON: 5 MB file / deeply wide object with 2000 keys — `Downloads/routes-export.min.json`,
  `hobbies/photography/exports/exif-2026-08.json`, `work/kestrel/package-lock.json` (data.ts performance, tui lazy
  layout)
- Minified single-line JSON — `Downloads/routes-export.min.json`, `hobbies/photography/exports/exif-2026-08.json`
  (data.ts keyLine positions)
- JSON with long string values wrapping and long keys cut at 28 — `Downloads/ticket-4711.json`,
  `hobbies/photography/exports/exif-2026-08.json`, `work/kestrel/config/feature-flags.json` (data.ts KEY\_MAX;
  rendering width)
- JSON language server diagnostics with \$schema and a schema file — `work/kestrel/.vscode/settings.json`,
  `work/kestrel/biome.json`, `work/kestrel/config/schema.json` (lsp.md vscode-json-language-server, biome)
- .vscode/settings.json feeding server settings (dotted keys, comments, trailing commas, \[python\] overrides left out)
  — `work/kestrel/.vscode/settings.json` (lsp.md 19.20)

### links-data

- URL values draw as links (https, http, ftp, mailto-less custom schemes) — `work/kestrel/config/regions.yaml`,
  `work/kestrel/package.json` (data.ts fieldLink URL)
- Reference keys: schema, include(s), extends, import(s), file, path, \$ref, \$schema count as links even when broken —
  `work/kestrel/api/openapi.yaml`, `work/kestrel/config/app.toml` (data.ts REFERENCE\_KEYS, rendering.md)
- Path-like values that resolve to a vault file are links; ones that don't are plain —
  `notes/research/route-engine-spike/bench.toml`, `work/kestrel/config/base.yaml`, `work/kestrel/mkdocs.yml` (data.ts
  PATHLIKE and fieldLink)
- Links in data files appear as backlinks of what they point at and in slipbox links —
  `notes/projects/sync-rewrite.md`, `work/kestrel/docs/architecture.md` (rendering.md 16.15, tests 'a note moved: every
  file linking in — … a data file')
- Following a link from a data file with enter: opens target, or reports broken — `work/infra/terraform/backend.toml`,
  `work/kestrel/config/base.yaml` (rendering.md 16.15)
- Data file values that look like links but are not: version numbers, IPs, times, emails, globs —
  `work/infra/k8s/allowed-ips.yaml`, `work/kestrel/config/base.yaml` (data.ts PATHLIKE exclusion for \\d+(\\.\\d+)+)
- No wikilinks in data files and code: \[\[note\]\] stays literal text — `work/kestrel/api/kestrel_api/sync.py`,
  `work/kestrel/config/base.yaml` (rendering.md Data files last sentence; tui.md Links in comments)
- Notes link to data and code files with extension and #section — `notes/daily/2026-09-12.md`,
  `notes/projects/sync-rewrite.md` (tui.md Opening; idea.md 'Linked to')

### csv

- Basic CSV: header, rows, padded to widest — `hobbies/cooking/pantry.csv`, `work/kestrel/data/segments.csv` (data.ts
  readDelimited pad, test 'CSV with quotes')
- Quoting: commas inside quotes, doubled quotes, a newline inside a quoted field, CR LF inside a field —
  `Downloads/survey-responses.csv`, `work/kestrel/data/segments.csv` (data.ts readDelimited, test 'CSV with quotes,
  doubled quotes and a newline in a field')
- A quoted field that never closes is an error — `work/kestrel/data/import-2026-09.csv` (data.ts readDelimited error 'a
  quoted field never closes')
- TSV with tabs, quotes and empty cells — `hobbies/photography/exports/kyoto-selects.tsv` (data.ts readDelimited sep
  \\t, equipment/eyepieces.tsv)
- 2000+ row CSV: first 2000 rows shown, the rest counted; source mode has them all — `hobbies/cycling/rides.csv`,
  `hobbies/photography/exports/exif-2026-08.csv` (data.ts CSV\_ROWS, test 'a big CSV: its first 2,000 rows'
  (logs/photometry-2026.csv))
- Wide cells and wide tables: columns wrap by soft segments, or collapse to a record per row —
  `Downloads/Q3 budget (final).csv`, `hobbies/photography/exports/exif-2026-08.csv` (rendering.md table allocator,
  data.ts table())
- Cells holding link-like text, markdown-like text and HTML — `Downloads/survey-responses.csv`,
  `work/kestrel/data/segments.csv` (data.ts table cells as plain text (no inline parse), sanitize)
- Header detection and odd headers: blank header cell, duplicate header names, numeric header, BOM —
  `Downloads/Q3 budget (final).csv`, `Downloads/survey-responses.csv` (data.ts readDelimited head row)
- CSV lens: slides lens\_min\_rows records around the cursor; + takes a record more — `hobbies/cycling/rides.csv`,
  `work/kestrel/data/segments.csv` (tui.md Data files open rendered; test 'on a CSV, + takes a record more and the lens
  slides')
- CSV with unicode: CJK, emoji, combining marks, RTL, zero-width, in cells and headers —
  `Downloads/survey-responses.csv`, `hobbies/cooking/pantry.csv` (width.ts, test 'ASCII, CJK, emoji, ZWJ, combining
  marks')
- Blank-line and whitespace rows are skipped; semicolon-delimited .csv shows as one column —
  `Downloads/Q3 budget (final).csv`, `Downloads/bank-export-eu.csv` (data.ts rows filter cells.some(trim))
- CSV linked from notes and referenced in code and yaml — `hobbies/cooking/pantry.csv`,
  `work/kestrel/data/segments.csv` (16.10, 16.15)

### data-modes

- Data file rendered view and source mode toggle (space n v), and the lens edits a card —
  `work/kestrel/config/feature-flags.json`, `work/kestrel/kestrel.toml` (tui.md Data files open rendered)
- File that stops parsing during edit switches to source mode when insert ends; space n v renders it again after fixing
  — `work/kestrel/config/app.toml`, `work/kestrel/config/base.yaml`, `work/kestrel/config/feature-flags.json` (tui.md
  'one that stops parsing while edited', 16.14)
- Data file that doesn't parse opens in source mode with the error each time it opens (link, :e, history) —
  `work/infra/k8s/tabs.yaml`, `work/kestrel/config/broken-flags.json`, `work/kestrel/data/import-2026-09.csv` (tui.md;
  rendering.md '16.14')
- Data file with no headings: one section, or band-sized chunks at blank lines — `work/infra/config/sysctl.ini`,
  `work/kestrel/config/logging.ini`, `work/kestrel/kestrel.toml` (test 'a data file with no headings: one section, or
  band-sized chunks at blank lines')
- Outline (space o) and breadcrumb for data files; filter with / — `work/infra/k8s/api.yaml`,
  `work/kestrel/kestrel.toml` (data.ts dataOutline, test '/ filters the outline')
- Find in a data file, search index of data files, and files over a size — `hobbies/cycling/rides.csv`,
  `work/kestrel/config/app.toml`, `work/kestrel/kestrel.toml` (search index, 16.3)
- Data file CRLF, BOM, no trailing newline, tabs and trailing spaces — `Downloads/Q3 budget (final).csv`,
  `work/infra/config/prod.env`, `work/kestrel/config/logging.ini`, `work/kestrel/data/segments.csv` (data.ts
  replace(/\\r\$/) handling)
- Hostile data: very long line (100 KB) in a value, control characters, ANSI escapes in strings, bidi override —
  `Downloads/ticket-4711.json`, `work/kestrel/config/feature-flags.json` (sanitize.ts rule 'every string entering the
  layout passes through sanitize')
- Empty and whitespace-only data files of each format — `work/infra/config/local/empty.json`,
  `work/infra/config/local/empty.toml`, `work/infra/config/local/empty.yaml`,
  `work/infra/config/local/overrides.ini` (comments only) (data.ts readers; JSON.parse('') fails)
- Data file inside a nested vault, and across vaults via ../ reference —
  `notes/research/route-engine-spike/.slipbox/config.toml`, `notes/research/route-engine-spike/bench.toml`
  (examples/README 21.x; 16.15 link resolution)
- Generated/lock files that are huge or machine-written: package-lock.json, Cargo.lock (toml with \[\[package\]\]),
  yarn.lock (text), poetry.lock — `work/kestrel/Cargo.lock`, `work/kestrel/package-lock.json` (data.ts tomlRecords
  (dependencies arrays make it not plain), performance)

### code-ts

- TypeScript outline: functions, classes, methods, interfaces, types, enums, abstract classes, arrow functions in
  variable declarators, generators — `work/kestrel/src/App.tsx`, `work/kestrel/src/sync/queue.ts`,
  `work/kestrel/src/types.d.ts` (syntax.ts TS\_DEFS, tests 'the outline and breadcrumb come from the grammar')
- TSX files use the tsx grammar, JSX the javascript one — `work/kestrel/src/App.tsx`, `work/kestrel/src/legacy/widgets.jsx`,
  `work/kestrel/src/routes/RouteMap.tsx` (syntax.ts grammarFor ext==='tsx')
- mts/cts/js/mjs/cjs extension mapping — `work/kestrel/src/modern.ts`, `work/kestrel/src/util/compat.cjs`,
  `work/kestrel/src/util/format.mts`, `work/kestrel/src/util/geo.mjs` (filetypes.ts LANGUAGES)
- Template strings spanning lines and block comments: spans coloured from the line they start —
  `work/kestrel/src/routes/share.ts`, `work/kestrel/src/sync/queue.ts` (syntax.ts spans(); tui.md Highlighting; test 'a
  template string')
- 4,000-line TypeScript file parses quickly — `work/kestrel/src/generated/routes-big.ts` (tui.md 'tens of milliseconds
  for a 4,000-line file')
- Comments with links: URLs, relative paths, root-relative paths, leading-/ paths, path:line, path:line:col —
  `work/kestrel/src/routes/share.ts`, `work/kestrel/src/sync/queue.ts` (syntax.ts linkTokens PATH\_RE, commentLinks;
  tui.md 16.10)
- Import strings are followable even though not comments — `work/kestrel/src/App.tsx`,
  `work/kestrel/src/routes/share.ts` (tui.md 'a path in a string too: an import's is worth following')
- Code comment links count as backlinks of the file they name and a rename rewrites them —
  `work/kestrel/api/kestrel_api/sync.py`, `work/kestrel/src/sync/queue.ts` (tui.md 16.10; test 'a move from a fresh
  process rewrites a code comment')
- Syntax errors in TS: missing brace, stray token, unterminated string, missing semicolon token invented (MISSING) —
  `work/kestrel/src/routes/name.ts`, `work/kestrel/src/routes/share-dialog.wip.tsx`,
  `work/kestrel/src/sync/stray-token.ts`, `work/kestrel/src/sync/wip-backoff.ts` (syntax.ts errors() ERROR/MISSING;
  test 'a syntax error is marked out of insert')
- Valid-but-weird TypeScript that must NOT flag errors: decorators, satisfies, enums, optional chaining, bigint, using
  declarations, top-level await — `work/kestrel/src/modern.ts`, `work/kestrel/src/util/format.mts` (syntax.ts errors())
- TypeScript language-server diagnostics: type error, unresolved import, unused variable with tsconfig —
  `work/kestrel/src/routes/RouteMap.tsx`, `work/kestrel/tsconfig.json` (lsp.md TypeScript 7/vtsls, 19.8)
- ESLint and Biome add-ons run where the project has config — `work/kestrel/biome.json`,
  `work/kestrel/eslint.config.js` (lsp.md add-ons 19.2/19.18)
- Two diagnostic sources on one file stack in the bar: syntax + lint + server, worst severity colours the line —
  `work/kestrel/src/routes/RouteMap.tsx`, `work/kestrel/src/sync/stray-token.ts` (tui.md Problems where they are
  19\.8–19.11; plan 308 item 4)

### code-js

- JavaScript outline: functions, classes, methods, arrow and function-expression consts, generators —
  `work/kestrel/eslint.config.js`, `work/kestrel/src/legacy/app.js`, `work/kestrel/src/util/compat.cjs`,
  `work/kestrel/src/util/geo.mjs` (syntax.ts JS\_DEFS)

### code-py

- Python outline: classes, functions, methods (function in class reads as method), nested defs, decorators, async def —
  `work/kestrel/api/kestrel_api/app.py`, `work/kestrel/api/kestrel_api/models.py`,
  `work/kestrel/api/kestrel_api/sync.py` (syntax.ts python defs and kind method fix)
- Python strings/comments: docstrings spanning lines, triple-quoted f-strings, # comments with links and path:line —
  `work/kestrel/api/kestrel_api/sync.py`, `work/kestrel/api/scripts/migrate_v1.py` (syntax.ts spans/comments)
- Python syntax errors: missing colon, bad indentation, unclosed paren, py2 print, f-string error —
  `work/kestrel/api/kestrel_api/half_written.py`, `work/kestrel/api/scripts/migrate_v1.py`
  (examples/vault/scratch/half-written.py; syntax.ts errors)
- Pyright and ruff diagnostics with pyproject.toml (\[tool.ruff\]) and typed code —
  `work/kestrel/api/kestrel_api/models.py`, `work/kestrel/api/pyproject.toml` (lsp.md Python servers, ruff add-on
  requires pyproject \[tool.ruff)

### code-go

- Go outline: functions, methods (receiver), struct and interface type specs, const blocks —
  `work/kestrel/tools/greeter/greeter.go`, `work/kestrel/tools/uploader/main.go` (syntax.ts go defs
  (function\_declaration, method\_declaration, type\_spec))
- Go syntax errors and gopls diagnostics with go.mod — `work/kestrel/go.work`, `work/kestrel/tools/uploader/broken.go`,
  `work/kestrel/tools/uploader/go.mod`, `work/kestrel/tools/uploader/server.go` (lsp.md gopls, languages.ts go roots)

### code-rs

- Rust outline: fn, struct, enum, trait, impl blocks (impl Trait for Type), mod, nested mod —
  `work/kestrel/crates/route-engine/src/lib.rs`, `work/kestrel/crates/tiles/src/lib.rs` (syntax.ts impl label 'impl
  Trait for Type')
- Rust comments: //, ///, //!, nested /\* /\* \*/ \*/, doc comments with links and path:line —
  `work/kestrel/crates/route-engine/src/graph.rs`, `work/kestrel/crates/route-engine/src/lib.rs` (syntax.ts rust
  comments (line\_comment, block\_comment))
- Rust syntax error and rust-analyzer diagnostics with Cargo.toml — `work/kestrel/crates/route-engine/Cargo.toml`,
  `work/kestrel/crates/route-engine/build.rs`, `work/kestrel/crates/route-engine/src/main.rs`,
  `work/kestrel/crates/tiles/Cargo.toml`, `work/kestrel/crates/tiles/src/lib.rs` (lsp.md rust-analyzer; languages.ts
  roots Cargo.toml)

### code-sh

- Bash outline: function foo() {} and function foo {} forms — `work/infra/scripts/rotate-certs.sh`,
  `work/kestrel/scripts/deploy.sh`, `work/kestrel/scripts/lib.sh` (syntax.ts bash defs function\_definition name word)
- Bash heredocs, multi-line strings, comments with links and syntax errors — `work/infra/scripts/rotate-certs.sh`,
  `work/kestrel/scripts/deploy.sh`, `work/kestrel/scripts/release.sh` (syntax.ts heredoc\_body strings; syntax.ts
  comment; syntax-bash ABI note)
- bash-language-server findings (shellcheck-style) on a script — `work/kestrel/scripts/drain-queue.sh`,
  `work/kestrel/scripts/lib.sh` (lsp.md bash-language-server)

### code-lua

- Lua outline: function declarations global/local/method (function M.foo, function obj:bar) —
  `work/kestrel/scripts/dev/kestrel.lua`, `work/kestrel/tools/greeter/greeter.lua` (syntax.ts lua defs
  function\_declaration)
- Lua syntax error and lua-language-server diagnostics with .luarc.json — `work/kestrel/scripts/dev/.luarc.json`,
  `work/kestrel/scripts/dev/broken.lua`, `work/kestrel/scripts/dev/stylua.toml` (languages.ts lua roots .luarc.json)

### code-misc

- Same logical program in all 8 grammars (ts, tsx, js, py, go, rs, sh, lua) for side-by-side outlines —
  `work/kestrel/tools/greeter/greeter.go`, `work/kestrel/tools/greeter/greeter.js`,
  `work/kestrel/tools/greeter/greeter.lua`, `work/kestrel/tools/greeter/greeter.py`,
  `work/kestrel/tools/greeter/greeter.rs`, `work/kestrel/tools/greeter/greeter.sh`,
  `work/kestrel/tools/greeter/greeter.ts`, `work/kestrel/tools/greeter/greeter.tsx` (syntax.ts Grammar list; plan
  16\.7/16.8)
- Languages without a grammar but with highlight.js: java, sql, vim, makefile, diff, XML and SVG —
  `work/kestrel/Makefile`, `work/kestrel/db/schema.sql`, `work/kestrel/legacy/GpxParser.java`,
  `work/kestrel/patches/tiles-fix.patch`, `work/kestrel/public/logo.svg` (syntax.ts grammarFor returns null)
- Swift: classes, structs, enums, extensions, actors and protocols by their keyword, init; multi-line strings and
  comments — `hobbies/photography/tools/RenameByExif.swift`, `hobbies/photography/tools/ContactSheet.swift` (16.18)
- A page's headings and ids; its script and style parsed as theirs; a stylesheet's rules, @media, @keyframes, mixins —
  `work/kestrel/public/index.html`, `Downloads/brevet-results-2026-09-13.htm`,
  `hobbies/photography/site/src/styles/print.css`, `work/kestrel/src/styles/app.css`,
  `work/kestrel/src/styles/share-sheet.scss` (16.19, 16.22)
- PHP: classes, interfaces, traits, enums, heredocs; its HTML highlighted as HTML — `Downloads/old-blog-export/index.php`,
  `Downloads/old-blog-export/feed.php` (16.20, 16.22)
- Dockerfiles: their stages in the outline (`build (node:22-alpine)`); `Dockerfile.dev` too —
  `work/kestrel/Dockerfile`, `hobbies/photography/site/Dockerfile` (16.21)
- Components: Vue's template, script (lang="ts") and style (lang="scss"); Svelte's; Astro's frontmatter — each part an
  outline entry, its definitions under it, its lines in its language, its comments' links —
  `Downloads/recipe-card-demo/RecipeCard.vue`, `Downloads/recipe-card-demo/IngredientList.vue`,
  `hobbies/cycling/viewer/src/RideMap.svelte`, `hobbies/cycling/viewer/src/Elevation.svelte`,
  `hobbies/photography/site/src/pages/index.astro`, `hobbies/photography/site/src/layouts/Gallery.astro` (16.22)
- Ruby (modules, classes, `self.` methods, heredocs; a Gemfile), C (functions, prototypes in a header, structs), C++
  (namespaces, classes, methods declared and defined) — `work/kestrel/legacy/route_import.rb`,
  `hobbies/cycling/tools/gpx_split.rb`, `hobbies/cycling/tools/Gemfile`, `work/kestrel/legacy/haversine.c`,
  `work/kestrel/crates/route-engine/ffi/kestrel_route.h`, `work/kestrel/tools/geodesic/geodesic.cpp`,
  `work/kestrel/tools/geodesic/geodesic.hpp` (16.23)
- Language-server fallback outline: a file tree-sitter has no outline of takes the server's symbols —
  `work/kestrel/legacy/GpxParser.java`, `work/kestrel/tools/fake/hello.fake` (test 'a file tree-sitter has no outline
  of takes its server', plan 19.14)
- Dockerfile with hadolint findings when .hadolint.yaml exists — `work/kestrel/.hadolint.yaml`,
  `work/kestrel/Dockerfile` (lsp.md 19.19 hadolint; languages.ts dockerfile)
- Linter without a server in efm keys configured in the vault config (\[linter.x\] lint-command, lint-formats) —
  `work/infra/dotfiles/slipbox/config.toml`, `work/kestrel/.slipbox/config.toml` (lsp.md 19.19; test 'run as efm runs
  it', 'findings: severity by %t')
- markdownlint findings in notes and the Problems view Lint section — `work/product/.markdownlint-cli2.jsonc`,
  `work/product/drafts/notes-from-offsite.md` (tui.md lint surface 3.21; test 'the Problems view lints the vault')
- Diagnostics CLI: slipbox diagnostics \<file\> and --json for ts, py, rs, json, yaml, dockerfile files —
  `work/kestrel/Dockerfile`, `work/kestrel/api/kestrel_api/models.py`, `work/kestrel/crates/route-engine/src/main.rs`,
  `work/kestrel/src/routes/share.ts` (plan 19.22; test 'in a code file: its servers')
- slipbox doctor listing per language each server and linter and where found — `work/kestrel/README.md`,
  `work/kestrel/api/kestrel_api/models.py` (plan 19.7; lsp.md finding order)
- Language-server root detection: nearest marker, marker precedence tsconfig \> package.json \> .git, never \~ or / —
  `work/kestrel/go.work`, `work/kestrel/package.json`, `work/kestrel/tsconfig.json` (lsp.md 19.3)
- Fake language server fixture for deterministic diagnostics, hover, definition, rename, completion —
  `work/infra/dotfiles/slipbox/config.toml`, `work/kestrel/tools/fake/hello.fake` (tests/fixtures/fake-lsp.ts;
  tests/servers.test.ts)
- Per-language server config in vault config: \[language-server.x\] config tuning allowed, command ignored with warning
  — `work/infra/dotfiles/slipbox/config.toml`, `work/kestrel/.slipbox/config.toml` (lsp.md 'A vault's config may
  tune…')

### text-files

- Plain text file: .txt, README without extension, notes with long lines and tabs — `Downloads/looks-like-json.txt`,
  `work/kestrel/LICENSE` (tui.md Text files open in source mode)
- Log file with timestamps, ANSI colour sequences and paths with :line references — `Downloads/app-2026-09-22.log`,
  `Downloads/sync-worker-2026-09-22.log.md`, `work/kestrel/scripts/drain-queue.sh` (sanitize.ts; syntax.ts PATH\_RE
  (logs have no grammar so no links))
- Dropped note formats open as text: .org and .adoc with headings — `Downloads/meeting.org`,
  `Downloads/safety-card.adoc` (idea.md 'Reversed 2026-09-30'; examples/vault/logs/dome-log.org)
- File over the size caps: 256 KB (context/graph links) and 1 MB (hostile vault warning) — `.build/extras.toml`,
  `Downloads/routes-export.min.json` (cli.md left out 256 KB; decisions.md 1 MB cap; graph.ts DATA\_LINK\_MAX)
- Files in odd places: symlink to a file, FIFO, device node, symlink pointing outside the vault — `.build/extras.toml`
  (test 'review cycle 4: a hostile vault — device symlinks and FIFOs never hang')
- File names and extensions: uppercase, double extensions, .d.ts, .test.ts, .min.js, dotfiles — `.build/extras.toml`,
  `work/kestrel/.editorconfig`, `work/kestrel/.gitignore`, `work/kestrel/api/pyproject.toml`,
  `work/kestrel/src/types.d.ts` (filetypes.ts extensionOf (dot\>0 rule))
- New file creation with known extensions: :new data/x.toml, run.py adds no .md —
  `work/infra/dotfiles/slipbox/config.toml`, `work/kestrel/docs/dev-setup.md` (tui.md 'New notes and folders')

### themes

- Data value colouring by kind in each theme, mono theme markers — `work/infra/terraform/backend.toml`,
  `work/kestrel/kestrel.toml` (data.ts kind; test 'the mono theme (NO\_COLOR) marks links and code')
- themes lists built-ins, terminal, mono, and files in \~/.config/slipbox/themes/ with source and current —
  `work/infra/dotfiles/slipbox/themes/broken.yaml`, `work/infra/dotfiles/slipbox/themes/kestrel-dark.yaml`,
  `work/infra/dotfiles/slipbox/themes/nord.yaml` (configuration.md theme; cli.md themes; cli.test)

### editing

- Indentation per file (25.1): `.editorconfig` says spaces, four in Python, tabs in Go, Markdown not trimmed; `tab`,
  `>>`, a new line after `{`, a save trimming trailing whitespace and adding the final newline; the Info view's indent —
  `work/kestrel/.editorconfig`, `work/kestrel/tools/greeter/greeter.go`, `work/kestrel/api/kestrel_api/sync.py`,
  `work/kestrel/src/sync/queue.ts` (configuration.md Indentation)
- Editing a data file saves atomically via App.writeBuffer and preserves comments, order, formatting —
  `work/kestrel/config/app.toml`, `work/kestrel/kestrel.toml` (rendering.md 'Nothing is ever re-serialized'; CLAUDE.md
  writeBuffer)
- Code file editing: parse 150 ms after pause, syntax marks only out of insert, grammar lazy-loads —
  `work/kestrel/src/routes/share-dialog.wip.tsx`, `work/kestrel/src/sync/queue.ts` (tui.md Source code through
  tree-sitter)
- Server edits: rename symbol, format, code action through App.writeBuffer with preview —
  `work/kestrel/api/kestrel_api/sync.py`, `work/kestrel/src/routes/share.ts`, `work/kestrel/src/routes/sign.ts`,
  `work/kestrel/src/sync/retry.ts` (plan 19.15; test 'space c r' 'space c f' 'space c a')
- Completion and signature help in insert mode in code — `work/kestrel/api/kestrel_api/sync.py`,
  `work/kestrel/src/sync/queue.ts` (plan 19.16, 19.12)
- insert/append/open/insert\_line\_start/append\_line\_end on lists, tasks, quotes, indentation, empty lines —
  `notes/daily/2026-08-31.md`, `notes/daily/2026-10-06.md` (edit.insert\*, edit.open\_\*; 'enter continues list')
- operators d c y \> \< with motions: dw d\$ dd diw d3j cw cc yip \>ip, dw at line end, c2w, d3w across lines, x on
  empty line — `notes/daily/2026-10-05.md`, `notes/projects/kestrel-v2-3.md` (keymap.md Normal mode; tests 'operators
  at the edges')
- text objects: iw aw iW, quotes " ' \`, brackets ( \[ { \< b B across lines, ip ap — `notes/projects/kestrel-v2-3.md`,
  `work/kestrel/src/sync/queue.ts` (Text objects)
- put/yank register: p P linewise vs charwise, clipboard, CRLF charwise put — `notes/daily/2026-09-15.md`,
  `notes/daily/2026-10-05.md` (edit.paste\_\*; test 'a charwise put of lines into a CRLF note keeps it CRLF')
- s S r J \~ D C x . and dot-repeat with counts, insert records, visual change repeat — `notes/daily/2026-08-31.md`,
  `notes/projects/kestrel-v2-3.md` (edit.\*; tests '. repeats...')
- cgn then . walking matches; dgn; d/foo; dn — `notes/daily/2026-10-05.md`, `notes/projects/sync-rewrite.md` (keymap.md
  gn)
- move line up/down (alt+shift) incl. V ranges, from render, one undo step — `notes/daily/2026-09-01.md`,
  `work/kestrel/docs/runbooks/deploy.md` (edit.move\_line\_\*)
- undo/redo: insert session one step, reload is a step, :e! undoable, undoing back to saved makes clean —
  `notes/inbox.md`, `notes/projects/kestrel-v2-3.md` (edit.undo/redo; tui.md Outside changes)
- insert-mode keys: ctrl+w, ctrl+u, backspace joins lines, tab/shift+tab indent, arrows, paste, esc steps back —
  `notes/daily/2026-10-05.md`, `notes/projects/kestrel-v2-3.md` (Insert mode paragraph; test 'insert ctrl+w keeps the
  space before the word')
- CJK editing: w b e per char, iw takes the run, \* # — `hobbies/photography/trips/京都/2026-08-24-伏見稲荷.md`,
  `notes/daily/2026-08-24.md` (Where source mode isn't vim)
- differential vs nvim of many keystroke cases (source and lens) — `notes/projects/kestrel-v2-3.md`,
  `work/kestrel/docs/sync.md` (test '\${mode}: \${CASES.length} cases agree with nvim')

### yaml-frontmatter

- YAML inside markdown frontmatter vs a standalone yaml file differ; space n shift+p edits note YAML in a float —
  `notes/people/aiko-tanaka.md`, `notes/people/aiko-tanaka.yaml` (test 'space n shift+p: the YAML in a floating
  editor'; parse.ts MAX\_YAML 64 KB)

### mixed-roots

- The same relative path reference resolved from different folders and different roots — `notes/.slipbox/config.toml`,
  `notes/projects/sync-rewrite.md`, `work/kestrel/config/app.toml` (tui.md 'relative to the file, then to the vault's
  root'; examples/README 21.x)
- Code repository sample folder with its own marker files: package.json, tsconfig.json, Cargo.toml, go.mod,
  pyproject.toml, .luarc.json under separate subfolders — `work/kestrel/Cargo.toml`, `work/kestrel/api/pyproject.toml`,
  `work/kestrel/package.json`, `work/kestrel/scripts/dev/.luarc.json`, `work/kestrel/tools/uploader/go.mod` (lsp.md
  19\.3 roots; examples/vault/software/\*)
- Data file combination: toml config referencing a yaml via include, which references a json schema via \$schema, which
  a note documents — `work/kestrel/config/app.toml`, `work/kestrel/config/base.yaml`, `work/kestrel/config/schema.json`
  (data.ts REFERENCE\_KEYS; graph.ts)
- A code file whose comments point at data files and a data file pointing back at the code —
  `work/kestrel/api/kestrel_api/sync.py`, `work/kestrel/src/sync/queue.ts` (16.10 + 16.15;
  examples/vault/software/halley)

### samples-existing

- Check coverage gaps against existing examples/vault data and code files — `.build/extras.toml`, `.build/kestrel.toml`,
  `work/infra/k8s/api.yaml` (multi-document YAML) (examples/vault listing)

### search

- find --files and the switcher over data and code; search over data, never code — `work/kestrel/api/kestrel_api/sync.py`,
  `work/kestrel/src/sync/queue.ts` (search-index.ts; tui.md switcher (#symbols))
- ranked search: phrase, prefix\*, -not, title:, #tag, path:, +n other sections, snippet marks, enter lands at line —
  `notes/research/offline-sync-options.md`, `notes/weekly/2026-W40.md` (search.open 6.5; tests on search)
- Plain multi-word query ranks notes having every word; title match outranks body match —
  `notes/projects/sync-rewrite.md`, `notes/research/offline-sync-options.md`,
  `notes/research/user-interviews-2026-08.md` (cli.md Search; cli.test 'search: ranked by the words')
- Relaxed fallback: no file has all words, so files with some are returned with `relaxed: true` and a warning —
  `hobbies/cooking/Recipes/Family/مقلوبة.md`, `notes/research/offline-sync-options.md` (cli.md Search)
- Quoted phrase matches only adjacent words in order — `notes/daily/2026-09-22.md`,
  `notes/research/offline-sync-options.md` (cli.md Search query)
- Prefix wildcard `cat*` matches catalogue and catalog but plain `cat` does not — `notes/reading/list.md`,
  `notes/research/offline-sync-options.md` (cli.md Search ('cat isn't catalogue'))
- Exclusion `-draft` removes notes containing the word — `notes/projects/sync-rewrite.md`,
  `work/product/drafts/notes-from-offsite.md` (cli.md Search)
- `title:` limits to title or alias — `notes/people/priya-nair.md`, `notes/reading/list.md` (cli.md Search)
- `#tag` and `tag:x` match notes carrying the tag or a nested one — `notes/people/jo-becker.md`,
  `notes/research/user-interviews-2026-08.md`, `notes/weekly/2026-W40.md` (cli.md Search; tags)
- `path:folder/` restricts to files whose path starts so — `notes/weekly/2026-W40.md`, `work/kestrel/README.md` (cli.md
  Search)
- Accent and case folding — `hobbies/cooking/Recipes/Family/مقلوبة.md`, `notes/daily/2026-08-24.md`,
  `notes/people/tomas-ruiz.md` (cli.md Search ('Accents and case don't count'))
- Operator characters are never FTS5 syntax — `notes/meetings/Meeting: Q3.md`, `notes/research/offline-sync-options.md`
  (cli.md Search ('Nothing is passed on as FTS5 syntax'))
- --limit N caps hits; default 20; max 500 — `notes/reading/bookmarks.md`, `notes/reading/list.md` (cli.md Search;
  \--limit)
- A hit opens at the section with most of the words; line, column, heading, section, snippet, marks, more —
  `notes/meetings/all-hands-archive.md`, `notes/research/offline-sync-options.md` (cli.md Search)
- Scope vault (default) vs linked vs all — `notes/projects/halden-outreach.md`,
  `notes/research/offline-sync-options.md`, `notes/weekly/2026-W40.md` (cli.md Search By vault (20.16))
- Scan engine before `index` builds the index, with a warning; index engine afterwards — `notes/.slipbox/config.toml`,
  `notes/research/offline-sync-options.md` (cli.md Search The index; cli.test 'scanned until index builds')
- Search covers data files (toml, yaml), not code (py) nor binary — `work/kestrel/api/kestrel_api/sync.py`,
  `work/kestrel/kestrel.toml` (cli.md Search ('notes and data files'))
- Search in a \$HOME-opened plain folder is scanned, never indexed — `Downloads/plan.md`, `Downloads/stray-note.md`
  (cli.md Search ('\$HOME or / opened as a plain folder keeps none'))
- Search in a note over max\_file\_size — `.build/extras.toml`, `Downloads/notion-export.md` (configuration.md
  \[walk\])

### tasks-tags

- Data and code files have no tasks, tags or titles: '- \[ \]' in a yaml string and a TODO in code do not become tasks
  — `work/kestrel/api/kestrel_api/sync.py`, `work/kestrel/config/base.yaml`, `work/kestrel/data/segments.csv` (idea.md
  table row Tasks, tags, title: —)

### fragments

- Link fragments into code files and data rows — `work/kestrel/api/kestrel_api/sync.py`,
  `work/kestrel/api/openapi.yaml`, `work/kestrel/config/app.toml` (rendering.md; data.ts dataOutline slug)

### unicode

- Non-ASCII in data and code: keys, values, identifiers, comments, strings in all 8 grammars —
  `work/kestrel/scripts/dev/kestrel.lua`, `work/kestrel/src/routes/name.ts` (syntax.ts errors UTF-16 columns; width.ts)
- graphemes: wide chars, emoji with ZWJ, combining marks, RTL text, in headings, table cells, links, filenames; status
  L:col mapping — `hobbies/cooking/Recipes/Family/مقلوبة.md`, `notes/research/unicode-in-route-names.md` (The cursor;
  width.ts rule)

### cursor

- hjkl and arrows keep the goal column across short, empty and wide rows — `notes/daily/2026-08-17.md`,
  `notes/research/unicode-in-route-names.md` (tui.md The cursor; tests 'h j k l and arrows; up and down keep the goal
  column', 'wide characters are one stop')
- word motions w b e and ctrl+arrows by vim word classes — `notes/daily/2026-10-05.md`,
  `work/kestrel/docs/runbooks/deploy.md` (cursor.word\_\*; tests 'w b e and ctrl+arrows move by word')
- line start/end/first-nonblank (0 \$ ^ home end) on indented, tab-indented and trailing-space lines —
  `notes/daily/2026-08-17.md`, `work/kestrel/Makefile` (cursor.line\_start/line\_end/first\_nonblank; 'The cursor stops
  on trailing spaces and on a tab')
- top/bottom of note and count gg/G as a line number — `notes/daily/2026-09-08.md`, `notes/daily/2026-09-19.md`
  (cursor.top/bottom; 'A count before gg or G is a line number')
- heading prev/next (\[\[ \]\] alt+up/down) across all heading levels, setext headings, headings inside code fences
  (must not count) — `notes/meetings/all-hands-archive.md`, `work/kestrel/docs/runbooks/sync-queue.md`
  (cursor.heading\_prev/next)
- paragraph motions { } including last-paragraph behaviour and d} — `notes/daily/2026-08-31.md`,
  `notes/daily/2026-10-05.md` (cursor.paragraph\_\*; 'd} keeps the blank line', 'd} takes a last paragraph whole')
- f F t T ; , with counts and after operators, plus not crossing line — `notes/daily/2026-10-05.md`,
  `notes/meetings/standup-log.md` (cursor.find\_char/find\_repeat; test 'f F t T and ; , — as motions, with counts')
- half/full page scrolling, scrolloff and H M L, zz zt zb — `hobbies/cycling/202601010900-training-log-2026.md`,
  `notes/meetings/all-hands-archive.md` (cursor.half\_\*/page\_\*/screen\_\*; scroll.\*; ui.scrolloff)
- goto line by prompt (ctrl+g, :42, space f l) and a line inside a wrapped paragraph or a joined row —
  `notes/daily/2026-09-08.md`, `work/kestrel/src/generated/routes-big.ts` (cursor.goto\_line; 'goto a line whose
  paragraph joins it with others on one row')
- positions survive resize: top-of-view and cursor anchors in wrapped paragraph and table rows —
  `notes/projects/kestrel-v2-3.md`, `work/product/prd/offline-sync.md` (tui.md Positions (3.5); tests 'the window's top
  comes back to the same row', 'a cursor on a table's bottom border stays there')
- mouse wheel pulls cursor along only as needed, including inside a tall lens — `notes/meetings/all-hands-archive.md`,
  `work/kestrel/src/generated/routes-big.ts` (tui.md Scrolling)
- reading position per note and repeated headings: prepending an entry above does not move the reader —
  `hobbies/cycling/rides/202609131900-300k-brevet.md`, `notes/daily/2026-09-22.md`, `notes/meetings/standup-log.md`
  (tui.md Following links last para; test 'repeated headings: an entry prepended above doesn't move the reader')

### selection

- shift+arrow, shift+ctrl word, shift+home/end, paragraph, page extension — `notes/daily/2026-08-17.md`,
  `work/product/prd/route-sharing.md` (keymap.md Selection; test 'shift+arrows extend...')
- visual v and V, o swap, y, esc, counts (v2j V3\>) — `notes/daily/2026-09-01.md`, `notes/daily/2026-10-05.md`
  (visual.\*; test 'v, V, o, y and esc')
- selection survives re-layout (resize, pane toggle) and copied text equals rendered text —
  `notes/projects/kestrel-v2-3.md`, `work/product/prd/route-sharing.md` (tui.md Selection; tests 'a selection stays on
  the same source lines when the width changes')
- mouse drag copy, double-click word, triple-click row — `hobbies/cooking/Recipes/Family/مقلوبة.md`,
  `notes/research/unicode-in-route-names.md` (Mouse; tests 'double-click selects a word, triple-click the row')

### copy

- y y, y p, y r, y l, ctrl+c copy variants — `notes/daily/2026-08-17.md`, `work/kestrel/docs/sync.md` (copy.\*)
- clipboard fallback: cuts reach it, p puts it, register used when clipboard unreadable — `Downloads/chat-export.md`,
  `work/kestrel/docs/qa/render-torture.md` (keymap.md Copy; test 'the clipboard: cuts reach it')

### history

- back/forward stacks across link follows, heading jumps, note opens, 200 deep, kept 50 in session —
  `notes/daily/2026-10-01.md`, `notes/index.md` (tui.md History 3.6; history.\*)
- history list: here marked, click selects, enter jumps, recent here section with 'tab N' and times —
  `notes/daily/2026-10-01.md`, `notes/projects/kestrel-v2-3.md` (history.list; tests 'history: notes read in other
  tabs...' )
- history lists notes read lately, newest first with line, exists:false for deleted, open tabs, activeTab, current —
  `notes/daily/2026-10-01.md`, `notes/inbox.md` (cli.md history; cli.test review cycle 1)

### changes

- change list g; g, and gi insert-where-last — `notes/daily/2026-08-17.md`, `notes/daily/2026-10-05.md`
  (change.prev/next, edit.insert\_last)

### windows

- split side/stacked, focus, move, swap, close, only on notes of different lengths — `notes/daily/2026-09-08.md`,
  `work/kestrel/docs/sync.md` (window.\*; test 'split, focus, move, swap, close, only')
- resize mode and ctrl+w \>,\<,+,- with limits (explorer/outline widths 12..half, ratio 15..85%) —
  `notes/daily/2026-09-08.md`, `work/kestrel/README.md` (keymap.md Resize mode; tests on resize)
- follow link into split (ctrl+enter), explorer s opens in the other window — `notes/index.md`,
  `notes/projects/kestrel-v2-3.md` (link.follow\_split; test 'explorer s opens in the other window when a split is
  there already')
- window title/breadcrumb row in a split with long file names and many headings —
  `notes/meetings/all-hands-archive.md`, `work/product/prd/route-sharing.md` (tui.md Breadcrumb)

### breadcrumb

- breadcrumb collapse levels: all, first…innermost, first+last cut, … last, … alone —
  `notes/meetings/all-hands-archive.md`, `notes/meetings/standup-log.md` (tui.md breadcrumb; test 'crumbLayout')
- breadcrumb dropdown: filter, here marker, enter jumps, 8 entries window, └─ tree —
  `notes/meetings/all-hands-archive.md`, `notes/meetings/standup-log.md` (breadcrumb.path; test '… opens the whole path
  as a dropdown')

### tabs

- tab strip with many tabs: +N overflow, active visible, 24-col name cut, ↻ marker, × and middle-click, drag reorder —
  `notes/index.md`, `notes/meetings/all-hands-archive.md` (tui.md tab strip; tests 'tabs that don't fit', 'on a narrow
  strip, +N is clickable')
- tab commands: new, next/prev, go to N (1..9, \>9), move, close, close others/all with pinned and unsaved —
  `notes/daily/2026-10-01.md`, `notes/projects/kestrel-v2-3.md` (tab.\*; tests 'new, next, previous, go to, move, list,
  close', 'pinned tabs keep left')
- each branch keeps its tabs; switching back restores; not over unsaved — `.build/kestrel.toml`,
  `work/kestrel/docs/sync.md` (tui.md Each branch's tabs 5.9)

### outline

- outline with many heading levels, folds, follows cursor, filter, rename heading —
  `notes/meetings/all-hands-archive.md`, `notes/meetings/standup-log.md` (outline.\*; tests outline)
- outline pick (space f o) and breadcrumb borrowed in source mode — `notes/meetings/all-hands-archive.md`,
  `work/kestrel/docs/runbooks/sync-queue.md` (outline.pick; 'unsaved ... source mode's outline comes from a quick
  scan')
- outline lists headings with source lines — `notes/meetings/all-hands-archive.md`,
  `notes/reading/maps-and-territories.md` (cli.md outline; cli.test)
- Outline of data and code files: toml/yaml/json sections; python/rust/ts/go/lua definitions with kind —
  `work/kestrel/crates/route-engine/src/lib.rs`, `work/kestrel/kestrel.toml`, `work/kestrel/tools/uploader/main.go`
  (cli.md Naming notes 5; cli.test files beyond notes)

### find

- find in note: plain, smart case, regex (alt+r), whole word (alt+w), match counts 2/7, no matches, not a regex —
  `notes/projects/sync-rewrite.md`, `notes/research/offline-sync-options.md` (Find; test 'find: ctrl+f...', 'find's
  toggles')
- n/shift+n wrap with 'from the top' message; \* and # whole word — `notes/meetings/standup-log.md`,
  `notes/research/offline-sync-options.md` (find.next/prev/word\_\*)
- incremental search returns to origin when no match; find row in narrow window and short window (question window) —
  `notes/meetings/standup-log.md`, `work/kestrel/docs/runbooks/deploy.md` (tests 'incremental search goes back', 'the
  find row keeps room')
- find matches rendered text, and in lens/source markdown — `notes/daily/2026-08-24.md`,
  `work/kestrel/docs/runbooks/deploy.md` (tui.md Find ('as a layout shows it'))
- Plain-text find across the vault prints path:line:column: line — `notes/projects/sync-rewrite.md`,
  `notes/research/offline-sync-options.md` (cli.md find; cli.test find)
- Smart case: lowercase query ignores case, capital query is case-sensitive; --ignore-case forces —
  `notes/projects/sync-rewrite.md`, `notes/research/offline-sync-options.md` (cli.md Patterns)
- --whole keeps to whole words — `notes/projects/sync-rewrite.md`, `notes/research/offline-sync-options.md` (cli.md
  Patterns)
- --regex JavaScript syntax with ^ and \$ as line anchors, CRLF-aware — `notes/daily/2026-09-15.md`,
  `notes/research/offline-sync-options.md` (cli.md Patterns; cli.test 'line anchors')
- Long line shown as a window around the match with … where cut — `Downloads/transcript-2026-09-24-incident-review.md`,
  `notes/meetings/all-hands-archive.md` (cli.md Big notes; cli.test long-line)
- find across the vault warns about notes skipped for size and unreadable notes; rest still searched —
  `.build/extras.toml` (cli.md find; cli.test 'review cycle 2/5')
- --files extends find to data and text files; plain find does not — `work/kestrel/api/kestrel_api/app.py`,
  `work/kestrel/kestrel.toml` (cli.md find --files; cli.test files beyond notes)
- find in notes outside the walk (hidden folder, git-ignored) by explicit name still reads —
  `notes/templates/drafts/okr-draft.md`, `work/kestrel/docs/generated/api.md` (cli.md Naming notes 1; cli.test 'a note
  outside the walk reads')
- Empty query refused; missing note exit 3; extra args exit 2 — `notes/daily/2026-10-06.md`, `work/kestrel/README.md`
  (cli.md Arguments)

### replace

- replace row: enter one, alt+a all as one undo step, ctrl+n/p, regex with \$1 \$\& \$\$ —
  `notes/meetings/standup-log.md`, `notes/projects/sync-rewrite.md` (find.replace; tests on replace)
- :s :%s :'\<,'\>s with flags g i c, delimiters, \\1 \&, ^ \$ empty matches, \\r newline, CRLF —
  `notes/daily/2026-09-15.md`, `notes/meetings/standup-log.md` (find.substitute; tests ':s ...')
- Dry run previews each change with line, column, text and textAfter; writes nothing — `notes/daily/2026-10-06.md`,
  `notes/projects/sync-rewrite.md` (cli.md replace; cli.test 'previews show lines')
- Replace all vs --first vs --first-per-line — `notes/daily/2026-10-06.md`, `notes/meetings/standup-log.md` (cli.md
  replace; cli.test 'review cycle 1 :s without g')
- --lines A-B restricts to a range; bad ranges are usage errors — `notes/daily/2026-10-06.md`,
  `notes/meetings/standup-log.md` (cli.md replace; cli.test 'review cycle 2')
- Regex replacement with \$1-\$9, \$\&, \$\$ and empty-match insertion — `notes/daily/2026-09-15.md`,
  `notes/daily/2026-10-06.md` (cli.md Patterns; cli.test replace groups)
- Smart case in replace; --ignore-case; --whole — `notes/daily/2026-10-06.md`, `notes/projects/sync-rewrite.md` (cli.md
  Patterns)
- --if-unchanged sha: stale sha refused (5), the dry-run's sha is accepted, empty sha is usage error —
  `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md` (cli.md --if-unchanged; cli.test)
- A big note answers in linear time — `Downloads/sync-worker-2026-09-22.log.md`, `notes/meetings/all-hands-archive.md`
  (cli.test 'replace answers in linear time')
- CRLF and BOM preserved by replace and write — `notes/daily/2026-09-15.md`, `notes/daily/2026-09-16.md`,
  `notes/daily/2026-09-18.md` (cli.test 'a CRLF note with a BOM keeps both'; cli.md)
- Replace in non-note files: toml value, py comment; binary refused — `Downloads/photo.PNG`,
  `work/kestrel/api/kestrel_api/app.py`, `work/kestrel/kestrel.toml` (cli.test files beyond notes)
- Replace refuses what a writer may not change — `.build/extras.toml`, `work/kestrel/.slipbox/config.toml` (cli.md What
  a writer may change; cli.test cycle 1-2)
- Empty search string is usage error — `notes/daily/2026-10-06.md`, `work/kestrel/README.md` (cli.test 'replace home ""
  H')

### vault-find

- find in every note (ctrl+shift+f): text/regex per line, open unsaved notes as they are —
  `notes/meetings/standup-log.md`, `work/kestrel/docs/runbooks/deploy.md` (find.vault; test 'search the vault: every
  note')
- replace in every note (ctrl+shift+h): what, with what, a rename's preview; space v shift+u undoes it —
  `notes/meetings/standup-log.md`, `work/kestrel/docs/runbooks/deploy.md` (find.replace_vault; tests 'replace in every
  note (25.4)')

### switcher

- quick switcher: recent first, previous on top, filter words in any order, # for headings/symbols — `notes/index.md`,
  `work/kestrel/README.md` (switcher.open; tests 'ctrl+p lists recent...')

### palette

- :-prompt: aliases beat fuzzy, argument completion (notes, themes, glyphs), recent 5, group listing, :tag name, :42 —
  `notes/index.md`, `work/infra/dotfiles/slipbox/config.toml` (palette.open; tests ': exact aliases win...')

### help

- help (?) lists every key, groups kept while filtering, section start depends on context, keycaps, footer, narrow
  columns drop — `work/infra/dotfiles/slipbox/config.toml`, `work/kestrel/.slipbox/config.toml` (help.open; tests
  'help: grouped...')

### which-key

- leader popup, delay for other prefixes, group names from \[groups\], backspace/esc, +N more, tiny screens, clicks —
  `notes/index.md`, `work/infra/dotfiles/slipbox/config.toml` (tui.md which-key; tests 'which-key ...')

### lens

- lens opens on cursor's block grown to lens\_min\_rows (6), never splits a block — `notes/projects/kestrel-v2-3.md`,
  `work/kestrel/docs/runbooks/deploy.md` (tui.md lens; tests 'space n l opens it...')
- lens with tables (12 columns, wide inline code, CJK cells, escaped pipes) and code blocks (long lines, language
  label, tabs) — `notes/meetings/2026-09-10-q4-okr-planning.md`, `work/kestrel/docs/qa/render-torture.md` (lens;
  rendering)
- block taller than lens scrolls inside with ↑ N lines / ↓ N lines, cursor 2 rows from rules, wheel inside —
  `notes/meetings/all-hands-archive.md`, `notes/reading/bookmarks.md` (tui.md block taller than the lens 4.15)
- + - = size by hand; slides at that size; CSV record sliding — `hobbies/cycling/rides.csv`,
  `notes/meetings/all-hands-archive.md` (lens.grow/shrink/reset; tests)
- moving past edge, jumps, search moves lens, click moves lens, keeps screen position —
  `notes/meetings/standup-log.md`, `notes/projects/kestrel-v2-3.md` (tui.md Moving while it's open)
- agent edit elsewhere doesn't stretch lens; lens + conflicts; load theirs under tall lens at note end —
  `notes/daily/2026-10-06.md`, `work/kestrel/scripts/dev/agent-replay.sh` (tests 'the lens: an agent's edit
  elsewhere...', 'loading theirs under a tall lens')
- lens vs source differential: same typing keys same text; esc esc; i from render with edit\_in live; air rows next to
  headings, tables, code — `notes/projects/kestrel-v2-3.md`, `work/kestrel/docs/runbooks/deploy.md` (tests 'the lens:
  the same typing keys give the same text')
- data files in lens: one card at a time for YAML/JSON keys, TOML/INI one key, CSV records —
  `hobbies/cycling/rides.csv`, `work/kestrel/kestrel.toml` (tui.md Data files open rendered)

### source-mode

- source highlighting: frontmatter YAML and TOML, headings, rules, quote bars, list/task markers, fences, inline code,
  links; tabs, wide chars, control characters, CRLF — `notes/daily/2026-09-15.md`,
  `notes/projects/dome-night-volunteering.md`, `notes/projects/kestrel-v2-3.md` (tui.md Source mode 4.13; test 'names
  with bidi overrides, C1 and escapes')
- wrap behavior on long lines: 0 \$ j k act on row, D C A I dd cc on source line —
  `Downloads/transcript-2026-09-24-incident-review.md`, `work/kestrel/docs/qa/render-torture.md` (Where source mode
  isn't vim)
- line numbers gutter and problems bar column together — `work/kestrel/docs/qa/render-torture.md`,
  `work/kestrel/src/routes/RouteMap.tsx` (ui.line\_numbers, ui.problems\_bar)

### tasks

- task toggle on tasks in lists, nested lists, tables, quotes, multi-row items; innermost chosen; click on checkbox —
  `notes/daily/2026-08-21.md`, `notes/daily/2026-09-15.md`, `notes/meetings/2026-09-10-q4-okr-planning.md` (task.toggle
  4\.11)

### save

- save, atomic write keeping permissions, symlinked note written through, target outside vault refused —
  `notes/daily/2026-08-17.md`, `notes/projects/kestrel-v2-3.md` (Writing notes 7.5)
- save all :wa, :wq, :x, :q!, quit refused naming notes, ctrl+q — `notes/daily/2026-10-01.md`,
  `notes/projects/kestrel-v2-3.md` (note.save\_all; app.save\_quit)

### autosave

- autosave idle timer, not in insert, not after keep, not with conflict markers, not under git index.lock, worktree
  .git file lock — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md` (tui.md Autosave 4.7/5.6/5.10)

### conflict

- conflict prompt choices l k d m, esc, while typing waits for esc, space n c reopen, :w opens prompt, :w! forces —
  `work/kestrel/docs/release-notes/2.3.md`, `work/kestrel/scripts/dev/agent-replay.sh` (tui.md Outside changes 4.5)

### watching

- external edit to clean note reloads silently with ↻, undo brings old text; cursor/anchors keep place —
  `notes/daily/2026-10-06.md`, `work/kestrel/scripts/dev/agent-replay.sh` (External changes 5.x)
- create/delete notes flip link statuses; deleted-on-disk buffer stays with ✖ marker; new directories watched deeply;
  .gitignore change rescans — `notes/projects/route-sharing.md`, `work/kestrel/scripts/dev/agent-replay.sh` (5.1–5.4)
- scratch file polled while open; own writes ignored — `notes/.slipbox/config.toml`, `notes/inbox.md` (scratch; tests
  'the scratch's own writes never read as external changes')
- git operations applied as one change: checkout, merge, rebase; switch message; files a switch brings not taken for
  moves — `.build/kestrel.toml`, `notes/daily/2026-09-29.md`, `work/kestrel/docs/sync.md` (What git does lands as one
  change 5.9/5.10)

### scratch

- scratch open/add selection with path:line-line / cursor row path:line / copy / clear asks —
  `notes/daily/2026-09-22.md`, `notes/inbox.md` (scratch.\*)
- scratch show/path/clear/copy with sha and --if-unchanged — `notes/.slipbox/config.toml`, `notes/inbox.md` (cli.md
  scratch; cli.test)
- capture.location = vault puts scratch in the vault; symlinked scratch falls back to state; file setting validation —
  `hobbies/photography/.slipbox/config.toml`, `notes/.slipbox/config.toml` (configuration.md \[capture\])

### context

- context bundle copy: note + links + backlinks, unsaved notes saved first, \[context\] depth — `notes/index.md`,
  `notes/projects/kestrel-v2-3.md` (context.copy 9.7)
- context bundles asked-for notes, their links and backlinks as ## path sections with reasons — `notes/index.md`,
  `notes/projects/kestrel-v2-3.md` (cli.md context; cli.test 'context')

### info

- Info panel sections File/Properties/Tags/Links; folding; enter opens what a row names; y copies; names a third of
  pane — `notes/people/aiko-tanaka.md`, `notes/projects/kestrel-v2-3.md` (note.info 3.19)
- info lists root, mode, name, its copies, the link convention, paths, versions, config files applied in order, index
  written, background — `Downloads/notes-backup-2026-07/index.md`, `hobbies/photography/.slipbox/config.toml`,
  `work/kestrel/README.md` (cli.md Where a command works; configuration.md; cli.test 'info')
- Root markers: .git, .slipbox, .obsidian, .zk; walk.root\_markers yours only; \$HOME and / never a root —
  `notes/index.md`, `work/kestrel/README.md` (cli.md Where a command works (21.1); configuration.md \[walk\])

### properties

- properties editor: YAML and TOML, no frontmatter gets one, emptied removed, unparsable asks, changed meanwhile asks,
  esc/q/:q/ctrl+s, one undo — `notes/daily/2026-09-09.md`, `notes/projects/dome-night-volunteering.md`,
  `notes/projects/kestrel-v2-3.md` (note.properties 3.20)
- frontmatter variety: aliases, tags list/str, dates, nested maps, empty frontmatter, '---' in body —
  `notes/daily/2026-09-09.md`, `notes/daily/2026-09-10.md`, `notes/daily/2026-09-20.md`, `notes/people/aiko-tanaka.md`,
  `notes/people/jo-becker.md`, `notes/people/malik-haddad.md` (Info Properties; rendering.md)

### problems

- code as a document: definitions in the margin, doc comments as prose with their tags, imports folded (enter), long
  lines broken at their structure, guides; space n v to source — `work/kestrel/src/routes/RouteMap.tsx` (code-view.md
  24.x; tests)
- code as a document in Python: docstrings above their definitions, comments as prose, notes in the margin —
  `work/kestrel/api/kestrel_api/app.py` (code-view.md 24.11-12; tests)
- problems panel, All: Broken links, Ambiguous links, Lint, Conflicts, Orphans; folding; enter or a click opens the
  file in a tab at its line (o here, s the split); / filters — `notes/meetings/2026-09-05-feedback-synthesis.md`,
  `work/kestrel/docs/release-notes/2.3.md` (problems.open 1.7; tests)
- problems panel, This file: every source's problems with their lines, the chosen one marked, enter jumps; tab switches;
  / filters; resized (ctrl+w + / -, its rule dragged); a bar sign clicked opens it there; none here: the status
  line's ⚠ 0 — `work/kestrel/src/routes/RouteMap.tsx`, `work/product/drafts/notes-from-offsite.md` (problems.file 1.7;
  tests)
- problems where they are: bar column signs by severity, the count past one (+ past 9), marks at a level (errors by
  default; space u shift+d cycles), status line, severity threshold — `work/kestrel/src/routes/RouteMap.tsx`,
  `work/product/drafts/notes-from-offsite.md` (Problems where they are 19.8-11)
- problems lists broken, ambiguous links and orphans; a path is never ambiguous —
  `notes/meetings/2026-09-05-feedback-synthesis.md`, `notes/projects/kestrel-v2-3.md`, `notes/reading/the-long-ride.md`
  (cli.md problems; cli.test 'problems')
- problems --lint adds markdownlint findings; a warning when lint is off or fails —
  `work/product/.markdownlint-cli2.jsonc`, `work/product/drafts/notes-from-offsite.md` (cli.md problems --lint;
  configuration.md \[lint\]; cli.test 'problems --lint')

### lint

- lint on open and 300ms after save; never while unsaved; vault lint when Problems opens; linter that can't run said
  once — `notes/.slipbox/config.toml`, `work/product/.markdownlint-cli2.jsonc` (The lint surface 3.21)

### code-files

- tree-sitter languages open in source mode with outline and breadcrumb: TS, TSX, JS, Python, shell, Lua, Go, Rust
  (and since 16.18-16.23 Swift, HTML, CSS, SCSS, PHP, Dockerfile, Vue, Svelte, Astro, Ruby, C, C++) —
  `work/kestrel/src/App.tsx`, `work/kestrel/src/generated/routes-big.ts`, `work/kestrel/tools/greeter/greeter.go`,
  `work/kestrel/tools/greeter/greeter.js`, `work/kestrel/tools/greeter/greeter.lua`,
  `work/kestrel/tools/greeter/greeter.py`, `work/kestrel/tools/greeter/greeter.rs`,
  `work/kestrel/tools/greeter/greeter.sh`, `work/kestrel/tools/greeter/greeter.ts`,
  `work/kestrel/tools/greeter/greeter.tsx` (Source code through tree-sitter 16.6-9)
- links in comments: URLs, relative path, vault-root path, path:42, path in string; backlinks and rename rewrite —
  `work/kestrel/api/kestrel_api/sync.py`, `work/kestrel/crates/route-engine/src/graph.rs`,
  `work/kestrel/src/sync/queue.ts` (Links in comments 16.10, 20.19)
- files opened by :e: a file just written (watcher unaware), ignored/hidden file, node\_modules refused, binary
  refused, NUL-in-text refused — `Downloads/data.txt`, `work/kestrel/docs/generated/api.md` (tui.md Opening)
- data files rendered: TOML sections as headings, YAML list of records as table, JSON deep guides, \$ref pointer
  followed, path-valued values are links, parse error opens source with error each time —
  `work/kestrel/api/openapi.yaml`, `work/kestrel/config/regions.yaml`, `work/kestrel/kestrel.toml` (tests 'TOML opens
  rendered', 'YAML: a list of records is a table', 'guides at every depth')

### lsp

- hover, definition, references, rename symbol preview, code actions, format, completion, signature help in a code file
  — `work/kestrel/src/routes/share.ts`, `work/kestrel/src/routes/sign.ts` (What's under the cursor 19.12-16)
- files whose outline comes from server symbols (CSS, YAML, PHP, Swift) — `work/kestrel/docker-compose.yml`,
  `work/kestrel/src/styles/app.css` (tui.md 16.8/19.14)
- `slipbox lsp` says it was removed on stderr and exits 2 — `notes/daily/2026-10-06.md`, `work/kestrel/README.md`
  (cli.md slipbox lsp (removed))

### rename

- note rename/move preview: list of every changed line in every vault, git dirty trees noted, links skipped, open notes
  follow, history follows, unsaved refused — `notes/projects/kestrel-v2-3.md`, `work/kestrel/docs/architecture.md`
  (Renames 17.15)
- heading rename (space n h, outline r): every link to #heading rewritten — `notes/projects/kestrel-v2-3.md`,
  `work/kestrel/docs/runbooks/sync-queue.md` (heading.rename 11.9)
- naming a folder (slipbox name, space v n): its .slipbox/ name changed, the old kept, pointers by it still found;
  undo last rename (space v shift+u) refused when a file changed — `hobbies/photography/.slipbox/config.toml`,
  `notes/.slipbox/config.toml` (folder.name 21.10; rename.undo 7.4)

### trash

- delete note/folder: asks with link counts, trash list newest first, enter restores, refused when path occupied, open
  note shows last text marked deleted, u restores last — `notes/projects/kestrel-v2-3.md`,
  `notes/templates/drafts/okr-draft.md` (note.delete, trash.\*)
- trash lists items newest first; restore by id or path; refused when something is there — `notes/people/contacts.md`,
  `notes/templates/drafts/okr-draft.md` (cli.md trash)

### copy-move

- duplicate note name-copy, -2; paste beside vs into folder; cut/paste moves with links fixed —
  `notes/projects/kestrel-v2-3.md`, `notes/templates/meeting.md` (note.copy/yank/cut/paste)

### new-note

- new note naming: folders created, .md added unless known extension, title heading, typed after blank line, existing
  opens, outside vault refused, leading / from root, duplicate basename suggestion — `notes/templates/daily.md`,
  `notes/templates/meeting.md` (note.create/folder.create 18.x, 17.5)

### vault

- vault init/unmake from the TUI and explorer: preview, .slipbox/ in trash on way back, plain folder becomes vault, in
  plain folder 'v' goes into it — `Downloads/stray-note.md`, `notes/.slipbox/config.toml` (vault.init, vault.unmake
  18\.11)
- switching vaults by link/backlink/picker/explorer; back returns through a chain; refused when unsaved; each vault
  keeps own tabs and config — `Downloads/stray-note.md`, `notes/index.md` (Switching vaults 17.10)
- a named folder moved by hand: its sessions, scratch, trash and positions come along, nothing asked; two copies gone,
  or an unnamed root, start fresh; a worktree moved by git found by its name — `notes/.slipbox/config.toml`,
  `Downloads/notes-backup-2026-07/.slipbox/config.toml` (21.8)
- root names: .slipbox name over the remote's, never the folder's own; unnamed shown by path; worktree name@branch —
  `hobbies/cooking/Home.md`, `work/kestrel/README.md` (21.6, 21.9)
- git repo is a vault; Obsidian (.obsidian) and zk (.zk) markers; root\_markers; nested repo inside vault marked in
  explorer — `hobbies/cooking/Home.md`, `notes/index.md` (tui.md A git repository is a vault 20.3, 21.1)
- launcher: slipbox on plain folder shows the named folders, seen last first; plain folder explorer with ..; \~ and /
  one level at a time — `Downloads/stray-note.md`, `notes/index.md` (The launcher 17.14, 20.22, 21.10)
- background auto-index of home folder, idle only, resumable, daily — `Downloads/notes-backup-2026-07/index.md`,
  `notes/index.md` (The background auto-index 20.9)
- folders list: each named folder once (its worktrees are branches, not copies), the copy its links open, seen last
  first; :folders-default picks the copy — `Downloads/notes-backup-2026-07/index.md`, `notes/.slipbox/config.toml`
  (21.6, 21.10)

### git

- space g c changes list M + R ! states, enter diff, esc back — `.build/extras.toml`, `.build/kestrel.toml`,
  `work/kestrel/docs/sync.md`
  (git.changes 5.13)
- space g d per-note diff with unsaved changes, @@ headers, enter on line goes — `.build/kestrel.toml`,
  `work/kestrel/docs/sync.md` (git.diff)
- worktrees list and open note there; merge-review list with causes and fixes, red when no fix — `.build/kestrel.toml`,
  `work/kestrel/docs/sync.md` (git.worktrees 5.14, git.merge\_review 20.21)
- after merge/pull links broken by git renames get 'where it went' in Problems and follow —
  `notes/daily/2026-09-22.md`, `notes/projects/q4-okrs.md`, `work/kestrel/docs/features/route-sharing.md`,
  `work/product/okrs/2026-q4.md` (tui.md After a merge 20.21)
- changed lists M/+/D/R states, untracked files, files outside vault left out, against base (main/master/--base/\[git\]
  base) — `.build/kestrel.toml`, `.build/product.toml` (cli.md Git; cli.test 'changed, diff, worktrees')
- diff \<note\> shows hunks after @@ line N with 3 lines of context; new note all + — `.build/kestrel.toml`,
  `.build/product.toml` (cli.md diff)
- worktrees lists the main checkout first and each worktree by branch, with vault, current — `.build/kestrel.toml`,
  `work/kestrel/README.md` (cli.md worktrees; README \[\[worktree\]\])
- merge-review reports links a merge would break: moved, deleted, note-moved, missing; conflicts\[\] —
  `.build/kestrel.toml`, `.build/product.toml`, `work/kestrel/docs/legacy.md`, `work/kestrel/docs/sync.md`,
  `work/product/prd/route-sharing.md`, `work/product/roadmap/2027-themes.md` (cli.md merge-review (20.21))
- After a pull/merge: renames between commits are evidence; problems says moved and relink fixes —
  `.build/product.toml`, `notes/daily/2026-09-22.md`, `notes/projects/q4-okrs.md`,
  `work/kestrel/docs/features/route-sharing.md`, `work/product/okrs/2026-q4.md` (cli.md After a merge or a pull)
- problems lists unmerged files as conflicts at their first \<\<\<\<\<\<\< line during a merge —
  `notes/daily/2026-09-23.md`, `work/kestrel/docs/release-notes/2.3.md` (cli.md Git; Stability table)

### ui

- spelling (space u s, on in the kitchen sink): a Turkish and English note's deliberate typo (kitpa) marked, not
  in its code span; ] s, z = (kitap), z g; an English note's names — `notes/reading/okuma-notlari.md`,
  `notes/reading/maps-and-territories.md` (tui.md Spelling (25.6); tests 'spelling (25.6)')
- themes and glyph sets (nerd, unicode, ascii, auto) picker preview and esc restores; NO\_COLOR —
  `work/infra/dotfiles/slipbox/themes/kestrel-dark.yaml`, `work/kestrel/docs/qa/theme-showcase.md` (theme.pick,
  glyphs.pick; tests)
- readable width, zen (panes on demand), cursorline, line numbers, wrap off, urls, mouse off, top bar, breadcrumb
  toggles and their persistence/override rules — `work/infra/dotfiles/slipbox/config.toml`,
  `work/kestrel/docs/qa/render-torture.md` (tui.md UI settings; wrapping off paragraph)
- frame joints and rails with ui.lines light/heavy; tables always light; left/right rail off —
  `work/kestrel/docs/qa/glyphs.md`, `work/kestrel/docs/qa/theme-showcase.md` (Screen layout; tests 'joints', 'an
  overlaid pane joins the borders')
- messages floating boxes, stacking 4, error 8 s, same message refreshes; click opens messages list; tiny screen uses
  status line; questions with long text wrapped to six rows — `notes/projects/kestrel-v2-3.md`,
  `work/kestrel/.slipbox/config.toml` (Messages and questions)
- scrollbars (window, panes, horizontal) click and drag; hover role; viewport-only drawing of a huge note —
  `notes/meetings/all-hands-archive.md`, `notes/projects/kestrel-v2-3.md` (Scrollbars, Known limits)
- config reload: keys, leader, aliases, groups, theme, \[colors\], render, walk, watch settings; broken file keeps
  defaults; typo mid-edit keeps last good — `work/infra/dotfiles/slipbox/config.toml`,
  `work/kestrel/docs/qa/theme-showcase.md` (Configuration reload)
- session restore: tabs, splits ratio, cursors, scroll with breadcrumb, explorer/outline widths, UI overrides, recent
  commands, history 50, restore\_session off — `notes/index.md`, `work/infra/dotfiles/slipbox/config.toml` (Positions
  Saved state; tests 'session restore')
- editor hand-off: space n e suspends and reloads changed file; space n s to running nvim; picker of several nvims;
  remembered; template editors — `work/infra/dotfiles/slipbox/config.toml`, `work/kestrel/docs/dev-setup.md` (Handing
  off 4.1/4.2/4.12)

### tags

- tags list with counts, nested tags with parent counts, #tag in text vs frontmatter, followed in render and source,
  :tag name — `notes/projects/brevet-300.md`, `notes/projects/kestrel-v2-3.md`, `notes/weekly/2026-W34.md` (Tags 1.6)
- tags lists every tag with counts; nested #a/b counts under #a too — `notes/weekly/2026-W34.md`,
  `notes/weekly/2026-W40.md` (cli.md tags; SKILL tags; cli.test 'tags')
- `tags '#project'` lists notes carrying it including nested tags; `tags project` without hash —
  `notes/projects/brevet-300.md`, `notes/weekly/2026-W40.md` (cli.md tags \[tag\])
- Frontmatter tags in each YAML form — `notes/people/jo-becker.md`, `notes/projects/brevet-300.md` (cli.md tags; stat
  properties)

### safety

- control and bidi characters in file names, headings and text never reach the terminal — `.build/extras.toml`,
  `notes/research/terminal-escapes-in-logs.md`, `work/kestrel/src/web/markdown/__fixtures__/escapes.md` (test 'names
  with bidi overrides, C1 and escapes'; CLAUDE.md sanitize rule)

### keys

- keypad keys, legacy ctrl+j, config chords, ctrl chords with non-ctrl routes, kitty protocol, paste bursts handled in
  order — `Downloads/chat-export.md`, `work/infra/dotfiles/slipbox/config.toml` (Platform notes; tests 'keypad keys',
  'keys are handled in order')
- commands lists every command id with CLI equivalents; \[keys\], \[aliases\], \[groups\] reflect it in `commands` —
  `work/infra/dotfiles/slipbox/config.toml`, `work/kestrel/.slipbox/config.toml` (configuration.md \[keys\]; cli.md
  commands)

### lists-prompts

- list pickers: wrap-around moves, pagedown 10, j/k only without filter, paste first line, backspace/ctrl+w, counter
  n/m, groups, footer, empty state, wheel 3 rows, clicks on border do nothing — `notes/projects/kestrel-v2-3.md`,
  `notes/reading/bookmarks.md` (Overlays, In lists and prompts)

### questions

- prompt/question windows: OK/Cancel clicks, outside cancels, yes/no y n esc, enter not answer, small screen uses
  status line, zen last row — `notes/projects/kestrel-v2-3.md`, `notes/templates/drafts/okr-draft.md` (Questions)

### cli-parity

- every command has a spec and implementation; ctrl chords have non-ctrl routes — `notes/projects/kestrel-v2-3.md`,
  `work/infra/dotfiles/slipbox/config.toml` (tests 'every command spec is implemented')

### reload

- note.reload / :reload and note.revert (:e!) from disk; reindex; vault info; messages — `.build/extras.toml`,
  `notes/daily/2026-10-06.md` (note.reload, vault.reindex, vault.info)

### large

- big notes: first open parses off-thread ('reading big.md — 20,000 lines…'), keys wait, click dropped; width change
  re-wrap cached six widths — `notes/meetings/all-hands-archive.md`, `work/kestrel/src/generated/routes-big.ts` (Known
  limits 15.1)

### rendering-in-tui

- tables: 12 columns, narrow terminals become records, CJK/emoji cells, inline code wider than 80, empty cells,
  alignment markers, cell with link and footnote — `work/kestrel/docs/qa/render-torture.md`,
  `work/product/roadmap/q4.md` (tui.md Narrow terminals; rendering.md)
- code blocks on block background with cursor band, language labels, tab, long lines, empty fence, unclosed fence,
  nested fences with \~\~\~ — `work/kestrel/docs/qa/render-torture.md`, `work/kestrel/docs/runbooks/deploy.md` (test 'a
  code block's text sits on the block's background')

### mouse

- mouse interactions: click task checkbox, tab ×/middle-click/drag, status path copy, message click, which-key click,
  rail buttons, border drags — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md` (Mouse chrome table)

### status

- status line: mode chips (READ SOURCE LENS INSERT VISUAL V-LINE FILES OUTLINE RESIZE), pending keys, markers (unsaved,
  differs from disk, reloaded, deleted), link under cursor with status, words, tab N/M, L:col, percentage, narrow
  dropping order — `notes/projects/kestrel-v2-3.md`, `work/kestrel/docs/qa/render-torture.md` (The status line)

### words

- word counts: frontmatter excluded, CJK per char, markdown syntax excluded, code blocks included? —
  `notes/daily/2026-08-24.md`, `notes/daily/2026-09-19.md`, `notes/people/malik-haddad.md` (The status line; test
  'words in the status line')

### multiple-roots

- opening notes of different formats side by side: .md plus .toml/.py in tabs, extensions shown in
  tabs/explorer/history — `notes/projects/kestrel-v2-3.md`, `work/kestrel/README.md` (What lists them)

### index

- a note saved in slipbox is re-indexed: a link added shows in target's backlinks; search index kept current —
  `notes/projects/kestrel-v2-3.md`, `work/kestrel/docs/architecture.md` (test 'a note saved in slipbox is re-indexed')
- index builds or brings up to date; --rebuild restarts; JSON {path, rebuilt, indexed, removed, files, ms} —
  `notes/.slipbox/config.toml`, `work/kestrel/README.md` (cli.md Search The index)
- index --refresh \[path\] brings a vault's index up to date: this one, or the one holding path; outside every vault
  the plain folder — `notes/.slipbox/config.toml`, `work/kestrel/README.md` (cli.md Freshness (20.10))
- index --home runs the background auto-index of \~ now: finds vaults, never into
  hidden/node\_modules/venv/\_\_pycache\_\_/\~/Library; --budget MS; --rebuild —
  `Downloads/notes-backup-2026-07/index.md`, `notes/index.md` (cli.md The home folder (20.9))
- Every command notes its time (activity) so the TUI's auto-index waits while an agent works —
  `notes/.slipbox/config.toml`, `work/kestrel/scripts/dev/agent-replay.sh` (cli.md The home folder)

### opening

- startup variants: no path with/without session (home note opens), path of a note, folder, nested file in repo, loose
  file, \~ launcher — `notes/index.md`, `notes/projects/kestrel-v2-3.md` (test 'with no note named and no session, the
  vault's home note opens')

### samples-meta

- agent-driven edits fixture: a script (sample-agent) that appends, prepends, renames, deletes and recreates notes
  while TUI open — `Downloads/plan.md`, `work/kestrel/scripts/dev/agent-replay.sh` (External changes; conflict prompts)

### task

- task lists tasks with line, checked, text, raw; sha in JSON — `notes/daily/2026-08-17.md`,
  `notes/daily/2026-10-06.md` (cli.md task; cli.test 'task')
- Toggle with a line number; --check/--uncheck set only; no-op when already so — `notes/daily/2026-08-21.md`,
  `notes/daily/2026-09-15.md`, `notes/daily/2026-10-06.md` (cli.md task; cli.test)
- task --if-unchanged refused even when toggle would change nothing — `notes/daily/2026-08-21.md`,
  `notes/daily/2026-10-06.md` (cli.test secondary refusals)
- task on a non-note file is exit 2 — `work/kestrel/api/kestrel_api/app.py`, `work/kestrel/kestrel.toml` (cli.md Naming
  notes 5)

### read

- read gives text and sha; --json gives path, abs, sha, bom, crlf, invalidUtf8, content — `notes/daily/2026-09-16.md`,
  `notes/daily/2026-09-18.md` (cli.md read; cli.test 'read gives raw text')
- Read of a symlink leading out of the vault is exit 5; in-vault symlink is read — `.build/extras.toml`,
  `notes/projects/kestrel-v2-3.md` (cli.test 'a symlink out of the vault is never read')
- Names that begin with a dash read after `--` — `.build/extras.toml`, `notes/daily/2026-10-06.md` (cli.md Arguments;
  cli.test)
- Naming resolution order: existing path, a pointer (slipbox://name/path), root-relative, note name, data file —
  `notes/meetings/Meeting: Q3.md`, `notes/people/contacts.md` (cli.md Naming notes)

### write

- write replaces text; text args end with newline; --stdin as it comes — `notes/daily/2026-10-06.md`, `notes/inbox.md`
  (cli.md write; cli.test 'write: replace, append, create')
- --append adds on a new line; --append --paragraph adds a blank line first — `notes/daily/2026-09-17.md`,
  `notes/daily/2026-10-06.md` (cli.md write; cli.test 'append a block' and 'CRLF paragraphs')
- --create makes a new note: path from vault root (not cwd) unless ./ or ../, .md added, never overwrites —
  `notes/daily/2026-09-17.md`, `notes/inbox.md` (cli.md Paths for --create; cli.test)
- Empty or blank text is refused (2) unless --allow-empty — `notes/daily/2026-10-06.md`, `notes/inbox.md` (cli.md
  write; cli.test review cycle 3/5)
- --if-unchanged stale sha refused (5); good sha accepted; sha is of the written bytes — `notes/daily/2026-10-06.md`,
  `notes/projects/kestrel-v2-3.md` (cli.md; cli.test)
- A flag the command does not take is refused (write --dry-run, task --dry-run, capture --if-unchanged) —
  `notes/daily/2026-10-06.md`, `work/kestrel/README.md` (cli.test 'flags a command doesn't take are refused')
- Write refused to non-notes and outside the root — `Downloads/photo.PNG`, `notes/templates/drafts/okr-draft.md`,
  `work/kestrel/.slipbox/config.toml` (cli.md; cli.test)
- Atomic write through a symlink keeps the symlink — `.build/extras.toml`, `notes/projects/kestrel-v2-3.md` (cli.md
  Finding and changing ('through a symlink but never outside'))

### stat

- stat gives size, mtime, title, tags, headings, links, unresolved, backlinks, vault, properties —
  `notes/people/aiko-tanaka.md`, `notes/people/jo-becker.md`, `notes/people/lena-okafor.md`,
  `notes/people/malik-haddad.md`, `notes/people/priya-nair.md`, `notes/people/tomas-ruiz.md` (cli.md stat; cli.test
  'stat')
- Readonly and permission edge: unreadable note (chmod 000) reported as a warning in ls/find/search; read exits
  non-zero — `.build/extras.toml` (cli.test review cycle 2)

### render

- render draws a note at --width, plain, with tables, embeds, code, wide chars — `notes/meetings/all-hands-archive.md`,
  `notes/projects/kestrel-v2-3.md`, `work/kestrel/docs/qa/render-torture.md` (cli.md Output contract; cli.test render)
- --json render gives lines\[\] and headings\[{level,text,slug,line}\] — `notes/reading/maps-and-territories.md`,
  `work/kestrel/docs/qa/render-torture.md` (cli.md Stability)

### backlinks

- backlinks excludes self links, carries kind/target/heading/text and how each is written —
  `notes/projects/kestrel-v2-3.md`, `work/kestrel/docs/architecture.md` (cli.md resolve/backlinks; cli.test)

### resolve

- resolve a path, name, heading, block, external, ambiguous, unresolved; with --from gives href —
  `notes/meetings/Meeting: Q3.md`, `work/kestrel/docs/architecture.md` (cli.md resolve; cli.test 'resolve follows
  names')
- pointers as arguments: shown/href, folder, heading; the old name:path form exit 3 with suggest — `notes/index.md`,
  `notes/projects/halden-outreach.md` (cli.md Naming notes (21.10, 21.12); Resolve)

### diagnostics

- diagnostics on a note gives its link problems, headings/blocks missing, conflict markers and lint —
  `notes/daily/2026-09-23.md`, `notes/meetings/2026-09-05-feedback-synthesis.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/reading/the-long-ride.md`, `work/kestrel/docs/release-notes/2.3.md` (cli.md diagnostics; cli.test)
- diagnostics on code files: language servers, linters, tree-sitter syntax errors — `work/kestrel/Dockerfile`,
  `work/kestrel/src/routes/share.ts`, `work/kestrel/tools/uploader/server.go` (cli.md diagnostics (19.22); doctor)

### doctor

- doctor lists servers and linters by language: found, installable from npm, native missing with hint —
  `work/kestrel/Dockerfile`, `work/kestrel/api/kestrel_api/models.py` (cli.md doctor (19.7); cli.test)

### capture

- capture free text appends to scratch after a blank line — `notes/daily/2026-10-06.md`, `notes/inbox.md` (cli.md
  Capture; cli.test 'capture and the scratch')
- --ref path:L, path:L-M, path:L:C-D, path:L:C-M:D forms stored relative to the project — `notes/inbox.md`,
  `work/kestrel/src/sync/queue.ts` (cli.md Reference forms; SKILL)
- --snippet reads referenced lines and fences them with language from extension — `notes/inbox.md`,
  `work/kestrel/api/kestrel_api/sync.py` (cli.md --snippet; skill)
- --stdin and --lang: stdin fenced as code; with --ref stdin is the snippet — `notes/inbox.md`,
  `work/kestrel/patches/tiles-fix.patch` (cli.md --stdin)

### send

- send runs editor.remote with {file} and {line}; --server picks an nvim; several nvims is exit 4 —
  `work/infra/dotfiles/slipbox/config.toml`, `work/kestrel/docs/dev-setup.md` (cli.md send; configuration.md
  \[editor\]; cli.test)

### stale

- Dirty files from a running TUI produce a warning (human) and `stale` (json); dead pids pruned; malformed ignored —
  `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md` (cli.md Semantics; cli.test 'a malformed stale file')

### mv

- mv renames a note and rewrites every link keeping each link's form — `notes/projects/kestrel-v2-3.md`,
  `work/kestrel/docs/architecture.md` (cli.md Renames (17.15); cli.test 'mv, rename-vault, relink')
- mv of a folder moves everything, including files the walk doesn't list, links rewritten from where each linking file
  will be — `.build/kestrel.toml`, `work/product/README.md` (cli.md A folder (18.3); cli.test cp rm trash mv folder)
- mv a nested vault's folder: links into it by path rewritten across vaults, recorded at new place —
  `notes/research/route-engine-spike/README.md`, `work/product/handbook/how-we-write.md` (cli.md A nested vault's
  folder (18.7))

### cp

- cp copies a note/folder, beside as name-copy without a path; onto a file is exit 5 — `.build/kestrel.toml`,
  `notes/templates/meeting.md` (cli.md cp; cli.test 'cp, rm, trash')

### rm

- rm sends to the vault's trash (state, not folder), reports breaking links; --dry-run only says —
  `.build/kestrel.toml`, `notes/research/route-engine-spike/README.md` (cli.md Deleting (18.4); cli.test)

### undo

- undo takes back the last rename/move/vault rename/relink byte for byte; folders made go if empty; refused when files
  changed since — `.build/kestrel.toml`, `work/kestrel/docs/architecture.md` (cli.md Undo (7.4))

### relink

- relink rewrites links broken by a seen move to where the file is; all notes or one — `notes/daily/2026-09-22.md`,
  `notes/projects/q4-okrs.md` (cli.md relink (17.12, 20.17))
- rename-heading renames heading and its links in forms slug vs text vs angle brackets vs own #anchor —
  `notes/reading/maps-and-territories.md`, `work/kestrel/docs/runbooks/sync-queue.md` (cli.md rename-heading (11.9);
  cli.test)
- rename-vault \<name\> renames a vault with .slipbox/ and keeps old name in previous\_names; git vault without
  .slipbox is refused — `hobbies/photography/.slipbox/config.toml`, `notes/.slipbox/config.toml` (cli.md rename-vault;
  configuration.md identity)

### convert-links

- convert-links rewrites wikilinks and root-based markdown links as relative paths with escaping; heading → slug;
  block; pic size — `hobbies/cooking/Home.md`, `hobbies/cooking/Mise en place.md`, `work/product/design/share-flow.md`
  (cli.md convert-links (20.1); cli.test 'convert-links')

### apply

- --plan saves a plan; apply \<id\> writes it; refused (5) if any file changed since; apply alone lists waiting;
  \--dry-run says if stale — `.build/kestrel.toml`, `work/kestrel/docs/architecture.md` (cli.md Plans (20.18))

### init

- init \[dir\] gives a folder .slipbox/: settings; with --name N, a name and an id; --private, --dry-run —
  `Downloads/notes-backup-2026-07/index.md`, `notes/research/route-engine-spike/README.md` (cli.md init (18.11);
  Stability table)
- deinit \<folder\> makes a nested vault a plain folder: .slipbox/ to the parent's trash; refused for git checkouts;
  trash restore remakes it — `notes/research/route-engine-spike/README.md`, `work/product/handbook/how-we-write.md`
  (cli.md A folder made a vault (18.11))

### folders

- folders lists the named folders: name, pointer, remote, id, private, old names, copies (available, found), the one
  links open; folders default \<name\> \<path\> — `Downloads/notes-backup-2026-07/index.md`,
  `notes/.slipbox/config.toml` (cli.md Named folders' words 21.10)

### config

- No config at all: slipbox runs with defaults; SLIPBOX\_CONFIG points to a nonexistent file —
  `work/infra/dotfiles/slipbox/README.md`, `work/infra/dotfiles/slipbox/minimal.toml` (configuration.md)
- Broken config: unparsable TOML, unknown key, wrong type, value outside set, out-of-range numbers, fractions for
  whole, lists with non-strings, empty walk.extensions, mode key table as string: each a warning, key defaults, rest
  applies — `work/infra/dotfiles/slipbox/bad-values.toml`, `work/infra/dotfiles/slipbox/typo.toml` (configuration.md
  'None of these crash it')
- Layering: defaults \< user file \< enclosing vaults' configs broadest first \< the vault's file; info lists files
  that applied in order — `notes/.slipbox/config.toml`, `work/product/design/.slipbox/config.toml` (configuration.md
  layers; cli info)
- \[vault\] table read on its own: id, name, aliases, previous\_names; in the user file ignored with warning —
  `Downloads/notes-backup-2026-07/.slipbox/config.toml`, `notes/.slipbox/config.toml` (configuration.md identity)
- USER\_ONLY keys in a vault file are ignored with a warning: editor.command, editor.remote, lint.command,
  language-server command/args/environment, linter lint-command, unknown servers/linters —
  `work/infra/dotfiles/slipbox/config.toml`, `work/kestrel/.slipbox/config.toml` (configuration.md What only you can
  set; cli.test 'a vault's config can't pick the editor')
- Vault \[keys\]/\[aliases\] naming forbidden commands (app.quit\_force, note.revert, note.save\_force, scratch.clear)
  dropped with a warning; same in user file fine — `work/infra/dotfiles/slipbox/config.toml`,
  `work/kestrel/.slipbox/config.toml` (configuration.md VAULT\_FORBIDDEN\_COMMANDS)
- A config that fails to parse on live reload keeps its last good contents with a warning —
  `work/infra/dotfiles/slipbox/config.toml`, `work/infra/dotfiles/slipbox/typo.toml` (configuration.md 'A typo saved
  mid-edit')
- Every key present once with valid non-default values (a 'kitchen sink' user config) —
  `work/infra/dotfiles/slipbox/config.toml`, `work/infra/dotfiles/slipbox/minimal.toml` (configuration.md Every key)
- \[walk\] extensions, exclude (gitignore syntax over .gitignore), max\_file\_size, files include/exclude/show —
  `notes/.slipbox/config.toml`, `work/kestrel/.gitignore` (configuration.md \[walk\] \[files\]; cli.test txt-vault)
- \[render\] and \[capture\] and \[context\] \[search\] \[git\] settings affect CLI outputs —
  `notes/.slipbox/config.toml`, `work/infra/dotfiles/slipbox/config.toml` (configuration.md; cli.md render)
- Config strings with control/escape characters in values do not leak escapes to stderr or stdout —
  `work/infra/dotfiles/slipbox/bad-values.toml`, `work/kestrel/.slipbox/config.toml` (cli.test 'diagnostics carry no
  escapes')

### colors

- \[colors\] role overrides: string fg, table fg/bg/bold/italic/underline/dim; \[colors.\<theme\>\] only for that
  theme; colour formats #rrggbb, default, 0-255, "12", "ansi:12" — `work/infra/dotfiles/slipbox/bad-values.toml`,
  `work/infra/dotfiles/slipbox/config.toml`, `work/kestrel/docs/qa/theme-showcase.md` (configuration.md Colours)
- render with --color always\|never\|auto and piped stdout; NO\_COLOR; --plain —
  `work/kestrel/docs/qa/render-torture.md`, `work/kestrel/docs/qa/theme-showcase.md` (cli.md Colour)

### output

- --json always prints exactly one object: usage error, help, -V, unknown command, failure —
  `notes/daily/2026-10-06.md`, `notes/research/terminal-escapes-in-logs.md` (cli.md Output contract; cli.test 'errors')
- Exit codes 0,1,2,3,4,5 each triggered with representative commands — `notes/people/contacts.md`,
  `notes/research/terminal-escapes-in-logs.md` (cli.md Exit codes; SKILL table)
- Arguments: too many args is usage error; empty flag values refused; global flags before or after command; `--` ends
  options — `notes/daily/2026-10-06.md`, `work/kestrel/README.md` (cli.md Arguments, Flags)
- Human output sanitizes control characters, C1, bidi in note text, paths, headings, link text; JSON escapes them as
  \\\\uXXXX — `notes/research/terminal-escapes-in-logs.md`, `notes/research/unicode-in-route-names.md` (cli.md Output
  contract; cli.test hostile vault)
- No TTY: `slipbox [path]` and `slipbox open` refuse to start the TUI (exit 2, hint), never paint escapes into a pipe;
  \--json/--help/--version run the CLI; other known flags ignored — `notes/daily/2026-10-06.md`,
  `work/kestrel/README.md` (cli.md No TTY (9.3))

### files

- Data and text files: ls --files groups (data/text) with format; binaries excluded; read/replace/write by path with
  extension; `read cfg/site` without extension exit 3 — `work/kestrel/api/kestrel_api/app.py`,
  `work/kestrel/kestrel.toml` (cli.md Naming notes 5; cli.test files beyond notes)
- mkdir makes folders with parents; existing path or outside vault is exit 5 — `notes/daily/2026-10-06.md`,
  `work/kestrel/README.md` (cli.md mkdir; cli.test mkdir)

### agent

- Agent edits a note while a person has it open with unsaved changes: stale reported, write still goes through, check
  \--if-unchanged — `.build/kestrel.toml`, `notes/daily/2026-10-06.md` (cli.md Semantics; SKILL stale)
- Agent workflow end-to-end: info → ls → search → context → read(sha) → replace --dry-run → replace --if-unchanged →
  task --check → write --append --paragraph → problems — `.build/kestrel.toml`, `notes/daily/2026-10-06.md` (SKILL.md)
- Agent run in a loose single file / plain folder outside any vault — `Downloads/plan.md`, `Downloads/stray-note.md`
  (cli.md Where a command works; SKILL 'single-file mode' (now plain folder 20.22))
- Agent hostile-input resilience: a note containing prompt-injection-like text and escape sequences in context bundle
  and read output — `Downloads/ticket-4711.json`, `notes/inbox.md`, `notes/research/terminal-escapes-in-logs.md`
  (cli.md Output contract)

### skill

- The skill examples each run as written (resolve with --from, search with phrase -draft #project path:notes/,
  footnotes add 12:30, capture printf stdin with --ref notes/a.md:7) — `notes/daily/2026-10-06.md`, `notes/index.md`
  (skills/slipbox/SKILL.md)

### names

- Name shared by several notes: exit 4 with data.candidates; --from picks the nearest; shortest path wins collisions in
  link-less naming — `notes/people/contacts.md`, `notes/research/contacts.md`, `work/product/docs/README.md` (cli.md
  Naming notes; cli.test cycle 5)
- Unicode names and paths: NFC vs NFD file names, emoji, CJK, RTL, spaces, long names — `.build/extras.toml`,
  `Downloads/données.json5`, `notes/research/unicode-in-route-names.md` (cli.md; output sanitization)

### wikilinks

- Wikilinks read by links/resolve/backlinks within their root; `[[vault:note]]` isn't — `hobbies/cooking/Home.md`,
  `notes/research/link-styles.md` (cli.md resolve 'A wikilink resolves within its root' (21.3))

### ls

- ls lists notes with path, title, size, mtime, tags, links; --files adds data/text files — `notes/index.md`,
  `work/kestrel/README.md` (cli.md ls; cli.test)
- Nested vaults and the walk: a nested root's folder is left to itself; the repository's walk skips nested roots —
  `notes/research/route-engine-spike/README.md`, `work/kestrel/README.md` (examples/README.md; cli.md roots)

### mixed

- CLI invoked from different cwds against the same vault produce the same results — `Downloads/stray-note.md`,
  `work/kestrel/README.md` (cli.md Where a command works)
- Large vault performance and limits: 5000 notes, 200 KB and 4 MB notes, 10k links, deep folder nesting (12 levels) —
  `.build/extras.toml`, `notes/reading/bookmarks.md` (cli.test big replace; cli.md Big notes)

### links/forms

- Relative link to a sibling note, with .md — `hobbies/photography/index.md`, `notes/daily/2026-08-17.md` (21.x
  conventions table; 1.4)
- Relative link climbing several levels (../../) staying inside one root —
  `work/kestrel/docs/adr/0001-offline-first-sync.md`, `work/product/handbook/how-we-write.md` (21.x conventions table)
- Relative link that goes ../ out of its root into a sibling repository — `notes/index.md`,
  `notes/projects/halden-outreach.md`, `work/kestrel/docs/dev-setup.md`, `work/product/research/synthesis-2026-09.md`
  (idea 'Between folders' (3); 17.16)
- Relative link out of a root into a plain folder with no marker — `notes/index.md`,
  `work/product/research/synthesis-2026-09.md` (20.x; idea 'The index')
- Leading / resolved from the nearest root (GitHub style) — `hobbies/cycling/202608151900-index.md`,
  `hobbies/cycling/ideas/202410021000-winter-layers.md`, `hobbies/photography/index.md`, `work/infra/README.md`,
  `work/kestrel/CONTRIBUTING.md`, `work/kestrel/README.md`, `work/kestrel/api/README.md`,
  `work/kestrel/docs/adr/0002-route-engine-in-rust.md`, `work/kestrel/docs/architecture.md`, `work/product/README.md`,
  `work/product/prd/route-sharing.md` (21.x conventions; decisions 21.x)
- Leading / with nothing at the root: falls back to the filesystem's path — `Downloads/stray-note.md`,
  `notes/research/link-styles.md`, `work/kestrel/docs/qa/links.md` (21.x conventions table)
- Leading / in a file that has no root at all — `Downloads/plan.md`, `Downloads/stray-note.md` (21.x; 20.2)
- / link in a code or data file keeps meaning the root — `work/kestrel/docs/architecture.md`,
  `work/kestrel/scripts/deploy.sh` (20.x (16.10, 16.15); tests 'a leading / ... the vault's in a code file')
- Extensionless path link resolves to .md — `hobbies/cycling/202608151900-index.md`, `work/product/prd/plan.md` (21.x
  conventions table (plan))
- Extensionless link when a file with that exact name also exists — `work/product/prd/plan`, `work/product/prd/plan.md`
  (21.x ('plan.md when no file is called plan'))
- Extensionless link that matches nothing — `hobbies/cycling/rides/202609061000-gravel-recon.md`,
  `notes/research/link-styles.md` (21.x; 20.x broken-link stays broken)
- \~/ path link read, never written — `notes/daily/2026-09-22.md`, `notes/research/link-styles.md`,
  `work/infra/dotfiles/slipbox/README.md`, `work/kestrel/docs/dev-setup.md` (21.x; test 'relative out of the root, \~/,
  absolute and `file://'`)
- Absolute path link — `notes/research/link-styles.md`, `work/kestrel/docs/qa/links.md` (20.x; test 'backlinks: this
  vault's absolute links')
- `file://` URL link — `notes/research/link-styles.md`, `work/kestrel/docs/qa/links.md` (21.x conventions table; 17.16)
- slipbox://name/path pointer into a named repository (by remote) — `notes/index.md`, `notes/research/link-styles.md`
  (21.7; tests 'followed into another folder', '@branch')
- slipbox:// pointer into a .slipbox/-named folder — `hobbies/cycling/rides/202608301800-kyoto-river-loop.md`,
  `hobbies/photography/.slipbox/config.toml`, `hobbies/photography/gear/lenses.md`,
  `hobbies/photography/trips/京都/index.md`, `notes/index.md`, `notes/projects/kyoto-trip.md` (21.7; e2e 'slipbox://
  pointers')
- slipbox:// pointer with @branch — `notes/research/link-styles.md`, `notes/weekly/2026-W41.md`, `work/kestrel/docs/sync.md`
  (21.7; test '@branch'; e2e 'slipbox:// pointers': the agent's worktree)
- slipbox:// pointer: unnamed root cannot be pointed at — `notes/projects/brevet-300.md`,
  `notes/research/link-styles.md` (21.x 'never a folder's own name')
- Pointer by old name after a folder was renamed — `notes/.slipbox/config.toml`, `notes/research/link-styles.md` (21.x
  'A folder renamed keeps its old name')
- URL-encoded spaces and characters in a markdown link — `notes/projects/kyoto-trip.md`,
  `notes/research/link-styles.md`, `work/kestrel/docs/qa/plan (v2).md` (test 'rename keeps each path link in its form:
  ... encoded')
- Angle-bracket destination with spaces — `notes/research/link-styles.md`, `work/kestrel/docs/qa/links.md` (CommonMark;
  21\.x 'what other tools write')
- Bare space in a destination is not a link — `notes/research/link-styles.md`, `work/kestrel/docs/qa/links.md`
  (CommonMark; 20.x)
- Parentheses and brackets in file names — `Downloads/Q3 budget (final).csv`, `work/kestrel/docs/qa/links.md`,
  `work/kestrel/docs/qa/plan (v2).md`, `work/kestrel/docs/qa/plan [draft].md` (CommonMark balanced parens; hostile
  names)
- Link with a title string — `notes/reading/list.md`, `work/kestrel/docs/qa/links.md` (CommonMark)
- Reference-style links: full, collapsed, shortcut — `notes/reading/list.md`, `work/kestrel/docs/qa/links.md` (test
  'reference links by their d…'; 1.4)
- Autolinks and bare URLs — `Downloads/Re: route sharing feedback.md`, `work/kestrel/docs/qa/links.md` (GFM; 21.x URL
  schemes)
- Images: !\[alt\](path) as a link/embed to files — `hobbies/photography/index.md`,
  `notes/attachments/Scan 2026-09-02.PDF`, `notes/attachments/whiteboard-2026-08-26.png`,
  `work/kestrel/docs/qa/links.md`, `work/product/assets/share-sheet.png` (1.11; graph attachments)
- Link to a directory (`../projects/`, `../`, `/`): resolved, never broken; followed, revealed in the explorer; moved,
  rewritten — `notes/research/link-styles.md`, `work/kestrel/docs/qa/links.md` (21.2)
- Link to a non-markdown file (code, csv, pdf, geojson, image) — `Downloads/receipt-desk-2026-08.pdf`,
  `hobbies/cycling/rides/202609131900-300k-brevet.md`, `hobbies/cycling/routes/300k-lakes-loop.geojson`,
  `hobbies/cycling/routes/300k-lakes-loop.gpx`, `notes/daily/2026-09-12.md` (test 'a data file's links resolve and
  count as backlinks'; 16.x)
- Links inside code spans, fences, HTML comments, and escaped brackets — `notes/research/link-styles.md`,
  `work/kestrel/docs/qa/links.md` (test 'never inside code, never when escaped')
- Links inside table cells with a pipe in the destination or alias — `hobbies/cooking/Meal plan.md`,
  `work/kestrel/docs/qa/links.md` (test 'escaped pipe in a table cell is an alias divider')
- Same target by every form in one note (the all-forms note) — `notes/research/link-styles.md`,
  `work/kestrel/docs/qa/links.md` (21.x 'one model inside'; test 'relative out of the root, \~/, absolute…')
- Case-differing link to a case-sensitive filesystem — `.build/extras.toml`, `work/kestrel/docs/Plan.md` (test 'a
  markdown link in the wrong case resolves…'; 1.4 case policy)
- Links with unusual scripts and long paths — `hobbies/cooking/Recipes/Family/مقلوبة.md`,
  `hobbies/photography/trips/京都/index.md`, `notes/projects/kyoto-trip.md` (width/sanitize rule; 21.x)
- Windows-style backslash and drive paths in links — `notes/research/link-styles.md`, `work/kestrel/docs/qa/links.md`
  (hostile input; broken-link reporting)
- Empty and odd destinations — `notes/research/link-styles.md`, `work/kestrel/docs/qa/links.md` (CommonMark edge cases;
  20\.x)

### links/fragments

- Fragment by heading slug — `work/kestrel/CHANGELOG.md`, `work/kestrel/docs/adr/0001-offline-first-sync.md`,
  `work/product/okrs/2026-q4.md`, `work/product/roadmap/q4.md` (test 'resolve follows a link… with the heading's line';
  2\.x converter slugs)
- Fragment by heading text (percent-encoded, spaces) — `notes/research/link-styles.md`, `work/product/roadmap/q4.md`
  (links 'by text and slug')
- Fragment to a block id ^id — `notes/projects/kestrel-v2-3.md`, `work/kestrel/docs/adr/0003-sharing-links.md` (test 'a
  heading's section, a block by its ^id…'; 1.11)
- Fragment pointing at a missing heading — `notes/meetings/2026-09-05-feedback-synthesis.md`,
  `notes/research/link-styles.md` (test 'every link that reaches nothing')
- Fragments on non-markdown and URL targets — `notes/research/link-styles.md`, `work/kestrel/docs/sync.md` (20.x;
  comment path:line)
- Rename of a heading rewrites fragments in every link form — `notes/research/link-styles.md`,
  `work/kestrel/docs/runbooks/sync-queue.md` (test 'its line and every link to it, in each link's form'; 'refused: no
  such heading, two of its name')

### links/wikilinks

- Wikilink by name — `hobbies/cooking/Home.md`, `hobbies/cooking/Pantry.md` (21.x wikilinks; 1.4; test 'targets,
  headings, blocks, aliases and embeds')
- Wikilink by path suffix — `hobbies/cooking/Home.md`,
  `hobbies/cooking/Recipes/Baking/Sourdough/Starter/Feeding log.md` (1.4 forms; Obsidian vault)
- Wikilink with alias — `hobbies/cooking/Home.md`, `hobbies/cooking/Meal plan.md` (test 'escaped pipe in a table
  cell…')
- Wikilink by frontmatter alias — `hobbies/cooking/Recipes/Family/مقلوبة.md`,
  `notes/meetings/2026-08-20-priya-1on1.md`, `notes/people/priya-nair.md`, `notes/people/tomas-ruiz.md` (21.x 'aliases
  from front matter'; test 'aliases and previous names')
- Wikilink with heading and block — `hobbies/cooking/Recipes/Baking/Sourdough/Starter/Feeding log.md`,
  `hobbies/cooking/Recipes/Weeknight/Dal.md`, `hobbies/cooking/Recipes/Weeknight/Shakshuka.md` (1.11; 21.x)
- Embeds: note, heading, block, image, PDF — `hobbies/cooking/Recipes/Weeknight/Shakshuka.md`,
  `hobbies/cooking/attachments/dal.png` (1.11 embeds; test 'a note in a frame where it's embedded')
- Attachment by name (Obsidian style) — `hobbies/cooking/Archive/attachments/dal.png`, `hobbies/cooking/Pantry.md`,
  `hobbies/cooking/attachments/maqluba-flip.jpg` (21.x 'an attachment by its name'; 1.4 non-markdown targets)
- Ambiguous wikilink names — `hobbies/cooking/Home.md`, `hobbies/cooking/Notes.md`, `hobbies/cooking/Recipes/Notes.md`,
  `work/product/docs/README.md` (test 'collisions: same directory, then deepest shared, then shortest' and 'a genuine
  tie is ambiguous')
- Missing wikilink — `hobbies/cooking/Mise en place.md`, `hobbies/cycling/rides/202609061000-gravel-recon.md` (test 'a
  wikilink resolves to nothing, said why')
- Wikilink in a file with no root — `Downloads/plan.md`, `Downloads/stray-note.md` (21.x 'no root above it: resolves to
  nothing with a hint')
- Wikilink in a markdown-convention root — `work/product/design/components.md`, `work/product/design/share-flow.md`
  (21.x 'wikilinks read within their root')
- Wikilink scope ends at the nested root — `notes/research/route-engine-spike/src/notes.md`,
  `work/product/design/share-flow.md` (0.11 nested roots; 21.x 'one file has one root')
- Old forms aren't links: \[\[vault:note\]\], research:x.md, remembered moves —
  `Downloads/Re: route sharing feedback.md`, `notes/meetings/Meeting: Q3.md` (21.x 'previous names, \[\[vault:note\]\]
  aren't read'; test 'a name with a colon and a space is a note')
- Wikilinks in code fences and escapes — `hobbies/cooking/Mise en place.md`, `notes/research/link-styles.md` (test
  'never inside code, never when escaped')
- Wikilink names and the file-walk — `hobbies/cooking/.trash/Old menu.md`, `hobbies/cooking/Mise en place.md` (0.11;
  20\.8)
- Wikilink extension handling — `hobbies/cooking/Mise en place.md`, `hobbies/cooking/Pantry.md` (1.4 'name.md
  accepted'; walk.extensions)

### links/conventions

- Obsidian root: wikilinks, by name, extension dropped (useMarkdownLinks, newLinkFormat) —
  `hobbies/cooking/.obsidian/app.json`, `work/product/design/.obsidian/app.json` (configuration.md The links'
  convention (21.4); test 'the reference set's conventions')
- zk root: markdown links from the note, without extension (link-format, link-drop-extension) —
  `hobbies/cycling/.zk/config.toml`, `hobbies/cycling/202608151900-index.md`,
  `hobbies/cycling/ideas/202410021000-winter-layers.md` (21.4; test 'the reference set's conventions')
- Markdown-convention root (plain git repo): relative paths with extension — `work/kestrel/CONTRIBUTING.md`,
  `work/kestrel/README.md`, `work/product/README.md` (21.x; test 'a git checkout's top is a vault…')
- Convention from the user's setting beats the root's tool — `work/product/design/.slipbox/config.toml`,
  `work/product/design/share-flow.md` (21.4 'which convention a file writes in'; e2e 'each root's convention')
- Convention inferred by two-thirds dominance, in a root with no tool — `work/kestrel/README.md`,
  `work/product/handbook/how-we-write.md` (21.4 'two-thirds or more'; test 'each part the first that says')
- A root mixing forms with no dominant form — `work/product/design/share-flow.md` (21.x 'A root mixing forms')
- A folder with no root: user's setting else ours — `Downloads/plan.md`, `Downloads/stray-note.md` (21.x 'A folder with
  no root')
- One convention per root across notes — `hobbies/cycling/202608151900-index.md`,
  `work/product/handbook/how-we-write.md` (21.x 'One convention per root')
- Rename keeps each link's form — `notes/projects/kestrel-v2-3.md`, `notes/research/link-styles.md` (test 'a note's
  rename rewrites every link form, keeps how each was written'; 'a rename keeps each path link in its form')
- convert-links preview and apply — `notes/research/link-styles.md`, `work/product/design/share-flow.md` (test 'each
  form: relative to the note, text kept, headings as checked slugs…'; 'a link several notes answer to')
- slipbox info reports the convention and its source — `hobbies/cooking/Home.md`,
  `hobbies/cycling/202608151900-index.md` (cli.md The links' convention (21.4); the Info view's Links section)
- Completion/picker writes the convention's link — `hobbies/cooking/Home.md`, `hobbies/cycling/202608151900-index.md`
  (21.5; tests 'links completed in the root's convention', 'the link picker'; slipbox link)

### links/roots

- Root: nearest .git above the file — `.build/kestrel.toml`, `work/infra/README.md`, `work/kestrel/README.md`,
  `work/product/README.md` (test 'a git checkout's top is a vault by itself')
- Root: .slipbox/ marker, named and unnamed — `hobbies/photography/.slipbox/config.toml`, `notes/.slipbox/config.toml`,
  `work/kestrel/.slipbox/config.toml`, `work/product/handbook/.slipbox/config.toml` (test 'nearest .slipbox/ wins,
  walking up from a file')
- Root: .obsidian/ and .zk/ markers — `hobbies/cooking/.obsidian/app.json`, `hobbies/cycling/.zk/config.toml` (test 'an
  Obsidian vault and a zk notebook are roots')
- Several markers in one folder make one root — `notes/research/route-engine-spike/.slipbox/config.toml`,
  `work/product/design/.obsidian/app.json`, `work/product/design/.slipbox/config.toml` (test 'several markers in one
  folder make one root')
- Nested roots are boundaries — `notes/research/route-engine-spike/README.md`, `work/product/handbook/how-we-write.md`
  (0.11; test 'a repository inside a vault is a vault of its own')
- A repository inside a notes folder (notes is .slipbox, project clone inside it) — `.build/extras.toml`,
  `notes/research/route-engine-spike/README.md` (0.11; 21.x travel together 'outside git, one folder inside the other')
- A plain folder with no marker — `Downloads/plan.md`, `Downloads/stray-note.md` (test 'a folder with no .slipbox or
  repository above it is walked as a vault is')
- \$HOME and / are never roots — `Downloads/stray-note.md`, `notes/index.md` (test '\$HOME and / are never a root,
  whatever they hold')
- root\_markers configurable — `work/infra/dotfiles/slipbox/config.toml`, `work/kestrel/.slipbox/config.toml` (test
  'root\_markers in your config decide what a root is')
- --root override — `work/kestrel/README.md`, `work/kestrel/docs/qa/links.md` (test '--root names a vault: it takes
  precedence, and must be one')
- Opening a subfolder indexes the whole root — `hobbies/cooking/Recipes/Baking/Sourdough/Starter/Feeding log.md`,
  `work/kestrel/README.md` (21.x Roots 'opening any file or folder inside a root indexes the root')
- Submodule-like layout — `.build/extras.toml`, `work/kestrel/.gitmodules`, `work/kestrel/README.md` (21.x 'a
  repository and a submodule it records')
- Monorepo with several .slipbox/ or .obsidian in subfolders — `work/product/design/.obsidian/app.json`,
  `work/product/handbook/.slipbox/config.toml` (21.x; 0.11 boundaries)
- Marker as a file vs directory vs symlink — `.build/extras.toml`, `notes/research/route-engine-spike/README.md` (0.11
  hostile reads; 17.17)
- File reached through a symlinked path has one root — `.build/extras.toml`, `notes/projects/kestrel-v2-3.md` (21.x
  'one file has one root, however it's opened')
- Root detection in a worktree and a worktree of a nested repo — `.build/kestrel.toml`, `work/kestrel/README.md` (17.19
  / test 'read from .git: the main checkout, a worktree')
- Root via git checkout where .git is gitdir-pointing to a bare repo — `.build/extras.toml` (17.19 'never a git
  process')

### links/travel

- Two files in one repository travel together — `work/kestrel/README.md`, `work/kestrel/docs/architecture.md` (21.x
  Between folders (1))
- Repository and a submodule it records travel together — `work/kestrel/.gitmodules`, `work/kestrel/README.md` (21.x
  (1))
- Outside git, one folder inside another travels together — `notes/index.md`,
  `notes/research/route-engine-spike/src/notes.md` (21.x (1))
- Two separate repos do not travel together: pointer used — `notes/index.md`, `work/product/prd/route-sharing.md` (21.x
  (2))
- Relative link between folders that don't travel together read as is, with relink offer — `notes/daily/2026-09-29.md`,
  `work/product/research/synthesis-2026-09.md` (21.x 'Relative links between folders…read as they are; relink offers')
- Relative link to an unnamed root stays relative — `hobbies/cooking/Home.md`, `notes/index.md`,
  `notes/projects/brevet-300.md` (21.x 'unnamed: linked by relative path')

### links/named-folders

- Repo named by remote: short name — `.build/infra.toml`, `.build/kestrel.toml`, `.build/product.toml` (21.6; test 'a
  name travels with what it names'; e2e 'named folders')
- Two different repos sharing a short name: qualified name — `.build/product.toml`, `notes/research/link-styles.md`
  (21.6; test 'different folders of one name: repositories by their qualified names')
- Copies of one repository: default copy — `.build/kestrel.toml`, `notes/research/route-engine-spike/README.md` (21.6;
  test 'the lookup: the first copy found is the default')
- Different repositories with different remotes, same folder name — `.build/product.toml` (21.x copies table)
- Copies of one .slipbox/ folder vs different .slipbox/ folders of one name —
  `Downloads/notes-backup-2026-07/.slipbox/config.toml`, `Downloads/notes-backup-2026-07/index.md` (21.6; test 'a
  second copy of a folder opened'; e2e 'named folders')
- A .slipbox name overrides the repository's remote name — `notes/research/route-engine-spike/.slipbox/config.toml`,
  `notes/research/route-engine-spike/README.md` (21.6; test 'a name travels with what it names')
- Private .slipbox (--private) names — `.build/infra.toml` (21.6 'A name for one copy only'; tests 'init --private keeps
  .slipbox/ out of git', 'a name travels with what it names')
- Renamed folder keeps its old name — `notes/.slipbox/config.toml`, `notes/research/link-styles.md` (21.6; test
  'different folders of one name… old names still find')
- slipbox folders listing and default — `.build/product.toml`, `notes/.slipbox/config.toml` (21.x Words and commands)
- Pointer to a name not on this machine — `notes/index.md`, `notes/research/link-styles.md` (21.7 'isn't on this
  machine yet'; test 'a pointer followed'; e2e 'slipbox:// pointers')
- Named folder moved by hand takes its state along — `Downloads/notes-backup-2026-07/index.md` (21.x 'A named folder
  moved by hand')
- slipbox resolve of a pointer — `notes/index.md`, `notes/research/link-styles.md` (21.7 Agents; test 'the CLI
  resolves one')
- Old-form folder references flagged — `Downloads/stray-note.md`, `notes/research/link-styles.md` (21.x 'A link naming
  a folder the old way')

### links/git

- Branch moves a doc, another branch links to it — `.build/kestrel.toml`, `.build/product.toml`,
  `work/kestrel/docs/adr/0004-retry-budget.md`, `work/kestrel/docs/sync.md`, `work/product/prd/route-sharing.md` (idea
  'Before a merge'; test 'merging a branch here: each link its result breaks')
- Branch that renames a doc and updates its links cleanly — `.build/kestrel.toml`, `work/kestrel/docs/glossary.md`
  (test 'merging a branch here')
- Conflicting branch (merge conflict markers in a note) — `.build/kestrel.toml`,
  `work/kestrel/docs/release-notes/2.3.md` (test 'a merge's conflicts are problems: each file, at its first marker';
  status 'conflicts')
- Merge-base review: new link added on main, deleted target on branch — `.build/kestrel.toml`, `.build/product.toml`,
  `work/kestrel/docs/adr/0004-retry-budget.md`, `work/kestrel/docs/legacy.md`, `work/kestrel/legacy/route_import.rb`,
  `work/product/README.md`, `work/product/roadmap/2027-themes.md` (idea 'Before a merge'; test '--into')
- After a merge: renames between old and new HEAD are evidence — `.build/infra.toml`, `.build/kestrel.toml`,
  `notes/daily/2026-09-22.md`, `notes/projects/q4-okrs.md`, `work/infra/k8s/workers/sync-worker.yaml`,
  `work/product/okrs/2026-q4.md` (test 'after a merge or a pull: git's renames are evidence')
- Branch switch is not a merge — `.build/kestrel.toml`, `work/kestrel/docs/sync.md` (5.9; test 'a branch switch isn't a
  merge'; 'the index written on another branch')
- Detached HEAD — `.build/kestrel.toml` (5.9, status line shows branch; slipbox://x@branch)
- Worktree: same repo, its own state by its path — `.build/kestrel.toml`, `notes/weekly/2026-W41.md`,
  `work/kestrel/src/sync/retry.ts` (17.19; test 'a worktree without .slipbox/…'; 'links: x:path from elsewhere means
  the main checkout')
- Pointer @branch with a worktree on it vs not — `.build/kestrel.toml`, `work/kestrel/docs/sync.md` (21.x 'A branch')
- Merges producing renames: a note renamed in the merge, links broken — `.build/kestrel.toml`,
  `work/kestrel/docs/features/route-sharing.md` (idea 'After a merge')
- Git status marks in the explorer — `.build/infra.toml`, `.build/kestrel.toml`, `notes/daily/2026-09-29.md` (test
  'git's status read: new, modified, renamed…, deleted, a merge's conflicts'; 5.11)
- Changed/diff vs the merge base — `.build/kestrel.toml`, `work/kestrel/docs/sync.md` (test 'changed, diff, worktrees';
  5\.11)
- Repository appearing while watched — `.build/infra.toml`, `.build/kestrel.toml` (test 'a repository appearing while
  it's watched')
- Git-tracked but ignored by walk (gitignored tracked file) — `work/kestrel/.gitignore`,
  `work/kestrel/docs/generated/api.md` (0.11 .gitignore semantics)
- Repository with LFS pointers, shallow clone, sparse checkout — `work/kestrel/assets/demo-ride.mp4` (5.11 merge base;
  0\.11 size cap)
- Outside git: merge review exits 3 — `.build/kestrel.toml`, `hobbies/photography/.slipbox/config.toml` (test 'outside
  git: exit 3')

### links/index

- Gitignored file reached by a link is indexed — `.build/extras.toml`, `work/kestrel/api/README.md`,
  `work/kestrel/docs/generated/api.md` (0.11 reached then indexed; test 'git-ignored and hidden files a link points at
  are indexed')
- Reached files not watched; read again at next build — `.build/extras.toml` (0.11)
- Never reached: .git, .slipbox, node\_modules, walk.exclude, another root — `notes/templates/drafts/okr-draft.md`,
  `work/kestrel/.gitignore` (0.11; test 'finds the vaults in it… never in hidden folders or node\_modules')
- Plain folder reaches nothing beyond listing — `Downloads/plan.md`, `Downloads/stray-note.md` (0.11 'A loose folder is
  listed, not indexed, and reaches nothing')
- Size cap (walk.max\_file\_size, default 4 MiB) — `.build/extras.toml`, `Downloads/routes-export.min.json` (0.11; \$)
- Unreadable files and directories — `.build/extras.toml` (0.11 errors never abort)
- Symlinks: file inside root — `.build/extras.toml`, `notes/projects/kestrel-v2-3.md` (0.11 symlinks; test 'symlinks: a
  duplicate of a walked note no, outside no, directories never followed')
- Symlinks pointing outside the root — `.build/extras.toml`, `notes/research/link-styles.md` (0.11 skipped and reported
  (7.5))
- Symlinked directories are never followed; loops — `.build/extras.toml` (0.11)
- Symlink to FIFO, /dev/zero, devices — `.build/extras.toml` (test 'a symlinked FIFO is skipped; device symlinks for
  .gitignore, config and version are refused')
- Hostile file names — `.build/extras.toml`, `Downloads/Re: route sharing feedback.md` (width.ts sanitize rule; test
  'strips CSI, OSC and bare controls'; 'render never leaks escapes')
- Encodings: CRLF, BOM, invalid UTF-8, no trailing newline, Latin-1, UTF-16 — `Downloads/utf16-notes.txt`,
  `notes/daily/2026-09-16.md`, `notes/daily/2026-09-18.md` (test 'encodings: CRLF, BOM, invalid UTF-8 and no trailing
  newline all parse'; 0.11)
- Extensions: .md, .markdown, case variants, others — `Downloads/README.MD`, `Downloads/invoice-template.markdown`,
  `Downloads/notes.mdown` (0.11 extensions; walk.extensions)
- Unplugged drive / unavailable root — `.build/extras.toml`, `notes/projects/halden-outreach.md` (test 'a drive
  unplugged: its vaults unavailable, not gone'; idea 'The index')
- Freshness: stale index versus files edited outside — `.build/extras.toml` (idea 'Freshness is checked'; test 'slipbox
  index --refresh \<path\>')
- Index version / cache damaged — `.build/extras.toml` (test 'an index of another version, or one SQLite can't read';
  'the key is the text's hash')
- Watcher limits and polling — `.build/extras.toml` (test 'degraded (the watch limit hit)'; 'a folder that can't be
  watched is polled')
- Background index of \$HOME — `Downloads/notes-backup-2026-07/index.md`, `notes/index.md` (test 'finds the vaults in
  it…'; 'its place is kept'; idea 'The index')
- Large wide structure: many files / deep nesting — `.build/extras.toml`,
  `hobbies/cooking/Recipes/Baking/Sourdough/Starter/Feeding log.md` (0.11 walk; performance)
- Hidden folders and dotfiles — `hobbies/cooking/.trash/Old menu.md`, `work/kestrel/.gitignore` (0.11 'every entry
  whose name starts with a dot')
- node\_modules and vendor trees — `.build/extras.toml`, `work/kestrel/.gitignore` (0.11)
- walk.exclude patterns — `notes/.slipbox/config.toml`, `notes/templates/drafts/okr-draft.md` (0.11)

### links/moves

- A note moved outside the app (mv) — `work/kestrel/docs/runbooks/sync-queue.md`, `work/product/okrs/2026-q4.md` (test
  'a note moved outside slipbox (mv) is found again: its path links are broken, and the relink knows where it went')
- Watcher: removal and arrival pair as a move — `work/kestrel/scripts/dev/agent-replay.sh` (test 'the watcher's removal
  and arrival pair into a move, in either order')
- A git rename as evidence versus a content hash — `.build/kestrel.toml`, `work/kestrel/docs/runbooks/sync-queue.md`
  (idea 'Changes and repairs')
- A named folder renamed or moved on disk: pointers survive, relative ones break — `notes/index.md`,
  `work/kestrel/docs/architecture.md` (21.7 'A named folder moved or renamed on disk'; tests 'a rename keeps it a
  pointer', 'the relink offers a pointer')
- Moves must not resolve quietly — `notes/daily/2026-09-22.md`, `work/kestrel/docs/architecture.md` (20.x 'stays one
  until it's repaired')
- Plans: stale, refused, undo, apply — `notes/projects/kestrel-v2-3.md`, `work/kestrel/docs/architecture.md` (test
  'refused: an existing target, outside the vault, a file changed since the preview'; 'a stale plan is never applied';
  'a note's rename taken back…')
- Rename rewrites from backlinks including other roots, data files and code comments —
  `work/kestrel/docs/architecture.md` (test 'a note moved: every file linking in — a note, a reached one, a data file's
  value, a code comment')
- Folder/vault moved: relink out and in — `notes/projects/halden-outreach.md`, `work/kestrel/docs/architecture.md`
  (test 'a vault moved: relink fixes its links out by a path'; 'links between notes that move together stay')

### links/backlinks

- Backlinks across roots — `notes/index.md`, `notes/people/lena-okafor.md`, `notes/projects/halden-outreach.md`,
  `work/infra/k8s/workers/sync-worker.yaml`, `work/kestrel/docs/architecture.md`, `work/product/roadmap/q4.md` (test
  'backlinks: this vault's absolute links, and another vault's path links in every form'; 'backlinks come from other
  vaults' indexes too')
- Backlinks from code comments and data files — `hobbies/cycling/routes/300k-lakes-loop.geojson`,
  `work/kestrel/config/base.yaml` (test 'a comment's paths that name vault files, `path:line` and URLs are links and
  backlinks; a string's aren't')
- Backlinks for a file the target reached by symlink — `.build/extras.toml`, `notes/projects/kestrel-v2-3.md` (0.11
  symlinks)
- Backlinks via an embed and an image — `notes/attachments/whiteboard-2026-08-26.png`,
  `notes/meetings/2026-08-26-route-sharing-design-review.md` (1.11 'an embed is a link already')
- Link records start and end columns in UTF-16 units — `hobbies/cooking/Recipes/Family/مقلوبة.md`,
  `notes/research/unicode-in-route-names.md` (test 'a link records its end as well as its start')
- Files in lists shown by path: from root, else folder opened, else \~/, else absolute — `notes/index.md`,
  `work/kestrel/docs/architecture.md` (21.x 'Files in lists')

### links/search

- Search scope here / linked / all — `notes/projects/halden-outreach.md`, `notes/research/offline-sync-options.md`
  (21.x Search; test 'slipbox search --scope'; 'a scope's vaults: linked…')
- Search engines: scan versus FTS index — `notes/reading/list.md`, `notes/research/offline-sync-options.md` (test 'the
  scan answers the same query the same way'; 6.1)
- Search ranks the title first, section opens at most words — `notes/reading/list.md`,
  `notes/research/offline-sync-options.md` (test 'ranked by the index'; 'a hit opens at the section with most of them')
- Search in a worktree and a copy — `.build/kestrel.toml` (17.19; 21.x copies)

### links/state

- Personal state keyed by root, else the folder opened — `Downloads/stray-note.md`,
  `hobbies/photography/.slipbox/config.toml`, `work/infra/README.md` (21.x 'Personal state'; test 'a plain folder keeps
  its own positions and session')
- Durable lookup survives and handles missing/hand-edited lists — `.build/extras.toml` (test 'a list that can't be
  written: the path's key'; 'a plain folder's entry at a vault's path'; 21.6 'gone copies stay listed')
- Settings: nearest .slipbox/config.toml, then outer, then user's; programs only from user config —
  `notes/.slipbox/config.toml`, `work/product/design/.slipbox/config.toml` (test 'a vault inside another: its own
  settings, then the outer one's, then yours; a program named in a vault's never runs')
- slipbox init / name / deinit lifecycle — `notes/.slipbox/config.toml`, `work/product/handbook/.slipbox/config.toml`
  (test 'init creates the marker…'; 'deinit takes .slipbox/ away only where it's the only marker'; 'names: a vault
  inside…')
- Info output (root, name, convention, freshness, copies) — `hobbies/photography/.slipbox/config.toml`,
  `work/kestrel/README.md` (21.x Words and commands; test 'info lists the five copies seen last')

### links/misc

- Broken links list: every link that reaches nothing with where and how written — `notes/research/link-styles.md`,
  `work/kestrel/docs/qa/links.md` (test 'every link that reaches nothing — with where and how written')
- Source versus rendered display of each form — `notes/research/link-styles.md`, `work/kestrel/docs/qa/links.md` (21.x
  'What's shown' (the screen shows what the file says))
- Context bundle breadth-first through links and backlinks — `notes/index.md`, `notes/projects/kestrel-v2-3.md` (test
  'breadth first: the note, what it links to in the order written, then what links to it'; 'deeper, none, no backlinks,
  a limit')
- Tags/frontmatter/aliases interplay with links — `notes/people/priya-nair.md`, `notes/people/tomas-ruiz.md` (test
  'sections at headings, its frontmatter's title, aliases and tags'; 'previous\_names is spliced into the frontmatter')
- Capture and scratch locations — `hobbies/photography/.slipbox/config.toml`, `notes/inbox.md` (test 'capture.file must
  stay inside the project'; 'capture, scratch show/path/clear')
- Footnotes, HTML anchors and heading-id attributes as link targets — `notes/reading/maps-and-territories.md`,
  `work/kestrel/docs/adr/0001-offline-first-sync.md` (3.18; fragments)
- Case-insensitive filesystem collisions (macOS-like) — `.build/extras.toml`, `work/kestrel/docs/Plan.md` (0.11
  core.ignorecase; 1.4)
- Links to the root itself and parent directories — `notes/research/link-styles.md`, `work/kestrel/docs/qa/links.md`
  (21.x; \$HOME never a root)
- Whole sample as the user's home — `.build/extras.toml`, `notes/index.md` (examples/home/README.md; build script)

## Commands

Every command (`src/core/command-specs.ts`) and the files it's best tried on: the area's material — a long note
for moving and paging, related notes for windows and tabs, footnoted reading for footnotes, code for its servers.
Commands that need nothing in particular are tried on any note; the files named are where they say the most.

### cursor

A long note: headings, paragraphs, pages to move through; the daily note has the f/t targets.

- `cursor.left` — Cursor left — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md` (command-specs.ts)
- `cursor.right` — Cursor right — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md` (command-specs.ts)
- `cursor.up` — Cursor up — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md` (command-specs.ts)
- `cursor.down` — Cursor down — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md` (command-specs.ts)
- `cursor.word_prev` — Previous word — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.word_next` — Next word — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md` (command-specs.ts)
- `cursor.word_end` — End of word — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.line_start` — Start of row — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.line_end` — End of row — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md` (command-specs.ts)
- `cursor.first_nonblank` — First non-blank of row — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.top` — Top of note — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md` (command-specs.ts)
- `cursor.bottom` — Bottom of note — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.heading_prev` — Previous heading — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.heading_next` — Next heading — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.paragraph_prev` — Previous paragraph — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.paragraph_next` — Next paragraph — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.find_char` — To a character on the line — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.find_repeat` — Repeat f / t — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.half_down` — Half page down — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.half_up` — Half page up — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.page_down` — Page down — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md` (command-specs.ts)
- `cursor.page_up` — Page up — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md` (command-specs.ts)
- `cursor.screen_top` — Top of the screen — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.screen_middle` — Middle of the screen — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.screen_bottom` — Bottom of the screen — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `cursor.match_bracket` — To the matching bracket — `work/kestrel/src/sync/queue.ts`,
  `work/kestrel/api/kestrel_api/sync.py` (command-specs.ts)
- `cursor.goto_line` — Go to line — `notes/meetings/all-hands-archive.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)

### scroll

- `scroll.center` — Cursor's line to the middle — `notes/meetings/all-hands-archive.md` (command-specs.ts)
- `scroll.top` — Cursor's line to the top — `notes/meetings/all-hands-archive.md` (command-specs.ts)
- `scroll.bottom` — Cursor's line to the bottom — `notes/meetings/all-hands-archive.md` (command-specs.ts)

### visual

- `visual.char` — Visual mode (characters) — `notes/daily/2026-09-22.md`, `notes/projects/kestrel-v2-3.md`
  (command-specs.ts)
- `visual.line` — Visual mode (rows) — `notes/daily/2026-09-22.md`, `notes/projects/kestrel-v2-3.md` (command-specs.ts)
- `visual.swap` — Swap selection ends — `notes/daily/2026-09-22.md`, `notes/projects/kestrel-v2-3.md` (command-specs.ts)
- `visual.yank` — Copy selection and leave visual mode — `notes/daily/2026-09-22.md`, `notes/projects/kestrel-v2-3.md`
  (command-specs.ts)
- `visual.exit` — Leave visual mode — `notes/daily/2026-09-22.md`, `notes/projects/kestrel-v2-3.md` (command-specs.ts)
- `visual.delete` — Delete the selection — `notes/daily/2026-09-22.md`, `notes/projects/kestrel-v2-3.md`
  (command-specs.ts)
- `visual.change` — Change the selection — `notes/daily/2026-09-22.md`, `notes/projects/kestrel-v2-3.md`
  (command-specs.ts)
- `visual.indent` — Indent the selection — `notes/daily/2026-09-22.md`, `notes/projects/kestrel-v2-3.md`
  (command-specs.ts)
- `visual.outdent` — Outdent the selection — `notes/daily/2026-09-22.md`, `notes/projects/kestrel-v2-3.md`
  (command-specs.ts)
- `visual.comment` — Comment or uncomment the selection — `work/kestrel/src/sync/queue.ts`, `notes/inbox.md`
  (command-specs.ts)

### app

- `app.escape` — Cancel: selection, find highlights — `notes/index.md` (command-specs.ts)
- `app.save_quit` — Save and quit — `notes/index.md` (command-specs.ts)
- `app.quit_force` — Quit without saving — `notes/index.md` (command-specs.ts)
- `app.quit` — Quit — `notes/index.md` (command-specs.ts)

### copy

- `copy.smart` — Copy selection or cursor row — `work/kestrel/api/kestrel_api/sync.py`, `notes/daily/2026-09-22.md`
  (command-specs.ts)
- `copy.selection` — Copy selection — `work/kestrel/api/kestrel_api/sync.py`, `notes/daily/2026-09-22.md`
  (command-specs.ts)
- `copy.path` — Copy note path — `work/kestrel/api/kestrel_api/sync.py`, `notes/daily/2026-09-22.md` (command-specs.ts)
- `copy.ref` — Copy path:line of cursor row — `work/kestrel/api/kestrel_api/sync.py`, `notes/daily/2026-09-22.md`
  (command-specs.ts)
- `copy.link` — Copy link target — `work/kestrel/api/kestrel_api/sync.py`, `notes/daily/2026-09-22.md`
  (command-specs.ts)

### link

- `link.next` — Next link — `notes/research/link-styles.md`, `notes/projects/route-sharing.md` (command-specs.ts)
- `link.prev` — Previous link — `notes/research/link-styles.md`, `notes/projects/route-sharing.md` (command-specs.ts)
- `link.follow` — Follow link — `notes/research/link-styles.md`, `notes/projects/route-sharing.md` (command-specs.ts)
- `link.follow_tab` — Follow link into a new tab — `notes/research/link-styles.md`, `notes/projects/route-sharing.md`
- `link.follow_split` — Follow link into the split — `notes/research/link-styles.md`, `notes/projects/route-sharing.md`
  (command-specs.ts)
- `link.insert` — Insert a link to a note… — `hobbies/cooking/Home.md`, `hobbies/cycling/202608151900-index.md`
  (command-specs.ts; 21.5)

### spell

- `spell.next` — Next misspelt word — `notes/reading/okuma-notlari.md`, `notes/reading/maps-and-territories.md`
  (command-specs.ts)
- `spell.prev` — Previous misspelt word — `notes/reading/okuma-notlari.md`, `notes/reading/maps-and-territories.md`
  (command-specs.ts)
- `spell.suggest` — Spelling suggestions — `notes/reading/okuma-notlari.md`, `notes/reading/maps-and-territories.md`
  (command-specs.ts)
- `spell.add` — Add the word to your words — `notes/reading/okuma-notlari.md`,
  `notes/reading/maps-and-territories.md` (command-specs.ts)
- `folders.open` — Folders: go into a named one — `notes/.slipbox/config.toml`, `work/product/README.md`
  (command-specs.ts; 21.10)
- `folders.default` — Which copy a folder's links open — `notes/.slipbox/config.toml`,
  `Downloads/notes-backup-2026-07/.slipbox/config.toml` (command-specs.ts; 21.10)
- `folder.name` — Name this folder, as pointers name it — `hobbies/photography/.slipbox/config.toml`,
  `work/product/README.md` (command-specs.ts; 21.10)
- `root.trust` — Trust this root — `work/kestrel/eslint.config.js`, `work/kestrel/.vscode/settings.json`
  (kestrel's ESLint and its .vscode settings run only once it's trusted; command-specs.ts, 23.x)
- `root.untrust` — Stop trusting this root — `work/kestrel/src/sync/retry.ts`,
  `work/infra/dotfiles/slipbox/config.toml` (its [trust] roots, which a config's trust wins over; 23.x)
- `link.relink` — Relink after moves and renamed folders — `notes/research/link-styles.md`,
  `notes/projects/route-sharing.md` (command-specs.ts)
- `link.convert` — Convert links to plain paths — `notes/research/link-styles.md`, `notes/projects/route-sharing.md`
  (command-specs.ts)

### links

- `links.open` — Links from this note — `notes/projects/sync-rewrite.md`, `notes/research/link-styles.md`
  (command-specs.ts)

### backlinks

- `backlinks.open` — Backlinks: notes linking here — `notes/projects/sync-rewrite.md`, `notes/projects/route-sharing.md`
  (command-specs.ts)

### lsp

Code with definitions, references and the errors its servers report.

- `lsp.hover` — What's under the cursor — `work/kestrel/src/sync/queue.ts`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `lsp.definition` — Go to the definition — `work/kestrel/src/sync/queue.ts`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `lsp.references` — References — `work/kestrel/src/sync/queue.ts`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `lsp.type_definition` — Go to the type's definition — `work/kestrel/src/sync/queue.ts`,
  `work/kestrel/tools/geodesic/geodesic.cpp` (command-specs.ts; 19.13)
- `lsp.implementation` — Go to the implementations — `work/kestrel/src/sync/queue.ts`,
  `work/kestrel/tools/geodesic/geodesic.hpp` (command-specs.ts; 19.13)
- `lsp.rename` — Rename the symbol — `work/kestrel/src/sync/queue.ts`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `lsp.code_action` — Code actions — `work/kestrel/src/sync/queue.ts`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `lsp.format` — Format the file — `work/kestrel/src/sync/queue.ts`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)

### change

- `change.prev` — Older change — `notes/projects/kestrel-v2-3.md`, `notes/daily/2026-10-06.md` (command-specs.ts)
- `change.next` — Newer change — `notes/projects/kestrel-v2-3.md`, `notes/daily/2026-10-06.md` (command-specs.ts)

### edit

Notes being written today: lists, tasks, tables, quotes, code to change.

- `edit.move_line_up` — Move line up — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.move_line_down` — Move line down — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.insert_last` — Insert where you last did — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.insert` — Insert before the cursor — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.append` — Append after the cursor — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.insert_line_start` — Insert at the line's start — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.append_line_end` — Append at the line's end — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.open_below` — Open a line below — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.open_above` — Open a line above — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.delete_char` — Delete the character — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.op_delete` — Delete (operator) — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.op_change` — Change (operator) — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.op_yank` — Yank (operator) — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.op_indent` — Indent (operator) — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.op_outdent` — Outdent (operator) — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.op_comment` — Comment or uncomment (operator) — `work/kestrel/src/sync/queue.ts`,
  `work/kestrel/api/kestrel_api/sync.py`, `notes/inbox.md` (command-specs.ts)
- `edit.comment_line` — Comment or uncomment the line — `work/kestrel/tools/greeter/greeter.go`,
  `work/kestrel/kestrel.toml` (command-specs.ts)
- `edit.delete_to_end` — Delete to the line's end — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.change_to_end` — Change to the line's end — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.substitute` — Substitute the character — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.substitute_line` — Substitute the line — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.replace_char` — Replace the character — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.join` — Join lines — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `edit.paste_after` — Put after — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.paste_before` — Put before — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.cut` — Cut — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `edit.paste` — Paste — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `edit.toggle_case` — Toggle case — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.repeat` — Repeat the last change — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`,
  `notes/daily/2026-10-05.md` (command-specs.ts)
- `edit.undo` — Undo — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)
- `edit.redo` — Redo — `notes/daily/2026-10-06.md`, `notes/projects/kestrel-v2-3.md`, `notes/daily/2026-10-05.md`
  (command-specs.ts)

### history

- `history.back` — Back — `notes/daily/2026-10-06.md`, `notes/index.md` (command-specs.ts)
- `history.forward` — Forward — `notes/daily/2026-10-06.md`, `notes/index.md` (command-specs.ts)
- `history.list` — History — `notes/daily/2026-10-06.md`, `notes/index.md` (command-specs.ts)

### window

Three notes that belong side by side: the plan, its PRD, the architecture they rest on.

- `window.split_side` — Split side by side — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.split_stacked` — Split stacked — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.focus_left` — Focus left — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.focus_down` — Focus down — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.focus_up` — Focus up — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.focus_right` — Focus right — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.other` — Other window — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.move_left` — Move window left — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.move_down` — Move window down — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.move_up` — Move window up — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.move_right` — Move window right — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.swap` — Swap windows — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.close` — Close window — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.close_or_quit` — Close window, quit on the last — `notes/projects/route-sharing.md`,
  `work/product/prd/route-sharing.md`, `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.only` — Keep only this window — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.resize_mode` — Resize mode — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.equalize` — Equal window sizes — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.wider` — Wider — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.narrower` — Narrower — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.taller` — Taller — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)
- `window.shorter` — Shorter — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `work/kestrel/docs/architecture.md` (command-specs.ts)

### breadcrumb

- `breadcrumb.path` — Heading path — `notes/meetings/all-hands-archive.md`, `work/kestrel/config/app.toml`
  (command-specs.ts)

### tab

The same notes, one per tab.

- `tab.new` — New tab with this note — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `notes/index.md` (command-specs.ts)
- `tab.list` — Tabs — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`, `notes/index.md`
  (command-specs.ts)
- `tab.next` — Next tab — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`, `notes/index.md`
  (command-specs.ts)
- `tab.prev` — Previous tab — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`, `notes/index.md`
  (command-specs.ts)
- `tab.goto` — Go to tab N — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`, `notes/index.md`
  (command-specs.ts)
- `tab.move_left` — Move tab left — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `notes/index.md` (command-specs.ts)
- `tab.move_right` — Move tab right — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `notes/index.md` (command-specs.ts)
- `tab.close` — Close tab — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`, `notes/index.md`
  (command-specs.ts)
- `tab.pin` — Pin or unpin tab — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `notes/index.md` (command-specs.ts)
- `tab.close_others` — Close other tabs — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `notes/index.md` (command-specs.ts)
- `tab.close_all` — Close all tabs — `notes/projects/route-sharing.md`, `work/product/prd/route-sharing.md`,
  `notes/index.md` (command-specs.ts)

### explorer

- `explorer.cycle` — Explorer: open, focus, close — `notes/projects/`, `notes/index.md` (command-specs.ts)
- `explorer.reveal` — Reveal note in explorer — `notes/projects/`, `notes/index.md` (command-specs.ts)

### outline

- `outline.cycle` — Outline: open, focus, close — `notes/meetings/all-hands-archive.md`, `work/kestrel/config/app.toml`
  (command-specs.ts)
- `outline.toggle` — Show or hide the outline — `notes/meetings/all-hands-archive.md`, `work/kestrel/config/app.toml`
  (command-specs.ts)
- `outline.pick` — Find a heading in this note — `notes/meetings/all-hands-archive.md`, `work/kestrel/config/app.toml`
  (command-specs.ts)

### footnotes

- `footnotes.cycle` — Footnotes: open, focus, close — `notes/reading/maps-and-territories.md` (command-specs.ts)
- `footnotes.toggle` — Show or hide the footnotes — `notes/reading/maps-and-territories.md` (command-specs.ts)

### footnote

- `footnote.add` — Add a footnote — `notes/reading/maps-and-territories.md` (command-specs.ts)

### find

- `find.open` — Find in note — `notes/meetings/all-hands-archive.md`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `find.replace` — Find and replace — `notes/meetings/all-hands-archive.md`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `find.vault` — Find in every note — `notes/meetings/all-hands-archive.md`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `find.replace_vault` — Replace in every note — `notes/meetings/all-hands-archive.md`,
  `work/kestrel/api/kestrel_api/sync.py` (command-specs.ts)

### git changes

- `git.view` — Source control: open, focus, close — `notes/index.md`, `work/kestrel/README.md` (command-specs.ts)
- source control: sections, l on a file, s on a change, d asks, an untracked file to the trash, a, U, . —
  `work/kestrel/README.md`, `notes/index.md` (tui.md Source control (26.2); tests 'source control (26.2)')
- `git.change_next` — Next change against what's staged — `notes/index.md`, `work/kestrel/README.md` (command-specs.ts)
- `git.change_prev` — Previous change against what's staged — `notes/index.md`, `work/kestrel/README.md`
  (command-specs.ts)
- `git.change_preview` — Preview the change — `notes/index.md`, `work/kestrel/README.md` (command-specs.ts)
- `git.change_undo` — Undo the change — `notes/index.md`, `work/kestrel/README.md` (command-specs.ts)
- signs in the gutter for unsaved edits, ] c, space g p, space g r; an untracked file all added; staged, none —
  `work/kestrel/README.md`, `notes/index.md` (tui.md The working tree's changes (26.1); tests 'changes against what's
  staged, in the gutter')

### shell

- `shell.run` — Run a command — `notes/index.md`, `work/kestrel/README.md` (command-specs.ts)
- `shell.filter` — Filter lines through a command — `notes/reading/list.md`, `work/kestrel/config/app.toml`
  (command-specs.ts)
- `shell.stop` — Stop the running command — `notes/index.md`, `work/kestrel/README.md` (command-specs.ts)
- :!grep -n then enter on a path:line; :'<,'>!sort on a list; :%!column -t on a table; a folder's key bound to
  shell.run dropped — `notes/reading/list.md`, `work/kestrel/README.md` (keymap.md Your shell (25.7); tests 'commands
  run by your shell')
- `find.substitute` — Substitute: s/old/new/ — `notes/meetings/all-hands-archive.md`,
  `work/kestrel/api/kestrel_api/sync.py` (command-specs.ts)
- `find.next` — Next match — `notes/meetings/all-hands-archive.md`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `find.prev` — Previous match — `notes/meetings/all-hands-archive.md`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `find.word_next` — Find the word under the cursor — `notes/meetings/all-hands-archive.md`,
  `work/kestrel/api/kestrel_api/sync.py` (command-specs.ts)
- `find.word_prev` — Find the word under the cursor, backward — `notes/meetings/all-hands-archive.md`,
  `work/kestrel/api/kestrel_api/sync.py` (command-specs.ts)
- `find.clear` — Clear find highlights — `notes/meetings/all-hands-archive.md`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)

### git

- `git.changes` — Changed on this branch — `work/kestrel/docs/architecture.md`, `work/product/prd/route-sharing.md`
  (command-specs.ts)
- `git.diff` — Diff this note against the base — `work/kestrel/docs/architecture.md`,
  `work/product/prd/route-sharing.md` (command-specs.ts)
- `git.worktrees` — Open in another worktree — `work/kestrel/docs/architecture.md`, `work/product/prd/route-sharing.md`
  (command-specs.ts)
- `git.merge_review` — Review a merge's links — `work/kestrel/docs/architecture.md`, `work/product/prd/route-sharing.md`
  (command-specs.ts)

### search

- `search.open` — Search here — `notes/index.md`, `notes/meetings/all-hands-archive.md` (command-specs.ts)

### task

- `task.toggle` — Toggle task — `notes/daily/2026-10-05.md`, `notes/projects/brevet-300.md` (command-specs.ts)

### note

- `note.save` — Save — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/` (command-specs.ts)
- `note.save_all` — Save all — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/` (command-specs.ts)
- `note.save_force` — Save over a changed file — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.revert` — Reload, dropping changes — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.resolve` — Resolve a conflict with the file — `notes/inbox.md`, `notes/projects/home-office.md`,
  `notes/projects/` (command-specs.ts)
- `note.open` — Open a note — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/` (command-specs.ts)
- `note.create` — New note — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/` (command-specs.ts)
- `note.reload` — Reload note from disk — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.edit` — Edit in your editor — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.send` — Send to your running editor — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.send_pick` — Choose the editor to send to — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.export` — Export the note: Word, PDF, HTML… — `notes/research/route-cost-models.md`,
  `notes/projects/sync-rewrite.md` (command-specs.ts)
- `note.export_many` — Export notes as one document… — `notes/projects/sync-rewrite.md`,
  `notes/projects/route-sharing.md` (command-specs.ts)
- `note.info` — Info: open, focus, close — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.properties` — Edit the properties — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.delete` — Delete the note — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.copy` — Duplicate the note — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.move` — Move the note to a folder… — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.yank` — Copy the note, to paste — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.cut` — Cut the note, to paste — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)
- `note.rename` — Rename or move the note — `notes/inbox.md`, `notes/projects/home-office.md`, `notes/projects/`
  (command-specs.ts)

### switcher

- `switcher.open` — Quick switcher: find a note — `notes/index.md` (command-specs.ts)

### palette

- `palette.open` — Command palette — `notes/index.md` (command-specs.ts)

### ui

- `ui.list` — UI settings — `work/kestrel/docs/qa/render-torture.md`, `notes/meetings/all-hands-archive.md`
  (command-specs.ts)
- `ui.readable` — Readable width — `work/kestrel/docs/qa/render-torture.md`, `notes/meetings/all-hands-archive.md`
  (command-specs.ts)
- `ui.zen` — Zen mode — `work/kestrel/docs/qa/render-torture.md`, `notes/meetings/all-hands-archive.md`
  (command-specs.ts)
- `ui.cursorline` — Cursor-row highlight — `work/kestrel/docs/qa/render-torture.md`,
  `notes/meetings/all-hands-archive.md` (command-specs.ts)
- `ui.line_numbers` — Line numbers — `work/kestrel/docs/qa/render-torture.md`, `notes/meetings/all-hands-archive.md`
  (command-specs.ts)
- `ui.wrap` — Wrap long lines — `work/kestrel/docs/qa/render-torture.md`, `notes/meetings/all-hands-archive.md`
  (command-specs.ts)
- `ui.breadcrumb` — Breadcrumb — `work/kestrel/docs/qa/render-torture.md`, `notes/meetings/all-hands-archive.md`
  (command-specs.ts)
- `ui.top_bar` — Top bar — `work/kestrel/docs/qa/render-torture.md`, `notes/meetings/all-hands-archive.md`
  (command-specs.ts)
- `ui.problems_bar` — Problems bar — `work/kestrel/docs/qa/render-torture.md`, `notes/meetings/all-hands-archive.md`
  (command-specs.ts)
- `ui.spell` — Spelling — `notes/reading/okuma-notlari.md`, `notes/reading/maps-and-territories.md` (command-specs.ts)
- `ui.problem_marks` — Problems marked in the text — `work/kestrel/docs/qa/render-torture.md`,
  `notes/meetings/all-hands-archive.md` (command-specs.ts)
- `ui.urls` — Show link URLs — `work/kestrel/docs/qa/render-torture.md`, `notes/meetings/all-hands-archive.md`
  (command-specs.ts)
- `ui.mouse` — Mouse — `work/kestrel/docs/qa/render-torture.md`, `notes/meetings/all-hands-archive.md`
  (command-specs.ts)

### theme

- `theme.pick` — Theme — `work/kestrel/docs/qa/theme-showcase.md` (command-specs.ts)
- `theme.set` — Set theme — `work/kestrel/docs/qa/theme-showcase.md` (command-specs.ts)

### glyphs

- `glyphs.pick` — Glyphs — `work/kestrel/docs/qa/theme-showcase.md`, `work/kestrel/docs/qa/render-torture.md`
  (command-specs.ts)
- `glyphs.set` — Set glyphs — `work/kestrel/docs/qa/theme-showcase.md`, `work/kestrel/docs/qa/render-torture.md`
  (command-specs.ts)

### scratch

- `scratch.open` — Open the scratch — `notes/daily/2026-09-22.md`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `scratch.add` — Add to the scratch — `notes/daily/2026-09-22.md`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `scratch.copy` — Copy the scratch — `notes/daily/2026-09-22.md`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)
- `scratch.clear` — Clear the scratch — `notes/daily/2026-09-22.md`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)

### context

- `context.copy` — Copy the note's context for an agent — `notes/projects/sync-rewrite.md` (command-specs.ts)

### folder

- `folder.create` — New folder — `notes/projects/`, `notes/index.md` (command-specs.ts)
- `folder.rename` — Rename the folder — `notes/projects/`, `notes/index.md` (command-specs.ts)
- `folder.move` — Move the folder… — `notes/projects/`, `notes/index.md` (command-specs.ts)
- `folder.delete` — Delete the folder — `notes/projects/`, `notes/index.md` (command-specs.ts)
- `folder.yank` — Copy the folder, to paste — `notes/projects/`, `notes/index.md` (command-specs.ts)
- `folder.cut` — Cut the folder, to paste — `notes/projects/`, `notes/index.md` (command-specs.ts)
- `folder.paste` — Paste into the folder — `notes/projects/`, `notes/index.md` (command-specs.ts)

### view

- `view.source` — Source / rendered — `work/kestrel/docs/qa/render-torture.md`, `work/kestrel/docs/qa/theme-showcase.md`
  (command-specs.ts)
- `view.live` — Lens / rendered — `work/kestrel/docs/qa/render-torture.md`, `work/kestrel/docs/qa/theme-showcase.md`
  (command-specs.ts)

### lens

Wide tables and code blocks to edit in place.

- `lens.grow` — Grow the lens — `work/kestrel/docs/qa/render-torture.md`, `notes/projects/kestrel-v2-3.md`
  (command-specs.ts)
- `lens.shrink` — Shrink the lens — `work/kestrel/docs/qa/render-torture.md`, `notes/projects/kestrel-v2-3.md`
  (command-specs.ts)
- `lens.reset` — Lens to its own size — `work/kestrel/docs/qa/render-torture.md`, `notes/projects/kestrel-v2-3.md`
  (command-specs.ts)

### info

- `info.toggle` — Show or hide the Info — `notes/projects/kestrel-v2-3.md`, `work/kestrel/api/kestrel_api/sync.py`
  (command-specs.ts)

### vault

- `vault.reindex` — Reindex the folder — `notes/index.md`, `hobbies/cooking/Home.md`, `hobbies/photography/index.md`
  (command-specs.ts)
- `vault.info` — Folder info — `notes/index.md`, `hobbies/cooking/Home.md`, `hobbies/photography/index.md`
  (command-specs.ts)
- `vault.unmake` — Take .slipbox/ away — `notes/index.md`, `hobbies/cooking/Home.md`, `hobbies/photography/index.md`
  (command-specs.ts)
- `vault.init` — Give a folder .slipbox/ — `notes/index.md`, `hobbies/cooking/Home.md`, `hobbies/photography/index.md`
  (command-specs.ts)
- `vault.pin_root` — Pin this root in the explorer — `notes/index.md`, `hobbies/cooking/Home.md`,
  `hobbies/photography/index.md` (command-specs.ts)

### trash

- `trash.restore` — Restore the last deleted — `notes/inbox.md`, `notes/projects/` (command-specs.ts)
- `trash.open` — The trash — `notes/inbox.md`, `notes/projects/` (command-specs.ts)

### heading

- `heading.rename` — Rename the heading — `notes/meetings/all-hands-archive.md`, `notes/projects/kestrel-v2-3.md`
  (command-specs.ts)

### rename

- `rename.undo` — Undo the last rename — `notes/projects/route-sharing.md`, `work/kestrel/docs/architecture.md`
  (command-specs.ts)

### problems

- `problems.open` — Problems: open, focus, close — `notes/research/link-styles.md`, `notes/index.md` (command-specs.ts)
- `cell.fold` — Fold or unfold the cell — `work/kestrel/src/routes/RouteMap.tsx`, `notes/index.md` (command-specs.ts)
- `cell.edit` — Edit the cell — `work/kestrel/src/routes/RouteMap.tsx`, `notes/index.md` (command-specs.ts)
- `cell.copy` — Copy the cell — `work/kestrel/api/kestrel_api/app.py`, `notes/index.md` (command-specs.ts)
- `cell.references` — Where the cell's definition is used — `work/kestrel/src/routes/RouteMap.tsx`, `notes/index.md`
  (command-specs.ts)
- `cell.problems` — The cell's problems — `work/kestrel/api/kestrel_api/half_written.py`, `notes/index.md`
  (command-specs.ts)
- `cell.scratch` — Add the cell to the scratch — `work/kestrel/api/kestrel_api/app.py`, `notes/index.md`
  (command-specs.ts)
- `ui.code_cells` — Code cells: boxes or bands — `work/kestrel/src/routes/RouteMap.tsx`, `notes/index.md`
  (command-specs.ts)
- `problems.file` — This file's problems — `work/kestrel/src/routes/RouteMap.tsx`, `notes/index.md` (command-specs.ts)

### tag

- `tag.list` — Tags — `notes/projects/kestrel-v2-3.md`, `notes/projects/brevet-300.md` (command-specs.ts)

### config

- `config.reload` — Reload configuration — `notes/.slipbox/config.toml` (command-specs.ts)

### messages

- `messages.open` — Messages — `notes/index.md` (command-specs.ts)

### help

- `help.open` — All keys and commands — `notes/index.md` (command-specs.ts)
