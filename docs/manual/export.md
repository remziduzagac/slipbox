# Exporting

An export turns a note, or several notes, into a document for someone who doesn't use slipbox: a Word file, a PDF, a
web page, an e-book, or a single Markdown file to take elsewhere. Several notes become one document, a chapter each.
slipbox writes every format itself: no other program runs, nothing is installed, and nothing is fetched from the
internet. Your notes are only read; the export is a new file, beside the note unless you say where.

This chapter covers asking for an export in slipbox and from the command line, choosing where it goes, what each
format keeps, and the limits. For a walk through a first export, see [Exporting notes](../guides/exporting.md).

## Exporting a note

Press `space n o` (or type `:export`). slipbox exports the note on screen, or, when the explorer has the focus, the note
selected in it. A file that isn't a note (a picture, a data file) is not exported, and slipbox says so.

1. **Pick the format** from the list: Word, PDF, a web page, an e-book or Markdown. To skip the list, name it:
   `:export pdf` (the names are in [The formats](#the-formats); `:export` completes them).
2. **Choose where it goes**, in the Save As window: it opens beside the note, the note's name filled in, so `enter`
   exports there at once. [Choosing where it goes](#choosing-where-it-goes) has the rest.
3. **slipbox writes it.** The message line says `exporting to ideas/coffee.docx…`, then
   `exported ideas/coffee.md to ideas/coffee.docx (Word (.docx))`, or why it couldn't.

An export reads the notes from disk, so a note with unsaved changes is saved first, as on screen. If one can't be saved
because its file changed on disk while you were editing it, the export stops and says so: settle the change with
`space n c` (see [Editing](editing.md)), then export again.

## Several notes as one document

Press `space n shift+o` (or type `:export-notes`). A list of the root's notes opens: the root is the folder slipbox
treats as the top of your notes ([Links and roots](links-and-roots.md)).

- **Pick the notes in the order you want them.** The note on screen (or the one selected in the explorer) is picked
  already. Each pick shows its number; picking a note again takes it out.
- **Type to filter the list.** What you typed, and where you were, stay between picks.
- **The first row is "Export these 3 notes…"**, whatever you've typed. `enter` on it asks for the format and where the
  document goes, as for one note.

Each note becomes a chapter, in the order picked. The document is named after the first note, and takes its title,
author, date and language from it ([What goes into the document](#what-goes-into-the-document)).

## Choosing where it goes

The Save As window has three parts: places down the left, the folder you're in on the right (its folders, then its
files, each with its size and date), and the file's name at the bottom, with Export and Cancel buttons.

The places are:

- **Beside the note**, the folder the (first) note is in.
- **Last export**, the folder you exported to last from this root, while it's still there. The window opens there
  when there is one.
- **Downloads**, **Desktop**, **Documents** and **Home**, those you have. On Linux, your desktop's own names for them
  are used.
- **This root**, the top of your notes.

The keys:

| Key | What it does |
| --- | --- |
| `tab`, `shift+tab` | move between the places, the folder and the name |
| `up`, `down` | move in the places or the folder; in the name, go to the folder |
| `enter` or `right` | in the places, go there; in the folder, open a folder, or take a file's name |
| `left` or `backspace` | in the folder, go up (or `enter` on `‥`) |
| typing | in the folder, jump to the entry that starts so (the same letter again: the next one) |
| `.` | in the folder, typed first: show the hidden files and folders too |
| `~` | in the folder, go to your home folder |
| `ctrl+n` | make a folder here (type its name, then `enter`) and go into it |
| `enter` | in the name, export |
| `esc` | cancel |

The name may be a path, from the folder shown, or from your home folder with `~/`. A name that is a folder goes into
it; one ending in `/` is a folder too, made if it isn't there (`drafts/2026/`). With the mouse, click a place to go
there, an entry to pick it (and again to open it), the name to type in it; the wheel scrolls, and a click outside the
window cancels.

If a file of that name is there already, slipbox asks `ideas/coffee.docx is there — replace it?`: `y` replaces it, `n`
takes you back to the window. A note is never replaced, in this root or another: slipbox says so and keeps the window
open (the one exception is an earlier Markdown export, which slipbox asks about as it does any file).

## From the command line

```text
slipbox export <note…> [--to <format>] [-o <path>]
```

```bash
slipbox export ideas/coffee.md                      # ideas/coffee.docx, beside the note
slipbox export ideas/coffee.md --to pdf             # ideas/coffee.pdf
slipbox export ideas/coffee.md -o ~/Desktop/        # ~/Desktop/coffee.docx
slipbox export ideas/coffee.md -o sent/2026/        # sent/2026/coffee.docx, the folder made
slipbox export inbox.md ideas/coffee.md -o both.epub  # one e-book, two chapters
```

- **The notes** are named as every command names them: a path, or a note's name ([The command line](cli.md)). Several
  make one document, a chapter each, in the order given.
- **The format** is `--to`'s: a name such as `pdf`, another name for it such as `word`, or an extension such as
  `.docx`. Without `--to`, it's the extension of `-o`'s file; without either, Word. A format slipbox doesn't write is a
  usage error (exit 2).
- **Where it goes** is `-o` (or `--out`), from the folder you're in. A folder that exists, or a path ending in `/`,
  gets the first note's name in it, the folder made if it isn't there; any other path is the file's name, its folders
  made as needed. Without `-o`, the document goes beside the first note, under its name.
- **A file already there is replaced**, without asking, as `-o` does in any tool. A note is never replaced, of this
  root or any other: slipbox says `ideas/coffee.md is a note — an export doesn't write over it` and exits with 5. An
  earlier Markdown export is the exception, and is replaced.
- **What it says:** `exported ideas/coffee.md to ideas/coffee.docx (Word (.docx))`, with `, 3 files beside it` when it
  wrote some (a Markdown export's pictures). With `--json`, the data is `{path, format, notes, bytes, files}`.

The command line exports any text file you name, read as Markdown; slipbox itself exports only notes.

## The formats

| Format | `--to` (other names) | Its file | Good for |
| --- | --- | --- | --- |
| Word | `docx` (`word`, `doc`) | `coffee.docx` | editing, sending to people who use Word |
| PDF | `pdf` | `coffee.pdf` | printing, and sending something that looks the same everywhere |
| A web page | `html` (`htm`, `web`) | `coffee.html` | a browser, mailing, printing |
| An e-book | `epub` (`ebook`) | `coffee.epub` | an e-reader |
| Markdown | `md` (`markdown`) | `coffee.export.md` | GitHub, or another editor |

Word, PDF, the web page and the e-book look alike: dark text on white, in GitHub's light colours, whatever your theme;
code in colour, its keywords, strings and comments told apart; a callout with a bar in its kind's colour; a task's box
as `☐` or `☑`; Obsidian's `==highlight==` on a marker's yellow.

Obsidian's `%%comments%%` are left out of every format, Markdown's too: what you'd never see reading the note isn't in
what you send.

### Word

A Word document (`.docx`) on A4 pages, in Calibri, code in Consolas.

- Each chapter starts on a new page. Headings are Word's own Heading 1 to 6, so they show in Word's navigation pane, and
  links inside the document go to them.
- Numbered lists keep their own start (a list starting at 5 stays at 5). Tables have borders and a header row, repeated
  on each page. Footnotes are Word's own.
- Pictures are shown at their size, up to the page's width. Diagrams and displayed maths are pictures; maths in a line
  is text, in italics.

### PDF

A PDF on A4 pages, set in fonts found on your machine and embedded in the file.

- **Fonts.** slipbox looks in your system's and your own font folders for a sans-serif family (DejaVu Sans, Liberation
  Sans, Noto Sans, Arial, Helvetica, Segoe UI and others) and a monospaced one for code. A character those fonts don't
  have is taken from another font that has it: symbols, emoji, Chinese, Japanese or Korean, where you have such fonts.
  One no font has is shown as a box.
- **Chapters** start on a new page, and the PDF's outline (the bookmarks your viewer shows) lists them and their
  sections. Each page has its number at its foot.
- **Links** are blue, and work: to the web, or to a chapter or heading inside the document. A footnote's number links
  to its note, listed under "Notes" at the end of its chapter.
- **Pictures** alone in a paragraph are centred, up to the page's width and height; a picture inside a sentence stays
  in its line. Maths is typeset.
- **Code** is on a tinted band, and may break across pages. A table's row is never split, and its header row comes
  again on a new page.
- **Text can be copied and searched**, its words apart.

### A web page

One HTML file holding everything, pictures included, so it can be mailed, opened anywhere and printed.

- Pictures, diagrams and maths are inside the file. A picture on the internet that slipbox has no copy of is a link to
  it.
- Code is coloured. The page is at most a comfortable reading width on a screen.
- Printed, each chapter starts a new page, and no picture, table or block of code is split.
- The page holds no script, and nothing in it reaches the network until you follow one of its links.

### An e-book

An EPUB 3 e-book: a file per chapter, a contents page listing the chapters and their sections, and its pictures inside.
Exporting the same notes again gives the book the same identity, so it is the same book, updated.

### Markdown

A single Markdown file you can take to GitHub or any editor, named `coffee.export.md` so that it never takes a note's
place.

- **Pictures** are copied into a folder beside it, `coffee.export.assets/`, and linked from there: those from inside
  the root, and only files that really are pictures. Anything else a picture's link names, a text file or a picture
  from outside the root, isn't copied: it becomes a link to where it is. A picture's size written Obsidian's way
  (`|240`) is kept. A picture on the internet slipbox has no copy of stays a picture at its address, so whatever shows
  the file fetches it.
- **Its pictures don't answer to their names.** slipbox looks for `![[photo.png]]` everywhere in the root but in a
  folder ending `.export.assets`, so an export beside your notes never takes the place of the picture it copied. A
  path through the folder (`![[coffee.export.assets/photo.png]]`) still reaches the copy.
- **Kept as written**, since Markdown viewers draw them themselves: a Mermaid diagram as its code, maths as `$…$` and
  `$$`, a callout as `> [!tip] Its title`, a highlight as `==…==`.
- **Links inside the document** go to the headings as GitHub names them. Footnotes are numbered `[^1]`, `[^2]` in the
  order they're referred to, across the whole document.
- **Its front matter** has the title, author, date and language, and the line `generator: slipbox`. That line marks it
  as an export, so a later export may replace it, though it's a Markdown file in your folder and slipbox shows it as a
  note. Pictures left from an earlier export stay in the assets folder.

## What goes into the document

- **The title, author, date and language** come from the first note's front matter: `title`, `author` (or `authors`),
  `date`, `lang` (or `language`). Without a title, it's the note's first heading, else its file's name.
- **A chapter per note.** Each starts with a title: the note's own top-level heading (`# Coffee`) when it opens with
  one, else the note's title.
- **Links to the notes exported** stay links, inside the document: to the chapter, or to the heading they name. A link
  to a heading the document doesn't hold goes to the chapter.
- **Links to anything else** (a note not exported, a file, nothing) become their text: a wikilink's alias where it has
  one. Links to the web, mail and phone numbers (`https:`, `mailto:`, `tel:`, `ftp:`) are kept; a link of any other
  kind (`javascript:`, `file:`) becomes its text.
- **Embeds** are drawn in, when a paragraph holds only embeds: `![[tea]]`, `![[tea#Green]]`, `![[tea#^block]]` and
  `![](tea.md)` put that note, or that part of it, in place, up to three deep. Its links and pictures are found from
  where that note is. A note already being drawn in is a link instead, so an embed can't loop.
- **Pictures** are found as on screen ([Reading](reading.md)): a path from the note's folder, or `![[name]]` by name. A
  picture on the internet is included when slipbox has a copy of it, kept when you had it shown on screen; otherwise
  it's a link to its address. A picture that isn't there, or can't be read, becomes its description (the words in its
  brackets).
- **Diagrams and maths.** A Mermaid diagram is drawn as a picture, dark on white; a kind slipbox doesn't draw stays as
  its code. Maths is typeset.
- **Callouts** (`> [!tip] Try it`) become a quote with its title in bold on a line of its own.
- **Footnotes** stay with their note: two notes' `[^1]` are two footnotes.
- **Tags** are their text.
- **Left out:** front matter, link definitions and blocks of HTML. In a line, `<br>` is a line break and any other tag
  is dropped, its words kept. Nothing a note holds can run in a document made from it.

## What an export never does

- **It never writes over a note**, of this root or any other. The one exception is an earlier Markdown export, which
  its front matter marks.
- **It never reaches the network.** A picture on the internet comes from slipbox's own copy, or stays a link. See
  [Privacy](privacy.md).
- **It never runs another program**, and never installs anything: every format is written by slipbox itself.
- **It never changes your notes.** In slipbox, unsaved notes are saved first, as you'd see them on screen.

## Limits

- **A picture is read wherever its link points**, outside the root too: a note someone else wrote can name a picture
  elsewhere on your machine, and a Word, PDF, web page or e-book export would hold it. A Markdown export copies only
  the root's pictures. Look through an export of a note you didn't write before you send it.
- **From the command line, a file at `-o` is replaced without asking**, unless it's a note. A folder that isn't there
  yet needs its `/` at the end; without it, `-o` names a file.
- **A footnote referred to inside an embedded section**, but written outside that section, isn't drawn in.
- **Some pictures can't be read:** a BMP compressed with run-length encoding, or a damaged file. Each becomes its
  description.
- **PDF and emoji.** Emoji are drawn in black and white, and only where a font that draws them is on your machine (Noto
  Emoji, OpenMoji, Symbola, Segoe UI Symbol); without one, a box. Colour emoji fonts can't be used.
- **PDF without fonts.** On a machine with no fonts at all, slipbox can't make a PDF, and says
  `no font found on this machine for a PDF (looked in its font folders)`. Install a font package (DejaVu, Liberation or
  Noto) and export again.
- **Pages are A4**, in Word and PDF.
