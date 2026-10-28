# Export (`10.x`)

Notes as a document for people who don't use slipbox, in five formats: Word (`10.4`), PDF (`10.5`), a web page
(`10.2`), an e-book (`10.6`) and portable Markdown (`10.3`). One note, or several as one document, a chapter each
(`10.9`). Every format is written by TypeScript or JavaScript under a permissive licence: no tool is run and nothing
is installed (D180, D184). A format that would need one (a headless browser, `10.7`; pandoc, `10.8`) isn't offered.
Word comes first, and an export goes beside its note by default (D185).

The code is in `src/core/rendering/export/`:

| Module | What it does |
| --- | --- |
| `assemble.ts` | the notes as one document for a writer (`10.1`): its chapters, made ready |
| `docx.ts` | the document as a `.docx` (`10.4`) |
| `pdf.ts` | lazy PDF entry (`10.5`); font, line, chapter and page owners under `pdf/` |
| `fonts.ts` | the fonts a PDF is set in, found on the machine |
| `hast.ts` | a chapter as HTML's tree, for the web page and the e-book |
| `html.ts` | the document as one HTML file (`10.2`) |
| `epub.ts` | the document as an EPUB (`10.6`) |
| `markdown.ts` | the document as Markdown, its pictures beside it (`10.3`) |
| `images.ts` | a picture's kind and size from its file's header; an SVG rasterised; its size shown |
| `convert.ts` | a picture of a kind a format doesn't hold made a PNG first: BMP, GIF and WebP decoded (`10.10`) |
| `style.ts` | the look on paper: print's colours, a callout's, code's; the stylesheet |
| `index.ts` | the formats, by name; where an export goes; writing it |
| `mark.ts` | each format's mark, that slipbox wrote it: read by `index.ts`; Markdown's also by the graph's lookups |
| `jobs.ts` | an export as a job in a worker of its own ([export-worker.ts][o1]), its turn, its cancel |
| `spool.ts` | private staged files, bounded copying and atomic publication by the owner |
| `stream.ts` | format dispatch into a disk sink and bounded UTF-8 encoding |
| `zip.ts` | EPUB's ZIP, an entry at a time, each with its sizes in its own header |
| `reads.ts` | what a job reads: regular files only, each note parsed once in a job |

`src/core/rendering/media/images/imagecache.ts` is where a picture on the web is kept once the TUI has fetched it
(`12.12`). An export reads it, and fetches nothing. Every writer is loaded when it's first used, not at start.

## Background jobs

`core/rendering/export/jobs.ts` runs a whole export in a worker of its own (`core/rendering/export/export-worker.ts`):
its graph, the assembly and the writer. The request carries the location, configuration, asked home folders,
thorough-link behavior, known aliases and whether the owner's graph reads the persisted index; the worker's reads it
too, so notes parsed already aren't parsed again. Cross-root reach is recreated only where the parent had it. The worker
is given the environment as the owner has it when the job starts (Bun would give it the one the process started with),
so it finds the cache and state the owner does. It reads saved files and fetches nothing; `reads.ts` reads notes and
pictures only when they are regular files, and parses each note once in a job. An embedded note that can't be read stays
its name, as on the screen. The worker reports stages (reading, assembling, writing), streams output into a private
staging directory created by its owner, and returns only a manifest of lengths and attachment names. It never writes the
destination. CLI callers await the same job. The buffered `exportNotes` helper remains available for callers that need
bytes; the CLI and TUI use `prepareExport` and `PreparedExport.publish`.

Two jobs run at once; another waits its turn, in order, and is never refused. A job has no deadline: a long book, or
many pictures to convert, takes as long as it needs. Cancellation or a worker failure settles it, terminates its worker
and removes its staged files. The named `note.export_cancel` command cancels every TUI job, running or waiting; quitting
cancels them too. A TUI job is over as soon as a cancel can no longer stop it (its document's rename begun, the signal
not read again), or once its publication fails or is stopped, and says so before its staging is cleared: a cancel from
then on finds none running (`no export is running`), and the cleanup's warning, if it fails, comes after what the job
said. One that fails or is stopped while it's prepared says so once its staging is removed. The target's note/overwrite
checks run again in the owning CLI/TUI immediately before publication. The check runs again after copying and
immediately before each rename. The TUI keeps the original graph and its state directory even if the user changes roots
while the job runs. A queued progress message or result cannot revive a settled job.

