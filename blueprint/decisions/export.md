# Decisions: export

## D178: Export belongs in scope (10.x, 2026-09-25)

**Decision:** Export to PDF, DOCX and friends is in slipbox's scope, as phase 6+ work (`10.x`).

**Why:** Export to PDF is an Obsidian core feature, and it was on neither list of the feature sort: a gap.

## D179: The work is link rewriting, in an assembler of its own (10.1, 2026-09-25)

> **Amended by D32 (2026-10-01):** the context bundle doesn't go through the assembler: an agent reads a note's
> links as they are.

**Decision:** Before any writer runs, slipbox turns a vault's note into a standalone document, in a stage of its own
that every writer consumes, not inside any one export command:

1. assemble the source: one note, a note with its `![[embeds]]` resolved inline, or a composed set of notes in a
   chosen order (`10.9`);
2. rewrite wikilinks: each by whether its target is inside the export set, an internal anchor if it is, an external
   reference or plain styled text if it isn't;
3. resolve image and asset paths, or the converter silently drops them;
4. map frontmatter to the document's metadata: `title`, `author`, `date`.

How it does each now: design/export.md § The assembler.

**Why:** Conversion is a solved problem someone else owns; turning a vault note into a standalone document is
slipbox's, whichever writer runs afterwards. `[[note]]` means nothing to any converter, and a document full of literal
`[[brackets]]` is how you can tell a tool bolted export on afterwards. Composing notes into one document is the same
machinery with a different entry point. The context bundle for agents was expected to be the same pipeline with a
Markdown writer, one more reason for a separate stage.

## D180: Export needs nothing installed but slipbox (10.x, 2026-09-25)

> **Amended by D184 (2026-10-09):** no tool at all, optional or not: every format TypeScript or JavaScript.

**Decision:** slipbox exports on its own: export works with nothing installed but slipbox itself. pandoc may be an
optional enhancement, never the mechanism: the same rule as multiplexers and image protocols (D3).

**Why:** slipbox is a standalone application (D3). It is achievable because the JavaScript ecosystem
covers the formats that matter, and because most export targets are structure rather than layout (D181).

**Not chosen:** pandoc as the engine, a hard dependency (ideas.md § Export).

## D181: slipbox writes HTML, Markdown, DOCX, PDF and EPUB itself (10.2–10.6, 2026-09-25)

> **Detailed by D186 (2026-10-09):** the PDF is pdfkit's (`10.5`).
>
> **Detailed by D188 (2026-10-09):** the PDF's lines are laid out by slipbox (`10.11`).

**Decision:** Each format is written in process: HTML by one more mdast pass (`remark-rehype`, `rehype-stringify`);
Markdown by `remark-stringify`; DOCX by the `docx` package's declarative document model; PDF by `pdfkit` or
`@react-pdf/renderer`, left open (`10.5`); EPUB as a zip of XHTML and an OPF manifest, built on the HTML writer. The
libraries are the shapes of the answer, not pinned choices: each one's current state is checked before committing.
The first PDF is scoped honestly: headings, paragraphs, lists, code blocks, links, images, and tables that fit a page;
good enough to hand someone a note, not a typesetting engine. What each writer does now: design/export.md.

**Why:** DOCX is easier than PDF, which is counterintuitive. A `.docx` carries structure (headings, paragraphs, runs,
lists, tables, images, hyperlinks) and Word does the layout, so mdast maps onto it almost node for node: no
pagination, no line breaking, no font metrics to get right. PDF is the opposite: slipbox owns every typesetting
decision (page breaks, widows and orphans, tables that outgrow a page, code blocks, image placement). That is where
the effort is, and where a first version will visibly trail pandoc.

## D182: Optional tiers above the native writers (10.7, 10.8, 2026-09-25)

> **Superseded by D184 (2026-10-09):** no external tool; both tiers dropped (`10.7`, `10.8`).

**Decision:** Three tiers. Native: always available, no detection, the only thing documented as guaranteed. A
headless browser, if one is present, printing slipbox's own HTML to PDF (`10.7`). pandoc, if installed and configured
with a path and extra arguments, its targets (ODT, RTF, LaTeX, reST, MediaWiki, its own PDF engines) offered as
additional entries, marked as pandoc's (`10.8`). A native format never routes through an optional tier: a nicer DOCX
from pandoc is a preference to offer, not a reason to drop the native writer. Nothing degrades in slipbox's own
formats: they work or there is a bug. A missing tier's formats don't appear in the menu, with one line saying why.

**Why:** A browser's print-to-PDF gives real CSS typesetting, better fidelity than `pdfkit` for anything print-shaped.
The pipeline was proven here: `<dotfiles>/docs/cheatsheets/print-cheatsheet.sh` has Chrome's `--print-to-pdf` honour
`@page` and `column-count`, and slipbox can emit that HTML itself, so it needs only a browser. pandoc is the escape
hatch for the long tail of formats, not the engine.

## D183: Google Docs by a Word file, uploaded (2026-09-25)

