---
status: current
created: "2026-09-25"
---

# Research: prior art

What already exists near slipbox, and what it means for building it. Written for two questions: whether to build on
or fork `RivoLink/leaf`, the rendering quality bar; and whether any existing tool already occupies slipbox's position,
or supplies a layer of it. The tools beyond leaf were checked on 2026-09-25 from their repositories, their own pages
and crates.io. leaf's figures and render-markdown.nvim's table allocator are as recorded the same day, with no date of
their own.

## Summary

- **leaf can only be forked, not wrapped, and a fork would work in its hottest files:** it is a binary-only crate, and
  the files a fork would modify change most (*read*). This informed D4.
- **Nothing checked occupies slipbox's position** (*read*), but three findings change details, and one, zk, is a
  genuine "adopt instead of build" candidate for a layer (D10).
- **zk is the layer under slipbox, not a rival:** it is not a note editor and does no rendering (*read*). Its
  `.zk/config.toml` independently reaches two of slipbox's choices, a marker directory for the root and TOML for config
  (D38, D12); its CLI is the reference for slipbox's own (D18).
- **basalt is the closest existing product, and its own Known Limitations read like slipbox's feature list** (*read*).
  Its layered, published, permissively licensed crates show that "there is no wrappable option" was only ever true of
  leaf, which reopened the stack question (D5).
- **Being in Rust does not make rendering easier:** basalt is Rust on ratatui and still cannot render bold, italic,
  strikethrough or images (*read*).
- **obsidian.nvim stops exactly where slipbox begins:** it delegates rendering to `render-markdown.nvim`, the plugin
  slipbox started from being dissatisfied with (*read*). The premise is confirmed by the ecosystem rather than
  asserted (D2).
- **frogmouth's back/forward history stack is the one feature to take** (*read*): built as `3.6`.
- **nb shows there is an audience for git-aware notes tooling,** and its command surface is a second reference for CLI
  design (*read*, D18).
- **render-markdown.nvim's table allocator is the algorithm to port, and it has a known flaw:** `minimum` is checked
  only in aggregate, so a column can be narrower than its longest word and overflow (*read*). This informed D89.

## leaf

