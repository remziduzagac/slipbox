# Exporting

An export turns a note, or several notes, into a document for someone who doesn't use slipbox. This chapter covers:

- asking for an export, in slipbox and from the command line
- choosing where it goes
- what each format keeps
- the limits

For a walk through a first export, see [Exporting and sharing notes](../guides/exporting.md).

The document can be:

- a Word file
- a PDF
- a web page
- an e-book
- a single Markdown file to take elsewhere

Several notes become one document, a chapter each.

slipbox writes every format itself. No other program runs, nothing is installed, and nothing is fetched from the
internet.

Your notes are only read. The export is a new file, beside the note unless you say where.

An export prepares in the background, so you can keep reading and editing. Its message shows the current stage: reading,
assembling or writing. It takes as long as it needs: a long book, or many photos to convert, can take minutes. Two
exports prepare at once, and one you start while two are preparing waits its turn. To stop unfinished exports before the
completed document is published, open the command palette (`:`) and choose **Cancel export**. Quitting stops them too.
Once its file is in place, an export is over and says so: Cancel export then says no export is running. The command
line waits for its export to finish.

Export output is prepared in temporary files in slipbox's cache folder, then copied into place without holding a second
complete copy in the interface's memory. This needs extra disk space there; the temporary files are removed when the job
finishes or is cancelled. If they can't be removed once the file is written, a warning says so after the export's own
message. Individual pictures and Word's encoder can still need substantial memory. Large notes and books are not
rejected by a fixed export-size or time limit.

## Exporting a note

slipbox exports the note on screen. When the explorer has the focus, it exports the note selected in it.

1. Press `space n o`, or type `:export`. A list of the formats opens: Word, PDF, a web page, an e-book or Markdown.
2. Pick the format. The Save As window opens beside the note, with the note's name filled in.
3. Press `enter` to export there at once. The message line says `exporting to ideas/coffee.docx…`, then
   `exported ideas/coffee.md to ideas/coffee.docx (Word (.docx))`. If it couldn't export, it says why.