**Decision:** Google Docs is reached by exporting DOCX, then uploading it. slipbox has no API client, no OAuth and no
stored credentials.

**Why:** Docs imports DOCX well, and with DOCX native this path has no external dependency at all: no pandoc, no
browser, no API client, no OAuth, no stored credentials. A local notes app over a private vault should not become a
credential holder to save a drag-and-drop.

**Not chosen:** uploading through Google's API, with the credentials it needs (ideas.md § Export). A one-step upload by
a detected `rclone` or `gdrive` CLI, if ever wanted, stays an open idea (ideas.md § Export).

## D184: No external tool: every format TypeScript or JavaScript (10.7, 10.8, 2026-10-09)

> **Clarified by D192 (2026-10-09):** weak copyleft is accepted for use; export draws with `elkjs` (EPL-2.0) and resvg
> (MPL-2.0).

**Decision:** Decided with the user: no external tool. Every format is written by TypeScript or JavaScript under a
permissive licence, and a format that would need a tool isn't offered. The headless-browser tier (`10.7`) and the
pandoc tier (`10.8`) are dropped. This supersedes D182 and amends D180.

**Why:** Both tiers need a tool. Under the standalone rule (D180) the native writers were already the only formats
guaranteed, and they cover the formats that matter (D181). The licence follows the rule for every dependency (D192).

**Not chosen:** the headless-browser tier; the pandoc tier (ideas.md § Export).

## D185: Word first; an export beside its note by default (10.4, 2026-10-09)

> **Detailed by D190 (2026-10-09):** in the TUI, a Save As window opens where you exported last, else beside the
> note.

**Decision:** Decided with the user: Word comes first (`10.4`), then the rest. An export goes beside its note by
default, under its name: `notes/report.md` gives `notes/report.docx`. Detail: design/export.md § Asking for one.

**Why:** No reason of the day's own is recorded. Behind Word first stands D181's assessment, DOCX the tractable format
because Word does the layout, and D183's path to Google Docs through a Word file.

## D186: PDF by pdfkit (10.5, 2026-10-09)

**Decision:** The PDF writer is `pdfkit` (MIT), set in the machine's own fonts, embedded. This settles `10.5`, the one
export choice left open (D181). Detail: design/export.md § PDF.

**Why:** Of the two weighed, `pdfkit` is the lower-level, less coupled option. No further reason is recorded; its
lower level is what D188 builds on.

**Not chosen:** `@react-pdf/renderer`, worth a look for its flexbox layout, the mental model slipbox already has
through OpenTUI (ideas.md § Export).

## D187: A picture a format doesn't hold is made PNG first (10.10, 2026-10-09)

**Decision:** Before a writer runs, every picture of a kind its format doesn't hold is decoded and written again as a
PNG, once a file: a BMP decoded by slipbox, a GIF's first frame drawn by resvg, a WebP decoded by libwebp compiled to
WebAssembly (`@jsquash/webp`), embedded in a compiled slipbox. Detail: design/export.md § Pictures made PNG.

**Why:** Each format holds some kinds of picture and not others: Word no WebP, PDF only PNG and JPEG, an e-book no
BMP. Converted first, the writers see only what they take. libwebp as WebAssembly runs inside slipbox, so no tool is
asked for (D184).

## D188: The PDF's lines laid out by slipbox (10.11, 2026-10-09)

**Decision:** slipbox lays out a PDF's lines itself, no longer `pdfkit`: words and pictures together, broken where
Unicode lets a line break (UAX #14, by `linebreak`, MIT), each run on one baseline. So a picture in a sentence stays in
its line, maths in a line sits on the baseline, and inline code is on a tint. Detail: design/export.md § PDF.

**Why:** `pdfkit`'s lines hold only text.

## D189: Emoji in a PDF in black and white; colour deferred (10.12, 10.13, 2026-10-09)

**Decision:** A PDF's emoji come from a font that draws them in black and white (Noto Emoji, OpenMoji's black,
Symbola, Segoe UI Symbol), where the machine has one (`10.12`). Colour emoji (`10.13`) are deferred: the colour emoji
font's own pictures, set in a line as D188 sets pictures.

**Why:** A colour emoji font (Apple's, Noto Color Emoji) has pictures, not outlines, and a PDF's text can't use it.

**Cost:** On a machine without a black-and-white emoji font, an emoji is a box.

## D190: Where an export goes, in a Save As window (10.14, 2026-10-09)

**Decision:** In the TUI, after the format, a Save As window says where: places down its left (beside the note, the
last export, Downloads, Desktop, Documents, home, this root), the folder on the right, the file's name at the bottom.
It opens where you exported last, kept for the root, else beside the note (D185), with the note's name filled in. The
CLI keeps `-o`. Detail: design/export.md § Asking for one.

**Why:** One window instead of a list of places, a tree, a browser and a prompt, which it replaced the same day. With
the name filled in, `enter` exports at once.

**Not chosen:** places, then a folder from the root's tree or one browsed anywhere, then the name, one step after
another (ideas.md § Export).
