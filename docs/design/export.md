# Export (plan `10.x`)

Notes as a document for people who don't use slipbox: Word now (`10.4`); HTML, Markdown, PDF and EPUB to follow.
Every format is written by TypeScript or JavaScript under a permissive licence: no tool is run and nothing is
installed. A format that would need one (a headless browser, `10.7`; pandoc, `10.8`) isn't offered. Decided
2026-10-09 with the user: Word first, then the rest; an export goes beside its note by default.

The code is in `src/core/export/`:

| Module | What it does |
| --- | --- |
| `assemble.ts` | the notes as one document for a writer (`10.1`): its chapters, made ready |
| `docx.ts` | the document as a `.docx` (`10.4`) |
| `images.ts` | a picture's kind and size from its file's header; an SVG rasterised; the size it's shown at |
| `index.ts` | the formats, by name; where an export goes |

`src/core/imagecache.ts` is where a picture on the web is kept once the TUI has fetched it (`12.12`). An export reads
it, and fetches nothing.

## Asking for one

**The CLI**: `slipbox export <note…> [--to docx] [--out|-o <path>]`.

- The format is `--to`'s: a name (`docx`), another name for it (`word`, `doc`) or an extension (`.docx`). Without
  `--to`, it's `-o`'s extension; without either, Word. A format slipbox doesn't write is a usage error (exit 2).
- The file goes to `--out` (or `-o`), from the working folder; a folder gets the first note's name in it. Without
  `-o`, it goes beside the first note, under its name with the format's extension: `notes/report.md` gives
  `notes/report.docx`.
- Several notes make one document, a chapter each, in the order given (`10.9`, its CLI half).
- A file already there is replaced, as `-o` does in any tool. A note of the root never is: exit 5.
- `--json`: `{path, format, notes[], bytes}`. The human line: `exported notes/report.md to notes/report.docx (Word
  (.docx))`.

**The TUI**: `space n o`, or `:export`.

- It exports the explorer's selected note when the explorer has focus, else the note on screen; a file that isn't a
  note is said, not exported.
- A list of the formats comes first; `:export docx` (or `word`, completed) skips it.
- Then a prompt for where, filled in with the place beside the note (from the root). `~/` is home, and a folder gets
  the note's name in it.
- A file there is replaced only after `y` to "rep.docx is there — replace it?"; a note is refused.
- Unsaved notes are saved first, as every hand-off does (`4.10`), since the export reads the notes from disk. One that
  can't be saved stops it, said as `space s c` says it: `export: x.md changed on disk while unsaved — ␣ n c resolves
  it first`.
- While it's written, `exporting to rep.docx…`; then `exported rep.md to rep.docx (Word (.docx))`, or why it wasn't.

## The assembler (`10.1`)

`assemble(graph, rels)` reads each note from disk and returns `{title, author, date, chapters[]}`. Each chapter is
`{rel, title, anchor, nodes}`: the note's markdown tree, made ready for a writer, which never looks anything up.

- **Chapters.** A chapter a note, in the order given. Its id comes from its path (`notes/report.md` gives
  `notes-report`), and its title is the note's (frontmatter `title`, else its first heading, else its file name).
- **The document's title, author and date** come from the first note: its title, its frontmatter's `author` (or
  `authors`, joined) and `date`.
- **Dropped:** frontmatter, link definitions and HTML blocks. HTML in a line: `<br>` is a break, any other tag goes,
  and the words between tags stay.
- **Embeds** are drawn in when a paragraph holds only embeds: `![[note]]`, `![[note#Heading]]`, `![[note#^block]]`
  and `![](note.md)`. Each is drawn in as its blocks, made ready from where its note is (its links and pictures read
  from its folder), up to three deep. An embed of a note already being drawn in is its link instead: no loop.
- **Headings** get ids, `chapter--slug`. A name used twice is numbered, `-1`, as GitHub does.
- **Links** to a note exported stay links, inside the document: to its chapter, or to its heading's id. A link to a
  heading the document doesn't hold (renamed since, or in a part not drawn in) goes to the chapter. A link to a note
  not exported, a file or nothing becomes its text (a wikilink's alias where it has one). A link with a scheme (the
  web's, `mailto:`) is kept.
- **Tags** are their text.
- **Pictures** are found as on screen (`12.13`, `12.14`): a path from its note's folder, `![[name]]` by name, and
  Obsidian's `|300` or `|240x180` kept as the size. One on the web is its cached copy, else its words linked to it. A
  missing one is its words.
- **Diagrams and maths.** A Mermaid block becomes an SVG in print's colours, dark on white (a kind beautiful-mermaid
  doesn't draw stays code). A display's maths becomes MathJax's SVG. Inline maths stays maths, for the writer.
- **Callouts** (`> [!tip] Try it`) become a quote whose title is bold on a line of its own (the kind's name where
  there's none), with the kind on `data.callout`. `> \[!note]` is a quote as written, as on screen.
- **Footnotes** keep to their note: two notes' `[^1]` are two footnotes.

## Word (`10.4`)

Written by `docx` (MIT), whose zip, JSZip, is dual-licensed MIT or GPLv3 and taken under MIT. Both are loaded only
when exporting, not at start.

- **The page:** A4 with inch margins, Calibri 11 pt, code in Consolas.
- **Chapters:** each starts on a new page (but the first) at its bookmark. Its title is a Heading 1: the note's own
  first heading when it opens with one, else its title.
- **Headings** are Heading 1 to 6, each a bookmark that links inside the document go to. Word's bookmark names start
  with a letter and are at most 40 characters, so an id becomes `s_<the id, 28 characters>_<its hash>`.
- **Lists:** bullets; numbered lists from their own start (`5.` stays 5); a list inside an item a level in; a task's
  box `☐` or `☑`.
- **Quotes** are indented behind a bar, and a callout's bar has its kind's colour (GitHub's).
- **Code** is a paragraph a line on a tint, its syntax coloured as GitHub's light theme colours it, comments italic.
- **Tables** have borders and a header row (bold, tinted, repeated on each page), and their columns are aligned as
  written.
- **Footnotes** are Word's own.
- **Pictures:** PNG, JPEG, GIF and BMP go in as they are. An SVG — a file, a diagram, a display's maths — is
  rasterised by resvg at twice the size it's shown. A WebP is its words: Word holds none, and nothing here decodes
  one. A picture is shown at its size (or Obsidian's) up to the text's width, 600 pixels at 96 to the inch. MathJax's
  sizes are in `ex`, taken as 6.3 pixels (11-point text).
- **Maths:** a display without a picture is its Unicode rows (`12.11`), centred, else as written. Inline maths is
  Unicode text in italics, else as written.
- **A thematic break** is a rule.

## Licences

The export's own libraries are MIT: `docx` and JSZip. It also draws with what the TUI draws with (`12.x`):
beautiful-mermaid (MIT) and its layout engine elkjs (EPL-2.0), MathJax (Apache-2.0), and resvg (MPL-2.0). EPL-2.0
and MPL-2.0 are weak copyleft: a change to those libraries' own files would have to be shared, and nothing of
slipbox's is.

## Known limits

- A picture is read wherever its link points, as on screen. A note from elsewhere can name a picture outside the root,
  and its export would hold that picture.
- A footnote a section embed refers to, but defined outside the section, isn't drawn in.
- WebP pictures are their words in Word.
- The TUI exports one note at a time; picking several (`10.9`) is still to come. The CLI takes several.
