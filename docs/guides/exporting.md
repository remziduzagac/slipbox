# Exporting and sharing notes

<a id="exporting-notes"></a>

Choose a saved practice note, export it and inspect the result before sharing. You need a writable destination outside
the notes you want to keep. This guide ends with a file you have checked, not an automatic upload.

When a note has to go to someone who doesn't use slipbox, export it. It can be a Word document, a PDF, a web page, an
e-book, or Markdown to take elsewhere. You can export one note, or several as one document.

slipbox writes every format itself. Nothing needs installing, and nothing is fetched from the network while it does.

## Export a note

1. Open the note, say `ideas/coffee.md`.
2. Press `space n o`, or type `:export`. A list of formats opens: Word (.docx), PDF (.pdf), Web page (.html), E-book
   (.epub), Markdown (.md).
3. Press `enter` to take Word, the first. For another format, type to narrow the list (`pdf`), or move with `down`
   and `up`, then press `enter`. A Save As window opens:
   - Down its left are places: beside the note, your last export's folder, your Downloads, Desktop and Documents
     folders (those you have), your home folder and this vault.
   - On the right are the folder's contents.
   - At the bottom is the file's name, filled in. The first time, it's `coffee.docx`, in the note's folder.

   ![The Save As window: places on the left, the folder on the right, the file name filled
   in](../images/exporting-save-as.png)

4. Press `enter` to export there. A message says `exporting to ideas/coffee.docx…`, then
   `exported ideas/coffee.md to ideas/coffee.docx (Word (.docx))`.

`:export pdf` skips the list of formats.

To put the file elsewhere:

- `tab` moves between the places, the folder and the name.
- In the folder, `enter` goes into a folder and `left` goes up.
- Or type a path as the name (`~/Desktop/coffee.docx`). A name ending in `/` is a folder, made if it isn't there.

The next time, the window opens where you exported last. An earlier export already there is replaced. Any other file
is replaced only after you answer `y`, and a note is never written over.

An export reads the notes from disk, so unsaved changes are saved first.

## Several notes as one document

1. Press `space n shift+o`, or type `:export-notes`. The vault's notes are listed. The one on screen is already picked,
   numbered `1`.
2. Type to find a note, and press `enter` to add it. Its number says its place. What you typed stays, and `backspace`
   clears it for the next. `enter` on a picked note takes it out.
3. When they're in the order you want, press `enter` on the first row, `Export these 3 notes…`.
4. Pick the format and the place, as above.

Each note is a chapter, in that order. In Word and PDF, each starts on a new page. A link from one of them to another
becomes a link inside the document, to its chapter or its heading.

## From the command line

```bash
cd ~/notes
slipbox export ideas/coffee                                   # Word, beside the note: ideas/coffee.docx
slipbox export ideas/coffee --to pdf                          # or html, epub, md
slipbox export inbox ideas/coffee -o ~/Desktop/notes.docx     # two notes, one document
slipbox export ideas/coffee -o ~/Desktop/sent/                # into a folder, made if it isn't there
```

`--to` names the format. Without it, the extension of `-o`'s file names it. Without either, it's Word. Each run prints
where the document went. An earlier export there is replaced; any other file is left alone unless you add `--force`.

An agent can export too ([Working with agents](agents.md)). The skill tells it to export only when you ask.

## What each format gives you

- **Word** (`.docx`): A4 pages, the note's headings as Word's own heading styles, Word's footnotes, and tables with a
  header row repeated on each page.
- **PDF** (`.pdf`): A4 pages, numbered at the foot. The text is set in a font found on your machine. An outline of the
  chapters lets you jump through them.
- **Web page** (`.html`): one file holding everything, pictures included. It can be mailed, opened anywhere and
  printed.
- **E-book** (`.epub`): a chapter per note and a contents page, for an e-reader.
- **Markdown** (`.export.md`): one file for GitHub or any editor. Its pictures are copied into a folder beside it
  (`coffee.export.assets/`), but only those of the vault. The rest are linked where they are. Diagrams, maths and
  callouts stay as written, for the next app to draw.

In every format, embedded notes (`![[note]]`) are drawn in as they are on screen. Tags are plain text.

In every format but Markdown, Mermaid diagrams and display maths become pictures, and code is coloured.

[Exporting](../manual/export.md) has every detail.

## Check it before you send it

- **Links to notes you didn't export** become plain text. The reader can't follow them. Export those notes too, or
  say where to find them.
- **The title, author and date** come from the first note. The title is its front matter's `title`, else its first
  heading, else its file name. The author and date are its `author` and `date`, where it has them. The rest of the
  front matter is left out. So anything in it the reader needs belongs in the text.
- **Pictures.** A missing one becomes its alt text. One from the web goes in only if slipbox has already fetched it to
  show you. To fetch it, follow it with `enter` and say yes. Otherwise it's a link.
- **PDF.** The fonts are your machine's. A character none of them has is a box, and emoji come out black and white.
- **Pictures from elsewhere.** A note can name a picture outside the vault. No export takes it in. Word, PDF, a web
  page and an e-book show its alt text in its place. A Markdown export links to it. If the picture belongs in the
  document, move it into the vault.

Open the document once yourself before you send it.

## Where next

- [Exporting](../manual/export.md): every format, what each keeps, and the limits.
- [The command line](../manual/cli.md): `slipbox export` and its options.

**Next:** [Working with agents](agents.md).