To put it somewhere else, see [Choosing where it goes](#choosing-where-it-goes).

To skip the list, name the format: `:export pdf`. The names are in [The formats](#the-formats), and `:export` completes
them.

A file that isn't a note, such as a picture or a data file, is not exported, and slipbox says so.

An export reads the notes from disk. So a note with unsaved changes is saved first, as on screen.

If a note can't be saved because its file changed on disk while you were editing it, the export stops and says so.
Settle the change with `space n c` (see [Editing](editing.md)), then export again.

## Several notes as one document

1. Press `space n shift+o`, or type `:export-notes`. A list of the vault's notes opens. The note on screen, or the one
   selected in the explorer, is picked already.
2. Pick the notes in the order you want them. Each pick shows its number. Picking a note again takes it out.
3. Press `enter` on the first row, "Export these 3 notes…". slipbox asks for the format and where the document goes,
   as for one note.

The vault is the folder slipbox treats as the top of your notes ([Vaults, home and Elsewhere](vaults.md)).

Type to filter the list. What you typed, and where you were, stay between picks. The first row is "Export these 3
notes…", whatever you've typed.

Each note becomes a chapter, in the order picked. The document is named after the first note. It takes its title,
author, date and language from that note ([What goes into the document](#what-goes-into-the-document)).

## Choosing where it goes

The Save As window has three parts:

- places, down the left
- the folder you're in, on the right: its folders, then its files, each with its size and date
- the file's name at the bottom, with Export and Cancel buttons

The places are:

- **Beside the note**: the folder the (first) note is in.
- **Last export**: the folder you exported to last from this vault, while it's still there. The window opens there
  when there is one.
- **Downloads**, **Desktop**, **Documents** and **Home**: those you have. On Linux, your desktop's own names for them
  are used.
- **This vault**: the top of your notes.

The keys:

| Key | What it does |
| --- | --- |
| `tab`, `shift+tab` | Move between the places, the folder and the name |
| `up`, `down` | Move in the places or the folder. In the name, go to the folder |
| `enter` or `right` | In the places, go there. In the folder, open a folder, or take a file's name |
| `left` or `backspace` | In the folder, go up (or `enter` on `‥`) |
| typing | In the folder, jump to the entry that starts so. The same letter again jumps to the next one |
| `.` | In the folder, typed first: show the hidden files and folders too |
| `~` | In the folder, go to your home folder |
| `ctrl+n` | Make a folder here (type its name, then `enter`) and go into it |
| `enter` | In the name, export |
| `esc` | Cancel |

The name may be a path, from the folder shown, or from your home folder with `~/`. A name that is a folder goes into
it. A name ending in `/` is a folder too, made if it isn't there (`drafts/2026/`).

With the mouse:

- Click a place to go there.
- Click an entry to pick it, and again to open it.
- Click the name to type in it.
- The wheel scrolls.
- A click outside the window cancels.

If an earlier export is there already, in any format, slipbox replaces it without asking. If another file of that name
is there, slipbox asks:

`Replace ideas/coffee.docx? It isn't an export.`

`y` replaces it, and `n` takes you back to the window. [Earlier exports](#earlier-exports) says how slipbox tells.

A note is never replaced, in this vault or another. slipbox says so and keeps the window open. The one exception is an
earlier Markdown export, which is replaced like any earlier export.

## From the command line

```text
slipbox export <note…> [--to <format>] [-o <path>] [--force]
```

```bash
slipbox export ideas/coffee.md                      # ideas/coffee.docx, beside the note
slipbox export ideas/coffee.md --to pdf             # ideas/coffee.pdf
slipbox export ideas/coffee.md -o ~/Desktop/        # ~/Desktop/coffee.docx
slipbox export ideas/coffee.md -o sent/2026/        # sent/2026/coffee.docx, the folder made
slipbox export inbox.md ideas/coffee.md -o both.epub  # one e-book, two chapters
```

- **The notes** are named as every command names them, by a path or a note's name ([The command line](cli.md)).
  Several make one document, a chapter each, in the order given.
- **The format** is `--to`'s. It takes a name such as `pdf`, another name for it such as `word`, or an extension such
  as `.docx`. Without `--to`, it's the extension of `-o`'s file. Without either, it's Word. A format slipbox doesn't
  write is a usage error (exit 2).
- **Where it goes** is `-o` (or `--out`), from the folder you're in.
  - A folder that exists, or a path ending in `/`, gets the first note's name in it. The folder is made if it isn't
    there.
  - Any other path is the file's name. Its folders are made as needed.
  - Without `-o`, the document goes beside the first note, under its name. In a vault, a note reached through a link
    out of the vault has no place beside it: slipbox asks you to name one with `-o`, and exits with 5.
- **An earlier export already there is replaced**, in any format ([Earlier exports](#earlier-exports)). Any other
  file there is left as it is, and slipbox exits with 5, saying:
  `ideas/coffee.docx isn't an export — an export doesn't write over it without --force`. `--force` writes over it.
- **A note is never replaced**, of this vault or any other, not even with `--force`. slipbox says `ideas/coffee.md is
  a note — an export doesn't write over it` and exits with 5. An earlier Markdown export is the exception, and is
  replaced.
- **What it says** is `exported ideas/coffee.md to ideas/coffee.docx (Word (.docx))`. It adds `, 3 files beside it`
  when it wrote some (a Markdown export's pictures). With `--json`, the data is `{path, format, notes, bytes, files}`.

The command line exports any text file you name, read as Markdown. slipbox itself exports only notes.

## Earlier exports

Every export carries a mark that says slipbox wrote it, and a later export writes over a file with that mark. A file
without one is replaced only when you say so: `y` to the question in slipbox, `--force` on the command line.

| Format | Its mark |
| --- | --- |
| Word | a custom property, `generator`, set to `slipbox` (File, Properties in Word) |
| PDF | its Creator, `slipbox` |
| A web page | `<meta name="generator" content="slipbox">` in its head |
| An e-book | `<meta name="generator" content="slipbox"/>` in its package file |
| Markdown | the line `generator: slipbox` in its front matter |

A mark says slipbox wrote the file. It doesn't prove the file is as slipbox left it: an export you edited and saved in
another program usually keeps its mark, and is replaced like any other. A Word document an earlier version of slipbox
exported has no mark, so the first export over it asks, or needs `--force`.

## The formats

| Format | `--to` (other names) | Its file | Good for |
| --- | --- | --- | --- |
| Word | `docx` (`word`, `doc`) | `coffee.docx` | editing, sending to people who use Word |
| PDF | `pdf` | `coffee.pdf` | printing, and sending something that looks the same everywhere |
| A web page | `html` (`htm`, `web`) | `coffee.html` | a browser, mailing, printing |
| An e-book | `epub` (`ebook`) | `coffee.epub` | an e-reader |
| Markdown | `md` (`markdown`) | `coffee.export.md` | GitHub, or another editor |

Word, PDF, the web page and the e-book look alike:

- dark text on white, in GitHub's light colours, whatever your theme
- code in colour, its keywords, strings and comments told apart
- a callout with a bar in its kind's colour
- a task's box as `☐` or `☑`
- Obsidian's `==highlight==` on a marker's yellow

Obsidian's `%%comments%%` are left out of every format, Markdown's too. What you'd never see reading the note isn't in
what you send.

### Word

A Word document (`.docx`) on A4 pages. Its text is in Calibri, and code in Consolas.

- Each chapter starts on a new page.
- Headings are Word's own Heading 1 to 6. So they show in Word's navigation pane, and links inside the document go to
  them.
- Numbered lists keep their own start: a list starting at 5 stays at 5.
- Tables have borders and a header row, repeated on each page.
- Footnotes are Word's own.
- Pictures are shown at their size, up to the page's width.
- Diagrams and displayed maths are pictures. Maths in a line is text, in italics.

### PDF

A PDF on A4 pages, set in fonts found on your machine and embedded in the file.

- **Fonts.** slipbox looks in your system's and your own font folders for a sans-serif family and a monospaced one for
  code. The sans-serif families it looks for are DejaVu Sans, Liberation Sans, Noto Sans, Arial, Helvetica, Segoe UI
  and others.
  - A character those fonts don't have is taken from another font that has it: symbols, emoji, Chinese, Japanese or
    Korean, where you have such fonts.
  - A character no font has is shown as a box.
- **Chapters** start on a new page. The PDF's outline (the bookmarks your viewer shows) lists them and their sections.
  Each page has its number at its foot.
- **Links** are blue, and work. They go to the web, or to a chapter or heading inside the document. A footnote's
  number links to its note, listed under "Notes" at the end of its chapter.
- **Pictures** alone in a paragraph are centred, up to the page's width and height. A picture inside a sentence stays
  in its line. Maths is typeset.
- **Code** is on a tinted band, and may break across pages. A table's row is never split, and its header row comes
  again on a new page.
- **Text can be copied and searched**, its words apart.

### A web page

One HTML file holding everything, pictures included. So it can be mailed, opened anywhere and printed.

- Pictures, diagrams and maths are inside the file. A picture on the internet that slipbox has no copy of is a link to
  it.
- Code is coloured. The page is at most a comfortable reading width on a screen.
- Printed, each chapter starts a new page, and no picture, table or block of code is split.
- The page holds no script. Nothing in it reaches the network until you follow one of its links.

### An e-book

An EPUB 3 e-book. It holds:

- a file per chapter
- a contents page listing the chapters and their sections
- its pictures, inside it

Exporting the same notes again gives the book the same identity. So it is the same book, updated.

### Markdown

A single Markdown file you can take to GitHub or any editor. It is named `coffee.export.md`, so that it never takes a
note's place.

- **Pictures** are copied into a folder beside it, `coffee.export.assets/`, and linked from there. Only those from
  inside the vault are copied, and only files that really are pictures.
  - Anything else a picture's link names (a text file, or a picture from outside the vault) isn't copied. It becomes a
    link to where it is.
  - A picture's size written Obsidian's way (`|240`) is kept.
  - A picture on the internet that slipbox has no copy of stays a picture at its address. So whatever shows the file
    fetches it.
- **Its pictures don't answer to their names.** slipbox looks for `![[photo.png]]` everywhere in the vault but in a
  Markdown export's pictures folder. That is a folder ending `.export.assets`, or any other beside the export it
  belongs to, which the export's front matter marks (`book.assets/` beside `book.md`, for `-o book.md`). So an export
  beside your notes never takes the place of the picture it copied. A path through the folder
  (`![[coffee.export.assets/photo.png]]`) still reaches the copy.
- **Kept as written**, since Markdown viewers draw them themselves:
  - a Mermaid diagram, as its code
  - maths, as `$…$` and `$$`
  - a callout, as `> [!tip] Its title`
  - a highlight, as `==…==`
- **Links inside the document** go to the headings as GitHub names them.
- **Footnotes** are numbered `[^1]`, `[^2]` in the order they're referred to, across the whole document.
- **Its front matter** has the title, author, date and language, and the line `generator: slipbox`. That line marks it
  as an export, so a later export may replace it. It is still a Markdown file in your folder, and slipbox shows it as a
  note. Pictures left from an earlier export stay in the assets folder.

## What goes into the document

The title, author, date and language come from the first note's front matter:

| Of the document | From the front matter |
| --- | --- |
| The title | `title`. Without one, the note's first heading, else its file's name |
| The author | `author` (or `authors`) |
| The date | `date` |
| The language | `lang` (or `language`) |

What becomes of each part of a note:

- **A chapter per note.** Each starts with a title. It's the note's own top-level heading (`# Coffee`) when the note
  opens with one, else the note's title.
- **Links to the notes exported** stay links, inside the document. They go to the chapter, or to the heading they
  name. A link to a heading the document doesn't hold goes to the chapter.
- **Links to anything else** (a note not exported, a file, nothing) become their text. A wikilink becomes its alias,
  where it has one.
- **Links to the web, mail and phone numbers** (`https:`, `mailto:`, `tel:`, `ftp:`) are kept. A link of any other kind
  (`javascript:`, `file:`) becomes its text.
- **Embeds** are drawn in when a paragraph holds only embeds. `![[tea]]`, `![[tea#Green]]`, `![[tea#^block]]` and
  `![](tea.md)` put that note, or that part of it, in place, up to three deep.
  - An embedded note's links and pictures are found from where that note is.
  - A note already being drawn in is a link instead, so an embed can't loop.
- **Pictures** are found as on screen ([Reading](reading.md)): a path from the note's folder, or `![[name]]` by name.
  - A picture on the internet is included when slipbox has a copy of it, kept when you had it shown on screen.
    Otherwise it's a link to its address.
  - Only the vault's pictures go in. A picture outside the vault, where it really is, becomes its description (the
    words in its brackets) in Word, PDF, a web page or an e-book. In Markdown, it becomes a link to it. A link inside
    the vault leading out counts as out.
  - A picture that isn't there, or can't be read, becomes its description too.
- **Diagrams and maths.** A Mermaid diagram is drawn as a picture, dark on white. A kind slipbox doesn't draw stays as
  its code. Maths is typeset.
- **Callouts** (`> [!tip] Try it`) become a quote, with its title in bold on a line of its own.
- **Footnotes** stay with their note. Two notes' `[^1]` are two footnotes.
- **Tags** are their text.
- **Left out** are front matter, link definitions and blocks of HTML. In a line, `<br>` is a line break, and any other
  tag is dropped, its words kept. Nothing a note holds can run in a document made from it.

## What an export never does

- **It never writes over a note**, of this vault or any other. The one exception is an earlier Markdown export, which
  its front matter marks.
- **It never writes over another file without asking**, unless the file is an earlier export. On the command line,
  `--force` is the answer.
- **It never reaches the network.** A picture on the internet comes from slipbox's own copy, or stays a link. See
  [Privacy](privacy.md).
- **It never takes in a file from outside the vault.** A note someone else wrote can name a picture elsewhere on your
  machine. That picture stays out of the document, its description in its place, or a link to it in Markdown.
- **It never runs another program**, and never installs anything. Every format is written by slipbox itself.
- **It never changes your notes.** In slipbox, unsaved notes are saved first, as you'd see them on screen.

## Limits

- **A folder that isn't there yet needs its `/` at the end** on the command line. Without it, `-o` names a file.
- **An earlier export is known by its mark alone** ([Earlier exports](#earlier-exports)). One you changed in another
  program is still replaced if it kept the mark.
- **A footnote referred to inside an embedded section**, but written outside that section, isn't drawn in.
- **Some pictures can't be read:** a BMP compressed with run-length encoding, or a damaged file. Each becomes its
  description.
- **PDF and emoji.** Emoji are drawn in black and white, and only where a font that draws them is on your machine:
  Noto Emoji, OpenMoji, Symbola or Segoe UI Symbol. Without one, an emoji is a box. Colour emoji fonts can't be used.
- **PDF without fonts.** On a machine with no fonts at all, slipbox can't make a PDF. It says
  `no font found on this machine for a PDF (looked in its font folders)`. Install a font package (DejaVu, Liberation or
  Noto) and export again.
- **Pages are A4**, in Word and PDF.

## HTML inside Markdown notes

Word, PDF, HTML and EPUB exports translate supported document HTML through the same adapter as READ.
Headings, paragraphs, emphasis, code, links and supported local images remain document content.
Details are always expanded, with the summary before the body. Pictures use their img fallback for these exports,
which have no explicit terminal theme. Images on the web use only an already cached copy; exporting fetches nothing.

These formats have their own page layout. Container alignment, percentage sizes and arbitrary CSS are not reproduced
as browser layout. Pixel image bounds, supported inline formatting and readable children are retained.

A Markdown export keeps the note's HTML as written, including attribute spelling, whitespace, comments and picture
alternatives. It removes only omitted non-document content such as scripts, styles and frames. It does not rewrite
HTML into Markdown, relocate URLs inside that HTML, or copy images referenced only by HTML. If the export moves,
keep those relative assets beside it or update their paths yourself.

The exact supported subset is in [HTML in Markdown](reading.md#html-in-markdown).