### Output streaming and publication

`spool.ts` writes each encoder chunk through at most a 64 KiB synchronous write on the worker, handling partial writes.
The staging directory is in slipbox's cache folder, `exports/<pid>-<random>` — on disk, where the system's temporary
folder may be memory (a tmpfs) — owner-only (0700 on Unix), its files 0600, with generated names unrelated to the
attachment paths. Staging left by a process that's gone (killed, crashed) is removed the next time one stages. No
document bytes cross the worker boundary in the production path. The owner validates manifest paths, regular files and
actual lengths, then copies through one reusable 64 KiB buffer per publication with awaited reads and writes.
Cancellation is checked between operations; individual OS filesystem operations are not preempted.

Destination copies are exclusive temporary files beside their final paths, 0600 while copying. Each is synced, given the
replaced file's permissions (else 0644), and renamed atomically after rechecking destination policy. Attachments publish
before the document; the set of files is not a filesystem transaction. Cancellation or failure leaves the previous
document intact until its final rename; attachments already published may remain, as with the earlier writer. Private
staging and unpublished destination temporaries are removed on success, failure or cancellation, and on normal process
exit. CLI termination signals cancel the job, await cleanup, then retain their usual process-ending effect. Staging uses
additional disk space, up to the output plus its destination copies, while the previous destination may still exist.

PDF emits output as it is produced, finishes quote/callout bars and adds each page number before that page is flushed,
and retains at most one page for layout. EPUB writes each ZIP entry as it's made (`zip.ts`): compressed whole by fflate,
its checksum and sizes in its own header, no data descriptor after it, so a reader that streams the archive reads it as
one that uses the central directory does (Java's `ZipInputStream` refuses a stored entry with a descriptor, and the
first, `mimetype`, is stored, as EPUB asks). It keeps only picture names/types for its manifest; chapters are serialized
individually, and one entry's compressed copy is held at a time. HTML serializes one chapter at a time, UTF-8 encoded
through a 64 KiB window. Markdown stages pictures individually rather than returning their byte arrays together. Its
Markdown serializer still makes a document-sized string, and a picture header read still loads one picture. Word's
public `Packer.toStream` in the pinned docx version itself buffers the whole archive: its encoder therefore remains
buffered inside the worker, without an additional copy into the owner or a private-library hook.

These are bounds on output transport and publication, not on the assembled tree, an individual raster decode or
third-party encoder allocations. No total-process memory ceiling is claimed. Nothing an export reads or makes is capped
by its size: a note, a picture, all of them together, the document and its output are as big as they are, as an export
on the main thread had them, but for an EPUB: a ZIP written without ZIP64, refused past 4 GiB or 65,535 files
(`core/rendering/export/formats/zip.ts`). Worker isolation keeps their CPU work away from input; it is not an OS memory
sandbox or independent native-fault containment. Existing writers are JavaScript/WebAssembly; a helper process is
unnecessary for the measured CPU scheduling problem, but remains an option for stronger future containment. A worker the
export's starts (the diagrams') is found from the compiled binary's root, whichever entry point starts it
(`core/foundation/workers/url.ts`).

A local 279,890-byte document measured before/after this boundary (2026-10-18, single runs; #176): PDF 763/778 ms,
DOCX 277/370 ms, EPUB 251/363 ms total. Maximum sampled event-loop gaps were 478/8 ms, 175/8 ms, 169/8 ms. Sampled peak
RSS was 321/368 MiB, 188/235 MiB, 179/216 MiB; workers add startup and memory overhead. Output sizes matched in each
pair (764,837, 36,016 and 22,152 bytes). These are local measurements, not portable performance budgets.

A second local check (2026-10-18, one fresh process per path; eight 8 MiB picture attachments exported to Markdown)
compared buffered output/publication with staging: 185/251 ms total, maximum sampled event-loop gaps 36/5 ms, sampled
peak RSS 314/130 MiB. Both produced 67,109,301 bytes, with identical document hashes. The additional disk work buys
lower retained output memory; these single-run timings are evidence of the tradeoff, not CI thresholds.

## Asking for one

**The CLI**: `slipbox export <note…> [--to docx|pdf|html|epub|md] [--out|-o <path>] [--force]`.

- The format is `--to`'s: a name (`docx`, `pdf`, `html`, `epub`, `md`), another name for it (`word`, `doc`, `htm`,
  `web`, `ebook`, `markdown`) or an extension (`.docx`). Without `--to`, it's `-o`'s extension; without either, Word.
  A format slipbox doesn't write is a usage error (exit 2).
