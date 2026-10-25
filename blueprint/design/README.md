# Design

How slipbox works now: its concepts, its parts and how they fit. Design is current truth, kept true to the code: a
change of behaviour changes the matching file in the same commit (D206). Why each part is built so is in
[the decisions](../decisions), which every file cites by ID.

1. [terms.md](terms.md): the vocabulary, each word with the section that defines it.
2. [how-it-works.md](how-it-works.md): the whole system, end to end: faces, parts, modules, storage, performance.
3. [links.md](links.md): links read, resolved, written and repaired: one model inside, every tool's forms at the edges.
4. [roots.md](roots.md): which vault a file belongs to — a folder with a marker, home or Elsewhere — how it is walked,
   indexed and named, the links it follows, where its state is kept.
5. [rendering.md](rendering.md): a note laid out for a width: the layout IR, tables, wrapping, themes, glyphs.
6. [tui.md](tui.md): the reader and editor: panes, buffers, the explorer's zoom, the peek, SOURCE view and the lens,
   saving, external changes, git: the git panel, diffs, the review, the merge screen.
7. [code-view.md](code-view.md): code as a notebook: the rule, the shared categories, cells and their buttons.
8. [search.md](search.md): a vault's files ranked by words: the index and the scan, sections, where a hit opens.
9. [document-types.md](document-types.md): notes of a kind, known by where they are: their rules, their order.
10. [lsp.md](lsp.md): slipbox as a client of the language servers and linters of the code it opens.
11. [trust.md](trust.md): what slipbox runs, and what a folder may run through it: nothing of its own unless trusted;
    and the links you follow.
12. [export.md](export.md): notes as a document: the assembler, Word, PDF, a web page, an e-book, Markdown.
13. [distribution.md](distribution.md): folders per platform, the supply chain's gates, releases and previews,
    installing, channels, updates, notices.
14. [testing.md](testing.md): the headless and terminal tests, the fixture and demo vaults, the reference set.
15. [repository.md](repository.md): the repository itself: its documents, the check, CI, the dependencies' upkeep,
    the settings, the weekly health check.

The user's references are outside the blueprint, in [docs/](../../docs): [keys.md](../../docs/manual/keys.md),
[configuration.md](../../docs/manual/configuration.md) and [cli.md](../../docs/manual/cli.md). The keys beside vim's, VS
Code's and Obsidian's are research: [keymap-comparison.md](../research/keymap-comparison.md).


## Deferred review note

The [maintenance and accessibility review](../research/maintenance-gaps.md) records verified gaps and proposals
awaiting evaluation under roadmap `27.1`–`27.6`. It is reference material, not part of the current design contract.
Any accepted behavior or policy change follows the workstream process before updating the design here.
