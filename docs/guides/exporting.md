# Exporting notes

When a note has to go to someone who doesn't use slipbox, export it: as a Word document, a PDF, a web page, an e-book,
or Markdown to take elsewhere. One note, or several as one document. slipbox writes every format itself, so nothing
needs installing, and nothing is fetched from the network while it does.

## Export a note

1. Open the note, say `ideas/coffee.md`, and press `space n o` (or type `:export`).
2. A list of formats opens: Word (.docx), PDF (.pdf), Web page (.html), E-book (.epub), Markdown (.md). Type to narrow
   it (`pdf`), or move with `down` and `up`, then press `enter`. `:export pdf` skips the list.
3. A Save As window opens: places down its left (beside the note, your last export's folder, your Downloads, Desktop,
   Documents and home folders, this root), the folder's contents on the right, and the file's name at the bottom,
   filled in: `coffee.docx`, in the note's folder the first time. Press `enter` to export there.
4. A message says `exporting to ideas/coffee.docx…`, then
   `exported ideas/coffee.md to ideas/coffee.docx (Word (.docx))`.

To put it elsewhere, `tab` moves between the places, the folder and the name. In the folder, `enter` goes into a folder
and `left` goes up; or type a path as the name (`~/Desktop/coffee.docx`). The window opens where you exported last the
next time. A file already there is replaced only after you answer `y`, and a note is never written over.

Unsaved changes are saved first, since an export reads the notes from disk.

## Several notes as one document

1. Press `space n shift+o` (or type `:export-notes`). The root's notes are listed, the one on screen already picked,
   numbered `1`.
2. Type to find a note and press `enter` to add it: its number says its place. What you typed stays; `backspace`
   clears it for the next. `enter` on a picked note takes it out.
3. When they're in the order you want, press `enter` on the first row, `Export these 3 notes…`, then pick the format
   and the place as above.

Each note is a chapter, in that order, starting on a new page in Word and PDF. A link from one of them to another
becomes a link inside the document, to its chapter or its heading.

## From the command line

```bash
cd ~/notes
slipbox export ideas/coffee                                   # Word, beside the note: ideas/coffee.docx
slipbox export ideas/coffee --to pdf                          # or html, epub, md
slipbox export inbox ideas/coffee -o ~/Desktop/notes.docx     # two notes, one document
```

`--to` names the format; without it, the extension of `-o`'s file does, else it's Word. Each run prints where the
document went. An agent can export too ([Working with agents](agents.md)); the skill tells it to only when you ask.

## What each format gives you

- **Word** (`.docx`): A4 pages, the note's headings as Word's own heading styles, Word's footnotes, tables with a
  header row repeated on each page.
- **PDF** (`.pdf`): A4 pages numbered at the foot, set in a font found on your machine, with an outline of the
  chapters to jump through.
- **Web page** (`.html`): one file holding everything, pictures included, so it can be mailed, opened anywhere and
  printed.
- **E-book** (`.epub`): a chapter per note and a contents page, for an e-reader.
- **Markdown** (`.export.md`): one file for GitHub or any editor, its pictures copied into a folder beside it
  (`coffee.export.assets/`). Diagrams, maths and callouts stay as written, for the next app to draw.

In every format, embedded notes (`![[note]]`) are drawn in as they are on screen, and tags are plain text. In all but
Markdown, Mermaid diagrams and display maths become pictures, and code is coloured. [Exporting](../manual/export.md)
has every detail.

## Check it before you send it

- **Links to notes you didn't export** become plain text: the reader can't follow them. Export those notes too, or
  say where to find them.
- **The title, author and date** come from the first note: its front matter's `title`, else its first heading, else
  its file name; `author` and `date` where it has them. The rest of the front matter is left out, so anything in it
  the reader needs belongs in the text.
- **Pictures.** A missing one becomes its alt text. One from the web goes in only if slipbox has already fetched it to
  show you (follow it with `enter` and say yes); otherwise it's a link.
- **PDF.** The fonts are your machine's, so a character none of them has is a box, and emoji come out black and white.
- **A Markdown export inside the folder** holds copies of your pictures under the same names, which can make a
  picture linked by name, `![[photo.png]]`, match two files. Export it outside the folder with `-o`, or delete it once
  it's sent.

Open the document once yourself before you send it.

## Where next

- [Exporting](../manual/export.md): every format, what each keeps, and the limits.
- [The command line](../manual/cli.md): `slipbox export` and its options.