- The file goes to `--out` (or `-o`), from the working folder; a folder, one there or a path ending in `/` (made when
  the export is written), gets the first note's name in it, and its own name says no format (DF-D5). Without `-o`, it
  goes beside the first note, under its name (D185): `notes/report.md` gives `notes/report.docx`. Markdown's is
  `notes/report.export.md`, apart from the note it's of. In a vault, beside a note reached through a link out of it
  is outside the vault, a place nobody named: refused (exit 5), saying to name one with `--out` (VV-D6).
- Several notes make one document, a chapter each, in the order given.
- A file already there is replaced when it's an earlier export, of any format (§ Earlier exports); any other only with
  `--force` (D243): without it, `rep.docx isn't an export — an export doesn't write over it without --force`, exit 5,
  the file as it was. Something there that isn't a file counts as one that isn't an export (a link to nowhere, a
  folder at the default name). A note never is (exit 5), even with `--force`, of this vault or any other (DF-D3): this
  vault's as its index has them; another's, a file of a note's name in a folder that is a vault, where it is reached
  or where it really is (a symlinked folder counts). An earlier Markdown export is: its frontmatter's
  `generator: slipbox` says it is one. The refusals come in that order: a note, beside a link out (VV-D6), then a file
  that isn't an export.
- `--json`: `{path, format, notes[], bytes, files[]}` — `files`, what was written beside it (Markdown's pictures). The
  human line: `exported notes/report.md to notes/report.docx (Word (.docx))`, with `, 2 files beside it` where there
  are some.

**The TUI**: `space n o` (`:export`) for a note, `space n shift+o` (`:export-notes`) for several.

- `space n o` exports the explorer's selected note when the explorer has focus, else the note on screen; a file that
  isn't a note is said, not exported.
- `space n shift+o` lists the vault's notes to pick, in the order wanted: the one on screen (or the explorer's) is
  picked already, each pick shows its number, and picking one again takes it out. The list filters as you type, and
  keeps what's typed and where you were between picks. Its first row, whatever's typed, is "Export these 3 notes…".
- Then a list of the formats; `:export docx` (or `word`, completed) skips it.
- Then where (`10.14`, D190), in a Save As window: places down its left, the folder it's in on the right — its folders,
  then its files with their size and date — and the file's name at the bottom, with Export and Cancel buttons. It
  opens where you exported last (kept for the vault in its state, `export.json`, while that folder is there), else
  beside the note, the note's name filled in and its focus: `enter` exports there. The folder is kept as soon as
  publication returns, its files in place, before the staging is cleared, so the window opened during the cleanup
  opens there; an export that fails, or is cancelled before it's written, leaves it as it was.
  - **Places:** Beside the note; Last export; Downloads, Desktop and Documents — where the desktop's `user-dirs.dirs`
    says, else by those names — and Home, those there are; This vault. The one the folder is in is marked.
  - **Keys:** `tab` (`shift+tab` back) moves between the places, the folder and the name. In the folder, `enter` or
    `→` goes into a folder (a file: its name taken), `←` or "‥" up, back on the folder left; typing jumps to an entry
    that starts so (the same letter again, the next), a `.` first showing the hidden ones; `~` goes home; `ctrl+n`
    makes a folder there and goes into it. In the name, `↓` goes to the folder; a name may be a path, from the folder
    (`~/` home), and a folder named is gone into, the note's name given back for a second `enter` to export there; one
    ending in `/` is made first where it isn't there (DF-D5, DF-D29), as `ctrl+n` makes one.
  - **The mouse:** a place clicked goes there; an entry clicked is picked, clicked again opened; the name clicked
    takes the focus; the wheel scrolls; a click outside cancels.