[`RivoLink/leaf`](https://github.com/RivoLink/leaf): Rust, MIT (*read*); the quality bar for rendering (*ours*).

- **Binary-only crate.** No `src/lib.rs`, no `[lib]` section, all modules crate-private `mod` (*read*). It cannot be
  used as a library: wrapping isn't available, only forking.
- **Churn is in the wrong place.** 125 commits in 90 days, and the files a fork would modify are the hottest: `src/app`
  17, `src/main.rs` 17, `src/markdown` 15, `src/render` 12 (*read*). Compare herdr's `layout.rs` at 2 per 90 days,
  which is what made a herdr fork look cheap by contrast (*read*).
- **No agent concepts,** and no notes or link layer (*read*). Most of a fork's code would be new regardless: it would
  keep the renderer and rewrite everything else (*ours*).
- The features leaf would plausibly decline are the agent-workflow ones, while the ones it would accept are the
  reading ones (*ours*). That divergence is the signal that slipbox is a different product.
- [Issue #298](https://github.com/RivoLink/leaf/issues/298) is the edit-mode request filed against leaf (*read*).
- **Tests are a third of it:** 7,596 lines of tests out of 24,553 (*read*).
- **Its history stores only a path:** `HistoryEntry` holds a file's path and nothing else, which is why returning to a
  file drops you at the top and why its history picker doesn't feel like buffers (*read*).

## zk

[`zk-org/zk`](https://github.com/zk-org/zk): Go, GPL-3.0, 2.8k stars, 616 commits (*read*). The closest thing to
slipbox's PKM layer, and complementary rather than competing.

- It uses `.zk/config.toml`, and has wikilinks, backlinks, **full-text search**, templates, tags, YAML frontmatter,
  git-style aliases and named filters, plus an **LSP server** for editors. Its interactive browser is `fzf` (*read*).
- **It is explicitly not a note editor, and it does no rendering** (*read*). So it is the layer *under* slipbox, not a
  rival to it.
- **Its marker directory and TOML config match two choices slipbox reached without knowing of it:** a marker directory
  for the vault root, and TOML for config (*read*). That is reassuring rather than merely coincidental (*ours*).
- **It covers vault-wide search,** the least-designed feature at the time (*ours*). Shelling out to `zk` would supply
  the graph, backlinks, search, tags and templates (*read*); but it is an external Go binary (*read*).
- **It is automation-first, and shipped both a CLI and an LSP** (*read*). Its CLI surface is the design reference for
  slipbox's own: its command layout is to be read before designing the agent surface (*ours*).

## basalt

[`erikjuhani/basalt`](https://github.com/erikjuhani/basalt): Rust, 1.4k stars, 1,206 commits. A TUI for Obsidian
vaults with vim-mode editing and TOML config. GPL-3.0 for the app, and **Apache-2.0 for `basalt-core` and
`basalt-widgets`**, deliberately kept reusable (*read*).

### Its known limitations

By description this is the same product. Its own [Known Limitations](https://basalt.page/known-limitations/) say
otherwise (*read*). The right-hand column is slipbox's position on 2026-09-25 (*ours*):

| basalt does not support | slipbox's position (2026-09-25) |
| --- | --- |
| **Searching notes** | in v1 |
| Image rendering | capability-gated section of its own |
| **Inline styling — bold, italic, strikethrough** | table-stakes rendering |
| Math blocks, footnotes, HTML, clickable links | LaTeX planned; footnotes in scope |
| Backlinks panel, graph view | backlinks are the core of the PKM layer |
| Deleting, moving, copying notes | rename-with-link-fixing is designed |
| Plugin support | three tiers designed |

It does have a **vim-mode editor with undo/redo, visual selection and clipboard**, which basalt calls experimental and
ships disabled by default, and TOML config, again converging (*read*).

### Its architecture

Three crates, all published to crates.io, built on **ratatui** and **pulldown-cmark**, the same parser leaf uses
(*read*):

| Crate | Role | Licence |
| --- | --- | --- |
| `basalt-core` | domain logic; Obsidian interop — read vaults, notes, config; write to a note path | Apache-2.0\* |
| `basalt-widgets` | reusable ratatui widgets | Apache-2.0 |
| `basalt-tui` | the application | GPL-3.0-or-later |

\* Licences are per the repository. What is *published* differs, checked 2026-09-25 (*read*): `basalt-core` 0.9.0 and
`basalt-widgets` 0.1.1 are on crates.io under **MIT**, and the Apache-2.0 relicence has not been published;
`basalt-widgets` was last published 17 months earlier. MIT is what a dependency would actually get.

A deliberately layered, library-published, permissively licensed project is a far better thing to build on than leaf
(*ours*): "there is no wrappable option" was only ever true of leaf.

### What `basalt-core` would supply

- **It is thin, and thin in the easy places:** "read vaults, read notes, write to a note path" is file walking and IO
  (*read*), which is not where the effort is (*ours*).
- **It does not supply** the table allocator, the link graph, search or export (*read*).
- **It is an Obsidian interop layer,** coupled to `.obsidian/` vault discovery (*read*); slipbox then used its own
  `.slipbox/` marker with different precedence rules (*ours*, 2026-09-25).
- **Its stated scope is Obsidian-vault compatibility, not agent workflows** (*read*). Its limitation list is slipbox's
  feature list, and its architecture invites contribution (*ours*), but slipbox's differentiating features would be as
  out of scope there as they were for leaf.

The three paths this reopened (stay on Bun and TypeScript, switch to Rust on basalt's crates, contribute to basalt) are
in [ideas](../ideas.md); the choice is D5.

## obsidian.nvim

[`obsidian-nvim/obsidian.nvim`](https://github.com/obsidian-nvim/obsidian.nvim): 2.2k stars, a community fork of the
unmaintained `epwalsh/obsidian.nvim`. In-process LSP completion on `[[`, navigation by links, backlinks and tags
(*read*).

**It does not render markdown.** Rendering is delegated to `render-markdown.nvim` (*read*). So the nvim answer to
Obsidian-in-a-terminal exists, is popular, is well maintained, and stops exactly where slipbox begins (*ours*).

## frogmouth

[`Textualize/frogmouth`](https://github.com/textualize/frogmouth): a Python/Textual markdown *browser*: a history stack
with forward and back, bookmarks, a table of contents, and opening URLs. A reader only: no vault, no graph, no editing
(*read*).

The feature to take is the **back/forward history stack**. Following wikilinks without one leaves no way back except
the switcher, and slipbox's feature list then had bookmarks but no history (*ours*).

## nb and glow

[`xwmx/nb`](https://github.com/xwmx/nb): Bash, AGPL-3.0, 8.4k stars. A CLI plus a local web UI: notes, bookmarks,
archiving, linking, tagging, filtering, search, **git versioning and syncing**, and pandoc conversion. No terminal
rendering, and a very large command surface (*read*).

- Its **git integration proves there is an audience for git-aware notes tooling** (*read*), which is the repos-niche
  thesis (*ours*).
- Its command surface is a second reference for CLI design, beside zk's (*ours*).

`glow` is a one-shot renderer: it cannot show an agent's edits without being re-run (*memory*).

## Also noted

There is a **second, unrelated project also called `basalt`**,
[`oweneldridge/basalt`](https://github.com/oweneldridge/basalt): a Tauri desktop GUI, Rust plus React and CodeMirror,
AGPL, alpha, claiming broad Obsidian parity including live preview, graph view, tabs and splits, Canvas, Bases and a
plugin API (*read*). Not a TUI, so not a competitor; but the name collides, and it confirms that the *terminal* is the
differentiator rather than "open-source Obsidian", which is already being attempted (*ours*).

## render-markdown.nvim's table allocator

Parsing GFM tables is solved: `remark-gfm`, 28M downloads a week (*read*). *Laying them out in a fixed width* is the
real work. The algorithm is in render-markdown's `lua/render-markdown/parser/table.lua` (*read*):

```text
desired[i] = max over rows of (content width + 2 * padding)
minimum[i] = max over rows of (longest unbreakable token + 2 * padding)
budget     = width - (prefix + ncols + 1)

sum(desired) <= budget -> use desired
budget < sum(minimum)  -> give up, do not wrap
otherwise              -> lock columns where desired <= budget/free, redistribute
```

- **Its flaw:** `minimum` is only checked in aggregate, so a column can be allocated narrower than its longest word and
  overflow (*read*).
- A port was estimated at about 150 lines of TypeScript (*ours*). `Intl.Segmenter`, built into Bun, breaks text by
  grapheme (*memory*).
- **Not only a table concern:** grapheme clustering and display width (emoji, CJK, combining marks, zero-width joiners)
  govern every wrap point, every cursor position and every column alignment. Getting the width wrong shows up as a
  cursor that drifts from where the character is drawn (*ours*). This informed D88.

The allocator as built, the flaw fixed: [design/rendering.md](../design/rendering.md) § The table allocator.

## Gaps

- `basalt-core` supplies no table allocator, link graph, search or export.
- The Apache-2.0 relicence of `basalt-core` and `basalt-widgets` was not on crates.io on 2026-09-25.

## Sources

- leaf: [`RivoLink/leaf`](https://github.com/RivoLink/leaf), and
  [issue #298](https://github.com/RivoLink/leaf/issues/298), the edit-mode request filed against it; herdr's
  `layout.rs`, for the churn comparison.
- zk: [`zk-org/zk`](https://github.com/zk-org/zk) (2026-09-25).
- basalt: [`erikjuhani/basalt`](https://github.com/erikjuhani/basalt), its
  [Known Limitations](https://basalt.page/known-limitations/), and crates.io's `basalt-core` 0.9.0 and `basalt-widgets`
  0.1.1 (2026-09-25).
- obsidian.nvim: [`obsidian-nvim/obsidian.nvim`](https://github.com/obsidian-nvim/obsidian.nvim), a fork of
  `epwalsh/obsidian.nvim` (2026-09-25).
- frogmouth: [`Textualize/frogmouth`](https://github.com/textualize/frogmouth) (2026-09-25).
- nb: [`xwmx/nb`](https://github.com/xwmx/nb) (2026-09-25); `glow`.
- The other basalt: [`oweneldridge/basalt`](https://github.com/oweneldridge/basalt) (2026-09-25).
- render-markdown.nvim: `lua/render-markdown/parser/table.lua`; `remark-gfm` on npm.
- Related, outside this repository: `<dotfiles>/docs/possible-tools.md`, the agent-plus-notes repositories to read
  first, `kepano/obsidian-skills` above all, plus `tobi/qmd`, named then as the likely search implementation;
  `<dotfiles>/docs/plans/nvim-agent-integration.md`, the parked plan slipbox grew out of;
  `<dotfiles>/docs/plans/terminal-multiplexer-design.md`, the other parked build-or-fork design.
