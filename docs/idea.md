# Idea: slipbox — terminal markdown notes app

Status: **designed, nothing built**. Named and scoped 2026-09-24 during a longer exploration
that started as "find a nicer way to read markdown than nvim"; updated since as decisions
landed.

This document is the *what and why*. The work breakdown and the phasing are in
`docs/plan.md` — if the two ever disagree about sequencing, the plan governs.

## What it is

A terminal markdown notes app: Obsidian's model without the GUI, with agent communication as
the distinguishing feature. Not a markdown previewer with extras.

The motivating problem: markdown notes are central to working with AI agents, Obsidian needs a
GUI and most of its features aren't wanted, and nvim's markdown rendering is the thing that
prompted looking elsewhere in the first place.

**Constraint to hold:** nvim's rendering is the dissatisfaction. Every "just use nvim plus
render-markdown" answer is ruled out by that, even though nvim technically has every other
feature on the list.

**Constraint to hold:** **slipbox is standalone.** It will be *used* inside herdr, but it must
never *require* herdr, or tmux, or zellij, or any multiplexer. A bare Ghostty window over SSH is
a first-class environment. Anything a multiplexer would provide — a second pane, detach,
scrollback — either slipbox provides itself or degrades to a lesser path that still works.
Multiplexer integration is detected and optional, never assumed. Everywhere this document cites
herdr, it is either *our* deployment context or a precedent worth copying, not a dependency.

## Why build rather than fork leaf