- An earlier export there, of any format, is replaced without a question; any other file only after `y` to "Replace
  rep.docx? It isn't an export." (`n`: the window again) (D243). A note of any vault is refused, the window kept (an
  earlier Markdown export aside, replaced as every earlier export is) (DF-D3).
- Unsaved notes are saved first, as every hand-off does (`4.10`), since the export reads the notes from disk. One that
  can't be saved stops it, said as `space s c` says it: `export: x.md changed on disk while unsaved — ␣ n c resolves
  it first`.
- While it's written, `exporting to rep.docx…`; then `exported rep.md to rep.docx (Word (.docx))` as soon as the file
  is in place, or why it wasn't. A cleanup that fails after that, once the export has reached publication, says
  `export cleanup: …`, the newest message (§ Background jobs).

## Earlier exports

Every writer puts a mark in its file that says slipbox wrote it, and `isExport` (`mark.ts`) reads it back, whatever
the file's name, by what the file starts with (D243):

| Format | The mark | Where `isExport` reads it |
| --- | --- | --- |
| Word | the custom property `generator`, `slipbox` | `docProps/custom.xml`, by the zip's central directory |
| PDF | the Info's Creator, `slipbox` | the trailer's `/Info`, by the cross-reference table, as pdfkit writes them |
| A web page | `<meta name="generator" content="slipbox">` | its head, in the first 8 KiB |
| An e-book | `<meta name="generator" content="slipbox"/>` | `OEBPS/content.opf`, by the zip's central directory |
| Markdown | `generator: slipbox` in its frontmatter | the first 2,048 characters |

It reads only those parts, never the whole file: a zip's part bigger than 1 MiB, or a PDF whose objects aren't where
its table says, isn't one. A file it can't read that way, cut short or damaged, isn't one either. The graph reads only
Markdown's (`isMarkdownExport`), for the pictures' folder (§ Markdown).

A mark says slipbox wrote the file, not that it's as slipbox left it: an export edited in Word, an editor or a PDF tool
keeps its mark as a rule, and is replaced; a file of another tool's carrying the same mark would be too. Word's mark
came with D243: a Word export from before carries none, and is asked about (or needs `--force`) once.

## The assembler (`10.1`)

The work is rewriting links, in an assembler of slipbox's own (D179). `assemble(graph, rels)` reads each note from disk
and returns `{title, author, date, lang, chapters[]}`. Each chapter is `{rel, title, anchor, nodes}`: the note's
markdown tree, made ready for a writer, which never looks anything up.

- **Chapters.** A chapter a note, in the order given. Its id comes from its path (`notes/report.md` gives
  `notes-report`), and its title is the note's (frontmatter `title`, else its first heading, else its file name).
- **The document's title, author, date and language** come from the first note: its title, its frontmatter's `author`
  (or `authors`, joined), `date` and `lang` (or `language`).
- **Dropped:** frontmatter, link definitions and Obsidian's comments (DF-D17: in a line, the white space
  where one was made one; a paragraph of them; one over blank lines) — what a reader of the note never sees isn't in
  what's sent. HTML document content uses the shared bounded adapter (HTML-D1, HTML-D5); scripts, styles and other
  non-document content are omitted. Nothing a note holds runs in a document made of it.
- **Embeds** are drawn in when a paragraph holds only embeds: `![[note]]`, `![[note#Heading]]`, `![[note#^block]]`
  and `![](note.md)`. Each is drawn in as its blocks, made ready from where its note is (its links and pictures read
  from its folder), up to three deep. An embed of a note already being drawn in is its link instead: no loop.
- **Headings** get ids, `chapter--slug`. A name used twice is numbered, `-1`, as GitHub does.
- **Links** to a note exported stay links, inside the document: to its chapter, or to its heading's id. A link to a
  heading the document doesn't hold (renamed since, or in a part not drawn in) goes to the chapter. A link to a note
  not exported, a file or nothing becomes its text (a wikilink's alias where it has one). A link to the web, mail, a
  phone (`https:`, `mailto:`, `tel:`, `ftp:`) is kept; one with any other scheme (`javascript:`, `file:`) is its text.
- **Tags** are their text.
- **Pictures** are found as on screen (`12.13`, `12.14`): a path from its note's folder, `![[name]]` by name, and
  Obsidian's `|300` or `|240x180` kept as the size. One on the web is its cached copy (its address kept), else its
  words linked to it, marked a picture's for a format that keeps it one. A missing one is its words. Only the vault's
  pictures go into a document (DF-D24): a file outside the vault of the notes exported, by where it really is (a link
  inside the vault leading out is out), is marked `outside` on its picture, and no writer reads it — Word, PDF, the web
  page and the e-book show its words, as they show a picture they can't read (`pictureData` in `images.ts`), nothing
  is made PNG of it (`convert.ts`), and Markdown links to it (§ Markdown). A web picture's cached copy goes in.
- **Diagrams and maths.** A Mermaid block becomes an SVG in print's colours, dark on white, its source kept (a kind
  beautiful-mermaid doesn't draw stays code). Maths becomes MathJax's SVG, a display's and a line's.
- **Callouts** (`> [!tip] Try it`) become a quote whose title is bold on a line of its own (the kind's name where
  there's none), with the kind and whether it was titled on its `data`. `> \[!note]` is a quote as written.
- **Footnotes** keep to their note: two notes' `[^1]` are two footnotes. A footnote's id names its note by a hash of
  its path, never the path, which an HTML id would otherwise show.

Every format draws on paper the same way (`style.ts`): GitHub's light colours, code coloured by the role highlighting
gives a token, a callout's bar in its kind's colour, a task's box `☐` or `☑`, an Obsidian highlight on a marker's
yellow (`<mark>` in HTML and an EPUB, Word's yellow highlight, a PDF's tint; DF-D17), a chapter starting a new page.

## Document HTML in exports (HTML-D5)

Non-Markdown assembly adapts supported HTML to semantic nodes, with all disclosure bodies expanded. Markdown
exports preserve original HTML bytes, spelling and spacing, removing only omitted non-document content. The shared
tokenizer identifies omission ranges; consumers do not parse HTML independently. Relative HTML paths are not
rewritten and HTML-only assets are not copied for Markdown. Semantic formats resolve images through the shared
locator and cached-only reads; each page writer applies its own alignment and percentage bounds.

## Word (`10.4`)

Word comes first (D185). Written by `docx` (MIT), whose zip, JSZip, is dual-licensed MIT or GPLv3 and taken under MIT.

- **The page:** A4 with inch margins, Calibri 11 pt, code in Consolas.
- **Chapters:** each starts on a new page (but the first) at its bookmark. Its title is a Heading 1: the note's own
  first heading when it opens with one, else its title.
- **Headings** are Heading 1 to 6, each a bookmark that links inside the document go to. Word's bookmark names start
  with a letter and are at most 40 characters, so an id becomes `s_<the id, 28 characters>_<its hash>`.
- **Lists:** bullets; numbered lists from their own start (`5.` stays 5); a list inside an item a level in.
- **Quotes** are indented behind a bar. **Code** is a paragraph a line on a tint, comments italic.
- **Tables** have borders and a header row (bold, tinted, repeated on each page), their columns aligned as written.
- **Footnotes** are Word's own.
- **Pictures:** PNG, JPEG, GIF and BMP go in as they are; a WebP is made a PNG first (Word holds none). An SVG — a
  file, a diagram, a display's maths — is rasterised by resvg at twice the size it's shown. A picture is shown at its
  size (or Obsidian's) up to the text's width, 600 pixels at 96 to the inch. MathJax's sizes are in `ex`, taken as
  6.3 pixels (11-point text).
- **Maths:** a display without a picture is its Unicode rows (`12.11`), centred, else as written. Inline maths is
  Unicode text in italics, else as written.
- **Its properties:** the title, the author where there is one, and the custom property `generator`, `slipbox`: its
  mark (§ Earlier exports).

## PDF (`10.5`)

Laid out by pdfkit (MIT, D186) on A4, 64-point margins, the text 10.5 points.

The lazy `formats/pdf.ts` entry retains the existing default font discovery and picture conversion order. Beneath it,
`pdf/writing/writer.ts` owns the document and output lifecycle; `writing/blocks.ts` owns chapter, footnote and outline
state. `fonts/adapter.ts` registers faces and adapts fallback/metrics; `layout/lines.ts` owns line layout and its picture
cache, while `layout/paint.ts` paints those lines. `pages/pagination.ts` owns fitting, bars and footers before page
release. Collaborators share the same PDFKit document; buffers, maps and stream handlers retain their lifetimes.
The existing dynamic imports in `export/index.ts` and `export/stream.ts` stay in place: PDFKit, fontkit and linebreak
remain below the chosen writer, so another format or format discovery does not initialize the PDF writer.

- **Fonts** are found on the machine (`fonts.ts`), never asked of a tool: its font folders are read (Linux's,
  macOS's, Windows', the user's own; in WSL, Windows' on its C: drive first), and the first sans family with all four
  faces is chosen — DejaVu Sans, Liberation Sans, Noto Sans, Arial, Helvetica, Segoe UI, Open Sans, Roboto, Ubuntu,
  Lato, Source Sans — else the first with a regular face, a missing face taken from its nearest. Code is in the first
  monospaced one there (DejaVu Sans Mono, Liberation Mono, Noto Sans Mono, Menlo, Consolas…). They're embedded, only
  the glyphs used.
- **A character a font hasn't got** is taken from the first fallback that has it — DejaVu Sans and Noto for symbols,
  arrows and maths, then emoji, then the CJK fonts there are — a combining mark or a joiner staying with what it joins.
  One no font has is the font's own box. With no font found at all, PDF's own Helvetica and Courier, which hold
  Latin-1: the rest is `?`.
- **Emoji** are black and white (`10.12`, D189), from a font that draws them so: Noto Emoji, OpenMoji's black, Symbola,
  Segoe UI Symbol. A colour emoji font (Apple's, Noto Color Emoji) has pictures, not outlines, and a PDF's text can't
  use it; colour is deferred (`10.13`, D189).
- **Lines are laid out here** (`10.11`, D188), not by pdfkit, whose lines hold only text: words and pictures together,
  broken where Unicode lets a line break (UAX #14, by `linebreak`, MIT), a word longer than a line cut where it fits,
  each run on one baseline. So a picture in a sentence stays in its line (as high as it needs); maths in a line is
  MathJax's, typeset and drawn at four times its size, set on the baseline as MathJax places it; inline code is on a
  tint. Spaces are written too, so what's copied from the page, or searched, has its words apart; a link is one area a
  line.
- **Chapters** start on a new page, each a destination; the PDF's outline lists them and their second-level headings.
  Every heading is a destination the document's links go to; a heading never ends a page.
- **Text** wraps at the width; links are blue, to the web or inside the document; a footnote's mark is a superscript
  number (`[1]` where no font has the digits), linked to its note at the chapter's end, under "Notes".
- **Pictures** alone in a paragraph are centred at their size up to the text's width and the page's height: PNG and
  JPEG as they are; a GIF, a BMP and a WebP made PNG first; an SVG and a diagram rasterised by resvg; a display's
  maths at three times its size, as it's small.
- **Code** is on a tint, a line at a time (so a page can break inside it), coloured. **Tables** are drawn: columns as
  wide as their words need, shared out by how much each wants where they don't fit; a row is never split, and the
  header row comes again on a new page. **Quotes** have a bar down their left, page by page, a callout's in its colour.
- **The page's number** is at its foot.

## A web page (`10.2`)

Written by slipbox, as every format is (D181): one HTML file holding everything, so it can be mailed, opened anywhere
and printed. Each chapter is a `<section>` with its id, its notes at its end; written by `mdast-util-to-hast` and
`hast-util-to-html` (both MIT), which escape every text and attribute.

- **Pictures** are inside it as `data:` addresses, at their size (`width`, `height`) up to 736 CSS pixels; a diagram
  and maths as SVG. A line's maths sits on its baseline: MathJax's `ex` sizes and `vertical-align` kept.
- **Code** is a span a token, each with its role's class, coloured by the stylesheet.
- **The stylesheet** is print-friendly: dark on white, at most 46 rem wide, and when printed a chapter a page and no
  picture, table or block of code split.
- Nothing in it reaches the network: a picture on the web it has no copy of is a link.

## An e-book (`10.6`)

EPUB 3 (D181), zipped by fflate (MIT): `mimetype` first and stored, as readers require; a chapter a file of XHTML; each
picture a file of the book, the same picture once (a BMP made PNG first: an e-book holds none); a contents page (the
chapters and their sections); the stylesheet. XHTML is XML, so no attribute is left without a value and `<` in one is
escaped. Its id comes from what's in it — the notes, in order — so the same notes exported again are the same book,
updated.

## Markdown (`10.3`)

One portable file, for GitHub or any editor (D181):

- **Links inside it** go to the heading ids GitHub gives, a name used again numbered across the whole document; a
  chapter's goes to its title (a note opening with no heading gets one, its title).
- **Pictures** are copied into a folder beside it, `report.export.assets/`: only files that are pictures by what they
  hold (a raster's header, an SVG's start), of the vault (those the assembler hasn't marked `outside`), or a picture
  from the web, its cached copy (DF-D2, DF-D24). Each goes by its own name (one from the web by its address's, with
  its kind's extension where that names none); a second of a name is numbered. Obsidian's size is kept where Obsidian
  reads it: `![alt|240](…)`. A picture on the web with no copy here stays a picture, its address as it was. Anything
  else a picture link names — a file that isn't a picture, one outside the vault — is a link to it from the export,
  `[alt](../notes.txt)` (its alt, else its file's name), nothing of it copied; one on another drive is its words. The
  folder answers no lookup by name, whatever its name: `report.export.assets/`, or `book.assets/` for `-o book.md`
  ([links.md](links.md) § Wikilinks; DF-D25).
- **Kept as written**, as Markdown renders them itself: a Mermaid diagram as its code, maths as `$…$` and `$$`, a
  callout as `> [!tip] Its title`, a highlight as `==…==`.
- **Footnotes** are numbered `[^1]`, `[^2]` in the order they're referred to.
- **Its frontmatter** has the title, author, date and language, and the mark `generator: slipbox`, which lets a later
  export replace it, though it's a note (§ Earlier exports). Pictures left from an earlier export of other pictures
  stay in the folder.

## Pictures made PNG (`10.10`)

Each format holds some kinds of picture and not others — Word no WebP, PDF only PNG and JPEG, an e-book no BMP — so
before a writer runs, every picture of a kind it doesn't hold is decoded and written again as a PNG (`convert.ts`),
and the writers see only what they take (D187). A file is converted once, however often the document shows it. BMP is
decoded here (1, 4, 8, 16, 24 and 32 bits, its palette and its masks, either way up; not run-length encoded); a GIF's
first frame is drawn by resvg; a WebP is decoded by libwebp, compiled to WebAssembly (`@jsquash/webp`), loaded the
first time a WebP is met and embedded in a compiled slipbox. The PNG is written here: eight bits a channel with alpha,
deflated by Node's zlib. One that can't be decoded is its words, as before.

## Licences

The export's own libraries are MIT: `docx` and JSZip (MIT or GPLv3, taken under MIT), pdfkit, fontkit and `linebreak`,
fflate, `mdast-util-to-hast`, `hast-util-to-html`, `mdast-util-to-markdown`, `mdast-util-gfm` and `mdast-util-math`.
fontkit's helpers (`@swc/helpers`) are Apache-2.0, as are `@jsquash/webp` and its `wasm-feature-detect`; the libwebp it
compiles is BSD-3-Clause. It also draws with what the TUI draws with (`12.x`): beautiful-mermaid (MIT) and its layout
engine elkjs (EPL-2.0), MathJax (Apache-2.0), and resvg (MPL-2.0). EPL-2.0 and MPL-2.0 are weak copyleft, accepted for
use (D184, D192): a change to those libraries' own files would have to be shared, and nothing of slipbox's is. What a
distributed binary owes them: [distribution.md](distribution.md) § Notices.

## Known limits

- A footnote a section embed refers to, but defined outside the section, isn't drawn in.
- A run-length-encoded BMP, or a picture otherwise unreadable, is its words. The libwebp in `@jsquash/webp` is 1.0.2,
  old; it decodes inside WebAssembly, where a malformed file can fail but not reach beyond it.
- PDF: emoji are black and white, and only where a font that draws them is on the machine (none, a box); colour is
  deferred (`10.13`, D189). On a machine with no fonts at all, a compiled slipbox can't make one: PDF's own fonts, which
  it would fall back on, aren't in the build (it says so).

[o1]: ../../src/core/rendering/export/export-worker.ts
