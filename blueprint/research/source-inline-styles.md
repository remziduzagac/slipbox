---
status: current
created: "2026-11-10"
---

# Research: how editors show Markdown's inline styles with the markers kept

How seven editors draw `**bold**`, `*italic*` and `~~struck~~` while the markers are on screen: the markers dimmed, in
the style's own look, or hidden; the text's look; an unclosed marker and emphasis across lines; and what users ask to
switch off. Issue #103 asked for it before [SIS](../workstreams/source-inline-styles/README.md) decided how SOURCE view
shows them (SIS-D1, SIS-D2).

Provenance: every page was fetched on 2026-11-10 through a tool that summarises it and quotes at most a short passage,
so *summary* marks what that summary said, a quoted rule included, never the whole file read; *search* marks what only
a search result's snippet said; *memory* marks what comes from memory, unchecked.

## Obsidian (closed source, CodeMirror 6)

- **Two modes.** Source mode "displays all Markdown syntax exactly as written"; Live Preview "shows formatted text
  inline while hiding most Markdown syntax", the syntax coming back when the cursor enters the formatted text.
  *summary*: <https://obsidian.md/help/edit-and-read>.
- **Source mode is styled, markers included.** A user asking how to switch the styling off in Source mode lists "Bold
  syntax has bold style" and "Italic syntax has italic style". *summary*:
  <https://forum.obsidian.md/t/how-to-completely-disable-any-syntax-style-preview-in-source-mode/62793>.
- **Dimming the markers is a user's CSS, not the default.** A thread asks for the bold and italic tokens
  (`span.cm-strong.cm-rm-strong-token`, `span.cm-em.cm-rm-em-token`) to be dimmer, and says the Minimal theme makes
  the asterisks more noticeable rather than less. *summary*:
  <https://forum.obsidian.md/t/css-snippets-help-reducing-intensity-of-markdown-tokens-and-more/40045>.
- **What users ask to switch off.** No setting turns Source mode's styling off; the answers are CSS snippets and a
  plugin. *summary*: the thread above. "Plain Source Mode" asks for the text strictly plain. *summary*:
  <https://forum.obsidian.md/t/plain-source-mode/104197>. The opposite asks Live Preview never to show the markers, and
  the cursor not to jump as they appear. *summary*:
  <https://forum.obsidian.md/t/to-hide-markdown-syntax-in-live-preview-so-it-doesn-t-show-formatting-markers/109155>.
- **Its parser.** CodeMirror 6's Lezer Markdown parser gives the markers a node of their own (`EmphasisMark`).
  *summary*: <https://discuss.codemirror.net/t/in-markdown-how-to-color-only-list-bullets/5512>. That the parser
  follows CommonMark is *memory*.

## VS Code (the built-in TextMate grammar)

- **Scopes.** The opening marker is `punctuation.definition.bold.markdown` (and `.italic.`, `.strikethrough.`), the
  span `markup.bold.markdown`. *summary*:
  <https://raw.githubusercontent.com/microsoft/vscode/main/extensions/markdown-basics/syntaxes/markdown.tmLanguage.json>.
- **Default themes.** `dark_vs.json` styles `markup.bold` with `"fontStyle": "bold", "foreground": "#569cd6"`,
  `markup.italic` italic in `#C586C0`, `markup.strikethrough` struck, and has no rule for the punctuation scopes: the
  markers take the span's look, never dimmed. *summary*:
  <https://raw.githubusercontent.com/microsoft/vscode/main/extensions/theme-defaults/themes/dark_vs.json> and
  `light_vs.json` beside it (bold `#000080`, italic `#800080`).
- **Across lines.** Bold and italic are begin/end rules, which can span lines; strikethrough is a single `match`, one
  line only. *summary*: the grammar above.
- **Switching off** is `editor.tokenColorCustomizations`' `textMateRules` over those scopes; no setting of its own was
  found. *summary*: <https://discourse.gohugo.io/t/dark-mode-markdown-colour-scheme-for-vs-code/39378>.

## Neovim (nvim-treesitter's `markdown_inline`)