[`RivoLink/leaf`](https://github.com/RivoLink/leaf) (Rust, MIT) is the quality bar for
rendering. Forking it is still the wrong trade:

- **Binary-only crate.** No `src/lib.rs`, no `[lib]` section, all modules crate-private `mod`.
  It cannot be used as a library — wrapping isn't available, only forking.
- **Churn is in the wrong place.** 125 commits in 90 days, and the files a fork would modify
  are the hottest: `src/app` 17, `src/main.rs` 17, `src/markdown` 15, `src/render` 12. Compare
  herdr's `layout.rs` at 2 per 90 days, which is what made a herdr fork look cheap by contrast.
- **leaf has no agent concepts**, and the notes/link layer would also be new. Most of the code
  would be new regardless; you would keep the renderer and rewrite everything else.
- The features leaf would plausibly *decline* are precisely the agent-workflow ones, while the
  ones it would accept are the reading ones. That divergence is the signal that this is a
  different product.

## Prior art beyond leaf — checked 2026-09-25

Verdict: **nothing here occupies slipbox's position**, but three findings change details, and
one is a genuine "adopt instead of build" candidate for a layer.

### `zk` — the closest thing to slipbox's PKM layer, and complementary rather than competing

[`zk-org/zk`](https://github.com/zk-org/zk) — Go, GPL-3.0, 2.8k stars, 616 commits. Uses
`.zk/config.toml`, and has wikilinks, backlinks, **full-text search**, templates, tags, YAML
frontmatter, git-style aliases and named filters, plus an **LSP server** for editors. Its
interactive browser is `fzf`.

**It is explicitly not a note editor, and it does no rendering.** So it is the layer *under*
slipbox, not a rival to it.

Three consequences:

- **`.zk/config.toml` independently validates two decisions here** — a marker directory for
  the vault root, and TOML for config. Both were reached without knowing this. That is
  reassuring rather than merely coincidental.
- **It is a real adopt-instead-of-build candidate**, and it covers the least-designed feature
  here, vault-wide search. Shelling out to `zk` would supply the graph, backlinks, search,
  tags and templates. But it is an external Go binary, so the standalone constraint means the
  native PKM layer gets written regardless. So: **`zk` as an optional enhancement tier**, the
  same shape as pandoc and the multiplexers — not a dependency, and not a reason to skip the
  300–600 lines.
- **Its CLI surface is the design reference for slipbox's own.** zk is automation-first and
  shipped *both* a CLI and an LSP. Read its command layout before designing the agent surface.

### `erikjuhani/basalt` — the closest existing *product*, and its limitations are the map

[`erikjuhani/basalt`](https://github.com/erikjuhani/basalt) — Rust, 1.4k stars, 1,206 commits.
A TUI for Obsidian vaults with vim-mode editing and TOML config. GPL-3.0 for the app, and
**Apache-2.0 for `basalt-core` and `basalt-widgets`**, deliberately kept reusable.

By description this is the same product. Its own
[Known Limitations](https://basalt.page/known-limitations/) say otherwise, and read like a
list of things slipbox intends to do:

| basalt does not support | slipbox's position |
| --- | --- |
| **Searching notes** | in v1 |
| Image rendering | capability-gated section of its own |
| **Inline styling — bold, italic, strikethrough** | table-stakes rendering |
| Math blocks, footnotes, HTML, clickable links | LaTeX planned; footnotes in scope |
| Backlinks panel, graph view | backlinks are the core of the PKM layer |
| Deleting, moving, copying notes | rename-with-link-fixing is designed |
| Plugin support | three tiers designed |

It does have things worth noting: a **vim-mode editor with undo/redo, visual selection and
clipboard** — which basalt calls experimental and ships disabled by default — and TOML
config, again converging.

#### basalt's architecture is what leaf's is not

Three crates, all published to crates.io:

| Crate | Role | Licence |
| --- | --- | --- |
| `basalt-core` | domain logic; Obsidian interop — read vaults, notes, config; write to a note path | Apache-2.0\* |
| `basalt-widgets` | reusable ratatui widgets | Apache-2.0 |
| `basalt-tui` | the application | GPL-3.0-or-later |

Built on **ratatui** and **pulldown-cmark** — the same parser leaf uses.

\* Licences are per the repository. What is *published* differs, checked 2026-09-25:
`basalt-core` 0.9.0 and `basalt-widgets` 0.1.1 are on crates.io under **MIT**, and the
Apache-2.0 relicence has not been published — `basalt-widgets` was last published 17 months
ago. Irrelevant while option 1 stands, but MIT is what a dependency would actually get.

This is a deliberately layered, library-published, permissively-licensed project. It is a far
better thing to build on than leaf, whose binary-only crate and hot churn in exactly the files
a fork would touch were the reasons building won that argument. So the honest correction is:
**"there is no wrappable option" was only ever true of leaf.**

Which reopens the stack question, so it is worth answering rather than leaving implied. Three
paths:

1. **Stay Bun/TypeScript.** basalt is prior art — study its UX and its limitations, reuse no
   code.
2. **Switch to Rust and build on `basalt-core` + `basalt-widgets`.** Gains: a ready domain
   layer, ratatui's maturity, and a genuinely small binary instead of Bun's tens of MB with an
   embedded runtime.
3. **Contribute to basalt** instead of building, the same posture as leaf #298.

**Recommendation: stay on Bun/TypeScript (1).** Two concrete reasons, not preference:

- **`basalt-core` is thin, and it is thin in the easy places.** "Read vaults, read notes, write
  to a note path" is the cheap part — file walking and IO, which is not where the effort is.
  It does **not** supply the table allocator, the link graph, search, or export. Note that the
  300–600-line estimate elsewhere in this document is for the *link graph*, which `basalt-core`
  does not provide, so it is not the figure this trade would save. Meanwhile switching stacks forfeits
  the libraries doing the actual heavy lifting here — `remark` and mdast positions, `docx`,
  `pdfkit`, `rehype`, `unicodeit`, `knap`, `mermaid-ascii` — plus OpenTUI's `Image`, `Diff` and
  `Textarea`. That is a bad trade: give up the hard parts to be handed the easy one.
- **`basalt-core` is an *Obsidian* interop layer**, coupled to `.obsidian/` vault discovery.
  slipbox deliberately uses its own `.slipbox/` marker with different precedence rules, so the
  one thing the crate is actually for is the thing slipbox does differently.

And the clinching observation: **basalt is Rust on ratatui and still cannot render bold,
italic, strikethrough or images.** Being in Rust evidently does not make the rendering problem
easier, which is the whole problem slipbox exists to solve.

Option 3 deserves a sentence, because basalt is the project most likely to *accept* these ideas
— its limitation list is slipbox's feature list, and its architecture invites contribution. But
its stated scope is Obsidian-vault compatibility, not agent workflows, so the differentiating
features would be as out-of-scope there as they were for leaf. Worth watching, not worth
redirecting into.

### `obsidian.nvim` — the cleanest confirmation of the premise

[`obsidian-nvim/obsidian.nvim`](https://github.com/obsidian-nvim/obsidian.nvim) — 2.2k stars,
a community fork of the unmaintained `epwalsh/obsidian.nvim`. In-process LSP completion on
`[[`, navigation by links, backlinks and tags.

**It does not render markdown.** Rendering is delegated to `render-markdown.nvim` — the plugin
this entire project started from being dissatisfied with. So the nvim answer to
Obsidian-in-a-terminal exists, is popular, is well maintained, and stops exactly where
slipbox begins. That is the premise, confirmed by the ecosystem rather than asserted.

### `frogmouth` — borrow its navigation model

[`Textualize/frogmouth`](https://github.com/textualize/frogmouth) — a Python/Textual markdown
*browser*: a history stack with forward and back, bookmarks, table of contents, and opening
URLs. Reader only — no vault, no graph, no editing.

**One feature to take:** a **back/forward history stack**. Following wikilinks without one
means no way back except the switcher, and the feature list has bookmarks but no history.
Cheap, and obvious in hindsight.

### `nb` and `glow` — no overlap, one useful signal

[`xwmx/nb`](https://github.com/xwmx/nb) — Bash, AGPL-3.0, 8.4k stars. CLI plus a local web UI:
notes, bookmarks, archiving, linking, tagging, filtering, search, **git versioning and
syncing**, and pandoc conversion. No terminal rendering, and a very large command surface.

Two things worth taking: its **git integration proves there is an audience for git-aware notes
tooling**, which is the repos-niche thesis, and its command surface is a second reference for
CLI design alongside zk's.

`glow` stays what it was: a one-shot renderer, already ruled out because it cannot show an
agent's edits without being re-run.

### Also noted

There is a **second, unrelated project also called `basalt`**
([`oweneldridge/basalt`](https://github.com/oweneldridge/basalt)) — a Tauri desktop GUI, Rust
plus React and CodeMirror, AGPL, alpha, claiming broad Obsidian parity including live preview,
graph view, tabs and splits, Canvas, Bases and a plugin API. Not a TUI, so not a competitor —
but worth knowing the name collides, and it confirms that the *terminal* is the differentiator
rather than "open-source Obsidian", which is already being attempted.

---

## Chosen stack

Bun is installed on the Mac; cargo is not.

```text
runtime     Bun (+ bun build --compile for a standalone binary)
TUI         OpenTUI — anomalyco/opentui, MIT, 13.4k stars, v0.5.12
parse       remark + remark-gfm + remark-frontmatter + remark-wiki-link
highlight   OpenTUI tree-sitter, or shiki
LaTeX       unicodeit on npm (original); leaf uses a separate Rust port of the same project
mermaid     mermaid-ascii (npm v1.0.0 — TESTED, label parsing broken; see Verified)
templates   knap (first-party Obsidian, npm v0.6.0)
export      own writers — rehype (HTML), `docx`, pdfkit or react-pdf; pandoc optional
themes      hand-tuned first-class set + base16/base24 loader for the long tail
search      own index: SQLite FTS5 (decision 6.1); an outside engine (Scout) later, behind the same API
PKM         own in-process implementation over remark
agents      a CLI (shape settled); the command surface itself is still undesigned
```

### OpenTUI over Ink

Ink is safer on every conventional measure — v7.1.1 stable, nine years old, 39.9k stars, 5.1M
downloads a week, 35 open issues — against OpenTUI's v0.5.12, 14 months old, 13.4k stars, 626k
a week, 35 open issues and PRs against OpenTUI's 155 (both are GitHub's `open_issues_count`,
which counts pull requests too — issues alone are 16 and 64). OpenTUI wins anyway because Ink
is the wrong shape:

- Ink renders React to a **string**, then diffs and reprints. Built for CLI output — progress,
  prompts, forms — which is why Prisma, Wrangler and Gatsby use it. No scroll container, so a
  viewport over content larger than the screen means virtualised scrolling on a string differ.
- OpenTUI has a **cell-level renderer with frame buffers**, plus `ScrollBox`/`ScrollBar`,
  `TextTable`, images, and a `TimeToFirstDraw` diagnostic. That is document-viewer shaped.
- It comes from `anomalyco` (the opencode people), so it is built for AI tooling — hence the
  `streaming` prop for incremental updates, useful when an agent writes a note while you watch.

Accepted cost: pre-1.0 API churn, 169 commits per 90 days. Mitigation is architectural — keep
**mdast to layout pure and framework-agnostic**, and let only the final draw step touch OpenTUI.
The portable surface is then thin: `Renderable`, `Box`, `Text`, scroll, input.

### OpenTUI offers more than expected

19 components, including a **`Markdown`** component (not just `Code`), plus `TextTable`,
`Textarea`, `ScrollBox`/`ScrollBar`, line-number gutter, `Diff`, `Image` and an embedded
terminal. Yoga flexbox layout. `Renderable` subclassing is the documented extension point.

`Markdown` props: `content`, `syntaxStyle`, `conceal`, `concealCode`, `streaming`,
`tableOptions`, and crucially **`renderNode`** — "override rendering for a token and fall back
to default rendering".

### remark, not OpenTUI's Markdown component

OpenTUI's `Markdown` uses **`marked` 17.0.1**, not remark (confirmed in
`package.json`, with `web-tree-sitter` as a *peer* dependency you install yourself), so the
remark plugin ecosystem does
not apply to it. Two paths:

| | Path 1: OpenTUI `Markdown` | Path 2: remark + custom `Renderable` |
| --- | --- | --- |
| Parser | marked | remark |
| Source positions | `raw` text only | `Position {line, column, offset}` per node |
| Wikilinks | hand-written marked extension | `remark-wiki-link` |
| Table layout | OpenTUI's, quality unknown | yours to write |
| Control | `renderNode` hook | total |

**Path 2 chosen, and the deciding reason is source positions.** slipbox edits, so it constantly
needs "cursor is on this rendered node, which bytes is that?" and the reverse when an agent
rewrites a range. With marked you would reconstruct that by walking `raw` strings and summing
lengths. marked wins only on speed and size, irrelevant when rendering one document at a time.

Path 1 is still worth an hour to see how OpenTUI's defaults *look* — free information, but not
the architecture.

## Verified 2026-09-25 — measured, not assumed

Three things the design rested on, checked by installing them rather than reading about them.

### Cross-compilation is a non-issue

`@opentui/core@0.5.12` ships **prebuilt native binaries as `optionalDependencies`** for eight
targets: `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`, `linux-x64-musl`,
`linux-arm64-musl`, `win32-x64`, `win32-arm64`. So the Mac and the four Linux VMs are all
covered with no toolchain — the earlier worry about "one build target becoming three
toolchains" was wrong. What remains is making `bun build --compile` for a foreign target embed
*that* target's optional dependency, which is packaging, not compilation.

**Runtime floor.** OpenTUI runs on **Bun 1.3.0+ or Node.js 26.4.0+ with ESM and
`--experimental-ffi`** — its own bundled README says so, and `package.json` sets `main` and
`module` to `index.node.js` with explicit `node` export conditions throughout. It is not
Bun-only, despite depending on `bun-ffi-structs`.

Practically, though, the Node path needs a very recent Node *and* an experimental flag, so Bun
is the only comfortable runtime. A strong default, not an impossibility.

**A bonus:** `string-width`, `emoji-regex` and `get-east-asian-width` arrive as OpenTUI
dependencies, so East Asian width and emoji measurement come with it rather than needing to be
written.

### `Textarea` is not modal — but the hard parts are already native

The worry was that OpenTUI's editing component would be a toy and a modal layer would be a
large unplanned piece, the way leaf needed `edtui`. It is the opposite.

`TextareaRenderable` exposes a **named action enum** of roughly 35 actions — movement and
selection in all directions, `line-home`/`line-end`, **`visual-line-home`/`visual-line-end`**,
`buffer-home`/`buffer-end`, `delete-line`, `delete-to-line-end`/`-start`,
`word-forward`/`word-backward` with select and delete variants, `undo`, `redo`, `select-all`,
`submit` — plus `keyBindings`, `keyAliasMap` and an exported `defaultTextareaKeyBindings`. So
**every action is named and every binding is data**, which is the command-registry pattern this
design already committed to, arriving for free.

Underneath, `EditBuffer` is native and already provides:

| Capability | Why it matters here |
| --- | --- |
| rope-backed buffer | large notes without per-keystroke copying |
| `undo` / `redo` / `canUndo` / `canRedo` / `clearHistory` | the undo requirement, done |
| `getNextWordBoundary` / `getPrevWordBoundary` | word motions, done |
| **`offsetToPosition` / `positionToOffset` / `getTextRange`** | the mdast-position mapping remark was chosen for |
| `extmarks` — **but see below** | nvim-style marks, useful but not what it first appears |
| per-line `addHighlight`, `setSyntaxStyle` | syntax highlighting inside the editor |
| `setTabWidth`, `gotoLine`, `setCursorByOffset` | the ordinary things |

**Two caveats on that table.** `extmarks` is **not on `EditBuffer`** —
it lives in `lib/extmarks.d.ts` as an `ExtmarksController`, surfaced on `EditorView` and
`TextareaRenderable`. And it is **not native**: its own upstream warning says it is
*"simulating extmarks in the edit buffer and will move to a real native implementation in the
future"*, implemented by wrapping about nineteen `EditBuffer` methods in JavaScript. Usable,
but do not build on it as if it were the Zig layer. Every other row is native as listed.

**What is genuinely missing is the vim *grammar*, not the primitives:** modes, operator-plus-motion
composition (`d2w`, `ciw`), registers, counts, dot-repeat, marks and jumplist. That is a state
machine mapping key sequences in a mode to sequences of already-existing named actions. A
useful subset is a few hundred lines, and **no `edtui` equivalent is needed** because the part
that would have justified one is already native.

Two side effects worth noting. `offsetToPosition` and `positionToOffset` make the
remark-over-marked decision pay off twice, in the editor as well as the renderer. And the
existence of `visual-line-*` actions means **cursor movement across a wrapped row is already
handled**, which was listed as one of the hard cases against live preview — that argument is
now weaker, though the others stand.

### Suspend and resume exist, which the editing hand-off depends on

`$EDITOR` hand-off and Tier 0's "suspend and run in the foreground" sink both require OpenTUI
to release the terminal and take it back. It can: `renderer.d.ts`
exports **`pause()`, `suspend()` and `resume()`**, a `ScreenMode` of
`alternate-screen | main-screen | split-footer`, an `EXPLICIT_SUSPENDED` state, and internal
state preserved across suspension (`_suspendedMouseEnabled`,
`suspendedNonAltSurfacePreserved`).

So the hand-off is as cheap as claimed. What is still unspecified is **how a line number is
passed**, because there is no portable form — `nvim +42 f`, `hx f:42`, `code --goto f:42`,
`emacsclient +42` — and `$EDITOR` may be a string with arguments that needs splitting. That
wants an `editor.command` template with `{file}` and `{line}` in config.

### OpenTUI already ships most of the image capability layer

The Image rendering section below designs a capability probe and a fallback ladder. Much of it
exists. `types.d.ts` declares:

```ts
type ImageRenderProtocol = "auto" | "kitty" | "sixel" | "blocks"
interface TerminalCapabilities {
  kitty_graphics: boolean;  sixel: boolean;
  osc52: boolean;           osc52_support: TerminalCapabilityState;
  multiplexer: TerminalMultiplexer;
  image_protocol?: ImageRenderProtocol;  // plus rgb, ansi256, unicode, hyperlinks
}
```

`"auto" | "kitty" | "sixel" | "blocks"` **is** the ladder — native protocol, then blocks — and
`resolveImageRenderProtocol()` is exported to pick one. Three things fall out:

- **Capability probing is done for us**, including `multiplexer` detection, which is exactly
  the "don't sniff `$TERM`" problem.
- **OSC 52 capability is also covered** (`osc52`, `osc52_support`), so the clipboard work in
  Scratch capture starts further along than written.
- **No iTerm2 / OSC 1337 path**, so of the three protocols OpenTUI covers two. That is the
  only part left to write, and it is the least important one here since Ghostty speaks kitty.

### `mermaid-ascii` is partly broken, so stop assuming it

Installed `mermaid-ascii@1.0.0` (MIT, one dependency) and ran it. **Bare node ids work
correctly** — `A --> B`, `A --> C`, `B --> D` renders as one `A` with two children, properly
laid out.

**Labelled nodes break node identity.** Given standard mermaid:

```text
graph TD
  A[Vault] --> B[Graph]
  A --> C[Render]
  B --> D[Backlinks]
```

it emits **six boxes instead of four**, drawing each edge as an isolated pair: `A[Vault]` and
`A` become two different nodes, as do `B[Graph]` and `B`. The label syntax is not normalised
away before the graph is built, so any real diagram — which uses labels — comes out wrong.

So the stack table's "assume `mermaid-ascii` works" is **false as written**. It is still not a
blocker, because mermaid is postponed and the fallbacks stand: fix this upstream (it looks like
a small parser bug), port
[`AlexanderGrooff/mermaid-ascii`](https://github.com/AlexanderGrooff/mermaid-ascii) or leaf's
`mmdflux`, or render real PNGs where the terminal supports images. But it should not be carried
as a safe assumption.

---

## Architecture: one core, three faces

**Decided 2026-09-25: stay independent of `zk`, but take its boundary.**

zk's real lesson is not its feature list, it is its shape. zk is an *engine* with a CLI, plus
an LSP for editors, and **no TUI at all**. That separation is why it composes with everything.
slipbox keeps the separation and supplies its own faces:

```text
                      ┌──────────────┐
                      │     core     │   vault, graph, search, assembler,
                      │  (pure TS)   │   writers, table layout
                      └──────┬───────┘
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
      TUI (OpenTUI)      CLI (agents,      LSP (editors)
                          scripts)          `slipbox lsp`
```

**The core imports nothing from the TUI.** That is a mechanical requirement, not a stylistic
one. OpenTUI pulls in native FFI and a runtime floor of Bun 1.3+ or Node 26.4+ with an
experimental flag, so a face that does not need a terminal should not inherit that. Enforcing
it is also what makes the core snapshot-testable, and it is the same discipline already chosen
to insulate mdast-to-layout from OpenTUI churn — now with a second reason and an easy check.

(The check is worth keeping even though the original justification — "OpenTUI is Bun-only" —
turned out to be wrong. An LSP server that boots a terminal renderer is broken regardless of
which runtimes can load it.)

It also means the agent surface stops being a bolt-on. The CLI is a *face on the core*, the
same as the TUI, rather than something bolted to the side of an app.

### The third face: an embedded LSP, the way zk does it

`zk lsp` is a subcommand of the same binary, not a separate server. slipbox can do the same:
one distributable, `slipbox lsp` speaking LSP over stdio, serving the same in-memory graph.

**This corrects a conflation in the section below.** Rejecting `markdown-oxide` was about
*consuming* an external language server — a second binary, a second process, a second copy of
the graph. It was never an argument against *offering* LSP. Those are opposite directions, and
the original heading ran them together.

Most of the PKM feature list maps onto standard LSP methods, so one implementation serves the
TUI, the CLI and every editor at once:

| slipbox feature | LSP method |
| --- | --- |
| `[[` completion | `textDocument/completion` |
| follow a wikilink | `textDocument/definition` |
| backlinks | `textDocument/references` |
| rename with link fixing | `textDocument/rename` + `prepareRename` |
| unresolved links | `textDocument/publishDiagnostics` |
| outline | `textDocument/documentSymbol` |
| find a note | `workspace/symbol` |
| page preview | `textDocument/hover` |
| create the missing note | `textDocument/codeAction` |

**And it repairs the one weakness in the editing decision.** Editing hands off to `$EDITOR`,
which here is nvim — leaving slipbox's rendering behind. With `slipbox lsp` running, nvim keeps
slipbox's *intelligence*: completion on `[[`, jump-to-note, backlinks as references, rename
that fixes links, unresolved links as diagnostics. So the hand-off costs rendering only, not
awareness. That is a materially better answer than the hand-off had yesterday, and it means
**the LSP has value before slipbox's TUI is even good** — it makes the existing nvim setup
smarter about the vault on its own.

One happy detail: `textDocument/rename` returns a `WorkspaceEdit`, and editors present that for
confirmation themselves. So the dry-run-and-preview requirement under Write safety is satisfied
by the editor for the LSP path, and only has to be built for the TUI path.

**Not v1.** An LSP is another frozen public contract, and it earns the same caution as the CLI
and plugins: after the core is stable, not before. Worth verifying early, though, that
`vscode-languageserver` runs cleanly under Bun, since the LSP face must work without OpenTUI.

---

## PKM layer: in-process, and not by consuming a language server

Decided against [`markdown-oxide`](https://github.com/Feel-ix-343/markdown-oxide), a PKM
language server that would have supplied wikilink follow, backlinks, rename and tags over LSP.
This is about *depending on* a language server, not about *speaking* the protocol — see the
architecture section above, where slipbox offering its own LSP is settled as a good idea:

- **One distributable.** `bun build --compile` yields a single executable; requiring a separate
  Rust binary alongside undoes that.
- **The graph lives in slipbox's own memory**, so any surface agents eventually get can answer
  from a map lookup rather than two hops through a server.
- **No protocol mismatch.** LSP is shaped for editor requests, not for a TUI's own needs.

No library worth depending on either: `obsidian-utils` gets 618 downloads a week,
`obsidian-vault-parser` 8.

It stays small because remark does the hard part. One pass over the vault builds:

```text
nameToPath : Map<string, Path>        from the file walk
backlinks  : Map<Path, Set<Path>>     from WikiLink nodes while parsing
```

Then follow-link is `nameToPath.get()`, backlinks is `backlinks.get()`, completion is a
prefix-filter over the keys, unresolved links are targets absent from the map, tags are a second
map from the same parse.

**But `Map<string, Path>` assumes note names are unique, and they are not.** Three rules have
to be decided before writing it, and they are not cosmetic:

- **Collisions.** Two folders each holding `index.md` is normal in a repo. A single-valued map
  silently picks one. So the value is a *list*, and a `[[link]]` with several candidates needs a
  disambiguation step — nearest-relative first, then a picker.
- **Case sensitivity.** macOS is case-insensitive, the Linux VMs reached over SSH are not. So
  `[[Readme]]` resolving to `readme.md` would work on the Mac and break on beaver. Pick one
  behaviour and apply it everywhere rather than inheriting the filesystem's.
- **Obsidian's conventions** — shortest-path-when-unambiguous versus relative paths, and the
  attachment-folder setting. This one decides whether **slipbox can open an existing Obsidian
  vault unchanged**, which is worth a lot for adoption and costs little if chosen up front.

**Rename with link-fixing** is the only non-trivial operation, and mdast `position` makes it
precise byte-range edits rather than re-serialisation — another reason Path 2 was right. See
Write safety: it is also a bulk mutation of files the user never opened.

Roughly 300–600 lines. The whole graph rebuilds in about 25 ms on this repo's markdown files
(7,226 lines, 290 KB), so no persisted index is needed at this scale.

Accepted cost: none of markdown-oxide's polish — heading-level links, block references, alias
handling. Refinements for later.

## Vault root: marker-based

A **`.slipbox/` directory** marks a vault root, same convention as `.git/` and Obsidian's
`.obsidian/`. A directory rather than a bare `.slipbox.conf` so there is somewhere to grow.

Keep `.slipbox/` to **config only**. Any index goes in `~/.cache/slipbox/<hash-of-root>/` — the
vault is usually a git repo and derived data should not need a `.gitignore` entry.

Discovery, borrowed from git: walk up from the opened file, first `.slipbox/` wins, stop at
`$HOME` or `/`. Nested vaults resolve nearest-first.

Precedence: `--root` flag, then nearest `.slipbox/`, then **single-file mode** where links
resolve relative to the file's own directory with no corpus and no index. Deliberately **no
git-root fallback** — convenient, but it would silently turn every repo you open into a vault.

**One vault per repo is enough.** Links do not cross vaults; connecting vaults is a separate
problem for later.

*Superseded 2026-09-30 by "Vaults — decided 2026-09-30" below: no single-file mode (a loose file
belongs to the home vault), slipbox offers to make a git repository a vault, and links cross vaults
(`[[vault:name]]`, path links).*

## Vaults — decided 2026-09-30

*Revised 2026-10-02 (decisions.md `17.20`): a folder is enough. Its scope — the files links, search and the watcher
cover — needs no `.slipbox/`; settings and identity (an id, a name for `[[name:note]]`) are layers `slipbox init`
adds, and opening a folder writes nothing. The home vault's role passes to each folder's own scope.*

The worry that started this: Obsidian locks you into its vaults — you create one before you can
work, and a markdown file outside it is out of reach. slipbox should open any folder or file, and
leave the files readable by anything else. At the same time, links, backlinks, history, comments
and agent conversations all need a place. The way out is to see that "a vault" was two separate
things: **a namespace**, the set of notes in which a `[[name]]` is looked up, and **a place for
data**. Only the first needs a folder to be marked; the second belongs outside it.

### A root is decided by the file

- **Every file belongs to exactly one root:** the nearest `.slipbox/` above it, else the **home
  vault** (below). `$HOME` and `/` are never a root, which would index everything. Where slipbox
  was opened doesn't matter: `~/notes/idea.md` is in `~/notes` however you reach it.
- **Every vault has a `.slipbox/`, with its `id` and `name` in its config.** One model, no
  fallbacks: no folder-name stand-in, no state keyed by path, no second kind of root. Shared
  features — comments, kept agent answers — need `.slipbox/` anyway.
- **A git repository without one is offered, not assumed** (decided 2026-09-30, revising the first
  cut, where a repository was a root of its own). Opening a file in one without a `.slipbox/` asks:
  make the repository a vault — committed with it, or **private** (listed in `.git/info/exclude`,
  never in `git status`: for repositories you don't own) — or not now, remembered. Until then its
  files are loose. The CLI never writes on its own: it says `slipbox init <root>` would.
- **A `.slipbox/` made before vaults had ids** (or by hand) gets its `id` and `name` written into
  its config the first time it's opened: a one-time migration of slipbox's own folder, like the
  version stamp.
- **Opening `~`, or a big folder that isn't a root,** shows a launcher — the vaults this machine
  knows, and a plain file tree — rather than indexing everything under it.
- **A nested `.slipbox/` is a boundary:** its files are its own vault's, not the outer one's.

The earlier "deliberately no git-root fallback" stands, in a new form: a repository isn't silently a
vault, and it isn't silently written to either — it's offered.

### The home vault

Files outside every vault — `~/todo.md`, `~/Downloads/spec.md`, `/tmp/x.md` —
belong to one vault, `home`, rather than each to its own folder. Without it, a file directly in `~`
had no root at all (`~` never is one), and every folder a stray file was opened in got a state
directory of its own.

- **The notes stay wherever they are.** The home vault has no folder: it's a place for details, not
  for notes. A note made outside any vault is made where you are.
- **Its `.slipbox/` is `~/.local/share/slipbox/home/`** — XDG's data directory, for what is kept
  but is neither settings nor derived (`paths.ts` has no data directory yet). It holds
  `config.toml`, with the vault's `id` and `name` and any settings for loose files, and later the
  comments and kept agent answers about them. Its personal data and its index are keyed by its id
  like any vault's: `~/.local/state/slipbox/<id>/`, `~/.cache/slipbox/<id>/`.
- **Not a `~/.slipbox/`.** A marker in `~` would be the nearest `.slipbox/` for every repository
  under home, and pull them all into one vault.
- **A loose file's links look beside it.** `[[name]]` resolves among the files in the note's own
  folder, not below it. The home vault can't be one namespace: that would mean indexing `~`, or
  counting the files this machine happened to open, and then a link would mean different things on
  different machines. Path links reach anything, as everywhere.
- **Loose notes that link across folders are a vault waiting to be marked.** When a `[[name]]` fails
  but a match exists in a folder nearby, slipbox says where, and offers `slipbox init` on the
  folder that holds both.
- **`home` is a reserved name, and not a link target:** `[[home:x]]` would need the one namespace
  ruled out above.

### Vaults in the explorer

- **A folder that is a vault shows its own icon** in the explorer and the launcher (a bookshelf, in
  a folder's colour). The tree then shows where `[[name]]` changes meaning — above all a vault
  nested in the open one, where the open vault's links stop.
- **The vault's name follows the folder's, dimmed, when the two differ:** `docs  app-docs`.
- The icons come in each glyph set — Nerd Font, Unicode, ASCII (`glyphs.ts`) — beside the folder
  ones (`dirOpen`, `dirClosed`).

### Where everything is stored

Every piece of data answers two questions: can it be rebuilt from the files, and who is it for?

| Place | Holds | Rebuilt if deleted? |
| --- | --- | --- |
| the notes themselves | links, tags, tasks, footnotes; frontmatter `aliases`, `previous_names` | — (the truth) |
| `~/.config/slipbox/` | your settings, everywhere; themes | no: yours |
| `~/.cache/slipbox/<vault>/` | the index: derived from the files | yes, on the next open |
| `~/.local/state/slipbox/<vault>/` | personal data, per vault | no: yours, not shared |
| `~/.local/state/slipbox/vaults.json` | the vaults this machine knows | partly: vaults re-add when opened |
| `<vault>/.slipbox/` | what travels with the folder | no: commit it to share |
| `~/.local/share/slipbox/home/` | the home vault's `.slipbox/`, for loose files | no: yours |

**`~/.config/slipbox/`** (today): `config.toml` — the global settings — and `themes/`.

**`~/.cache/slipbox/<vault>/`** — derived; delete it any time, nothing is lost:

- today: `index.json` — each note's title, headings, links, tags, tasks, and its stamp (so a
  reopen re-reads only what changed);
- new: a content hash per note (move detection). The links other vaults make into this one aren't
  copied here: they're read from those vaults' own indexes, so they're as fresh as each one's last
  indexing.

**`~/.local/state/slipbox/<vault>/`** — personal, per vault; history in one project never shows in
another:

- today: `positions.json` (reading positions: `slipbox history`), `session.json` (tabs, splits,
  recent notes, UI settings changed in the TUI), the scratch (unless `capture.location = "vault"`
  puts it in the project), `dirty/` (unsaved notes, for the CLI's staleness warning), the
  clipboard's fallback file;
- new: **redirects** learned from moves (`old.md → ideas/new.md`) — not derived, since only seeing
  the move teaches them, so not in the cache; **conversations with agents** (a `claude -p`
  question about a term in a PRD, and its answer); **private comments**.

**`~/.local/state/slipbox/vaults.json`** (new, one for the machine): each known vault's id, name,
aliases, previous names, the path it was last seen at, and when — what `[[vault:name]]` resolves
through, and what the launcher lists.

**`<vault>/.slipbox/`** — shared: it travels with the folder, and is committed when the vault is a
repo (or not; that's the user's call):

- today: `config.toml` (settings over the global ones) and `version`;
- new, in `config.toml`'s `[vault]` table: the vault's `id` (random, made once, never changed),
  `name`, `aliases` and `previous_names`;
- later: **shared comments** and **agent answers worth keeping**, for collaborators.

**Keys:** `<vault>` is the vault's `id` — so its personal data and cache survive moving the folder
— for every vault and the home vault. State kept under a path's key before vaults had ids moves
over once. A copy of a vault carries its id; while the original is
still where the machine last saw it, the copy keys by the id and a hash of its own path, so two
copies never share a session.

**Config precedence:** the built-in defaults, then `~/.config/slipbox/config.toml`, then the
vault's: `<vault>/.slipbox/config.toml`, or the home vault's for a loose file.

**No `.slipbox.local/`.** Personal data already lives in the global state, keyed per vault: a
second home for it in the folder would be the complication this design avoids. Revisit only if
personal data ever has to travel with a folder, or be visible beside it.

### Names

- **A vault** has, in `.slipbox/config.toml`: `id`, `name` (the folder's name at creation, stored,
  so renaming the folder doesn't rename the vault), `aliases`, `previous_names`. Names are unique
  on a machine, and `home` is taken (the home vault).
- **A note** is named by its file name and by frontmatter `aliases` (Obsidian's field, so other
  tools read it), and remembers `previous_names` in its frontmatter.
- **Aliases are addresses, previous names are history.** An alias resolves like the name itself.
  A previous name is only a fallback, tried when normal resolution fails, and verified: for a
  vault, the old name must lead to the same `id` (so a new vault reusing a name can't take old
  links); for a note, its last-seen path and its content (move detection) must agree. Several
  files agreeing on the same old name is a further signal. A link resolved this way says so, and
  offers to be updated.
- **Creating suggests distinct names.** A note named like another in the vault gets a suggestion
  from its folder (`ideas-plan`); a vault inside vault `x` is suggested `x-plan`, and a name this
  machine already knows is refused, with a suggestion. Suggestions, not rules.

### Links

| Link | Means | Crosses vaults |
| --- | --- | --- |
| `[[name]]`, `[[name\|text]]`, `[[name#Heading]]` | the note with that name or alias in this vault | no |
| `[[vault:name]]`, `[[vault:name\|text]]`, `[[vault:name#Heading]]` | the same, in the named vault | yes |
| `[text](../x.md)`, `[text](/x.md)` | that file: relative to the linking file, or to its root | yes |

- **A name means the same on every machine.** The namespace is decided by the files (the
  `.slipbox/`) and the rules are fixed — exact case, same folder, deepest shared folder,
  shortest path, else a picker — so no index ever travels: each machine builds its own from the
  same files, and gets the same answers. The index only makes lookups fast; it never decides what
  a link means. A central index merged across vaults was rejected for exactly that reason: `[[plan]]`
  would change meaning with whatever else the machine had opened.
- **`[[vault:name]]`** is MediaWiki's interwiki link. The vault is found by name or alias through
  `vaults.json`, then the note inside it by the usual rules. Every vault has a declared name; a
  loose file (a repository not made a vault) is reached by a path link.
- **A vault this machine doesn't have** makes a broken link that says so ("unknown vault `app`"),
  and where the vault was last seen, if it ever was — with an offer to point slipbox at it.
- **Path links** name a place, need no namespace, and cross vaults freely. The target vault's index
  keeps them working after a move (below). For compatibility with what other editors and agents
  write, every way of writing a path reaches the file — relative out of the root (`[t](../app/x.md)`,
  `[[../app/x]]`), from the home folder (`~/notes/x.md`), absolute (`/home/me/notes/x.md`: a
  leading `/` is the vault's root first, as on GitHub, then the filesystem's), and `file://` URLs —
  in markdown links and wikilinks alike.

### Moves, renames and backlinks

- **Moves are detected, not journalled.** Each vault's index hashes file contents; on a refresh, a
  file that vanished and reappeared elsewhere with the same hash was moved — whoever moved it
  (slipbox, `mv`, git, a file manager). The vault then keeps a redirect, and a link to the old path
  follows it: it works, shows as moved, and offers to be rewritten — never rewritten silently.
- **Backlinks cross vaults** in the same `vault:name` form, taken from each vault's index: as fresh
  as each vault's last indexing.
- **Renaming a note or a vault** fixes the links in every vault this machine can reach, found
  through backlinks, after a preview that lists every file in every vault (and warns when a vault's
  git tree already has changes: this is the one time slipbox writes into another project, and only
  because you asked). The old name goes to `previous_names`, which keeps links working in places
  this machine can't reach — a colleague's clone, a vault not opened here. For notes, writing
  `previous_names` into the frontmatter is a setting, on by default.
- **Indexing is per vault, on demand, and incremental.** Opening a vault refreshes its index and
  those of the vaults it links into — only those. Measured on 2,000 notes (5 MB, 10,000 links):
  3.4 s the first time ever (in the background; the note shows at once), 17 ms on each later open,
  56 ms after one file changed, 12 ms for a note's backlinks.

### Rejected on the way

- **A central index across all vaults** — it would make a link's meaning depend on the machine.
- **A rename journal** — move detection covers it, and also catches moves made outside slipbox.
- **Rewriting other vaults' files at rename time without asking** — only with the preview.
- **`.slipbox.local/`** — see above.

## Effort

**The 1,500–3,000 line estimate is for the core only** — app state, file browsing, root
handling, the PKM layer, keymaps and rendering. It is not the estimate for this document.
Export writers, image handling, the theme system, git awareness, templates and an editing
model plausibly take it past 15,000 lines before tests, and leaf spends about a third of
its total on tests: 7,596 of 24,553.

Stating that plainly matters, because the two numbers were being used interchangeably and
the small one made the whole feature list look affordable.

Nothing here is a research problem. It is assembly of known solutions. The risk is volume,
not difficulty — see Honest risk.

### The one intricate piece: table layout

Parsing GFM tables is solved (`remark-gfm`, 28M downloads a week). *Laying them out in a fixed
width* is the real work. The algorithm is in render-markdown's `lua/render-markdown/parser/table.lua`:

```text
desired[i] = max over rows of (content width + 2 * padding)
minimum[i] = max over rows of (longest unbreakable token + 2 * padding)
budget     = width - (prefix + ncols + 1)

sum(desired) <= budget -> use desired
budget < sum(minimum)  -> give up, do not wrap
otherwise              -> lock columns where desired <= budget/free, redistribute
```

Known flaw to fix on the way across: `minimum` is only checked in aggregate, so a column can be
allocated narrower than its longest word and overflow. About 150 lines in TypeScript. Use
`Intl.Segmenter`, built into Bun, for grapheme-correct breaking.

**And this is not only a table concern.** Grapheme clustering and *display width* — emoji,
CJK, combining marks, zero-width joiners — govern every wrap point, every cursor position and
every column alignment in the app. Decide the width function once, in the layout stage, and
have nothing else measure text. Getting it wrong shows up as a cursor that drifts from where
the character is drawn, which is miserable to debug later.

---

## v1 — a proposed first cut

**This section defines what "usable" means; the schedule lives in `docs/plan.md`.**
The cut maps to phases 1 and 2 plus the link-following slice of phase 4. Where the two differ,
the plan governs — it is the scheduled one. The two done-tests below are the finish lines for
phases 1 and 2.

The Honest risk section says finishing is the danger, and an undifferentiated in-scope list
is how that happens: export, images, themes, git awareness and templates currently sit at
the same level as wikilinks.

Working proposal: **read-and-navigate, plus capture.**

- open a vault by `.slipbox/` marker, browse and open notes
- render markdown properly, with the table allocator and the readability settings
- wikilinks: follow, backlinks, unresolved-link list
- outline, quick switcher, vault-wide literal search
- reading position per note, and more than one note open
- **scratch capture** — the one thing no other tool does
- editing by hand-off to `$EDITOR`
- one theme done well, plus the base16 loader

**Explicitly waiting:** export in every format, inline images, the full theme set, embeds
and transclusion, heading and block references, aliases, templates, tags view, page
preview, git awareness, the CLI and agent surface, plugins of any tier, mermaid and LaTeX.

That list is not a downgrade of any of them. It is an admission that a tool you can open
tomorrow beats a design you can admire.

**The test for v1 being done:** it replaces leaf for reading this repo's `docs/`, and the
scratch capture replaces `prompt-buffer.lua`. Both are measurable, and both are things
already done daily, so the comparison is honest.

**One catch in the second test, found in review.** `prompt-buffer.lua` captures *from the code
buffer you are editing in nvim* — `<leader>pc` is bound in normal and visual mode, takes the
current line or selection, and reads the source buffer's filetype to fence the snippet. slipbox
is a notes app: when you are reading a note you are not sitting on the code line you want. So
replacing it needs a way *in* — either the CLI moves earlier than planned, or an nvim-side
sender exists, or the test is rewritten. Tracked as `8.1` in `docs/plan.md`, and it is
the item that decides phase 2's shape.

**Two consequences of the editing decision, agreed 2026-09-24.** The in-app editor sits
just *outside* this cut — committed, but second — so the first cut is genuinely read plus
capture. And autosave and the conflict prompt only matter once there is an in-app editor,
so they travel with it rather than with this cut. That makes the first cut smaller than the
list above suggests.

## Feature set, sorted against Obsidian's core plugins

Criterion: a *markdown note-taking* feature belongs; a *life-management* feature does not.

**In scope:**

- backlinks and outgoing links — one graph, both directions
- outline / TOC
- **vault-wide search** — our own index (SQLite FTS5, decision `6.1`), an outside engine later
- quick switcher / file picker
- properties view — frontmatter rendered, as leaf does
- tags view — same map pass as the link graph
- page preview — hover a link, see the note; cheap given the graph
- **embeds / transclusion `![[note]]`**
- **aliases** — `aliases:` in frontmatter feeding `nameToPath`
- **heading and block references** — `[[note#heading]]`, `[[note^block]]`
- **bookmarks / favourites**, and a **back/forward history stack** — borrowed from frogmouth
- **templates** — `knap` already is one
- **theming** — first-class, not an afterthought; see Theming below
- **user scripts bound to keys or palette entries** — Tier 0 of Extensibility below
- **inline images** where the terminal supports them, with a readable fallback where
  it doesn't
- **export** to HTML, PDF, DOCX and the rest — Obsidian core has PDF only; see Export below
- **file explorer**, **command palette**, **slash commands** (or something similar)
- footnotes view, note composer (merge/split) — minor, plausible

**The one feature that is not Obsidian's:**

- **prompt / scratch capture** — the accumulator from `prompt-buffer.lua`: collect `path:42-50`
  refs and note excerpts into a per-project scratch, then hand the bundle to an agent. No
  Obsidian equivalent, and the closest thing to the product's reason for existing.

**Out of scope** (life-management): daily notes, random note, unique note creator, audio
recorder, word count, workspaces, web viewer.

`Unique note creator` is timestamp-titled notes (`202609241730.md`), the Zettelkasten
permanent-ID convention. Skipped in favour of descriptive filenames plus rename-with-link-fixing.

**Future, not now:** format converter — convert markdown from other apps.

**Not terminal-feasible or irrelevant:** Canvas, Graph view, Slides, Sync, Publish, Bases, File
recovery.

## Editing model — decided

**Both: an in-app editor for small edits, and `$EDITOR` for anything substantial.**
Decided 2026-09-24.

This is deliberately the same shape as
[leaf issue #298](https://github.com/RivoLink/leaf/issues/298), filed against leaf for
exactly this reason: an in-app edit mode reachable from the rendered view, with `Ctrl+E` kept for
anything bigger. slipbox asked leaf for it; slipbox should have it.

**Live preview is chosen, as a lens** (decided 2026-09-28). Not the Obsidian model, where the
cursor line quietly reveals its source inside the rendered view: that needs cursor-to-source
mapping for every node type and editing inside table cells, and un-rendering the cursor row was
tried in nvim and rejected — keeping it rendered is what made reading pleasant. The lens is an
explicit editing session instead. Reading, everything is rendered. Editing, whole blocks around the
cursor are shown as their markdown between two clear rules, the rest rendered above and below;
nothing is half rendered, so no per-node mapping is needed (a whole block is source or it isn't),
and a table is edited as its markdown. It opens with the editing keys and closes on `esc`. How it
behaves is in `docs/design/tui.md`, "The lens".

### Division of labour

| Edit | Where |
| --- | --- |
| Fix a typo, change a word, edit a table cell, add a line | in-app |
| Restructure a document, bulk edits, anything with real thinking | `$EDITOR` |

The test for whether the in-app editor is good enough is simply whether small edits stop
provoking a reach for `$EDITOR`. That is also the metric leaf's #298 was arguing from.

### Sequencing

**`$EDITOR` hand-off first**, because it is nearly free — spawn the editor on the file at
the current line, wait, reload the buffer — and it makes v1 a usable tool rather than a
reader. **The in-app editor is then the first thing after v1**, not a maybe. It is
committed, just not first.

Hand-off also has to exist regardless: an external editor is one more external writer, and
concurrent-edit handling has to cope with those anyway.

### Capability level is an implementation decision

What the in-app editor can actually do is deliberately left open, to be settled when it is
built rather than guessed at now. The likely basis is **OpenTUI's own editing component**
(`Textarea`), which is why the stack choice already matters here.

What to establish when the time comes:

- whether `Textarea` carries modal editing, or whether a modal layer has to go over it.
  leaf's #298 pointed at `edtui` for precisely this gap on the Rust side; the JS
  equivalent is unclear. **Checked 2026-09-25 — see Verified:** it is not modal, but the
  primitives are native and complete, so the modal layer is a state machine over named actions
  and no `edtui` equivalent is needed.
- **Modal, vim-style keys** either way, to match leaf, nvim, yazi and helix in this stack.
- undo/redo per buffer, surviving an external reload.
- incremental reparse, since re-parsing a whole document per keystroke is fine for a small
  note and not for a large one.
- what the raw/rendered switch looks like: a mode on the buffer, so the buffer model below
  has to carry it.

---

## Open notes: buffers, tabs, splits

Raised in the conversation that produced this document and never written down: leaf opens
one file at a time in one view, and the wanted behaviour is "something like vim tabs".

Minimum: a buffer list plus a switcher. Likely: tabs, and one split so a note can be read
beside another. "Reading position per note" is already in scope — that position is
precisely the state a buffer holds, so the two are one feature.

Interacts with the editing model, since a buffer carries a mode, and with session restore
below.

---

## Concurrent edits — agents write while you read — decided

The product's premise, so core rather than an edge case. Settled 2026-09-24, and the
in-app editor decision above is what makes it unavoidable: slipbox now holds unsaved
state, so the conflict case is real.

### The policy

1. **Watch the vault.** Reload any buffer with no unsaved changes, silently — vim with
   `autoread` on. Silent is right here because agents write constantly and a prompt per
   write would be unusable. (A `W11`-style prompt instead was considered; it isn't built.)
2. **Autosave, on, with a significant delay** — idle-based, defaulting to about 30 seconds
   of no keystrokes, configurable, and settable to off. The delay is the point: it should
   fire when you have actually stopped, never mid-thought. Explicit save always available.
3. **On genuine conflict, prompt — vim's shape, vim's vocabulary.** This is precisely
   vim's `W12: File has changed and the buffer was changed in Vim as well`, and vim's
   handling is the model to copy rather than improve on: it stops, it names the situation,
   and it makes you choose. Nothing is resolved automatically.

   | Choice | Meaning |
   | --- | --- |
   | **(L)oad** | take theirs — reload from disk, lose the buffer's edits |
   | **(K)eep** | keep mine — leave the buffer alone, do not reload |
   | **(D)iff** | show the difference first, then choose |
   | **(M)erge** | a three-way merge in the app, conflicts marked for you to sort out (built so, not in `$EDITOR`) |

   OpenTUI ships a `Diff` component, so the expensive-sounding option is nearly free.

   **Two behaviours to copy from vim exactly.** It does not nag: once you have answered for
   a given change, it stops asking about that change. And it warns *again* at write time,
   because that is the moment your version would overwrite theirs.

   So after **(K)eep**, the buffer is knowingly out of sync with disk: autosave stays
   **off for that buffer** until an explicit save, and that save confirms once that it is
   overwriting a newer file. Keeping your version is allowed — doing it silently, or by a
   timer, is not.
4. **Update the graph incrementally** from watch events rather than rebuilding. A rebuild
   is 25 ms at 52 files and seconds at 5,000.

### What the long delay costs, and the two rules it forces

A short autosave delay would have made conflicts nearly impossible by keeping the unsaved
window under a second. A significant delay deliberately trades that away for never being
interrupted mid-edit. The consequences have to be accepted along with it:

**The conflict path is load-bearing, not a formality.** With a 30-second window plus
however long you were typing, an agent *will* land a write into a dirty buffer during
normal use. So the three-way choice in step 3 must be built properly and early **within the
editing work** — not bolted on after autosave ships. It is post-v1 only because the in-app
editor is; the two travel together. This is the single biggest implication of choosing the long
delay.

**Autosave must never resolve a conflict by winning.** Before writing, compare mtime and
size against what was read. If the file changed underneath, autosave **aborts** and
escalates to the conflict UI. An autosave that silently overwrites an agent's work is worse
than no autosave at all — it destroys the other party's edit with no user action and no
prompt, which is the one failure mode that would make slipbox untrustworthy for its own
premise.

### Surface the change when it happens, not at save time

Since the vault is already being watched, an external write to a file with a dirty buffer
is known immediately. Say so then — a marker in the status line or on the buffer — rather
than letting the user keep typing for another minute and discover it at save. Cheap, given
the watcher exists, and it turns a surprise into a decision.

### Smaller details

- **Debounce watch events.** Agents write in bursts, and editors write via temp-and-rename,
  which looks like delete-then-create.
- **Ignore slipbox's own writes**, or the watcher reacts to itself.
- **On quit with a dirty buffer**: built as a refusal that names the notes — `:wq` saves and quits,
  `:q!` discards — rather than a silent save.
- **Watch the whole vault, not just open files**, since the graph depends on files nobody
  has open.

---

## Write safety

Notes are not regenerable, so this deserves stating rather than assuming.

- **Atomic writes** — temp file plus rename within the same directory, so a crash or a
  full disk never truncates a note.
- **Rename-with-link-fixing is a bulk mutation of files the user never opened.** The PKM
  section calls it merely "non-trivial"; the risk is larger than that. It needs a preview
  listing every file and every edit, an explicit confirmation, and ideally single-step
  undo. It is the one feature that can damage a whole vault in one keystroke.
- **Never write outside the vault root.**
- **Use git when it is there.** The vault is usually a repo, so a bulk rewrite is
  recoverable — say so in the confirmation, and warn when the tree is already dirty,
  because that is when it is not.

---

## Files beyond markdown — decided 2026-09-29

slipbox started as a markdown notes app, but the work it serves has moved. With coding agents, the
human mostly **designs** documents, **reviews** what an agent produced — notes, configs, source
files — and makes **minor edits** in place. Reviewing means opening whatever the agent touched, so
slipbox opens any text file, and renders the ones worth rendering. Diffs are part of review too;
they are a separate discussion (possibly a separate tool), not part of this.

### Three groups of files

| | 1. Notes | 2. Data / config | 3. Text / source |
| --- | --- | --- | --- |
| Formats | markdown, Org, AsciiDoc | JSON, YAML, TOML, INI, CSV/TSV | everything else textual: code, logs, `.txt` |
| Opens in | rendered; source mode a key away | rendered; source mode a key away | source mode only (no render) |
| Editing | the lens, source mode | the lens, source mode | source mode |
| Outline, breadcrumb | headings | sections and keys | functions, classes, methods (tree-sitter) |
| Links out | each format's own syntax | resolving paths, URLs, `$ref`, includes | comments: paths, `path:line`, URLs |
| Linked to | by name (`[[design]]`) or path | by path with extension (`[[config.toml]]`) | by path with extension |
| Tasks, tags, title | yes | — | — |
| A parse error | source mode, the error shown | source mode, the error shown | marked in place: syntax errors only |

**Notes are the link graph; rendering is a separate property.** A note (markdown, Org, AsciiDoc)
has links in its own syntax, backlinks, tasks, tags and a title, and is found by name. A data file
has structure — an outline, sections to link to — and links of its own kind, but no tasks and no
name lookup: `[[config]]` quietly meaning `config.toml` would surprise. Source files are link
targets by path, and link out only from comments. Wikilinks are markdown's convention (Org and
AsciiDoc use their own link syntax), so data files and code comments don't get them.

Other note formats are off by default and enabled by configuration. Binary files (images, PDFs)
stay link targets, as attachments are today; they don't open.

### Rendering data files as documents

A config renders like a note, which gives outline, breadcrumb, find and `[[config.toml#section]]`
for free: TOML `[table]`s and INI `[section]`s become headings, as do nested YAML/JSON objects down to a
depth (then indented key–value rows); scalars are aligned key–value rows, like frontmatter's
properties block; arrays of plain values sit inline, arrays of records (TOML `[[array]]`, JSON arrays
of objects) become tables through the table allocator; comments show dimmed beside or above their
key. CSV/TSV is one table, its header row detected, laid out lazily when large.

**Edits are always on the text.** No value is ever re-serialized, so comments, key order and
formatting survive; the lens edits a block's source lines (a table or section, a top-level key, a
CSV row) exactly as it edits a markdown paragraph. Validity is checked when insert mode ends, never
per keystroke (typing through an open quote is normal): a file that no longer parses switches to
source mode with the error shown.

The same render, with the schema from `core/config.ts` (defaults dimmed, allowed values, unknown
keys flagged), can later become slipbox's own settings screen.

### Source files: tree-sitter, loaded lazily

highlight.js only colours tokens; the outline, links in comments and syntax errors need structure.
`web-tree-sitter` is already installed (OpenTUI's peer dependency). One grammar per language, a few
hundred KB of WebAssembly each, **loaded the first time a file of that language opens**; the first
set is TypeScript, Python, shell, Lua, Go and Rust. It gives:

- highlighting in source mode (highlight.js remains the fallback for other languages);
- an outline and breadcrumb of functions, classes and methods, from a small query per language;
- links in real comment nodes only — never in strings or code;
- syntax errors (`ERROR` / `MISSING` nodes), shown as a gutter mark, an underline and a count in
  the status line when insert mode ends. Syntax only: type errors and unresolved imports need a
  language server, which is not slipbox's job.

**Lazy loading is a mechanism, not a special case.** Tree-sitter's grammars, and later Mermaid and
images, all load on first use.

### Note formats: a reader per format

Markdown becomes one reader among several. A reader produces what the rest of slipbox needs:
blocks with source line ranges (for the lens and incremental work), headings, links, tasks, tags,
a title, and a tree the renderer lays out. The graph, outline, backlinks and CLI stay
format-agnostic.

- **Org** — a full note format: headings, `TODO`/`DONE` and checkboxes as tasks, tags, links
  (`[[file:x.org][text]]`, `[[id]]`). `uniorg` is unified-based, like remark, and fits the same way.
  As built (`16.16`), checkboxes are the tasks; `TODO`/`DONE` headlines are drawn, not yet ticked.
- **AsciiDoc** — a full note format: headings with ids, `xref:` and `<<id>>`, `include::`,
  checklists, admonitions, tables. The plan was a line scanner to index and asciidoctor.js, loaded
  lazily, to render. As built (`16.17`), one line reader does both: AsciiDoc's structure is its
  lines, a reader into the shared tree is what Org has too, and asciidoctor.js (Ruby compiled to
  JavaScript, a few MB) would still need its document mapped onto that tree. What it would add —
  conditionals, attribute substitution, expanded includes — can come later behind the same reader.

**Reversed, 2026-09-30: markdown is the only note format.** Both readers were built and then
removed. Every note feature ahead — rename with link fixing, tasks, tags, templates for new notes —
would have to be built three times (Org's `[[file:…]]` links and `[X]` marks, AsciiDoc's `xref:`),
for formats whose users mostly live elsewhere: Org's in Emacs (org-roam, org-agenda), AsciiDoc's in
documentation and books rather than a linked vault of notes. The notes world standardised on
markdown (Obsidian, Zettlr, Foam). `.org` and `.adoc` files still open, as text files in source mode,
and the reader seam (`16.2`) stays, so a format could come back without touching the rest.

### Finding files

The explorer shows notes and renderable files by default; a key toggles it to every text file the
walk sees; include/exclude patterns refine either. `ctrl+p` and find follow the same setting. The CLI's
`read`, `write`, `replace` and `find` work on all three groups; `ls` lists notes, a flag adds the rest.

## Configuration

Undesigned, and load-bearing: theming and user scripts are both in scope and both need it.

- **Two levels.** User config in `~/.config/slipbox/`, vault config in `.slipbox/`, vault
  overriding user. The vault half was already decided; the user half was missing, and
  without it every vault needs its own copy of your keymaps.
- **TOML.** Matches herdr, helix, starship and yazi in this stack, and it takes comments.
  JSON has no comments; a TypeScript config is executable, which is a much bigger
  commitment and a startup cost.
- **Keymaps must be rebindable, and every action must be a named command** — which is the
  command-registry decision already made under Extensibility. The same decision seen from
  two directions is a good sign it is right.
- **Themes**: built-ins by name, plus a directory of user theme files using the `@theme_*`
  role names.
- An `--config` flag and a `SLIPBOX_CONFIG` variable, and it must run correctly with no
  config at all.

---

## Smaller gaps, worth a line each

- **Performance targets, stated rather than hoped for.** Pick a number: **5,000 notes**, and
  time to first paint under a tenth of a second. The 25 ms measurement is for 52 files; at
  5,000 that is seconds, so past some size the graph builds in the background or from the
  cache directory already reserved at `~/.cache/slipbox/<hash>/`, while the first note
  renders immediately. Also state the large-single-note case, which is a different problem —
  viewport-only rendering and incremental reparse.
- **Session restore** — reopen the notes that were open. Distinct from Obsidian's
  "workspaces", which was ruled out as life-management; this is just not losing your place.
- **Distribution.** `bun build --compile` produces one binary, but a large one — tens of MB,
  since it embeds the runtime. There are five machines here, a Mac and four Linux VMs, so
  `darwin-arm64` and `linux-arm64` at minimum, probably `linux-x64` too, and a brew formula
  eventually; leaf's `leaf-linux-arm64` asset is the pattern. Cross-compilation itself is
  **settled and not a risk** — see Verified: OpenTUI ships prebuilt binaries for all eight
  targets. What remains is making a foreign-target `--compile` embed the right one, plus the
  install and update path, which is still unaddressed.
- **Narrow terminals.** What happens at 60 columns, where no table fits and the sidebar
  cannot coexist with content. Pick the collapse behaviour deliberately.
- **Input model.** Keymap philosophy — vim-like, and remappable from the first version
  rather than later — plus whether the mouse is supported at all. The command registry is the
  right hook, but the *defaults* are what people judge a TUI by in the first minute.
- **Text encoding edge cases.** CRLF, BOM, non-UTF-8 files, files without a trailing
  newline. A tool that rewrites notes must round-trip all of them without "fixing" anything
  it wasn't asked to.
- **Testing.** The pure mdast-to-layout stage was chosen to insulate against OpenTUI churn;
  it also makes snapshot testing straightforward, which is the natural way to test a
  renderer. Two specifics: **snapshot tests on rendered output**, and **property tests on
  the table allocator** — that allocator has a known upstream bug (minimum widths checked
  only in aggregate) and generated inputs are how you find its siblings. leaf carries 7,596
  lines of tests out of 24,553.

---

## Theming

**Extensive built-in theme support, shipped with the app — not a plugin, not a
download.** Terminal users choose tools partly on this, and a notes app is something
you stare at all day. Every common theme should already be there: Tokyo Night,
Catppuccin (all four flavours), Dracula, Solarized light and dark, Gruvbox, Nord,
Rosé Pine, Everforest, Kanagawa, One Dark, Monokai.

### Two surfaces, themed independently

1. **UI chrome** — borders, sidebar, statusline, selection, link and unresolved-link
   colours, table rules, heading levels.
2. **Syntax highlighting inside code blocks** — handled by OpenTUI's tree-sitter
   integration or shiki.

The second is *mostly* free, with one caveat measured 2026-09-25: **shiki** consumes VS Code
theme JSON directly, but OpenTUI's `SyntaxStyle.fromTheme` takes its own TextMate-*shaped*
structure, not the VS Code file format, so that path needs a small converter rather than being
pure data. Either way the themes exist — both lineages descend from TextMate, and
Catppuccin, Tokyo Night, Dracula, Gruvbox and the rest all publish official ones. So
syntax themes are downloadable data rather than work. Only the chrome has to be
designed.

### base16 as the long tail

Ship a handful of hand-tuned first-class themes, then add a **base16 / base24**
(tinted-theming) loader. One loader over those schemes yields *hundreds* of named
themes for free, including every one listed above.

Caveat worth knowing up front: base16's 16 slots are coarser than a hand-tuned
theme, so a base16 rendering of Catppuccin is recognisably not Catppuccin. Hence
both — hand-tuned for the ones that matter, base16 for breadth.

### Semantic tokens, and this repo already has the format

Never put hex values in rendering code. Define semantic roles and let a theme bind
them — and **`<dotfiles>/vm/scopes/beaver/.config/workslate/themes/*.conf` is already exactly
that**: `@theme_base_bg`, `@theme_text_fg`, `@theme_dim_fg`, `@theme_accent_bg`,
`@theme_accent_fg`, `@theme_border_bg` and so on, with ten files covering four
Catppuccin flavours plus "lite" variants and a `dark` / `light` pair.

Reuse those role names. A theme then ports between workslate and slipbox by copying
values, and the whole stack can be recoloured from one place. That file set is also
the proof the model works — it was built for a different tool and survived four
flavours and two brightness variants.

### Defaults that match the rest of the stack

Everything here is already themed, so slipbox arriving with its own look would be
the odd one out:

| Tool | Theme |
| --- | --- |
| herdr (Mac and VM base) | `tokyo-night` |
| nvim (LazyVim) | `tokyonight-night` |
| workslate, yazi, helix, lnav (beaver) | `catppuccin-mocha` |

So: **default to Tokyo Night**, with Catppuccin Mocha as the other first-class
choice.

### Requirements that follow

- **Light themes must genuinely work**, not be an afterthought. Latte, Solarized
  Light and `tokyonight-day` are all in use or referenced here, and `light.conf`
  exists alongside `dark.conf` in the workslate set.
- **Live switching with preview, no restart.** nvim already has a colorscheme
  live-preview picker bound in `<dotfiles>/shared/config/nvim/lua/config/keymaps.lua`; the same
  expectation applies. Cheap here, since a theme is data and rendering is one pass.
- **A follow-the-terminal mode** using ANSI indexed colours, so herdr's or Ghostty's
  own theme flows through untouched. Cheapest possible option and some people prefer
  it — but the named themes need true colour, so support both.
- **Respect `NO_COLOR`** and degrade to something readable.

### Carry over the nvim readability settings

These are the settings that made markdown readable in nvim, arrived at by trial
rather than taste. Start from them rather than rediscovering them. Source:
`<dotfiles>/shared/config/nvim/lua/plugins/render-markdown.lua`,
`<dotfiles>/shared/config/nvim/lua/plugins/colorscheme.lua`, and
`<dotfiles>/shared/config/nvim/lua/custom/window-borders.lua`.

**Spacing and layout**

- **Hold back ~4 columns from the render width.** render-markdown fits a wrapped
  table to exactly the window width, spending the entire budget, so the final border
  character has nowhere to go — the right-hand border vanishes and rows sit flush
  against the edge. In nvim this required patching a private API (`env.win.width`)
  because there is no option named `max_width`. Cell wrapping itself *did* ship — issue #616
  was closed completed on 2026-09-14 and released as `pipe_table.wrap` in 8.14.0, the version
  this repo pins. What never shipped is a *fractional* width: the feature fits to the full
  window width, which is exactly why the inset patch is still needed.

  **slipbox owns its allocator, so this is just a parameter** — make
  the inset configurable, default it to about 4, and take 1 as the minimum that
  shows a border.
- **Wrap at word boundaries** (`wrap` + `linebreak`). Note that render-markdown's
  `pipe_table.wrap` is gated on window wrap *and* `conceallevel > 1` — with wrap off
  its `row_fits` returns true unconditionally and tables silently overflow. slipbox
  has no equivalent coupling, but the lesson is that wrapping must be a first-class
  mode, not a flag that quietly disables a feature.
- **Code fences full width, no right padding.**
- **Keep the line under the cursor rendered** (`anti_conceal = false`). Tempting to
  un-render it for editing, and it was tried specifically for wrapped tables and
  **rejected** — the row jumping between rendered and raw while reading is worse
  than not being able to edit in place.
- Heading icons per level with signs, and rendered checkboxes.

**Theme-level, from the tokyonight adjustments**

- Darker ground than stock Tokyo Night — `#16161e` background, `#0f0f17` for dark
  surfaces — with a softer foreground, `#aab3d4` and `#8c95b0` dimmed.
- **Inline code gets its own background**: `#c0caf5` on `#292e42`, italic. This is
  the single biggest readability win in prose — `code` spans stop disappearing into
  the sentence. Worth a first-class semantic token.
- **Bold needs an explicit lighter foreground** (`#bcc5e6`) or it doesn't read as
  bold at all in a terminal.
- Bold rather than italic for emphasis in syntax highlighting; terminals render
  italics unevenly.
- **Borders need real contrast.** Tokyo Night's stock `WinSeparator` is a
  low-contrast grey and adjacent splits visually blend into one pane. Bumped to
  `#7aa2f7` bold with thick box-drawing `fillchars` (`━ ┃ ╋` and friends). slipbox
  has the same problem between its sidebar, content and any split, so make border
  colour and weight themeable rather than fixed.

---

## Image rendering, where the terminal supports it

Render images inline when the terminal can, degrade cleanly when it can't. Cheap to
start: **OpenTUI already ships an `Image` component**, so this is capability detection
and a fallback ladder rather than a graphics implementation.

### Three protocols, and don't infer support from `$TERM`

In practice there are three: the **kitty graphics protocol** (which Ghostty, the
terminal here, implements), **iTerm2 inline images** (OSC 1337), and **sixel**. Support
is uneven and version-dependent, so treat any table of terminal names as a hint, not a
decision procedure.

**Probe the channel, don't sniff the environment.** A concrete case from this machine:
inside a herdr pane, `TERM` is still `xterm-ghostty` and `TERM_PROGRAM` is still
`ghostty`. Those describe the *outer* terminal. They say nothing about whether graphics
escapes survive the multiplexer in between, so a naive `$TERM` check would confidently
conclude images work and then emit escape sequences into a pane that swallows them —
which usually looks like garbage on screen, not like nothing.

So: query the terminal, honour the answer, and always allow an override —
`images = auto | always | never` — because detection will be wrong sometimes and the
user knows what they are looking at.

### Multiplexers are the actual obstacle

The terminal usually supports images; the thing in the middle usually doesn't. tmux
needs `allow-passthrough` turned on. zellij lacked support for a long time and added the
kitty protocol in 0.45 (2026-08). herdr's
behaviour is **unverified, and deliberately left that way** — it is an implementation
detail, not a design input. The fallback ladder means slipbox renders whatever the
answer is, and images are post-v1, so the test belongs to the build rather than to
this document. Per the standalone constraint it must not be assumed either way
regardless.

This is the same shape as the external-pane provider: detect, degrade, never require.

### Fallback ladder

1. **Native protocol** — real pixels, when the effective channel supports it.
2. **Unicode half-block or quadrant blocks with true colour** — a recognisable
   approximation that works in any colour terminal. `chafa` is the reference
   implementation to study.
3. **Alt text plus the path**, always readable, always the floor. A note must never
   become unreadable because an image couldn't render.

### Details that bite

- **Sizing needs cell pixel geometry** — `ws_xpixel` / `ws_ypixel` from `TIOCGWINSZ`,
  or `CSI 14 t` / `CSI 16 t`. Without it you cannot convert pixels to rows, and images
  come out the wrong size. Reserve N rows for an image; text does not wrap around it.
- **Transmit once, place many.** The kitty protocol supports image IDs and separate
  placement, so re-sending image data on every redraw is avoidable and should be
  avoided — it is the usual cause of "images make the TUI feel slow".
- **Scrolling is where this gets buggy.** By default a placed image floats over the
  screen rather than scrolling with the text under it. The kitty protocol's unicode
  placeholders make an image behave like text and scroll correctly; without them,
  every scroll needs explicit reposition-or-hide. Design for this from the start
  rather than discovering it in a long note.
- **Caching.** Decode and scale once per (path, size), keyed by mtime.

### Where the images come from

Standard markdown `![alt](path)` and Obsidian-style embeds `![[image.png]]` — embeds
are already on the in-scope list, so both go through one resolver. Pasted screenshots
are the common real case in an agent workflow: a screenshot dropped into a note, then
discussed.

### It also upgrades the mermaid and LaTeX story

Both are currently approximations — `mermaid-ascii` for diagrams, `unicodeit` for
maths. Where images work, the better rendering becomes available: mermaid through
`mermaid-cli` to a real PNG, LaTeX typeset properly. Same fallback ladder, so the ASCII
path remains the floor rather than the ceiling.

That makes postponing mermaid and LaTeX cheaper than it looked, because the eventual
good version does not need a different architecture — just a different renderer behind
the same capability check.

---

## Export to PDF, DOCX and friends

A gap in the feature sort above: **Export to PDF is an Obsidian core feature** and it
wasn't on either list. It belongs in scope.

### The work is link rewriting, not format conversion

Conversion is a solved problem someone else owns. What slipbox has to do first is turn
a *vault* note into a *standalone* document:

1. **Assemble the source** — one note, a note with its `![[embeds]]` resolved inline, or
   a composed set of notes in a chosen order.
2. **Rewrite wikilinks**, which is the real work. `[[note]]` means nothing to any
   converter. Each link needs a decision based on whether its target is inside the
   export set: an internal anchor if it is, an external reference or plain styled text
   if it isn't. Getting this wrong produces a document full of literal `[[brackets]]`,
   which is how you can tell a tool bolted export on afterwards.
3. **Resolve image and asset paths to absolute**, or the converter silently drops them.
4. **Map frontmatter to document metadata** — `title`, `author`, `date`.

Steps 1–4 are slipbox's regardless of which writer runs afterwards, so build the
assembler as its own stage rather than inside any one export command. Every writer,
native or optional, consumes its output.

### No hard dependency on pandoc — slipbox exports on its own

**Constraint:** slipbox is a standalone application. Export must work with nothing
installed but slipbox itself. pandoc is an *optional* enhancement — detected, and
configurable with a path and extra arguments — never the mechanism. The same rule as
multiplexers and image protocols.

This is achievable because the JS ecosystem covers the formats that matter, and because
**most export targets are structure rather than layout.**

### What slipbox can write itself

| Target | How, in process | Difficulty |
| --- | --- | --- |
| HTML | `remark-rehype` + `rehype-stringify` | trivial — it is one more mdast pass |
| Markdown | `remark-stringify` | trivial; the writer the context bundle needs |
| DOCX | the `docx` package — declarative document model | **tractable** — see below |
| PDF | `pdfkit`, or `@react-pdf/renderer` for flexbox layout | real work, and the only hard one |
| EPUB | zip of XHTML + an OPF manifest, built on the HTML writer | packaging, once HTML exists |

Verify each library's current state before committing — these are the shapes of the
answer, not pinned choices.

**DOCX is easier than PDF, which is counterintuitive.** A `.docx` carries *structure* —
headings, paragraphs, runs, lists, tables, images, hyperlinks — and Word does the
layout. So mdast maps onto it almost node for node, and there is no pagination, no line
breaking and no font metrics to get right. **PDF is the opposite:** slipbox would own
every typesetting decision — page breaks, widows and orphans, tables that outgrow a
page, code blocks, image placement. That is where the effort is, and where a first
version will visibly trail pandoc.

`@react-pdf/renderer` is worth a look specifically because slipbox is already
React-with-flexbox via OpenTUI, so the layout mental model and possibly some structure
carry over. `pdfkit` is the lower-level, less coupled option.

Scope the first PDF honestly: headings, paragraphs, lists, code blocks, links, images,
and tables that fit a page. Good enough to hand someone a note. Not a typesetting
engine.

### The optional tiers above native

1. **Native** — always available, no detection, the only thing documented as guaranteed.
2. **Headless browser, if one is present** — HTML then print-to-PDF gives real CSS
   typesetting, and `<dotfiles>/docs/cheatsheets/print-cheatsheet.sh` already proves the pipeline
   here: pandoc renders standalone HTML linking `print.css`, then Chrome `--headless
   --print-to-pdf` honours `@page` and `column-count`. slipbox can emit that HTML
   itself, so this needs only a browser, not pandoc. Better fidelity than `pdfkit` for
   anything print-shaped.
3. **pandoc, if installed and configured** — unlocks everything else: ODT, RTF, LaTeX,
   reST, MediaWiki, its own PDF engines. Offer its targets as *additional* entries in
   the export menu, clearly marked as coming from pandoc, and absent when it isn't
   there.

Never make a native format route through an optional tier. If pandoc would produce a
nicer DOCX, that is a preference to offer, not a reason to drop the native writer.

### Google Docs

**Export DOCX, then upload.** Docs imports DOCX well, and since DOCX is now native, this
path has **no external dependency at all** — no pandoc, no browser, no API client, no
OAuth, no stored credentials. A local notes app over a private vault should not become a
credential holder to save a drag-and-drop.

If one-step upload is ever wanted, detect `rclone` or a `gdrive` CLI and shell out to
it: same detect-degrade shape, still no secrets of our own.

### Degradation

There is nothing to degrade for HTML, Markdown, DOCX and PDF — those are slipbox's own
writers and they either work or there is a bug. Only the optional tiers can be missing,
and when they are, their formats simply do not appear in the menu, with one line saying
why.

Worth stating plainly because it inverts the usual design for a terminal tool: pandoc is
the escape hatch for the long tail of formats, not the engine.

### Related things already in this document

- "Compose notes into one document" under the repos niche is the multi-note case of
  step 1 — same machinery, different entry point.
- The **context bundle export** for agents is the same assemble-and-rewrite pipeline
  with a different writer: markdown out instead of DOCX. Building one should make the
  other nearly free, which is a reason to design the assembler as a separate stage
  rather than inside an export command.

---

## Community-plugin capabilities worth borrowing

**Enhancement tier — explicitly not core.** These make slipbox better once it works; none belong
in a first phase. Grouped by capability since several overlap. None are dependencies — Obsidian
plugins aren't reusable — these are features to reimplement.

**Editing ergonomics**

- `table-editor-obsidian` — tab between cells, auto-align, reformat. High value here given how
  much the table allocator already matters.
- `obsidian-outliner` — list and section editing: indent, move items, fold.
- `obsidian-footnotes` — insert and jump between footnotes.
- `obsidian-linter` — format on save. Should honour this repo's markdownlint config rather than
  compete with it.

**Navigation and search**

- `omnisearch` — ranked full-text vault search; `tobi/qmd` is the likely implementation.
- `darlal-switcher-plus` — switcher that finds headings and symbols, not just filenames.
- `quick-explorer` — fast browsing via breadcrumb dropdowns.
- `recent-files-obsidian` — recency plus favourites.
- `breadcrumbs` — hierarchical parent/child/sibling structure beyond flat links.

**Vault hygiene**

- `find-unlinked-files` — orphans, unresolved links, unused attachments. Nearly free from the
  graph.
- `consistent-attachments-and-links` — keep links correct when files move. Supports
  rename-with-link-fixing.
- `tag-wrangler` — rename and merge tags across the vault.

**Capture and prose**

- `quickadd` — capture, templates, macros. Overlaps `knap` and the scratch capture above.
- `obsidian-languagetool-plugin` — grammar and style checking.

**Semantic and AI — deliberately not in-app**

- `smart-connections` — embedding-based note similarity. Possibly just `qmd` plus the link graph.
- `karpathywiki` — implements Karpathy's argument that chunking for RAG "breaks the LLM's ability
  to reason across your whole knowledge graph". Instead it runs Personalized PageRank over the
  wiki-link graph for multi-hop retrieval.

  **Architecturally relevant:** slipbox will already hold that graph in memory. Expose it over
  the CLI and agents can do graph-based retrieval without slipbox doing any LLM work. Clean
  split — slipbox owns the graph, agents own the reasoning. So: CLI entry points, not built-in
  AI.

## Ideas nobody else has — the notes-live-in-repos niche

All future-tier. These are what Obsidian, leaf and every plugin above ignore, because their users
aren't sitting in git repos. This is where slipbox would be *different* rather than another
viewer.

**Git awareness — the strongest differentiator.** These vaults *are* git repos.

- mark modified and untracked notes in the file explorer
- diff a note against `HEAD` — OpenTUI ships a `Diff` component, so rendering exists
- per-note history
- "what changed since I last looked" is exactly the review loop for agent-written notes, and
  combines with watch mode and the `streaming` prop

**`file:line` references as first-class links.** `prompt-buffer.lua` already emits `path:42-50`.
Treating those as navigable — jump from a note into that line in the editor — makes notes link
into *code*, not just other notes. The counterpart to wikilinks for a dev-focused tool.

**Data files.** Decided and scheduled: see [Files beyond markdown](#files-beyond-markdown--decided-2026-09-29).

**Frontmatter validation.** `SKILL.md` requires `name` and `description`; memory files require
`name`, `description` and `metadata.type`. A per-directory schema flagging missing or malformed
frontmatter catches real errors.

**Run this repo's linter, don't ship one.** Run `markdownlint-cli2` against
`~/.markdownlint-cli2.jsonc` and surface violations inline. The rules and the `markdown-style`
skill already exist; a built-in formatter would fight them.

**Compose notes into one document.** Select notes, order them, and export the result as one
document — the multi-note entry point to the assembler described under Export.

**Context bundle export — possibly the centre of gravity.** "Give me this note, plus its
backlinks, plus everything it links to, as one blob" for pasting into an agent or piping to one.
The scratch accumulator generalised through the link graph, and Karpathy-style graph retrieval
done deterministically rather than by PageRank. Needs a depth limit. Naturally CLI-shaped.

**Quick capture from anywhere.** `slipbox capture "text"` appends to an inbox note from any
shell. CLI-shaped means agents use the same entry point.

**Document-type awareness.** These docs have conventional shapes: ADRs (numbered, "superseded by
D23"), plans (threads, status headers), skills (required frontmatter plus sections). Recognising
a type enables type-aware navigation — list all ADRs, show which are superseded, jump between
plan threads. Like Obsidian's Bases, but driven by conventions instead of a database.

**Reading position per note, from day one.** leaf's `HistoryEntry` stores only a path, which is
why returning to a file drops you at the top and why its history picker doesn't feel like
buffers. Cheap at the start, awkward to retrofit.

**Unresolved link offers to create.** Following `[[note]]` that doesn't exist offers to create
it, optionally from a template. Falls out of `nameToPath` for free.

**Worktree awareness — wanted, design open.** Many worktrees of one repo:
`wb-buyer-ux-revamp/docs/`, `wb-donna-tasks/docs/`, `wb-supply-expansion/docs/` are all branches
of eso-v2. The one-vault-per-repo rule didn't consider this.

`git rev-parse --git-common-dir` identifies the shared repo across linked worktrees — the same
trick the herdr tab-bar git module uses to separate repo name from branch, see
`<dotfiles>/mac/config/herdr/config.toml`. So detection is solved; the question is what to do with it. A
`[[link]]` resolves to different content per branch, which argues for separate vaults aware of
their sibling set rather than one merged vault.

**Remote vaults — out of scope.** You work on the machine that holds the repo, and you reach it
by SSH-ing in and running slipbox there. Mounting or syncing a vault across machines is a
different problem, and `lazyrsync` in `<dotfiles>/docs/possible-tools.md` is the candidate for it.

## Scratch capture, and getting text out over SSH

Called "the closest thing to the product's reason for existing", and currently designed
less than the PDF exporter. Worth fixing, since it is also the feature with no competitor.

What it is, concretely: the accumulator from `prompt-buffer.lua` — collect `path:42-50`
references and note excerpts into a per-project scratch, then hand the bundle to an agent.

**Open, and small enough to settle now:**

- **Where it lives.** Per-project, but the vault is a git repo, so a scratch inside it needs
  a `.gitignore` line and will get committed by accident. `~/.cache/slipbox/<hash>/` is
  already the reserved location for derived data and avoids that — at the cost that the
  scratch is invisible to an agent working in the repo. Which of those matters more decides
  it.
- **Format.** Markdown, so it is readable and pasteable as-is, with each entry carrying its
  source reference. Not a custom format.
- **Its relation to the context bundle.** These are the same thing at different scales: the
  scratch is hand-picked, the bundle is graph-derived. One writer, two collectors. Design
  the writer once.

### Clipboard: OSC 52 is required, not optional

"Hand the bundle to an agent" usually means putting it on the clipboard — and a bare SSH
session is a first-class environment by the standalone constraint, so `pbcopy` is not
available where it matters most.

**OSC 52** is the answer: the terminal escape that sets the *local* clipboard from a remote
session, which is exactly the case here — slipbox running on beaver, clipboard on the Mac.
Fall back to `pbcopy` or `wl-copy` when local, and to writing a file with its path printed
when neither works.

Two caveats worth knowing up front: multiplexers may need enabling for OSC 52 — for tmux that
is `set-clipboard on`, a *different* switch from the `allow-passthrough` graphics need — the same
way they do for graphics, and some terminals cap the payload size, so a large bundle may
need the file fallback anyway.

---

## Security

Two issues follow directly from decisions already made, so they are not hypothetical.

**Strip terminal escape sequences from rendered content.** slipbox renders markdown written
by agents, pulled from repos, and generally not authored by the person reading it. A note
containing raw escape sequences can move the cursor, recolour the screen, clear it, or with
some terminals do considerably worse. This is a real and well-known class of terminal bug,
and the fix is cheap: sanitise text nodes on the way into layout, in one place. Do it from
the first version, because retrofitting means auditing every render path.

**Pass script arguments as argv, never as an interpolated string.** Tier 0 substitutes
`{selection}`, `{file}` and `{backlinks}` into a command. A note titled
`notes/$(rm -rf ~).md`, or a selection containing a backtick, becomes shell injection if
that is done by string concatenation. Build an argument vector and hand it to the process
directly; if a shell is genuinely wanted, quote properly and say so in the config.

Neither is a large amount of work. Both are the kind of thing that is embarrassing to add
after someone else finds it.

---

## Agent communication: shape settled, surface undesigned

**Settled 2026-09-25: a CLI first — and the surface evolves with development rather than being
designed once.** Two things that are *not* settled: the surface itself (command list, output
schema, exit codes, and what a CLI call means while the TUI holds an unsaved buffer), and
whether a server joins it later.

**This is a starting choice, not a permanent one.** A CLI is where agent integration begins
because it assumes nothing about the environment and works from phase 1. A server like nvim's
stays available for later phases, and there is a concrete trigger for reaching for it: a CLI
invocation is a *second process with a second graph*, so it cannot see an unsaved buffer and
cannot raise the TUI's conflict prompt. A socket to the running instance is exactly what solves
that. If that limit bites in practice, the server is the next step rather than a rejected
option.

**Cross-process semantics, settled 2026-09-25: disk is the contract.** A CLI invocation is a
second process and sees the filesystem only — never an unsaved buffer. That is a definition
rather than a limitation: an agent acting on a half-written unsaved sentence is worse than one
acting on the last saved version, the same way git tools see the working tree and not your
editor's undo buffer. Writes go straight to disk and the TUI raises its own conflict prompt, so
an agent is never blocked by an editor being open. Two supports keep it honest — dirty buffers
flush at user-initiated handoff moments (capture, context bundle), and an advisory file in the
state directory lets the CLI *report* staleness without ever locking. `docs/plan.md`
carries the detail and the escalation trigger.

**And the agent surface is not a later phase.** The intended daily mode is UI and agent
together, so slipbox has to be agent-drivable from phases 1–2 — otherwise it never gets tested
the way it is meant to be used. See `docs/plan.md`, which carries the sequencing and
the rule that a small subset (`render`, `capture`, a couple of graph queries) stays stable from
phase 1 while the rest churns.

The three options, for the record:

1. a server like nvim's, that agents connect to and drive — **deferred, not rejected**
2. plugins per coding agent — a Claude Code skill, a Codex extension, and so on
3. **a CLI that agents call**, in the style of an Obsidian CLI — **chosen as the starting point**

Note that 2 and 3 are complements rather than rivals: `kepano/obsidian-skills` is a CLI *plus* a
skill teaching agents to drive it. The skill is how the CLI gets discovered, not an alternative
to it.

Option 3 also has the advantage of assuming nothing about the environment — no server to keep
alive, no multiplexer, no per-agent plugin. And it matches the grain of the tooling here, which
is evidence it works rather than a reason to depend on it: the `herdr` skill shells out to
`herdr pane list` and `pane send-text`; the `nvim-remote` skill shells out to `nvim --server
$sock --remote-expr`. Agents are already fluent in shell, so a CLI needs no protocol, no server
lifecycle and no per-agent plugin — one surface serves Claude Code, Codex, Gemini and shell
scripts alike.

**But the CLI is a public API too, and the same caution applies.** Tier 2 plugins are
deferred below precisely because an API freezes internals — and a CLI that agents and user
scripts depend on freezes a contract just as firmly. It just fails more politely. So treat
it as one: a `--json` output mode separate from human-readable output, stable exit codes,
explicit versioning, and a deliberately small first surface. The argument for a CLI is that
it assumes nothing about the environment, not that it costs nothing to keep.

**Strong external evidence for option 3:**
[`kepano/obsidian-skills`](https://github.com/kepano/obsidian-skills) — 48.8k stars, by
Obsidian's CEO — is agent skills written to the Agent Skills specification, installed to
`.claude/`, `~/.codex/skills` or `~/.opencode/skills`. One of its six skills is literally
`obsidian-cli`, "direct vault interaction". The vendor's own answer to agents-plus-notes is a CLI
plus a skill that teaches agents to drive it. **Read that repo before designing this layer.**

## Extensibility — let people run their own scripts

Wanted: an interface for writing your own scripts and extending slipbox to your own
needs, with somewhere for their output to go.

Per the standalone constraint, every tier below has to work in a bare terminal with no
multiplexer, no server and nothing else installed. That rules out the shape where
"extend slipbox" means "have slipbox drive another tool".

**Recommendation on timing: yes early, but not as a plugin API.** The cheap tiers
give most of the value; the expensive tier should wait for a real extension that the
cheap ones can't express.

### Three tiers, in cost order

**Tier 0 — commands that shell out. Ship this early, possibly in v1.**

Bind a key or a command-palette entry to a shell command, with context substituted:
`{file}`, `{line}`, `{selection}`, `{vault}`, `{backlinks}`. Then send the output
somewhere — the sinks below, none of which need anything installed.

This is roughly 50 lines and it covers most of what "I want to run my own script"
actually means. Precedent everywhere: yazi's openers and plugin entries, lf's
commands, `fzf --bind execute()`, vim's `!`. It needs no API, freezes no internals,
and can't break on a refactor because there is nothing to break.

**Tier 1 — the CLI. Already planned, for a different reason.**

The agent surface above is going to be a CLI. A CLI *is* an extension mechanism:
anyone can script against it in any language, from a shell function, a cron job, or
another TUI. So the same work that serves agents serves users, and the marginal cost
of "extensible by users" is zero.

This is the answer to most extension requests. Before designing anything richer, ask
whether the CLI already does it.

**Tier 2 — in-process plugins. Defer.**

TypeScript modules loaded at startup that register commands, add panes, or hook
rendering the way OpenTUI's `renderNode` does. Real power, and real cost:

- **It freezes internals.** A plugin API is a contract, so every refactor becomes a
  breaking change. slipbox would be pre-1.0 on top of a pre-1.0 OpenTUI churning at
  169 commits per 90 days. The mitigation already chosen — keep mdast-to-layout pure
  and framework-agnostic — is exactly what a plugin surface would punch through.
  Obsidian's plugin API is a large part of why Obsidian's editor is hard to change.
- **Error isolation.** One bad plugin takes down the TUI unless every hook is wrapped
  and budgeted.
- **Trust.** Vaults hold private notes. Local scripts you wrote are fine, the same as
  `vimrc`. A *shared* plugin ecosystem is a supply-chain question, so if Tier 2
  happens: local-only first, no registry, no auto-install.

**Bun makes Tier 2 unusually cheap when the time comes** — it imports TypeScript
directly, so plugin authors need no build step. That is a real advantage over a Rust
implementation and a reason to keep the door open rather than nail it shut.

### The one thing to do in v1 to keep the door open

**Route every user-facing action through a named command registry from day one, even
with no plugins and no palette.** Then "plugins can register commands" and "the
palette lists commands" are later additions rather than refactors. It costs almost
nothing up front and is painful to retrofit — the same reason the command palette and
slash commands are on the in-scope list.

Everything else stays pure and framework-agnostic, which was already the plan.

### "Output in a pane" — the built-in path has to stand alone

Per the standalone constraint, slipbox cannot delegate this to a multiplexer. So the
built-in path is the real design and it must be self-sufficient. Three sinks, in order
of portability:

1. **Suspend and run in the foreground**, then wait for a keypress and redraw — vim's
   `!` and `:sh`, exactly. Works in every terminal ever, needs no PTY layer and no
   component, and handles interactive programs for free because the program simply
   *has* the terminal. This is the floor, and it should exist even if the others do.
2. **A scratch or output buffer** for captured stdout/stderr — scrollable and
   searchable as slipbox content, and the nicest option for text you want to keep.
   The default for the common case.
3. **An embedded terminal** for something long-running you want to watch while still
   using slipbox. OpenTUI ships a terminal component, so no PTY layer of our own —
   but this is the only one of the three with a real dependency, so it must stay
   optional rather than becoming the mechanism everything routes through.

**Multiplexer hand-off is a detected bonus, never the mechanism.** If a multiplexer is
present, offer "run it beside me" as an *additional* action, chosen by sniffing the
environment the same way any well-behaved TUI does:

| Detect | How |
| --- | --- |
| tmux | `$TMUX` |
| zellij | `$ZELLIJ` |
| herdr | `herdr` on `PATH` plus its session env var |
| nothing | the null backend — the normal case, not an error |

Keep that behind one small interface: an optional "external pane" provider, a backend
per multiplexer, and a null backend used whenever nothing is detected. Adding a
backend is then a contained change, and no code path assumes one exists.

Two rules that keep this honest. **Nothing essential may live only behind a backend** —
if a feature is only reachable with a multiplexer running, it is misplaced. And the
null backend is the one to build and test against first, so the bare-terminal path is
the one that actually works rather than the one nobody runs. herdr's backend is
worth writing early only because it is what we run.

---

## Open questions

These are the *design* questions still open. Build-order decisions and their status live in
`docs/plan.md`; the item IDs below point there.

1. **Vault-wide search** (`6.1`) — **settled**: our own index in the core (SQLite FTS5), a scan until
   it's built, and an outside engine behind the same API later; see `docs/design/decisions.md`.
2. **Link resolution** (`1.4`) — **settled**: see `docs/design/decisions.md`.
3. **The agent command surface** (`9.1`) — **settled**: the command list and the JSON contract are
   decision `9.1` and `docs/design/cli.md`.
4. **Where the scratch lives** (`8.2`, folded into `0.10`) — **settled**: the state directory by
   default, the vault on request (`capture.location`).
5. **Native PDF typesetting** (`10.5`) — how far to take it, and `pdfkit` or
   `@react-pdf/renderer` as the base. The only genuinely hard part of export.
6. **Worktree handling** — **settled**: each worktree a separate vault of one repository, told apart
   from `.git`; see `docs/design/decisions.md` (`17.19`).
7. **The optional multiplexer hand-off** (`13.6`) — whether "run it beside me" is worth
   building at all. The three built-in output sinks are settled; this is the extra.
8. **Whether `vscode-languageserver` runs cleanly under Bun** (`11.1`) — the LSP face must work
   without OpenTUI, so it is worth checking before relying on the three-face split.

**A standing risk rather than a question:** OpenTUI is pre-1.0 at v0.5.12 and moving fast.
Pinning works; upgrades will not be free. Mitigated by keeping mdast-to-layout pure.

Settled: build rather than fork; OpenTUI over Ink; remark over marked; `.slipbox/` marker root with
no git fallback; one vault per repo for a plain checkout; PKM in-process rather than over LSP;
themes first-class and built in, defaulting to Tokyo Night; native export writers with pandoc
optional; standalone with no multiplexer dependency; **both an in-app editor and `$EDITOR` hand-off,
with live preview as a lens — an explicit, framed editing session**; **autosave on with a long idle
delay, vim-shaped conflict prompt, and autosave never wins a conflict**; **one core with three faces
— TUI, CLI and an embedded LSP — with the core importing nothing from the TUI**; **disk is the
contract between the CLI and the TUI**.

**Resolved before code:** the editing model and agent-write concurrency (2026-09-24), and
phasing (2026-09-25 — see `docs/plan.md`, which also carries the CLI-parity
principle: the CLI must reach every state change, though not every interaction).

**Still open:** the numbered questions above not marked settled; `6.1` search is the one that gates
a whole phase (4). `8.1` (the scratch capture path) and `9.1` (the CLI list) are settled.

`mermaid-ascii` on npm **does not fully work** — see Verified, where labelled nodes were
measured emitting six boxes for a four-node graph. If it is not fixed upstream, port one —
[`AlexanderGrooff/mermaid-ascii`](https://github.com/AlexanderGrooff/mermaid-ascii) (Go) and
`mmdflux` (Rust, a third-party crate leaf depends on) are two working references. Not a
blocker.

## Honest risk

Feasibility isn't the risk; finishing is. A few weeks of evenings on something intended to be
*used* can become something maintained instead.

## Related

- `docs/plan.md` — the work breakdown with stable item IDs. This document is the
  *what and why*; that one is the *what to do*
- `<dotfiles>/docs/possible-tools.md` — the agent-plus-notes repos to read first, `kepano/obsidian-skills`
  above all, plus `tobi/qmd` as the likely search implementation
- `<dotfiles>/docs/plans/nvim-agent-integration.md` — the parked plan this grew out of
- `<dotfiles>/docs/plans/terminal-multiplexer-design.md` — the other parked build-or-fork design
- [`RivoLink/leaf`](https://github.com/RivoLink/leaf) — the rendering quality bar, and
  [issue #298](https://github.com/RivoLink/leaf/issues/298), the edit-mode request filed against
  it
