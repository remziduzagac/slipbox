# Design

How slipbox works now: its concepts, its parts and how they fit. Design is current truth, kept true to the code: a
change of behaviour changes the matching file in the same commit (D206). Why each part is built so is in
[the decisions](../decisions/), which every file cites by ID.

1. [terms.md](terms.md): the vocabulary, each word with the section that defines it.
2. [how-it-works.md](how-it-works.md): the whole system, end to end: faces, parts, modules, storage, performance.
3. [links.md](links.md): links read, resolved, written and repaired: one model inside, every tool's forms at the edges.
4. [roots.md](roots.md): which folder a file belongs to, how it is walked, indexed and named, where its state is kept.
5. [rendering.md](rendering.md): a note laid out for a width: the layout IR, tables, wrapping, themes, glyphs.
6. [tui.md](tui.md): the reader and editor: panes, buffers, source mode and the lens, saving, external changes, git.
7. [code-view.md](code-view.md): code as a notebook: the rule, the shared categories, cells and their buttons.
8. [search.md](search.md): a root's files ranked by words: the index and the scan, sections, where a hit opens.
9. [document-types.md](document-types.md): notes of a kind, known by where they are: their rules, their order.
10. [lsp.md](lsp.md): slipbox as a client of the language servers and linters of the code it opens.
11. [trust.md](trust.md): what slipbox runs, and what a folder may run through it: nothing of its own unless trusted.
12. [export.md](export.md): notes as a document: the assembler, Word, PDF, a web page, an e-book, Markdown.
13. [distribution.md](distribution.md): folders per platform, the supply chain's gates, releases, updates, notices.
14. [testing.md](testing.md): the headless and terminal tests, the fixture and demo vaults, the reference set.

The user's references are outside the blueprint, in [docs/](../../docs/): [keymap.md](../../docs/keymap.md),
[configuration.md](../../docs/configuration.md) and [cli.md](../../docs/cli.md). The keys beside vim's, VS Code's and
Obsidian's are research: [keymap-comparison.md](../research/keymap-comparison.md).