- **Styles.** `(emphasis) @markup.italic`, `(strong_emphasis) @markup.strong`, `(strikethrough)
  @markup.strikethrough`, each on the whole node, markers included; the colour scheme says how they look. *summary*:
  <https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/main/runtime/queries/markdown_inline/highlights.scm>.
- **Markers.** The delimiters (`emphasis_delimiter`, `code_span_delimiter`) are captured only as `@conceal`, hidden
  when `conceallevel` is raised. *summary*: the same file. With `conceallevel=0` they'd show in the span's look: an
  inference, not tried.
- **Unclosed markers.** A tree-sitter parser makes a node only of a closed pair, so a lone `**` stays plain: *memory*.

## iA Writer (closed source)

- Its Markdown guide says only that "Auto-Markdown will give you instant feedback". *summary*:
  <https://ia.net/writer/support/basics/markdown-guide>. Its "Syntax Highlight" is parts of speech, not Markdown.
  *search*.
- That it shows the markers in a lighter grey is *memory*.

## Typora (closed source)

- The markers are hidden; the cursor moving into a styled span "will expand that element into the Markdown source".
  GFM's rule that underscores inside words aren't emphasis is kept. *summary*:
  <https://support.typora.io/Markdown-Reference/>.
- Source Code Mode shows all the markup. *search*.

## Zed

- **Styles.** `(emphasis) @emphasis.markup`, `(strong_emphasis) @emphasis.strong.markup`, `(strikethrough)
  @strikethrough.markup`, `(code_span) @text.literal.markup`; no rule for the delimiters, which take their span's look.
  *summary*: <https://raw.githubusercontent.com/zed-industries/zed/main/crates/grammars/src/markdown-inline/highlights.scm>.

## Emacs markdown-mode

- **Markers dimmed.** `markdown-markup-face` ("Face for markup elements") inherits `shadow`, with normal weight and
  slant; the text's faces inherit `bold` and `italic`, and `markdown-strike-through-face` strikes. *summary*:
  <https://raw.githubusercontent.com/jrblevin/markdown-mode/master/markdown-mode.el>.
- **Hiding is a switch, off by default.** `markdown-hide-markup` (nil: all markup shown), flipped by
  `markdown-toggle-markup-hiding`. *summary*: the file above and
  <https://doc.emacsen.de/29.4/var/markdown-hide-markup.html>.
- **Across lines.** "Inline constructs such as bold and italic may span several lines within a block", the patterns
  taking a newline but never two. *summary*: the file above.
- **Words joined by underscores.** `markdown--gfm-markup-underscore-p` rejects an underscore inside a word in GFM
  mode. *summary*: the file above.

## Could not confirm

- iA Writer: how its markers look, and any setting.
- Typora: an unclosed marker while typing; a setting to keep the markers shown.
- Obsidian: an unclosed `**` and `snake_case_words` in Source mode; whether any theme dims the markers by default.
- VS Code: the closing marker's scope; an unclosed `**`; whether `snake_case_words` stays plain.
- Zed: how a theme colours `emphasis.markup`.
- Neovim: the markers' look at `conceallevel=0` (inferred above); an unclosed `*`.
- Emacs: whether hidden markup comes back where the cursor is.

## Summary

- **Dimming the markers by default is rare:** Emacs alone does (`shadow`). VS Code, Zed and Obsidian's Source mode
  draw them in their span's look; Neovim's are their span's when not concealed.
- **Hiding them is the WYSIWYG modes' way:** Obsidian's Live Preview and Typora, each with a mode that shows all; Emacs
  and Neovim only when asked.
- **The text** is a font style everywhere it's confirmed, with a colour in VS Code's themes.
- **What users ask to switch off** is the styling of source (Obsidian), and the markers in a WYSIWYG mode. Some like
  the markers fainter, and do it with CSS.
- **Parsers that make a tree** (tree-sitter's, Lezer's, Emacs's patterns needing a closer) leave an unclosed `**`
  plain; a TextMate grammar spans lines only with begin/end rules.

SIS takes Emacs's look, which Obsidian's users build for themselves: the markers dimmer than the text, the text in the
render's styles (SIS-D1, SIS-D2), a switch to turn it off (SIS-D3), and the render's own parser, which follows
CommonMark (SIS-D4).
